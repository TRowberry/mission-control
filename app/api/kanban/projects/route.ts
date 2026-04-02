import { NextRequest } from 'next/server';
import prisma from '@/lib/db';
import { withAuth, withAnyAuth, AuthUser, AuthActor, isAgent } from '@/lib/modules/api/middleware';
import { ok, created, badRequest, notFound, forbidden } from '@/lib/modules/api/response';
import { canAccessProject, getAgentProjectIds } from '@/lib/modules/api/permissions';

// Default TaskTypes to seed for new projects
const DEFAULT_TASK_TYPES = [
  { name: 'Bug', icon: '🐛', color: '#EF4444', position: 0 },
  { name: 'Feature', icon: '✨', color: '#10B981', position: 1 },
  { name: 'Task', icon: '📋', color: '#3B82F6', position: 2, isDefault: true },
  { name: 'Story', icon: '📖', color: '#8B5CF6', position: 3 },
];

// Default States to seed for new projects
const DEFAULT_STATES = [
  { name: 'Backlog', group: 'backlog', color: '#6B7280', position: 0, isDefault: true },
  { name: 'Todo', group: 'unstarted', color: '#3B82F6', position: 1 },
  { name: 'In Progress', group: 'started', color: '#F59E0B', position: 2 },
  { name: 'In Review', group: 'started', color: '#8B5CF6', position: 3 },
  { name: 'Done', group: 'completed', color: '#10B981', position: 4 },
  { name: 'Cancelled', group: 'cancelled', color: '#EF4444', position: 5 },
];

// GET /api/kanban/projects - List all projects or get single project by id
export const GET = withAnyAuth(async (req: NextRequest, actor: AuthActor) => {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  const workspaceId = searchParams.get('workspaceId');
  const includeArchived = searchParams.get('includeArchived') === 'true';

  const include = {
    columns: {
      orderBy: { position: 'asc' } as const,
      include: {
        tasks: {
          where: { archived: false },
          orderBy: { position: 'asc' } as const,
          include: {
            subtasks: { orderBy: { position: 'asc' } as const },
            tags: { include: { tag: true } },
            assignee: {
              select: { id: true, displayName: true, avatar: true },
            },
            type: { select: { id: true, name: true, icon: true, color: true } },
            state: { select: { id: true, name: true, group: true, color: true } },
            cycle: { select: { id: true, name: true, status: true } },
            modules: { include: { module: { select: { id: true, name: true } } } },
          },
        },
      },
    },
    tags: true,
  };

  // Return single project if id is provided
  if (id) {
    // Check permission for agents
    if (!await canAccessProject(actor, id)) {
      return forbidden('No access to this project');
    }
    
    const project = await prisma.project.findUnique({
      where: { id },
      include,
    });

    if (!project) {
      return notFound('Project not found');
    }

    return ok(project);
  }

  // For agents, only return projects they have access to
  let projectIds: string[] | undefined;
  if (isAgent(actor)) {
    projectIds = await getAgentProjectIds(actor.id);
  }

  // Return all projects (filtered for agents)
  const projects = await prisma.project.findMany({
    where: {
      ...(workspaceId && { workspaceId }),
      ...(!includeArchived && { archived: false }),
      ...(projectIds && { id: { in: projectIds } }),
    },
    include: {
      _count: { select: { columns: true } },
    },
    orderBy: { position: 'asc' },
  });

  return ok(projects);
});

// POST /api/kanban/projects - Create project
export const POST = withAuth(async (req: NextRequest, user: AuthUser) => {
  const { name, description, color, workspaceId: providedWorkspaceId } = await req.json();

  if (!name) {
    return badRequest('name required');
  }

  // Find or create default workspace
  let workspaceId = providedWorkspaceId;
  if (!workspaceId) {
    let workspace = await prisma.workspace.findFirst();
    if (!workspace) {
      workspace = await prisma.workspace.create({
        data: { name: 'Mission Control', slug: 'mission-control' },
      });
    }
    workspaceId = workspace.id;
  }

  // Get max position
  const maxPos = await prisma.project.aggregate({
    where: { workspaceId },
    _max: { position: true },
  });

  // Create project with default columns, task types, and states
  const project = await prisma.project.create({
    data: {
      name,
      description,
      color: color || '#5865F2',
      position: (maxPos._max.position || 0) + 1,
      workspaceId,
      // Create default columns
      columns: {
        create: [
          { name: 'Backlog', position: 0, color: '#9CA3AF' },
          { name: 'In Progress', position: 1, color: '#3B82F6' },
          { name: 'Done', position: 2, color: '#10B981' },
        ],
      },
      // Create default task types
      taskTypes: {
        create: DEFAULT_TASK_TYPES,
      },
      // Create default states
      states: {
        create: DEFAULT_STATES,
      },
    },
    include: {
      columns: { orderBy: { position: 'asc' } },
      tags: true,
      taskTypes: { orderBy: { position: 'asc' } },
      states: { orderBy: { position: 'asc' } },
    },
  });

  // Create a starter cycle (sprint) for the new project
  const now = new Date();
  const twoWeeksLater = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
  
  await prisma.cycle.create({
    data: {
      name: 'Sprint 1',
      description: 'First sprint',
      startDate: now,
      endDate: twoWeeksLater,
      status: 'current',
      projectId: project.id,
      ownerId: user.id,
    },
  });

  return created(project);
});

// PATCH /api/kanban/projects - Update project
export const PATCH = withAuth(async (req: NextRequest, user: AuthUser) => {
  const { id, name, description, color, archived, position } = await req.json();

  if (!id) {
    return badRequest('id required');
  }

  const project = await prisma.project.update({
    where: { id },
    data: {
      ...(name !== undefined && { name }),
      ...(description !== undefined && { description }),
      ...(color !== undefined && { color }),
      ...(archived !== undefined && { archived }),
      ...(position !== undefined && { position }),
    },
  });

  return ok(project);
});

// DELETE /api/kanban/projects
export const DELETE = withAuth(async (req: NextRequest, user: AuthUser) => {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');

  if (!id) {
    return badRequest('id required');
  }

  await prisma.project.delete({ where: { id } });

  return ok({ success: true });
});
