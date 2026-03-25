import prisma from '@/lib/db';
import { notifyApprovalResult } from './approval-notifier';

/**
 * Check if a message is a reply to an approval request and process it
 * Returns true if the message was an approval reply, false otherwise
 */
export async function handleApprovalReply(
  message: {
    id: string;
    content: string;
    replyToId: string | null;
    authorId: string;
  },
  author: {
    id: string;
    username: string;
    displayName?: string | null;
    isAgent?: boolean;
  }
): Promise<{ handled: boolean; result?: 'approved' | 'rejected'; runId?: string }> {
  // Must be a reply to process
  if (!message.replyToId) {
    return { handled: false };
  }

  // Agents cannot approve actions (humans only)
  if (author.isAgent) {
    return { handled: false };
  }

  // Check if parent message is an approval request by looking for runs with this messageId
  const run = await prisma.agentRun.findFirst({
    where: {
      status: 'pending_approval',
      metadata: {
        contains: message.replyToId,
      },
    },
    include: {
      agent: {
        select: { id: true, username: true, displayName: true },
      },
    },
  });

  if (!run) {
    return { handled: false };
  }

  // Parse metadata to verify approvalMessageId matches
  let metadata: { approvalMessageId?: string; pendingApproval?: unknown[] } = {};
  try {
    metadata = JSON.parse(run.metadata || '{}');
  } catch {
    return { handled: false };
  }

  if (metadata.approvalMessageId !== message.replyToId) {
    return { handled: false };
  }

  // Parse approve/reject from content (strip HTML tags)
  const plainText = message.content
    .replace(/<[^>]*>/g, '')
    .trim()
    .toLowerCase();

  let action: 'approve' | 'reject' | null = null;
  if (/^approve(d)?$/i.test(plainText) || plainText.includes('approve')) {
    action = 'approve';
  } else if (/^reject(ed)?$/i.test(plainText) || plainText.includes('reject')) {
    action = 'reject';
  }

  if (!action) {
    return { handled: false };
  }

  // Process the approval/rejection
  const approved = action === 'approve';
  const newStatus = approved ? 'running' : 'cancelled';

  await prisma.agentRun.update({
    where: { id: run.id },
    data: {
      status: newStatus,
      metadata: JSON.stringify({
        ...metadata,
        approvedBy: approved ? author.id : undefined,
        rejectedBy: !approved ? author.id : undefined,
        approvalTime: new Date().toISOString(),
      }),
    },
  });

  // Post notification to #approvals
  const reviewerName = author.displayName || author.username;
  const agentName = run.agent.displayName || run.agent.username;
  await notifyApprovalResult(run.id, agentName, approved, reviewerName);

  console.log(`[Approval Reply] Run ${run.id} ${action}d by ${reviewerName}`);

  return {
    handled: true,
    result: approved ? 'approved' : 'rejected',
    runId: run.id,
  };
}
