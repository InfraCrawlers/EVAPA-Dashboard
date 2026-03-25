# Patching & Scanning API Integration

This document describes the API endpoints required to support the automated patching and scanning feature in the dashboard.

## API Endpoints Required

### 1. Patching Endpoint (NEW — You need to create this)

**Endpoint:** `POST /patching/apply`

**Description:** Triggers automated patching for selected VMs. This should apply security patches to Windows and/or Linux VMs and return a success/failure status.

**Request Body:**
```json
{
  "vms": "both|windows|linux",
  "timestamp": "2026-03-24T10:30:00.000Z"
}
```

**Response (Success):**
```json
{
  "success": true,
  "message": "Patches applied successfully",
  "patchCount": 15,
  "affectedVMs": ["Windows-VM", "Linux-VM"],
  "applyTime": "2026-03-24T10:30:45.000Z"
}
```

**Response (Error):**
```json
{
  "success": false,
  "message": "Failed to apply patches: timeout on Windows-VM"
}
```

**Status Codes:**
- `200` — Patching triggered successfully
- `400` — Invalid VM selection
- `500` — Patching failed

**Implementation Notes:**
- This endpoint should trigger patch deployment (WSU on Windows, apt/yum on Linux)
- The endpoint should return immediately (don't wait for patches to fully apply)
- Consider using background jobs/Lambda functions if patches take >30 seconds
- Log all patch operations for audit purposes

---

### 2. OpenVAS Scan Trigger Endpoint (Already exists)

**Endpoint:** `POST /scanning/openvas-trigger`

**Description:** Triggers an OpenVAS vulnerability scan on the specified VMs. This endpoint already exists in your environment.

**Request Body:**
```json
{
  "target": "both|windows|linux",
  "timestamp": "2026-03-24T10:30:00.000Z"
}
```

**Response (Success):**
```json
{
  "success": true,
  "scanId": "scan-12345",
  "target": "both",
  "message": "Scan started successfully"
}
```

---

## UI Flow

The dashboard Patching tab:
1. User selects VMs (Both / Windows only / Linux only)
2. User clicks "Start Patching & Scanning" button
3. Frontend calls `POST /patching/apply` with the VM selection
4. Waits 30 seconds for patches to apply
5. Calls `POST /scanning/openvas-trigger` to start the scan
6. Displays real-time status updates in the UI
7. User can navigate back to Overview to see updated findings (once scan completes)

---

## Example Backend Implementation (Node.js/Express)

Here's a minimal example for implementing `/patching/apply`:

```javascript
// Express route for patching
app.post('/patching/apply', async (req, res) => {
  const { vms } = req.body;
  
  try {
    // Determine which VMs to patch
    const vmList = vms === 'both' ? ['Windows-VM', 'Linux-VM'] 
                 : vms === 'windows' ? ['Windows-VM'] 
                 : ['Linux-VM'];
    
    // Trigger patch deployment (example: call AWS Systems Manager)
    const results = [];
    for (const vm of vmList) {
      // Example: Run patch command via SSM
      const result = await awsSSM.sendCommand({
        InstanceIds: [vm],
        DocumentName: 'AWS-RunPatchBaseline'
      });
      results.push({ vm, commandId: result.Command.CommandId });
    }
    
    res.json({
      success: true,
      message: 'Patches applied successfully',
      patchCount: results.length,
      affectedVMs: vmList,
      applyTime: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: `Failed to apply patches: ${error.message}`
    });
  }
});
```

---

## AWS Integration Example

If you're using AWS, you can integrate with **AWS Systems Manager** to apply patches:

```bash
# Example AWS CLI command to apply patches
aws ssm send-command \
  --document-name "AWS-RunPatchBaseline" \
  --instance-ids "i-1234567890abcdef0" \
  --region us-east-1
```

---

## Environment Variables

Add these to your backend configuration:

```bash
PATCHING_TIMEOUT=60000        # 60 seconds
SCAN_WAIT_TIME=30000         # 30 seconds for patches to apply
OPENVAS_API_URL=https://your-openvas-endpoint
AWS_REGION=us-east-1
```

---

## Error Handling

The dashboard UI will:
- Display error messages if either endpoint fails
- Show the full error message from the backend in red
- Allow the user to retry the operation

Ensure your backend returns clear, user-friendly error messages.

---

## Testing

Test the endpoints using `curl`:

```bash
# Test patching endpoint
curl -X POST http://localhost:3000/patching/apply \
  -H "Content-Type: application/json" \
  -d '{
    "vms": "both",
    "timestamp": "2026-03-24T10:30:00.000Z"
  }'

# Test scan trigger endpoint
curl -X POST http://localhost:3000/scanning/openvas-trigger \
  -H "Content-Type: application/json" \
  -d '{
    "target": "both",
    "timestamp": "2026-03-24T10:30:00.000Z"
  }'
```

---

## Summary

✅ Frontend: Patching UI and button are implemented  
✅ Frontend: API calls to `/patching/apply` and `/scanning/openvas-trigger` are wired  
⚠️ Backend: You need to implement `/patching/apply` endpoint  
✅ Backend: `/scanning/openvas-trigger` already exists (per your note)
