const express = require('express');
const cors = require('cors');
const axios = require('axios');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 5000;
const RAG_SERVICE_URL = process.env.RAG_SERVICE_URL || "http://localhost:8000/api/explain-report";

// Primary Report Analysis Endpoint
app.post('/api/reports/analyze', async (req, res) => {
    const { medicalTerms } = req.body;

    if (!medicalTerms) {
        return res.status(400).json({ error: "Medical metrics/terms text field is required." });
    }

    try {
        // Forward the metrics to the RAG layer microservice
        const response = await axios.post(RAG_SERVICE_URL, {
            medical_terms: medicalTerms
        });

        // Optional: Save response.data.ai_analysis to your PostgreSQL db instance here[cite: 1]

        return res.json({
            success: true,
            analysis: response.data.ai_analysis
        });

    } catch (error) {
        console.error("Error communicating with RAG Microservice:", error.message);
        return res.status(500).json({ 
            error: "Failed processing metrics via RAG pipeline layer." 
        });
    }
});

app.listen(PORT, () => {
    console.log(`Node.js Core Backend operational on port ${PORT}`);
});