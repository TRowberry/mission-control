import { NextRequest } from 'next/server';
import prisma from '@/lib/db';
import { withAuthParams, AuthUser } from '@/lib/modules/api/middleware';
import { ok, notFound, badRequest } from '@/lib/modules/api/response';

/**
 * POST /api/llm-providers/[id]/test
 * Test connection to an LLM provider
 */
export const POST = withAuthParams(async (
  req: NextRequest,
  user: AuthUser,
  params: Promise<Record<string, string>>
) => {
  const { id } = await params;

  const provider = await prisma.lLMProvider.findUnique({
    where: { id },
  });

  if (!provider) {
    return notFound('Provider not found');
  }

  const startTime = Date.now();
  let success = false;
  let message = '';
  let models: string[] = [];

  try {
    switch (provider.name) {
      case 'ollama': {
        const endpoint = provider.endpoint || 'http://localhost:11434';
        const res = await fetch(`${endpoint}/api/tags`, {
          signal: AbortSignal.timeout(10000),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        models = data.models?.map((m: { name: string }) => m.name) || [];
        success = true;
        message = `Connected. Found ${models.length} model(s).`;
        break;
      }

      case 'openai': {
        if (!provider.apiKey) throw new Error('API key not configured');
        const res = await fetch('https://api.openai.com/v1/models', {
          headers: {
            Authorization: `Bearer ${provider.apiKey}`,
            ...(provider.orgId && { 'OpenAI-Organization': provider.orgId }),
          },
          signal: AbortSignal.timeout(10000),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error?.message || `HTTP ${res.status}`);
        }
        const data = await res.json();
        models = data.data
          ?.filter((m: { id: string }) => m.id.startsWith('gpt'))
          .map((m: { id: string }) => m.id) || [];
        success = true;
        message = `Connected. Found ${models.length} GPT model(s).`;
        break;
      }

      case 'anthropic': {
        if (!provider.apiKey) throw new Error('API key not configured');
        // Anthropic doesn't have a models list endpoint, so we do a minimal test
        const res = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'x-api-key': provider.apiKey,
            'anthropic-version': '2023-06-01',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'claude-3-haiku-20240307',
            max_tokens: 1,
            messages: [{ role: 'user', content: 'Hi' }],
          }),
          signal: AbortSignal.timeout(15000),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error?.message || `HTTP ${res.status}`);
        }
        success = true;
        models = ['claude-3-opus-20240229', 'claude-3-sonnet-20240229', 'claude-3-haiku-20240307'];
        message = 'API key valid.';
        break;
      }

      case 'openclaw': {
        const endpoint = provider.endpoint;
        if (!endpoint) throw new Error('Gateway URL not configured');
        const res = await fetch(`${endpoint}/health`, {
          signal: AbortSignal.timeout(10000),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        success = true;
        message = 'Gateway reachable.';
        break;
      }

      default:
        throw new Error(`Unknown provider type: ${provider.name}`);
    }
  } catch (err) {
    success = false;
    message = err instanceof Error ? err.message : 'Connection failed';
  }

  const latencyMs = Date.now() - startTime;

  // Update provider health status
  await prisma.lLMProvider.update({
    where: { id },
    data: {
      lastHealthCheck: new Date(),
      isHealthy: success,
      healthMessage: message,
      ...(success && models.length > 0 && { models }),
    },
  });

  return ok({
    success,
    message,
    latencyMs,
    models: success ? models : undefined,
  });
});
