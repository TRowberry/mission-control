#!/usr/bin/env node
/**
 * Mission Control API Helper
 * Handles common agent operations with proper JSON handling
 * 
 * Usage:
 *   node mc-api.js send <channelId> <message>
 *   node mc-api.js send-file <channelId> <filePath>
 *   node mc-api.js subtask <subtaskId> <true|false>
 *   node mc-api.js move <taskId> <columnId>
 *   node mc-api.js tasks                          # list my tasks
 */

const http = require('http');
const fs = require('fs');

const API_KEY = process.env.MC_API_KEY || 'mc_agent_b90e00ceacd7c243f3e32d94a872896c';
const API_HOST = process.env.MC_HOST || '10.0.0.206';
const API_PORT = process.env.MC_PORT || 3000;

function request(method, path, data) {
  return new Promise((resolve, reject) => {
    const body = data ? JSON.stringify(data) : null;
    const req = http.request({
      hostname: API_HOST,
      port: API_PORT,
      path,
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': API_KEY,
        ...(body && { 'Content-Length': Buffer.byteLength(body) })
      }
    }, (res) => {
      let responseBody = '';
      res.on('data', chunk => responseBody += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(responseBody);
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(json);
          } else {
            reject(new Error(json.error || `HTTP ${res.statusCode}`));
          }
        } catch {
          resolve(responseBody);
        }
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function main() {
  const [,, command, ...args] = process.argv;

  try {
    switch (command) {
      case 'send': {
        const [channelId, ...messageParts] = args;
        const content = messageParts.join(' ');
        if (!channelId || !content) {
          console.error('Usage: mc-api.js send <channelId> <message>');
          process.exit(1);
        }
        await request('POST', '/api/agents/messages', { channelId, content });
        console.log('✓ Message sent');
        break;
      }

      case 'send-file': {
        const [channelId, filePath] = args;
        if (!channelId || !filePath) {
          console.error('Usage: mc-api.js send-file <channelId> <filePath>');
          process.exit(1);
        }
        const content = fs.readFileSync(filePath, 'utf8');
        await request('POST', '/api/agents/messages', { channelId, content });
        console.log('✓ Message sent');
        break;
      }

      case 'subtask': {
        const [subtaskId, completed] = args;
        if (!subtaskId || !['true', 'false'].includes(completed)) {
          console.error('Usage: mc-api.js subtask <subtaskId> <true|false>');
          process.exit(1);
        }
        const result = await request('PATCH', '/api/kanban/subtasks', {
          id: subtaskId,
          completed: completed === 'true'
        });
        console.log(`✓ Subtask ${result.completed ? 'completed' : 'uncompleted'}: ${result.title}`);
        break;
      }

      case 'move': {
        const [taskId, columnId] = args;
        if (!taskId || !columnId) {
          console.error('Usage: mc-api.js move <taskId> <columnId>');
          console.error('Column IDs: col-backlog, col-todo, col-progress, col-review, col-done');
          process.exit(1);
        }
        const result = await request('PATCH', '/api/agents/tasks', { taskId, columnId });
        console.log(`✓ Task moved to ${result.task.columnName}: ${result.task.title}`);
        break;
      }

      case 'tasks': {
        const result = await request('GET', '/api/agents/tasks');
        console.log(`\n📋 My Tasks (${result.total}):\n`);
        for (const task of result.tasks) {
          const progress = `${task.subtaskProgress.completed}/${task.subtaskProgress.total}`;
          console.log(`[${task.columnName}] ${task.title} (${progress})`);
        }
        break;
      }

      default:
        console.log(`Mission Control API Helper

Commands:
  send <channelId> <message>      Send a message to a channel
  send-file <channelId> <file>    Send message from file
  subtask <id> <true|false>       Mark subtask complete/incomplete
  move <taskId> <columnId>        Move task to column
  tasks                           List my assigned tasks

Channel IDs: channel-ops, channel-general, channel-approvals
Column IDs: col-backlog, col-todo, col-progress, col-review, col-done`);
    }
  } catch (err) {
    console.error('✗ Error:', err.message);
    process.exit(1);
  }
}

main();
