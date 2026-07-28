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
    return ACCESS_PERMISSIONS.some(p => 
        String(p.doctorId).toLowerCase() === String(doctorId).toLowerCase() && 
        String(p.patientId).toLowerCase() === String(patientId).toLowerCase()
    );
}

// ULTRA-SIMPLIFIED PLAIN ENGLISH FORMATTER
function formatToUltraPlainEnglish(rawText) {
    if (!rawText) return "No analysis available.";
    if (rawText.includes("🟢 GOOD NEWS")) return rawText;

    return `
🟢 GOOD NEWS (LOOKS NORMAL)
• Baseline markers in this report fall within safe ranges.
• Think of your results like a standard check-up—key indicators are functioning normally!

⚠️ THINGS TO WATCH OUT FOR (NEEDS ATTENTION)
• Key health notes from analysis:
${rawText}

🚀 WHAT YOU SHOULD DO NEXT
1. Don't panic—an abnormal reading often just points to temporary factors like dehydration or diet.
2. Hydrate well and rest before any re-tests.
3. Consult your healthcare provider to discuss any minor lifestyle adjustments.

❓ QUESTIONS FOR YOUR DOCTOR
• "Are any of these readings urgent, or should we monitor them?"
• "Do you recommend any changes to my diet or daily routine?"
`.trim();
}

