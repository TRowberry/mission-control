import { NextRequest } from 'next/server';
import prisma from '@/lib/db';
import { withAnyAuthParams, AuthActor } from '@/lib/modules/api/middleware';
import { ok, created, badRequest, notFound } from '@/lib/modules/api/response';
import { ReviewNotifications } from '@/lib/modules/notifications';

// POST /api/annotations/[id]/replies - Add reply to annotation
export const POST = withAnyAuthParams(async (
  req: NextRequest,
  actor: AuthActor,
  params: Promise<Record<string, string>>
) => {
  const { id } = await params;
  const { content } = await req.json();

  if (!content) {
    return badRequest('content is required');
  }

  const annotation = await prisma.annotation.findUnique({
    where: { id },
    include: {
      reviewItem: { select: { name: true, taskId: true } },
    },
  });

  if (!annotation) {
    return notFound('Annotation not found');
  }

  const reply = await prisma.annotationReply.create({
    data: {
      content,
      annotationId: id,
      authorId: actor.id,
    },
    include: {
      author: { select: { id: true, displayName: true, avatar: true } },
    },
  });

  // Notify the annotation author (if not the same person)
  if (annotation.authorId !== actor.id) {
    const actorUser = await prisma.user.findUnique({
      where: { id: actor.id },
      select: { displayName: true },
    });
    const actorName = actorUser?.displayName || 'Someone';

    await ReviewNotifications.annotationReply(
      annotation.authorId,
      annotation.reviewItem.name,
      actorName,
      content,
      annotation.reviewItem.taskId || undefined
    );
  }

  return created(reply);
});

// GET /api/annotations/[id]/replies - Get replies for annotation
export const GET = withAnyAuthParams(async (
  req: NextRequest,
  actor: AuthActor,
  params: Promise<Record<string, string>>
) => {
  const { id } = await params;

  const replies = await prisma.annotationReply.findMany({
    where: { annotationId: id },
    include: {
      author: { select: { id: true, displayName: true, avatar: true } },
    },
    orderBy: { createdAt: 'asc' },
  });

  return ok(replies);
});
