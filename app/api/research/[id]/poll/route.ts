import { NextRequest } from 'next/server';
import prisma from '@/lib/db';
import { withAuthParams, AuthUser } from '@/lib/modules/api/middleware';
import { ok, notFound, badRequest } from '@/lib/modules/api/response';

const RESEARCH_AGENT_URL = process.env.RESEARCH_AGENT_URL || 'http://10.0.0.206:18800';
const RESEARCH_AGENT_KEY = process.env.RESEARCH_AGENT_KEY || '';

// Normalize finding confidence from a float (0-1) into a string tier
function normalizeConfidence(value: number | undefined | null): string {
  if (value == null) return 'medium';
  if (value >= 0.7) return 'high';
  if (value >= 0.4) return 'medium';
  return 'low';
}

// GET /api/research/[id]/poll — poll the agent and sync status to DB
export const GET = withAuthParams(async (
  req: NextRequest,
  user: AuthUser,
  rawParams: Promise<Record<string, string>>
) => {
  try {
    const { id } = await rawParams;
    const session = await prisma.researchSession.findUnique({
      where: { id },
      include: {
        _count: { select: { sources: true, findings: true } },
      },
    });

    if (!session) {
      return notFound('Research session not found');
    }

    // If already terminal, just return the current state without polling
    if (session.status === 'complete' || session.status === 'failed') {
      return ok(session);
    }

    // Poll the research agent
    const agentRes = await fetch(`${RESEARCH_AGENT_URL}/api/research/${session.jobId}`, {
      headers: {
        Authorization: `Bearer ${RESEARCH_AGENT_KEY}`,
      },
    });

    if (!agentRes.ok) {
      console.error('[research/poll] agent error:', agentRes.status);
      // Don't fail hard — return existing DB state
      return ok(session);
    }

    const job = await agentRes.json();
    const newStatus = job.status; // pending | running | complete | failed

    // Build the update payload
    const updateData: Record<string, unknown> = { status: newStatus };

    if (newStatus === 'complete' && job.result) {
      const result = job.result;

      updateData.confidence = result.confidence ?? null;
      updateData.summary = result.summary ?? null;
      updateData.consensus = result.consensus ? JSON.stringify(result.consensus) : null;
      updateData.debates = result.debates ? JSON.stringify(result.debates) : null;
      updateData.gaps = result.gaps ? JSON.stringify(result.gaps) : null;
      updateData.completedAt = new Date();

      // Only upsert sources/findings if not already saved (idempotent)
      if (session._count.sources === 0 && Array.isArray(result.sources)) {
        await prisma.researchSource.createMany({
          data: result.sources.map((src: {
            url: string;
            title: string;
            credibility?: number;
            blocked?: boolean;
            findingsCount?: number;
          }) => ({
            sessionId: session.id,
            url: src.url,
            title: src.title || src.url,
            credibility: src.credibility ?? null,
            blocked: src.blocked ?? false,
            findingsCount: src.findingsCount ?? 0,
          })),
          skipDuplicates: true,
        });
      }

      if (session._count.findings === 0 && Array.isArray(result.findings)) {
        await prisma.researchFinding.createMany({
          data: result.findings.map((f: {
            claim: string;
            confidence?: number;
            groundingScore?: number;
            sourceUrl?: string;
          }) => ({
            sessionId: session.id,
            workspaceId: session.workspaceId,
            claim: f.claim,
            confidence: normalizeConfidence(f.confidence),
            groundingScore: f.groundingScore ?? null,
            sourceUrl: f.sourceUrl ?? '',
          })),
          skipDuplicates: true,
        });
      }
    } else if (newStatus === 'failed') {
      updateData.completedAt = new Date();
    }

    // Update the session record
    const updated = await prisma.researchSession.update({
      where: { id: session.id },
      data: updateData as Parameters<typeof prisma.researchSession.update>[0]['data'],
      include: {
        sources: { orderBy: { findingsCount: 'desc' } },
        findings: { orderBy: { groundingScore: 'desc' } },
        createdBy: { select: { id: true, displayName: true, avatar: true } },
      },
    });

    return ok(updated);
  } catch (err) {
    console.error('[research/poll] GET error:', err);
    return badRequest('Failed to poll research job');
  }
});
