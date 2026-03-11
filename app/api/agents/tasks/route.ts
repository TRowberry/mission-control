import { NextRequest } from 'next/server';
import prisma from '@/lib/db';
import { withAgent, AuthAgent } from '@/lib/modules/api/middleware';
import { ok, badRequest, notFound, forbidden } from '@/lib/modules/api/response';

/**
 * PATCH /api/agents/tasks
 * 
 * Update a task assigned to the agent.
 * 
 * Body:
 *   - taskId: Task ID to update (required)
 *   - title: New title (optional)
 *   - description: New description (optional)
 *   - priority: low | medium | high | urgent (optional)
 *   - dueDate: ISO date string or null (optional)
 *   - startDate: ISO date string or null (optional)
 *   - estimate: Story points/hours (optional)
 *   - columnId: Move to column (optional)
 *   - completed: Mark complete/incomplete (optional)
 *   - stateId: Set state ID (optional)
 *   - subtasks: Array of subtask updates (optional)
 *     - id: Subtask ID (required)
 *     - completed: boolean (required)
 * 
 * Headers:
 *   - X-API-Key: Agent's API key
 */
export const PATCH = withAgent(async (req: NextRequest, agent: AuthAgent) => {
  const body = await req.json();
  const { taskId, subtasks, ...updates } = body;

  if (!taskId) {
    return badRequest('taskId is required');
  }

  // Verify task exists and agent has access (assigned to them)
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: {
      id: true,
      assigneeId: true,
      columnId: true,
      column: {
        select: {
          project: {
            select: {
              id: true,
            },
          },
        },
      },
      subtasks: {
        select: {
          id: true,
        },
      },
    },
  });

  if (!task) {
    return notFound('Task not found');
  }

  // Security: Only allow agents to update tasks assigned to them
  if (task.assigneeId !== agent.id) {
    return forbidden('You can only update tasks assigned to you');
  }

  // Build task update data
  const taskUpdateData: Record<string, unknown> = {};

  // Handle simple field updates
  if (updates.title !== undefined) {
    taskUpdateData.title = updates.title;
  }
  if (updates.description !== undefined) {
    taskUpdateData.description = updates.description;
  }
  if (updates.priority !== undefined) {
    const validPriorities = ['low', 'medium', 'high', 'urgent'];
    if (!validPriorities.includes(updates.priority)) {
      return badRequest('Invalid priority. Must be: low, medium, high, or urgent');
    }
    taskUpdateData.priority = updates.priority;
  }
  if (updates.dueDate !== undefined) {
    taskUpdateData.dueDate = updates.dueDate ? new Date(updates.dueDate) : null;
  }
  if (updates.startDate !== undefined) {
    taskUpdateData.startDate = updates.startDate ? new Date(updates.startDate) : null;
  }
  if (updates.estimate !== undefined) {
    taskUpdateData.estimate = updates.estimate;
  }
  if (updates.stateId !== undefined) {
    taskUpdateData.stateId = updates.stateId;
  }
  if (updates.columnId !== undefined) {
    // Verify the column exists and belongs to the same project
    const column = await prisma.column.findUnique({
      where: { id: updates.columnId },
      select: { id: true, projectId: true },
    });
    if (!column) {
      return badRequest('Invalid columnId');
    }
    if (column.projectId !== task.column.project.id) {
      return forbidden('Cannot move task to a column in a different project');
    }
    taskUpdateData.columnId = updates.columnId;
  }

  // Handle completion status
  if (updates.completed !== undefined) {
    if (updates.completed) {
      taskUpdateData.completedAt = new Date();
    } else {
      taskUpdateData.completedAt = null;
    }
  }

  // Handle subtask updates
  const subtaskResults: { id: string; completed: boolean }[] = [];
  
  if (subtasks && Array.isArray(subtasks)) {
    // Get valid subtask IDs for this task
    const validSubtaskIds = new Set(task.subtasks.map(s => s.id));

    for (const subtaskUpdate of subtasks) {
      // Validate subtask update structure
      if (!subtaskUpdate.id) {
        return badRequest('Each subtask update must have an id');
      }
      if (typeof subtaskUpdate.completed !== 'boolean') {
        return badRequest('Each subtask update must have a boolean completed field');
      }

      // Validate subtask belongs to this task
      if (!validSubtaskIds.has(subtaskUpdate.id)) {
        return badRequest(`Subtask ${subtaskUpdate.id} does not belong to this task`);
      }

      // Update the subtask
      await prisma.subtask.update({
        where: { id: subtaskUpdate.id },
        data: { completed: subtaskUpdate.completed },
      });

      subtaskResults.push({
        id: subtaskUpdate.id,
        completed: subtaskUpdate.completed,
      });
    }
  }

  // Update the task if there are any task-level changes
  let updatedTask;
  if (Object.keys(taskUpdateData).length > 0) {
    updatedTask = await prisma.task.update({
      where: { id: taskId },
      data: taskUpdateData,
      select: {
        id: true,
        title: true,
        description: true,
        priority: true,
        dueDate: true,
        startDate: true,
        estimate: true,
        completedAt: true,
        columnId: true,
        stateId: true,
        state: {
          select: {
            id: true,
            name: true,
            group: true,
          },
        },
        subtasks: {
          select: {
            id: true,
            title: true,
            completed: true,
            position: true,
          },
          orderBy: { position: 'asc' },
        },
      },
    });
  } else {
    // Just fetch the current task state if only subtasks were updated
    updatedTask = await prisma.task.findUnique({
      where: { id: taskId },
      select: {
        id: true,
        title: true,
        description: true,
        priority: true,
        dueDate: true,
        startDate: true,
        estimate: true,
        completedAt: true,
        columnId: true,
        stateId: true,
        state: {
          select: {
            id: true,
            name: true,
            group: true,
          },
        },
        subtasks: {
          select: {
            id: true,
            title: true,
            completed: true,
            position: true,
          },
          orderBy: { position: 'asc' },
        },
      },
    });
  }

  return ok({
    task: updatedTask,
    subtasksUpdated: subtaskResults.length,
  });
});
