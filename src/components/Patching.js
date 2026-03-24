import React, { useState } from 'react'
import { usePatchAndScan } from '../dataContext'

export default function Patching(){
  const { triggerPatchAndScan, patchLoading, patchError, patchStatus } = usePatchAndScan()
  const [vmSelection, setVmSelection] = useState('both')

  const handlePatch = async () => {
    await triggerPatchAndScan(vmSelection)
  }

  return (
    <div className="patching-root">
      <div className="card">
        <div className="card-title">
          <h3>🔧 Automated Patching & Scanning</h3>
        </div>

        <div style={{ marginTop: 20, marginBottom: 20 }}>
          <label style={{ display: 'block', marginBottom: 10, fontWeight: 500 }}>
            Select VMs to patch:
          </label>
          <div style={{ display: 'flex', gap: 15, marginBottom: 20 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="radio"
                value="both"
                checked={vmSelection === 'both'}
                onChange={(e) => setVmSelection(e.target.value)}
                disabled={patchLoading}
              />
              Both VMs
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="radio"
                value="windows"
                checked={vmSelection === 'windows'}
                onChange={(e) => setVmSelection(e.target.value)}
                disabled={patchLoading}
              />
              Windows VM
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="radio"
                value="linux"
                checked={vmSelection === 'linux'}
                onChange={(e) => setVmSelection(e.target.value)}
                disabled={patchLoading}
              />
              Linux VM
            </label>
          </div>

          <button
            className="btn btn-primary"
            onClick={handlePatch}
            disabled={patchLoading}
            style={{ marginBottom: 15, padding: '10px 20px', fontSize: '14px', fontWeight: 600 }}
          >
            {patchLoading ? '⏳ Patching in progress...' : '🚀 Start Patching & Scanning'}
          </button>
        </div>

        {patchStatus && (
          <div className="status-panel" style={{ marginBottom: 20 }}>
            <div style={{ marginBottom: 10 }}>
              <strong>Status:</strong>
            </div>
            <div style={{ 
              padding: 12, 
              backgroundColor: '#f6f8fa', 
              borderRadius: 4, 
              fontSize: '14px',
              borderLeft: '4px solid #0969da',
              fontFamily: 'monospace'
            }}>
              {patchStatus.split('\n').map((line, i) => (
                <div key={i}>{line}</div>
              ))}
            </div>
          </div>
        )}

        {patchError && (
          <div style={{
            padding: 12,
            backgroundColor: '#ffebe6',
            borderLeft: '4px solid #ff3860',
            borderRadius: 4,
            color: '#d1242f',
            marginBottom: 15
          }}>
            <strong>Error:</strong> {patchError}
          </div>
        )}

        <div className="info-box" style={{ marginTop: 20, padding: 12, backgroundColor: '#f0f7ff', borderRadius: 4 }}>
          <div style={{ fontSize: '13px', color: '#444', lineHeight: 1.6 }}>
            <p><strong>How it works:</strong></p>
            <ul style={{ marginLeft: 20, marginTop: 8 }}>
              <li>1️⃣ Select which VM(s) to patch</li>
              <li>2️⃣ Click "Start Patching & Scanning" to begin</li>
              <li>3️⃣ The system will apply patches to selected VMs</li>
              <li>4️⃣ Once patching completes, OpenVAS scanning starts automatically</li>
              <li>5️⃣ Scan results will appear in the Overview after completion</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}
