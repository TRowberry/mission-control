import { NextRequest } from 'next/server';
import prisma from '@/lib/db';
import { withAuth } from '@/lib/modules/api/middleware';
import { ok, created, badRequest, notFound } from '@/lib/modules/api/response';

// GET /api/pages - List pages
export const GET = withAuth(async (req: NextRequest, user) => {
  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get('projectId');
  const parentId = searchParams.get('parentId');
  const archived = searchParams.get('archived') === 'true';

  // Get user's workspace
  const member = await prisma.workspaceMember.findFirst({
    where: { userId: user.id },
    select: { workspaceId: true },
  });

  if (!member) {
    return notFound('No workspace found');
  }

  const pages = await prisma.page.findMany({
    where: {
      workspaceId: member.workspaceId,
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
export const POST = withAuth(async (req: NextRequest, user) => {
  const { title, icon, content, projectId, parentId } = await req.json();

  if (!title) {
    return badRequest('Title is required');
  }

  // Get user's workspace
  const member = await prisma.workspaceMember.findFirst({
    where: { userId: user.id },
    select: { workspaceId: true },
  });

  if (!member) {
    return notFound('No workspace found');
  }

  const page = await prisma.page.create({
    data: {
      title,
      icon: icon || null,
      content: content || null,
      projectId: projectId || null,
      parentId: parentId || null,
      createdById: user.id,
      workspaceId: member.workspaceId,
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
