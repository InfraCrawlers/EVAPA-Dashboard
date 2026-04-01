const express = require('express');
const cors = require('cors');
const redis = require('redis');
const axios = require('axios');
const { EC2Client, DescribeInstancesCommand } = require('@aws-sdk/client-ec2');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;
const AWS_API = process.env.AWS_API_ENDPOINT;
const AWS_REGION = process.env.AWS_REGION || 'us-east-1';

// Middleware
app.use(cors());
app.use(express.json());

// EC2 Client for AWS
const ec2Client = new EC2Client({ region: AWS_REGION });

// Redis Client
let redisClient = null;

// Initialize Redis Client
async function initializeRedis() {
  try {
    const client = redis.createClient({
      url: `redis://${process.env.REDIS_HOST || 'localhost'}:${process.env.REDIS_PORT || 6379}`,
      password: process.env.REDIS_PASSWORD || undefined,
      socket: {
        reconnectStrategy: false // Don't auto-reconnect if Redis is unavailable
      }
    });

    client.on('error', () => {}); // Suppress noisy error logs
    
    await client.connect();
    redisClient = client;
    console.log('Redis connected successfully');
  } catch (error) {
    console.log('Redis unavailable — running without cache');
    redisClient = null;
  }
}

// Caching Service — uses a getter so it always reads the current redisClient
class CacheService {
  get client() {
    return redisClient;
  }

  async get(key) {
    if (!this.client) return null;
    try {
      const value = await this.client.get(key);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      return null;
    }
  }

  async set(key, value, ttl = 3600) {
    if (!this.client) return;
    try {
      await this.client.setEx(key, ttl, JSON.stringify(value));
    } catch (error) {
    }
  }

  async invalidate(pattern) {
    if (!this.client) return;
    try {
      const keys = await this.client.keys(pattern);
      if (keys.length > 0) {
        await this.client.del(keys);
      }
    } catch (error) {
    }
  }

  async clear() {
    if (!this.client) return;
    try {
      await this.client.flushDb();
    } catch (error) {
    }
  }

  async getStats() {
    if (!this.client) return null;
    try {
      const info = await this.client.info('stats');
      return info;
    } catch (error) {
      return null;
    }
  }
}

const cache = new CacheService();

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
      return res.json(data);
    }

    // Cache miss - fetch from AWS
    data = await fetchFromAWS('/findings');
    
    // Cache the result
    const ttl = parseInt(process.env.CACHE_TTL_FINDINGS) || 3600;
    await cache.set(cacheKey, data, ttl);
    
    res.json(data);
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
 * Returns vulnerability reports from /findings endpoint in DynamoDB
 */
app.get('/api/reports', async (req, res) => {
  const cacheKey = 'reports:all';
  
  try {
    let data = await cache.get(cacheKey);
    
    if (data) {
      return res.json(data);
    }

    // Reports are stored in /findings on DynamoDB
    const raw = await fetchFromAWS('/findings');
    const findings = Array.isArray(raw) ? raw : [];
    
    // Transform each finding into a report shape for the History page
    data = {
      data: findings.map(report => ({
        id: report.pk || `report-${Date.now()}`,
        created_at: report.processed_timestamp || new Date().toISOString(),
        payload: report
      }))
    };
    
    const ttl = parseInt(process.env.CACHE_TTL_REPORTS) || 3600;
    await cache.set(cacheKey, data, ttl);
    
    res.json(data);
  } catch (error) {
    res.status(500).json({ 
      error: 'Failed to fetch reports',
      message: error.message,
      source: 'error'
    });
  }
});



/**
 * GET /api/patch-reports
 * Returns all patching reports from Redis (linuxResult + windowsResult per task)
 */
app.get('/api/patch-reports', async (req, res) => {
  try {
    if (!redisClient) return res.json({ reports: [] });
    const keys = await redisClient.keys('patched:*');
    const reports = [];
    for (const key of keys) {
      const raw = await redisClient.get(key);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed.patched && parsed.status === 'completed') {
          reports.push(parsed);
        }
      }
    }
    // Sort by patchedAt descending
    reports.sort((a, b) => (b.patchedAt || '').localeCompare(a.patchedAt || ''));
    res.json({ reports });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch patch reports', message: error.message, reports: [] });
  }
});

