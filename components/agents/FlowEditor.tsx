'use client';

import { useCallback, useState, useMemo, useEffect, useRef } from 'react';
import {
  ReactFlow,
  addEdge,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  Panel,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { ActionNode } from './ActionNode';

// DEBUG: Log when this module loads

// Action types with their colors
const ACTION_TYPES = [
  { type: 'trigger', label: 'Trigger', color: '#10b981', icon: '⚡' },
  { type: 'fetch', label: 'HTTP Request', color: '#3b82f6', icon: '🌐' },
  { type: 'transform', label: 'Transform', color: '#8b5cf6', icon: '🔄' },
  { type: 'condition', label: 'Condition', color: '#f59e0b', icon: '🔀' },
  { type: 'post', label: 'Post Message', color: '#ec4899', icon: '💬' },
  { type: 'llm', label: 'LLM Call', color: '#06b6d4', icon: '🤖' },
  { type: 'script', label: 'Script', color: '#84cc16', icon: '📜' },
  { type: 'delay', label: 'Delay', color: '#6b7280', icon: '⏱️' },
];

interface FlowEditorProps {
  flowId?: string;
  initialDefinition?: {
    nodes: any[];
    edges: any[];
    variables?: Record<string, any>;
  };
  onSave?: (definition: { nodes: any[]; edges: any[]; variables: Record<string, any> }) => void;
  readOnly?: boolean;
}

export function FlowEditor({ initialDefinition, onSave, readOnly = false }: FlowEditorProps) {
  const nodeTypes = useMemo(() => ({ action: ActionNode }), []);

  // Convert initial definition to ReactFlow format
  const initialNodes: any[] = useMemo(() => {
    if (!initialDefinition?.nodes) return [];
    return initialDefinition.nodes.map((n: any) => ({
      id: n.id,
      type: 'action',
      position: n.position || { x: 0, y: 0 },
      data: {
        actionType: n.type,
        label: ACTION_TYPES.find(a => a.type === n.type)?.label || n.type,
        // Support both n.config (editor convention) and n.data (executor convention)
        config: n.config ?? n.data ?? {},
        color: ACTION_TYPES.find(a => a.type === n.type)?.color || '#6b7280',
        icon: ACTION_TYPES.find(a => a.type === n.type)?.icon || '📦',
      },
    }));
  }, [initialDefinition]);

  const initialEdges: any[] = useMemo(() => {
    if (!initialDefinition?.edges) return [];
    return initialDefinition.edges.map((e: any) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle: e.sourceHandle,
      targetHandle: e.targetHandle,
      animated: true,
      style: { stroke: '#6b7280' },
    }));
  }, [initialDefinition]);

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [variables, setVariables] = useState<Record<string, any>>(initialDefinition?.variables || {});
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  // Derive selectedNode from nodes array to stay in sync with state changes
  const selectedNode = useMemo(() => {
    if (!selectedNodeId) return null;
    return nodes.find((n: any) => n.id === selectedNodeId) || null;
  }, [selectedNodeId, nodes]);

  const onConnect = useCallback(
    (connection: any) => {
      if (readOnly) return;
      setEdges((eds: any) => addEdge({ ...connection, animated: true, style: { stroke: '#6b7280' } }, eds));
    },
    [setEdges, readOnly]
  );

  const onNodeClick = useCallback((_: any, node: any) => {
    setSelectedNodeId(node.id);
  }, []);

  const addNode = useCallback((actionType: string) => {
    if (readOnly) return;
    const action = ACTION_TYPES.find(a => a.type === actionType);
    if (!action) return;

    const newNode = {
      id: `${actionType}-${Date.now()}`,
      type: 'action',
      position: { x: 250, y: nodes.length * 100 + 50 },
      data: {
        actionType,
        label: action.label,
        config: {},
        color: action.color,
        icon: action.icon,
      },
    };
    setNodes((nds: any) => [...nds, newNode]);
  }, [nodes.length, setNodes, readOnly]);

  const deleteNode = useCallback((nodeId: string) => {
    if (readOnly) return;
    setNodes((nds: any) => nds.filter((n: any) => n.id !== nodeId));
    setEdges((eds: any) => eds.filter((e: any) => e.source !== nodeId && e.target !== nodeId));
    if (selectedNodeId === nodeId) setSelectedNodeId(null);
  }, [setNodes, setEdges, selectedNodeId, readOnly]);

  const updateNodeConfig = useCallback((nodeId: string, config: any) => {
    setNodes((nds: any) => nds.map((n: any) => 
      n.id === nodeId ? { ...n, data: { ...n.data, config } } : n
    ));
  }, [setNodes]);

  const handleSave = useCallback(() => {
    if (!onSave) return;
    const definition = {
      nodes: nodes.map((n: any) => ({
        id: n.id,
        type: n.data.actionType,
        config: n.data.config,
        position: n.position,
      })),
      edges: edges.map((e: any) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        sourceHandle: e.sourceHandle,
        targetHandle: e.targetHandle,
      })),
      variables,
    };
    onSave(definition);
  }, [nodes, edges, variables, onSave]);

  return (
    <div className="flex h-[600px] border border-zinc-600 rounded-lg overflow-hidden bg-zinc-900">
      {/* Action Palette */}
      {!readOnly && (
        <div className="w-48 border-r border-zinc-600 p-3 space-y-2 overflow-y-auto">
          <h3 className="text-sm font-semibold text-zinc-400 mb-3">Actions</h3>
          {ACTION_TYPES.map((action) => (
            <button
              key={action.type}
              onClick={() => addNode(action.type)}
              className="w-full flex items-center gap-2 p-2 rounded-md hover:bg-zinc-800 transition-colors text-left"
              style={{ borderLeft: `3px solid ${action.color}` }}
            >
              <span>{action.icon}</span>
              <span className="text-sm">{action.label}</span>
            </button>
          ))}
        </div>
      )}

      {/* Flow Canvas */}
      <div className="flex-1">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={readOnly ? undefined : onNodesChange}
          onEdgesChange={readOnly ? undefined : onEdgesChange}
          onConnect={onConnect}
          onNodeClick={onNodeClick}
          nodeTypes={nodeTypes as any}
          fitView
          snapToGrid
          snapGrid={[15, 15]}
          nodesDraggable={!readOnly}
          nodesConnectable={!readOnly}
          elementsSelectable={!readOnly}
          deleteKeyCode={null}
          selectionKeyCode={null}
          multiSelectionKeyCode={null}
          nodesFocusable={false}
          edgesFocusable={false}
        >
          <Background color="#374151" gap={15} />
          <Controls />
          <MiniMap 
            nodeColor={(n: any) => n.data?.color || '#6b7280'}
            maskColor="rgba(0, 0, 0, 0.8)"
          />
          {!readOnly && onSave && (
            <Panel position="top-right">
              <button
                onClick={handleSave}
                className="px-4 py-2 bg-primary text-white rounded-md hover:bg-primary-hover transition-colors"
              >
                Save Flow
              </button>
            </Panel>
          )}
        </ReactFlow>
      </div>

      {/* Node Config Panel - Completely isolated from ReactFlow */}
      {selectedNode && !readOnly && (
        <ConfigPanel
          selectedNode={selectedNode}
          onDelete={() => deleteNode(selectedNode.id)}
          onUpdateConfig={(config) => updateNodeConfig(selectedNode.id, config)}
        />
      )}
    </div>
  );
}

