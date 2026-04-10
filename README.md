# EVAPA Security Dashboard

<p align="center">
  <strong>Enterprise Vulnerability Assessment, Patching & Automation Dashboard</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/version-2.1.0-blue" alt="Version" />
  <img src="https://img.shields.io/badge/status-Production%20Ready-brightgreen" alt="Status" />
  <img src="https://img.shields.io/badge/license-Educational-yellow" alt="License" />
  <img src="https://img.shields.io/badge/node-%3E%3D16.x-green" alt="Node" />
  <img src="https://img.shields.io/badge/react-18.2-61DAFB" alt="React" />
</p>

---

## Overview

**EVAPA** (Enterprise Vulnerability Assessment, Patching & Automation) is a full-stack security operations dashboard built with React and Express.js. It provides real-time vulnerability management, automated OS patching, and integrated vulnerability scanning — all backed by enterprise-grade Redis caching for high-performance data delivery.

Designed as a **Group 4 Capstone** project by:
> **Tharuka Kannangara** · **Swagat Koirala** · **Abid Al Mohaimin** · **Rupesh Limbadri Vanneldas** · **Dillon Wijayanayagam**

---

## Screenshots

| Overview Dashboard | Vulnerability Table |
|---|---|
| ![Overview](docs/screenshots/overview-desktop.png) | ![Vulnerabilities](docs/screenshots/vulnerabilities-desktop.png) |

| Asset Inventory | History & Reports |
|---|---|
| ![Assets](docs/screenshots/assets-inventory.png) | ![History](docs/screenshots/history-report.png) |

<details>
<summary>📱 Mobile View</summary>

![Mobile](docs/screenshots/vulnerabilities-mobile.png)

</details>

---

## Key Features

### Vulnerability Management
- Real-time severity breakdown with KPIs (Critical, High, Medium, Low)
- Searchable and sortable vulnerability table with pagination
- CVSS scoring and CVE tracking
- Host-based asset inventory view
- CSV export and print-ready reports

### Automated Patching
- One-click Linux and Windows patching via AWS SSM playbooks
- Two-step async workflow: start playbook → poll for completion
- OS-aware patching — automatically determines Linux, Windows, or both based on target
- Real-time progress bar with phased status updates (report → Linux → Windows → complete)
- Duplicate prevention via Redis-based locking and client-side tracking
- Patch results stored with 30-day retention
- Dual-tab history view for scan and patch reports with detail modals

### OpenVAS Integration
- Full scan management UI: targets, port lists, scan configs, tasks
- Create scan targets directly from running EC2 instances
- Start and monitor vulnerability scans with live progress tracking
- Auto-patching triggers when scan tasks complete
- View detailed scan reports

### Performance & Reliability
- Redis-backed distributed caching (80–90% fewer API calls)
- Smart cache invalidation on patching and scanning events
- Conditional caching — running scan tasks bypass cache for real-time progress
- Configurable TTL per endpoint (60s–3600s depending on data volatility)
- Graceful degradation with demo mode when APIs are unavailable
- Health check and cache statistics endpoints

### User Experience
- Responsive design with mobile-friendly card layout
- Full-width branded header and footer
- Six navigable tabs: Overview, Vulnerabilities, Assets, History, Patching, OpenVAS Config
- Modal popups for detailed report viewing
- Live dashboard with 30-second auto-refresh and infrastructure monitoring grid
- EC2 fleet status, scan progress, and patch status at a glance

---

## Architecture

```
┌─────────────────────────────────────────────────┐
│           React Frontend (SPA)                  │
│    Dashboard · Patching · Scanning · Reports    │
└──────────────┬──────────────────────────────────┘
               │ HTTP / REST
               ▼
┌─────────────────────────────────────────────────┐
│       Express.js Backend (API Gateway)          │
│    Caching · Proxy · Patching · OpenVAS         │
└──────────────┬──────────────────────────────────┘
               │
     ┌─────────┼──────────┬──────────────┐
     ▼         ▼          ▼              ▼
┌────────┐ ┌────────┐ ┌──────────┐ ┌──────────┐
│ Redis  │ │AWS SSM │ │ OpenVAS  │ │ AWS API  │
│ Cache  │ │Patching│ │ Scanner  │ │ Gateway  │
└────────┘ └────────┘ └──────────┘ │(DynamoDB)│
                                   └──────────┘
```

