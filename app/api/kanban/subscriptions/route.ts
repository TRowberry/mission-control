import { NextRequest } from 'next/server';
import prisma from '@/lib/db';
import { withAuth, AuthUser } from '@/lib/modules/api/middleware';
import { ok, created, badRequest, notFound } from '@/lib/modules/api/response';

/**
 * GET /api/kanban/subscriptions?taskId=xxx
 * 
 * Get subscriptions for a task, or check if current user is subscribed.
 */
export const GET = withAuth(async (req: NextRequest, user: AuthUser) => {
  const { searchParams } = new URL(req.url);
  const taskId = searchParams.get('taskId');

  if (!taskId) {
    return badRequest('taskId is required');
  }

  // Check if current user is subscribed
  const subscription = await prisma.taskSubscription.findUnique({
    where: {
      userId_taskId: { userId: user.id, taskId },
    },
  });

  // Get all subscribers for this task
  const subscribers = await prisma.taskSubscription.findMany({
    where: { taskId },
    include: {
      user: { select: { id: true, displayName: true, avatar: true } },
    },
  });

  return ok({
    isSubscribed: !!subscription,
    subscribers: subscribers.map(s => s.user),
    subscriberCount: subscribers.length,
  });
});

/**
 * POST /api/kanban/subscriptions
 * 
 * Subscribe to a task.
 * Body: { taskId: string }
 */
export const POST = withAuth(async (req: NextRequest, user: AuthUser) => {
  const { taskId } = await req.json();

  if (!taskId) {
    return badRequest('taskId is required');
  }

  // Verify task exists
  const task = await prisma.task.findUnique({
    where: { id: taskId },
  });

  if (!task) {
    return notFound('Task not found');
  }

  // Check if already subscribed
  const existing = await prisma.taskSubscription.findUnique({
    where: {
      userId_taskId: { userId: user.id, taskId },
    },
  });

  if (existing) {
    return ok({ message: 'Already subscribed', subscription: existing });
  }

  const subscription = await prisma.taskSubscription.create({
    data: {
      userId: user.id,
      taskId,
    },
  });

  return created(subscription);
});

/**
 * DELETE /api/kanban/subscriptions?taskId=xxx
 * 
 * Unsubscribe from a task.
 */
export const DELETE = withAuth(async (req: NextRequest, user: AuthUser) => {
  const { searchParams } = new URL(req.url);
  const taskId = searchParams.get('taskId');

  if (!taskId) {
    return badRequest('taskId is required');
  }

  // Delete subscription
  await prisma.taskSubscription.deleteMany({
    where: {
      userId: user.id,
      taskId,
    },
  });

  return ok({ success: true });
});
