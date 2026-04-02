import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { withAgent, AuthAgent } from '@/lib/modules/api/middleware';
import { ok, badRequest, serverError } from '@/lib/modules/api/response';

/**
 * POST /api/memory/store - Store a memory with optional embedding
 * 
 * Headers:
 *   - X-API-Key: Agent's API key (required)
 * 
 * Body:
 *   - content: string (required) - The memory content
 *   - summary?: string - Short summary of the memory
 *   - embedding?: number[] - Pre-computed embedding vector (1536 dims for OpenAI)
 *   - category?: 'episodic' | 'semantic' | 'procedural' (default: 'episodic')
 *   - tier?: 'working' | 'short' | 'long' | 'core' (default: 'working')
 *   - source?: 'conversation' | 'observation' | 'reflection' (default: 'conversation')
 *   - importance?: number (0-1, default: 0.5)
 *   - userId?: string - Associated user ID
 *   - sessionId?: string - Session identifier
 *   - messageId?: string - Associated message ID
 *   - isPinned?: boolean (default: false)
 *   - tags?: string[] - Tags for categorization
 *   - entities?: Array<{ name: string, type: string }> - Entities to link
 */
export const POST = withAgent(async (request: NextRequest, agent: AuthAgent) => {
  try {
    const body = await request.json();
    const {
      content,
      summary,
      embedding,
      category = 'episodic',
      tier = 'working',
      source = 'conversation',
      importance = 0.5,
      userId,
      sessionId,
      messageId,
      isPinned = false,
      entities = [],
    } = body;

    // Validate required fields
    if (!content || typeof content !== 'string' || content.trim().length === 0) {
      return badRequest('content is required and must be a non-empty string');
    }

    // Validate category
    const validCategories = ['episodic', 'semantic', 'procedural'];
    if (!validCategories.includes(category)) {
      return badRequest(`category must be one of: ${validCategories.join(', ')}`);
    }

    // Validate tier
    const validTiers = ['working', 'short', 'long', 'core'];
    if (!validTiers.includes(tier)) {
      return badRequest(`tier must be one of: ${validTiers.join(', ')}`);
    }

    // Validate source
    const validSources = ['conversation', 'observation', 'reflection'];
    if (!validSources.includes(source)) {
      return badRequest(`source must be one of: ${validSources.join(', ')}`);
    }

    // Validate importance
    if (typeof importance !== 'number' || importance < 0 || importance > 1) {
      return badRequest('importance must be a number between 0 and 1');
    }

    // Validate embedding if provided
    if (embedding) {
      if (!Array.isArray(embedding) || embedding.length !== 1536) {
        return badRequest('embedding must be an array of 1536 numbers');
      }
      if (!embedding.every(n => typeof n === 'number')) {
        return badRequest('embedding must contain only numbers');
      }
    }

    // Create the memory
    // Note: pgvector embedding is stored via raw SQL since Prisma doesn't support it natively
    const memory = await prisma.agentMemory.create({
      data: {
        agentId: agent.id,
        content: content.trim(),
        summary: summary?.trim() || null,
        category,
        tier,
        source,
        importance,
        decayScore: 1.0, // Start fresh
        accessCount: 0,
        userId: userId || null,
        sessionId: sessionId || null,
        messageId: messageId || null,
        isPinned,
        isArchived: false,
      },
    });

    // Store embedding if provided (using raw SQL for pgvector)
    if (embedding) {
      const vectorStr = `[${embedding.join(',')}]`;
      await prisma.$executeRawUnsafe(
        `UPDATE "AgentMemory" SET embedding = $1::vector WHERE id = $2`,
        vectorStr,
        memory.id
      );
    }

    // Link entities if provided
    if (entities.length > 0) {
      for (const entityData of entities) {
        if (!entityData.name || !entityData.type) continue;

        // Find or create entity
        let entity = await prisma.agentEntity.findFirst({
          where: {
            agentId: agent.id,
            name: entityData.name,
            type: entityData.type,
          },
        });

        if (!entity) {
          entity = await prisma.agentEntity.create({
            data: {
              agentId: agent.id,
              name: entityData.name,
              type: entityData.type,
              description: entityData.description || null,
            },
          });
        } else {
          // Update mention count
          await prisma.agentEntity.update({
            where: { id: entity.id },
            data: { 
              mentionCount: { increment: 1 },
              lastSeenAt: new Date(),
            },
          });
        }

        // Link memory to entity
        await prisma.agentMemoryEntity.create({
          data: {
            memoryId: memory.id,
            entityId: entity.id,
            role: entityData.role || null,
          },
        });
      }
    }

    // Fetch the full memory with entities
    const fullMemory = await prisma.agentMemory.findUnique({
      where: { id: memory.id },
      include: {
        entities: {
          include: {
            entity: true,
          },
        },
      },
    });

    console.log(`[Memory Store] Agent ${agent.username} stored memory ${memory.id} (${category}/${tier})`);

    return ok({
      success: true,
      memory: {
        id: fullMemory!.id,
        content: fullMemory!.content,
        summary: fullMemory!.summary,
        category: fullMemory!.category,
        tier: fullMemory!.tier,
        source: fullMemory!.source,
        importance: fullMemory!.importance,
        hasEmbedding: !!embedding,
        isPinned: fullMemory!.isPinned,
        entities: fullMemory!.entities.map(e => ({
          name: e.entity.name,
          type: e.entity.type,
          role: e.role,
        })),
        createdAt: fullMemory!.createdAt,
      },
    });

  } catch (error) {
    console.error('[Memory Store] Error:', error);
    return serverError('Failed to store memory', error);
  }
});
