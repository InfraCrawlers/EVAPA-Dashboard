import React, { useState, useEffect } from 'react'
import openvasService from '../services/openvasService'
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
  const [completedScans, setCompletedScans] = useState({})
  const [patchingPhases, setPatchingPhases] = useState({})
  const [reportCheckInProgress, setReportCheckInProgress] = useState({})

  // Load data on mount and set up auto-monitoring
  useEffect(() => {
    loadAllData()
    const interval = setInterval(loadAllData, 10000) // Check every 10 seconds for scan completion
    return () => clearInterval(interval)
  }, [])

  // Monitor scan completion and trigger patching
  useEffect(() => {
    tasks.forEach((task) => {
      if (task.status?.toLowerCase() === 'done' && !completedScans[task.name] && !patchingInProgress[task.name]) {
        setCompletedScans(prev => ({ ...prev, [task.name]: true }))
        handleAutoPatching(task.name, task)
      }
    })
  }, [tasks, completedScans, patchingInProgress])

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
    } finally {
      setLoading(false)
    }
  }

  // Auto-trigger patching when scan is done
  const handleAutoPatching = async (taskName, task) => {
    setPatchingInProgress(prev => ({ ...prev, [taskName]: true }))
    setReportCheckInProgress(prev => ({ ...prev, [taskName]: true }))
    
    try {
      // Phase 1: Check if report is generated in DynamoDB
      setPatchingPhases(prev => ({ ...prev, [taskName]: 'checking-report' }))
      
      let reportExists = false
      let checkAttempts = 0
      const maxAttempts = 30 // Check for up to 5 minutes (30 * 10 seconds)
      
      while (!reportExists && checkAttempts < maxAttempts) {
        try {
          const checkResponse = await fetch(`http://localhost:3005/openvas/scan-reports/${encodeURIComponent(taskName)}`, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' }
          })
          
          const checkData = await checkResponse.json()
          
          if (checkData.exists) {
            reportExists = true
            setPatchingPhases(prev => ({ ...prev, [taskName]: 'report-found' }))
            break
          } else {
            checkAttempts++
            if (checkAttempts < maxAttempts) {
              await new Promise(resolve => setTimeout(resolve, 10000)) // Wait 10 seconds before next check
            }
          }
        } catch (err) {
          checkAttempts++
          if (checkAttempts < maxAttempts) {
            await new Promise(resolve => setTimeout(resolve, 10000))
          }
        }
      }
      
      setReportCheckInProgress(prev => ({ ...prev, [taskName]: false }))
      
      // If report not found after all attempts, show error but continue with patching attempt
      if (!reportExists) {
        setSuccessMsg(`⚠️ Report generation taking longer, initiating patching anyway for "${taskName}"`)
      } else {
        setSuccessMsg(`✅ Report generated and found in DynamoDB! Initiating patching for "${taskName}"`)
      }
      
      // Phase 2: Trigger auto-patching
      setPatchingPhases(prev => ({ ...prev, [taskName]: 'patching' }))
      
      const response = await fetch('http://localhost:3005/openvas/auto-patch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          taskName,
          taskId: task.id,
          targetName: task.target_name,
          scanStatus: task.status
        })
      })

      const data = await response.json()
      
      if (response.ok) {
        setPatchingPhases(prev => ({ ...prev, [taskName]: 'completed' }))
        setSuccessMsg(`🚀 Report generated! Patching triggered via AWS Lambda for "${taskName}"`)
        setTimeout(() => setSuccessMsg(null), 5000)
      } else {
        setPatchingPhases(prev => ({ ...prev, [taskName]: 'error' }))
        setError(`Failed to trigger patching: ${data.message}`)
      }
    } catch (err) {
      setPatchingPhases(prev => ({ ...prev, [taskName]: 'error' }))
      setError(`Error triggering patching: ${err.message}`)
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
                    <div className="info-value">{task.progress || 0}% Complete</div>
                  </div>
                </div>
              </div>

              <div className="task-progress-container">
                <div className="progress-bar">
                  <div
                    className="progress-fill"
                    style={{ width: `${task.progress || 0}%`, backgroundColor: getStatusColor(task.status) }}
                  ></div>
                </div>
              </div>

              <div className="task-actions">
                {task.status?.toLowerCase() !== 'done' && task.status?.toLowerCase() !== 'running' && (
                  <button
                    className="btn btn-sm btn-success"
                    onClick={() => handleStartScan(task.name)}
                    disabled={loading}
                  >
                    ▶ Start Scan
                  </button>
                )}
                {task.status?.toLowerCase() === 'running' && (
                  <div style={{ fontSize: '13px', color: '#ffd166', fontWeight: 600 }}>
                    ⏳ Scanning in progress...
                  </div>
                )}
                {task.status?.toLowerCase() === 'done' && (
                  <div style={{ fontSize: '13px', color: '#6fcf97', fontWeight: 600 }}>
                    ✅ Scan Complete - Auto-patching in progress
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

      <div className="ovconfig-container">
        {/* Tasks/Scanning Section - FIRST */}
        {renderTasks()}

        {/* Patching Info Section - Shows only when scans are done */}
        {tasks.some(t => t.status?.toLowerCase() === 'done') && (
          <section className="ovconfig-section">
            <div className="ovconfig-header">
              <div>
                <h3>🔧 Automated Patching</h3>
                <p className="section-description">Patching status for completed scans</p>
              </div>
            </div>

            <div style={{ padding: '20px', backgroundColor: 'rgba(111, 207, 151, 0.08)', borderRadius: '10px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100%, 1fr))', gap: '20px' }}>
                {tasks.filter(t => t.status?.toLowerCase() === 'done').map((task) => (
                  <div key={task.id || task.task_id} style={{ padding: '15px', backgroundColor: 'rgba(255, 255, 255, 0.05)', borderRadius: '8px', border: '1px solid rgba(111, 207, 151, 0.3)' }}>
                    <div style={{ fontWeight: 600, marginBottom: '12px', fontSize: '14px' }}>
                      🧪 {task.name}
                    </div>
                    <div style={{ fontSize: '13px', lineHeight: '2', color: '#bbb' }}>
                      {reportCheckInProgress[task.name] && (
                        <>
                          <div>✅ Phase 1: Scan Complete</div>
                          <div style={{ padding: '8px 12px', backgroundColor: 'rgba(90, 155, 216, 0.1)', borderRadius: '6px', marginTop: '8px' }}>
                            ⏳ Phase 2: Checking for report in DynamoDB...
                          </div>
                        </>
                      )}
                      {patchingPhases[task.name] === 'report-found' && (
                        <>
                          <div>✅ Phase 1: Scan Complete</div>
                          <div style={{ padding: '8px 12px', backgroundColor: 'rgba(111, 207, 151, 0.1)', borderRadius: '6px', marginTop: '8px' }}>
                            ✅ Phase 2: Report Generated (in DynamoDB)
                          </div>
                        </>
                      )}
                      {patchingPhases[task.name] === 'patching' && (
                        <>
                          <div>✅ Phase 1: Scan Complete</div>
                          <div>✅ Phase 2: Report Generated</div>
                          <div style={{ padding: '8px 12px', backgroundColor: 'rgba(243, 156, 18, 0.1)', borderRadius: '6px', marginTop: '8px' }}>
                            🚀 Phase 3: Triggering AWS Lambda for patching...
                          </div>
                        </>
                      )}
                      {patchingPhases[task.name] === 'completed' && (
                        <>
                          <div>✅ Phase 1: Scan Complete</div>
                          <div>✅ Phase 2: Report Generated (in DynamoDB)</div>
                          <div style={{ padding: '8px 12px', backgroundColor: 'rgba(111, 207, 151, 0.1)', borderRadius: '6px', marginTop: '8px' }}>
                            ✅ Phase 3: Patching Applied
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* Workflow Overview */}
        <section className="ovconfig-section">
          <div className="ovconfig-header">
            <div>
              <h3>⚙️ Workflow Overview</h3>
              <p className="section-description">Complete automated scanning and patching pipeline</p>
            </div>
          </div>
          
          <div style={{ padding: '20px', backgroundColor: 'rgba(90, 155, 216, 0.08)', borderRadius: '10px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px' }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '32px', marginBottom: '10px' }}>1️⃣</div>
                <div style={{ fontWeight: 600, marginBottom: '5px' }}>Create Scan Task</div>
                <div style={{ fontSize: '12px', color: '#888' }}>Define target and scan profile</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '32px', marginBottom: '10px' }}>2️⃣</div>
                <div style={{ fontWeight: 600, marginBottom: '5px' }}>Start Scan</div>
                <div style={{ fontSize: '12px', color: '#888' }}>OpenVAS scans for vulnerabilities</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '32px', marginBottom: '10px' }}>3️⃣</div>
                <div style={{ fontWeight: 600, marginBottom: '5px' }}>Generate Report</div>
                <div style={{ fontSize: '12px', color: '#888' }}>Report stored in DynamoDB when done</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '32px', marginBottom: '10px' }}>4️⃣</div>
                <div style={{ fontWeight: 600, marginBottom: '5px' }}>Auto-Patch</div>
                <div style={{ fontSize: '12px', color: '#888' }}>AWS Lambda applies patches</div>
              </div>
            </div>
          </div>
        </section>
      </div>

      <footer className="ovconfig-footer">
        <div className="footer-content">
          <small>🔗 OpenVAS Endpoint: edonu024me.execute-api.us-east-1.amazonaws.com/v1</small>
        </div>
        <div className="footer-stats">
          <small>⚡ Patching workflow is fully automated upon scan completion</small>
        </div>
      </footer>
    </div>
  )
})
