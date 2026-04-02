'use client';

import { useState, useEffect, useRef } from 'react';
import { 
  X, 
  Plus, 
  Check, 
  Trash2, 
  Calendar, 
  Flag, 
  LayoutGrid, 
  User,
  MessageSquare,
  Clock,
  Pencil,
  MoreHorizontal,
  Image as ImageIcon
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { TaskReviewPanel } from '@/components/review';

interface Tag {
  tag: { id: string; name: string; color: string };
}

interface Subtask {
  id: string;
  title: string;
  completed: boolean;
}

interface Assignee {
  id: string;
  displayName: string;
  avatar: string | null;
}

interface Activity {
  id: string;
  type: string;
  data: any;
  createdAt: string;
  user: { id: string; displayName: string; avatar: string | null };
}

interface Comment {
  id: string;
  content: string;
  createdAt: string;
  author: { id: string; displayName: string; avatar: string | null };
}

interface ReviewItem {
  id: string;
  type: string;
  url: string;
  thumbnailUrl?: string;
  name: string;
  status: string;
  version: number;
  uploadedBy: {
    id: string;
    displayName: string | null;
    avatar: string | null;
  };
  reviewers?: Array<{
    id: string;
    status: string;
    userId: string;
    user: {
      id: string;
      displayName: string | null;
      avatar: string | null;
      username?: string;
    };
    reviewedAt: string | null;
  }>;
  annotations: Array<{
    id: string;
    type: string;
    x: number | null;
    y: number | null;
    content: string;
    resolved: boolean;
    color: string;
    author: {
      id: string;
      displayName: string | null;
      avatar: string | null;
    };
    replies: Array<{
      id: string;
      content: string;
      author: {
        id: string;
        displayName: string | null;
        avatar: string | null;
      };
      createdAt: string;
    }>;
    createdAt: string;
  }>;
  createdAt: string;
}

interface TaskWithRelations {
  id: string;
  title: string;
  description: string | null;
  priority: string;
  columnId: string;
  dueDate: string | null;
  tags: Tag[];
  subtasks: Subtask[];
  assignee?: Assignee | null;
  createdAt?: string;
}

interface Column {
  id: string;
  name: string;
}

interface User {
  id: string;
  displayName: string;
  avatar: string | null;
}

interface TaskPanelProps {
  task: TaskWithRelations | null;
  columnId: string;
  columns: Column[];
  onClose: () => void;
  onUpdate: () => void;
}

export default function TaskPanel({ task, columnId, columns, onClose, onUpdate }: TaskPanelProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [isEditingDescription, setIsEditingDescription] = useState(false);
  const [priority, setPriority] = useState<'low' | 'medium' | 'high'>('medium');
  const [selectedColumnId, setSelectedColumnId] = useState(columnId);
  const [dueDate, setDueDate] = useState('');
  const [subtasks, setSubtasks] = useState<{ id?: string; title: string; completed: boolean }[]>([]);
  const [newSubtask, setNewSubtask] = useState('');
  const [saving, setSaving] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const [users, setUsers] = useState<User[]>([]);
  const [assigneeId, setAssigneeId] = useState<string | null>(null);
  const [comment, setComment] = useState('');
  const [comments, setComments] = useState<Comment[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [postingComment, setPostingComment] = useState(false);
  const [reviewItems, setReviewItems] = useState<ReviewItem[]>([]);
  const [loadingReviewItems, setLoadingReviewItems] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [reviewViewMode, setReviewViewMode] = useState<'grid' | 'review'>('grid');
  const [showReviewModal, setShowReviewModal] = useState(false);
  
  const panelRef = useRef<HTMLDivElement>(null);
  const isNew = !task;

  // Animate in on mount
  useEffect(() => {
    const timer = setTimeout(() => setIsVisible(true), 10);
    return () => clearTimeout(timer);
  }, []);

  // Fetch users for assignee dropdown and get current user
  useEffect(() => {
    fetch('/api/users')
      .then(res => res.json())
      .then(data => setUsers(data))
      .catch(() => setUsers([]));
    
    // Fetch current user
    fetch('/api/auth/me')
      .then(res => res.json())
      .then(data => {
        if (data?.user?.id) {
          setCurrentUserId(data.user.id);
        }
      })
      .catch(() => {});
  }, []);

  // Fetch comments for this task
  useEffect(() => {
    if (task?.id) {
      fetch(`/api/kanban/comments?taskId=${task.id}`)
        .then(res => res.json())
        .then(data => setComments(Array.isArray(data) ? data : []))
        .catch(() => setComments([]));
    }
  }, [task?.id]);

  // Fetch activity log for this task
  useEffect(() => {
    if (task?.id) {
      fetch(`/api/activity?taskId=${task.id}&limit=20`)
        .then(res => res.json())
        .then(data => setActivities(Array.isArray(data) ? data : []))
        .catch(() => setActivities([]));
    }
  }, [task?.id]);

  // Fetch review items for this task
  useEffect(() => {
    if (task?.id) {
      setLoadingReviewItems(true);
      fetch(`/api/review?taskId=${task.id}`)
        .then(res => res.json())
        .then(data => {
          const items = data?.items || data;
          setReviewItems(Array.isArray(items) ? items : []);
        })
        .catch(() => setReviewItems([]))
        .finally(() => setLoadingReviewItems(false));
    }
  }, [task?.id]);

  useEffect(() => {
    if (task) {
      setTitle(task.title);
      setDescription(task.description || '');
      setPriority(task.priority as 'low' | 'medium' | 'high');
      setSelectedColumnId(task.columnId);
      setDueDate(task.dueDate ? new Date(task.dueDate).toISOString().split('T')[0] : '');
      setSubtasks(task.subtasks.map(s => ({ id: s.id, title: s.title, completed: s.completed })));
      setAssigneeId(task.assignee?.id || null);
      setIsEditingDescription(false);
      // Reset review mode when task changes
      setReviewViewMode('grid');
      setShowReviewModal(false);
    } else {
      // New task - start with description editable
      setIsEditingDescription(true);
    }
  }, [task]);

  // Handle click outside to close
  const modalRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node;
      // Don't close if clicking inside the panel OR inside the fullscreen modal
      if (panelRef.current && !panelRef.current.contains(target)) {
        if (modalRef.current && modalRef.current.contains(target)) {
          // Click is inside the fullscreen modal, don't close
          return;
        }
        handleClose();
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleClose = () => {
    setIsVisible(false);
    setTimeout(onClose, 200);
  };

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
        subtasks,
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
      handleClose();
    } catch (error) {
      console.error('Failed to save task:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleAddComment = async () => {
    if (!comment.trim() || !task?.id || postingComment) return;
    
    setPostingComment(true);
    try {
      const res = await fetch('/api/kanban/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId: task.id, content: comment.trim() }),
      });
      
      if (res.ok) {
        const newComment = await res.json();
        setComments(prev => [newComment, ...prev]);
        setComment('');
      }
    } catch (error) {
      console.error('Failed to add comment:', error);
    } finally {
      setPostingComment(false);
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

  // Helper to determine media type from filename/MIME
  const getMediaType = (filename: string, mimeType?: string): 'image' | 'video' => {
    const videoExtensions = ['.mp4', '.webm', '.mov', '.avi', '.mkv', '.m4v'];
    const lowerName = filename.toLowerCase();
    
    for (const ext of videoExtensions) {
      if (lowerName.endsWith(ext)) return 'video';
    }
    
    if (mimeType?.startsWith('video/')) return 'video';
    
    return 'image';
  };

  // Review item handlers
  const handleUploadReviewItem = async (file: File) => {
    if (!task?.id) return;

    // Step 1: Upload file to get URL
    const formData = new FormData();
    formData.append('file', file);

    const uploadRes = await fetch('/api/upload', {
      method: 'POST',
      body: formData,
    });

    if (!uploadRes.ok) {
      console.error('Failed to upload file');
      return;
    }

    const uploadData = await uploadRes.json();

    // Determine media type from file
    const mediaType = getMediaType(file.name, file.type);

    // Step 2: Create review item with JSON (include thumbnail if available)
    const res = await fetch('/api/review', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: file.name,
        url: uploadData.url,
        thumbnailUrl: uploadData.thumbnailUrl,
        type: mediaType,
        taskId: task.id,
      }),
    });

    if (res.ok) {
      const newItem = await res.json();
      setReviewItems(prev => [...prev, newItem]);
    }
  };

  const handleAnnotationCreate = async (reviewItemId: string, annotation: { type: string; x: number; y: number; content: string }) => {
    const res = await fetch(`/api/review/${reviewItemId}/annotations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(annotation),
    });

    if (res.ok) {
      // Refresh review items to get updated annotations
      const refreshRes = await fetch(`/api/review?taskId=${task?.id}`);
      if (refreshRes.ok) {
        const data = await refreshRes.json();
        const items = data?.items || data;
        setReviewItems(Array.isArray(items) ? items : []);
      }
    }
  };

  const handleAnnotationResolve = async (annotationId: string, resolved: boolean) => {
    await fetch(`/api/annotations/${annotationId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resolved }),
    });

    // Refresh review items
    const refreshRes = await fetch(`/api/review?taskId=${task?.id}`);
    if (refreshRes.ok) {
      const data = await refreshRes.json();
      const items = data?.items || data;
      setReviewItems(Array.isArray(items) ? items : []);
    }
  };

  const handleAnnotationReply = async (annotationId: string, content: string) => {
    await fetch(`/api/annotations/${annotationId}/replies`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    });

    // Refresh review items
    const refreshRes = await fetch(`/api/review?taskId=${task?.id}`);
    if (refreshRes.ok) {
      const data = await refreshRes.json();
      const items = data?.items || data;
      setReviewItems(Array.isArray(items) ? items : []);
    }
  };

  const handleStatusChange = async (reviewItemId: string, status: string) => {
    await fetch('/api/review', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: reviewItemId, status }),
    });

    // Refresh review items
    const refreshRes = await fetch(`/api/review?taskId=${task?.id}`);
    if (refreshRes.ok) {
      const data = await refreshRes.json();
      const items = data?.items || data;
      setReviewItems(Array.isArray(items) ? items : []);
    }
  };

  const handleAssignReviewers = async (reviewItemId: string, userIds: string[]) => {
    await fetch(`/api/review/${reviewItemId}/assign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userIds }),
    });

    // Refresh review items
    const refreshRes = await fetch(`/api/review?taskId=${task?.id}`);
    if (refreshRes.ok) {
      const data = await refreshRes.json();
      const items = data?.items || data;
      setReviewItems(Array.isArray(items) ? items : []);
    }
  };

  const handleRemoveReviewer = async (reviewItemId: string, userId: string) => {
    await fetch(`/api/review/${reviewItemId}/assign?userId=${userId}`, {
      method: 'DELETE',
    });

    // Refresh review items
    const refreshRes = await fetch(`/api/review?taskId=${task?.id}`);
    if (refreshRes.ok) {
      const data = await refreshRes.json();
      const items = data?.items || data;
      setReviewItems(Array.isArray(items) ? items : []);
    }
  };

  const handleApprove = async (reviewItemId: string) => {
    await fetch(`/api/review/${reviewItemId}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });

    // Refresh review items
    const refreshRes = await fetch(`/api/review?taskId=${task?.id}`);
    if (refreshRes.ok) {
      const data = await refreshRes.json();
      const items = data?.items || data;
      setReviewItems(Array.isArray(items) ? items : []);
    }
  };

  const handleReject = async (reviewItemId: string, reason?: string) => {
    await fetch(`/api/review/${reviewItemId}/reject`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason }),
    });

    // Refresh review items
    const refreshRes = await fetch(`/api/review?taskId=${task?.id}`);
    if (refreshRes.ok) {
      const data = await refreshRes.json();
      const items = data?.items || data;
      setReviewItems(Array.isArray(items) ? items : []);
    }
  };

  const formatActivityDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return date.toLocaleDateString();
  };

  const getActivityText = (activity: Activity) => {
    const data = activity.data || {};
    switch (activity.type) {
      case 'task_created': return 'created this task';
      case 'task_updated': return 'updated this task';
      case 'task_moved': return `moved to ${data.column || 'another column'}`;
      case 'task_completed': return 'marked as complete';
      case 'comment_added': return `commented: "${data.text?.substring(0, 50) || '...'}"`;
      case 'assignee_changed': return `assigned to ${data.assignee || 'someone'}`;
      case 'priority_changed': return `set priority to ${data.priority || 'unknown'}`;
      default: return activity.type.replace(/_/g, ' ');
    }
  };

  const completedCount = subtasks.filter(s => s.completed).length;

  const priorityColors = {
    low: 'bg-green-500/20 text-green-400',
    medium: 'bg-yellow-500/20 text-yellow-400',
    high: 'bg-red-500/20 text-red-400',
  };

  const openAnnotationCount = reviewItems.reduce(
    (acc, item) => acc + (item.annotations || []).filter(a => !a.resolved).length,
    0
  );

  return (
    <>
      {/* Backdrop */}
      <div 
        className={cn(
          'fixed inset-0 bg-black/30 z-40 transition-opacity duration-200',
          isVisible ? 'opacity-100' : 'opacity-0'
        )}
      />
      
      {/* Side Panel */}
      <div
        ref={panelRef}
        className={cn(
          'fixed right-0 top-0 h-full w-full bg-white dark:bg-[#1E1F22] shadow-2xl z-50',
          'flex flex-col transform transition-all duration-200 ease-out',
          isVisible ? 'translate-x-0' : 'translate-x-full',
          // Wider when in review mode
          reviewViewMode === 'review' ? 'max-w-4xl' : 'max-w-xl'
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2">
            <button
              onClick={handleClose}
              className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="flex items-center gap-2">
            <button className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors">
              <MoreHorizontal className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto">
          {/* Title Section */}
          <div className="px-6 py-4">
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Task title"
              className="w-full text-2xl font-bold bg-transparent text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none"
              autoFocus={isNew}
            />
          </div>

          {/* Properties Section */}
          <div className="px-6 py-2 border-b border-gray-100 dark:border-gray-800">
            <div className="space-y-3">
              {/* Status/Column */}
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2 w-32 text-sm text-gray-500">
                  <LayoutGrid className="w-4 h-4" />
                  <span>Status</span>
                </div>
                <select
                  value={selectedColumnId}
                  onChange={(e) => setSelectedColumnId(e.target.value)}
                  className="flex-1 px-3 py-1.5 text-sm bg-gray-100 dark:bg-gray-800 rounded-lg border-0 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500"
                >
                  {columns.map((col) => (
                    <option key={col.id} value={col.id}>
                      {col.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Assignee */}
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2 w-32 text-sm text-gray-500">
                  <User className="w-4 h-4" />
                  <span>Assignee</span>
                </div>
                <select
                  value={assigneeId || ''}
                  onChange={(e) => setAssigneeId(e.target.value || null)}
                  className="flex-1 px-3 py-1.5 text-sm bg-gray-100 dark:bg-gray-800 rounded-lg border-0 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Unassigned</option>
                  {users.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.displayName}
                    </option>
                  ))}
                </select>
              </div>

              {/* Priority */}
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2 w-32 text-sm text-gray-500">
                  <Flag className="w-4 h-4" />
                  <span>Priority</span>
                </div>
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value as 'low' | 'medium' | 'high')}
                  className={cn(
                    'px-3 py-1.5 text-sm rounded-lg border-0 focus:ring-2 focus:ring-blue-500',
                    priorityColors[priority]
                  )}
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </div>

              {/* Due Date */}
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2 w-32 text-sm text-gray-500">
                  <Calendar className="w-4 h-4" />
                  <span>Due date</span>
                </div>
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="px-3 py-1.5 text-sm bg-gray-100 dark:bg-gray-800 rounded-lg border-0 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>

          {/* Description Section - Read-only with Edit option */}
          <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-medium text-gray-500">Description</h3>
              {!isEditingDescription && !isNew && (
                <button
                  onClick={() => setIsEditingDescription(true)}
                  className="flex items-center gap-1 text-xs text-blue-500 hover:text-blue-600"
                >
                  <Pencil className="w-3 h-3" />
                  Edit
                </button>
              )}
            </div>
            
            {isEditingDescription ? (
              <div>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Add a description..."
                  rows={4}
                  className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                  autoFocus
                />
                {!isNew && (
                  <div className="flex justify-end gap-2 mt-2">
                    <button
                      onClick={() => {
                        setDescription(task?.description || '');
                        setIsEditingDescription(false);
                      }}
                      className="px-3 py-1 text-xs text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => setIsEditingDescription(false)}
                      className="px-3 py-1 text-xs bg-blue-500 text-white rounded hover:bg-blue-600"
                    >
                      Done
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                {description || <span className="text-gray-400 italic">No description</span>}
              </div>
            )}
          </div>

          {/* Review Items Section */}
          {!isNew && (
            <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800">
              <h3 className="text-sm font-medium text-gray-500 mb-3 flex items-center gap-2">
                <ImageIcon className="w-4 h-4" />
                Review Items {reviewItems.length > 0 && `(${reviewItems.length})`}
                {openAnnotationCount > 0 && (
                  <span className="ml-auto px-2 py-0.5 text-xs bg-yellow-500/20 text-yellow-400 rounded">
                    {openAnnotationCount} open
                  </span>
                )}
              </h3>
              
              {loadingReviewItems ? (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500"></div>
                </div>
              ) : (
                <TaskReviewPanel
                  taskId={task.id}
                  reviewItems={reviewItems}
                  currentUserId={currentUserId || undefined}
                  onUpload={handleUploadReviewItem}
                  onAnnotationCreate={handleAnnotationCreate}
                  onAnnotationResolve={handleAnnotationResolve}
                  onAnnotationReply={handleAnnotationReply}
                  onStatusChange={handleStatusChange}
                  onAssignReviewers={handleAssignReviewers}
                  onRemoveReviewer={handleRemoveReviewer}
                  onApprove={handleApprove}
                  onReject={handleReject}
                  onViewModeChange={setReviewViewMode}
                  onPopOut={() => setShowReviewModal(true)}
                />
              )}
            </div>
          )}

          {/* Comments Section */}
          <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800">
            <h3 className="text-sm font-medium text-gray-500 mb-3 flex items-center gap-2">
              <MessageSquare className="w-4 h-4" />
              Comments {comments.length > 0 && `(${comments.length})`}
            </h3>
            
            {/* Add Comment Input */}
            <div className="flex items-start gap-3 mb-4">
              <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-white text-sm font-medium flex-shrink-0">
                T
              </div>
              <div className="flex-1">
                <textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleAddComment();
                    }
                  }}
                  placeholder="Write a comment..."
                  rows={2}
                  className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                />
                {comment.trim() && (
                  <div className="flex justify-end mt-2">
                    <button
                      onClick={handleAddComment}
                      disabled={postingComment}
                      className="px-3 py-1 text-xs bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
                    >
                      {postingComment ? 'Posting...' : 'Comment'}
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Comments List */}
            {comments.length > 0 && (
              <div className="space-y-3 mt-4 pt-4 border-t border-gray-100 dark:border-gray-800">
                {comments.map((c) => (
                  <div key={c.id} className="flex items-start gap-3">
                    <div className="w-7 h-7 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-xs font-medium text-gray-600 dark:text-gray-400 flex-shrink-0">
                      {c.author?.avatar ? (
                        <img src={c.author.avatar} className="w-full h-full rounded-full" alt="" />
                      ) : (
                        c.author?.displayName?.charAt(0) || '?'
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                          {c.author?.displayName || 'Unknown'}
                        </span>
                        <span className="text-xs text-gray-400">
                          {formatActivityDate(c.createdAt)}
                        </span>
                      </div>
                      <p className="text-sm text-gray-700 dark:text-gray-300 mt-0.5 whitespace-pre-wrap">
                        {c.content}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Subtasks Section */}
          <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium text-gray-500">
                Subtasks {subtasks.length > 0 && `(${completedCount}/${subtasks.length})`}
              </h3>
            </div>
            
            {subtasks.length > 0 && (
              <div className="h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full mb-3 overflow-hidden">
                <div
                  className="h-full bg-green-500 transition-all duration-300"
                  style={{ width: `${(completedCount / subtasks.length) * 100}%` }}
                />
              </div>
            )}

            <div className="space-y-1 mb-3">
              {subtasks.map((subtask, index) => (
                <div
                  key={index}
                  className="flex items-center gap-3 p-2 hover:bg-gray-50 dark:hover:bg-gray-800/50 rounded-lg group"
                >
                  <button
                    onClick={() => toggleSubtask(index)}
                    className={cn(
                      'w-5 h-5 rounded border-2 flex items-center justify-center transition-colors flex-shrink-0',
                      subtask.completed
                        ? 'bg-green-500 border-green-500 text-white'
                        : 'border-gray-300 dark:border-gray-600 hover:border-green-500'
                    )}
                  >
                    {subtask.completed && <Check className="w-3 h-3" />}
                  </button>
                  <span
                    className={cn(
                      'flex-1 text-sm',
                      subtask.completed
                        ? 'text-gray-400 line-through'
                        : 'text-gray-700 dark:text-gray-300'
                    )}
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
                className="flex-1 px-3 py-2 text-sm bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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

          {/* Activity Log Section - Read-only */}
          <div className="px-6 py-4">
            <h3 className="text-sm font-medium text-gray-500 mb-3 flex items-center gap-2">
              <Clock className="w-4 h-4" />
              Activity
            </h3>
            
            <div className="space-y-3">
              {activities.length === 0 ? (
                <div className="text-center py-4">
                  <Clock className="w-8 h-8 mx-auto mb-2 text-gray-300 dark:text-gray-600" />
                  <p className="text-sm text-gray-400">No activity yet</p>
                </div>
              ) : (
                activities.map((activity) => (
                  <div key={activity.id} className="flex items-start gap-3">
                    <div className="w-6 h-6 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-xs font-medium text-gray-600 dark:text-gray-400 flex-shrink-0">
                      {activity.user?.avatar ? (
                        <img src={activity.user.avatar} className="w-full h-full rounded-full" alt="" />
                      ) : (
                        activity.user?.displayName?.charAt(0) || '?'
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-700 dark:text-gray-300">
                        <span className="font-medium">{activity.user?.displayName || 'Someone'}</span>
                        {' '}{getActivityText(activity)}
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {formatActivityDate(activity.createdAt)}
                      </p>
                    </div>
                  </div>
                ))
              )}
              
              {task?.createdAt && activities.length === 0 && (
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-xs">
                    <Plus className="w-3 h-3 text-gray-500" />
                  </div>
                  <div>
                    <p className="text-sm text-gray-700 dark:text-gray-300">Task created</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {formatActivityDate(task.createdAt)}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex-shrink-0 flex justify-between items-center gap-3 px-6 py-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
          {!isNew && (
            <button
              onClick={async () => {
                if (confirm('Delete this task?')) {
                  await fetch(`/api/kanban/tasks?id=${task.id}`, { method: 'DELETE' });
                  onUpdate();
                  handleClose();
                }
              }}
              className="flex items-center gap-2 px-3 py-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
            >
              <Trash2 className="w-4 h-4" />
              <span className="text-sm">Delete</span>
            </button>
          )}
          <div className="flex-1" />
          <button
            onClick={handleClose}
            className="px-4 py-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !title.trim()}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {saving ? 'Saving...' : isNew ? 'Create' : 'Save'}
          </button>
        </div>
      </div>

      {/* Fullscreen Review Modal */}
      {showReviewModal && task && (
        <div ref={modalRef} className="fixed inset-0 z-[60] flex items-center justify-center">
          {/* Backdrop */}
          <div 
            className="absolute inset-0 bg-black/70"
            onClick={() => setShowReviewModal(false)}
          />
          {/* Modal */}
          <div 
            className="relative z-10 w-[90vw] h-[90vh] bg-zinc-900 rounded-xl shadow-2xl overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-700">
              <h2 className="text-lg font-semibold text-white">Review: {task.title}</h2>
              <button
                onClick={() => setShowReviewModal(false)}
                className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-700 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            {/* Modal Content */}
            <div className="flex-1 overflow-hidden p-6">
              <TaskReviewPanel
                taskId={task.id}
                reviewItems={reviewItems}
                currentUserId={currentUserId || undefined}
                fullscreen={true}
                onUpload={handleUploadReviewItem}
                onAnnotationCreate={handleAnnotationCreate}
                onAnnotationResolve={handleAnnotationResolve}
                onAnnotationReply={handleAnnotationReply}
                onStatusChange={handleStatusChange}
                onAssignReviewers={handleAssignReviewers}
                onRemoveReviewer={handleRemoveReviewer}
                onApprove={handleApprove}
                onReject={handleReject}
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
