import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { getAgentFromApiKey } from '@/lib/agent-auth';

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
export async function GET(request: NextRequest) {
  try {
    const agent = await getAgentFromApiKey();
    if (!agent) {
      return NextResponse.json(
        { error: 'Unauthorized - Invalid or missing API key' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get('projectId');

    if (!projectId) {
      return NextResponse.json(
        { error: 'projectId query parameter is required' },
        { status: 400 }
      );
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
      return NextResponse.json(
        { error: 'Project not found' },
        { status: 404 }
      );
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

    return NextResponse.json({
      columns,
      projectId: project.id,
      projectName: project.name,
    });
  } catch (error) {
    console.error('[Agent Columns] Error fetching columns:', error);
    return NextResponse.json(
      { error: 'Failed to fetch columns' },
      { status: 500 }
    );
  }
}
