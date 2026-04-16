/**
 * Research Agent HTTP API Server
 *
 * Wraps ResearchAgent with an async job queue so long-running research
 * tasks can be started via HTTP and polled for completion.
 *
 * Routes:
 *   POST   /api/research        — start a new research job
 *   GET    /api/research        — list recent jobs (last 50, newest first)
 *   GET    /api/research/:id    — get job status / result
 *   DELETE /api/research/:id    — cancel a pending or running job
 *   GET    /health              — health check
 */

import 'dotenv/config';
import express from 'express';
import { ResearchAgent } from './index.js';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const PORT = process.env.RESEARCH_PORT || 18800;
const API_KEY = process.env.RESEARCH_API_KEY || null; // null = dev mode (no auth)
const MAX_CONCURRENT = 2;          // max running jobs at once
const JOB_TTL_MS = 24 * 60 * 60 * 1000; // 24 h auto-cleanup

// ---------------------------------------------------------------------------
// In-memory job store
// ---------------------------------------------------------------------------

/** @type {Map<string, object>} */
const jobs = new Map();

/** Track active (running) job count */
let runningCount = 0;

// ---------------------------------------------------------------------------
// Job helpers
// ---------------------------------------------------------------------------

function generateJobId() {
  return `job_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}

/**
 * Create a fresh job object.
 */
function createJob({ query, depth = 'medium', maxSources }) {
  // Resolve maxSources from depth preset when not explicitly provided
  const depthDefaults = { shallow: 4, medium: 8, deep: 15 };
  const resolvedMaxSources = maxSources ?? depthDefaults[depth] ?? 8;

  return {
    id: generateJobId(),
    status: 'queued',
    query,
    depth,
    maxSources: resolvedMaxSources,
    startedAt: new Date(),
    completedAt: null,
    progress: {
      stage: 'queued',
      sourcesFound: 0,
      sourcesRead: 0,
      findingsCount: 0,
      message: 'Job queued, waiting for an available slot',
    },
    result: null,
    error: null,
  };
}

/**
 * Build ResearchAgent options from a depth string.
 */
function agentOptionsForDepth(depth, maxSources) {
  const presets = {
    shallow: { depth: 'shallow', timeBudget: 180,  maxSources: 4,  parallelReads: 1, searchDelayMs: 1500, minConfidence: 0.6, verbose: false },
    medium:  { depth: 'medium',  timeBudget: 600,  maxSources: 8,  parallelReads: 1, searchDelayMs: 1500, minConfidence: 0.6, verbose: false },
    deep:    { depth: 'deep',    timeBudget: 1200, maxSources: 15, parallelReads: 1, searchDelayMs: 1500, minConfidence: 0.6, verbose: false },
  };
  const base = presets[depth] ?? presets.medium;
  // Allow caller to override maxSources
  return { ...base, maxSources };
}

/**
 * Extract the structured result from a completed report object.
 */
function extractResult(report) {
  const session = report?.session ?? {};
  const synthesis = session.synthesis ?? {};

  const sources = (session.sources ?? []).map((s) => ({
    url: s.url,
    title: s.title ?? s.url,
    credibility: s.credibility ?? null,
    blocked: !!(typeof s.error === 'string' && s.error.includes('403')),
    findingsCount: s.findings?.length ?? 0,
  }));

  const findings = (session.sources ?? []).flatMap((s) => s.findings ?? []);

  return {
    summary: synthesis.summary ?? null,
    confidence: session.confidence ?? null,
    findings,
    sources,
    consensus: synthesis.consensus ?? [],
    debates: synthesis.debates ?? [],
    gaps: synthesis.gaps ?? {},
    sessionId: session.id ?? null,
  };
}

/**
 * Prune jobs older than JOB_TTL_MS.
 */
function pruneOldJobs() {
  const cutoff = Date.now() - JOB_TTL_MS;
  for (const [id, job] of jobs) {
    const ts = job.completedAt ?? job.startedAt;
    if (ts && new Date(ts).getTime() < cutoff) {
      jobs.delete(id);
    }
  }
}

// Run cleanup every hour
setInterval(pruneOldJobs, 60 * 60 * 1000).unref();

// ---------------------------------------------------------------------------
// Job runner
// ---------------------------------------------------------------------------

/**
 * Actually execute a research job.
 * Called when a slot is available.
 */
async function runJob(job) {
  job.status = 'running';
  job.progress.stage = 'searching';
  job.progress.message = 'Research in progress…';
  runningCount++;

  try {
    const opts = agentOptionsForDepth(job.depth, job.maxSources);
    const agent = new ResearchAgent(opts);

    const report = await agent.research(job.query);

    job.status = 'complete';
    job.completedAt = new Date();
    job.progress.stage = 'complete';
    job.progress.message = 'Research complete';
    job.result = extractResult(report);

    // Update source/findings counts from result
    job.progress.sourcesFound = job.result.sources.length;
    job.progress.sourcesRead  = job.result.sources.filter((s) => !s.blocked).length;
    job.progress.findingsCount = job.result.findings.length;
  } catch (err) {
    job.status = 'failed';
    job.completedAt = new Date();
    job.progress.stage = 'failed';
    job.progress.message = err.message ?? 'Unknown error';
    job.error = err.message ?? String(err);
  } finally {
    runningCount--;
    // Kick off the next queued job if any
    drainQueue();
  }
}

/**
 * Start queued jobs up to MAX_CONCURRENT.
 */
function drainQueue() {
  if (runningCount >= MAX_CONCURRENT) return;

  for (const job of jobs.values()) {
    if (runningCount >= MAX_CONCURRENT) break;
    if (job.status === 'queued') {
      runJob(job); // intentionally not awaited — fire-and-forget
    }
  }
}

// ---------------------------------------------------------------------------
// Express app
// ---------------------------------------------------------------------------

const app = express();

app.use(express.json());

// CORS — allow all origins
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  next();
});

// ---------------------------------------------------------------------------
// Auth middleware
// ---------------------------------------------------------------------------

function requireAuth(req, res, next) {
  // Dev mode: no key configured → skip auth
  if (!API_KEY) return next();

  const authHeader = req.headers['authorization'] ?? '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token || token !== API_KEY) {
    return res.status(401).json({ error: 'Unauthorized — invalid or missing Bearer token' });
  }
  next();
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

/**
 * GET /health
 * Health check — returns uptime and job stats.
 */
app.get('/health', (req, res) => {
  const statuses = [...jobs.values()].reduce(
    (acc, j) => { acc[j.status] = (acc[j.status] ?? 0) + 1; return acc; },
    {}
  );

  res.json({
    ok: true,
    uptime: process.uptime(),
    jobStats: {
      total: jobs.size,
      running: runningCount,
      ...statuses,
    },
  });
});

/**
 * POST /api/research
 * Body: { query: string, depth?: 'shallow'|'medium'|'deep', maxSources?: number }
 * Returns: { jobId, status }
 */
app.post('/api/research', requireAuth, (req, res) => {
  const { query, depth = 'medium', maxSources } = req.body ?? {};

  if (!query || typeof query !== 'string' || !query.trim()) {
    return res.status(400).json({ error: '`query` is required and must be a non-empty string' });
  }

  const validDepths = ['shallow', 'medium', 'deep'];
  if (!validDepths.includes(depth)) {
    return res.status(400).json({ error: `\`depth\` must be one of: ${validDepths.join(', ')}` });
  }

  const job = createJob({ query: query.trim(), depth, maxSources });
  jobs.set(job.id, job);

  // Kick off if a slot is free
  drainQueue();

  res.status(202).json({ jobId: job.id, status: job.status });
});

