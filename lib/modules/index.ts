/**
 * Mission Control Modules
 * 
 * Reusable modules for common patterns.
 * Check here before writing new code!
 * 
 * API (server-side):
 *   import { withAuth, ok, unauthorized } from '@/lib/modules/api';
 * 
 * Client (frontend):
 *   import { api } from '@/lib/modules/client/api';
 * 
 * Utils:
 *   import { relativeTime, shortDate } from '@/lib/modules/utils/dates';
 */

// Re-export for convenience
export * from './api';
export { api } from './client/api';
export * from './utils/dates';
