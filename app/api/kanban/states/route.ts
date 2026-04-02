import { NextRequest } from 'next/server';
import prisma from '@/lib/db';
import { withAuth, AuthUser } from '@/lib/modules/api/middleware';
import { ok, created, badRequest } from '@/lib/modules/api/response';

// Valid state groups (like Plane)
const STATE_GROUPS = ['backlog', 'unstarted', 'started', 'completed', 'cancelled'];

// GET /api/kanban/states?projectId=xxx
export const GET = withAuth(async (req: NextRequest, user: AuthUser) => {
  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get('projectId');

  if (!projectId) {
    return badRequest('projectId is required');
  }

  const states = await prisma.state.findMany({
    where: { projectId },
    orderBy: { position: 'asc' },
  });

  return ok(states);
});

// POST /api/kanban/states
export const POST = withAuth(async (req: NextRequest, user: AuthUser) => {
  const { projectId, name, group, color, description, isDefault } = await req.json();

  if (!projectId || !name || !group) {
    return badRequest('projectId, name, and group are required');
  }

  if (!STATE_GROUPS.includes(group)) {
    return badRequest(`Invalid group. Must be one of: ${STATE_GROUPS.join(', ')}`);
  }

  // Get max position
  const maxPos = await prisma.state.aggregate({
    where: { projectId },
    _max: { position: true },
  });

  const state = await prisma.state.create({
    data: {
      projectId,
      name,
      group,
      color: color || '#5865F2',
      description: description || null,
      isDefault: isDefault || false,
      position: (maxPos._max.position || 0) + 1,
    },
  });

  return created(state);
});
