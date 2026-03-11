import { NextRequest } from 'next/server';
import prisma from '@/lib/db';
import { withAnyAuthParams, AuthActor } from '@/lib/modules/api/middleware';
import { ok, created, badRequest, notFound } from '@/lib/modules/api/response';
import { ReviewNotifications } from '@/lib/modules/notifications';

// GET /api/review/[id]/annotations - List annotations for a review item
export const GET = withAnyAuthParams(async (
  req: NextRequest,
  actor: AuthActor,
  params: Promise<Record<string, string>>
) => {
  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const resolved = searchParams.get('resolved');

  const where: any = { reviewItemId: id };
  if (resolved !== null) {
    where.resolved = resolved === 'true';
  }

  const annotations = await prisma.annotation.findMany({
    where,
    include: {
      author: { select: { id: true, displayName: true, avatar: true } },
      replies: {
        include: {
          author: { select: { id: true, displayName: true, avatar: true } },
        },
        orderBy: { createdAt: 'asc' },
      },
    },
    orderBy: { createdAt: 'asc' },
  });

  return ok(annotations);
});

// POST /api/review/[id]/annotations - Create annotation
export const POST = withAnyAuthParams(async (
  req: NextRequest,
  actor: AuthActor,
  params: Promise<Record<string, string>>
) => {
  const { id } = await params;
  const { type, x, y, width, height, timestamp, frameNumber, pathData, color, content } = await req.json();

  if (!type || !content) {
    return badRequest('type and content are required');
  }

  const validTypes = ['pin', 'rectangle', 'circle', 'arrow', 'freehand'];
  if (!validTypes.includes(type)) {
    return badRequest('Invalid annotation type');
  }

  // Verify review item exists and get related data
  const reviewItem = await prisma.reviewItem.findUnique({
    where: { id },
    include: {
      reviewers: { select: { userId: true } },
    },
  });

  if (!reviewItem) {
    return notFound('Review item not found');
  }

  // Get actor's display name
  const actorUser = await prisma.user.findUnique({
    where: { id: actor.id },
    select: { displayName: true },
  });
  const actorName = actorUser?.displayName || 'Someone';

  const annotation = await prisma.annotation.create({
    data: {
      type,
      x,
      y,
      width,
      height,
      timestamp,
      frameNumber,
      pathData,
      color: color || '#FF3B30',
      content,
      reviewItemId: id,
      authorId: actor.id,
    },
    include: {
      author: { select: { id: true, displayName: true, avatar: true } },
      replies: true,
    },
  });

  // Update review item status to in_review if pending
  if (reviewItem.status === 'pending') {
    await prisma.reviewItem.update({
      where: { id },
      data: { status: 'in_review' },
    });
  }

  // Notify uploader and assigned reviewers (excluding the author)
  const notifyUserIds = [
    reviewItem.uploadedById,
    ...reviewItem.reviewers.map(r => r.userId),
  ].filter((uid, idx, arr) => 
    uid !== actor.id && arr.indexOf(uid) === idx // exclude author, dedupe
  );

  if (notifyUserIds.length > 0) {
    await ReviewNotifications.newAnnotation(
      notifyUserIds,
      reviewItem.name,
      actorName,
      content,
      reviewItem.taskId || undefined
    );
  }

  return created(annotation);
});
