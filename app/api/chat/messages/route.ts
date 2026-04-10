import { NextRequest } from 'next/server';
import prisma from '@/lib/db';
import { withAuth, AuthUser } from '@/lib/modules/api/middleware';
import { ok, created, badRequest, notFound, forbidden, serverError } from '@/lib/modules/api/response';
import { handleApprovalReply } from '@/lib/modules/agents/approval-reply-handler';
import { getOpenClawGatewayUrl } from '@/lib/llm-providers';

// OpenClaw gateway config (for Rico)
const OPENCLAW_GATEWAY_URL = getOpenClawGatewayUrl();
const OPENCLAW_GATEWAY_TOKEN = process.env.OPENCLAW_GATEWAY_TOKEN || '';

// Simple UUID v4 generator (no crypto dependency needed)
function randomId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

/**
 * Wake Rico via the OpenClaw gateway WebSocket protocol.
 *
 * The gateway uses WebSocket with a challenge-response auth.
 * Message format: {type: "req", id: "<uuid>", method: "<method>", params: {...}}
 * Response format: {type: "res", id: "<uuid>", ok: bool, payload?: {...}, error?: {...}}
 * Event format: {type: "event", event: "<name>", payload: {...}}
 *
 * After connecting, we send a chat.send to Rico's main session to trigger
 * him to check the MC feed for new mentions.
 */
async function wakeRicoViaGatewayWS(
  gatewayUrl: string,
  token: string,
  sessionKey: string,
  wakeMessage: string,
): Promise<void> {
  // Convert http:// URL to ws://
  const wsUrl = gatewayUrl.replace(/^https?:\/\//, (m) => m === 'https://' ? 'wss://' : 'ws://');

  return new Promise<void>((resolve, reject) => {
    let settled = false;
    const done = (err?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { ws.close(); } catch {}
      if (err) reject(err); else resolve();
    };

    const timer = setTimeout(() => done(new Error('Wake WS timed out')), 12000);

    // Dynamic require to avoid bundling issues in Next.js
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const WS = require('ws');
    const ws = new WS(wsUrl);
    const pending = new Map<string, { method: string }>();

    const sendReq = (method: string, params: Record<string, unknown>) => {
      const id = randomId();
      ws.send(JSON.stringify({ type: 'req', id, method, params }));
      pending.set(id, { method });
      return id;
    };

    ws.on('open', () => {
      // Wait for connect.challenge event from the server before sending connect
    });

    ws.on('message', (raw: Buffer | string) => {
      let msg: Record<string, unknown>;
      try { msg = JSON.parse(raw.toString()); } catch { return; }

      if (msg.type === 'event') {
        const evt = msg as { type: string; event: string; payload?: unknown };
        if (evt.event === 'connect.challenge') {
          // Server challenges us — respond with connect request
          sendReq('connect', {
            minProtocol: 3,
            maxProtocol: 3,
            client: { id: 'openclaw-control-ui', version: 'mc-wake/1.0', platform: 'node', mode: 'ui' },
            role: 'operator',
            scopes: ['operator.read', 'operator.write', 'operator.admin'],
            caps: ['tool-events'],
            auth: { token },
            userAgent: 'mission-control-agent-wake/1.0',
            locale: 'en-US',
          });
        }
        return;
      }

      if (msg.type === 'res') {
        const res = msg as { type: string; id: string; ok: boolean; payload?: unknown; error?: { message?: string } };
        const p = pending.get(res.id);
        if (!p) return;
        pending.delete(res.id);

        if (p.method === 'connect') {
          if (!res.ok) {
            done(new Error(`Gateway connect failed: ${res.error?.message ?? 'unknown'}`));
            return;
          }
          // Connected — now send chat.send to wake Rico's session
          sendReq('chat.send', {
            sessionKey,
            message: wakeMessage,
            deliver: false,
            idempotencyKey: randomId(),
          });
          return;
        }

        if (p.method === 'chat.send') {
          if (res.ok) {
            done();
          } else {
            done(new Error(`chat.send failed: ${res.error?.message ?? 'unknown'}`));
          }
          return;
        }
      }
    });

    ws.on('error', (err: Error) => done(err));
    ws.on('close', () => done(new Error('Gateway WS closed unexpectedly')));
  });
}

// Wake an agent via webhook or OpenClaw gateway
async function wakeAgent(
  agentId: string,
  agentUsername: string,
  channelId: string,
  messageId: string,
  webhookUrl: string | null
) {
  // Special handling for Rico - use OpenClaw gateway WebSocket to deliver a chat message
  if (agentUsername.toLowerCase() === 'rico' && OPENCLAW_GATEWAY_URL && OPENCLAW_GATEWAY_TOKEN) {
    try {
      const wakeMessage = `You have a new @mention in Mission Control! Channel: ${channelId}, Message: ${messageId}. Please check your MC feed now.`;
      console.log(`[Agent Wake] Waking Rico via OpenClaw gateway WS`);

      await wakeRicoViaGatewayWS(
        OPENCLAW_GATEWAY_URL,
        OPENCLAW_GATEWAY_TOKEN,
        'agent:main:main',
        wakeMessage,
      );
      console.log(`[Agent Wake] Successfully woke Rico via gateway WS`);
      return;
    } catch (err) {
      console.error(`[Agent Wake] Gateway WS wake failed:`, err);
      // Fall through to webhook if gateway WS fails
    }
  }

  // Generic webhook for other agents
  if (!webhookUrl) {
    console.log(`[Agent Wake] No webhook configured for ${agentUsername}, skipping wake`);
    return;
  }

  try {
    const payload = {
      type: 'mention',
      agentId,
      agentUsername,
      channelId,
      messageId,
      timestamp: new Date().toISOString(),
    };

    console.log(`[Agent Wake] Sending wake to ${agentUsername} at ${webhookUrl}`);
    
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(5000),
    });

    if (response.ok) {
      console.log(`[Agent Wake] Successfully woke ${agentUsername}`);
    } else {
      console.error(`[Agent Wake] Wake failed for ${agentUsername}: HTTP ${response.status}`);
    }
  } catch (err) {
    console.error(`[Agent Wake] Failed to wake ${agentUsername}:`, err);
  }
}

