import { NextRequest } from 'next/server';
import prisma from '@/lib/db';
import { withAnyAuth, AuthActor } from '@/lib/modules/api/middleware';
import { ok, badRequest } from '@/lib/modules/api/response';

// POST /api/pages/batch - Batch operations on pages
// Actions: move (move pages to booklet), reorder (update positions)
export const POST = withAnyAuth(async (req: NextRequest, actor: AuthActor) => {
  const body = await req.json();
  const { action, pageIds, parentId, positions } = body;
  
  console.log('[pages/batch] Request:', { action, pageIds, parentId, actorId: actor.id });

  if (!action) {
    return badRequest('Action is required');
  }

  switch (action) {
    case 'move': {
      // Move multiple pages to a booklet (or to root if parentId is null)
      if (!pageIds || !Array.isArray(pageIds) || pageIds.length === 0) {
        return badRequest('pageIds array is required');
      }

      // If parentId is provided, verify it's a booklet
      if (parentId) {
        const parent = await prisma.page.findUnique({
          where: { id: parentId },
          select: { type: true },
        });
        if (!parent) {
          return badRequest('Parent page not found');
        }
        if (parent.type !== 'BOOKLET') {
          return badRequest('Parent must be a booklet');
        }
      }

      // Get current max position in target parent
      const lastPage = await prisma.page.findFirst({
        where: { parentId: parentId || null },
        orderBy: { position: 'desc' },
        select: { position: true },
      });
      let nextPosition = (lastPage?.position ?? -1) + 1;

      // Update each page
      const updates = pageIds.map((pageId: string, index: number) =>
        prisma.page.update({
          where: { id: pageId },
          data: {
            parentId: parentId || null,
            position: nextPosition + index,
          },
        })
      );

      await prisma.$transaction(updates);
      
      console.log('[pages/batch] Move completed:', { pageIds, parentId });

      return ok({ success: true, moved: pageIds.length });
    }

    case 'reorder': {
      // Reorder pages within a parent
      if (!positions || !Array.isArray(positions)) {
        return badRequest('positions array is required (array of {id, position})');
      }

      const updates = positions.map(({ id, position }: { id: string; position: number }) =>
        prisma.page.update({
          where: { id },
          data: { position },
        })
      );

      await prisma.$transaction(updates);

      return ok({ success: true, reordered: positions.length });
    }

    default:
      return badRequest(`Unknown action: ${action}`);
  }
});
