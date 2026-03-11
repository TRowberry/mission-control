#!/usr/bin/env node

/**
 * Mission Control Post Utility
 * 
 * Simple utility for agents to post messages to Mission Control.
 * 
 * Usage:
 *   node mc-post.js <agent> <channel> <message>
 *   
 * Examples:
 *   node mc-post.js scout general "Here's what's trending today..."
 *   node mc-post.js coder ops "Build completed successfully"
 * 
 * Environment:
 *   MC_URL - Mission Control URL (default: http://localhost:3000)
 *   <AGENT>_API_KEY - API key for the agent (e.g., SCOUT_API_KEY)
 */

const http = require('http');

const MC_URL = process.env.MC_URL || 'http://localhost:3000';

// Channel name to ID mapping
const CHANNELS = {
  general: 'channel-general',
  ops: 'channel-ops',
  approvals: 'channel-approvals',
};

// Agent API keys from environment (with fallbacks for testing)
const AGENT_KEYS = {
  rico: process.env.RICO_API_KEY || 'mc_agent_b90e00ceacd7c243f3e32d94a872896c',
  scout: process.env.SCOUT_API_KEY || 'mc_agent_f8652d9894e7dd493df15c2e399e5f4f',
  coder: process.env.CODER_API_KEY || 'mc_agent_2c24d34ef9355431529d1765ab9c8473',
  creator: process.env.CREATOR_API_KEY || 'mc_agent_6a58a4c24ad658486edc445d58c28a9d',
  monitor: process.env.MONITOR_API_KEY || 'mc_agent_b91d0f7a717b2ca38a426dbc9269902f',
};

async function postMessage(agent, channel, content, options = {}) {
  const apiKey = AGENT_KEYS[agent.toLowerCase()];
  if (!apiKey) {
    console.error(`Error: No API key found for agent "${agent}"`);
    console.error(`Set ${agent.toUpperCase()}_API_KEY environment variable`);
    process.exit(1);
  }

  const channelId = CHANNELS[channel.toLowerCase()] || channel;
  
  const body = JSON.stringify({
    channelId,
    content,
    ...(options.threadReplyTo && { threadReplyTo: options.threadReplyTo }),
    ...(options.replyToId && { replyToId: options.replyToId }),
  });

  return new Promise((resolve, reject) => {
    const url = new URL('/api/agents/messages', MC_URL);
    
    const req = http.request(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey,
      },
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            const result = JSON.parse(data);
            resolve(result);
          } catch {
            resolve({ raw: data });
          }
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${data}`));
        }
      });
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// CLI interface
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length < 3) {
    console.log('Usage: node mc-post.js <agent> <channel> <message> [--thread <messageId>]');
    console.log('');
    console.log('Agents: rico, scout, coder, creator, monitor');
    console.log('Channels: general, ops, approvals (or full channel ID)');
    console.log('');
    console.log('Examples:');
    console.log('  node mc-post.js scout general "Here\'s the trend report..."');
    console.log('  node mc-post.js coder ops "Deploy complete" --thread abc123');
    process.exit(1);
  }

  const [agent, channel, ...rest] = args;
  
  // Parse options
  const options = {};
  let message = [];
  
  for (let i = 0; i < rest.length; i++) {
    if (rest[i] === '--thread' && rest[i + 1]) {
      options.threadReplyTo = rest[i + 1];
      i++;
    } else if (rest[i] === '--reply' && rest[i + 1]) {
      options.replyToId = rest[i + 1];
      i++;
    } else {
      message.push(rest[i]);
    }
  }

  const content = message.join(' ');
  
  if (!content) {
    console.error('Error: Message content is required');
    process.exit(1);
  }

  try {
    const result = await postMessage(agent, channel, content, options);
    console.log('✅ Message posted');
    console.log(`   ID: ${result.id}`);
    console.log(`   Channel: ${result.channelId}`);
    if (result.threadId) {
      console.log(`   Thread: ${result.threadId}`);
    }
  } catch (err) {
    console.error('❌ Failed to post:', err.message);
    process.exit(1);
  }
}

// Export for use as module
module.exports = { postMessage, CHANNELS, AGENT_KEYS };

// Run CLI if executed directly
if (require.main === module) {
  main();
}
