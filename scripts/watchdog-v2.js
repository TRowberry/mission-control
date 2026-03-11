/**
 * Monitor Watchdog v2 - Proactive health checking
 * Runs periodically and alerts MC #ops if issues detected
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Mission Control config
const MC_URL = process.env.MC_URL || 'http://localhost:3000';
const MC_API_KEY = 'mc_agent_b91d0f7a717b2ca38a426dbc9269902f';
const OPS_CHANNEL = 'channel-ops';

// Alert thresholds
const THRESHOLDS = {
  diskPercent: 85,      // Alert if disk > 85% full
  memoryPercent: 90,    // Alert if memory > 90% used
  loadAvg: 8,           // Alert if 5min load > 8
  gpuMemoryPercent: 95, // Alert if GPU VRAM > 95%
  agentCount: 4         // Expected number of agents
};

// State file for tracking
const STATE_FILE = path.join(__dirname, 'watchdog-state.json');
let state = { lastAlert: {}, lastCheck: null };
try { state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); } catch(e) {}

function saveState() {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

// MC send function
function sendToMC(channelId, message) {
  return new Promise((resolve, reject) => {
    const url = new URL(MC_URL + '/api/agents/messages');
    const body = JSON.stringify({ channelId, content: message });
    
    const req = http.request({
      hostname: url.hostname,
      port: url.port || 3000,
      path: url.pathname,
      method: 'POST',
      headers: {
        'X-API-Key': MC_API_KEY,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve(JSON.parse(data)));
    });
    
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function alertOps(message) {
  console.log(`[ALERT] ${message}`);
  return sendToMC(OPS_CHANNEL, message);
}

// Check functions
function getSystemStats() {
  const stats = {};
  
  try {
    // Disk usage
    const dfOutput = execSync('df -h / | tail -1').toString();
    const dfParts = dfOutput.trim().split(/\s+/);
    stats.diskPercent = parseInt(dfParts[4]);
    stats.diskUsed = dfParts[2];
    stats.diskAvail = dfParts[3];
  } catch(e) { stats.diskError = e.message; }
  
  try {
    // Memory usage
    const memOutput = execSync('free -m | grep Mem').toString();
    const memParts = memOutput.trim().split(/\s+/);
    const total = parseInt(memParts[1]);
    const used = parseInt(memParts[2]);
    stats.memoryPercent = Math.round((used / total) * 100);
    stats.memoryUsed = `${Math.round(used / 1024)}G`;
    stats.memoryTotal = `${Math.round(total / 1024)}G`;
  } catch(e) { stats.memoryError = e.message; }
  
  try {
    // Load average
    const loadOutput = execSync('cat /proc/loadavg').toString();
    const loadParts = loadOutput.trim().split(/\s+/);
    stats.load1 = parseFloat(loadParts[0]);
    stats.load5 = parseFloat(loadParts[1]);
    stats.load15 = parseFloat(loadParts[2]);
  } catch(e) { stats.loadError = e.message; }
  
  try {
    // GPU memory (nvidia-smi)
    const gpuOutput = execSync('nvidia-smi --query-gpu=memory.used,memory.total --format=csv,noheader,nounits 2>/dev/null').toString();
    const lines = gpuOutput.trim().split('\n');
    stats.gpus = lines.map((line, i) => {
      const [used, total] = line.split(',').map(x => parseInt(x.trim()));
      return { id: i, used, total, percent: Math.round((used / total) * 100) };
    });
  } catch(e) { stats.gpuError = 'No GPU or nvidia-smi not available'; }
  
  return stats;
}

function getAgentStatus() {
  try {
    const output = execSync('systemctl --user list-units --type=service --state=running | grep team- | wc -l').toString();
    return parseInt(output.trim());
  } catch(e) {
    return -1;
  }
}

// Cooldown check (don't spam alerts)
function shouldAlert(key, cooldownMinutes = 30) {
  const now = Date.now();
  const last = state.lastAlert[key] || 0;
  if (now - last > cooldownMinutes * 60 * 1000) {
    state.lastAlert[key] = now;
    saveState();
    return true;
  }
  return false;
}

// Main check
async function runCheck() {
  console.log(`[${new Date().toISOString()}] Running health check...`);
  
  const stats = getSystemStats();
  const agentCount = getAgentStatus();
  const alerts = [];
  
  // Check disk
  if (stats.diskPercent && stats.diskPercent > THRESHOLDS.diskPercent) {
    if (shouldAlert('disk')) {
      alerts.push(`🚨 **Disk space critical:** ${stats.diskPercent}% used (${stats.diskAvail} available)`);
    }
  }
  
  // Check memory
  if (stats.memoryPercent && stats.memoryPercent > THRESHOLDS.memoryPercent) {
    if (shouldAlert('memory')) {
      alerts.push(`🚨 **Memory critical:** ${stats.memoryPercent}% used (${stats.memoryUsed}/${stats.memoryTotal})`);
    }
  }
  
  // Check load
  if (stats.load5 && stats.load5 > THRESHOLDS.loadAvg) {
    if (shouldAlert('load')) {
      alerts.push(`🚨 **High load:** ${stats.load5} (5min avg)`);
    }
  }
  
  // Check GPU memory
  if (stats.gpus) {
    for (const gpu of stats.gpus) {
      if (gpu.percent > THRESHOLDS.gpuMemoryPercent) {
        if (shouldAlert(`gpu${gpu.id}`)) {
          alerts.push(`🚨 **GPU ${gpu.id} VRAM critical:** ${gpu.percent}% used (${gpu.used}/${gpu.total} MB)`);
        }
      }
    }
  }
  
  // Check agent count
  if (agentCount >= 0 && agentCount < THRESHOLDS.agentCount) {
    if (shouldAlert('agents')) {
      alerts.push(`⚠️ **Agent count low:** ${agentCount}/${THRESHOLDS.agentCount} running`);
    }
  }
  
  // Send alerts
  for (const alert of alerts) {
    await alertOps(alert);
  }
  
  state.lastCheck = new Date().toISOString();
  saveState();
  
  console.log(`  Stats: disk=${stats.diskPercent}%, mem=${stats.memoryPercent}%, load=${stats.load5}, agents=${agentCount}`);
  console.log(`  Alerts: ${alerts.length}`);
}

// Run
runCheck().catch(console.error);
