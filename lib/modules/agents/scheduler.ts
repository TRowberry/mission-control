/**
 * Agent Scheduler
 * 
 * Runs agents on their configured cron schedules.
 * Checks every minute for agents that need to run.
 */

import prisma from '@/lib/db';
import { runAgent } from './runner';
import { executeFlow } from '@/lib/flows/executor';

// Simple cron parser - supports standard 5-field cron expressions
// minute hour day-of-month month day-of-week
function parseCron(expr: string): { minute: number[], hour: number[], dom: number[], month: number[], dow: number[] } | null {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return null;

  const parseField = (field: string, min: number, max: number): number[] | null => {
    const values: number[] = [];
    
    for (const part of field.split(',')) {
      // Handle */n (every n)
      if (part.startsWith('*/')) {
        const step = parseInt(part.slice(2));
        if (isNaN(step) || step < 1) return null;
        for (let i = min; i <= max; i += step) values.push(i);
        continue;
      }
      
      // Handle * (any)
      if (part === '*') {
        for (let i = min; i <= max; i++) values.push(i);
        continue;
      }
      
      // Handle ranges (e.g., 1-5)
      if (part.includes('-')) {
        const [start, end] = part.split('-').map(Number);
        if (isNaN(start) || isNaN(end) || start < min || end > max || start > end) return null;
        for (let i = start; i <= end; i++) values.push(i);
        continue;
      }
      
      // Handle single values
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
  const dow = parseField(parts[4], 0, 6); // 0 = Sunday

  if (!minute || !hour || !dom || !month || !dow) return null;

  return { minute, hour, dom, month, dow };
}

function shouldRunNow(cronExpr: string, now: Date): boolean {
  const parsed = parseCron(cronExpr);
  if (!parsed) return false;

  const minute = now.getMinutes();
  const hour = now.getHours();
  const dom = now.getDate();
  const month = now.getMonth() + 1; // JavaScript months are 0-indexed
  const dow = now.getDay(); // 0 = Sunday

  return (
    parsed.minute.includes(minute) &&
    parsed.hour.includes(hour) &&
    parsed.dom.includes(dom) &&
    parsed.month.includes(month) &&
    parsed.dow.includes(dow)
  );
}

// Track last run times to prevent duplicate runs within the same minute
const lastRunTimes = new Map<string, number>();

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

      let cronExpr: string | null = null;
      try {
        const cfg = JSON.parse(flow.triggerConfig!);
        cronExpr = cfg.cron || cfg.cronSchedule || null;
      } catch {
        continue;
      }
      if (!cronExpr || !shouldRunNow(cronExpr, now)) continue;

      lastRunTimes.set(runKey, currentMinute);
      console.log(`[Scheduler] Triggering scheduled flow: ${flow.name} (${flow.id})`);

      (async () => {
        const startTime = Date.now();
        const run = await prisma.agentFlowRun.create({
          data: {
            flowId: flow.id,
            triggeredBy: 'scheduler',
            status: 'running',
            startedAt: new Date(),
          },
        });

        try {
          const result = await executeFlow(flow, {}, run.id);
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
          console.log(`[Scheduler] Flow ${flow.name} completed in ${durationMs}ms`);
        } catch (err: any) {
          const durationMs = Date.now() - startTime;
          await prisma.agentFlowRun.update({
            where: { id: run.id },
            data: {
              status: 'failed',
              errorMessage: err.message,
              errorNodeId: err.nodeId || null,
              durationMs,
              completedAt: new Date(),
            },
          });
          await prisma.agentFlow.update({
            where: { id: flow.id },
            data: { runCount: { increment: 1 }, lastRunAt: new Date(), lastRunStatus: 'failed' },
          });
          console.error(`[Scheduler] Flow ${flow.name} failed:`, err.message);
        }
      })().catch(err => console.error(`[Scheduler] Flow ${flow.name} run error:`, err));
    }
  } catch (error) {
    console.error('[Scheduler] Error checking scheduled flows:', error);
  }
}

async function checkScheduledAgents() {
  const now = new Date();
  const currentMinute = Math.floor(now.getTime() / 60000); // Current minute timestamp

  try {
    // Find all scheduled agents
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

      // Check if this agent already ran this minute
      const lastRun = lastRunTimes.get(agent.id);
      if (lastRun === currentMinute) continue;

      // Check if cron expression matches current time
      if (shouldRunNow(agent.agentConfig.cronSchedule, now)) {
        console.log(`[Scheduler] Triggering scheduled run for agent: ${agent.username}`);
        lastRunTimes.set(agent.id, currentMinute);

        try {
          // Create AgentRun record first
          const run = await prisma.agentRun.create({
            data: {
              agentId: agent.id,
              triggeredBy: 'scheduled',
              status: 'pending',
              input: `Scheduled run at ${now.toISOString()}`,
            },
          });

          // Spawn the agent execution (async)
          runAgent(run.id, agent, agent.agentConfig!).catch((err) => {
            console.error(`[Scheduler] Agent run ${run.id} failed:`, err);
          });
          
          console.log(`[Scheduler] Agent ${agent.username} run started: ${run.id}`);
        } catch (error) {
          console.error(`[Scheduler] Agent ${agent.username} failed:`, error);
        }
      }
    }
  } catch (error) {
    console.error('[Scheduler] Error checking scheduled agents:', error);
  }
}

let schedulerInterval: NodeJS.Timeout | null = null;

export function startScheduler() {
  if (schedulerInterval) {
    console.log('[Scheduler] Already running');
    return;
  }

  console.log('[Scheduler] Starting agent scheduler (checking every minute)');

  // Check immediately on start
  checkScheduledAgents();
  checkScheduledFlows();

  // Then check every minute
  schedulerInterval = setInterval(() => {
    checkScheduledAgents();
    checkScheduledFlows();
  }, 60000);
}

export function stopScheduler() {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
    console.log('[Scheduler] Stopped');
  }
}

// Export for testing
export { parseCron, shouldRunNow };
