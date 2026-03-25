import React, { useState, useMemo, useEffect } from 'react'

export default React.memo(function Vulnerabilities({ findings }){
  const [severity, setSeverity] = useState('all')
  const [selected, setSelected] = useState(null)
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
  const pageSize = 10

  const severityLevels = [
    {key:'all', label:'All'},
    {key:'critical', label:'Critical'},
    {key:'high', label:'High'},
    {key:'medium', label:'Medium'},
    {key:'low', label:'Low'}
  ]

  const matchesSeverity = (f)=>{
    const sev = f.severity_num ?? f.cvss_num ?? 0
    if(severity === 'critical') return sev >= 9
    if(severity === 'high') return sev >= 7 && sev < 9
    if(severity === 'medium') return sev >= 4 && sev < 7
    if(severity === 'low') return sev < 4
    return true
  }

  const filtered = useMemo(()=>{
    const q = query.trim().toLowerCase()
    const base = findings.filter(f=> matchesSeverity(f))
    if(!q) return base
    return base.filter(f=> (
      (f.name||'').toLowerCase().includes(q) ||
      (f.hostname||f.host||'').toLowerCase().includes(q) ||
      (f.cves||[]).join(' ').toLowerCase().includes(q)
    ))
  },[findings,severity,query])

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const pageItems = filtered.slice((page-1)*pageSize, page*pageSize)

  // responsive: switch to card list on small screens
  const [isMobileView, setIsMobileView] = useState(false)
  useEffect(()=>{
    function check(){ setIsMobileView(window.innerWidth <= 640) }
    check()
    window.addEventListener('resize', check)
    return ()=> window.removeEventListener('resize', check)
  },[])

  function goto(p){ setPage(Math.max(1, Math.min(totalPages, p))) }

  // CSV export helper
  function exportCSV(){
    const rows = filtered.map(f=>({
      name: f.name||'', host: f.hostname||f.host||'', severity: f.severity||f.threat||'', cvss: f.cvss||f.severity_num||'', cves: (f.cves||[]).join('|'), description: (f.description||'').replace(/\n/g,' ')  
    }))
    const header = Object.keys(rows[0]||{})
    const csv = [header.join(',')].concat(rows.map(r=> header.map(h=> '"'+String(r[h]||'').replace(/"/g,'""')+'"').join(','))).join('\n')
    const blob = new Blob([csv], {type:'text/csv;charset=utf-8;'})
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'vulnerabilities.csv'
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  return (
    <div>
      <div className="row vuln-controls">
        <div className="severity-tabs">
          {severityLevels.map(l=> (
            <button key={l.key} onClick={()=>{ setSeverity(l.key); setPage(1) }} className={"sev-tab " + (severity===l.key ? 'active' : '')}>{l.label}</button>
          ))}
        </div>

        <div style={{display:'flex',gap:8,alignItems:'center',marginLeft:'auto'}}>
          <input className="search-input" placeholder="Search name, host, CVE..." value={query} onChange={e=>{ setQuery(e.target.value); setPage(1) }} />
          <div className="results-count">{filtered.length} results</div>
          <button className="sidebar-btn" onClick={exportCSV} title="Export CSV"><i className="fa-solid fa-file-csv"></i></button>
          <button className="sidebar-btn" onClick={()=>window.print()} title="Print view"><i className="fa-solid fa-print"></i></button>
        </div>
      </div>

      {isMobileView ? (
        <div className="card table-wrap mobile-card-list">
          {filtered.map((f,i)=> (
            <div key={i} className="mobile-vuln-card" onClick={()=> setSelected(f)}>
              <div className="mobile-vuln-header">
                <div className="col-name">{f.name || '-'}</div>
                <div>{f.hostname || f.host || '-'}</div>
              </div>
              <div className="mobile-vuln-meta">
                <span className={`severity-badge ${ (f.severity_num||f.cvss_num||0) >=9 ? 'critical' : (f.severity_num||f.cvss_num||0) >=7 ? 'high' : (f.severity_num||f.cvss_num||0) >=4 ? 'medium' : 'low' }`}>{f.severity || f.threat || '-'}</span>
                <div className="small">CVSS: {f.cvss || f.severity_num || '-'}</div>
              </div>
              <div className="desc-cell">{f.description || '-'}</div>
              <div className="small" style={{marginTop:8}}>CVEs: {(f.cves||[]).join(', ') || '-'}</div>
            </div>
          ))}
        </div>
      ) : (
        <div className="card table-wrap">
        <table>
          <thead>
            <tr className="table-head">
              <th className="th">Name</th>
              <th className="th">Host</th>
              <th className="th">Severity</th>
              <th className="th">CVSS</th>
              <th className="th">CVEs</th>
              <th className="th">Description</th>
            </tr>
          </thead>
          <tbody>
            {pageItems.map((f,i)=> (
              <tr key={i} className="vuln-row" onClick={()=> setSelected(f)}>
                <td data-label="Name" className="col-name">{f.name || '-'}</td>
                <td data-label="Host">{f.hostname || f.host || '-'}</td>
                <td data-label="Severity">{
                  (()=>{
                    const sev = f.severity_num || f.cvss_num || 0
                    const cls = sev >= 9 ? 'critical' : sev >=7 ? 'high' : sev >=4 ? 'medium' : 'low'
                    return <span className={`severity-badge ${cls}`}>{f.severity || f.threat || '-'}</span>
                  })()
                }</td>
                <td data-label="CVSS">{f.cvss || f.severity_num || '-'}</td>
                <td data-label="CVEs" className="cve-cell">{(f.cves || []).join(', ') || '-'}</td>
                <td data-label="Description" className="desc-cell">{f.description || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      )}

      <div className="row" style={{marginTop:12,justifyContent:'space-between',alignItems:'center'}}>
        <div className="small">Page {page} / {totalPages}</div>
        <div style={{display:'flex',gap:8}}>
          <button className="sidebar-btn" onClick={()=>goto(page-1)} disabled={page<=1}>Prev</button>
          <button className="sidebar-btn" onClick={()=>goto(page+1)} disabled={page>=totalPages}>Next</button>
        </div>
      </div>

      {selected && (
        <div className="modal-backdrop" onClick={()=>setSelected(null)}>
          <div className="modal" onClick={e=>e.stopPropagation()}>
            <button onClick={()=>setSelected(null)} className="close">×</button>
            <h2>Vulnerability Details</h2>
            <div className="modal-body">
              <div><strong>Name:</strong> {selected.name || '-'}</div>
              <div><strong>Host:</strong> {selected.hostname || selected.host || '-'}</div>
              <div><strong>Severity:</strong> {selected.severity || selected.threat || '-'}</div>
              <div><strong>CVSS:</strong> {selected.cvss || selected.severity_num || '-'}</div>
              <div><strong>CVEs:</strong> {(selected.cves || []).join(', ') || '-'}</div>
              {selected.description && <div><strong>Description:</strong> {selected.description}</div>}
              {selected.solution && <div><strong>Solution:</strong> {selected.solution}</div>}
              {selected.reference && <div><strong>Reference:</strong> <a href={selected.reference} target="_blank" rel="noopener noreferrer" className="link-primary">{selected.reference}</a></div>}
            </div>
          </div>
        </div>
      )}

    </div>
  )
})
