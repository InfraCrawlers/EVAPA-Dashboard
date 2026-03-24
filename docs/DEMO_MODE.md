# Graceful Degradation: Demo Mode

## Overview

The dashboard now includes **automatic fallback to demo/mock data** when the API endpoint is unavailable. This ensures the UI remains fully functional even if the backend is down, making it perfect for:

- **Development** — test UI without a running backend
- **Demos** — showcase the dashboard without needing real vulnerability data
- **Presentations** — show features even if the infrastructure is offline
- **Resilience** — don't let API outages block user access to the interface

---

## How It Works

### 1. **Normal Operation (API Available)**
- App fetches real data from `/testing/getdata`
- Displays actual vulnerability findings
- No demo banner shown

### 2. **Fallback Mode (API Unavailable)**
- Fetch request fails
- System automatically loads **realistic demo data** from `src/mockData.js`
- App displays the demo data as if it were real
- A **yellow info banner** appears: _"ℹ️ Demo Mode: The API is currently unavailable..."_
- All features remain fully functional (search, filter, export, patching, scanning, etc.)

### 3. **Cached Data (24-hour Cache Hit)**
- If API was available in the last 24 hours, cached data is used
- No API call is made
- Demo banner is not shown

---

## Demo Data Included

The mock dataset includes realistic vulnerability findings:

### Sample Vulnerabilities:
- **4 Critical** findings (OpenSSL DoS, MySQL no-auth, RDP exploit, SSH weak keys)
- **4 High** severity findings (info disclosure, SSL/TLS issues, IDOR, FTP anonymous)
- **4 Medium** severity findings (jQuery XSS, missing headers, weak passwords, firewall down)
- **3 Low** severity findings (banner grabbing, deprecated TLS, temp files)

### Affected Systems:
- `192.168.1.100` — Web server
- `192.168.1.200` — Application server
- `10.0.0.30` — FTP server
- `10.0.0.50` — Database
- `10.0.1.25` — Secondary web service
- `WIN-SERVER-01` — Windows Server
- `WIN-CLIENT-05` — Windows Client
- `linux-prod-01` — Linux production

---

## Files Added/Modified

**New:**
- `src/mockData.js` — Contains realistic demo vulnerability findings

**Modified:**
- `src/dataContext.js` — Added fallback logic + `demoMode` flag in context
- `src/components/Dashboard.js` — Display demo banner when in fallback mode
- `src/index.css` — Added styles for demo banner

---

## Usage

### Test Demo Mode Locally

**Option 1: Disable the API proxy temporarily**
Edit `package.json` and comment out the proxy:
```json
"proxy": "https://k0lybp4tea.execute-api.us-east-1.amazonaws.com",
// becomes
// "proxy": "https://k0lybp4tea.execute-api.us-east-1.amazonaws.com",
```

Then restart the dev server:
```bash
npm start
```

The app will fail to fetch from the API and automatically show demo data with the banner.

**Option 2: Simulate API error in browser console**
Open DevTools Network tab and throttle connection to "Offline" before the page loads fully.

---

## Features That Work in Demo Mode

✅ Overview dashboard with KPI cards  
✅ Severity charts and distributions  
✅ Vulnerabilities table with search & filter  
✅ Severity-based filtering (Critical/High/Medium/Low)  
✅ Pagination of findings  
✅ CSV export of findings  
✅ Print-friendly report view  
✅ Assets inventory view  
✅ Host-level vulnerability details  
✅ Historical aggregates (daily/weekly counts)  
✅ Sidebar navigation  
✅ Mobile responsive layout  
✅ Patching & Scanning tab (UI works; backend dependent)  

---

## Demo Banner Appearance

When in demo mode, users see:

```
ℹ️ Demo Mode: The API is currently unavailable. Showing sample vulnerability data for demonstration purposes.
```

The banner is:
- **Sticky** at the top of the page
- **Yellow/gold** to indicate caution
- **Dismissible** (via CSS; not removed, just visual)
- **Responsive** on all device sizes

---

## Customizing Demo Data

To modify the demo findings, edit `src/mockData.js`:

```javascript
export const MOCK_DATA = [
  {
    item_type: 'report_summary',
    scan_start: new Date(...).toISOString(),
    report_id: 'report-2025-03-22-001',
    total_high_severity_count: 5,
    raw: {}
  },
  // Add more findings here
  {
    item_type: 'finding',
    name: 'Your Vulnerability',
    host: '192.168.1.100',
    severity_num: 8.5,
    // ... other fields
  }
]
```

Run `npm start` to see your changes immediately.

---

## Implementation Details

### Error Handling Flow

```
Fetch /testing/getdata
    ↓
[Success] → Show real data, clear demo banner
    ↓
[Failure] → Catch error → Load mock data → Set demoMode=true → Show yellow banner
```

### Context Changes

The `useData()` hook now returns:
```javascript
{
  data: [...],           // vulnerability findings (real or demo)
  loading: boolean,      // true while loading
  error: null,          // error message (only shown if no fallback available)
  demoMode: boolean     // true if showing demo data
}
```

---

## When Demo Mode Applies

| Scenario | Result |
|----------|--------|
| API reachable, returns data | Real data, no banner |
| API fails (network error, 5xx, timeout) | Demo data + banner |
| API returns 4xx error | Demo data + banner |
| Cached data exists (< 24h old) | Cached data, no banner |
| Totally offline, no cache | Demo data + banner |

---

## Future Enhancements

- [ ] Add toggle button to switch between real/demo data
- [ ] Store more realistic datasets (presets for different scenarios)
- [ ] Mock the patching/scanning API responses
- [ ] Add a "Refresh" button in the banner to retry the API
- [ ] Analytics: track when demo mode is triggered

---

## Summary

With this feature, the dashboard is **resilient and always usable**, whether or not the backend is available. Perfect for demos, development, and graceful degradation in production. 🎯
