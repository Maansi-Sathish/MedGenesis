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
    try {
      const res = await fetch('http://127.0.0.1:5000/api/reports/upload-pdf', {
        method: 'POST', headers: { 'Authorization': `Bearer ${token}` }, body: formData
      });
      const data = await res.json();
      if (data.success) { 
        setActiveOutput(data.record.analysis); 
        fetchHistory(); 
      } else setError(data.error);
    } catch { setError('PDF parsing stream error.'); } finally { setLoading(false); }
  };

  const handleImageUpload = async (e) => {
    e.preventDefault(); if (!selectedXray) return alert('Attach matrix scan view file.');
    setLoading(true); setError(''); setActiveOutput('');
    const formData = new FormData(); formData.append('xray', selectedXray);
    try {
      const res = await fetch('http://127.0.0.1:5000/api/reports/upload-xray', {
        method: 'POST', headers: { 'Authorization': `Bearer ${token}` }, body: formData
      });
      const data = await res.json();
      if (data.success) { 
        setActiveOutput(data.record.analysis); 
        fetchHistory(); 
      } else setError(data.error);
    } catch { setError('Vision inference cluster dropped requests.'); } finally { setLoading(false); }
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
      <div style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e3a8a 100%)', height: '100vh', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', color: '#fff', fontFamily: 'Segoe UI, sans-serif' }}>
        <h1 style={{ fontSize: '56px', margin: 0, color: '#38bdf8' }}>MedGenesis</h1>
        <p style={{ fontSize: '18px', color: '#cbd5e1', marginBottom: '30px' }}>Secure Grounded RAG Multi-Dataset Diagnostic Framework</p>
        <button onClick={() => setViewState('auth')} style={{ padding: '14px 35px', background: '#38bdf8', color: '#0f172a', border: 'none', borderRadius: '25px', cursor: 'pointer', fontWeight: 'bold', fontSize: '16px' }}>Access Dashboard Workspace</button>
      </div>
    );
  }

  if (viewState === 'auth') {
    return (
      <div style={{ background: '#f1f5f9', height: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center', fontFamily: 'Segoe UI, sans-serif' }}>
        <form onSubmit={handleAuth} style={{ background: '#fff', padding: '40px', borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', width: '360px' }}>
          <h2 style={{ color: '#1e3a8a', marginTop: 0 }}>{authMode === 'login' ? 'Sign In' : 'Create Access Account'}</h2>
          {error && <div style={{ color: '#b91c1c', fontSize: '14px', marginBottom: '15px', backgroundColor: '#fef2f2', padding: '8px', borderRadius: '4px' }}>{error}</div>}
          
          {authMode === 'register' && (
            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', marginBottom: '5px' }}>Full Name</label>
              <input type="text" style={{ width: '100%', padding: '10px', boxSizing: 'border-box', border: '1px solid #cbd5e1', borderRadius: '4px' }} value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
          )}
          <div style={{ marginBottom: '15px' }}>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', marginBottom: '5px' }}>Email Address</label>
            <input type="email" placeholder="name@domain.com" style={{ width: '100%', padding: '10px', boxSizing: 'border-box', border: '1px solid #cbd5e1', borderRadius: '4px' }} value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', marginBottom: '5px' }}>Security Password</label>
            <input type="password" style={{ width: '100%', padding: '10px', boxSizing: 'border-box', border: '1px solid #cbd5e1', borderRadius: '4px' }} value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
          
          <button type="submit" disabled={loading} style={{ width: '100%', padding: '12px', background: '#1e3a8a', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', fontSize: '15px' }}>
            {loading ? 'Processing network requests...' : authMode === 'login' ? 'Authenticate Login' : 'Register Profile'}
          </button>
          
          <p style={{ fontSize: '13px', textAlign: 'center', marginTop: '20px', color: '#64748b' }}>
            {authMode === 'login' ? "New workspace clinician?" : "Already registered?"} &nbsp;
            <span style={{ color: '#3b82f6', cursor: 'pointer', fontWeight: 'bold' }} onClick={() => { setAuthMode(authMode === 'login' ? 'register' : 'login'); setError(''); }}>
              {authMode === 'login' ? 'Create Account' : 'Log In'}
            </span>
          </p>
        </form>
      </div>
    );
  }

  return (
    <div style={{ fontFamily: 'Segoe UI, sans-serif', maxWidth: '1100px', margin: '30px auto', padding: '0 20px' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid #cbd5e1', paddingBottom: '15px', marginBottom: '20px' }}>
        <div>
          <h2 style={{ color: '#1e3a8a', margin: 0 }}>MedGenesis Workspace Node</h2>
          <span style={{ fontSize: '13px', color: '#10b981', fontWeight: 'bold' }}>● Active Clinician Profile Connected</span>
        </div>
        <button onClick={logout} style={{ padding: '8px 16px', background: '#ef4444', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>Sign Out</button>
      </header>

      <nav style={{ display: 'flex', gap: '10px', borderBottom: '2px solid #e2e8f0', marginBottom: '25px' }}>
        <button onClick={() => { setActiveTab('pdf'); setActiveOutput(''); }} style={{ padding: '12px 24px', background: activeTab === 'pdf' ? '#1e3a8a' : 'transparent', color: activeTab === 'pdf' ? '#fff' : '#475569', border: 'none', cursor: 'pointer', fontWeight: 'bold' }}>📄 PDF Labs Extractor</button>
        <button onClick={() => { setActiveTab('xray'); setActiveOutput(''); }} style={{ padding: '12px 24px', background: activeTab === 'xray' ? '#1e3a8a' : 'transparent', color: activeTab === 'xray' ? '#fff' : '#475569', border: 'none', cursor: 'pointer', fontWeight: 'bold' }}>🩻 Chest X-Ray Vision</button>
        <button onClick={() => { setActiveTab('trends'); setActiveOutput(''); fetchHistory(); }} style={{ padding: '12px 24px', background: activeTab === 'trends' ? '#1e3a8a' : 'transparent', color: activeTab === 'trends' ? '#fff' : '#475569', border: 'none', cursor: 'pointer', fontWeight: 'bold' }}>📊 Trend Analytics</button>
        <button onClick={() => { setActiveTab('history'); setActiveOutput(''); fetchHistory(); }} style={{ padding: '12px 24px', background: activeTab === 'history' ? '#1e3a8a' : 'transparent', color: activeTab === 'history' ? '#fff' : '#475569', border: 'none', cursor: 'pointer', fontWeight: 'bold' }}>📜 Historical Database</button>
      </nav>

      {error && <div style={{ background: '#fef2f2', color: '#991b1b', padding: '12px', marginBottom: '20px', borderRadius: '4px', borderLeft: '4px solid #ef4444' }}>{error}</div>}

      <main style={{ background: '#f8fafc', padding: '25px', borderRadius: '8px', border: '1px solid #e2e8f0', minHeight: '300px' }}>
        {activeTab === 'pdf' && (
          <div>
            <h3>Segment 1: Parse and Analyze PDF Reports</h3>
            <p style={{ fontSize: '14px', color: '#64748b' }}>Extract text metrics from uploaded PDFs and run grounded RAG analysis.</p>
            <form onSubmit={handlePdfUpload} style={{ marginTop: '20px' }}>
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
            <p style={{ fontSize: '14px', color: '#64748b' }}>Forward scans to the vision model, make predictions, and review context matches.</p>
            <form onSubmit={handleImageUpload} style={{ marginTop: '20px' }}>
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
            <p style={{ fontSize: '14px', color: '#64748b' }}>Select files below from your historical records database pool to map structural progression changes.</p>
            
            {historyLog.length < 2 ? (
              <div style={{ background: '#fffbeb', borderLeft: '4px solid #d97706', padding: '15px', marginTop: '20px', color: '#92400e', borderRadius: '4px' }}>
                ⚠️ <strong>Insufficient Datasets:</strong> Please go upload at least two files (PDFs or Scans) in the tabs above so the analyzer engine can cross-reference records.
              </div>
            ) : (
              <form onSubmit={handleCompareAnalysis} style={{ marginTop: '20px' }}>
                <div style={{ display: 'flex', gap: '20px', marginBottom: '20px' }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: 'block', fontWeight: 'bold', fontSize: '13px', marginBottom: '8px', color: '#475569' }}>Select Past Baseline Report:</label>
                    <select 
                      style={{ width: '100%', padding: '10px', borderRadius: '4px', border: '1px solid #cbd5e1', background: '#fff' }} 
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
                    <label style={{ display: 'block', fontWeight: 'bold', fontSize: '13px', marginBottom: '8px', color: '#475569' }}>Select Current Evaluation Report:</label>
                    <select 
                      style={{ width: '100%', padding: '10px', borderRadius: '4px', border: '1px solid #cbd5e1', background: '#fff' }} 
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
            <p style={{ fontSize: '14px', color: '#64748b', marginBottom: '20px' }}>Historical ledger of generated analyses linked directly to your active profile.</p>
            {historyLog.length === 0 ? <p style={{ fontStyle: 'italic', color: '#64748b' }}>No data records registered to this account yet.</p> : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                {historyLog.map((item) => (
                  <div key={item.id} style={{ border: '1px solid #cbd5e1', padding: '15px', background: '#fff', borderRadius: '6px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#64748b', marginBottom: '8px' }}>
                      <span style={{ fontWeight: 'bold', color: '#1e3a8a' }}>{item.type} (ID: {item.id})</span>
                      <span>{item.timestamp}</span>
                    </div>
                    <div style={{ fontSize: '13px', background: '#f1f5f9', padding: '8px', borderRadius: '4px', marginBottom: '10px', color: '#475569' }}><strong>Raw Data Extract:</strong> {item.rawText || item.input}</div>
                    <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', margin: 0, fontSize: '14px', color: '#334155', lineHeight: '1.5' }}>{item.analysis}</pre>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeOutput && (
          <div style={{ marginTop: '25px', backgroundColor: '#fff', border: '1px solid #e2e8f0', borderLeft: '5px solid #1e3a8a', padding: '20px', borderRadius: '6px' }}>
            <h4 style={{ margin: '0 0 10px 0', color: '#1e3a8a', fontSize: '16px' }}>Active Execution Analysis Engine Output</h4>
            <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', fontSize: '14px', lineHeight: '1.6', color: '#334155' }}>{activeOutput}</pre>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;