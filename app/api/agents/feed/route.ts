import { NextRequest } from 'next/server';
import prisma from '@/lib/db';
import { withAgent, AuthAgent } from '@/lib/modules/api/middleware';
import { ok } from '@/lib/modules/api/response';

/**
 * GET /api/agents/feed
 * 
 * Polling endpoint for agents to get new messages.
 * Returns messages based on channel agentMode settings.
 * 
 * Query params:
 *   - since: ISO timestamp - only messages after this time
 *   - channelIds: comma-separated channel IDs (optional filter)
 *   - limit: max messages to return (default 50, max 100)
 * 
 * Headers:
 *   - X-API-Key: Agent's API key
 */
export const GET = withAgent(async (req: NextRequest, agent: AuthAgent) => {
  const { searchParams } = new URL(req.url);
  const since = searchParams.get('since');
  const channelIdsParam = searchParams.get('channelIds');
  const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100);

  // Build channel filter
  const channelIds = channelIdsParam?.split(',').filter(Boolean);

  // Get channels the agent can see (based on agentMode)
  const channels = await prisma.channel.findMany({
    where: {
      agentMode: { not: 'disabled' },
      ...(channelIds && { id: { in: channelIds } }),
    },
    select: {
      id: true,
      name: true,
      slug: true,
      agentMode: true,
      workspaceId: true,
    },
  });

  const channelMap = new Map(channels.map(c => [c.id, c]));
  const allowedChannelIds = channels.map(c => c.id);

  if (allowedChannelIds.length === 0) {
    return ok({
      messages: [],
      channels: [],
      notifications: [],
      assignedTasks: { count: 0, tasks: [] },
      agentId: agent.id,
      serverTime: new Date().toISOString(),
    });
  }

  // Get messages since the given timestamp
  const messages = await prisma.message.findMany({
    where: {
      channelId: { in: allowedChannelIds },
      authorId: { not: agent.id },
      ...(since && {
        createdAt: { gt: new Date(since) },
      }),
    },
    orderBy: { createdAt: 'asc' },
    take: limit,
    include: {
      author: {
        select: {
          id: true,
          username: true,
          displayName: true,
          avatar: true,
          isAgent: true,
        },
      },
      channel: {
        select: {
          id: true,
          name: true,
          slug: true,
          agentMode: true,
        },
      },
      mentions: {
        include: {
          user: {
            select: { id: true, username: true },
          },
        },
      },
      replyTo: {
        select: {
          id: true,
          content: true,
          author: {
            select: {
              id: true,
              username: true,
              displayName: true,
            },
          },
        },
      },
      attachments: true,
    },
  });

  // Filter messages based on channel agentMode
  const filteredMessages = messages.filter(msg => {
    const channel = channelMap.get(msg.channelId);
    if (!channel) return false;

    if (channel.agentMode === 'auto-reply') {
      return true;
    } else if (channel.agentMode === 'mention-only') {
      const isMentioned = msg.mentions.some(m => m.userId === agent.id);
      const usernamePattern = new RegExp(`@${agent.username}\\b`, 'i');
      const mentionedInContent = usernamePattern.test(msg.content);
      return isMentioned || mentionedInContent;
    }
    return false;
  });

  // Add metadata about whether agent was mentioned
  const enrichedMessages = filteredMessages.map(msg => ({
    ...msg,
    _meta: {
      agentMentioned: msg.mentions.some(m => m.userId === agent.id) ||
        new RegExp(`@${agent.username}\\b`, 'i').test(msg.content),
      channelAgentMode: channelMap.get(msg.channelId)?.agentMode,
    },
  }));

  // Get notifications for the agent
  const notifications = await prisma.notification.findMany({
    where: {
      userId: agent.id,
      read: false,
      ...(since && {
        createdAt: { gt: new Date(since) },
      }),
    },
    orderBy: { createdAt: 'desc' },
    take: 20,
  });

  // Get tasks assigned to this agent
  const assignedTasks = await prisma.task.findMany({
    where: {
      assigneeId: agent.id,
      completedAt: null,
    },
    select: {
      id: true,
      title: true,
      priority: true,
      dueDate: true,
      state: { select: { name: true, group: true } },
    },
    take: 10,
  });

  return ok({
    messages: enrichedMessages,
    channels,
    notifications,
    assignedTasks: {
      count: assignedTasks.length,
      tasks: assignedTasks,
    },
    agentId: agent.id,
    serverTime: new Date().toISOString(),
  });
});
