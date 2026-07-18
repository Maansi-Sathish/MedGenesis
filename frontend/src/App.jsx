import React, { useState } from 'react';

function App() {
  const [textInput, setTextInput] = useState('Patient glucose values of 127 mg/dL and BP of 138/88 mmHg.');
  const [selectedFile, setSelectedFile] = useState(null);
  const [textResult, setTextResult] = useState('');
  const [cnnFindings, setCnnFindings] = useState('');
  const [multimodalResult, setMultimodalResult] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleTextAnalyze = async (e) => {
    e.preventDefault();
    setLoading(true); setError(''); setTextResult(''); setCnnFindings(''); setMultimodalResult('');
    try {
      const response = await fetch('http://localhost:5000/api/reports/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ medicalTerms: textInput }),
      });
      const data = await response.json();
      if (data.success) setTextResult(data.analysis);
      else setError(data.error);
    } catch { setError('Connection failure across local text routing.'); }
    finally { setLoading(false); }
  };

  const handleImageUpload = async (e) => {
    e.preventDefault();
    if (!selectedFile) return alert('Please select an X-ray image file first.');
    setLoading(true); setError(''); setTextResult(''); setCnnFindings(''); setMultimodalResult('');

    const formData = new FormData();
    formData.append('xray', selectedFile);

    try {
      const response = await fetch('http://localhost:5000/api/reports/upload-xray', {
        method: 'POST',
        body: formData,
      });
      const data = await response.json();
      if (data.success) {
        setCnnFindings(data.cnn_findings);
        setMultimodalResult(data.rag_analysis);
      } else {
        setError(data.error);
      }
    } catch { setError('Connection failure across multimodal routing pipeline.'); }
    finally { setLoading(false); }
  };

  return (
    <div style={{ fontFamily: 'Segoe UI, sans-serif', maxWidth: '1000px', margin: '40px auto', padding: '0 20px' }}>
      <header style={{ borderBottom: '3px solid #0056b3', paddingBottom: '15px', marginBottom: '30px' }}>
        <h1 style={{ color: '#0056b3', margin: 0 }}>MedGenesis Workspace Dashboard</h1>
        <p style={{ color: '#555', margin: '5px 0' }}>Multimodal AI Framework: Local RAG Grounding Layer + CNN Classification Nodes</p>
      </header>

      {error && <div style={{ backgroundColor: '#fef2f2', color: '#991b1b', padding: '15px', borderRadius: '6px', marginBottom: '20px' }}>{error}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '30px', marginBottom: '30px' }}>
        {/* Track A: Laboratory Text Metrics */}
        <section style={{ border: '1px solid #cbd5e1', padding: '20px', borderRadius: '8px', background: '#f8fafc' }}>
          <h3 style={{ color: '#1e293b', marginTop: 0 }}>Track 1: Lab Metrics Analyzer</h3>
          <form onSubmit={handleTextAnalyze}>
            <textarea 
              style={{ width: '100%', height: '100px', padding: '10px', borderRadius: '4px', border: '1px solid #cbd5e1' }}
              value={textInput} 
              onChange={(e) => setTextInput(e.target.value)} 
            />
            <button type="submit" disabled={loading} style={{ marginTop: '10px', padding: '10px 20px', background: '#0056b3', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
              {loading ? 'Processing...' : 'Run Text Assessment'}
            </button>
          </form>
        </section>

        {/* Track B: Image Radiology Upload */}
        <section style={{ border: '1px solid #cbd5e1', padding: '20px', borderRadius: '8px', background: '#f8fafc' }}>
          <h3 style={{ color: '#1e293b', marginTop: 0 }}>Track 2: Chest X-Ray Input (CNN)</h3>
          <form onSubmit={handleImageUpload}>
            <input 
              type="file" 
              accept="image/*" 
              onChange={(e) => setSelectedFile(e.target.files[0])}
              style={{ display: 'block', marginBottom: '15px' }}
            />
            <button type="submit" disabled={loading} style={{ padding: '10px 20px', background: '#10b981', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
              {loading ? 'Evaluating Vision Pipeline...' : 'Upload & Process Scan'}
            </button>
          </form>
        </section>
      </div>

      {/* Unified Output Area */}
      {loading && <div style={{ textAlign: 'center', fontSize: '18px', padding: '20px', color: '#0056b3' }}>🔄 Execution matrix computing across service nodes...</div>}

      {textResult && (
        <div style={{ background: '#fafafa', padding: '20px', borderRadius: '6px', borderLeft: '5px solid #0056b3' }}>
          <h4>Grounded Metrics Breakdown</h4>
          <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit' }}>{textResult}</pre>
        </div>
      )}

      {multimodalResult && (
        <div style={{ background: '#fafafa', padding: '20px', borderRadius: '6px', borderLeft: '5px solid #10b981' }}>
          <div style={{ background: '#d1fae5', padding: '10px', borderRadius: '4px', marginBottom: '15px', color: '#065f46' }}>
            <strong>Neural Network (CNN) Classification Output:</strong> {cnnFindings}
          </div>
          <h4>RAG Core Context Validation Engine Analysis:</h4>
          <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit' }}>{multimodalResult}</pre>
        </div>
      )}
    </div>
  );
}

export default App;