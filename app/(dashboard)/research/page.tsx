'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useWorkspace } from '@/components/providers/WorkspaceContext';
import {
  FlaskConical,
  Plus,
  X,
  Star,
  Clock,
  CheckCircle2,
  XCircle,
  Loader2,
  ChevronDown,
  BookOpen,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ResearchSession {
  id: string;
  query: string;
  depth: string;
  status: 'pending' | 'running' | 'complete' | 'failed';
  confidence: number | null;
  startedAt: string;
  completedAt: string | null;
  createdBy: { id: string; displayName: string; avatar: string | null };
  _count: { sources: number; findings: number };
}

interface PinnedFinding {
  id: string;
  sessionId: string;
  claim: string;
  confidence: string;
  groundingScore: number | null;
  sourceUrl: string;
  session: { id: string; query: string; status: string; startedAt: string };
}

type Tab = 'sessions' | 'knowledge-base';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: ResearchSession['status'] }) {
  const map: Record<string, { label: string; classes: string; icon: React.ReactNode }> = {
    pending: {
      label: 'Pending',
      classes: 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30',
      icon: <Clock size={12} />,
    },
    running: {
      label: 'Running',
      classes: 'bg-blue-500/20 text-blue-400 border border-blue-500/30',
      icon: <Loader2 size={12} className="animate-spin" />,
    },
    complete: {
      label: 'Complete',
      classes: 'bg-green-500/20 text-green-400 border border-green-500/30',
      icon: <CheckCircle2 size={12} />,
    },
    failed: {
      label: 'Failed',
      classes: 'bg-red-500/20 text-red-400 border border-red-500/30',
      icon: <XCircle size={12} />,
    },
  };
  const cfg = map[status] ?? map.pending;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${cfg.classes}`}>
      {cfg.icon}
      {cfg.label}
    </span>
  );
}

function ConfidenceBadge({ confidence }: { confidence: string }) {
  const map: Record<string, string> = {
    high: 'bg-green-500/20 text-green-400',
    medium: 'bg-yellow-500/20 text-yellow-400',
    low: 'bg-red-500/20 text-red-400',
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

export default function ResearchPage() {
  const { workspace } = useWorkspace();
  const workspaceId = workspace?.id;

  const [tab, setTab] = useState<Tab>('sessions');
  const [sessions, setSessions] = useState<ResearchSession[]>([]);
  const [kbFindings, setKbFindings] = useState<PinnedFinding[]>([]);
  const [loading, setLoading] = useState(true);
  const [kbLoading, setKbLoading] = useState(false);

  // New research form
  const [showForm, setShowForm] = useState(false);
  const [query, setQuery] = useState('');
  const [depth, setDepth] = useState<'shallow' | 'medium' | 'deep'>('medium');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // ── Fetch sessions ──────────────────────────────────────────────────────────

  const fetchSessions = useCallback(async () => {
    if (!workspaceId) { setLoading(false); return; }
    try {
      const res = await fetch(`/api/research?workspaceId=${workspaceId}`);
      if (res.ok) {
        const data = await res.json();
        setSessions(data);
      }
    } catch (err) {
      console.error('Failed to fetch sessions:', err);
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  const fetchKnowledgeBase = useCallback(async () => {
    if (!workspaceId) return;
    setKbLoading(true);
    try {
      const res = await fetch(`/api/research/knowledge-base?workspaceId=${workspaceId}`);
      if (res.ok) {
        const data = await res.json();
        setKbFindings(data);
      }
    } catch (err) {
      console.error('Failed to fetch knowledge base:', err);
    } finally {
      setKbLoading(false);
    }
  }, [workspaceId]);

  // Initial load
  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  useEffect(() => {
    if (tab === 'knowledge-base') fetchKnowledgeBase();
  }, [tab, fetchKnowledgeBase]);

  // Auto-poll active sessions every 5 seconds
  useEffect(() => {
    const hasActive = sessions.some(
      (s) => s.status === 'pending' || s.status === 'running'
    );
    if (!hasActive) return;

    const interval = setInterval(fetchSessions, 5000);
    return () => clearInterval(interval);
  }, [sessions, fetchSessions]);

  // ── Submit new research ─────────────────────────────────────────────────────

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    setSubmitting(true);
    setFormError(null);

    try {
      const res = await fetch('/api/research', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: query.trim(), depth, workspaceId }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setFormError(err.error || 'Failed to start research');
        return;
      }

      const session = await res.json();
      setSessions((prev) => [session, ...prev]);
      setQuery('');
      setDepth('medium');
      setShowForm(false);
    } catch (err) {
      setFormError('Network error — could not reach server');
    } finally {
      setSubmitting(false);
    }
  }

  // ── Group KB findings by confidence ────────────────────────────────────────

  const grouped = {
    high: kbFindings.filter((f) => f.confidence === 'high'),
    medium: kbFindings.filter((f) => f.confidence === 'medium'),
    low: kbFindings.filter((f) => f.confidence === 'low'),
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-zinc-900 text-white p-6">
      <div className="max-w-5xl mx-auto">

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <FlaskConical size={24} className="text-blue-400" />
            <h1 className="text-2xl font-bold">Research</h1>
          </div>
          <button
            onClick={() => setShowForm((v) => !v)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-sm font-medium transition-colors"
          >
            {showForm ? <X size={16} /> : <Plus size={16} />}
            {showForm ? 'Cancel' : 'New Research'}
          </button>
        </div>

        {/* Inline new-research form */}
        {showForm && (
          <div className="mb-6 bg-zinc-800 border border-zinc-700 rounded-xl p-5">
            <h2 className="text-sm font-semibold text-zinc-300 mb-4">Start a New Research Job</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Research Query</label>
                <textarea
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="What do you want to research? e.g. 'What are the latest advances in RAG systems for production use?'"
                  rows={3}
                  className="w-full bg-zinc-700 border border-zinc-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500 resize-none"
                  required
                />
              </div>
              <div className="flex items-center gap-4">
                <div>
                  <label className="block text-xs text-zinc-400 mb-1">Depth</label>
                  <select
                    value={depth}
                    onChange={(e) => setDepth(e.target.value as typeof depth)}
                    className="bg-zinc-700 border border-zinc-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                  >
                    <option value="shallow">Shallow — fast overview</option>
                    <option value="medium">Medium — balanced (default)</option>
                    <option value="deep">Deep — thorough analysis</option>
                  </select>
                </div>
                <div className="flex-1 flex items-end justify-end gap-3">
                  {formError && (
                    <p className="text-red-400 text-xs">{formError}</p>
                  )}
                  <button
                    type="submit"
                    disabled={submitting || !query.trim()}
                    className="flex items-center gap-2 px-5 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-sm font-medium transition-colors"
                  >
                    {submitting && <Loader2 size={14} className="animate-spin" />}
                    {submitting ? 'Starting…' : 'Start Research'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        )}

        {/* Tabs */}
        <div className="flex border-b border-zinc-700 mb-6">
          {(['sessions', 'knowledge-base'] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors capitalize ${
                tab === t
                  ? 'border-blue-500 text-white'
                  : 'border-transparent text-zinc-400 hover:text-zinc-200'
              }`}
            >
              {t === 'sessions' ? (
                <span className="flex items-center gap-2">
                  <FlaskConical size={14} />
                  Sessions
                  {sessions.length > 0 && (
                    <span className="px-1.5 py-0.5 bg-zinc-700 rounded-full text-xs">
                      {sessions.length}
                    </span>
                  )}
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <BookOpen size={14} />
                  Knowledge Base
                  {kbFindings.length > 0 && (
                    <span className="px-1.5 py-0.5 bg-zinc-700 rounded-full text-xs">
                      {kbFindings.length}
                    </span>
                  )}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Sessions tab */}
        {tab === 'sessions' && (
          <div>
            {loading ? (
              <div className="flex items-center justify-center py-16 text-zinc-500">
                <Loader2 size={20} className="animate-spin mr-2" />
                Loading sessions…
              </div>
            ) : sessions.length === 0 ? (
              <div className="text-center py-16 text-zinc-500">
                <FlaskConical size={40} className="mx-auto mb-3 opacity-30" />
                <p className="text-sm">No research sessions yet.</p>
                <button
                  onClick={() => setShowForm(true)}
                  className="mt-3 text-blue-400 hover:text-blue-300 text-sm"
                >
                  Start your first research job
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {sessions.map((session) => (
                  <Link
                    key={session.id}
                    href={`/research/${session.id}`}
                    className="block bg-zinc-800 hover:bg-zinc-750 border border-zinc-700 hover:border-zinc-600 rounded-xl p-4 transition-all group"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-zinc-100 truncate group-hover:text-white">
                          {session.query}
                        </p>
                        <div className="flex items-center gap-3 mt-2 text-xs text-zinc-500">
                          <span>{formatDate(session.startedAt)}</span>
                          <span>·</span>
                          <span className="capitalize">{session.depth} depth</span>
                          {session._count.findings > 0 && (
                            <>
                              <span>·</span>
                              <span className="flex items-center gap-1">
                                <Star size={11} />
                                {session._count.findings} findings
                              </span>
                            </>
                          )}
                          {session._count.sources > 0 && (
                            <>
                              <span>·</span>
                              <span>{session._count.sources} sources</span>
                            </>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-3 flex-shrink-0">
                        {session.confidence != null && session.status === 'complete' && (
                          <span className="text-xs text-zinc-400">
                            {Math.round(session.confidence * 100)}% confidence
                          </span>
                        )}
                        <StatusBadge status={session.status} />
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Knowledge Base tab */}
        {tab === 'knowledge-base' && (
          <div>
            {kbLoading ? (
              <div className="flex items-center justify-center py-16 text-zinc-500">
                <Loader2 size={20} className="animate-spin mr-2" />
                Loading knowledge base…
              </div>
            ) : kbFindings.length === 0 ? (
              <div className="text-center py-16 text-zinc-500">
                <Star size={40} className="mx-auto mb-3 opacity-30" />
                <p className="text-sm">No pinned findings yet.</p>
                <p className="text-xs mt-1">
                  Open a completed research session and star findings to add them here.
                </p>
              </div>
            ) : (
              <div className="space-y-6">
                {(['high', 'medium', 'low'] as const).map((tier) => {
                  const items = grouped[tier];
                  if (items.length === 0) return null;
                  const tierColors: Record<string, string> = {
                    high: 'text-green-400',
                    medium: 'text-yellow-400',
                    low: 'text-red-400',
                  };
                  return (
                    <div key={tier}>
                      <h3 className={`text-xs font-semibold uppercase tracking-wider mb-3 ${tierColors[tier]}`}>
                        {tier} confidence — {items.length} finding{items.length !== 1 ? 's' : ''}
                      </h3>
                      <div className="space-y-2">
                        {items.map((finding) => (
                          <div
                            key={finding.id}
                            className="bg-zinc-800 border border-zinc-700 rounded-lg p-4"
                          >
                            <p className="text-sm text-zinc-200 leading-relaxed">{finding.claim}</p>
                            <div className="flex items-center gap-3 mt-2 text-xs text-zinc-500">
                              <ConfidenceBadge confidence={finding.confidence} />
                              {finding.groundingScore != null && (
                                <span>{Math.round(finding.groundingScore * 100)}% grounding</span>
                              )}
                              {finding.sourceUrl && (
                                <a
                                  href={finding.sourceUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-blue-400 hover:underline truncate max-w-xs"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  {finding.sourceUrl}
                                </a>
                              )}
                              <span>·</span>
                              <Link
                                href={`/research/${finding.sessionId}`}
                                className="text-zinc-400 hover:text-zinc-200"
                              >
                                {finding.session.query.slice(0, 60)}
                                {finding.session.query.length > 60 ? '…' : ''}
                              </Link>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
