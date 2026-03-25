/**
 * LLM Provider utilities
 * 
 * Fetches provider configurations from database instead of hardcoded values.
 */
import prisma from '@/lib/db';

export interface LLMProviderConfig {
  name: string;
  endpoint: string | null;
  apiKey: string | null;
  models: string[];
  isDefault: boolean;
}

// Cache for provider configs (refresh every 5 minutes)
let providerCache: Map<string, LLMProviderConfig> = new Map();
let cacheTimestamp = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Get all enabled LLM providers from database
 */
export async function getLLMProviders(): Promise<LLMProviderConfig[]> {
  const now = Date.now();
  
  // Return cached if fresh
  if (providerCache.size > 0 && (now - cacheTimestamp) < CACHE_TTL) {
    return Array.from(providerCache.values());
  }

  try {
    const providers = await prisma.lLMProvider.findMany({
      where: { isEnabled: true },
      select: {
        name: true,
        endpoint: true,
        apiKey: true,
        models: true,
        isDefault: true,
      },
    });

    // Update cache
    providerCache = new Map();
    for (const p of providers) {
      providerCache.set(p.name, p);
    }
    cacheTimestamp = now;

    return providers;
  } catch (error) {
    console.error('[LLM Providers] Failed to fetch providers:', error);
    return [];
  }
}

/**
 * Get a specific provider by name
 */
export async function getLLMProvider(name: string): Promise<LLMProviderConfig | null> {
  const now = Date.now();
  
  // Check cache first
  if ((now - cacheTimestamp) < CACHE_TTL && providerCache.has(name)) {
    return providerCache.get(name) || null;
  }

  // Refresh cache
  await getLLMProviders();
  return providerCache.get(name) || null;
}

/**
 * Get the default provider
 */
export async function getDefaultLLMProvider(): Promise<LLMProviderConfig | null> {
  const providers = await getLLMProviders();
  return providers.find(p => p.isDefault) || providers[0] || null;
}

/**
 * Get Ollama endpoint from provider settings
 * Falls back to environment variable, then localhost
 */
export async function getOllamaEndpoint(): Promise<string> {
  const provider = await getLLMProvider('ollama');
  if (provider?.endpoint) {
    return provider.endpoint;
  }
  return process.env.OLLAMA_URL || 'http://localhost:11434';
}

/**
 * Get Mission Control API URL
 * For agent runners to call back to MC
 */
export function getMCApiUrl(): string {
  return process.env.MC_API_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
}

/**
 * Get OpenClaw Gateway URL
 */
export function getOpenClawGatewayUrl(): string {
  return process.env.OPENCLAW_GATEWAY_URL || 'http://localhost:18789';
}

/**
 * Clear provider cache (call after settings update)
 */
export function clearProviderCache(): void {
  providerCache.clear();
  cacheTimestamp = 0;
}
