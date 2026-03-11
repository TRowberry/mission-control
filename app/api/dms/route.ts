import { NextRequest } from 'next/server';
import prisma from '@/lib/db';
import { withAuth } from '@/lib/modules/api/middleware';
import { ok, created, badRequest, notFound, serverError } from '@/lib/modules/api/response';

/**
 * GET /api/dms - List all DM conversations for the current user
 */
export const GET = withAuth(async (req: NextRequest, user) => {
  // Find all DMs where user is participant
  const dms = await prisma.directMessage.findMany({
    where: {
      OR: [
        { user1Id: user.id },
        { user2Id: user.id },
      ],
    },
    include: {
      user1: {
        select: { id: true, username: true, displayName: true, avatar: true, status: true, isAgent: true },
      },
      user2: {
        select: { id: true, username: true, displayName: true, avatar: true, status: true, isAgent: true },
      },
      channel: {
        include: {
          messages: {
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: {
              id: true,
              content: true,
              createdAt: true,
              author: {
                select: { id: true, displayName: true },
              },
            },
          },
          readStates: {
            where: { userId: user.id },
            select: { lastReadAt: true },
          },
          _count: {
            select: { messages: true },
          },
        },
      },
    },
    orderBy: { updatedAt: 'desc' },
  });

  // Transform to include "other user" and unread status
  const transformed = await Promise.all(dms.map(async (dm) => {
    const otherUser = dm.user1Id === user.id ? dm.user2 : dm.user1;
    const lastMessage = dm.channel.messages[0] || null;
    const lastReadAt = dm.channel.readStates[0]?.lastReadAt;
    
    // Count unread messages
    let unreadCount = 0;
    if (lastReadAt && lastMessage) {
      unreadCount = await prisma.message.count({
        where: {
          channelId: dm.channelId,
          createdAt: { gt: lastReadAt },
          authorId: { not: user.id },
        },
      });
    } else if (lastMessage) {
      unreadCount = await prisma.message.count({
        where: {
          channelId: dm.channelId,
          authorId: { not: user.id },
        },
      });
    }

    return {
      id: dm.id,
      channelId: dm.channelId,
      otherUser,
      lastMessage,
      unreadCount,
      totalMessages: dm.channel._count.messages,
      createdAt: dm.createdAt,
      updatedAt: dm.updatedAt,
    };
  }));

  return ok(transformed);
});

/**
 * POST /api/dms - Create or get existing DM conversation with a user
 */
export const POST = withAuth(async (req: NextRequest, user) => {
  const { userId } = await req.json();

  if (!userId) {
    return badRequest('userId is required');
  }

  if (userId === user.id) {
    return badRequest('Cannot DM yourself');
  }

  // Check if other user exists
  const otherUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, username: true, displayName: true, avatar: true, status: true, isAgent: true },
  });

  if (!otherUser) {
    return notFound('User not found');
  }

  // Check if DM already exists
  const existingDM = await prisma.directMessage.findFirst({
    where: {
      OR: [
        { user1Id: user.id, user2Id: userId },
        { user1Id: userId, user2Id: user.id },
      ],
    },
    include: { channel: true },
  });

  if (existingDM) {
    return ok({
      id: existingDM.id,
      channelId: existingDM.channelId,
      otherUser,
      isNew: false,
    });
  }

  // Get default workspace
  const workspace = await prisma.workspace.findFirst({
    orderBy: { createdAt: 'asc' },
  });

  if (!workspace) {
    return serverError('No workspace found');
  }

  // Create new DM channel
  const dmSlug = `dm-${user.id}-${userId}-${Date.now()}`;
  
  const channel = await prisma.channel.create({
    data: {
      name: `DM: ${user.displayName} & ${otherUser.displayName}`,
      slug: dmSlug,
      type: 'dm',
      isPrivate: true,
      workspaceId: workspace.id,
      agentMode: 'mention-only',
    },
  });

  // Consistent ordering: lower ID is user1
  const [u1, u2] = user.id < userId ? [user.id, userId] : [userId, user.id];

  const dm = await prisma.directMessage.create({
    data: {
      user1Id: u1,
      user2Id: u2,
      channelId: channel.id,
    },
  });

  return created({
    id: dm.id,
    channelId: channel.id,
    otherUser,
    isNew: true,
  });
});
