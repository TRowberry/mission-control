/**
 * API Route Middleware (Wrappers)
 * 
 * Usage:
 *   import { withAuth, withAuthParams } from '@/lib/modules/api/middleware';
 *   
 *   // Static routes (no params)
 *   export const GET = withAuth(async (req, user) => {
 *     return ok(data);
 *   });
 *   
 *   // Dynamic routes with params - use withAuthParams
 *   export const GET = withAuthParams(async (req, user, params) => {
 *     const { id } = await params;
 *     return ok(data);
 *   });
 */

import { NextRequest } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getAgentFromApiKey } from '@/lib/agent-auth';
import { unauthorized, serverError } from './response';

// Type for authenticated user
export interface AuthUser {
  id: string;
  email: string;
  username: string;
  displayName: string | null;
  avatar: string | null;
  status: string | null;
}

// Type for authenticated agent
export interface AuthAgent {
  id: string;
  username: string;
  displayName: string | null;
  isAgent: true;
}

// Union type for either auth method
export type AuthActor = AuthUser | (AuthAgent & { email?: never });

/**
 * Wrapper for static routes requiring user authentication (cookie-based)
 */
export function withAuth(
  handler: (req: NextRequest, user: AuthUser) => Promise<Response>
) {
  return async (req: NextRequest): Promise<Response> => {
    try {
      const user = await getCurrentUser();
      if (!user) {
        return unauthorized();
      }
      return await handler(req, user as AuthUser);
    } catch (error) {
      return serverError('Request failed', error);
    }
  };
}

/**
 * Wrapper for dynamic routes (with params) requiring user authentication
 */
export function withAuthParams(
  handler: (req: NextRequest, user: AuthUser, params: Promise<Record<string, string>>) => Promise<Response>
) {
  return async (req: NextRequest, { params }: { params: Promise<Record<string, string>> }): Promise<Response> => {
    try {
      const user = await getCurrentUser();
      if (!user) {
        return unauthorized();
      }
      return await handler(req, user as AuthUser, params);
    } catch (error) {
      return serverError('Request failed', error);
    }
  };
}

/**
 * Wrapper for routes requiring agent authentication (X-API-Key header)
 */
export function withAgent(
  handler: (req: NextRequest, agent: AuthAgent) => Promise<Response>
) {
  return async (req: NextRequest): Promise<Response> => {
    try {
      const agent = await getAgentFromApiKey();
      if (!agent) {
        return unauthorized('Invalid API key');
      }
      return await handler(req, agent as AuthAgent);
    } catch (error) {
      return serverError('Request failed', error);
    }
  };
}

/**
 * Wrapper for dynamic routes requiring agent authentication
 */
export function withAgentParams(
  handler: (req: NextRequest, agent: AuthAgent, params: Promise<Record<string, string>>) => Promise<Response>
) {
  return async (req: NextRequest, { params }: { params: Promise<Record<string, string>> }): Promise<Response> => {
    try {
      const agent = await getAgentFromApiKey();
      if (!agent) {
        return unauthorized('Invalid API key');
      }
      return await handler(req, agent as AuthAgent, params);
    } catch (error) {
      return serverError('Request failed', error);
    }
  };
}

/**
 * Wrapper accepting either user OR agent authentication
 * Useful for routes that both humans and bots can access
 */
export function withAnyAuth(
  handler: (req: NextRequest, actor: AuthActor) => Promise<Response>
) {
  return async (req: NextRequest): Promise<Response> => {
    try {
      // Try agent auth first (API key header takes precedence)
      const agent = await getAgentFromApiKey();
      if (agent) {
        return await handler(req, agent as AuthAgent);
      }

      // Fall back to user auth (cookie)
      const user = await getCurrentUser();
      if (user) {
        return await handler(req, user as AuthUser);
      }

      return unauthorized();
    } catch (error) {
      return serverError('Request failed', error);
    }
  };
}

/**
 * Wrapper for dynamic routes accepting either user OR agent authentication
 */
export function withAnyAuthParams(
  handler: (req: NextRequest, actor: AuthActor, params: Promise<Record<string, string>>) => Promise<Response>
) {
  return async (req: NextRequest, { params }: { params: Promise<Record<string, string>> }): Promise<Response> => {
    try {
      // Try agent auth first (API key header takes precedence)
      const agent = await getAgentFromApiKey();
      if (agent) {
        return await handler(req, agent as AuthAgent, params);
      }

      // Fall back to user auth (cookie)
      const user = await getCurrentUser();
      if (user) {
        return await handler(req, user as AuthUser, params);
      }

      return unauthorized();
    } catch (error) {
      return serverError('Request failed', error);
    }
  };
}

/**
 * Wrapper for public routes that still want error handling
 * No auth required, but catches errors gracefully
 */
export function withErrorHandling(
  handler: (req: NextRequest) => Promise<Response>
) {
  return async (req: NextRequest): Promise<Response> => {
    try {
      return await handler(req);
    } catch (error) {
      return serverError('Request failed', error);
    }
  };
}

/**
 * Helper to check if actor is an agent
 */
export function isAgent(actor: AuthActor): actor is AuthAgent {
  return 'isAgent' in actor && actor.isAgent === true;
}

/**
 * Helper to check if actor is a user
 */
export function isUser(actor: AuthActor): actor is AuthUser {
  return !isAgent(actor);
}
