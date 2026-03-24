import React, { useState } from 'react'
import { useData } from '../dataContext'
import Overview from './Overview'
import Vulnerabilities from './Vulnerabilities'
import AssetsInventory from './AssetsInventory'
import History from './History'
import Patching from './Patching'
import OpenVASConfig from './OpenVASConfig'

export default function Dashboard(){
  const { data, loading, error, demoMode } = useData()
  const [activeTab, setActiveTab] = useState('overview')
  const [selectedHost, setSelectedHost] = useState(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)

  if(loading) return <div className="app-loading">⏳ Loading vulnerability data...</div>
  if(error && !demoMode) return <div className="app-error">❌ Error: {error}</div>
  if(!data) return <div className="app-empty">No data returned from API.</div>

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
          <button className={`sidebar-btn${activeTab==='overview'?' active':''}`} onClick={()=> setActiveTab('overview')}>
            <span className="sidebar-emoji" aria-hidden="true">🏠</span>
            <i className="fas fa-home sidebar-icon" aria-hidden="true"></i> Overview
          </button>
          <button className={`sidebar-btn${activeTab==='vulnerabilities'?' active':''}`} onClick={()=> setActiveTab('vulnerabilities')}>
            <span className="sidebar-emoji" aria-hidden="true">🛡️</span>
            <i className="fas fa-shield-alt sidebar-icon" aria-hidden="true"></i> Vulnerabilities
          </button>
          <button className={`sidebar-btn${activeTab==='assets'?' active':''}`} onClick={()=> setActiveTab('assets')}>
            <span className="sidebar-emoji" aria-hidden="true">🖥️</span>
            <i className="fas fa-server sidebar-icon" aria-hidden="true"></i> Assets
          </button>
          <button className={`sidebar-btn${activeTab==='history'?' active':''}`} onClick={()=> setActiveTab('history')}>
            <span className="sidebar-emoji" aria-hidden="true">📜</span>
            <i className="fas fa-history sidebar-icon" aria-hidden="true"></i> History
          </button>
          <button className={`sidebar-btn${activeTab==='patching'?' active':''}`} onClick={()=> setActiveTab('patching')}>
            <span className="sidebar-emoji" aria-hidden="true">🔧</span>
            <i className="fas fa-tools sidebar-icon" aria-hidden="true"></i> Patching
          </button>
          <button className={`sidebar-btn${activeTab==='openvas'?' active':''}`} onClick={()=> setActiveTab('openvas')}>
            <span className="sidebar-emoji" aria-hidden="true">🔍</span>
            <i className="fas fa-scan sidebar-icon" aria-hidden="true"></i> OpenVAS
          </button>
        </nav>
      </aside>

      {/* Main Content */}
      <div className="main" onClick={()=>{ if(sidebarOpen) setSidebarOpen(false)}}>
        <header className="topbar">
          <button className="mobile-menu-btn" onClick={()=>setSidebarOpen(o=>!o)} aria-expanded={sidebarOpen} title="Menu">
            <span className="brand-mark small">VD</span>
          </button>
          <div className="topbar-left" />
        </header>
        <main className="content">
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
              onNavigate={(tab, payload)=>{
                if(tab === 'assets' && payload?.host){
                  setSelectedHost(payload.host)
                }
                setActiveTab(tab)
              }}
            />
          ) : activeTab === 'vulnerabilities' ? (
            <Vulnerabilities findings={findings} />
          ) : activeTab === 'assets' ? (
            <AssetsInventory findings={findings} selectedHost={selectedHost} onSelectHost={(h)=>{ setSelectedHost(h); setActiveTab('assets') }} />
          ) : activeTab === 'history' ? (
            <History />
          ) : activeTab === 'patching' ? (
            <Patching />
          ) : activeTab === 'openvas' ? (
            <OpenVASConfig />
          ) : null}
        </main>
        <footer className="footer">© 2026 Group 4 Capstone — Security Assessment Dashboard</footer>
      </div>
      </div>
    </>
  )
}
