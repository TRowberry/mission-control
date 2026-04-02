import { NextRequest } from 'next/server';
import prisma from '@/lib/db';
import { withAgent, AuthAgent } from '@/lib/modules/api/middleware';
import { ok, badRequest, notFound, serverError } from '@/lib/modules/api/response';

/**
 * GET /api/agents/columns
 * 
 * List columns for a project.
 * 
 * Query params:
 *   - projectId: required - filter columns by project
 * 
 * Headers:
 *   - X-API-Key: Agent's API key
 */
export const GET = withAgent(async (request: NextRequest, agent: AuthAgent) => {
  try {
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get('projectId');

    if (!projectId) {
      return badRequest('projectId query parameter is required');
    }

    // Verify project exists
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: {
        id: true,
        name: true,
      },
    });

    if (!project) {
      return notFound('Project not found');
    }

    // Get columns for the project
    const columns = await prisma.column.findMany({
      where: { projectId },
      orderBy: { position: 'asc' },
      select: {
        id: true,
        name: true,
        position: true,
      },
    });

    return ok({
      columns,
      projectId: project.id,
      projectName: project.name,
    });
  } catch (error) {
    console.error('[Agent Columns] Error fetching columns:', error);
    return serverError('Failed to fetch columns', error);
  }
});
