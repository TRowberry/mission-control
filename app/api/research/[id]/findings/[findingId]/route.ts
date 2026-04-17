import { NextRequest } from 'next/server';
import prisma from '@/lib/db';
import { withAuthParams, AuthUser } from '@/lib/modules/api/middleware';
import { ok, notFound, badRequest } from '@/lib/modules/api/response';

// PATCH /api/research/[id]/findings/[findingId] — toggle pin on a finding
export const PATCH = withAuthParams(async (
  req: NextRequest,
  user: AuthUser,
  rawParams: Promise<Record<string, string>>
) => {
  try {
    const { id, findingId } = await rawParams;
    const body = await req.json();
    const { pinned } = body;

    if (typeof pinned !== 'boolean') {
      return badRequest('pinned (boolean) is required');
    }

    // Verify the finding belongs to the session
    const finding = await prisma.researchFinding.findFirst({
      where: { id: findingId, sessionId: id },
    });

    if (!finding) {
      return notFound('Finding not found');
    }

    const updated = await prisma.researchFinding.update({
      where: { id: findingId },
      data: { pinned },
    });

    return ok(updated);
  } catch (err) {
    console.error('[research/findings] PATCH error:', err);
    return badRequest('Failed to update finding');
  }
});
