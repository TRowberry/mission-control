'use client';

import { useState, useEffect, useCallback } from 'react';
import { Plus, Play, Trash2, ChevronDown, ChevronUp, Loader2 } from 'lucide-react';
import dynamic from 'next/dynamic';


// Dynamic import to avoid SSR issues with ReactFlow
const FlowEditor = dynamic(() => {
  return import('./FlowEditor').then(mod => {
    return mod.FlowEditor;
  });
}, {
  ssr: false,
  loading: () => {
    return <div className="h-[600px] flex items-center justify-center text-gray-400">Loading editor...</div>;
  }
});

interface Flow {
  id: string;
  name: string;
  description: string | null;
  version: number;
  isActive: boolean;
  triggerType: string;
  runCount: number;
  lastRunAt: string | null;
  lastRunStatus: string | null;
  createdAt: string;
  definition?: any;
}

interface FlowsTabProps {
  agentId: string;
}

export default function FlowsTab({ agentId }: FlowsTabProps) {
  
  
  
  const [flows, setFlows] = useState<Flow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedFlow, setSelectedFlow] = useState<Flow | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [running, setRunning] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // New flow form
  const [newFlowName, setNewFlowName] = useState('');
  const [newFlowDesc, setNewFlowDesc] = useState('');

  const fetchFlows = useCallback(async () => {
    try {
      const res = await fetch(`/api/agents/${agentId}/flows`);
      if (!res.ok) throw new Error('Failed to fetch flows');
      const data = await res.json();
      setFlows(data.flows || []);
    } catch (err) {
      console.error('[FlowsTab] fetchFlows error:', err);
      setError(err instanceof Error ? err.message : 'Failed to load flows');
    } finally {
      setLoading(false);
    }
  }, [agentId]);

  useEffect(() => {
    fetchFlows();
  }, [fetchFlows]);

  const loadFlowDetails = async (flowId: string) => {
    try {
      const res = await fetch(`/api/agents/${agentId}/flows/${flowId}`);
      if (!res.ok) throw new Error('Failed to load flow');
      const data = await res.json();
      setSelectedFlow(data.flow);
    } catch (err) {
      console.error('[FlowsTab] loadFlowDetails error:', err);
      setError(err instanceof Error ? err.message : 'Failed to load flow');
    }
  };

  const createFlow = async () => {
    if (!newFlowName.trim()) return;
    try {
      const res = await fetch(`/api/agents/${agentId}/flows`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newFlowName,
          description: newFlowDesc || null,
          definition: {
            nodes: [
              { id: 'trigger-1', type: 'trigger', config: { triggerType: 'manual' }, position: { x: 100, y: 100 } }
            ],
            edges: []
          }
        })
      });
      if (!res.ok) throw new Error('Failed to create flow');
      const data = await res.json();
      setFlows(prev => [data.flow, ...prev]);
      setNewFlowName('');
      setNewFlowDesc('');
      setIsCreating(false);
      loadFlowDetails(data.flow.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create flow');
    }
  };

  const saveFlow = async (definition: any) => {
    if (!selectedFlow) return;
    try {
      const res = await fetch(`/api/agents/${agentId}/flows/${selectedFlow.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ definition })
      });
      if (!res.ok) throw new Error('Failed to save flow');
      fetchFlows();
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save flow');
    }
  };

  const runFlow = async (flowId: string) => {
    setRunning(flowId);
    try {
      const res = await fetch(`/api/agents/${agentId}/flows/${flowId}/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: {} })
      });
      if (!res.ok) throw new Error('Failed to run flow');
      const data = await res.json();
      alert(`Flow completed! Status: ${data.status}\nDuration: ${data.durationMs}ms`);
      fetchFlows();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to run flow');
    } finally {
      setRunning(null);
    }
  };

  const deleteFlow = async (flowId: string) => {
    if (!confirm('Delete this flow? This cannot be undone.')) return;
    try {
      const res = await fetch(`/api/agents/${agentId}/flows/${flowId}`, {
        method: 'DELETE'
      });
      if (!res.ok) throw new Error('Failed to delete flow');
      setFlows(prev => prev.filter(f => f.id !== flowId));
      if (selectedFlow?.id === flowId) setSelectedFlow(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete flow');
    }
  };

  // Debug: Log state changes

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="p-3 bg-red-500/20 border border-red-500/30 rounded-lg text-red-400 text-sm">
          {error}
          <button onClick={() => setError(null)} className="ml-2 underline">dismiss</button>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-white">Agent Flows</h3>
          <p className="text-sm text-gray-400">Visual workflows for this agent</p>
        </div>
        <button
          onClick={() => setIsCreating(!isCreating)}
          className="flex items-center gap-2 px-3 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors text-sm"
        >
          <Plus className="w-4 h-4" />
          New Flow
        </button>
      </div>

      {/* Create Flow Form */}
      {isCreating && (
        <div className="p-4 bg-gray-800/50 rounded-lg space-y-3">
          <input
            type="text"
            value={newFlowName}
            onChange={(e) => setNewFlowName(e.target.value)}
            placeholder="Flow name..."
            className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500"
          />
          <input
            type="text"
            value={newFlowDesc}
            onChange={(e) => setNewFlowDesc(e.target.value)}
            placeholder="Description (optional)..."
            className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500"
          />
          <div className="flex gap-2">
            <button
              onClick={createFlow}
              disabled={!newFlowName.trim()}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
            >
              Create
            </button>
            <button
              onClick={() => setIsCreating(false)}
              className="px-4 py-2 text-gray-400 hover:text-white text-sm"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Flow List */}
      {flows.length === 0 && !isCreating ? (
        <div className="text-center py-12 text-gray-400">
          <p>No flows yet. Create one to get started!</p>
        </div>
      ) : (
        <div className="space-y-2">
          {flows.map((flow) => {
            const isSelected = selectedFlow?.id === flow.id;
            const hasDefinition = isSelected && selectedFlow?.definition;
            
            return (
              <div key={flow.id} className="bg-gray-800/50 rounded-lg overflow-hidden">
                <div
                  className="flex items-center justify-between p-3 cursor-pointer hover:bg-gray-800/70 transition-colors"
                  onClick={() => {
                    selectedFlow?.id === flow.id ? setSelectedFlow(null) : loadFlowDetails(flow.id);
                  }}
                >
                  <div className="flex items-center gap-3">
                    {selectedFlow?.id === flow.id ? (
                      <ChevronUp className="w-4 h-4 text-gray-400" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-gray-400" />
                    )}
                    <div>
                      <div className="font-medium text-white">{flow.name}</div>
                      <div className="text-xs text-gray-500">
                        v{flow.version} • {flow.runCount} runs
                        {flow.lastRunStatus && ` • Last: ${flow.lastRunStatus}`}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={(e) => { e.stopPropagation(); runFlow(flow.id); }}
                      disabled={running === flow.id}
                      className="p-2 text-green-400 hover:bg-green-500/20 rounded-lg transition-colors disabled:opacity-50"
                      title="Run flow"
                    >
                      {running === flow.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); deleteFlow(flow.id); }}
                      className="p-2 text-red-400 hover:bg-red-500/20 rounded-lg transition-colors"
                      title="Delete flow"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Flow Editor */}
                {isSelected && hasDefinition && (() => {
                  return (
                  <div className="border-t border-gray-700">
                    <FlowEditor
                      flowId={flow.id}
                      initialDefinition={selectedFlow.definition}
                      onSave={saveFlow}
                    />
                  </div>
                  );
                })()}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
