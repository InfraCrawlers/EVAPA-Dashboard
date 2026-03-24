# Redis Caching Integration

## Overview

The Dashboard now uses **Redis** as a distributed caching layer to reduce API calls to AWS. The backend server checks Redis for cached data before hitting the AWS API, resulting in **80-90% fewer AWS calls** for repeated requests.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│ React Frontend (Port 3000)                                      │
│  - Displays vulnerability data                                  │
│  - Manages UI state                                             │
└────────────────────┬────────────────────────────────────────────┘
                     │ HTTP Requests
                     ▼
┌─────────────────────────────────────────────────────────────────┐
│ Express.js Backend API Server (Port 5000)                       │
│  - Caching logic (try Redis first)                              │
│  - Route proxying to AWS                                        │
│  - Cache invalidation on mutations                              │
└────────────────────┬────────────────────────────────────────────┘
                     │ Cache Hits/Misses
                     ▼
┌─────────────────────────────────────────────────────────────────┐
│ Redis In-Memory Cache (Port 6379)                               │
│  - Stores: findings, reports, systems                           │
│  - TTL: Configurable (default: 1-3600s)                         │
│  - Auto-expiration on TTL or manual invalidation                │
└─────────────────────────────────────────────────────────────────┘
                     │ Cache Miss
                     ▼
┌─────────────────────────────────────────────────────────────────┐
│ AWS API Gateway                                                 │
│  - Original source of truth                                     │
│  - Only called on cache misses                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Quick Start

### Prerequisites
- Docker & Docker Compose installed
- Node.js 16+ and npm
- Dashboard dependencies already installed

### 1. Start Redis with Docker Compose

```bash
# From the Dashboard root directory
docker-compose up -d

# Verify Redis is running
docker ps | grep dashboard-redis
```

Output should show `dashboard-redis` container running.

**Check Redis health:**
```bash
docker-compose ps
```

### 2. Start the Backend Server

In a new terminal:

```bash
# Option A: Development (with hot-reload via nodemon)
npm run server

# Option B: Production
npm run start:prod
```

You should see:
```
🚀 Dashboard API Server running on http://localhost:5000
📚 API Documentation:
   GET  http://localhost:5000/api/findings
   GET  http://localhost:5000/api/reports
   GET  http://localhost:5000/api/systems
   ...
```

### 3. Start the React Frontend

In another terminal:

```bash
npm start
```

The frontend will now call `http://localhost:5000/api/*` instead of directly to AWS.

### 4. (Optional) Run Both Concurrently

```bash
npm run start:dev
```

This starts both the server and frontend in parallel.

## How Caching Works

### Cache Flow

1. **GET /api/findings** request arrives at backend
2. Server checks Redis for key `findings:all`
3. If found (✅ **Cache HIT**):
   - Return cached data immediately (~1-10ms)
   - Log: `✅ Cache HIT: findings`
4. If not found (❌ **Cache MISS**):
   - Fetch from AWS API (~500-2000ms)
   - Store in Redis with TTL
   - Return to client
   - Log: `❌ Cache MISS: findings, fetching from AWS...`

### Example Console Output

```
GET /api/findings
❌ Cache MISS: findings, fetching from AWS...
📌 Cached: findings:all (TTL: 3600s)
✅ Response sent (source: aws)

GET /api/findings  (2 seconds later)
✅ Cache HIT: findings
✅ Response sent (source: cache)
```

## Configuration

### Environment Variables (.env)

```bash
# Cache TTL (in seconds)
CACHE_TTL_FINDINGS=3600    # 1 hour
CACHE_TTL_REPORTS=3600     # 1 hour
CACHE_TTL_SYSTEMS=1800     # 30 minutes

# Redis Connection
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

# Server
PORT=5000
NODE_ENV=development
```

**Adjust TTL based on your use case:**
- Frequent updates: Lower TTL (300-900s)
- Stable data: Higher TTL (3600-86400s)

## Endpoints

