/**
 * Date Formatting Utilities
 * 
 * Consolidates all date formatting to use date-fns consistently.
 * 
 * Usage:
 *   import { relativeTime, shortDate } from '@/lib/modules/utils/dates';
 *   
 *   relativeTime(message.createdAt)  // "5 minutes ago"
 *   shortDate(task.dueDate)          // "Mar 6, 2026"
 */

import {
  formatDistanceToNow,
  format,
  parseISO,
  isValid,
  differenceInMinutes,
  differenceInHours,
  differenceInDays,
} from 'date-fns';

type DateInput = Date | string | number;

/**
 * Safely parse date input to Date object
 */
function toDate(date: DateInput): Date {
  if (date instanceof Date) return date;
  if (typeof date === 'number') return new Date(date);
  // Try ISO parse first, fall back to Date constructor
  const parsed = parseISO(date);
  return isValid(parsed) ? parsed : new Date(date);
}

/**
 * Relative time (e.g., "5 minutes ago", "2 days ago")
 * Best for: timestamps, activity feeds
 */
export function relativeTime(date: DateInput): string {
  const d = toDate(date);
  if (!isValid(d)) return 'Invalid date';
  return formatDistanceToNow(d, { addSuffix: true });
}

/**
 * Compact relative time (e.g., "5m", "2h", "3d")
 * Best for: tight UI spaces, message timestamps
 */
export function compactRelativeTime(date: DateInput): string {
  const d = toDate(date);
  if (!isValid(d)) return '?';

  const now = new Date();
  const mins = differenceInMinutes(now, d);
  const hours = differenceInHours(now, d);
  const days = differenceInDays(now, d);

  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  if (hours < 24) return `${hours}h`;
  if (days < 7) return `${days}d`;
  return shortDate(d);
}

/**
 * Short date (e.g., "Mar 6, 2026")
 * Best for: due dates, list views
 */
export function shortDate(date: DateInput): string {
  const d = toDate(date);
  if (!isValid(d)) return 'Invalid date';
  return format(d, 'MMM d, yyyy');
}

/**
 * Full date (e.g., "March 6, 2026")
 * Best for: headers, formal displays
 */
export function fullDate(date: DateInput): string {
  const d = toDate(date);
  if (!isValid(d)) return 'Invalid date';
  return format(d, 'MMMM d, yyyy');
}

/**
 * Time only (e.g., "3:45 PM")
 * Best for: schedules, time displays
 */
export function time(date: DateInput): string {
  const d = toDate(date);
  if (!isValid(d)) return 'Invalid date';
  return format(d, 'h:mm a');
}

/**
 * Date and time (e.g., "Mar 6, 2026 3:45 PM")
 * Best for: detailed timestamps, logs
 */
export function dateTime(date: DateInput): string {
  const d = toDate(date);
  if (!isValid(d)) return 'Invalid date';
  return format(d, 'MMM d, yyyy h:mm a');
}

/**
 * ISO date string (e.g., "2026-03-06")
 * Best for: forms, data storage, comparisons
 */
export function isoDate(date: DateInput): string {
  const d = toDate(date);
  if (!isValid(d)) return '';
  return format(d, 'yyyy-MM-dd');
}

/**
 * Weekday (e.g., "Thursday")
 * Best for: calendars, schedules
 */
export function weekday(date: DateInput): string {
  const d = toDate(date);
  if (!isValid(d)) return 'Invalid date';
  return format(d, 'EEEE');
}

/**
 * Month and year (e.g., "March 2026")
 * Best for: calendar headers
 */
export function monthYear(date: DateInput): string {
  const d = toDate(date);
  if (!isValid(d)) return 'Invalid date';
  return format(d, 'MMMM yyyy');
}
