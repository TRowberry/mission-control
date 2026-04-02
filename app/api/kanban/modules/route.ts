import { NextRequest } from 'next/server';
import prisma from '@/lib/db';
import { withAuth, AuthUser } from '@/lib/modules/api/middleware';
import { ok, created, badRequest } from '@/lib/modules/api/response';

const MODULE_STATUSES = ['backlog', 'planned', 'in-progress', 'paused', 'completed', 'cancelled'];

// GET /api/kanban/modules?projectId=xxx
export const GET = withAuth(async (req: NextRequest, user: AuthUser) => {
  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get('projectId');
  const status = searchParams.get('status');

  if (!projectId) {
    return badRequest('projectId is required');
  }

  const modules = await prisma.module.findMany({
    where: {
      projectId,
      archived: false,
      ...(status && { status }),
    },
    orderBy: { sortOrder: 'asc' },
    include: {
      _count: { select: { tasks: true } },
    },
  });

  return ok(modules);
});

// POST /api/kanban/modules
export const POST = withAuth(async (req: NextRequest, user: AuthUser) => {
  const { projectId, name, description, startDate, targetDate, status, leadId } = await req.json();

  if (!projectId || !name) {
    return badRequest('projectId and name are required');
  }

  if (status && !MODULE_STATUSES.includes(status)) {
    return badRequest(`Invalid status. Must be one of: ${MODULE_STATUSES.join(', ')}`);
  }

  // Get max sortOrder
  const maxOrder = await prisma.module.aggregate({
    where: { projectId },
    _max: { sortOrder: true },
  });

  const module = await prisma.module.create({
    data: {
      projectId,
      name,
      description: description || null,
      startDate: startDate ? new Date(startDate) : null,
      targetDate: targetDate ? new Date(targetDate) : null,
      status: status || 'backlog',
      leadId: leadId || null,
      sortOrder: (maxOrder._max.sortOrder || 0) + 1,
    },
  });

  return created(module);
});
