/**
 * Action Parser - Structured output parsing from LLM responses
 * 
 * Supports multiple formats:
 * - XML-style: <action type="message">...</action>
 * - JSON blocks: ```json { "action": "message", ... } ```
 * - Simple format: ACTION: message TARGET: channel-general DATA: {...}
 * - Function call style: message({ channel: "general", text: "..." })
 */

// ============================================================================
// Action Type Registry
// ============================================================================

export type ActionType = 
  | 'message'        // Send a message to a channel
  | 'create_task'    // Create a kanban task
  | 'update_task'    // Update an existing task
  | 'complete_task'  // Mark task/subtask complete
  | 'fetch'          // HTTP request
  | 'search'         // Search the web
  | 'respond'        // Direct response to user
  | 'think'          // Internal reasoning (not executed)
  | 'code'           // Execute code/script
  | 'wait'           // Wait/delay before next action
  | 'unknown';       // Fallback for unrecognized actions

export interface ActionSchema {
  type: ActionType;
  description: string;
  requiresApproval: boolean;  // Sensitive actions need human approval
  payloadSchema?: Record<string, PayloadFieldSchema>;
}

interface PayloadFieldSchema {
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  required?: boolean;
  description?: string;
}

// Action type definitions with validation schemas
export const ACTION_REGISTRY: Record<ActionType, ActionSchema> = {
  message: {
    type: 'message',
    description: 'Send a message to a channel',
    requiresApproval: false,
    payloadSchema: {
      channel: { type: 'string', required: true, description: 'Channel ID or slug' },
      text: { type: 'string', required: true, description: 'Message content' },
      replyTo: { type: 'string', description: 'Message ID to reply to' },
    },
  },
  create_task: {
    type: 'create_task',
    description: 'Create a new kanban task',
    requiresApproval: false,
    payloadSchema: {
      title: { type: 'string', required: true },
      description: { type: 'string' },
      projectId: { type: 'string', required: true },
      columnId: { type: 'string' },
      priority: { type: 'string' },
      assigneeId: { type: 'string' },
    },
  },
  update_task: {
    type: 'update_task',
    description: 'Update an existing task',
    requiresApproval: false,
    payloadSchema: {
      taskId: { type: 'string', required: true },
      title: { type: 'string' },
      description: { type: 'string' },
      columnId: { type: 'string' },
      priority: { type: 'string' },
    },
  },
  complete_task: {
    type: 'complete_task',
    description: 'Mark a task or subtask as complete',
    requiresApproval: false,
    payloadSchema: {
      taskId: { type: 'string', required: true },
      subtaskId: { type: 'string', description: 'Optional: specific subtask to complete' },
    },
  },
  fetch: {
    type: 'fetch',
    description: 'Make an HTTP request',
    requiresApproval: true,  // External requests need approval
    payloadSchema: {
      url: { type: 'string', required: true },
      method: { type: 'string' },
      headers: { type: 'object' },
      body: { type: 'string' },
    },
  },
  search: {
    type: 'search',
    description: 'Search the web',
    requiresApproval: false,
    payloadSchema: {
      query: { type: 'string', required: true },
      limit: { type: 'number' },
    },
  },
  respond: {
    type: 'respond',
    description: 'Direct response to user',
    requiresApproval: false,
    payloadSchema: {
      text: { type: 'string', required: true },
    },
  },
  think: {
    type: 'think',
    description: 'Internal reasoning (not executed)',
    requiresApproval: false,
    payloadSchema: {
      thought: { type: 'string' },
    },
  },
  code: {
    type: 'code',
    description: 'Execute code or script',
    requiresApproval: true,  // Code execution needs approval
    payloadSchema: {
      language: { type: 'string', required: true },
      code: { type: 'string', required: true },
    },
  },
  wait: {
    type: 'wait',
    description: 'Wait before next action',
    requiresApproval: false,
    payloadSchema: {
      seconds: { type: 'number', required: true },
    },
  },
  unknown: {
    type: 'unknown',
    description: 'Unrecognized action',
    requiresApproval: true,  // Unknown actions need review
  },
};

// ============================================================================
// Parsed Action Types
// ============================================================================

export interface ParsedAction {
  type: ActionType;
  targetId?: string;
  payload: Record<string, unknown>;
  raw?: string;           // Original text that produced this action
  confidence: number;     // 0-1 confidence score
  requiresApproval: boolean;
  validationErrors?: string[];
}

export interface ParseResult {
  actions: ParsedAction[];
  rawResponse: string;
  parseMethod: 'xml' | 'json' | 'simple' | 'function' | 'fallback';
  errors?: string[];
}

// ============================================================================
// Parser Functions
// ============================================================================

/**
 * Main parser entry point - tries multiple formats
 */
