import { headers } from 'next/headers';
import prisma from './db';
import crypto from 'crypto';

export interface AgentUser {
  id: string;
  username: string;
  displayName: string;
  avatar: string | null;
  isAgent: true;
  webhookUrl: string | null;
}

/**
 * Authenticate an agent via API key from X-API-Key header
 */
export async function getAgentFromApiKey(): Promise<AgentUser | null> {
  const headersList = await headers();
  const apiKey = headersList.get('x-api-key');

  console.log('[Agent Auth] API Key received:', apiKey ? `${apiKey.substring(0, 20)}...` : 'null');

  if (!apiKey) return null;

  const user = await prisma.user.findUnique({
    where: { apiKey },
    select: {
      id: true,
      username: true,
      displayName: true,
      avatar: true,
      isAgent: true,
      webhookUrl: true,
    },
  });

  console.log('[Agent Auth] User found:', user ? user.username : 'null');

  if (!user || !user.isAgent) return null;

  return user as AgentUser;
}

/**
 * Generate a secure API key
 */
export function generateApiKey(): string {
  // Format: mc_agent_<32 random hex chars>
  return `mc_agent_${crypto.randomBytes(16).toString('hex')}`;
}

/**
 * Require agent authentication - throws if not authenticated
 */
export async function requireAgent(): Promise<AgentUser> {
  const agent = await getAgentFromApiKey();
  if (!agent) {
    throw new Error('Invalid or missing API key');
  }
  return agent;
}
