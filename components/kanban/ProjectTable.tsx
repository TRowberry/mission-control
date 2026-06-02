'use client';

import { useState, useEffect, useCallback } from 'react';
import { ChevronRight, ChevronDown, Plus, User } from 'lucide-react';
import TaskPanel from './TaskPanel';

// ─── Types ───────────────────────────────────────────────────────────────────

interface Assignee {
  id: string;
  displayName: string;
  avatar: string | null;
}

interface ChildTask {
  id: string;
  title: string;
  columnId: string;
  priority: string;
  startDate: string | null;
  hasStartTime?: boolean;
  dueDate: string | null;
  hasDueTime?: boolean;
  completedAt: string | null;
  assignee: Assignee | null;
  state: { id: string; name: string; group: string; color: string } | null;
  subtasks: any[];
  children?: ChildTask[];
}

interface FlatTask {
  id: string;
  title: string;
  columnId: string;
  columnName: string;
  columnColor: string;
  priority: string;
  startDate: string | null;
  hasStartTime?: boolean;
  dueDate: string | null;
  hasDueTime?: boolean;
  completedAt: string | null;
  assignee: Assignee | null;
  state: { id: string; name: string; group: string; color: string } | null;
  subtasks: any[];
  children: ChildTask[];
  parentId: string | null;
  tags: any[];
}

interface Column {
  id: string;
  name: string;
  color: string | null;
  tasks: FlatTask[];
}

