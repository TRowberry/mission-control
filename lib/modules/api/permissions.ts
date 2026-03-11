/**
 * Permission Helpers for API Routes
 * 
 * Handles authorization checks for users and agents accessing resources.
 */

import prisma from '@/lib/db';
import { AuthActor, isAgent } from './middleware';

/**
 * Check if an actor (user or agent) can access a specific project.
 * 
 * - Users can access all projects (for now - until user permissions are implemented)
 * - Agents need explicit access via AgentProjectAccess
 */
export async function canAccessProject(
  actor: AuthActor,
  projectId: string
): Promise<boolean> {
  // Users can access all projects (temporary - will add user permissions later)
  if (!isAgent(actor)) {
    return true;
  }
  
  // Agents need explicit access
  const access = await prisma.agentProjectAccess.findUnique({
    where: {
      agentId_projectId: {
        agentId: actor.id,
        projectId,
      },
    },
  });
  
  return !!access;
}

/**
 * Get list of project IDs an agent has access to.
 */
export async function getAgentProjectIds(agentId: string): Promise<string[]> {
  const access = await prisma.agentProjectAccess.findMany({
    where: { agentId },
    select: { projectId: true },
  });
  return access.map(a => a.projectId);
}

/**
 * Get the project ID for a column (for permission checks on task operations).
 */
export async function getProjectIdForColumn(columnId: string): Promise<string | null> {
  const column = await prisma.column.findUnique({
    where: { id: columnId },
    select: { projectId: true },
  });
  return column?.projectId ?? null;
}

/**
 * Get the project ID for a task (for permission checks on task updates).
 */
export async function getProjectIdForTask(taskId: string): Promise<string | null> {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { column: { select: { projectId: true } } },
  });
  return task?.column?.projectId ?? null;
}

/**
 * Check if an actor can modify a task (create, update, delete).
 * 
 * For task creation: pass the columnId
 * For task update/delete: pass the taskId
 */
export async function canModifyTask(
  actor: AuthActor,
  options: { columnId?: string; taskId?: string }
): Promise<boolean> {
  let projectId: string | null = null;
  
  if (options.columnId) {
    projectId = await getProjectIdForColumn(options.columnId);
  } else if (options.taskId) {
    projectId = await getProjectIdForTask(options.taskId);
  }
  
  if (!projectId) {
    return false;
  }
  
  return canAccessProject(actor, projectId);
}

/**
 * Grant an agent access to a project.
 */
export async function grantAgentAccess(
  agentId: string,
  projectId: string,
  grantedById: string,
  role: string = 'member'
): Promise<void> {
  await prisma.agentProjectAccess.upsert({
    where: {
      agentId_projectId: { agentId, projectId },
    },
    create: {
      agentId,
      projectId,
      grantedById,
      role,
    },
    update: {
      role,
      grantedById,
    },
  });
}

/**
 * Revoke an agent's access to a project.
 */
export async function revokeAgentAccess(
  agentId: string,
  projectId: string
): Promise<void> {
  await prisma.agentProjectAccess.deleteMany({
    where: { agentId, projectId },
  });
}

/**
 * List all agents with access to a project.
 */
export async function getProjectAgents(projectId: string) {
  const access = await prisma.agentProjectAccess.findMany({
    where: { projectId },
    include: {
      agent: {
        select: {
          id: true,
          username: true,
          displayName: true,
          avatar: true,
        },
      },
    },
  });
  
  return access.map(a => ({
    ...a.agent,
    role: a.role,
    grantedAt: a.createdAt,
  }));
}
