import { NextRequest } from 'next/server';
import prisma from '@/lib/db';
import { withAuth, AuthUser } from '@/lib/modules/api/middleware';
import { ok, notFound, badRequest } from '@/lib/modules/api/response';

// PATCH /api/research/[id]/findings/[findingId] — toggle pin on a finding
export const PATCH = withAuth(async (
  req: NextRequest,
  user: AuthUser,
  { params }: { params: { id: string; findingId: string } }
) => {
  try {
    const body = await req.json();
    const { pinned } = body;

    if (typeof pinned !== 'boolean') {
      return badRequest('pinned (boolean) is required');
    }

    // Verify the finding belongs to the session
    const finding = await prisma.researchFinding.findFirst({
      where: { id: params.findingId, sessionId: params.id },
    });

    if (!finding) {
      return notFound('Finding not found');
    }

    const updated = await prisma.researchFinding.update({
      where: { id: params.findingId },
      data: { pinned },
    });

    return ok(updated);
  } catch (err) {
    console.error('[research/findings] PATCH error:', err);
    return badRequest('Failed to update finding');
  }
});
