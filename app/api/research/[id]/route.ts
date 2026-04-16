import { NextRequest } from 'next/server';
import prisma from '@/lib/db';
import { withAuth, AuthUser } from '@/lib/modules/api/middleware';
import { ok, notFound, badRequest } from '@/lib/modules/api/response';

// GET /api/research/[id] — return session with all sources and findings
export const GET = withAuth(async (
  req: NextRequest,
  user: AuthUser,
  { params }: { params: { id: string } }
) => {
  try {
    const session = await prisma.researchSession.findUnique({
      where: { id: params.id },
      include: {
        createdBy: { select: { id: true, displayName: true, avatar: true } },
        sources: { orderBy: { findingsCount: 'desc' } },
        findings: { orderBy: { groundingScore: 'desc' } },
      },
    });

    if (!session) {
      return notFound('Research session not found');
    }

    return ok(session);
  } catch (err) {
    console.error('[research/id] GET error:', err);
    return badRequest('Failed to fetch session');
  }
});

// DELETE /api/research/[id] — delete session (cascade deletes sources + findings)
export const DELETE = withAuth(async (
  req: NextRequest,
  user: AuthUser,
  { params }: { params: { id: string } }
) => {
  try {
    const session = await prisma.researchSession.findUnique({
      where: { id: params.id },
      select: { id: true, workspaceId: true, createdById: true },
    });

    if (!session) {
      return notFound('Research session not found');
    }

    await prisma.researchSession.delete({ where: { id: params.id } });

    return ok({ success: true });
  } catch (err) {
    console.error('[research/id] DELETE error:', err);
    return badRequest('Failed to delete session');
  }
});
