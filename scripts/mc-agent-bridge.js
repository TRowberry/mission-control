#!/usr/bin/env node

/**
 * Mission Control Agent Bridge
 * 
 * Polls Mission Control for new messages and routes them to the appropriate agents.
 * Each agent responds when:
 * - Directly @mentioned
 * - Message is relevant to their domain
 * 
 * Agents:
 * - Scout: trends, research, data, analysis
 * - Coder: code, development, bugs, features, technical
 * - Creator: content, media, videos, posts, creative
 * - Monitor: metrics, status, performance, health
 */

const https = require('http'); // MC is on local network, use http

// Configuration
const MC_URL = process.env.MC_URL || 'http://localhost:3000';
const POLL_INTERVAL = parseInt(process.env.POLL_INTERVAL) || 5000;
const STATE_FILE = process.env.STATE_FILE || '/tmp/mc-bridge-state.json';

// Agent configurations
const AGENTS = {
  scout: {
    apiKey: process.env.SCOUT_API_KEY,
    keywords: ['trend', 'trending', 'research', 'data', 'analysis', 'find', 'search', 'discover', 'report'],
    matrixRoom: 'content', // Where to notify this agent
  },
  coder: {
    apiKey: process.env.CODER_API_KEY,
    keywords: ['code', 'bug', 'fix', 'feature', 'develop', 'build', 'error', 'debug', 'implement', 'api', 'function'],
    matrixRoom: 'dev',
  },
  creator: {
    apiKey: process.env.CREATOR_API_KEY,
    keywords: ['content', 'video', 'post', 'create', 'media', 'edit', 'caption', 'thumbnail', 'upload', 'publish'],
    matrixRoom: 'content',
  },
  monitor: {
    apiKey: process.env.MONITOR_API_KEY,
    keywords: ['status', 'metric', 'health', 'performance', 'check', 'monitor', 'alert', 'log', 'error', 'down'],
    matrixRoom: 'ops',
  },
};

const fs = require('fs');
const { execSync } = require('child_process');

// Load state
function loadState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  } catch {
    return { lastSeen: {} };
  }
}

// Save state
function saveState(state) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

// Check if message is relevant to an agent
function isRelevantTo(agent, message, mentioned) {
  // Always relevant if directly mentioned
  if (mentioned) return true;
  
  const config = AGENTS[agent];
  if (!config) return false;
  
  const content = message.content.toLowerCase();
  return config.keywords.some(kw => content.includes(kw));
}

// Invoke agent to respond directly in MC
function invokeAgent(agent, message, channel) {
  const config = AGENTS[agent];
  if (!config) return;
  
  // Escape the message content for shell
  const safeContent = message.content
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\$/g, '\\$')
    .replace(/`/g, '\\`')
    .replace(/\n/g, ' ');
  
  const safeAuthor = message.author.displayName.replace(/"/g, '\\"');
  
  try {
    // Call the agent responder script
    execSync(
      `node ~/mc-listener/agent-responder.js ${agent} ${channel} "${safeAuthor}" "${safeContent}"`,
      {
        encoding: 'utf8',
        timeout: 60000, // 60 second timeout for Claude API
        env: {
          ...process.env,
          PATH: process.env.PATH,
        },
      }
    );
    console.log(`  → ${agent} responded in #${channel}`);
  } catch (err) {
    console.error(`  ✗ Failed to invoke ${agent}:`, err.message);
  }
}

// Fetch new messages from Mission Control
async function fetchMessages(apiKey, since) {
  return new Promise((resolve, reject) => {
    const url = new URL('/api/agents/feed', MC_URL);
    if (since) url.searchParams.set('since', since);
    url.searchParams.set('limit', '20');
    
    const req = https.request(url, {
      headers: { 'X-API-Key': apiKey },
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          reject(new Error('Invalid JSON response'));
        }
      });
    });
    
    req.on('error', reject);
    req.end();
  });
}

// Main poll loop
async function poll() {
  const state = loadState();
  
  // Use Rico's key to fetch all messages (he has access to all channels)
  const ricoKey = process.env.RICO_API_KEY;
  if (!ricoKey) {
    console.error('RICO_API_KEY not set');
    return;
  }
  
  try {
    const response = await fetchMessages(ricoKey, state.lastPoll);
    const messages = response.messages || [];
    
    if (messages.length === 0) {
      return;
    }
    
    console.log(`\n[${new Date().toLocaleTimeString()}] ${messages.length} new messages`);
    
    for (const msg of messages) {
      // Skip messages from agents
      if (msg.author.isAgent) continue;
      
      // Skip if we've already processed this message
      if (state.lastSeen[msg.id]) continue;
      
      console.log(`  ${msg.channel?.name || 'dm'}: ${msg.author.displayName}: ${msg.content.substring(0, 50)}...`);
      
      // Check each agent - only respond if directly mentioned
      for (const [agent, config] of Object.entries(AGENTS)) {
        const mentioned = msg.content.toLowerCase().includes(`@${agent}`);
        
        // Only invoke if directly @mentioned (not just keyword match)
        // This prevents agents from responding to every message with keywords
        if (mentioned) {
          invokeAgent(agent, msg, msg.channel?.name || 'dm');
        }
      }
      
      state.lastSeen[msg.id] = Date.now();
    }
    
    // Update last poll time
    if (messages.length > 0) {
      state.lastPoll = new Date().toISOString();
    }
    
    // Clean old entries (keep last 1000)
    const seenIds = Object.keys(state.lastSeen);
    if (seenIds.length > 1000) {
      const sorted = seenIds.sort((a, b) => state.lastSeen[a] - state.lastSeen[b]);
      for (let i = 0; i < sorted.length - 1000; i++) {
        delete state.lastSeen[sorted[i]];
      }
    }
    
    saveState(state);
  } catch (err) {
    console.error('Poll error:', err.message);
  }
}

// Start polling
console.log('Mission Control Agent Bridge starting...');
console.log(`Polling ${MC_URL} every ${POLL_INTERVAL}ms`);
console.log('Agents:', Object.keys(AGENTS).join(', '));

poll();
setInterval(poll, POLL_INTERVAL);