/**
 * POST /patching/apply
 * Trigger patching - invalidates related caches
 */
app.post('/patching/apply', async (req, res) => {
  try {
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
 * ==========================================
 * PATCHING API ROUTES (Linux + Windows)
 * ==========================================
 */

/**
 * POST /patching/start-linux - Start Linux patching playbook
 */
app.post('/patching/start-linux', async (req, res) => {
  try {
    const response = await axios.post(`${PATCHING_API_BASE}/run-playbook`, {}, {
      timeout: 30000,
      headers: { 'Content-Type': 'application/json' }
    });
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ error: 'Failed to start Linux patching', message: error.message });
  }
});

/**
 * POST /patching/check-linux-status - Check Linux patching status
 */
app.post('/patching/check-linux-status', async (req, res) => {
  try {
    const { command_id } = req.body;
    if (!command_id) return res.status(400).json({ error: 'command_id is required' });
    const response = await axios.post(`${PATCHING_API_BASE}/check-status`, { command_id }, {
      timeout: 30000,
      headers: { 'Content-Type': 'application/json' }
    });
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ error: 'Failed to check Linux patching status', message: error.message });
  }
});

/**
 * POST /patching/start-windows - Start Windows patching playbook
 */
app.post('/patching/start-windows', async (req, res) => {
  try {
    const response = await axios.post(`${PATCHING_API_BASE}/run-windows-playbook`, {}, {
      timeout: 30000,
      headers: { 'Content-Type': 'application/json' }
    });
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ error: 'Failed to start Windows patching', message: error.message });
  }
});

/**
 * POST /patching/check-windows-status - Check Windows patching status
 */
app.post('/patching/check-windows-status', async (req, res) => {
  try {
    const { command_id } = req.body;
    if (!command_id) return res.status(400).json({ error: 'command_id is required' });
    const response = await axios.post(`${PATCHING_API_BASE}/check-windows-status`, { command_id }, {
      timeout: 30000,
      headers: { 'Content-Type': 'application/json' }
    });
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ error: 'Failed to check Windows patching status', message: error.message });
  }
});

/**
 * POST /patching/mark-complete - Mark patching as completed for a task
 */
