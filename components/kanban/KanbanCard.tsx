'use client';

import { GripVertical, Calendar, Trash2 } from 'lucide-react';

interface Tag {
  tag: { id: string; name: string; color: string };
}

interface Task {
  id: string;
  title: string;
  description: string | null;
  priority: string;
  dueDate: string | null;
  tags: Tag[];
}

interface KanbanCardProps {
  task: Task;
  isDragging: boolean;
  onClick: () => void;
  onDelete: () => void;
}

const priorityColors = {
  high: 'border-l-red-500',
  medium: 'border-l-yellow-500',
  low: 'border-l-green-500',
};

export default function KanbanCard({ task, isDragging, onClick, onDelete }: KanbanCardProps) {
  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    onDelete();
  };

  return (
    <div
      onClick={onClick}
      className={`
        group relative bg-white dark:bg-gray-800 rounded-lg shadow-sm border-l-4
        ${priorityColors[task.priority as keyof typeof priorityColors] || 'border-l-gray-300'}
        ${isDragging ? 'shadow-lg ring-2 ring-blue-500 rotate-2' : 'hover:shadow-md'}
        transition-all duration-150 cursor-pointer
      `}
    >
      {/* Drag handle indicator */}
      <div className="absolute left-0 top-0 bottom-0 w-6 flex items-center justify-center opacity-0 group-hover:opacity-50 transition-opacity">
        <GripVertical className="w-4 h-4 text-gray-400" />
      </div>

      <div className="p-3 pl-6">
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
                style={{
                  backgroundColor: `${tag.color}20`,
                  color: tag.color,
                }}
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

        {/* Footer: Due date & actions */}
        <div className="flex items-center justify-between">
          {task.dueDate ? (
            <div className="flex items-center gap-1 text-xs text-gray-500">
              <Calendar className="w-3 h-3" />
              <span>{new Date(task.dueDate).toLocaleDateString()}</span>
            </div>
          ) : (
            <div />
          )}

          {/* Delete button */}
          <button
            onClick={handleDelete}
            className="opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-red-500 transition-all"
            title="Delete task"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
