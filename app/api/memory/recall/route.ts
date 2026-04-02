import { NextRequest } from 'next/server';
import prisma from '@/lib/db';
import { withAgent, AuthAgent } from '@/lib/modules/api/middleware';
import { ok, badRequest, serverError } from '@/lib/modules/api/response';

/**
 * GET /api/memory/recall - Semantic search for memories
 * 
 * Headers:
 *   - X-API-Key: Agent's API key (required)
 * 
 * Query params:
 *   - query: string - Text to search for (required if no embedding)
 *   - embedding: string - JSON-encoded embedding vector (optional, overrides query)
 *   - limit: number - Max results (default: 10, max: 50)
 *   - threshold: number - Minimum similarity score 0-1 (default: 0.5)
 *   - category: string - Filter by category (episodic|semantic|procedural)
 *   - tier: string - Filter by tier (working|short|long|core)
 *   - includeArchived: boolean - Include archived memories (default: false)
 * 
 * Note: For now, this endpoint requires pre-computed embeddings.
 * Use /api/memory/embed to generate embeddings for text queries.
 */
export const GET = withAgent(async (request: NextRequest, agent: AuthAgent) => {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('query');
    const embeddingParam = searchParams.get('embedding');
    const limit = Math.min(parseInt(searchParams.get('limit') || '10'), 50);
    const threshold = parseFloat(searchParams.get('threshold') || '0.5');
    const category = searchParams.get('category');
    const tier = searchParams.get('tier');
    const includeArchived = searchParams.get('includeArchived') === 'true';

    // Validate we have either query or embedding
    if (!query && !embeddingParam) {
      return badRequest('Either query or embedding parameter is required');
    }

    // Parse embedding if provided
    let embedding: number[] | null = null;
    if (embeddingParam) {
      try {
        embedding = JSON.parse(embeddingParam);
        if (!Array.isArray(embedding) || embedding.length !== 1536) {
          return badRequest('embedding must be an array of 1536 numbers');
        }
      } catch {
        return badRequest('Invalid embedding JSON');
      }
    }

    // If no embedding provided, we need to do text-based search
    // For now, fall back to simple text matching until embedding service is ready
    if (!embedding) {
      // Simple text search fallback
      const where: any = {
        agentId: agent.id,
        isArchived: includeArchived ? undefined : false,
        content: {
          contains: query!,
          mode: 'insensitive',
        },
      };
      
      if (category) where.category = category;
      if (tier) where.tier = tier;

      const memories = await prisma.agentMemory.findMany({
        where,
        orderBy: [
          { importance: 'desc' },
          { createdAt: 'desc' },
        ],
        take: limit,
        include: {
          entities: {
            include: {
              entity: true,
            },
          },
        },
      });

      // Update access counts
      if (memories.length > 0) {
        await prisma.agentMemory.updateMany({
          where: { id: { in: memories.map(m => m.id) } },
          data: {
            accessCount: { increment: 1 },
            lastAccessedAt: new Date(),
          },
        });
      }

      return ok({
        success: true,
        searchType: 'text',
        query,
        memories: memories.map(m => ({
          id: m.id,
          content: m.content,
          summary: m.summary,
          category: m.category,
          tier: m.tier,
          source: m.source,
          importance: m.importance,
          isPinned: m.isPinned,
          accessCount: m.accessCount + 1,
          entities: m.entities.map(e => ({
            name: e.entity.name,
            type: e.entity.type,
            role: e.role,
          })),
          createdAt: m.createdAt,
          similarity: null, // Text search doesn't have similarity score
        })),
        total: memories.length,
      });
    }

    // Vector similarity search using pgvector
    const vectorStr = `[${embedding.join(',')}]`;
    
    // Build WHERE clause
    let whereClause = `"agentId" = '${agent.id}'`;
    if (!includeArchived) whereClause += ` AND "isArchived" = false`;
    if (category) whereClause += ` AND category = '${category}'`;
    if (tier) whereClause += ` AND tier = '${tier}'`;
    whereClause += ` AND embedding IS NOT NULL`;

    // Query using cosine similarity (1 - cosine distance)
    const results = await prisma.$queryRawUnsafe<any[]>(`
      SELECT 
        id,
        content,
        summary,
        category,
        tier,
        source,
        importance,
        "isPinned",
        "accessCount",
        "createdAt",
        1 - (embedding <=> $1::vector) as similarity
      FROM "AgentMemory"
      WHERE ${whereClause}
        AND 1 - (embedding <=> $1::vector) >= $2
      ORDER BY embedding <=> $1::vector
      LIMIT $3
    `, vectorStr, threshold, limit);

    // Update access counts for retrieved memories
    if (results.length > 0) {
      await prisma.agentMemory.updateMany({
        where: { id: { in: results.map(m => m.id) } },
        data: {
          accessCount: { increment: 1 },
          lastAccessedAt: new Date(),
        },
      });
    }

    // Fetch entities for each memory
    const memoriesWithEntities = await Promise.all(
      results.map(async (m) => {
        const entities = await prisma.agentMemoryEntity.findMany({
          where: { memoryId: m.id },
          include: { entity: true },
        });
        return {
          ...m,
          accessCount: m.accessCount + 1,
          entities: entities.map(e => ({
            name: e.entity.name,
            type: e.entity.type,
            role: e.role,
          })),
        };
      })
    );

    console.log(`[Memory Recall] Agent ${agent.username} searched, found ${results.length} memories`);

    return ok({
      success: true,
      searchType: 'vector',
      threshold,
      memories: memoriesWithEntities,
      total: memoriesWithEntities.length,
    });

  } catch (error) {
    console.error('[Memory Recall] Error:', error);
    return serverError('Failed to recall memories', error);
  }
});
