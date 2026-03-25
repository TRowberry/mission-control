import { NextRequest } from 'next/server';
import prisma from '@/lib/db';
import { withAgent, AuthAgent } from '@/lib/modules/api/middleware';
import { ok, notFound } from '@/lib/modules/api/response';

/**
 * GET /api/agents/me/config
 * 
 * Allows an agent to fetch its own configuration using API key auth.
 * Returns systemPrompt, LLM settings, capabilities, and rate limits.
 */
export const GET = withAgent(async (req: NextRequest, agent: AuthAgent) => {
  const config = await prisma.agentConfig.findUnique({
    where: { userId: agent.id },
    select: {
      id: true,
      role: true,
      systemPrompt: true,
      llmProvider: true,
      llmModel: true,
      llmEndpoint: true,
      triggerType: true,
      cronSchedule: true,
      canSendMessages: true,
      canEditTasks: true,
      canCreateTasks: true,
      canNotifyUsers: true,
      actionsPerMinute: true,
      actionsPerHour: true,
      dailyTokenLimit: true,
      dailyCostLimit: true,
      dockerImage: true,
      memoryLimitMb: true,
      cpuLimit: true,
      timeoutSeconds: true,
      lastRunAt: true,
      lastRunStatus: true,
      runCount: true,
      totalTokensUsed: true,
      totalCost: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  if (!config) {
    return notFound('Agent configuration not found');
  }

  return ok({
    agent: {
      id: agent.id,
      username: agent.username,
      displayName: agent.displayName,
    },
    config,
  });
});
