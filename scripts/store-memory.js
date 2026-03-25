#!/usr/bin/env node
const http = require('http');

const content = process.argv[2] || 'Test memory';
const category = process.argv[3] || 'episodic';
const tier = process.argv[4] || 'working';
const importance = parseFloat(process.argv[5]) || 0.5;

const data = JSON.stringify({
  content,
  category,
  tier,
  importance
});

const req = http.request({
  hostname: '10.0.0.206',
  port: 3000,
  path: '/api/memory/store',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-API-Key': 'mc_agent_b90e00ceacd7c243f3e32d94a872896c'
  }
}, res => {
  let body = '';
  res.on('data', d => body += d);
  res.on('end', () => console.log(body));
});
req.write(data);
req.end();
