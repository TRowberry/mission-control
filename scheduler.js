/**
 * Agent Scheduler (standalone module)
 * 
 * Runs agents on their configured cron schedules.
 * Import and call startScheduler() after server is ready.
 */

const { PrismaClient } = require('@prisma/client');

// Use global prisma to avoid multiple connections in development
const globalForPrisma = globalThis;
const prisma = globalForPrisma.prisma ?? new PrismaClient();
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

// Simple cron parser - supports standard 5-field cron expressions
function parseCron(expr) {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return null;

  const parseField = (field, min, max) => {
    const values = [];
    
    for (const part of field.split(',')) {
      if (part.startsWith('*/')) {
        const step = parseInt(part.slice(2));
        if (isNaN(step) || step < 1) return null;
        for (let i = min; i <= max; i += step) values.push(i);
        continue;
      }
      
      if (part === '*') {
        for (let i = min; i <= max; i++) values.push(i);
        continue;
      }
      
      if (part.includes('-')) {
        const [start, end] = part.split('-').map(Number);
        if (isNaN(start) || isNaN(end) || start < min || end > max || start > end) return null;
        for (let i = start; i <= end; i++) values.push(i);
        continue;
      }
      
      const num = parseInt(part);
      if (isNaN(num) || num < min || num > max) return null;
      values.push(num);
    }
    
    return values.length > 0 ? values : null;
  };

  const minute = parseField(parts[0], 0, 59);
  const hour = parseField(parts[1], 0, 23);
  const dom = parseField(parts[2], 1, 31);
  const month = parseField(parts[3], 1, 12);
  const dow = parseField(parts[4], 0, 6);

  if (!minute || !hour || !dom || !month || !dow) return null;
  return { minute, hour, dom, month, dow };
}

function shouldRunNow(cronExpr, now) {
  const parsed = parseCron(cronExpr);
  if (!parsed) return false;

  const minute = now.getMinutes();
  const hour = now.getHours();
  const dom = now.getDate();
  const month = now.getMonth() + 1;
  const dow = now.getDay();

  return (
    parsed.minute.includes(minute) &&
    parsed.hour.includes(hour) &&
    parsed.dom.includes(dom) &&
    parsed.month.includes(month) &&
    parsed.dow.includes(dow)
  );
}

// Track last run times to prevent duplicate runs
const lastRunTimes = new Map();

