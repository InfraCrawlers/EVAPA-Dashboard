import React, { useMemo } from 'react'
import Charts from './Charts'

const LS_KEY = 'vd:reports'

function readLocalReports(){
  try{ const raw = localStorage.getItem(LS_KEY); return raw ? JSON.parse(raw) : [] }catch(e){ return [] }
}

function toDayKey(ts){ const d = new Date(ts); d.setHours(0,0,0,0); return d.toISOString().slice(0,10) }

function aggregateReports(reports){
  // returns { daily: {dayKey: count}, weekly: {weekStartKey: count} }
  const daily = {}
  const weekly = {}
  reports.forEach(r=>{
    const p = r.payload
    // get scan timestamp from payload (support array or object)
    let maybe = null
    if(Array.isArray(p)){
      const s = p.find(it=> it && (it.item_type === 'report_summary' || it.type === 'report_summary'))
      maybe = s?.scan_start || s?.scan_date
    } else if(p && typeof p === 'object'){
      maybe = p.report_summary?.scan_start || p.scan_date || p.scan_start || p.summary?.scan_start
    }
    if(!maybe) maybe = r.created_at
    const ts = (typeof maybe === 'number') ? maybe : Date.parse(maybe || '') || r.created_at
    const day = toDayKey(ts)
    daily[day] = (daily[day] || 0) + 1
    // week start (Monday)
    const d = new Date(ts)
    const dayOfWeek = (d.getDay() + 6) % 7 // 0=Mon
    const weekStart = new Date(d)
    weekStart.setDate(d.getDate() - dayOfWeek)
    weekStart.setHours(0,0,0,0)
    const wk = weekStart.toISOString().slice(0,10)
    weekly[wk] = (weekly[wk] || 0) + 1
  })
  return { daily, weekly }
}

export default function Overview({ findings = [], summary = {}, critical=0, high=0, medium=0, low=0, hosts=0, cves=0, avgSeverity=0, onNavigate }){
  const total = critical + high + medium + low || 1

  const reports = readLocalReports()
  const hasHistory = reports && reports.length > 0
  const aggregates = hasHistory ? aggregateReports(reports) : { daily: {}, weekly: {} }

  const last7 = Object.keys(aggregates.daily).sort().slice(-7)
  const last8w = Object.keys(aggregates.weekly).sort().slice(-8)

  return (
    <div className="overview-root">
      {/* KPI Cards Row */}
      <div className="kpi-row">
        <div className="kpi-card danger">
          <div className="kpi-number">{critical}</div>
          <div className="kpi-label">Critical Findings</div>
          <div className="kpi-bar"><div style={{['--w']:`${(critical/total)*100}%`}}></div></div>
        </div>

        <div className="kpi-card warning">
          <div className="kpi-number">{high}</div>
          <div className="kpi-label">High Findings</div>
          <div className="kpi-bar"><div style={{['--w']:`${(high/total)*100}%`}}></div></div>
        </div>

        <div className="kpi-card info">
          <div className="kpi-number">{medium}</div>
          <div className="kpi-label">Medium Findings</div>
          <div className="kpi-bar"><div style={{['--w']:`${(medium/total)*100}%`}}></div></div>
        </div>

        <div className="kpi-card success">
          <div className="kpi-number">{low}</div>
          <div className="kpi-label">Low Findings</div>
          <div className="kpi-bar"><div style={{['--w']:`${(low/total)*100}%`}}></div></div>
        </div>
      </div>

      {/* Summary Statistics */}
      <div className="stats-row row stats-gap">
        <div className="stat-card" role="button" tabIndex={0} onClick={()=> onNavigate && onNavigate('vulnerabilities')} onKeyPress={(e)=>{ if(e.key==='Enter') onNavigate && onNavigate('vulnerabilities') }}>
          <div className="stat-number">{findings.length}</div>
          <div className="stat-label">Total Findings</div>
        </div>
        <div className="stat-card" role="button" tabIndex={0} onClick={()=> onNavigate && onNavigate('assets')} onKeyPress={(e)=>{ if(e.key==='Enter') onNavigate && onNavigate('assets') }}>
          <div className="stat-number">{hosts}</div>
          <div className="stat-label">Hosts Scanned</div>
        </div>
        <div className="stat-card">
          <div className="stat-number">{cves}</div>
          <div className="stat-label">Distinct CVEs</div>
        </div>
        <div className="stat-card">
          <div className="stat-number">{avgSeverity}</div>
          <div className="stat-label">Average Severity</div>
        </div>
      </div>

      {/* Charts and Summary */}
      <div className="chart-grid">
        <div className="card chart-card">
          <Charts data={findings} />
        </div>

        <div className="card summary-card">
          <div className="card-title">
            <h3>Scan Summary</h3>
            <div className="small-card small-card-inline">
              <div className="small-card-title">Total</div>
              <div className="small-card-number">{findings.length}</div>
            </div>
          </div>

          <dl className="summary-list">
            <div className="summary-row">
              <dt className="summary-label">Target</dt>
              <dd className="summary-value">{summary.target_name || 'EC2-Windows'}</dd>
            </div>

            <div className="summary-row">
              <dt className="summary-label">Scan Date</dt>
              <dd className="summary-value">{summary.scan_start ? new Date(summary.scan_start).toLocaleString() : 'N/A'}</dd>
            </div>

            <div className="summary-row">
              <dt className="summary-label">Report ID</dt>
              <dd className="summary-value report-id">{summary.report_id ? summary.report_id : 'N/A'}</dd>
            </div>

            {summary.operator && (
              <div className="summary-row">
                <dt className="summary-label">Operator</dt>
                <dd className="summary-value">{summary.operator}</dd>
              </div>
            )}
          </dl>
        </div>
      </div>

      {/* Historical aggregates: daily & weekly (if persisted reports exist) */}
      {hasHistory && (
        <div className="card" style={{marginTop:16}}>
          <div className="card-title"><h3>Historical Aggregates</h3><div className="muted">Daily (last 7 days) & Weekly (last 8 weeks)</div></div>
          <div style={{display:'flex',gap:16,flexWrap:'wrap'}}>
            <div style={{flex:1,minWidth:220}}>
              <div className="small-card-title">Daily (last 7 days)</div>
              <ul style={{marginTop:8}}>
                {last7.map(d => (<li key={d}><strong>{d}</strong>: {aggregates.daily[d] || 0} reports</li>))}
              </ul>
            </div>
            <div style={{flex:1,minWidth:220}}>
              <div className="small-card-title">Weekly (last 8 weeks)</div>
              <ul style={{marginTop:8}}>
                {last8w.map(w => (<li key={w}><strong>{w}</strong>: {aggregates.weekly[w] || 0} reports</li>))}
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
