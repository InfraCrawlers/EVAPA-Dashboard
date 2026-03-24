/**
 * OpenVAS Automation API Service
 * Handles all interactions with the serverless OpenVAS API
 */

import axios from 'axios';

const OPENVAS_BASE_URL = 'https://edonu024me.execute-api.us-east-1.amazonaws.com/v1';

const openvasClient = axios.create({
  baseURL: OPENVAS_BASE_URL,
  headers: {
    'Content-Type': 'application/json'
  },
  timeout: 30000
});

/**
 * PORT LIST ENDPOINTS
 */
export const openvasService = {
  // Port Lists
  async getAllPortLists() {
    try {
      const res = await openvasClient.get('/port-lists');
      return res.data;
    } catch (err) {
      console.error('Error fetching port lists:', err.message);
      throw err;
    }
  },

  async getPortListByName(name) {
    try {
      const encodedName = encodeURIComponent(name);
      const res = await openvasClient.get(`/port-lists?name=${encodedName}`);
      return res.data;
    } catch (err) {
      console.error(`Error fetching port list ${name}:`, err.message);
      throw err;
    }
  },

  async createPortList(name, portRange) {
    try {
      const res = await openvasClient.post('/port-lists', {
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
      const res = await openvasClient.get('/targets');
      return res.data;
    } catch (err) {
      console.error('Error fetching targets:', err.message);
      throw err;
    }
  },

  async getTargetByName(name) {
    try {
      const encodedName = encodeURIComponent(name);
      const res = await openvasClient.get(`/targets?name=${encodedName}`);
      return res.data;
    } catch (err) {
      console.error(`Error fetching target ${name}:`, err.message);
      throw err;
    }
  },

  async createTarget(name, hosts, portListName) {
    try {
      const res = await openvasClient.post('/targets', {
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
      const res = await openvasClient.get('/tasks');
      return res.data;
    } catch (err) {
      console.error('Error fetching tasks:', err.message);
      throw err;
    }
  },

  async getTaskByName(name) {
    try {
      const encodedName = encodeURIComponent(name);
      const res = await openvasClient.get(`/tasks?name=${encodedName}`);
      return res.data;
    } catch (err) {
      console.error(`Error fetching task ${name}:`, err.message);
      throw err;
    }
  },

  async createTask(name, targetName, configName = 'Full and fast', scannerName = 'OpenVAS Default') {
    try {
      const res = await openvasClient.post('/tasks', {
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
      const res = await openvasClient.post(`/tasks/${encodedName}/start`, {});
      return res.data;
    } catch (err) {
      console.error(`Error starting scan for task ${taskName}:`, err.message);
      throw err;
    }
  },

  // Helper: Get task progress
  async getTaskProgress(taskName) {
    try {
      const task = await this.getTaskByName(taskName);
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