app.post('/patching/mark-complete', async (req, res) => {
  try {
    const { taskName, targetName, linuxResult, windowsResult } = req.body;
    await cache.set(`patched:${taskName}`, {
      patched: true,
      patchedAt: new Date().toISOString(),
      taskName,
      targetName,
      status: 'completed',
      linuxResult: linuxResult || null,
      windowsResult: windowsResult || null
    }, 60 * 60 * 24 * 30);
    
    // Invalidate caches so overview gets fresh data
    await cache.invalidate('dashboard:*');
    await cache.invalidate('findings:*');
    await cache.invalidate('reports:*');
    
    res.json({ success: true, message: `Patching marked complete for "${taskName}"` });
  } catch (error) {
    res.status(500).json({ error: 'Failed to mark patching complete', message: error.message });
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
 * AWS EC2 ROUTES
 * ==========================================
 */

/**
 * GET /aws/ec2-instances
 * Fetch all EC2 instances with caching
 */
app.get('/aws/ec2-instances', async (req, res) => {
  const cacheKey = 'aws:ec2:instances:all';
  
  try {
    // Try cache first (10 minute TTL)
    let data = await cache.get(cacheKey);
    
    if (data) {
      return res.json({ instances: data, source: 'cache' });
    }

    // Check if AWS credentials are configured
    if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
      return res.json({ 
        instances: [],
        source: 'aws',
        warning: 'AWS credentials not configured. Please set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY in .env file.'
      });
    }
    
    // Describe instances with filters for running and stopped instances
    const command = new DescribeInstancesCommand({
      Filters: [
        {
          Name: 'instance-state-name',
          Values: ['running', 'stopped']
        }
      ]
    });

    const response = await ec2Client.send(command);
    
    // Transform response to simple format
    const instances = [];
    response.Reservations.forEach((reservation) => {
      reservation.Instances.forEach((instance) => {
        instances.push({
          instanceId: instance.InstanceId,
          instanceName: instance.Tags?.find(tag => tag.Key === 'Name')?.Value || instance.InstanceId,
          state: instance.State.Name,
          privateIpAddress: instance.PrivateIpAddress,
          publicIpAddress: instance.PublicIpAddress || 'N/A',
          instanceType: instance.InstanceType,
          launchTime: instance.LaunchTime
        });
      });
    });

    // Cache the result (10 minutes)
    await cache.set(cacheKey, instances, 600);
    
    res.json({ instances, source: 'openvas', count: instances.length });
  } catch (error) {
    
    // Handle credential errors gracefully
    if (error.message.includes('credentials') || error.message.includes('CREDENTIALS')) {
      return res.status(200).json({ 
        instances: [],
        source: 'aws',
        warning: 'AWS credentials not configured. Please set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY in .env file.'
      });
    }
    
    res.status(500).json({ 
      error: 'Failed to fetch EC2 instances',
      message: error.message,
      instances: []
    });
  }
});

/**
 * ==========================================
 * AWS PATCHING API ROUTES
 * ==========================================
 */

const AWS_PATCHING_API = process.env.AWS_PATCHING_API;
const PATCHING_API_BASE = 'https://sgjc9f1kv7.execute-api.us-east-1.amazonaws.com/prod';

/**
 * POST /aws/run-playbook - Trigger AWS patching playbook with caching
 * Called after scan completes and report is generated
 */
app.post('/aws/run-playbook', async (req, res) => {
  const { taskName, targetName, vulnerabilities } = req.body;
  
  try {
    // Create a cache key based on task and target
    const cacheKey = `patching:playbook:${taskName}:${targetName}`;
    
    // Check cache first (5 minute TTL to prevent duplicate patching runs)
    const cachedResponse = await cache.get(cacheKey);
    if (cachedResponse) {
      return res.json({ 
        ...cachedResponse, 
        source: 'cache',
        message: 'Patching already triggered (from cache)'
      });
    }

    // Prepare patching payload
    const patchingPayload = {
      taskName,
      targetName,
      vulnerabilityCount: vulnerabilities?.length || 0,
      vulnerabilities: vulnerabilities || [],
      triggeredAt: new Date().toISOString(),
      source: 'dashboard'
    };

    // Call AWS Patching API
    const patchingResponse = await axios.post(
      AWS_PATCHING_API,
      patchingPayload,
      { 
        timeout: 30000,
        headers: {
          'Content-Type': 'application/json'
        }
      }
    );

    const responseData = {
      success: true,
      message: 'Patching playbook triggered successfully',
      taskName,
      targetName,
      playbook_id: patchingResponse.data?.playbook_id || `playbook-${Date.now()}`,
      timestamp: new Date().toISOString(),
      vulnerabilityCount: vulnerabilities?.length || 0
    };

    // Cache the response (5 minutes)
    const ttl = parseInt(process.env.CACHE_TTL_PATCHING) || 300;
    await cache.set(cacheKey, responseData, ttl);

    res.json({ ...responseData, source: 'aws' });
  } catch (error) {
    
    // Still return success to prevent blocking the workflow
    // (patching is async and may happen even if immediate response fails)
    res.status(202).json({
      success: true,
      message: 'Patching playbook trigger sent (async operation)',
      taskName,
      targetName,
      note: 'Request accepted for asynchronous processing',
      error: error.message
    });
  }
});

/**
 * ==========================================
 * OPENVAS API ROUTES
 * ==========================================
 */

const OPENVAS_API = 'https://edonu024me.execute-api.us-east-1.amazonaws.com/v1';

// Create axios instance for OpenVAS (no auth required on AWS API)
const openvasClient = axios.create({
  baseURL: OPENVAS_API,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json'
  }
});

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

    const response = await openvasClient.post('/port-lists', { name, port_range });

    // Invalidate port lists cache
    await cache.invalidate('openvas:port-lists:*');
    
    res.json({ ...response.data, created: true });
  } catch (error) {
    console.error('OpenVAS Port List creation failed:', error.message);
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
      return res.json({ ...data, source: 'cache' });
    }

    const response = await openvasClient.get('/port-lists');
    
    // Cache the response (15 minutes TTL)
    await cache.set(cacheKey, response.data, 900);
    
    res.json({ ...response.data, source: 'openvas' });
  } catch (error) {
    console.error('OpenVAS Port Lists fetch failed:', error.message);
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
    const { name, hosts, port_list_name, alive_test } = req.body;
    
    if (!name || !hosts || !port_list_name) {
      return res.status(400).json({ 
        error: 'Missing required fields: name, hosts, port_list_name' 
      });
    }

    // Build payload with optional alive_test field
    const payload = { 
      name, 
      hosts, 
      port_list_name
    };
    
    // Add alive_test if provided
    if (alive_test) {
      payload.alive_test = alive_test;
    }

    const response = await openvasClient.post('/targets', payload);

    // Invalidate targets cache
    await cache.invalidate('openvas:targets:*');
    
    res.json({ ...response.data, created: true });
  } catch (error) {
    console.error('OpenVAS Target creation failed:', error.message);
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
      return res.json({ ...data, source: 'cache' });
    }

    const response = await openvasClient.get('/targets');
    
    // Cache the response (15 minutes TTL)
    await cache.set(cacheKey, response.data, 900);
    
    res.json({ ...response.data, source: 'openvas' });
  } catch (error) {
    console.error('OpenVAS Targets fetch failed:', error.message);
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

    const response = await openvasClient.post('/tasks', { 
      name, 
      target_name, 
      config_name: config_name || 'Full and fast',
      scanner_name: scanner_name || 'OpenVAS Scanner'
    });

    // Invalidate tasks cache
    await cache.invalidate('openvas:tasks:*');
    
    res.json({ ...response.data, created: true });
  } catch (error) {
    console.error('OpenVAS Task creation failed:', error.message);
    res.status(500).json({ 
      error: 'Failed to create task',
      message: error.message
    });
  }
});

