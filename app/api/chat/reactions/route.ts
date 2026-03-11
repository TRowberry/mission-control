import { NextRequest } from 'next/server';
import prisma from '@/lib/db';
import { withAuth, AuthUser } from '@/lib/modules/api/middleware';
import { ok, created, badRequest, notFound } from '@/lib/modules/api/response';

// POST /api/chat/reactions - Add reaction
export const POST = withAuth(async (req: NextRequest, user: AuthUser) => {
  const { messageId, emoji } = await req.json();

  if (!messageId || !emoji) {
    return badRequest('messageId and emoji are required');
  }

  // Verify message exists
  const message = await prisma.message.findUnique({
    where: { id: messageId },
  });

  if (!message) {
    return notFound('Message not found');
  }

  // Check if user already reacted with this emoji
  const existing = await prisma.reaction.findFirst({
    where: {
      messageId,
      userId: user.id,
      emoji,
    },
  });

  if (existing) {
    // Remove reaction (toggle off)
    await prisma.reaction.delete({
      where: { id: existing.id },
    });

    // Emit WebSocket event
    if (global.io) {
      global.io.to(`channel:${message.channelId}`).emit('reaction:remove', {
        messageId,
        emoji,
        userId: user.id,
        channelId: message.channelId,
      });
    }

    return ok({ removed: true });
  }

  // Add new reaction
  const reaction = await prisma.reaction.create({
    data: {
      emoji,
      messageId,
      userId: user.id,
    },
    include: {
      user: {
        select: { id: true, username: true, displayName: true },
      },
    },
  });

  // Emit WebSocket event
  if (global.io) {
    global.io.to(`channel:${message.channelId}`).emit('reaction:add', {
      messageId,
      reaction,
      channelId: message.channelId,
    });
  }

  return created(reaction);
});

// DELETE /api/chat/reactions - Remove reaction
export const DELETE = withAuth(async (req: NextRequest, user: AuthUser) => {
  const { searchParams } = new URL(req.url);
  const messageId = searchParams.get('messageId');
  const emoji = searchParams.get('emoji');

  if (!messageId || !emoji) {
    return badRequest('messageId and emoji are required');
  }

  const message = await prisma.message.findUnique({
    where: { id: messageId },
  });

  if (!message) {
    return notFound('Message not found');
  }

  // Find and delete the reaction
  const reaction = await prisma.reaction.findFirst({
    where: {
      messageId,
      userId: user.id,
      emoji,
    },
  });

  if (!reaction) {
    return notFound('Reaction not found');
  }

  await prisma.reaction.delete({
    where: { id: reaction.id },
  });

  // Emit WebSocket event
  if (global.io) {
    global.io.to(`channel:${message.channelId}`).emit('reaction:remove', {
      messageId,
      emoji,
      userId: user.id,
      channelId: message.channelId,
    });
  }

  return ok({ success: true });
});
