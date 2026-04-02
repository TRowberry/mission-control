import { NextRequest } from 'next/server';
import prisma from '@/lib/db';
import { withAuth, AuthUser } from '@/lib/modules/api/middleware';
import { ok, created, badRequest } from '@/lib/modules/api/response';

// GET /api/kanban/task-types?projectId=xxx
export const GET = withAuth(async (req: NextRequest, user: AuthUser) => {
  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get('projectId');

  if (!projectId) {
    return badRequest('projectId is required');
  }

  const taskTypes = await prisma.taskType.findMany({
    where: { projectId },
    orderBy: { position: 'asc' },
  });

  return ok(taskTypes);
});

// POST /api/kanban/task-types
export const POST = withAuth(async (req: NextRequest, user: AuthUser) => {
  const { projectId, name, icon, color, description, isDefault } = await req.json();

  if (!projectId || !name) {
    return badRequest('projectId and name are required');
  }

  // Get max position
  const maxPos = await prisma.taskType.aggregate({
    where: { projectId },
    _max: { position: true },
  });

  const taskType = await prisma.taskType.create({
    data: {
      projectId,
      name,
      icon: icon || null,
      color: color || '#5865F2',
      description: description || null,
      isDefault: isDefault || false,
      position: (maxPos._max.position || 0) + 1,
    },
  });

  return created(taskType);
});
