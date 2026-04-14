import { NextRequest } from 'next/server';
import prisma from '@/lib/db';
import { withAnyAuthParams } from '@/lib/modules/api/middleware';
import { ok, notFound } from '@/lib/modules/api/response';

const PAGE_SIZE = 25;

/**
 * GET /api/agents/[agentId]/flow-runs
 * List all AgentFlowRun records across all flows owned by this agent,
 * with aggregate stats.
 */
export const GET = withAnyAuthParams(async (req: NextRequest, _actor, params) => {
  const { agentId } = await params;
  const { searchParams } = new URL(req.url);
  const cursor = searchParams.get('cursor') || undefined;
  const flowId = searchParams.get('flowId') || undefined;

  const agent = await prisma.user.findUnique({
    where: { id: agentId, isAgent: true },
    select: { id: true },
  });
  if (!agent) return notFound('Agent not found');

  const where = {
    flow: { agentId },
    ...(flowId ? { flowId } : {}),
  };

  const runs = await prisma.agentFlowRun.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: PAGE_SIZE + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    include: {
      flow: { select: { id: true, name: true } },
      triggerUser: { select: { id: true, displayName: true, avatar: true } },
    },
  });

  const hasMore = runs.length > PAGE_SIZE;
  const page = hasMore ? runs.slice(0, PAGE_SIZE) : runs;
  const nextCursor = hasMore ? page[page.length - 1].id : null;

  // Aggregate stats
  const [agg, successCount] = await Promise.all([
    prisma.agentFlowRun.aggregate({
      where,
      _count: { id: true },
      _sum: { tokensUsed: true, cost: true },
    }),
    prisma.agentFlowRun.count({ where: { ...where, status: 'success' } }),
  ]);

  const totalRuns = agg._count.id;
  const lastRun = page[0] ?? null;

  return ok({
    runs: page.map(r => ({
      id: r.id,
      flowId: r.flowId,
      flowName: r.flow.name,
      triggeredBy: r.triggeredBy,
      triggerUser: r.triggerUser,
      status: r.status,
      tokensUsed: r.tokensUsed,
      cost: r.cost,
      durationMs: r.durationMs,
      errorMessage: r.errorMessage,
      errorNodeId: r.errorNodeId,
      output: r.output,
      executionLog: r.executionLog,
      createdAt: r.createdAt.toISOString(),
      startedAt: r.startedAt?.toISOString() ?? null,
      completedAt: r.completedAt?.toISOString() ?? null,
    })),
    stats: {
      total: totalRuns,
      totalTokens: agg._sum.tokensUsed ?? 0,
      totalCost: agg._sum.cost ?? 0,
      successRate: totalRuns > 0 ? Math.round((successCount / totalRuns) * 100) : 0,
      lastRunAt: lastRun?.completedAt?.toISOString() ?? lastRun?.createdAt?.toISOString() ?? null,
      lastRunStatus: lastRun?.status ?? null,
    },
    pagination: { hasMore, nextCursor },
  });
});
