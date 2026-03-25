import React, { useMemo, useState, useEffect } from 'react'
import Charts from './Charts'
import axios from 'axios'

const API_BASE_URL = 'http://localhost:3005'

export default React.memo(function Overview({ findings = [], summary = {}, critical=0, high=0, medium=0, low=0, hosts=0, cves=0, avgSeverity=0, onNavigate }){
  const [selectedReport, setSelectedReport] = useState('all')

  // Build report options from findings
  const reportOptions = useMemo(() => {
    const map = new Map()
    findings.forEach(f => {
      if (f.report_id && !map.has(f.report_id)) {
        const shortId = f.report_id.replace('openvas-reports/', '').replace('.xml', '')
        const ts = f.report_timestamp ? new Date(f.report_timestamp).toLocaleString() : ''
        map.set(f.report_id, { id: f.report_id, label: ts ? `${shortId.slice(0,8)}... (${ts})` : shortId })
      }
    })
    return Array.from(map.values())
  }, [findings])

  // Filter findings by selected report and recompute KPIs
  const { filteredFindings, kpi } = useMemo(() => {
    const ff = selectedReport === 'all' ? findings : findings.filter(f => f.report_id === selectedReport)
    const c = ff.filter(x => (x.severity_num ?? 0) >= 9).length
    const h = ff.filter(x => (x.severity_num ?? 0) >= 7 && (x.severity_num ?? 0) < 9).length
    const m = ff.filter(x => (x.severity_num ?? 0) >= 4 && (x.severity_num ?? 0) < 7).length
    const l = ff.filter(x => (x.severity_num ?? 0) < 4).length
    const ho = new Set(ff.map(x => x.host || x.hostname)).size
    const cv = new Set(ff.flatMap(x => x.cves || [])).size
    const avg = ff.length ? (ff.reduce((s, x) => s + (x.severity_num || 0), 0) / ff.length).toFixed(1) : 0
    return {
      filteredFindings: ff,
      kpi: selectedReport === 'all'
        ? { critical, high, medium, low, hosts, cves, avgSeverity, total: critical + high + medium + low || 1 }
        : { critical: c, high: h, medium: m, low: l, hosts: ho, cves: cv, avgSeverity: avg, total: c + h + m + l || 1 }
    }
  }, [findings, selectedReport, critical, high, medium, low, hosts, cves, avgSeverity])

  // Fetch live dashboard summary from all APIs
  const [dashData, setDashData] = useState(null)
  const [dashLoading, setDashLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function fetchSummary() {
      try {
        const res = await axios.get(`${API_BASE_URL}/api/dashboard-summary`, { timeout: 20000, params: { _t: Date.now() } })
        if (!cancelled) setDashData(res.data)
      } catch (err) { /* fallback to props */ }
      finally { if (!cancelled) setDashLoading(false) }
    }
    fetchSummary()
    const interval = setInterval(fetchSummary, 30000) // refresh every 30s
    return () => { cancelled = true; clearInterval(interval) }
  }, [])

  // Derive monitoring stats
  const monitor = useMemo(() => {
    if (!dashData) return null
    const v = dashData.vulnerabilities || {}
    const tasks = dashData.tasks || []
    const ec2 = dashData.ec2Instances || []
    const reports = dashData.scanReports || []
    const targets = dashData.targets || []

    const doneTasks = tasks.filter(t => t.status?.toLowerCase() === 'done')
    const runningTasks = tasks.filter(t => t.status?.toLowerCase() === 'running')
    const patchedTasks = tasks.filter(t => t.patched)
    const unpatchedDone = doneTasks.filter(t => !t.patched)
    const runningEc2 = ec2.filter(i => i.state === 'running')

    // Top vulnerabilities by CVSS
    const topVulns = [...(v.details || [])].sort((a, b) => (b.cvss_severity || 0) - (a.cvss_severity || 0)).slice(0, 5)

    // Unique vulnerability names
    const uniqueVulnNames = [...new Set((v.details || []).map(d => d.vulnerability_name))]

    return {
      v, tasks, ec2, reports, targets,
      doneTasks, runningTasks, patchedTasks, unpatchedDone, runningEc2,
      topVulns, uniqueVulnNames
    }
  }, [dashData])

  return (
    <div className="overview-root">
      {/* Report Filter */}
      {reportOptions.length > 1 && (
        <div style={{display:'flex',alignItems:'center',gap:'10px',marginBottom:'16px'}}>
          <label style={{fontSize:'13px',color:'#aaa',fontWeight:600}}>Filter by Report:</label>
          <select
            value={selectedReport}
            onChange={e => setSelectedReport(e.target.value)}
            style={{padding:'6px 10px',borderRadius:'8px',border:'1px solid rgba(255,255,255,0.12)',background:'rgba(255,255,255,0.06)',color:'inherit',fontSize:'13px',cursor:'pointer',maxWidth:'280px'}}
          >
            <option value="all">All Reports ({reportOptions.length})</option>
            {reportOptions.map(r => (
              <option key={r.id} value={r.id}>{r.label}</option>
            ))}
          </select>
        </div>
      )}

      {/* KPI Cards Row */}
      <div className="kpi-row">
        <div className="kpi-card danger">
          <div className="kpi-number">{kpi.critical}</div>
          <div className="kpi-label">Critical Findings</div>
          <div className="kpi-bar"><div style={{['--w']:`${(kpi.critical/kpi.total)*100}%`}}></div></div>
        </div>

        <div className="kpi-card warning">
          <div className="kpi-number">{kpi.high}</div>
          <div className="kpi-label">High Findings</div>
          <div className="kpi-bar"><div style={{['--w']:`${(kpi.high/kpi.total)*100}%`}}></div></div>
        </div>

        <div className="kpi-card info">
          <div className="kpi-number">{kpi.medium}</div>
          <div className="kpi-label">Medium Findings</div>
          <div className="kpi-bar"><div style={{['--w']:`${(kpi.medium/kpi.total)*100}%`}}></div></div>
        </div>

        <div className="kpi-card success">
          <div className="kpi-number">{kpi.low}</div>
          <div className="kpi-label">Low Findings</div>
          <div className="kpi-bar"><div style={{['--w']:`${(kpi.low/kpi.total)*100}%`}}></div></div>
        </div>
      </div>

      {/* Summary Statistics */}
      <div className="stats-row row stats-gap">
        <div className="stat-card" role="button" tabIndex={0} onClick={()=> onNavigate && onNavigate('vulnerabilities')} onKeyPress={(e)=>{ if(e.key==='Enter') onNavigate && onNavigate('vulnerabilities') }}>
          <div className="stat-number">{filteredFindings.length}</div>
          <div className="stat-label">Total Findings</div>
        </div>
        <div className="stat-card" role="button" tabIndex={0} onClick={()=> onNavigate && onNavigate('assets')} onKeyPress={(e)=>{ if(e.key==='Enter') onNavigate && onNavigate('assets') }}>
          <div className="stat-number">{kpi.hosts}</div>
          <div className="stat-label">Hosts Scanned</div>
        </div>
        <div className="stat-card">
          <div className="stat-number">{kpi.cves}</div>
          <div className="stat-label">Distinct CVEs</div>
        </div>
        <div className="stat-card">
          <div className="stat-number">{kpi.avgSeverity}</div>
          <div className="stat-label">Average Severity</div>
        </div>
      </div>

      {/* Charts and Summary */}
      <div className="chart-grid">
        <div className="card chart-card">
          <Charts data={filteredFindings} />
        </div>

        <div className="card summary-card">
          <div className="card-title">
            <h3>Scan Summary</h3>
            <div className="small-card small-card-inline">
              <div className="small-card-title">Total</div>
              <div className="small-card-number">{filteredFindings.length}</div>
            </div>
          </div>

          <dl className="summary-list">
            <div className="summary-row">
              <dt className="summary-label">Target</dt>
              <dd className="summary-value">{summary.target_name || (monitor?.v?.uniqueHosts?.[0]) || 'N/A'}</dd>
            </div>

            <div className="summary-row">
              <dt className="summary-label">Scan Date</dt>
              <dd className="summary-value">{summary.scan_start ? new Date(summary.scan_start).toLocaleString() : (monitor?.reports?.[0]?.timestamp ? new Date(monitor.reports[0].timestamp).toLocaleString() : 'N/A')}</dd>
            </div>

            <div className="summary-row">
              <dt className="summary-label">Report ID</dt>
              <dd className="summary-value report-id">{summary.report_id || (monitor?.reports?.[0]?.pk) || 'N/A'}</dd>
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

      {/* Live Infrastructure Monitoring */}
      {monitor && (
        <>
          {/* Operational Status Row */}
          <div className="card" style={{marginTop:16}}>
            <div className="card-title"><h3>Infrastructure Monitoring</h3><div className="muted">Live data from all APIs • Auto-refreshes every 30s</div></div>
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(150px, 1fr))',gap:'12px',marginTop:'12px'}}>
              <div style={{padding:'16px',borderRadius:'10px',background:'rgba(90,155,216,0.1)',textAlign:'center'}}>
                <div style={{fontSize:'24px',fontWeight:700,color:'#5a9bd8'}}>{monitor.ec2.length}</div>
                <div style={{fontSize:'12px',color:'#888',marginTop:'4px'}}>EC2 Instances</div>
                <div style={{fontSize:'11px',color:'#6fcf97',marginTop:'2px'}}>{monitor.runningEc2.length} running</div>
              </div>
              <div style={{padding:'16px',borderRadius:'10px',background:'rgba(255,209,102,0.1)',textAlign:'center'}}>
                <div style={{fontSize:'24px',fontWeight:700,color:'#ffd166'}}>{monitor.tasks.length}</div>
                <div style={{fontSize:'12px',color:'#888',marginTop:'4px'}}>Scan Tasks</div>
                <div style={{fontSize:'11px',color: monitor.runningTasks.length ? '#f39c12' : '#6fcf97',marginTop:'2px'}}>
                  {monitor.runningTasks.length ? `${monitor.runningTasks.length} running` : `${monitor.doneTasks.length} completed`}
                </div>
              </div>
              <div style={{padding:'16px',borderRadius:'10px',background:'rgba(111,207,151,0.1)',textAlign:'center'}}>
                <div style={{fontSize:'24px',fontWeight:700,color:'#6fcf97'}}>{monitor.patchedTasks.length}</div>
                <div style={{fontSize:'12px',color:'#888',marginTop:'4px'}}>Tasks Patched</div>
                <div style={{fontSize:'11px',color: monitor.unpatchedDone.length ? '#f39c12' : '#6fcf97',marginTop:'2px'}}>
                  {monitor.unpatchedDone.length ? `${monitor.unpatchedDone.length} awaiting patch` : 'All patched'}
                </div>
              </div>
              <div style={{padding:'16px',borderRadius:'10px',background:'rgba(231,76,60,0.1)',textAlign:'center'}}>
                <div style={{fontSize:'24px',fontWeight:700,color:'#e74c3c'}}>{monitor.reports.length}</div>
                <div style={{fontSize:'12px',color:'#888',marginTop:'4px'}}>Scan Reports</div>
                <div style={{fontSize:'11px',color:'#aaa',marginTop:'2px'}}>{monitor.targets.length} targets configured</div>
              </div>
            </div>
          </div>

          {/* Top Critical Vulnerabilities */}
          {monitor.topVulns.length > 0 && (
            <div className="card" style={{marginTop:16}}>
              <div className="card-title"><h3>Top Vulnerabilities by CVSS</h3><div className="muted">{monitor.uniqueVulnNames.length} unique vulnerabilities detected</div></div>
              <div style={{marginTop:'12px'}}>
                {monitor.topVulns.map((v, i) => (
                  <div key={i} style={{display:'flex',alignItems:'center',gap:'12px',padding:'10px 14px',borderRadius:'8px',marginBottom:'8px',background: i===0?'rgba(231,76,60,0.08)': i<3 ?'rgba(243,156,18,0.06)':'rgba(255,255,255,0.03)'}}>
                    <div style={{minWidth:'50px',textAlign:'center',padding:'4px 8px',borderRadius:'6px',fontWeight:700,fontSize:'13px',
                      background: v.cvss_severity >= 9 ? 'rgba(231,76,60,0.2)' : v.cvss_severity >= 7 ? 'rgba(243,156,18,0.2)' : 'rgba(90,155,216,0.2)',
                      color: v.cvss_severity >= 9 ? '#e74c3c' : v.cvss_severity >= 7 ? '#f39c12' : '#5a9bd8'
                    }}>
                      {v.cvss_severity}
                    </div>
                    <div style={{flex:1}}>
                      <div style={{fontWeight:600,fontSize:'13px'}}>{v.vulnerability_name}</div>
                      <div style={{fontSize:'11px',color:'#888',marginTop:'2px'}}>{v.host}:{v.port}</div>
                    </div>
                    <div style={{fontSize:'11px',padding:'3px 8px',borderRadius:'4px',fontWeight:600,
                      background: v.threat_level === 'Critical' ? 'rgba(231,76,60,0.15)' : 'rgba(243,156,18,0.15)',
                      color: v.threat_level === 'Critical' ? '#e74c3c' : '#f39c12'
                    }}>
                      {v.threat_level}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* EC2 Fleet & Task Status */}
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'16px',marginTop:16}}>
            {/* EC2 Instances */}
            <div className="card">
              <div className="card-title"><h3>EC2 Fleet Status</h3></div>
              <div style={{marginTop:'12px'}}>
                {monitor.ec2.length === 0 ? (
                  <div style={{color:'#666',fontSize:'13px'}}>No EC2 instances found</div>
                ) : monitor.ec2.map((inst, i) => (
                  <div key={i} style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'10px 12px',borderRadius:'8px',marginBottom:'6px',background:'rgba(255,255,255,0.03)'}}>
                    <div>
                      <div style={{fontWeight:600,fontSize:'13px'}}>{inst.instanceName}</div>
                      <div style={{fontSize:'11px',color:'#888'}}>{inst.privateIpAddress} • {inst.instanceType}</div>
                    </div>
                    <div style={{fontSize:'11px',padding:'3px 10px',borderRadius:'12px',fontWeight:600,
                      background: inst.state === 'running' ? 'rgba(111,207,151,0.15)' : 'rgba(231,76,60,0.15)',
                      color: inst.state === 'running' ? '#6fcf97' : '#e74c3c'
                    }}>
                      {inst.state}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Task & Patch Status */}
            <div className="card">
              <div className="card-title"><h3>Scan & Patch Status</h3></div>
              <div style={{marginTop:'12px'}}>
                {monitor.tasks.length === 0 ? (
                  <div style={{color:'#666',fontSize:'13px'}}>No scan tasks found</div>
                ) : monitor.tasks.map((task, i) => (
                  <div key={i} style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'10px 12px',borderRadius:'8px',marginBottom:'6px',background:'rgba(255,255,255,0.03)'}}>
                    <div>
                      <div style={{fontWeight:600,fontSize:'13px'}}>{task.name}</div>
                      <div style={{fontSize:'11px',color:'#888'}}>{task.target_name || 'Unknown target'}</div>
                    </div>
                    <div style={{display:'flex',gap:'6px',alignItems:'center'}}>
                      <div style={{fontSize:'11px',padding:'3px 8px',borderRadius:'4px',fontWeight:600,
                        background: task.status?.toLowerCase() === 'done' ? 'rgba(111,207,151,0.15)' : task.status?.toLowerCase() === 'running' ? 'rgba(243,156,18,0.15)' : 'rgba(90,155,216,0.15)',
                        color: task.status?.toLowerCase() === 'done' ? '#6fcf97' : task.status?.toLowerCase() === 'running' ? '#f39c12' : '#5a9bd8'
                      }}>
                        {task.status || 'Unknown'}
                      </div>
                      {task.patched && (
                        <div style={{fontSize:'11px',padding:'3px 8px',borderRadius:'4px',fontWeight:600,background:'rgba(111,207,151,0.15)',color:'#6fcf97'}}>
                          Patched
                        </div>
                      )}
                      {task.status?.toLowerCase() === 'done' && !task.patched && (
                        <div style={{fontSize:'11px',padding:'3px 8px',borderRadius:'4px',fontWeight:600,background:'rgba(243,156,18,0.15)',color:'#f39c12'}}>
                          Unpatched
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Scan Report Timeline */}
          {monitor.reports.length > 0 && (
            <div className="card" style={{marginTop:16}}>
              <div className="card-title"><h3>Scan Report Timeline</h3></div>
              <div style={{marginTop:'12px',display:'flex',gap:'12px',flexWrap:'wrap'}}>
                {monitor.reports.map((report, i) => (
                  <div key={i} style={{flex:'1 1 300px',padding:'14px',borderRadius:'10px',border:'1px solid rgba(90,155,216,0.2)',background:'rgba(90,155,216,0.05)'}}>
                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                      <div style={{fontWeight:600,fontSize:'13px'}}>Report #{i + 1}</div>
                      <div style={{fontSize:'11px',color:'#e74c3c',fontWeight:600}}>{report.highSeverityCount} high severity</div>
                    </div>
                    <div style={{fontSize:'12px',color:'#888',marginTop:'6px'}}>{new Date(report.timestamp).toLocaleString()}</div>
                    <div style={{fontSize:'11px',color:'#aaa',marginTop:'4px'}}>{report.vulnCount} vulnerabilities found</div>
                    <div style={{fontSize:'10px',color:'#666',marginTop:'4px',wordBreak:'break-all'}}>{report.pk}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {dashLoading && !monitor && (
        <div className="card" style={{marginTop:16,textAlign:'center',padding:'24px',color:'#888'}}>
          ⏳ Loading infrastructure monitoring data...
        </div>
      )}
    </div>
  )
})