// Separate component to fully isolate from ReactFlow's event handling
function ConfigPanel({ 
  selectedNode, 
  onDelete, 
  onUpdateConfig 
}: { 
  selectedNode: any; 
  onDelete: () => void; 
  onUpdateConfig: (config: any) => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  // Capture ALL keyboard events before they can reach ReactFlow
  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;

    const stopEvent = (e: KeyboardEvent) => {
      e.stopPropagation();
      e.stopImmediatePropagation();
    };

    // Add listeners in capture phase to intercept before ReactFlow
    panel.addEventListener('keydown', stopEvent, true);
    panel.addEventListener('keyup', stopEvent, true);
    panel.addEventListener('keypress', stopEvent, true);


    return () => {
      panel.removeEventListener('keydown', stopEvent, true);
      panel.removeEventListener('keyup', stopEvent, true);
      panel.removeEventListener('keypress', stopEvent, true);
    };
  }, []);

  return (
    <div 
      ref={panelRef}
      className="w-72 border-l border-zinc-600 p-4 overflow-y-auto nodrag nopan"
      style={{ position: 'relative', zIndex: 100 }}
    >
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold">{selectedNode.data.label}</h3>
        <button
          onClick={onDelete}
          className="text-red-500 hover:text-red-400 text-sm"
        >
          Delete
        </button>
      </div>
      <NodeConfigForm
        actionType={selectedNode.data.actionType}
        config={selectedNode.data.config}
        onChange={onUpdateConfig}
      />
    </div>
  );
}

