import React, { useState, useEffect } from 'react'
import openvasService from '../services/openvasService'
import './OpenVASConfig.css'

export default function OpenVASConfig() {
  // State Management
  const [portLists, setPortLists] = useState([])
  const [targets, setTargets] = useState([])
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [successMsg, setSuccessMsg] = useState(null)

  // Form States
  const [showPortForm, setShowPortForm] = useState(false)
  const [showTargetForm, setShowTargetForm] = useState(false)
  const [showTaskForm, setShowTaskForm] = useState(false)

  const [portFormData, setPortFormData] = useState({ name: '', portRange: '' })
  const [targetFormData, setTargetFormData] = useState({ name: '', hosts: '', portListName: '' })
  const [taskFormData, setTaskFormData] = useState({ name: '', targetName: '', configName: 'Full and fast' })

  // Load data on mount
  useEffect(() => {
    loadAllData()
    const interval = setInterval(loadAllData, 30000) // Refresh every 30 seconds
    return () => clearInterval(interval)
  }, [])

  // Load all OpenVAS data
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
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  // Create Port List
  const handleCreatePortList = async (e) => {
    e.preventDefault()
    if (!portFormData.name || !portFormData.portRange) {
      setError('Port name and range are required')
      return
    }

    try {
      setLoading(true)
      await openvasService.createPortList(portFormData.name, portFormData.portRange)
      setSuccessMsg(`✅ Port list "${portFormData.name}" created successfully!`)
      setPortFormData({ name: '', portRange: '' })
      setShowPortForm(false)
      await loadAllData()
      setTimeout(() => setSuccessMsg(null), 3000)
    } catch (err) {
      setError(`Failed to create port list: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }

  // Create Target
  const handleCreateTarget = async (e) => {
    e.preventDefault()
    if (!targetFormData.name || !targetFormData.hosts || !targetFormData.portListName) {
      setError('All target fields are required')
      return
    }

    try {
      setLoading(true)
      const hostsList = targetFormData.hosts.split(',').map(h => h.trim())
      await openvasService.createTarget(targetFormData.name, hostsList, targetFormData.portListName)
      setSuccessMsg(`✅ Target "${targetFormData.name}" created successfully!`)
      setTargetFormData({ name: '', hosts: '', portListName: '' })
      setShowTargetForm(false)
      await loadAllData()
      setTimeout(() => setSuccessMsg(null), 3000)
    } catch (err) {
      setError(`Failed to create target: ${err.message}`)
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
      await openvasService.startScan(taskName)
      setSuccessMsg(`🔍 Scan "${taskName}" started successfully!`)
      await loadAllData()
      setTimeout(() => setSuccessMsg(null), 3000)
    } catch (err) {
      setError(`Failed to start scan: ${err.message}`)
    } finally {
      setLoading(false)
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

  // Render Port Lists Section
  const renderPortLists = () => (
    <section className="ovconfig-section">
      <div className="ovconfig-header">
        <div>
          <h3>🔌 Port Lists</h3>
          <p className="section-description">Define which ports to scan during vulnerability assessments</p>
        </div>
        <button className="btn btn-primary btn-sm" onClick={() => setShowPortForm(!showPortForm)}>
          {showPortForm ? '✕ Cancel' : '＋ New Port List'}
        </button>
      </div>

      {showPortForm && (
        <form className="ovconfig-form" onSubmit={handleCreatePortList}>
          <div className="form-header">Create a Port Scanning Profile</div>
          <div className="form-group">
            <label>Port List Name</label>
            <input
              type="text"
              placeholder="e.g., Web Services Ports, Critical Services, All Ports"
              value={portFormData.name}
              onChange={(e) => setPortFormData({ ...portFormData, name: e.target.value })}
            />
            <small className="form-help">Give your port list a meaningful name</small>
          </div>
          <div className="form-group">
            <label>Port Range</label>
            <input
              type="text"
              placeholder="e.g., 80,443,3389 or 1-65535"
              value={portFormData.portRange}
              onChange={(e) => setPortFormData({ ...portFormData, portRange: e.target.value })}
            />
            <small className="form-help">Use comma-separated ports or ranges (e.g., 1-1024, 8000-9000)</small>
          </div>
          <button type="submit" className="btn btn-success" disabled={loading}>
            {loading ? '⏳ Creating...' : '✓ Create Port List'}
          </button>
        </form>
      )}

      <div className="ovconfig-grid">
        {portLists.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">🔌</div>
            <div>No port lists configured</div>
            <small>Create your first port list to get started</small>
          </div>
        ) : (
          portLists.map((port) => (
            <div key={port.id || port.port_list_id} className="ovconfig-card">
              <div className="card-header">
                <div className="card-icon">📑</div>
                <div className="card-title">{port.name}</div>
              </div>
              <div className="card-info">
                <div className="info-row">
                  <span className="info-label">ID:</span>
                  <span className="info-value">{(port.id || port.port_list_id)?.substring(0, 8) || 'N/A'}...</span>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  )

  // Render Targets Section
  const renderTargets = () => (
    <section className="ovconfig-section">
      <div className="ovconfig-header">
        <div>
          <h3>🎯 Targets (Assets)</h3>
          <p className="section-description">Add and manage the assets you want to scan</p>
        </div>
        <button className="btn btn-primary btn-sm" onClick={() => setShowTargetForm(!showTargetForm)}>
          {showTargetForm ? '✕ Cancel' : '＋ New Target'}
        </button>
      </div>

      {showTargetForm && (
        <form className="ovconfig-form" onSubmit={handleCreateTarget}>
          <div className="form-header">Add a New Scan Target</div>
          <div className="form-group">
            <label>Target Name</label>
            <input
              type="text"
              placeholder="e.g., Production Web Servers, Development Environment"
              value={targetFormData.name}
              onChange={(e) => setTargetFormData({ ...targetFormData, name: e.target.value })}
            />
            <small className="form-help">Give this target group a descriptive name</small>
          </div>
          <div className="form-group">
            <label>Hosts to Scan</label>
            <input
              type="text"
              placeholder="e.g., 192.168.1.100, 10.0.0.50, server.domain.com"
              value={targetFormData.hosts}
              onChange={(e) => setTargetFormData({ ...targetFormData, hosts: e.target.value })}
            />
            <small className="form-help">Enter IP addresses or hostnames, separated by commas</small>
          </div>
          <div className="form-group">
            <label>Port List Profile</label>
            <select
              value={targetFormData.portListName}
              onChange={(e) => setTargetFormData({ ...targetFormData, portListName: e.target.value })}
            >
              <option value="">-- Select a Port List --</option>
              {portLists.map((port) => (
                <option key={port.id || port.port_list_id} value={port.name}>
                  {port.name}
                </option>
              ))}
            </select>
            <small className="form-help">Choose which ports to scan on these targets</small>
          </div>
          <button type="submit" className="btn btn-success" disabled={loading}>
            {loading ? '⏳ Creating...' : '✓ Create Target'}
          </button>
        </form>
      )}

      <div className="ovconfig-grid">
        {targets.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">🎯</div>
            <div>No targets configured</div>
            <small>Add your first target to begin scanning</small>
          </div>
        ) : (
          targets.map((target) => (
            <div key={target.id || target.target_id} className="ovconfig-card">
              <div className="card-header">
                <div className="card-icon">🖥️</div>
                <div className="card-title">{target.name}</div>
              </div>
              <div className="card-info">
                <div className="info-row">
                  <span className="info-label">Hosts:</span>
                  <span className="info-value">{target.hosts?.length || 0}</span>
                </div>
                <div className="info-row">
                  <span className="info-label">Port List:</span>
                  <span className="info-value">{target.port_list_name}</span>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  )

  // Render Scan Tasks Section
  const renderTasks = () => (
    <section className="ovconfig-section">
      <div className="ovconfig-header">
        <div>
          <h3>📋 Scan Tasks</h3>
          <p className="section-description">Create and manage your vulnerability scanning jobs</p>
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
                {task.report_count > 0 && (
                  <button className="btn btn-sm btn-info">
                    📊 {task.report_count} Report{task.report_count > 1 ? 's' : ''}
                  </button>
                )}
                {task.status?.toLowerCase() === 'done' && (
                  <button className="btn btn-sm btn-success">
                    ✓ Completed
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  )

  // Render Summary Stats Section
  const renderStats = () => (
    <div className="stats-container">
      <div className="stat-card">
        <div className="stat-icon" style={{ background: 'linear-gradient(135deg, #6f42c1, #5a9bd8)' }}>
          🔌
        </div>
        <div className="stat-content">
          <div className="stat-value">{portLists.length}</div>
          <div className="stat-label">Port Lists</div>
        </div>
      </div>
      <div className="stat-card">
        <div className="stat-icon" style={{ background: 'linear-gradient(135deg, #6fcf97, #38ef7d)' }}>
          🎯
        </div>
        <div className="stat-content">
          <div className="stat-value">{targets.length}</div>
          <div className="stat-label">Targets</div>
        </div>
      </div>
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
    </div>
  )

  return (
    <div className="page openvas-config-page">
      <header className="page-header">
        <div className="header-content">
          <h2>🔍 OpenVAS Configuration</h2>
          <p className="muted">Manage vulnerability scanning tasks, targets, and port lists</p>
        </div>
        <button className="btn btn-sm" style={{ background: 'rgba(111, 207, 151, 0.15)', color: '#6fcf97', border: '1px solid rgba(111, 207, 151, 0.3)' }} onClick={loadAllData}>
          🔄 Refresh
        </button>
      </header>

      {error && <div className="alert alert-danger">{error}</div>}
      {successMsg && <div className="alert alert-success">{successMsg}</div>}
      {loading && <div className="alert alert-info">⏳ Loading...</div>}

      {renderStats()}

      <div className="ovconfig-container">
        {renderPortLists()}
        {renderTargets()}
        {renderTasks()}
      </div>

      <footer className="ovconfig-footer">
        <div className="footer-content">
          <small>🔗 OpenVAS Base URL</small>
          <small className="footer-url">https://edonu024me.execute-api.us-east-1.amazonaws.com/v1</small>
        </div>
        <div className="footer-stats">
          <small>Last updated: {new Date().toLocaleTimeString()}</small>
        </div>
      </footer>
    </div>
  )
}
