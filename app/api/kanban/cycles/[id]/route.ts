import { NextRequest } from 'next/server';
import prisma from '@/lib/db';
import { withAuthParams, AuthUser } from '@/lib/modules/api/middleware';
import { ok, badRequest, notFound } from '@/lib/modules/api/response';

const CYCLE_STATUSES = ['draft', 'upcoming', 'current', 'completed'];

// GET /api/kanban/cycles/[id]
export const GET = withAuthParams(async (
  req: NextRequest,
  user: AuthUser,
  params: Promise<Record<string, string>>
) => {
  const { id } = await params;

  const cycle = await prisma.cycle.findUnique({
    where: { id },
    include: {
      tasks: {
        select: {
          id: true,
          title: true,
          priority: true,
          completedAt: true,
          state: { select: { id: true, name: true, group: true } },
        },
      },
      _count: { select: { tasks: true } },
    },
  });

  if (!cycle) {
    return notFound('Cycle not found');
  }

  return ok(cycle);
});

// PATCH /api/kanban/cycles/[id]
export const PATCH = withAuthParams(async (
  req: NextRequest,
  user: AuthUser,
  params: Promise<Record<string, string>>
) => {
  const { id } = await params;
  const { name, description, startDate, endDate, status, isFavorite, archived, sortOrder } = await req.json();

  if (status !== undefined && !CYCLE_STATUSES.includes(status)) {
    return badRequest(`Invalid status. Must be one of: ${CYCLE_STATUSES.join(', ')}`);
  }

  const cycle = await prisma.cycle.update({
    where: { id },
    data: {
      ...(name !== undefined && { name }),
      ...(description !== undefined && { description }),
      ...(startDate !== undefined && { startDate: startDate ? new Date(startDate) : null }),
      ...(endDate !== undefined && { endDate: endDate ? new Date(endDate) : null }),
      ...(status !== undefined && { status }),
      ...(isFavorite !== undefined && { isFavorite }),
      ...(archived !== undefined && { archived }),
      ...(sortOrder !== undefined && { sortOrder }),
    },
  });

  return ok(cycle);
});

// DELETE /api/kanban/cycles/[id]
export const DELETE = withAuthParams(async (
  req: NextRequest,
  user: AuthUser,
  params: Promise<Record<string, string>>
) => {
  const { id } = await params;

  // Remove cycle reference from tasks (don't delete tasks)
  await prisma.task.updateMany({
    where: { cycleId: id },
    data: { cycleId: null },
  });

  await prisma.cycle.delete({
    where: { id },
  });

  return ok({ success: true });
});
