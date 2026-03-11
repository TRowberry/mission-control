import prisma from '@/lib/db';

interface CreateNotificationParams {
  userId: string;
  type: string;
  title: string;
  body?: string | null;
  messageId?: string | null;
  channelId?: string | null;
  taskId?: string | null;
}

/**
 * Create a notification and emit a WebSocket event if available.
 */
export async function createNotification(params: CreateNotificationParams) {
  const { userId, type, title, body, messageId, channelId, taskId } = params;

  // Don't create notification if userId is missing
  if (!userId) return null;

  const notification = await prisma.notification.create({
    data: {
      userId,
      type,
      title,
      body: body || null,
      messageId: messageId || null,
      channelId: channelId || null,
      taskId: taskId || null,
    },
  });

  // Emit WebSocket event if available
  if (global.io) {
    global.io.to(`user:${userId}`).emit('notification:new', notification);
  }

  return notification;
}

/**
 * Create notifications for multiple users.
 */
export async function createNotifications(
  userIds: string[],
  params: Omit<CreateNotificationParams, 'userId'>
) {
  const notifications = await Promise.all(
    userIds.map((userId) => createNotification({ ...params, userId }))
  );
  return notifications.filter(Boolean);
}

/**
 * Notification types for review system
 */
export const ReviewNotificationTypes = {
  ASSIGNED_AS_REVIEWER: 'review_assigned',
  NEW_ANNOTATION: 'review_annotation',
  ANNOTATION_REPLY: 'review_reply',
  REVIEW_APPROVED: 'review_approved',
  REVIEW_REJECTED: 'review_rejected',
  ALL_APPROVED: 'review_all_approved',
} as const;

/**
 * Helper to create review-related notifications
 */
export const ReviewNotifications = {
  /**
   * Notify user they've been assigned as a reviewer
   */
  async assignedAsReviewer(
    userId: string,
    reviewItemName: string,
    assignedByName: string,
    taskId?: string
  ) {
    return createNotification({
      userId,
      type: ReviewNotificationTypes.ASSIGNED_AS_REVIEWER,
      title: 'Review requested',
      body: `${assignedByName} requested your review on "${reviewItemName}"`,
      taskId,
    });
  },

  /**
   * Notify uploader and reviewers about a new annotation
   */
  async newAnnotation(
    userIds: string[],
    reviewItemName: string,
    authorName: string,
    content: string,
    taskId?: string
  ) {
    const preview = content.length > 50 ? content.slice(0, 50) + '...' : content;
    return createNotifications(userIds, {
      type: ReviewNotificationTypes.NEW_ANNOTATION,
      title: `New feedback on "${reviewItemName}"`,
      body: `${authorName}: ${preview}`,
      taskId,
    });
  },

  /**
   * Notify annotation author about a reply
   */
  async annotationReply(
    userId: string,
    reviewItemName: string,
    replierName: string,
    content: string,
    taskId?: string
  ) {
    const preview = content.length > 50 ? content.slice(0, 50) + '...' : content;
    return createNotification({
      userId,
      type: ReviewNotificationTypes.ANNOTATION_REPLY,
      title: 'Reply to your feedback',
      body: `${replierName} on "${reviewItemName}": ${preview}`,
      taskId,
    });
  },

  /**
   * Notify uploader that review was approved
   */
  async reviewApproved(
    userId: string,
    reviewItemName: string,
    approverName: string,
    taskId?: string
  ) {
    return createNotification({
      userId,
      type: ReviewNotificationTypes.REVIEW_APPROVED,
      title: 'Review approved!',
      body: `${approverName} approved "${reviewItemName}"`,
      taskId,
    });
  },

  /**
   * Notify uploader that review was rejected
   */
  async reviewRejected(
    userId: string,
    reviewItemName: string,
    rejecterName: string,
    taskId?: string
  ) {
    return createNotification({
      userId,
      type: ReviewNotificationTypes.REVIEW_REJECTED,
      title: 'Changes requested',
      body: `${rejecterName} requested changes on "${reviewItemName}"`,
      taskId,
    });
  },

  /**
   * Notify uploader that all reviewers have approved
   */
  async allApproved(
    userId: string,
    reviewItemName: string,
    taskId?: string
  ) {
    return createNotification({
      userId,
      type: ReviewNotificationTypes.ALL_APPROVED,
      title: 'All reviewers approved!',
      body: `"${reviewItemName}" is ready to publish`,
      taskId,
    });
  },
};
