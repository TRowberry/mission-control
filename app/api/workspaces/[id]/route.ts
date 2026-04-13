import { NextRequest } from 'next/server';
import prisma from '@/lib/db';
import { withAuthParams } from '@/lib/modules/api/middleware';
import { ok, badRequest, forbidden, notFound } from '@/lib/modules/api/response';

// GET /api/workspaces/[id]
export const GET = withAuthParams(async (_req: NextRequest, user, params) => {
  const { id } = await params;

  const membership = await prisma.workspaceMember.findUnique({
    where: { userId_workspaceId: { userId: user.id, workspaceId: id } },
    include: {
      workspace: {
        include: {
          members: {
            include: {
              user: {
                select: { id: true, username: true, displayName: true, avatar: true, status: true, isAgent: true },
              },
            },
            orderBy: { joinedAt: 'asc' },
          },
          _count: { select: { channels: true, projects: true } },
        },
      },
    },
  });

  if (!membership) return notFound('Workspace not found');

  const { workspace } = membership;
  return ok({
    id: workspace.id,
    name: workspace.name,
    slug: workspace.slug,
    icon: workspace.icon,
    description: workspace.description,
    createdAt: workspace.createdAt,
    role: membership.role,
    members: workspace.members.map(m => ({
      id: m.id,
      role: m.role,
      joinedAt: m.joinedAt,
      user: m.user,
    })),
    _count: workspace._count,
  });
});

// PATCH /api/workspaces/[id]
export const PATCH = withAuthParams(async (req: NextRequest, user, params) => {
  const { id } = await params;
  const { name, icon, description } = await req.json();

  const membership = await prisma.workspaceMember.findUnique({
    where: { userId_workspaceId: { userId: user.id, workspaceId: id } },
  });

  if (!membership) return notFound('Workspace not found');
  if (!['owner', 'admin'].includes(membership.role)) return forbidden('Admin access required');

  const workspace = await prisma.workspace.update({
    where: { id },
    data: {
      ...(name !== undefined && { name: name.trim() }),
      ...(icon !== undefined && { icon: icon || null }),
      ...(description !== undefined && { description: description?.trim() || null }),
    },
  });

  return ok(workspace);
});

// DELETE /api/workspaces/[id]
export const DELETE = withAuthParams(async (_req: NextRequest, user, params) => {
  const { id } = await params;

  const membership = await prisma.workspaceMember.findUnique({
    where: { userId_workspaceId: { userId: user.id, workspaceId: id } },
  });

  if (!membership) return notFound('Workspace not found');
  if (membership.role !== 'owner') return forbidden('Owner access required');

  await prisma.workspace.delete({ where: { id } });

  return ok({ success: true });
});
