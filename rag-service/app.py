import os
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from dotenv import load_dotenv

# Modernized LangChain Imports
from langchain_community.document_loaders import TextLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_chroma import Chroma
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser
from langchain_core.runnables import RunnablePassthrough

# 1. Load configuration and Gemini API Key
load_dotenv()
gemini_key = os.getenv("GEMINI_API_KEY")
if not gemini_key:
    raise ValueError("CRITICAL ERROR: GEMINI_API_KEY missing from .env file!")

# Initialize FastAPI App
app = FastAPI(title="MedGenesis Spontaneous RAG Service")

# Global Reference Knowledge Base Store
base_retriever = None

class ReportPayload(BaseModel):
    medical_terms: str

def format_docs(docs):
    """Combines retrieved background guidelines segments into a single cohesive context block."""
    return "\n\n".join(doc.page_content for doc in docs)

@app.on_event("startup")
def initialize_static_knowledge_base():
    """Seeds the global background vector database for core clinical references."""
    global base_retriever
    print("🔄 Ingesting Core Clinical Reference Guidelines...")

    DOCS_DIR = "./documents"
    DB_DIR = "./vector_store"
    os.makedirs(DOCS_DIR, exist_ok=True)
    
    guideline_path = os.path.join(DOCS_DIR, "medical_guidelines.txt")
    
    # Fallback to create dummy reference file if it does not exist yet
    if not os.path.exists(guideline_path):
        with open(guideline_path, "w") as f:
            f.write("Standard Medical Metric Guidelines. Normal Glucose: 70-100 mg/dL. Normal WBC: 4.5-11.0 x10^3/uL. Normal CRP: < 3.0 mg/L.")

    loader = TextLoader(guideline_path)
    documents = loader.load()

    text_splitter = RecursiveCharacterTextSplitter(chunk_size=500, chunk_overlap=50)
    split_docs = text_splitter.split_documents(documents)

    from langchain_community.embeddings import HuggingFaceEmbeddings
    embeddings = HuggingFaceEmbeddings(model_name="all-MiniLM-L6-v2")

    vector_store = Chroma.from_documents(split_docs, embeddings, persist_directory=DB_DIR)
    base_retriever = vector_store.as_retriever(search_kwargs={"k": 2})
    print("🚀 Standard Knowledge Base Vector Mapping Seeded Successfully.")

# ==========================================================
# ⚡ SPONTANEOUS EXECUTION PIPELINE (DEBUGGED & PATCHED)
# ==========================================================
@app.post("/api/analyze")
async def generate_explanation(payload: ReportPayload):
    """
    POST Endpoint exposed to the main Node.js backend gateway.
    Dynamically maps the input text ensuring spontaneous unique outputs per report.
    """
    if not base_retriever:
        raise HTTPException(status_code=500, detail="Core vector indexes are still initializing.")
    
    try:
        # 1. FIXED: Changed legacy get_relevant_documents to modern .invoke()
        static_context_docs = base_retriever.invoke(payload.medical_terms)
        formatted_static_context = format_docs(static_context_docs)

        # 2. FIXED: API authentication relies natively on env fallback
        llm = ChatGoogleGenerativeAI(
            model="gemini-2.5-flash", 
            temperature=0.4 
        )

        # 3. Prompt designed to force direct alignment with the incoming text string
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

        # 4. Compile dynamic execution run pattern
        dynamic_chain = (
            spontaneous_prompt 
            | llm 
            | StrOutputParser()
        )

        # 5. Invoke the chain passing the live data stream directly
        response_text = dynamic_chain.invoke({
            "baseline_standards": formatted_static_context,
            "spontaneous_report_data": payload.medical_terms
        })

        return {
            "status": "success", 
            "ai_analysis": response_text
        }

    except Exception as e:
        # Returns the exact Python system tracking trace to your log stream
        print(f"❌ Pipeline Execution Faulted: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app:app", host="0.0.0.0", port=8000, reload=True)