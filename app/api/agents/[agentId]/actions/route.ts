import { NextRequest } from 'next/server';
import prisma from '@/lib/db';
import { withAuthParams } from '@/lib/modules/api/middleware';
import { ok, notFound } from '@/lib/modules/api/response';

const PAGE_SIZE = 25;

/**
 * GET /api/agents/[agentId]/actions
 * List agent action logs with stats and cursor pagination
 */
export const GET = withAuthParams(async (req: NextRequest, _user, params) => {
  const { agentId } = await params;
  const { searchParams } = new URL(req.url);
  const cursor = searchParams.get('cursor') || undefined;

  const agent = await prisma.user.findUnique({
    where: { id: agentId, isAgent: true },
    select: { id: true },
  });
  if (!agent) return notFound('Agent not found');

  const actions = await prisma.agentActionLog.findMany({
    where: { agentId },
    orderBy: { createdAt: 'desc' },
    take: PAGE_SIZE + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    select: {
      id: true,
      actionType: true,
      targetId: true,
      payload: true,
      status: true,
      tokensUsed: true,
      cost: true,
      errorMessage: true,
      approvedBy: {
        select: { id: true, displayName: true, avatar: true },
      },
      approvedAt: true,
      createdAt: true,
      executedAt: true,
    },
  });

  const hasMore = actions.length > PAGE_SIZE;
  const page = hasMore ? actions.slice(0, PAGE_SIZE) : actions;
  const nextCursor = hasMore ? page[page.length - 1].id : null;

  // Stats
  const byTypeRaw = await prisma.agentActionLog.groupBy({
    by: ['actionType'],
    where: { agentId },
    _count: { id: true },
  });
  const byStatusRaw = await prisma.agentActionLog.groupBy({
    by: ['status'],
    where: { agentId },
    _count: { id: true },
  });
  const total = await prisma.agentActionLog.count({ where: { agentId } });

  const stats = {
    total,
    byType: Object.fromEntries(byTypeRaw.map(r => [r.actionType, r._count.id])),
    byStatus: Object.fromEntries(byStatusRaw.map(r => [r.status, r._count.id])),
  };

  return ok({
    actions: page.map(a => ({
      ...a,
      payload: a.payload ? JSON.parse(a.payload) : null,
      createdAt: a.createdAt.toISOString(),
      executedAt: a.executedAt?.toISOString() ?? null,
      approvedAt: a.approvedAt?.toISOString() ?? null,
    })),
    stats,
    pagination: { hasMore, nextCursor },
  });
});
