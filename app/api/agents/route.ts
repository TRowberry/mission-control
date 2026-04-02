import { NextRequest } from 'next/server';
import prisma from '@/lib/db';
import { withAuth, AuthUser } from '@/lib/modules/api/middleware';
import { ok, created, badRequest, forbidden } from '@/lib/modules/api/response';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

/**
 * GET /api/agents
 * 
 * List all agents in the system with their configurations.
 * Includes AgentConfig data if available.
 */
export const GET = withAuth(async (req: NextRequest, user: AuthUser) => {
  const agents = await prisma.user.findMany({
    where: { isAgent: true },
    select: {
      id: true,
      username: true,
      displayName: true,
      avatar: true,
      status: true,
      email: true,
      webhookUrl: true,
      createdAt: true,
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
        select: {
          projectId: true,
          role: true,
          project: {
            select: {
              id: true,
              name: true,
              color: true,
            },
          },
        },
      },
    },
    orderBy: { displayName: 'asc' },
  });

  return ok({ agents });
});

/**
 * POST /api/agents
 * 
 * Create a new agent user with optional configuration.
 * Only workspace admins/owners can create agents.
 */
export const POST = withAuth(async (req: NextRequest, user: AuthUser) => {
  // Check if user is admin/owner in at least one workspace
  const isAdmin = await prisma.workspaceMember.findFirst({
    where: {
      userId: user.id,
      role: { in: ['owner', 'admin'] },
    },
  });

  if (!isAdmin) {
    return forbidden('Admin access required to create agents');
  }

  const body = await req.json();
  const {
    username,
    displayName,
    avatar,
    webhookUrl,
    // AgentConfig fields
    role,
    systemPrompt,
    llmProvider = 'ollama',
    llmModel,
    llmEndpoint,
    triggerType = 'manual',
    cronSchedule,
    scheduledTaskPrompt,
    scheduledCommand,
    canSendMessages = true,
    canEditTasks = true,
    canCreateTasks = false,
    canCreateSubtasks = false,
    canNotifyUsers = true,
    requireApprovalFor,
    actionsPerMinute = 10,
    actionsPerHour = 100,
    dailyTokenLimit,
    dailyCostLimit,
    dockerImage,
    memoryLimitMb = 512,
    cpuLimit = 0.5,
    timeoutSeconds = 300,
  } = body;

  if (!username || !displayName) {
    return badRequest('username and displayName are required');
  }

  // Validate username format
  if (!/^[a-z0-9_-]+$/i.test(username)) {
    return badRequest('Username can only contain letters, numbers, underscores, and hyphens');
  }

  // Check if username already exists
  const existingUser = await prisma.user.findUnique({
    where: { username },
  });

  if (existingUser) {
    return badRequest('Username already taken');
  }

  // Generate API key and email for agent
  const apiKey = `mc_agent_${crypto.randomBytes(16).toString('hex')}`;
  const email = `${username}@agent.local`;
  
  // Create agent user with config
  const agent = await prisma.user.create({
    data: {
      username,
      displayName,
      email,
      password: await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 10),
      avatar,
      isAgent: true,
      apiKey,
      webhookUrl,
      agentConfig: {
        create: {
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
        },
      },
    },
    include: {
      agentConfig: true,
    },
  });

  return created({
    agent: {
      id: agent.id,
      username: agent.username,
      displayName: agent.displayName,
      avatar: agent.avatar,
      email: agent.email,
      apiKey: agent.apiKey, // Return API key only on creation
      webhookUrl: agent.webhookUrl,
      isAgent: agent.isAgent,
      agentConfig: agent.agentConfig,
      createdAt: agent.createdAt,
    },
  });
});