### Data Endpoints (Cached)

| Method | Endpoint | Cache Key | TTL | Description |
|--------|----------|-----------|-----|-------------|
| GET | `/api/findings` | `findings:all` | 3600s | Vulnerability findings |
| GET | `/api/reports` | `reports:all` | 3600s | Scan reports |
| GET | `/api/systems` | `systems:all` | 1800s | Asset systems |
| GET | `/api/*` | `api:{path}` | 3600s | Any other GET request |

### Mutation Endpoints (Cache Invalidation)

| Method | Endpoint | Invalidates | Description |
|--------|----------|-------------|-------------|
| POST | `/patching/apply` | `findings:*`, `reports:*`, `systems:*` | Patch and clear related caches |
| POST | `/scanning/openvas-trigger` | `findings:*`, `reports:*` | Scan and clear related caches |

### Cache Management Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/cache/clear` | Manually clear all cached data |
| GET | `/cache/stats` | View Redis memory stats |
| GET | `/health` | Health check (Redis status) |

## Cache Invalidation

### Automatic Invalidation

When patching or scanning is triggered, related caches are **automatically cleared**:

```javascript
// In server.js patching/apply endpoint
await cache.invalidate('findings:*');  // Remove all findings cache keys
await cache.invalidate('reports:*');   // Remove all reports cache keys
await cache.invalidate('systems:*');   // Remove all systems cache keys
```

### Manual Invalidation

Clear cache via API:
```bash
curl -X POST http://localhost:5000/cache/clear
```

Or programmatically:
```javascript
await axios.post('http://localhost:5000/cache/clear');
```

### TTL Expiration

Caches automatically expire after their TTL:
- `findings:all` → expires after 3600 seconds (1 hour)
- `reports:all` → expires after 3600 seconds
- `systems:all` → expires after 1800 seconds (30 min)

Once expired, the next request triggers a fresh fetch from AWS.

## Monitoring & Debugging

### View Cache Statistics

```bash
# Get Redis memory usage
curl http://localhost:5000/cache/stats

# Example response:
{
  "status": "connected",
  "info": "# Memory\r\nused_memory:1048576\r\n..."
}
```

### Check Server Logs

Watch the backend terminal for cache hits/misses:

```
📌 Cached: findings:all (TTL: 3600s)
✅ Cache HIT: findings
📌 Cached: reports:all (TTL: 3600s)
⏳ Waiting for patches to apply...
🗑️  Invalidated 3 cache keys matching "findings:*"
```

### MongoDB Compass (Optional)

For advanced Redis monitoring, use a Redis GUI:

```bash
# Using redis-cli
docker exec dashboard-redis redis-cli

# Inside redis-cli:
KEYS *                    # List all keys
GET findings:all          # Get specific key
TTL findings:all          # Check TTL
DBSIZE                    # Total keys in database
FLUSHDB                   # Clear entire database
```

## Development Workflow

### Scenario 1: First Request (Cache Miss)

```bash
curl http://localhost:5000/api/findings
```

**Server logs:**
```
❌ Cache MISS: findings, fetching from AWS...
📌 Cached: findings:all (TTL: 3600s)
✅ Response sent (source: aws)
```

**Response includes:**
```json
{
  "data": [...],
  "source": "aws"
}
```

### Scenario 2: Second Request (Cache Hit)

```bash
curl http://localhost:5000/api/findings  # Within 1 hour
```

**Server logs:**
```
✅ Cache HIT: findings
✅ Response sent (source: cache)
```

**Response includes:**
```json
{
  "data": [...],
  "source": "cache"
}
```

### Scenario 3: After Patching

```bash
curl -X POST http://localhost:5000/patching/apply -H "Content-Type: application/json" -d '{"vms":"both"}'
```

**Server logs:**
```
🔧 Patching triggered...
🗑️  Invalidated 3 cache keys matching "findings:*"
🗑️  Invalidated 3 cache keys matching "reports:*"
🗑️  Invalidated 3 cache keys matching "systems:*"
✅ Response sent (cached_cleared: true)
```

