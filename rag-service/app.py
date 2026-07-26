import os
import re
from fastapi import FastAPI
from pydantic import BaseModel
from dotenv import load_dotenv

try:
    from langchain_community.document_loaders import TextLoader
    from langchain_text_splitters import RecursiveCharacterTextSplitter
    from langchain_chroma import Chroma
    from langchain_google_genai import ChatGoogleGenerativeAI
    from langchain_core.prompts import ChatPromptTemplate
    from langchain_core.output_parsers import StrOutputParser
except Exception as exc:  # pragma: no cover - defensive import handling
    TextLoader = None
    RecursiveCharacterTextSplitter = None
    Chroma = None
    ChatGoogleGenerativeAI = None
    ChatPromptTemplate = None
    StrOutputParser = None
    LANGCHAIN_IMPORT_ERROR = exc
else:
    LANGCHAIN_IMPORT_ERROR = None

load_dotenv()

app = FastAPI(title="MedGenesis Spontaneous RAG Service")

base_retriever = None
llm = None


class ReportPayload(BaseModel):
    medical_terms: str
    patient_id: str | None = None


def format_docs(docs):
    """Combines retrieved background guidelines segments into a single cohesive context block."""
    return "\n\n".join(doc.page_content for doc in docs)


def _extract_numeric_value(text: str, patterns: list[str]):
    for pattern in patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            return float(re.sub(r"[^0-9.-]", "", match.group(1)))
    return None


def build_fallback_analysis(report_text: str) -> str:
    """Create a clinically grounded analysis string without requiring Gemini or vector search."""
    text = (report_text or "").strip()
    if not text:
        return "No report content was provided for analysis."

    wbc = _extract_numeric_value(text, [
        r"(?:white blood cell|wbc)(?:\s+count)?[^0-9]*(\d+(?:\.\d+)?)",
        r"wbc[^0-9]*(\d+(?:\.\d+)?)"
    ])
    glucose = _extract_numeric_value(text, [
        r"(?:serum\s+)?glucose[^0-9]*(\d+(?:\.\d+)?)",
        r"glucose[^0-9]*(\d+(?:\.\d+)?)"
    ])
    triglycerides = _extract_numeric_value(text, [
        r"triglycerides[^0-9]*(\d+(?:\.\d+)?)"
    ])
    crp = _extract_numeric_value(text, [
        r"(?:c-reactive protein|crp)[^0-9]*(\d+(?:\.\d+)?)"
    ])

    lines = ["Clinical summary:"]
    findings = []

    if wbc is not None:
        status = "within" if 4.5 <= wbc <= 11.0 else "outside"
        findings.append(f"WBC {wbc:.1f} x10^3/uL is {status} the typical reference range.")

    if glucose is not None:
        status = "normal" if 70 <= glucose <= 100 else "elevated"
        findings.append(f"Glucose {glucose:.1f} mg/dL is {status} for a typical fasting reference range.")

    if triglycerides is not None:
        status = "normal" if triglycerides < 150 else "elevated"
        findings.append(f"Triglycerides {triglycerides:.1f} mg/dL are {status}.")

    if crp is not None:
        status = "normal" if crp < 3 else "elevated"
        findings.append(f"CRP {crp:.1f} mg/L is {status}, which can indicate inflammation.")

    if not findings:
        findings.append("The input does not include explicit numeric values that can be benchmarked against reference ranges.")

    lines.extend(findings)

    if any(keyword in text.lower() for keyword in ["clear", "no acute", "no focal", "normal", "within normal"]):
        lines.append("The imaging description is reassuring and does not suggest a major acute cardiopulmonary process.")
    elif any(keyword in text.lower() for keyword in ["effusion", "pneumothorax", "consolidation", "atelectasis", "opacity"]):
        lines.append("The report includes findings that warrant follow-up review, especially if symptoms are ongoing.")

    lines.append("Patient-friendly summary: The analysis above is based on the explicit values supplied in the report and uses simple clinical thresholds for context.")
    return "\n".join(lines)


