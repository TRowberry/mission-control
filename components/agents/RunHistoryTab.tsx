'use client';

import { useState, useEffect } from 'react';
import {
  History,
  CheckCircle,
  XCircle,
  Clock,
  Loader2,
  PlayCircle,
  Zap,
  DollarSign,
  ChevronDown,
  ChevronRight,
  AlertTriangle,
  RefreshCw,
  MessageSquare,
  FileEdit,
  Send,
  Globe,
  Code,
  Search,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';

interface Run {
  id: string;
  triggeredBy: string;
  triggerUser: { id: string; displayName: string; avatar: string | null } | null;
  status: string;
  actionsCount: number;
  actionsRun: number;
  actionsFailed: number;
  tokensUsed: number;
  cost: number;
  durationMs: number | null;
  input: string | null;
  output: string | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
}

interface Action {
  id: string;
  actionType: string;
  targetId: string | null;
  payload: any;
  status: string;
  tokensUsed: number | null;
  cost: number | null;
  errorMessage: string | null;
  approvedBy: { id: string; displayName: string; avatar: string | null } | null;
  approvedAt: string | null;
  createdAt: string;
  executedAt: string | null;
}

interface Stats {
  total: number;
  totalTokens: number;
  totalCost: number;
  lastRunAt: string | null;
  lastRunStatus: string | null;
  successRate: number;
  last24h: { runs: number; tokens: number; cost: number };
  last7d: { runs: number; tokens: number; cost: number };
}

interface ActionStats {
  byType: Record<string, number>;
  byStatus: Record<string, number>;
  total: number;
}

interface RunHistoryTabProps {
  agentId: string;
}

type ViewMode = 'runs' | 'actions';

export default function RunHistoryTab({ agentId }: RunHistoryTabProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('runs');
  
  // Runs state
  const [runs, setRuns] = useState<Run[]>([]);
  const [runStats, setRunStats] = useState<Stats | null>(null);
  const [loadingRuns, setLoadingRuns] = useState(true);
  const [expandedRun, setExpandedRun] = useState<string | null>(null);
  const [runsHasMore, setRunsHasMore] = useState(false);
  const [runsNextCursor, setRunsNextCursor] = useState<string | null>(null);
  
  // Actions state
  const [actions, setActions] = useState<Action[]>([]);
  const [actionStats, setActionStats] = useState<ActionStats | null>(null);
  const [loadingActions, setLoadingActions] = useState(false);
  const [actionsHasMore, setActionsHasMore] = useState(false);
  const [actionsNextCursor, setActionsNextCursor] = useState<string | null>(null);
  const [expandedAction, setExpandedAction] = useState<string | null>(null);
  
  const [error, setError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  async function fetchRuns(cursor?: string) {
    try {
      const url = cursor
        ? `/api/agents/${agentId}/runs?cursor=${cursor}`
        : `/api/agents/${agentId}/runs`;
      
      const res = await fetch(url, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch runs');
      
      const data = await res.json();
      
      if (cursor) {
        setRuns(prev => [...prev, ...data.runs]);
      } else {
        setRuns(data.runs);
        setRunStats(data.stats);
      }
      
      setRunsHasMore(data.pagination.hasMore);
      setRunsNextCursor(data.pagination.nextCursor);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load runs');
    } finally {
      setLoadingRuns(false);
      setLoadingMore(false);
    }
  }

  async function fetchActions(cursor?: string) {
    try {
      setLoadingActions(true);
      const url = cursor
        ? `/api/agents/${agentId}/actions?cursor=${cursor}`
        : `/api/agents/${agentId}/actions`;
      
      const res = await fetch(url, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch actions');
      
      const data = await res.json();
      
      if (cursor) {
        setActions(prev => [...prev, ...data.actions]);
      } else {
        setActions(data.actions);
        setActionStats(data.stats);
      }
      
      setActionsHasMore(data.pagination.hasMore);
      setActionsNextCursor(data.pagination.nextCursor);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load actions');
    } finally {
      setLoadingActions(false);
      setLoadingMore(false);
    }
  }

  useEffect(() => {
    if (agentId) {
      fetchRuns();
    }
  }, [agentId]);

  useEffect(() => {
    if (viewMode === 'actions' && actions.length === 0 && !loadingActions) {
      fetchActions();
    }
  }, [viewMode]);

  function getStatusIcon(status: string) {
    switch (status) {
      case 'completed':
      case 'executed':
      case 'approved':
        return <CheckCircle className="w-4 h-4 text-green-400" />;
      case 'failed':
      case 'rejected':
        return <XCircle className="w-4 h-4 text-red-400" />;
      case 'running':
        return <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />;
      case 'pending':
      case 'pending_approval':
        return <Clock className="w-4 h-4 text-yellow-400" />;
      case 'cancelled':
        return <AlertTriangle className="w-4 h-4 text-orange-400" />;
      default:
        return <Clock className="w-4 h-4 text-gray-400" />;
    }
  }

  function getStatusColor(status: string) {
    switch (status) {
      case 'completed':
      case 'executed':
      case 'approved':
        return 'bg-green-500/20 text-green-400 border-green-500/30';
      case 'failed':
      case 'rejected':
        return 'bg-red-500/20 text-red-400 border-red-500/30';
      case 'running':
        return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
      case 'pending':
      case 'pending_approval':
        return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
      case 'cancelled':
        return 'bg-orange-500/20 text-orange-400 border-orange-500/30';
      default:
        return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
    }
  }

  function getActionIcon(type: string) {
    switch (type) {
      case 'message':
      case 'send_dm':
      case 'post_channel':
        return <MessageSquare className="w-4 h-4" />;
      case 'create_task':
      case 'update_task':
      case 'complete_task':
        return <FileEdit className="w-4 h-4" />;
      case 'fetch':
        return <Globe className="w-4 h-4" />;
      case 'code':
        return <Code className="w-4 h-4" />;
      case 'search':
        return <Search className="w-4 h-4" />;
      default:
        return <Send className="w-4 h-4" />;
    }
  }

  function formatDuration(ms: number | null) {
    if (ms === null) return '-';
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
  }

  if (loadingRuns && viewMode === 'runs') {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-8">
        <AlertTriangle className="w-8 h-8 text-red-400 mx-auto mb-2" />
        <p className="text-red-400">{error}</p>
        <button
          onClick={() => { setError(null); viewMode === 'runs' ? fetchRuns() : fetchActions(); }}
          className="mt-2 text-sm text-indigo-400 hover:text-indigo-300"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats Overview */}
      {runStats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-gray-800/50 rounded-lg p-3">
            <div className="flex items-center gap-2 text-gray-400 text-xs mb-1">
              <PlayCircle className="w-3 h-3" />
              Total Runs
            </div>
            <div className="text-xl font-semibold text-white">{runStats.total}</div>
          </div>
          <div className="bg-gray-800/50 rounded-lg p-3">
            <div className="flex items-center gap-2 text-gray-400 text-xs mb-1">
              <CheckCircle className="w-3 h-3" />
              Success Rate
            </div>
            <div className="text-xl font-semibold text-white">{runStats.successRate}%</div>
          </div>
          <div className="bg-gray-800/50 rounded-lg p-3">
            <div className="flex items-center gap-2 text-gray-400 text-xs mb-1">
              <Zap className="w-3 h-3" />
              Total Tokens
            </div>
            <div className="text-xl font-semibold text-white">
              {runStats.totalTokens.toLocaleString()}
            </div>
          </div>
          <div className="bg-gray-800/50 rounded-lg p-3">
            <div className="flex items-center gap-2 text-gray-400 text-xs mb-1">
              <DollarSign className="w-3 h-3" />
              Total Cost
            </div>
            <div className="text-xl font-semibold text-white">
              ${runStats.totalCost.toFixed(4)}
            </div>
          </div>
        </div>
      )}

      {/* View Mode Toggle */}
      <div className="flex gap-2 border-b border-gray-700">
        <button
          onClick={() => setViewMode('runs')}
          className={cn(
            'px-4 py-2 text-sm font-medium transition-colors',
            viewMode === 'runs'
              ? 'text-white border-b-2 border-indigo-500'
              : 'text-gray-400 hover:text-gray-200'
          )}
        >
          <History className="w-4 h-4 inline mr-2" />
          Runs
        </button>
        <button
          onClick={() => setViewMode('actions')}
          className={cn(
            'px-4 py-2 text-sm font-medium transition-colors',
            viewMode === 'actions'
              ? 'text-white border-b-2 border-indigo-500'
              : 'text-gray-400 hover:text-gray-200'
          )}
        >
          <Send className="w-4 h-4 inline mr-2" />
          Actions
          {actionStats && <span className="ml-1 text-xs text-gray-500">({actionStats.total})</span>}
        </button>
      </div>

      {/* Runs View */}
      {viewMode === 'runs' && (
        <div>
          {runs.length === 0 ? (
            <div className="text-center py-8 bg-gray-800/30 rounded-lg">
              <History className="w-10 h-10 text-gray-600 mx-auto mb-2" />
              <p className="text-gray-400">No runs yet</p>
            </div>
          ) : (
            <div className="space-y-2">
              {runs.map(run => (
                <div key={run.id} className="bg-gray-800/50 rounded-lg overflow-hidden">
                  <button
                    onClick={() => setExpandedRun(expandedRun === run.id ? null : run.id)}
                    className="w-full flex items-center justify-between p-3 hover:bg-gray-800/70 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      {getStatusIcon(run.status)}
                      <div className="text-left">
                        <div className="flex items-center gap-2">
                          <span className={cn('text-xs px-2 py-0.5 rounded border', getStatusColor(run.status))}>
                            {run.status}
                          </span>
                          <span className="text-xs text-gray-500">
                            {run.triggeredBy === 'manual' && run.triggerUser
                              ? `by ${run.triggerUser.displayName}`
                              : run.triggeredBy}
                          </span>
                        </div>
                        <div className="text-xs text-gray-400 mt-1">
                          {formatDistanceToNow(new Date(run.createdAt), { addSuffix: true })}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right text-xs">
                        <div className="text-gray-400">
                          {run.actionsRun}/{run.actionsCount} actions
                        </div>
                        <div className="text-gray-500">
                          {formatDuration(run.durationMs)} • {run.tokensUsed} tokens
                        </div>
                      </div>
                      {expandedRun === run.id ? (
                        <ChevronDown className="w-4 h-4 text-gray-400" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-gray-400" />
                      )}
                    </div>
                  </button>
                  {expandedRun === run.id && (
                    <div className="border-t border-gray-700 p-3 space-y-3">
                      {run.input && (
                        <div>
                          <div className="text-xs text-gray-500 mb-1">Input</div>
                          <pre className="text-xs bg-gray-900/50 p-2 rounded border border-gray-700 overflow-x-auto max-h-32 text-gray-300">
                            {run.input}
                          </pre>
                        </div>
                      )}
                      {run.output && (
                        <div>
                          <div className="text-xs text-gray-500 mb-1">Output</div>
                          <pre className="text-xs bg-gray-900/50 p-2 rounded border border-gray-700 overflow-x-auto max-h-48 text-gray-300">
                            {run.output}
                          </pre>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
              {runsHasMore && (
                <button
                  onClick={() => { setLoadingMore(true); fetchRuns(runsNextCursor || undefined); }}
                  disabled={loadingMore}
                  className="w-full py-2 text-sm text-indigo-400 hover:text-indigo-300 disabled:opacity-50"
                >
                  {loadingMore ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Load more'}
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Actions View */}
      {viewMode === 'actions' && (
        <div>
          {loadingActions ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
            </div>
          ) : actions.length === 0 ? (
            <div className="text-center py-8 bg-gray-800/30 rounded-lg">
              <Send className="w-10 h-10 text-gray-600 mx-auto mb-2" />
              <p className="text-gray-400">No actions recorded</p>
            </div>
          ) : (
            <div className="space-y-2">
              {actions.map(action => (
                <div key={action.id} className="bg-gray-800/50 rounded-lg overflow-hidden">
                  <button
                    onClick={() => setExpandedAction(expandedAction === action.id ? null : action.id)}
                    className="w-full flex items-center justify-between p-3 hover:bg-gray-800/70 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="text-gray-400">{getActionIcon(action.actionType)}</div>
                      <div className="text-left">
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-white font-medium">
                            {action.actionType.replace(/_/g, ' ')}
                          </span>
                          <span className={cn('text-xs px-2 py-0.5 rounded border', getStatusColor(action.status))}>
                            {action.status.replace(/_/g, ' ')}
                          </span>
                        </div>
                        <div className="text-xs text-gray-400 mt-1">
                          {formatDistanceToNow(new Date(action.createdAt), { addSuffix: true })}
                          {action.approvedBy && (
                            <span className="ml-2">
                              • approved by {action.approvedBy.displayName}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {action.tokensUsed && (
                        <span className="text-xs text-gray-500">{action.tokensUsed} tokens</span>
                      )}
                      {expandedAction === action.id ? (
                        <ChevronDown className="w-4 h-4 text-gray-400" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-gray-400" />
                      )}
                    </div>
                  </button>
                  {expandedAction === action.id && (
                    <div className="border-t border-gray-700 p-3 space-y-3">
                      {action.targetId && (
                        <div className="text-xs">
                          <span className="text-gray-500">Target:</span>
                          <span className="text-gray-300 ml-2">{action.targetId}</span>
                        </div>
                      )}
                      {action.payload && (
                        <div>
                          <div className="text-xs text-gray-500 mb-1">Payload</div>
                          <pre className="text-xs bg-gray-900/50 p-2 rounded border border-gray-700 overflow-x-auto max-h-32 text-gray-300">
                            {JSON.stringify(action.payload, null, 2)}
                          </pre>
                        </div>
                      )}
                      {action.errorMessage && (
                        <div className="bg-red-500/10 border border-red-500/30 rounded p-2">
                          <div className="text-xs text-red-400">{action.errorMessage}</div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
              {actionsHasMore && (
                <button
                  onClick={() => { setLoadingMore(true); fetchActions(actionsNextCursor || undefined); }}
                  disabled={loadingMore}
                  className="w-full py-2 text-sm text-indigo-400 hover:text-indigo-300 disabled:opacity-50"
                >
                  {loadingMore ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Load more'}
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
