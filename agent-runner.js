#!/usr/bin/env node
/**
 * Agent Runner - Executes inside isolated container
 * 
 * Env vars:
 * - AGENT_ID: Agent user ID
 * - RUN_ID: AgentRun record ID
 * - LLM_PROVIDER: ollama, openai, anthropic
 * - LLM_MODEL: model name
 * - LLM_ENDPOINT: API endpoint
 * - SYSTEM_PROMPT: System instructions
 * - USER_PROMPT: Task to execute
 * - MC_API_URL: Mission Control API base URL
 * - MC_API_KEY: Agent API key for callbacks
 */

const {
  AGENT_ID,
  RUN_ID,
  LLM_PROVIDER = 'ollama',
  LLM_MODEL = 'llama3.2',
  LLM_ENDPOINT = 'http://10.0.0.121:11434',
  SYSTEM_PROMPT = 'You are a helpful AI assistant.',
  USER_PROMPT = 'Execute your primary task.',
  MC_API_URL = 'http://10.0.0.206:3000',
  MC_API_KEY = '',
} = process.env;

/**
 * Report status back to Mission Control
 */
async function reportStatus(status, data = {}) {
  if (!MC_API_KEY || !RUN_ID) {
    console.log(`[${status}]`, JSON.stringify(data));
    return;
  }

  try {
    await fetch(`${MC_API_URL}/api/agents/runs/${RUN_ID}/status`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': MC_API_KEY,
      },
      body: JSON.stringify({ status, ...data }),
    });
  } catch (error) {
    console.error('Failed to report status:', error.message);
  }
}

/**
 * Call Ollama API
 */
async function callOllama(endpoint, model, systemPrompt, userPrompt) {
  const response = await fetch(`${endpoint}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      prompt: userPrompt,
      system: systemPrompt,
      stream: false,
    }),
  });

  if (!response.ok) {
    throw new Error(`Ollama request failed: ${response.statusText}`);
  }

  const data = await response.json();
  return {
    content: data.response || '',
    tokensUsed: (data.prompt_eval_count || 0) + (data.eval_count || 0),
  };
}

/**
 * Call OpenAI-compatible API
 */
async function callOpenAI(endpoint, model, systemPrompt, userPrompt, apiKey) {
  const response = await fetch(`${endpoint}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI request failed: ${response.statusText}`);
  }

  const data = await response.json();
  const choice = data.choices?.[0];
  return {
    content: choice?.message?.content || '',
    tokensUsed: data.usage?.total_tokens || 0,
  };
}

/**
 * Call the configured LLM
 */
async function callLLM() {
  console.log(`Calling LLM: ${LLM_PROVIDER}/${LLM_MODEL}`);
  
  switch (LLM_PROVIDER.toLowerCase()) {
    case 'ollama':
      return callOllama(LLM_ENDPOINT, LLM_MODEL, SYSTEM_PROMPT, USER_PROMPT);
    case 'openai':
    case 'openrouter':
      return callOpenAI(LLM_ENDPOINT, LLM_MODEL, SYSTEM_PROMPT, USER_PROMPT, process.env.LLM_API_KEY);
    default:
      throw new Error(`Unsupported provider: ${LLM_PROVIDER}`);
  }
}

/**
 * Parse ACTION: blocks from LLM response
 */
function parseActions(content) {
  const actions = [];
  const actionRegex = /ACTION:\s*(\w+)(?:\s*TARGET:\s*(\S+))?(?:\s*DATA:\s*(\{[^}]+\}))?/gi;
  
  let match;
  while ((match = actionRegex.exec(content)) !== null) {
    const action = { type: match[1].toLowerCase() };
    if (match[2]) action.targetId = match[2];
    if (match[3]) {
      try {
        action.payload = JSON.parse(match[3]);
      } catch { }
    }
    actions.push(action);
  }
  
  if (actions.length === 0 && content.trim()) {
    actions.push({
      type: 'response',
      payload: { content: content.trim() },
    });
  }
  
  return actions;
}

/**
 * Main execution
 */
async function main() {
  const startTime = Date.now();
  console.log('=== Agent Runner Started ===');
  console.log(`Agent: ${AGENT_ID}`);
  console.log(`Run: ${RUN_ID}`);
  console.log(`Provider: ${LLM_PROVIDER}/${LLM_MODEL}`);
  
  await reportStatus('running', { startedAt: new Date().toISOString() });

  try {
    // Call LLM
    const response = await callLLM();
    console.log('\n=== LLM Response ===');
    console.log(response.content);
    console.log(`\nTokens: ${response.tokensUsed}`);

    // Parse actions
    const actions = parseActions(response.content);
    console.log(`\n=== Parsed ${actions.length} action(s) ===`);
    actions.forEach((a, i) => console.log(`${i + 1}. ${a.type}${a.targetId ? ` -> ${a.targetId}` : ''}`));

    // Report completion
    const durationMs = Date.now() - startTime;
    const result = {
      response: response.content,
      tokensUsed: response.tokensUsed,
      actionsCount: actions.length,
      actions,
      durationMs,
    };

    await reportStatus('completed', {
      output: response.content,
      tokensUsed: response.tokensUsed,
      actionsCount: actions.length,
      actions,
      durationMs,
      completedAt: new Date().toISOString(),
    });

    // Output structured result for process-runner parsing
    console.log(`\n===RESULT_JSON===`);
    console.log(JSON.stringify(result));
    console.log(`===END_JSON===`);

    console.log(`\n=== Completed in ${durationMs}ms ===`);
    process.exit(0);

  } catch (error) {
    const durationMs = Date.now() - startTime;
    console.error('\n=== Error ===');
    console.error(error.message);

    await reportStatus('failed', {
      errorMessage: error.message,
      durationMs,
      completedAt: new Date().toISOString(),
    });

    process.exit(1);
  }
}

main();
