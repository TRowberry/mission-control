'use client';

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { ChevronLeft, ChevronRight, Calendar, BarChart3, Clock, CheckCircle2, Link2, Copy, Check, RefreshCw, X } from 'lucide-react';
import { useMobile } from '@/components/layout/MobileContext';

// ─── Types ───────────────────────────────────────────────────────────────────

interface Assignee {
  displayName: string;
  avatar: string;
}

interface Task {
  id: string;
  title: string;
  priority: 'urgent' | 'high' | 'medium' | 'low' | 'none' | string;
  dueDate: string | null;
  hasDueTime?: boolean;
  startDate: string | null;
  hasStartTime?: boolean;
  assignee: Assignee | null;
  completedAt: string | null;
  createdAt?: string | null;
}

interface Column {
  id: string;
  name: string;
  tasks: Task[];
}

interface ProjectData {
  columns: Column[];
}

interface ProjectCalendarProps {
  projectId: string;
  onTaskClick?: (taskId: string) => void;
}

// ─── Constants ───────────────────────────────────────────────────────────────

type ViewMode = 'calendar' | 'gantt';

const PRIORITY_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  urgent: { bg: 'bg-red-500/20', border: 'border-red-500', text: 'text-red-400' },
  high:   { bg: 'bg-orange-500/20', border: 'border-orange-500', text: 'text-orange-400' },
  medium: { bg: 'bg-yellow-500/20', border: 'border-yellow-500', text: 'text-yellow-400' },
  low:    { bg: 'bg-blue-500/20', border: 'border-blue-500', text: 'text-blue-400' },
  none:   { bg: 'bg-gray-500/20', border: 'border-gray-500', text: 'text-gray-400' },
};

