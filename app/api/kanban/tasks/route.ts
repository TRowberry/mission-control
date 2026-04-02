import { NextRequest } from 'next/server';
import prisma from '@/lib/db';
import { withAnyAuth, AuthActor, isAgent } from '@/lib/modules/api/middleware';
import { ok, created, badRequest, notFound, forbidden } from '@/lib/modules/api/response';
import { canModifyTask, canAccessProject } from '@/lib/modules/api/permissions';

// POST /api/kanban/tasks - Create task
export const POST = withAnyAuth(async (req: NextRequest, actor: AuthActor) => {
  const { title, description, columnId, priority, dueDate, assigneeId, subtasks, tags } = await req.json();

  if (!title || !columnId) {
    return badRequest('title and columnId required');
  }

  // Check permission for agents
  if (!await canModifyTask(actor, { columnId })) {
    return forbidden('No access to this project');
  }

  // Get max position in column
  const maxPos = await prisma.task.aggregate({
    where: { columnId },
    _max: { position: true },
  });

  const task = await prisma.task.create({
    data: {
      title,
      description,
      priority: priority || 'medium',
      position: (maxPos._max.position || 0) + 1,
      dueDate: dueDate ? new Date(dueDate) : null,
      columnId,
      createdById: actor.id,
      assigneeId,
      subtasks: subtasks ? {
        create: subtasks.map((s: { title: string; completed?: boolean }, i: number) => ({
          title: s.title,
          completed: s.completed || false,
          position: i,
        })),
      } : undefined,
    },
    include: {
      subtasks: { orderBy: { position: 'asc' } },
      tags: { include: { tag: true } },
      assignee: { select: { id: true, displayName: true, avatar: true } },
    },
  });

  return created(task);
});

// PATCH /api/kanban/tasks - Update task
export const PATCH = withAnyAuth(async (req: NextRequest, actor: AuthActor) => {
  const { id, title, description, columnId, priority, position, dueDate, assigneeId, archived, completedAt } = await req.json();

  if (!id) {
    return badRequest('id required');
  }

  // Check permission for agents
  if (!await canModifyTask(actor, { taskId: id })) {
    return forbidden('No access to this project');
  }

  const task = await prisma.task.update({
    where: { id },
    data: {
      ...(title !== undefined && { title }),
      ...(description !== undefined && { description }),
      ...(columnId !== undefined && { columnId }),
      ...(priority !== undefined && { priority }),
      ...(position !== undefined && { position }),
      ...(dueDate !== undefined && { dueDate: dueDate ? new Date(dueDate) : null }),
      ...(assigneeId !== undefined && { assigneeId }),
      ...(archived !== undefined && { archived }),
      ...(completedAt !== undefined && { completedAt: completedAt ? new Date(completedAt) : null }),
    },
    include: {
      subtasks: { orderBy: { position: 'asc' } },
      tags: { include: { tag: true } },
      assignee: { select: { id: true, displayName: true, avatar: true } },
    },
  });

  return ok(task);
});

// DELETE /api/kanban/tasks
export const DELETE = withAnyAuth(async (req: NextRequest, actor: AuthActor) => {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');

  if (!id) {
    return badRequest('id required');
  }

  // SECURITY: Verify ownership or admin role before deleting
  const task = await prisma.task.findUnique({
    where: { id },
    select: { createdById: true },
  });
  if (!task) {
    return notFound('Task not found');
  }
  
  // Check project access for agents
  if (!await canModifyTask(actor, { taskId: id })) {
    return forbidden('No access to this project');
  }
  
  // Check if actor owns the task or is an admin (for non-agents)
  if (!isAgent(actor)) {
    const isOwner = task.createdById === actor.id;
    const isAdmin = await prisma.workspaceMember.findFirst({
      where: { userId: actor.id, role: { in: ['owner', 'admin'] } },
    });
    
    if (!isOwner && !isAdmin) {
      return forbidden('Permission denied');
    }
  }

  await prisma.task.delete({ where: { id } });

  return ok({ success: true });
});

// PUT /api/kanban/tasks - Move task (drag and drop)
export const PUT = withAnyAuth(async (req: NextRequest, actor: AuthActor) => {
  const { taskId, sourceColumnId, destinationColumnId, newPosition } = await req.json();

  if (!taskId || !destinationColumnId || newPosition === undefined) {
    return badRequest('taskId, destinationColumnId, and newPosition required');
  }

  // Check permission for agents (check both source and destination columns)
  if (!await canModifyTask(actor, { taskId })) {
    return forbidden('No access to this project');
  }
  if (!await canModifyTask(actor, { columnId: destinationColumnId })) {
    return forbidden('No access to destination project');
  }

  // Get all tasks in destination column
  const tasksInColumn = await prisma.task.findMany({
    where: { columnId: destinationColumnId, archived: false },
    orderBy: { position: 'asc' },
  });

  // Filter out the moving task if it's in the same column
  const otherTasks = tasksInColumn.filter(t => t.id !== taskId);

  // Insert at new position
  const updates = [];
  
  // Update the moved task
  updates.push(
    prisma.task.update({
      where: { id: taskId },
      data: { columnId: destinationColumnId, position: newPosition },
    })
  );

  // Reorder other tasks
  let pos = 0;
  for (const task of otherTasks) {
    if (pos === newPosition) pos++; // Skip the position for moved task
    if (task.position !== pos) {
      updates.push(
        prisma.task.update({
          where: { id: task.id },
          data: { position: pos },
        })
      );
    }
    pos++;
  }

  await prisma.$transaction(updates);

  return ok({ success: true });
});
