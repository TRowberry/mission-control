import { NextRequest } from 'next/server';
import prisma from '@/lib/db';
import { withAnyAuth, AuthActor, isAgent } from '@/lib/modules/api/middleware';
import { ok, created, badRequest, notFound } from '@/lib/modules/api/response';

// Helper to get workspace for actor (user or agent)
async function getWorkspaceId(actor: AuthActor): Promise<string | null> {
  if (isAgent(actor)) {
    // For agents, get workspace from agent's workspace membership
    const agent = await prisma.user.findUnique({
      where: { id: actor.id },
      include: {
        workspaces: {
          select: { workspaceId: true },
          take: 1,
        },
      },
    });
    return agent?.workspaces[0]?.workspaceId || null;
  } else {
    // For users, get from workspace membership
    const member = await prisma.workspaceMember.findFirst({
      where: { userId: actor.id },
      select: { workspaceId: true },
    });
    return member?.workspaceId || null;
  }
}

// GET /api/pages - List pages
export const GET = withAnyAuth(async (req: NextRequest, actor: AuthActor) => {
  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get('projectId');
  const parentId = searchParams.get('parentId');
  const archived = searchParams.get('archived') === 'true';

  const workspaceId = await getWorkspaceId(actor);
  if (!workspaceId) {
    return notFound('No workspace found');
  }

  const pages = await prisma.page.findMany({
    where: {
      workspaceId,
      archived,
      ...(projectId && { projectId }),
      ...(parentId ? { parentId } : { parentId: null }), // Root pages by default
    },
    orderBy: { updatedAt: 'desc' },
    include: {
      createdBy: {
        select: { id: true, username: true, displayName: true, avatar: true },
      },
      project: {
        select: { id: true, name: true, color: true },
      },
      _count: {
        select: { children: true },
      },
    },
  });

  return ok(pages);
});

// POST /api/pages - Create page
export const POST = withAnyAuth(async (req: NextRequest, actor: AuthActor) => {
  const { title, icon, content, projectId, parentId } = await req.json();

  if (!title) {
    return badRequest('Title is required');
  }

  const workspaceId = await getWorkspaceId(actor);
  if (!workspaceId) {
    return notFound('No workspace found');
  }

  const page = await prisma.page.create({
    data: {
      title,
      icon: icon || null,
      content: content || null,
      projectId: projectId || null,
      parentId: parentId || null,
      createdById: actor.id,
      workspaceId,
    },
    include: {
      createdBy: {
        select: { id: true, username: true, displayName: true, avatar: true },
      },
      project: {
        select: { id: true, name: true, color: true },
      },
    },
  });

  return created(page);
});
