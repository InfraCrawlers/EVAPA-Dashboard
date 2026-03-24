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
 * ==========================================
 * OPENVAS API ROUTES
 * ==========================================
 */

const OPENVAS_API = 'https://edonu024me.execute-api.us-east-1.amazonaws.com/v1';

/**
 * POST /openvas/port-lists - Create a new port list
 */
app.post('/openvas/port-lists', async (req, res) => {
  try {
    const { name, port_range } = req.body;
    
    if (!name || !port_range) {
      return res.status(400).json({ 
        error: 'Missing required fields: name, port_range' 
      });
    }

    const response = await axios.post(
      `${OPENVAS_API}/port-lists`,
      { name, port_range },
      { timeout: 10000 }
    );

    // Invalidate port lists cache
    await cache.invalidate('openvas:port-lists:*');
    
    console.log(`✅ OpenVAS Port List created: ${name}`);
    res.json({ ...response.data, created: true });
  } catch (error) {
    console.error('❌ OpenVAS Port List creation failed:', error.message);
    res.status(500).json({ 
      error: 'Failed to create port list',
      message: error.message
    });
  }
});

/**
 * GET /openvas/port-lists - Get all port lists with caching
 */
app.get('/openvas/port-lists', async (req, res) => {
  try {
    const cacheKey = 'openvas:port-lists:all';
    
    // Try cache first
    let data = await cache.get(cacheKey);
    if (data) {
      console.log('✅ Cache HIT: OpenVAS port lists');
      return res.json({ ...data, source: 'cache' });
    }

    console.log('❌ Cache MISS: OpenVAS port lists, fetching...');
    const response = await axios.get(`${OPENVAS_API}/port-lists`, { timeout: 10000 });
    
    // Cache the response (15 minutes TTL)
    await cache.set(cacheKey, response.data, 900);
    
    res.json({ ...response.data, source: 'openvas' });
  } catch (error) {
    console.error('❌ OpenVAS Port Lists fetch failed:', error.message);
    res.status(500).json({ 
      error: 'Failed to fetch port lists',
      message: error.message
    });
  }
});

/**
 * POST /openvas/targets - Create a new target
 */
app.post('/openvas/targets', async (req, res) => {
  try {
    const { name, hosts, port_list_name } = req.body;
    
    if (!name || !hosts || !port_list_name) {
      return res.status(400).json({ 
        error: 'Missing required fields: name, hosts, port_list_name' 
      });
    }

    const response = await axios.post(
      `${OPENVAS_API}/targets`,
      { name, hosts, port_list_name },
      { timeout: 10000 }
    );

    // Invalidate targets cache
    await cache.invalidate('openvas:targets:*');
    
    console.log(`✅ OpenVAS Target created: ${name}`);
    res.json({ ...response.data, created: true });
  } catch (error) {
    console.error('❌ OpenVAS Target creation failed:', error.message);
    res.status(500).json({ 
      error: 'Failed to create target',
      message: error.message
    });
  }
});

/**
 * GET /openvas/targets - Get all targets with caching
 */
app.get('/openvas/targets', async (req, res) => {
  try {
    const cacheKey = 'openvas:targets:all';
    
    // Try cache first
    let data = await cache.get(cacheKey);
    if (data) {
      console.log('✅ Cache HIT: OpenVAS targets');
      return res.json({ ...data, source: 'cache' });
    }

    console.log('❌ Cache MISS: OpenVAS targets, fetching...');
    const response = await axios.get(`${OPENVAS_API}/targets`, { timeout: 10000 });
    
    // Cache the response (15 minutes TTL)
    await cache.set(cacheKey, response.data, 900);
    
    res.json({ ...response.data, source: 'openvas' });
  } catch (error) {
    console.error('❌ OpenVAS Targets fetch failed:', error.message);
    res.status(500).json({ 
      error: 'Failed to fetch targets',
      message: error.message
    });
  }
});

/**
 * POST /openvas/tasks - Create a new scan task
 */
app.post('/openvas/tasks', async (req, res) => {
  try {
    const { name, target_name, config_name, scanner_name } = req.body;
    
    if (!name || !target_name) {
      return res.status(400).json({ 
        error: 'Missing required fields: name, target_name' 
      });
    }

    const response = await axios.post(
      `${OPENVAS_API}/tasks`,
      { 
        name, 
        target_name, 
        config_name: config_name || 'Full and fast',
        scanner_name: scanner_name || 'OpenVAS Scanner'
      },
      { timeout: 10000 }
    );

    // Invalidate tasks cache
    await cache.invalidate('openvas:tasks:*');
    
    console.log(`✅ OpenVAS Task created: ${name}`);
    res.json({ ...response.data, created: true });
  } catch (error) {
    console.error('❌ OpenVAS Task creation failed:', error.message);
    res.status(500).json({ 
      error: 'Failed to create task',
      message: error.message
    });
  }
});

