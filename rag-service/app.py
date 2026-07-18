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
app = FastAPI(title="MedGenesis RAG Service")

# Global Pipeline Variables
vector_store = None
rag_chain = None

# Pydantic schema for incoming patient payload
class ReportPayload(BaseModel):
    medical_terms: str

def format_docs(docs):
    """Combines retrieved document segments into a single cohesive context block."""
    return "\n\n".join(doc.page_content for doc in docs)

@app.on_event("startup")
def initialize_rag():
    """Initializes embeddings, ingests medical documents, and compiles the modern LCEL RAG pipeline."""
    global vector_store, rag_chain
    print("🔄 Initializing MedGenesis RAG System...")

    DOCS_DIR = "./documents"
    DB_DIR = "./vector_store"
    
    os.makedirs(DOCS_DIR, exist_ok=True)
    
    guideline_path = os.path.join(DOCS_DIR, "medical_guidelines.txt")
    if not os.path.exists(guideline_path):
        raise FileNotFoundError(f"Please ensure '{guideline_path}' exists with your reference medical text.")

    # A. Load text documents
    loader = TextLoader(guideline_path)
    documents = loader.load()

    # B. Chunk text documents for granular semantic searching
    text_splitter = RecursiveCharacterTextSplitter(chunk_size=400, chunk_overlap=50)
    docs = text_splitter.split_documents(documents)

    # C. Initialize Embedding Model (Running locally)
    print("📥 Loading Embedding Model (Running locally)...")
    from langchain_community.embeddings import HuggingFaceEmbeddings
    embeddings = HuggingFaceEmbeddings(model_name="all-MiniLM-L6-v2")

    # D. Seed or open Chroma Vector Database
    print("🗄️ Ingesting knowledge vectors into ChromaDB...")
    vector_store = Chroma.from_documents(docs, embeddings, persist_directory=DB_DIR)

    # E. Initialize Gemini 1.5 Flash Model
    llm = ChatGoogleGenerativeAI(
        model="gemini-2.5-flash", 
        google_api_key=gemini_key, 
        temperature=0.2
    )

    # F. Construct the Prompt Template with Explicit Grounding
    system_prompt = (
        "You are an expert clinical AI assistant for MedGenesis. Your task is to analyze patient metrics "
        "and provide structural medical interpretations based strictly on the provided medical references[cite: 1].\n\n"
        "Context Guidelines:\n{context}\n\n"
        "Requirements:\n"
        "1. Provide a 'Clinical Summary' tailored for doctors (include metric citations)[cite: 1].\n"
        "2. Provide a 'Patient-Friendly Summary' in plain, reassuring terms[cite: 1].\n"
        "3. Rely strictly on the provided context[cite: 1].\n\n"
        "Patient Case Data: {input}"
    )
    
    prompt = ChatPromptTemplate.from_messages([
        ("system", system_prompt),
        ("human", "{input}"),
    ])

    # G. Assemble modern LCEL chain pipeline without legacy wrappers
    retriever = vector_store.as_retriever(search_kwargs={"k": 2})
    
    rag_chain = (
        {"context": retriever | format_docs, "input": RunnablePassthrough()}
        | prompt
        | llm
        | StrOutputParser()
    )
    
    print("🚀 RAG Microservice Ingested & Live!")


@app.post("/api/explain-report")
async def generate_explanation(payload: ReportPayload):
    """
    POST Endpoint exposed to the main Node.js backend[cite: 1].
    Accepts patient values, pulls trusted context, builds prompt, and hits Gemini[cite: 1].
    """
    if not rag_chain:
        raise HTTPException(status_code=500, detail="RAG system is still initializing.")
    try:
        # Execute query through modern LCEL interface
        response_text = rag_chain.invoke(payload.medical_terms)
        return {
            "status": "success", 
            "ai_analysis": response_text
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app:app", host="0.0.0.0", port=int(os.getenv("PORT", 8000)), reload=True)