@app.on_event("startup")
def initialize_static_knowledge_base():
    """Seed the vector database when the environment supports it, but never block analysis."""
    global base_retriever, llm
    print("🔄 Ingesting Core Clinical Reference Guidelines...")

    if LANGCHAIN_IMPORT_ERROR is not None:
        print(f"⚠️ LangChain dependencies are unavailable: {LANGCHAIN_IMPORT_ERROR}")
        return

    if not os.getenv("GEMINI_API_KEY"):
        print("⚠️ GEMINI_API_KEY is not set; analysis will use the built-in fallback engine.")
    else:
        try:
            llm = ChatGoogleGenerativeAI(model="gemini-2.5-flash", temperature=0.4)
        except Exception as exc:  # pragma: no cover - defensive initialization
            print(f"⚠️ Gemini initialization failed, falling back to local analysis: {exc}")
            llm = None

    try:
        DOCS_DIR = "./documents"
        DB_DIR = "./vector_store"
        os.makedirs(DOCS_DIR, exist_ok=True)

        guideline_path = os.path.join(DOCS_DIR, "medical_guidelines.txt")
        if not os.path.exists(guideline_path):
            with open(guideline_path, "w", encoding="utf-8") as fp:
                fp.write("Standard Medical Metric Guidelines. Normal Glucose: 70-100 mg/dL. Normal WBC: 4.5-11.0 x10^3/uL. Normal CRP: < 3.0 mg/L.")

        loader = TextLoader(guideline_path)
        documents = loader.load()

        text_splitter = RecursiveCharacterTextSplitter(chunk_size=500, chunk_overlap=50)
        split_docs = text_splitter.split_documents(documents)

        from langchain_community.embeddings import HuggingFaceEmbeddings

        embeddings = HuggingFaceEmbeddings(model_name="all-MiniLM-L6-v2")
        vector_store = Chroma.from_documents(split_docs, embeddings, persist_directory=DB_DIR)
        base_retriever = vector_store.as_retriever(search_kwargs={"k": 2})
        print("🚀 Standard Knowledge Base Vector Mapping Seeded Successfully.")
    except Exception as exc:  # pragma: no cover - defensive initialization
        print(f"⚠️ Knowledge base initialization skipped: {exc}")
        base_retriever = None


@app.post("/api/analyze")
async def generate_explanation(payload: ReportPayload):
    """Generate a grounded explanation for the supplied medical report text."""
    report_text = payload.medical_terms or ""
    if not report_text.strip():
        return {"status": "success", "ai_analysis": "No report content was provided for analysis."}

    fallback_analysis = build_fallback_analysis(report_text)
    if payload.patient_id:
        fallback_analysis = f"Patient ID: {payload.patient_id}\n\n{fallback_analysis}"

    if llm is None:
        return {"status": "success", "ai_analysis": fallback_analysis}

    try:
        formatted_static_context = "No additional vector context available."
        if base_retriever is not None:
            static_context_docs = base_retriever.invoke(report_text)
            formatted_static_context = format_docs(static_context_docs)

        spontaneous_prompt = ChatPromptTemplate.from_messages([
            ("system", (
                "You are an expert clinical AI assistant for MedGenesis. Analyze the report exactly as provided. "
                "Use the supplied reference context only for calibration and mention the explicit values found in the report."
                "\n\nReference context:\n{baseline_standards}"
            )),
            ("human", "{spontaneous_report_data}")
        ])

        dynamic_chain = spontaneous_prompt | llm | StrOutputParser()
        response_text = dynamic_chain.invoke({
            "baseline_standards": formatted_static_context,
            "spontaneous_report_data": report_text,
        })

        if payload.patient_id:
            response_text = f"Patient ID: {payload.patient_id}\n\n{response_text}"

        return {"status": "success", "ai_analysis": response_text}

    except Exception as exc:
        print(f"❌ Pipeline Execution Faulted: {exc}")
        return {"status": "success", "ai_analysis": fallback_analysis}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("app:app", host="0.0.0.0", port=8000, reload=True)