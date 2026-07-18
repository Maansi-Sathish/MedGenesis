import os
import kagglehub
import pandas as pd

# Directing outputs into your designated subfolder
DOCS_DIR = "./rag-service/documents"
os.makedirs(DOCS_DIR, exist_ok=True)

def auto_ingest_openi():
    print("⌛ Step 1: Downloading dataset from Kaggle via kagglehub...")
    try:
        download_path = kagglehub.dataset_download("masrursabab/iu-chest-x-rays-cleaned")
        print(f"📦 Archive safely unpacked into system cache at: {download_path}")
    except Exception as e:
        print(f"❌ Kagglehub download failed. Make sure you have internet. Error: {e}")
        return

    csv_filename = "iu-chest-x-rays-cleaned.csv" 
    full_csv_path = os.path.join(download_path, csv_filename)

    # Fallback checking mechanism for internal file layouts
    if not os.path.exists(full_csv_path):
        csv_files = [f for f in os.listdir(download_path) if f.endswith('.csv')]
        if csv_files:
            full_csv_path = os.path.join(download_path, csv_files[0])
        else:
            print("❌ Failure: Could not find a structural text matrix (.csv) inside download package.")
            return

    print(f"⌛ Step 2: Extracting clinical data records from: {full_csv_path}...")
    df = pd.read_csv(full_csv_path)
    
    text_column = 'org_caption' if 'org_caption' in df.columns else (
        'findings' if 'findings' in df.columns else df.columns[1]
    )
    
    output_text_path = os.path.join(DOCS_DIR, "openi_processed_reports.txt")
    
    print(f"⌛ Step 3: Compiling records into plaintext format...")
    with open(output_text_path, "w", encoding="utf-8") as f:
        for idx, row in df.iterrows():
            if pd.notna(row[text_column]):
                f.write(f"[Record ID: OpenI-{idx}] {row[text_column]}\n")
                
    print(f"🚀 Success! Clean data corpus successfully created at: {output_text_path}")

if __name__ == "__main__":
    auto_ingest_openi()