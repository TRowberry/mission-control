/**
 * In-process chat reply handler for MC agents.
 *
 * When an agent is @mentioned in a channel and has no external webhook configured,
 * MC handles the reply directly: fetches channel context, calls the agent's LLM,
 * and posts the response back to the channel.
 */

import prisma from '@/lib/db';
import { getOllamaEndpoint, getLLMProvider } from '@/lib/llm-providers';

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/**
 * Call an LLM provider and return the response text.
 * Supports: ollama (native /api/chat), openai-compatible (/chat/completions), anthropic
 */
async function callLLMForChat(
  provider: string,
  endpoint: string,
  apiKey: string | null,
  model: string,
  messages: ChatMessage[],
): Promise<string> {
  if (provider === 'ollama') {
    // Ollama native chat API supports multi-turn messages
    const response = await fetch(`${endpoint}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages, stream: false }),
      signal: AbortSignal.timeout(60000),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Ollama chat error: ${err}`);
    }

    const data = await response.json();
    return data.message?.content || '';
  }

  if (provider === 'anthropic') {
    const systemMsg = messages.find(m => m.role === 'system');
    const chatMessages = messages.filter(m => m.role !== 'system');

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey || '',
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: 1024,
        ...(systemMsg && { system: systemMsg.content }),
        messages: chatMessages,
      }),
      signal: AbortSignal.timeout(60000),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Anthropic error: ${err}`);
    }

    const data = await response.json();
    return data.content?.[0]?.text || '';
  }

  // OpenAI-compatible (openai, openai-compatible, lmstudio, etc.)
  const base = endpoint.replace(/\/$/, '');
  const url = base.endsWith('/v1') ? `${base}/chat/completions` : `${base}/v1/chat/completions`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(apiKey && { Authorization: `Bearer ${apiKey}` }),
    },
    body: JSON.stringify({ model, messages, max_tokens: 1024, temperature: 0.7 }),
    signal: AbortSignal.timeout(60000),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`LLM API error: ${err}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || '';
}

/**
 * Handle an in-process chat reply for an agent that was @mentioned.
 * Fires async — caller should not await this.
 */
export async function handleChatReply(
  agentId: string,
  channelId: string,
  triggeringMessageId: string,
): Promise<void> {
  try {
    // Load agent (separate queries to avoid stale Prisma type issues)
    const agent = await prisma.user.findUnique({ where: { id: agentId } });

    if (!agent || !agent.isAgent) return;

    const config = await (prisma as any).agentConfig.findUnique({ where: { userId: agentId } });
    if (!config) {
      console.warn(`[ChatReply] Agent ${agent.username} has no AgentConfig, skipping reply`);
      return;
    }

    // Determine LLM settings — prefer AgentConfig, fall back to DB provider, then defaults
    const providerName = (config as any).llmProvider || 'ollama';
    let endpoint = (config as any).llmEndpoint || '';
    let apiKey: string | null = null;
    const model = (config as any).llmModel || 'llama3.2';

    if (!endpoint) {
      if (providerName === 'ollama') {
        endpoint = await getOllamaEndpoint();
      } else {
        // Look up the provider via the llm-providers utility
        const dbProvider = await getLLMProvider(providerName);
        endpoint = dbProvider?.endpoint || '';
        apiKey = dbProvider?.apiKey || null;
      }
    }

    if (!endpoint) {
      console.warn(`[ChatReply] No LLM endpoint for agent ${agent.username} (provider: ${providerName}), skipping`);
      return;
    }

    // Fetch recent channel messages for context (last 20, chronological)
    const recent = await prisma.message.findMany({
      where: { channelId },
      orderBy: { createdAt: 'desc' },
      take: 20,
      include: {
        author: {
          select: { id: true, username: true, displayName: true, isAgent: true },
        },
      },
    });
    recent.reverse();

    // Build messages array
    const systemPrompt =
      config.systemPrompt ||
      `You are ${agent.displayName || agent.username}, a helpful AI assistant working in a team chat. ` +
      `Respond concisely and helpfully. Stay in character.`;

    const chatMessages: ChatMessage[] = [{ role: 'system', content: systemPrompt }];

    for (const msg of recent) {
      if (msg.authorId === agentId) {
        chatMessages.push({ role: 'assistant', content: msg.content });
      } else {
        const name = msg.author.displayName || msg.author.username;
        chatMessages.push({ role: 'user', content: `${name}: ${msg.content}` });
      }
    }

    // Call the LLM
    console.log(`[ChatReply] Calling ${providerName}/${model} for ${agent.username} in channel ${channelId}`);
    const replyText = await callLLMForChat(providerName, endpoint, apiKey, model, chatMessages);

    if (!replyText.trim()) {
      console.warn(`[ChatReply] Empty reply from LLM for ${agent.username}`);
      return;
    }

    // Post the reply as the agent
    const reply = await prisma.message.create({
      data: {
        channelId,
        authorId: agentId,
        content: replyText.trim(),
        replyToId: triggeringMessageId,
      },
      include: {
        author: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatar: true,
            isAgent: true,
          },
        },
        mentions: {
          include: { user: { select: { id: true, username: true } } },
        },
        replyTo: {
          select: {
            id: true,
            content: true,
            author: { select: { id: true, username: true, displayName: true } },
          },
        },
        attachments: true,
      },
    });

    // Emit via WebSocket so the reply appears in real-time
    if (global.io) {
      global.io.to(`channel:${channelId}`).emit('message:new', { ...reply, channelId });
    }

    console.log(`[ChatReply] ${agent.username} replied in channel ${channelId} (${replyText.length} chars)`);
  } catch (err: any) {
    console.error(`[ChatReply] Failed for agent ${agentId}:`, err.message);
  }
}