interface ProjectTableProps {
  projectId: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseDateLocal(dateStr: string): Date {
  const [year, month, day] = dateStr.split('T')[0].split('-').map(Number);
  return new Date(year, month - 1, day);
}

function formatDate(dateStr: string, hasTime?: boolean): string {
  if (hasTime) {
    return new Date(dateStr).toLocaleDateString([], { month: '2-digit', day: '2-digit', year: 'numeric' });
  }
  const d = parseDateLocal(dateStr);
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}/${d.getFullYear()}`;
}

function isOverdue(dateStr: string): boolean {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return parseDateLocal(dateStr) < today;
}

const PRIORITY_COLORS: Record<string, string> = {
  urgent: '#EF4444',
  high: '#F97316',
  medium: '#F59E0B',
  low: '#3B82F6',
};

// ─── Row component ────────────────────────────────────────────────────────────

function TaskRow({
  task,
  rowNum,
  depth,
  columns,
  onOpenTask,
  onUpdate,
}: {
  task: FlatTask | ChildTask;
  rowNum: number;
  depth: number;
  columns: Column[];
  onOpenTask: (task: any) => void;
  onUpdate: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const children = (task as FlatTask).children ?? [];
  const hasChildren = children.length > 0;

  const statusColor = task.state?.color ?? task.columnColor ?? '#6B7280';
  const statusName = task.state?.name ?? task.columnName ?? '—';

  const dueDateOverdue = task.dueDate && !task.completedAt && isOverdue(task.dueDate);

  return (
    <>
      <tr
        className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50 group"
      >
        {/* Row number */}
        <td className="w-10 px-2 py-2.5 text-xs text-gray-400 text-right select-none">
          {rowNum}
        </td>

        {/* Name */}
        <td className="py-2.5 pr-4">
          <div className="flex items-center gap-1" style={{ paddingLeft: depth * 24 }}>
            {/* Expand / spacer */}
            {hasChildren ? (
              <button
                onClick={() => setExpanded(v => !v)}
                className="p-0.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded"
              >
                {expanded
                  ? <ChevronDown className="w-3.5 h-3.5" />
                  : <ChevronRight className="w-3.5 h-3.5" />}
              </button>
            ) : (
              <span className="w-5 flex-shrink-0" />
            )}

            {/* Checkbox */}
            <div className={`w-4 h-4 rounded border-2 flex-shrink-0 flex items-center justify-center ${task.completedAt ? 'bg-green-500 border-green-500' : 'border-gray-300 dark:border-gray-600'}`}>
              {task.completedAt && <svg viewBox="0 0 12 12" className="w-2.5 h-2.5 text-white fill-current"><path d="M10 3L5 8 2 5" stroke="white" strokeWidth="1.5" fill="none" strokeLinecap="round"/></svg>}
            </div>

            {/* Priority dot */}
            <div
              className="w-2 h-2 rounded-full flex-shrink-0"
              style={{ backgroundColor: PRIORITY_COLORS[task.priority] ?? '#9CA3AF' }}
            />

            {/* Title */}
            <button
              onClick={() => onOpenTask(task)}
              className={`text-sm text-left hover:text-blue-500 transition-colors flex-1 truncate ${task.completedAt ? 'text-gray-400 line-through' : 'text-gray-900 dark:text-gray-100'}`}
            >
              {task.title}
            </button>

            {/* Sub-task count badge */}
            {hasChildren && (
              <span className="text-[10px] text-gray-400 bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded-full flex-shrink-0">
                {children.filter(c => c.completedAt).length}/{children.length}
              </span>
            )}
          </div>
        </td>

        {/* Assignee */}
        <td className="py-2.5 px-2 w-24">
          {task.assignee ? (
            <div className="flex items-center gap-1.5">
              {task.assignee.avatar ? (
                <img src={task.assignee.avatar} alt="" className="w-6 h-6 rounded-full" />
              ) : (
                <div className="w-6 h-6 rounded-full bg-blue-500 flex items-center justify-center text-[10px] text-white font-medium flex-shrink-0">
                  {task.assignee.displayName.charAt(0).toUpperCase()}
                </div>
              )}
              <span className="text-xs text-gray-600 dark:text-gray-400 truncate max-w-[60px]">
                {task.assignee.displayName.split(' ')[0]}
              </span>
            </div>
          ) : (
            <div className="w-6 h-6 rounded-full border-2 border-dashed border-gray-300 dark:border-gray-600 flex items-center justify-center">
              <User className="w-3 h-3 text-gray-400" />
            </div>
          )}
        </td>

        {/* Status */}
        <td className="py-2.5 px-2 w-28">
          <span
            className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium"
            style={{ backgroundColor: `${statusColor}25`, color: statusColor }}
          >
            <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: statusColor }} />
            {statusName}
          </span>
        </td>

        {/* Start date */}
        <td className="py-2.5 px-2 w-28 text-xs text-gray-500">
          {task.startDate ? formatDate(task.startDate, task.hasStartTime) : <span className="text-gray-300 dark:text-gray-700">—</span>}
        </td>

        {/* Due date */}
        <td className="py-2.5 px-2 w-28 text-xs">
          {task.dueDate
            ? <span className={dueDateOverdue ? 'text-red-500 font-medium' : 'text-gray-500'}>
                {formatDate(task.dueDate, task.hasDueTime)}
              </span>
            : <span className="text-gray-300 dark:text-gray-700">—</span>}
        </td>
      </tr>

      {/* Expanded children */}
      {expanded && children.map((child, i) => (
        <TaskRow
          key={child.id}
          task={child as any}
          rowNum={0}
          depth={depth + 1}
          columns={columns}
          onOpenTask={onOpenTask}
          onUpdate={onUpdate}
        />
      ))}
    </>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function ProjectTable({ projectId }: ProjectTableProps) {
  const [columns, setColumns] = useState<Column[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTask, setSelectedTask] = useState<any>(null);
  const [selectedColumnId, setSelectedColumnId] = useState<string>('');
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [addingTask, setAddingTask] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`/api/kanban/projects?id=${projectId}`);
      if (res.ok) {
        const data = await res.json();
        setColumns(data.columns || []);
      }
    } catch (err) {
      console.error('Failed to fetch project:', err);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Flatten all top-level tasks across all columns, preserving column info
  const allTasks: (FlatTask & { columnName: string; columnColor: string })[] = [];
  for (const col of columns) {
    for (const task of col.tasks) {
      if (!(task as any).parentId) {
        allTasks.push({
          ...task,
          columnName: col.name,
          columnColor: col.color ?? '#6B7280',
        });
      }
    }
  }

  const defaultColumnId = columns[0]?.id ?? '';

  async function handleAddTask() {
    if (!newTaskTitle.trim() || !defaultColumnId) return;
    try {
      await fetch('/api/kanban/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newTaskTitle.trim(), columnId: defaultColumnId }),
      });
      setNewTaskTitle('');
      setAddingTask(false);
      fetchData();
    } catch (err) {
      console.error('Failed to create task:', err);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="flex-1 overflow-auto">
        <table className="w-full border-collapse min-w-[600px]">
          {/* Header */}
          <thead>
            <tr className="border-b-2 border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
              <th className="w-10 px-2 py-2" />
              <th className="py-2 pr-4 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                Name
              </th>
              <th className="py-2 px-2 w-24 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                Assignee
              </th>
              <th className="py-2 px-2 w-28 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                Status
              </th>
              <th className="py-2 px-2 w-28 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                Start date
              </th>
              <th className="py-2 px-2 w-28 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                Due date
              </th>
              <th className="py-2 px-2 w-8">
                <button className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-400 hover:text-gray-600" title="Add column">
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </th>
            </tr>
          </thead>

          <tbody>
            {allTasks.map((task, index) => (
              <TaskRow
                key={task.id}
                task={task}
                rowNum={index + 1}
                depth={0}
                columns={columns}
                onOpenTask={(t) => {
                  setSelectedTask(t);
                  setSelectedColumnId(t.columnId);
                }}
                onUpdate={fetchData}
              />
            ))}

            {/* Add item row */}
            <tr>
              <td />
              <td colSpan={6} className="py-2 pr-4">
                {addingTask ? (
                  <div className="flex items-center gap-2 pl-10">
                    <input
                      autoFocus
                      type="text"
                      value={newTaskTitle}
                      onChange={e => setNewTaskTitle(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') handleAddTask();
                        if (e.key === 'Escape') { setAddingTask(false); setNewTaskTitle(''); }
                      }}
                      onBlur={() => { if (!newTaskTitle.trim()) setAddingTask(false); }}
                      placeholder="Task name..."
                      className="flex-1 px-2 py-1 text-sm border border-blue-500 rounded focus:outline-none bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                    />
                    <button onClick={handleAddTask} className="px-3 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700">Add</button>
                    <button onClick={() => { setAddingTask(false); setNewTaskTitle(''); }} className="text-gray-400 hover:text-gray-600 text-xs">Cancel</button>
                  </div>
                ) : (
                  <button
                    onClick={() => setAddingTask(true)}
                    className="flex items-center gap-1.5 pl-10 text-sm text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Item</span>
                    <span className="text-xs text-gray-300 dark:text-gray-600 ml-1">Alt + Shift + N</span>
                  </button>
                )}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Task panel */}
      {selectedTask && (
        <TaskPanel
          task={selectedTask}
          columnId={selectedColumnId}
          columns={columns.map(c => ({ id: c.id, name: c.name }))}
          onClose={() => setSelectedTask(null)}
          onUpdate={() => { fetchData(); }}
        />
      )}
    </div>
  );
}
