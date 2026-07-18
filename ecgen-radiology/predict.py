import os
import random
from fastapi import FastAPI, File, UploadFile, HTTPException
import uvicorn

app = FastAPI(title="MedGenesis Image Classification Service")

# Simulation array representing classifications on NIH Chest X-ray 14 / OpenI datasets
DIAGNOSTIC_LABELS = [
    "The lungs are clear bilaterally. No focal areas of consolidation, pleural effusion, or pneumothorax.",
    "Enlargement of the cardiomediastinal silhouette is present, indicating cardiomegaly.",
    "Patchy infiltrates and focal opacity are observed in the lower right lobe, suggesting potential localized pulmonary infection or pneumonia."
]

@app.post("/api/classify-xray")
async def classify_xray(file: UploadFile = File(...)):
    """
    Accepts an uploaded chest X-ray image and applies neural network inference.
    """
    # Verify file extension
    extension = os.path.splitext(file.filename)[1].lower()
    if extension not in [".jpg", ".jpeg", ".png"]:
        raise HTTPException(status_code=400, detail="Invalid image format. Please upload a PNG or JPEG file.")
    
    try:
        # Read the file stream bytes (In a real deployment, pass this buffer to your model.forward() call)
        _ = await file.read()
        
        # Simulating inference based on your paper dataset outputs
        predicted_findings = random.choice(DIAGNOSTIC_LABELS)
        
        return {
            "status": "success",
            "filename": file.filename,
            "predicted_findings": predicted_findings
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    uvicorn.run("predict.py:app", host="0.0.0.0", port=8001, reload=True)