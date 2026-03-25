// worker/index.js - Standalone worker process entry point
const { Worker } = require('bullmq');

// Redis connection (use host IP for NAS DNS compatibility)
const connection = {
  host: process.env.REDIS_HOST || '10.0.0.206',
  port: parseInt(process.env.REDIS_PORT || '6379'),
};

console.log('[Worker] Starting Mission Control Worker Service...');
console.log(`[Worker] Connecting to Redis at ${connection.host}:${connection.port}`);

// Queue names (must match main app)
const QUEUE_NAMES = {
  AGENT_WAKE: 'agent-wake',
  NOTIFICATIONS: 'notifications',
  SCHEDULED_TASKS: 'scheduled-tasks',
};

// Process agent wake jobs
async function processAgentWake(job) {
  const { agentId, agentUsername, reason, messageId, channelId, taskId, taskTitle } = job.data;
  
  console.log(`[Agent Wake] Processing wake for ${agentUsername} (reason: ${reason}, job: ${job.id})`);
  
  // Get OpenClaw gateway config
  const gatewayUrl = process.env.OPENCLAW_GATEWAY_URL;
  const gatewayToken = process.env.OPENCLAW_GATEWAY_TOKEN;
  
  if (!gatewayUrl || !gatewayToken) {
    console.log('[Agent Wake] OpenClaw gateway not configured, skipping');
    return { skipped: true, reason: 'gateway not configured' };
  }
  
  // Only wake Rico for now (main agent)
  if (agentUsername.toLowerCase() !== 'rico') {
    console.log(`[Agent Wake] Skipping non-Rico agent: ${agentUsername}`);
    return { skipped: true, reason: 'not rico' };
  }
  
  try {
    // Build wake message based on reason
    let wakeMessage;
    if (reason === 'task_assigned') {
      wakeMessage = `[Mission Control] Task assigned to @${agentUsername}: "${taskTitle}" (taskId: ${taskId})`;
    } else if (reason === 'mention') {
      wakeMessage = `[Mission Control] @${agentUsername} mentioned (channel: ${channelId})`;
    } else if (reason === 'dm') {
      wakeMessage = `[Mission Control] DM received for @${agentUsername}`;
    } else {
      wakeMessage = `[Mission Control] Wake notification for @${agentUsername} (reason: ${reason})`;
    }
    
    // Call OpenClaw gateway to wake the agent
    const response = await fetch(`${gatewayUrl}/tools/invoke`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${gatewayToken}`,
      },
      body: JSON.stringify({
        tool: 'cron',
        args: {
          action: 'wake',
          text: wakeMessage,
          mode: 'now',
        },
      }),
    });
    
    console.log(`[Agent Wake] Rico gateway response: ${response.status}`);
    
    return {
      success: true,
      status: response.status,
      agentUsername,
      reason,
    };
  } catch (error) {
    console.error('[Agent Wake] Failed to wake agent:', error);
    throw error; // Re-throw to trigger retry
  }
}

// Create worker
const agentWakeWorker = new Worker(
  QUEUE_NAMES.AGENT_WAKE,
  processAgentWake,
  {
    connection,
    concurrency: 5,
  }
);

agentWakeWorker.on('completed', (job) => {
  console.log(`[Agent Wake] Job ${job.id} completed`);
});

agentWakeWorker.on('failed', (job, err) => {
  console.error(`[Agent Wake] Job ${job?.id} failed:`, err.message);
});

agentWakeWorker.on('error', (err) => {
  console.error('[Agent Wake] Worker error:', err);
});

console.log('[Worker] Agent Wake worker started');
console.log('[Worker] Listening for jobs...');

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('[Worker] Received SIGTERM, shutting down...');
  await agentWakeWorker.close();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('[Worker] Received SIGINT, shutting down...');
  await agentWakeWorker.close();
  process.exit(0);
});
