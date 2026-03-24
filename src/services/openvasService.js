/**
 * OpenVAS Automation API Service
 * Handles all interactions with the backend OpenVAS API endpoints
 * Backend caches responses in Redis for better performance
 */

import axios from 'axios';

// Use the backend API which handles OpenVAS API calls and caching
const BACKEND_BASE_URL = 'http://localhost:3005';

const backendClient = axios.create({
  baseURL: BACKEND_BASE_URL,
  headers: {
    'Content-Type': 'application/json'
  },
  timeout: 30000
});

/**
 * OpenVAS Service - All methods call backend endpoints that cache responses in Redis
 */
export const openvasService = {
  // Port Lists
  async getAllPortLists() {
    try {
      const res = await backendClient.get('/openvas/port-lists');
      return res.data;
    } catch (err) {
      console.error('Error fetching port lists:', err.message);
      throw err;
    }
  },

  async getPortListByName(name) {
    try {
      const encodedName = encodeURIComponent(name);
      const res = await backendClient.get(`/openvas/port-lists?name=${encodedName}`);
      return res.data;
    } catch (err) {
      console.error(`Error fetching port list ${name}:`, err.message);
      throw err;
    }
  },

  async createPortList(name, portRange) {
    try {
      const res = await backendClient.post('/openvas/port-lists', {
        name,
        port_range: portRange
      });
      return res.data;
    } catch (err) {
      console.error('Error creating port list:', err.message);
      throw err;
    }
  },

  // Targets
  async getAllTargets() {
    try {
      const res = await backendClient.get('/openvas/targets');
      return res.data;
    } catch (err) {
      console.error('Error fetching targets:', err.message);
      throw err;
    }
  },

  async getTargetByName(name) {
    try {
      const encodedName = encodeURIComponent(name);
      const res = await backendClient.get(`/openvas/targets?name=${encodedName}`);
      return res.data;
    } catch (err) {
      console.error(`Error fetching target ${name}:`, err.message);
      throw err;
    }
  },

  async createTarget(name, hosts, portListName) {
    try {
      const res = await backendClient.post('/openvas/targets', {
        name,
        hosts: Array.isArray(hosts) ? hosts : [hosts],
        port_list_name: portListName
      });
      return res.data;
    } catch (err) {
      console.error('Error creating target:', err.message);
      throw err;
    }
  },

  // Tasks (Scan Tasks)
  async getAllTasks() {
    try {
      const res = await backendClient.get('/openvas/tasks');
      return res.data;
    } catch (err) {
      console.error('Error fetching tasks:', err.message);
      throw err;
    }
  },

  async getTaskByName(name) {
    try {
      const encodedName = encodeURIComponent(name);
      const res = await backendClient.get(`/openvas/task-progress/${encodedName}`);
      return res.data;
    } catch (err) {
      console.error(`Error fetching task ${name}:`, err.message);
      throw err;
    }
  },

  async createTask(name, targetName, configName = 'Full and fast', scannerName = 'OpenVAS Default') {
    try {
      const res = await backendClient.post('/openvas/tasks', {
        name,
        target_name: targetName,
        config_name: configName,
        scanner_name: scannerName
      });
      return res.data;
    } catch (err) {
      console.error('Error creating task:', err.message);
      throw err;
    }
  },

  // Scan Execution
  async startScan(taskName) {
    try {
      const encodedName = encodeURIComponent(taskName);
      const res = await backendClient.post(`/openvas/tasks/${encodedName}/start`, {});
      return res.data;
    } catch (err) {
      console.error(`Error starting scan for task ${taskName}:`, err.message);
      throw err;
    }
  },

  // Helper: Get task progress
  async getTaskProgress(taskName) {
    try {
      const task = await backendClient.get(`/openvas/task-progress/${encodeURIComponent(taskName)}`);
      return {
        taskId: task.task_id,
        taskName: task.name,
        status: task.status,
        progress: task.progress || 0,
        reportCount: task.report_count || 0,
        target: task.target,
        lastUpdated: new Date().toISOString()
      };
    } catch (err) {
      console.error(`Error getting progress for task ${taskName}:`, err.message);
      throw err;
    }
  }
};

export default openvasService;
