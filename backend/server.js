import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import multer from 'multer';
import axios from 'axios';
import jwt from 'jsonwebtoken';
import pg from 'pg';
import FormData from 'form-data';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const JWT_SECRET = process.env.JWT_SECRET || 'medgenesis_secret_key_2026';

// ==========================================
// RAG SERVICE ENDPOINT CONFIGURATION (FIXED)
// ==========================================
const rawRagUrl = process.env.RAG_SERVICE_URL || 'https://medgenesis-rag.onrender.com';
// Strips any trailing slashes or duplicate '/api/analyze' suffixes to guarantee a clean base URL
const cleanRagBase = rawRagUrl.replace(/\/+$/, '').replace(/\/api\/analyze$/, '');
// Constructs the exact endpoint path FastAPI expects
const RAG_SERVICE_URL = `${cleanRagBase}/api/analyze`;

// ==========================================
// 1. POSTGRESQL DATABASE CONNECTION
// ==========================================
const { Pool } = pg;
const pool = new Pool({
  user: process.env.PGUSER || 'postgres',
  host: process.env.PGHOST || 'localhost',
  database: process.env.PGDATABASE || 'medgenesis',
  password: process.env.PGPASSWORD || '123456',
  port: parseInt(process.env.PGPORT || '5432', 10),
});

// Verify & Patch Schema
async function initDb() {
  try {
    // Ensure raw_text column exists in case manual SQL was skipped
    await pool.query(`ALTER TABLE reports ADD COLUMN IF NOT EXISTS raw_text TEXT;`);
    console.log('✅ PostgreSQL DB connected & schema verified against pgAdmin setup.');
  } catch (err) {
    console.error('❌ Database Sync Warning:', err.message);
  }
}

// Multer RAM Storage setup
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 }
});

// ==========================================
// 2. JWT AUTHENTICATION MIDDLEWARE
// ==========================================
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.status(401).json({ error: 'Access token required.' });

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Invalid or expired session token.' });
    req.user = user;
    next();
  });
};

