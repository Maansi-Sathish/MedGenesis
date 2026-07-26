import React, { useState, useEffect } from 'react';

function App() {
  const [viewState, setViewState] = useState('welcome'); 
  const [authMode, setAuthMode] = useState('login'); 
  const [activeTab, setActiveTab] = useState('pdf'); 
  
  // Auth Form Fields
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [token, setToken] = useState(localStorage.getItem('token') || '');

  // Operation File Selectors
  const [selectedPdf, setSelectedPdf] = useState(null);
  const [selectedXray, setSelectedXray] = useState(null);
  const [patientId, setPatientId] = useState('');
  
  // Trend Automation Dropdown State Hooks
  const [pastReportId, setPastReportId] = useState('');
  const [presentReportId, setPresentReportId] = useState('');
  
  const [historyLog, setHistoryLog] = useState([]);
  const [activeOutput, setActiveOutput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (token) {
      setViewState('dashboard');
      fetchHistory();
    }
  }, [token]);

  const handleAuth = async (e) => {
    e.preventDefault(); 
    setError(''); 
    setLoading(true);
    
    const endpoint = authMode === 'login' ? 'login' : 'register';
    const bodyPayload = authMode === 'login' ? { email, password } : { name, email, password };

    try {
      const res = await fetch(`http://127.0.0.1:5000/api/auth/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyPayload)
      });
      
      const data = await res.json();
      
      if (data.success && data.token) {
        localStorage.setItem('token', data.token);
        setToken(data.token);
        setViewState('dashboard');
        setName(''); setPassword('');
      } else { 
        setError(data.error || "Authentication handshake failed."); 
      }
    } catch (err) { 
      setError('Connection refused: Make sure your node server.js backend is running on port 5000.'); 
    } finally { 
      setLoading(false); 
    }
  };

  const logout = () => {
    localStorage.removeItem('token'); 
    setToken(''); 
    setHistoryLog([]);
    setActiveOutput('');
    setViewState('welcome');
  };

  const fetchHistory = async () => {
    if (!token) return;
    try {
      const res = await fetch('http://127.0.0.1:5000/api/reports/history', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) setHistoryLog(data.history);
    } catch { console.error("Could not compile historical dataset record vectors."); }
  };

  const handlePdfUpload = async (e) => {
    e.preventDefault(); if (!selectedPdf) return alert('Attach document path (.pdf).');
    setLoading(true); setError(''); setActiveOutput('');
    const formData = new FormData(); formData.append('report', selectedPdf); 
    if (patientId.trim()) formData.append('patientId', patientId.trim());
    try {
      const res = await fetch('http://127.0.0.1:5000/api/reports/upload-pdf', {
        method: 'POST', headers: { 'Authorization': `Bearer ${token}` }, body: formData
      });
      const text = await res.text();
      const data = text ? JSON.parse(text) : null;
      if (!res.ok) {
        setError(data?.error || `PDF upload failed with status ${res.status}`);
      } else if (data?.success) {
        setActiveOutput(data.record.analysis);
        fetchHistory();
      } else {
        setError(data?.error || 'PDF upload failed.');
      }
    } catch (err) {
      setError(err?.message ? `PDF upload error: ${err.message}` : 'PDF parsing stream error.');
    } finally { setLoading(false); }
  };

  const handleImageUpload = async (e) => {
    e.preventDefault(); if (!selectedXray) return alert('Attach matrix scan view file.');
    setLoading(true); setError(''); setActiveOutput('');
    const formData = new FormData(); formData.append('xray', selectedXray);
    if (patientId.trim()) formData.append('patientId', patientId.trim());
    try {
      const res = await fetch('http://127.0.0.1:5000/api/reports/upload-xray', {
        method: 'POST', headers: { 'Authorization': `Bearer ${token}` }, body: formData
      });
      const data = await res.json();
      if (data.success) { 
        setActiveOutput(data.record.analysis); 
        fetchHistory(); 
      } else {
        setError(data.error || 'Image upload failed.');
      }
    } catch (err) {
      setError(err?.message ? `Image upload error: ${err.message}` : 'Vision inference cluster dropped requests.');
    } finally { setLoading(false); }
  };

  const handleCompareAnalysis = async (e) => {
    e.preventDefault(); 
    if (!pastReportId || !presentReportId) {
      return alert('Please select both a historical baseline and a recent dataset to compare.');
    }
    
    setLoading(true); setError(''); setActiveOutput('');
    try {
      const res = await fetch('http://127.0.0.1:5000/api/reports/compare-auto', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ pastReportId, presentReportId })
      });
      const data = await res.json();
      if (data.success) setActiveOutput(data.analysis); else setError(data.error);
    } catch { setError('Analytics engine automated comparison processing timeout.'); } finally { setLoading(false); }
  };

  if (viewState === 'welcome') {
    return (
      <div style={{ background: 'linear-gradient(135deg, #08295a 0%, #0d3b84 100%)', height: '100vh', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', color: '#f8fafc', fontFamily: 'Segoe UI, sans-serif' }}>
        <h1 style={{ fontSize: '56px', margin: 0, color: '#7dd3fc' }}>MedGenesis</h1>
        <p style={{ fontSize: '18px', color: '#dbeafe', marginBottom: '30px' }}>Secure Grounded RAG Multi-Dataset Diagnostic Framework</p>
        <button onClick={() => setViewState('auth')} style={{ padding: '14px 35px', background: '#3b82f6', color: '#ffffff', border: 'none', borderRadius: '25px', cursor: 'pointer', fontWeight: 'bold', fontSize: '16px' }}>Access Dashboard Workspace</button>
      </div>
    );
  }

  if (viewState === 'auth') {
    return (
      <div style={{ background: '#0a1d3f', height: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center', fontFamily: 'Segoe UI, sans-serif' }}>
        <form onSubmit={handleAuth} style={{ background: '#112d5c', padding: '40px', borderRadius: '8px', boxShadow: '0 4px 16px rgba(0,0,0,0.25)', width: '360px' }}>
          <h2 style={{ color: '#e0f2fe', marginTop: 0 }}>{authMode === 'login' ? 'Sign In' : 'Create Access Account'}</h2>
          {error && <div style={{ color: '#fee2e2', fontSize: '14px', marginBottom: '15px', backgroundColor: '#581c1c', padding: '8px', borderRadius: '4px' }}>{error}</div>}
          
          {authMode === 'register' && (
            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', marginBottom: '5px', color: '#e2e8f0' }}>Full Name</label>
              <input type="text" style={{ width: '100%', padding: '10px', boxSizing: 'border-box', border: '1px solid #2563eb', borderRadius: '4px', background: '#0c2e64', color: '#f8fafc' }} value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
          )}
          <div style={{ marginBottom: '15px' }}>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', marginBottom: '5px', color: '#e2e8f0' }}>Email Address</label>
            <input type="email" placeholder="name@domain.com" style={{ width: '100%', padding: '10px', boxSizing: 'border-box', border: '1px solid #2563eb', borderRadius: '4px', background: '#0c2e64', color: '#f8fafc' }} value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', marginBottom: '5px', color: '#e2e8f0' }}>Security Password</label>
            <input type="password" style={{ width: '100%', padding: '10px', boxSizing: 'border-box', border: '1px solid #2563eb', borderRadius: '4px', background: '#0c2e64', color: '#f8fafc' }} value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
          
          <button type="submit" disabled={loading} style={{ width: '100%', padding: '12px', background: '#1e3a8a', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', fontSize: '15px' }}>
            {loading ? 'Processing network requests...' : authMode === 'login' ? 'Authenticate Login' : 'Register Profile'}
          </button>
          
          <p style={{ fontSize: '13px', textAlign: 'center', marginTop: '20px', color: '#c7d2fe' }}>
            {authMode === 'login' ? "New workspace clinician?" : "Already registered?"} &nbsp;
            <span style={{ color: '#7dd3fc', cursor: 'pointer', fontWeight: 'bold' }} onClick={() => { setAuthMode(authMode === 'login' ? 'register' : 'login'); setError(''); }}>
              {authMode === 'login' ? 'Create Account' : 'Log In'}
            </span>
          </p>
        </form>
      </div>
    );
  }

  return (
    <div style={{ fontFamily: 'Segoe UI, sans-serif', width: '100%', minHeight: '100vh', margin: 0, padding: '30px 20px', background: '#071736', color: '#f8fafc', boxSizing: 'border-box' }}>
      <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid #3b82f6', paddingBottom: '15px', marginBottom: '20px' }}>
          <div>
            <h2 style={{ color: '#ffffff', margin: 0 }}>MedGenesis Workspace Node</h2>
            <span style={{ fontSize: '13px', color: '#c7d2fe', fontWeight: 'bold' }}>● Active Clinician Profile Connected</span>
          </div>
        <button onClick={logout} style={{ padding: '8px 16px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>Sign Out</button>
      </header>

      <nav style={{ display: 'flex', gap: '10px', borderBottom: '2px solid #3b82f6', marginBottom: '25px' }}>
        <button onClick={() => { setActiveTab('pdf'); setActiveOutput(''); }} style={{ padding: '12px 24px', background: activeTab === 'pdf' ? '#1e3a8a' : 'transparent', color: activeTab === 'pdf' ? '#fff' : '#c7d2fe', border: 'none', cursor: 'pointer', fontWeight: 'bold' }}>📄 PDF Labs Extractor</button>
        <button onClick={() => { setActiveTab('xray'); setActiveOutput(''); }} style={{ padding: '12px 24px', background: activeTab === 'xray' ? '#1e3a8a' : 'transparent', color: activeTab === 'xray' ? '#fff' : '#c7d2fe', border: 'none', cursor: 'pointer', fontWeight: 'bold' }}>🩻 Chest X-Ray Vision</button>
        <button onClick={() => { setActiveTab('trends'); setActiveOutput(''); fetchHistory(); }} style={{ padding: '12px 24px', background: activeTab === 'trends' ? '#1e3a8a' : 'transparent', color: activeTab === 'trends' ? '#fff' : '#c7d2fe', border: 'none', cursor: 'pointer', fontWeight: 'bold' }}>📊 Trend Analytics</button>
        <button onClick={() => { setActiveTab('history'); setActiveOutput(''); fetchHistory(); }} style={{ padding: '12px 24px', background: activeTab === 'history' ? '#1e3a8a' : 'transparent', color: activeTab === 'history' ? '#fff' : '#c7d2fe', border: 'none', cursor: 'pointer', fontWeight: 'bold' }}>📜 Historical Database</button>
      </nav>

      {error && <div style={{ background: '#7f1d1d', color: '#f8fafc', padding: '12px', marginBottom: '20px', borderRadius: '4px', borderLeft: '4px solid #f87171' }}>{error}</div>}

      <main style={{ background: '#0c2d64', padding: '25px', borderRadius: '12px', border: '1px solid #2563eb', minHeight: '300px' }}>
        {activeTab === 'pdf' && (
          <div>
            <h3>Segment 1: Parse and Analyze PDF Reports</h3>
            <p style={{ fontSize: '14px', color: '#dbeafe' }}>Extract text metrics from uploaded PDFs and run grounded RAG analysis.</p>
            <form onSubmit={handlePdfUpload} style={{ marginTop: '20px' }}>
              <label style={{ display: 'block', fontWeight: 'bold', fontSize: '13px', marginBottom: '8px', color: '#c7d2fe' }}>Patient ID (optional)</label>
              <input type="text" placeholder="e.g. P-1001" value={patientId} onChange={(e) => setPatientId(e.target.value)} style={{ width: '240px', padding: '10px', borderRadius: '4px', border: '1px solid #3b82f6', marginBottom: '12px', background: '#0c2e64', color: '#f8fafc' }} />
              <input type="file" accept=".pdf" onChange={(e) => setSelectedPdf(e.target.files[0])} />
              <button type="submit" disabled={loading} style={{ display: 'block', marginTop: '15px', padding: '10px 20px', background: '#1e3a8a', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>
                {loading ? 'Parsing Document Fields...' : 'Execute PDF RAG Processing'}
              </button>
            </form>
          </div>
        )}

        {activeTab === 'xray' && (
          <div>
            <h3>Segment 2: Radiology Image Processing Node [CNN]</h3>
            <p style={{ fontSize: '14px', color: '#dbeafe' }}>Forward scans to the vision model, make predictions, and review context matches.</p>
            <form onSubmit={handleImageUpload} style={{ marginTop: '20px' }}>
              <label style={{ display: 'block', fontWeight: 'bold', fontSize: '13px', marginBottom: '8px', color: '#c7d2fe' }}>Patient ID (optional)</label>
              <input type="text" placeholder="e.g. P-1001" value={patientId} onChange={(e) => setPatientId(e.target.value)} style={{ width: '240px', padding: '10px', borderRadius: '4px', border: '1px solid #3b82f6', marginBottom: '12px', background: '#0c2e64', color: '#f8fafc' }} />
              <input type="file" accept="image/*" onChange={(e) => setSelectedXray(e.target.files[0])} />
              <button type="submit" disabled={loading} style={{ display: 'block', marginTop: '15px', padding: '10px 20px', background: '#10b981', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>
                {loading ? 'Computing vision properties...' : 'Submit to Vision System'}
              </button>
            </form>
          </div>
        )}

        {activeTab === 'trends' && (
          <div>
            <h3>Segment 3: Automated Longitudinal Trend Tracker</h3>
            <p style={{ fontSize: '14px', color: '#dbeafe' }}>Select files below from your historical records database pool to map structural progression changes.</p>
            
            {historyLog.length < 2 ? (
              <div style={{ background: '#fffbeb', borderLeft: '4px solid #d97706', padding: '15px', marginTop: '20px', color: '#92400e', borderRadius: '4px' }}>
                ⚠️ <strong>Insufficient Datasets:</strong> Please go upload at least two files (PDFs or Scans) in the tabs above so the analyzer engine can cross-reference records.
              </div>
            ) : (
              <form onSubmit={handleCompareAnalysis} style={{ marginTop: '20px' }}>
                <div style={{ display: 'flex', gap: '20px', marginBottom: '20px' }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: 'block', fontWeight: 'bold', fontSize: '13px', marginBottom: '8px', color: '#c7d2fe' }}>Select Past Baseline Report:</label>
                    <select 
                      style={{ width: '100%', padding: '10px', borderRadius: '4px', border: '1px solid #3b82f6', background: '#0c2466', color: '#f8fafc' }} 
                      value={pastReportId} 
                      onChange={(e) => setPastReportId(e.target.value)}
                      required
                    >
                      <option value="">-- Choose Historical Metric --</option>
                      {historyLog.map(item => (
                        <option key={item.id} value={item.id}>[{item.timestamp}] {item.type} - {item.input.substring(0, 40)}...</option>
                      ))}
                    </select>
                  </div>
                  
                  <div style={{ flex: 1 }}>
                    <label style={{ display: 'block', fontWeight: 'bold', fontSize: '13px', marginBottom: '8px', color: '#c7d2fe' }}>Select Current Evaluation Report:</label>
                    <select 
                      style={{ width: '100%', padding: '10px', borderRadius: '4px', border: '1px solid #3b82f6', background: '#0c2466', color: '#f8fafc' }} 
                      value={presentReportId} 
                      onChange={(e) => setPresentReportId(e.target.value)}
                      required
                    >
                      <option value="">-- Choose Current Metric --</option>
                      {historyLog.map(item => (
                        <option key={item.id} value={item.id}>[{item.timestamp}] {item.type} - {item.input.substring(0, 40)}...</option>
                      ))}
                    </select>
                  </div>
                </div>
                
                <button type="submit" disabled={loading} style={{ padding: '12px 24px', background: '#7c3aed', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', fontSize: '14px' }}>
                  {loading ? 'Cross-linking records and computing delta matrix...' : 'Compute Comparative Delta Analysis'}
                </button>
              </form>
            )}
          </div>
        )}

        {activeTab === 'history' && (
          <div>
            <h3>Segment 4: Personal Patient Historical Database</h3>
            <p style={{ fontSize: '14px', color: '#dbeafe', marginBottom: '20px' }}>Historical ledger of generated analyses linked directly to your active profile.</p>
            {historyLog.length === 0 ? <p style={{ fontStyle: 'italic', color: '#c7d2fe' }}>No data records registered to this account yet.</p> : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                {historyLog.map((item) => (
                  <div key={item.id} style={{ border: '1px solid #2563eb', padding: '15px', background: '#0f2f6b', borderRadius: '6px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#a5b4fc', marginBottom: '8px' }}>
                      <span style={{ fontWeight: 'bold', color: '#dbeafe' }}>{item.type} (ID: {item.id})</span>
                      <span>{item.timestamp}</span>
                    </div>
                    <div style={{ fontSize: '13px', background: '#112d5c', padding: '8px', borderRadius: '4px', marginBottom: '10px', color: '#dbeafe' }}>
                      <strong>Patient ID:</strong> {item.patientId || 'Not provided'}<br />
                      <strong>Raw Data Extract:</strong> {item.rawText || item.input}
                    </div>
                    <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', margin: 0, fontSize: '14px', color: '#e0f2fe', lineHeight: '1.5' }}>{item.analysis}</pre>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeOutput && (
          <div style={{ marginTop: '25px', backgroundColor: '#0b275a', border: '1px solid #2563eb', borderLeft: '5px solid #3b82f6', padding: '20px', borderRadius: '6px' }}>
            <h4 style={{ margin: '0 0 10px 0', color: '#dbeafe', fontSize: '16px' }}>Active Execution Analysis Engine Output</h4>
            <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', fontSize: '14px', lineHeight: '1.6', color: '#eff6ff' }}>{activeOutput}</pre>
          </div>
        )}
      </main>
      </div>
    </div>
  );
}

export default App;