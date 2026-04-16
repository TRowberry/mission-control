import { NextRequest } from 'next/server';
import prisma from '@/lib/db';
import { withAuth, AuthUser } from '@/lib/modules/api/middleware';
import { ok, badRequest } from '@/lib/modules/api/response';

// GET /api/research/knowledge-base?workspaceId=... — return all pinned findings for a workspace
export const GET = withAuth(async (req: NextRequest, user: AuthUser) => {
  try {
    const { searchParams } = new URL(req.url);
    let workspaceId = searchParams.get('workspaceId');

    // Fall back to the user's first workspace
    if (!workspaceId) {
      const member = await prisma.workspaceMember.findFirst({
        where: { userId: user.id },
        select: { workspaceId: true },
      });
      if (!member) return ok([]);
      workspaceId = member.workspaceId;
    }

    const findings = await prisma.researchFinding.findMany({
      where: {
        workspaceId,
        pinned: true,
      },
      include: {
        session: {
          select: {
            id: true,
            query: true,
            status: true,
            startedAt: true,
          },
        },
      },
      orderBy: { groundingScore: 'desc' },
    });

    return ok(findings);
  } catch (err) {
    console.error('[research/knowledge-base] GET error:', err);
    return badRequest('Failed to fetch knowledge base');
  }
});
