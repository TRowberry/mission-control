import { NextRequest } from 'next/server';
import prisma from '@/lib/db';
import { withAuthParams, AuthUser } from '@/lib/modules/api/middleware';
import { ok, notFound } from '@/lib/modules/api/response';

// GET /api/channels/[id]/members - Get channel members with their channel memberships
export const GET = withAuthParams(async (
  req: NextRequest,
  user: AuthUser,
  params: Promise<Record<string, string>>
) => {
  const { id: channelId } = await params;

  // Get the channel
  const channel = await prisma.channel.findUnique({
    where: { id: channelId },
    include: {
      workspace: true,
      directMessage: {
        include: {
          user1: {
            select: {
              id: true,
              username: true,
              displayName: true,
              avatar: true,
              status: true,
              isAgent: true,
            },
          },
          user2: {
            select: {
              id: true,
              username: true,
              displayName: true,
              avatar: true,
              status: true,
              isAgent: true,
            },
          },
        },
      },
    },
  });

  if (!channel) {
    return notFound('Channel not found');
  }

  // Get all non-DM channels in workspace (for showing memberships)
  const allChannels = await prisma.channel.findMany({
    where: { 
      workspaceId: channel.workspaceId,
      type: { not: 'dm' },
    },
    select: { id: true, name: true, slug: true },
    orderBy: { position: 'asc' },
  });

  // Get all DMs in workspace
  const allDMs = await prisma.directMessage.findMany({
    where: {
      channel: { workspaceId: channel.workspaceId },
    },
    select: {
      user1Id: true,
      user2Id: true,
      channel: { select: { id: true, name: true } },
    },
  });

  // Helper to get channels for a user
  const getChannelsForUser = (userId: string) => {
    // Regular channels (all members have access for now)
    const regularChannels = allChannels.map((ch) => ({
      id: ch.id,
      name: ch.name,
      slug: ch.slug,
    }));

    // DM channels where user is a participant
    const dmChannels = allDMs
      .filter((dm) => dm.user1Id === userId || dm.user2Id === userId)
      .map((dm) => ({
        id: dm.channel.id,
        name: dm.channel.name,
        slug: 'dm',
      }));

    return [...regularChannels, ...dmChannels];
  };

  let members;

  if (channel.type === 'dm' && channel.directMessage) {
    // For DMs, return the two participants with their channels
    members = [
      { ...channel.directMessage.user1, channels: getChannelsForUser(channel.directMessage.user1.id) },
      { ...channel.directMessage.user2, channels: getChannelsForUser(channel.directMessage.user2.id) },
    ];
  } else {
    // For regular channels, return all workspace members with their channels
    const workspaceMembers = await prisma.workspaceMember.findMany({
      where: { workspaceId: channel.workspaceId },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatar: true,
            status: true,
            isAgent: true,
          },
        },
      },
      orderBy: { joinedAt: 'asc' },
    });

    members = workspaceMembers.map((wm) => ({
      ...wm.user,
      role: wm.role,
      joinedAt: wm.joinedAt,
      channels: getChannelsForUser(wm.user.id),
    }));
  }

  return ok({ 
    members, 
    channelType: channel.type,
    allChannels, // Include for reference
  });
});
