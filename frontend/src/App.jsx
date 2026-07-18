import React, { useState } from 'react';

function App() {
  const [inputData, setInputData] = useState('glucose values of 127 and BP of 138/88');
  const [result, setResult] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleAnalyze = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setResult('');

    try {
      const response = await fetch('http://localhost:5000/api/reports/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ medicalTerms: inputData }),
      });

      const data = await response.json();
      if (data.success) {
        setResult(data.analysis);
      } else {
        setError(data.error || 'An unexpected analysis issue occurred.');
      }
    } catch (err) {
      setError('Could not connect to the backend server architecture.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ fontFamily: 'Segoe UI, sans-serif', maxWidth: '800px', margin: '40px auto', padding: '20px' }}>
      <header style={{ borderBottom: '2px solid #0056b3', paddingBottom: '10px', marginBottom: '30px' }}>
        <h1 style={{ color: '#0056b3', margin: 0 }}>MedGenesis Engine</h1>
        <p style={{ color: '#666', margin: '5px 0 0 0' }}>Clinical Grounding Engine Powered via Local RAG</p>
      </header>

      <main>
        <form onSubmit={handleAnalyze} style={{ marginBottom: '30px' }}>
          <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '8px' }}>
            Input Lab Metrics / Clinical Parameters:
          </label>
          <textarea
            style={{ width: '100%', height: '100px', padding: '12px', boxSizing: 'border-box', borderRadius: '6px', border: '1px solid #ccc', fontSize: '15px' }}
            value={inputData}
            onChange={(e) => setInputData(e.target.value)}
            placeholder="Enter clinical report text values..."
            required
          />
          <button
            type="submit"
            disabled={loading}
            style={{ marginTop: '12px', padding: '10px 24px', backgroundColor: '#0056b3', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '16px', fontWeight: '600' }}
          >
            {loading ? 'Processing Context Pipeline...' : 'Run RAG Assessment'}
          </button>
        </form>

        {error && (
          <div style={{ backgroundColor: '#f8d7da', color: '#721c24', padding: '15px', borderRadius: '4px', marginBottom: '20px' }}>
            {error}
          </div>
        )}

        {result && (
          <div style={{ backgroundColor: '#f8f9fa', borderLeft: '4px solid #28a745', padding: '20px', borderRadius: '0 4px 4px 0', whiteSpace: 'pre-line' }}>
            <h3 style={{ marginTop: 0, color: '#28a745' }}>Validated Analysis Generation</h3>
            <p style={{ lineHeight: '1.6', fontSize: '15px', color: '#333' }}>{result}</p>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;