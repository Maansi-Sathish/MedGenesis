from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from backend.routes import imaging, bed_management, patients,  diagnosis  
from backend.routes import imaging


app = FastAPI(title="MedGenesis API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ✅ Register imaging router
app.include_router(imaging.router, prefix="/api")
app.include_router(patients.router, prefix="/api", tags=["Patients"])
app.include_router(bed_management.router, prefix="/api", tags=["Beds"])
app.include_router(diagnosis.router)
app.include_router(imaging.router)

@app.get("/")
def home():
    return {"message": "MedGenesis backend is running ✅"}
