import React, { useEffect, useState } from 'react'
import axios from 'axios'

const API_BASE_URL = 'http://localhost:3005'

export default React.memo(function History(){
  const [reports, setReports] = useState([])
  const [patchReports, setPatchReports] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [activeSection, setActiveSection] = useState('scans')
  const [detailModal, setDetailModal] = useState(null)

  useEffect(()=>{
    let mounted = true
    async function fetchReports(){
      setLoading(true)
      try{
        const [scanRes, patchRes] = await Promise.all([
          axios.get(`${API_BASE_URL}/api/reports?limit=50`, { timeout: 15000 }).catch(() => ({ data: { data: [] } })),
          axios.get(`${API_BASE_URL}/api/patch-reports`, { timeout: 15000 }).catch(() => ({ data: { reports: [] } }))
        ])
        if(!mounted) return
        setReports(scanRes.data.data || [])
        setPatchReports(patchRes.data.reports || [])
      }catch(err){
        if(mounted) {
          setError('Backend API unavailable. Make sure Redis and backend server are running.')
          setReports([])
          setPatchReports([])
        }
      }finally{
        if(mounted) setLoading(false)
      }
    }
    fetchReports()
    return ()=>{ mounted = false }
  },[])

  const renderTaskList = (tasks, label) => {
    if (!tasks || tasks.length === 0) return null
    return (
      <div style={{marginTop:'8px'}}>
        <div style={{fontSize:'12px',fontWeight:600,color:'#888',marginBottom:'6px'}}>{label}</div>
        {tasks.map((t, i) => (
          <div key={i} style={{display:'flex',justifyContent:'space-between',padding:'4px 8px',borderRadius:'4px',marginBottom:'3px',background:'rgba(255,255,255,0.03)',fontSize:'12px'}}>
            <span style={{color:'#ccc'}}>{t.task}</span>
            <span style={{fontWeight:600,color: t.status === 'changed' ? '#ffd166' : t.status === 'failed' ? '#e74c3c' : '#6fcf97'}}>{t.status}</span>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="page">
      <header className="page-header">
        <h2>History</h2>
        <p className="muted">Scan reports & patching results</p>
      </header>

      {/* Section Tabs */}
      <div style={{display:'flex',gap:'8px',marginBottom:'20px'}}>
        <button
          onClick={() => setActiveSection('scans')}
          style={{padding:'8px 20px',borderRadius:'8px',border:'1px solid',fontWeight:600,fontSize:'13px',cursor:'pointer',
            borderColor: activeSection === 'scans' ? 'rgba(90,155,216,0.5)' : 'rgba(255,255,255,0.1)',
            background: activeSection === 'scans' ? 'rgba(90,155,216,0.15)' : 'rgba(255,255,255,0.04)',
            color: activeSection === 'scans' ? '#5a9bd8' : '#888'}}
        >
          🔍 Scan Reports ({reports.length})
        </button>
        <button
          onClick={() => setActiveSection('patches')}
          style={{padding:'8px 20px',borderRadius:'8px',border:'1px solid',fontWeight:600,fontSize:'13px',cursor:'pointer',
            borderColor: activeSection === 'patches' ? 'rgba(111,207,151,0.5)' : 'rgba(255,255,255,0.1)',
            background: activeSection === 'patches' ? 'rgba(111,207,151,0.15)' : 'rgba(255,255,255,0.04)',
            color: activeSection === 'patches' ? '#6fcf97' : '#888'}}
        >
          🔧 Patch Reports ({patchReports.length})
        </button>
      </div>

      <section>
        {loading && <p>Loading reports…</p>}
        {error && <p className="error">{error}</p>}

        {/* Scan Reports */}
        {activeSection === 'scans' && (
          <>
            {!loading && !reports.length && !error && <p>No scan reports found.</p>}
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
          </>
        )}

        {/* Patch Reports */}
        {activeSection === 'patches' && (
          <>
            {!loading && !patchReports.length && !error && <p>No patch reports yet. Patches will appear here after a completed scan triggers auto-patching.</p>}
            <div style={{display:'flex',flexDirection:'column',gap:'16px'}}>
              {patchReports.map((pr, idx) => {
                const linuxOk = pr.linuxResult && pr.linuxResult.overall_status
                const windowsOk = pr.windowsResult && pr.windowsResult.overall_status
                const hasResults = linuxOk || windowsOk
                const overallSuccess = hasResults
                  ? (linuxOk ? pr.linuxResult.overall_status === 'Success' : true) && (windowsOk ? pr.windowsResult.overall_status === 'Success' : true)
                  : true
                const target = (pr.targetName || '').toLowerCase()
                const osLabel = target.includes('windows') || target.includes('win') ? '🪟 Windows' : '🐧 Linux'
                return (
                  <div key={idx} style={{padding:'20px',borderRadius:'12px',border:`1px solid ${overallSuccess ? 'rgba(111,207,151,0.3)' : 'rgba(231,76,60,0.3)'}`,background: overallSuccess ? 'rgba(111,207,151,0.05)' : 'rgba(231,76,60,0.05)'}}>
                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',flexWrap:'wrap',gap:'12px'}}>
                      <div>
                        <div style={{fontWeight:700,fontSize:'15px'}}>🔧 {pr.taskName}</div>
                        <div style={{fontSize:'12px',color:'#888',marginTop:'2px'}}>Target: {pr.targetName || 'N/A'} ({osLabel})</div>
                      </div>
                      <div style={{display:'flex',alignItems:'center',gap:'12px'}}>
                        <div style={{textAlign:'right'}}>
                          <div style={{fontSize:'12px',color:'#aaa'}}>{pr.patchedAt ? new Date(pr.patchedAt).toLocaleString() : 'Unknown'}</div>
                          <div style={{fontSize:'11px',marginTop:'4px',padding:'3px 10px',borderRadius:'12px',fontWeight:600,display:'inline-block',
                            background: overallSuccess ? 'rgba(111,207,151,0.15)' : 'rgba(231,76,60,0.15)',
                            color: overallSuccess ? '#6fcf97' : '#e74c3c'
                          }}>
                            {overallSuccess ? '✅ Completed' : '⚠️ Partial Failure'}
                          </div>
                        </div>
                        <button onClick={() => setDetailModal(idx)} style={{padding:'6px 14px',borderRadius:'8px',border:'1px solid rgba(90,155,216,0.4)',background:'rgba(90,155,216,0.1)',color:'#5a9bd8',fontSize:'12px',fontWeight:600,cursor:'pointer',whiteSpace:'nowrap'}}>View Details</button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        )}
      </section>

      {/* Patch Detail Modal */}
      {detailModal !== null && patchReports[detailModal] && (() => {
        const pr = patchReports[detailModal]
        const linuxOk = pr.linuxResult && pr.linuxResult.overall_status
        const windowsOk = pr.windowsResult && pr.windowsResult.overall_status
        const hasResults = linuxOk || windowsOk
        const overallSuccess = hasResults
          ? (linuxOk ? pr.linuxResult.overall_status === 'Success' : true) && (windowsOk ? pr.windowsResult.overall_status === 'Success' : true)
          : true
        const cols = (linuxOk && windowsOk) ? '1fr 1fr' : '1fr'
        const target = (pr.targetName || '').toLowerCase()
        const osLabel = target.includes('windows') || target.includes('win') ? '🪟 Windows' : '🐧 Linux'
        return (
          <div onClick={() => setDetailModal(null)} style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.7)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:9999,backdropFilter:'blur(4px)'}}>
            <div onClick={e => e.stopPropagation()} style={{background:'#1a1d23',borderRadius:'16px',border:'1px solid rgba(255,255,255,0.1)',padding:'28px',width:'90%',maxWidth:'700px',maxHeight:'85vh',overflowY:'auto',boxShadow:'0 20px 60px rgba(0,0,0,0.5)'}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'20px'}}>
                <div>
                  <div style={{fontWeight:700,fontSize:'18px'}}>🔧 Patch Report</div>
                  <div style={{fontSize:'13px',color:'#888',marginTop:'4px'}}>{pr.taskName}</div>
                </div>
                <button onClick={() => setDetailModal(null)} style={{background:'rgba(255,255,255,0.08)',border:'none',color:'#aaa',fontSize:'18px',width:'36px',height:'36px',borderRadius:'8px',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center'}}>✕</button>
              </div>

              <div style={{fontSize:'13px',color:'#888',marginBottom:'20px'}}>
                Patched on {pr.patchedAt ? new Date(pr.patchedAt).toLocaleString() : 'Unknown'} • Target: {pr.targetName || 'N/A'} ({osLabel}) • <span style={{color: overallSuccess ? '#6fcf97' : '#e74c3c',fontWeight:600}}>{overallSuccess ? 'Completed' : 'Partial Failure'}</span>
              </div>

              {!hasResults && (
                <div style={{padding:'24px',borderRadius:'10px',background:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.08)',textAlign:'center'}}>
                  <div style={{fontSize:'32px',marginBottom:'12px'}}>✅</div>
                  <div style={{fontWeight:600,fontSize:'15px',marginBottom:'8px'}}>Patching Completed</div>
                  <div style={{fontSize:'13px',color:'#888',lineHeight:'1.6'}}>
                    {osLabel} patching was executed for target <strong style={{color:'#e6eef6'}}>{pr.targetName}</strong>.<br/>
                    The patching API did not return detailed playbook results for this run.
                  </div>
                  <div style={{marginTop:'16px',display:'flex',justifyContent:'center',gap:'24px',fontSize:'12px',color:'#aaa'}}>
                    <span>Task: <strong style={{color:'#e6eef6'}}>{pr.taskName}</strong></span>
                    <span>Status: <strong style={{color:'#6fcf97'}}>{pr.status}</strong></span>
                  </div>
                </div>
              )}

              {hasResults && (
                <div style={{display:'grid',gridTemplateColumns:cols,gap:'16px'}}>
                {linuxOk && (
                  <div style={{padding:'16px',borderRadius:'10px',background:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.08)'}}>
                    <div style={{fontWeight:600,fontSize:'14px',marginBottom:'12px',display:'flex',alignItems:'center',gap:'8px'}}>
                      🐧 Linux Patching
                      <span style={{fontSize:'11px',padding:'2px 10px',borderRadius:'8px',fontWeight:600,
                        background: pr.linuxResult.overall_status === 'Success' ? 'rgba(111,207,151,0.15)' : 'rgba(231,76,60,0.15)',
                        color: pr.linuxResult.overall_status === 'Success' ? '#6fcf97' : '#e74c3c'
                      }}>{pr.linuxResult.overall_status}</span>
                    </div>
                    {pr.linuxResult?.summary && (
                      <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:'8px',marginBottom:'14px'}}>
                        <div style={{textAlign:'center',padding:'8px',borderRadius:'8px',background:'rgba(111,207,151,0.1)'}}>
                          <div style={{fontSize:'18px',fontWeight:700,color:'#6fcf97'}}>{pr.linuxResult.summary.ok}</div>
                          <div style={{fontSize:'10px',color:'#888'}}>OK</div>
                        </div>
                        <div style={{textAlign:'center',padding:'8px',borderRadius:'8px',background:'rgba(255,209,102,0.1)'}}>
                          <div style={{fontSize:'18px',fontWeight:700,color:'#ffd166'}}>{pr.linuxResult.summary.changed}</div>
                          <div style={{fontSize:'10px',color:'#888'}}>Changed</div>
                        </div>
                        <div style={{textAlign:'center',padding:'8px',borderRadius:'8px',background:'rgba(231,76,60,0.1)'}}>
                          <div style={{fontSize:'18px',fontWeight:700,color:'#e74c3c'}}>{pr.linuxResult.summary.failed}</div>
                          <div style={{fontSize:'10px',color:'#888'}}>Failed</div>
                        </div>
                        <div style={{textAlign:'center',padding:'8px',borderRadius:'8px',background:'rgba(150,150,150,0.1)'}}>
                          <div style={{fontSize:'18px',fontWeight:700,color:'#888'}}>{pr.linuxResult.summary.skipped}</div>
                          <div style={{fontSize:'10px',color:'#888'}}>Skipped</div>
                        </div>
                      </div>
                    )}
                    {renderTaskList(pr.linuxResult?.tasks, 'Playbook Tasks')}
                  </div>
                )}
                {windowsOk && (
                  <div style={{padding:'16px',borderRadius:'10px',background:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.08)'}}>
                    <div style={{fontWeight:600,fontSize:'14px',marginBottom:'12px',display:'flex',alignItems:'center',gap:'8px'}}>
                      🪟 Windows Patching
                      <span style={{fontSize:'11px',padding:'2px 10px',borderRadius:'8px',fontWeight:600,
                        background: pr.windowsResult.overall_status === 'Success' ? 'rgba(111,207,151,0.15)' : 'rgba(231,76,60,0.15)',
                        color: pr.windowsResult.overall_status === 'Success' ? '#6fcf97' : '#e74c3c'
                      }}>{pr.windowsResult.overall_status}</span>
                    </div>
                    {pr.windowsResult?.summary && (
                      <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:'8px',marginBottom:'14px'}}>
                        <div style={{textAlign:'center',padding:'8px',borderRadius:'8px',background:'rgba(111,207,151,0.1)'}}>
                          <div style={{fontSize:'18px',fontWeight:700,color:'#6fcf97'}}>{pr.windowsResult.summary.ok}</div>
                          <div style={{fontSize:'10px',color:'#888'}}>OK</div>
                        </div>
                        <div style={{textAlign:'center',padding:'8px',borderRadius:'8px',background:'rgba(255,209,102,0.1)'}}>
                          <div style={{fontSize:'18px',fontWeight:700,color:'#ffd166'}}>{pr.windowsResult.summary.changed}</div>
                          <div style={{fontSize:'10px',color:'#888'}}>Changed</div>
                        </div>
                        <div style={{textAlign:'center',padding:'8px',borderRadius:'8px',background:'rgba(231,76,60,0.1)'}}>
                          <div style={{fontSize:'18px',fontWeight:700,color:'#e74c3c'}}>{pr.windowsResult.summary.failed}</div>
                          <div style={{fontSize:'10px',color:'#888'}}>Failed</div>
                        </div>
                        <div style={{textAlign:'center',padding:'8px',borderRadius:'8px',background:'rgba(150,150,150,0.1)'}}>
                          <div style={{fontSize:'18px',fontWeight:700,color:'#888'}}>{pr.windowsResult.summary.skipped}</div>
                          <div style={{fontSize:'10px',color:'#888'}}>Skipped</div>
                        </div>
                      </div>
                    )}
                    {renderTaskList(pr.windowsResult?.tasks, 'Playbook Tasks')}
                  </div>
                )}
              </div>
              )}
            </div>
          </div>
        )
      })()}
    </div>
  )
})
