import { NextRequest } from 'next/server';
import prisma from '@/lib/db';
import { withAuth } from '@/lib/modules/api/middleware';
import { ok } from '@/lib/modules/api/response';

// GET /api/users?search=query&workspaceId=... - List/search users, optionally scoped to a workspace
export const GET = withAuth(async (req: NextRequest, _user) => {
  const { searchParams } = new URL(req.url);
  const search = searchParams.get('search')?.trim();
  const workspaceId = searchParams.get('workspaceId');
  const limit = Math.min(parseInt(searchParams.get('limit') || '10'), 50);

  let where: Record<string, unknown> = {};

  if (workspaceId) {
    // Scope to workspace members
    where = {
      workspaces: { some: { workspaceId } },
      ...(search && {
        OR: [
          { username: { contains: search, mode: 'insensitive' } },
          { displayName: { contains: search, mode: 'insensitive' } },
        ],
      }),
    };
  } else if (search) {
    where = {
      OR: [
        { username: { contains: search, mode: 'insensitive' as const } },
        { displayName: { contains: search, mode: 'insensitive' as const } },
      ],
    };
  }

  const users = await prisma.user.findMany({
    where,
    select: {
      id: true,
      username: true,
      displayName: true,
      avatar: true,
      status: true,
      isAgent: true,
      createdAt: true,
    },
    orderBy: { displayName: 'asc' },
    take: limit,
  });

  return ok(users);
});
