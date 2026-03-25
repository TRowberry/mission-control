import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';

/**
 * POST /api/agents/runs/[runId]/status
 * 
 * Callback endpoint for agent containers to report execution status
 * Authenticated via X-API-Key header (agent's API key)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ runId: string }> }
) {
  try {
    const { runId } = await params;
    const apiKey = request.headers.get('X-API-Key');

    if (!apiKey) {
      return NextResponse.json({ error: 'Missing API key' }, { status: 401 });
    }

    // Find the run and verify agent API key
    const run = await prisma.agentRun.findUnique({
      where: { id: runId },
      include: {
        agent: true,
      },
    });

    if (!run) {
      return NextResponse.json({ error: 'Run not found' }, { status: 404 });
    }

    if (run.agent.apiKey !== apiKey) {
      return NextResponse.json({ error: 'Invalid API key' }, { status: 401 });
    }

    const body = await request.json();
    const { status, output, tokensUsed, actionsCount, actions, errorMessage, durationMs, completedAt, startedAt } = body;

    // Update run record
    const updateData: Record<string, unknown> = {};

    if (status) updateData.status = status;
    if (output) updateData.output = output;
    if (tokensUsed !== undefined) updateData.tokensUsed = tokensUsed;
    if (actionsCount !== undefined) {
      updateData.actionsCount = actionsCount;
      updateData.actionsRun = actionsCount;
    }
    if (errorMessage) updateData.errorMessage = errorMessage;
    if (durationMs !== undefined) updateData.durationMs = durationMs;
    if (completedAt) updateData.completedAt = new Date(completedAt);
    if (startedAt) updateData.startedAt = new Date(startedAt);

    await prisma.agentRun.update({
      where: { id: runId },
      data: updateData,
    });

    // If completed or failed, update agent stats
    if (status === 'completed' || status === 'failed') {
      const statsUpdate: Record<string, unknown> = {
        lastRunAt: new Date(),
        lastRunStatus: status,
        runCount: { increment: 1 },
      };

      if (status === 'completed' && tokensUsed) {
        statsUpdate.totalTokensUsed = { increment: tokensUsed };
      }

      await prisma.agentConfig.update({
        where: { userId: run.agentId },
        data: statsUpdate,
      });

      // Log actions if provided
      if (actions && Array.isArray(actions)) {
        for (const action of actions) {
          await prisma.agentActionLog.create({
            data: {
              agentId: run.agentId,
              actionType: action.type || 'unknown',
              targetId: action.targetId,
              payload: action.payload ? JSON.stringify(action.payload) : null,
              status: 'executed',
              tokensUsed: tokensUsed ? Math.floor(tokensUsed / actions.length) : 0,
            },
          });
        }
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Status update error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
