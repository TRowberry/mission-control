import { NextRequest } from 'next/server';
import prisma from '@/lib/db';
import { withAnyAuthParams } from '@/lib/modules/api/middleware';
import { ok, notFound } from '@/lib/modules/api/response';

const PAGE_SIZE = 25;

/**
 * GET /api/agents/[agentId]/runs
 * List agent run history with stats and cursor pagination
 */
export const GET = withAnyAuthParams(async (req: NextRequest, _actor, params) => {
  const { agentId } = await params;
  const { searchParams } = new URL(req.url);
  const cursor = searchParams.get('cursor') || undefined;

  const agent = await prisma.user.findUnique({
    where: { id: agentId, isAgent: true },
    select: { id: true },
  });
  if (!agent) return notFound('Agent not found');

  // Fetch one extra to determine hasMore
  const runs = await prisma.agentRun.findMany({
    where: { agentId },
    orderBy: { createdAt: 'desc' },
    take: PAGE_SIZE + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    select: {
      id: true,
      triggeredBy: true,
      triggerUser: {
        select: { id: true, displayName: true, avatar: true },
      },
      status: true,
      actionsCount: true,
      actionsRun: true,
      actionsFailed: true,
      tokensUsed: true,
      cost: true,
      durationMs: true,
      input: true,
      output: true,
      createdAt: true,
      startedAt: true,
      completedAt: true,
    },
  });

  const hasMore = runs.length > PAGE_SIZE;
  const page = hasMore ? runs.slice(0, PAGE_SIZE) : runs;
  const nextCursor = hasMore ? page[page.length - 1].id : null;

  // Stats (aggregate, not paginated)
  const [agg, last24h, last7d] = await Promise.all([
    prisma.agentRun.aggregate({
      where: { agentId },
      _count: { id: true },
      _sum: { tokensUsed: true, cost: true },
    }),
    prisma.agentRun.aggregate({
      where: { agentId, createdAt: { gte: new Date(Date.now() - 86400_000) } },
      _count: { id: true },
      _sum: { tokensUsed: true, cost: true },
    }),
    prisma.agentRun.aggregate({
      where: { agentId, createdAt: { gte: new Date(Date.now() - 7 * 86400_000) } },
      _count: { id: true },
      _sum: { tokensUsed: true, cost: true },
    }),
  ]);

  const totalRuns = agg._count.id;
  const successCount = await prisma.agentRun.count({
    where: { agentId, status: { in: ['completed', 'success'] } },
  });
  const lastRun = page[0] ?? null;

  const stats = {
    total: totalRuns,
    totalTokens: agg._sum.tokensUsed ?? 0,
    totalCost: agg._sum.cost ?? 0,
    lastRunAt: lastRun?.completedAt?.toISOString() ?? lastRun?.createdAt?.toISOString() ?? null,
    lastRunStatus: lastRun?.status ?? null,
    successRate: totalRuns > 0 ? Math.round((successCount / totalRuns) * 100) : 0,
    last24h: {
      runs: last24h._count.id,
      tokens: last24h._sum.tokensUsed ?? 0,
      cost: last24h._sum.cost ?? 0,
    },
    last7d: {
      runs: last7d._count.id,
      tokens: last7d._sum.tokensUsed ?? 0,
      cost: last7d._sum.cost ?? 0,
    },
  };

  return ok({
    runs: page.map(r => ({
      ...r,
      createdAt: r.createdAt.toISOString(),
      startedAt: r.startedAt?.toISOString() ?? null,
      completedAt: r.completedAt?.toISOString() ?? null,
    })),
    stats,
    pagination: { hasMore, nextCursor },
  });
});
