import { NextRequest } from 'next/server';
import prisma from '@/lib/db';
import { withAgent, AuthAgent } from '@/lib/modules/api/middleware';
import { created, badRequest, notFound, forbidden } from '@/lib/modules/api/response';

/**
 * POST /api/agents/messages
 * 
 * Post a message as an agent.
 * 
 * Body:
 *   - channelId: Target channel ID
 *   - content: Message content
 *   - replyToId: (optional) Message ID to reply to (inline reply, no thread)
 *   - threadReplyTo: (optional) Message ID to reply to IN A THREAD (creates/joins thread)
 * 
 * Headers:
 *   - X-API-Key: Agent's API key
 */
export const POST = withAgent(async (req: NextRequest, agent: AuthAgent) => {
  const { channelId, content, replyToId, threadReplyTo } = await req.json();

  if (!channelId || !content?.trim()) {
    return badRequest('channelId and content are required');
  }

  // Verify channel exists and agent mode allows posting
  const channel = await prisma.channel.findUnique({
    where: { id: channelId },
    select: {
      id: true,
      name: true,
      slug: true,
      agentMode: true,
      workspaceId: true,
    },
  });

  if (!channel) {
    return notFound('Channel not found');
  }

  if (channel.agentMode === 'disabled') {
    return forbidden('Agent posting is disabled for this channel');
  }

  // Handle thread replies
  let threadId: string | null = null;
  let actualReplyToId: string | null = replyToId || null;

  if (threadReplyTo) {
    const parentMessage = await prisma.message.findUnique({
      where: { id: threadReplyTo },
      include: {
        thread: true,
      },
    });

    if (!parentMessage) {
      return notFound('Parent message not found for thread reply');
    }

    if (parentMessage.threadId) {
      threadId = parentMessage.threadId;
    } else {
      const existingThread = await prisma.thread.findFirst({
        where: {
          channelId: parentMessage.channelId,
          messages: {
            some: {
              replyToId: threadReplyTo,
            },
          },
        },
      });

      if (existingThread) {
        threadId = existingThread.id;
      } else {
        const threadName = parentMessage.content.slice(0, 50) + 
          (parentMessage.content.length > 50 ? '...' : '');
        
        const newThread = await prisma.thread.create({
          data: {
            name: threadName,
            channelId: parentMessage.channelId,
          },
        });
        threadId = newThread.id;
      }
    }

    actualReplyToId = threadReplyTo;
  }

  // Parse @mentions from content
  const mentionRegex = /@(\w+)/g;
  const mentionedUsernames: string[] = [];
  let match;
  while ((match = mentionRegex.exec(content)) !== null) {
    mentionedUsernames.push(match[1].toLowerCase());
  }

  // Look up mentioned users
  let mentionedUsers: { id: string; username: string; isAgent: boolean }[] = [];
  if (mentionedUsernames.length > 0) {
    mentionedUsers = await prisma.user.findMany({
      where: {
        username: { in: mentionedUsernames, mode: 'insensitive' },
      },
      select: { id: true, username: true, isAgent: true },
    });
  }

  // Create the message
  const message = await prisma.message.create({
    data: {
      content: content.trim(),
      type: 'text',
      authorId: agent.id,
      channelId,
      threadId,
      replyToId: actualReplyToId,
      mentions: mentionedUsers.length > 0 ? {
        create: mentionedUsers.map(u => ({ userId: u.id })),
      } : undefined,
    },
    include: {
      author: {
        select: {
          id: true,
          username: true,
          displayName: true,
          avatar: true,
          status: true,
          isAgent: true,
        },
      },
      reactions: true,
      attachments: true,
      mentions: {
        include: {
          user: {
            select: { id: true, username: true, displayName: true },
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
    },
  });

  // Create notifications for mentioned human users (not other agents)
  const mentionedHumans = mentionedUsers.filter(u => !u.isAgent);
  for (const mentionedUser of mentionedHumans) {
    try {
      const notification = await prisma.notification.create({
        data: {
          userId: mentionedUser.id,
          type: 'mention',
          title: `${agent.displayName || agent.username} mentioned you`,
          body: content.substring(0, 200),
          messageId: message.id,
          channelId: channelId,
        },
      });

      // Emit notification via WebSocket
      if (global.io) {
        global.io.to(`user:${mentionedUser.id}`).emit('notification:new', notification);
      }
    } catch (err) {
      console.error('[Agent Message] Failed to create mention notification:', err);
    }
  }

  // Emit WebSocket event for real-time update
  if (global.io) {
    global.io.to(`channel:${channelId}`).emit('message:new', {
      ...message,
      channelId,
    });
  }

  // Update agent's lastSeen
  await prisma.user.update({
    where: { id: agent.id },
    data: { lastSeen: new Date(), status: 'online' },
  });

  return created(message);
});
