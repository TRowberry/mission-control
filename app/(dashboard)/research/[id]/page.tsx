'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  ArrowLeft,
  Star,
  StarOff,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  Globe,
  AlertTriangle,
  MessageSquare,
  TrendingUp,
  HelpCircle,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ResearchSource {
  id: string;
  url: string;
  title: string;
  credibility: number | null;
  blocked: boolean;
  findingsCount: number;
}

interface ResearchFinding {
  id: string;
  sessionId: string;
  claim: string;
  confidence: string; // high | medium | low
  groundingScore: number | null;
  sourceUrl: string;
  pinned: boolean;
}

interface ResearchSession {
  id: string;
  jobId: string;
  query: string;
  depth: string;
  status: 'pending' | 'running' | 'complete' | 'failed';
  confidence: number | null;
  summary: string | null;
  consensus: string | null; // JSON array
  debates: string | null;   // JSON array
  gaps: string | null;      // JSON object
  startedAt: string;
  completedAt: string | null;
  createdBy: { id: string; displayName: string; avatar: string | null };
  sources: ResearchSource[];
  findings: ResearchFinding[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: ResearchSession['status'] }) {
  const map: Record<string, { label: string; classes: string; icon: React.ReactNode }> = {
    pending: {
      label: 'Pending',
      classes: 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30',
      icon: <Clock size={13} />,
    },
    running: {
      label: 'Running',
      classes: 'bg-blue-500/20 text-blue-400 border border-blue-500/30',
      icon: <Loader2 size={13} className="animate-spin" />,
    },
    complete: {
      label: 'Complete',
      classes: 'bg-green-500/20 text-green-400 border border-green-500/30',
      icon: <CheckCircle2 size={13} />,
    },
    failed: {
      label: 'Failed',
      classes: 'bg-red-500/20 text-red-400 border border-red-500/30',
      icon: <XCircle size={13} />,
    },
  };
  const cfg = map[status] ?? map.pending;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${cfg.classes}`}>
      {cfg.icon}
      {cfg.label}
    </span>
  );
}

function ConfidenceBadge({ confidence }: { confidence: string }) {
  const map: Record<string, string> = {
    high: 'bg-green-500/20 text-green-400 border border-green-500/30',
    medium: 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30',
    low: 'bg-red-500/20 text-red-400 border border-red-500/30',
  };
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${map[confidence] ?? map.medium}`}>
      {confidence}
    </span>
  );
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function ResearchDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [session, setSession] = useState<ResearchSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Parsed JSON fields
  const [consensus, setConsensus] = useState<string[]>([]);
  const [debates, setDebates] = useState<string[]>([]);
  const [gaps, setGaps] = useState<{ unanswered?: string[]; unexplored?: string[] } | null>(null);

  // Parse JSON string fields whenever session updates
  useEffect(() => {
    if (!session) return;
    try { setConsensus(session.consensus ? JSON.parse(session.consensus) : []); } catch { setConsensus([]); }
    try { setDebates(session.debates ? JSON.parse(session.debates) : []); } catch { setDebates([]); }
    try { setGaps(session.gaps ? JSON.parse(session.gaps) : null); } catch { setGaps(null); }
  }, [session]);

  // ── Fetch detail ────────────────────────────────────────────────────────────

  const fetchDetail = useCallback(async () => {
    try {
      const res = await fetch(`/api/research/${id}`);
      if (!res.ok) { setError('Session not found'); return; }
      const data = await res.json();
      setSession(data);
    } catch {
      setError('Failed to load session');
    } finally {
      setLoading(false);
    }
  }, [id]);

  // ── Poll for status updates ─────────────────────────────────────────────────

  const poll = useCallback(async () => {
    try {
      const res = await fetch(`/api/research/${id}/poll`);
      if (res.ok) {
        const data = await res.json();
        setSession(data);
      }
    } catch {
      // Silently ignore poll errors — we'll retry next tick
    }
  }, [id]);

  useEffect(() => {
    fetchDetail();
  }, [fetchDetail]);

  useEffect(() => {
    if (!session) return;
    if (session.status === 'complete' || session.status === 'failed') return;

    // Poll every 5 seconds while job is active
    const interval = setInterval(poll, 5000);
    return () => clearInterval(interval);
  }, [session, poll]);

  // ── Pin toggle ──────────────────────────────────────────────────────────────

  async function togglePin(finding: ResearchFinding) {
    const newPinned = !finding.pinned;

    // Optimistic update
    setSession((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        findings: prev.findings.map((f) =>
          f.id === finding.id ? { ...f, pinned: newPinned } : f
        ),
      };
    });

    try {
      await fetch(`/api/research/${id}/findings/${finding.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pinned: newPinned }),
      });
    } catch {
      // Roll back on error
      setSession((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          findings: prev.findings.map((f) =>
            f.id === finding.id ? { ...f, pinned: finding.pinned } : f
          ),
        };
      });
    }
  }

  // ── Render states ───────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-900 text-white flex items-center justify-center">
        <Loader2 size={24} className="animate-spin text-zinc-500" />
      </div>
    );
  }

  if (error || !session) {
    return (
      <div className="min-h-screen bg-zinc-900 text-white p-6">
        <div className="max-w-4xl mx-auto">
          <Link href="/research" className="inline-flex items-center gap-2 text-zinc-400 hover:text-zinc-200 mb-6 text-sm">
            <ArrowLeft size={16} /> Back to Research
          </Link>
          <div className="text-red-400">{error || 'Session not found'}</div>
        </div>
      </div>
    );
  }

  const isActive = session.status === 'pending' || session.status === 'running';

  return (
    <div className="min-h-screen bg-zinc-900 text-white p-6">
      <div className="max-w-4xl mx-auto space-y-6">

        {/* Back + Header */}
        <div>
          <Link href="/research" className="inline-flex items-center gap-2 text-zinc-400 hover:text-zinc-200 mb-4 text-sm">
            <ArrowLeft size={16} /> Back to Research
          </Link>

          <div className="bg-zinc-800 border border-zinc-700 rounded-xl p-5">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <h1 className="text-xl font-semibold text-zinc-100 leading-snug">
                  {session.query}
                </h1>
                <div className="flex items-center gap-3 mt-2 text-xs text-zinc-500">
                  <span>{formatDate(session.startedAt)}</span>
                  <span>·</span>
                  <span className="capitalize">{session.depth} depth</span>
                  {session.completedAt && (
                    <>
                      <span>·</span>
                      <span>Completed {formatDate(session.completedAt)}</span>
                    </>
                  )}
                  <span>·</span>
                  <span>by {session.createdBy.displayName}</span>
                </div>
              </div>
              <div className="flex items-center gap-3 flex-shrink-0">
                {session.confidence != null && (
                  <span className="text-sm font-semibold text-green-400">
                    {Math.round(session.confidence * 100)}% confidence
                  </span>
                )}
                <StatusBadge status={session.status} />
              </div>
            </div>

            {/* Running indicator */}
            {isActive && (
              <div className="mt-4 flex items-center gap-3 text-blue-400 text-sm bg-blue-500/10 border border-blue-500/20 rounded-lg px-4 py-3">
                <Loader2 size={16} className="animate-spin flex-shrink-0" />
                <span>Research is in progress — auto-refreshing every 5 seconds…</span>
              </div>
            )}
          </div>
        </div>

        {/* Summary */}
        {session.summary && (
          <div className="bg-zinc-800 border border-zinc-700 rounded-xl p-5">
            <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-3 flex items-center gap-2">
              <MessageSquare size={14} />
              Summary
            </h2>
            <p className="text-zinc-200 text-sm leading-relaxed whitespace-pre-wrap">
              {session.summary}
            </p>
          </div>
        )}

        {/* Consensus + Debates */}
        {(consensus.length > 0 || debates.length > 0) && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {consensus.length > 0 && (
              <div className="bg-zinc-800 border border-zinc-700 rounded-xl p-5">
                <h2 className="text-sm font-semibold text-green-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                  <TrendingUp size={14} />
                  Consensus Points
                </h2>
                <ul className="space-y-2">
                  {consensus.map((point, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-zinc-300">
                      <span className="text-green-400 mt-0.5 flex-shrink-0">✓</span>
                      {point}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {debates.length > 0 && (
              <div className="bg-zinc-800 border border-zinc-700 rounded-xl p-5">
                <h2 className="text-sm font-semibold text-yellow-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                  <AlertTriangle size={14} />
                  Active Debates
                </h2>
                <ul className="space-y-2">
                  {debates.map((point, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-zinc-300">
                      <span className="text-yellow-400 mt-0.5 flex-shrink-0">⚡</span>
                      {point}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* Gaps */}
        {gaps && (
          (gaps.unanswered?.length || gaps.unexplored?.length) ? (
            <div className="bg-zinc-800 border border-zinc-700 rounded-xl p-5">
              <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                <HelpCircle size={14} />
                Knowledge Gaps
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {gaps.unanswered && gaps.unanswered.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-zinc-500 mb-2">Unanswered Questions</p>
                    <ul className="space-y-1.5">
                      {gaps.unanswered.map((q, i) => (
                        <li key={i} className="text-sm text-zinc-300 flex items-start gap-2">
                          <span className="text-zinc-500 flex-shrink-0">?</span>
                          {q}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {gaps.unexplored && gaps.unexplored.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-zinc-500 mb-2">Unexplored Areas</p>
                    <ul className="space-y-1.5">
                      {gaps.unexplored.map((a, i) => (
                        <li key={i} className="text-sm text-zinc-300 flex items-start gap-2">
                          <span className="text-zinc-500 flex-shrink-0">→</span>
                          {a}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          ) : null
        )}

        {/* Sources table */}
        {session.sources.length > 0 && (
          <div className="bg-zinc-800 border border-zinc-700 rounded-xl overflow-hidden">
            <div className="px-5 py-3 border-b border-zinc-700 flex items-center gap-2">
              <Globe size={14} className="text-zinc-400" />
              <h2 className="text-sm font-semibold">
                Sources
                <span className="ml-2 text-zinc-500 font-normal">({session.sources.length})</span>
              </h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-700 text-xs text-zinc-500 uppercase tracking-wider">
                    <th className="text-left px-5 py-2.5 font-medium">Title / URL</th>
                    <th className="text-center px-3 py-2.5 font-medium">Credibility</th>
                    <th className="text-center px-3 py-2.5 font-medium">Findings</th>
                    <th className="text-center px-3 py-2.5 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-700/50">
                  {session.sources.map((source) => (
                    <tr key={source.id} className="hover:bg-zinc-700/30 transition-colors">
                      <td className="px-5 py-3">
                        <div className="font-medium text-zinc-200 truncate max-w-xs">
                          {source.title}
                        </div>
                        <a
                          href={source.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-blue-400 hover:underline truncate max-w-xs block"
                        >
                          {source.url}
                        </a>
                      </td>
                      <td className="px-3 py-3 text-center">
                        {source.credibility != null ? (
                          <span className={`text-xs font-medium ${
                            source.credibility >= 0.7 ? 'text-green-400' :
                            source.credibility >= 0.4 ? 'text-yellow-400' : 'text-red-400'
                          }`}>
                            {Math.round(source.credibility * 100)}%
                          </span>
                        ) : (
                          <span className="text-zinc-600">—</span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-center text-zinc-400">
                        {source.findingsCount}
                      </td>
                      <td className="px-3 py-3 text-center">
                        {source.blocked ? (
                          <span className="px-2 py-0.5 bg-red-500/20 text-red-400 rounded-full text-xs">
                            Blocked
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 bg-green-500/20 text-green-400 rounded-full text-xs">
                            OK
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Findings list */}
        {session.findings.length > 0 && (
          <div className="bg-zinc-800 border border-zinc-700 rounded-xl overflow-hidden">
            <div className="px-5 py-3 border-b border-zinc-700 flex items-center gap-2">
              <Star size={14} className="text-zinc-400" />
              <h2 className="text-sm font-semibold">
                Findings
                <span className="ml-2 text-zinc-500 font-normal">({session.findings.length})</span>
              </h2>
              <span className="ml-auto text-xs text-zinc-500">
                Star a finding to add it to the Knowledge Base
              </span>
            </div>
            <div className="divide-y divide-zinc-700/50">
              {session.findings.map((finding) => (
                <div
                  key={finding.id}
                  className="px-5 py-4 flex items-start gap-4 hover:bg-zinc-700/20 transition-colors"
                >
                  {/* Pin button */}
                  <button
                    onClick={() => togglePin(finding)}
                    className={`flex-shrink-0 mt-0.5 transition-colors ${
                      finding.pinned
                        ? 'text-yellow-400 hover:text-yellow-300'
                        : 'text-zinc-600 hover:text-yellow-400'
                    }`}
                    title={finding.pinned ? 'Unpin from Knowledge Base' : 'Pin to Knowledge Base'}
                  >
                    {finding.pinned ? <Star size={16} fill="currentColor" /> : <Star size={16} />}
                  </button>

                  {/* Claim */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-zinc-200 leading-relaxed">{finding.claim}</p>
                    <div className="flex items-center gap-3 mt-2 flex-wrap">
                      <ConfidenceBadge confidence={finding.confidence} />
                      {finding.groundingScore != null && (
                        <span className="text-xs text-zinc-500">
                          {Math.round(finding.groundingScore * 100)}% grounding
                        </span>
                      )}
                      {finding.sourceUrl && (
                        <a
                          href={finding.sourceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-blue-400 hover:underline truncate max-w-sm"
                        >
                          {finding.sourceUrl}
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Empty state for complete but no data */}
        {session.status === 'complete' && session.findings.length === 0 && session.sources.length === 0 && (
          <div className="text-center py-8 text-zinc-500 bg-zinc-800 border border-zinc-700 rounded-xl">
            <p className="text-sm">No findings or sources were returned by the research agent.</p>
          </div>
        )}

      </div>
    </div>
  );
}
