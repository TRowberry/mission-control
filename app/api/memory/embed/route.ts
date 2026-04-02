import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { withAgent, AuthAgent } from '@/lib/modules/api/middleware';
import { ok, badRequest, serverError } from '@/lib/modules/api/response';
import { getOllamaEndpoint } from '@/lib/llm-providers';

// Default embedding model config
const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL || 'nomic-embed-text';
const EMBEDDING_DIMENSIONS = 768; // nomic-embed-text dimensions

/**
 * POST /api/memory/embed - Generate embeddings for text
 * 
 * Headers:
 *   - X-API-Key: Agent's API key (required)
 * 
 * Body:
 *   - text: string | string[] - Text to embed (single or batch)
 *   - model?: string - Override embedding model (default: nomic-embed-text)
 * 
 * Returns:
 *   - embeddings: number[][] - Array of embedding vectors (768 dims each)
 */
export const POST = withAgent(async (request: NextRequest, agent: AuthAgent) => {
  try {
    const body = await request.json();
    const { text, model = EMBEDDING_MODEL } = body;

    // Validate input
    if (!text) {
      return badRequest('text is required');
    }

    // Normalize to array
    const texts = Array.isArray(text) ? text : [text];
    
    if (texts.length === 0) {
      return badRequest('text array cannot be empty');
    }

    if (texts.length > 100) {
      return badRequest('Maximum 100 texts per request');
    }

    // Validate all texts are strings
    if (!texts.every(t => typeof t === 'string' && t.trim().length > 0)) {
      return badRequest('All texts must be non-empty strings');
    }

    // Get embedding provider endpoint from database settings
    const ollamaUrl = await getOllamaEndpoint();

    // Generate embeddings using Ollama
    const embeddings: number[][] = [];
    
    for (const t of texts) {
      try {
        const response = await fetch(`${ollamaUrl}/api/embeddings`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model,
            prompt: t.trim(),
          }),
        });

        if (!response.ok) {
          const error = await response.text();
          console.error(`[Embed] Ollama error for text "${t.substring(0, 50)}...":`, error);
          console.error(`[Embed] Ollama error for text "${t.substring(0, 50)}...":`, error);
          return NextResponse.json(
            { error: 'Embedding generation failed' },
            { status: 502 }
          );
        }

        const data = await response.json();
        
        if (!data.embedding || !Array.isArray(data.embedding)) {
          return NextResponse.json(
            { error: 'Invalid response from embedding model' },
            { status: 502 }
          );
        }

        embeddings.push(data.embedding);
      } catch (fetchError: any) {
        console.error('[Embed] Failed to connect to Ollama:', fetchError.message);
        return NextResponse.json(
          { error: 'Embedding service unavailable' },
          { status: 503 }
        );
      }
    }

    console.log(`[Embed] Agent ${agent.username} generated ${embeddings.length} embeddings`);

    return ok({
      success: true,
      model,
      dimensions: embeddings[0]?.length || EMBEDDING_DIMENSIONS,
      embeddings,
      count: embeddings.length,
    });

  } catch (error) {
    console.error('[Embed] Error:', error);
    return serverError('Failed to generate embeddings', error);
  }
});

/**
 * GET /api/memory/embed/info - Get embedding service info
 */
export const GET = withAgent(async (request: NextRequest, agent: AuthAgent) => {
  try {
    // Get Ollama endpoint from settings
    const ollamaUrl = await getOllamaEndpoint();
    
    // Check Ollama connectivity
    let ollamaStatus = 'unknown';
    let availableModels: string[] = [];
    
    try {
      const response = await fetch(`${ollamaUrl}/api/tags`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
      });
      
      if (response.ok) {
        const data = await response.json();
        ollamaStatus = 'connected';
        availableModels = (data.models || [])
          .filter((m: any) => m.name.includes('embed') || m.name.includes('nomic'))
          .map((m: any) => m.name);
      } else {
        ollamaStatus = 'error';
      }
    } catch {
      ollamaStatus = 'unavailable';
    }

    return ok({
      success: true,
      provider: 'ollama',
      endpoint: ollamaUrl,
      defaultModel: EMBEDDING_MODEL,
      dimensions: EMBEDDING_DIMENSIONS,
      status: ollamaStatus,
      availableModels,
    });

  } catch (error) {
    console.error('[Embed Info] Error:', error);
    return serverError('Failed to get embedding info', error);
  }
});
