'use client';

import { useState, useEffect, useCallback } from 'react';
import { ChevronRight, ChevronDown, LayoutGrid, User } from 'lucide-react';
import Link from 'next/link';
import TaskPanel from '@/components/kanban/TaskPanel';

// ─── Types ───────────────────────────────────────────────────────────────────

interface Assignee { id: string; displayName: string; avatar: string | null; }
interface ChildTask {
  id: string; title: string; columnId: string; priority: string;
  dueDate: string | null; hasDueTime?: boolean; completedAt: string | null;
  assignee: Assignee | null;
  state: { id: string; name: string; color: string; group: string } | null;
  subtasks: any[];
}
interface MyTask {
  id: string; title: string; priority: string;
  columnId: string; completedAt: string | null;
  startDate: string | null; hasStartTime?: boolean;
  dueDate: string | null; hasDueTime?: boolean;
  description: string | null;
  tags: any[]; subtasks: any[]; children: ChildTask[];
  assignee: Assignee | null;
  state: { id: string; name: string; color: string; group: string } | null;
  column: { id: string; name: string; project: { id: string; name: string; color: string } };
}

type DueBucket = 'overdue' | 'today' | 'tomorrow' | 'this_week' | 'next_month' | 'later' | 'no_date';

const BUCKET_LABELS: Record<DueBucket, string> = {
  overdue: 'Overdue', today: 'Today', tomorrow: 'Tomorrow',
  this_week: 'This week', next_month: 'Next month', later: 'Later', no_date: 'No due date',
};
const BUCKET_ORDER: DueBucket[] = ['overdue', 'today', 'tomorrow', 'this_week', 'next_month', 'later', 'no_date'];

function getDueBucket(dueDate: string | null, completedAt: string | null): DueBucket {
  if (!dueDate) return 'no_date';
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const due = new Date(dueDate.split('T')[0] + 'T00:00:00');
  const diff = Math.round((due.getTime() - today.getTime()) / 86400000);
  if (diff < 0 && !completedAt) return 'overdue';
  if (diff === 0) return 'today';
  if (diff === 1) return 'tomorrow';
  if (diff <= 7) return 'this_week';
  if (diff <= 30) return 'next_month';
  return 'later';
}

function formatDate(d: string): string {
  const [y, m, day] = d.split('T')[0].split('-');
  return `${m}/${day}/${y}`;
}

const PRIORITY_COLORS: Record<string, string> = {
  urgent: '#EF4444', high: '#F97316', medium: '#F59E0B', low: '#3B82F6',
};

// ─── Row ─────────────────────────────────────────────────────────────────────