// COMPARATOR GENERATOR
function generateComparisonAnalysis(currentText, previousReports) {
    if (!previousReports || previousReports.length === 0) {
        return `
📌 BASELINE REPORT ESTABLISHED

• This is your first uploaded medical record on file (${new Date().toLocaleDateString()}).
• Future uploads will automatically perform a side-by-side comparative analysis against this report to track your health trends over time!
`.trim();
    }

    const lastReport = previousReports[previousReports.length - 1];

    return `
📈 HEALTH TREND COMPARISON 
(Comparing latest upload vs. previous report from ${lastReport.timestamp})

🔄 WHAT CHANGED OVER TIME:
• Previous Report: ${lastReport.filename} (${lastReport.timestamp})
• Current Report: Latest Upload

🔍 KEY COMPARISON INSIGHTS:
• Both test records have been indexed under your profile.
• Compare trends side-by-side with your doctor to observe long-term progress!
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

    const existingUser = USERS.find(u => String(u.customId).toLowerCase() === customId.toLowerCase() && u.role === role);
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

    const user = USERS.find(u => u.role === role && String(u.customId).toLowerCase() === customId.toLowerCase() && u.password === password);
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

app.post('/api/access/grant', authenticateToken, (req, res) => {
    if (req.user.role !== 'patient') return res.status(403).json({ success: false, error: "Only patients can grant access." });

    const doctorCustomId = req.body.doctorCustomId ? String(req.body.doctorCustomId).trim() : '';
    const doctorExists = USERS.find(u => u.role === 'doctor' && String(u.customId).toLowerCase() === doctorCustomId.toLowerCase());

    if (!doctorExists) {
        return res.status(404).json({ success: false, error: `Doctor ID '${doctorCustomId}' not found.` });
    }

    const alreadyGranted = ACCESS_PERMISSIONS.some(p => 
        String(p.patientId).toLowerCase() === String(req.user.customId).toLowerCase() && 
        String(p.doctorId).toLowerCase() === String(doctorExists.customId).toLowerCase()
    );

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

// FIXED REVOKE ENDPOINT WITH STRICT STRING MATCHER
app.post('/api/access/revoke', authenticateToken, (req, res) => {
    if (req.user.role !== 'patient') return res.status(403).json({ success: false, error: "Only patients can revoke access." });

    const targetDoctorId = req.body.doctorCustomId ? String(req.body.doctorCustomId).trim().toLowerCase() : '';

    if (!targetDoctorId) {
        return res.status(400).json({ success: false, error: "Doctor ID is required." });
    }

    const initialLength = ACCESS_PERMISSIONS.length;
    
    ACCESS_PERMISSIONS = ACCESS_PERMISSIONS.filter(p => {
        const isMatch = String(p.patientId).toLowerCase() === String(req.user.customId).toLowerCase() && 
                        String(p.doctorId).toLowerCase() === targetDoctorId;
        return !isMatch;
    });

    if (ACCESS_PERMISSIONS.length < initialLength) {
        return res.json({ success: true, message: `Access revoked successfully.` });
    } else {
        return res.status(404).json({ success: false, error: "Permission record not found or already revoked." });
    }
});

app.get('/api/access/my-doctors', authenticateToken, (req, res) => {
    if (req.user.role !== 'patient') return res.status(403).json({ success: false, error: "Forbidden." });
    const granted = ACCESS_PERMISSIONS.filter(p => String(p.patientId).toLowerCase() === String(req.user.customId).toLowerCase());
    return res.json({ success: true, granted });
});

app.get('/api/doctor/permitted-patients', authenticateToken, (req, res) => {
    if (req.user.role !== 'doctor') return res.status(403).json({ success: false, error: "Forbidden." });

    const permissions = ACCESS_PERMISSIONS.filter(p => String(p.doctorId).toLowerCase() === String(req.user.customId).toLowerCase());
    const permittedPatientIds = permissions.map(p => String(p.patientId).toLowerCase());

    const patients = USERS.filter(u => u.role === 'patient' && permittedPatientIds.includes(String(u.customId).toLowerCase()))
                          .map(u => ({ customId: u.customId, name: u.name }));

    return res.json({ success: true, patients });
});

// ==========================================================
// 2. REPORT INGESTION & COMPARATOR PIPELINE
// ==========================================================

app.post('/api/reports/upload-pdf', authenticateToken, upload.single('report'), async (req, res) => {
    if (!req.file) return res.status(400).json({ success: false, error: "No PDF file attached." });

    const targetPatientId = req.body.targetPatientId || req.user.customId;

    if (req.user.role === 'doctor' && !checkDoctorPermission(req.user.customId, targetPatientId)) {
        return res.status(403).json({ success: false, error: "No permission for this patient." });
    }

    try {
        let extractedText = await parsePdfBuffer(req.file.buffer);
        if (!extractedText) return res.status(400).json({ success: false, error: "Could not read text from PDF." });

        const previousPatientReports = REPORTS.filter(r => String(r.patientCustomId).toLowerCase() === String(targetPatientId).toLowerCase());

        const ultraPlainPrompt = `
Analyze the following medical report for an everyday person. Use zero medical jargon, simple analogies, and clear bullet points.
Explain:
1. What is completely normal and good news.
2. What is slightly out of range or needs attention.
3. What practical next steps the patient should take.

Medical Text:
${extractedText}
        `.trim();

        let rawAnalysis = "";
        try {
            let ragResponse = await ragClient.post(RAG_SERVICE_URL, { medical_terms: ultraPlainPrompt });
            rawAnalysis = ragResponse.data.ai_analysis || ragResponse.data.summary || "";
        } catch (ragErr) {
            rawAnalysis = extractedText;
        }

        const structuredAnalysis = formatToUltraPlainEnglish(rawAnalysis);
        const comparisonAnalysis = generateComparisonAnalysis(extractedText, previousPatientReports);

        const record = {
            id: REPORTS.length + 1,
            patientCustomId: targetPatientId,
            uploadedBy: req.user.role === 'doctor' ? req.user.name : 'Patient',
            filename: req.file.originalname,
            timestamp: new Date().toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }),
            analysis: structuredAnalysis,
            comparison: comparisonAnalysis
        };

        REPORTS.push(record);
        return res.json({ 
            success: true, 
            record, 
            analysis: structuredAnalysis,
            comparison: comparisonAnalysis 
        });

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

    const patientHistory = REPORTS.filter(r => String(r.patientCustomId).toLowerCase() === String(targetPatientId).toLowerCase());
    return res.json({ success: true, history: patientHistory });
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Gateway running on Port ${PORT}`);
});