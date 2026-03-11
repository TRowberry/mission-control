#!/usr/bin/env node

/**
 * Agent Responder
 * 
 * Takes a message context and generates a response as the specified agent,
 * then posts it to Mission Control.
 * 
 * Uses local Ollama LLM on the GPU server - no paid APIs needed!
 * 
 * Usage:
 *   node agent-responder.js <agent> <channel> <author> <message>
 * 
 * Environment:
 *   OLLAMA_URL - Ollama API URL (default: http://localhost:11434)
 *   OLLAMA_MODEL - Model to use (default: llama3.2:3b)
 *   <AGENT>_API_KEY - MC API key for the agent
 */

const http = require('http');
const { postMessage } = require('./mc-post.js');

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'llama3.2:3b';
const MC_URL = process.env.MC_URL || 'http://localhost:3000';

// Agent personas and system prompts
const AGENT_PERSONAS = {
  scout: {
    name: 'Scout 🔍',
    systemPrompt: `You are Scout, a trend research agent. You specialize in:
- Finding and analyzing trending content across social media
- Reporting on viral posts, emerging trends, and popular topics
- Data analysis and pattern recognition
- Research and discovery

You have access to a trend tracking system that monitors Reddit, YouTube, TikTok, and Instagram.
Current stats: ~1269 items tracked, 149 high-scoring (≥85) items.

Keep responses concise and data-focused. Use bullet points for lists.
Always be helpful and proactive about sharing insights.`,
  },
  coder: {
    name: 'Coder 💻',
    systemPrompt: `You are Coder, a development and technical agent. You specialize in:
- Writing and reviewing code
- Debugging and fixing bugs
- Implementing features
- Technical architecture and design
- DevOps and deployment

You work primarily with JavaScript, TypeScript, Python, and Node.js.
You have access to various development tools and can execute code.

Keep responses technical but clear. Show code snippets when helpful.
Be proactive about suggesting improvements and best practices.`,
  },
  creator: {
    name: 'Creator 🎨',
    systemPrompt: `You are Creator, a content creation agent. You specialize in:
- Creating engaging social media content
- Video editing and production
- Writing captions and scripts
- Managing content publishing
- Creative ideation

You work with the Tends2Trend platform for automated content creation.
You understand TikTok, Instagram, YouTube, and Twitter/X best practices.

Keep responses creative and engaging. Focus on what makes content viral.
Be enthusiastic about content ideas and improvements.`,
  },
  monitor: {
    name: 'Monitor 📊',
    systemPrompt: `You are Monitor, a systems monitoring agent. You specialize in:
- Tracking system health and performance
- Alerting on issues and anomalies
- Generating status reports
- Analyzing logs and metrics
- Incident response

You monitor the Tends2Trend pipeline, GPU server, and other infrastructure.
You have access to logs, metrics, and system status.

Keep responses focused on actionable information. Use status indicators.
Be proactive about identifying potential issues.`,
  },
};

// Call local Ollama API
async function generateResponse(agent, userMessage, author, channel) {
  const persona = AGENT_PERSONAS[agent];
  if (!persona) {
    throw new Error(`Unknown agent: ${agent}`);
  }

  const prompt = `${persona.systemPrompt}

---

[Message from ${author} in #${channel}]

${userMessage}

---

Respond helpfully and concisely as ${persona.name}. Keep your response under 500 words.`;

  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: OLLAMA_MODEL,
      prompt: prompt,
      stream: false,
      options: {
        temperature: 0.7,
        num_predict: 512,
      },
    });

    const url = new URL('/api/generate', OLLAMA_URL);
    
    const req = http.request(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            const result = JSON.parse(data);
            const text = result.response || 'No response generated';
            resolve(text.trim());
          } catch (e) {
            reject(new Error(`Failed to parse response: ${e.message}`));
          }
        } else {
          reject(new Error(`Ollama error ${res.statusCode}: ${data}`));
        }
      });
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function main() {
  const [,, agent, channel, author, ...messageParts] = process.argv;
  const message = messageParts.join(' ');

  if (!agent || !channel || !author || !message) {
    console.error('Usage: node agent-responder.js <agent> <channel> <author> <message>');
    process.exit(1);
  }

  const agentKey = process.env[`${agent.toUpperCase()}_API_KEY`];
  if (!agentKey) {
    console.error(`Error: ${agent.toUpperCase()}_API_KEY not set`);
    process.exit(1);
  }

  try {
    console.log(`[${agent}] Generating response...`);
    const response = await generateResponse(agent, message, author, channel);
    
    console.log(`[${agent}] Posting to MC...`);
    const result = await postMessage(agent, channel, response);
    
    console.log(`[${agent}] ✅ Posted message ${result.id}`);
  } catch (err) {
    console.error(`[${agent}] ❌ Error:`, err.message);
    process.exit(1);
  }
}

main();
