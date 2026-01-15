# 🏥 MedGenesis

MedGenesis is an AI-powered hospital management system that integrates patient admission, bed management, disease prediction using machine learning, and medical image analysis using deep learning. The system is designed to assist healthcare professionals by combining efficient hospital operations with intelligent diagnostic support.

---

## 🚀 Features

- 🧍 Patient Admission System  
  - Enter patient name, age, gender, and symptoms  
  - Automatic bed allocation  
  - Admission date and time recorded  

- 🛏️ Bed Management  
  - Tracks available and occupied beds in real time  

- 🧠 Disease Prediction (Machine Learning)  
  - Heart disease prediction  
  - Kidney disease prediction  
  - Liver disease prediction  
  - Breast cancer prediction  

- 🩻 Medical Image Analysis (Deep Learning)  
  - Chest X-ray analysis (Pneumonia detection)  
  - Brain tumor detection using MRI images  

- 📋 Patient Records Dashboard  
  - Centralized view of all admitted patients  
  - Displays diagnosis results, bed number, and admission time  

- 🌐 Full-Stack Web Application  
  - Backend APIs using FastAPI  
  - Frontend built with React  

---

## 🏗️ How MedGenesis Works

1. Patient details are entered through the React frontend.  
2. FastAPI backend assigns an available bed and stores admission data.  
3. Machine learning models predict possible diseases based on patient data.  
4. Deep learning models analyze uploaded medical images.  
5. Results are stored in PostgreSQL and displayed on the dashboard.  

---

## 🧠 AI & ML Components

| Module | Technique Used |
|------|----------------|
| Disease Prediction | Machine Learning (Random Forest) |
| Image Analysis | Convolutional Neural Networks (CNNs) |
| Data Processing | Pandas, NumPy |
| Model Storage | Joblib (`.pkl`), TensorFlow/PyTorch models |

---

## ⚙️ Tech Stack

### Frontend
- React.js  
- Tailwind CSS / Material UI  
- Axios  

### Backend
- FastAPI (Python)  
- RESTful APIs  
- Uvicorn  

### Database
- PostgreSQL (SQL-based, scalable)

### Machine Learning & Deep Learning
- Scikit-learn  
- TensorFlow / Keras  
- OpenCV  
- Pandas, NumPy  

---

## 🧪 Models & Datasets

Due to GitHub file size limitations, trained model files (`.h5`, `.pkl`)  
and image datasets are not included in this repository.

The models can be recreated by running the training scripts provided.  
Public datasets used in this project can be linked or shared upon request.

### Datasets Used

#### Image Datasets
- Chest X-ray Dataset  
  - Source: Kaggle  
- Brain Tumor MRI Dataset  
  - Source: Kaggle  

#### Tabular Medical Datasets
- Cleveland Heart Disease Dataset  
  - Source: UCI Machine Learning Repository  
- Chronic Kidney Disease (CKD) Dataset  
  - Source: UCI Machine Learning Repository  
- Breast Cancer Wisconsin (Diagnostic) Dataset  
  - Source: UCI Machine Learning Repository  
- Indian Liver Patient Dataset (ILPD)  
  - Source: UCI Machine Learning Repository  

---

## Contributors
- Maansi S 
- Meghana P
- Ianna Elizabeth Reni
