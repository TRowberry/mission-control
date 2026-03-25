import prisma from '@/lib/db';
import { ActionHandler, ActionResult } from './index';

export const postMessageAction: ActionHandler = async (config, input, context): Promise<ActionResult> => {
  const { channelId, channel, message, messageTemplate } = config;
  const messageContent = message || messageTemplate; // Support both field names

  // Resolve channel - can be ID or slug
  const targetChannelId = channelId || channel;
  if (!targetChannelId) {
    throw new Error('Post message action requires a channel');
  }

  // Find channel
  const targetChannel = await prisma.channel.findFirst({
    where: {
      OR: [
        { id: targetChannelId },
        { slug: targetChannelId },
      ],
    },
  });

  if (!targetChannel) {
    throw new Error(`Channel not found: ${targetChannelId}`);
  }

  // Resolve message template
  const resolvedMessage = resolveTemplate(messageContent || '', input);
  if (!resolvedMessage.trim()) {
    throw new Error('Post message action requires a message');
  }

  // Create message as the agent
  const newMessage = await prisma.message.create({
    data: {
      channelId: targetChannel.id,
      authorId: context.agentId,
      content: `<p>${escapeHtml(resolvedMessage)}</p>`,
      type: 'text',
    },
    include: {
      author: {
        select: {
          id: true,
          username: true,
          displayName: true,
          avatar: true,
        },
      },
    },
  });

  return {
    output: {
      messageId: newMessage.id,
      channelId: targetChannel.id,
      content: resolvedMessage,
    },
  };
};

function resolveTemplate(template: string, data: any): string {
  return template.replace(/\{\{([^}]+)\}\}/g, (match, path) => {
    let cleanPath = path.trim();
    // Support both {{input.X}} and {{X}} syntax - "input." prefix is optional
    if (cleanPath.startsWith('input.')) {
      cleanPath = cleanPath.slice(6); // Remove "input." prefix
    }
    // Also support {{node.X.Y}} syntax by extracting just the last part
    if (cleanPath.startsWith('node.')) {
      const parts = cleanPath.split('.');
      cleanPath = parts[parts.length - 1]; // Get last part (e.g., "report" from "node.script-1.report")
    }
    const value = cleanPath.split('.').reduce((obj: any, key: string) => obj?.[key], data);
    if (value === undefined) return match;
    return typeof value === 'object' ? JSON.stringify(value) : String(value);
  });
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
    .replace(/\n/g, '<br>');
}
