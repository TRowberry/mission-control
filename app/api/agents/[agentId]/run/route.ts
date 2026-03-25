import { NextRequest } from 'next/server';
import prisma from '@/lib/db';
import { withAuthParams, AuthUser } from '@/lib/modules/api/middleware';
import { ok, badRequest, notFound } from '@/lib/modules/api/response';
import { runAgent } from '@/lib/modules/agents/runner';

/**
 * POST /api/agents/[agentId]/run
 * 
 * Trigger an agent run. Creates an AgentRun record and spawns execution.
 */
export const POST = withAuthParams(async (
  req: NextRequest, 
  user: AuthUser, 
  params: Promise<Record<string, string>>
) => {
  const { agentId } = await params;
  
  // Find the agent
  const agent = await prisma.user.findFirst({
    where: { id: agentId, isAgent: true },
    include: { agentConfig: true },
  });

  if (!agent) {
    return notFound('Agent not found');
  }

  if (!agent.agentConfig) {
    return badRequest('Agent has no configuration');
  }

  // Parse request body
  const body = await req.json().catch(() => ({}));
  const { input, triggeredBy = 'api' } = body;

  // Create AgentRun record
  const run = await prisma.agentRun.create({
    data: {
      agentId,
      triggeredBy,
      triggeredById: user.id,
      status: 'pending',
      input: input || null,
    },
  });

  // Spawn the agent execution (async, don't await)
  runAgent(run.id, agent, agent.agentConfig).catch((err) => {
    console.error(`Agent run ${run.id} failed:`, err);
  });

  return ok({
    run: {
      id: run.id,
      status: run.status,
      agentId: run.agentId,
      triggeredBy: run.triggeredBy,
      createdAt: run.createdAt,
    },
    message: 'Agent run started',
  });
});

/**
 * GET /api/agents/[agentId]/run
 * 
 * List recent runs for an agent.
 */
export const GET = withAuthParams(async (
  req: NextRequest, 
  user: AuthUser, 
  params: Promise<Record<string, string>>
) => {
  const { agentId } = await params;
  const { searchParams } = new URL(req.url);
  const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 100);
  const runId = searchParams.get('runId');

  // If runId is specified, get that specific run with full output
  if (runId) {
    const run = await prisma.agentRun.findFirst({
      where: { id: runId, agentId },
      select: {
        id: true,
        status: true,
        triggeredBy: true,
        actionsCount: true,
        actionsRun: true,
        actionsFailed: true,
        tokensUsed: true,
        cost: true,
        durationMs: true,
        startedAt: true,
        completedAt: true,
        createdAt: true,
        errorMessage: true,
        output: true, // Include output for specific run
      },
    });

    return ok({ runs: run ? [run] : [] });
  }

  // List recent runs (without full output to keep response small)
  const runs = await prisma.agentRun.findMany({
    where: { agentId },
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: {
      id: true,
      status: true,
      triggeredBy: true,
      actionsCount: true,
      actionsRun: true,
      actionsFailed: true,
      tokensUsed: true,
      cost: true,
      durationMs: true,
      startedAt: true,
      completedAt: true,
      createdAt: true,
      errorMessage: true,
      output: true, // Include output
    },
  });

  return ok({ runs });
});
