import { NextRequest } from 'next/server';
import prisma from '@/lib/db';
import { withAgent, AuthAgent } from '@/lib/modules/api/middleware';
import { ok, badRequest, serverError } from '@/lib/modules/api/response';

/**
 * GET /api/memory/browse - Paginated list of memories
 * 
 * Query params:
 *   - page: number (default: 1)
 *   - limit: number (default: 20, max: 100)
 *   - category: string - Filter by category
 *   - tier: string - Filter by tier
 *   - source: string - Filter by source
 *   - isPinned: boolean - Filter by pinned status
 *   - includeArchived: boolean (default: false)
 *   - sortBy: 'createdAt' | 'importance' | 'accessCount' | 'decayScore' (default: 'createdAt')
 *   - sortOrder: 'asc' | 'desc' (default: 'desc')
 */
export const GET = withAgent(async (request: NextRequest, agent: AuthAgent) => {
  try {
    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '20')));
    const category = searchParams.get('category');
    const tier = searchParams.get('tier');
    const source = searchParams.get('source');
    const isPinnedParam = searchParams.get('isPinned');
    const includeArchived = searchParams.get('includeArchived') === 'true';
    const sortBy = searchParams.get('sortBy') || 'createdAt';
    const sortOrder = searchParams.get('sortOrder') || 'desc';

    // Validate sortBy
    const validSortFields = ['createdAt', 'importance', 'accessCount', 'decayScore', 'updatedAt'];
    if (!validSortFields.includes(sortBy)) {
      return badRequest(`sortBy must be one of: ${validSortFields.join(', ')}`);
    }

    // Validate sortOrder
    if (!['asc', 'desc'].includes(sortOrder)) {
      return badRequest('sortOrder must be asc or desc');
    }

    // Build where clause
    const where: any = {
      agentId: agent.id,
    };

    if (!includeArchived) {
      where.isArchived = false;
    }

    if (category) {
      where.category = category;
    }

    if (tier) {
      where.tier = tier;
    }

    if (source) {
      where.source = source;
    }

    if (isPinnedParam !== null) {
      where.isPinned = isPinnedParam === 'true';
    }

    // Get total count
    const total = await prisma.agentMemory.count({ where });

    // Get memories
    const memories = await prisma.agentMemory.findMany({
      where,
      orderBy: { [sortBy]: sortOrder },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        entities: {
          include: {
            entity: true,
          },
        },
      },
    });

    // Calculate pagination info
    const totalPages = Math.ceil(total / limit);
    const hasNext = page < totalPages;
    const hasPrev = page > 1;

    // Get summary stats
    const stats = await prisma.agentMemory.groupBy({
      by: ['category'],
      where: { agentId: agent.id, isArchived: false },
      _count: true,
    });

    const tierStats = await prisma.agentMemory.groupBy({
      by: ['tier'],
      where: { agentId: agent.id, isArchived: false },
      _count: true,
    });

    return ok({
      success: true,
      memories: memories.map(m => ({
        id: m.id,
        content: m.content,
        summary: m.summary,
        category: m.category,
        tier: m.tier,
        source: m.source,
        importance: m.importance,
        decayScore: m.decayScore,
        accessCount: m.accessCount,
        isPinned: m.isPinned,
        isArchived: m.isArchived,
        entities: m.entities.map(e => ({
          name: e.entity.name,
          type: e.entity.type,
          role: e.role,
        })),
        createdAt: m.createdAt,
        updatedAt: m.updatedAt,
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNext,
        hasPrev,
      },
      stats: {
        byCategory: Object.fromEntries(stats.map(s => [s.category, s._count])),
        byTier: Object.fromEntries(tierStats.map(s => [s.tier, s._count])),
        total,
        pinned: await prisma.agentMemory.count({ where: { agentId: agent.id, isPinned: true, isArchived: false } }),
        archived: await prisma.agentMemory.count({ where: { agentId: agent.id, isArchived: true } }),
      },
    });

  } catch (error) {
    console.error('[Memory Browse] Error:', error);
    return serverError('Failed to browse memories', error);
  }
});
