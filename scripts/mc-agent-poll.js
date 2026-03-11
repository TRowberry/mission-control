#!/usr/bin/env node
/**
 * Mission Control Agent Poller
 * 
 * Usage: node mc-agent-poll.js <agent-name>
 * 
 * Polls Mission Control for messages mentioning this agent (with or without @)
 * and outputs them for processing by the agent's main loop.
 */

const https = require('http');

// Agent API keys
const AGENTS = {
  scout: 'mc_agent_f8652d9894e7dd493df15c2e399e5f4f',
  coder: 'mc_agent_2c24d34ef9355431529d1765ab9c8473',
  creator: 'mc_agent_6a58a4c24ad658486edc445d58c28a9d',
  monitor: 'mc_agent_b91d0f7a717b2ca38a426dbc9269902f',
};

const MC_URL = process.env.MC_URL || 'http://localhost:3000';
const STATE_FILE = process.env.STATE_FILE || `/tmp/mc-agent-state-${process.argv[2]}.json`;

const fs = require('fs');

function loadState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  } catch {
    return { lastPoll: new Date(Date.now() - 5 * 60 * 1000).toISOString() };
  }
}

function saveState(state) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

async function fetchFeed(apiKey, since) {
  return new Promise((resolve, reject) => {
    const url = `${MC_URL}/api/agents/feed?since=${encodeURIComponent(since)}`;
    const req = https.request(url, {
      headers: { 'X-API-Key': apiKey },
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error(`Failed to parse response: ${data}`));
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

async function main() {
  const agentName = process.argv[2]?.toLowerCase();
  
  if (!agentName || !AGENTS[agentName]) {
    console.error('Usage: node mc-agent-poll.js <scout|coder|creator|monitor>');
    console.error('Available agents:', Object.keys(AGENTS).join(', '));
    process.exit(1);
  }

  const apiKey = AGENTS[agentName];
  const state = loadState();
  
  try {
    const feed = await fetchFeed(apiKey, state.lastPoll);
    
    // Filter messages that mention this agent (with or without @)
    const mentionPattern = new RegExp(`@?${agentName}\\b`, 'i');
    const relevantMessages = feed.messages?.filter(msg => {
      // Skip messages from this agent
      if (msg.author?.username?.toLowerCase() === agentName) return false;
      // Check if content mentions this agent
      return mentionPattern.test(msg.content);
    }) || [];

    if (relevantMessages.length > 0) {
      console.log(`📬 ${agentName} Mission Control Check`);
      console.log('========================');
      console.log(`Found ${relevantMessages.length} message(s) mentioning ${agentName}:\n`);
      
      for (const msg of relevantMessages) {
        console.log(`[#${msg.channel?.name || 'unknown'}] ${msg.author?.displayName || msg.author?.username}: ${msg.content}`);
        console.log(`  ID: ${msg.id} | Time: ${msg.createdAt}`);
        console.log('');
      }
    } else if (process.argv.includes('--verbose')) {
      console.log(`No new messages mentioning ${agentName}`);
    }

    // Update state
    state.lastPoll = feed.serverTime || new Date().toISOString();
    saveState(state);

    // Output JSON for programmatic use if --json flag
    if (process.argv.includes('--json')) {
      console.log(JSON.stringify({ agent: agentName, messages: relevantMessages }, null, 2));
    }

  } catch (error) {
    console.error(`Error polling Mission Control: ${error.message}`);
    process.exit(1);
  }
}

main();
