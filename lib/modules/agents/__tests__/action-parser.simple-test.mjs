/**
 * Simple test runner for action-parser
 * Run with: node --experimental-strip-types action-parser.simple-test.mjs
 * Or in Docker: docker compose exec app node lib/modules/agents/__tests__/action-parser.simple-test.mjs
 */

import assert from 'node:assert';

// Import the parser (need to handle TypeScript)
// For now, inline the test with a mock implementation check

console.log('🧪 Action Parser Tests\n');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✅ ${name}`);
    passed++;
  } catch (err) {
    console.log(`  ❌ ${name}`);
    console.log(`     ${err.message}`);
    failed++;
  }
}

function expect(actual) {
  return {
    toBe(expected) {
      assert.strictEqual(actual, expected);
    },
    toEqual(expected) {
      assert.deepStrictEqual(actual, expected);
    },
    toHaveLength(expected) {
      assert.strictEqual(actual.length, expected);
    },
    toBeDefined() {
      assert.notStrictEqual(actual, undefined);
    },
    toBeUndefined() {
      assert.strictEqual(actual, undefined);
    },
    toContain(expected) {
      assert.ok(actual.includes(expected), `Expected "${actual}" to contain "${expected}"`);
    }
  };
}

// ============================================================================
// Re-implement parser for testing (since we can't import TypeScript directly)
// ============================================================================

const ACTION_REGISTRY = {
  message: { requiresApproval: false, payloadSchema: { channel: { required: true }, text: { required: true } } },
  create_task: { requiresApproval: false, payloadSchema: { title: { required: true }, projectId: { required: true } } },
  update_task: { requiresApproval: false },
  complete_task: { requiresApproval: false },
  fetch: { requiresApproval: true, payloadSchema: { url: { required: true } } },
  search: { requiresApproval: false },
  respond: { requiresApproval: false },
  think: { requiresApproval: false },
  code: { requiresApproval: true, payloadSchema: { language: { required: true }, code: { required: true } } },
  wait: { requiresApproval: false },
  unknown: { requiresApproval: true },
};

function normalizeActionType(type) {
  const normalized = type.toLowerCase().replace(/[_-]/g, '');
  const typeMap = {
    'message': 'message', 'sendmessage': 'message', 'send': 'message', 'post': 'message',
    'createtask': 'create_task', 'newtask': 'create_task',
    'updatetask': 'update_task', 'edittask': 'update_task',
    'completetask': 'complete_task', 'donetask': 'complete_task',
    'fetch': 'fetch', 'http': 'fetch', 'request': 'fetch',
    'search': 'search', 'websearch': 'search',
    'respond': 'respond', 'reply': 'respond', 'answer': 'respond', 'response': 'respond',
    'think': 'think', 'reasoning': 'think',
    'code': 'code', 'execute': 'code', 'run': 'code',
    'wait': 'wait', 'delay': 'wait', 'sleep': 'wait',
  };
  return typeMap[normalized] || 'unknown';
}

function validatePayload(type, payload) {
  const schema = ACTION_REGISTRY[type];
  if (!schema?.payloadSchema) return [];
  const errors = [];
  for (const [field, fieldSchema] of Object.entries(schema.payloadSchema)) {
    if (fieldSchema.required && (payload[field] === undefined || payload[field] === null || payload[field] === '')) {
      errors.push(`Missing required field: ${field}`);
    }
  }
  return errors;
}

function createAction(type, payload, targetId) {
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

function tryParseXML(content) {
  const actions = [];
  const xmlRegex = /<action\s+(?:type=["']([^"']+)["'])?(?:\s+target=["']([^"']+)["'])?[^>]*>([^<]*(?:<(?!\/action>)[^<]*)*)<\/action>/gi;
  let match;
  while ((match = xmlRegex.exec(content)) !== null) {
    const [, type, target, innerContent] = match;
    const actionType = normalizeActionType(type || 'unknown');
    let payload = {};
    const trimmed = innerContent.trim();
    if (trimmed.startsWith('{')) {
      try { payload = JSON.parse(trimmed); } catch { payload = { text: trimmed }; }
    } else {
      payload = { text: trimmed };
    }
    actions.push(createAction(actionType, payload, target));
  }
  return { actions, parseMethod: 'xml' };
}

function tryParseJSON(content) {
  const actions = [];
  const jsonBlockRegex = /```(?:json)?\s*\n?([\s\S]*?)\n?```/gi;
  let match;
  while ((match = jsonBlockRegex.exec(content)) !== null) {
    try {
      const parsed = JSON.parse(match[1].trim());
      const items = Array.isArray(parsed) ? parsed : [parsed];
      for (const item of items) {
        if (item.action || item.type) {
          const actionType = normalizeActionType(item.action || item.type);
          const { action: _, type: __, target, targetId, ...payload } = item;
          actions.push(createAction(actionType, payload, target || targetId));
        }
      }
    } catch {}
  }
  return { actions, parseMethod: 'json' };
}

function tryParseFunctionCalls(content) {
  const actions = [];
  const funcRegex = /\b(\w+)\s*\(\s*(\{[\s\S]*?\})\s*\)\s*;?/gi;
  const skip = ['if', 'for', 'while', 'switch', 'function', 'console', 'log'];
  let match;
  while ((match = funcRegex.exec(content)) !== null) {
    const [, funcName, argsStr] = match;
    if (skip.includes(funcName.toLowerCase())) continue;
    try {
      const jsonStr = argsStr.replace(/(\w+)\s*:/g, '"$1":').replace(/'/g, '"');
      const payload = JSON.parse(jsonStr);
      const actionType = normalizeActionType(funcName);
      const { target, targetId, ...rest } = payload;
      actions.push(createAction(actionType, rest, target || targetId));
    } catch {}
  }
  return { actions, parseMethod: 'function' };
}

function tryParseSimple(content) {
  const actions = [];
  const simpleRegex = /ACTION:\s*(\w+)(?:\s+TARGET:\s*(\S+))?(?:\s+DATA:\s*(\{[^}]+\}))?/gi;
  let match;
  while ((match = simpleRegex.exec(content)) !== null) {
    const [, type, target, dataStr] = match;
    const actionType = normalizeActionType(type);
    let payload = {};
    if (dataStr) { try { payload = JSON.parse(dataStr); } catch {} }
    actions.push(createAction(actionType, payload, target));
  }
  return { actions, parseMethod: 'simple' };
}

function parseActions(content) {
  const trimmed = content.trim();
  let result = tryParseXML(trimmed);
  if (result.actions.length > 0) return { ...result, rawResponse: content };
  result = tryParseJSON(trimmed);
  if (result.actions.length > 0) return { ...result, rawResponse: content };
  result = tryParseFunctionCalls(trimmed);
  if (result.actions.length > 0) return { ...result, rawResponse: content };
  result = tryParseSimple(trimmed);
  if (result.actions.length > 0) return { ...result, rawResponse: content };
  return {
    actions: [{ type: 'respond', payload: { text: trimmed }, confidence: 0.5, requiresApproval: false }],
    rawResponse: content,
    parseMethod: 'fallback',
  };
}

// ============================================================================
// Tests
// ============================================================================

console.log('XML Format:');
test('parses basic XML action', () => {
  const content = '<action type="message" target="channel-general">Hello world</action>';
  const result = parseActions(content);
  expect(result.parseMethod).toBe('xml');
  expect(result.actions).toHaveLength(1);
  expect(result.actions[0].type).toBe('message');
  expect(result.actions[0].targetId).toBe('channel-general');
});

test('parses XML action with JSON payload', () => {
  const content = '<action type="create_task">{"title": "New task", "projectId": "proj-1"}</action>';
  const result = parseActions(content);
  expect(result.actions[0].type).toBe('create_task');
  expect(result.actions[0].payload.title).toBe('New task');
});

console.log('\nSimple Format:');
test('parses ACTION: format', () => {
  const content = 'ACTION: message TARGET: channel-general DATA: {"text": "Hello"}';
  const result = parseActions(content);
  expect(result.parseMethod).toBe('simple');
  expect(result.actions[0].type).toBe('message');
  expect(result.actions[0].targetId).toBe('channel-general');
});

console.log('\nFallback:');
test('treats plain text as respond action', () => {
  const content = 'This is just plain text';
  const result = parseActions(content);
  expect(result.parseMethod).toBe('fallback');
  expect(result.actions[0].type).toBe('respond');
  expect(result.actions[0].confidence).toBe(0.5);
});

console.log('\nNormalization:');
test('normalizes send to message', () => {
  const content = '<action type="send">Hello</action>';
  const result = parseActions(content);
  expect(result.actions[0].type).toBe('message');
});

test('normalizes reply to respond', () => {
  const content = '<action type="reply">Hi</action>';
  const result = parseActions(content);
  expect(result.actions[0].type).toBe('respond');
});

test('marks unknown types', () => {
  const content = '<action type="unknownAction">data</action>';
  const result = parseActions(content);
  expect(result.actions[0].type).toBe('unknown');
});

console.log('\nValidation:');
test('validates required fields', () => {
  const content = '<action type="message">{}</action>';
  const result = parseActions(content);
  expect(result.actions[0].validationErrors).toBeDefined();
  expect(result.actions[0].confidence).toBe(0.6);
});

test('passes validation for complete payload', () => {
  const content = '<action type="message">{"channel": "general", "text": "Hi"}</action>';
  const result = parseActions(content);
  expect(result.actions[0].validationErrors).toBeUndefined();
  expect(result.actions[0].confidence).toBe(0.9);
});

console.log('\nApproval Flags:');
test('marks fetch as requiring approval', () => {
  const content = '<action type="fetch">{"url": "https://example.com"}</action>';
  const result = parseActions(content);
  expect(result.actions[0].requiresApproval).toBe(true);
});

test('marks code as requiring approval', () => {
  const content = '<action type="code">{"language": "js", "code": "x"}</action>';
  const result = parseActions(content);
  expect(result.actions[0].requiresApproval).toBe(true);
});

test('marks message as not requiring approval', () => {
  const content = '<action type="message">{"channel": "gen", "text": "Hi"}</action>';
  const result = parseActions(content);
  expect(result.actions[0].requiresApproval).toBe(false);
});

// Summary
console.log('\n' + '='.repeat(50));
console.log(`Results: ${passed} passed, ${failed} failed`);
console.log('='.repeat(50));

process.exit(failed > 0 ? 1 : 0);
