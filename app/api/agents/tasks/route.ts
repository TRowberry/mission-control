import { NextRequest } from 'next/server';
import prisma from '@/lib/db';
import { withAgent, AuthAgent } from '@/lib/modules/api/middleware';
import { ok, badRequest, notFound, forbidden, serverError, created } from '@/lib/modules/api/response';
import { canAccessProject } from '@/lib/modules/api/permissions';

// Valid priority values
const VALID_PRIORITIES = ['none', 'low', 'medium', 'high', 'urgent'];

/**
 * GET /api/agents/tasks
 * 
 * List tasks assigned to this agent.
 * 
 * Query params:
 *   - projectId: filter by project
 *   - status: filter by column name (e.g., "To Do", "In Progress", "Done")
 *   - limit: max tasks to return (default 50, max 100)
 * 
 * Headers:
 *   - X-API-Key: Agent's API key
 */
export const GET = withAgent(async (request: NextRequest, agent: AuthAgent) => {
  try {
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get('projectId');
    const status = searchParams.get('status');
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100);

    // Build where clause
    const where: any = {
      assigneeId: agent.id,
      archived: false,
    };

    if (projectId) {
      where.column = { projectId };
    }

    if (status) {
      where.column = {
        ...where.column,
        name: { contains: status, mode: 'insensitive' },
      };
    }

    // Get tasks assigned to this agent
    const tasks = await prisma.task.findMany({
      where,
      include: {
        column: {
          select: {
            id: true,
            name: true,
            position: true,
            project: {
              select: {
                id: true,
                name: true,
                color: true,
              },
            },
          },
        },
        subtasks: {
          orderBy: { position: 'asc' },
          select: {
            id: true,
            title: true,
            completed: true,
            position: true,
          },
        },
        tags: {
          include: {
            tag: {
              select: {
                id: true,
                name: true,
                color: true,
              },
            },
          },
        },
        type: {
          select: {
            id: true,
            name: true,
            icon: true,
            color: true,
          },
        },
        state: {
          select: {
            id: true,
            name: true,
            group: true,
            color: true,
          },
        },
        cycle: {
          select: {
            id: true,
            name: true,
            status: true,
          },
        },
        parent: {
          select: {
            id: true,
            title: true,
          },
        },
        children: {
          select: {
            id: true,
            title: true,
            completedAt: true,
          },
        },
        createdBy: {
          select: {
            id: true,
            displayName: true,
            avatar: true,
          },
        },
      },
      orderBy: [
        { priority: 'desc' }, // urgent first
        { dueDate: 'asc' },   // nearest due date
        { createdAt: 'desc' },
      ],
      take: limit,
    });

    // Transform tasks for response
    const formattedTasks = tasks.map(task => ({
      id: task.id,
      title: task.title,
      description: task.description,
      priority: task.priority,
      dueDate: task.dueDate?.toISOString() || null,
      startDate: task.startDate?.toISOString() || null,
      completedAt: task.completedAt?.toISOString() || null,
      estimate: task.estimate,
      position: task.position,
      isDraft: task.isDraft,
      createdAt: task.createdAt.toISOString(),
      updatedAt: task.updatedAt.toISOString(),
      // Column/Status
      columnId: task.columnId,
      columnName: task.column.name,
      // Project
      projectId: task.column.project.id,
      projectName: task.column.project.name,
      projectColor: task.column.project.color,
      // Related data
      subtasks: task.subtasks,
      subtaskProgress: {
        total: task.subtasks.length,
        completed: task.subtasks.filter(s => s.completed).length,
      },
      tags: task.tags.map(t => t.tag),
      type: task.type,
      state: task.state,
      cycle: task.cycle,
      parent: task.parent,
      children: task.children,
      createdBy: task.createdBy,
    }));

    return ok({
      tasks: formattedTasks,
      total: formattedTasks.length,
      agentId: agent.id,
      serverTime: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[Agent Tasks] Error fetching tasks:', error);
    return serverError('Failed to fetch tasks', error);
  }
});

/**
 * POST /api/agents/tasks
 * 
 * Create a new task in a project the agent has access to.
 * 
 * Body:
 *   - title: required - task title
 *   - columnId: required - column to create task in
 *   - description: optional - task description
 *   - priority: optional - "none", "low", "medium", "high", "urgent" (default: "medium")
 *   - dueDate: optional - ISO string
 *   - assigneeId: optional - defaults to the agent creating the task
 *   - subtasks: optional - array of {title: string, completed?: boolean}
 * 
 * Headers:
 *   - X-API-Key: Agent's API key
 */
export const POST = withAgent(async (request: NextRequest, agent: AuthAgent) => {
  try {
    const body = await request.json();
    const { 
      title, 
      columnId, 
      description, 
      priority = 'medium', 
      dueDate,
      assigneeId,
      subtasks,
    } = body;

    // Validate required fields
    if (!title || !columnId) {
      return badRequest('title and columnId are required');
    }

    // Validate priority if provided
    if (priority && !VALID_PRIORITIES.includes(priority)) {
      return badRequest(`Invalid priority. Must be one of: ${VALID_PRIORITIES.join(', ')}`);
    }

    // Get the column and verify agent has access to the project
    const column = await prisma.column.findUnique({
      where: { id: columnId },
      select: { id: true, projectId: true, name: true },
    });

    if (!column) {
      return notFound('Column not found');
    }

    // Check agent has access to this project
    const hasAccess = await canAccessProject({ id: agent.id, isAgent: true } as any, column.projectId);
    if (!hasAccess) {
      return forbidden('No access to this project');
    }

    // Get max position in column for ordering
    const maxPosition = await prisma.task.aggregate({
      where: { columnId },
      _max: { position: true },
    });

    // Create the task
    const task = await prisma.task.create({
      data: {
        title,
        description: description || null,
        priority,
        position: (maxPosition._max.position ?? -1) + 1,
        dueDate: dueDate ? new Date(dueDate) : null,
        columnId,
        createdById: agent.id,
        assigneeId: assigneeId || agent.id, // Default to agent if not specified
        subtasks: subtasks ? {
          create: subtasks.map((s: { title: string; completed?: boolean }, i: number) => ({
            title: s.title,
            completed: s.completed || false,
            position: i,
          })),
        } : undefined,
      },
      include: {
        column: {
          select: {
            id: true,
            name: true,
            project: {
              select: {
                id: true,
                name: true,
                color: true,
              },
            },
          },
        },
        subtasks: {
          orderBy: { position: 'asc' },
          select: {
            id: true,
            title: true,
            completed: true,
            position: true,
          },
        },
        assignee: {
          select: {
            id: true,
            displayName: true,
            avatar: true,
          },
        },
      },
    });

    // Log activity
    try {
      await prisma.activity.create({
        data: {
          type: 'task_created',
          data: {
            agentCreated: true,
            agentName: agent.displayName,
            taskTitle: title,
          },
          userId: agent.id,
          projectId: column.projectId,
          taskId: task.id,
        },
      });
    } catch (err) {
      console.error('[Agent Tasks] Failed to log activity:', err);
    }

    console.log(`[Agent Tasks] Agent ${agent.username} created task "${title}" in ${column.name}`);

    return created({
      success: true,
      task: {
        id: task.id,
        title: task.title,
        description: task.description,
        priority: task.priority,
        position: task.position,
        dueDate: task.dueDate?.toISOString() || null,
        columnId: task.columnId,
        columnName: task.column.name,
        projectId: task.column.project.id,
        projectName: task.column.project.name,
        subtasks: task.subtasks,
        assignee: task.assignee,
        createdAt: task.createdAt.toISOString(),
      },
    });
  } catch (error) {
    console.error('[Agent Tasks] Error creating task:', error);
    return serverError('Failed to create task', error);
  }
});

/**
 * PATCH /api/agents/tasks
 * 
 * Update a task assigned to this agent.
 * Agent can only update tasks they are assigned to.
 * 
 * Body:
 *   - taskId: required
 *   - title: update task title
 *   - description: update description (string or null)
 *   - priority: set priority ("none", "low", "medium", "high", "urgent")
 *   - dueDate: set due date (ISO string or null)
 *   - startDate: set start date (ISO string or null)
 *   - estimate: set time estimate in hours (number or null)
 *   - columnId: move to different column
 *   - completed: mark as completed (true) or uncompleted (false)
 *   - stateId: change workflow state (string or null)
 *   - subtasks: array of subtask operations:
 *       - Updates: {id: string, completed: boolean} - update existing subtask
 *       - Creates: {title: string, completed?: boolean} - create new subtask (requires canCreateSubtasks)
 * 
 * Headers:
 *   - X-API-Key: Agent's API key
 */
export const PATCH = withAgent(async (request: NextRequest, agent: AuthAgent) => {
  try {
    const body = await request.json();
    const { 
      taskId, 
      title,
      description,
      priority,
      dueDate,
      startDate,
      estimate,
      columnId, 
      completed, 
      stateId,
      subtasks,
    } = body;

    if (!taskId) {
      return badRequest('taskId is required');
    }

    // Validate priority if provided
    if (priority !== undefined && !VALID_PRIORITIES.includes(priority)) {
      return badRequest(`Invalid priority. Must be one of: ${VALID_PRIORITIES.join(', ')}`);
    }

    // Validate subtasks array if provided
    if (subtasks !== undefined) {
      if (!Array.isArray(subtasks)) {
        return badRequest('subtasks must be an array');
      }
      for (const subtask of subtasks) {
        // Must have either id (update) or title (create)
        if (!subtask.id && !subtask.title) {
          return badRequest('Each subtask must have either an id (for updates) or a title (for creation)');
        }
        // If updating, must have completed boolean
        if (subtask.id && typeof subtask.completed !== 'boolean') {
          return badRequest('Subtask updates must have a boolean completed field');
        }
        // If creating, must have title
        if (!subtask.id && typeof subtask.title !== 'string') {
          return badRequest('New subtasks must have a title string');
        }
      }
    }

    // Get existing task and verify agent is the assignee
    const existingTask = await prisma.task.findUnique({
      where: { id: taskId },
      include: {
        column: {
          select: {
            id: true,
            name: true,
            projectId: true,
          },
        },
        subtasks: {
          select: {
            id: true,
          },
        },
      },
    });

    if (!existingTask) {
      return notFound('Task not found');
    }

    if (existingTask.assigneeId !== agent.id) {
      return forbidden('You can only update tasks assigned to you');
    }

    // Get agent config for capability checks
    const agentConfig = await prisma.agentConfig.findUnique({
      where: { userId: agent.id },
      select: { canCreateSubtasks: true },
    });

    // Build update data
    const updateData: any = {};

    // Title
    if (title !== undefined) {
      updateData.title = title;
    }

    // Description (can be null to clear)
    if (description !== undefined) {
      updateData.description = description;
    }

    // Priority
    if (priority !== undefined) {
      updateData.priority = priority;
    }

    // Due date (parse ISO string or set null)
    if (dueDate !== undefined) {
      updateData.dueDate = dueDate ? new Date(dueDate) : null;
    }

    // Start date (parse ISO string or set null)
    if (startDate !== undefined) {
      updateData.startDate = startDate ? new Date(startDate) : null;
    }

    // Estimate (can be null to clear)
    if (estimate !== undefined) {
      updateData.estimate = estimate;
    }

    // Column ID
    if (columnId !== undefined) {
      // Verify column exists and is in the same project
      const newColumn = await prisma.column.findUnique({
        where: { id: columnId },
        select: { id: true, projectId: true, name: true },
      });

      if (!newColumn) {
        return notFound('Column not found');
      }

      if (newColumn.projectId !== existingTask.column.projectId) {
        return badRequest('Cannot move task to a column in a different project');
      }

      updateData.columnId = columnId;
    }

    // Completed status
    if (completed !== undefined) {
      updateData.completedAt = completed ? new Date() : null;
      
      // Auto-move to appropriate column when completing/uncompleting
      if (columnId === undefined) {
        const targetColumn = await prisma.column.findFirst({
          where: {
            projectId: existingTask.column.projectId,
            name: completed 
              ? { in: ['Done', 'Completed', 'Closed'], mode: 'insensitive' }
              : { in: ['To Do', 'Backlog', 'Open'], mode: 'insensitive' },
          },
          orderBy: { position: completed ? 'desc' : 'asc' },
        });
        
        if (targetColumn) {
          updateData.columnId = targetColumn.id;
        }
      }
    }

    // State ID (can be null to clear)
    if (stateId !== undefined) {
      updateData.stateId = stateId;
    }

    // Update the task
    const updatedTask = await prisma.task.update({
      where: { id: taskId },
      data: updateData,
      include: {
        column: {
          select: {
            id: true,
            name: true,
            project: {
              select: {
                id: true,
                name: true,
                color: true,
              },
            },
          },
        },
        subtasks: {
          orderBy: { position: 'asc' },
          select: {
            id: true,
            title: true,
            completed: true,
            position: true,
          },
        },
        state: {
          select: {
            id: true,
            name: true,
            group: true,
            color: true,
          },
        },
      },
    });

    // Handle subtask updates and creations
    let subtasksUpdated = 0;
    let subtasksCreated = 0;
    if (subtasks && subtasks.length > 0) {
      const existingSubtaskIds = new Set(existingTask.subtasks.map(s => s.id));
      
      // Separate updates from creates
      const subtaskUpdates = subtasks.filter((s: any) => s.id);
      const subtaskCreates = subtasks.filter((s: any) => !s.id && s.title);
      
      // Check capability for creating new subtasks
      if (subtaskCreates.length > 0 && !agentConfig?.canCreateSubtasks) {
        return forbidden('Agent does not have permission to create subtasks');
      }
      
      // Process updates
      for (const subtaskUpdate of subtaskUpdates) {
        // Validate the subtask belongs to this task
        if (!existingSubtaskIds.has(subtaskUpdate.id)) {
          return badRequest(`Subtask ${subtaskUpdate.id} does not belong to this task`);
        }
        
        // Update the subtask
        await prisma.subtask.update({
          where: { id: subtaskUpdate.id },
          data: { completed: subtaskUpdate.completed },
        });
        subtasksUpdated++;
      }
      
      // Process creates - get max position first
      if (subtaskCreates.length > 0) {
        const maxPositionResult = await prisma.subtask.aggregate({
          where: { taskId },
          _max: { position: true },
        });
        let nextPosition = (maxPositionResult._max.position ?? -1) + 1;
        
        for (const newSubtask of subtaskCreates) {
          await prisma.subtask.create({
            data: {
              title: newSubtask.title,
              completed: newSubtask.completed || false,
              position: nextPosition++,
              taskId: taskId,
            },
          });
          subtasksCreated++;
        }
      }
    }

    // Refetch subtasks after updates or creations
    const finalSubtasks = (subtasksUpdated > 0 || subtasksCreated > 0)
      ? await prisma.subtask.findMany({
          where: { taskId },
          orderBy: { position: 'asc' },
          select: {
            id: true,
            title: true,
            completed: true,
            position: true,
          },
        })
      : updatedTask.subtasks;

    // Log activity
    try {
      const activityData: any = {
        agentUpdate: true,
        agentName: agent.displayName,
      };

      if (columnId && columnId !== existingTask.columnId) {
        activityData.fromColumn = existingTask.column.name;
        activityData.toColumn = updatedTask.column.name;
      }

      if (completed !== undefined) {
        activityData.completed = completed;
      }

      if (title !== undefined) {
        activityData.titleUpdated = true;
      }

      if (priority !== undefined) {
        activityData.priority = priority;
      }

      if (dueDate !== undefined) {
        activityData.dueDateUpdated = true;
      }

      if (subtasksUpdated > 0) {
        activityData.subtasksUpdated = subtasksUpdated;
      }

      if (subtasksCreated > 0) {
        activityData.subtasksCreated = subtasksCreated;
      }

      await prisma.activity.create({
        data: {
          type: columnId && columnId !== existingTask.columnId ? 'task_moved' : 'task_updated',
          data: activityData,
          userId: agent.id,
          projectId: existingTask.column.projectId,
          taskId: taskId,
        },
      });
    } catch (err) {
      console.error('[Agent Tasks] Failed to log activity:', err);
    }

    const subtaskSummary = [];
    if (subtasksUpdated > 0) subtaskSummary.push(`${subtasksUpdated} updated`);
    if (subtasksCreated > 0) subtaskSummary.push(`${subtasksCreated} created`);
    console.log(`[Agent Tasks] Agent ${agent.username} updated task ${taskId}${subtaskSummary.length > 0 ? ` (subtasks: ${subtaskSummary.join(', ')})` : ''}`);

    return ok({
      success: true,
      task: {
        id: updatedTask.id,
        title: updatedTask.title,
        description: updatedTask.description,
        priority: updatedTask.priority,
        dueDate: updatedTask.dueDate?.toISOString() || null,
        startDate: updatedTask.startDate?.toISOString() || null,
        completedAt: updatedTask.completedAt?.toISOString() || null,
        estimate: updatedTask.estimate,
        columnId: updatedTask.columnId,
        columnName: updatedTask.column.name,
        projectId: updatedTask.column.project.id,
        projectName: updatedTask.column.project.name,
        subtasks: finalSubtasks,
        state: updatedTask.state,
      },
      subtasksUpdated,
      subtasksCreated,
    });
  } catch (error) {
    console.error('[Agent Tasks] Error updating task:', error);
    return serverError('Failed to update task', error);
  }
});
