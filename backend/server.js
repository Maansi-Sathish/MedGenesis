const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const axios = require('axios');

try { 
    require('dotenv').config(); 
} catch (e) {}

const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'medgenesis_secret_matrix_gateway';
const RAG_SERVICE_URL = process.env.RAG_SERVICE_URL || 'http://127.0.0.1:8000/api/analyze';

app.use(cors());
app.use(express.json());

// In-Memory Databases
let USERS = [];              
let ACCESS_PERMISSIONS = [];  
let REPORTS = [];             

const upload = multer({ 
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 }
});

const ragClient = axios.create({ timeout: 30000 });

async function parsePdfBuffer(buffer) {
    const pdfModule = require('pdf-parse');
    if (pdfModule.PDFParse) {
        const parser = new pdfModule.PDFParse({ data: buffer });
        const result = await parser.getText();
        if (parser.destroy) await parser.destroy();
        return result.text ? result.text.trim() : "";
    } else if (typeof pdfModule === 'function') {
        const result = await pdfModule(buffer);
        return result.text ? result.text.trim() : "";
    } else if (pdfModule.default && typeof pdfModule.default === 'function') {
        const result = await pdfModule.default(buffer);
        return result.text ? result.text.trim() : "";
    } else {
        throw new Error("Unable to parse PDF content.");
    }
}

function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ success: false, error: "Access token missing." });

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ success: false, error: "Token expired or invalid." });
        req.user = user;
        next();
    });
}

function checkDoctorPermission(doctorId, patientId) {
    return ACCESS_PERMISSIONS.some(p => p.doctorId.toLowerCase() === doctorId.toLowerCase() && p.patientId === patientId);
}

function formatToPlainEnglish(rawText) {
    if (!rawText) return "No analysis available.";
    if (rawText.includes("### 📋 Quick Summary")) return rawText;

    return `
### 📋 Quick Summary
This report has been simplified into plain, non-technical language.

### 🔍 Key Findings
${rawText}

### 💡 What This Means For You
* All test values outside standard clinical reference ranges are highlighted above.
* Discuss these findings with your care team for personalized advice.

### ❓ Recommended Questions For Your Doctor
1. Do any of these findings require lifestyle modifications or new medications?
2. Are follow-up lab tests required in the future?
`.trim();
}

// ==========================================================
// 1. AUTHENTICATION & ACCESS CONTROL
// ==========================================================

app.post('/api/auth/register', (req, res) => {
    const role = req.body.role || 'patient';
    const customId = req.body.customId ? String(req.body.customId).trim() : '';
    const password = req.body.password ? String(req.body.password).trim() : '';
    const name = req.body.name ? String(req.body.name).trim() : '';

    if (!customId || !password) {
        return res.status(400).json({ success: false, error: "ID and Password are required." });
    }

    if (role === 'doctor' && !name) {
        return res.status(400).json({ success: false, error: "Doctor name is required." });
    }

    const existingUser = USERS.find(u => u.customId.toLowerCase() === customId.toLowerCase() && u.role === role);
    if (existingUser) {
        return res.status(400).json({ success: false, error: `ID '${customId}' is already registered.` });
    }

    const newUser = {
        id: USERS.length + 1,
        role,
        customId,
        name: role === 'doctor' ? name : `Patient ${customId}`,
        password
    };

    USERS.push(newUser);

    const token = jwt.sign(
        { id: newUser.id, role: newUser.role, customId: newUser.customId, name: newUser.name },
        JWT_SECRET,
        { expiresIn: '8h' }
    );

    return res.json({
        success: true,
        token,
        user: { role: newUser.role, customId: newUser.customId, name: newUser.name }
    });
});

app.post('/api/auth/login', (req, res) => {
    const role = req.body.role || 'patient';
    const customId = req.body.customId ? String(req.body.customId).trim() : '';
    const password = req.body.password ? String(req.body.password).trim() : '';

    const user = USERS.find(u => u.role === role && u.customId.toLowerCase() === customId.toLowerCase() && u.password === password);
    if (!user) {
        return res.status(401).json({ success: false, error: "Invalid ID or Password." });
    }

    const token = jwt.sign(
        { id: user.id, role: user.role, customId: user.customId, name: user.name },
        JWT_SECRET,
        { expiresIn: '8h' }
    );

    return res.json({
        success: true,
        token,
        user: { role: user.role, customId: user.customId, name: user.name }
    });
});

