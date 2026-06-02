'use client';

import { useState } from 'react';
import { GripVertical, Calendar, Trash2, LayoutList, ChevronDown, ChevronRight } from 'lucide-react';

interface Tag {
  tag: { id: string; name: string; color: string };
}

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
  dueDate: string | null;
  hasDueTime?: boolean;
  completedAt: string | null;
  assignee: Assignee | null;
  state?: { id: string; name: string; group: string; color: string } | null;
}

interface Task {
  id: string;
  title: string;
  description: string | null;
  priority: string;
  dueDate: string | null;
  hasDueTime?: boolean;
  tags: Tag[];
  children?: ChildTask[];
}

interface KanbanCardProps {
  task: Task;
  isDragging: boolean;
  onClick: () => void;
  onDelete: () => void;
  onChildClick?: (child: ChildTask) => void;
}

const priorityColors = {
  high: 'border-l-red-500',
  medium: 'border-l-yellow-500',
  low: 'border-l-green-500',
};

const priorityDot: Record<string, string> = {
  urgent: 'bg-red-500',
  high: 'bg-orange-500',
  medium: 'bg-yellow-500',
  low: 'bg-blue-400',
};

function formatDueDate(dueDate: string, hasDueTime?: boolean): string {
  if (hasDueTime) {
    return new Date(dueDate).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  }
  return dueDate.split('T')[0];
}

function isOverdue(dueDate: string): boolean {
  const today = new Date().toISOString().split('T')[0];
  return dueDate.split('T')[0] < today;
}

export default function KanbanCard({ task, isDragging, onClick, onDelete, onChildClick }: KanbanCardProps) {
  const [childrenExpanded, setChildrenExpanded] = useState(false);

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    onDelete();
  };

  const toggleChildren = (e: React.MouseEvent) => {
    e.stopPropagation();
    setChildrenExpanded(v => !v);
  };

  const childCount = task.children?.length ?? 0;
  const completedChildCount = task.children?.filter(c => c.completedAt).length ?? 0;

  return (
    <div
      className={`
        group relative bg-white dark:bg-gray-800 rounded-lg shadow-sm border-l-4
        ${priorityColors[task.priority as keyof typeof priorityColors] || 'border-l-gray-300'}
        ${isDragging ? 'shadow-lg ring-2 ring-blue-500 rotate-2' : 'hover:shadow-md'}
        transition-all duration-150
      `}
    >
      {/* Main card content */}
      <div className="p-3 pl-6 cursor-pointer" onClick={onClick}>
        {/* Drag handle indicator */}
        <div className="absolute left-0 top-0 bottom-0 w-6 flex items-center justify-center opacity-0 group-hover:opacity-50 transition-opacity">
          <GripVertical className="w-4 h-4 text-gray-400" />
        </div>

        {/* Title */}
        <h4 className="font-medium text-gray-900 dark:text-gray-100 text-sm leading-tight mb-1">
          {task.title}
        </h4>

        {/* Description preview */}
        {task.description && (
          <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2 mb-2">
            {task.description}
          </p>
        )}

        {/* Tags */}
        {task.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-2">
            {task.tags.slice(0, 3).map(({ tag }) => (
              <span
                key={tag.id}
                className="px-1.5 py-0.5 text-xs rounded-full"
                style={{ backgroundColor: `${tag.color}20`, color: tag.color }}
              >
                {tag.name}
              </span>
            ))}
            {task.tags.length > 3 && (
              <span className="px-1.5 py-0.5 text-xs rounded-full bg-gray-100 dark:bg-gray-700 text-gray-500">
                +{task.tags.length - 3}
              </span>
            )}
          </div>
        )}

        {/* Footer: sub-task count + due date + delete */}
        <div className="flex items-center gap-2 mt-1">
          {/* Sub-task count button */}
          {childCount > 0 && (
            <button
              onClick={toggleChildren}
              className="flex items-center gap-1 text-xs text-gray-400 hover:text-blue-500 transition-colors"
              title={childrenExpanded ? 'Hide sub-tasks' : 'Show sub-tasks'}
            >
              <LayoutList className="w-3.5 h-3.5" />
              <span>{completedChildCount}/{childCount}</span>
              {childrenExpanded
                ? <ChevronDown className="w-3 h-3" />
                : <ChevronRight className="w-3 h-3" />}
            </button>
          )}

          <div className="flex-1" />

          {task.dueDate ? (
            <div className="flex items-center gap-1 text-xs text-gray-500">
              <Calendar className="w-3 h-3" />
              <span>{formatDueDate(task.dueDate, task.hasDueTime)}</span>
            </div>
          ) : null}

          <button
            onClick={handleDelete}
            className="opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-red-500 transition-all"
            title="Delete task"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Inline sub-task rows */}
      {childrenExpanded && childCount > 0 && (
        <div className="border-t border-gray-100 dark:border-gray-700 pl-6">
          {task.children!.map(child => (
            <button
              key={child.id}
              onClick={(e) => { e.stopPropagation(); onChildClick?.(child); }}
              className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-gray-50 dark:hover:bg-gray-700/50 border-b border-gray-100 dark:border-gray-700/50 last:border-0 transition-colors"
            >
              {/* Status color dot */}
              <div
                className="w-2 h-2 rounded-full flex-shrink-0"
                style={{ backgroundColor: child.state?.color || '#6B7280' }}
              />

              {/* Title */}
              <span className={`flex-1 text-xs truncate ${child.completedAt ? 'text-gray-400 line-through' : 'text-gray-700 dark:text-gray-300'}`}>
                {child.title}
              </span>

              {/* State label */}
              {child.state && (
                <span className="text-[10px] text-gray-400 flex-shrink-0">{child.state.name}</span>
              )}

              {/* Assignee avatar */}
              {child.assignee && (
                child.assignee.avatar ? (
                  <img src={child.assignee.avatar} alt="" className="w-4 h-4 rounded-full flex-shrink-0" />
                ) : (
                  <div className="w-4 h-4 rounded-full bg-gray-400 flex items-center justify-center text-[8px] text-white flex-shrink-0">
                    {child.assignee.displayName?.charAt(0)}
                  </div>
                )
              )}

              {/* Due date */}
              {child.dueDate && (
                <span className={`text-[10px] flex-shrink-0 ${isOverdue(child.dueDate) && !child.completedAt ? 'text-red-400' : 'text-gray-400'}`}>
                  {formatDueDate(child.dueDate, child.hasDueTime)}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
