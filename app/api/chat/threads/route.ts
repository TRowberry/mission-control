import { NextRequest } from 'next/server';
import prisma from '@/lib/db';
import { withAuth, AuthUser } from '@/lib/modules/api/middleware';
import { ok, created, badRequest, notFound } from '@/lib/modules/api/response';

// GET /api/chat/threads?id=xxx - Get thread with messages
export const GET = withAuth(async (req: NextRequest, user: AuthUser) => {
  const { searchParams } = new URL(req.url);
  const threadId = searchParams.get('id');
  const parentMessageId = searchParams.get('parentMessageId');

  if (threadId) {
    // Get existing thread
    const thread = await prisma.thread.findUnique({
      where: { id: threadId },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' },
          include: {
            author: {
              select: { id: true, displayName: true, avatar: true },
            },
            reactions: {
              include: {
                user: { select: { id: true, displayName: true } },
              },
            },
            attachments: true,
          },
        },
        channel: {
          select: { id: true, name: true },
        },
      },
    });

    if (!thread) {
      return notFound('Thread not found');
    }

    // Also get the parent message (first message that started the thread)
    const parentMessage = await prisma.message.findFirst({
      where: {
        channelId: thread.channelId,
        content: { not: '' },
        threadId: null,
        createdAt: { lte: thread.createdAt },
      },
      orderBy: { createdAt: 'desc' },
      include: {
        author: {
          select: { id: true, displayName: true, avatar: true },
        },
      },
    });

    return ok({ thread, parentMessage });
  }

  if (parentMessageId) {
    // Find thread for a specific parent message
    const parentMessage = await prisma.message.findUnique({
      where: { id: parentMessageId },
    });

    if (!parentMessage) {
      return notFound('Message not found');
    }

    // Check if thread exists for this message
    const thread = await prisma.thread.findFirst({
      where: {
        channelId: parentMessage.channelId,
        messages: {
          some: {
            replyToId: parentMessageId,
          },
        },
      },
      include: {
        _count: {
          select: { messages: true },
        },
      },
    });

    return ok({ thread });
  }

  return badRequest('id or parentMessageId required');
});

// POST /api/chat/threads - Create thread and first reply
export const POST = withAuth(async (req: NextRequest, user: AuthUser) => {
  const { parentMessageId, content, attachments } = await req.json();

  if (!parentMessageId || (!content && (!attachments || attachments.length === 0))) {
    return badRequest('parentMessageId and content or attachments required');
  }

  // Get parent message
  const parentMessage = await prisma.message.findUnique({
    where: { id: parentMessageId },
    include: {
      author: { select: { displayName: true } },
      thread: true,
    },
  });

  if (!parentMessage) {
    return notFound('Parent message not found');
  }

  let thread = parentMessage.thread;

  // Create thread if doesn't exist
  if (!thread) {
    const threadName = parentMessage.content.slice(0, 50) + (parentMessage.content.length > 50 ? '...' : '');
    
    thread = await prisma.thread.create({
      data: {
        name: threadName,
        channelId: parentMessage.channelId,
      },
    });

    // NOTE: We do NOT set threadId on the parent message - it stays in main channel
    // Only reply messages get threadId set
  }

  // Create the reply message with optional attachments
  const message = await prisma.message.create({
    data: {
      content: content || '',
      authorId: user.id,
      channelId: parentMessage.channelId,
      threadId: thread.id,
      replyToId: parentMessageId,
      attachments: attachments && attachments.length > 0 ? {
        create: attachments.map((a: { url: string; name: string; type: string; size: number }) => ({
          url: a.url,
          name: a.name,
          type: a.type,
          size: a.size,
        })),
      } : undefined,
    },
    include: {
      author: {
        select: { id: true, displayName: true, avatar: true },
      },
      reactions: true,
      attachments: true,
    },
  });

  // Get updated thread with message count
  const updatedThread = await prisma.thread.findUnique({
    where: { id: thread.id },
    include: {
      _count: {
        select: { messages: true },
      },
      messages: {
        orderBy: { createdAt: 'desc' },
        take: 1,
        include: {
          author: { select: { displayName: true } },
        },
      },
    },
  });

  return created({ message, thread: updatedThread });
});