// Node configuration form based on action type
function NodeConfigForm({ 
  actionType, 
  config, 
  onChange 
}: { 
  actionType: string; 
  config: any; 
  onChange: (config: any) => void;
}) {
  const updateField = (field: string, value: any) => {
    onChange({ ...config, [field]: value });
  };

  // Debug: log when component renders

  // Common input styles with explicit colors
  const inputStyle: React.CSSProperties = {
    marginTop: '0.25rem',
    width: '100%',
    backgroundColor: '#27272a',
    border: '1px solid #52525b',
    borderRadius: '0.375rem',
    padding: '0.5rem',
    fontSize: '0.875rem',
    color: '#ffffff',
    caretColor: '#ffffff',
    outline: 'none',
  };

  const selectStyle: React.CSSProperties = {
    ...inputStyle,
  };

  const textareaStyle: React.CSSProperties = {
    ...inputStyle,
    fontFamily: 'monospace',
    resize: 'vertical' as const,
  };

  // Debug input handler
  const handleInputChange = (field: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    console.log('[Input] onChange fired:', { field, value: e.target.value, eventType: e.type });
    updateField(field, e.target.value);
  };

  const handleInputFocus = (field: string) => (e: React.FocusEvent) => {
    console.log('[Input] onFocus:', { field, target: (e.target as HTMLElement).tagName });
  };

  const handleInputKeyDown = (field: string) => (e: React.KeyboardEvent) => {
    console.log('[Input] onKeyDown:', { field, key: e.key, code: e.code });
  };

  switch (actionType) {
    case 'trigger':
      return (
        <div className="space-y-3">
          <label className="block">
            <span className="text-sm text-zinc-400">Trigger Type</span>
            <select
              value={config.triggerType || 'manual'}
              onChange={handleInputChange('triggerType')}
              onFocus={handleInputFocus('triggerType')}
              onKeyDown={handleInputKeyDown('triggerType')}
              style={selectStyle}
              className="nodrag nopan"
            >
              <option value="manual">Manual</option>
              <option value="schedule">Schedule</option>
              <option value="webhook">Webhook</option>
              <option value="event">Event</option>
            </select>
          </label>
        </div>
      );

    case 'fetch':
      return (
        <div className="space-y-3">
          <label className="block">
            <span className="text-sm text-zinc-400">URL</span>
            <input
              type="text"
              value={config.url || ''}
              onChange={handleInputChange('url')}
              onFocus={handleInputFocus('url')}
              onKeyDown={handleInputKeyDown('url')}
              placeholder="https://api.example.com/data"
              style={inputStyle}
              className="nodrag nopan"
            />
          </label>
          <label className="block">
            <span className="text-sm text-zinc-400">Method</span>
            <select
              value={config.method || 'GET'}
              onChange={handleInputChange('method')}
              onFocus={handleInputFocus('method')}
              onKeyDown={handleInputKeyDown('method')}
              style={selectStyle}
              className="nodrag nopan"
            >
              <option value="GET">GET</option>
              <option value="POST">POST</option>
              <option value="PUT">PUT</option>
              <option value="DELETE">DELETE</option>
            </select>
          </label>
        </div>
      );

    case 'transform':
      return (
        <div className="space-y-3">
          <label className="block">
            <span className="text-sm text-zinc-400">Template</span>
            <textarea
              value={config.template || ''}
              onChange={handleInputChange('template')}
              onFocus={handleInputFocus('template')}
              onKeyDown={handleInputKeyDown('template')}
              placeholder="Hello {{input.name}}!"
              rows={4}
              style={textareaStyle}
              className="nodrag nopan"
            />
          </label>
          <p className="text-xs text-zinc-500">
            Use {'{{input.field}}'} for input data
          </p>
        </div>
      );

    case 'condition':
      return (
        <div className="space-y-3">
          <label className="block">
            <span className="text-sm text-zinc-400">Condition</span>
            <input
              type="text"
              value={config.condition || ''}
              onChange={handleInputChange('condition')}
              onFocus={handleInputFocus('condition')}
              onKeyDown={handleInputKeyDown('condition')}
              placeholder="input.value > 10"
              style={{ ...inputStyle, fontFamily: 'monospace' }}
              className="nodrag nopan"
            />
          </label>
        </div>
      );

    case 'post':
      return <PostActionConfig config={config} onChange={onChange} inputStyle={inputStyle} textareaStyle={textareaStyle} />;

    case 'llm':
      return (
        <div className="space-y-3">
          <label className="block">
            <span className="text-sm text-zinc-400">Provider</span>
            <select
              value={config.provider || 'ollama'}
              onChange={handleInputChange('provider')}
              onFocus={handleInputFocus('provider')}
              onKeyDown={handleInputKeyDown('provider')}
              style={selectStyle}
              className="nodrag nopan"
            >
              <option value="ollama">Ollama</option>
              <option value="openai">OpenAI</option>
            </select>
          </label>
          <label className="block">
            <span className="text-sm text-zinc-400">Prompt</span>
            <textarea
              value={config.promptTemplate || ''}
              onChange={handleInputChange('promptTemplate')}
              onFocus={handleInputFocus('promptTemplate')}
              onKeyDown={handleInputKeyDown('promptTemplate')}
              placeholder="Analyze: {{input.text}}"
              rows={4}
              style={textareaStyle}
              className="nodrag nopan"
            />
          </label>
        </div>
      );

    case 'script':
      return (
        <div className="space-y-3">
          <label className="block">
            <span className="text-sm text-zinc-400">Code</span>
            <textarea
              value={config.code || ''}
              onChange={handleInputChange('code')}
              onFocus={handleInputFocus('code')}
              onKeyDown={handleInputKeyDown('code')}
              placeholder="return { result: input.value * 2 };"
              rows={6}
              style={textareaStyle}
              className="nodrag nopan"
            />
          </label>
        </div>
      );

    case 'delay':
      return (
        <div className="space-y-3">
          <label className="block">
            <span className="text-sm text-zinc-400">Delay (ms)</span>
            <input
              type="number"
              value={config.delayMs || 1000}
              onChange={(e) => {
                console.log('[Input] onChange (delay):', { value: e.target.value });
                updateField('delayMs', parseInt(e.target.value));
              }}
              onFocus={handleInputFocus('delayMs')}
              onKeyDown={handleInputKeyDown('delayMs')}
              min={0}
              style={inputStyle}
              className="nodrag nopan"
            />
          </label>
        </div>
      );

    default:
      return <p className="text-sm text-zinc-500">No config available</p>;
  }
}

