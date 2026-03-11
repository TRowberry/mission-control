import { NextRequest } from 'next/server';
import prisma from '@/lib/db';
import { withAuth, AuthUser } from '@/lib/modules/api/middleware';
import { ok, badRequest, notFound } from '@/lib/modules/api/response';

/**
 * GET /api/channels/read
 * 
 * Get unread message counts for all channels the user has access to.
 * Returns channelId -> unreadCount mapping.
 */
export const GET = withAuth(async (req: NextRequest, user: AuthUser) => {
  // Get all channels with their latest message and user's read state
  const channels = await prisma.channel.findMany({
    select: {
      id: true,
      readStates: {
        where: { userId: user.id },
        select: { lastReadAt: true },
      },
      messages: {
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: { createdAt: true },
      },
      _count: {
        select: { messages: true },
      },
    },
  });

  // Calculate unread counts
  const unreadCounts: Record<string, { unreadCount: number; hasUnread: boolean }> = {};

  for (const channel of channels) {
    const lastReadAt = channel.readStates[0]?.lastReadAt;
    const latestMessageAt = channel.messages[0]?.createdAt;

    if (!latestMessageAt) {
      // No messages in channel
      unreadCounts[channel.id] = { unreadCount: 0, hasUnread: false };
      continue;
    }

    if (!lastReadAt) {
      // User has never read this channel - all messages are unread
      unreadCounts[channel.id] = { 
        unreadCount: channel._count.messages, 
        hasUnread: true 
      };
      continue;
    }

    // Count messages newer than lastReadAt
    const unreadCount = await prisma.message.count({
      where: {
        channelId: channel.id,
        createdAt: { gt: lastReadAt },
      },
    });

    unreadCounts[channel.id] = {
      unreadCount,
      hasUnread: unreadCount > 0,
    };
  }

  return ok(unreadCounts);
});

/**
 * POST /api/channels/read
 * 
 * Mark a channel as read (updates lastReadAt to now).
 * 
 * Body:
 *   - channelId: Channel to mark as read
 */
export const POST = withAuth(async (req: NextRequest, user: AuthUser) => {
  const { channelId } = await req.json();

  if (!channelId) {
    return badRequest('channelId is required');
  }

  // Verify channel exists
  const channel = await prisma.channel.findUnique({
    where: { id: channelId },
  });

  if (!channel) {
    return notFound('Channel not found');
  }

  // Upsert the read state
  const readState = await prisma.channelRead.upsert({
    where: {
      userId_channelId: {
        userId: user.id,
        channelId,
      },
    },
    update: {
      lastReadAt: new Date(),
    },
    create: {
      userId: user.id,
      channelId,
      lastReadAt: new Date(),
    },
  });

  // Emit WebSocket event so other tabs/clients update
  if (global.io) {
    global.io.to(`user:${user.id}`).emit('channel:read', {
      channelId,
      lastReadAt: readState.lastReadAt,
    });
  }

  return ok({
    success: true,
    channelId,
    lastReadAt: readState.lastReadAt,
  });
});
