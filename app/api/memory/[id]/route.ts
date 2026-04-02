import { NextRequest } from 'next/server';
import prisma from '@/lib/db';
import { withAgentParams, AuthAgent } from '@/lib/modules/api/middleware';
import { ok, badRequest, notFound, serverError } from '@/lib/modules/api/response';

/**
 * GET /api/memory/[id] - Get a specific memory by ID
 */
export const GET = withAgentParams(async (
  request: NextRequest,
  agent: AuthAgent,
  params: Promise<Record<string, string>>
) => {
  try {
    const { id } = await params;

    const memory = await prisma.agentMemory.findFirst({
      where: {
        id,
        agentId: agent.id,
      },
      include: {
        entities: {
          include: {
            entity: true,
          },
        },
      },
    });

    if (!memory) {
      return notFound('Memory not found');
    }

    // Update access count
    await prisma.agentMemory.update({
      where: { id },
      data: {
        accessCount: { increment: 1 },
        lastAccessedAt: new Date(),
      },
    });

    return ok({
      success: true,
      memory: {
        id: memory.id,
        content: memory.content,
        summary: memory.summary,
        category: memory.category,
        tier: memory.tier,
        source: memory.source,
        importance: memory.importance,
        decayScore: memory.decayScore,
        accessCount: memory.accessCount + 1,
        isPinned: memory.isPinned,
        isArchived: memory.isArchived,
        entities: memory.entities.map(e => ({
          name: e.entity.name,
          type: e.entity.type,
          role: e.role,
        })),
        createdAt: memory.createdAt,
        updatedAt: memory.updatedAt,
      },
    });

  } catch (error) {
    console.error('[Memory Get] Error:', error);
    return serverError('Failed to get memory', error);
  }
});

/**
 * PATCH /api/memory/[id] - Update a memory
 * 
 * Body:
 *   - content?: string
 *   - summary?: string
 *   - category?: 'episodic' | 'semantic' | 'procedural'
 *   - tier?: 'working' | 'short' | 'long' | 'core'
 *   - importance?: number (0-1)
 *   - isPinned?: boolean
 *   - isArchived?: boolean
 *   - embedding?: number[] (1536 dims)
 */
export const PATCH = withAgentParams(async (
  request: NextRequest,
  agent: AuthAgent,
  params: Promise<Record<string, string>>
) => {
  try {
    const { id } = await params;
    const body = await request.json();

    // Check memory exists and belongs to agent
    const existing = await prisma.agentMemory.findFirst({
      where: {
        id,
        agentId: agent.id,
      },
    });

    if (!existing) {
      return notFound('Memory not found');
    }

    // Build update data
    const updateData: any = {};

    if (body.content !== undefined) {
      if (typeof body.content !== 'string' || body.content.trim().length === 0) {
        return badRequest('content must be a non-empty string');
      }
      updateData.content = body.content.trim();
    }

    if (body.summary !== undefined) {
      updateData.summary = body.summary?.trim() || null;
    }

    if (body.category !== undefined) {
      const validCategories = ['episodic', 'semantic', 'procedural'];
      if (!validCategories.includes(body.category)) {
        return badRequest(`category must be one of: ${validCategories.join(', ')}`);
      }
      updateData.category = body.category;
    }

    if (body.tier !== undefined) {
      const validTiers = ['working', 'short', 'long', 'core'];
      if (!validTiers.includes(body.tier)) {
        return badRequest(`tier must be one of: ${validTiers.join(', ')}`);
      }
      updateData.tier = body.tier;
    }

    if (body.importance !== undefined) {
      if (typeof body.importance !== 'number' || body.importance < 0 || body.importance > 1) {
        return badRequest('importance must be a number between 0 and 1');
      }
      updateData.importance = body.importance;
    }

    if (body.isPinned !== undefined) {
      updateData.isPinned = Boolean(body.isPinned);
    }

    if (body.isArchived !== undefined) {
      updateData.isArchived = Boolean(body.isArchived);
    }

    // Update the memory
    const updated = await prisma.agentMemory.update({
      where: { id },
      data: updateData,
      include: {
        entities: {
          include: {
            entity: true,
          },
        },
      },
    });

    // Update embedding if provided (raw SQL for pgvector)
    if (body.embedding) {
      if (!Array.isArray(body.embedding) || body.embedding.length !== 1536) {
        return badRequest('embedding must be an array of 1536 numbers');
      }
      const vectorStr = `[${body.embedding.join(',')}]`;
      await prisma.$executeRawUnsafe(
        `UPDATE "AgentMemory" SET embedding = $1::vector WHERE id = $2`,
        vectorStr,
        id
      );
    }

    console.log(`[Memory Update] Agent ${agent.username} updated memory ${id}`);

    return ok({
      success: true,
      memory: {
        id: updated.id,
        content: updated.content,
        summary: updated.summary,
        category: updated.category,
        tier: updated.tier,
        source: updated.source,
        importance: updated.importance,
        isPinned: updated.isPinned,
        isArchived: updated.isArchived,
        entities: updated.entities.map(e => ({
          name: e.entity.name,
          type: e.entity.type,
          role: e.role,
        })),
        updatedAt: updated.updatedAt,
      },
    });

  } catch (error) {
    console.error('[Memory Update] Error:', error);
    return serverError('Failed to update memory', error);
  }
});

/**
 * DELETE /api/memory/[id] - Delete a memory
 */
export const DELETE = withAgentParams(async (
  request: NextRequest,
  agent: AuthAgent,
  params: Promise<Record<string, string>>
) => {
  try {
    const { id } = await params;

    // Check memory exists and belongs to agent
    const existing = await prisma.agentMemory.findFirst({
      where: {
        id,
        agentId: agent.id,
      },
    });

    if (!existing) {
      return notFound('Memory not found');
    }

    // Delete the memory (cascade will handle entity links)
    await prisma.agentMemory.delete({
      where: { id },
    });

    console.log(`[Memory Delete] Agent ${agent.username} deleted memory ${id}`);

    return ok({
      success: true,
      deleted: id,
    });

  } catch (error) {
    console.error('[Memory Delete] Error:', error);
    return serverError('Failed to delete memory', error);
  }
});
