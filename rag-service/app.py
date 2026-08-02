import os
import io
import re
import pypdf
from fastapi import FastAPI, HTTPException, UploadFile, File, Form
from dotenv import load_dotenv

from langchain_chroma import Chroma
from langchain_google_genai import ChatGoogleGenerativeAI, GoogleGenerativeAIEmbeddings
from langchain_core.prompts import PromptTemplate

# Load environment variables (.env file)
load_dotenv()

app = FastAPI(title="MedGenesis Dynamic RAG Service")

# ==========================================
# 1. INITIALIZE EMBEDDINGS & CHROMADB
# ==========================================
print("🔄 Initializing embeddings and loading ChromaDB vector store...")

embeddings = GoogleGenerativeAIEmbeddings(
    model="models/text-embedding-004",
    google_api_key=os.getenv("GEMINI_API_KEY")
)

try:
    vector_db = Chroma(
        persist_directory="./chroma_db", 
        embedding_function=embeddings
    )
    retriever = vector_db.as_retriever(search_kwargs={"k": 3})
    print("✅ ChromaDB vector store successfully connected.")
except Exception as e:
    print(f"⚠️ Warning: Could not load ChromaDB ({e}). Pipeline operating without vector retrieval.")
    retriever = None

# ==========================================
# 2. CONFIGURE GEMINI MODEL
# ==========================================
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

if not GEMINI_API_KEY:
    print("⚠️ WARNING: GEMINI_API_KEY is missing from environment configuration!")

llm = ChatGoogleGenerativeAI(
    model="gemini-2.5-flash",  # ✅ Active model
    google_api_key=GEMINI_API_KEY,
    temperature=0.2  # Low temperature for medical factual precision
)

# ==========================================
# 3. DYNAMIC PROMPT TEMPLATES
# ==========================================
DYNAMIC_RAG_PROMPT = """
You are an expert, empathetic medical AI assistant for MedGenesis.
Your task is to analyze the patient's medical lab report text and summarize it in clear, non-jargon language for a patient.

CRITICAL INSTRUCTION:
- DO NOT copy or paste raw document headers, doctor signatures, clinic addresses, or raw text tables.
- Dynamically parse all test names, numerical values, units, and reference ranges found in the report text.
- Ground your medical explanations strictly in the provided WHO and MedlinePlus reference context when relevant.

VERIFIED MEDICAL REFERENCE CONTEXT:
{context}

PATIENT LAB REPORT TEXT:
{question}

Formulate your response strictly using these sections and markdown formatting:

# 🟢 GOOD NEWS (LOOKS NORMAL)
- Dynamically list every test marker that falls within standard or reference ranges.
- Provide the test name, reported value, and a brief 1-sentence plain-English explanation of why this marker is important for health.

# ⚠️ THINGS TO WATCH OUT FOR (NEEDS ATTENTION)
- Dynamically list every test marker flagged as HIGH, LOW, or BORDERLINE.
- For each flagged item, format as follows:
  * **[Test Name]**: [Reported Value] (Reference Range: [Min - Max]) — [Status: High/Low/Borderline]
  * **What it means**: Plain-language explanation of what this test measures.
  * **Possible factors**: Common non-diagnostic reasons for this result (e.g., hydration, dietary influences, fatigue).

# 🚀 PRACTICAL NEXT STEPS
- Provide 3 safe, non-clinical recommendations (e.g., maintaining hydration, rest, preparing questions for their physician).
"""

COMPARISON_PROMPT = """
You are a medical trend comparator AI for MedGenesis.
Compare the PREVIOUS medical report against the CURRENT medical report dynamically.

PREVIOUS REPORT TEXT:
{previous_text}

CURRENT REPORT TEXT:
{current_text}

INSTRUCTIONS:
Provide a concise comparison highlighting key metric changes between the two reports:

# 📈 HEALTH TREND ANALYSIS
- Compare matching test markers found in both reports using this format:
  * **[Marker Name]**: [Previous Value] ➔ [Current Value] (Status: Improved / Stable / Needs Attention)
- Summarize overall health trends observed across the reports in plain English.
"""

