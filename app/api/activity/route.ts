import { NextRequest } from 'next/server';
import prisma from '@/lib/db';
import { withAuth } from '@/lib/modules/api/middleware';
import { ok, badRequest, notFound, serverError } from '@/lib/modules/api/response';

// GET /api/activity?projectId=xxx - Get activity for a project
export const GET = withAuth(async (req: NextRequest, user) => {
  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get('projectId');
  const taskId = searchParams.get('taskId');
  const limit = parseInt(searchParams.get('limit') || '50');
  const before = searchParams.get('before');

  if (!projectId && !taskId) {
    return badRequest('projectId or taskId required');
  }

  const activities = await prisma.activity.findMany({
    where: {
      ...(projectId && { projectId }),
      ...(taskId && { taskId }),
      ...(before && { createdAt: { lt: new Date(before) } }),
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
    include: {
      user: {
        select: {
          id: true,
          username: true,
          displayName: true,
          avatar: true,
        },
      },
    },
  });

  return ok(activities);
});

// POST /api/activity - Create activity (internal use)
export const POST = withAuth(async (req: NextRequest, user) => {
  const body = await req.json();
  const { type, data, projectId, taskId } = body;

  if (!type) {
    return badRequest('type is required');
  }

  const activity = await prisma.activity.create({
    data: {
      type,
      data: data || null,
      userId: user.id,
      projectId: projectId || null,
      taskId: taskId || null,
    },
    include: {
      user: {
        select: {
          id: true,
          username: true,
          displayName: true,
          avatar: true,
        },
      },
    },
  });

  return ok(activity);
});