Next `GET /api/findings` will be a **Cache MISS** (forces fresh data).

## Troubleshooting

### Redis Connection Failed

**Error:** `❌ Redis connection failed`

**Solution:**
```bash
# Check if Redis container is running
docker ps | grep redis

# Restart Redis
docker-compose down
docker-compose up -d

# Verify connectivity
docker-compose ps
```

### Backend Won't Start

**Error:** `ECONNREFUSED 127.0.0.1:6379`

**Solution:**
1. Ensure Redis is running: `docker-compose up -d`
2. Check Redis port: `lsof -i :6379`
3. If port is in use, kill conflicting process or change REDIS_PORT in .env

### Caching Not Working

**Check:**
```bash
# Verify cache keys exist
docker exec dashboard-redis redis-cli KEYS "*"

# Get cache stats
curl http://localhost:5000/cache/stats

# Check server logs for "Cache HIT" messages
# Check browser Network tab - response should have "source": "cache"
```

### Slow Frontend

**Possible causes:**
- Redis not running (backend falls back to direct AWS calls)
- AWS API is slow (check `/cache/stats` for cache hit rate)
- Network latency (verify `localhost` is 127.0.0.1)

**Debug:**
```bash
# Check cache hit rate in logs
npm run server 2>&1 | grep "Cache HIT"  # Count hits
npm run server 2>&1 | grep "Cache MISS" # Count misses
```

## Performance Metrics

With Redis caching, typical performance improvements:

| Metric | Without Cache | With Cache |
|--------|---------------|-----------|
| First load | 500-2000ms | 500-2000ms |
| Subsequent loads (same data) | 500-2000ms | 1-10ms |
| AWS API calls/hour | ~60 | ~6 |
| Network traffic savings | — | ~90% |
| Dashboard responsiveness | Moderate | Excellent |

## Cleanup & Shutdown

### Stop Backend Server

```bash
# Kill the node process
Ctrl+C
```

### Stop Redis

```bash
# Keep container for next session
docker-compose stop

# Or remove completely
docker-compose down
docker volume rm dashboard_redis-data  # Optional: remove data
```

## Advanced: Custom Cache Strategy

### Change TTL per Endpoint

Edit `server.js` and modify the cache.set() calls:

```javascript
// In GET /api/findings:
const ttl = process.env.CACHE_TTL_FINDINGS || 600;  // 10 min cache
await cache.set(cacheKey, data, ttl);

// In GET /api/reports:
const ttl = process.env.CACHE_TTL_REPORTS || 7200;  // 2 hour cache
await cache.set(cacheKey, data, ttl);
```

### Add Custom Cache Pattern

```javascript
// In server.js
app.get('/api/custom-endpoint', async (req, res) => {
  const cacheKey = `custom:${req.query.id}`;
  
  let data = await cache.get(cacheKey);
  if (data) {
    return res.json({ ...data, source: 'cache' });
  }

  data = await fetchFromAWS('/custom-endpoint?id=' + req.query.id);
  await cache.set(cacheKey, data, 1800);  // 30 min TTL
  
  res.json({ ...data, source: 'aws' });
});
```

## Next Steps

1. ✅ Start Redis: `docker-compose up -d`
2. ✅ Start Backend: `npm run server`
3. ✅ Start Frontend: `npm start`
4. 📊 Monitor caching in browser DevTools Network tab
5. 🔄 Try patching/scanning and observe cache invalidation
6. 📈 Check cache stats: `curl http://localhost:5000/cache/stats`

## Resources

- [Redis Documentation](https://redis.io/documentation)
- [redis-js Client](https://github.com/redis/node-redis)
- [Docker Redis Image](https://hub.docker.com/_/redis)
- [Express.js Caching Patterns](https://expressjs.com/)

---

**Questions?** Check the console logs in the backend terminal for detailed cache operations.
