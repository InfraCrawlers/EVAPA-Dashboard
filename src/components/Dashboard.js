import React, { useState, lazy, Suspense, useCallback, useMemo } from 'react'
import { useData } from '../dataContext'

// Lazy load heavier components for code splitting
const Overview = lazy(() => import('./Overview'))
const Vulnerabilities = lazy(() => import('./Vulnerabilities'))
const AssetsInventory = lazy(() => import('./AssetsInventory'))
const History = lazy(() => import('./History'))
const Patching = lazy(() => import('./Patching'))
const OpenVASConfig = lazy(() => import('./OpenVASConfig'))

function DashboardContent(){
  // ✅ CALL ALL HOOKS FIRST - before any conditional logic
  const { data, loading, error, demoMode } = useData()
  const [activeTab, setActiveTab] = useState('overview')
  const [selectedHost, setSelectedHost] = useState(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)

  // Memoize event handlers (must be called every render)
  const handleTabChange = useCallback((newTab, payload) => {
    if(newTab === 'assets' && payload?.host) setSelectedHost(payload.host)
    setActiveTab(newTab)
  }, [])

  const handleSidebarToggle = useCallback(() => setSidebarOpen(o => !o), [])
  const closeSidebar = useCallback(() => { if(sidebarOpen) setSidebarOpen(false) }, [sidebarOpen])

  // Memoize expensive data transformations (must be called every render, even if data is null)
  const { findings, summary, critical, high, medium, low, hosts, cves, avgSeverity } = useMemo(() => {
    if(!data) return { findings: [], summary: {}, critical: 0, high: 0, medium: 0, low: 0, hosts: 0, cves: 0, avgSeverity: 0 }
    
    const arr = Array.isArray(data) ? data : [data]
    const findings = arr.filter(x=> x.item_type === 'finding')
    const summary = arr.find(x=> x.item_type === 'report_summary') || {}

    const critical = findings.filter(x=> (x.severity_num ?? 0) >= 9).length
    const high = findings.filter(x=> (x.severity_num ?? 0) >= 7 && (x.severity_num ?? 0) < 9).length
    const medium = findings.filter(x=> (x.severity_num ?? 0) >= 4 && (x.severity_num ?? 0) < 7).length
    const low = findings.filter(x=> (x.severity_num ?? 0) < 4).length
    const hosts = new Set(findings.map(x=> x.host || x.hostname)).size
    const cves = new Set(findings.flatMap(x=> x.cves || [])).size
    const avgSeverity = findings.length ? (findings.reduce((s,x)=> s+(x.severity_num || 0), 0) / findings.length).toFixed(1) : 0
    
    return { findings, summary, critical, high, medium, low, hosts, cves, avgSeverity }
  }, [data])

  // ✅ NOW check loading/error conditions and render conditionally
  if(loading) return <div className="app-loading">⏳ Loading vulnerability data...</div>
  if(error && !demoMode) return <div className="app-error">❌ Error: {error}</div>

  return (
    <>
      {/* Demo Mode Banner */}
      {demoMode && (
        <div className="demo-banner">
          <strong>ℹ️ Demo Mode:</strong> The API is currently unavailable. Showing sample vulnerability data for demonstration purposes.
        </div>
      )}
      
      <div className="app-root">
        {/* Sidebar */}
        <aside className={`sidebar${sidebarOpen? ' open':''}`} aria-hidden={!sidebarOpen}>
        <div className="sidebar-brand">
          <div className="brand-mark">VD</div>
          <div className="brand-title">Vulnerability Dashboard</div>
        </div>
        <nav>
          <button className={`sidebar-btn${activeTab==='overview'?' active':''}`} onClick={()=> handleTabChange('overview')}>
            <span className="sidebar-emoji" aria-hidden="true">🏠</span>
            <i className="fas fa-home sidebar-icon" aria-hidden="true"></i> Overview
          </button>
          <button className={`sidebar-btn${activeTab==='vulnerabilities'?' active':''}`} onClick={()=> handleTabChange('vulnerabilities')}>
            <span className="sidebar-emoji" aria-hidden="true">🛡️</span>
            <i className="fas fa-shield-alt sidebar-icon" aria-hidden="true"></i> Vulnerabilities
          </button>
          <button className={`sidebar-btn${activeTab==='assets'?' active':''}`} onClick={()=> handleTabChange('assets')}>
            <span className="sidebar-emoji" aria-hidden="true">🖥️</span>
            <i className="fas fa-server sidebar-icon" aria-hidden="true"></i> Assets
          </button>
          <button className={`sidebar-btn${activeTab==='history'?' active':''}`} onClick={()=> handleTabChange('history')}>
            <span className="sidebar-emoji" aria-hidden="true">📜</span>
            <i className="fas fa-history sidebar-icon" aria-hidden="true"></i> History
          </button>
          <button className={`sidebar-btn${activeTab==='patching'?' active':''}`} onClick={()=> handleTabChange('patching')}>
            <span className="sidebar-emoji" aria-hidden="true">🔧</span>
            <i className="fas fa-tools sidebar-icon" aria-hidden="true"></i> Patching
          </button>
          <button className={`sidebar-btn${activeTab==='openvas'?' active':''}`} onClick={()=> handleTabChange('openvas')}>
            <span className="sidebar-emoji" aria-hidden="true">🔍</span>
            <i className="fas fa-scan sidebar-icon" aria-hidden="true"></i> OpenVAS
          </button>
        </nav>
      </aside>

      {/* Main Content */}
      <div className="main" onClick={closeSidebar}>
        <header className="topbar">
          <button className="mobile-menu-btn" onClick={handleSidebarToggle} aria-expanded={sidebarOpen} title="Menu">
            <span className="brand-mark small">VD</span>
          </button>
          <div className="topbar-left" />
        </header>
        <main className="content">
          <Suspense fallback={<div className="app-loading">⏳ Loading...</div>}>
            {activeTab === 'overview' ? (
              <Overview
                findings={findings}
                summary={summary}
                critical={critical}
                high={high}
                medium={medium}
                low={low}
                hosts={hosts}
                cves={cves}
                avgSeverity={avgSeverity}
                onNavigate={handleTabChange}
              />
            ) : activeTab === 'vulnerabilities' ? (
              <Vulnerabilities findings={findings} />
            ) : activeTab === 'assets' ? (
              <AssetsInventory findings={findings} selectedHost={selectedHost} onSelectHost={(h)=>{ setSelectedHost(h); handleTabChange('assets') }} />
            ) : activeTab === 'history' ? (
              <History />
            ) : activeTab === 'patching' ? (
              <Patching />
            ) : activeTab === 'openvas' ? (
              <OpenVASConfig />
            ) : null}
          </Suspense>
        </main>
        <footer className="footer">© 2026 Group 4 Capstone — Security Assessment Dashboard</footer>
      </div>
      </div>
    </>
  )
}

export default React.memo(DashboardContent)
