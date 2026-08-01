import os
from langchain_community.document_loaders import DirectoryLoader, PyPDFLoader, TextLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_chroma import Chroma
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_core.documents import Document

DATA_PATH = "./data"
CHROMA_PATH = "./chroma_db"

def build_vector_db():
    print("📂 Loading reference documents from ./data folder...")
    
    # Load all PDFs and Text files from the data directory
    pdf_loader = DirectoryLoader(DATA_PATH, glob="*.pdf", loader_cls=PyPDFLoader)
    txt_loader = DirectoryLoader(DATA_PATH, glob="*.txt", loader_cls=TextLoader)
    
    documents = pdf_loader.load() + txt_loader.load()
    
    if not documents:
        print("⚠️ No documents found in ./data! Please check your PDF/TXT files inside rag-service/data/")
        return

    print(f"📄 Loaded {len(documents)} document page(s). Splitting into chunks...")

    # Split documents into small, searchable context chunks
    text_splitter = RecursiveCharacterTextSplitter(
        chunk_size=500,
        chunk_overlap=50
    )
    chunks = text_splitter.split_documents(documents)
    print(f"✂️ Created {len(chunks)} text chunks for embedding.")

    # Generate embeddings and persist to ChromaDB
    print("🧠 Embedding chunks into ChromaDB...")
    embeddings = HuggingFaceEmbeddings(model_name="all-MiniLM-L6-v2")
    
    vector_db = Chroma.from_documents(
        documents=chunks,
        embedding=embeddings,
        persist_directory=CHROMA_PATH
    )
    print(f"✅ Successfully indexed {len(chunks)} chunks into '{CHROMA_PATH}'!")

if __name__ == "__main__":
    build_vector_db()