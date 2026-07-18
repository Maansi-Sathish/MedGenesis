const express = require('express');
const cors = require('cors');
const axios = require('axios');
const multer = require('multer');
const FormData = require('form-data');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

// Configure storage for file uploads
const upload = multer({ storage: multer.memoryStorage() });

const PORT = process.env.PORT || 5000;
const CNN_SERVICE_URL = "http://localhost:8001/api/classify-xray";
const RAG_SERVICE_URL = "http://localhost:8000/api/explain-report";

// Multimodal Endpoint: Image -> CNN findings -> RAG grounded translation
app.post('/api/reports/upload-xray', upload.single('xray'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: "No image file uploaded." });
    }

    try {
        // Step 1: Forward the image file to ecgen-radiology microservice
        const form = new FormData();
        form.append('file', req.file.buffer, req.file.originalname);

        console.log("➡️ Forwarding file to Image Classification CNN...");
        const cnnResponse = await axios.post(CNN_SERVICE_URL, form, {
            headers: { ...form.getHeaders() }
        });

        const extractedFindings = cnnResponse.data.predicted_findings;
        console.log(`✅ CNN Output: "${extractedFindings}"`);

        // Step 2: Forward CNN text findings straight to RAG Service for grounded validation
        console.log("➡️ Pipe extraction matrix into Local Vector RAG Stream...");
        const ragResponse = await axios.post(RAG_SERVICE_URL, {
            medical_terms: extractedFindings
        });

        // Step 3: Return both findings and the grounded AI analysis to the user interface
        return res.json({
            success: true,
            cnn_findings: extractedFindings,
            rag_analysis: ragResponse.data.ai_analysis
        });

    } catch (error) {
        console.error("Pipeline failure across multimodal loop:", error.message);
        return res.status(500).json({ error: "Failed to process image across network matrix." });
    }
});

app.post('/api/reports/analyze', async (req, res) => {
    // Keep your previous text-only analysis route intact here
});

app.listen(PORT, () => console.log(`Gateway live on port ${PORT}`));