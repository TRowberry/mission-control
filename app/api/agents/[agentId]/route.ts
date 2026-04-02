import { NextRequest } from 'next/server';
import prisma from '@/lib/db';
import { withAuthParams, AuthUser } from '@/lib/modules/api/middleware';
import { ok, notFound, badRequest, forbidden } from '@/lib/modules/api/response';

/**
 * GET /api/agents/[agentId]
 * 
 * Get a specific agent with full configuration.
 */
export const GET = withAuthParams(async (
  req: NextRequest,
  user: AuthUser,
  params: Promise<Record<string, string>>
) => {
  const { agentId } = await params;

  const agent = await prisma.user.findUnique({
    where: { id: agentId },
    select: {
      id: true,
      username: true,
      displayName: true,
      avatar: true,
      status: true,
      email: true,
      webhookUrl: true,
      isAgent: true,
      createdAt: true,
      updatedAt: true,
      agentConfig: {
        select: {
          id: true,
          role: true,
          systemPrompt: true,
          llmProvider: true,
          llmModel: true,
          llmEndpoint: true,
          triggerType: true,
          cronSchedule: true,
          scheduledTaskPrompt: true,
          scheduledCommand: true,
          canSendMessages: true,
          canEditTasks: true,
          canCreateTasks: true,
          canCreateSubtasks: true,
          canNotifyUsers: true,
          requireApprovalFor: true,
          actionsPerMinute: true,
          actionsPerHour: true,
          dailyTokenLimit: true,
          dailyCostLimit: true,
          dockerImage: true,
          memoryLimitMb: true,
          cpuLimit: true,
          timeoutSeconds: true,
          lastRunAt: true,
          lastRunStatus: true,
          runCount: true,
          totalTokensUsed: true,
          totalCost: true,
          createdAt: true,
          updatedAt: true,
        },
      },
      projectAccess: {
        include: {
          project: {
            select: {
              id: true,
              name: true,
              color: true,
              icon: true,
            },
          },
          grantedBy: {
            select: {
              id: true,
              displayName: true,
            },
          },
        },
      },
      // Recent action logs
      agentActionLogs: {
        take: 50,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          actionType: true,
          targetId: true,
          status: true,
          tokensUsed: true,
          cost: true,
          createdAt: true,
          executedAt: true,
          errorMessage: true,
        },
      },
    },
  });

  if (!agent) {
    return notFound('Agent not found');
  }

  if (!agent.isAgent) {
    return badRequest('User is not an agent');
  }

  return ok({ agent });
});

/**
 * PATCH /api/agents/[agentId]
 * 
 * Update an agent's profile and configuration.
 * Only workspace admins/owners can update agents.
 */
