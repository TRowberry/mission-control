import prisma from '@/lib/db';
import { actionHandlers } from './actions';

interface FlowNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: any;
}

interface FlowEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
}

interface FlowDefinition {
  nodes: FlowNode[];
  edges: FlowEdge[];
}

interface ExecutionResult {
  output: any;
  log: ExecutionLogEntry[];
  tokensUsed: number;
  cost: number;
}

interface ExecutionLogEntry {
  nodeId: string;
  nodeType: string;
  status: 'success' | 'failed' | 'skipped';
  input: any;
  output: any;
  error?: string;
  durationMs: number;
  timestamp: string;
}

export async function executeFlow(
  flow: any,
  input: any,
  runId: string
): Promise<ExecutionResult> {
  const definition: FlowDefinition = typeof flow.definition === 'string'
    ? JSON.parse(flow.definition)
    : flow.definition;

  const { nodes, edges } = definition;
  const log: ExecutionLogEntry[] = [];
  let totalTokens = 0;
  let totalCost = 0;

  // Build adjacency map for traversal
  const adjacencyMap = new Map<string, string[]>();
  for (const edge of edges) {
    const targets = adjacencyMap.get(edge.source) || [];
    targets.push(edge.target);
    adjacencyMap.set(edge.source, targets);
  }

  // Create node map for quick lookup
  const nodeMap = new Map<string, FlowNode>();
  for (const node of nodes) {
    nodeMap.set(node.id, node);
  }

  // Find trigger node (starting point)
  const triggerNode = nodes.find(n => n.type === 'trigger');
  if (!triggerNode) {
    throw new Error('Flow must have a trigger node');
  }

  // Execute nodes in BFS order
  const nodeOutputs = new Map<string, any>();
  nodeOutputs.set(triggerNode.id, input);

  const queue = [triggerNode.id];
  const visited = new Set<string>();

  while (queue.length > 0) {
    const nodeId = queue.shift()!;
    if (visited.has(nodeId)) continue;
    visited.add(nodeId);

    const node = nodeMap.get(nodeId)!;
    const nodeInput = nodeOutputs.get(nodeId) || {};

    const startTime = Date.now();
    let nodeOutput: any = null;
    let status: 'success' | 'failed' | 'skipped' = 'success';
    let error: string | undefined;

    try {
      // Execute node based on type
      if (node.type === 'trigger') {
        // Trigger node just passes through input
        nodeOutput = nodeInput;
      } else if (node.type === 'condition') {
        // Condition nodes evaluate and branch
        const conditionResult = evaluateCondition(node.data, nodeInput);
        nodeOutput = { result: conditionResult, data: nodeInput };
        
        // For conditions, we need to handle branching
        // Only continue to the appropriate branch
        const nextNodes = adjacencyMap.get(nodeId) || [];
        for (const nextId of nextNodes) {
          const edge = edges.find(e => e.source === nodeId && e.target === nextId);
          // If edge has sourceHandle matching condition result, or no handle specified
          if (!edge?.sourceHandle || edge.sourceHandle === (conditionResult ? 'true' : 'false')) {
            nodeOutputs.set(nextId, nodeInput);
            queue.push(nextId);
          }
        }
        // Skip default traversal for condition nodes
        const durationMs = Date.now() - startTime;
        log.push({
          nodeId,
          nodeType: node.type,
          status,
          input: nodeInput,
          output: nodeOutput,
          durationMs,
          timestamp: new Date().toISOString(),
        });
        continue;
      } else {
        // Execute action handler
        const handler = actionHandlers[node.type];
        if (!handler) {
          throw new Error(`Unknown action type: ${node.type}`);
        }

        const result = await handler(node.data, nodeInput, {
          flowId: flow.id,
          runId,
          agentId: flow.agentId,
          agent: flow.agent,
        });

        nodeOutput = result.output;
        if (result.tokensUsed) totalTokens += result.tokensUsed;
        if (result.cost) totalCost += result.cost;
      }
    } catch (e: any) {
      status = 'failed';
      error = e.message;
      nodeOutput = { error: e.message };
      
      // Log and throw to stop execution
      const durationMs = Date.now() - startTime;
      log.push({
        nodeId,
        nodeType: node.type,
        status,
        input: nodeInput,
        output: nodeOutput,
        error,
        durationMs,
        timestamp: new Date().toISOString(),
      });

      const err: any = new Error(e.message);
      err.nodeId = nodeId;
      throw err;
    }

    const durationMs = Date.now() - startTime;
    log.push({
      nodeId,
      nodeType: node.type,
      status,
      input: nodeInput,
      output: nodeOutput,
      error,
      durationMs,
      timestamp: new Date().toISOString(),
    });

    // Queue next nodes
    const nextNodes = adjacencyMap.get(nodeId) || [];
    for (const nextId of nextNodes) {
      nodeOutputs.set(nextId, nodeOutput);
      queue.push(nextId);
    }
  }

  // Return final output from last executed node
  const lastLogEntry = log[log.length - 1];
  return {
    output: lastLogEntry?.output || null,
    log,
    tokensUsed: totalTokens,
    cost: totalCost,
  };
}

function evaluateCondition(config: any, input: any): boolean {
  const { field, operator, value } = config;
  
  // Get field value from input (supports nested paths like "data.name")
  const fieldValue = field?.split('.').reduce((obj: any, key: string) => obj?.[key], input);

  switch (operator) {
    case 'equals':
      return fieldValue === value;
    case 'notEquals':
      return fieldValue !== value;
    case 'contains':
      return String(fieldValue).includes(String(value));
    case 'greaterThan':
      return Number(fieldValue) > Number(value);
    case 'lessThan':
      return Number(fieldValue) < Number(value);
    case 'exists':
      return fieldValue !== undefined && fieldValue !== null;
    case 'notExists':
      return fieldValue === undefined || fieldValue === null;
    case 'isEmpty':
      return !fieldValue || (Array.isArray(fieldValue) && fieldValue.length === 0);
    case 'isNotEmpty':
      return fieldValue && (!Array.isArray(fieldValue) || fieldValue.length > 0);
    default:
      return Boolean(fieldValue);
  }
}
