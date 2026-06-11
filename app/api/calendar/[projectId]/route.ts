import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';

// Priority mapping: MC priority → iCalendar PRIORITY (1=highest, 9=lowest)
const PRIORITY_MAP: Record<string, number> = {
  urgent: 1,
  high: 3,
  medium: 5,
  low: 9,
};

/** Format a Date object or ISO string as a bare iCal DATE: YYYYMMDD */
function icsDate(date: Date | string): string {
  const iso = date instanceof Date ? date.toISOString() : date;
  return iso.split('T')[0].replace(/-/g, '');
}

/** Add one day (for iCal exclusive DTEND) */
function nextDay(date: Date | string): string {
  const d = date instanceof Date
    ? new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1))
    : new Date(date.split('T')[0] + 'T00:00:00Z');
  if (!(date instanceof Date)) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().split('T')[0].replace(/-/g, '');
}

/** Current timestamp in iCal DTSTAMP format */
function nowStamp(): string {
  return new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
}

/** Escape special characters in iCal text fields */
function icsEscape(str: string): string {
  return str
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

// GET /api/calendar/[projectId]?token=CALENDAR_TOKEN
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const token = req.nextUrl.searchParams.get('token');

  if (!token) {
    return new NextResponse('Missing token', { status: 401 });
  }

  // Validate token → find user
  const user = await prisma.user.findUnique({
    where: { calendarToken: token },
    select: { id: true },
  });

  if (!user) {
    return new NextResponse('Invalid token', { status: 401 });
  }

  // Fetch project with tasks (only those with a dueDate)
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      id: true,
      name: true,
      visibility: true,
      createdById: true,
      workspaceId: true,
      columns: {
        select: {
          tasks: {
            where: {
              archived: false,
              dueDate: { not: null },
            },
            select: {
              id: true,
              title: true,
              description: true,
              priority: true,
              startDate: true,
              hasStartTime: true,
              dueDate: true,
              hasDueTime: true,
              completedAt: true,
            },
          },
        },
      },
    },
  }) as any;

  if (!project) {
    return new NextResponse('Project not found', { status: 404 });
  }

  // Basic visibility check for user
  if (project.visibility === 'private' && project.createdById !== user.id) {
    return new NextResponse('Access denied', { status: 403 });
  }
  if (project.visibility === 'invite') {
    const member = await (prisma as any).projectMember.findUnique({
      where: { projectId_userId: { projectId, userId: user.id } },
    });
    if (!member && project.createdById !== user.id) {
      return new NextResponse('Access denied', { status: 403 });
    }
  }

  // Collect all qualifying tasks
  const tasks = project.columns.flatMap((col: any) => col.tasks);

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://chatterbox.rowberry.com';
  const stamp = nowStamp();

  // Build VEVENT blocks
  const events = tasks.map((task: any) => {
    const status = task.completedAt ? 'COMPLETED' : 'CONFIRMED';
    const priority = PRIORITY_MAP[task.priority] ?? 5;
    const url = `${appUrl}/project/${projectId}?tab=kanban`;
    const description = [task.description, url].filter(Boolean).join('\\n\\n');

    let dtStartLine: string;
    let dtEndLine: string;

    if (task.hasDueTime) {
      // Timed event — use UTC datetime format (calendar apps convert to local)
      const startIso = task.startDate && task.hasStartTime
        ? new Date(task.startDate).toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z'
        : new Date(task.dueDate).toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
      const endIso = new Date(task.dueDate).toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
      dtStartLine = `DTSTART:${startIso}`;
      dtEndLine = `DTEND:${endIso}`;
    } else {
      // All-day event
      const dtStart = icsDate(task.startDate ?? task.dueDate);
      const dtEnd = nextDay(task.dueDate);
      dtStartLine = `DTSTART;VALUE=DATE:${dtStart}`;
      dtEndLine = `DTEND;VALUE=DATE:${dtEnd}`;
    }

    return [
      'BEGIN:VEVENT',
      `UID:mc-task-${task.id}@mission-control`,
      `DTSTAMP:${stamp}`,
      dtStartLine,
      dtEndLine,
      `SUMMARY:${icsEscape(task.title)}`,
      `DESCRIPTION:${icsEscape(description)}`,
      `URL:${url}`,
      `STATUS:${status}`,
      `PRIORITY:${priority}`,
      'END:VEVENT',
    ].join('\r\n');
  });

  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Mission Control//Project Calendar//EN',
    `X-WR-CALNAME:${icsEscape(project.name)}`,
    'X-WR-TIMEZONE:UTC',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    ...events,
    'END:VCALENDAR',
  ].join('\r\n');

  return new NextResponse(ics, {
    status: 200,
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
    },
  });
}
