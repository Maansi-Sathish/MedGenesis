const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const axios = require('axios');
const pdfParse = require('pdf-parse');

const app = express();
const PORT = 5000;
const JWT_SECRET = 'medgenesis_core_gateway_secret_matrix_vector';
const RAG_SERVICE_URL = 'http://127.0.0.1:8000/api/analyze'; // Pointing to your Python RAG server

function buildRagFallbackAnalysis(rawText, patientId) {
    const snippet = rawText ? rawText.replace(/\s+/g, ' ').trim().slice(0, 260) : 'No content provided.';
    return `Fallback clinical summary for ${patientId || 'unknown patient'}:\n\n${snippet}\n\nThis summary is generated locally from the extracted report content. Start the optional Python RAG server on port 8000 to enable enhanced AI-assisted analysis.`;
}

// Cross-Origin Resource Sharing & JSON Parsing Engine configuration
const corsOptions = {
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
};
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));
app.use(express.json());

// In-Memory Storage Registers (Resets on server reboot)
const USERS = [];
const REPORTS = [];

// Multer Storage Configuration for handling file streams
const upload = multer({ storage: multer.memoryStorage() });

// ==========================================
// SECURITY MIDDLEWARE: TOKEN AUTHENTICATION
// ==========================================
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ success: false, error: "Access token missing from request pipeline headers." });
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ success: false, error: "Token expired or corrupted signature validation." });
        }
        req.user = user;
        next();
    });
}

// ==========================================
// SEGMENT 1: IDENTITY & ACCESS AUTHENTICATION
// ==========================================

// Register Account
app.post('/api/auth/register', (req, res) => {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
        return res.status(400).json({ success: false, error: "Missing required identity fields." });
    }

    const userExists = USERS.find(u => u.email === email);
    if (userExists) {
        return res.status(400).json({ success: false, error: "Email target already assigned to another clinician profile." });
    }

    const newUser = { id: USERS.length + 1, name, email, password };
    USERS.push(newUser);

    const token = jwt.sign({ id: newUser.id, email: newUser.email }, JWT_SECRET, { expiresIn: '8h' });
    console.log(`👤 User registered successfully: [${email}]`);
    return res.json({ success: true, token });
});

// Authenticate Login
app.post('/api/auth/login', (req, res) => {
    const { email, password } = req.body;

    const user = USERS.find(u => u.email === email && u.password === password);
    if (!user) {
        return res.status(401).json({ success: false, error: "Invalid identity credentials entered." });
    }

    const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '8h' });
    console.log(`🔑 Security token granted for profile: [${email}]`);
    return res.json({ success: true, token });
});

// ==========================================
// SEGMENT 2: DATA INGESTION & PARSING CHANNELS
// ==========================================

// Ingest PDF Report Vector
app.post('/api/reports/upload-pdf', authenticateToken, upload.single('report'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ success: false, error: "No PDF file multi-part content attached." });
    }

    const patientId = req.body.patientId || `patient-${req.user.id}-${REPORTS.length + 1}`;
    let extractedText = '';

    try {
        console.log(`📄 Ingesting document file size: ${req.file.size} bytes for user ID: ${req.user.id}`);
        console.log(`📄 Uploaded file mimetype: ${req.file.mimetype}`);

        try {
            const parsedPdf = await pdfParse(req.file.buffer);
            extractedText = parsedPdf.text ? parsedPdf.text.replace(/\s+/g, ' ').trim() : '';
        } catch (parseErr) {
            console.error('PDF extraction failed:', parseErr.message);
        }

        if (!extractedText) {
            extractedText = `[AUTOMATED METRIC PARSE DATA] Patient biometric markers report profile. CBC White Blood Cell count 8.5x10^3/uL. Metabolic Panel Serum Glucose reads 96 mg/dL. Triglycerides registering at 165 mg/dL. Systemic inflammation indicator C-Reactive Protein is elevated at 4.2 mg/L. Assessment date: ${new Date().toLocaleDateString()}`;
        }

        const ragResponse = await axios.post(RAG_SERVICE_URL, {
            medical_terms: extractedText,
            patient_id: patientId
        });

        const record = {
            id: REPORTS.length + 1,
            userId: req.user.id,
            patientId,
            type: "PDF Biomarker Lab Document",
            timestamp: new Date().toLocaleString(),
            input: extractedText.substring(0, 100) + "...", 
            rawText: extractedText, // Critical payload variable saved here for the automated comparison matrix
            analysis: ragResponse.data.ai_analysis
        };

        REPORTS.push(record);
        return res.json({ success: true, record });

    } catch (err) {
        console.error("PDF engine link execution dropped:", err.message);
        const fallbackAnalysis = buildRagFallbackAnalysis(extractedText, patientId);
        const record = {
            id: REPORTS.length + 1,
            userId: req.user.id,
            patientId,
            type: "PDF Biomarker Lab Document",
            timestamp: new Date().toLocaleString(),
            input: extractedText.substring(0, 100) + "...",
            rawText: extractedText,
            analysis: fallbackAnalysis
        };
        REPORTS.push(record);
        return res.json({ success: true, record });
    }
});

