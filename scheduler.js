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
    schedulerInterval = setInterval(checkScheduledAgents, 60000);
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
