#!/usr/bin/env node
// Helper to send a message from a file to Mission Control
// Usage: node mc-send-file.js <channelId> <filePath>

const fs = require('fs');
const http = require('http');

const [,, channelId, filePath] = process.argv;

if (!channelId || !filePath) {
  console.error('Usage: node mc-send-file.js <channelId> <filePath>');
  process.exit(1);
}

const content = fs.readFileSync(filePath, 'utf8');
const data = JSON.stringify({ channelId, content });

const req = http.request({
  hostname: '10.0.0.206',
  port: 3000,
  path: '/api/agents/messages',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-API-Key': 'mc_agent_b90e00ceacd7c243f3e32d94a872896c',
    'Content-Length': Buffer.byteLength(data)
  }
}, (res) => {
  let body = '';
  res.on('data', chunk => body += chunk);
  res.on('end', () => {
    if (res.statusCode === 200 || res.statusCode === 201) {
      console.log('Sent successfully');
    } else {
      console.error('Failed:', res.statusCode, body);
    }
  });
});

req.on('error', (e) => console.error('Error:', e.message));
req.write(data);
req.end();
