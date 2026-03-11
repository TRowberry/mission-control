const http = require('http');

const MC_URL = process.env.MC_URL || 'http://localhost:3000';
const MC_API_KEY = 'mc_agent_f8652d9894e7dd493df15c2e399e5f4f';
const since = '2026-02-27T18:00:00Z';

const url = new URL(MC_URL + '/api/agents/feed?since=' + encodeURIComponent(since));

console.log('Testing MC fetch...');
console.log('URL:', url.toString());
console.log('hostname:', url.hostname);
console.log('port:', url.port);
console.log('path:', url.pathname + url.search);

const req = http.request({
  hostname: url.hostname,
  port: url.port || 3000,
  path: url.pathname + url.search,
  method: 'GET',
  headers: { 'X-API-Key': MC_API_KEY }
}, (res) => {
  console.log('Status:', res.statusCode);
  let data = '';
  res.on('data', c => data += c);
  res.on('end', () => {
    console.log('Data length:', data.length);
    try {
      const json = JSON.parse(data);
      console.log('Messages:', json.messages?.length || 0);
      console.log('Server time:', json.serverTime);
    } catch (e) {
      console.log('Parse error:', e.message);
      console.log('Raw data (first 200):', data.substring(0, 200));
    }
  });
});

req.on('error', (e) => console.error('Request error:', e.message));
req.end();