// GET /api/chat/messages?channelId=xxx
export const GET = withAuth(async (req: NextRequest, user: AuthUser) => {
  const { searchParams } = new URL(req.url);
  const channelId = searchParams.get('channelId');
  const before = searchParams.get('before'); // For pagination
  const limit = parseInt(searchParams.get('limit') || '50');

  if (!channelId) {
    return badRequest('channelId is required');
  }

  const messages = await prisma.message.findMany({
    where: {
      channelId,
      threadId: null, // Only get top-level messages, not thread replies
      ...(before && {
        createdAt: { lt: new Date(before) },
      }),
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
    include: {
      author: {
        select: {
          id: true,
          username: true,
          displayName: true,
          avatar: true,
          status: true,
        },
      },
      reactions: {
        include: {
          user: {
            select: { id: true, username: true },
          },
        },
      },
      attachments: true,
      replyTo: {
        select: {
          id: true,
          content: true,
          author: {
            select: {
              id: true,
              username: true,
              displayName: true,
            },
          },
        },
      },
    },
  });

  // For each message, check if it has thread replies
  const messagesWithThreadInfo = await Promise.all(
    messages.map(async (message) => {
      const threadReply = await prisma.message.findFirst({
        where: {
          replyToId: message.id,
          threadId: { not: null },
        },
        include: {
          thread: {
            include: {
              _count: { select: { messages: true } },
              messages: {
                orderBy: { createdAt: 'desc' },
                take: 1,
                select: {
                  author: { select: { displayName: true } },
                  createdAt: true,
                },
              },
            },
          },
        },
      });
      
      return {
        ...message,
        thread: threadReply?.thread || null,
      };
    })
  );

  // Reverse to get chronological order
  return ok(messagesWithThreadInfo.reverse());
});

// POST /api/chat/messages
export const POST = withAuth(async (req: NextRequest, user: AuthUser) => {
  const { channelId, content, replyToId, attachments } = await req.json();

  // Need either content or attachments
  const hasContent = content?.trim();
  const hasAttachments = attachments && attachments.length > 0;
  
  if (!channelId || (!hasContent && !hasAttachments)) {
    return badRequest('channelId and content or attachments are required');
  }

  // Verify channel exists
  const channel = await prisma.channel.findUnique({
    where: { id: channelId },
  });

  if (!channel) {
    return notFound('Channel not found');
  }

  // Determine message type
  let messageType = 'text';
  if (hasAttachments && !hasContent) {
    messageType = 'file';
  }

  // Parse @mentions from content
  const mentionRegex = /@(\w+)/g;
  const mentionedUsernames: string[] = [];
  let match;
  while ((match = mentionRegex.exec(hasContent ? content : '')) !== null) {
    mentionedUsernames.push(match[1].toLowerCase());
  }

  // Look up mentioned users (including agent info for wake)
  let mentionedUsers: { id: string; username: string; isAgent: boolean; webhookUrl: string | null }[] = [];
  if (mentionedUsernames.length > 0) {
    mentionedUsers = await prisma.user.findMany({
      where: {
        username: { in: mentionedUsernames, mode: 'insensitive' },
      },
      select: { id: true, username: true, isAgent: true, webhookUrl: true },
    });
  }

  // Create message with attachments and mentions
  const message = await prisma.message.create({
    data: {
      content: hasContent ? content.trim() : '',
      type: messageType,
      authorId: user.id,
      channelId,
      replyToId: replyToId || null,
      attachments: hasAttachments ? {
        create: attachments.map((a: { url: string; name: string; type: string; size: number }) => ({
          url: a.url,
          name: a.name,
          type: a.type,
          size: a.size,
        })),
      } : undefined,
      mentions: mentionedUsers.length > 0 ? {
        create: mentionedUsers.map(u => ({ userId: u.id })),
      } : undefined,
    },
    include: {
      author: {
        select: {
          id: true,
          username: true,
          displayName: true,
          avatar: true,
          status: true,
        },
      },
      reactions: true,
      attachments: true,
      mentions: {
        include: {
          user: {
            select: { id: true, username: true, displayName: true },
          },
        },
      },
      replyTo: {
        select: {
          id: true,
          content: true,
          author: {
            select: {
              id: true,
              username: true,
              displayName: true,
            },
          },
        },
      },
      channel: {
        select: { id: true, name: true, slug: true },
      },
    },
  });

  // Wake any mentioned agents
  if (hasContent) {
    const mentionedAgents = mentionedUsers.filter(u => u.isAgent);
    for (const agent of mentionedAgents) {
      wakeAgent(
        agent.id,
        agent.username,
        channel.id,
        message.id,
        agent.webhookUrl
      );
    }
  }

  // Check if this is a reply to an approval request
  if (replyToId) {
    const approvalResult = await handleApprovalReply(
      { id: message.id, content: message.content, replyToId, authorId: user.id },
      { id: user.id, username: user.username, displayName: user.displayName, isAgent: false }
    );
    if (approvalResult.handled) {
      console.log(`[Message] Processed approval reply: ${approvalResult.result} for run ${approvalResult.runId}`);
    }
  }

  // Create notifications for mentioned users (excluding self and agents)
  const mentionedHumans = mentionedUsers.filter(u => !u.isAgent && u.id !== user.id);
  for (const mentionedUser of mentionedHumans) {
    try {
      const notification = await prisma.notification.create({
        data: {
          userId: mentionedUser.id,
          type: 'mention',
          title: `${user.displayName || user.username} mentioned you`,
          body: content.substring(0, 200),
          messageId: message.id,
          channelId: channelId,
        },
      });
      
      // Emit notification via WebSocket
      if (global.io) {
        global.io.to(`user:${mentionedUser.id}`).emit('notification:new', notification);
      }
    } catch (err) {
      console.error('Failed to create mention notification:', err);
    }
  }

  // Prepare message payload for socket emission
  const messagePayload = {
    ...message,
    channelId,
  };

  // Emit WebSocket event for real-time update
  if (global.io) {
    // Send to everyone in the channel (for users viewing this channel)
    global.io.to(`channel:${channelId}`).emit('message:new', messagePayload);
    
    // ALSO send directly to mentioned users for desktop notifications
    // (they may not be viewing this channel but should still get notified)
    for (const mentionedUser of mentionedUsers) {
      // Send to user's personal room
      global.io.to(`user:${mentionedUser.id}`).emit('message:new', messagePayload);
    }
  }

  return created(message);
});

// PATCH /api/chat/messages (edit message)
export const PATCH = withAuth(async (req: NextRequest, user: AuthUser) => {
  const { messageId, content } = await req.json();

  if (!messageId || !content?.trim()) {
    return badRequest('messageId and content are required');
  }

  // Verify ownership
  const existing = await prisma.message.findUnique({
    where: { id: messageId },
  });

  if (!existing) {
    return notFound('Message not found');
  }

  if (existing.authorId !== user.id) {
    return forbidden('Not authorized');
  }

  const message = await prisma.message.update({
    where: { id: messageId },
    data: {
      content: content.trim(),
      edited: true,
    },
    include: {
      author: {
        select: {
          id: true,
          username: true,
          displayName: true,
          avatar: true,
          status: true,
        },
      },
      reactions: true,
      attachments: true,
    },
  });

  // Emit WebSocket event for real-time update
  if (global.io) {
    global.io.to(`channel:${existing.channelId}`).emit('message:update', {
      ...message,
      channelId: existing.channelId,
    });
  }

  return ok(message);
});

// DELETE /api/chat/messages
export const DELETE = withAuth(async (req: NextRequest, user: AuthUser) => {
  const { searchParams } = new URL(req.url);
  const messageId = searchParams.get('messageId');

  if (!messageId) {
    return badRequest('messageId is required');
  }

  // Verify ownership
  const existing = await prisma.message.findUnique({
    where: { id: messageId },
  });

  if (!existing) {
    return notFound('Message not found');
  }

  if (existing.authorId !== user.id) {
    return forbidden('Not authorized');
  }

  await prisma.message.delete({
    where: { id: messageId },
  });

  // Emit WebSocket event for real-time update
  if (global.io) {
    global.io.to(`channel:${existing.channelId}`).emit('message:delete', {
      messageId,
      channelId: existing.channelId,
    });
  }

  return ok({ success: true });
});
