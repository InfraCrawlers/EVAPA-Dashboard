import React, { useMemo } from 'react'

export default function AssetsInventory({ findings = [], selectedHost = null, onSelectHost = ()=>{} }){
  const hosts = useMemo(()=>{
    const map = new Map()
    findings.forEach(f=>{
      const host = f.host || f.hostname || 'unknown'
      if(!map.has(host)) map.set(host, {host, findings: []})
      map.get(host).findings.push(f)
    })
    return Array.from(map.values()).sort((a,b)=> b.findings.length - a.findings.length)
  },[findings])

  return (
    <div className="assets-root">
      <div style={{display:'flex',gap:8,justifyContent:'flex-end',marginBottom:8}}>
        <button className="sidebar-btn" onClick={() => {
          // CSV export of hosts
          const rows = hosts.map(h=>({host: h.host, findings: h.findings.length, top_cves: (Array.from(new Set(h.findings.flatMap(x=> x.cves || [])))).slice(0,3).join('|')}))
          const header = Object.keys(rows[0]||{})
          const csv = [header.join(',')].concat(rows.map(r=> header.map(h=> '"'+String(r[h]||'').replace(/"/g,'""')+'"').join(','))).join('\n')
          const blob = new Blob([csv], {type:'text/csv;charset=utf-8;'})
          const url = URL.createObjectURL(blob)
          const a = document.createElement('a')
          a.href = url; a.download = 'assets_inventory.csv'; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url)
        }} title="Export hosts CSV"><i className="fa fa-file-csv" aria-hidden="true"></i></button>
        <button className="sidebar-btn" onClick={()=>window.print()} title="Print"><i className="fa fa-print" aria-hidden="true"></i></button>
      </div>
      <div className="card">
        <div className="card-title"><h3>Assets / Hosts Inventory</h3><div className="muted">Summary of scanned assets</div></div>
        <div className="hosts-list" style={{marginTop:12}}>
          {hosts.map(h=> (
            <div key={h.host} className={`host-row card ${selectedHost===h.host? 'active':''}`} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'10px',marginBottom:8,cursor:'pointer'}} onClick={()=> onSelectHost(h.host)}>
              <div>
                <div style={{fontWeight:700,color:'#eaf4ff'}}>{h.host}</div>
                <div className="small muted">{h.findings.length} findings • Top CVEs: {(Array.from(new Set(h.findings.flatMap(x=> x.cves || [])))).slice(0,3).join(', ') || '—'}</div>
              </div>
              <div style={{textAlign:'right'}}>
                <div className="badge" style={{background:'rgba(111,66,193,0.12)',color:'#fff',padding:'6px 10px',borderRadius:8}}>{h.findings.length}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {selectedHost && (
        <div className="card" style={{marginTop:12}}>
          <div className="card-title"><h3>Host Details</h3><div className="muted">{selectedHost}</div></div>
          <div style={{marginTop:10}}>
            <ul style={{margin:0,padding:0,listStyle:'none'}}>
              {findings.filter(f=> (f.host||f.hostname)===selectedHost).map((f,i)=> (
                <li key={i} style={{padding:'10px 0',borderBottom:'1px dashed rgba(255,255,255,0.02)'}}>
                  <div style={{fontWeight:700,color:'#eaf4ff'}}>{f.name}</div>
                  <div className="small muted">Severity: {f.severity || f.severity_num || 'N/A'} • CVEs: {(f.cves||[]).slice(0,3).join(', ') || '—'}</div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  )
}
