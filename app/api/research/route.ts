import { NextRequest } from 'next/server';
import prisma from '@/lib/db';
import { withAuth, AuthUser } from '@/lib/modules/api/middleware';
import { ok, created, badRequest } from '@/lib/modules/api/response';

const RESEARCH_AGENT_URL = process.env.RESEARCH_AGENT_URL || 'http://10.0.0.206:18800';
const RESEARCH_AGENT_KEY = process.env.RESEARCH_AGENT_KEY || '';

// GET /api/research?workspaceId=... — list research sessions for a workspace
export const GET = withAuth(async (req: NextRequest, user: AuthUser) => {
  try {
    const { searchParams } = new URL(req.url);
    let workspaceId = searchParams.get('workspaceId');

    // Fall back to the user's first workspace
    if (!workspaceId) {
      const member = await prisma.workspaceMember.findFirst({
        where: { userId: user.id },
        select: { workspaceId: true },
      });
      if (!member) return ok([]);
      workspaceId = member.workspaceId;
    }

    const sessions = await prisma.researchSession.findMany({
      where: { workspaceId },
      include: {
        createdBy: { select: { id: true, displayName: true, avatar: true } },
        _count: { select: { sources: true, findings: true } },
      },
      orderBy: { startedAt: 'desc' },
      take: 50,
    });

    return ok(sessions);
  } catch (err) {
    console.error('[research] GET error:', err);
    return badRequest('Failed to fetch research sessions');
  }
});

// POST /api/research — start a new research job
export const POST = withAuth(async (req: NextRequest, user: AuthUser) => {
  try {
    const body = await req.json();
    const { query, depth = 'medium', workspaceId: providedWorkspaceId } = body;

    if (!query || typeof query !== 'string' || !query.trim()) {
      return badRequest('query is required');
    }

    // Resolve workspaceId
    let workspaceId = providedWorkspaceId;
    if (!workspaceId) {
      const member = await prisma.workspaceMember.findFirst({
        where: { userId: user.id },
        select: { workspaceId: true },
      });
      if (!member) return badRequest('No workspace found');
      workspaceId = member.workspaceId;
    }

    // Call the research agent service
    const agentRes = await fetch(`${RESEARCH_AGENT_URL}/api/research`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${RESEARCH_AGENT_KEY}`,
      },
      body: JSON.stringify({ query: query.trim(), depth }),
    });

    if (!agentRes.ok) {
      const errText = await agentRes.text().catch(() => 'Unknown error');
      console.error('[research] agent error:', agentRes.status, errText);
      return badRequest(`Research agent returned ${agentRes.status}: ${errText}`);
    }

    const agentData = await agentRes.json();
    const { jobId } = agentData;

    if (!jobId) {
      return badRequest('Research agent did not return a jobId');
    }

    // Persist the session in the DB
    const session = await prisma.researchSession.create({
      data: {
        jobId,
        workspaceId,
        query: query.trim(),
        depth,
        status: agentData.status || 'pending',
        createdById: user.id,
      },
      include: {
        createdBy: { select: { id: true, displayName: true, avatar: true } },
        _count: { select: { sources: true, findings: true } },
      },
    });

    return created(session);
  } catch (err) {
    console.error('[research] POST error:', err);
    return badRequest('Failed to start research job');
  }
});
