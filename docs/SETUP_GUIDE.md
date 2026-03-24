# Redis-Backed Dashboard Setup Guide

This guide walks through setting up the Dashboard with Redis caching for production-grade performance.

## System Requirements

- **Operating System:** macOS, Linux, or Windows (with WSL2)
- **Node.js:** 16.x or higher
- **npm:** 8.x or higher
- **Docker Desktop:** Latest version
- **Docker Compose:** Included with Docker Desktop

## Installation Steps

### Step 1: Clone and Setup

```bash
cd ~/Desktop
git clone https://github.com/InfraCrawlers/EVAPA-Dashboard.git
cd Dashboard
npm install
```

### Step 2: Configure Environment

Copy the example `.env` file:

```bash
cp .env.example .env
```

Update `.env` with your values (defaults are usually fine for local dev):

```bash
# .env
PORT=5000
REDIS_HOST=localhost
REDIS_PORT=6379
NODE_ENV=development
CACHE_TTL_FINDINGS=3600
CACHE_TTL_REPORTS=3600
CACHE_TTL_SYSTEMS=1800
```

### Step 3: Start Redis

Ensure Docker Desktop is running, then:

```bash
docker compose up -d
```

Verify Redis is running:

```bash
docker compose ps
```

Expected output:
```
NAME          STATUS
dashboard-redis   Up (healthy)
```

### Step 4: Start Backend Server

In one terminal:

```bash
npm run server
```

You should see:
```
✅ Connected to Redis
🚀 Dashboard API Server running on http://localhost:5000
📚 API Documentation:
   GET  http://localhost:5000/api/findings
   ...
```

### Step 5: Start Frontend

In another terminal:

```bash
npm start
```

The React app will open at `http://localhost:3000`.

### Step 6: Verify Setup

Test the backend is working:

```bash
# In another terminal
curl http://localhost:5000/health
```

Expected response:
```json
{
  "status": "ok",
  "redis": "connected",
  "timestamp": "2026-03-24T12:00:00.000Z"
}
```

## Troubleshooting

### Issue: Redis Connection Failed

**Error:** `❌ Redis connection failed: Error: ECONNREFUSED`

**Solution:**
1. Check Docker is running: `docker ps`
2. Check Redis container: `docker compose ps`
3. Restart Redis:
   ```bash
   docker compose down
   docker compose up -d
   ```
4. Check Redis logs: `docker compose logs redis`

### Issue: Port Already in Use

**Error:** `Error: listen EADDRINUSE :::5000`

**Solution:**
```bash
# Kill process on port 5000
lsof -i :5000
kill -9 <PID>

# Or use different port in .env
PORT=5001
npm run server
```

### Issue: Frontend Can't Reach Backend

**Error:** Network error in browser console

**Solutions:**
1. Verify backend is running: `curl http://localhost:5000/health`
2. Check CORS is enabled (it is by default in server.js)
3. Clear browser cache: `Ctrl+Shift+Del`
4. Try a different port in .env if 5000 is problematic

### Issue: Low Memory Performance

**Error:** Slow responses even with caching

**Solutions:**
1. Check Redis memory: `curl http://localhost:5000/cache/stats`
2. Clear old cache: `curl -X POST http://localhost:5000/cache/clear`
3. Reduce TTL in .env for less memory usage
4. Monitor with: `docker compose exec redis redis-cli info memory`

## Testing the Cache

### Test 1: Cache Miss

```bash
time curl http://localhost:5000/api/findings
```

First request should take 500-2000ms and have `"source": "aws"`.

### Test 2: Cache Hit

```bash
time curl http://localhost:5000/api/findings
```

Second request (within 1 hour) should take 1-10ms and have `"source": "cache"`.

### Test 3: Manual Cache Clear

```bash
# Clear cache
curl -X POST http://localhost:5000/cache/clear

# Next request will be cache miss again
curl http://localhost:5000/api/findings
```

### Test 4: Cache Invalidation on Patching

```bash
# Check cache before patching
curl http://localhost:5000/cache/stats

# Trigger patching (from UI or API)
curl -X POST http://localhost:5000/patching/apply

# Cache should be cleared (0 keys)
curl http://localhost:5000/cache/stats
```

## Development Workflow

### Option A: Run Frontend Only (No Backend)

Good for UI development when you don't need caching:

```bash
npm start
```

The app will use browser `localStorage` for caching instead.

### Option B: Run Both Concurrently (Recommended)

Best for full-stack development:

```bash
npm run start:dev
```

This runs both the server and frontend in parallel.

### Option C: Custom Configuration

Run components separately with custom options:

**Terminal 1 - Backend (with hot-reload):**
```bash
npm run server
```

**Terminal 2 - Frontend:**
```bash
npm start
```

**Terminal 3 - Redis monitoring (optional):**
```bash
docker compose exec redis redis-cli
# Then in redis-cli:
MONITOR    # Watch all cache operations
```

## Production Deployment

### Docker-based Deployment

Build a Docker image with the backend included:

```dockerfile
# Dockerfile (at project root)
FROM node:16-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN npm run build
CMD ["npm", "run", "start:prod"]
```

Deploy with:

```bash
docker build -t dashboard:latest .
docker run -p 5000:5000 -e REDIS_HOST=redis-host dashboard:latest
```

### AWS Deployment Example

Deploy backend to AWS Elastic Beanstalk with ElastiCache for Redis:

```bash
# Configure .ebextensions/env.config
REDIS_HOST=your-elasticache-endpoint
REDIS_PORT=6379
AWS_API_ENDPOINT=https://your-api-gateway.com

# Deploy
eb deploy
```

### Environment Variables

For production, set these securely:

```bash
# AWS Secrets Manager / .env
AWS_API_ENDPOINT=https://prod-api.company.com
REDIS_HOST=redis-prod.c7g4nh.ng.0001.use1.cache.amazonaws.com
REDIS_PASSWORD=your-secure-password
REDIS_PORT=6379
NODE_ENV=production
CACHE_TTL_FINDINGS=7200
```

## Performance Optimization

### Optimize Cache TTL

For frequently changing data (scans):
```bash
CACHE_TTL_FINDINGS=300      # 5 minutes
CACHE_TTL_REPORTS=300       # 5 minutes
CACHE_TTL_SYSTEMS=600       # 10 minutes
```

For stable data:
```bash
CACHE_TTL_FINDINGS=86400    # 1 day
CACHE_TTL_REPORTS=86400     # 1 day
CACHE_TTL_SYSTEMS=86400     # 1 day
```

### Monitor Cache Hit Rate

```bash
# Check logs for hit vs miss ratio
npm run server 2>&1 | grep "Cache"

# Or watch cache stats
watch -n 5 'curl -s http://localhost:5000/cache/stats | jq'
```

## Next Steps

1. ✅ Complete the setup above
2. 📖 Read [docs/REDIS_CACHING.md](../docs/REDIS_CACHING.md) for detailed caching documentation
3. 🧪 Review [docs/CODEBASE_ANALYSIS.md](../docs/CODEBASE_ANALYSIS.md) for architecture details
4. 🔧 Explore [docs/PATCHING_FEATURE.md](../docs/PATCHING_FEATURE.md) for automated patching
5. 📊 Check Performance metrics in the README

## Support

For issues or questions:

1. Check **Troubleshooting** section above
2. Review Docker Compose logs: `docker compose logs -f`
3. Check backend server logs: Look at terminal where `npm run server` is running
4. Check browser Console: `F12 → Console tab`

---

**Happy caching! 🚀**