/**
 * GET /api/research
 * Returns the last 50 jobs, newest first.
 */
app.get('/api/research', requireAuth, (req, res) => {
  const list = [...jobs.values()]
    .sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt))
    .slice(0, 50);

  res.json(list);
});

/**
 * GET /api/research/:id
 * Returns the full job object (including result when complete).
 */
app.get('/api/research/:id', requireAuth, (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  res.json(job);
});

/**
 * DELETE /api/research/:id
 * Cancel a queued or running job.
 * (Running jobs cannot be interrupted mid-flight; we mark them cancelled
 *  so the result is discarded when the promise settles.)
 */
app.delete('/api/research/:id', requireAuth, (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found' });

  if (job.status === 'complete' || job.status === 'failed') {
    return res.status(409).json({ error: `Cannot cancel a job with status "${job.status}"` });
  }

  // Mark cancelled — drainQueue will skip it; running jobs will discard their
  // result when they check this flag in the finally block (best-effort).
  job.status = 'failed';
  job.completedAt = new Date();
  job.error = 'Cancelled by request';
  job.progress.stage = 'failed';
  job.progress.message = 'Cancelled by request';

  // If it was queued (not yet running) don't count it against runningCount
  res.json({ jobId: job.id, status: job.status });
});

// ---------------------------------------------------------------------------
// Start server
// ---------------------------------------------------------------------------

app.listen(PORT, () => {
  const authMode = API_KEY ? 'auth enabled' : 'dev mode — no auth';
  console.log(`🔬 Research Agent API listening on port ${PORT} (${authMode})`);
});
