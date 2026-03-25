import { NextRequest } from 'next/server';
import prisma from '@/lib/db';
import { withAnyAuthParams, AuthActor, isAgent } from '@/lib/modules/api/middleware';
import { ok, notFound, badRequest, created, forbidden } from '@/lib/modules/api/response';

/**
 * GET /api/agents/[agentId]/flows
 * List all flows for an agent
 * - Agents can only access their own flows
 * - Users (admins) can access any agent's flows
 */
export const GET = withAnyAuthParams(async (
  req: NextRequest,
  actor: AuthActor,
  params: Promise<Record<string, string>>
) => {
  const { agentId } = await params;

  // Agents can only access their own flows
  if (isAgent(actor) && actor.id !== agentId) {
    return forbidden('Cannot access other agent flows');
  }

  const flows = await prisma.agentFlow.findMany({
    where: { agentId },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      name: true,
      description: true,
      version: true,
      isActive: true,
      triggerType: true,
      runCount: true,
      lastRunAt: true,
      lastRunStatus: true,
      createdAt: true,
    },
  });

  return ok(flows);
});

/**
 * POST /api/agents/[agentId]/flows
 * Create a new flow
 * - Agents can only create flows for themselves
 * - Users (admins) can create flows for any agent
 */
export const POST = withAnyAuthParams(async (
  req: NextRequest,
  actor: AuthActor,
  params: Promise<Record<string, string>>
) => {
  const { agentId } = await params;
  const body = await req.json();
  const { name, description, definition, triggerType, triggerConfig, isActive } = body;

  if (!name) {
    return badRequest('Name is required');
  }

  // Agents can only create flows for themselves
  if (isAgent(actor) && actor.id !== agentId) {
    return forbidden('Cannot create flows for other agents');
  }

  // Create default definition if not provided
  const defaultDefinition = definition || JSON.stringify({
    nodes: [
      {
        id: 'trigger-1',
        type: 'trigger',
        position: { x: 250, y: 50 },
        data: { label: 'Trigger', type: 'manual' },
      },
    ],
    edges: [],
  });

  const flow = await prisma.agentFlow.create({
    data: {
      agentId,
      name,
      description: description || null,
      definition: typeof defaultDefinition === 'string' ? defaultDefinition : JSON.stringify(defaultDefinition),
      triggerType: triggerType || 'manual',
      triggerConfig: triggerConfig ? (typeof triggerConfig === 'string' ? triggerConfig : JSON.stringify(triggerConfig)) : null,
      isActive: isActive || false,
    },
  });

  return created(flow);
});
