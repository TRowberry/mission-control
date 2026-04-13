import { NextRequest } from 'next/server';
import prisma from '@/lib/db';
import { withAuth } from '@/lib/modules/api/middleware';
import { ok, created, badRequest } from '@/lib/modules/api/response';

// GET /api/workspaces - list workspaces the current user belongs to
export const GET = withAuth(async (_req: NextRequest, user) => {
  const memberships = await prisma.workspaceMember.findMany({
    where: { userId: user.id },
    include: { workspace: true },
    orderBy: { joinedAt: 'asc' },
  });

  const workspaces = memberships.map(m => ({
    id: m.workspace.id,
    name: m.workspace.name,
    slug: m.workspace.slug,
    icon: m.workspace.icon,
    description: m.workspace.description,
    role: m.role,
  }));

  return ok(workspaces);
});

// POST /api/workspaces - create a new workspace
export const POST = withAuth(async (req: NextRequest, user) => {
  const { name, icon, description } = await req.json();

  if (!name?.trim()) {
    return badRequest('name required');
  }

  const baseSlug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

  // Ensure slug uniqueness
  const existing = await prisma.workspace.findUnique({ where: { slug: baseSlug } });
  const slug = existing ? `${baseSlug}-${Date.now()}` : baseSlug;

  const workspace = await prisma.workspace.create({
    data: {
      name: name.trim(),
      slug,
      icon: icon || null,
      description: description?.trim() || null,
      members: {
        create: { userId: user.id, role: 'owner' },
      },
      channels: {
        create: [
          { name: 'general', slug: 'general', description: 'General discussion', position: 0 },
          { name: 'random', slug: 'random', description: 'Random stuff', position: 1 },
        ],
      },
    },
  });

  return created({ ...workspace, role: 'owner' });
});
