import { NextRequest } from 'next/server';
import prisma from '@/lib/db';
import { withAuthParams } from '@/lib/modules/api/middleware';
import { ok, badRequest, forbidden, notFound } from '@/lib/modules/api/response';

// GET /api/workspaces/[id]/members
export const GET = withAuthParams(async (_req: NextRequest, user, params) => {
  const { id } = await params;

  const membership = await prisma.workspaceMember.findUnique({
    where: { userId_workspaceId: { userId: user.id, workspaceId: id } },
  });
  if (!membership) return notFound('Workspace not found');

  const members = await prisma.workspaceMember.findMany({
    where: { workspaceId: id },
    include: {
      user: {
        select: { id: true, username: true, displayName: true, avatar: true, status: true, isAgent: true },
      },
    },
    orderBy: { joinedAt: 'asc' },
  });

  return ok(members.map(m => ({ id: m.id, role: m.role, joinedAt: m.joinedAt, user: m.user })));
});

// PATCH /api/workspaces/[id]/members - update member role
export const PATCH = withAuthParams(async (req: NextRequest, user, params) => {
  const { id } = await params;
  const { userId, role } = await req.json();

  if (!userId || !role) return badRequest('userId and role required');
  if (!['admin', 'member', 'guest'].includes(role)) return badRequest('Invalid role');

  const membership = await prisma.workspaceMember.findUnique({
    where: { userId_workspaceId: { userId: user.id, workspaceId: id } },
  });
  if (!membership) return notFound('Workspace not found');
  if (!['owner', 'admin'].includes(membership.role)) return forbidden('Admin access required');

  const updated = await prisma.workspaceMember.update({
    where: { userId_workspaceId: { userId, workspaceId: id } },
    data: { role },
    include: {
      user: { select: { id: true, username: true, displayName: true } },
    },
  });

  return ok(updated);
});

// DELETE /api/workspaces/[id]/members?userId=... - remove member
export const DELETE = withAuthParams(async (req: NextRequest, user, params) => {
  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const userId = searchParams.get('userId');

  if (!userId) return badRequest('userId required');

  const membership = await prisma.workspaceMember.findUnique({
    where: { userId_workspaceId: { userId: user.id, workspaceId: id } },
  });
  if (!membership) return notFound('Workspace not found');

  // Allow removing self, or admin removing others
  if (userId !== user.id && !['owner', 'admin'].includes(membership.role)) {
    return forbidden('Admin access required');
  }

  await prisma.workspaceMember.delete({
    where: { userId_workspaceId: { userId, workspaceId: id } },
  });

  return ok({ success: true });
});
