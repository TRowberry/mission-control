/**
 * Simple in-memory rate limiter
 * 
 * Uses a sliding window approach. For production scaling,
 * replace with Redis-backed implementation.
 */

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const store = new Map<string, RateLimitEntry>();

// Cleanup stale entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (now > entry.resetAt) {
      store.delete(key);
    }
  }
}, 5 * 60 * 1000);

interface RateLimitOptions {
  /** Maximum number of requests in the window */
  max: number;
  /** Window size in milliseconds */
  windowMs: number;
}

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  retryAfterMs: number;
}

/**
 * Check rate limit for a given key (usually IP + route)
 */
export function checkRateLimit(key: string, options: RateLimitOptions): RateLimitResult {
  const now = Date.now();
  const entry = store.get(key);

  // No existing entry or window expired — allow and start fresh
  if (!entry || now > entry.resetAt) {
    store.set(key, {
      count: 1,
      resetAt: now + options.windowMs,
    });
    return {
      allowed: true,
      remaining: options.max - 1,
      resetAt: now + options.windowMs,
      retryAfterMs: 0,
    };
  }

  // Within window — check count
  if (entry.count < options.max) {
    entry.count++;
    return {
      allowed: true,
      remaining: options.max - entry.count,
      resetAt: entry.resetAt,
      retryAfterMs: 0,
    };
  }

  // Rate limited
  return {
    allowed: false,
    remaining: 0,
    resetAt: entry.resetAt,
    retryAfterMs: entry.resetAt - now,
  };
}

/**
 * Get client IP from request headers
 * Handles X-Forwarded-For from Caddy reverse proxy
 */
export function getClientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    // Take the first IP (client IP before proxies)
    return forwarded.split(',')[0].trim();
  }
  const realIp = request.headers.get('x-real-ip');
  if (realIp) {
    return realIp.trim();
  }
  return 'unknown';
}

// Preset configurations
export const RATE_LIMITS = {
  /** Auth endpoints: 5 attempts per 15 minutes per IP */
  auth: { max: 5, windowMs: 15 * 60 * 1000 },
  /** Registration: 3 attempts per hour per IP */
  register: { max: 3, windowMs: 60 * 60 * 1000 },
  /** General API: 100 requests per minute per IP */
  api: { max: 100, windowMs: 60 * 1000 },
} as const;
