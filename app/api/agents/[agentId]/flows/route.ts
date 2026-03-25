import { NextRequest } from 'next/server';
import prisma from '@/lib/db';
import { withAgentParams, AuthAgent } from '@/lib/modules/api/middleware';
import { ok, notFound, badRequest, created } from '@/lib/modules/api/response';

/**
 * GET /api/agents/[agentId]/flows
 * List all flows for an agent
 */
export const GET = withAgentParams(async (
  req: NextRequest,
  agent: AuthAgent,
  params: Promise<Record<string, string>>
) => {
  const { agentId } = await params;

  // Verify the agent is accessing their own flows
  if (agent.id !== agentId) {
    return notFound('Agent not found');
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
 */
export const POST = withAgentParams(async (
  req: NextRequest,
  agent: AuthAgent,
  params: Promise<Record<string, string>>
) => {
  const { agentId } = await params;
  const body = await req.json();
  const { name, description, definition, triggerType, triggerConfig, isActive } = body;

  if (!name) {
    return badRequest('Name is required');
  }

  // Verify the agent is creating flows for themselves
  if (agent.id !== agentId) {
    return notFound('Agent not found');
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
