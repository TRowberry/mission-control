import { exec } from 'child_process';
import { promisify } from 'util';
import prisma from '@/lib/db';
import { User, AgentConfig } from '@prisma/client';
import { getOllamaEndpoint, getMCApiUrl } from '@/lib/llm-providers';

const execAsync = promisify(exec);

const DEFAULT_IMAGE = 'mc-agent:latest';
const DOCKER_NETWORK = 'mission-control_default'; // docker-compose network

interface DockerRunOptions {
  runId: string;
  agent: User;
  config: AgentConfig;
  input?: string;
}

/**
 * Run an agent in an isolated Docker container
 */
export async function runAgentInDocker(options: DockerRunOptions): Promise<void> {
  const { runId, agent, config, input } = options;
  const startTime = Date.now();

  try {
    // Update run status to running
    await prisma.agentRun.update({
      where: { id: runId },
      data: {
        status: 'running',
        startedAt: new Date(),
      },
    });

    // Build Docker run command
    const containerName = `mc-agent-${runId.slice(0, 8)}`;
    const image = config.dockerImage || DEFAULT_IMAGE;
    const memLimit = config.memoryLimitMb || 512;
    const cpuLimit = config.cpuLimit || 0.5;
    const timeout = config.timeoutSeconds || 300;

    // Prepare environment variables for the container
    const ollamaEndpoint = config.llmEndpoint || await getOllamaEndpoint();
    const mcApiUrl = getMCApiUrl();
    
    const envVars = [
      `AGENT_ID=${agent.id}`,
      `RUN_ID=${runId}`,
      `LLM_PROVIDER=${config.llmProvider || 'ollama'}`,
      `LLM_MODEL=${config.llmModel || 'llama3.2'}`,
      `LLM_ENDPOINT=${ollamaEndpoint}`,
      `SYSTEM_PROMPT=${escapeForShell(config.systemPrompt || 'You are a helpful AI assistant.')}`,
      `USER_PROMPT=${escapeForShell(input || 'Execute your primary task.')}`,
      `MC_API_URL=${mcApiUrl}`,
      `MC_API_KEY=${agent.apiKey || ''}`,
    ];

    const envFlags = envVars.map(e => `-e "${e}"`).join(' ');

    // Docker run command with resource limits
    const dockerCmd = [
      'docker run',
      '--rm',                           // Remove container after exit
      `--name ${containerName}`,        // Named container
      `--network ${DOCKER_NETWORK}`,    // Same network as MC
      `--memory=${memLimit}m`,          // Memory limit
      `--cpus=${cpuLimit}`,             // CPU limit
      '--read-only',                    // Read-only filesystem
      '--no-new-privileges',            // Security
      envFlags,
      image,
    ].join(' ');

    console.log(`[Docker] Starting container: ${containerName}`);
    console.log(`[Docker] Image: ${image}, Memory: ${memLimit}MB, CPU: ${cpuLimit}`);

    // Execute with timeout
    const { stdout, stderr } = await Promise.race([
      execAsync(dockerCmd),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`Container timeout after ${timeout}s`)), timeout * 1000)
      ),
    ]);

    // Parse output to extract results
    const result = parseContainerOutput(stdout);

    const durationMs = Date.now() - startTime;
    
    // Update run record with results
    await prisma.agentRun.update({
      where: { id: runId },
      data: {
        status: 'completed',
        output: result.output || stdout,
        actionsCount: result.actionsCount || 0,
        actionsRun: result.actionsCount || 0,
        tokensUsed: result.tokensUsed || 0,
        durationMs,
        completedAt: new Date(),
      },
    });

    // Update agent stats
    await prisma.agentConfig.update({
      where: { userId: agent.id },
      data: {
        lastRunAt: new Date(),
        lastRunStatus: 'completed',
        runCount: { increment: 1 },
        totalTokensUsed: { increment: result.tokensUsed || 0 },
      },
    });

    if (stderr) {
      console.warn(`[Docker] Container stderr: ${stderr}`);
    }

    console.log(`[Docker] Container ${containerName} completed in ${durationMs}ms`);

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const durationMs = Date.now() - startTime;

    console.error(`[Docker] Container failed: ${errorMessage}`);

    // Try to kill container if it's still running
    try {
      const containerName = `mc-agent-${runId.slice(0, 8)}`;
      await execAsync(`docker kill ${containerName} 2>/dev/null || true`);
    } catch { }

    await prisma.agentRun.update({
      where: { id: runId },
      data: {
        status: 'failed',
        errorMessage,
        durationMs,
        completedAt: new Date(),
      },
    });

    await prisma.agentConfig.update({
      where: { userId: agent.id },
      data: {
        lastRunAt: new Date(),
        lastRunStatus: 'failed',
        runCount: { increment: 1 },
      },
    });

    throw error;
  }
}

/**
 * Build the agent Docker image
 */
export async function buildAgentImage(): Promise<void> {
  console.log('[Docker] Building agent image...');
  
  const { stdout, stderr } = await execAsync(
    'docker build -t mc-agent:latest -f Dockerfile.agent .',
    { cwd: '/app' }
  );
  
  console.log('[Docker] Build output:', stdout);
  if (stderr) console.warn('[Docker] Build warnings:', stderr);
}

/**
 * Check if agent image exists
 */
export async function agentImageExists(): Promise<boolean> {
  try {
    await execAsync('docker image inspect mc-agent:latest');
    return true;
  } catch {
    return false;
  }
}

/**
 * Parse container output for structured data
 */
function parseContainerOutput(output: string): {
  output?: string;
  tokensUsed?: number;
  actionsCount?: number;
} {
  const result: { output?: string; tokensUsed?: number; actionsCount?: number } = {};

  // Try to extract tokens count
  const tokensMatch = output.match(/Tokens:\s*(\d+)/);
  if (tokensMatch) {
    result.tokensUsed = parseInt(tokensMatch[1], 10);
  }

  // Try to extract actions count
  const actionsMatch = output.match(/Parsed\s+(\d+)\s+action/);
  if (actionsMatch) {
    result.actionsCount = parseInt(actionsMatch[1], 10);
  }

  // Extract LLM response section
  const responseMatch = output.match(/=== LLM Response ===\n([\s\S]*?)\n\nTokens:/);
  if (responseMatch) {
    result.output = responseMatch[1].trim();
  } else {
    result.output = output;
  }

  return result;
}

/**
 * Escape string for shell command
 */
function escapeForShell(str: string): string {
  return str
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\$/g, '\\$')
    .replace(/`/g, '\\`')
    .replace(/\n/g, '\\n');
}
