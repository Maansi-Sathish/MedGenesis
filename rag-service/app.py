import os
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from dotenv import load_dotenv

# Modernized LangChain Imports
from langchain_community.document_loaders import TextLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_chroma import Chroma
from langchain_google_genai import ChatGoogleGenerativeAI, GoogleGenerativeAIEmbeddings
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser

# 1. Load configuration and Gemini API Key
load_dotenv()
gemini_key = os.getenv("GEMINI_API_KEY")
if not gemini_key:
    raise ValueError(
        "CRITICAL ERROR: GEMINI_API_KEY missing from .env file! "
        "Create rag-service/.env with a line like: GEMINI_API_KEY=your_key_here"
    )

# Global Reference Knowledge Base Store
base_retriever = None
startup_error = None  # tracked so /health can report *why* the service is degraded

# Modern FastAPI lifespan context (replaces deprecated @app.on_event)
@asynccontextmanager
async def lifespan(app: FastAPI):
    """Seeds the global background vector database on startup without PyTorch C++ DLLs."""
    global base_retriever, startup_error
    print("🔄 Ingesting Core Clinical Reference Guidelines...")

    try:
        DOCS_DIR = "./documents"
        DB_DIR = "./vector_store_genai"
        os.makedirs(DOCS_DIR, exist_ok=True)

        guideline_path = os.path.join(DOCS_DIR, "medical_guidelines.txt")

        # Fallback to create dummy reference file if missing
        if not os.path.exists(guideline_path):
            with open(guideline_path, "w") as f:
                f.write("Standard Medical Metric Guidelines. Normal Glucose: 70-100 mg/dL. Normal WBC: 4.5-11.0 x10^3/uL. Normal CRP: < 3.0 mg/L.")

        loader = TextLoader(guideline_path)
        documents = loader.load()

        text_splitter = RecursiveCharacterTextSplitter(chunk_size=500, chunk_overlap=50)
        split_docs = text_splitter.split_documents(documents)

        print("📥 Initializing Google API Cloud Embeddings...")
        
        # Updated embedding model to active gemini-embedding-001 target
        embeddings = GoogleGenerativeAIEmbeddings(
            model="models/gemini-embedding-001",
            google_api_key=gemini_key
        )

        vector_store = Chroma.from_documents(split_docs, embeddings, persist_directory=DB_DIR)
        base_retriever = vector_store.as_retriever(search_kwargs={"k": 2})
        print("🚀 Standard Knowledge Base Vector Mapping Seeded Successfully.")

    except Exception as e:
        startup_error = str(e)
        print(f"❌ RAG startup failed: {startup_error}")

    yield  # Hand control to FastAPI app
    print("🛑 Shutting down MedGenesis RAG Service...")

# Initialize FastAPI App with Lifespan
app = FastAPI(title="MedGenesis Spontaneous RAG Service", lifespan=lifespan)

class ReportPayload(BaseModel):
    medical_terms: str

def format_docs(docs):
    """Combines retrieved background guidelines segments into a single cohesive context block."""
    return "\n\n".join(doc.page_content for doc in docs)

@app.get("/health")
async def health_check():
    if startup_error:
        return {"status": "degraded", "ready": False, "error": startup_error}
    if base_retriever is None:
        return {"status": "starting", "ready": False}
    return {"status": "ok", "ready": True}

# ==========================================================
# ⚡ SPONTANEOUS EXECUTION PIPELINE
# ==========================================================
@app.post("/api/analyze")
async def generate_explanation(payload: ReportPayload):
    """
    POST Endpoint exposed to the main Node.js backend gateway.
    Dynamically maps the input text ensuring spontaneous unique outputs per report.
    """
    if startup_error:
        raise HTTPException(status_code=500, detail=f"RAG service failed to initialize: {startup_error}")
    if not base_retriever:
        raise HTTPException(status_code=503, detail="Core vector indexes are still initializing. Try again shortly.")

    try:
        # Retrieve guideline context using modern .invoke()
        static_context_docs = base_retriever.invoke(payload.medical_terms)
        formatted_static_context = format_docs(static_context_docs)

        llm = ChatGoogleGenerativeAI(
            model="gemini-2.5-flash",
            google_api_key=gemini_key,
            temperature=0.4
        )

        spontaneous_prompt = ChatPromptTemplate.from_messages([
            ("system", (
                "You are an expert clinical AI assistant for MedGenesis. Your task is to analyze "
                "the exact patient case input provided. Do not use generic placeholders or hardcoded scripts. "
                "Evaluate the direct parameters presented in the report, using the baseline reference context "
                "solely to contrast normal boundaries.\n\n"
                "Baseline Reference Standards:\n{baseline_standards}\n\n"
                "Requirements:\n"
                "- CLINICAL SUMMARY: Detail the explicit data values found in the report. Flag anomalies natively.\n"
                "- PATIENT-FRIENDLY SUMMARY: Translate these specific findings into plain, comprehensive, and clear prose.\n"
                "- PROGRESSION ANALYSIS: If multiple metrics or past dates are visible, evaluate the directional tracking delta."
            )),
            ("human", "{spontaneous_report_data}")
        ])

        dynamic_chain = (
            spontaneous_prompt
            | llm
            | StrOutputParser()
        )

        response_text = dynamic_chain.invoke({
            "baseline_standards": formatted_static_context,
            "spontaneous_report_data": payload.medical_terms
        })

        return {
            "status": "success",
            "ai_analysis": response_text
        }

    except Exception as e:
        print(f"❌ Pipeline Execution Faulted: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app:app", host="0.0.0.0", port=8000, reload=True)