**Data Flow:**
1. Frontend sends request to Express backend
2. Backend checks Redis cache (1–10ms hit)
3. On cache miss, fetches from upstream API (500–2000ms)
4. Stores result in Redis with configurable TTL
5. Returns data to frontend with source indicator (`cache` or `api`)

---

## Technology Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Frontend** | React 18.2, Chart.js 4.4, Axios 1.4 | SPA dashboard with data visualizations |
| **Backend** | Node.js 16+, Express.js 4.18 | REST API, proxy, and caching layer |
| **Cache** | Redis 7 (Docker Alpine), redis 4.6 client | Distributed caching with TTL |
| **AWS** | @aws-sdk/client-ec2, API Gateway, SSM | EC2 monitoring, patching, data source |
| **Scanning** | OpenVAS (via API) | Vulnerability scanning engine |
| **Icons** | Font Awesome 6.4 (CDN) | UI iconography |
| **Infrastructure** | Docker, Docker Compose 3.8 | Container orchestration |
| **Dev Tools** | Nodemon, concurrently | Hot-reload, parallel process runner |

---

## Getting Started

### Prerequisites

- **Node.js** 16.x or higher
- **npm** 8.x or higher
- **Docker Desktop** (required for Redis)

### Installation

```bash
# Clone the repository
git clone https://github.com/InfraCrawlers/EVAPA-Dashboard.git
cd Dashboard

# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env with your API endpoints and credentials
```

### Running the Application

```bash
# 1. Start Redis
docker compose up -d

# 2. Start Backend (in a separate terminal)
PORT=3005 npm run server

# 3. Start Frontend (in a separate terminal)
npm start
```

The dashboard opens at `http://localhost:3000`.

**Or run everything concurrently:**
```bash
docker compose up -d
npm run start:dev
```

### Production Build

```bash
npm run build
PORT=3005 npm run start:prod
```

---

## Configuration

Create a `.env` file from the provided template:

```bash
cp .env.example .env
```

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Backend server port | `5000` |
| `NODE_ENV` | Environment mode | `development` |
| `REDIS_HOST` | Redis hostname | `localhost` |
| `REDIS_PORT` | Redis port | `6379` |
| `REDIS_PASSWORD` | Redis password (if auth enabled) | — |
| `CACHE_TTL_FINDINGS` | Findings cache TTL (seconds) | `3600` |
| `CACHE_TTL_REPORTS` | Reports cache TTL (seconds) | `3600` |
| `CACHE_TTL_PATCHING` | Patching result cache TTL (seconds) | `300` |
| `CACHE_TTL_OPENVAS` | OpenVAS report cache TTL (seconds) | `300` |
| `AWS_API_ENDPOINT` | Vulnerability data API (DynamoDB) | — |
| `AWS_PATCHING_API` | Patching service API endpoint | — |
| `AWS_ACCESS_KEY_ID` | AWS credentials for EC2 listing | — |
| `AWS_SECRET_ACCESS_KEY` | AWS credentials for EC2 listing | — |
| `AWS_REGION` | AWS region | `us-east-1` |

> **Note:** Refer to `.env.example` for the full list. The server is typically run with `PORT=3005` to match the frontend proxy setting.

---

## Project Structure

```
Dashboard/
├── src/
│   ├── components/
│   │   ├── Dashboard.js         # App shell, navigation, layout
│   │   ├── Overview.js          # KPI dashboard with live monitoring
│   │   ├── Charts.js            # Chart.js visualizations (bar, pie)
│   │   ├── Vulnerabilities.js   # Findings table with search & export
│   │   ├── AssetsInventory.js   # Host-based grouping
│   │   ├── DataTable.js         # Generic data table utility
│   │   ├── History.js           # Scan + patch report archive
│   │   ├── Patching.js          # Automated patching workflow
│   │   ├── OpenVASConfig.js     # Scan management UI
│   │   └── OpenVASConfig.css    # OpenVAS config styles
│   ├── services/
│   │   └── openvasService.js    # OpenVAS API client
│   ├── dataContext.js           # State management & API layer
│   ├── mockData.js              # Demo mode fallback data
│   ├── index.js                 # React entry point (createRoot)
│   ├── index.css                # Global responsive styles
│   └── App.js                   # Root component
├── server.js                    # Express backend with Redis & API proxy
├── docker-compose.yml           # Redis container config
├── package.json                 # Dependencies & scripts
├── docs/                        # Extended documentation
└── build/                       # Production build output
```

