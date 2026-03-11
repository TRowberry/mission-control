/**
 * Standardized API Response Helpers
 * 
 * Usage:
 *   import { ok, created, unauthorized } from '@/lib/modules/api/response';
 *   return ok(data);
 *   return unauthorized();
 */

import { NextResponse } from 'next/server';

// ============ Success Responses ============

/**
 * 200 OK - Return data successfully
 */
export function ok<T>(data: T) {
  return NextResponse.json(data, { status: 200 });
}

/**
 * 201 Created - Resource created successfully
 */
export function created<T>(data: T) {
  return NextResponse.json(data, { status: 201 });
}

/**
 * 204 No Content - Success with no response body
 */
export function noContent() {
  return new NextResponse(null, { status: 204 });
}

// ============ Client Error Responses ============

/**
 * 400 Bad Request - Invalid input
 */
export function badRequest(message: string, details?: Record<string, string>) {
  return NextResponse.json(
    { error: message, ...(details && { details }) },
    { status: 400 }
  );
}

/**
 * 401 Unauthorized - Not authenticated
 */
export function unauthorized(message = 'Unauthorized') {
  return NextResponse.json({ error: message }, { status: 401 });
}

/**
 * 403 Forbidden - Authenticated but not allowed
 */
export function forbidden(message = 'Forbidden') {
  return NextResponse.json({ error: message }, { status: 403 });
}

/**
 * 404 Not Found - Resource doesn't exist
 */
export function notFound(message = 'Not found') {
  return NextResponse.json({ error: message }, { status: 404 });
}

/**
 * 409 Conflict - Resource conflict (e.g., duplicate)
 */
export function conflict(message: string) {
  return NextResponse.json({ error: message }, { status: 409 });
}

/**
 * 422 Unprocessable Entity - Validation failed
 */
export function validationError(errors: Record<string, string>) {
  return NextResponse.json(
    { error: 'Validation failed', details: errors },
    { status: 422 }
  );
}

// ============ Server Error Responses ============

/**
 * 500 Internal Server Error - Something went wrong
 * Logs the error to console automatically
 */
export function serverError(message: string, error?: unknown) {
  if (error) {
    console.error(`[API Error] ${message}:`, error);
  }
  return NextResponse.json({ error: message }, { status: 500 });
}
