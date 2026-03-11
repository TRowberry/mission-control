import { NextRequest } from 'next/server';
import prisma from '@/lib/db';
import { withAuthParams, AuthUser } from '@/lib/modules/api/middleware';
import { ok, created, badRequest, notFound, forbidden } from '@/lib/modules/api/response';

/**
 * GET /api/agents/[agentId]/projects
 * 
 * List all projects an agent has access to.
 */
export const GET = withAuthParams(async (
  req: NextRequest,
  user: AuthUser,
  params: Promise<Record<string, string>>
) => {
  const { agentId } = await params;

  // Verify the agent exists and is actually an agent
  const agent = await prisma.user.findUnique({
    where: { id: agentId },
    select: { id: true, isAgent: true },
  });

  if (!agent) {
    return notFound('Agent not found');
  }

  if (!agent.isAgent) {
    return badRequest('User is not an agent');
  }

  // Get all projects the agent has access to
  const access = await prisma.agentProjectAccess.findMany({
    where: { agentId },
    include: {
      project: {
        select: {
          id: true,
          name: true,
          description: true,
          color: true,
          icon: true,
          archived: true,
        },
      },
      grantedBy: {
        select: {
          id: true,
          displayName: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  const projects = access.map(a => ({
    ...a.project,
    role: a.role,
    grantedBy: a.grantedBy,
    grantedAt: a.createdAt,
  }));

  return ok({ projects });
});

/**
 * POST /api/agents/[agentId]/projects
 * 
 * Grant an agent access to a project.
 * Only workspace admins/owners can grant access.
 */
export const POST = withAuthParams(async (
  req: NextRequest,
  user: AuthUser,
  params: Promise<Record<string, string>>
) => {
  const { agentId } = await params;
  const { projectId, role = 'member' } = await req.json();

  if (!projectId) {
    return badRequest('projectId is required');
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
    return badRequest('User is not an agent');
  }

  // Verify the project exists
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, name: true, workspaceId: true },
  });

  if (!project) {
    return notFound('Project not found');
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
    return forbidden('Admin access required to grant agent permissions');
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
    include: {
      project: {
        select: { id: true, name: true },
      },
    },
  });

  return created({
    message: `Granted ${agent.displayName} access to ${project.name}`,
    access: {
      agentId,
      projectId,
      role: access.role,
      grantedAt: access.createdAt,
    },
  });
});

/**
 * DELETE /api/agents/[agentId]/projects
 * 
 * Revoke an agent's access to a project.
 * Only workspace admins/owners can revoke access.
 */
export const DELETE = withAuthParams(async (
  req: NextRequest,
  user: AuthUser,
  params: Promise<Record<string, string>>
) => {
  const { agentId } = await params;
  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get('projectId');

  if (!projectId) {
    return badRequest('projectId is required');
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
    return forbidden('Admin access required to revoke agent permissions');
  }

  // Delete access
  await prisma.agentProjectAccess.deleteMany({
    where: { agentId, projectId },
  });

  return ok({ success: true });
});
