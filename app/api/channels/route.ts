import { NextRequest } from 'next/server';
import prisma from '@/lib/db';
import { withAuth } from '@/lib/modules/api/middleware';
import { ok, created, badRequest, notFound, conflict } from '@/lib/modules/api/response';

// GET /api/channels - List channels for workspace
export const GET = withAuth(async (req: NextRequest, user) => {
  const { searchParams } = new URL(req.url);
  const workspaceId = searchParams.get('workspaceId');
  const includeArchived = searchParams.get('includeArchived') === 'true';

  // Find workspace (use first if not specified)
  let workspace;
  if (workspaceId) {
    workspace = await prisma.workspace.findUnique({ where: { id: workspaceId } });
  } else {
    workspace = await prisma.workspace.findFirst();
  }

  if (!workspace) {
    return notFound('No workspace found');
  }

  const channels = await prisma.channel.findMany({
    where: {
      workspaceId: workspace.id,
      ...(!includeArchived && { isPrivate: false }),
    },
    orderBy: { position: 'asc' },
    include: {
      _count: {
        select: { messages: true },
      },
    },
  });

  return ok({ channels, workspaceId: workspace.id });
});

// POST /api/channels - Create channel
export const POST = withAuth(async (req: NextRequest, user) => {
  const { name, description, type, workspaceId: providedWorkspaceId } = await req.json();

  if (!name) {
    return badRequest('name required');
  }

  // Find or use workspace
  let workspaceId = providedWorkspaceId;
  if (!workspaceId) {
    const workspace = await prisma.workspace.findFirst();
    if (!workspace) {
      const newWorkspace = await prisma.workspace.create({
        data: { name: 'Mission Control', slug: 'mission-control' },
      });
      workspaceId = newWorkspace.id;
    } else {
      workspaceId = workspace.id;
    }
  }

  // Generate slug from name
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

  // Check for duplicate slug
  const existing = await prisma.channel.findFirst({
    where: { workspaceId, slug },
  });

  if (existing) {
    return conflict('Channel with this name already exists');
  }

  // Get max position
  const maxPos = await prisma.channel.aggregate({
    where: { workspaceId },
    _max: { position: true },
  });

  const channel = await prisma.channel.create({
    data: {
      name,
      slug,
      description: description || null,
      type: type || 'text',
      position: (maxPos._max.position || 0) + 1,
      workspaceId,
    },
  });

  return created(channel);
});

// PATCH /api/channels - Update channel
export const PATCH = withAuth(async (req: NextRequest, user) => {
  const { id, name, description, type, position, isPrivate } = await req.json();

  if (!id) {
    return badRequest('id required');
  }

  // If name is changing, update slug too
  let slug;
  if (name) {
    slug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  }

  const channel = await prisma.channel.update({
    where: { id },
    data: {
      ...(name !== undefined && { name }),
      ...(slug && { slug }),
      ...(description !== undefined && { description }),
      ...(type !== undefined && { type }),
      ...(position !== undefined && { position }),
      ...(isPrivate !== undefined && { isPrivate }),
    },
  });

  return ok(channel);
});

// DELETE /api/channels
export const DELETE = withAuth(async (req: NextRequest, user) => {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');

  if (!id) {
    return badRequest('id required');
  }

  // Soft delete by marking as private/archived
  await prisma.channel.update({
    where: { id },
    data: { isPrivate: true },
  });

  return ok({ success: true });
});
