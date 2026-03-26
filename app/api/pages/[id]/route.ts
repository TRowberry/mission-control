import { NextRequest } from 'next/server';
import prisma from '@/lib/db';
import { withAnyAuthParams, AuthActor } from '@/lib/modules/api/middleware';
import { ok, notFound } from '@/lib/modules/api/response';

// GET /api/pages/[id] - Get single page
export const GET = withAnyAuthParams(async (req: NextRequest, actor: AuthActor, params) => {
  const { id } = await params;

  const page = await prisma.page.findUnique({
    where: { id },
    include: {
      createdBy: {
        select: { id: true, username: true, displayName: true, avatar: true },
      },
      project: {
        select: { id: true, name: true, color: true },
      },
      parent: {
        select: { id: true, title: true, icon: true },
      },
      children: {
        where: { archived: false },
        orderBy: { updatedAt: 'desc' },
        select: { id: true, title: true, icon: true, updatedAt: true },
      },
    },
  });

  if (!page) {
    return notFound('Page not found');
  }

  return ok(page);
});

// PATCH /api/pages/[id] - Update page
export const PATCH = withAnyAuthParams(async (req: NextRequest, actor: AuthActor, params) => {
  const { id } = await params;
  const { title, icon, coverImage, content, projectId, parentId, archived, isPublic } = await req.json();

  const page = await prisma.page.update({
    where: { id },
    data: {
      ...(title !== undefined && { title }),
      ...(icon !== undefined && { icon }),
      ...(coverImage !== undefined && { coverImage }),
      ...(content !== undefined && { content }),
      ...(projectId !== undefined && { projectId }),
      ...(parentId !== undefined && { parentId }),
      ...(archived !== undefined && { archived }),
      ...(isPublic !== undefined && { isPublic }),
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

  return ok(page);
});

// DELETE /api/pages/[id] - Delete page
export const DELETE = withAnyAuthParams(async (req: NextRequest, actor: AuthActor, params) => {
  const { id } = await params;

  await prisma.page.delete({ where: { id } });

  return ok({ success: true });
});