export function parseActions(content: string): ParseResult {
  const trimmed = content.trim();
  
  // Try each parser in order of specificity
  let result = tryParseXML(trimmed);
  if (result.actions.length > 0) {
    return result;
  }

  result = tryParseJSON(trimmed);
  if (result.actions.length > 0) {
    return result;
  }

  result = tryParseFunctionCalls(trimmed);
  if (result.actions.length > 0) {
    return result;
  }

  result = tryParseSimple(trimmed);
  if (result.actions.length > 0) {
    return result;
  }

  // Fallback: treat entire response as a "respond" action
  return {
    actions: [{
      type: 'respond',
      payload: { text: trimmed },
      confidence: 0.5,
      requiresApproval: false,
    }],
    rawResponse: content,
    parseMethod: 'fallback',
  };
}

/**
 * Parse XML-style actions
 * Format: <action type="message" target="channel-general">{"text": "Hello"}</action>
 */
function tryParseXML(content: string): ParseResult {
  const actions: ParsedAction[] = [];
  const errors: string[] = [];
  
  // Match <action ...>...</action> blocks
  const xmlRegex = /<action\s+(?:type=["']([^"']+)["'])?(?:\s+target=["']([^"']+)["'])?[^>]*>([^<]*(?:<(?!\/action>)[^<]*)*)<\/action>/gi;
  
  let match;
  while ((match = xmlRegex.exec(content)) !== null) {
    const [fullMatch, type, target, innerContent] = match;
    const actionType = normalizeActionType(type || 'unknown');
    
    let payload: Record<string, unknown> = {};
    const trimmedInner = innerContent.trim();
    
    // Try to parse inner content as JSON
    if (trimmedInner.startsWith('{')) {
      try {
        payload = JSON.parse(trimmedInner);
      } catch {
        payload = { text: trimmedInner };
      }
    } else {
      payload = { text: trimmedInner };
    }

    const action = createAction(actionType, payload, target);
    action.raw = fullMatch;
    actions.push(action);
  }

  return {
    actions,
    rawResponse: content,
    parseMethod: 'xml',
    errors: errors.length > 0 ? errors : undefined,
  };
}

/**
 * Parse JSON blocks (in markdown code fences or raw)
 * Format: ```json {"action": "message", "channel": "general", "text": "Hi"} ```
 */
function tryParseJSON(content: string): ParseResult {
  const actions: ParsedAction[] = [];
  const errors: string[] = [];
  
  // Match ```json ... ``` blocks
  const jsonBlockRegex = /```(?:json)?\s*\n?([\s\S]*?)\n?```/gi;
  
  let match;
  while ((match = jsonBlockRegex.exec(content)) !== null) {
    const jsonStr = match[1].trim();
    try {
      const parsed = JSON.parse(jsonStr);
      
      // Handle array of actions
      const items = Array.isArray(parsed) ? parsed : [parsed];
      
      for (const item of items) {
        if (item.action || item.type) {
          const actionType = normalizeActionType(item.action || item.type);
          const { action: _, type: __, target, targetId, ...payload } = item;
          
          const action = createAction(actionType, payload, target || targetId);
          action.raw = JSON.stringify(item);
          actions.push(action);
        }
      }
    } catch (e) {
      errors.push(`Failed to parse JSON block: ${e}`);
    }
  }

  // Also try to find standalone JSON objects with action/type fields
  if (actions.length === 0) {
    const standaloneJsonRegex = /\{[^{}]*"(?:action|type)"\s*:\s*"[^"]+(?:.*?)"\s*[^{}]*\}/gi;
    while ((match = standaloneJsonRegex.exec(content)) !== null) {
      try {
        const parsed = JSON.parse(match[0]);
        if (parsed.action || parsed.type) {
          const actionType = normalizeActionType(parsed.action || parsed.type);
          const { action: _, type: __, target, targetId, ...payload } = parsed;
          
          const action = createAction(actionType, payload, target || targetId);
          action.raw = match[0];
          actions.push(action);
        }
      } catch {
        // Skip invalid JSON
      }
    }
  }

  return {
    actions,
    rawResponse: content,
    parseMethod: 'json',
    errors: errors.length > 0 ? errors : undefined,
  };
}

/**
 * Parse function-call style actions
 * Format: message({ channel: "general", text: "Hello" })
 */
