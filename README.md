# Vulnerability Dashboard — Detailed Report

This repository contains a responsive React dashboard application that fetches vulnerability data once and displays it across Overview and Vulnerabilities views. This README documents the app, architecture, setup, design choices, and usage instructions — suitable for demos and handoff.

---

## Table of Contents

- Overview
- Features
- Architecture & Key Files
- Data Fetching & Shape

 # Vulnerability Dashboard

 A concise, up-to-date summary of this React dashboard and important implementation details.

 ## Highlights

- Single daily API fetch: the app caches the last successful payload for 24 hours so the external API is called at most once per day.
- Local persistence: fetched reports are saved in `localStorage` under `vd:reports` with a 30-day retention and a 500-item cap.
- Persistence: the app uses browser `localStorage` by default to persist fetched reports. (Server-side Redis scaffold removed.)
- History & aggregates: The `History` page lists stored reports (server-first, local fallback). `Overview` shows daily and weekly aggregates when historical data exists.

## What’s in the repo

- `src/dataContext.js` — Single-fetch provider. Behavior:
  - Caches the last payload for 24h (`vd:lastPayload` / `vd:lastFetch`).
  - Persists each fetched report to localStorage (`vd:reports`) with 30-day retention.
  - Attempts a best-effort POST to `http://localhost:4000/api/reports` when a server is available.
- `src/components/Dashboard.js` — App layout and sidebar navigation (Overview, Vulnerabilities, Assets, History). Sidebar uses compact brand mark and emoji/icons.
- `src/components/Overview.js` — KPIs, charts, scan summary, and historical daily/weekly aggregates (computed from `vd:reports`).
- `src/components/History.js` — Loads stored reports from server or `localStorage`, prefers scan timestamps embedded in payloads for display.
- `src/components/Vulnerabilities.js` — Searchable, pageable table with CSV export, modal details, and responsive mobile cards.
- `src/index.css` — Centralized styling and theme variables.
-- `server/` — legacy server scaffold was present but is no longer required; localStorage is the supported persistence mode.

## Data shapes

- The provider expects a scan payload that contains `finding` items and a `report_summary` item (often within an array). Typical finding keys: `name`, `host`/`hostname`, `severity_num`/`cvss`, `cves`, `description`, `solution`.

## Running the app

1) Frontend only

```bash
npm install
```

Table of contents
- Purpose
- Key features
- Code structure & responsibilities
- Data flow and persistence
- Operational instructions
- Security and privacy considerations
- Operational limits and tradeoffs
- Suggested next steps (prioritized)

Purpose
-------
This repository contains a production-feasible single-page React application that presents vulnerability scan data in a concise dashboard. It is designed for demos and light-weight local use, with built-in local persistence for historical analysis and simple aggregations.

Key features (implemented)
--------------------------
- Single daily API fetch and caching: the app fetches the external scan payload at most once per 24 hours and caches the result in `localStorage`.
- Local persistence: every fetched payload is persisted to browser `localStorage` under `vd:reports` so the user has a local history without extra infrastructure.
- Overview aggregates: the `Overview` page computes daily and weekly report-count aggregates from the persisted history and displays the last 7 days and last 8 weeks counts.
- Core pages: Overview, Vulnerabilities (search, severity filter, pagination, CSV export, print view), Assets inventory, History (payload viewer).
- Responsive design and accessibility basics: centralized styles, keyboard-accessible navigation, and reduced-motion support.

Code structure & responsibilities
--------------------------------
- `src/dataContext.js` — single source of truth for data fetching and persistence. Responsibilities:
  - Fetch `/testing/getdata` and parse envelope `body` when present.
  - Cache the last successful payload (`vd:lastPayload`) and timestamp (`vd:lastFetch`) to enforce the 24-hour fetch limit.
  - Persist each successful fetch into `vd:reports` with 30-day retention and a 500-item cap.
  - Attempt a best-effort non-blocking POST to a server endpoint if present (this is optional and safe to ignore when unavailable).
- `src/components/Dashboard.js` — application shell (sidebar navigation, topbar, routing between pages).
- `src/components/Overview.js` — KPI cards, charts, scan summary, and daily/weekly aggregates computed from local history.
- `src/components/Vulnerabilities.js` — primary findings table with search, severity tabs, pagination, modal details, CSV export and mobile card rendering.
- `src/components/History.js` — viewer for persisted reports (source: localStorage). Shows payload and scan timestamp (prefers payload `report_summary.scan_start`).
- `src/components/Charts.js` — visualizations (react-chartjs-2) used in Overview for severity/CVSS distributions.
- `src/index.css` — central styling, CSS variables, responsive breakpoints, print styles.

Data flow and persistence
------------------------
1. On app load, `DataProvider` checks `vd:lastFetch` (timestamp). If it is within the last 24 hours, the provider uses `vd:lastPayload` and does not call the external API.
2. If the cache is stale or missing, the provider requests `/testing/getdata`, parses the payload, sets context state, and:
   - Stores the payload as `vd:lastPayload` with `vd:lastFetch = now` to enforce the 24-hour rule.
   - Appends `{ id, created_at, payload }` to `vd:reports` (unshift) and prunes older entries older than 30 days and trims to 500 items.
   - Attempts a non-blocking POST to `http://localhost:4000/api/reports` (if a server is running) with a small timeout. Failures are ignored deliberately.
3. The `History` page reads `vd:reports` (localStorage) and displays entries. It prefers `report_summary.scan_start` inside the payload to show the scan date/time.
4. `Overview` reads `vd:reports` and computes daily and weekly aggregates (counts) for recent days/weeks.

Operational instructions
----------------------
Prerequisites: Node.js 16+ and npm.

Run frontend (development):

```bash
npm install
npm start
```

Build for production:

```bash
npm run build
```

Notes on persistence: no external services are required — history and aggregates are built from `localStorage`. This makes the app easy to run for demos and internal use without provisioning infrastructure.

Operational limits & tradeoffs
-----------------------------
- localStorage capacity: browsers limit local storage; storing many full payloads may hit quota. Current implementation caps to 500 items and prunes to 30 days, but if payloads are large you may still exhaust space.
- Single-machine history: localStorage persists per-browser profile only. For team-wide history use a centralized server and secure it.
- Aggregations: current aggregates are simple counts per day/week. No severity-weighted or CVE-based aggregation yet.

Suggested next steps (prioritized)
---------------------------------
1. Replace aggregate lists with small charts in `Overview` for quicker visual insight.
2. Add a `History` date-range filter and per-report export (CSV or JSON), plus a modal preview for payloads.
3. Add optional compression/metadata-only persistence to reduce localStorage footprint (save just summary and indices instead of full payloads).
4. If centralized history is needed, add a small server with secure auth and replace the localStorage fallback accordingly.
5. Add unit tests for the `DataProvider` caching and `Overview` aggregation logic and add a simple CI build.
