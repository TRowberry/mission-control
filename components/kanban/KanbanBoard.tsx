'use client';

import { useState, useEffect, useRef } from 'react';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import { Plus, MoreHorizontal, Pencil, Trash2, Check, X } from 'lucide-react';
import KanbanCard from './KanbanCard';
import TaskPanel from './TaskPanel';
import { cn } from '@/lib/utils';

interface Subtask {
  id: string;
  title: string;
  completed: boolean;
}

interface Tag {
  tag: { id: string; name: string; color: string };
}

interface Assignee {
  id: string;
  displayName: string;
  avatar: string | null;
}

interface Task {
  id: string;
  title: string;
  description: string | null;
  priority: string;
  position: number;
  dueDate: string | null;
  columnId: string;
  subtasks: Subtask[];
  tags: Tag[];
  assignee: Assignee | null;
  estimate: number | null;
}

interface Column {
  id: string;
  name: string;
  position: number;
  color: string | null;
  tasks: Task[];
}

interface Project {
  id: string;
  name: string;
  description: string | null;
  color: string;
  columns: Column[];
}

interface KanbanBoardProps {
  projectId: string;
  highlightedTaskId?: string | null;
}

export default function KanbanBoard({ projectId, highlightedTaskId }: KanbanBoardProps) {
  const [project, setProject] = useState<Project | null>(null);
  const [columns, setColumns] = useState<Column[]>([]);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [selectedColumnId, setSelectedColumnId] = useState<string | null>(null);
  const [isAddingTask, setIsAddingTask] = useState<string | null>(null);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [loading, setLoading] = useState(true);

  // Column management state
  const [columnMenu, setColumnMenu] = useState<string | null>(null); // columnId with open menu
  const [editingColumn, setEditingColumn] = useState<string | null>(null);
  const [editingColumnName, setEditingColumnName] = useState('');
  const [isAddingColumn, setIsAddingColumn] = useState(false);
  const [newColumnName, setNewColumnName] = useState('');
  const columnMenuRef = useRef<HTMLDivElement>(null);

  const fetchProject = async () => {
    try {
      const res = await fetch(`/api/kanban/projects?id=${projectId}`);
      if (res.ok) {
        const data = await res.json();
        setProject(data);
        setColumns(data.columns || []);
      }
    } catch (err) {
      console.error('Failed to fetch project:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProject();
  }, [projectId]);

  // Close column menu on outside click
  useEffect(() => {
    if (!columnMenu) return;
    function handler(e: MouseEvent) {
      if (columnMenuRef.current && !columnMenuRef.current.contains(e.target as Node)) {
        setColumnMenu(null);
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [columnMenu]);

  // Auto-open task modal if highlightedTaskId is provided
  useEffect(() => {
    if (highlightedTaskId && columns.length > 0) {
      // Find the task across all columns
      for (const column of columns) {
        const task = column.tasks.find(t => t.id === highlightedTaskId);
        if (task) {
          setSelectedTask(task);
          setSelectedColumnId(column.id);
          break;
        }
      }
    }
  }, [highlightedTaskId, columns]);

  const onUpdate = () => fetchProject();

  async function handleDragEnd(result: DropResult) {
    const { destination, source, draggableId } = result;

    if (!destination) return;
    if (destination.droppableId === source.droppableId && destination.index === source.index) return;

    // Optimistic update
    const newColumns = [...columns];
    const sourceCol = newColumns.find(c => c.id === source.droppableId);
    const destCol = newColumns.find(c => c.id === destination.droppableId);
    
    if (!sourceCol || !destCol) return;

    const [movedTask] = sourceCol.tasks.splice(source.index, 1);
    destCol.tasks.splice(destination.index, 0, movedTask);
    setColumns(newColumns);

    // API update
    try {
      await fetch('/api/kanban/tasks', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          taskId: draggableId,
          sourceColumnId: source.droppableId,
          destinationColumnId: destination.droppableId,
          newPosition: destination.index,
        }),
      });
    } catch (err) {
      console.error('Failed to move task:', err);
      fetchProject(); // Revert on error
    }
  }

  async function handleAddTask(columnId: string) {
    if (!newTaskTitle.trim()) {
      setIsAddingTask(null);
      return;
    }

    try {
      const res = await fetch('/api/kanban/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newTaskTitle.trim(),
          columnId,
        }),
      });

      if (res.ok) {
        setNewTaskTitle('');
        setIsAddingTask(null);
        onUpdate();
      }
    } catch (err) {
      console.error('Failed to add task:', err);
    }
  }

  async function handleDeleteTask(taskId: string) {
    try {
      await fetch(`/api/kanban/tasks?id=${taskId}`, { method: 'DELETE' });
      onUpdate();
    } catch (err) {
      console.error('Failed to delete task:', err);
    }
  }

  async function handleAddColumn() {
    if (!newColumnName.trim()) {
      setIsAddingColumn(false);
      return;
    }
    try {
      const res = await fetch('/api/kanban/columns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, name: newColumnName.trim() }),
      });
      if (res.ok) {
        setNewColumnName('');
        setIsAddingColumn(false);
        fetchProject();
      }
    } catch (err) {
      console.error('Failed to add column:', err);
    }
  }

  async function handleRenameColumn(columnId: string) {
    if (!editingColumnName.trim()) {
      setEditingColumn(null);
      return;
    }
    try {
      await fetch('/api/kanban/columns', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: columnId, name: editingColumnName.trim() }),
      });
      setEditingColumn(null);
      fetchProject();
    } catch (err) {
      console.error('Failed to rename column:', err);
    }
  }

  async function handleDeleteColumn(columnId: string, taskCount: number) {
    const msg = taskCount > 0
      ? `Delete this column and its ${taskCount} task${taskCount > 1 ? 's' : ''}? This cannot be undone.`
      : 'Delete this column?';
    if (!confirm(msg)) return;
    try {
      await fetch(`/api/kanban/columns?id=${columnId}`, { method: 'DELETE' });
      setColumnMenu(null);
      fetchProject();
    } catch (err) {
      console.error('Failed to delete column:', err);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500">
        Project not found
      </div>
    );
  }

  return (
    <>
      <DragDropContext onDragEnd={handleDragEnd}>
        <div className="flex gap-4 overflow-x-auto pb-4 h-full snap-x snap-mandatory md:snap-none">
          {columns.map((column) => (
            <div
              key={column.id}
              className="flex-shrink-0 w-[85vw] md:w-72 bg-[#2B2D31] rounded-lg flex flex-col h-full snap-center md:snap-align-none"
            >
              {/* Column header */}
              <div className="flex items-center justify-between p-3 border-b border-gray-700">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <div
                    className="w-3 h-3 rounded-full flex-shrink-0"
                    style={{ backgroundColor: column.color || '#5865F2' }}
                  />
                  {editingColumn === column.id ? (
                    <input
                      autoFocus
                      value={editingColumnName}
                      onChange={(e) => setEditingColumnName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleRenameColumn(column.id);
                        if (e.key === 'Escape') setEditingColumn(null);
                      }}
                      onBlur={() => handleRenameColumn(column.id)}
                      className="flex-1 bg-gray-700 rounded px-2 py-0.5 text-sm font-medium focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  ) : (
                    <h3 className="font-medium text-sm truncate">{column.name}</h3>
                  )}
                  <span className="text-xs text-gray-500 bg-gray-700 px-1.5 py-0.5 rounded flex-shrink-0">
                    {column.tasks.length}
                  </span>
                </div>
                <div className="relative flex-shrink-0" ref={columnMenu === column.id ? columnMenuRef : undefined}>
                  <button
                    onClick={() => setColumnMenu(columnMenu === column.id ? null : column.id)}
                    className="p-1 hover:bg-white/10 rounded"
                  >
                    <MoreHorizontal className="w-4 h-4 text-gray-400" />
                  </button>
                  {columnMenu === column.id && (
                    <div className="absolute right-0 top-full mt-1 w-40 bg-[#1E1F22] rounded-lg shadow-xl border border-gray-700 z-50 py-1">
                      <button
                        onClick={() => {
                          setEditingColumn(column.id);
                          setEditingColumnName(column.name);
                          setColumnMenu(null);
                        }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-white/10 text-left"
                      >
                        <Pencil className="w-3.5 h-3.5 text-gray-400" />
                        Rename
                      </button>
                      <button
                        onClick={() => handleDeleteColumn(column.id, column.tasks.length)}
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-white/10 text-left text-red-400"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Delete
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Tasks */}
              <Droppable droppableId={column.id}>
                {(provided, snapshot) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    className={cn(
                      'flex-1 p-2 overflow-y-auto space-y-2 min-h-[100px] touch-pan-y',
                      snapshot.isDraggingOver && 'bg-white/5'
                    )}
                  >
                    {column.tasks.map((task, index) => (
                      <Draggable key={task.id} draggableId={task.id} index={index}>
                        {(provided, snapshot) => (
                          <div
                            ref={provided.innerRef}
                            {...provided.draggableProps}
                            {...provided.dragHandleProps}
                          >
                            <KanbanCard
                              task={task}
                              isDragging={snapshot.isDragging}
                              onClick={() => {
                                setSelectedTask(task);
                                setSelectedColumnId(column.id);
                              }}
                              onDelete={() => handleDeleteTask(task.id)}
                            />
                          </div>
                        )}
                      </Draggable>
                    ))}
                    {provided.placeholder}

                    {/* Add task form */}
                    {isAddingTask === column.id ? (
                      <div className="bg-[#1E1F22] rounded-lg p-2">
                        <textarea
                          autoFocus
                          value={newTaskTitle}
                          onChange={(e) => setNewTaskTitle(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                              e.preventDefault();
                              handleAddTask(column.id);
                            } else if (e.key === 'Escape') {
                              setIsAddingTask(null);
                              setNewTaskTitle('');
                            }
                          }}
                          onBlur={() => handleAddTask(column.id)}
                          placeholder="Enter task title..."
                          className="w-full bg-transparent text-sm resize-none focus:outline-none"
                          rows={2}
                        />
                      </div>
                    ) : null}
                  </div>
                )}
              </Droppable>

              {/* Add task button */}
              <button
                onClick={() => {
                  setIsAddingTask(column.id);
                  setNewTaskTitle('');
                }}
                className="flex items-center gap-2 p-3 text-gray-400 hover:text-gray-200 hover:bg-white/5 transition-colors border-t border-gray-700"
              >
                <Plus className="w-4 h-4" />
                <span className="text-sm">Add task</span>
              </button>
            </div>
          ))}

          {/* Add Column */}
          <div className="flex-shrink-0 w-[85vw] md:w-72 snap-center md:snap-align-none">
            {isAddingColumn ? (
              <div className="bg-[#2B2D31] rounded-lg p-3">
                <input
                  autoFocus
                  value={newColumnName}
                  onChange={(e) => setNewColumnName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleAddColumn();
                    if (e.key === 'Escape') { setIsAddingColumn(false); setNewColumnName(''); }
                  }}
                  onBlur={handleAddColumn}
                  placeholder="Column name..."
                  className="w-full bg-[#1E1F22] rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
                <div className="flex gap-2 mt-2">
                  <button
                    onClick={handleAddColumn}
                    className="flex items-center gap-1 px-3 py-1.5 bg-primary rounded text-sm hover:bg-primary-hover"
                  >
                    <Check className="w-3.5 h-3.5" /> Add
                  </button>
                  <button
                    onClick={() => { setIsAddingColumn(false); setNewColumnName(''); }}
                    className="p-1.5 hover:bg-white/10 rounded text-gray-400"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setIsAddingColumn(true)}
                className="w-full flex items-center gap-2 p-3 bg-[#2B2D31]/50 hover:bg-[#2B2D31] rounded-lg text-gray-400 hover:text-gray-200 border-2 border-dashed border-gray-700 hover:border-gray-500 transition-colors"
              >
                <Plus className="w-4 h-4" />
                <span className="text-sm">Add column</span>
              </button>
            )}
          </div>
        </div>
      </DragDropContext>

      {/* Task detail panel */}
      {selectedTask && (
        <TaskPanel
          task={selectedTask}
          columnId={selectedColumnId!}
          columns={columns}
          onClose={() => setSelectedTask(null)}
          onUpdate={onUpdate}
        />
      )}
    </>
  );
}
