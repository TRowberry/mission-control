import { NextRequest } from 'next/server';
import prisma from '@/lib/db';
import { withAnyAuthParams, AuthActor } from '@/lib/modules/api/middleware';
import { ok, badRequest, notFound, serverError } from '@/lib/modules/api/response';

// Default memory categories
const DEFAULT_CATEGORIES = ['facts', 'preferences', 'relationships', 'events'];

/**
 * GET /api/agents/:id/memory-settings
 * Get memory configuration for an agent
 */
export const GET = withAnyAuthParams(async (request: NextRequest, actor: AuthActor, params) => {
  try {
    const { agentId: id } = await params;

    // Verify agent exists and user has access
    const agent = await prisma.user.findUnique({
      where: { id, isAgent: true },
      include: {
        agentConfig: true,
      },
    });

    if (!agent) {
      return notFound('Agent not found');
    }

    // Get memory stats via raw SQL (models not in Prisma schema yet)
    const stats = await prisma.$queryRaw<[{memories: bigint, entities: bigint, relationships: bigint}]>`
      SELECT 
        (SELECT COUNT(*) FROM "AgentMemory" WHERE "agentId" = ${id}) as memories,
        (SELECT COUNT(*) FROM "AgentEntity" WHERE "agentId" = ${id}) as entities,
        (SELECT COUNT(*) FROM "AgentRelationship" WHERE "agentId" = ${id}) as relationships
    `;

    const config = agent.agentConfig;
    
    return ok({
      agentId: id,
      agentName: agent.displayName || agent.username,
      settings: {
        enabled: config?.memoryEnabled ?? false,
        categories: config?.memoryCategories 
          ? JSON.parse(config.memoryCategories) 
          : DEFAULT_CATEGORIES,
        decayRate: config?.memoryDecayRate ?? 0.1,
        minImportance: config?.memoryMinImportance ?? 0.3,
        injectionCount: config?.memoryInjectionCount ?? 5,
        retentionDays: config?.memoryRetentionDays ?? 90,
      },
      stats: {
        totalMemories: Number(stats[0]?.memories ?? 0),
        totalEntities: Number(stats[0]?.entities ?? 0),
        totalRelationships: Number(stats[0]?.relationships ?? 0),
      },
    });
  } catch (error) {
    console.error('[Memory Settings GET] Error:', error);
    return serverError('Failed to get memory settings');
  }
});

/**
 * PATCH /api/agents/:id/memory-settings
 * Update memory configuration for an agent
 */
export const PATCH = withAnyAuthParams(async (request: NextRequest, actor: AuthActor, params) => {
  try {
    const { agentId: id } = await params;
    const body = await request.json();

    // Verify agent exists
    const agent = await prisma.user.findUnique({
      where: { id, isAgent: true },
      include: { agentConfig: true },
    });

    if (!agent) {
      return notFound('Agent not found');
    }

    // Validate input
    const updates: any = {};

    if (typeof body.enabled === 'boolean') {
      updates.memoryEnabled = body.enabled;
    }

    if (Array.isArray(body.categories)) {
      // Validate categories
      const validCategories = body.categories.filter((c: string) =>
        DEFAULT_CATEGORIES.includes(c)
      );
      updates.memoryCategories = JSON.stringify(validCategories);
    }

    if (typeof body.decayRate === 'number') {
      if (body.decayRate < 0 || body.decayRate > 1) {
        return badRequest('decayRate must be between 0 and 1');
      }
      updates.memoryDecayRate = body.decayRate;
    }

    if (typeof body.minImportance === 'number') {
      if (body.minImportance < 0 || body.minImportance > 1) {
        return badRequest('minImportance must be between 0 and 1');
      }
      updates.memoryMinImportance = body.minImportance;
    }

    if (typeof body.injectionCount === 'number') {
      if (body.injectionCount < 0 || body.injectionCount > 50) {
        return badRequest('injectionCount must be between 0 and 50');
      }
      updates.memoryInjectionCount = Math.floor(body.injectionCount);
    }

    if (typeof body.retentionDays === 'number') {
      if (body.retentionDays < 1 || body.retentionDays > 365) {
        return badRequest('retentionDays must be between 1 and 365');
      }
      updates.memoryRetentionDays = Math.floor(body.retentionDays);
    }

    if (Object.keys(updates).length === 0) {
      return badRequest('No valid fields to update');
    }

    // Upsert agent config
    const config = await prisma.agentConfig.upsert({
      where: { userId: id },
      create: {
        userId: id,
        ...updates,
      },
      update: updates,
    });

    console.log(`[Memory Settings] Updated settings for agent ${agent.username}`);

    return ok({
      success: true,
      settings: {
        enabled: config.memoryEnabled,
        categories: config.memoryCategories 
          ? JSON.parse(config.memoryCategories) 
          : DEFAULT_CATEGORIES,
        decayRate: config.memoryDecayRate,
        minImportance: config.memoryMinImportance,
        injectionCount: config.memoryInjectionCount,
        retentionDays: config.memoryRetentionDays,
      },
    });
  } catch (error) {
    console.error('[Memory Settings PATCH] Error:', error);
    return serverError('Failed to update memory settings');
  }
});
