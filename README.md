# Vulnerability Dashboard — Detailed Report

This repository contains a responsive React dashboard application that fetches vulnerability data once and displays it across Overview and Vulnerabilities views. This README documents the app, architecture, setup, design choices, and usage instructions — suitable for demos and handoff.

---

## Table of Contents

- Overview
- Features
- Architecture & Key Files
- Data Fetching & Shape
- User Interface and Design
- Accessibility & Performance
- Developer Setup & Scripts
- How to extend (icons, export, print, tests)
- Troubleshooting
- Screenshots & Visual Guide

---

## Overview

The dashboard presents vulnerability scan data with a single network fetch (performed by a `DataProvider` context). It exposes two primary views:

- **Overview** — KPIs, charts, and scan summary.
- **Vulnerabilities** — searchable, pageable table and mobile-friendly cards with full descriptions and CSV export.

The app is intentionally minimalist, mobile-first, and styled centrally in `src/index.css`.

## Features

- Single-fetch data via React Context (`src/dataContext.js`).
- Overview: KPI cards, CVSS distribution bar, severity pie, top hosts.
- Vulnerabilities: severity filter tabs, search, pagination, full Description column, CSV export, print-friendly styles, and mobile card-list.
- Polished UI: consistent cards, hover effects, responsive breakpoints, reduced-motion support.
- Icons via Font Awesome (CDN integration in `public/index.html`).

## Architecture & Key Files

- `src/dataContext.js` — Fetches `/testing/getdata` once and provides `{ data, loading, error }`.
- `src/App.js` — Wraps the app in `DataProvider` and renders `Dashboard`.
- `src/components/Dashboard.js` — Layout: sidebar, topbar, main content and routing between Overview and Vulnerabilities.
- `src/components/Overview.js` — KPI cards, `Charts` component, scan summary.
- `src/components/Charts.js` — Chart.js-based bar and pie charts and host list.
- `src/components/Vulnerabilities.js` — Searchable, pageable table; mobile card-list; CSV export; modal details.
- `src/index.css` — Centralized styling, variables, responsive breakpoints, print styles.
- `public/index.html` — Includes Font Awesome CDN link for icons.

## Data Fetching & Shape

- The `DataProvider` uses Axios to fetch from `/testing/getdata`. If the API returns an envelope object with a `body` JSON string, the provider parses it.
- The data structure expected includes items of `item_type: 'finding'` and `item_type: 'report_summary'`.
- Findings should include keys such as `name`, `hostname` or `host`, `severity`, `severity_num` or `cvss_num`, `cvss`, `cves` (array), `description`, `solution`, and `reference`.

Example finding item:
```
{
	item_type: 'finding',
	name: 'Outdated OpenSSL',
	hostname: 'web-01',
	severity: 'High',
	severity_num: 7.5,
	cvss: 7.5,
	cves: ['CVE-XXXX-YYYY'],
	description: 'Long description text...',
	solution: 'Upgrade package',
	reference: 'https://example.com'
}
```

## User Interface and Design

- Centralized variables allow easy theming (`:root` vars in `src/index.css`).
- Sidebar contains Overview/Vulnerabilities; mobile menu toggles overlay sidebar.
- The Overview page uses KPI cards with progress bars, charts, and a scan summary card.
- The Vulnerabilities page supports:
	- Severity tabs for quick filtering.
	- Search box for name/host/CVE.
	- Pagination for desktop table.
	- Mobile card-list rendering for small screens (<=640px), showing full description and CVEs.
	- Row click opens a details modal with all fields.
	- CSV export and Print buttons in the UI (Font Awesome icons).

## Accessibility & Performance

- Single fetch reduces network overhead.
- `prefers-reduced-motion` respected in CSS.
- ARIA: `aria-expanded` added to the mobile menu button, sidebar uses `aria-hidden` when closed.
- Buttons include sufficient hit area for touch devices.
- Table headers are sticky for easier scanning.

## Developer Setup & Scripts

Prerequisites: Node.js 16+ and npm.

Install and run:

```bash
npm install
npm start
```

Build for production:

```bash
npm run build
```

Local dev server serves at `http://localhost:3000`.

## How to extend

- Replace Font Awesome CDN with an npm package if you prefer bundling icons.
- Add CSV export improvements: include report metadata or selected filters in the CSV header.
- Add server-side pagination if the dataset becomes very large.
- Add authentication/authorization wrappers around the dashboard.

## Print & Export

- The Vulnerabilities page includes a CSV export button (exports all filtered rows).
- Print-friendly CSS hides non-essential UI and formats the table for paper.

## Troubleshooting

- If the app fails to load data, check `package.json` proxy or dev server proxy; ensure `/testing/getdata` is reachable.
- For chart issues, ensure `react-chartjs-2` and `chart.js` are installed.

## Server persistence (optional)

- A small Express + Redis server has been added under `server/` to persist fetched reports.
- Endpoints provided:
	- `POST /api/reports` — store a report (the frontend `DataProvider` posts reports best-effort).
	- `GET /api/reports?limit=50` — list stored reports (most recent first by timestamp).
	- `GET /api/reports/:id` — fetch a single stored report.
	- `POST /api/cleanup` — remove reports older than a provided timestamp (admin use).

How to run (Docker Compose):

```bash
cd server
docker compose up --build
```

Or run locally:

```bash
cd server
npm install
PORT=4000 REDIS_URL=redis://localhost:6379 npm start
```

Notes:
- The frontend posts reports to `http://localhost:4000/api/reports` with a short timeout; failures are ignored so the UI remains functional if the server is not running.
- The server stores each report as `vd:report:<id>` and indexes IDs in a sorted set `vd:reports` (score = timestamp) for range queries and listing.
- Retention/cleanup is manual via `POST /api/cleanup` with `{ "before": <unix_ms> }`, or you can add a scheduled job to call cleanup periodically (recommended default retention: 90 days).

Local persistence (browser fallback):

- The app now also persists fetched reports to the browser `localStorage` under the key `vd:reports`.
- Local retention defaults to 30 days. The provider prunes older entries automatically and caps the stored list (500 items).
- `History` will attempt to load from the server first; if unreachable it falls back to `localStorage` and shows the stored reports.

You can continue to use the server approach (Redis) for centralized storage, or rely on `localStorage` for a quick local history without additional infrastructure.
