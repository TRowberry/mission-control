import { NextRequest } from 'next/server';
import prisma from '@/lib/db';
import { withAuthParams, AuthUser } from '@/lib/modules/api/middleware';
import { ok, badRequest, notFound } from '@/lib/modules/api/response';

const STATE_GROUPS = ['backlog', 'unstarted', 'started', 'completed', 'cancelled'];

// GET /api/kanban/states/[id]
export const GET = withAuthParams(async (
  req: NextRequest,
  user: AuthUser,
  params: Promise<Record<string, string>>
) => {
  const { id } = await params;

  const state = await prisma.state.findUnique({
    where: { id },
    include: {
      _count: { select: { tasks: true } },
    },
  });

  if (!state) {
    return notFound('State not found');
  }

  return ok(state);
});

// PATCH /api/kanban/states/[id]
export const PATCH = withAuthParams(async (
  req: NextRequest,
  user: AuthUser,
  params: Promise<Record<string, string>>
) => {
  const { id } = await params;
  const { name, group, color, description, isDefault, position } = await req.json();

  if (group !== undefined && !STATE_GROUPS.includes(group)) {
    return badRequest(`Invalid group. Must be one of: ${STATE_GROUPS.join(', ')}`);
  }

  const state = await prisma.state.update({
    where: { id },
    data: {
      ...(name !== undefined && { name }),
      ...(group !== undefined && { group }),
      ...(color !== undefined && { color }),
      ...(description !== undefined && { description }),
      ...(isDefault !== undefined && { isDefault }),
      ...(position !== undefined && { position }),
    },
  });

  return ok(state);
});

// DELETE /api/kanban/states/[id]
export const DELETE = withAuthParams(async (
  req: NextRequest,
  user: AuthUser,
  params: Promise<Record<string, string>>
) => {
  const { id } = await params;

  // Check if any tasks use this state
  const taskCount = await prisma.task.count({
    where: { stateId: id },
  });

  if (taskCount > 0) {
    return badRequest(`Cannot delete: ${taskCount} tasks use this state`);
  }

  await prisma.state.delete({
    where: { id },
  });

  return ok({ success: true });
});
