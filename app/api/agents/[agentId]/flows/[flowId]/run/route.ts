import { NextRequest } from 'next/server';
import prisma from '@/lib/db';
import { withAnyAuthParams, AuthActor, isAgent } from '@/lib/modules/api/middleware';
import { ok, notFound, serverError, forbidden } from '@/lib/modules/api/response';
import { executeFlow } from '@/lib/flows/executor';

/**
 * POST /api/agents/[agentId]/flows/[flowId]/run
 * Execute a flow
 */
export const POST = withAnyAuthParams(async (
  req: NextRequest,
  actor: AuthActor,
  params: Promise<Record<string, string>>
) => {
  const startTime = Date.now();
  const { agentId, flowId } = await params;
  const body = await req.json().catch(() => ({}));
  const { input, triggeredBy: customTriggeredBy } = body;

  if (isAgent(actor) && actor.id !== agentId) {
    return forbidden('Cannot run other agent flows');
  }

  // Get flow with agent
  const flow = await prisma.agentFlow.findFirst({
    where: { id: flowId, agentId },
    include: {
      agent: {
        select: { id: true, username: true, apiKey: true },
      },
    },
  });

  if (!flow) {
    return notFound('Flow not found');
  }

  // Determine triggeredBy
  const triggeredBy = customTriggeredBy || (isAgent(actor) ? 'api' : 'manual');
  const triggerUserId = actor.id;

  // Create run record
  const run = await prisma.agentFlowRun.create({
    data: {
      flowId,
      triggeredBy,
      triggerUserId,
      status: 'running',
      input: input ? JSON.stringify(input) : null,
      startedAt: new Date(),
    },
  });

  try {
    // Execute the flow
    const result = await executeFlow(flow, input || {}, run.id);

    // Update run with results
    const durationMs = Date.now() - startTime;
    await prisma.agentFlowRun.update({
      where: { id: run.id },
      data: {
        status: 'success',
        output: JSON.stringify(result.output),
        executionLog: JSON.stringify(result.log),
        tokensUsed: result.tokensUsed || 0,
        cost: result.cost || 0,
        durationMs,
        completedAt: new Date(),
      },
    });

    // Update flow stats
    await prisma.agentFlow.update({
      where: { id: flowId },
      data: {
        runCount: { increment: 1 },
        lastRunAt: new Date(),
        lastRunStatus: 'success',
      },
    });

    return ok({
      runId: run.id,
      status: 'success',
      output: result.output,
      durationMs,
    });
  } catch (execError: any) {
    // Update run with error
    const durationMs = Date.now() - startTime;
    await prisma.agentFlowRun.update({
      where: { id: run.id },
      data: {
        status: 'failed',
        errorMessage: execError.message,
        errorNodeId: execError.nodeId || null,
        durationMs,
        completedAt: new Date(),
      },
    });

    // Update flow stats
    await prisma.agentFlow.update({
      where: { id: flowId },
      data: {
        runCount: { increment: 1 },
        lastRunAt: new Date(),
        lastRunStatus: 'failed',
      },
    });

    return serverError(execError.message);
  }
});
