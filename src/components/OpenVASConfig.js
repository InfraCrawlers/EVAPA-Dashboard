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
        <h3>🔌 Port Lists</h3>
        <button className="btn btn-primary btn-sm" onClick={() => setShowPortForm(!showPortForm)}>
          {showPortForm ? 'Cancel' : '+ New Port List'}
        </button>
      </div>

      {showPortForm && (
        <form className="ovconfig-form" onSubmit={handleCreatePortList}>
          <div className="form-group">
            <label>Port List Name</label>
            <input
              type="text"
              placeholder="e.g., Web Ports"
              value={portFormData.name}
              onChange={(e) => setPortFormData({ ...portFormData, name: e.target.value })}
            />
          </div>
          <div className="form-group">
            <label>Port Range</label>
            <input
              type="text"
              placeholder="e.g., T:80,443,3389,U:53"
              value={portFormData.portRange}
              onChange={(e) => setPortFormData({ ...portFormData, portRange: e.target.value })}
            />
          </div>
          <button type="submit" className="btn btn-success" disabled={loading}>
            {loading ? 'Creating...' : 'Create Port List'}
          </button>
        </form>
      )}

      <div className="ovconfig-grid">
        {portLists.length === 0 ? (
          <p className="empty-state">No port lists found. Create one to get started!</p>
        ) : (
          portLists.map((port) => (
            <div key={port.id || port.port_list_id} className="ovconfig-card">
              <div className="card-title">{port.name}</div>
              <div className="card-info">
                <small>ID: {(port.id || port.port_list_id)?.substring(0, 8) || 'N/A'}...</small>
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
        <h3>🎯 Targets (Assets)</h3>
        <button className="btn btn-primary btn-sm" onClick={() => setShowTargetForm(!showTargetForm)}>
          {showTargetForm ? 'Cancel' : '+ New Target'}
        </button>
      </div>

      {showTargetForm && (
        <form className="ovconfig-form" onSubmit={handleCreateTarget}>
          <div className="form-group">
            <label>Target Name</label>
            <input
              type="text"
              placeholder="e.g., Production Servers"
              value={targetFormData.name}
              onChange={(e) => setTargetFormData({ ...targetFormData, name: e.target.value })}
            />
          </div>
          <div className="form-group">
            <label>Hosts (comma-separated IPs)</label>
            <input
              type="text"
              placeholder="e.g., 192.168.1.100, 192.168.1.101"
              value={targetFormData.hosts}
              onChange={(e) => setTargetFormData({ ...targetFormData, hosts: e.target.value })}
            />
          </div>
          <div className="form-group">
            <label>Port List</label>
            <select
              value={targetFormData.portListName}
              onChange={(e) => setTargetFormData({ ...targetFormData, portListName: e.target.value })}
            >
              <option value="">-- Select Port List --</option>
              {portLists.map((port) => (
                <option key={port.id || port.port_list_id} value={port.name}>
                  {port.name}
                </option>
              ))}
            </select>
          </div>
          <button type="submit" className="btn btn-success" disabled={loading}>
            {loading ? 'Creating...' : 'Create Target'}
          </button>
        </form>
      )}

      <div className="ovconfig-grid">
        {targets.length === 0 ? (
          <p className="empty-state">No targets found. Create one to scan assets!</p>
        ) : (
          targets.map((target) => (
            <div key={target.id || target.target_id} className="ovconfig-card">
              <div className="card-title">{target.name}</div>
              <div className="card-info">
                <small>📍 Hosts: {target.hosts?.length || 0}</small>
                <small>Port List: {target.port_list_name}</small>
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
        <h3>📋 Scan Tasks</h3>
        <button className="btn btn-primary btn-sm" onClick={() => setShowTaskForm(!showTaskForm)}>
          {showTaskForm ? 'Cancel' : '+ New Scan Task'}
        </button>
      </div>

      {showTaskForm && (
        <form className="ovconfig-form" onSubmit={handleCreateTask}>
          <div className="form-group">
            <label>Task Name</label>
            <input
              type="text"
              placeholder="e.g., Weekly Production Scan"
              value={taskFormData.name}
              onChange={(e) => setTaskFormData({ ...taskFormData, name: e.target.value })}
            />
          </div>
          <div className="form-group">
            <label>Target</label>
            <select
              value={taskFormData.targetName}
              onChange={(e) => setTaskFormData({ ...taskFormData, targetName: e.target.value })}
            >
              <option value="">-- Select Target --</option>
              {targets.map((target) => (
                <option key={target.id || target.target_id} value={target.name}>
                  {target.name}
                </option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label>Scan Configuration</label>
            <select
              value={taskFormData.configName}
              onChange={(e) => setTaskFormData({ ...taskFormData, configName: e.target.value })}
            >
              <option value="Full and fast">Full and fast</option>
              <option value="Discovery">Discovery</option>
              <option value="Full">Full</option>
            </select>
          </div>
          <button type="submit" className="btn btn-success" disabled={loading}>
            {loading ? 'Creating...' : 'Create Task'}
          </button>
        </form>
      )}

      <div className="ovconfig-tasks-list">
        {tasks.length === 0 ? (
          <p className="empty-state">No scan tasks found. Create one to begin scanning!</p>
        ) : (
          tasks.map((task) => (
            <div key={task.id || task.task_id} className="ovconfig-task-card">
              <div className="task-header">
                <div className="task-title">{task.name}</div>
                <div className="task-status" style={{ color: getStatusColor(task.status) }}>
                  {task.status || 'Unknown'}
                </div>
              </div>

              <div className="task-info">
                <small>Target: {task.target_name || task.target || 'Unknown'}</small>
                <small>Config: {task.config_name || task.config || 'Standard'}</small>
              </div>

              <div className="task-progress-container">
                <div className="progress-bar">
                  <div
                    className="progress-fill"
                    style={{ width: `${task.progress || 0}%`, backgroundColor: getStatusColor(task.status) }}
                  ></div>
                </div>
                <small>{task.progress || 0}% Complete</small>
              </div>

              <div className="task-actions">
                {task.status?.toLowerCase() !== 'done' && task.status?.toLowerCase() !== 'running' && (
                  <button
                    className="btn btn-sm btn-info"
                    onClick={() => handleStartScan(task.name)}
                    disabled={loading}
                  >
                    ▶ Start Scan
                  </button>
                )}
                {task.report_count > 0 && (
                  <button className="btn btn-sm btn-success">
                    📊 {task.report_count} Report{task.report_count > 1 ? 's' : ''}
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  )

  return (
    <div className="page openvas-config-page">
      <header className="page-header">
        <h2>🔍 OpenVAS Configuration</h2>
        <p className="muted">Manage vulnerability scanning tasks, targets, and port lists</p>
      </header>

      {error && <div className="alert alert-danger">{error}</div>}
      {successMsg && <div className="alert alert-success">{successMsg}</div>}
      {loading && <div className="alert alert-info">⏳ Loading...</div>}

      <div className="ovconfig-container">
        {renderPortLists()}
        {renderTargets()}
        {renderTasks()}
      </div>

      <footer className="ovconfig-footer">
        <small>OpenVAS Base URL: https://edonu024me.execute-api.us-east-1.amazonaws.com/v1</small>
        <button className="btn btn-sm btn-outline" onClick={loadAllData}>
          🔄 Refresh Data
        </button>
      </footer>
    </div>
  )
}
