import { NextRequest } from 'next/server';
import prisma from '@/lib/db';
import { withAuth } from '@/lib/modules/api/middleware';
import { ok, badRequest } from '@/lib/modules/api/response';

// GET /api/search?q=query&type=all|messages|tasks&channelId=xxx&limit=20
export const GET = withAuth(async (req: NextRequest, user) => {
  const { searchParams } = new URL(req.url);
  const query = searchParams.get('q')?.trim();
  const type = searchParams.get('type') || 'all';
  const channelId = searchParams.get('channelId');
  const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 50);

  if (!query || query.length < 2) {
    return badRequest('Query must be at least 2 characters');
  }

  const results: {
    messages: any[];
    tasks: any[];
  } = {
    messages: [],
    tasks: [],
  };

  // Search messages
  if (type === 'all' || type === 'messages') {
    const messageWhere: any = {
      content: {
        contains: query,
        mode: 'insensitive',
      },
    };

    // Filter by channel if specified
    if (channelId) {
      messageWhere.channelId = channelId;
    }

    results.messages = await prisma.message.findMany({
      where: messageWhere,
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        author: {
          select: { id: true, displayName: true, avatar: true },
        },
        channel: {
          select: { id: true, name: true },
        },
        attachments: true,
      },
    });
  }

  // Search tasks
  if (type === 'all' || type === 'tasks') {
    const tasks = await prisma.task.findMany({
      where: {
        OR: [
          {
            title: {
              contains: query,
              mode: 'insensitive',
            },
          },
          {
            description: {
              contains: query,
              mode: 'insensitive',
            },
          },
        ],
      },
      orderBy: { updatedAt: 'desc' },
      take: limit,
      include: {
        column: {
          select: { 
            id: true, 
            name: true,
            project: {
              select: { id: true, name: true },
            },
          },
        },
        tags: {
          include: {
            tag: true,
          },
        },
        assignee: {
          select: { id: true, displayName: true, avatar: true },
        },
      },
    });

    // Flatten the project from column.project for easier frontend use
    results.tasks = tasks.map(task => ({
      ...task,
      project: task.column.project,
      tags: task.tags.map(t => t.tag),
    }));
  }

  return ok({
    query,
    results,
    counts: {
      messages: results.messages.length,
      tasks: results.tasks.length,
      total: results.messages.length + results.tasks.length,
    },
  });
});
