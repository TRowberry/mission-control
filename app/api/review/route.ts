import { NextRequest } from 'next/server';
import prisma from '@/lib/db';
import { withAnyAuth, AuthActor } from '@/lib/modules/api/middleware';
import { ok, created, badRequest, notFound, forbidden } from '@/lib/modules/api/response';
import { ReviewNotifications } from '@/lib/modules/notifications';

// GET /api/review - List review items
export const GET = withAnyAuth(async (req: NextRequest, actor: AuthActor) => {
  const { searchParams } = new URL(req.url);
  const taskId = searchParams.get('taskId');
  const status = searchParams.get('status');
  const type = searchParams.get('type');
  const limit = parseInt(searchParams.get('limit') || '50');
  const offset = parseInt(searchParams.get('offset') || '0');

  const where: any = {};
  
  if (taskId) where.taskId = taskId;
  if (status) where.status = status;
  if (type) where.type = type;

  const [items, total] = await Promise.all([
    prisma.reviewItem.findMany({
      where,
      include: {
        uploadedBy: { select: { id: true, displayName: true, avatar: true } },
        task: { select: { id: true, title: true } },
        reviewers: {
          include: {
            user: { select: { id: true, displayName: true, avatar: true, username: true } },
          },
        },
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
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    }),
    prisma.reviewItem.count({ where }),
  ]);

  return ok({ items, total, limit, offset });
});

// POST /api/review - Create review item
export const POST = withAnyAuth(async (req: NextRequest, actor: AuthActor) => {
  const { name, url, thumbnailUrl, type, taskId, width, height, duration } = await req.json();

  if (!name || !url || !type) {
    return badRequest('name, url, and type are required');
  }

  if (!['image', 'video'].includes(type)) {
    return badRequest('type must be "image" or "video"');
  }

  // If taskId provided, verify user has access to the task's project
  if (taskId) {
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      include: { column: { include: { project: true } } },
    });
    if (!task) {
      return notFound('Task not found');
    }
  }

  const reviewItem = await prisma.reviewItem.create({
    data: {
      name,
      url,
      thumbnailUrl,
      type,
      width,
      height,
      duration,
      taskId,
      uploadedById: actor.id,
      status: 'pending',
    },
    include: {
      uploadedBy: { select: { id: true, displayName: true, avatar: true } },
      task: { select: { id: true, title: true } },
      annotations: true, // Will be empty array for new items
    },
  });

  return created(reviewItem);
});

// PATCH /api/review - Update review item
export const PATCH = withAnyAuth(async (req: NextRequest, actor: AuthActor) => {
  const { id, status, name, taskId } = await req.json();

  if (!id) {
    return badRequest('id is required');
  }

  const existing = await prisma.reviewItem.findUnique({
    where: { id },
    include: { uploadedBy: true },
  });

  if (!existing) {
    return notFound('Review item not found');
  }

  // Only uploader or workspace admins can update
  // For now, allow anyone with access
  const validStatuses = ['pending', 'in_review', 'approved', 'rejected'];
  if (status && !validStatuses.includes(status)) {
    return badRequest('Invalid status');
  }

  const reviewItem = await prisma.reviewItem.update({
    where: { id },
    data: {
      ...(status && { status }),
      ...(name && { name }),
      ...(taskId !== undefined && { taskId }),
    },
    include: {
      uploadedBy: { select: { id: true, displayName: true, avatar: true } },
      task: { select: { id: true, title: true } },
      _count: { select: { annotations: true, reviewers: true } },
    },
  });

  // Send notifications for status changes
  if (status && status !== existing.status && existing.uploadedById !== actor.id) {
    const actorUser = await prisma.user.findUnique({
      where: { id: actor.id },
      select: { displayName: true },
    });
    const actorName = actorUser?.displayName || 'Someone';

    if (status === 'approved') {
      await ReviewNotifications.reviewApproved(
        existing.uploadedById,
        existing.name,
        actorName,
        existing.taskId || undefined
      );
    } else if (status === 'rejected') {
      await ReviewNotifications.reviewRejected(
        existing.uploadedById,
        existing.name,
        actorName,
        existing.taskId || undefined
      );
    }
  }

  return ok(reviewItem);
});

// DELETE /api/review - Delete review item
export const DELETE = withAnyAuth(async (req: NextRequest, actor: AuthActor) => {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');

  if (!id) {
    return badRequest('id is required');
  }

  const existing = await prisma.reviewItem.findUnique({
    where: { id },
  });

  if (!existing) {
    return notFound('Review item not found');
  }

  await prisma.reviewItem.delete({ where: { id } });

  return ok({ deleted: true });
});
