import React, { useEffect, useState } from 'react'
import axios from 'axios'

const LS_KEY = 'vd:reports'

function readLocalReports(){
  try{ const raw = localStorage.getItem(LS_KEY); return raw ? JSON.parse(raw) : [] }catch(e){ return [] }
}

export default function History(){
  const [reports, setReports] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  useEffect(()=>{
    let mounted = true
    async function fetchReports(){
      setLoading(true)
      try{
        // Try server first, fall back to localStorage
        try{
          const res = await axios.get('http://localhost:4000/api/reports?limit=50', { timeout: 2000 })
          if(!mounted) return
          setReports(res.data.reports || [])
          return
        }catch(_){
          // fallback to localStorage
        }
        if(!mounted) return
        setReports(readLocalReports())
      }catch(err){
        if(mounted) setError(err.message || 'Failed')
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
        <p className="muted">Previously saved scan reports (local persistence)</p>
      </header>
      <section>
        {loading && <p>Loading reports…</p>}
        {error && <p className="error">{error}</p>}
        {!loading && !reports.length && <p>No reports found.</p>}
        <ul className="report-list">
          {reports.map(r => (
            <li key={r.id} className="report-item">
              <div className="report-meta">
                {/* Prefer scan date inside payload, fall back to stored created_at */}
                <strong>{(function(){
                  try{
                    const p = r.payload
                    let maybe = null
                    if(Array.isArray(p)){
                      const summary = p.find(it => it && (it.item_type === 'report_summary' || it.type === 'report_summary'))
                      if(summary && summary.scan_start) maybe = summary.scan_start
                      // also check nested shapes
                      if(!maybe && summary && summary.report && summary.report.scan_start) maybe = summary.report.scan_start
                    } else if(p && typeof p === 'object'){
                      maybe = p.report_summary?.scan_start || p.scan_date || p.summary?.scan_start || p.scan_start
                    }
                    if(!maybe) maybe = r.created_at
                    const d = maybe ? new Date(maybe) : null
                    return d ? d.toLocaleString() : 'Unknown'
                  }catch(e){ return new Date(r.created_at).toLocaleString() }
                })()}</strong>
                <span className="muted"> — {r.id}</span>
              </div>
              <details>
                <summary>View payload</summary>
                <pre className="small">{JSON.stringify(r.payload, null, 2)}</pre>
              </details>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