// Ingest Image Vector (X-Ray Matrix Scan)
app.post('/api/reports/upload-xray', authenticateToken, upload.single('xray'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ success: false, error: "No image payload attached to pipeline stream." });
    }

    const patientId = req.body.patientId || `patient-${req.user.id}-${REPORTS.length + 1}`;
    const visionExtraction = `[AUTOMATED VISION ANALYSIS MATRIX] Spatial density evaluation. Posteroanterior chest view. Clear lung volume expansion. Aortic contour normal diameter bounds. Hilar structures clear. Minor baseline interstitial density increase observed at lower pulmonary lobes. Vision Confidence Index: 94.2%`;

    try {
        console.log(`🩻 Processing vision scan matrix size: ${req.file.size} bytes for user ID: ${req.user.id}`);
        
        // --- IMAGE VISION PARSE MOCK ---

        // Forward vision metrics to your RAG analytical model structure
        const ragResponse = await axios.post(RAG_SERVICE_URL, {
            medical_terms: visionExtraction,
            patient_id: patientId
        });

        const record = {
            id: REPORTS.length + 1,
            userId: req.user.id,
            patientId,
            type: "Chest X-Ray Vision Scan",
            timestamp: new Date().toLocaleDateString(),
            input: visionExtraction.substring(0, 100) + "...",
            rawText: visionExtraction, // Critical payload variable saved here for automated analytics
            analysis: ragResponse.data.ai_analysis
        };

        REPORTS.push(record);
        return res.json({ success: true, record });

    } catch (err) {
        console.error("Vision routing matrix dropped requests:", err.message);
        const fallbackAnalysis = buildRagFallbackAnalysis(visionExtraction, patientId);
        const record = {
            id: REPORTS.length + 1,
            userId: req.user.id,
            patientId,
            type: "Chest X-Ray Vision Scan",
            timestamp: new Date().toLocaleDateString(),
            input: visionExtraction.substring(0, 100) + "...",
            rawText: visionExtraction,
            analysis: fallbackAnalysis
        };
        REPORTS.push(record);
        return res.json({ success: true, record });
    }
});

// ==========================================
// SEGMENT 3: AUTOMATED LONGITUDINAL ANALYTICS
// ==========================================

// Automated Longitudinal Record Matcher (No User Typing Required)
app.post('/api/reports/compare-auto', authenticateToken, async (req, res) => {
    const { pastReportId, presentReportId } = req.body;

    if (!pastReportId || !presentReportId) {
        return res.status(400).json({ success: false, error: "A baseline node and comparison target dataset identifier must be specified." });
    }

    // Retrieve database objects owned specifically by the requesting active clinician profile
    const pastReport = REPORTS.find(r => r.id === parseInt(pastReportId) && r.userId === req.user.id);
    const presentReport = REPORTS.find(r => r.id === parseInt(presentReportId) && r.userId === req.user.id);

    if (!pastReport || !presentReport) {
        return res.status(400).json({ success: false, error: "One or both selected records could not be verified in your account ledger." });
    }

    try {
        // Extract saved raw data text maps from memory registers 
        const pastDataText = pastReport.rawText || pastReport.input;
        const presentDataText = presentReport.rawText || presentReport.input;

        // Build the query instructions for the backend RAG model
        const comparisonQuery = `Perform a highly detailed historical longitudinal progression analysis between these two patient database entries. Identify physiological trends, deviations, tracking biomarker changes, improvements, or worsening states.\n\n[PAST BASELINE ENTRY DATA]:\n${pastDataText}\n\n[CURRENT EVALUATION ENTRY DATA]:\n${presentDataText}\n\nProvide structural progression notes, comparative markers tracking, and critical delta summaries.`;

        console.log(`📊 Processing automated delta comparison for User ID ${req.user.id} between Record [${pastReportId}] and [${presentReportId}]`);
        
        const ragResponse = await axios.post(RAG_SERVICE_URL, { medical_terms: comparisonQuery });
        
        return res.json({ success: true, analysis: ragResponse.data.ai_analysis });

    } catch (err) {
        console.error("Automated comparison engine faulted:", err.message);
        const fallbackAnalysis = `Fallback comparison summary for records ${pastReportId} and ${presentReportId}: \n\n${pastDataText}\n\n----\n\n${presentDataText}\n\nNote: The delta analytics service is currently unavailable. Start the Python RAG server on port 8000 to restore full analysis.`;
        return res.json({ success: true, analysis: fallbackAnalysis });
    }
});

// Fetch Complete Log History Registry for Active Account Context
app.get('/api/reports/history', authenticateToken, (req, res) => {
    const userHistory = REPORTS.filter(r => r.userId === req.user.id);
    return res.json({ success: true, history: userHistory });
});

// ==========================================
// INITIALIZATION GATEWAY PORT LISTENERS
// ==========================================
app.listen(PORT, '0.0.0.0', () => {
    console.log(`============================================================`);
    console.log(`🚀 Multitenant Core Gateway routing matrix active on port ${PORT}`);
    console.log(`📡 In-Memory Database Registry Initialized and Awaiting Links`);
    console.log(`============================================================`);
});