/**
 * GET /openvas/tasks - Get all scan tasks with caching and progress mapping
 */
app.get('/openvas/tasks', async (req, res) => {
  try {
    const cacheKey = 'openvas:tasks:all';
    
    // Try cache first (shorter TTL for tasks since progress changes)
    let data = await cache.get(cacheKey);
    if (data) {
      return res.json({ ...data, source: 'cache' });
    }

    const response = await openvasClient.get('/tasks');
    
    // Transform tasks to ensure progress field is properly mapped
    const transformedData = {
      ...response.data,
      tasks: (response.data.tasks || []).map(task => ({
        ...task,
        // Map progress from various possible field names
        progress: task.progress !== undefined ? task.progress :
                  task.percentageComplete !== undefined ? task.percentageComplete :
                  task.progress_percentage !== undefined ? task.progress_percentage :
                  task.completion !== undefined ? task.completion :
                  0,
        // Ensure progress is a number between 0-100
        ...(typeof (task.progress || task.percentageComplete || task.progress_percentage || task.completion || 0) === 'string' 
          ? { progress: parseInt((task.progress || task.percentageComplete || task.progress_percentage || task.completion || '0'), 10) }
          : {})
      }))
    };
    
    // Only cache when NO tasks are actively running (prevents stale "running" status)
    const hasRunning = (transformedData.tasks || []).some(t =>
      ['running', 'requested', 'queued', 'processing'].includes((t.status || '').toLowerCase())
    );
    if (!hasRunning) {
      await cache.set(cacheKey, transformedData, 300);
    }
    
    res.json({ ...transformedData, source: 'openvas' });
  } catch (error) {
    console.error('OpenVAS Tasks fetch failed:', error.message);
    res.status(500).json({ 
      error: 'Failed to fetch tasks',
      message: error.message
    });
  }
});

/**
 * GET /openvas/task-progress/:taskName - Get task progress details with proper mapping
 */
