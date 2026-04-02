import { NextRequest } from 'next/server';
import prisma from '@/lib/db';
import { withAuthParams, AuthUser } from '@/lib/modules/api/middleware';
import { ok, badRequest, notFound } from '@/lib/modules/api/response';

// GET /api/kanban/task-types/[id]
export const GET = withAuthParams(async (
  req: NextRequest,
  user: AuthUser,
  params: Promise<Record<string, string>>
) => {
  const { id } = await params;

  const taskType = await prisma.taskType.findUnique({
    where: { id },
    include: {
      _count: { select: { tasks: true } },
    },
  });

  if (!taskType) {
    return notFound('Task type not found');
  }

  return ok(taskType);
});

// PATCH /api/kanban/task-types/[id]
export const PATCH = withAuthParams(async (
  req: NextRequest,
  user: AuthUser,
  params: Promise<Record<string, string>>
) => {
  const { id } = await params;
  const { name, icon, color, description, isDefault, position } = await req.json();

  const taskType = await prisma.taskType.update({
    where: { id },
    data: {
      ...(name !== undefined && { name }),
      ...(icon !== undefined && { icon }),
      ...(color !== undefined && { color }),
      ...(description !== undefined && { description }),
      ...(isDefault !== undefined && { isDefault }),
      ...(position !== undefined && { position }),
    },
  });

  return ok(taskType);
});

// DELETE /api/kanban/task-types/[id]
export const DELETE = withAuthParams(async (
  req: NextRequest,
  user: AuthUser,
  params: Promise<Record<string, string>>
) => {
  const { id } = await params;

  // Check if any tasks use this type
  const taskCount = await prisma.task.count({
    where: { typeId: id },
  });

  if (taskCount > 0) {
    return badRequest(`Cannot delete: ${taskCount} tasks use this type`);
  }

  await prisma.taskType.delete({
    where: { id },
  });

  return ok({ success: true });
});
