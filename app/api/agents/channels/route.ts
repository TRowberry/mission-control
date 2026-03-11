import { NextRequest } from 'next/server';
import prisma from '@/lib/db';
import { withAgent, AuthAgent } from '@/lib/modules/api/middleware';
import { ok, created, badRequest } from '@/lib/modules/api/response';

/**
 * GET /api/agents/channels
 * 
 * List channels available to the agent.
 * 
 * Headers:
 *   - X-API-Key: Agent's API key
 */
export const GET = withAgent(async (req: NextRequest, agent: AuthAgent) => {
  const channels = await prisma.channel.findMany({
    where: {
      agentMode: { not: 'disabled' },
    },
    select: {
      id: true,
      name: true,
      slug: true,
      description: true,
      type: true,
      agentMode: true,
      workspace: {
        select: {
          id: true,
          name: true,
          slug: true,
        },
      },
      _count: {
        select: { messages: true },
      },
    },
    orderBy: [
      { workspace: { name: 'asc' } },
      { position: 'asc' },
    ],
  });

  return ok({
    channels,
    agentId: agent.id,
  });
});

/**
 * POST /api/agents/channels
 * 
 * Create a new channel (agent-only endpoint).
 * 
 * Headers:
 *   - X-API-Key: Agent's API key
 * 
 * Body:
 *   - name: Channel name (required)
 *   - description: Channel description (optional)
 *   - agentMode: 'auto-reply' | 'mention-only' | 'disabled' (optional, default: 'auto-reply')
 */
export const POST = withAgent(async (req: NextRequest, agent: AuthAgent) => {
  const { name, description, agentMode } = await req.json();

  if (!name) {
    return badRequest('name is required');
  }

  // Generate slug from name
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

  // Get default workspace
  let workspace = await prisma.workspace.findFirst();
  if (!workspace) {
    workspace = await prisma.workspace.create({
      data: { id: 'default-workspace', name: 'Mission Control', slug: 'mission-control' },
    });
  }

  // Check for duplicate
  const existing = await prisma.channel.findFirst({
    where: { workspaceId: workspace.id, slug },
  });

  if (existing) {
    return ok({ error: 'Channel with this name already exists', channel: existing });
  }

  // Get max position
  const maxPos = await prisma.channel.aggregate({
    where: { workspaceId: workspace.id },
    _max: { position: true },
  });

  const channel = await prisma.channel.create({
    data: {
      id: `channel-${slug}`,
      name,
      slug,
      description: description || null,
      type: 'text',
      position: (maxPos._max.position || 0) + 1,
      workspaceId: workspace.id,
      agentMode: agentMode || 'auto-reply',
    },
  });

  return created(channel);
});
