import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';

// Priority mapping: MC priority → iCalendar PRIORITY (1=highest, 9=lowest)
const PRIORITY_MAP: Record<string, number> = {
  urgent: 1,
  high: 3,
  medium: 5,
  low: 9,
};

/** Format a date string (ISO or YYYY-MM-DD) as a bare iCal DATE: YYYYMMDD */
function icsDate(dateStr: string): string {
  return dateStr.split('T')[0].replace(/-/g, '');
}

/** Add one day to a YYYY-MM-DD string (for iCal exclusive DTEND) */
function nextDay(dateStr: string): string {
  const d = new Date(dateStr.split('T')[0] + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + 1);
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
  { params }: { params: { projectId: string } }
) {
  const { projectId } = params;
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
              dueDate: true,
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
    const dtStart = icsDate(task.startDate ?? task.dueDate);
    const dtEnd = nextDay(task.dueDate);
    const status = task.completedAt ? 'COMPLETED' : 'CONFIRMED';
    const priority = PRIORITY_MAP[task.priority] ?? 5;
    const url = `${appUrl}/project/${projectId}?tab=kanban`;
    const description = [task.description, url].filter(Boolean).join('\\n\\n');

    return [
      'BEGIN:VEVENT',
      `UID:mc-task-${task.id}@mission-control`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${dtStart}`,
      `DTEND;VALUE=DATE:${dtEnd}`,
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
