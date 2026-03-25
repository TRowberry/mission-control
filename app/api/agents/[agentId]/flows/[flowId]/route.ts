import { NextRequest } from 'next/server';
import prisma from '@/lib/db';
import { withAnyAuthParams, AuthActor, isAgent } from '@/lib/modules/api/middleware';
import { ok, notFound, forbidden } from '@/lib/modules/api/response';

/**
 * GET /api/agents/[agentId]/flows/[flowId]
 * Get flow details
 */
export const GET = withAnyAuthParams(async (
  req: NextRequest,
  actor: AuthActor,
  params: Promise<Record<string, string>>
) => {
  const { agentId, flowId } = await params;

  if (isAgent(actor) && actor.id !== agentId) {
    return forbidden('Cannot access other agent flows');
  }

  const flow = await prisma.agentFlow.findFirst({
    where: { id: flowId, agentId },
    include: {
      runs: {
        take: 10,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          status: true,
          triggeredBy: true,
          durationMs: true,
          createdAt: true,
        },
      },
    },
  });

  if (!flow) {
    return notFound('Flow not found');
  }

  return ok(flow);
});

/**
 * PATCH /api/agents/[agentId]/flows/[flowId]
 * Update a flow
 */
export const PATCH = withAnyAuthParams(async (
  req: NextRequest,
  actor: AuthActor,
  params: Promise<Record<string, string>>
) => {
  const { agentId, flowId } = await params;
  const body = await req.json();

  if (isAgent(actor) && actor.id !== agentId) {
    return forbidden('Cannot modify other agent flows');
  }

  // Check flow exists
  const existing = await prisma.agentFlow.findFirst({
    where: { id: flowId, agentId },
  });

  if (!existing) {
    return notFound('Flow not found');
  }

  // Build update data
  const updateData: any = {};
  if (body.name !== undefined) updateData.name = body.name;
  if (body.description !== undefined) updateData.description = body.description;
  if (body.definition !== undefined) {
    updateData.definition = typeof body.definition === 'string' 
      ? body.definition 
      : JSON.stringify(body.definition);
  }
  if (body.triggerType !== undefined) updateData.triggerType = body.triggerType;
  if (body.triggerConfig !== undefined) {
    updateData.triggerConfig = typeof body.triggerConfig === 'string'
      ? body.triggerConfig
      : JSON.stringify(body.triggerConfig);
  }
  if (body.isActive !== undefined) updateData.isActive = body.isActive;
  if (body.timeoutSeconds !== undefined) updateData.timeoutSeconds = body.timeoutSeconds;
  if (body.maxRetries !== undefined) updateData.maxRetries = body.maxRetries;

  // Increment version on definition changes
  if (updateData.definition && updateData.definition !== existing.definition) {
    updateData.version = existing.version + 1;
  }

  const flow = await prisma.agentFlow.update({
    where: { id: flowId },
    data: updateData,
  });

  return ok(flow);
});

/**
 * DELETE /api/agents/[agentId]/flows/[flowId]
 * Delete a flow
 */
export const DELETE = withAnyAuthParams(async (
  req: NextRequest,
  actor: AuthActor,
  params: Promise<Record<string, string>>
) => {
  const { agentId, flowId } = await params;

  if (isAgent(actor) && actor.id !== agentId) {
    return forbidden('Cannot delete other agent flows');
  }

  // Check flow exists
  const existing = await prisma.agentFlow.findFirst({
    where: { id: flowId, agentId },
  });

  if (!existing) {
    return notFound('Flow not found');
  }

  await prisma.agentFlow.delete({
    where: { id: flowId },
  });

  return ok({ success: true });
});
