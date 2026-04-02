import { NextRequest } from 'next/server';
import prisma from '@/lib/db';
import { withAuthParams, AuthUser } from '@/lib/modules/api/middleware';
import { ok, created, badRequest, notFound } from '@/lib/modules/api/response';

const MODULE_STATUSES = ['backlog', 'planned', 'in-progress', 'paused', 'completed', 'cancelled'];

// GET /api/kanban/modules/[id]
export const GET = withAuthParams(async (
  req: NextRequest,
  user: AuthUser,
  params: Promise<Record<string, string>>
) => {
  const { id } = await params;

  const module = await prisma.module.findUnique({
    where: { id },
    include: {
      tasks: {
        select: {
          task: {
            select: {
              id: true,
              title: true,
              priority: true,
              completedAt: true,
              state: { select: { id: true, name: true, group: true } },
            },
          },
        },
      },
      _count: { select: { tasks: true } },
    },
  });

  if (!module) {
    return notFound('Module not found');
  }

  // Flatten tasks
  const result = {
    ...module,
    tasks: module.tasks.map((tm) => tm.task),
  };

  return ok(result);
});

// PATCH /api/kanban/modules/[id]
export const PATCH = withAuthParams(async (
  req: NextRequest,
  user: AuthUser,
  params: Promise<Record<string, string>>
) => {
  const { id } = await params;
  const { name, description, startDate, targetDate, status, isFavorite, archived, leadId, sortOrder } = await req.json();

  if (status !== undefined && !MODULE_STATUSES.includes(status)) {
    return badRequest(`Invalid status. Must be one of: ${MODULE_STATUSES.join(', ')}`);
  }

  const module = await prisma.module.update({
    where: { id },
    data: {
      ...(name !== undefined && { name }),
      ...(description !== undefined && { description }),
      ...(startDate !== undefined && { startDate: startDate ? new Date(startDate) : null }),
      ...(targetDate !== undefined && { targetDate: targetDate ? new Date(targetDate) : null }),
      ...(status !== undefined && { status }),
      ...(isFavorite !== undefined && { isFavorite }),
      ...(archived !== undefined && { archived }),
      ...(leadId !== undefined && { leadId }),
      ...(sortOrder !== undefined && { sortOrder }),
    },
  });

  return ok(module);
});

// DELETE /api/kanban/modules/[id]
export const DELETE = withAuthParams(async (
  req: NextRequest,
  user: AuthUser,
  params: Promise<Record<string, string>>
) => {
  const { id } = await params;

  // Delete TaskModule relations first
  await prisma.taskModule.deleteMany({
    where: { moduleId: id },
  });

  await prisma.module.delete({
    where: { id },
  });

  return ok({ success: true });
});

// POST /api/kanban/modules/[id]/tasks - Add task to module
export const POST = withAuthParams(async (
  req: NextRequest,
  user: AuthUser,
  params: Promise<Record<string, string>>
) => {
  const { id: moduleId } = await params;
  const { taskId } = await req.json();

  if (!taskId) {
    return badRequest('taskId is required');
  }

  // Check if already exists
  const existing = await prisma.taskModule.findUnique({
    where: { taskId_moduleId: { taskId, moduleId } },
  });

  if (existing) {
    return ok({ message: 'Task already in module' });
  }

  const taskModule = await prisma.taskModule.create({
    data: { taskId, moduleId },
  });

  // Update module counters
  await updateModuleCounters(moduleId);

  return created(taskModule);
});

async function updateModuleCounters(moduleId: string) {
  const tasks = await prisma.taskModule.findMany({
    where: { moduleId },
    include: {
      task: { select: { completedAt: true } },
    },
  });

  const totalIssues = tasks.length;
  const completedIssues = tasks.filter((tm) => tm.task.completedAt !== null).length;

  await prisma.module.update({
    where: { id: moduleId },
    data: { totalIssues, completedIssues },
  });
}
