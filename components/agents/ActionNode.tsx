'use client';

import { memo } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';

interface ActionNodeData {
  actionType: string;
  label: string;
  config: Record<string, any>;
  color: string;
  icon: string;
}

function ActionNodeComponent({ data, selected }: NodeProps<any>) {
  const nodeData = data as ActionNodeData;
  const isCondition = nodeData.actionType === 'condition';

  return (
    <div
      className={`
        min-w-[150px] rounded-lg border-2 shadow-lg
        ${selected ? 'ring-2 ring-primary ring-offset-2 ring-offset-background' : ''}
      `}
      style={{ 
        borderColor: nodeData.color,
        backgroundColor: 'var(--background-secondary)',
      }}
    >
      {/* Input Handle */}
      {nodeData.actionType !== 'trigger' && (
        <Handle
          type="target"
          position={Position.Top}
          className="!w-3 !h-3 !bg-gray-400 !border-2 !border-gray-600"
        />
      )}

      {/* Node Header */}
      <div
        className="px-3 py-2 rounded-t-md flex items-center gap-2"
        style={{ backgroundColor: `${nodeData.color}20` }}
      >
        <span className="text-lg">{nodeData.icon}</span>
        <span className="font-medium text-sm">{nodeData.label}</span>
      </div>

      {/* Node Body - show config preview */}
      <div className="px-3 py-2 text-xs text-text-secondary">
        {nodeData.actionType === 'trigger' && (
          <span>
            {nodeData.config.cron
              ? `⏱ ${nodeData.config.cron}`
              : nodeData.config.triggerType === 'scheduled'
              ? 'scheduled'
              : nodeData.config.label || nodeData.config.triggerType || 'manual'}
          </span>
        )}
        {nodeData.actionType === 'fetch' && nodeData.config.url && (
          <span className="truncate block max-w-[140px]">{nodeData.config.url}</span>
        )}
        {nodeData.actionType === 'transform' && nodeData.config.template && (
          <span className="truncate block max-w-[140px]">{nodeData.config.template}</span>
        )}
        {nodeData.actionType === 'condition' && nodeData.config.condition && (
          <span className="truncate block max-w-[140px] font-mono">{nodeData.config.condition}</span>
        )}
        {nodeData.actionType === 'post' && nodeData.config.channelId && (
          <span>→ {nodeData.config.channelId}</span>
        )}
        {nodeData.actionType === 'llm' && (
          <span>{nodeData.config.provider || 'ollama'}</span>
        )}
        {nodeData.actionType === 'script' && (
          <span className="font-mono">{'{ ... }'}</span>
        )}
        {nodeData.actionType === 'delay' && (
          <span>{nodeData.config.delayMs || 1000}ms</span>
        )}
      </div>

      {/* Output Handles */}
      {isCondition ? (
        <>
          {/* True output */}
          <Handle
            type="source"
            position={Position.Bottom}
            id="true"
            className="!w-3 !h-3 !bg-green-500 !border-2 !border-green-700"
            style={{ left: '30%' }}
          />
          {/* False output */}
          <Handle
            type="source"
            position={Position.Bottom}
            id="false"
            className="!w-3 !h-3 !bg-red-500 !border-2 !border-red-700"
            style={{ left: '70%' }}
          />
          <div className="flex justify-between px-4 pb-1 text-[10px] text-text-muted">
            <span>true</span>
            <span>false</span>
          </div>
        </>
      ) : (
        <Handle
          type="source"
          position={Position.Bottom}
          className="!w-3 !h-3 !bg-gray-400 !border-2 !border-gray-600"
        />
      )}
    </div>
  );
}

export const ActionNode = memo(ActionNodeComponent);
