import React, { useState, useEffect, useRef } from 'react'
import openvasService from '../services/openvasService'
import { useData } from '../dataContext'
import './OpenVASConfig.css'

export default React.memo(function Patching() {
  // OpenVAS State
  const [portLists, setPortLists] = useState([])
  const [targets, setTargets] = useState([])
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [successMsg, setSuccessMsg] = useState(null)
  const [showTaskForm, setShowTaskForm] = useState(false)
  const [taskFormData, setTaskFormData] = useState({ name: '', targetName: '', configName: 'Full and fast' })
  const [patchingInProgress, setPatchingInProgress] = useState({})
  const [patchingPhases, setPatchingPhases] = useState({})
  const [alreadyPatched, setAlreadyPatched] = useState({})
  const [patchStatusesLoaded, setPatchStatusesLoaded] = useState(false)
  const [patchResults, setPatchResults] = useState({})
  const [detailModal, setDetailModal] = useState(null)
  const [scanStarting, setScanStarting] = useState({})

  const { refreshData } = useData()

  // Ref to prevent duplicate patch triggers within a single session
  const patchTriggeredRef = useRef({})

  // Step 1: Load patch statuses from Redis FIRST, then load tasks
  useEffect(() => {
    let cancelled = false
    async function init() {
      try {
        const res = await fetch('http://localhost:3005/openvas/all-patch-status')
        const data = await res.json()
        if (!cancelled && data.statuses) {
          const patched = {}
          const results = {}
          Object.entries(data.statuses).forEach(([taskName, status]) => {
            if (status.patched) {
              patched[taskName] = status
              if (status.linuxResult || status.windowsResult) {
                results[taskName] = { linux: status.linuxResult || null, windows: status.windowsResult || null }
              }
            }
          })
          setAlreadyPatched(patched)
          setPatchResults(prev => ({ ...prev, ...results }))
        }
      } catch (err) { /* ignore */ }
      if (!cancelled) {
        setPatchStatusesLoaded(true)
        loadAllData()
      }
    }
    init()
    const interval = setInterval(loadAllData, 10000)
    return () => { cancelled = true; clearInterval(interval) }
  }, [])

  // Helper: check if a task name indicates a "before patching" baseline scan
  // These scans are run to capture the state BEFORE remediation — they should NOT trigger patching
  const needsPatching = (taskName) => {
    return !/before[\s_-]*patch/i.test(taskName)
  }

  // Step 2: When tasks update AND patch statuses are loaded, auto-patch
  // any "Done" task that is NOT already recorded as patched in Redis.
  // Each task only triggers once per session (tracked by ref).
  // "before patching" baseline scans are excluded.
  useEffect(() => {
    if (!patchStatusesLoaded || tasks.length === 0) return
    tasks.forEach((task) => {
      const name = task.name
      if (
        task.status?.toLowerCase() === 'done' &&
        needsPatching(name) &&
        !alreadyPatched[name] &&
        !patchingInProgress[name] &&
        !patchTriggeredRef.current[name]
      ) {
        patchTriggeredRef.current[name] = true
        handleAutoPatching(name, task)
      }
    })
  }, [tasks, patchStatusesLoaded, alreadyPatched, patchingInProgress])

  // Load OpenVAS data
  const loadAllData = async () => {
    setLoading(true)
    try {
      const [portListsData, targetsData, tasksData] = await Promise.all([
        openvasService.getAllPortLists().catch(() => ({ port_lists: [] })),
        openvasService.getAllTargets().catch(() => ({ targets: [] })),
        openvasService.getAllTasks().catch(() => ({ tasks: [] }))
      ])

      setPortLists(portListsData.port_lists || [])
      setTargets(targetsData.targets || [])
      setTasks(tasksData.tasks || [])
      setError(null)
    } catch (err) {
      setError(`Failed to load data: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }

  // Create Scan Task
  const handleCreateTask = async (e) => {
    e.preventDefault()
    if (!taskFormData.name || !taskFormData.targetName) {
      setError('Task name and target are required')
      return
    }

    try {
      setLoading(true)
      await openvasService.createTask(taskFormData.name, taskFormData.targetName, taskFormData.configName)
      setSuccessMsg(`✅ Task "${taskFormData.name}" created successfully!`)
      setTaskFormData({ name: '', targetName: '', configName: 'Full and fast' })
      setShowTaskForm(false)
      await loadAllData()
      setTimeout(() => setSuccessMsg(null), 3000)
    } catch (err) {
      setError(`Failed to create task: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }

  // Start Scan
  const handleStartScan = async (taskName) => {
    if (!window.confirm(`Start scan for task "${taskName}"?`)) return

    try {
      setScanStarting(prev => ({ ...prev, [taskName]: true }))
      setLoading(true)
      const response = await openvasService.startScan(taskName)
      
      if (response.scan_started) {
        setSuccessMsg(`🔍 Scan "${taskName}" started successfully!`)
        await new Promise(resolve => setTimeout(resolve, 2000))
        await loadAllData()
        setTimeout(() => setSuccessMsg(null), 3000)
      } else {
        setError('Scan request was sent but may not have started properly. Check task status.')
      }
    } catch (err) {
      const errorMsg = err.response?.data?.message || err.message
      setError(`❌ Failed to start scan: ${errorMsg}. Make sure the task exists and is in a valid state.`)
      setScanStarting(prev => ({ ...prev, [taskName]: false }))
    } finally {
      setLoading(false)
    }
  }

  // Auto-trigger patching when scan is done
  // Step 1: Generate report (server-side)
  // Step 2: Start Linux patching, poll until complete
  // Step 3: Start Windows patching, poll until complete
  // Step 4: Mark complete and refresh overview data
  const handleAutoPatching = async (taskName, task) => {
    setPatchingInProgress(prev => ({ ...prev, [taskName]: true }))
    setPatchingPhases(prev => ({ ...prev, [taskName]: 'report' }))

    const target = (task.target_name || '').toLowerCase()
    const isLinux = target.includes('ubuntu') || target.includes('linux') || target.includes('debian') || target.includes('centos') || target.includes('rhel')
    const isWindows = target.includes('windows') || target.includes('win')
    // If target doesn't match either, patch both as a safe default
    const patchLinux = isLinux || (!isLinux && !isWindows)
    const patchWindows = isWindows || (!isLinux && !isWindows)
    
    try {
      // Step 0: Generate report and record in Redis
      const autoRes = await fetch('http://localhost:3005/openvas/auto-patch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          taskName,
          taskId: task.id,
          targetName: task.target_name,
          scanStatus: task.status
        })
      })
      const autoData = await autoRes.json()
      
      if (autoData.alreadyPatched) {
        setPatchingPhases(prev => ({ ...prev, [taskName]: 'already-patched' }))
        setAlreadyPatched(prev => ({ ...prev, [taskName]: { patched: true, patchedAt: autoData.patchedAt } }))
        return
      }

      let linuxResult = null
      let windowsResult = null

      // Step 1: Linux patching (only if target is Linux-based)
      if (patchLinux) {
        setPatchingPhases(prev => ({ ...prev, [taskName]: 'linux-starting' }))
        try {
          const linuxRes = await fetch('http://localhost:3005/patching/start-linux', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({})
          })
          const linuxData = await linuxRes.json()
          const linuxCommandId = linuxData.command_id

          if (linuxCommandId) {
            setPatchingPhases(prev => ({ ...prev, [taskName]: 'linux-running' }))
            for (let i = 0; i < 40; i++) {
              await new Promise(r => setTimeout(r, 15000))
              const statusRes = await fetch('http://localhost:3005/patching/check-linux-status', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ command_id: linuxCommandId })
              })
              const statusData = await statusRes.json()
              if (statusData.execution_status !== 'Still running') {
                linuxResult = statusData
                break
              }
            }
          }
        } catch (err) {
          console.error('Linux patching error:', err)
        }
      }

      // Step 2: Windows patching (only if target is Windows-based)
      if (patchWindows) {
        setPatchingPhases(prev => ({ ...prev, [taskName]: 'windows-starting' }))
        try {
          const winRes = await fetch('http://localhost:3005/patching/start-windows', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({})
          })
          const winData = await winRes.json()
          const winCommandId = winData.command_id

          if (winCommandId) {
            setPatchingPhases(prev => ({ ...prev, [taskName]: 'windows-running' }))
            for (let i = 0; i < 40; i++) {
              await new Promise(r => setTimeout(r, 15000))
              const statusRes = await fetch('http://localhost:3005/patching/check-windows-status', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ command_id: winCommandId })
              })
              const statusData = await statusRes.json()
              if (statusData.execution_status !== 'Still running') {
                windowsResult = statusData
                break
              }
            }
          }
        } catch (err) {
          console.error('Windows patching error:', err)
        }
      }

      // Store results for display
      setPatchResults(prev => ({ ...prev, [taskName]: { linux: linuxResult, windows: windowsResult } }))

      // Mark patching as complete on server
      await fetch('http://localhost:3005/patching/mark-complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          taskName,
          targetName: task.target_name,
          linuxResult,
          windowsResult
        })
      })

      setPatchingPhases(prev => ({ ...prev, [taskName]: 'completed' }))
      setAlreadyPatched(prev => ({ ...prev, [taskName]: { patched: true, patchedAt: new Date().toISOString() } }))

      // Refresh overview data with post-patch results
      if (refreshData) refreshData()
    } catch (err) {
      setPatchingPhases(prev => ({ ...prev, [taskName]: 'error' }))
      setError(`Error during patching: ${err.message}`)
      // Still mark as complete so it doesn't get stuck as in-progress in Redis
      try {
        await fetch('http://localhost:3005/patching/mark-complete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ taskName, targetName: task.target_name, linuxResult: null, windowsResult: null })
        })
      } catch (_) { /* ignore */ }
    } finally {
      setPatchingInProgress(prev => ({ ...prev, [taskName]: false }))
    }
  }


  // Get status color
  const getStatusColor = (status) => {
    switch (status?.toLowerCase()) {
      case 'done': return '#27ae60'
      case 'running': return '#f39c12'
      case 'requested': return '#3498db'
      case 'stopped': return '#e74c3c'
      default: return '#95a5a6'
    }
  }

  // Derive progress % from scan status + patching phase
  const getTaskProgress = (task) => {
    const name = task.name
    const status = task.status?.toLowerCase()

    // Patching phases (post-scan) — show patching-specific progress
    if (alreadyPatched[name]) return 100
    const phase = patchingPhases[name]
    if (phase === 'completed') return 100
    if (phase === 'windows-running') return 75
    if (phase === 'windows-starting') return 60
    if (phase === 'linux-running') return 45
    if (phase === 'linux-starting') return 30
    if (phase === 'report') return 15

    // Scan phase — use the raw API progress value directly
    if (status === 'done') return 100
    if (status === 'running') return task.progress || 1
    if (status === 'requested' || status === 'queued') return 1
    if (status === 'new') return 0
    return task.progress || 0
  }

  // Label for current phase
  const getProgressLabel = (task) => {
    const name = task.name
    const status = task.status?.toLowerCase()
    const phase = patchingPhases[name]

    if (alreadyPatched[name] && !patchingInProgress[name]) return 'Patched'
    if (phase === 'completed') return 'Patching Complete'
    if (phase === 'windows-running') return '🪟 Windows Patching...'
    if (phase === 'windows-starting') return '🪟 Starting Windows Patch...'
    if (phase === 'linux-running') return '🐧 Linux Patching...'
    if (phase === 'linux-starting') return '🐧 Starting Linux Patch...'
    if (phase === 'report') return 'Generating Report...'
    if (status === 'done') return 'Scan Complete'
    if (status === 'running') return 'Scanning'
    if (status === 'requested' || status === 'queued') return 'Queued'
    return 'Ready'
  }

  // Render Stats
  const renderStats = () => (
    <div className="stats-container">
      <div className="stat-card">
        <div className="stat-icon" style={{ background: 'linear-gradient(135deg, #ffd166, #ff9500)' }}>
          📋
        </div>
        <div className="stat-content">
          <div className="stat-value">{tasks.length}</div>
          <div className="stat-label">Scan Tasks</div>
        </div>
      </div>
      <div className="stat-card">
        <div className="stat-icon" style={{ background: 'linear-gradient(135deg, #ff3860, #ff6b9d)' }}>
          ⚠️
        </div>
        <div className="stat-content">
          <div className="stat-value">{tasks.filter(t => t.status?.toLowerCase() === 'running').length}</div>
          <div className="stat-label">Active Scans</div>
        </div>
      </div>
      <div className="stat-card">
        <div className="stat-icon" style={{ background: 'linear-gradient(135deg, #6fcf97, #38ef7d)' }}>
          ✓
        </div>
        <div className="stat-content">
          <div className="stat-value">{tasks.filter(t => t.status?.toLowerCase() === 'done').length}</div>
          <div className="stat-label">Completed Scans</div>
        </div>
      </div>
    </div>
  )

  // Render Scan Tasks
  const renderTasks = () => (
    <section className="ovconfig-section">
      <div className="ovconfig-header">
        <div>
          <h3>📋 Scan Tasks & Progress</h3>
          <p className="section-description">View and manage your vulnerability scanning jobs</p>
        </div>
        <button className="btn btn-primary btn-sm" onClick={() => setShowTaskForm(!showTaskForm)}>
          {showTaskForm ? '✕ Cancel' : '＋ New Scan Task'}
        </button>
      </div>

      {showTaskForm && (
        <form className="ovconfig-form" onSubmit={handleCreateTask}>
          <div className="form-header">Schedule a New Vulnerability Scan</div>
          <div className="form-group">
            <label>Scan Task Name</label>
            <input
              type="text"
              placeholder="e.g., Weekly Production Assessment, Monthly Compliance Scan"
              value={taskFormData.name}
              onChange={(e) => setTaskFormData({ ...taskFormData, name: e.target.value })}
            />
            <small className="form-help">Create a descriptive name for this scan task</small>
          </div>
          <div className="form-group">
            <label>Target to Scan</label>
            <select
              value={taskFormData.targetName}
              onChange={(e) => setTaskFormData({ ...taskFormData, targetName: e.target.value })}
            >
              <option value="">-- Select a Target --</option>
              {targets.map((target) => (
                <option key={target.id || target.target_id} value={target.name}>
                  {target.name}
                </option>
              ))}
            </select>
            <small className="form-help">Choose which target to scan</small>
          </div>
          <div className="form-group">
            <label>Scan Profile</label>
            <select
              value={taskFormData.configName}
              onChange={(e) => setTaskFormData({ ...taskFormData, configName: e.target.value })}
            >
              <option value="Full and fast">Full and fast - Thorough but quick</option>
              <option value="Discovery">Discovery - Fast port discovery</option>
              <option value="Full">Full - Comprehensive security audit</option>
            </select>
            <small className="form-help">Select scanning intensity</small>
          </div>
          <button type="submit" className="btn btn-success" disabled={loading}>
            {loading ? '⏳ Creating...' : '✓ Create Scan Task'}
          </button>
        </form>
      )}

      <div className="ovconfig-tasks-list">
        {tasks.length === 0 ? (
          <div className="empty-state-full">
            <div className="empty-icon">📋</div>
            <div>No scan tasks created yet</div>
            <small>Create your first scan task to start vulnerability assessments</small>
          </div>
        ) : (
          tasks.map((task) => (
            <div key={task.id || task.task_id} className="ovconfig-task-card">
              <div className="task-header">
                <div className="task-content">
                  <div className="task-title-group">
                    <div className="task-icon">🧪</div>
                    <div className="task-name">{task.name}</div>
                  </div>
                  <div className="task-meta">
                    <span className="task-config">💡 {task.config_name || task.config || 'Standard'}</span>
                  </div>
                </div>
                <div className="task-status-badge" style={{
                  backgroundColor: task.status?.toLowerCase() === 'done' ? 'rgba(111, 207, 151, 0.15)' : 
                                   task.status?.toLowerCase() === 'running' ? 'rgba(255, 209, 102, 0.15)' :
                                   'rgba(90, 155, 216, 0.15)',
                  color: task.status?.toLowerCase() === 'done' ? '#6fcf97' : 
                         task.status?.toLowerCase() === 'running' ? '#ffd166' : '#5a9bd8'
                }}>
                  {task.status?.toUpperCase() || 'UNKNOWN'}
                </div>
              </div>

              <div className="task-info">
                <div className="info-item">
                  <span className="info-icon">🎯</span>
                  <div className="info-text">
                    <small className="info-label">Target</small>
                    <div className="info-value">{task.target_name || task.target || 'Unknown'}</div>
                  </div>
                </div>
                <div className="info-item">
                  <span className="info-icon">⏱️</span>
                  <div className="info-text">
                    <small className="info-label">Progress</small>
                    <div className="info-value">{getTaskProgress(task)}% — {getProgressLabel(task)}</div>
                  </div>
                </div>
              </div>

              <div className="task-progress-container">
                <div className="progress-bar">
                  <div
                    className="progress-fill"
                    style={{ width: `${getTaskProgress(task)}%`, backgroundColor: patchingPhases[task.name] ? '#f39c12' : getStatusColor(task.status), transition: 'width 0.6s ease' }}
                  ></div>
                </div>
              </div>

              <div className="task-actions">
                {task.status?.toLowerCase() !== 'done' && task.status?.toLowerCase() !== 'running' && (
                  <button
                    className="btn btn-sm btn-success"
                    onClick={() => handleStartScan(task.name)}
                    disabled={loading || scanStarting[task.name] || patchingInProgress[task.name]}
                  >
                    {scanStarting[task.name] ? '⏳ Starting...' : '▶ Start Scan'}
                  </button>
                )}
                {task.status?.toLowerCase() === 'running' && (
                  <div style={{ fontSize: '13px', color: '#ffd166', fontWeight: 600 }}>
                    ⏳ Scanning in progress...
                  </div>
                )}
                {task.status?.toLowerCase() === 'done' && (
                  <div style={{ fontSize: '13px', fontWeight: 600, color: alreadyPatched[task.name] ? '#6fcf97' : patchingInProgress[task.name] ? '#ffd166' : !needsPatching(task.name) ? '#a8b6c5' : '#5a9bd8' }}>
                    {alreadyPatched[task.name] && !patchingInProgress[task.name]
                      ? `✅ Patched on ${new Date(alreadyPatched[task.name].patchedAt).toLocaleString()}`
                      : patchingInProgress[task.name]
                        ? (() => {
                            const phase = patchingPhases[task.name]
                            if (phase === 'report') return '📋 Generating report...'
                            if (phase === 'linux-starting') return '🐧 Starting Linux patching...'
                            if (phase === 'linux-running') return '🐧 Linux patching running...'
                            if (phase === 'windows-starting') return '🪟 Starting Windows patching...'
                            if (phase === 'windows-running') return '🪟 Windows patching running...'
                            return '⏳ Auto-patching in progress...'
                          })()
                        : !needsPatching(task.name)
                          ? '📊 Baseline Scan (no patching needed)'
                          : '✅ Scan Complete'}
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  )

  // Main component render
  return (
    <div className="page openvas-config-page">
      <header className="page-header">
        <div className="header-content">
          <h2>🔧 Patching & Vulnerability Scanning</h2>
          <p className="muted">Scan → Report → Patch | Automated workflow triggered when scan completes</p>
        </div>
        <button className="btn btn-sm" style={{ background: 'rgba(111, 207, 151, 0.15)', color: '#6fcf97', border: '1px solid rgba(111, 207, 151, 0.3)' }} onClick={loadAllData}>
          🔄 Refresh
        </button>
      </header>

      {error && <div className="alert alert-danger">{error}</div>}
      {successMsg && <div className="alert alert-success">{successMsg}</div>}

      {renderStats()}

      {/* Workflow bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '12px 18px', marginBottom: '20px', borderRadius: '10px', background: 'rgba(90,155,216,0.08)', border: '1px solid rgba(90,155,216,0.15)', fontSize: '13px', color: '#a8b6c5', flexWrap: 'wrap' }}>
        <span style={{ fontWeight: 600, color: '#e6eef6', marginRight: '6px' }}>⚙️ Workflow:</span>
        <span>Create Task</span><span style={{ color: '#5a9bd8' }}>→</span>
        <span>Start Scan</span><span style={{ color: '#5a9bd8' }}>→</span>
        <span>Generate Report</span><span style={{ color: '#5a9bd8' }}>→</span>
        <span>Auto-Patch (Linux + Windows)</span><span style={{ color: '#5a9bd8' }}>→</span>
        <span>Dashboard Refresh</span>
      </div>

      <div className="ovconfig-container">
        {/* Tasks/Scanning Section - FIRST */}
        {renderTasks()}

        {/* Patching Info Section - Shows only for patchable tasks (excludes "before patching" baseline scans) */}
        {tasks.some(t => t.status?.toLowerCase() === 'done' && needsPatching(t.name)) && (
          <section className="ovconfig-section">
            <div className="ovconfig-header">
              <div>
                <h3>🔧 Automated Patching</h3>
                <p className="section-description">Patching status for completed scans (baseline "before patching" scans are excluded)</p>
              </div>
            </div>

            <div style={{ padding: '20px', backgroundColor: 'rgba(111, 207, 151, 0.08)', borderRadius: '10px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100%, 1fr))', gap: '20px' }}>
                {tasks.filter(t => t.status?.toLowerCase() === 'done' && needsPatching(t.name)).map((task) => (
                  <div key={task.id || task.task_id} style={{ padding: '15px', backgroundColor: 'rgba(255, 255, 255, 0.05)', borderRadius: '8px', border: '1px solid rgba(111, 207, 151, 0.3)' }}>
                    <div style={{ fontWeight: 600, marginBottom: '12px', fontSize: '14px' }}>
                      🧪 {task.name}
                    </div>
                    <div style={{ fontSize: '13px', lineHeight: '1.8', color: '#bbb' }}>
                      {/* Report phase */}
                      {patchingPhases[task.name] === 'report' && (
                        <div style={{ padding: '8px 12px', backgroundColor: 'rgba(90, 155, 216, 0.1)', borderRadius: '6px', marginTop: '8px' }}>
                          📋 Generating scan report...
                        </div>
                      )}
                      {/* Linux patching phases */}
                      {patchingPhases[task.name] === 'linux-starting' && (
                        <div style={{ padding: '8px 12px', backgroundColor: 'rgba(243, 156, 18, 0.1)', borderRadius: '6px', marginTop: '8px' }}>
                          🐧 Starting Linux patching playbook...
                        </div>
                      )}
                      {patchingPhases[task.name] === 'linux-running' && (
                        <div style={{ padding: '8px 12px', backgroundColor: 'rgba(243, 156, 18, 0.1)', borderRadius: '6px', marginTop: '8px' }}>
                          🐧 Linux patching running... (polling every 15s)
                        </div>
                      )}
                      {/* Windows patching phases */}
                      {patchingPhases[task.name] === 'windows-starting' && (
                        <div style={{ padding: '8px 12px', backgroundColor: 'rgba(243, 156, 18, 0.1)', borderRadius: '6px', marginTop: '8px' }}>
                          🐧 Linux done • 🪟 Starting Windows patching...
                        </div>
                      )}
                      {patchingPhases[task.name] === 'windows-running' && (
                        <div style={{ padding: '8px 12px', backgroundColor: 'rgba(243, 156, 18, 0.1)', borderRadius: '6px', marginTop: '8px' }}>
                          🐧 Linux ✅ • 🪟 Windows patching running... (polling every 15s)
                        </div>
                      )}
                      {/* Completed with results */}
                      {patchingPhases[task.name] === 'completed' && (
                        <div style={{ padding: '12px', backgroundColor: 'rgba(111, 207, 151, 0.1)', borderRadius: '6px', marginTop: '8px' }}>
                          <div style={{ fontWeight: 600, marginBottom: '8px' }}>✅ Patching Complete</div>
                          {patchResults[task.name]?.linux && (
                            <div style={{ marginBottom: '8px', padding: '8px', backgroundColor: 'rgba(0,0,0,0.15)', borderRadius: '4px' }}>
                              <div style={{ fontWeight: 600, marginBottom: '4px' }}>🐧 Linux: {patchResults[task.name].linux.overall_status || patchResults[task.name].linux.execution_status}</div>
                              {patchResults[task.name].linux.summary && (
                                <div style={{ fontSize: '12px', color: '#aaa' }}>
                                  OK: {patchResults[task.name].linux.summary.ok} • Changed: {patchResults[task.name].linux.summary.changed} • Failed: {patchResults[task.name].linux.summary.failed} • Skipped: {patchResults[task.name].linux.summary.skipped}
                                </div>
                              )}
                              {patchResults[task.name].linux.tasks && (
                                <div style={{ marginTop: '6px', fontSize: '11px' }}>
                                  {patchResults[task.name].linux.tasks.map((t, i) => (
                                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
                                      <span>{t.task}</span>
                                      <span style={{ color: t.status === 'changed' ? '#ffd166' : t.status === 'failed' ? '#e74c3c' : '#6fcf97' }}>{t.status}</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                          {patchResults[task.name]?.windows && (
                            <div style={{ padding: '8px', backgroundColor: 'rgba(0,0,0,0.15)', borderRadius: '4px' }}>
                              <div style={{ fontWeight: 600, marginBottom: '4px' }}>🪟 Windows: {patchResults[task.name].windows.overall_status || patchResults[task.name].windows.execution_status}</div>
                              {patchResults[task.name].windows.summary && (
                                <div style={{ fontSize: '12px', color: '#aaa' }}>
                                  OK: {patchResults[task.name].windows.summary.ok} • Changed: {patchResults[task.name].windows.summary.changed} • Failed: {patchResults[task.name].windows.summary.failed} • Skipped: {patchResults[task.name].windows.summary.skipped}
                                </div>
                              )}
                              {patchResults[task.name].windows.tasks && (
                                <div style={{ marginTop: '6px', fontSize: '11px' }}>
                                  {patchResults[task.name].windows.tasks.map((t, i) => (
                                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
                                      <span>{t.task}</span>
                                      <span style={{ color: t.status === 'changed' ? '#ffd166' : t.status === 'failed' ? '#e74c3c' : '#6fcf97' }}>{t.status}</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                      {/* Error */}
                      {patchingPhases[task.name] === 'error' && (
                        <div style={{ padding: '8px 12px', backgroundColor: 'rgba(231, 76, 60, 0.1)', borderRadius: '6px', marginTop: '8px' }}>
                          ❌ Patching failed
                        </div>
                      )}
                      {/* Already patched */}
                      {(patchingPhases[task.name] === 'already-patched' || (!patchingPhases[task.name] && alreadyPatched[task.name])) && (
                        <div style={{ padding: '8px 12px', backgroundColor: 'rgba(111, 207, 151, 0.1)', borderRadius: '6px', marginTop: '8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <span style={{ fontWeight: 600 }}>✅ Patched on {new Date(alreadyPatched[task.name]?.patchedAt).toLocaleString()}</span>
                          {patchResults[task.name] && (
                            <button
                              onClick={() => setDetailModal(task.name)}
                              style={{ padding: '4px 14px', borderRadius: '6px', border: '1px solid rgba(111,207,151,0.4)', background: 'rgba(111,207,151,0.12)', color: '#6fcf97', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
                            >
                              View Details
                            </button>
                          )}
                        </div>
                      )}
                      {/* Awaiting */}
                      {!patchingPhases[task.name] && !alreadyPatched[task.name] && (
                        <div style={{ padding: '8px 12px', backgroundColor: 'rgba(90, 155, 216, 0.1)', borderRadius: '6px', marginTop: '8px' }}>
                          ✅ Scan Complete — Awaiting patch trigger
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}
      </div>

      <footer className="ovconfig-footer">
        <div className="footer-content">
          <small>🔗 OpenVAS: edonu024me.execute-api.us-east-1.amazonaws.com/v1 | Patching: sgjc9f1kv7.execute-api.us-east-1.amazonaws.com/prod</small>
        </div>
        <div className="footer-stats">
          <small>⚡ Scan → Report → Linux Patch → Windows Patch → Refresh Dashboard</small>
        </div>
      </footer>

      {/* Patch Details Modal */}
      {detailModal && patchResults[detailModal] && (
        <div onClick={() => setDetailModal(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, backdropFilter: 'blur(4px)' }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#1a1d23', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.1)', padding: '28px', width: '90%', maxWidth: '700px', maxHeight: '85vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }}>
            {/* Modal Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: '18px' }}>🔧 Patch Report</div>
                <div style={{ fontSize: '13px', color: '#888', marginTop: '4px' }}>{detailModal}</div>
              </div>
              <button onClick={() => setDetailModal(null)} style={{ background: 'rgba(255,255,255,0.08)', border: 'none', color: '#aaa', fontSize: '18px', width: '36px', height: '36px', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
            </div>

            <div style={{ fontSize: '13px', color: '#888', marginBottom: '20px' }}>
              Patched on {new Date(alreadyPatched[detailModal]?.patchedAt).toLocaleString()} • Target: {alreadyPatched[detailModal]?.targetName || 'N/A'}
            </div>

            {(() => {
              const hasLinux = patchResults[detailModal].linux?.overall_status
              const hasWindows = patchResults[detailModal].windows?.overall_status
              const cols = (hasLinux && hasWindows) ? '1fr 1fr' : '1fr'
              return (
                <div style={{ display: 'grid', gridTemplateColumns: cols, gap: '16px' }}>
                  {hasLinux && (
                    <div style={{ padding: '16px', borderRadius: '10px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
                      <div style={{ fontWeight: 600, fontSize: '14px', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        🐧 Linux Patching
                        <span style={{ fontSize: '11px', padding: '2px 10px', borderRadius: '8px', fontWeight: 600,
                          background: patchResults[detailModal].linux.overall_status === 'Success' ? 'rgba(111,207,151,0.15)' : 'rgba(231,76,60,0.15)',
                          color: patchResults[detailModal].linux.overall_status === 'Success' ? '#6fcf97' : '#e74c3c'
                        }}>{patchResults[detailModal].linux.overall_status}</span>
                      </div>
                      {patchResults[detailModal].linux?.summary && (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '8px', marginBottom: '14px' }}>
                          <div style={{ textAlign: 'center', padding: '8px', borderRadius: '8px', background: 'rgba(111,207,151,0.1)' }}>
                            <div style={{ fontSize: '18px', fontWeight: 700, color: '#6fcf97' }}>{patchResults[detailModal].linux.summary.ok}</div>
                            <div style={{ fontSize: '10px', color: '#888' }}>OK</div>
                          </div>
                          <div style={{ textAlign: 'center', padding: '8px', borderRadius: '8px', background: 'rgba(255,209,102,0.1)' }}>
                            <div style={{ fontSize: '18px', fontWeight: 700, color: '#ffd166' }}>{patchResults[detailModal].linux.summary.changed}</div>
                            <div style={{ fontSize: '10px', color: '#888' }}>Changed</div>
                          </div>
                          <div style={{ textAlign: 'center', padding: '8px', borderRadius: '8px', background: 'rgba(231,76,60,0.1)' }}>
                            <div style={{ fontSize: '18px', fontWeight: 700, color: '#e74c3c' }}>{patchResults[detailModal].linux.summary.failed}</div>
                            <div style={{ fontSize: '10px', color: '#888' }}>Failed</div>
                          </div>
                          <div style={{ textAlign: 'center', padding: '8px', borderRadius: '8px', background: 'rgba(150,150,150,0.1)' }}>
                            <div style={{ fontSize: '18px', fontWeight: 700, color: '#888' }}>{patchResults[detailModal].linux.summary.skipped}</div>
                            <div style={{ fontSize: '10px', color: '#888' }}>Skipped</div>
                          </div>
                        </div>
                      )}
                      {patchResults[detailModal].linux?.tasks && (
                        <div>
                          <div style={{ fontSize: '11px', fontWeight: 600, color: '#888', marginBottom: '6px' }}>Playbook Tasks</div>
                          {patchResults[detailModal].linux.tasks.map((t, i) => (
                            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 8px', borderRadius: '4px', marginBottom: '3px', background: 'rgba(255,255,255,0.03)', fontSize: '12px' }}>
                              <span style={{ color: '#ccc' }}>{t.task}</span>
                              <span style={{ fontWeight: 600, color: t.status === 'changed' ? '#ffd166' : t.status === 'failed' ? '#e74c3c' : '#6fcf97' }}>{t.status}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                  {hasWindows && (
                    <div style={{ padding: '16px', borderRadius: '10px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
                      <div style={{ fontWeight: 600, fontSize: '14px', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        🪟 Windows Patching
                        <span style={{ fontSize: '11px', padding: '2px 10px', borderRadius: '8px', fontWeight: 600,
                          background: patchResults[detailModal].windows.overall_status === 'Success' ? 'rgba(111,207,151,0.15)' : 'rgba(231,76,60,0.15)',
                          color: patchResults[detailModal].windows.overall_status === 'Success' ? '#6fcf97' : '#e74c3c'
                        }}>{patchResults[detailModal].windows.overall_status}</span>
                      </div>
                      {patchResults[detailModal].windows?.summary && (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '8px', marginBottom: '14px' }}>
                          <div style={{ textAlign: 'center', padding: '8px', borderRadius: '8px', background: 'rgba(111,207,151,0.1)' }}>
                            <div style={{ fontSize: '18px', fontWeight: 700, color: '#6fcf97' }}>{patchResults[detailModal].windows.summary.ok}</div>
                            <div style={{ fontSize: '10px', color: '#888' }}>OK</div>
                          </div>
                          <div style={{ textAlign: 'center', padding: '8px', borderRadius: '8px', background: 'rgba(255,209,102,0.1)' }}>
                            <div style={{ fontSize: '18px', fontWeight: 700, color: '#ffd166' }}>{patchResults[detailModal].windows.summary.changed}</div>
                            <div style={{ fontSize: '10px', color: '#888' }}>Changed</div>
                          </div>
                          <div style={{ textAlign: 'center', padding: '8px', borderRadius: '8px', background: 'rgba(231,76,60,0.1)' }}>
                            <div style={{ fontSize: '18px', fontWeight: 700, color: '#e74c3c' }}>{patchResults[detailModal].windows.summary.failed}</div>
                            <div style={{ fontSize: '10px', color: '#888' }}>Failed</div>
                          </div>
                          <div style={{ textAlign: 'center', padding: '8px', borderRadius: '8px', background: 'rgba(150,150,150,0.1)' }}>
                            <div style={{ fontSize: '18px', fontWeight: 700, color: '#888' }}>{patchResults[detailModal].windows.summary.skipped}</div>
                            <div style={{ fontSize: '10px', color: '#888' }}>Skipped</div>
                          </div>
                        </div>
                      )}
                      {patchResults[detailModal].windows?.tasks && (
                        <div>
                          <div style={{ fontSize: '11px', fontWeight: 600, color: '#888', marginBottom: '6px' }}>Playbook Tasks</div>
                          {patchResults[detailModal].windows.tasks.map((t, i) => (
                            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 8px', borderRadius: '4px', marginBottom: '3px', background: 'rgba(255,255,255,0.03)', fontSize: '12px' }}>
                              <span style={{ color: '#ccc' }}>{t.task}</span>
                              <span style={{ fontWeight: 600, color: t.status === 'changed' ? '#ffd166' : t.status === 'failed' ? '#e74c3c' : '#6fcf97' }}>{t.status}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })()}
          </div>
        </div>
      )}
    </div>
  )
})
