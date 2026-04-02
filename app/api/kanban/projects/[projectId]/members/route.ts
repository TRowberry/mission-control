import { NextRequest } from 'next/server';
import prisma from '@/lib/db';
import { withAuthParams, AuthUser } from '@/lib/modules/api/middleware';
import { ok, notFound, forbidden, badRequest, created } from '@/lib/modules/api/response';

/**
 * GET /api/kanban/projects/[projectId]/members
 * 
 * List all members with access to a project:
 * - Workspace members (inherent access)
 * - Agents with explicit AgentProjectAccess
 */
export const GET = withAuthParams(async (
  req: NextRequest,
  user: AuthUser,
  params: Promise<Record<string, string>>
) => {
  const { projectId } = await params;

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      workspace: {
        include: {
          members: {
            include: {
              user: {
                select: {
                  id: true,
                  username: true,
                  displayName: true,
                  avatar: true,
                  isAgent: true,
                },
              },
            },
          },
        },
      },
    },
  });

  if (!project) {
    return notFound('Project not found');
  }

  // Get workspace members (non-agents)
  const workspaceMembers = project.workspace.members
    .filter(m => !m.user.isAgent)
    .map(m => ({
      id: m.user.id,
      username: m.user.username,
      displayName: m.user.displayName,
      avatar: m.user.avatar,
      isAgent: false,
      role: m.role, // workspace role
      source: 'workspace' as const,
    }));

  // Get agents with explicit project access
  const agentAccess = await prisma.agentProjectAccess.findMany({
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
      grantedBy: {
        select: {
          id: true,
          displayName: true,
        },
      },
    },
  });

  const agents = agentAccess.map(a => ({
    id: a.agent.id,
    username: a.agent.username,
    displayName: a.agent.displayName,
    avatar: a.agent.avatar,
    isAgent: true,
    role: a.role,
    source: 'explicit' as const,
    grantedBy: a.grantedBy,
    grantedAt: a.createdAt,
  }));

  return ok({
    members: [...workspaceMembers, ...agents],
    projectId,
    workspaceId: project.workspaceId,
  });
});

/**
 * POST /api/kanban/projects/[projectId]/members
 * 
 * Add an agent to a project. Users are added via workspace membership.
 */
export const POST = withAuthParams(async (
  req: NextRequest,
  user: AuthUser,
  params: Promise<Record<string, string>>
) => {
  const { projectId } = await params;
  const { agentId, role = 'member' } = await req.json();

  if (!agentId) {
    return badRequest('agentId is required');
  }

  // Verify the project exists
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, name: true, workspaceId: true },
  });

  if (!project) {
    return notFound('Project not found');
  }

  // Verify the agent exists and is actually an agent
  const agent = await prisma.user.findUnique({
    where: { id: agentId },
    select: { id: true, isAgent: true, displayName: true },
  });

  if (!agent) {
    return notFound('Agent not found');
  }

  if (!agent.isAgent) {
    return badRequest('User is not an agent. Add users via workspace membership.');
  }

  // SECURITY: Only workspace admins/owners can grant agent access
  const membership = await prisma.workspaceMember.findFirst({
    where: {
      userId: user.id,
      workspaceId: project.workspaceId,
      role: { in: ['owner', 'admin'] },
    },
  });

  if (!membership) {
    return forbidden('Admin access required to add agents to projects');
  }

  // Create or update access
  const access = await prisma.agentProjectAccess.upsert({
    where: {
      agentId_projectId: { agentId, projectId },
    },
    create: {
      agentId,
      projectId,
      grantedById: user.id,
      role,
    },
    update: {
      role,
      grantedById: user.id,
    },
  });

  return created({
    message: `Added ${agent.displayName} to project`,
    member: {
      id: agent.id,
      displayName: agent.displayName,
      isAgent: true,
      role: access.role,
      grantedAt: access.createdAt,
    },
  });
});

/**
 * DELETE /api/kanban/projects/[projectId]/members
 * 
 * Remove an agent from a project.
 */
export const DELETE = withAuthParams(async (
  req: NextRequest,
  user: AuthUser,
  params: Promise<Record<string, string>>
) => {
  const { projectId } = await params;
  const { searchParams } = new URL(req.url);
  const agentId = searchParams.get('agentId');

  if (!agentId) {
    return badRequest('agentId is required');
  }

  // Verify the project exists
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, workspaceId: true },
  });

  if (!project) {
    return notFound('Project not found');
  }

  // SECURITY: Only workspace admins/owners can revoke agent access
  const membership = await prisma.workspaceMember.findFirst({
    where: {
      userId: user.id,
      workspaceId: project.workspaceId,
      role: { in: ['owner', 'admin'] },
    },
  });

  if (!membership) {
    return forbidden('Admin access required to remove agents from projects');
  }

  // Delete access
  await prisma.agentProjectAccess.deleteMany({
    where: { agentId, projectId },
  });

  return ok({ success: true, message: 'Agent removed from project' });
});
