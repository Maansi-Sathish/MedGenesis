from sqlmodel import SQLModel, Field
from typing import Optional
from datetime import datetime

class Diagnosis(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    patient_name: str
    age: int
    gender: str
    symptoms: str
    predicted_disease: str
    report: str
    timestamp: str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

class Bed(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    bed_name: str
    occupied: bool = False
    patient_name: Optional[str] = None
    doctor_name: Optional[str] = None
    disease: Optional[str] = None
    check_in: Optional[str] = None

class PatientRecord(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    patient_name: str
    disease: str
    bed_id: int
    doctor_name: str
    admission_date: str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