const PRIORITY_BAR_COLORS: Record<string, string> = {
  urgent: 'bg-red-500',
  high:   'bg-orange-500',
  medium: 'bg-yellow-500',
  low:    'bg-blue-500',
  none:   'bg-gray-500',
};

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function diffDays(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

/** Parse an ISO date string as a LOCAL midnight Date (avoids UTC→local day shift) */
function parseDateStr(dateStr: string): Date {
  const [year, month, day] = dateStr.split('T')[0].split('-').map(Number);
  return new Date(year, month - 1, day);
}

function startOfWeek(d: Date): Date {
  const r = new Date(d);
  r.setDate(r.getDate() - r.getDay());
  return startOfDay(r);
}

function getPriorityStyle(p: string) {
  return PRIORITY_COLORS[p] || PRIORITY_COLORS.none;
}

function getPriorityBar(p: string) {
  return PRIORITY_BAR_COLORS[p] || PRIORITY_BAR_COLORS.none;
}

// ─── Calendar helpers ────────────────────────────────────────────────────────

function getCalendarWeeks(year: number, month: number): Date[][] {
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  const start = addDays(first, -first.getDay());
  const weeks: Date[][] = [];
  let cur = start;
  while (cur <= last || cur.getDay() !== 0) {
    const week: Date[] = [];
    for (let i = 0; i < 7; i++) {
      week.push(new Date(cur));
      cur = addDays(cur, 1);
    }
    weeks.push(week);
    if (cur > last && cur.getDay() === 0) break;
  }
  return weeks;
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function ProjectCalendar({ projectId, onTaskClick }: ProjectCalendarProps) {
  const { isMobile } = useMobile();
  const [view, setView] = useState<ViewMode>('calendar');
  const [data, setData] = useState<ProjectData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Calendar state
  const today = useMemo(() => startOfDay(new Date()), []);
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());

  // Sync panel state
  const [showSync, setShowSync] = useState(false);
  const [calendarToken, setCalendarToken] = useState<string | null>(null);
  const [syncLoading, setSyncLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [regenerating, setRegenerating] = useState(false);

  // Fetch data
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/kanban/projects?id=${projectId}`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d: ProjectData) => {
        if (!cancelled) setData(d);
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [projectId]);

  // All tasks flat
  const allTasks = useMemo(() => {
    if (!data) return [];
    return data.columns.flatMap((c) => c.tasks);
  }, [data]);

  // Navigation
  const goMonth = useCallback((delta: number) => {
    setViewMonth((m) => {
      let nm = m + delta;
      if (nm < 0) { setViewYear((y) => y - 1); nm = 11; }
      if (nm > 11) { setViewYear((y) => y + 1); nm = 0; }
      return nm;
    });
  }, []);

  const goToday = useCallback(() => {
    setViewYear(today.getFullYear());
    setViewMonth(today.getMonth());
  }, [today]);

  // ─── Sync helpers ────────────────────────────────────────────────────────

  async function openSync() {
    setShowSync(true);
    if (calendarToken) return;
    setSyncLoading(true);
    try {
      const res = await fetch('/api/users/calendar-token');
      if (res.ok) {
        const data = await res.json();
        setCalendarToken(data.calendarToken);
      }
    } finally {
      setSyncLoading(false);
    }
  }

  async function regenerateToken() {
    setRegenerating(true);
    try {
      const res = await fetch('/api/users/calendar-token', { method: 'DELETE' });
      if (res.ok) {
        const data = await res.json();
        setCalendarToken(data.calendarToken);
        setCopied(false);
      }
    } finally {
      setRegenerating(false);
    }
  }

  function getFeedUrl(token: string) {
    const host = window.location.host;
    return `webcal://${host}/api/calendar/${projectId}?token=${token}`;
  }

  async function copyUrl() {
    if (!calendarToken) return;
    await navigator.clipboard.writeText(getFeedUrl(calendarToken));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function addToGoogle() {
    if (!calendarToken) return;
    const url = getFeedUrl(calendarToken);
    window.open(`https://calendar.google.com/calendar/r?cid=${encodeURIComponent(url)}`, '_blank');
  }

  function addToApple() {
    if (!calendarToken) return;
    window.location.href = getFeedUrl(calendarToken);
  }

  // ─── Render ──────────────────────────────────────────────────────────────

  // Mobile: show compact task list instead of calendar/gantt
  if (isMobile) {
    const sortedTasks = [...allTasks].sort((a, b) => {
      const aDate = a.dueDate ? parseDateStr(a.dueDate).getTime() : Infinity;
      const bDate = b.dueDate ? parseDateStr(b.dueDate).getTime() : Infinity;
      return aDate - bDate;
    });
    const todayStr = dateKey(today);
    return (
      <div className="flex flex-col h-full bg-gray-800 text-gray-100">
        <div className="px-4 py-3 border-b border-gray-700">
          <p className="text-xs text-gray-400">Calendar &amp; Gantt views are available on desktop. Showing task timeline below.</p>
        </div>
        <div className="flex-1 overflow-y-auto divide-y divide-gray-700/50">
          {sortedTasks.length === 0 && (
            <div className="p-6 text-center text-gray-400 text-sm">No tasks with dates</div>
          )}
          {sortedTasks.map(task => {
            const dueKey = task.dueDate ? dateKey(parseDateStr(task.dueDate)) : null;
            const isOverdue = dueKey && dueKey < todayStr && !task.completedAt;
            const isDueToday = dueKey === todayStr;
            return (
              <button
                key={task.id}
                onClick={() => onTaskClick?.(task.id)}
                className="w-full text-left px-4 py-3 min-h-[56px] hover:bg-gray-700/40 active:bg-gray-700/60 transition-colors flex items-center gap-3"
              >
                {task.completedAt ? (
                  <CheckCircle2 className="w-4 h-4 text-green-400 flex-shrink-0" />
                ) : (
                  <Clock className={`w-4 h-4 flex-shrink-0 ${isOverdue ? 'text-red-400' : isDueToday ? 'text-yellow-400' : 'text-gray-500'}`} />
                )}
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium truncate ${task.completedAt ? 'line-through text-gray-500' : 'text-white'}`}>{task.title}</p>
                  {dueKey && (
                    <p className={`text-xs mt-0.5 ${isOverdue ? 'text-red-400' : isDueToday ? 'text-yellow-400' : 'text-gray-400'}`}>
                      {isOverdue ? 'Overdue · ' : isDueToday ? 'Due today · ' : ''}{task.dueDate ? task.dueDate.split('T')[0] : ''}
                    </p>
                  )}
                  {!dueKey && <p className="text-xs text-gray-500 mt-0.5">No due date</p>}
                </div>
                {task.priority && task.priority !== 'none' && (
                  <span className={`text-xs px-1.5 py-0.5 rounded flex-shrink-0 ${PRIORITY_COLORS[task.priority]?.bg ?? ''} ${PRIORITY_COLORS[task.priority]?.text ?? ''}`}>
                    {task.priority}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="animate-spin h-6 w-6 border-2 border-gray-400 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 text-red-400 text-sm">
        Failed to load calendar data: {error}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-gray-800 dark:bg-gray-800 text-gray-100 dark:text-gray-100">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setView('calendar')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-sm font-medium transition-colors ${
              view === 'calendar'
                ? 'bg-gray-600 text-white'
                : 'text-gray-400 hover:text-gray-200 hover:bg-gray-700'
            }`}
          >
            <Calendar size={15} />
            Calendar
          </button>
          <button
            onClick={() => setView('gantt')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-sm font-medium transition-colors ${
              view === 'gantt'
                ? 'bg-gray-600 text-white'
                : 'text-gray-400 hover:text-gray-200 hover:bg-gray-700'
            }`}
          >
            <BarChart3 size={15} />
            Gantt
          </button>

          {/* Sync button */}
          <button
            onClick={openSync}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-sm font-medium transition-colors ${
              showSync
                ? 'bg-blue-600 text-white'
                : 'text-gray-400 hover:text-gray-200 hover:bg-gray-700'
            }`}
            title="Sync to external calendar"
          >
            <Link2 size={15} />
            Sync
          </button>
        </div>

        {view === 'calendar' && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => goMonth(-1)}
              className="p-1.5 min-h-[44px] min-w-[44px] flex items-center justify-center rounded hover:bg-gray-700 text-gray-400 hover:text-gray-200 transition-colors"
            >
              <ChevronLeft size={18} />
            </button>
            <span className="text-sm font-medium min-w-[140px] text-center">
              {MONTH_NAMES[viewMonth]} {viewYear}
            </span>
            <button
              onClick={() => goMonth(1)}
              className="p-1.5 min-h-[44px] min-w-[44px] flex items-center justify-center rounded hover:bg-gray-700 text-gray-400 hover:text-gray-200 transition-colors"
            >
              <ChevronRight size={18} />
            </button>
            <button
              onClick={goToday}
              className="ml-2 px-2.5 py-1 rounded text-xs font-medium bg-gray-700 hover:bg-gray-600 text-gray-300 hover:text-white transition-colors"
            >
              Today
            </button>
          </div>
        )}
      </div>

      {/* ── Sync Panel ─────────────────────────────────────────────────── */}
      {showSync && (
        <div className="border-b border-gray-700 bg-gray-900 px-4 py-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-100">Subscribe to Calendar Feed</h3>
            <button onClick={() => setShowSync(false)} className="p-1 hover:bg-gray-700 rounded text-gray-400">
              <X size={14} />
            </button>
          </div>

          {syncLoading ? (
            <p className="text-sm text-gray-400">Generating feed URL…</p>
          ) : calendarToken ? (
            <>
              <p className="text-xs text-gray-400 mb-3">
                Add this URL as a subscribed calendar. Tasks with due dates will appear as events and stay in sync automatically.
              </p>

              {/* URL display */}
              <div className="flex items-center gap-2 mb-4">
                <code className="flex-1 bg-gray-800 rounded px-3 py-2 text-xs text-gray-300 truncate select-all">
                  {getFeedUrl(calendarToken)}
                </code>
                <button
                  onClick={copyUrl}
                  className="flex items-center gap-1.5 px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded text-xs text-gray-200 transition-colors flex-shrink-0"
                >
                  {copied ? <Check size={13} className="text-green-400" /> : <Copy size={13} />}
                  {copied ? 'Copied!' : 'Copy'}
                </button>
              </div>

              {/* Calendar app buttons */}
              <div className="flex flex-wrap gap-2 mb-4">
                <button
                  onClick={addToGoogle}
                  className="flex items-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-500 rounded text-sm text-white transition-colors"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M20 3H4v1.5l8 4.5 8-4.5V3zM4 21h16V8.5l-8 4.5-8-4.5V21z"/>
                  </svg>
                  Add to Google Calendar
                </button>
                <button
                  onClick={addToApple}
                  className="flex items-center gap-2 px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded text-sm text-gray-200 transition-colors"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
                  </svg>
                  Add to Apple Calendar
                </button>
              </div>

              <p className="text-xs text-gray-500">
                Calendar apps refresh subscribed feeds every few hours.{' '}
                <button
                  onClick={regenerateToken}
                  disabled={regenerating}
                  className="text-gray-400 hover:text-gray-200 underline inline-flex items-center gap-1"
                >
                  {regenerating ? <RefreshCw size={10} className="animate-spin" /> : null}
                  Regenerate link
                </button>
                {' '}to invalidate this URL and get a new one.
              </p>
            </>
          ) : (
            <p className="text-sm text-red-400">Failed to generate calendar token. Please try again.</p>
          )}
        </div>
      )}

      {/* ── Content ────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-auto">
        {view === 'calendar' ? (
          <CalendarView
            allTasks={allTasks}
            year={viewYear}
            month={viewMonth}
            today={today}
            onTaskClick={onTaskClick}
          />
        ) : (
          <GanttView columns={data?.columns ?? []} today={today} onTaskClick={onTaskClick} />
        )}
      </div>
    </div>
  );
}

// ─── Calendar View ───────────────────────────────────────────────────────────

function CalendarView({
  allTasks,
  year,
  month,
  today,
  onTaskClick,
}: {
  allTasks: Task[];
  year: number;
  month: number;
  today: Date;
  onTaskClick?: (taskId: string) => void;
}) {
  const weeks = useMemo(() => getCalendarWeeks(year, month), [year, month]);

  // Build date → tasks map
  const tasksByDate = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const t of allTasks) {
      if (!t.dueDate) continue;
      // Time-aware: use local Date (UTC→local); date-only: parse without TZ shift
      const d = t.hasDueTime ? new Date(t.dueDate) : parseDateStr(t.dueDate);
      const key = dateKey(d);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(t);
    }
    return map;
  }, [allTasks]);

  const noDateTasks = useMemo(
    () => allTasks.filter((t) => !t.dueDate),
    [allTasks]
  );

  const todayKey = dateKey(today);

  return (
    <div className="flex flex-col">
      {/* Day headers */}
      <div className="grid grid-cols-7 border-b border-gray-700">
        {DAY_NAMES.map((d) => (
          <div
            key={d}
            className="px-2 py-2 text-xs font-medium text-gray-400 text-center"
          >
            {d}
          </div>
        ))}
      </div>

      {/* Weeks */}
      {weeks.map((week, wi) => (
        <div key={wi} className="grid grid-cols-7 border-b border-gray-700/50">
          {week.map((day) => {
            const key = dateKey(day);
            const isCurrentMonth = day.getMonth() === month;
            const isToday = key === todayKey;
            const tasks = tasksByDate.get(key) ?? [];

            return (
              <div
                key={key}
                className={`min-h-[90px] p-1.5 border-r border-gray-700/30 last:border-r-0 ${
                  isCurrentMonth ? '' : 'opacity-40'
                } ${isToday ? 'bg-gray-700/30' : ''}`}
              >
                <div
                  className={`text-xs mb-1 ${
                    isToday
                      ? 'inline-flex items-center justify-center w-5 h-5 rounded-full bg-blue-500 text-white font-bold'
                      : 'text-gray-400'
                  }`}
                >
                  {day.getDate()}
                </div>
                <div className="flex flex-col gap-0.5">
                  {tasks.slice(0, 3).map((t) => {
                    const style = getPriorityStyle(t.priority);
                    return (
                      <div
                        key={t.id}
                        title={t.title}
                        onClick={() => onTaskClick?.(t.id)}
                        className={`truncate text-[10px] px-1.5 py-0.5 rounded border-l-2 ${onTaskClick ? 'cursor-pointer hover:brightness-125' : 'cursor-default'} ${style.bg} ${style.border} ${style.text}`}
                      >
                        {t.hasDueTime && t.dueDate ? (
                          <span className="font-medium mr-1">
                            {new Date(t.dueDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        ) : null}
                        {t.title}
                      </div>
                    );
                  })}
                  {tasks.length > 3 && (
                    <div className="text-[10px] text-gray-500 px-1">
                      +{tasks.length - 3} more
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ))}

      {/* No due date section */}
      {noDateTasks.length > 0 && (
        <div className="border-t border-gray-700 px-4 py-3">
          <div className="text-xs font-medium text-gray-400 mb-2">
            No due date ({noDateTasks.length})
          </div>
          <div className="flex flex-wrap gap-1.5">
            {noDateTasks.map((t) => {
              const style = getPriorityStyle(t.priority);
              return (
                <div
                  key={t.id}
                  title={t.title}
                  onClick={() => onTaskClick?.(t.id)}
                  className={`text-[11px] px-2 py-0.5 rounded border-l-2 ${onTaskClick ? 'cursor-pointer hover:brightness-125' : 'cursor-default'} ${style.bg} ${style.border} ${style.text}`}
                >
                  {t.title}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Gantt View ──────────────────────────────────────────────────────────────

const GANTT_DAY_WIDTH = 28; // px per day
const GANTT_LABEL_WIDTH = 220; // px for task label column

function GanttView({
  columns,
  today,
  onTaskClick,
}: {
  columns: Column[];
  today: Date;
  onTaskClick?: (taskId: string) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Compute timeline range
  const { timelineStart, totalDays, weeks } = useMemo(() => {
    const allDates: Date[] = [today];

    for (const col of columns) {
      for (const t of col.tasks) {
        if (t.startDate) allDates.push(parseDateStr(t.startDate));
        if (t.dueDate) allDates.push(parseDateStr(t.dueDate));
        if (t.createdAt) allDates.push(parseDateStr(t.createdAt));
      }
    }

    let minDate = allDates.reduce((a, b) => (a < b ? a : b), allDates[0]);
    let maxDate = allDates.reduce((a, b) => (a > b ? a : b), allDates[0]);

    // Pad by 2 weeks on each side
    minDate = startOfWeek(addDays(minDate, -14));
    maxDate = addDays(maxDate, 21);

    const total = diffDays(minDate, maxDate);
    const wks: Date[] = [];
    let cur = new Date(minDate);
    while (cur < maxDate) {
      wks.push(new Date(cur));
      cur = addDays(cur, 7);
    }

    return { timelineStart: minDate, totalDays: total, weeks: wks };
  }, [columns, today]);

  // Auto-scroll to current week on mount
  useEffect(() => {
    if (!scrollRef.current) return;
    const offset = diffDays(timelineStart, today) * GANTT_DAY_WIDTH - 200;
    scrollRef.current.scrollLeft = Math.max(0, offset);
  }, [timelineStart, today]);

  const todayOffset = diffDays(timelineStart, today) * GANTT_DAY_WIDTH;

  return (
    <div className="flex flex-col h-full">
      <div ref={scrollRef} className="flex-1 overflow-auto relative">
        <div
          style={{ width: GANTT_LABEL_WIDTH + totalDays * GANTT_DAY_WIDTH }}
          className="min-h-full"
        >
          {/* Week header */}
          <div
            className="sticky top-0 z-20 flex border-b border-gray-700 bg-gray-800"
            style={{ height: 36 }}
          >
            <div
              className="shrink-0 border-r border-gray-700 bg-gray-800 sticky left-0 z-30"
              style={{ width: GANTT_LABEL_WIDTH }}
            />
            <div className="relative flex-1">
              {weeks.map((ws, i) => {
                const left = diffDays(timelineStart, ws) * GANTT_DAY_WIDTH;
                return (
                  <div
                    key={i}
                    className="absolute top-0 h-full border-l border-gray-700/50 flex items-center px-2"
                    style={{ left, width: 7 * GANTT_DAY_WIDTH }}
                  >
                    <span className="text-[10px] text-gray-400 whitespace-nowrap">
                      {MONTH_NAMES[ws.getMonth()].slice(0, 3)} {ws.getDate()}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Columns / task rows */}
          {columns.map((col) => (
            <div key={col.id}>
              {/* Section header */}
              <div
                className="sticky left-0 z-10 flex items-center px-3 py-1.5 bg-gray-750 border-b border-gray-700/50"
                style={{ background: 'rgba(55, 65, 81, 0.7)' }}
              >
                <span className="text-xs font-semibold text-gray-300 uppercase tracking-wide">
                  {col.name}
                </span>
                <span className="ml-2 text-[10px] text-gray-500">
                  {col.tasks.length}
                </span>
              </div>

              {col.tasks.length === 0 && (
                <div className="flex h-8 items-center">
                  <div
                    className="shrink-0 px-3 text-xs text-gray-500 italic sticky left-0 bg-gray-800"
                    style={{ width: GANTT_LABEL_WIDTH }}
                  >
                    No tasks
                  </div>
                </div>
              )}

              {col.tasks.map((task) => (
                <GanttRow
                  key={task.id}
                  task={task}
                  timelineStart={timelineStart}
                  totalDays={totalDays}
                  onTaskClick={onTaskClick}
                />
              ))}
            </div>
          ))}

          {/* Today line */}
          <div
            className="absolute top-0 bottom-0 w-px bg-blue-500/60 z-10 pointer-events-none"
            style={{ left: GANTT_LABEL_WIDTH + todayOffset }}
          />
          <div
            className="absolute top-0 z-20 pointer-events-none"
            style={{ left: GANTT_LABEL_WIDTH + todayOffset - 12 }}
          >
            <div className="text-[9px] text-blue-400 font-medium bg-gray-800 px-1 rounded">
              Today
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Gantt Row ───────────────────────────────────────────────────────────────

function GanttRow({
  task,
  timelineStart,
  totalDays,
  onTaskClick,
}: {
  task: Task;
  timelineStart: Date;
  totalDays: number;
  onTaskClick?: (taskId: string) => void;
}) {
  const barColor = getPriorityBar(task.priority);

  const start = task.startDate
    ? parseDateStr(task.startDate)
    : task.createdAt
      ? parseDateStr(task.createdAt)
      : null;

  const end = task.dueDate ? parseDateStr(task.dueDate) : null;

  let barLeft = 0;
  let barWidth = 0;
  let isDot = false;
  let fadeRight = false;

  if (start && end) {
    barLeft = diffDays(timelineStart, start) * GANTT_DAY_WIDTH;
    barWidth = Math.max(diffDays(start, end) * GANTT_DAY_WIDTH, GANTT_DAY_WIDTH);
  } else if (!start && end) {
    // No start → dot on due date
    barLeft = diffDays(timelineStart, end) * GANTT_DAY_WIDTH;
    barWidth = GANTT_DAY_WIDTH;
    isDot = true;
  } else if (start && !end) {
    // No end → open-ended bar
    barLeft = diffDays(timelineStart, start) * GANTT_DAY_WIDTH;
    barWidth = Math.min(
      (totalDays - diffDays(timelineStart, start)) * GANTT_DAY_WIDTH,
      21 * GANTT_DAY_WIDTH
    );
    fadeRight = true;
  } else {
    // Neither start nor end — show nothing
    barLeft = 0;
    barWidth = 0;
  }

  return (
    <div className="flex items-center h-8 border-b border-gray-700/30 group hover:bg-gray-700/20">
      {/* Label */}
      <div
        className="shrink-0 flex items-center gap-2 px-3 border-r border-gray-700/30 sticky left-0 z-10 bg-gray-800 group-hover:bg-gray-750"
        style={{ width: GANTT_LABEL_WIDTH, background: 'inherit' }}
      >
        {task.assignee?.avatar && (
          <img
            src={task.assignee.avatar}
            alt=""
            className="w-4 h-4 rounded-full shrink-0"
          />
        )}
        <span
          className={`text-xs text-gray-300 truncate ${onTaskClick ? 'cursor-pointer hover:text-white' : ''}`}
          title={task.title}
          onClick={() => onTaskClick?.(task.id)}
        >
          {task.title}
        </span>
      </div>

      {/* Bar area */}
      <div className="relative flex-1 h-full">
        {barWidth > 0 && (
          <div
            className={`absolute top-1.5 h-5 rounded ${
              isDot ? 'rounded-full' : 'rounded-sm'
            } ${barColor} ${fadeRight ? 'gantt-fade-right' : ''}`}
            style={{
              left: barLeft,
              width: isDot ? 10 : barWidth,
              ...(onTaskClick ? { cursor: 'pointer' } : {}),
              ...(fadeRight
                ? {
                    maskImage: 'linear-gradient(to right, black 60%, transparent 100%)',
                    WebkitMaskImage: 'linear-gradient(to right, black 60%, transparent 100%)',
                  }
                : {}),
            }}
            title={`${task.title}${task.startDate ? `\nStart: ${task.startDate}` : ''}${task.dueDate ? `\nDue: ${task.dueDate}` : ''}`}
            onClick={() => onTaskClick?.(task.id)}
          >
            {!isDot && barWidth > 60 && (
              <span className="absolute inset-0 flex items-center px-1.5 text-[9px] text-white/80 font-medium truncate">
                {task.title}
              </span>
            )}
          </div>
        )}

        {/* Completed checkmark */}
        {task.completedAt && barWidth > 0 && (
          <div
            className="absolute top-1 text-green-400 text-[10px]"
            style={{ left: barLeft + barWidth + 4 }}
          >
            ✓
          </div>
        )}
      </div>
    </div>
  );
}
