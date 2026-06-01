import { NextRequest } from 'next/server';
import prisma from '@/lib/db';
import { withAuth, AuthUser } from '@/lib/modules/api/middleware';
import { ok, created, badRequest, notFound } from '@/lib/modules/api/response';

// POST /api/kanban/columns - Create a new column
export const POST = withAuth(async (req: NextRequest, user: AuthUser) => {
  const { projectId, name, color } = await req.json();

  if (!projectId || !name) {
    return badRequest('projectId and name required');
  }

  const maxPos = await prisma.column.aggregate({
    where: { projectId },
    _max: { position: true },
  });

  const column = await prisma.column.create({
    data: {
      name: name.trim(),
      color: color || '#6B7280',
      position: (maxPos._max.position ?? -1) + 1,
      projectId,
    },
    include: { tasks: true },
  });

  return created(column);
});

// PATCH /api/kanban/columns - Update a column (rename, recolor, reorder)
export const PATCH = withAuth(async (req: NextRequest, user: AuthUser) => {
  const { id, name, color, position } = await req.json();

  if (!id) {
    return badRequest('id required');
  }

  const column = await prisma.column.update({
    where: { id },
    data: {
      ...(name !== undefined && { name: name.trim() }),
      ...(color !== undefined && { color }),
      ...(position !== undefined && { position }),
    },
  });

  return ok(column);
});

// DELETE /api/kanban/columns - Delete a column (and all its tasks)
export const DELETE = withAuth(async (req: NextRequest, user: AuthUser) => {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');

  if (!id) {
    return badRequest('id required');
  }

  const column = await prisma.column.findUnique({ where: { id } });
  if (!column) {
    return notFound('Column not found');
  }

  await prisma.column.delete({ where: { id } });

  return ok({ success: true });
});
