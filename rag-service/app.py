import os
import io
import re
import json
import pypdf
from fastapi import FastAPI, HTTPException, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

from langchain_chroma import Chroma
from langchain_google_genai import ChatGoogleGenerativeAI, GoogleGenerativeAIEmbeddings
from langchain_core.prompts import PromptTemplate

# Load environment variables (.env file)
load_dotenv()

app = FastAPI(title="MedGenesis Dynamic RAG Service")

# ==========================================
# 0. ADD CORS MIDDLEWARE (CRITICAL FIX)
# ==========================================
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allows requests from Node backend and web frontend
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ==========================================
# 1. INITIALIZE EMBEDDINGS & CHROMADB
# ==========================================
print("🔄 Initializing embeddings and loading ChromaDB vector store...")

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

if not GEMINI_API_KEY:
    print("⚠️ WARNING: GEMINI_API_KEY is missing from environment configuration!")

embeddings = GoogleGenerativeAIEmbeddings(
    model="models/gemini-embedding-001",
    google_api_key=os.getenv("GEMINI_API_KEY")
)
retriever = None
try:
    if os.path.exists("./chroma_db"):
        vector_db = Chroma(
            persist_directory="./chroma_db", 
            embedding_function=embeddings
        )
        retriever = vector_db.as_retriever(search_kwargs={"k": 3})
        print("✅ ChromaDB vector store successfully connected.")
    else:
        print("⚠️ Warning: './chroma_db' folder not found. Operating without vector retrieval.")
except Exception as e:
    print(f"⚠️ Warning: Could not load ChromaDB ({e}). Pipeline operating without vector retrieval.")

# ==========================================
# 2. CONFIGURE GEMINI MODEL
# ==========================================
llm = ChatGoogleGenerativeAI(
    model="gemini-3.5-flash",  # ✅ Updated: gemini-1.5-flash was retired by Google
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
# 4b. HELPER: SAFE LLM TEXT EXTRACTION
# ==========================================
def _pull_text_from_blocks(content):
    """Given a list/dict of structured content blocks, pull out just the text."""
    if isinstance(content, dict):
        if content.get("type") == "text":
            return content.get("text", "")
        return ""
    if isinstance(content, list):
        parts = []
        for block in content:
            parts.append(_pull_text_from_blocks(block))
        return "\n".join(p for p in parts if p).strip()
    if isinstance(content, str):
        return content
    return str(content)


def extract_text(response) -> str:
    """
    Safely extracts plain text from an LLM response.

    Newer Gemini models (e.g. gemini-3.5-flash) return "thinking" content as
    structured blocks (e.g. [{"type": "text", "text": "...", "extras": {"signature": "..."}}])
    instead of a plain string. langchain_core ships an official `.text` property
    on messages that is specifically designed to handle this — we use it first
    since it's maintained upstream and matches the exact block format we've seen.
    """
    # --- Preferred path: langchain_core's official `.text` accessor ---
    try:
        official_text = getattr(response, "text", None)
        if official_text is not None:
            text_value = str(official_text).strip()
            if text_value:
                return text_value
    except Exception as e:
        print(f"⚠️ .text accessor failed, falling back: {e}")

    # --- Fallback: manual parsing (handles raw list/dict, or a JSON-encoded string) ---
    content = getattr(response, "content", response)

    if isinstance(content, str):
        stripped = content.strip()
        if stripped.startswith("[") or stripped.startswith("{"):
            try:
                parsed = json.loads(stripped)
                extracted = _pull_text_from_blocks(parsed)
                if extracted:
                    return extracted
            except (json.JSONDecodeError, TypeError):
                pass  # not actually JSON — just a normal string, fall through
        return content

    if isinstance(content, (list, dict)):
        extracted = _pull_text_from_blocks(content)
        if extracted:
            return extracted

    return str(content)

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
        print(f"🔍 DEBUG ai_response.content type: {type(ai_response.content)}")
        print(f"🔍 DEBUG ai_response.content preview: {str(ai_response.content)[:300]}")
        analysis_markdown = extract_text(ai_response)
        print(f"🔍 DEBUG extracted analysis_markdown preview: {analysis_markdown[:200]}")

        # Step D: Dynamic Historical Comparison (if previous report available)
        comparison_markdown = "📌 Baseline Report: No previous medical document on file to compare with."
        if previous_text and len(previous_text.strip()) > 20:
            print("📈 Generating historical trend comparison...")
            comp_prompt = comparison_template.format(
                previous_text=previous_text,
                current_text=raw_report_text
            )
            comp_result = llm.invoke(comp_prompt)
            comparison_markdown = extract_text(comp_result)

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