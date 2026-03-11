import { NextRequest } from 'next/server';
import prisma from '@/lib/db';
import { withAuth, AuthUser } from '@/lib/modules/api/middleware';
import { ok } from '@/lib/modules/api/response';

/**
 * GET /api/agents
 * 
 * List all agents in the system (for adding to projects, etc.)
 */
export const GET = withAuth(async (req: NextRequest, user: AuthUser) => {
  const agents = await prisma.user.findMany({
    where: { isAgent: true },
    select: {
      id: true,
      username: true,
      displayName: true,
      avatar: true,
      status: true,
    },
    orderBy: { displayName: 'asc' },
  });

  return ok({ agents });
});
