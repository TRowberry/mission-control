import { NextRequest } from 'next/server';
import prisma from '@/lib/db';
import { withAuth, AuthUser } from '@/lib/modules/api/middleware';
import { ok, badRequest, notFound } from '@/lib/modules/api/response';

// POST /api/chat/messages/pin - Toggle pin status
export const POST = withAuth(async (req: NextRequest, user: AuthUser) => {
  const { messageId } = await req.json();

  if (!messageId) {
    return badRequest('messageId is required');
  }

  const existing = await prisma.message.findUnique({
    where: { id: messageId },
    include: { channel: true },
  });

  if (!existing) {
    return notFound('Message not found');
  }

  // Toggle pin status
  const message = await prisma.message.update({
    where: { id: messageId },
    data: { pinned: !existing.pinned },
    include: {
      author: {
        select: {
          id: true,
          username: true,
          displayName: true,
          avatar: true,
        },
      },
      attachments: true,
    },
  });

  // Emit WebSocket event for real-time update
  if (global.io) {
    global.io.to(`channel:${existing.channelId}`).emit('message:pin', {
      messageId,
      pinned: message.pinned,
      channelId: existing.channelId,
    });
  }

  return ok({ 
    success: true, 
    pinned: message.pinned,
    message,
  });
});

// GET /api/chat/messages/pin?channelId=xxx - Get pinned messages for a channel
export const GET = withAuth(async (req: NextRequest, user: AuthUser) => {
  const { searchParams } = new URL(req.url);
  const channelId = searchParams.get('channelId');

  if (!channelId) {
    return badRequest('channelId is required');
  }

  const pinnedMessages = await prisma.message.findMany({
    where: {
      channelId,
      pinned: true,
    },
    include: {
      author: {
        select: {
          id: true,
          username: true,
          displayName: true,
          avatar: true,
        },
      },
      attachments: true,
    },
    orderBy: { createdAt: 'desc' },
  });

  return ok({ messages: pinnedMessages });
});
