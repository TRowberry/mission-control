import { NextRequest } from 'next/server';
import prisma from '@/lib/db';
import { withAuthParams } from '@/lib/modules/api/middleware';
import { ok, badRequest, notFound } from '@/lib/modules/api/response';
import { getCurrentUser } from '@/lib/auth';

// GET /api/invites/[token] - get invite details (public — no auth required)
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  const invite = await prisma.invite.findUnique({
    where: { token },
    include: {
      workspace: true,
      invitedBy: { select: { username: true, displayName: true } },
    },
  });

  if (!invite) return notFound('Invite not found or expired');
  if (invite.usedAt) return badRequest('Invite has already been used');
  if (invite.expiresAt < new Date()) return badRequest('Invite has expired');

  // Check if the current user (if any) is already a member
  let alreadyMember = false;
  try {
    const user = await getCurrentUser();
    if (user) {
      const existing = await prisma.workspaceMember.findUnique({
        where: { userId_workspaceId: { userId: user.id, workspaceId: invite.workspaceId } },
      });
      alreadyMember = !!existing;
    }
  } catch { /* not logged in — that's fine */ }

  return ok({
    workspace: {
      id: invite.workspace.id,
      name: invite.workspace.name,
      slug: invite.workspace.slug,
      icon: invite.workspace.icon,
    },
    role: invite.role,
    invitedBy: invite.invitedBy,
    expiresAt: invite.expiresAt,
    alreadyMember,
  });
}

// POST /api/invites/[token] - accept invite
export const POST = withAuthParams(async (_req: NextRequest, user, params) => {
  const { token } = await params;

  const invite = await prisma.invite.findUnique({
    where: { token },
  });

  if (!invite) return notFound('Invite not found or expired');
  if (invite.usedAt) return badRequest('Invite has already been used');
  if (invite.expiresAt < new Date()) return badRequest('Invite has expired');

  // Add user to workspace if not already a member
  const existing = await prisma.workspaceMember.findUnique({
    where: { userId_workspaceId: { userId: user.id, workspaceId: invite.workspaceId } },
  });

  if (!existing) {
    await prisma.workspaceMember.create({
      data: {
        userId: user.id,
        workspaceId: invite.workspaceId,
        role: invite.role,
      },
    });
  }

  // Mark email-specific invites as used; keep link invites open for reuse
  if (invite.email && invite.email !== '') {
    await prisma.invite.update({
      where: { token },
      data: { usedAt: new Date() },
    });
  }

  return ok({ workspaceId: invite.workspaceId, alreadyMember: !!existing });
});
