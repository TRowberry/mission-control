import { NextRequest } from 'next/server';
import prisma from '@/lib/db';
import { withAuth, AuthUser } from '@/lib/modules/api/middleware';
import { ok, created, badRequest } from '@/lib/modules/api/response';

const CYCLE_STATUSES = ['draft', 'upcoming', 'current', 'completed'];

// GET /api/kanban/cycles?projectId=xxx
export const GET = withAuth(async (req: NextRequest, user: AuthUser) => {
  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get('projectId');
  const status = searchParams.get('status');

  if (!projectId) {
    return badRequest('projectId is required');
  }

  const cycles = await prisma.cycle.findMany({
    where: {
      projectId,
      archived: false,
      ...(status && { status }),
    },
    orderBy: [{ status: 'asc' }, { startDate: 'asc' }],
    include: {
      _count: { select: { tasks: true } },
    },
  });

  return ok(cycles);
});

// POST /api/kanban/cycles
export const POST = withAuth(async (req: NextRequest, user: AuthUser) => {
  const { projectId, name, description, startDate, endDate, status } = await req.json();

  if (!projectId || !name) {
    return badRequest('projectId and name are required');
  }

  if (status && !CYCLE_STATUSES.includes(status)) {
    return badRequest(`Invalid status. Must be one of: ${CYCLE_STATUSES.join(', ')}`);
  }

  // Get max sortOrder
  const maxOrder = await prisma.cycle.aggregate({
    where: { projectId },
    _max: { sortOrder: true },
  });

  const cycle = await prisma.cycle.create({
    data: {
      projectId,
      ownerId: user.id,
      name,
      description: description || null,
      startDate: startDate ? new Date(startDate) : null,
      endDate: endDate ? new Date(endDate) : null,
      status: status || 'draft',
      sortOrder: (maxOrder._max.sortOrder || 0) + 1,
    },
  });

  return created(cycle);
});
