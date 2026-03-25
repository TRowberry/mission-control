import { spawn, ChildProcess } from 'child_process';
import { join } from 'path';
import prisma from '@/lib/db';
import { User, AgentConfig } from '@prisma/client';
import { getOllamaEndpoint, getMCApiUrl } from '@/lib/llm-providers';

interface ProcessRunOptions {
  runId: string;
  agent: User;
  config: AgentConfig;
  input?: string;
}

// Track running processes for cleanup
const runningProcesses = new Map<string, ChildProcess>();

/**
 * Run an agent in an isolated child process
 */
export async function runAgentInProcess(options: ProcessRunOptions): Promise<void> {
  const { runId, agent, config, input } = options;
  const startTime = Date.now();

  let childProcess: ChildProcess | null = null;

  try {
    // Update run status to running
    await prisma.agentRun.update({
      where: { id: runId },
      data: {
        status: 'running',
        startedAt: new Date(),
      },
    });

    // Resource limits
    const memLimit = config.memoryLimitMb || 512;
    const timeout = (config.timeoutSeconds || 300) * 1000; // Convert to ms

    // Environment variables for the child process
    const ollamaEndpoint = config.llmEndpoint || await getOllamaEndpoint();
    const mcApiUrl = getMCApiUrl();
    
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      AGENT_ID: agent.id,
      RUN_ID: runId,
      LLM_PROVIDER: config.llmProvider || 'ollama',
      LLM_MODEL: config.llmModel || 'llama3.2',
      LLM_ENDPOINT: ollamaEndpoint,
      SYSTEM_PROMPT: config.systemPrompt || 'You are a helpful AI assistant.',
      USER_PROMPT: input || 'Execute your primary task.',
      MC_API_URL: mcApiUrl,
      MC_API_KEY: agent.apiKey || '',
      // Prevent child from inheriting parent's NODE_OPTIONS
      NODE_OPTIONS: `--max-old-space-size=${memLimit}`,
    };

    // Path to the agent runner script
    const runnerScript = join(process.cwd(), 'agent-runner.js');

    console.log(`[Process] Starting agent run: ${runId.slice(0, 8)}`);
    console.log(`[Process] Memory limit: ${memLimit}MB, Timeout: ${timeout / 1000}s`);

    // Spawn child process
    childProcess = spawn('node', [runnerScript], {
      env,
      cwd: process.cwd(),
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: false, // Keep attached for cleanup
    });

    // Track the process
    runningProcesses.set(runId, childProcess);

    // Collect output
    let stdout = '';
    let stderr = '';

    childProcess.stdout?.on('data', (data) => {
      stdout += data.toString();
    });

    childProcess.stderr?.on('data', (data) => {
      stderr += data.toString();
    });

    // Wait for process to complete or timeout
    const exitCode = await Promise.race([
      new Promise<number>((resolve) => {
        childProcess!.on('close', (code) => {
          resolve(code ?? 1);
        });
      }),
      new Promise<number>((_, reject) => {
        setTimeout(() => {
          if (childProcess && !childProcess.killed) {
            childProcess.kill('SIGKILL');
          }
          reject(new Error(`Process timeout after ${timeout / 1000}s`));
        }, timeout);
      }),
    ]);

    // Remove from tracking
    runningProcesses.delete(runId);

    if (exitCode !== 0) {
      throw new Error(`Process exited with code ${exitCode}: ${stderr || 'No error output'}`);
    }

    // Parse output to extract results
    const result = parseProcessOutput(stdout);

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
      console.warn(`[Process] Agent stderr: ${stderr}`);
    }

    console.log(`[Process] Agent ${runId.slice(0, 8)} completed in ${durationMs}ms`);

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const durationMs = Date.now() - startTime;

    console.error(`[Process] Agent failed: ${errorMessage}`);

    // Kill process if still running
    if (childProcess && !childProcess.killed) {
      childProcess.kill('SIGKILL');
    }
    runningProcesses.delete(runId);

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
 * Kill a running agent process
 */
export function killAgentProcess(runId: string): boolean {
  const process = runningProcesses.get(runId);
  if (process && !process.killed) {
    process.kill('SIGKILL');
    runningProcesses.delete(runId);
    return true;
  }
  return false;
}

/**
 * Get count of running agent processes
 */
export function getRunningProcessCount(): number {
  return runningProcesses.size;
}

/**
 * Parse process output for structured data
 */
function parseProcessOutput(output: string): {
  output?: string;
  tokensUsed?: number;
  actionsCount?: number;
} {
  const result: { output?: string; tokensUsed?: number; actionsCount?: number } = {};

  // Try to parse JSON result if present (new format)
  const jsonMatch = output.match(/===RESULT_JSON===\n([\s\S]*?)\n===END_JSON===/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[1]);
      return {
        output: parsed.response || parsed.output,
        tokensUsed: parsed.tokensUsed || parsed.tokens,
        actionsCount: parsed.actionsCount || parsed.actions?.length || 0,
      };
    } catch {
      // Fall through to legacy parsing
    }
  }

  // Legacy format parsing
  const tokensMatch = output.match(/Tokens:\s*(\d+)/);
  if (tokensMatch) {
    result.tokensUsed = parseInt(tokensMatch[1], 10);
  }

  const actionsMatch = output.match(/Parsed\s+(\d+)\s+action/);
  if (actionsMatch) {
    result.actionsCount = parseInt(actionsMatch[1], 10);
  }

  const responseMatch = output.match(/=== LLM Response ===\n([\s\S]*?)\n\nTokens:/);
  if (responseMatch) {
    result.output = responseMatch[1].trim();
  } else {
    result.output = output;
  }

  return result;
}

/**
 * Cleanup all running processes (for graceful shutdown)
 */
export function cleanupAllProcesses(): void {
  for (const [runId, process] of runningProcesses) {
    console.log(`[Process] Killing orphaned process: ${runId}`);
    if (!process.killed) {
      process.kill('SIGKILL');
    }
  }
  runningProcesses.clear();
}

// Cleanup on process exit
process.on('exit', cleanupAllProcesses);
process.on('SIGTERM', cleanupAllProcesses);
process.on('SIGINT', cleanupAllProcesses);