function TaskRow({
  task, rowNum, onOpen,
}: { task: MyTask; rowNum: number; onOpen: (task: MyTask) => void }) {
  const [expanded, setExpanded] = useState(false);
  const hasChildren = task.children.length > 0;
  const statusColor = task.state?.color ?? '#6B7280';
  const statusName = task.state?.name ?? task.column.name;
  const dueOverdue = task.dueDate && !task.completedAt && getDueBucket(task.dueDate, task.completedAt) === 'overdue';

  return (
    <>
      <tr className="border-b border-gray-700/40 hover:bg-gray-700/20 group">
        {/* Row # */}
        <td className="w-8 px-3 py-2.5 text-xs text-gray-600 text-right select-none">{rowNum}</td>

        {/* Name */}
        <td className="py-2.5 pr-4">
          <div className="flex items-center gap-1.5">
            {hasChildren ? (
              <button onClick={() => setExpanded(v => !v)} className="text-gray-500 hover:text-gray-300 flex-shrink-0">
                {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
              </button>
            ) : <span className="w-5 flex-shrink-0" />}

            <div
              className="w-2 h-2 rounded-full flex-shrink-0"
              style={{ backgroundColor: PRIORITY_COLORS[task.priority] ?? '#9CA3AF' }}
            />

            <button
              onClick={() => onOpen(task)}
              className={`text-sm text-left hover:text-blue-400 transition-colors truncate max-w-sm ${task.completedAt ? 'text-gray-500 line-through' : 'text-gray-200'}`}
            >
              {task.title}
            </button>

            {hasChildren && (
              <span className="text-[10px] text-gray-500 bg-gray-700 px-1.5 py-0.5 rounded-full flex-shrink-0">
                {task.children.filter(c => c.completedAt).length}/{task.children.length}
              </span>
            )}
          </div>
        </td>

        {/* Project */}
        <td className="py-2.5 px-3 w-32">
          <Link href={`/project/${task.column.project.id}?tab=table`} className="text-xs text-gray-400 hover:text-blue-400 truncate block max-w-[120px]">
            {task.column.project.name}
          </Link>
        </td>

        {/* Assignee */}
        <td className="py-2.5 px-3 w-20">
          {task.assignee ? (
            task.assignee.avatar
              ? <img src={task.assignee.avatar} alt="" className="w-6 h-6 rounded-full" />
              : <div className="w-6 h-6 rounded-full bg-blue-600 flex items-center justify-center text-[10px] text-white font-medium">{task.assignee.displayName.charAt(0).toUpperCase()}</div>
          ) : (
            <div className="w-6 h-6 rounded-full border-2 border-dashed border-gray-600 flex items-center justify-center">
              <User className="w-3 h-3 text-gray-500" />
            </div>
          )}
        </td>

        {/* Status */}
        <td className="py-2.5 px-3 w-28">
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
            style={{ backgroundColor: `${statusColor}25`, color: statusColor }}>
            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: statusColor }} />
            {statusName}
          </span>
        </td>

        {/* Start */}
        <td className="py-2.5 px-3 w-24 text-xs text-gray-400">
          {task.startDate ? formatDate(task.startDate) : <span className="text-gray-700">—</span>}
        </td>

        {/* Due */}
        <td className={`py-2.5 px-3 w-24 text-xs font-medium ${dueOverdue ? 'text-red-400' : 'text-gray-400'}`}>
          {task.dueDate ? formatDate(task.dueDate) : <span className="text-gray-700">—</span>}
        </td>
      </tr>

      {/* Child rows */}
      {expanded && task.children.map(child => (
        <tr key={child.id} className="border-b border-gray-700/30 hover:bg-gray-700/10">
          <td className="w-8 px-3 py-2 text-xs text-gray-700 text-right">↳</td>
          <td className="py-2 pr-4">
            <div className="flex items-center gap-1.5 pl-6">
              <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: PRIORITY_COLORS[child.priority] ?? '#9CA3AF' }} />
              <span className={`text-xs truncate ${child.completedAt ? 'text-gray-600 line-through' : 'text-gray-400'}`}>{child.title}</span>
            </div>
          </td>
          <td className="py-2 px-3" />
          <td className="py-2 px-3">
            {child.assignee?.avatar
              ? <img src={child.assignee.avatar} alt="" className="w-5 h-5 rounded-full" />
              : child.assignee
              ? <div className="w-5 h-5 rounded-full bg-gray-600 flex items-center justify-center text-[9px] text-white">{child.assignee.displayName.charAt(0)}</div>
              : null}
          </td>
          <td className="py-2 px-3">
            {child.state && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px]"
                style={{ backgroundColor: `${child.state.color}25`, color: child.state.color }}>
                {child.state.name}
              </span>
            )}
          </td>
          <td className="py-2 px-3" />
          <td className={`py-2 px-3 text-[10px] ${child.dueDate && !child.completedAt && getDueBucket(child.dueDate, child.completedAt) === 'overdue' ? 'text-red-400' : 'text-gray-500'}`}>
            {child.dueDate ? formatDate(child.dueDate) : ''}
          </td>
        </tr>
      ))}
    </>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function MyTasksTable({ workspaceId }: { workspaceId: string | null }) {
  const [tasks, setTasks] = useState<MyTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTask, setSelectedTask] = useState<MyTask | null>(null);
  const [projectColumns, setProjectColumns] = useState<any[]>([]);
  const [openingTask, setOpeningTask] = useState(false);

  const fetchTasks = useCallback(async () => {
    const url = workspaceId ? `/api/users/my-tasks?workspaceId=${workspaceId}` : '/api/users/my-tasks';
    const res = await fetch(url);
    if (res.ok) setTasks(await res.json());
    setLoading(false);
  }, [workspaceId]);

  useEffect(() => { fetchTasks(); }, [fetchTasks]);

  async function openTask(task: MyTask) {
    setOpeningTask(true);
    try {
      const res = await fetch(`/api/kanban/projects?id=${task.column.project.id}`);
      if (res.ok) {
        const data = await res.json();
        setProjectColumns(data.columns ?? []);
      }
    } finally {
      setOpeningTask(false);
      setSelectedTask(task);
    }
  }

  // Group tasks
  const groups: Record<DueBucket, MyTask[]> = {
    overdue: [], today: [], tomorrow: [], this_week: [], next_month: [], later: [], no_date: [],
  };
  for (const t of tasks) groups[getDueBucket(t.dueDate, t.completedAt)].push(t);

  if (loading) return (
    <div className="flex items-center justify-center h-24 text-gray-500 text-sm">
      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500 mr-3" />
      Loading your tasks…
    </div>
  );

  if (tasks.length === 0) return (
    <div className="card text-center py-10 text-gray-500">
      <LayoutGrid className="w-8 h-8 mx-auto mb-3 opacity-30" />
      <p>No tasks assigned to you yet.</p>
      <Link href="/kanban" className="text-sm text-primary hover:underline mt-2 inline-block">Open Projects →</Link>
    </div>
  );

  let rowNum = 0;

  return (
    <>
      <div className="card p-0 overflow-hidden">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-gray-700 bg-gray-800/50">
              <th className="w-8 px-3 py-2" />
              <th className="py-2 pr-4 text-left text-xs font-semibold text-gray-400 uppercase tracking-wide">Name</th>
              <th className="py-2 px-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wide w-32">Project</th>
              <th className="py-2 px-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wide w-20">Assignee</th>
              <th className="py-2 px-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wide w-28">Status</th>
              <th className="py-2 px-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wide w-24">Start</th>
              <th className="py-2 px-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wide w-24">Due</th>
            </tr>
          </thead>
          <tbody>
            {BUCKET_ORDER.map(bucket => {
              const bucketTasks = groups[bucket];
              if (!bucketTasks.length) return null;
              return (
                <>
                  <tr key={`h-${bucket}`} className="border-b border-gray-700/50 bg-gray-800/30">
                    <td />
                    <td colSpan={6} className="py-2 px-3">
                      <span className={`text-xs font-semibold ${bucket === 'overdue' ? 'text-red-400' : 'text-gray-400'}`}>
                        {BUCKET_LABELS[bucket]} <span className="font-normal opacity-60">{bucketTasks.length}</span>
                      </span>
                    </td>
                  </tr>
                  {bucketTasks.map(task => (
                    <TaskRow key={task.id} task={task} rowNum={++rowNum} onOpen={openTask} />
                  ))}
                </>
              );
            })}
          </tbody>
        </table>
      </div>

      {selectedTask && (
        <TaskPanel
          task={selectedTask as any}
          columnId={selectedTask.columnId}
          columns={projectColumns.map((c: any) => ({ id: c.id, name: c.name }))}
          onClose={() => setSelectedTask(null)}
          onUpdate={() => { setSelectedTask(null); fetchTasks(); }}
        />
      )}
    </>
  );
}
