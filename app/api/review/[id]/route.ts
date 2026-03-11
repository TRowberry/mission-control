import { NextRequest } from 'next/server';
import prisma from '@/lib/db';
import { withAnyAuthParams, AuthActor } from '@/lib/modules/api/middleware';
import { ok, badRequest, notFound } from '@/lib/modules/api/response';

// GET /api/review/[id] - Get review item with annotations
export const GET = withAnyAuthParams(async (
  req: NextRequest,
  actor: AuthActor,
  params: Promise<Record<string, string>>
) => {
  const { id } = await params;

  const reviewItem = await prisma.reviewItem.findUnique({
    where: { id },
    include: {
      uploadedBy: { select: { id: true, displayName: true, avatar: true } },
      task: { select: { id: true, title: true, columnId: true } },
      annotations: {
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
      },
      reviewers: {
        include: {
          user: { select: { id: true, displayName: true, avatar: true } },
        },
      },
      versions: {
        include: {
          uploadedBy: { select: { id: true, displayName: true, avatar: true } },
        },
        orderBy: { version: 'desc' },
      },
    },
  });

  if (!reviewItem) {
    return notFound('Review item not found');
  }

  return ok(reviewItem);
});

// POST /api/review/[id]/versions - Upload new version
export const POST = withAnyAuthParams(async (
  req: NextRequest,
  actor: AuthActor,
  params: Promise<Record<string, string>>
) => {
  const { id } = await params;
  const { url, notes } = await req.json();

  if (!url) {
    return badRequest('url is required');
  }

  const reviewItem = await prisma.reviewItem.findUnique({
    where: { id },
  });

  if (!reviewItem) {
    return notFound('Review item not found');
  }

  // Create new version and update main item
  const [version, updatedItem] = await prisma.$transaction([
    prisma.reviewItemVersion.create({
      data: {
        reviewItemId: id,
        version: reviewItem.version + 1,
        url,
        notes,
        uploadedById: actor.id,
      },
      include: {
        uploadedBy: { select: { id: true, displayName: true, avatar: true } },
      },
    }),
    prisma.reviewItem.update({
      where: { id },
      data: {
        version: reviewItem.version + 1,
        url, // Update main URL to new version
        status: 'pending', // Reset status for new review
      },
    }),
  ]);

  return ok({ version, item: updatedItem });
});
