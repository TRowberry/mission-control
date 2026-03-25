import { NextRequest } from 'next/server';
import prisma from '@/lib/db';
import { withAgentParams, AuthAgent } from '@/lib/modules/api/middleware';
import { ok, notFound } from '@/lib/modules/api/response';

/**
 * GET /api/agents/[agentId]/flows/[flowId]/runs
 * List flow run history
 */
export const GET = withAgentParams(async (
  req: NextRequest,
  agent: AuthAgent,
  params: Promise<Record<string, string>>
) => {
  const { agentId, flowId } = await params;
  const { searchParams } = new URL(req.url);
  const limit = parseInt(searchParams.get('limit') || '20');
  const cursor = searchParams.get('cursor');

  if (agent.id !== agentId) {
    return notFound('Flow not found');
  }

  // Verify flow exists and belongs to agent
  const flow = await prisma.agentFlow.findFirst({
    where: { id: flowId, agentId },
  });

  if (!flow) {
    return notFound('Flow not found');
  }

  const runs = await prisma.agentFlowRun.findMany({
    where: { flowId },
    take: limit,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      status: true,
      triggeredBy: true,
      input: true,
      output: true,
      tokensUsed: true,
      cost: true,
      durationMs: true,
      errorMessage: true,
      startedAt: true,
      completedAt: true,
      createdAt: true,
      triggerUser: {
        select: {
          id: true,
          username: true,
          displayName: true,
        },
      },
    },
  });

  const nextCursor = runs.length === limit ? runs[runs.length - 1].id : null;

  return ok({
    runs,
    nextCursor,
  });
});
