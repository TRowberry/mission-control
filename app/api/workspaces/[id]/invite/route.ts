import { NextRequest } from 'next/server';
import crypto from 'crypto';
import prisma from '@/lib/db';
import { withAuthParams } from '@/lib/modules/api/middleware';
import { ok, created, badRequest, forbidden, notFound } from '@/lib/modules/api/response';

// GET /api/workspaces/[id]/invite - list active invites
export const GET = withAuthParams(async (_req: NextRequest, user, params) => {
  const { id } = await params;

  const membership = await prisma.workspaceMember.findUnique({
    where: { userId_workspaceId: { userId: user.id, workspaceId: id } },
  });
  if (!membership) return notFound('Workspace not found');
  if (!['owner', 'admin'].includes(membership.role)) return forbidden('Admin access required');

  const invites = await prisma.invite.findMany({
    where: { workspaceId: id, usedAt: null, expiresAt: { gt: new Date() } },
    include: { invitedBy: { select: { username: true, displayName: true } } },
    orderBy: { createdAt: 'desc' },
  });

  return ok(invites);
});

// POST /api/workspaces/[id]/invite - create invite link
export const POST = withAuthParams(async (req: NextRequest, user, params) => {
  const { id } = await params;
  const { email, role } = await req.json();

  const membership = await prisma.workspaceMember.findUnique({
    where: { userId_workspaceId: { userId: user.id, workspaceId: id } },
  });
  if (!membership) return notFound('Workspace not found');
  if (!['owner', 'admin'].includes(membership.role)) return forbidden('Admin access required');

  const validRoles = ['admin', 'member', 'guest'];
  const inviteRole = role && validRoles.includes(role) ? role : 'member';

  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

  const invite = await prisma.invite.create({
    data: {
      email: email?.trim() || '',
      token,
      role: inviteRole,
      workspaceId: id,
      invitedById: user.id,
      expiresAt,
    },
  });

  return created({ ...invite, inviteUrl: `/invite/${token}` });
});

// DELETE /api/workspaces/[id]/invite?token=... - revoke invite
export const DELETE = withAuthParams(async (req: NextRequest, user, params) => {
  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const token = searchParams.get('token');

  if (!token) return badRequest('token required');

  const membership = await prisma.workspaceMember.findUnique({
    where: { userId_workspaceId: { userId: user.id, workspaceId: id } },
  });
  if (!membership) return notFound('Workspace not found');
  if (!['owner', 'admin'].includes(membership.role)) return forbidden('Admin access required');

  await prisma.invite.deleteMany({ where: { token, workspaceId: id } });

  return ok({ success: true });
});
