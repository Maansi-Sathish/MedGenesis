import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './App.css';

const API_BASE = "http://localhost:5000/api";

function App() {
  const [token, setToken] = useState(localStorage.getItem('token') || '');
  const [user, setUser] = useState(JSON.parse(localStorage.getItem('user') || '{}'));
  
  // Auth Form State
  const [isRegister, setIsRegister] = useState(false);
  const [role, setRole] = useState('patient'); 
  const [customId, setCustomId] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState('');

  // Patient State
  const [grantDoctorId, setGrantDoctorId] = useState('');
  const [grantedDoctors, setGrantedDoctors] = useState([]);

  // Doctor State
  const [permittedPatients, setPermittedPatients] = useState([]);
  const [selectedPatientId, setSelectedPatientId] = useState('');

  // Upload & Analysis State
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [reports, setReports] = useState([]);
  const [activeAnalysis, setActiveAnalysis] = useState('');
  const [activeReportId, setActiveReportId] = useState(null);

  useEffect(() => {
    if (token) {
      if (user.role === 'patient') {
        fetchGrantedDoctors();
        fetchReports();
      } else if (user.role === 'doctor') {
        fetchPermittedPatients();
      }
    }
  }, [token, user]);

  useEffect(() => {
    if (token && user.role === 'doctor' && selectedPatientId) {
      fetchReports();
    }
  }, [selectedPatientId]);

  const handleTabSwitch = (newRole) => {
    setRole(newRole);
    setAuthError('');
    setCustomId('');
    setName('');
    setPassword('');
  };

  const handleAuth = async (e) => {
    e.preventDefault();
    setAuthError('');
    const endpoint = isRegister ? '/auth/register' : '/auth/login';

    const payload = {
      role,
      customId: String(customId).trim(),
      password: String(password).trim(),
      name: role === 'doctor' ? String(name).trim() : `Patient ${customId}`
    };

    try {
      const res = await axios.post(`${API_BASE}${endpoint}`, payload);
      if (res.data.success) {
        localStorage.setItem('token', res.data.token);
        localStorage.setItem('user', JSON.stringify(res.data.user));
        setToken(res.data.token);
        setUser(res.data.user);
      }
    } catch (err) {
      setAuthError(err.response?.data?.error || "Authentication failed.");
    }
  };

  const logout = () => {
    localStorage.clear();
    setToken('');
    setUser({});
    setReports([]);
    setSelectedPatientId('');
    setActiveAnalysis('');
  };

  const fetchGrantedDoctors = async () => {
    try {
      const res = await axios.get(`${API_BASE}/access/my-doctors`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setGrantedDoctors(res.data.granted || []);
    } catch (err) {}
  };

  const handleGrantAccess = async (e) => {
    e.preventDefault();
    try {
      const res = await axios.post(`${API_BASE}/access/grant`, 
        { doctorCustomId: grantDoctorId },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setGrantDoctorId('');
      fetchGrantedDoctors();
    } catch (err) {
      alert(err.response?.data?.error || "Grant access failed.");
    }
  };

  const handleRevokeAccess = async (docId) => {
    if (!window.confirm(`Are you sure you want to revoke access for Doctor ID: ${docId}?`)) return;
    try {
      const res = await axios.post(`${API_BASE}/access/revoke`, 
        { doctorCustomId: docId },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      alert(res.data.message);
      fetchGrantedDoctors();
    } catch (err) {
      alert(err.response?.data?.error || "Revoke access failed.");
    }
  };

  const fetchPermittedPatients = async () => {
    try {
      const res = await axios.get(`${API_BASE}/doctor/permitted-patients`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setPermittedPatients(res.data.patients || []);
    } catch (err) {}
  };

  const fetchReports = async () => {
    try {
      const url = user.role === 'doctor' 
        ? `${API_BASE}/reports/history?patientId=${selectedPatientId}` 
        : `${API_BASE}/reports/history`;

      const res = await axios.get(url, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setReports(res.data.history || []);
    } catch (err) {
      setReports([]);
    }
  };

  const handleFileUpload = async (e) => {
    e.preventDefault();
    if (!file) return alert("Select a PDF document.");

    setUploading(true);
    const formData = new FormData();
    formData.append('report', file);
    
    if (user.role === 'doctor') {
      if (!selectedPatientId) {
        setUploading(false);
        return alert("Select a patient first.");
      }
      formData.append('targetPatientId', selectedPatientId);
    }

    try {
      const res = await axios.post(`${API_BASE}/reports/upload-pdf`, formData, {
        headers: { 
          Authorization: `Bearer ${token}`,
          'Content-Type': 'multipart/form-data'
        }
      });
      setActiveAnalysis(res.data.analysis);
      setActiveReportId(res.data.record?.id);
      setFile(null);
      fetchReports();
    } catch (err) {
      alert(err.response?.data?.error || "Upload failed.");
    } finally {
      setUploading(false);
    }
  };

  if (!token) {
    return (
      <div className="auth-wrapper">
        <div className="auth-hero">
          <div className="hero-badge">🧬 MedGenesis Health AI Platform</div>
          <h1>Intelligent Clinical Insights & Data Network</h1>
          <p>Seamless, HIPAA-compliant document parsing, specialist permissions, and plain-language medical report translation.</p>
        </div>

        <div className="auth-card-container slide-up">
          <div className="tab-pill">
            <button className={role === 'patient' ? 'active' : ''} onClick={() => handleTabSwitch('patient')}>Patient Login</button>
            <button className={role === 'doctor' ? 'active' : ''} onClick={() => handleTabSwitch('doctor')}>Doctor Login</button>
          </div>

          <form onSubmit={handleAuth} className="modern-form">
            <h2>{isRegister ? 'Create Account' : 'Portal Sign In'}</h2>
            <span className="sub-title">Role: <strong>{role.toUpperCase()}</strong></span>
            
            {authError && <div className="error-badge pop-in">{authError}</div>}

            {role === 'doctor' && isRegister && (
              <div className="input-group">
                <label>Doctor Full Name</label>
                <input 
                  type="text" 
                  placeholder="e.g. Dr. Sarah Jenkins" 
                  value={name} 
                  onChange={e => setName(e.target.value)} 
                  required 
                />
              </div>
            )}

            <div className="input-group">
              <label>{role === 'patient' ? 'Patient ID' : 'Doctor ID'}</label>
              <input 
                type="text" 
                placeholder={role === 'patient' ? "e.g. 1000" : "e.g. DOC-1"} 
                value={customId} 
                onChange={e => setCustomId(e.target.value)} 
                required 
              />
            </div>

            <div className="input-group">
              <label>Password</label>
              <input 
                type="password" 
                placeholder="••••••••" 
                value={password} 
                onChange={e => setPassword(e.target.value)} 
                required 
              />
            </div>

            <button type="submit" className="btn-primary glow-btn">
              {isRegister ? 'Register Account' : 'Sign In To Dashboard'}
            </button>
            
            <div className="auth-toggle" onClick={() => { setIsRegister(!isRegister); setAuthError(''); }}>
              {isRegister ? 'Already registered? Sign In' : "Don't have an account? Register"}
            </div>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="app-layout">
      {/* SIDEBAR NAVIGATION */}
      <aside className="sidebar">
        <div className="brand">
          <div className="logo-icon">🩺</div>
          <h2>MedGenesis</h2>
        </div>

        <div className="user-profile-badge">
          <div className="avatar">{user.role === 'doctor' ? 'Dr' : 'Pt'}</div>
          <div className="profile-info">
            <span className="profile-name">{user.role === 'doctor' ? `Dr. ${user.name}` : `Patient #${user.customId}`}</span>
            <span className="profile-role">{user.role.toUpperCase()}</span>
          </div>
        </div>

        <nav className="nav-menu">
          <div className="nav-item active">📊 Overview & Reports</div>
          <div className="nav-item">🔒 Security & Permissions</div>
        </nav>

        <button onClick={logout} className="logout-btn">
          <span>🚪</span> Sign Out
        </button>
      </aside>

      {/* MAIN CONTENT AREA */}
      <main className="main-content">
        <header className="top-header">
          <div>
            <h1>Clinical Intelligence Dashboard</h1>
            <p className="subtext">Real-time medical document ingestion and permission matrix.</p>
          </div>
        </header>

        {/* METRICS ROW */}
        <section className="metrics-grid fade-in">
          <div className="metric-card">
            <span className="metric-title">Available Documents</span>
            <span className="metric-value">{reports.length}</span>
            <span className="metric-sub">PDFs ingested</span>
          </div>

          <div className="metric-card">
            <span className="metric-title">{user.role === 'patient' ? 'Permitted Doctors' : 'Accessible Patients'}</span>
            <span className="metric-value">
              {user.role === 'patient' ? grantedDoctors.length : permittedPatients.length}
            </span>
            <span className="metric-sub">Active permissions</span>
          </div>

          <div className="metric-card highlight">
            <span className="metric-title">AI RAG Status</span>
            <span className="metric-value online">● Active</span>
            <span className="metric-sub">Plain-English Translator</span>
          </div>
        </section>

        <div className="dashboard-grid">
          {/* PATIENT PERMISSION MANAGEMENT */}
          {user.role === 'patient' && (
            <section className="glass-card slide-up">
              <div className="card-header">
                <h3>🔐 Specialist Access Permissions</h3>
              </div>
              <form onSubmit={handleGrantAccess} className="inline-form">
                <input 
                  type="text" 
                  placeholder="Enter Doctor ID (e.g. DOC-1)" 
                  value={grantDoctorId} 
                  onChange={e => setGrantDoctorId(e.target.value)} 
                  required 
                />
                <button type="submit" className="btn-primary">Grant Access</button>
              </form>

              <h4>Doctors with Active Access:</h4>
              <div className="permissions-list">
                {grantedDoctors.map((doc, idx) => (
                  <div key={idx} className="permission-chip pop-in">
                    <div className="doc-info">
                      <strong>Dr. {doc.doctorName}</strong>
                      <small>ID: {doc.doctorId} • Granted: {doc.grantedAt}</small>
                    </div>
                    <button 
                      onClick={() => handleRevokeAccess(doc.doctorId)} 
                      className="btn-revoke" 
                      title="Stop access for this doctor"
                    >
                      Revoke
                    </button>
                  </div>
                ))}
                {grantedDoctors.length === 0 && <p className="muted-text">No doctors currently have access to your reports.</p>}
              </div>
            </section>
          )}

          {/* DOCTOR PATIENT SELECTOR */}
          {user.role === 'doctor' && (
            <section className="glass-card slide-up">
              <div className="card-header">
                <h3>📋 Select Patient Record</h3>
              </div>
              <select 
                className="modern-select"
                value={selectedPatientId} 
                onChange={e => {
                  setSelectedPatientId(e.target.value);
                  setActiveAnalysis('');
                  setActiveReportId(null);
                }}
              >
                <option value="">-- Choose Authorized Patient --</option>
                {permittedPatients.map((p, idx) => (
                  <option key={idx} value={p.customId}>{p.name} (Patient ID: {p.customId})</option>
                ))}
              </select>
              {permittedPatients.length === 0 && <p className="muted-text">No patients have granted access to your Doctor ID yet.</p>}
            </section>
          )}

          {/* DOCUMENT UPLOAD SECTION */}
          {(user.role === 'patient' || (user.role === 'doctor' && selectedPatientId)) && (
            <section className="glass-card slide-up">
              <div className="card-header">
                <h3>📤 Ingest New Medical PDF</h3>
              </div>
              <form onSubmit={handleFileUpload} className="file-drop-zone">
                <div className="drop-icon">📄</div>
                <input type="file" accept=".pdf" onChange={e => setFile(e.target.files[0])} required />
                <p>{file ? file.name : "Click or drag medical PDF report here"}</p>
                <button type="submit" className="btn-primary glow-btn" disabled={uploading}>
                  {uploading ? 'Parsing & Summarizing...' : 'Upload & Process Report'}
                </button>
              </form>
            </section>
          )}
        </div>

        {/* ANALYSIS & HISTORY SECTION */}
        {(user.role === 'patient' || (user.role === 'doctor' && selectedPatientId)) && (
          <div className="dashboard-grid full-width-grid">
            {/* AI SUMMARY CARD */}
            {activeAnalysis && (
              <section className="glass-card analysis-card pop-in">
                <div className="card-header">
                  <h3>⚡ Plain-English Clinical Summary</h3>
                </div>
                <div className="markdown-content">
                  {activeAnalysis}
                </div>
              </section>
            )}

            {/* DOCUMENT HISTORY TABLE */}
            <section className="glass-card slide-up">
              <div className="card-header">
                <h3>📜 Document History Log</h3>
              </div>
              <div className="history-table">
                {reports.map((rep) => (
                  <div 
                    key={rep.id} 
                    className={`history-row ${activeReportId === rep.id ? 'selected' : ''}`}
                    onClick={() => {
                      setActiveAnalysis(rep.analysis);
                      setActiveReportId(rep.id);
                    }}
                  >
                    <div className="doc-icon">📑</div>
                    <div className="doc-details">
                      <strong>{rep.filename}</strong>
                      <small>Uploaded by: {rep.uploadedBy} on {rep.timestamp}</small>
                    </div>
                    <span className="view-link">View Translation →</span>
                  </div>
                ))}
                {reports.length === 0 && <p className="muted-text">No medical reports found.</p>}
              </div>
            </section>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;