#!/usr/bin/env node
/**
 * Mission Control Agent Message Sender
 * 
 * Usage: node mc-agent-say.js <agent-name> <channel> <message>
 * 
 * Sends a message to Mission Control as the specified agent.
 */

const http = require('http');

// Agent API keys
const AGENTS = {
  scout: 'mc_agent_f8652d9894e7dd493df15c2e399e5f4f',
  coder: 'mc_agent_2c24d34ef9355431529d1765ab9c8473',
  creator: 'mc_agent_6a58a4c24ad658486edc445d58c28a9d',
  monitor: 'mc_agent_b91d0f7a717b2ca38a426dbc9269902f',
};

// Channel name to ID mapping
const CHANNELS = {
  general: 'channel-general',
  ops: 'channel-ops',
  approvals: 'channel-approvals',
};

const MC_URL = process.env.MC_URL || 'http://localhost:3000';

async function sendMessage(apiKey, channelId, content) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({ channelId, content });
    
    const url = new URL(`${MC_URL}/api/agents/messages`);
    const req = http.request({
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method: 'POST',
      headers: {
        'X-API-Key': apiKey,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
      },
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (res.statusCode >= 400) {
            reject(new Error(json.error || `HTTP ${res.statusCode}`));
          } else {
            resolve(json);
          }
        } catch (e) {
          reject(new Error(`Failed to parse response: ${data}`));
        }
      });
    });
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

async function main() {
  const agentName = process.argv[2]?.toLowerCase();
  const channelArg = process.argv[3]?.toLowerCase();
  const message = process.argv.slice(4).join(' ');

  if (!agentName || !AGENTS[agentName]) {
    console.error('Usage: node mc-agent-say.js <agent-name> <channel> <message>');
    console.error('Agents:', Object.keys(AGENTS).join(', '));
    console.error('Channels:', Object.keys(CHANNELS).join(', '));
    process.exit(1);
  }

  if (!channelArg || !message) {
    console.error('Usage: node mc-agent-say.js <agent-name> <channel> <message>');
    process.exit(1);
  }

  const apiKey = AGENTS[agentName];
  const channelId = CHANNELS[channelArg] || channelArg; // Allow direct channel ID

  try {
    const result = await sendMessage(apiKey, channelId, message);
    console.log(`✅ Sent to #${channelArg}: ${message.substring(0, 50)}${message.length > 50 ? '...' : ''}`);
    
    if (process.argv.includes('--json')) {
      console.log(JSON.stringify(result, null, 2));
    }
  } catch (error) {
    console.error(`❌ Failed to send: ${error.message}`);
    process.exit(1);
  }
}

main();
