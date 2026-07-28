import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './App.css';

const API_BASE = "http://localhost:5000/api";

function App() {
  const [token, setToken] = useState(localStorage.getItem('token') || '');
  const [user, setUser] = useState(JSON.parse(localStorage.getItem('user') || '{}'));
  
  // View State ('landing' | 'auth' | 'dashboard')
  const [currentView, setCurrentView] = useState('landing');

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

  // Upload, Analysis & Comparison State
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [reports, setReports] = useState([]);
  const [activeAnalysis, setActiveAnalysis] = useState('');
  const [activeComparison, setActiveComparison] = useState('');
  const [activeReportId, setActiveReportId] = useState(null);
  const [activeTab, setActiveTab] = useState('summary');

  useEffect(() => {
    if (token) {
      setCurrentView('dashboard');
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
        setCurrentView('dashboard');
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
    setActiveComparison('');
    setCurrentView('landing');
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
    if (!docId) return alert("Invalid Doctor ID");
    if (!window.confirm(`Revoke access for Doctor ID: ${docId}?`)) return;

    try {
      const res = await axios.post(`${API_BASE}/access/revoke`, 
        { doctorCustomId: String(docId) },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      alert(res.data.message || "Access revoked!");
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
      setActiveComparison(res.data.comparison);
      setActiveReportId(res.data.record?.id);
      setFile(null);
      fetchReports();
    } catch (err) {
      alert(err.response?.data?.error || "Upload failed.");
    } finally {
      setUploading(false);
    }
  };

  // LANDING PAGE VIEW
  if (currentView === 'landing' && !token) {
    return (
      <div className="landing-container fade-in">
        <nav className="landing-navbar">
          <div className="brand">
            <span className="logo-icon">🧬</span>
            <h2>MedGenesis</h2>
          </div>
          <div className="nav-actions">
            <button className="nav-btn" onClick={() => { setRole('patient'); setCurrentView('auth'); }}>Patient Portal</button>
            <button className="nav-btn" onClick={() => { setRole('doctor'); setCurrentView('auth'); }}>Doctor Portal</button>
            <button className="nav-btn-primary glow-btn" onClick={() => setCurrentView('auth')}>Sign In</button>
          </div>
        </nav>

        <header className="hero-section">
          <div className="hero-badge">✨ Everyday Plain-English Health AI</div>
          <h1>Understand Medical Reports & Track Trends Over Time</h1>
          <p>
            MedGenesis translates complicated lab jargon into super clear everyday words, 
            compares your new lab results against previous ones, and lets you manage doctor access seamlessly.
          </p>
          <div className="hero-cta">
            <button className="btn-hero-primary glow-btn" onClick={() => setCurrentView('auth')}>
              Get Started Free →
            </button>
            <button className="btn-hero-secondary" onClick={() => { setRole('doctor'); setCurrentView('auth'); }}>
              Doctor Portal
            </button>
          </div>
        </header>

        <section className="features-section">
          <h2>Why Patients & Doctors Love MedGenesis</h2>
          <div className="features-grid">
            <div className="feature-card">
              <div className="feature-icon">🗣️</div>
              <h3>Ultra Plain English</h3>
              <p>No confusing medical jargon or scary formulas. Explaining lab results using everyday words and analogies.</p>
            </div>

            <div className="feature-card">
              <div className="feature-icon">📊</div>
              <h3>Past vs. Present Comparator</h3>
              <p>Automatically compares new uploads against past lab reports to see if your health trends are improving.</p>
            </div>

            <div className="feature-card">
              <div className="feature-icon">🔐</div>
              <h3>1-Click Specialist Access</h3>
              <p>Patients retain 100% control over records with instant doctor permission granting and 1-click revocation.</p>
            </div>
          </div>
        </section>

        <footer className="landing-footer">
          <p>© MedGenesis Clinical Network. HIPAA-Compliant Architecture & AI Intelligence Engine.</p>
        </footer>
      </div>
    );
  }

  // AUTHENTICATION VIEW
  if (currentView === 'auth' && !token) {
    return (
      <div className="auth-wrapper fade-in">
        <div className="auth-hero">
          <button className="back-link" onClick={() => setCurrentView('landing')}>← Back to Main Website</button>
          <div className="hero-badge">🔐 MedGenesis Portal Access</div>
          <h1>Secure Account Access</h1>
          <p>Sign in to view plain-language reports, trend comparisons, and record permissions.</p>
        </div>

        <div className="auth-card-container slide-up">
          <div className="tab-pill">
            <button className={role === 'patient' ? 'active' : ''} onClick={() => handleTabSwitch('patient')}>Patient Login</button>
            <button className={role === 'doctor' ? 'active' : ''} onClick={() => handleTabSwitch('doctor')}>Doctor Login</button>
          </div>

          <form onSubmit={handleAuth} className="modern-form">
            <h2>{isRegister ? 'Create Credentials' : 'Portal Sign In'}</h2>
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

  // DASHBOARD VIEW
  return (
    <div className="app-layout fade-in">
      <aside className="sidebar">
        <div className="brand">
          <div className="logo-icon">🩺</div>
          <h2>MedGenesis</h2>
        </div>

        <div className="user-profile-badge">
          <div className="avatar">{user.role === 'doctor' ? 'Dr' : 'Pt'}</div>
          <div className="profile-info">
            <span className="profile-name">{user.role === 'doctor' ? (user.name.startsWith('Dr.') ? user.name : `Dr. ${user.name}`) : `Patient #${user.customId}`}</span>
            <span className="profile-role">{user.role.toUpperCase()}</span>
          </div>
        </div>

        <nav className="nav-menu">
          <div className="nav-item active">📊 Overview & Reports</div>
        </nav>

        <button onClick={logout} className="logout-btn">
          <span>🚪</span> Sign Out
        </button>
      </aside>

      <main className="main-content">
        <header className="top-header">
          <div>
            <h1>Clinical Intelligence Dashboard</h1>
            <p className="subtext">Real-time simple medical insights & past vs. present result comparator.</p>
          </div>
        </header>

        <section className="metrics-grid">
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
            <span className="metric-title">Comparator Status</span>
            <span className="metric-value online">● Active</span>
            <span className="metric-sub">Auto Health-Trend Tracking</span>
          </div>
        </section>

        <div className="dashboard-grid">
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
                      <strong>{doc.doctorName.startsWith('Dr.') ? doc.doctorName : `Dr. ${doc.doctorName}`}</strong>
                      <small>ID: {doc.doctorId} • Granted: {doc.grantedAt}</small>
                    </div>
                    <button 
                      onClick={() => handleRevokeAccess(doc.doctorId)} 
                      className="btn-revoke"
                    >
                      Revoke
                    </button>
                  </div>
                ))}
                {grantedDoctors.length === 0 && <p className="muted-text">No doctors currently have access to your reports.</p>}
              </div>
            </section>
          )}

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
                  setActiveComparison('');
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
                  {uploading ? 'Analyzing & Comparing Results...' : 'Upload & Generate Plain Summary'}
                </button>
              </form>
            </section>
          )}
        </div>

        {(user.role === 'patient' || (user.role === 'doctor' && selectedPatientId)) && (
          <div className="dashboard-grid full-width-grid">
            {(activeAnalysis || activeComparison) && (
              <section className="glass-card analysis-card pop-in">
                <div className="tab-pill comparison-tab-pill">
                  <button 
                    className={activeTab === 'summary' ? 'active' : ''} 
                    onClick={() => setActiveTab('summary')}
                  >
                    💡 Easy Plain-English Summary
                  </button>
                  <button 
                    className={activeTab === 'comparator' ? 'active' : ''} 
                    onClick={() => setActiveTab('comparator')}
                  >
                    📈 Past vs. Present Comparison
                  </button>
                </div>

                <div className="markdown-content">
                  {activeTab === 'summary' ? activeAnalysis : activeComparison}
                </div>
              </section>
            )}

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
                      setActiveAnalysis(rep.analysis || "No summary available.");
                      setActiveComparison(
                        rep.comparison || "📌 Baseline Report: No previous document was on file when this record was created."
                      );
                      setActiveReportId(rep.id);
                    }}
                  >
                    <div className="doc-icon">📑</div>
                    <div className="doc-details">
                      <strong>{rep.filename}</strong>
                      <small>Uploaded by: {rep.uploadedBy} on {rep.timestamp}</small>
                    </div>
                    <span className="view-link">View Analysis & Trend →</span>
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