prompt_template = PromptTemplate(
    template=DYNAMIC_RAG_PROMPT, 
    input_variables=["context", "question"]
)

comparison_template = PromptTemplate(
    template=COMPARISON_PROMPT,
    input_variables=["previous_text", "current_text"]
)

# ==========================================
# 4. HELPER: PDF TEXT EXTRACTION
# ==========================================
def extract_text_from_pdf_bytes(pdf_bytes: bytes) -> str:
    """Extracts and sanitizes text from incoming PDF byte stream."""
    try:
        reader = pypdf.PdfReader(io.BytesIO(pdf_bytes))
        extracted_pages = []
        for page in reader.pages:
            text = page.extract_text()
            if text:
                extracted_pages.append(text)
        
        full_text = "\n".join(extracted_pages)
        
        # Strip header/footer noise and repetitive page numbers
        cleaned_text = re.sub(r'Page\s+\d+\s+of\s+\d+', '', full_text, flags=re.IGNORECASE)
        cleaned_text = re.sub(r'--\s*\d+\s*of\s*\d+\s*--', '', cleaned_text)
        cleaned_text = re.sub(r'\n\s*\n', '\n', cleaned_text)
        
        return cleaned_text.strip()
    except Exception as e:
        print(f"❌ Error extracting PDF text: {e}")
        return ""

# ==========================================
# 5. FASTAPI ANALYZE ENDPOINT
# ==========================================
@app.post("/api/analyze")
async def analyze_medical_report(
    file: UploadFile = File(...),
    previous_text: str = Form("")
):
    try:
        # Step A: Extract PDF Text dynamically
        file_bytes = await file.read()
        raw_report_text = extract_text_from_pdf_bytes(file_bytes)

        if not raw_report_text or len(raw_report_text) < 20:
            return {
                "success": False,
                "analysis": "⚠️ **Unable to extract text.**\n\nThe uploaded document could not be read. Please ensure it is a digital PDF with selectable text.",
                "comparison": "📌 Baseline Report: No text extracted.",
                "raw_text": ""
            }

        # Step B: Dynamically Retrieve Matching Context from Vector Store
        context_text = "No specific reference documentation retrieved."
        if retriever:
            try:
                retrieved_docs = retriever.invoke(raw_report_text)
                if retrieved_docs:
                    context_text = "\n\n".join([doc.page_content for doc in retrieved_docs])
                    print(f"🔎 Retrieved {len(retrieved_docs)} context chunks from ChromaDB.")
            except Exception as re_err:
                print(f"⚠️ Retrieval error ignored: {re_err}")

        # Step C: Format Grounded Prompt & Invoke Gemini
        formatted_prompt = prompt_template.format(
            context=context_text,
            question=raw_report_text
        )

        print("🤖 Generating dynamic LLM synthesis...")
        ai_response = llm.invoke(formatted_prompt)
        analysis_markdown = ai_response.content if hasattr(ai_response, 'content') else str(ai_response)

        # Step D: Dynamic Historical Comparison (if previous report available)
        comparison_markdown = "📌 Baseline Report: No previous medical document on file to compare with."
        if previous_text and len(previous_text.strip()) > 20:
            print("📈 Generating historical trend comparison...")
            comp_prompt = comparison_template.format(
                previous_text=previous_text,
                current_text=raw_report_text
            )
            comp_result = llm.invoke(comp_prompt)
            comparison_markdown = comp_result.content if hasattr(comp_result, 'content') else str(comp_result)

        # Step E: Return structured JSON
        return {
            "success": True,
            "analysis": analysis_markdown,
            "comparison": comparison_markdown,
            "raw_text": raw_report_text
        }

    except Exception as e:
        print(f"❌ Execution Error in RAG Service: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)