// ==========================================
// 3. AUTHENTICATION ROUTES
// ==========================================
app.post('/api/auth/register', async (req, res) => {
  const { customId, password, name, role } = req.body;

  if (!customId || !password || !role) {
    return res.status(400).json({ error: 'Custom ID, password, and role are required.' });
  }

  try {
    const existing = await pool.query(
      'SELECT * FROM users WHERE custom_id = $1 AND role = $2',
      [String(customId).trim(), role]
    );

    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'Account with this ID and role already exists.' });
    }

    const displayName = name || (role === 'doctor' ? `Dr. ${customId}` : `Patient ${customId}`);

    const newUser = await pool.query(
      'INSERT INTO users (custom_id, name, password, role) VALUES ($1, $2, $3, $4) RETURNING *',
      [String(customId).trim(), displayName, String(password).trim(), role]
    );

    const user = newUser.rows[0];
    const token = jwt.sign(
      { id: user.id, customId: user.custom_id, role: user.role, name: user.name },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    return res.json({
      success: true,
      token,
      user: { id: user.id, customId: user.custom_id, name: user.name, role: user.role }
    });
  } catch (err) {
    console.error('Registration Error:', err);
    return res.status(500).json({ error: 'Internal server error during registration.' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const { customId, password, role } = req.body;

  try {
    const result = await pool.query(
      'SELECT * FROM users WHERE custom_id = $1 AND role = $2',
      [String(customId).trim(), role]
    );

    const user = result.rows[0];
    if (!user || user.password !== String(password).trim()) {
      return res.status(401).json({ error: 'Invalid ID, password, or role.' });
    }

    const token = jwt.sign(
      { id: user.id, customId: user.custom_id, role: user.role, name: user.name },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    return res.json({
      success: true,
      token,
      user: { id: user.id, customId: user.custom_id, name: user.name, role: user.role }
    });
  } catch (err) {
    console.error('Login Error:', err);
    return res.status(500).json({ error: 'Internal server error during login.' });
  }
});

// ==========================================
// 4. ACCESS CONTROL (MATCHED TO access_permissions)
// ==========================================
app.post('/api/access/grant', authenticateToken, async (req, res) => {
  const { doctorCustomId } = req.body;
  const patientId = req.user.customId;

  if (req.user.role !== 'patient') {
    return res.status(403).json({ error: 'Only patients can grant access.' });
  }

  try {
    const docCheck = await pool.query(
      'SELECT name FROM users WHERE custom_id = $1 AND role = $2',
      [String(doctorCustomId).trim(), 'doctor']
    );

    if (docCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Doctor ID not found in system.' });
    }

    const doctorName = docCheck.rows[0].name;

    await pool.query(
      `INSERT INTO access_permissions (patient_id, doctor_id, doctor_name) 
       VALUES ($1, $2, $3) 
       ON CONFLICT (patient_id, doctor_id) DO NOTHING`,
      [patientId, String(doctorCustomId).trim(), doctorName]
    );

    return res.json({ success: true, message: `Access granted to ${doctorName}` });
  } catch (err) {
    console.error('Grant Access Error:', err);
    return res.status(500).json({ error: 'Failed to grant access.' });
  }
});

app.post('/api/access/revoke', authenticateToken, async (req, res) => {
  const { doctorCustomId } = req.body;
  const patientId = req.user.customId;

  try {
    await pool.query(
      'DELETE FROM access_permissions WHERE patient_id = $1 AND doctor_id = $2',
      [patientId, String(doctorCustomId).trim()]
    );
    return res.json({ success: true, message: 'Access revoked successfully.' });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to revoke access.' });
  }
});

app.get('/api/access/my-doctors', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT doctor_id as "doctorId", doctor_name as "doctorName", granted_at as "grantedAt"
       FROM access_permissions 
       WHERE patient_id = $1`,
      [req.user.customId]
    );
    return res.json({ granted: result.rows });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to retrieve granted doctors.' });
  }
});

app.get('/api/doctor/permitted-patients', authenticateToken, async (req, res) => {
  if (req.user.role !== 'doctor') {
    return res.status(403).json({ error: 'Doctor access required.' });
  }

  try {
    const result = await pool.query(
      `SELECT ap.patient_id as "customId", COALESCE(u.name, ap.patient_id) as "name"
       FROM access_permissions ap
       LEFT JOIN users u ON ap.patient_id = u.custom_id AND u.role = 'patient'
       WHERE ap.doctor_id = $1`,
      [req.user.customId]
    );
    return res.json({ patients: result.rows });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to retrieve permitted patients.' });
  }
});

// ==========================================
// 5. REPORT MANAGEMENT & RAG INTEGRATION
// ==========================================
app.get('/api/reports/history', authenticateToken, async (req, res) => {
  let targetPatientId = req.user.customId;

  if (req.user.role === 'doctor') {
    targetPatientId = req.query.patientId;
    if (!targetPatientId) {
      return res.status(400).json({ error: 'Patient ID is required.' });
    }

    const grantCheck = await pool.query(
      'SELECT * FROM access_permissions WHERE patient_id = $1 AND doctor_id = $2',
      [String(targetPatientId), req.user.customId]
    );

    if (grantCheck.rows.length === 0) {
      return res.status(403).json({ error: 'You do not have access to this patient.' });
    }
  }

  try {
    const history = await pool.query(
      `SELECT id, patient_custom_id as "patientId", filename, analysis, comparison, 
              uploaded_by as "uploadedBy", timestamp
       FROM reports WHERE patient_custom_id = $1 ORDER BY id DESC`,
      [String(targetPatientId)]
    );
    return res.json({ history: history.rows });
  } catch (err) {
    return res.json({ history: [] });
  }
});

app.post('/api/reports/upload-pdf', authenticateToken, upload.single('report'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Please choose a PDF file to upload.' });
    }

    let targetPatientId = req.user.customId;

    if (req.user.role === 'doctor') {
      targetPatientId = req.body.targetPatientId;
      if (!targetPatientId) return res.status(400).json({ error: 'Target patient ID required.' });

      const grantCheck = await pool.query(
        'SELECT * FROM access_permissions WHERE patient_id = $1 AND doctor_id = $2',
        [String(targetPatientId), req.user.customId]
      );
      if (grantCheck.rows.length === 0) {
        return res.status(403).json({ error: 'Unauthorized patient selection.' });
      }
    }

    // Step 1: Safely query previous raw_text using patient_custom_id
    let previousText = '';
    try {
      const prevQuery = await pool.query(
        'SELECT raw_text FROM reports WHERE patient_custom_id = $1 ORDER BY id DESC LIMIT 1',
        [String(targetPatientId)]
      );
      if (prevQuery.rows.length > 0 && prevQuery.rows[0].raw_text) {
        previousText = prevQuery.rows[0].raw_text;
      }
    } catch (dbErr) {
      console.warn('⚠️ Could not fetch previous report raw_text:', dbErr.message);
    }

    // Step 2: Forward PDF stream to Python FastAPI RAG microservice
    console.log(`📡 Forwarding stream to RAG service: ${RAG_SERVICE_URL}`);
    const form = new FormData();
    form.append('file', req.file.buffer, {
      filename: req.file.originalname || 'report.pdf',
      contentType: req.file.mimetype || 'application/pdf'
    });
    form.append('previous_text', previousText);

    let ragResponse;
    try {
      ragResponse = await axios.post(RAG_SERVICE_URL, form, {
        headers: { ...form.getHeaders() }
      });
    } catch (ragErr) {
      console.error('❌ RAG Microservice Communication Failure:', ragErr.response?.data || ragErr.message);
      return res.status(500).json({
        error: `RAG microservice at ${RAG_SERVICE_URL} is unreachable or returned an error.`
      });
    }

    const { analysis, comparison, raw_text } = ragResponse.data;
    const formattedTimestamp = new Date().toISOString().replace('T', ' ').substring(0, 16);

    // Step 3: Insert record using your exact column names
    const inserted = await pool.query(
      `INSERT INTO reports (patient_custom_id, uploaded_by, filename, timestamp, analysis, comparison, raw_text)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id, created_at`,
      [
        String(targetPatientId),
        req.user.name || req.user.customId,
        req.file.originalname,
        formattedTimestamp,
        analysis || 'No summary generated.',
        comparison || '📌 Baseline Report: No previous report on file.',
        raw_text || ''
      ]
    );

    return res.json({
      success: true,
      analysis,
      comparison,
      record: {
        id: inserted.rows[0].id,
        filename: req.file.originalname,
        timestamp: formattedTimestamp
      }
    });

  } catch (err) {
    console.error('❌ Upload Processing Error:', err);
    return res.status(500).json({ error: err.message || 'Error processing document upload.' });
  }
});

// Start Node Express Server
const PORT = process.env.PORT || 5000;

async function startServer() {
  await initDb();
  app.listen(PORT, () => {
    console.log(`🚀 MedGenesis Node backend listening on port ${PORT}`);
  });
}

startServer();