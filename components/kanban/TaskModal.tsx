'use client';

import { useState, useEffect } from 'react';
import { X, Plus, Check, Trash2, Calendar, Flag, Bug, Lightbulb, Bookmark, ListTodo, Target, Layers, Clock, User, Image, Upload, Eye } from 'lucide-react';

interface Tag {
  tag: { id: string; name: string; color: string };
}

interface Subtask {
  id: string;
  title: string;
  completed: boolean;
}

interface TaskType {
  id: string;
  name: string;
  icon: string;
  color: string;
}

interface State {
  id: string;
  name: string;
  group: string;
  color: string;
}

interface Cycle {
  id: string;
  name: string;
  status: string;
  startDate: string | null;
  endDate: string | null;
}

interface Module {
  id: string;
  name: string;
}

interface TaskModule {
  module: Module;
}

interface UserOption {
  id: string;
  username: string;
  displayName: string;
  avatar: string | null;
  status: string;
  isAgent: boolean;
}

interface Assignee {
  id: string;
  displayName: string;
  avatar: string | null;
}

interface TaskWithRelations {
  id: string;
  title: string;
  description: string | null;
  priority: string;
  columnId: string;
  dueDate: string | null;
  startDate: string | null;
  estimate: number | null;
  tags: Tag[];
  subtasks: Subtask[];
  typeId: string | null;
  stateId: string | null;
  cycleId: string | null;
  assigneeId: string | null;
  type?: TaskType | null;
  state?: State | null;
  cycle?: Cycle | null;
  modules?: TaskModule[];
  assignee?: Assignee | null;
}

interface Column {
  id: string;
  name: string;
}

interface TaskModalProps {
  task: TaskWithRelations | null;
  columnId: string;
  columns: Column[];
  projectId: string;
  onClose: () => void;
  onUpdate: () => void;
}

const typeIcons: Record<string, React.ReactNode> = {
  bug: <Bug className="w-4 h-4" />,
  feature: <Lightbulb className="w-4 h-4" />,
  story: <Bookmark className="w-4 h-4" />,
  task: <ListTodo className="w-4 h-4" />,
};

const stateGroupColors: Record<string, string> = {
  backlog: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
  unstarted: 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400',
  started: 'bg-yellow-100 text-yellow-600 dark:bg-yellow-900/30 dark:text-yellow-400',
  completed: 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400',
  cancelled: 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400',
};

