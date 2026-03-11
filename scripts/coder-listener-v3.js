/**
 * Coder Agent Listener v3 - Mission Control Only
 * Polls MC for mentions, responds via Ollama (deepseek-coder)
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

// Config
const OLLAMA_URL = 'http://localhost:11434';
const MODEL = 'deepseek-coder:6.7b';
const MC_URL = process.env.MC_URL || 'http://localhost:3000';
const MC_API_KEY = 'mc_agent_2c24d34ef9355431529d1765ab9c8473';
const MC_AGENTS = ['rico', 'scout', 'coder', 'creator', 'monitor'];
const POLL_INTERVAL = 10000; // 10 seconds

// Load codebase context
const CONTEXT_FILE = '/home/rico/codebase/tends2trend/docs/CODEBASE-CONTEXT.md';
let codebaseContext = '';
try {
  codebaseContext = fs.readFileSync(CONTEXT_FILE, 'utf8');
  console.log('Loaded codebase context (' + codebaseContext.length + ' chars)');
} catch(e) {
  console.log('No codebase context found');
}

// State
const STATE_FILE = path.join(__dirname, 'listener-state.json');
let state = { 
  mcLastPoll: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
  processedIds: []
};
try { state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); } catch(e) {}

// Keep only last 100 processed IDs
if (state.processedIds?.length > 100) {
  state.processedIds = state.processedIds.slice(-100);
}

function saveState() {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

// HTTP helper for MC
function mcRequest(method, urlPath, body) {
  return new Promise((resolve, reject) => {
    const fullUrl = MC_URL + urlPath;
    const url = new URL(fullUrl);
    const options = {
      hostname: url.hostname, 
      port: url.port || 3000, 
      path: url.pathname + url.search, 
      method,
      headers: { 'X-API-Key': MC_API_KEY, 'Content-Type': 'application/json' },
      timeout: 10000
    };
    
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => { 
        try { resolve(JSON.parse(data)); } 
        catch(e) { resolve({ raw: data, error: e.message }); } 
      });
    });
    
    req.on('error', (err) => {
      console.error('HTTP error:', err.message);
      reject(err);
    });
    
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timed out'));
    });
    
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

// Send MC message
async function sendMCMessage(channelId, message) {
  return mcRequest('POST', '/api/agents/messages', { channelId, content: message });
}

// Ask Ollama
async function askCoder(prompt) {
  const systemPrompt = `You are Coder, a coding assistant for the Tends2Trend project. You help with:
- Writing and debugging code (Node.js, Python, TypeScript, React)
- Explaining technical concepts
- Reviewing code and suggesting improvements
- Answering questions about the codebase

${codebaseContext ? 'CODEBASE CONTEXT:\n' + codebaseContext.substring(0, 4000) : ''}

Be concise and practical. Provide code snippets when helpful. Keep responses focused.`;
  
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({ 
      model: MODEL, 
      prompt, 
      system: systemPrompt, 
      stream: true 
    });
    
    const req = http.request(OLLAMA_URL + '/api/generate', { 
      method: 'POST', 
      headers: { 'Content-Type': 'application/json' } 
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const lines = data.trim().split('\n');
          let fullResponse = '';
          for (const line of lines) {
            if (line.trim()) { 
              const parsed = JSON.parse(line); 
              if (parsed.response) fullResponse += parsed.response; 
            }
          }
          resolve(fullResponse || 'Sorry, I couldn\'t generate a response.');
        } catch (e) { 
          reject(new Error('Failed to parse Ollama response')); 
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(120000, () => { // 2 min timeout for code generation
      req.destroy();
      reject(new Error('Ollama request timed out'));
    });
    req.write(postData);
    req.end();
  });
}

// Extract the actual request from message
function extractRequest(body) {
  return body
    .replace(/@?coder[,:.!?]?\s*/gi, '')
    .replace(/^hey\s+/i, '')
    .trim();
}

// Track in-flight message IDs to prevent duplicate processing
const inFlightIds = new Set();

// Process MC message
async function processMCMessage(msg) {
  // Skip if already processed or in-flight
  if (state.processedIds?.includes(msg.id)) return;
  if (inFlightIds.has(msg.id)) return;
  
  const sender = msg.author?.username || 'unknown';
  const body = msg.content || '';
  const channelId = msg.channelId;
  const channelName = msg.channel?.name || 'unknown';
  
  // Skip messages from agents
  if (MC_AGENTS.includes(sender.toLowerCase())) return;
  
  // Check if message mentions coder
  if (!/\bcoder\b/i.test(body)) return;
  
  // Mark as in-flight immediately to prevent duplicates
  inFlightIds.add(msg.id);
  
  // Mark as processed in persistent state
  state.processedIds = state.processedIds || [];
  state.processedIds.push(msg.id);
  saveState();
  
  const request = extractRequest(body);
  if (!request) { 
    await sendMCMessage(channelId, 'Hey! Need help with code? 💻'); 
    return; 
  }
  
  console.log(`[${new Date().toISOString()}] [MC #${channelName}] ${sender}: ${request.substring(0, 80)}${request.length > 80 ? '...' : ''}`);
  
  try {
    const start = Date.now();
    const response = await askCoder(request);
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.log(`  ↳ Response in ${elapsed}s (${response.length} chars)`);
    await sendMCMessage(channelId, `💻 (${elapsed}s)\n\n${response}`);
  } catch (err) {
    console.error(`  ↳ Error: ${err.message}`);
    await sendMCMessage(channelId, `❌ Error: ${err.message}`);
  } finally { 
    inFlightIds.delete(msg.id);
  }
}

// MC poll loop
async function mcPoll() {
  try {
    const feedUrl = '/api/agents/feed?since=' + encodeURIComponent(state.mcLastPoll);
    const feed = await mcRequest('GET', feedUrl);
    
    if (feed.error) {
      console.error('MC feed error:', feed.error);
    } else if (feed.raw) {
      console.error('MC feed parse error:', feed.raw.substring(0, 100));
    } else {
      if (feed.serverTime) {
        state.mcLastPoll = feed.serverTime;
        saveState();
      }
      
      const messages = feed.messages || [];
      if (messages.length > 0) {
        console.log(`[${new Date().toISOString()}] Received ${messages.length} messages`);
      }
      
      for (const msg of messages) {
        await processMCMessage(msg);
      }
    }
  } catch (err) {
    console.error(`[${new Date().toISOString()}] MC poll error:`, err.message);
  }
  
  setTimeout(mcPoll, POLL_INTERVAL);
}

// Startup
console.log('💻 Coder Agent v3 - Mission Control');
console.log('====================================');
console.log(`MC URL: ${MC_URL}`);
console.log(`Ollama: ${OLLAMA_URL} (${MODEL})`);
console.log(`Poll interval: ${POLL_INTERVAL/1000}s`);
console.log('Listening for mentions of "coder"...\n');

mcPoll();
