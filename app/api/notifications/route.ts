import { NextRequest } from 'next/server';
import prisma from '@/lib/db';
import { withAuth, AuthUser } from '@/lib/modules/api/middleware';
import { ok, created, badRequest, notFound, serverError } from '@/lib/modules/api/response';

/**
 * GET /api/notifications
 * 
 * Get notifications for the current user.
 * 
 * Query params:
 *   - limit: Max notifications (default 20)
 *   - unreadOnly: Only return unread (default false)
 *   - before: Pagination cursor (notification ID)
 */
export const GET = withAuth(async (request: NextRequest, user: AuthUser) => {
  const { searchParams } = new URL(request.url);
  const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 50);
  const unreadOnly = searchParams.get('unreadOnly') === 'true';
  const before = searchParams.get('before');

  const notifications = await prisma.notification.findMany({
    where: {
      userId: user.id,
      ...(unreadOnly && { read: false }),
      ...(before && {
        createdAt: {
          lt: (await prisma.notification.findUnique({ where: { id: before } }))?.createdAt,
        },
      }),
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });

  // Get unread count
  const unreadCount = await prisma.notification.count({
    where: {
      userId: user.id,
      read: false,
    },
  });

  return ok({
    notifications,
    unreadCount,
    hasMore: notifications.length === limit,
  });
});

/**
 * POST /api/notifications
 * 
 * Create a notification (internal use - called when mentions/replies happen).
 * 
 * Body:
 *   - userId: Target user ID
 *   - type: Notification type (mention, reply, dm, system)
 *   - title: Notification title
 *   - body: Optional body text
 *   - messageId: Optional linked message
 *   - channelId: Optional linked channel
 */
export const POST = withAuth(async (request: NextRequest, _user: AuthUser) => {
  const { userId, type, title, body, messageId, channelId } = await request.json();

  if (!userId || !type || !title) {
    return badRequest('userId, type, and title are required');
  }

  const notification = await prisma.notification.create({
    data: {
      userId,
      type,
      title,
      body: body || null,
      messageId: messageId || null,
      channelId: channelId || null,
    },
  });

  // Emit WebSocket event if available
  if (global.io) {
    global.io.to(`user:${userId}`).emit('notification:new', notification);
  }

  return created(notification);
});

/**
 * PATCH /api/notifications
 * 
 * Mark notifications as read.
 * 
 * Body:
 *   - notificationId: Single notification to mark read
 *   - markAllRead: If true, mark all as read
 */
export const PATCH = withAuth(async (request: NextRequest, user: AuthUser) => {
  const { notificationId, markAllRead } = await request.json();

  if (markAllRead) {
    await prisma.notification.updateMany({
      where: {
        userId: user.id,
        read: false,
      },
      data: {
        read: true,
        readAt: new Date(),
      },
    });

    return ok({ success: true, markedAll: true });
  }

  if (!notificationId) {
    return badRequest('notificationId or markAllRead required');
  }

  // Verify ownership
  const notification = await prisma.notification.findUnique({
    where: { id: notificationId },
  });

  if (!notification || notification.userId !== user.id) {
    return notFound('Notification not found');
  }

  const updated = await prisma.notification.update({
    where: { id: notificationId },
    data: {
      read: true,
      readAt: new Date(),
    },
  });

  return ok(updated);
});

/**
 * DELETE /api/notifications
 * 
 * Delete a notification.
 * 
 * Query: ?notificationId=xxx
 */
export const DELETE = withAuth(async (request: NextRequest, user: AuthUser) => {
  const { searchParams } = new URL(request.url);
  const notificationId = searchParams.get('notificationId');

  if (!notificationId) {
    return badRequest('notificationId required');
  }

  // Verify ownership
  const notification = await prisma.notification.findUnique({
    where: { id: notificationId },
  });

  if (!notification || notification.userId !== user.id) {
    return notFound('Notification not found');
  }

  await prisma.notification.delete({
    where: { id: notificationId },
  });

  return ok({ success: true });
});
