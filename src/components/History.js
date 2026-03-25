import React, { useEffect, useState } from 'react'
import axios from 'axios'

const API_BASE_URL = 'http://localhost:3005'

export default React.memo(function History(){
  const [reports, setReports] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  useEffect(()=>{
    let mounted = true
    async function fetchReports(){
      setLoading(true)
      try{
        // Fetch reports from Redis-backed backend
        const res = await axios.get(`${API_BASE_URL}/api/reports?limit=50`, { timeout: 15000 })
        if(!mounted) return
        setReports(res.data.data || [])
      }catch(err){
        if(mounted) {
          setError('Backend API unavailable. Make sure Redis and backend server are running.')
          setReports([])
        }
      }finally{
        if(mounted) setLoading(false)
      }
    }
    fetchReports()
    return ()=>{ mounted = false }
  },[])

  return (
    <div className="page">
      <header className="page-header">
        <h2>History</h2>
        <p className="muted">Scan reports from DynamoDB</p>
      </header>
      <section>
        {loading && <p>Loading reports…</p>}
        {error && <p className="error">{error}</p>}
        {!loading && !reports.length && !error && <p>No reports found.</p>}
        <ul className="report-list">
          {reports.map(r => (
            <li key={r.id} className="report-item">
              <div className="report-meta">
                <strong>{(function(){
                  try{
                    const ts = r.payload?.processed_timestamp || r.created_at
                    return ts ? new Date(ts).toLocaleString() : 'Unknown'
                  }catch(e){ return 'Unknown' }
                })()}</strong>
                <span className="muted"> — {r.payload?.pk || r.id}</span>
                {r.payload?.total_high_severity_count > 0 && (
                  <span style={{marginLeft:'10px',color:'#e74c3c',fontWeight:600}}>
                    ⚠️ {r.payload.total_high_severity_count} High Severity
                  </span>
                )}
              </div>
              {r.payload?.vulnerabilities && (
                <div style={{margin:'8px 0',fontSize:'13px',color:'#aaa'}}>
                  {r.payload.vulnerabilities.length} vulnerabilities found
                  {r.payload.vulnerabilities.slice(0,3).map((v,i) => (
                    <div key={i} style={{marginLeft:'12px',marginTop:'4px'}}>
                      <span style={{color: v.threat_level === 'Critical' ? '#e74c3c' : v.threat_level === 'High' ? '#f39c12' : '#95a5a6'}}>●</span>
                      {' '}{v.vulnerability_name} ({v.host}:{v.port})
                    </div>
                  ))}
                  {r.payload.vulnerabilities.length > 3 && (
                    <div style={{marginLeft:'12px',marginTop:'4px',color:'#666'}}>...and {r.payload.vulnerabilities.length - 3} more</div>
                  )}
                </div>
              )}
              <details>
                <summary>View full report</summary>
                <pre className="small">{JSON.stringify(r.payload, null, 2)}</pre>
              </details>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
})
