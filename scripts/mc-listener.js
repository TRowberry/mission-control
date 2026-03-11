#!/usr/bin/env node
/**
 * Mission Control Listener
 * 
 * Lightweight poller that watches for new messages and wakes OpenClaw
 * only when there's something to respond to.
 * 
 * Usage: MC_API_KEY=xxx OPENCLAW_URL=xxx OPENCLAW_TOKEN=xxx node mc-listener.js
 */

const fs = require('fs');
const path = require('path');

// Config from environment
const CONFIG = {
  mcUrl: process.env.MC_URL || 'http://localhost:3000',
  mcApiKey: process.env.MC_API_KEY,
  openclawUrl: process.env.OPENCLAW_URL || 'http://10.0.0.108:18789',
  openclawToken: process.env.OPENCLAW_TOKEN,
  pollInterval: parseInt(process.env.POLL_INTERVAL || '5000'), // 5 seconds
  stateFile: process.env.STATE_FILE || path.join(__dirname, 'mc-listener-state.json'),
  agentUsername: process.env.AGENT_USERNAME || 'rico',
  debug: process.env.DEBUG === 'true',
};

// Validate required config
if (!CONFIG.mcApiKey) {
  console.error('❌ MC_API_KEY is required');
  process.exit(1);
}
if (!CONFIG.openclawToken) {
  console.error('❌ OPENCLAW_TOKEN is required');
  process.exit(1);
}

// State management
let state = {
  lastCheck: null,
  lastMessageId: null,
  messagesProcessed: 0,
};

function loadState() {
  try {
    if (fs.existsSync(CONFIG.stateFile)) {
      state = JSON.parse(fs.readFileSync(CONFIG.stateFile, 'utf8'));
      if (CONFIG.debug) console.log('📂 Loaded state:', state);
    }
  } catch (err) {
    console.error('⚠️ Failed to load state:', err.message);
  }
}

function saveState() {
  try {
    fs.writeFileSync(CONFIG.stateFile, JSON.stringify(state, null, 2));
  } catch (err) {
    console.error('⚠️ Failed to save state:', err.message);
  }
}

// Wake OpenClaw with message context
async function wakeOpenclaw(message, channel) {
  const text = `[Mission Control #${channel}] ${message.author.displayName}: ${message.content.substring(0, 300)}`;
  
  try {
    const res = await fetch(`${CONFIG.openclawUrl}/tools/invoke`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${CONFIG.openclawToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        tool: 'cron',
        args: {
          action: 'wake',
          text,
          mode: 'now',
        },
      }),
    });
    
    if (res.ok) {
      console.log(`🔔 Woke OpenClaw for message from ${message.author.displayName}`);
      return true;
    } else {
      console.error(`❌ Wake failed: ${res.status}`);
      return false;
    }
  } catch (err) {
    console.error('❌ Wake error:', err.message);
    return false;
  }
}

// Poll Mission Control for new messages
async function pollFeed() {
  try {
    const since = state.lastCheck || new Date(Date.now() - 60000).toISOString(); // Default: last minute
    const url = `${CONFIG.mcUrl}/api/agents/feed?since=${encodeURIComponent(since)}`;
    
    const res = await fetch(url, {
      headers: { 'X-API-Key': CONFIG.mcApiKey },
    });
    
    if (!res.ok) {
      console.error(`❌ Feed error: ${res.status}`);
      return;
    }
    
    const data = await res.json();
    const messages = data.messages || [];
    
    if (CONFIG.debug && messages.length > 0) {
      console.log(`📨 Got ${messages.length} new message(s)`);
    }
    
    // Process new messages (skip if from another agent to avoid loops)
    for (const msg of messages) {
      // Skip messages from agents (prevent response loops)
      if (msg.author.isAgent) {
        if (CONFIG.debug) console.log(`⏭️ Skipping agent message from ${msg.author.username}`);
        continue;
      }
      
      // Skip if we've already processed this message
      if (msg.id === state.lastMessageId) {
        continue;
      }
      
      // Get channel name
      const channelName = msg.channel?.name || msg.channel?.slug || 'unknown';
      
      console.log(`💬 New message in #${channelName} from ${msg.author.displayName}: "${msg.content.substring(0, 50)}..."`);
      
      // Wake OpenClaw
      await wakeOpenclaw(msg, channelName);
      
      state.lastMessageId = msg.id;
      state.messagesProcessed++;
    }
    
    // Update last check time
    state.lastCheck = data.serverTime || new Date().toISOString();
    saveState();
    
  } catch (err) {
    console.error('❌ Poll error:', err.message);
  }
}

// Main loop
async function main() {
  console.log('🚀 Mission Control Listener starting...');
  console.log(`   MC URL: ${CONFIG.mcUrl}`);
  console.log(`   OpenClaw URL: ${CONFIG.openclawUrl}`);
  console.log(`   Poll interval: ${CONFIG.pollInterval}ms`);
  console.log(`   Agent: ${CONFIG.agentUsername}`);
  console.log('');
  
  loadState();
  
  // Initial poll
  await pollFeed();
  
  // Set up polling interval
  setInterval(pollFeed, CONFIG.pollInterval);
  
  console.log('👂 Listening for messages... (Ctrl+C to stop)');
}

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n👋 Shutting down...');
  saveState();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n👋 Shutting down...');
  saveState();
  process.exit(0);
});

main().catch(err => {
  console.error('💥 Fatal error:', err);
  process.exit(1);
});
