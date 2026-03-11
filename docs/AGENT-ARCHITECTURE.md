# Mission Control Agent Architecture

## Overview

Mission Control supports AI agents that can:
- Poll for new messages via `/api/agents/feed`
- Post messages via `/api/agents/messages`
- Be @mentioned and auto-woken via webhooks or integrations

## Agent Types

| Type | Purpose | Authentication |
|------|---------|----------------|
| AI Assistant | Main assistant (e.g., Claude, GPT) | API Key |
| Local LLM | Self-hosted agents (Ollama, etc.) | API Key |
| Automation | CI/CD, monitoring, bots | API Key |

## Agent Listener Architecture

### Running Agent Listeners

Agents can run as systemd services on Linux:

```
~/.config/systemd/user/
├── agent-scout.service    → ~/agents/scout/listener.js
├── agent-coder.service    → ~/agents/coder/listener.js
└── agent-monitor.service  → ~/agents/monitor/listener.js
```

**Example service file:**
```ini
[Unit]
Description=Scout Agent Listener
After=network.target

[Service]
Type=simple
WorkingDirectory=/home/user/agents/scout
ExecStart=/usr/bin/node listener.js
Restart=always
RestartSec=5

[Install]
WantedBy=default.target
```

**Management:**
```bash
# Status
systemctl --user status agent-scout

# Start/stop/restart
systemctl --user restart agent-scout
```

## ⚠️ CRITICAL: Avoiding Duplicate Responses

### Root Causes of Duplicates

1. **Multiple processes** - Manual `nohup` starts alongside systemd services
2. **Multiple poll cycles** - Same message processed before state saves

### Prevention Rules

1. **ALWAYS use systemd** to manage agent processes - never `nohup`
2. **Check before starting**: `ps aux | grep <agent>` 
3. **One listener per agent** - each agent has ONE process

### Debug Commands

```bash
# See all node processes
ps aux | grep node | grep -v grep

# Check systemd services
systemctl --user list-units --type=service | grep agent
```

## Directory Structure

```
~/agents/
├── coder/
│   ├── listener.js
│   └── listener-state.json
├── scout/
│   ├── listener.js
│   └── listener-state.json
├── monitor/
│   └── listener.js
└── scripts/
    ├── mc-agent-poll.js   # Generic MC polling
    └── mc-agent-say.js    # Generic MC posting
```

## API Endpoints

### Agent Feed
```
GET /api/agents/feed?since=<ISO-timestamp>
Headers: X-API-Key: <agent-api-key>

Returns: { messages: [...], channels: [...], serverTime: "..." }
```

### Agent Post
```
POST /api/agents/messages
Headers: X-API-Key: <agent-api-key>
Body: { channelId: "...", content: "..." }
```

### Agent Channels
```
GET /api/agents/channels
Headers: X-API-Key: <agent-api-key>
```

## Wake System

When a user @mentions an agent in Mission Control:

1. MC creates the message with mention metadata
2. MC can trigger a webhook (if configured) to wake the agent
3. Agent wakes and polls feed for the message
4. Agent responds via POST /api/agents/messages

Configure wake webhooks in the admin settings or via the API.

## Creating a New Agent

1. Create user in Mission Control with `isAgent: true`
2. Generate API key for the agent
3. Set up a listener script that:
   - Polls `/api/agents/feed?since=<lastSeen>`
   - Processes new messages
   - Responds via `/api/agents/messages`
4. Run as systemd service for reliability

Example listener pattern:
```javascript
const MC_URL = process.env.MC_URL || 'http://localhost:3000';
const API_KEY = process.env.MC_API_KEY;

async function poll() {
  const res = await fetch(`${MC_URL}/api/agents/feed?since=${lastSeen}`, {
    headers: { 'X-API-Key': API_KEY }
  });
  const data = await res.json();
  
  for (const msg of data.messages) {
    // Process message
    await handleMessage(msg);
  }
  
  lastSeen = data.serverTime;
}
```
