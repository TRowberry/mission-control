'use client';

import { useState, useEffect } from 'react';
import {
  Bot,
  Plus,
  MoreVertical,
  Edit,
  Copy,
  Trash2,
  Play,
  FileText,
  AlertCircle,
  CheckCircle,
  Clock,
  Zap,
  Loader2,
  RefreshCw,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { cn, formatRelativeTime } from '@/lib/utils';
import AgentModal from './AgentModal';

interface AgentConfig {
  id: string;
  role: string | null;
  systemPrompt: string | null;
  llmProvider: string;
  llmModel: string | null;
  llmEndpoint: string | null;
  triggerType: string;
  cronSchedule: string | null;
  scheduledTaskPrompt: string | null;
  scheduledCommand: string | null;
  canSendMessages: boolean;
  canEditTasks: boolean;
  canCreateTasks: boolean;
  canNotifyUsers: boolean;
  requireApprovalFor: string | null;
  actionsPerMinute: number;
  actionsPerHour: number;
  dailyTokenLimit: number | null;
  dailyCostLimit: number | null;
  dockerImage: string | null;
  memoryLimitMb: number;
  cpuLimit: number;
  timeoutSeconds: number;
  lastRunAt: string | null;
  lastRunStatus: string | null;
  runCount: number;
  totalTokensUsed: number;
  totalCost: number;
}

interface ProjectAccess {
  projectId: string;
  role: string;
  project: { id: string; name: string; color: string };
}

interface Agent {
  id: string;
  username: string;
  displayName: string;
  avatar: string | null;
  status: string;
  email: string;
  webhookUrl: string | null;
  createdAt: string;
  agentConfig: AgentConfig | null;
  projectAccess: ProjectAccess[];
}

interface RunResult {
  agentId: string;
  agentName: string;
  success: boolean;
  message: string;
  output?: string;
  tokensUsed?: number;
  durationMs?: number;
  status: 'pending' | 'running' | 'completed' | 'failed';
}

type AgentStatus = 'active' | 'disabled' | 'rate-limited' | 'error';

function getAgentStatus(agent: Agent): AgentStatus {
  if (agent.status === 'offline') return 'disabled';
  if (agent.agentConfig?.lastRunStatus === 'error') return 'error';
  if (agent.agentConfig?.lastRunStatus === 'rate_limited') return 'rate-limited';
  return 'active';
}

const statusConfig: Record<AgentStatus, { label: string; color: string; icon: typeof CheckCircle }> = {
  active: { label: 'Active', color: 'text-green-400 bg-green-500/20', icon: CheckCircle },
  disabled: { label: 'Disabled', color: 'text-gray-400 bg-gray-500/20', icon: Clock },
  'rate-limited': { label: 'Rate Limited', color: 'text-yellow-400 bg-yellow-500/20', icon: Zap },
  error: { label: 'Error', color: 'text-red-400 bg-red-500/20', icon: AlertCircle },
};

export default function AgentList() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [editingAgent, setEditingAgent] = useState<Agent | null>(null);
  const [menuOpen, setMenuOpen] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [runResult, setRunResult] = useState<RunResult | null>(null);
  const [outputExpanded, setOutputExpanded] = useState(false);

  useEffect(() => {
    fetchAgents();
  }, []);

  async function fetchAgents() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/agents');
      if (!res.ok) throw new Error('Failed to fetch agents');
      const data = await res.json();
      setAgents(data.agents || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load agents');
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(agent: Agent) {
    if (!confirm(`Delete agent "${agent.displayName}"? This cannot be undone.`)) return;
    
    setActionLoading(agent.id);
    try {
      const res = await fetch(`/api/agents/${agent.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete agent');
      setAgents(prev => prev.filter(a => a.id !== agent.id));
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete agent');
    } finally {
      setActionLoading(null);
      setMenuOpen(null);
    }
  }

  async function handleDuplicate(agent: Agent) {
    setActionLoading(agent.id);
    try {
      const res = await fetch('/api/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: `${agent.username}-copy-${Date.now()}`,
          displayName: `${agent.displayName} (Copy)`,
          avatar: agent.avatar,
        }),
      });
      if (!res.ok) throw new Error('Failed to duplicate agent');
      await fetchAgents();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to duplicate agent');
    } finally {
      setActionLoading(null);
      setMenuOpen(null);
    }
  }

  
  async function handleRun(agent: Agent) {
    setActionLoading(agent.id);
    setRunResult(null);
    setOutputExpanded(false);
    setMenuOpen(null);
    try {
      const res = await fetch(`/api/agents/${agent.id}/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          input: 'Manual run triggered from UI',
          triggeredBy: 'manual',
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to run agent');
      
      const runId = data.run?.id;
      setRunResult({
        agentId: agent.id,
        agentName: agent.displayName,
        success: false,
        message: `Running ${agent.displayName}...`,
        status: 'running',
      });

      // Poll for completion
      if (runId) {
        const pollInterval = setInterval(async () => {
          try {
            const statusRes = await fetch(`/api/agents/${agent.id}/run?runId=${runId}`);
            if (statusRes.ok) {
              const statusData = await statusRes.json();
              const run = statusData.runs?.find((r: { id: string }) => r.id === runId);
              if (run && run.status !== 'pending' && run.status !== 'running') {
                clearInterval(pollInterval);
                const success = run.status === 'completed';
                setRunResult({
                  agentId: agent.id,
                  agentName: agent.displayName,
                  success,
                  message: success 
                    ? `Run completed successfully`
                    : `Run failed: ${run.errorMessage || 'Unknown error'}`,
                  output: run.output || undefined,
                  tokensUsed: run.tokensUsed || 0,
                  durationMs: run.durationMs || 0,
                  status: run.status,
                });
                if (success && run.output) {
                  setOutputExpanded(true);
                }
                fetchAgents();
              }
            }
          } catch { /* ignore poll errors */ }
        }, 1000);

        // Stop polling after 60s
        setTimeout(() => clearInterval(pollInterval), 60000);
      }
    } catch (err) {
      setRunResult({
        agentId: agent.id,
        agentName: agent.displayName,
        success: false,
        message: err instanceof Error ? err.message : 'Failed to run agent',
        status: 'failed',
      });
    } finally {
      setActionLoading(null);
    }
  }

  function handleEdit(agent: Agent) {
    setEditingAgent(agent);
    setShowModal(true);
    setMenuOpen(null);
  }

  function formatUsage(agent: Agent): string {
    const tokens = agent.agentConfig?.totalTokensUsed || 0;
    if (tokens >= 1000000) return `${(tokens / 1000000).toFixed(1)}M tokens`;
    if (tokens >= 1000) return `${(tokens / 1000).toFixed(1)}K tokens`;
    return `${tokens} tokens`;
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-6 text-center">
        <AlertCircle className="w-8 h-8 text-red-400 mx-auto mb-2" />
        <p className="text-red-400">{error}</p>
        <button
          onClick={fetchAgents}
          className="mt-4 px-4 py-2 bg-red-500/20 text-red-400 rounded-lg hover:bg-red-500/30"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Agents</h1>
          <p className="text-gray-400 text-sm mt-1">
            Manage AI agents that can automate tasks in your workspace
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchAgents}
            className="p-2 text-gray-400 hover:text-white hover:bg-gray-700/50 rounded-lg"
            title="Refresh"
          >
            <RefreshCw className="w-5 h-5" />
          </button>
          <button
            onClick={() => {
              setEditingAgent(null);
              setShowModal(true);
            }}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
          >
            <Plus className="w-4 h-4" />
            Create Agent
          </button>
        </div>
      </div>

      {/* Run Result Panel */}
      {runResult && (
        <div className={cn(
          'mb-4 rounded-lg border overflow-hidden',
          runResult.status === 'running' ? 'bg-blue-500/10 border-blue-500/30' :
          runResult.success ? 'bg-green-500/10 border-green-500/30' : 
          'bg-red-500/10 border-red-500/30'
        )}>
          {/* Header */}
          <div className="p-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              {runResult.status === 'running' ? (
                <Loader2 className="w-5 h-5 text-blue-400 animate-spin" />
              ) : runResult.success ? (
                <CheckCircle className="w-5 h-5 text-green-400" />
              ) : (
                <AlertCircle className="w-5 h-5 text-red-400" />
              )}
              <div>
                <span className={cn(
                  'font-medium',
                  runResult.status === 'running' ? 'text-blue-300' :
                  runResult.success ? 'text-green-300' : 'text-red-300'
                )}>
                  {runResult.agentName}
                </span>
                <span className="text-gray-400 ml-2">—</span>
                <span className={cn(
                  'ml-2',
                  runResult.status === 'running' ? 'text-blue-300' :
                  runResult.success ? 'text-green-300' : 'text-red-300'
                )}>
                  {runResult.message}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {runResult.status !== 'running' && (
                <div className="flex items-center gap-4 text-sm text-gray-400">
                  {runResult.tokensUsed !== undefined && (
                    <span>🎯 {runResult.tokensUsed} tokens</span>
                  )}
                  {runResult.durationMs !== undefined && (
                    <span>⏱️ {(runResult.durationMs / 1000).toFixed(1)}s</span>
                  )}
                </div>
              )}
              {runResult.output && (
                <button 
                  onClick={() => setOutputExpanded(!outputExpanded)}
                  className="text-gray-400 hover:text-gray-200 p-1"
                >
                  {outputExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                </button>
              )}
              <button 
                onClick={() => setRunResult(null)} 
                className="text-gray-400 hover:text-gray-200 text-xl leading-none"
              >
                ×
              </button>
            </div>
          </div>
          
          {/* Output Section */}
          {runResult.output && outputExpanded && (
            <div className="border-t border-gray-700/50 p-4 bg-gray-900/50">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-gray-400 uppercase">LLM Response</span>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(runResult.output || '');
                  }}
                  className="text-xs text-gray-500 hover:text-gray-300"
                >
                  Copy
                </button>
              </div>
              <pre className="text-sm text-gray-300 whitespace-pre-wrap font-mono bg-gray-800/50 p-3 rounded-lg max-h-64 overflow-y-auto">
                {runResult.output}
              </pre>
            </div>
          )}
        </div>
      )}

      {/* Table */}
      {agents.length === 0 ? (
        <div className="bg-gray-800/50 border border-gray-700/50 rounded-lg p-12 text-center">
          <Bot className="w-16 h-16 text-gray-600 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-white mb-2">No agents yet</h3>
          <p className="text-gray-400 mb-6 max-w-md mx-auto">
            Create your first AI agent to automate tasks like deadline reminders,
            code reviews, and daily standups.
          </p>
          <button
            onClick={() => {
              setEditingAgent(null);
              setShowModal(true);
            }}
            className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
          >
            <Plus className="w-4 h-4" />
            Create Your First Agent
          </button>
        </div>
      ) : (
        <div className="bg-gray-800/50 border border-gray-700/50 rounded-lg">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-900/50 border-b border-gray-700/50">
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">Agent</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">Role</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">Provider</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">Last Run</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">Usage</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-400 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700/50">
              {agents.map((agent) => {
                const status = getAgentStatus(agent);
                const statusInfo = statusConfig[status];
                const StatusIcon = statusInfo.icon;

                return (
                  <tr key={agent.id} className="hover:bg-gray-700/30">
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-3">
                        {agent.avatar ? (
                          <img src={agent.avatar} alt="" className="w-10 h-10 rounded-full object-cover" />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-indigo-600 flex items-center justify-center">
                            <Bot className="w-5 h-5 text-white" />
                          </div>
                        )}
                        <div>
                          <div className="font-medium text-white">{agent.displayName}</div>
                          <div className="text-sm text-gray-400">@{agent.username}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4 text-gray-300">{agent.agentConfig?.role || '-'}</td>
                    <td className="px-4 py-4 text-gray-300 capitalize">{agent.agentConfig?.llmProvider || 'ollama'}</td>
                    <td className="px-4 py-4">
                      <span className={cn('inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium', statusInfo.color)}>
                        <StatusIcon className="w-3 h-3" />
                        {statusInfo.label}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-gray-400 text-sm">
                      {agent.agentConfig?.lastRunAt ? formatRelativeTime(agent.agentConfig.lastRunAt) : 'Never'}
                    </td>
                    <td className="px-4 py-4 text-gray-400 text-sm">{formatUsage(agent)}</td>
                    <td className="px-4 py-4 text-right">
                      <div className="relative inline-block">
                        <button
                          onClick={() => setMenuOpen(menuOpen === agent.id ? null : agent.id)}
                          className="p-2 text-gray-400 hover:text-white hover:bg-gray-700/50 rounded-lg"
                          disabled={actionLoading === agent.id}
                        >
                          {actionLoading === agent.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <MoreVertical className="w-4 h-4" />
                          )}
                        </button>
                        {menuOpen === agent.id && (
                          <>
                            <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(null)} />
                            <div className="absolute right-0 bottom-full mb-1 w-48 bg-gray-800 border border-gray-700 rounded-lg shadow-lg z-50 py-1">
                              <button onClick={() => handleEdit(agent)} className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-300 hover:bg-gray-700/50">
                                <Edit className="w-4 h-4" /> Edit
                              </button>
                              <button onClick={() => handleDuplicate(agent)} className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-300 hover:bg-gray-700/50">
                                <Copy className="w-4 h-4" /> Duplicate
                              </button>
                              <button 
                                onClick={() => handleRun(agent)} 
                                disabled={actionLoading === agent.id}
                                className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-300 hover:bg-gray-700/50 disabled:opacity-50"
                              >
                                {actionLoading === agent.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />} Run Now
                              </button>
                              <button onClick={() => alert('Coming soon!')} className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-300 hover:bg-gray-700/50">
                                <FileText className="w-4 h-4" /> View Logs
                              </button>
                              <hr className="my-1 border-gray-700" />
                              <button onClick={() => handleDelete(agent)} className="w-full flex items-center gap-2 px-4 py-2 text-sm text-red-400 hover:bg-red-500/10">
                                <Trash2 className="w-4 h-4" /> Delete
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <AgentModal
          agent={editingAgent}
          onClose={() => { setShowModal(false); setEditingAgent(null); }}
          onSave={() => { setShowModal(false); setEditingAgent(null); fetchAgents(); }}
        />
      )}
    </div>
  );
}
