import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getAgentFromRequest } from '@/lib/agent-auth';

/**
 * POST /api/qa/results - Store QA test results (called by QA runner)
 * 
 * Headers:
 *   - X-API-Key: Agent's API key (required)
 * 
 * Body:
 *   - results: Test results object from run-all-tests.js
 *   - deployCommit: Git commit hash (optional)
 *   - deployBranch: Git branch (optional)
 */
export async function POST(request: NextRequest) {
  try {
    const agent = await getAgentFromRequest(request);
    if (!agent) {
      return NextResponse.json(
        { error: 'Unauthorized - Agent API key required' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { results, deployCommit, deployBranch } = body;

    if (!results) {
      return NextResponse.json(
        { error: 'results field is required' },
        { status: 400 }
      );
    }

    // Store in database
    const testRun = await prisma.qaTestRun.create({
      data: {
        timestamp: new Date(results.timestamp || Date.now()),
        passed: results.summary?.failed === 0,
        totalTests: results.summary?.total || 0,
        passedTests: results.summary?.passed || 0,
        failedTests: results.summary?.failed || 0,
        suites: results.suites ? JSON.stringify(results.suites) : null,
        deployCommit,
        deployBranch,
        triggeredById: agent.id,
      },
    });

    return NextResponse.json({
      success: true,
      runId: testRun.id,
      passed: testRun.passed,
    });

  } catch (error) {
    console.error('[QA Results] Error:', error);
    return NextResponse.json(
      { error: 'Failed to store QA results' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/qa/results - Get QA test history
 * 
 * Query params:
 *   - limit: Number of results (default 20, max 100)
 *   - passed: Filter by passed status (true/false)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 100);
    const passedFilter = searchParams.get('passed');

    const where: any = {};
    if (passedFilter !== null) {
      where.passed = passedFilter === 'true';
    }

    const runs = await prisma.qaTestRun.findMany({
      where,
      orderBy: { timestamp: 'desc' },
      take: limit,
      include: {
        triggeredBy: {
          select: { id: true, displayName: true, avatar: true }
        }
      }
    });

    // Parse suites JSON
    const formattedRuns = runs.map(run => ({
      ...run,
      suites: run.suites ? JSON.parse(run.suites as string) : null,
    }));

    // Calculate stats
    const stats = {
      totalRuns: await prisma.qaTestRun.count(),
      passedRuns: await prisma.qaTestRun.count({ where: { passed: true } }),
      failedRuns: await prisma.qaTestRun.count({ where: { passed: false } }),
      lastRun: runs[0]?.timestamp || null,
      passRate: 0,
    };
    stats.passRate = stats.totalRuns > 0 
      ? Math.round((stats.passedRuns / stats.totalRuns) * 100) 
      : 0;

    return NextResponse.json({
      runs: formattedRuns,
      stats,
    });

  } catch (error) {
    console.error('[QA Results] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch QA results' },
      { status: 500 }
    );
  }
}
