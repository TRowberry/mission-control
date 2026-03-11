import { NextRequest } from 'next/server';
import prisma from '@/lib/db';
import { withAnyAuthParams, AuthActor } from '@/lib/modules/api/middleware';
import { ok, badRequest, notFound, forbidden } from '@/lib/modules/api/response';
import { ReviewNotifications } from '@/lib/modules/notifications';

// POST /api/review/[id]/reject - Current user rejects this review item
export const POST = withAnyAuthParams(async (
  req: NextRequest,
  actor: AuthActor,
  params: Promise<Record<string, string>>
) => {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const { reason } = body;

  const reviewItem = await prisma.reviewItem.findUnique({
    where: { id },
    include: {
      reviewers: { include: { user: { select: { displayName: true } } } },
    },
  });

  if (!reviewItem) {
    return notFound('Review item not found');
  }

  // Check if user is an assigned reviewer
  const assignment = reviewItem.reviewers.find(r => r.userId === actor.id);
  if (!assignment) {
    return forbidden('You are not assigned as a reviewer for this item');
  }

  // Update the assignment
  const updatedAssignment = await prisma.reviewAssignment.update({
    where: { id: assignment.id },
    data: {
      status: 'rejected',
      reviewedAt: new Date(),
    },
    include: {
      user: { select: { id: true, displayName: true, avatar: true } },
    },
  });

  // Get actor's display name
  const actorName = updatedAssignment.user.displayName || 'Someone';

  // Update overall status to rejected (any rejection = rejected)
  await prisma.reviewItem.update({
    where: { id },
    data: { status: 'rejected' },
  });

  // Notify the uploader
  if (reviewItem.uploadedById !== actor.id) {
    await ReviewNotifications.reviewRejected(
      reviewItem.uploadedById,
      reviewItem.name,
      actorName,
      reviewItem.taskId || undefined
    );
  }

  // If a reason was provided, create an annotation with the feedback
  if (reason) {
    await prisma.annotation.create({
      data: {
        type: 'pin',
        x: 50, // Center of image
        y: 50,
        content: `Rejection reason: ${reason}`,
        color: '#EF4444', // Red
        reviewItemId: id,
        authorId: actor.id,
      },
    });
  }

  return ok({ assignment: updatedAssignment });
});
