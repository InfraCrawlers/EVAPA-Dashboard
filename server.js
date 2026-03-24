const express = require('express');
const cors = require('cors');
const redis = require('redis');
const axios = require('axios');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;
const AWS_API = process.env.AWS_API_ENDPOINT;

// Middleware
app.use(cors());
app.use(express.json());

// Redis Client
let redisClient = null;

// Initialize Redis Client
async function initializeRedis() {
  try {
    redisClient = redis.createClient({
      host: process.env.REDIS_HOST || 'localhost',
      port: process.env.REDIS_PORT || 6379,
      password: process.env.REDIS_PASSWORD || undefined,
      socket: {
        reconnectStrategy: (retries) => Math.min(retries * 50, 500)
      }
    });

    redisClient.on('error', (err) => console.error('Redis Client Error', err));
    redisClient.on('connect', () => console.log('✅ Connected to Redis'));
    
    await redisClient.connect();
    console.log('🔴 Redis client initialized');
  } catch (error) {
    console.error('❌ Redis connection failed:', error.message);
    console.log('⚠️  Server will run without caching. Make sure Redis is running.');
    redisClient = null;
  }
}

// Caching Service
class CacheService {
  constructor(client) {
    this.client = client;
  }

  async get(key) {
    if (!this.client) return null;
    try {
      const value = await this.client.get(key);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      console.error(`Cache get error for key ${key}:`, error.message);
      return null;
    }
  }

  async set(key, value, ttl = 3600) {
    if (!this.client) return;
    try {
      await this.client.setEx(key, ttl, JSON.stringify(value));
      console.log(`📌 Cached: ${key} (TTL: ${ttl}s)`);
    } catch (error) {
      console.error(`Cache set error for key ${key}:`, error.message);
    }
  }

  async invalidate(pattern) {
    if (!this.client) return;
    try {
      const keys = await this.client.keys(pattern);
      if (keys.length > 0) {
        await this.client.del(keys);
        console.log(`🗑️  Invalidated ${keys.length} cache keys matching "${pattern}"`);
      }
    } catch (error) {
      console.error(`Cache invalidation error:`, error.message);
    }
  }

  async clear() {
    if (!this.client) return;
    try {
      await this.client.flushDb();
      console.log('🗑️  Cache cleared');
    } catch (error) {
      console.error('Cache clear error:', error.message);
    }
  }

  async getStats() {
    if (!this.client) return null;
    try {
      const info = await this.client.info('stats');
      return info;
    } catch (error) {
      console.error('Cache stats error:', error.message);
      return null;
    }
  }
}

const cache = new CacheService(redisClient);

// Fetch from AWS API with error handling
async function fetchFromAWS(endpoint) {
  try {
    const response = await axios.get(`${AWS_API}${endpoint}`, {
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json'
      }
    });
    return response.data;
  } catch (error) {
    console.error(`AWS API Error for ${endpoint}:`, error.message);
    throw error;
  }
}

// API Routes

/**
 * GET /api/findings
 * Returns vulnerability findings with caching
 */
app.get('/api/findings', async (req, res) => {
  const cacheKey = 'findings:all';
  
  try {
    // Try cache first
    let data = await cache.get(cacheKey);
    
    if (data) {
      console.log('✅ Cache HIT: findings');
      return res.json({ ...data, source: 'cache' });
    }

    // Cache miss - fetch from AWS
    console.log('❌ Cache MISS: findings, fetching from AWS...');
    data = await fetchFromAWS('/findings');
    
    // Cache the result
    const ttl = parseInt(process.env.CACHE_TTL_FINDINGS) || 3600;
    await cache.set(cacheKey, data, ttl);
    
    res.json({ ...data, source: 'aws' });
  } catch (error) {
    res.status(500).json({ 
      error: 'Failed to fetch findings',
      message: error.message,
      source: 'error'
    });
  }
});

/**
 * GET /api/reports
 * Returns vulnerability reports with caching
 */
app.get('/api/reports', async (req, res) => {
  const cacheKey = 'reports:all';
  
  try {
    let data = await cache.get(cacheKey);
    
    if (data) {
      console.log('✅ Cache HIT: reports');
      return res.json({ ...data, source: 'cache' });
    }

    console.log('❌ Cache MISS: reports, fetching from AWS...');
    data = await fetchFromAWS('/reports');
    
    const ttl = parseInt(process.env.CACHE_TTL_REPORTS) || 3600;
    await cache.set(cacheKey, data, ttl);
    
    res.json({ ...data, source: 'aws' });
  } catch (error) {
    res.status(500).json({ 
      error: 'Failed to fetch reports',
      message: error.message,
      source: 'error'
    });
  }
});

/**
 * GET /api/systems
 * Returns systems/assets with caching
 */