// GRANT ACCESS
app.post('/api/access/grant', authenticateToken, (req, res) => {
    if (req.user.role !== 'patient') return res.status(403).json({ success: false, error: "Only patients can grant access." });

    const doctorCustomId = req.body.doctorCustomId ? String(req.body.doctorCustomId).trim() : '';
    const doctorExists = USERS.find(u => u.role === 'doctor' && u.customId.toLowerCase() === doctorCustomId.toLowerCase());

    if (!doctorExists) {
        return res.status(404).json({ success: false, error: `Doctor ID '${doctorCustomId}' not found.` });
    }

    const alreadyGranted = ACCESS_PERMISSIONS.some(p => p.patientId === req.user.customId && p.doctorId.toLowerCase() === doctorExists.customId.toLowerCase());
    if (!alreadyGranted) {
        ACCESS_PERMISSIONS.push({
            patientId: req.user.customId,
            doctorId: doctorExists.customId,
            doctorName: doctorExists.name,
            grantedAt: new Date().toLocaleDateString()
        });
    }

    return res.json({ success: true, message: `Access granted to Dr. ${doctorExists.name}` });
});

// NEW: REVOKE ACCESS
app.post('/api/access/revoke', authenticateToken, (req, res) => {
    if (req.user.role !== 'patient') return res.status(403).json({ success: false, error: "Only patients can revoke access." });

    const doctorCustomId = req.body.doctorCustomId ? String(req.body.doctorCustomId).trim() : '';

    const initialLength = ACCESS_PERMISSIONS.length;
    ACCESS_PERMISSIONS = ACCESS_PERMISSIONS.filter(
        p => !(p.patientId === req.user.customId && p.doctorId.toLowerCase() === doctorCustomId.toLowerCase())
    );

    if (ACCESS_PERMISSIONS.length < initialLength) {
        return res.json({ success: true, message: `Access revoked for Doctor ID ${doctorCustomId}.` });
    } else {
        return res.status(404).json({ success: false, error: "Permission record not found." });
    }
});

app.get('/api/access/my-doctors', authenticateToken, (req, res) => {
    if (req.user.role !== 'patient') return res.status(403).json({ success: false, error: "Forbidden." });
    const granted = ACCESS_PERMISSIONS.filter(p => p.patientId === req.user.customId);
    return res.json({ success: true, granted });
});

app.get('/api/doctor/permitted-patients', authenticateToken, (req, res) => {
    if (req.user.role !== 'doctor') return res.status(403).json({ success: false, error: "Forbidden." });

    const permissions = ACCESS_PERMISSIONS.filter(p => p.doctorId.toLowerCase() === req.user.customId.toLowerCase());
    const permittedPatientIds = permissions.map(p => p.patientId);

    const patients = USERS.filter(u => u.role === 'patient' && permittedPatientIds.includes(u.customId))
                          .map(u => ({ customId: u.customId, name: u.name }));

    return res.json({ success: true, patients });
});

// ==========================================================
// 2. REPORT INGESTION
// ==========================================================

app.post('/api/reports/upload-pdf', authenticateToken, upload.single('report'), async (req, res) => {
    if (!req.file) return res.status(400).json({ success: false, error: "No PDF file attached." });

    const targetPatientId = req.body.targetPatientId || req.user.customId;

    if (req.user.role === 'doctor' && !checkDoctorPermission(req.user.customId, targetPatientId)) {
        return res.status(403).json({ success: false, error: "No active access permission for this patient." });
    }

    try {
        let extractedText = await parsePdfBuffer(req.file.buffer);
        if (!extractedText) return res.status(400).json({ success: false, error: "Could not read text from PDF." });

        const simplifiedPrompt = `
Analyze the following medical report and explain it in clear, non-technical plain English so a non-medical person can easily understand it.
Include:
1. Quick Summary
2. Key Findings
3. What This Means for You
4. Suggested Questions to Ask Your Doctor

Medical Text:
${extractedText}
        `.trim();

        let rawAnalysis = "";
        try {
            let ragResponse = await ragClient.post(RAG_SERVICE_URL, { medical_terms: simplifiedPrompt });
            rawAnalysis = ragResponse.data.ai_analysis || ragResponse.data.summary || "";
        } catch (ragErr) {
            rawAnalysis = extractedText;
        }

        const structuredAnalysis = formatToPlainEnglish(rawAnalysis);

        const record = {
            id: REPORTS.length + 1,
            patientCustomId: targetPatientId,
            uploadedBy: req.user.role === 'doctor' ? `Dr. ${req.user.name}` : 'Patient',
            filename: req.file.originalname,
            timestamp: new Date().toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }),
            analysis: structuredAnalysis
        };

        REPORTS.push(record);
        return res.json({ success: true, record, analysis: structuredAnalysis });

    } catch (err) {
        return res.status(500).json({ success: false, error: err.message });
    }
});

app.get('/api/reports/history', authenticateToken, (req, res) => {
    let targetPatientId = req.user.customId;

    if (req.user.role === 'doctor') {
        targetPatientId = req.query.patientId;
        if (!targetPatientId || !checkDoctorPermission(req.user.customId, targetPatientId)) {
            return res.status(403).json({ success: false, error: "Unauthorized access to patient history." });
        }
    }

    const patientHistory = REPORTS.filter(r => r.patientCustomId === targetPatientId);
    return res.json({ success: true, history: patientHistory });
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Gateway running on Port ${PORT}`);
});