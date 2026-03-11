import { NextRequest } from 'next/server';
import prisma from '@/lib/db';
import { withAnyAuthParams, AuthActor } from '@/lib/modules/api/middleware';
import { ok, badRequest, notFound } from '@/lib/modules/api/response';
import { ReviewNotifications } from '@/lib/modules/notifications';

// GET /api/review/[id]/assign - Get assigned reviewers
export const GET = withAnyAuthParams(async (
  req: NextRequest,
  actor: AuthActor,
  params: Promise<Record<string, string>>
) => {
  const { id } = await params;

  const reviewItem = await prisma.reviewItem.findUnique({
    where: { id },
    include: {
      reviewers: {
        include: {
          user: {
            select: { id: true, displayName: true, avatar: true, username: true }
          }
        }
      }
    }
  });

  if (!reviewItem) {
    return notFound('Review item not found');
  }

  return ok(reviewItem.reviewers);
});

// POST /api/review/[id]/assign - Assign reviewers
export const POST = withAnyAuthParams(async (
  req: NextRequest,
  actor: AuthActor,
  params: Promise<Record<string, string>>
) => {
  const { id } = await params;
  const { userIds } = await req.json();

  if (!userIds || !Array.isArray(userIds)) {
    return badRequest('userIds array is required');
  }

  const reviewItem = await prisma.reviewItem.findUnique({
    where: { id },
    include: {
      reviewers: { select: { userId: true } },
    },
  });

  if (!reviewItem) {
    return notFound('Review item not found');
  }

  // Get actor's display name for notification
  const actorUser = await prisma.user.findUnique({
    where: { id: actor.id },
    select: { displayName: true },
  });
  const actorName = actorUser?.displayName || 'Someone';

  // Find which users are new (not already assigned)
  const existingUserIds = reviewItem.reviewers.map(r => r.userId);
  const newUserIds = userIds.filter((uid: string) => !existingUserIds.includes(uid));

  // Create assignments for each user (upsert to avoid duplicates)
  const assignments = await Promise.all(
    userIds.map(async (userId: string) => {
      return prisma.reviewAssignment.upsert({
        where: {
          reviewItemId_userId: { reviewItemId: id, userId }
        },
        create: {
          reviewItemId: id,
          userId,
          status: 'pending'
        },
        update: {}, // No update needed, just ensure it exists
        include: {
          user: {
            select: { id: true, displayName: true, avatar: true, username: true }
          }
        }
      });
    })
  );

  // Update review item status to in_review if it was pending
  if (reviewItem.status === 'pending') {
    await prisma.reviewItem.update({
      where: { id },
      data: { status: 'in_review' }
    });
  }

  // Send notifications to newly assigned reviewers
  for (const userId of newUserIds) {
    await ReviewNotifications.assignedAsReviewer(
      userId,
      reviewItem.name,
      actorName,
      reviewItem.taskId || undefined
    );
  }

  return ok(assignments);
});

// DELETE /api/review/[id]/assign - Remove reviewer assignment
export const DELETE = withAnyAuthParams(async (
  req: NextRequest,
  actor: AuthActor,
  params: Promise<Record<string, string>>
) => {
  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const userId = searchParams.get('userId');

  if (!userId) {
    return badRequest('userId query param is required');
  }

  const reviewItem = await prisma.reviewItem.findUnique({
    where: { id }
  });

  if (!reviewItem) {
    return notFound('Review item not found');
  }

  try {
    await prisma.reviewAssignment.delete({
      where: {
        reviewItemId_userId: { reviewItemId: id, userId }
      }
    });
    return ok({ deleted: true });
  } catch {
    return notFound('Assignment not found');
  }
});
