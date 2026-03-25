import prisma from '@/lib/db';
import { ParsedAction } from './action-parser';

const APPROVALS_CHANNEL_ID = 'channel-approvals';

/**
 * Post a notification to #approvals channel when actions need human approval
 * Returns the message ID so it can be stored for reply-based approval
 */
export async function notifyPendingApproval(
  runId: string,
  agentId: string,
  agentName: string,
  actions: ParsedAction[]
): Promise<string | null> {
  try {
    // Get the system user or create message as agent
    const actionsText = actions
      .map(a => `• ${a.type}${a.targetId ? ` → ${a.targetId}` : ''}`)
      .join('\n');

    // Use plain text - HTML tags may render as raw text in some contexts
    const content = `🔐 Approval Required

Agent ${agentName} wants to perform sensitive actions:
${actionsText}

Reply to this message with "approve" or "reject"`;

    // Create message in approvals channel
    const message = await prisma.message.create({
      data: {
        content,
        type: 'text',
        authorId: agentId,
        channelId: APPROVALS_CHANNEL_ID,
      },
    });

    // Store the message ID in the run's metadata for reply-based approval
    const run = await prisma.agentRun.findUnique({
      where: { id: runId },
      select: { metadata: true },
    });
    
    const metadata = run?.metadata ? JSON.parse(run.metadata) : {};
    metadata.approvalMessageId = message.id;
    
    await prisma.agentRun.update({
      where: { id: runId },
      data: { metadata: JSON.stringify(metadata) },
    });

    console.log(`[Approval] Posted notification for run ${runId}, message ${message.id}`);
    return message.id;
  } catch (error) {
    console.error('[Approval] Failed to post notification:', error);
    // Don't throw - approval notification failing shouldn't break the run
    return null;
  }
}

/**
 * Post approval/rejection result to #approvals channel
 */
export async function notifyApprovalResult(
  runId: string,
  agentName: string,
  approved: boolean,
  reviewerName: string,
  reason?: string
): Promise<void> {
  try {
    const emoji = approved ? '✅' : '❌';
    const action = approved ? 'approved' : 'rejected';
    const reasonText = reason ? ` — ${reason}` : '';

    // Use plain text format - HTML tags display as raw in some message types
    const content = `${emoji} Run ${runId} ${action} by ${reviewerName}${reasonText}`;

    // Find the system user or first admin to post as
    const systemUser = await prisma.user.findFirst({
      where: { username: 'system' },
    });

    const authorId = systemUser?.id || (await prisma.user.findFirst({
      where: { isAgent: false },
    }))?.id;

    if (authorId) {
      await prisma.message.create({
        data: {
          content,
          type: 'text',
          authorId,
          channelId: APPROVALS_CHANNEL_ID,
        },
      });
    }
  } catch (error) {
    console.error('[Approval] Failed to post result notification:', error);
  }
}