// Post action config with channel autocomplete
function PostActionConfig({ 
  config, 
  onChange,
  inputStyle,
  textareaStyle,
}: { 
  config: any; 
  onChange: (config: any) => void;
  inputStyle: React.CSSProperties;
  textareaStyle: React.CSSProperties;
}) {
  const [channels, setChannels] = useState<{ id: string; name: string; slug: string }[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [channelError, setChannelError] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Fetch channels for autocomplete
    fetch('/api/channels')
      .then(res => res.json())
      .then(data => setChannels(data.channels || []))
      .catch(() => {});
  }, []);

  const updateField = (field: string, value: any) => {
    onChange({ ...config, [field]: value });
  };

  const handleChannelChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    updateField('channelId', value);
    setShowSuggestions(true);
    
    // Validate channel
    if (value && channels.length > 0) {
      const exists = channels.some(c => c.id === value || c.slug === value || c.name.toLowerCase() === value.toLowerCase());
      setChannelError(exists ? null : 'Channel not found');
    } else {
      setChannelError(null);
    }
  };

  const selectChannel = (channelId: string) => {
    updateField('channelId', channelId);
    setShowSuggestions(false);
    setChannelError(null);
  };

  const filteredChannels = channels.filter(c => 
    !config.channelId || 
    c.id.toLowerCase().includes(config.channelId.toLowerCase()) ||
    c.name.toLowerCase().includes(config.channelId.toLowerCase()) ||
    c.slug.toLowerCase().includes(config.channelId.toLowerCase())
  );

  // Dropdown styles with explicit solid background
  const dropdownStyle: React.CSSProperties = {
    position: 'absolute',
    zIndex: 9999,
    width: '100%',
    marginTop: '0.25rem',
    backgroundColor: '#18181b',
    border: '1px solid #52525b',
    borderRadius: '0.375rem',
    boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.5)',
    maxHeight: '10rem',
    overflowY: 'auto' as const,
  };

  const dropdownItemStyle: React.CSSProperties = {
    width: '100%',
    textAlign: 'left' as const,
    padding: '0.5rem 0.75rem',
    fontSize: '0.875rem',
    color: '#ffffff',
    backgroundColor: 'transparent',
    border: 'none',
    cursor: 'pointer',
  };

  return (
    <div className="space-y-3">
      <div style={{ position: 'relative' }} ref={dropdownRef}>
        <label className="block">
          <span className="text-sm text-zinc-400">Channel</span>
          <input
            type="text"
            value={config.channelId || ''}
            onChange={handleChannelChange}
            onFocus={(e) => {
              setShowSuggestions(true);
            }}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
            onKeyDown={(e) => console.log('[PostActionConfig] Channel keyDown:', e.key)}
            placeholder="Start typing to search..."
            style={{
              ...inputStyle,
              borderColor: channelError ? '#ef4444' : '#52525b',
            }}
            className="nodrag nopan"
          />
        </label>
        {channelError && (
          <p className="text-xs text-red-400 mt-1">{channelError}</p>
        )}
        {showSuggestions && filteredChannels.length > 0 && (
          <div style={dropdownStyle} className="nodrag nopan">
            {filteredChannels.slice(0, 10).map((channel) => (
              <button
                key={channel.id}
                onClick={() => selectChannel(channel.id)}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#3f3f46')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                style={dropdownItemStyle}
                className="nodrag nopan"
              >
                <span style={{ fontWeight: 500 }}>#{channel.name}</span>
                <span style={{ color: '#71717a', marginLeft: '0.5rem', fontSize: '0.75rem' }}>{channel.id}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      <label className="block">
        <span className="text-sm text-zinc-400">Message</span>
        <textarea
          value={config.messageTemplate || ''}
          onChange={(e) => {
            updateField('messageTemplate', e.target.value);
          }}
          onFocus={() => console.log('[PostActionConfig] Message textarea focused')}
          onKeyDown={(e) => console.log('[PostActionConfig] Message keyDown:', e.key)}
          placeholder="Result: {{input.result}}"
          rows={3}
          style={textareaStyle}
          className="nodrag nopan"
        />
      </label>
    </div>
  );
}

export default FlowEditor;