/**
 * GET /openvas/tasks - Get all scan tasks with caching
 */
app.get('/openvas/tasks', async (req, res) => {
  try {
    const cacheKey = 'openvas:tasks:all';
    
    // Try cache first (shorter TTL for tasks since progress changes)
    let data = await cache.get(cacheKey);
    if (data) {
      console.log('✅ Cache HIT: OpenVAS tasks');
      return res.json({ ...data, source: 'cache' });
    }

    console.log('❌ Cache MISS: OpenVAS tasks, fetching...');
    const response = await axios.get(`${OPENVAS_API}/tasks`, { timeout: 10000 });
    
    // Cache the response (5 minutes TTL for tasks - changes frequently)
    await cache.set(cacheKey, response.data, 300);
    
    res.json({ ...response.data, source: 'openvas' });
  } catch (error) {
    console.error('❌ OpenVAS Tasks fetch failed:', error.message);
    res.status(500).json({ 
      error: 'Failed to fetch tasks',
      message: error.message
    });
  }
});

/**
 * GET /openvas/task-progress/:taskName - Get task progress details
 */
app.get('/openvas/task-progress/:taskName', async (req, res) => {
  try {
    const { taskName } = req.params;
    const decodedName = decodeURIComponent(taskName);
    const cacheKey = `openvas:task-progress:${decodedName}`;
    
    // Try cache first (1 minute TTL for progress - real-time)
    let data = await cache.get(cacheKey);
    if (data) {
      console.log(`✅ Cache HIT: Task progress for ${decodedName}`);
      return res.json({ ...data, source: 'cache' });
    }

    console.log(`❌ Cache MISS: Task progress for ${decodedName}, fetching...`);
    const response = await axios.get(
      `${OPENVAS_API}/tasks?name=${encodeURIComponent(decodedName)}`,
      { timeout: 10000 }
    );
    
    // Cache the response (1 minute TTL)
    await cache.set(cacheKey, response.data, 60);
    
    res.json({ ...response.data, source: 'openvas' });
  } catch (error) {
    console.error('❌ OpenVAS Task Progress fetch failed:', error.message);
    res.status(500).json({ 
      error: 'Failed to fetch task progress',
      message: error.message
    });
  }
});

/**
 * POST /openvas/tasks/:taskName/start - Start a scan for a task
 * Now handles looking up task ID by name
 */
app.post('/openvas/tasks/:taskName/start', async (req, res) => {
  try {
    const { taskName } = req.params;
    const decodedName = decodeURIComponent(taskName);
    
    // First, fetch all tasks to find the ID matching this name
    console.log(`🔍 Looking up task ID for: ${decodedName}`);
    const tasksResponse = await axios.get(`${OPENVAS_API}/tasks`, { timeout: 10000 });
    
    // Find task with matching name
    const targetTask = tasksResponse.data.tasks?.find(t => t.name === decodedName);
    
    if (!targetTask) {
      return res.status(404).json({ 
        error: 'Task not found',
        message: `No task found with name: ${decodedName}`,
        taskName: decodedName,
        availableTasks: tasksResponse.data.tasks?.map(t => ({ id: t.id, name: t.name })) || []
      });
    }

    const taskId = targetTask.id;
    console.log(`✅ Found task ID: ${taskId} for name: ${decodedName}`);
    
    // Now start the scan using the task ID
    const response = await axios.post(
      `${OPENVAS_API}/tasks/${taskId}/start`,
      {},
      { timeout: 10000 }
    );

    // Invalidate task caches
    await cache.invalidate('openvas:tasks:*');
    await cache.invalidate(`openvas:task-progress:${decodedName}`);
    
    console.log(`✅ OpenVAS Scan started successfully for task: ${decodedName} (${taskId})`);
    res.json({ 
      ...response.data, 
      scan_started: true,
      taskId: taskId,
      taskName: decodedName
    });
  } catch (error) {
    console.error('❌ OpenVAS Scan start failed:', error.response?.status, error.message);
    res.status(error.response?.status || 500).json({ 
      error: 'Failed to start scan',
      message: error.message,
      status: error.response?.status,
      details: error.response?.data
    });
  }
});

/**
 * ==========================================
 * END OPENVAS API ROUTES
 * ==========================================
 */

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
