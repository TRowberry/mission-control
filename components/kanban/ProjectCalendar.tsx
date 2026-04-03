'use client';

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { ChevronLeft, ChevronRight, Calendar, BarChart3 } from 'lucide-react';

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
  startDate: string | null;
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
  const [view, setView] = useState<ViewMode>('calendar');
  const [data, setData] = useState<ProjectData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Calendar state
  const today = useMemo(() => startOfDay(new Date()), []);
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());

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

  // ─── Render ──────────────────────────────────────────────────────────────

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
        </div>

        {view === 'calendar' && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => goMonth(-1)}
              className="p-1.5 rounded hover:bg-gray-700 text-gray-400 hover:text-gray-200 transition-colors"
            >
              <ChevronLeft size={18} />
            </button>
            <span className="text-sm font-medium min-w-[140px] text-center">
              {MONTH_NAMES[viewMonth]} {viewYear}
            </span>
            <button
              onClick={() => goMonth(1)}
              className="p-1.5 rounded hover:bg-gray-700 text-gray-400 hover:text-gray-200 transition-colors"
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

      {/* ── Content ────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-auto">
        {view === 'calendar' ? (
          <CalendarView
            allTasks={allTasks}
            year={viewYear}
            month={viewMonth}
            today={today}
          />
        ) : (
          <GanttView columns={data?.columns ?? []} today={today} />
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
}: {
  allTasks: Task[];
  year: number;
  month: number;
  today: Date;
}) {
  const weeks = useMemo(() => getCalendarWeeks(year, month), [year, month]);

  // Build date → tasks map
  const tasksByDate = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const t of allTasks) {
      if (!t.dueDate) continue;
      const d = new Date(t.dueDate);
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
}: {
  columns: Column[];
  today: Date;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Compute timeline range
  const { timelineStart, totalDays, weeks } = useMemo(() => {
    const allDates: Date[] = [today];

    for (const col of columns) {
      for (const t of col.tasks) {
        if (t.startDate) allDates.push(new Date(t.startDate));
        if (t.dueDate) allDates.push(new Date(t.dueDate));
        if (t.createdAt) allDates.push(new Date(t.createdAt));
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
    ? startOfDay(new Date(task.startDate))
    : task.createdAt
      ? startOfDay(new Date(task.createdAt))
      : null;

  const end = task.dueDate ? startOfDay(new Date(task.dueDate)) : null;

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