async function runAgentById(agentId, agentConfig, context) {
  // Create AgentRun record
  const run = await prisma.agentRun.create({
    data: {
      agentId,
      triggeredBy: context.trigger || 'scheduled',
      triggeredById: null, // No user triggered this
      status: 'pending',
      input: context.message || null,
    },
  });

  // Run the agent using child process (inline version of process-runner logic)
  const { spawn } = require('child_process');
  const path = require('path');

  return new Promise((resolve) => {
    const startTime = Date.now();
    const memoryLimit = agentConfig.memoryLimitMb || 512;
    const timeoutSeconds = agentConfig.timeoutSeconds || 300;

    // Build environment
    const env = {
      ...process.env,
      AGENT_RUN_ID: run.id,
      AGENT_ID: agentId,
      AGENT_INPUT: context.message || '',
      LLM_PROVIDER: agentConfig.llmProvider || 'openai',
      LLM_MODEL: agentConfig.llmModel || 'gpt-4',
      LLM_ENDPOINT: agentConfig.llmEndpoint || '',
      SYSTEM_PROMPT: agentConfig.systemPrompt || '',
      NODE_OPTIONS: `--max-old-space-size=${memoryLimit}`,
    };

    const runnerPath = path.join(process.cwd(), 'agent-runner.js');
    const child = spawn('node', [runnerPath], {
      env,
      cwd: process.cwd(),
      timeout: timeoutSeconds * 1000,
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('close', async (code) => {
      const duration = Date.now() - startTime;
      
      // Parse result from stdout
      let result = { success: false, output: stdout, error: stderr };
      const jsonMarker = '===RESULT_JSON===';
      const jsonStart = stdout.indexOf(jsonMarker);
      if (jsonStart !== -1) {
        try {
          const jsonStr = stdout.slice(jsonStart + jsonMarker.length).trim();
          result = JSON.parse(jsonStr);
        } catch (e) {
          // Keep default result
        }
      }

      // Update run record (note: schema has no 'error' field, store in output)
      const outputText = code === 0 
        ? (result.output || stdout)
        : `ERROR: ${stderr || result.error || 'Unknown error'}\n\n${result.output || stdout}`;
      
      await prisma.agentRun.update({
        where: { id: run.id },
        data: {
          status: code === 0 ? 'completed' : 'failed',
          output: outputText,
          tokensUsed: result.tokensUsed || 0,
          cost: result.cost || 0,
          completedAt: new Date(),
          durationMs: duration,
        },
      });

      // Update AgentConfig with last run info (so UI shows correct status)
      await prisma.agentConfig.update({
        where: { userId: agentId },
        data: {
          lastRunAt: new Date(),
          lastRunStatus: code === 0 ? 'completed' : 'failed',
          runCount: { increment: 1 },
          totalTokensUsed: { increment: result.tokensUsed || 0 },
          totalCost: { increment: result.cost || 0 },
        },
      });

      resolve({
        status: code === 0 ? 'completed' : 'failed',
        runId: run.id,
        duration,
      });
    });

    child.on('error', async (err) => {
      await prisma.agentRun.update({
        where: { id: run.id },
        data: {
          status: 'failed',
          output: `ERROR: ${err.message}`,
          completedAt: new Date(),
        },
      });
      
      // Update AgentConfig with failed status
      await prisma.agentConfig.update({
        where: { userId: agentId },
        data: {
          lastRunAt: new Date(),
          lastRunStatus: 'failed',
          runCount: { increment: 1 },
        },
      });
      
      resolve({ status: 'failed', error: err.message });
    });
  });
}

async function checkScheduledAgents() {
  const now = new Date();
  const currentMinute = Math.floor(now.getTime() / 60000);

  try {
    const scheduledAgents = await prisma.user.findMany({
      where: {
        isAgent: true,
        agentConfig: {
          triggerType: 'scheduled',
          cronSchedule: { not: null },
        },
      },
      include: {
        agentConfig: true,
      },
    });

    for (const agent of scheduledAgents) {
      if (!agent.agentConfig?.cronSchedule) continue;

      const lastRun = lastRunTimes.get(agent.id);
      if (lastRun === currentMinute) continue;

      if (shouldRunNow(agent.agentConfig.cronSchedule, now)) {
        console.log(`[Scheduler] Triggering scheduled run for agent: ${agent.username}`);
        lastRunTimes.set(agent.id, currentMinute);

        try {
          // Use scheduledTaskPrompt if set, otherwise a generic message
          const taskPrompt = agent.agentConfig.scheduledTaskPrompt || `Execute your scheduled task. Current time: ${now.toISOString()}`;
          const result = await runAgentById(agent.id, agent.agentConfig, {
            trigger: 'scheduled',
            message: taskPrompt,
          });
          
          console.log(`[Scheduler] Agent ${agent.username} completed:`, result.status || 'unknown');
        } catch (error) {
          console.error(`[Scheduler] Agent ${agent.username} failed:`, error.message);
        }
      }
    }
  } catch (error) {
    console.error('[Scheduler] Error checking scheduled agents:', error.message);
  }
}

// ============================================================
// Flow scheduler — runs AgentFlows with triggerType='scheduled'
// ============================================================

async function checkScheduledFlows() {
  const now = new Date();
  const currentMinute = Math.floor(now.getTime() / 60000);

  try {
    const scheduledFlows = await prisma.agentFlow.findMany({
      where: {
        triggerType: 'scheduled',
        isActive: true,
        triggerConfig: { not: null },
      },
      include: {
        agent: { select: { id: true, username: true, apiKey: true } },
      },
    });

    for (const flow of scheduledFlows) {
      const runKey = `flow:${flow.id}`;
      const lastRun = lastRunTimes.get(runKey);
      if (lastRun === currentMinute) continue;

      let cronExpr = null;
      try {
        const cfg = JSON.parse(flow.triggerConfig);
        cronExpr = cfg.cron || cfg.cronSchedule || null;
      } catch {
        continue;
      }
      if (!cronExpr || !shouldRunNow(cronExpr, now)) continue;

      lastRunTimes.set(runKey, currentMinute);
      console.log(`[Scheduler] Triggering flow: ${flow.name} (${flow.id})`);

      (async () => {
        const startTime = Date.now();
        let run;
        try {
          run = await prisma.agentFlowRun.create({
            data: {
              flowId: flow.id,
              triggeredBy: 'scheduler',
              status: 'running',
              startedAt: new Date(),
            },
          });

          // Parse and execute the flow definition
          const def = typeof flow.definition === 'string'
            ? JSON.parse(flow.definition)
            : flow.definition;

          const result = await executeFlow(flow, def, {}, run.id);
          const durationMs = Date.now() - startTime;

          await prisma.agentFlowRun.update({
            where: { id: run.id },
            data: {
              status: 'success',
              output: JSON.stringify(result.output),
              executionLog: JSON.stringify(result.log),
              tokensUsed: result.tokensUsed || 0,
              cost: result.cost || 0,
              durationMs,
              completedAt: new Date(),
            },
          });
          await prisma.agentFlow.update({
            where: { id: flow.id },
            data: { runCount: { increment: 1 }, lastRunAt: new Date(), lastRunStatus: 'success' },
          });
          console.log(`[Scheduler] Flow ${flow.name} succeeded in ${durationMs}ms`);
        } catch (err) {
          const durationMs = Date.now() - startTime;
          console.error(`[Scheduler] Flow ${flow.name} failed:`, err.message);
          if (run) {
            await prisma.agentFlowRun.update({
              where: { id: run.id },
              data: {
                status: 'failed',
                errorMessage: err.message,
                errorNodeId: err.nodeId || null,
                durationMs,
                completedAt: new Date(),
              },
            }).catch(() => {});
            await prisma.agentFlow.update({
              where: { id: flow.id },
              data: { runCount: { increment: 1 }, lastRunAt: new Date(), lastRunStatus: 'failed' },
            }).catch(() => {});
          }
        }
      })().catch(err => console.error(`[Scheduler] Flow runner error:`, err.message));
    }
  } catch (err) {
    console.error('[Scheduler] Error checking scheduled flows:', err.message);
  }
}

// ----------------------------------------------------------------
// Minimal flow executor (mirrors lib/flows/executor.ts logic)
// Runs inside the standalone scheduler.js without Next.js imports
// ----------------------------------------------------------------

async function executeFlow(flow, _def, input, runId) {
  const definition = typeof flow.definition === 'string'
    ? JSON.parse(flow.definition)
    : flow.definition;

  const { nodes, edges } = definition;
  const log = [];
  let totalTokens = 0;
  let totalCost = 0;

  // Build adjacency map
  const adjacency = new Map();
  for (const edge of edges) {
    const targets = adjacency.get(edge.source) || [];
    targets.push({ target: edge.target, sourceHandle: edge.sourceHandle });
    adjacency.set(edge.source, targets);
  }

  const nodeMap = new Map(nodes.map(n => [n.id, n]));
  const triggerNode = nodes.find(n => n.type === 'trigger');
  if (!triggerNode) throw new Error('Flow has no trigger node');

  const nodeOutputs = new Map();
  nodeOutputs.set(triggerNode.id, input);
  const queue = [triggerNode.id];
  const visited = new Set();

  while (queue.length > 0) {
    const nodeId = queue.shift();
    if (visited.has(nodeId)) continue;
    visited.add(nodeId);

    const node = nodeMap.get(nodeId);
    const nodeInput = nodeOutputs.get(nodeId) || {};
    const config = node.config ?? node.data ?? {};
    const startTime = Date.now();
    let nodeOutput = null;
    let status = 'success';
    let error;

    try {
      if (node.type === 'trigger') {
        nodeOutput = nodeInput;
      } else if (node.type === 'fetch') {
        nodeOutput = await runFetchAction(config, nodeInput);
      } else if (node.type === 'post-message' || node.type === 'post') {
        nodeOutput = await runPostMessageAction(config, nodeInput, flow.agentId);
      } else if (node.type === 'condition') {
        const result = evaluateCondition(config, nodeInput);
        nodeOutput = { result, data: nodeInput };
        const next = adjacency.get(nodeId) || [];
        for (const { target, sourceHandle } of next) {
          if (!sourceHandle || sourceHandle === (result ? 'true' : 'false')) {
            nodeOutputs.set(target, nodeInput);
            queue.push(target);
          }
        }
        log.push({ nodeId, nodeType: node.type, status, input: nodeInput, output: nodeOutput, durationMs: Date.now() - startTime, timestamp: new Date().toISOString() });
        continue;
      } else {
        console.log(`[FlowExec] Skipping unsupported node type: ${node.type}`);
        nodeOutput = nodeInput;
      }
    } catch (e) {
      status = 'failed';
      error = e.message;
      nodeOutput = { error: e.message };
      log.push({ nodeId, nodeType: node.type, status, input: nodeInput, output: nodeOutput, error, durationMs: Date.now() - startTime, timestamp: new Date().toISOString() });
      const err = new Error(e.message);
      err.nodeId = nodeId;
      throw err;
    }

    log.push({ nodeId, nodeType: node.type, status, input: nodeInput, output: nodeOutput, durationMs: Date.now() - startTime, timestamp: new Date().toISOString() });

    const next = adjacency.get(nodeId) || [];
    for (const { target } of next) {
      nodeOutputs.set(target, nodeOutput);
      queue.push(target);
    }
  }

  return { output: nodeOutputs.get(nodes[nodes.length - 1]?.id) || {}, log, tokensUsed: totalTokens, cost: totalCost };
}

async function runFetchAction(config, input) {
  const { url, method = 'GET', headers = {}, body } = config;
  if (!url) throw new Error('Fetch action requires a URL');

  const resolvedUrl = resolveTemplate(url, input);
  const resolvedBody = body
    ? resolveTemplate(typeof body === 'string' ? body : JSON.stringify(body), input)
    : undefined;

  const fetchOptions = {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
  };
  if (method !== 'GET' && resolvedBody) fetchOptions.body = resolvedBody;

  const res = await fetch(resolvedUrl, fetchOptions);
  let responseData;
  const ct = res.headers.get('content-type');
  if (ct && ct.includes('application/json')) {
    responseData = await res.json();
  } else {
    responseData = await res.text();
  }
  if (!res.ok) throw new Error(`Fetch failed: ${res.status} ${res.statusText}`);
  return { status: res.status, body: responseData };
}

async function runPostMessageAction(config, input, agentId) {
  const { channelId, channel, message, messageTemplate } = config;
  const targetChannelId = channelId || channel;
  if (!targetChannelId) throw new Error('post-message requires a channel');

  const targetChannel = await prisma.channel.findFirst({
    where: { OR: [{ id: targetChannelId }, { slug: targetChannelId }] },
  });
  if (!targetChannel) throw new Error(`Channel not found: ${targetChannelId}`);

  const resolvedMessage = resolveTemplate(message || messageTemplate || '', input);
  if (!resolvedMessage.trim()) throw new Error('post-message requires a message');

  const newMessage = await prisma.message.create({
    data: {
      channelId: targetChannel.id,
      authorId: agentId,
      content: `<p>${escapeHtml(resolvedMessage)}</p>`,
      type: 'text',
    },
  });
  return { messageId: newMessage.id, channelId: targetChannel.id };
}

function evaluateCondition(config, input) {
  const { field, operator, value } = config;
  const fieldValue = field ? field.split('.').reduce((o, k) => o?.[k], input) : undefined;
  switch (operator) {
    case 'equals': return fieldValue === value;
    case 'notEquals': return fieldValue !== value;
    case 'contains': return String(fieldValue).includes(String(value));
    case 'greaterThan': return Number(fieldValue) > Number(value);
    case 'lessThan': return Number(fieldValue) < Number(value);
    case 'exists': return fieldValue != null;
    case 'notExists': return fieldValue == null;
    case 'isEmpty': return !fieldValue || (Array.isArray(fieldValue) && fieldValue.length === 0);
    case 'isNotEmpty': return !!fieldValue && (!Array.isArray(fieldValue) || fieldValue.length > 0);
    default: return Boolean(fieldValue);
  }
}

function resolveTemplate(template, data) {
  return template.replace(/\{\{([^}]+)\}\}/g, (match, path) => {
    let cleanPath = path.trim();
    if (cleanPath.startsWith('input.')) cleanPath = cleanPath.slice(6);
    if (cleanPath.startsWith('node.')) cleanPath = cleanPath.split('.').pop();
    const value = cleanPath.split('.').reduce((o, k) => o?.[k], data);
    if (value === undefined) return match;
    return typeof value === 'object' ? JSON.stringify(value) : String(value);
  });
}

function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#039;').replace(/\n/g, '<br>');
}

let schedulerInterval = null;

function startScheduler() {
  if (schedulerInterval) {
    console.log('[Scheduler] Already running');
    return;
  }

  console.log('[Scheduler] Starting agent scheduler (checking every minute)');

  // Wait a few seconds for Next.js to be ready
  setTimeout(() => {
    checkScheduledAgents();
    checkScheduledFlows();
    schedulerInterval = setInterval(() => {
      checkScheduledAgents();
      checkScheduledFlows();
    }, 60000);
  }, 5000);
}

function stopScheduler() {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
    console.log('[Scheduler] Stopped');
  }
}

module.exports = { startScheduler, stopScheduler, parseCron, shouldRunNow };
