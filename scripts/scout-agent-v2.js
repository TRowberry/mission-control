/**
 * Scout Agent v2 - Trend Detection & Monitoring
 * 
 * Runs on GPU server, reports to #reports via Mission Control
 */

import { readFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import http from 'http';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Mission Control config
const MC = {
  url: process.env.MC_URL || 'http://localhost:3000',
  apiKey: 'mc_agent_f8652d9894e7dd493df15c2e399e5f4f',
  channels: {
    reports: 'channel-reports',
    general: 'channel-general',
  }
};

// Ollama config (for smart analysis later)
const OLLAMA = {
  baseUrl: 'http://localhost:11434',
  model: 'llama3.2:3b',
};

// ============ MC Functions ============

function mcRequest(method, path, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(MC.url + path);
    const options = {
      hostname: url.hostname,
      port: url.port || 3000,
      path: url.pathname + url.search,
      method,
      headers: {
        'X-API-Key': MC.apiKey,
        'Content-Type': 'application/json',
      },
      timeout: 10000,
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          resolve({ raw: data, error: e.message });
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function sendToMC(channelId, message) {
  return mcRequest('POST', '/api/agents/messages', {
    channelId,
    content: message,
  });
}

async function reportToReports(message) {
  return sendToMC(MC.channels.reports, message);
}

async function reportToGeneral(message) {
  return sendToMC(MC.channels.general, message);
}

// ============ Detection Functions ============

async function runDetection() {
  // Check multiple possible locations for trends data
  const possiblePaths = [
    join(__dirname, '../data/trends-v2.json'),
    '/home/rico/codebase/tends2trend/data/trends-v2.json',
    join(__dirname, '../../codebase/tends2trend/data/trends-v2.json'),
  ];
  
  let trendsPath = null;
  for (const p of possiblePaths) {
    if (existsSync(p)) {
      trendsPath = p;
      break;
    }
  }
  
  if (!trendsPath) {
    return { error: 'trends-v2.json not found', items: [] };
  }
  
  const data = JSON.parse(readFileSync(trendsPath, 'utf8'));
  const trends = data.trends || [];
  
  // Get recent high-score items
  const highScore = trends.filter(t => (t.score || 0) >= 85);
  const recent = trends.filter(t => {
    const age = Date.now() - new Date(t.detected_at).getTime();
    return age < 6 * 60 * 60 * 1000; // Last 6 hours
  });
  
  return {
    total: trends.length,
    highScore: highScore.length,
    recent: recent.length,
    topTrends: highScore.slice(0, 5).map(t => ({
      title: t.title,
      score: t.score,
      platform: t.platform,
      category: t.category,
    })),
  };
}

// ============ Main Agent Loop ============

async function runOnce() {
  console.log('🔍 Scout: Running detection scan...');
  
  const results = await runDetection();
  
  if (results.error) {
    await reportToReports(`⚠️ **Scout Error:** ${results.error}`);
    return;
  }
  
  // Build report
  const time = new Date().toLocaleTimeString('en-US', { 
    timeZone: 'America/Denver',
    hour: '2-digit',
    minute: '2-digit',
  });
  
  let report = `🔍 **Scout Report** (${time} MST)\n\n`;
  report += `📊 **Stats:**\n`;
  report += `• Total tracked: ${results.total}\n`;
  report += `• High-score (≥85): ${results.highScore}\n`;
  report += `• Recent (6h): ${results.recent}\n\n`;
  
  if (results.topTrends.length > 0) {
    report += `🔥 **Top Trends:**\n`;
    results.topTrends.forEach((t, i) => {
      const title = t.title.length > 40 ? t.title.slice(0, 40) + '...' : t.title;
      report += `${i + 1}. "${title}" (${t.score}, ${t.platform}/${t.category})\n`;
    });
  } else {
    report += `No high-score trends currently.\n`;
  }
  
  const result = await reportToReports(report);
  
  if (result.error) {
    console.error('❌ Scout: Failed to send report:', result.error);
  } else {
    console.log('✅ Scout: Report sent to #reports');
  }
}

// CLI
const command = process.argv[2];

if (command === 'scan') {
  runOnce().catch(console.error);
} else if (command === 'test') {
  reportToReports('🧪 Scout test message - agent v2 (MC) is working!')
    .then(() => console.log('✅ Test message sent to #reports'))
    .catch(console.error);
} else {
  console.log('Scout Agent v2 - Trend Detection (Mission Control)');
  console.log('Usage:');
  console.log('  node agent.js scan   - Run detection and report');
  console.log('  node agent.js test   - Send test message');
}