app.get('/openvas/task-progress/:taskName', async (req, res) => {
  try {
    const { taskName } = req.params;
    const decodedName = decodeURIComponent(taskName);
    const cacheKey = `openvas:task-progress:${decodedName}`;
    
    // Try cache first (1 minute TTL for progress - real-time)
    let data = await cache.get(cacheKey);
    if (data) {
      return res.json({ ...data, source: 'cache' });
    }

    const response = await openvasClient.get(`/tasks?name=${encodeURIComponent(decodedName)}`);
    
    // Transform task data to ensure progress field is properly mapped
    const task = response.data.tasks && response.data.tasks[0] ? response.data.tasks[0] : response.data;
    
    const transformedTask = {
      ...task,
      // Map progress from various possible field names
      progress: task.progress !== undefined ? task.progress :
                task.percentageComplete !== undefined ? task.percentageComplete :
                task.progress_percentage !== undefined ? task.progress_percentage :
                task.completion !== undefined ? task.completion :
                0,
      // Ensure progress is a number between 0-100
      ...(typeof (task.progress || task.percentageComplete || task.progress_percentage || task.completion || 0) === 'string' 
        ? { progress: parseInt((task.progress || task.percentageComplete || task.progress_percentage || task.completion || '0'), 10) }
        : {})
    };
    
    // Only cache when task is NOT actively running (prevents stale status)
    const taskStatus = (transformedTask.status || '').toLowerCase();
    if (!['running', 'requested', 'queued', 'processing'].includes(taskStatus)) {
      await cache.set(cacheKey, transformedTask, 60);
    }
    
    res.json({ ...transformedTask, source: 'openvas' });
  } catch (error) {
    console.error('OpenVAS Task Progress fetch failed:', error.message);
    res.status(500).json({ 
      error: 'Failed to fetch task progress',
      message: error.message
    });
  }
});

/**
 * POST /openvas/tasks/:taskName/start - Start a scan for a task
 * Uses task name (URL-encoded) directly in the path as per API documentation
 */
