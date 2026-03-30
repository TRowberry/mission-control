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
  const type = searchParams.get('type'); // 'PAGE', 'BOOKLET', or null for all
  const includeChildren = searchParams.get('includeChildren') === 'true';

  const workspaceId = await getWorkspaceId(actor);
  if (!workspaceId) {
    return notFound('No workspace found');
  }

  // When includeChildren=true, we want root pages only (children will be nested)
  const shouldFilterToRoot = includeChildren && parentId === undefined;
  
  const pages = await prisma.page.findMany({
    where: {
      workspaceId,
      archived,
      ...(projectId && { projectId }),
      ...(type && { type: type as 'PAGE' | 'BOOKLET' }),
      ...(shouldFilterToRoot 
        ? { parentId: null }  // Root pages only when including children
        : (parentId !== undefined 
          ? (parentId ? { parentId } : { parentId: null }) 
          : {})), // Otherwise use explicit parentId filter or show all
    },
    orderBy: [
      { position: 'asc' },
      { updatedAt: 'desc' },
    ],
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
      ...(includeChildren && {
        children: {
          orderBy: [{ position: 'asc' }, { updatedAt: 'desc' }],
          include: {
            createdBy: {
              select: { id: true, username: true, displayName: true, avatar: true },
            },
          },
        },
      }),
    },
  });

  return ok(pages);
});

// POST /api/pages - Create page or booklet
export const POST = withAnyAuth(async (req: NextRequest, actor: AuthActor) => {
  const { title, icon, content, projectId, parentId, type, position } = await req.json();

  if (!title) {
    return badRequest('Title is required');
  }

  const workspaceId = await getWorkspaceId(actor);
  if (!workspaceId) {
    return notFound('No workspace found');
  }

  // If position not specified, put at end
  let finalPosition = position;
  if (finalPosition === undefined) {
    const lastPage = await prisma.page.findFirst({
      where: { workspaceId, parentId: parentId || null },
      orderBy: { position: 'desc' },
      select: { position: true },
    });
    finalPosition = (lastPage?.position ?? -1) + 1;
  }

  const page = await prisma.page.create({
    data: {
      title,
      icon: icon || (type === 'BOOKLET' ? '📚' : null),
      content: content || null,
      type: type || 'PAGE',
      position: finalPosition,
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
      _count: {
        select: { children: true },
      },
    },
  });

  return created(page);
});
