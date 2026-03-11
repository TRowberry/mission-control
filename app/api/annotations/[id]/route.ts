import { NextRequest } from 'next/server';
import prisma from '@/lib/db';
import { withAnyAuthParams, AuthActor } from '@/lib/modules/api/middleware';
import { ok, notFound, forbidden } from '@/lib/modules/api/response';

// PATCH /api/annotations/[id] - Update annotation
export const PATCH = withAnyAuthParams(async (
  req: NextRequest,
  actor: AuthActor,
  params: Promise<Record<string, string>>
) => {
  const { id } = await params;
  const { content, resolved, x, y, width, height, pathData, color } = await req.json();

  const annotation = await prisma.annotation.findUnique({
    where: { id },
  });

  if (!annotation) {
    return notFound('Annotation not found');
  }

  const updated = await prisma.annotation.update({
    where: { id },
    data: {
      ...(content !== undefined && { content }),
      ...(resolved !== undefined && { resolved }),
      ...(x !== undefined && { x }),
      ...(y !== undefined && { y }),
      ...(width !== undefined && { width }),
      ...(height !== undefined && { height }),
      ...(pathData !== undefined && { pathData }),
      ...(color !== undefined && { color }),
    },
    include: {
      author: { select: { id: true, displayName: true, avatar: true } },
      replies: {
        include: {
          author: { select: { id: true, displayName: true, avatar: true } },
        },
      },
    },
  });

  return ok(updated);
});

// DELETE /api/annotations/[id] - Delete annotation
export const DELETE = withAnyAuthParams(async (
  req: NextRequest,
  actor: AuthActor,
  params: Promise<Record<string, string>>
) => {
  const { id } = await params;

  const annotation = await prisma.annotation.findUnique({
    where: { id },
  });

  if (!annotation) {
    return notFound('Annotation not found');
  }

  // Only author can delete their annotation
  if (annotation.authorId !== actor.id) {
    return forbidden('Only the author can delete this annotation');
  }

  await prisma.annotation.delete({ where: { id } });

  return ok({ deleted: true });
});