function tryParseFunctionCalls(content: string): ParseResult {
  const actions: ParsedAction[] = [];
  
  // Match function_name({ ... }) or function_name({ ... });
  const funcRegex = /\b(\w+)\s*\(\s*(\{[\s\S]*?\})\s*\)\s*;?/gi;
  
  let match;
  while ((match = funcRegex.exec(content)) !== null) {
    const [fullMatch, funcName, argsStr] = match;
    
    // Skip common non-action function patterns
    if (['if', 'for', 'while', 'switch', 'function', 'console', 'log'].includes(funcName.toLowerCase())) {
      continue;
    }
    
    try {
      // Handle JS-style object literals (unquoted keys)
      const jsonStr = argsStr
        .replace(/(\w+)\s*:/g, '"$1":')  // Quote unquoted keys
        .replace(/'/g, '"');              // Convert single to double quotes
      
      const payload = JSON.parse(jsonStr);
      const actionType = normalizeActionType(funcName);
      const { target, targetId, ...rest } = payload;
      
      const action = createAction(actionType, rest, target || targetId);
      action.raw = fullMatch;
      actions.push(action);
    } catch {
      // Skip if we can't parse
    }
  }

  return {
    actions,
    rawResponse: content,
    parseMethod: 'function',
  };
}

/**
 * Parse simple format
 * Format: ACTION: message TARGET: channel-general DATA: {"text": "Hello"}
 */
function tryParseSimple(content: string): ParseResult {
  const actions: ParsedAction[] = [];
  
  // Match ACTION: type [TARGET: id] [DATA: json]
  const simpleRegex = /ACTION:\s*(\w+)(?:\s+TARGET:\s*(\S+))?(?:\s+DATA:\s*(\{[^}]+\}))?/gi;
  
  let match;
  while ((match = simpleRegex.exec(content)) !== null) {
    const [fullMatch, type, target, dataStr] = match;
    const actionType = normalizeActionType(type);
    
    let payload: Record<string, unknown> = {};
    if (dataStr) {
      try {
        payload = JSON.parse(dataStr);
      } catch {
        // Invalid JSON, skip payload
      }
    }

    const action = createAction(actionType, payload, target);
    action.raw = fullMatch;
    actions.push(action);
  }

  return {
    actions,
    rawResponse: content,
    parseMethod: 'simple',
  };
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Normalize action type string to known ActionType
 */
function normalizeActionType(type: string): ActionType {
  const normalized = type.toLowerCase().replace(/[_-]/g, '');
  
  const typeMap: Record<string, ActionType> = {
    'message': 'message',
    'sendmessage': 'message',
    'send': 'message',
    'post': 'message',
    'createtask': 'create_task',
    'newtask': 'create_task',
    'addtask': 'create_task',
    'updatetask': 'update_task',
    'edittask': 'update_task',
    'completetask': 'complete_task',
    'donetask': 'complete_task',
    'finish': 'complete_task',
    'fetch': 'fetch',
    'http': 'fetch',
    'request': 'fetch',
    'get': 'fetch',
    'search': 'search',
    'websearch': 'search',
    'respond': 'respond',
    'reply': 'respond',
    'answer': 'respond',
    'response': 'respond',
    'think': 'think',
    'reasoning': 'think',
    'thought': 'think',
    'code': 'code',
    'execute': 'code',
    'run': 'code',
    'script': 'code',
    'wait': 'wait',
    'delay': 'wait',
    'sleep': 'wait',
  };

  return typeMap[normalized] || 'unknown';
}

/**
 * Create a ParsedAction with validation
 */
function createAction(
  type: ActionType,
  payload: Record<string, unknown>,
  targetId?: string
): ParsedAction {
  const schema = ACTION_REGISTRY[type];
  const validationErrors = validatePayload(type, payload);
  
  return {
    type,
    targetId,
    payload,
    confidence: validationErrors.length === 0 ? 0.9 : 0.6,
    requiresApproval: schema?.requiresApproval ?? true,
    validationErrors: validationErrors.length > 0 ? validationErrors : undefined,
  };
}

/**
 * Validate payload against action schema
 */
function validatePayload(type: ActionType, payload: Record<string, unknown>): string[] {
  const schema = ACTION_REGISTRY[type];
  if (!schema?.payloadSchema) {
    return [];
  }

  const errors: string[] = [];
  
  for (const [field, fieldSchema] of Object.entries(schema.payloadSchema)) {
    const value = payload[field];
    
    // Check required fields
    if (fieldSchema.required && (value === undefined || value === null || value === '')) {
      errors.push(`Missing required field: ${field}`);
      continue;
    }
    
    // Check type if value exists
    if (value !== undefined && value !== null) {
      const actualType = Array.isArray(value) ? 'array' : typeof value;
      if (actualType !== fieldSchema.type) {
        errors.push(`Invalid type for ${field}: expected ${fieldSchema.type}, got ${actualType}`);
      }
    }
  }

  return errors;
}

/**
 * Extract all actions that require approval
 */
export function getActionsRequiringApproval(actions: ParsedAction[]): ParsedAction[] {
  return actions.filter(a => a.requiresApproval);
}

/**
 * Get action descriptions for prompt injection
 */
export function getActionDescriptions(): string {
  const lines: string[] = ['Available actions:'];
  
  for (const [type, schema] of Object.entries(ACTION_REGISTRY)) {
    if (type === 'unknown') continue;
    
    const approval = schema.requiresApproval ? ' (requires approval)' : '';
    lines.push(`- ${type}: ${schema.description}${approval}`);
    
    if (schema.payloadSchema) {
      const fields = Object.entries(schema.payloadSchema)
        .map(([name, f]) => `${name}${f.required ? '*' : ''}`)
        .join(', ');
      lines.push(`  Fields: ${fields}`);
    }
  }
  
  return lines.join('\n');
}
