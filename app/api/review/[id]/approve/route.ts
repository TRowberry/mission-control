import { NextRequest } from 'next/server';
import prisma from '@/lib/db';
import { withAnyAuthParams, AuthActor } from '@/lib/modules/api/middleware';
import { ok, badRequest, notFound, forbidden } from '@/lib/modules/api/response';
import { ReviewNotifications } from '@/lib/modules/notifications';

// POST /api/review/[id]/approve - Current user approves this review item
export const POST = withAnyAuthParams(async (
  req: NextRequest,
  actor: AuthActor,
  params: Promise<Record<string, string>>
) => {
  const { id } = await params;

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
      status: 'approved',
      reviewedAt: new Date(),
    },
    include: {
      user: { select: { id: true, displayName: true, avatar: true } },
    },
  });

  // Get actor's display name
  const actorName = updatedAssignment.user.displayName || 'Someone';

  // Notify the uploader
  if (reviewItem.uploadedById !== actor.id) {
    await ReviewNotifications.reviewApproved(
      reviewItem.uploadedById,
      reviewItem.name,
      actorName,
      reviewItem.taskId || undefined
    );
  }

  // Check if all reviewers have approved
  const allAssignments = await prisma.reviewAssignment.findMany({
    where: { reviewItemId: id },
  });

  const allApproved = allAssignments.every(a => a.status === 'approved');

  if (allApproved && allAssignments.length > 0) {
    // Update overall status
    await prisma.reviewItem.update({
      where: { id },
      data: { status: 'approved' },
    });

    // Notify uploader that all reviewers approved
    await ReviewNotifications.allApproved(
      reviewItem.uploadedById,
      reviewItem.name,
      reviewItem.taskId || undefined
    );
  }

  return ok({ assignment: updatedAssignment, allApproved });
});