---

## Performance

| Metric | Value |
|--------|-------|
| Cache hit response | 1–10 ms |
| Cache miss response | 500–2000 ms |
| API call reduction | ~90% |
| Production bundle | 130 kB (gzipped) |
| Cache hit rate (steady state) | 95%+ |

---

## Deployment

### Docker

```bash
docker build -t evapa-dashboard:latest .
docker run -p 3005:3005 -e REDIS_HOST=redis evapa-dashboard:latest
```

### Docker Compose (Full Stack)

```bash
docker compose up -d
```

### Cloud (AWS)

| Component | Service |
|-----------|---------|
| Frontend | CloudFront + S3 |
| Backend | EC2 / ECS |
| Cache | ElastiCache (Redis) |

---

## Documentation

Detailed documentation is available in the [`docs/`](docs/) directory:

| Document | Description |
|----------|-------------|
| [Setup Guide](docs/SETUP_GUIDE.md) | Step-by-step installation and deployment |
| [Redis Caching](docs/REDIS_CACHING.md) | Cache architecture and configuration |
| [Redis Implementation](docs/REDIS_IMPLEMENTATION.md) | Technical implementation details |
| [Patching Feature](docs/PATCHING_FEATURE.md) | Automated patching workflow |
| [Patching API](docs/PATCHING_API.md) | Patching endpoint reference |
| [Demo Mode](docs/DEMO_MODE.md) | Graceful degradation behavior |
| [Codebase Analysis](docs/CODEBASE_ANALYSIS.md) | Architecture deep-dive |

---

## Troubleshooting

<details>
<summary><strong>Redis connection failed</strong></summary>

```bash
docker ps | grep redis          # Verify container is running
docker compose down && docker compose up -d   # Restart Redis
```
</details>

<details>
<summary><strong>Backend won't start</strong></summary>

```bash
lsof -i :3005     # Check if port is already in use
node -c server.js  # Validate syntax
```
</details>

<details>
<summary><strong>Dashboard shows demo data</strong></summary>

- A yellow banner indicates demo mode is active
- Verify your `.env` file has the correct API endpoint configured
- Ensure the backend server is running and reachable
</details>

---

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/my-feature`)
3. Commit your changes (`git commit -m 'Add my feature'`)
4. Push to the branch (`git push origin feature/my-feature`)
5. Open a Pull Request

---

## License

This project is intended for **educational and demonstration purposes** as part of the Group 4 Capstone at Seneca Polytechnic.

---

<p align="center">
  <sub>Built with React, Express.js, Redis, and OpenVAS</sub>
</p>
- **Architecture:** See [docs/CODEBASE_ANALYSIS.md](docs/CODEBASE_ANALYSIS.md)

---

## 🎉 Quick Links

| Resource | Link |
|----------|------|
| **Live Demo** | http://localhost:3000 (after npm start) |
| **API Docs** | http://localhost:3005/health |
| **Redis Guide** | [docs/REDIS_CACHING.md](docs/REDIS_CACHING.md) |
| **Setup Instructions** | [docs/SETUP_GUIDE.md](docs/SETUP_GUIDE.md) |
| **GitHub** | https://github.com/InfraCrawlers/EVAPA-Dashboard |

---

**Built with ❤️ by Group 4 Capstone — Tharuka Kannangara, Swagat Koirala, Abid Al Mohaimin, Rupesh Limbadri Vanneldas, Dillon Wijayanayagam | 2026**

**Dashboard Version 2.1 | Production Ready | Enterprise Grade**
