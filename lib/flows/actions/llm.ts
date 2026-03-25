import prisma from '@/lib/db';
import { ActionHandler, ActionResult } from './index';

export const llmAction: ActionHandler = async (config, input, context): Promise<ActionResult> => {
  const { prompt, systemPrompt, model, providerId, maxTokens = 1000, temperature = 0.7 } = config;

  if (!prompt) {
    throw new Error('LLM action requires a prompt');
  }

  // Resolve prompt template
  const resolvedPrompt = resolveTemplate(prompt, input);
  const resolvedSystemPrompt = systemPrompt ? resolveTemplate(systemPrompt, input) : undefined;

  // Get LLM provider
  let provider;
  if (providerId) {
    provider = await prisma.lLMProvider.findUnique({ where: { id: providerId } });
  } else {
    // Find default provider
    provider = await prisma.lLMProvider.findFirst({
      where: { isEnabled: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  if (!provider) {
    throw new Error('No LLM provider available');
  }

  // Make API call based on provider type
  // Use specified model, or first available model from provider
  const selectedModel = model || (provider.models && provider.models[0]) || 'gpt-3.5-turbo';
  
  const result = await callLLM(provider, {
    prompt: resolvedPrompt,
    systemPrompt: resolvedSystemPrompt,
    model: selectedModel,
    maxTokens,
    temperature,
  });

  return {
    output: {
      response: result.text,
      model: result.model,
    },
    tokensUsed: result.tokensUsed,
    cost: result.cost,
  };
};

interface LLMCallResult {
  text: string;
  model: string;
  tokensUsed: number;
  cost: number;
}

async function callLLM(provider: any, options: any): Promise<LLMCallResult> {
  const { prompt, systemPrompt, model, maxTokens, temperature } = options;

  // Provider name is stored in 'name' field (e.g., 'openai', 'anthropic')
  if (provider.name === 'openai' || provider.name === 'openai-compatible') {
    const apiKey = provider.apiKey;
    const baseUrl = provider.endpoint || 'https://api.openai.com/v1';

    const messages: any[] = [];
    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt });
    }
    messages.push({ role: 'user', content: prompt });

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        max_tokens: maxTokens,
        temperature,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`LLM API error: ${error}`);
    }

    const data = await response.json();
    const tokensUsed = data.usage?.total_tokens || 0;
    
    return {
      text: data.choices[0]?.message?.content || '',
      model: data.model,
      tokensUsed,
      cost: calculateCost(model, tokensUsed),
    };
  }

  if (provider.name === 'anthropic') {
    const apiKey = provider.apiKey;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        system: systemPrompt,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`LLM API error: ${error}`);
    }

    const data = await response.json();
    const tokensUsed = (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0);

    return {
      text: data.content[0]?.text || '',
      model: data.model,
      tokensUsed,
      cost: calculateCost(model, tokensUsed),
    };
  }

  throw new Error(`Unsupported LLM provider: ${provider.name}`);
}

function calculateCost(model: string, tokens: number): number {
  // Rough cost estimates per 1K tokens
  const costs: Record<string, number> = {
    'gpt-4': 0.06,
    'gpt-4-turbo': 0.03,
    'gpt-3.5-turbo': 0.002,
    'claude-3-opus': 0.075,
    'claude-3-sonnet': 0.015,
    'claude-3-haiku': 0.00125,
  };

  const costPer1k = costs[model] || 0.01;
  return (tokens / 1000) * costPer1k;
}

function resolveTemplate(template: string, data: any): string {
  return template.replace(/\{\{([^}]+)\}\}/g, (match, path) => {
    const value = path.trim().split('.').reduce((obj: any, key: string) => obj?.[key], data);
    if (value === undefined) return match;
    return typeof value === 'object' ? JSON.stringify(value) : String(value);
  });
}
