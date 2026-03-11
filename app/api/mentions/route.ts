import { NextRequest } from 'next/server';
import prisma from '@/lib/db';
import { withAuth } from '@/lib/modules/api/middleware';
import { ok } from '@/lib/modules/api/response';

/**
 * GET /api/mentions - Get messages where current user is mentioned
 * 
 * Query params:
 *   - limit: Max messages to return (default 50)
 *   - before: Pagination cursor (message ID)
 *   - unreadOnly: Only return unread mentions (not yet implemented)
 */
export const GET = withAuth(async (req: NextRequest, user) => {
  const { searchParams } = new URL(req.url);
  const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100);
  const before = searchParams.get('before');

  // Find messages where user is mentioned
  const mentions = await prisma.mention.findMany({
    where: {
      userId: user.id,
      ...(before && {
        message: {
          createdAt: {
            lt: (await prisma.message.findUnique({ where: { id: before } }))?.createdAt,
          },
        },
      }),
    },
    include: {
      message: {
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
            },
          },
          attachments: true,
        },
      },
    },
    orderBy: {
      message: {
        createdAt: 'desc',
      },
    },
    take: limit,
  });

  // Transform to message-centric response
  const messages = mentions.map((m) => ({
    ...m.message,
    mentionId: m.id,
  }));

  return ok({
    messages,
    hasMore: messages.length === limit,
  });
});
