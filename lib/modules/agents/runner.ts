import prisma from '@/lib/db';
import { User, AgentConfig } from '@prisma/client';
import { runAgentInProcess, killAgentProcess, getRunningProcessCount } from './process-runner';
import { parseActions, ParsedAction, ParseResult, getActionsRequiringApproval } from './action-parser';
import { notifyPendingApproval } from './approval-notifier';
import { getOllamaEndpoint } from '@/lib/llm-providers';

interface LLMResponse {
  content: string;
  tokensUsed?: number;
}

interface RunOptions {
  useIsolation?: boolean;  // Default: true (use child process isolation)
  input?: string;
}

// Re-export parser types for external use
export type { ParsedAction, ParseResult };
export { parseActions, getActionsRequiringApproval };

/**
 * Run an agent execution
 * 
 * @param runId - The AgentRun record ID
 * @param agent - The agent User record
 * @param config - The AgentConfig record
 * @param options - Execution options
 */
export async function runAgent(
  runId: string,
  agent: User,
  config: AgentConfig,
  options: RunOptions = {}
): Promise<void> {
  const useIsolation = options.useIsolation !== false; // Default true

  if (useIsolation) {
    // Run in isolated child process (recommended)
    return runAgentInProcess({
      runId,
      agent,
      config,
      input: options.input,
    });
  }

  // Direct execution (non-isolated) - for development/testing only
  return runAgentDirect(runId, agent, config, options.input);
}

/**
 * Direct execution (non-isolated) - for development/testing
 * WARNING: Runs in the same process as the main app
 */
async function runAgentDirect(
  runId: string,
  agent: User,
  config: AgentConfig,
  input?: string
): Promise<void> {
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

    // Get the run details
    const run = await prisma.agentRun.findUnique({
      where: { id: runId },
    });

    if (!run) {
      throw new Error('Run not found');
    }

    // Build the prompt
    const systemPrompt = config.systemPrompt || 'You are a helpful AI assistant.';
    const userPrompt = input || run.input || 'Execute your primary task.';

    // Call the LLM
    const llmResponse = await callLLM(config, systemPrompt, userPrompt);

    // Parse actions from response using new structured parser
    const parseResult = parseActions(llmResponse.content);
    const actions = parseResult.actions;
    
    // Get agent's custom approval requirements (or use defaults)
    const defaultApprovalTypes = ['fetch', 'code', 'unknown'];
    let approvalTypes: string[] = defaultApprovalTypes;
    if (config.requireApprovalFor) {
      try {
        approvalTypes = JSON.parse(config.requireApprovalFor);
      } catch {
        // Use defaults if parsing fails
      }
    }
    
    // Override action requiresApproval based on agent's custom settings
    for (const action of actions) {
      action.requiresApproval = approvalTypes.includes(action.type);
    }
    
    // Check for actions requiring approval
    const needsApproval = actions.filter(a => a.requiresApproval);

    // Update run with results
    const durationMs = Date.now() - startTime;
    const finalStatus = needsApproval.length > 0 ? 'pending_approval' : 'completed';
    
    await prisma.agentRun.update({
      where: { id: runId },
      data: {
        status: finalStatus,
        output: llmResponse.content,
        actionsCount: actions.length,
        actionsRun: needsApproval.length > 0 ? 0 : actions.length,
        tokensUsed: llmResponse.tokensUsed || 0,
        durationMs,
        completedAt: needsApproval.length > 0 ? null : new Date(),
        // Store parsed actions for approval workflow
        metadata: JSON.stringify({
          parseMethod: parseResult.parseMethod,
          pendingApproval: needsApproval.map(a => ({
            type: a.type,
            targetId: a.targetId,
            payload: a.payload,
          })),
        }),
      },
    });

    // Update agent config stats
    await prisma.agentConfig.update({
      where: { userId: agent.id },
      data: {
        lastRunAt: new Date(),
        lastRunStatus: finalStatus,
        runCount: { increment: 1 },
        totalTokensUsed: { increment: llmResponse.tokensUsed || 0 },
      },
    });

    // Log actions (only executed ones if no approval needed)
    for (const action of actions) {
      const status = action.requiresApproval ? 'pending_approval' : 'executed';
      await prisma.agentActionLog.create({
        data: {
          agentId: agent.id,
          actionType: action.type,
          targetId: action.targetId,
          payload: JSON.stringify(action.payload),
          status,
          tokensUsed: Math.floor((llmResponse.tokensUsed || 0) / actions.length),
        },
      });
    }

    // Notify #approvals channel if actions need approval
    if (needsApproval.length > 0) {
      await notifyPendingApproval(
        runId,
        agent.id,
        agent.displayName || agent.username,
        needsApproval
      );
    }

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const durationMs = Date.now() - startTime;

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
 * Call the configured LLM provider
 */
async function callLLM(
  config: AgentConfig,
  systemPrompt: string,
  userPrompt: string
): Promise<LLMResponse> {
  const provider = config.llmProvider || 'ollama';
  const model = config.llmModel || 'llama3.2';
  // Use config endpoint, or fetch from provider settings
  const endpoint = config.llmEndpoint || await getOllamaEndpoint();

  if (provider === 'ollama') {
    return callOllama(endpoint, model, systemPrompt, userPrompt);
  }

  // Add more providers here (OpenAI, Anthropic, etc.)
  throw new Error(`Unsupported LLM provider: ${provider}`);
}

/**
 * Call Ollama API
 */
async function callOllama(
  endpoint: string,
  model: string,
  systemPrompt: string,
  userPrompt: string
): Promise<LLMResponse> {
  const response = await fetch(`${endpoint}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      prompt: userPrompt,
      system: systemPrompt,
      stream: false,
    }),
  });

  if (!response.ok) {
    throw new Error(`Ollama request failed: ${response.statusText}`);
  }

  const data = await response.json();
  
  return {
    content: data.response || '',
    tokensUsed: (data.prompt_eval_count || 0) + (data.eval_count || 0),
  };
}

/**
 * Trigger an agent run from a @mention
 * Creates an AgentRun and executes it
 */
export async function triggerAgentMention(
  agentId: string,
  channelId: string,
  messageContent: string,
  triggeredById: string
): Promise<void> {
  // Get the agent and config
  const agent = await prisma.user.findUnique({
    where: { id: agentId },
    include: { agentConfig: true },
  });

  if (!agent || !agent.agentConfig) {
    throw new Error(`Agent ${agentId} not found or has no config`);
  }

  // Create a run record
  const run = await prisma.agentRun.create({
    data: {
      agentId,
      triggeredBy: 'mention',
      triggeredById,
      status: 'pending',
      input: `You were @mentioned in channel ${channelId}. Message: ${messageContent}`,
    },
  });

  // Execute the agent
  await runAgent(run.id, agent, agent.agentConfig, {
    input: `You were @mentioned in channel ${channelId}. Message: ${messageContent}`,
  });
}

// Re-export process runner utilities
export { killAgentProcess, getRunningProcessCount };
