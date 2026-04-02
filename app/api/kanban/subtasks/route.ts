import { NextRequest } from 'next/server';
import prisma from '@/lib/db';
import { Prisma } from '@prisma/client';
import { withAnyAuth, AuthActor } from '@/lib/modules/api/middleware';
import { ok, created, badRequest, forbidden } from '@/lib/modules/api/response';
import { canModifyTask } from '@/lib/modules/api/permissions';

// Helper to log activity
async function logActivity(
  userId: string,
  type: string,
  projectId: string,
  taskId?: string,
  data?: Record<string, unknown>
) {
  try {
    await prisma.activity.create({
      data: {
        type,
        data: data ? (data as Prisma.InputJsonValue) : Prisma.JsonNull,
        userId,
        projectId,
        taskId: taskId || null,
      },
    });
  } catch (error) {
    console.error('Failed to log activity:', error);
  }
}

// POST /api/kanban/subtasks - Create subtask
export const POST = withAnyAuth(async (req: NextRequest, actor: AuthActor) => {
  const { taskId, title } = await req.json();

  if (!taskId || !title) {
    return badRequest('taskId and title required');
  }

  // Check permission
  if (!await canModifyTask(actor, { taskId })) {
    return forbidden('No access to this project');
  }

  const maxPos = await prisma.subtask.aggregate({
    where: { taskId },
    _max: { position: true },
  });

  const subtask = await prisma.subtask.create({
    data: {
      title,
      taskId,
      position: (maxPos._max.position || 0) + 1,
    },
  });

  return created(subtask);
});

// PATCH /api/kanban/subtasks - Update subtask
export const PATCH = withAnyAuth(async (req: NextRequest, actor: AuthActor) => {
  console.log('[Subtask PATCH] Actor:', JSON.stringify(actor));
  console.log('[Subtask PATCH] isAgent check:', 'isAgent' in actor ? (actor as any).isAgent : 'no isAgent prop');
  
  const { id, title, completed } = await req.json();

  if (!id) {
    return badRequest('id required');
  }

  // Get existing subtask with task info for activity
  const existing = await prisma.subtask.findUnique({
    where: { id },
    include: {
      task: {
        include: {
          column: { select: { projectId: true } },
        },
      },
    },
  });

  if (!existing) {
    return badRequest('Subtask not found');
  }

  console.log('[Subtask PATCH] Subtask taskId:', existing.taskId);
  console.log('[Subtask PATCH] Task projectId:', existing.task.column.projectId);

  // Check permission
  const canModify = await canModifyTask(actor, { taskId: existing.taskId });
  console.log('[Subtask PATCH] canModifyTask result:', canModify);
  
  if (!canModify) {
    return forbidden('No access to this project');
  }

  const subtask = await prisma.subtask.update({
    where: { id },
    data: {
      ...(title !== undefined && { title }),
      ...(completed !== undefined && { completed }),
    },
  });

  // Log activity when subtask is completed
  if (existing && completed === true && !existing.completed) {
    await logActivity(
      actor.id,
      'subtask_completed',
      existing.task.column.projectId,
      existing.taskId,
      {
        subtaskTitle: existing.title,
        taskTitle: existing.task.title,
      }
    );
  }

  return ok(subtask);
});

// DELETE /api/kanban/subtasks
export const DELETE = withAnyAuth(async (req: NextRequest, actor: AuthActor) => {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');

  if (!id) {
    return badRequest('id required');
  }

  // Get subtask to check permission
  const subtask = await prisma.subtask.findUnique({
    where: { id },
    select: { taskId: true },
  });

  if (!subtask) {
    return badRequest('Subtask not found');
  }

  // Check permission
  if (!await canModifyTask(actor, { taskId: subtask.taskId })) {
    return forbidden('No access to this project');
  }

  await prisma.subtask.delete({ where: { id } });

  return ok({ success: true });
});
