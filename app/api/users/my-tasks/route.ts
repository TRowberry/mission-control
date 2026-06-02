import { NextRequest } from 'next/server';
import prisma from '@/lib/db';
import { withAuth, AuthUser } from '@/lib/modules/api/middleware';
import { ok } from '@/lib/modules/api/response';

// GET /api/users/my-tasks?workspaceId=
// Returns all non-archived tasks assigned to the current user in the given workspace.
export const GET = withAuth(async (req: NextRequest, user: AuthUser) => {
  const { searchParams } = new URL(req.url);
  const workspaceId = searchParams.get('workspaceId');

  const tasks = await prisma.task.findMany({
    where: {
      assigneeId: user.id,
      archived: false,
      column: { project: { ...(workspaceId ? { workspaceId } : {}) } },
    },
    orderBy: [{ dueDate: 'asc' }, { createdAt: 'desc' }],
    take: 150,
    include: {
      column: {
        include: {
          project: { select: { id: true, name: true, color: true } },
        },
      },
      state: { select: { id: true, name: true, color: true, group: true } },
      assignee: { select: { id: true, displayName: true, avatar: true } },
      subtasks: { orderBy: { position: 'asc' } },
      tags: { include: { tag: true } },
      children: {
        where: { archived: false },
        select: {
          id: true, title: true, completedAt: true, columnId: true,
          assignee: { select: { id: true, displayName: true, avatar: true } },
          state: { select: { id: true, name: true, color: true, group: true } },
          dueDate: true, hasDueTime: true, priority: true,
          subtasks: { orderBy: { position: 'asc' } },
        },
      },
    },
  });

  return ok(tasks);
});
