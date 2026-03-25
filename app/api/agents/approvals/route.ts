import { NextRequest } from 'next/server';
import prisma from '@/lib/db';
import { withAnyAuth, AuthActor } from '@/lib/modules/api/middleware';
import { ok, badRequest, notFound, forbidden, serverError } from '@/lib/modules/api/response';
import { notifyApprovalResult } from '@/lib/modules/agents/approval-notifier';

/**
 * GET /api/agents/approvals
 * List all pending approvals (runs with status = 'pending_approval')
 */
export const GET = withAnyAuth(async (request: NextRequest, user: AuthActor) => {
  try {
    const pendingRuns = await prisma.agentRun.findMany({
      where: {
        status: 'pending_approval',
      },
      include: {
        agent: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatar: true,
          },
        },
        triggerUser: {
          select: {
            id: true,
            username: true,
            displayName: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    // Parse metadata to extract pending actions
    const approvals = pendingRuns.map(run => {
      let pendingActions: any[] = [];
      if (run.metadata) {
        try {
          const meta = JSON.parse(run.metadata);
          pendingActions = meta.pendingApproval || [];
        } catch {}
      }

      return {
        runId: run.id,
        agent: run.agent,
        triggeredBy: run.triggeredBy,
        triggerUser: run.triggerUser,
        input: run.input,
        output: run.output,
        pendingActions,
        createdAt: run.createdAt,
      };
    });

    return ok({ approvals });
  } catch (error) {
    console.error('[Approvals] Error fetching:', error);
    return serverError('Failed to fetch approvals');
  }
});

/**
 * POST /api/agents/approvals
 * Approve or reject a pending action
 * Body: { runId, action: 'approve' | 'reject', reason?: string }
 */
export const POST = withAnyAuth(async (request: NextRequest, user: AuthActor) => {
  try {
    // Only human users can approve (not agents)
    // AuthUser has email, AuthAgent doesn't
    if (!('email' in user) || !user.email) {
      return forbidden('Only human users can approve actions');
    }

    const body = await request.json();
    const { runId, action, reason } = body;

    if (!runId || !action) {
      return badRequest('runId and action are required');
    }

    if (!['approve', 'reject'].includes(action)) {
      return badRequest('action must be "approve" or "reject"');
    }

    // Find the run
    const run = await prisma.agentRun.findUnique({
      where: { id: runId },
      include: {
        agent: true,
      },
    });

    if (!run) {
      return notFound('Run not found');
    }

    if (run.status !== 'pending_approval') {
      return badRequest('Run is not pending approval');
    }

    if (action === 'approve') {
      // Mark as approved and update action logs
      await prisma.$transaction(async (tx) => {
        // Update run status
        await tx.agentRun.update({
          where: { id: runId },
          data: {
            status: 'completed',
            completedAt: new Date(),
            metadata: JSON.stringify({
              ...JSON.parse(run.metadata || '{}'),
              approvedBy: user.id,
              approvedAt: new Date().toISOString(),
              approvalReason: reason,
            }),
          },
        });

        // Update action logs to executed
        await tx.agentActionLog.updateMany({
          where: {
            agentId: run.agentId,
            status: 'pending_approval',
          },
          data: {
            status: 'executed',
            approvedById: user.id,
          },
        });

        // Update agent config
        await tx.agentConfig.update({
          where: { userId: run.agentId },
          data: {
            lastRunStatus: 'completed',
          },
        });
      });

      // TODO: Execute the approved actions here
      // For now, we just mark them as approved

      // Notify #approvals channel
      await notifyApprovalResult(
        runId,
        run.agent.displayName || run.agent.username,
        true,
        user.displayName || user.username,
        reason
      );

      return ok({ 
        message: 'Actions approved',
        runId,
        approvedBy: user.displayName,
      });
    } else {
      // Reject - mark as cancelled
      await prisma.$transaction(async (tx) => {
        await tx.agentRun.update({
          where: { id: runId },
          data: {
            status: 'cancelled',
            completedAt: new Date(),
            metadata: JSON.stringify({
              ...JSON.parse(run.metadata || '{}'),
              rejectedBy: user.id,
              rejectedAt: new Date().toISOString(),
              rejectionReason: reason,
            }),
          },
        });

        // Update action logs to rejected
        await tx.agentActionLog.updateMany({
          where: {
            agentId: run.agentId,
            status: 'pending_approval',
          },
          data: {
            status: 'rejected',
          },
        });

        // Update agent config
        await tx.agentConfig.update({
          where: { userId: run.agentId },
          data: {
            lastRunStatus: 'cancelled',
          },
        });
      });

      // Notify #approvals channel
      await notifyApprovalResult(
        runId,
        run.agent.displayName || run.agent.username,
        false,
        user.displayName || user.username,
        reason
      );

      return ok({ 
        message: 'Actions rejected',
        runId,
        rejectedBy: user.displayName,
        reason,
      });
    }
  } catch (error) {
    console.error('[Approvals] Error processing:', error);
    return serverError('Failed to process approval');
  }
});