app.get('/api/systems', async (req, res) => {
  const cacheKey = 'systems:all';
  
  try {
    let data = await cache.get(cacheKey);
    
    if (data) {
      console.log('✅ Cache HIT: systems');
      return res.json({ ...data, source: 'cache' });
    }

    console.log('❌ Cache MISS: systems, fetching from AWS...');
    data = await fetchFromAWS('/systems');
    
    const ttl = parseInt(process.env.CACHE_TTL_SYSTEMS) || 1800;
    await cache.set(cacheKey, data, ttl);
    
    res.json({ ...data, source: 'aws' });
  } catch (error) {
    res.status(500).json({ 
      error: 'Failed to fetch systems',
      message: error.message,
      source: 'error'
    });
  }
});

/**
 * POST /patching/apply
 * Trigger patching - invalidates related caches
 */
app.post('/patching/apply', async (req, res) => {
  try {
    console.log('🔧 Patching triggered...');
    const response = await fetchFromAWS('/patching/apply');
    
    // Invalidate related caches
    await cache.invalidate('findings:*');
    await cache.invalidate('reports:*');
    await cache.invalidate('systems:*');
    
    res.json({ ...response, cached_cleared: true });
  } catch (error) {
    res.status(500).json({ 
      error: 'Patching failed',
      message: error.message
    });
  }
});

/**
 * POST /scanning/openvas-trigger
 * Trigger scanning - invalidates related caches
 */
app.post('/scanning/openvas-trigger', async (req, res) => {
  try {
    console.log('🔍 Scanning triggered...');
    const response = await fetchFromAWS('/scanning/openvas-trigger');
    
    // Invalidate related caches
    await cache.invalidate('findings:*');
    await cache.invalidate('reports:*');
    
    res.json({ ...response, cached_cleared: true });
  } catch (error) {
    res.status(500).json({ 
      error: 'Scanning failed',
      message: error.message
    });
  }
});

/**
 * POST /cache/clear
 * Manually clear all caches
 */
app.post('/cache/clear', async (req, res) => {
  try {
    await cache.clear();
    res.json({ message: 'Cache cleared successfully' });
  } catch (error) {
    res.status(500).json({ 
      error: 'Cache clear failed',
      message: error.message
    });
  }
});

/**
 * GET /cache/stats
 * Get cache statistics
 */
app.get('/cache/stats', async (req, res) => {
  try {
    if (!redisClient) {
      return res.json({ 
        status: 'disconnected',
        message: 'Redis is not connected'
      });
    }
    
    const info = await redisClient.info('memory');
    res.json({ 
      status: 'connected',
      info 
    });
  } catch (error) {
    res.status(500).json({ 
      error: 'Failed to get cache stats',
      message: error.message
    });
  }
});

/**
 * GET /health
 * Health check endpoint
 */
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok',
    redis: redisClient ? 'connected' : 'disconnected',
    timestamp: new Date().toISOString()
  });
});

/**
 * GET /api/* - Proxy all other requests to AWS
 */
app.get('/api/*', async (req, res) => {
  try {
    const endpoint = req.path.replace('/api', '');
    const cacheKey = `api:${endpoint}`;
    
    // Try cache
    let data = await cache.get(cacheKey);
    if (data) {
      console.log(`✅ Cache HIT: ${endpoint}`);
      return res.json({ ...data, source: 'cache' });
    }

    console.log(`❌ Cache MISS: ${endpoint}, fetching from AWS...`);
    data = await fetchFromAWS(endpoint);
    
    await cache.set(cacheKey, data, 3600);
    res.json({ ...data, source: 'aws' });
  } catch (error) {
    res.status(500).json({ 
      error: 'Request failed',
      message: error.message
    });
  }
});

/**
 * POST /api/* - Proxy POST requests to AWS
 */
app.post('/api/*', async (req, res) => {
  try {
    const endpoint = req.path.replace('/api', '');
    
    const response = await axios.post(
      `${AWS_API}${endpoint}`,
      req.body,
      { timeout: 10000 }
    );
    
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ 
      error: 'Request failed',
      message: error.message
    });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ 
    error: 'Internal server error',
    message: err.message 
  });
});

// Start server
async function start() {
  await initializeRedis();
  
  app.listen(PORT, () => {
    console.log(`\n🚀 Dashboard API Server running on http://localhost:${PORT}`);
    console.log(`📚 API Documentation:`);
    console.log(`   GET  http://localhost:${PORT}/api/findings`);
    console.log(`   GET  http://localhost:${PORT}/api/reports`);
    console.log(`   GET  http://localhost:${PORT}/api/systems`);
    console.log(`   POST http://localhost:${PORT}/patching/apply`);
    console.log(`   POST http://localhost:${PORT}/scanning/openvas-trigger`);
    console.log(`   POST http://localhost:${PORT}/cache/clear`);
    console.log(`   GET  http://localhost:${PORT}/cache/stats`);
    console.log(`   GET  http://localhost:${PORT}/health`);
    console.log(`\n⚙️  Environment: ${process.env.NODE_ENV}\n`);
  });
}

start().catch(error => {
  console.error('Failed to start server:', error);
  process.exit(1);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM signal received: closing HTTP server');
  if (redisClient) {
    await redisClient.quit();
  }
  process.exit(0);
});

module.exports = app;