export default function TaskModal({ task, columnId, columns, projectId, onClose, onUpdate }: TaskModalProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<'low' | 'medium' | 'high'>('medium');
  const [selectedColumnId, setSelectedColumnId] = useState(columnId);
  const [dueDate, setDueDate] = useState('');
  const [startDate, setStartDate] = useState('');
  const [estimate, setEstimate] = useState<string>('');
  const [subtasks, setSubtasks] = useState<{ id?: string; title: string; completed: boolean }[]>([]);
  const [newSubtask, setNewSubtask] = useState('');
  const [saving, setSaving] = useState(false);

  // New fields
  const [typeId, setTypeId] = useState<string>('');
  const [stateId, setStateId] = useState<string>('');
  const [cycleId, setCycleId] = useState<string>('');
  const [selectedModuleIds, setSelectedModuleIds] = useState<string[]>([]);
  const [assigneeId, setAssigneeId] = useState<string>('');

  // Options loaded from API
  const [taskTypes, setTaskTypes] = useState<TaskType[]>([]);
  const [states, setStates] = useState<State[]>([]);
  const [cycles, setCycles] = useState<Cycle[]>([]);
  const [modules, setModules] = useState<Module[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [loadingOptions, setLoadingOptions] = useState(true);

  // Review items
  const [reviewItems, setReviewItems] = useState<Array<{
    id: string;
    url: string;
    name: string;
    type: string;
    status: string;
    _count?: { annotations: number };
  }>>([]);
  const [uploadingReview, setUploadingReview] = useState(false);

  const isNew = !task;

  // Fetch review items for this task
  useEffect(() => {
    if (task?.id) {
      fetch(`/api/review?taskId=${task.id}`)
        .then(res => res.ok ? res.json() : { items: [] })
        .then(data => setReviewItems(data.items || []))
        .catch(() => setReviewItems([]));
    }
  }, [task?.id]);

  // Handle review item upload
  const handleReviewUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !task?.id) return;

    setUploadingReview(true);
    try {
      // Upload file
      const formData = new FormData();
      formData.append('file', file);
      const uploadRes = await fetch('/api/upload', { method: 'POST', body: formData });
      if (!uploadRes.ok) throw new Error('Upload failed');
      const { url } = await uploadRes.json();

      // Detect file type
      const fileType = file.type.startsWith('video/') ? 'video' : 'image';

      // Create review item linked to task
      const createRes = await fetch('/api/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: file.name, url, type: fileType, taskId: task.id }),
      });
      if (createRes.ok) {
        const newItem = await createRes.json();
        setReviewItems(prev => [...prev, newItem]);
      }
    } catch (error) {
      console.error('Failed to upload review item:', error);
    } finally {
      setUploadingReview(false);
    }
  };

  // Fetch options on mount
  useEffect(() => {
    async function fetchOptions() {
      try {
        const [typesRes, statesRes, cyclesRes, modulesRes, usersRes] = await Promise.all([
          fetch(`/api/kanban/task-types?projectId=${projectId}`),
          fetch(`/api/kanban/states?projectId=${projectId}`),
          fetch(`/api/kanban/cycles?projectId=${projectId}`),
          fetch(`/api/kanban/modules?projectId=${projectId}`),
          fetch(`/api/users?limit=50`),
        ]);

        if (typesRes.ok) setTaskTypes(await typesRes.json());
        if (statesRes.ok) setStates(await statesRes.json());
        if (cyclesRes.ok) setCycles(await cyclesRes.json());
        if (modulesRes.ok) setModules(await modulesRes.json());
        if (usersRes.ok) setUsers(await usersRes.json());
      } catch (error) {
        console.error('Failed to load options:', error);
      } finally {
        setLoadingOptions(false);
      }
    }
    fetchOptions();
  }, [projectId]);

  // Populate form when editing
  useEffect(() => {
    if (task) {
      setTitle(task.title);
      setDescription(task.description || '');
      setPriority(task.priority as 'low' | 'medium' | 'high');
      setSelectedColumnId(task.columnId);
      setDueDate(task.dueDate ? new Date(task.dueDate).toISOString().split('T')[0] : '');
      setStartDate(task.startDate ? new Date(task.startDate).toISOString().split('T')[0] : '');
      setEstimate(task.estimate?.toString() || '');
      setSubtasks(task.subtasks.map(s => ({ id: s.id, title: s.title, completed: s.completed })));
      setTypeId(task.typeId || '');
      setStateId(task.stateId || '');
      setCycleId(task.cycleId || '');
      setSelectedModuleIds(task.modules?.map(m => m.module.id) || []);
      setAssigneeId(task.assigneeId || '');
    }
  }, [task]);

  const handleSave = async () => {
    if (!title.trim()) return;

    setSaving(true);
    try {
      const payload = {
        title: title.trim(),
        description: description.trim() || null,
        priority,
        columnId: selectedColumnId,
        dueDate: dueDate || null,
        startDate: startDate || null,
        estimate: estimate ? parseInt(estimate) : null,
        subtasks,
        typeId: typeId || null,
        stateId: stateId || null,
        cycleId: cycleId || null,
        moduleIds: selectedModuleIds,
        assigneeId: assigneeId || null,
      };

      if (isNew) {
        await fetch('/api/kanban/tasks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      } else {
        await fetch('/api/kanban/tasks', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: task.id, ...payload }),
        });
      }

      onUpdate();
      onClose();
    } catch (error) {
      console.error('Failed to save task:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleAddSubtask = () => {
    if (!newSubtask.trim()) return;
    setSubtasks([...subtasks, { title: newSubtask.trim(), completed: false }]);
    setNewSubtask('');
  };

  const toggleSubtask = (index: number) => {
    const updated = [...subtasks];
    updated[index].completed = !updated[index].completed;
    setSubtasks(updated);
  };

  const removeSubtask = (index: number) => {
    setSubtasks(subtasks.filter((_, i) => i !== index));
  };

  const toggleModule = (moduleId: string) => {
    setSelectedModuleIds(prev =>
      prev.includes(moduleId) ? prev.filter(id => id !== moduleId) : [...prev, moduleId]
    );
  };

  const completedCount = subtasks.filter(s => s.completed).length;
  const activeCycles = cycles.filter(c => c.status === 'current' || c.status === 'upcoming');
  const selectedUser = users.find(u => u.id === assigneeId);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            {isNew ? 'New Task' : 'Edit Task'}
          </h2>
          <button
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Title
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="What needs to be done?"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              autoFocus
            />
          </div>

          {/* Assignee Dropdown */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              <User className="w-4 h-4 inline mr-1" />
              Assignee
            </label>
            <div className="relative">
              <select
                value={assigneeId}
                onChange={(e) => setAssigneeId(e.target.value)}
                disabled={loadingOptions}
                className="w-full px-3 py-2 pl-10 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 appearance-none"
              >
                <option value="">Unassigned</option>
                {users.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.displayName} {user.isAgent ? '🤖' : ''} (@{user.username})
                  </option>
                ))}
              </select>
              {/* Avatar preview */}
              <div className="absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none">
                {selectedUser ? (
                  selectedUser.avatar ? (
                    <img
                      src={selectedUser.avatar}
                      alt={selectedUser.displayName}
                      className="w-6 h-6 rounded-full object-cover"
                    />
                  ) : (
                    <div className="w-6 h-6 rounded-full bg-blue-500 flex items-center justify-center text-white text-xs font-medium">
                      {selectedUser.displayName.charAt(0).toUpperCase()}
                    </div>
                  )
                ) : (
                  <div className="w-6 h-6 rounded-full bg-gray-200 dark:bg-gray-600 flex items-center justify-center">
                    <User className="w-3.5 h-3.5 text-gray-400" />
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Type & State Row */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                <Bug className="w-4 h-4 inline mr-1" />
                Type
              </label>
              <select
                value={typeId}
                onChange={(e) => setTypeId(e.target.value)}
                disabled={loadingOptions}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500"
              >
                <option value="">No type</option>
                {taskTypes.map((type) => (
                  <option key={type.id} value={type.id}>
                    {type.icon} {type.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                <Target className="w-4 h-4 inline mr-1" />
                State
              </label>
              <select
                value={stateId}
                onChange={(e) => setStateId(e.target.value)}
                disabled={loadingOptions}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500"
              >
                <option value="">No state</option>
                {states.map((state) => (
                  <option key={state.id} value={state.id}>
                    {state.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Cycle & Estimate Row */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                <Layers className="w-4 h-4 inline mr-1" />
                Cycle / Sprint
              </label>
              <select
                value={cycleId}
                onChange={(e) => setCycleId(e.target.value)}
                disabled={loadingOptions}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500"
              >
                <option value="">No cycle</option>
                {activeCycles.map((cycle) => (
                  <option key={cycle.id} value={cycle.id}>
                    {cycle.status === 'current' ? '🟢 ' : '📅 '}{cycle.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                <Clock className="w-4 h-4 inline mr-1" />
                Estimate (points)
              </label>
              <input
                type="number"
                min="0"
                max="100"
                value={estimate}
                onChange={(e) => setEstimate(e.target.value)}
                placeholder="Story points"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Modules (multi-select chips) */}
          {modules.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                <Layers className="w-4 h-4 inline mr-1" />
                Modules
              </label>
              <div className="flex flex-wrap gap-2">
                {modules.map((mod) => (
                  <button
                    key={mod.id}
                    type="button"
                    onClick={() => toggleModule(mod.id)}
                    className={`px-3 py-1 rounded-full text-sm transition-colors ${
                      selectedModuleIds.includes(mod.id)
                        ? 'bg-blue-500 text-white'
                        : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                    }`}
                  >
                    {mod.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Add more details..."
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
            />
          </div>

          {/* Column & Priority */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Column
              </label>
              <select
                value={selectedColumnId}
                onChange={(e) => setSelectedColumnId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500"
              >
                {columns.map((col) => (
                  <option key={col.id} value={col.id}>
                    {col.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                <Flag className="w-4 h-4 inline mr-1" />
                Priority
              </label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as 'low' | 'medium' | 'high')}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500"
              >
                <option value="low">🟢 Low</option>
                <option value="medium">🟡 Medium</option>
                <option value="high">🔴 High</option>
              </select>
            </div>
          </div>

          {/* Dates Row */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                <Calendar className="w-4 h-4 inline mr-1" />
                Start Date
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                <Calendar className="w-4 h-4 inline mr-1" />
                Due Date
              </label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Subtasks */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Subtasks {subtasks.length > 0 && `(${completedCount}/${subtasks.length})`}
            </label>
            
            {subtasks.length > 0 && (
              <div className="h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full mb-2 overflow-hidden">
                <div
                  className="h-full bg-green-500 transition-all duration-300"
                  style={{ width: `${(completedCount / subtasks.length) * 100}%` }}
                />
              </div>
            )}

            <div className="space-y-1 mb-2">
              {subtasks.map((subtask, index) => (
                <div
                  key={index}
                  className="flex items-center gap-2 p-2 bg-gray-50 dark:bg-gray-700/50 rounded-lg group"
                >
                  <button
                    onClick={() => toggleSubtask(index)}
                    className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                      subtask.completed
                        ? 'bg-green-500 border-green-500 text-white'
                        : 'border-gray-300 dark:border-gray-500 hover:border-green-500'
                    }`}
                  >
                    {subtask.completed && <Check className="w-3 h-3" />}
                  </button>
                  <span
                    className={`flex-1 text-sm ${
                      subtask.completed
                        ? 'text-gray-400 line-through'
                        : 'text-gray-700 dark:text-gray-300'
                    }`}
                  >
                    {subtask.title}
                  </span>
                  <button
                    onClick={() => removeSubtask(index)}
                    className="opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-red-500 transition-all"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>

            <div className="flex gap-2">
              <input
                type="text"
                value={newSubtask}
                onChange={(e) => setNewSubtask(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddSubtask()}
                placeholder="Add a subtask..."
                className="flex-1 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500"
              />
              <button
                onClick={handleAddSubtask}
                disabled={!newSubtask.trim()}
                className="px-3 py-2 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-50 transition-colors"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Review Items - only show for existing tasks */}
          {!isNew && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                <Image className="w-4 h-4 inline mr-1" />
                Review Items {reviewItems.length > 0 && `(${reviewItems.length})`}
              </label>

              {reviewItems.length > 0 && (
                <div className="grid grid-cols-3 gap-2 mb-2">
                  {reviewItems.map((item) => (
                    <a
                      key={item.id}
                      href={`/review?itemId=${item.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group relative aspect-video rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-700"
                    >
                      {item.type === 'video' ? (
                        <video
                          src={item.url}
                          className="w-full h-full object-cover"
                          muted
                          playsInline
                        />
                      ) : (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img
                          src={item.url}
                          alt={item.name}
                          className="w-full h-full object-cover"
                        />
                      )}
                      <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <Eye className="w-5 h-5 text-white" />
                      </div>
                      <div className={`absolute bottom-1 right-1 px-1.5 py-0.5 rounded text-xs text-white ${
                        item.status === 'approved' ? 'bg-green-500' :
                        item.status === 'rejected' ? 'bg-red-500' :
                        item.status === 'in_review' ? 'bg-yellow-500' : 'bg-gray-500'
                      }`}>
                        {item.status === 'in_review' ? 'In Review' : item.status}
                      </div>
                    </a>
                  ))}
                </div>
              )}

              <label className="flex items-center justify-center gap-2 p-3 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg cursor-pointer hover:border-blue-500 dark:hover:border-blue-500 transition-colors">
                <Upload className="w-4 h-4 text-gray-500" />
                <span className="text-sm text-gray-500">
                  {uploadingReview ? 'Uploading...' : 'Upload media for review'}
                </span>
                <input
                  type="file"
                  accept="image/*,video/*"
                  className="hidden"
                  onChange={handleReviewUpload}
                  disabled={uploadingReview}
                />
              </label>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 p-4 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !title.trim()}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {saving ? 'Saving...' : isNew ? 'Create Task' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}
