import React, { useState, useEffect } from 'react'
import openvasService from '../services/openvasService'
import './OpenVASConfig.css'

export default function OpenVASConfig() {
  // State Management
  const [portLists, setPortLists] = useState([])
  const [targets, setTargets] = useState([])
  const [ec2Instances, setEc2Instances] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [successMsg, setSuccessMsg] = useState(null)

  // Form States
  const [showPortForm, setShowPortForm] = useState(false)
  const [showTargetForm, setShowTargetForm] = useState(false)

  const [portFormData, setPortFormData] = useState({ name: '', portRange: '' })
  const [targetFormData, setTargetFormData] = useState({ name: '', selectedInstanceId: '' })

  // Load data on mount
  useEffect(() => {
    loadAllData()
    const interval = setInterval(loadAllData, 30000) // Refresh every 30 seconds
    return () => clearInterval(interval)
  }, [])

  // Load all data including EC2 instances
  const loadAllData = async () => {
    setLoading(true)
    try {
      const [portListsData, targetsData, ec2Data] = await Promise.all([
        openvasService.getAllPortLists().catch(() => ({ port_lists: [] })),
        openvasService.getAllTargets().catch(() => ({ targets: [] })),
        fetch('http://localhost:3005/aws/ec2-instances').then(r => r.json()).catch(() => ({ instances: [] }))
      ])

      setPortLists(portListsData.port_lists || [])
      setTargets(targetsData.targets || [])
      setEc2Instances(ec2Data.instances || [])
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

  // Create Target from EC2 Instance
  const handleCreateTarget = async (e) => {
    e.preventDefault()
    if (!targetFormData.name || !targetFormData.selectedInstanceId) {
      setError('Target name and EC2 instance are required')
      return
    }

    const selectedInstance = ec2Instances.find(i => i.instanceId === targetFormData.selectedInstanceId)
    if (!selectedInstance) {
      setError('Selected instance not found')
      return
    }

    // Check if port lists exist
    if (portLists.length === 0) {
      setError('⚠️ No port lists available! Create a port list first before creating targets.')
      return
    }

    try {
      setLoading(true)
      const hostsList = [selectedInstance.privateIpAddress]
      // Use the first available port list
      const firstPortListName = portLists[0].name
      // Pass alive_test parameter to match new API format
      await openvasService.createTarget(targetFormData.name, hostsList, firstPortListName, 'Consider Alive')
      setSuccessMsg(`✅ Target "${targetFormData.name}" created with instance ${selectedInstance.instanceName} (${selectedInstance.privateIpAddress})!`)
      setTargetFormData({ name: '', selectedInstanceId: '' })
      setShowTargetForm(false)
      await loadAllData()
      setTimeout(() => setSuccessMsg(null), 3000)
    } catch (err) {
      setError(`Failed to create target: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }

  // Handle instance selection to show details
  const getSelectedInstanceDetails = () => {
    if (!targetFormData.selectedInstanceId) return null
    return ec2Instances.find(i => i.instanceId === targetFormData.selectedInstanceId)
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
          <div className="form-header">Create Target from AWS EC2 Instance</div>
          
          {portLists.length === 0 && (
            <div style={{ padding: '12px', backgroundColor: 'rgba(255, 107, 107, 0.1)', borderRadius: '6px', marginBottom: '15px', border: '1px solid rgba(255, 107, 107, 0.3)' }}>
              <div style={{ fontSize: '12px', fontWeight: 600, marginBottom: '6px', color: '#ff6b6b' }}>❌ No Port Lists Available</div>
              <div style={{ fontSize: '12px', color: '#aaa', lineHeight: '1.6' }}>
                <p style={{ margin: '0 0 8px 0' }}>You must create a port list before creating targets.</p>
                <p style={{ margin: '0' }}>📋 Scroll up to the "Port Lists" section and create your first port list (e.g., "Common Ports: 80,443,22")</p>
              </div>
            </div>
          )}
          
          {ec2Instances.length === 0 && (
            <div style={{ padding: '12px', backgroundColor: 'rgba(243, 156, 18, 0.1)', borderRadius: '6px', marginBottom: '15px', border: '1px solid rgba(243, 156, 18, 0.3)' }}>
              <div style={{ fontSize: '12px', fontWeight: 600, marginBottom: '6px', color: '#f39c12' }}>⚠️ No EC2 Instances Available</div>
              <div style={{ fontSize: '12px', color: '#aaa', lineHeight: '1.6' }}>
                <p style={{ margin: '0 0 8px 0' }}>AWS credentials are not configured on the backend.</p>
                <p style={{ margin: '0' }}>To enable EC2 instance listing, add your AWS IAM credentials to the .env file:</p>
                <code style={{ backgroundColor: 'rgba(0,0,0,0.2)', padding: '6px 8px', borderRadius: '4px', display: 'block', marginTop: '6px', fontSize: '11px' }}>
                  AWS_ACCESS_KEY_ID=your_access_key<br/>
                  AWS_SECRET_ACCESS_KEY=your_secret_key
                </code>
              </div>
            </div>
          )}
          
          <div className="form-group">
            <label>Target Name</label>
            <input
              type="text"
              placeholder="e.g., Production Web Server, Database Instance"
              value={targetFormData.name}
              onChange={(e) => setTargetFormData({ ...targetFormData, name: e.target.value })}
            />
            <small className="form-help">Give this target a descriptive name</small>
          </div>
          
          {ec2Instances.length > 0 && (
            <div className="form-group">
              <label>Select AWS EC2 Instance</label>
              <select
                value={targetFormData.selectedInstanceId}
                onChange={(e) => setTargetFormData({ ...targetFormData, selectedInstanceId: e.target.value })}
              >
                <option value="">-- Select an Instance --</option>
                {ec2Instances.map((instance) => (
                  <option key={instance.instanceId} value={instance.instanceId}>
                    {instance.instanceName} ({instance.privateIpAddress}) - {instance.state}
                  </option>
                ))}
              </select>
              <small className="form-help">Choose an EC2 instance to scan</small>
            </div>
          )}
          
          {getSelectedInstanceDetails() && (
            <div style={{ padding: '12px', backgroundColor: 'rgba(90, 155, 216, 0.1)', borderRadius: '6px', marginBottom: '15px', border: '1px solid rgba(90, 155, 216, 0.3)' }}>
              <div style={{ fontSize: '12px', fontWeight: 600, marginBottom: '8px', color: '#5a9bd8' }}>📋 Instance Details</div>
              <div style={{ fontSize: '12px', lineHeight: '1.8', color: '#aaa' }}>
                <div><strong>Instance ID:</strong> {getSelectedInstanceDetails().instanceId}</div>
                <div><strong>Name:</strong> {getSelectedInstanceDetails().instanceName}</div>
                <div><strong>Private IP:</strong> <code style={{ backgroundColor: 'rgba(0,0,0,0.2)', padding: '2px 4px', borderRadius: '3px' }}>{getSelectedInstanceDetails().privateIpAddress}</code></div>
                <div><strong>Public IP:</strong> {getSelectedInstanceDetails().publicIpAddress}</div>
                <div><strong>Instance Type:</strong> {getSelectedInstanceDetails().instanceType}</div>
                <div><strong>State:</strong> <span style={{ color: getSelectedInstanceDetails().state === 'running' ? '#6fcf97' : '#f39c12' }}>{getSelectedInstanceDetails().state.toUpperCase()}</span></div>
              </div>
            </div>
          )}

          <button type="submit" className="btn btn-success" disabled={loading || portLists.length === 0 || ec2Instances.length === 0 || !targetFormData.selectedInstanceId}>
            {portLists.length === 0 ? '❌ Create Port List First' : ec2Instances.length === 0 ? '❌ No Instances Available' : loading ? '⏳ Creating...' : '✓ Create Target'}
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
    </div>
  )

  return (
    <div className="page openvas-config-page">
      <header className="page-header">
        <div className="header-content">
          <h2>🔧 OpenVAS Configuration</h2>
          <p className="muted">Manage port lists and target assets for scanning</p>
        </div>
      </header>

      {error && <div className="alert alert-danger">{error}</div>}
      {successMsg && <div className="alert alert-success">{successMsg}</div>}
      {loading && <div className="alert alert-info">⏳ Loading...</div>}

      {renderStats()}

      <div className="ovconfig-container">
        {renderPortLists()}
        {renderTargets()}
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