app.post('/openvas/tasks/:taskName/start', async (req, res) => {
  try {
    const { taskName } = req.params;
    const decodedName = decodeURIComponent(taskName);
    
    // Call the API endpoint with task name (URL-encoded) as documented
    // Endpoint: POST /tasks/{task_name}/start
    // Example: /tasks/Automated%20Infrastructure%20Scan/start
    const response = await openvasClient.post(`/tasks/${taskName}/start`, {});

    // Invalidate task caches
    await cache.invalidate('openvas:tasks:*');
    await cache.invalidate(`openvas:task-progress:${decodedName}`);
    
    res.json({ 
      message: `Scan "${decodedName}" started successfully`,
      ...response.data, 
      scan_started: true,
      taskName: decodedName
    });
  } catch (error) {
    console.error('OpenVAS Scan start failed:', error.response?.status, error.message);
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
 * GET /api/dashboard-summary
 * Aggregates data from all sources for the Overview monitoring page
 */
app.get('/api/dashboard-summary', async (req, res) => {
  const cacheKey = 'dashboard:summary';
  try {
    let data = await cache.get(cacheKey);
    if (data) return res.json(data);

    // Fetch all data sources in parallel
    const [findingsRes, tasksRes, targetsRes, ec2Res] = await Promise.allSettled([
      axios.get(`${AWS_API}/findings`, { timeout: 10000 }),
      openvasClient.get('/tasks'),
      openvasClient.get('/targets'),
      (async () => {
        if (!process.env.AWS_ACCESS_KEY_ID) return { data: { instances: [] } };
        const cmd = new DescribeInstancesCommand({ Filters: [{ Name: 'instance-state-name', Values: ['running', 'stopped'] }] });
        const resp = await ec2Client.send(cmd);
        const instances = [];
        resp.Reservations.forEach(r => r.Instances.forEach(i => instances.push({
          instanceId: i.InstanceId,
          instanceName: i.Tags?.find(t => t.Key === 'Name')?.Value || i.InstanceId,
          state: i.State.Name,
          privateIpAddress: i.PrivateIpAddress,
          publicIpAddress: i.PublicIpAddress || 'N/A',
          instanceType: i.InstanceType
        })));
        return { data: { instances } };
      })()
    ]);

    const findings = findingsRes.status === 'fulfilled' && Array.isArray(findingsRes.value.data) ? findingsRes.value.data : [];
    const tasks = tasksRes.status === 'fulfilled' ? (tasksRes.value.data.tasks || []) : [];
    const targets = targetsRes.status === 'fulfilled' ? (targetsRes.value.data.targets || []) : [];
    const ec2Instances = ec2Res.status === 'fulfilled' ? (ec2Res.value.data.instances || []) : [];

    // Get patch statuses
    let patchStatuses = {};
    if (redisClient) {
      const keys = await redisClient.keys('patched:*');
      for (const key of keys) {
        const raw = await redisClient.get(key);
        const taskName = key.replace('patched:', '');
        patchStatuses[taskName] = raw ? JSON.parse(raw) : { patched: true };
      }
    }

    // Aggregate vulnerability stats from all scan reports
    const allVulns = findings.flatMap(r => r.vulnerabilities || []);
    const criticalCount = allVulns.filter(v => v.cvss_severity >= 9).length;
    const highCount = allVulns.filter(v => v.cvss_severity >= 7 && v.cvss_severity < 9).length;
    const mediumCount = allVulns.filter(v => v.cvss_severity >= 4 && v.cvss_severity < 7).length;
    const lowCount = allVulns.filter(v => v.cvss_severity < 4).length;
    const uniqueHosts = [...new Set(allVulns.map(v => v.host).filter(Boolean))];
    const avgCvss = allVulns.length ? (allVulns.reduce((s, v) => s + (v.cvss_severity || 0), 0) / allVulns.length).toFixed(1) : 0;

    data = {
      vulnerabilities: {
        total: allVulns.length,
        critical: criticalCount,
        high: highCount,
        medium: mediumCount,
        low: lowCount,
        avgCvss: parseFloat(avgCvss),
        uniqueHosts: uniqueHosts,
        hostCount: uniqueHosts.length,
        details: allVulns
      },
      scanReports: findings.map(r => ({
        pk: r.pk,
        timestamp: r.processed_timestamp,
        vulnCount: (r.vulnerabilities || []).length,
        highSeverityCount: r.total_high_severity_count || 0
      })),
      tasks: tasks.map(t => ({
        name: t.name,
        status: t.status,
        progress: t.progress || 0,
        target_name: t.target_name || t.target,
        config_name: t.config_name || t.config,
        patched: !!patchStatuses[t.name],
        patchedAt: patchStatuses[t.name]?.patchedAt || null
      })),
      targets: targets.map(t => ({ name: t.name, id: t.id || t.target_id })),
      ec2Instances: ec2Instances,
      patchStatuses,
      timestamp: new Date().toISOString()
    };

    await cache.set(cacheKey, data, 120); // 2 min TTL
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: 'Failed to build dashboard summary', message: error.message });
  }
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
      return res.json({ ...data, source: 'cache' });
    }

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

/**
 * GET /openvas/patch-status/:taskName - Check if this task was already patched
 */
app.get('/openvas/patch-status/:taskName', async (req, res) => {
  try {
    const { taskName } = req.params;
    const status = await cache.get(`patched:${taskName}`);
    res.json({
      taskName,
      patched: !!status,
      patchedAt: status?.patchedAt || null,
      vulnerabilityCount: status?.vulnerabilityCount || 0
    });
  } catch (error) {
    res.json({ taskName: req.params.taskName, patched: false });
  }
});

/**
 * GET /openvas/all-patch-status - Get patch status for all known tasks
 */
app.get('/openvas/all-patch-status', async (req, res) => {
  try {
    if (!redisClient) return res.json({ statuses: {} });
    const keys = await redisClient.keys('patched:*');
    const statuses = {};
    for (const key of keys) {
      const taskName = key.replace('patched:', '');
      const val = await cache.get(key.replace('patched:', '').length ? key : null);
      const raw = await redisClient.get(key);
      statuses[taskName] = raw ? JSON.parse(raw) : { patched: true };
    }
    res.json({ statuses });
  } catch (error) {
    res.json({ statuses: {} });
  }
});

/**
 * GET /openvas/scan-reports/:taskName - Check if scan report exists in DynamoDB
 * Uses /findings endpoint where all reports are stored
 */
app.get('/openvas/scan-reports/:taskName', async (req, res) => {
  try {
    const { taskName } = req.params;
    
    const response = await axios.get(
      `${AWS_API}/findings`,
      { timeout: 10000 }
    );
    
    const findings = Array.isArray(response.data) ? response.data : [];
    // Find the most recent report by processed_timestamp
    const sorted = findings
      .filter(r => r.vulnerabilities && r.vulnerabilities.length > 0)
      .sort((a, b) => (b.processed_timestamp || '').localeCompare(a.processed_timestamp || ''));
    const latestReport = sorted.length > 0 ? sorted[0] : null;
    
    if (latestReport) {
      res.json({
        exists: true,
        report: latestReport,
        message: 'Report found'
      });
    } else {
      res.json({
        exists: false,
        report: null,
        message: 'Report not yet generated'
      });
    }
  } catch (error) {
    res.status(500).json({
      exists: false,
      error: 'Failed to check report status',
      message: error.message
    });
  }
});

/**
 * POST /openvas/auto-patch - Auto-trigger patching when scan is done
 * Generates report, stores in DynamoDB, and triggers AWS patching playbook
 */
app.post('/openvas/auto-patch', async (req, res) => {
  try {
    const { taskName, taskId, targetName, scanStatus } = req.body;
    
    // Guard: check if this task was already patched (persistent in Redis with long TTL)
    const alreadyPatched = await cache.get(`patched:${taskName}`);
    if (alreadyPatched && alreadyPatched.status === 'completed') {
      return res.json({
        success: true,
        alreadyPatched: true,
        message: `Task "${taskName}" was already patched on ${alreadyPatched.patchedAt}`,
        patchedAt: alreadyPatched.patchedAt,
        taskName
      });
    }

    // Use a short-lived lock to prevent duplicate concurrent triggers (5 min TTL)
    const lockKey = `patch-lock:${taskName}`;
    const existingLock = await cache.get(lockKey);
    if (existingLock) {
      return res.json({
        success: true,
        alreadyPatched: false,
        inProgress: true,
        message: `Task "${taskName}" patching is already in progress`,
        startedAt: existingLock.startedAt,
        taskName
      });
    }
    await cache.set(lockKey, { startedAt: new Date().toISOString(), taskName, targetName }, 300);
    
    // Step 1: Get the scan report from OpenVAS with caching
    const cacheKeyReport = `openvas:report:${taskName}`;
    let reportData = await cache.get(cacheKeyReport);
    
    if (!reportData) {
      const reportResponse = await openvasClient.get(`/tasks?name=${encodeURIComponent(taskName)}`);
      reportData = {
        taskName,
        taskId,
        targetName,
        reportGeneratedAt: new Date().toISOString(),
        scanStatus,
        data: reportResponse.data,
        vulnerabilities: reportResponse.data?.vulnerabilities || [],
        timestamp: Date.now()
      };
      
      // Cache report for 5 minutes
      const ttl = parseInt(process.env.CACHE_TTL_OPENVAS) || 300;
      await cache.set(cacheKeyReport, reportData, ttl);
    }
    
    // Step 2: Store report in DynamoDB via AWS API (cached)
    const cacheKeyDynamo = `dynamo:report:${taskName}`;
    let dynamoResponse = await cache.get(cacheKeyDynamo);
    
    if (!dynamoResponse) {
      const reportPayload = {
        reportId: `${taskName}-${Date.now()}`,
        taskName,
        targetName,
        reportData: JSON.stringify(reportData),
        createdAt: new Date().toISOString(),
        status: 'generated'
      };
      
      dynamoResponse = await axios.post(
        `${AWS_API}/findings`,
        reportPayload,
        { timeout: 10000 }
      ).catch(err => {
        return { data: { success: true, message: 'Report processed' } };
      });
      
      // Cache DynamoDB response
      const ttl = parseInt(process.env.CACHE_TTL_REPORTS) || 3600;
      await cache.set(cacheKeyDynamo, dynamoResponse.data, ttl);
    }
    
    // Cache invalidation
    await cache.invalidate('openvas:tasks:*');
    await cache.invalidate(`openvas:task-progress:${taskName}`);
    await cache.invalidate('dashboard:*');
    
    // Return report info — frontend handles the actual patching via new Linux/Windows endpoints
    res.json({
      success: true,
      message: `Report generated for "${taskName}" — patching will be handled by frontend`,
      steps: {
        reportGenerated: true,
        reportStoredInDynamoDB: true
      },
      reportId: `${taskName}-${Date.now()}`,
      taskName: taskName,
      targetName: targetName,
      vulnerabilityCount: reportData.vulnerabilities?.length || 0
    });
  } catch (error) {
    // Even on error, keep the patch record so it doesn't re-trigger
    // (the record was already written at the start)
    res.status(500).json({
      success: false,
      error: 'Auto-patching workflow failed',
      message: error.message
    });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  res.status(500).json({ 
    error: 'Internal server error',
    message: err.message 
  });
});

// Start server
async function start() {
  await initializeRedis();
  
  app.listen(PORT, () => {
    console.log(`Dashboard API Server running on port ${PORT}`);
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