export const PATCH = withAuthParams(async (
  req: NextRequest,
  user: AuthUser,
  params: Promise<Record<string, string>>
) => {
  const { agentId } = await params;

  // Check if user is admin/owner in at least one workspace
  const isAdmin = await prisma.workspaceMember.findFirst({
    where: {
      userId: user.id,
      role: { in: ['owner', 'admin'] },
    },
  });

  if (!isAdmin) {
    return forbidden('Admin access required to update agents');
  }

  // Verify agent exists
  const agent = await prisma.user.findUnique({
    where: { id: agentId },
    select: { id: true, isAgent: true },
  });

  if (!agent) {
    return notFound('Agent not found');
  }

  if (!agent.isAgent) {
    return badRequest('User is not an agent');
  }

  const body = await req.json();
  const {
    // User fields
    displayName,
    avatar,
    webhookUrl,
    // AgentConfig fields
    role,
    systemPrompt,
    llmProvider,
    llmModel,
    llmEndpoint,
    triggerType,
    cronSchedule,
    scheduledTaskPrompt,
    scheduledCommand,
    canSendMessages,
    canEditTasks,
    canCreateTasks,
    canCreateSubtasks,
    canNotifyUsers,
    requireApprovalFor,
    actionsPerMinute,
    actionsPerHour,
    dailyTokenLimit,
    dailyCostLimit,
    dockerImage,
    memoryLimitMb,
    cpuLimit,
    timeoutSeconds,
  } = body;

  // Build update data for user
  const userUpdate: Record<string, unknown> = {};
  if (displayName !== undefined) userUpdate.displayName = displayName;
  if (avatar !== undefined) userUpdate.avatar = avatar;
  if (webhookUrl !== undefined) userUpdate.webhookUrl = webhookUrl;

  // Build update data for agentConfig
  const configUpdate: Record<string, unknown> = {};
  if (role !== undefined) configUpdate.role = role;
  if (systemPrompt !== undefined) configUpdate.systemPrompt = systemPrompt;
  if (llmProvider !== undefined) configUpdate.llmProvider = llmProvider;
  if (llmModel !== undefined) configUpdate.llmModel = llmModel;
  if (llmEndpoint !== undefined) configUpdate.llmEndpoint = llmEndpoint;
  if (triggerType !== undefined) configUpdate.triggerType = triggerType;
  if (cronSchedule !== undefined) configUpdate.cronSchedule = cronSchedule;
  if (scheduledTaskPrompt !== undefined) configUpdate.scheduledTaskPrompt = scheduledTaskPrompt;
  if (scheduledCommand !== undefined) configUpdate.scheduledCommand = scheduledCommand;
  if (canSendMessages !== undefined) configUpdate.canSendMessages = canSendMessages;
  if (canEditTasks !== undefined) configUpdate.canEditTasks = canEditTasks;
  if (canCreateTasks !== undefined) configUpdate.canCreateTasks = canCreateTasks;
  if (canCreateSubtasks !== undefined) configUpdate.canCreateSubtasks = canCreateSubtasks;
  if (canNotifyUsers !== undefined) configUpdate.canNotifyUsers = canNotifyUsers;
  if (requireApprovalFor !== undefined) configUpdate.requireApprovalFor = requireApprovalFor;
  if (actionsPerMinute !== undefined) configUpdate.actionsPerMinute = actionsPerMinute;
  if (actionsPerHour !== undefined) configUpdate.actionsPerHour = actionsPerHour;
  if (dailyTokenLimit !== undefined) configUpdate.dailyTokenLimit = dailyTokenLimit;
  if (dailyCostLimit !== undefined) configUpdate.dailyCostLimit = dailyCostLimit;
  if (dockerImage !== undefined) configUpdate.dockerImage = dockerImage;
  if (memoryLimitMb !== undefined) configUpdate.memoryLimitMb = memoryLimitMb;
  if (cpuLimit !== undefined) configUpdate.cpuLimit = cpuLimit;
  if (timeoutSeconds !== undefined) configUpdate.timeoutSeconds = timeoutSeconds;

  // Update user and config in transaction
  const updatedAgent = await prisma.$transaction(async (tx) => {
    // Update user if there are changes
    if (Object.keys(userUpdate).length > 0) {
      await tx.user.update({
        where: { id: agentId },
        data: userUpdate,
      });
    }

    // Update or create config if there are changes
    if (Object.keys(configUpdate).length > 0) {
      await tx.agentConfig.upsert({
        where: { userId: agentId },
        create: {
          userId: agentId,
          ...configUpdate,
        },
        update: configUpdate,
      });
    }

    // Fetch and return updated agent
    return tx.user.findUnique({
      where: { id: agentId },
      include: {
        agentConfig: true,
      },
    });
  });

  return ok({
    agent: {
      id: updatedAgent!.id,
      username: updatedAgent!.username,
      displayName: updatedAgent!.displayName,
      avatar: updatedAgent!.avatar,
      email: updatedAgent!.email,
      webhookUrl: updatedAgent!.webhookUrl,
      agentConfig: updatedAgent!.agentConfig,
      updatedAt: updatedAgent!.updatedAt,
    },
  });
});

/**
 * DELETE /api/agents/[agentId]
 * 
 * Delete an agent and all associated data.
 * Only workspace admins/owners can delete agents.
 */
export const DELETE = withAuthParams(async (
  req: NextRequest,
  user: AuthUser,
  params: Promise<Record<string, string>>
) => {
  const { agentId } = await params;

  // Check if user is admin/owner in at least one workspace
  const isAdmin = await prisma.workspaceMember.findFirst({
    where: {
      userId: user.id,
      role: { in: ['owner', 'admin'] },
    },
  });

  if (!isAdmin) {
    return forbidden('Admin access required to delete agents');
  }

  // Verify agent exists
  const agent = await prisma.user.findUnique({
    where: { id: agentId },
    select: { id: true, isAgent: true, username: true, displayName: true },
  });

  if (!agent) {
    return notFound('Agent not found');
  }

  if (!agent.isAgent) {
    return badRequest('User is not an agent');
  }

  // Delete agent (cascades to agentConfig and other relations)
  await prisma.user.delete({
    where: { id: agentId },
  });

  return ok({
    success: true,
    message: `Agent ${agent.displayName} (${agent.username}) has been deleted`,
  });
});
