'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { 
  LayoutGrid, 
  Calendar, 
  FileText, 
  Settings, 
  ChevronLeft,
  MoreHorizontal,
  Star,
  Clock,
  Archive,
  Trash2,
  CheckCircle2,
  Circle,
  PlayCircle,
  Users,
  CalendarDays,
  TrendingUp,
  Plus
} from 'lucide-react';
import { cn } from '@/lib/utils';
import KanbanBoard from '@/components/kanban/KanbanBoard';
import ActivityPanel from '@/components/kanban/ActivityPanel';
import ProjectCalendar from '@/components/kanban/ProjectCalendar';
import TaskPanel from '@/components/kanban/TaskPanel';

interface Project {
  id: string;
  name: string;
  description: string | null;
  color: string;
  createdAt: string;
  columns?: Column[];
}

interface Column {
  id: string;
  name: string;
  tasks: Task[];
}

interface Task {
  id: string;
  title: string;
  priority: string;
  dueDate: string | null;
  assignee?: { id: string; displayName: string; avatar: string | null };
}

interface Activity {
  id: string;
  type: string;
  data: any;
  createdAt: string;
  user: { id: string; displayName: string; avatar: string | null };
}

type TabKey = 'overview' | 'kanban' | 'calendar';

interface Tab {
  key: TabKey;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

const tabs: Tab[] = [
  { key: 'overview', label: 'Overview', icon: FileText },
  { key: 'kanban', label: 'Kanban', icon: LayoutGrid },
  { key: 'calendar', label: 'Calendar', icon: Calendar },
];

export default function ProjectPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  
  const projectId = params.id as string;
  const currentTab = (searchParams.get('tab') as TabKey) || 'overview';
  
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [showActivity, setShowActivity] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [calendarSelectedTask, setCalendarSelectedTask] = useState<any>(null);
  const [calendarSelectedColumnId, setCalendarSelectedColumnId] = useState<string>('');
  const [columns, setColumns] = useState<any[]>([]);
  const moreMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (projectId) {
      fetchProject();
    }
  }, [projectId]);

  // Close menu when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (moreMenuRef.current && !moreMenuRef.current.contains(event.target as Node)) {
        setShowMoreMenu(false);
      }
    }
    if (showMoreMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showMoreMenu]);

  const handleCalendarTaskClick = useCallback(async (taskId: string) => {
    try {
      const res = await fetch(`/api/kanban/projects?id=${projectId}`);
      if (!res.ok) return;
      const data = await res.json();
      setColumns(data.columns || []);
      for (const col of (data.columns || [])) {
        const task = col.tasks?.find((t: any) => t.id === taskId);
        if (task) {
          setCalendarSelectedTask(task);
          setCalendarSelectedColumnId(col.id);
          return;
        }
      }
    } catch (error) {
      console.error('Failed to fetch task for panel:', error);
    }
  }, [projectId]);

  const fetchProject = async () => {
    try {
      const res = await fetch(`/api/kanban/projects?id=${projectId}`);
      if (res.ok) {
        const data = await res.json();
        setProject(data);
        setColumns(data.columns || []);
      } else {
        console.error('Failed to fetch project');
      }
    } catch (error) {
      console.error('Failed to fetch project:', error);
    } finally {
      setLoading(false);
    }
  };

  const setTab = useCallback((tab: TabKey) => {
    const params = new URLSearchParams(searchParams.toString());
    if (tab === 'overview') {
      params.delete('tab');
    } else {
      params.set('tab', tab);
    }
    const query = params.toString();
    router.push(`/project/${projectId}${query ? `?${query}` : ''}`, { scroll: false });
  }, [projectId, router, searchParams]);

  const handleArchive = async () => {
    if (!confirm(`Archive project "${project?.name}"? You can view archived projects later.`)) {
      return;
    }
    try {
      const res = await fetch('/api/kanban/projects', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: projectId, archived: true }),
      });
      if (res.ok) {
        router.push('/kanban');
      }
    } catch (error) {
      console.error('Failed to archive project:', error);
    }
    setShowMoreMenu(false);
  };

  const handleDelete = async () => {
    if (!confirm(`Permanently delete project "${project?.name}"? This will also delete all tasks and cannot be undone.`)) {
      return;
    }
    try {
      const res = await fetch(`/api/kanban/projects?id=${projectId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        router.push('/kanban');
      }
    } catch (error) {
      console.error('Failed to delete project:', error);
    }
    setShowMoreMenu(false);
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-gray-500">
        <p className="text-lg mb-2">Project not found</p>
        <button
          onClick={() => router.push('/kanban')}
          className="text-blue-500 hover:text-blue-400"
        >
          Go to Kanban
        </button>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Project Header */}
      <div className="flex-shrink-0 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
        {/* Top row: project name and actions */}
        <div className="flex items-center justify-between px-3 md:px-6 py-3 md:py-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push('/kanban')}
              className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors text-gray-500"
              title="Back to Kanban"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            
            <div 
              className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-semibold text-sm"
              style={{ backgroundColor: project.color }}
            >
              {project.name.charAt(0).toUpperCase()}
            </div>
            
            <div>
              <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">
                {project.name}
              </h1>
              {project.description && (
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {project.description}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowActivity(!showActivity)}
              className={cn(
                'p-2 rounded-lg transition-colors',
                showActivity 
                  ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600' 
                  : 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500'
              )}
              title="Activity"
            >
              <Clock className="w-5 h-5" />
            </button>
            <button
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg text-gray-500 transition-colors"
              title="Favorite"
            >
              <Star className="w-5 h-5" />
            </button>
            <button
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg text-gray-500 transition-colors"
              title="Settings"
            >
              <Settings className="w-5 h-5" />
            </button>
            
            {/* More Menu with Archive/Delete */}
            <div className="relative" ref={moreMenuRef}>
              <button
                onClick={() => setShowMoreMenu(!showMoreMenu)}
                className={cn(
                  'p-2 rounded-lg transition-colors',
                  showMoreMenu 
                    ? 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200' 
                    : 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500'
                )}
                title="More"
              >
                <MoreHorizontal className="w-5 h-5" />
              </button>
              
              {showMoreMenu && (
                <div className="absolute right-0 top-full mt-1 w-48 bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 z-50 py-1">
                  <button
                    onClick={handleArchive}
                    className="w-full flex items-center gap-3 px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                  >
                    <Archive className="w-4 h-4 text-yellow-500" />
                    Archive Project
                  </button>
                  <button
                    onClick={handleDelete}
                    className="w-full flex items-center gap-3 px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
                  >
                    <Trash2 className="w-4 h-4" />
                    Delete Project
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Tab bar */}
        <div className="flex items-center gap-1 px-3 md:px-6 overflow-x-auto">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = currentTab === tab.key;
            
            return (
              <button
                key={tab.key}
                onClick={() => setTab(tab.key)}
                className={cn(
                  'flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px',
                  isActive
                    ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                    : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:border-gray-300'
                )}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab Content + Activity Panel */}
      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 overflow-hidden">
          {currentTab === 'overview' && (
            <OverviewTab projectId={projectId} project={project} />
          )}
          
          {currentTab === 'kanban' && (
            <KanbanBoard projectId={projectId} />
          )}
          
          {currentTab === 'calendar' && (
            <ProjectCalendar projectId={projectId} onTaskClick={handleCalendarTaskClick} />
          )}

          {/* Task Panel for Calendar/Gantt clicks */}
          {calendarSelectedTask && currentTab === 'calendar' && (
            <TaskPanel
              task={calendarSelectedTask}
              columnId={calendarSelectedColumnId}
              columns={columns}
              onClose={() => setCalendarSelectedTask(null)}
              onUpdate={() => fetchProject()}
            />
          )}
        </div>

        {/* Activity Panel */}
        {showActivity && (
          <ActivityPanel 
            projectId={projectId}
            onClose={() => setShowActivity(false)}
          />
        )}
      </div>
    </div>
  );
}

// Overview Tab Component - Now with real data!
function OverviewTab({ projectId, project }: { projectId: string; project: Project }) {
  const [stats, setStats] = useState({ backlog: 0, inProgress: 0, done: 0, total: 0 });
  const [activities, setActivities] = useState<Activity[]>([]);
  const [recentTasks, setRecentTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    fetchOverviewData();
  }, [projectId]);

  const fetchOverviewData = async () => {
    try {
      // Fetch project with columns and tasks for stats
      const projectRes = await fetch(`/api/kanban/projects?id=${projectId}`);
      if (projectRes.ok) {
        const data = await projectRes.json();
        
        // Calculate stats from columns
        let backlog = 0, inProgress = 0, done = 0;
        const allTasks: Task[] = [];
        
        if (data.columns) {
          for (const col of data.columns) {
            const taskCount = col.tasks?.length || 0;
            const colName = col.name.toLowerCase();
            
            if (colName.includes('done') || colName.includes('complete')) {
              done += taskCount;
            } else if (colName.includes('progress') || colName.includes('doing') || colName.includes('active')) {
              inProgress += taskCount;
            } else {
              backlog += taskCount;
            }
            
            if (col.tasks) {
              allTasks.push(...col.tasks);
            }
          }
        }
        
        setStats({ backlog, inProgress, done, total: backlog + inProgress + done });
        
        // Get 5 most recent tasks (sort by createdAt if available)
        setRecentTasks(allTasks.slice(0, 5));
      }

      // Fetch recent activity
      const activityRes = await fetch(`/api/activity?projectId=${projectId}&limit=10`);
      if (activityRes.ok) {
        const activityData = await activityRes.json();
        setActivities(activityData);
      }
    } catch (error) {
      console.error('Failed to fetch overview data:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
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

  const getActivityIcon = (type: string) => {
    switch (type) {
      case 'task_created': return <Plus className="w-4 h-4 text-green-500" />;
      case 'task_completed': return <CheckCircle2 className="w-4 h-4 text-blue-500" />;
      case 'task_moved': return <PlayCircle className="w-4 h-4 text-yellow-500" />;
      default: return <Circle className="w-4 h-4 text-gray-400" />;
    }
  };

  const getActivityText = (activity: Activity) => {
    const data = activity.data || {};
    switch (activity.type) {
      case 'task_created':
        return `created task "${data.title || 'Untitled'}"`;
      case 'task_completed':
        return `completed "${data.title || 'a task'}"`;
      case 'task_moved':
        return `moved "${data.title || 'a task'}" to ${data.column || 'another column'}`;
      case 'comment_added':
        return `commented on "${data.task || 'a task'}"`;
      default:
        return activity.type.replace(/_/g, ' ');
    }
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto p-6">
      <div className="max-w-5xl mx-auto space-y-6">
        
        {/* Project Header Card */}
        <div className="bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-900 rounded-xl p-6 border border-gray-200 dark:border-gray-700">
          <div className="flex items-start gap-4">
            <div 
              className="w-14 h-14 rounded-xl flex items-center justify-center text-white text-2xl font-bold flex-shrink-0"
              style={{ backgroundColor: project.color }}
            >
              {project.name.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                {project.name}
              </h2>
              <p className="text-gray-600 dark:text-gray-400 mt-1">
                {project.description || 'No description provided'}
              </p>
              <div className="flex items-center gap-4 mt-3 text-sm text-gray-500">
                <span className="flex items-center gap-1">
                  <CalendarDays className="w-4 h-4" />
                  Created {formatDate(project.createdAt)}
                </span>
                <span className="flex items-center gap-1">
                  <LayoutGrid className="w-4 h-4" />
                  {stats.total} tasks
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl p-5 border border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-gray-100 dark:bg-gray-700 rounded-lg">
                <Circle className="w-5 h-5 text-gray-500" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{stats.backlog}</p>
                <p className="text-sm text-gray-500">Backlog</p>
              </div>
            </div>
          </div>
          
          <div className="bg-white dark:bg-gray-800 rounded-xl p-5 border border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                <PlayCircle className="w-5 h-5 text-blue-500" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{stats.inProgress}</p>
                <p className="text-sm text-gray-500">In Progress</p>
              </div>
            </div>
          </div>
          
          <div className="bg-white dark:bg-gray-800 rounded-xl p-5 border border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg">
                <CheckCircle2 className="w-5 h-5 text-green-500" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{stats.done}</p>
                <p className="text-sm text-gray-500">Completed</p>
              </div>
            </div>
          </div>
          
          <div className="bg-white dark:bg-gray-800 rounded-xl p-5 border border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
                <TrendingUp className="w-5 h-5 text-purple-500" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                  {stats.total > 0 ? Math.round((stats.done / stats.total) * 100) : 0}%
                </p>
                <p className="text-sm text-gray-500">Complete</p>
              </div>
            </div>
          </div>
        </div>

        {/* Two Column Layout: Recent Tasks + Activity */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          
          {/* Recent Tasks */}
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
            <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
              <h3 className="font-semibold text-gray-900 dark:text-gray-100">Recent Tasks</h3>
              <button 
                onClick={() => router.push(`/project/${projectId}?tab=kanban`)}
                className="text-sm text-blue-500 hover:text-blue-600"
              >
                View all
              </button>
            </div>
            <div className="divide-y divide-gray-100 dark:divide-gray-700">
              {recentTasks.length === 0 ? (
                <div className="p-5 text-center text-gray-500">
                  <p>No tasks yet</p>
                  <button 
                    onClick={() => router.push(`/project/${projectId}?tab=kanban`)}
                    className="mt-2 text-sm text-blue-500 hover:text-blue-600"
                  >
                    Create your first task →
                  </button>
                </div>
              ) : (
                recentTasks.map((task) => (
                  <div key={task.id} className="px-5 py-3 hover:bg-gray-50 dark:hover:bg-gray-700/50">
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        'w-2 h-2 rounded-full',
                        task.priority === 'high' ? 'bg-red-500' :
                        task.priority === 'medium' ? 'bg-yellow-500' : 'bg-gray-400'
                      )} />
                      <span className="flex-1 text-sm text-gray-900 dark:text-gray-100 truncate">
                        {task.title}
                      </span>
                      {task.assignee && (
                        <div className="w-6 h-6 rounded-full bg-gray-200 dark:bg-gray-600 flex items-center justify-center text-xs">
                          {task.assignee.avatar ? (
                            <img src={task.assignee.avatar} className="w-full h-full rounded-full" alt="" />
                          ) : (
                            task.assignee.displayName?.charAt(0) || '?'
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Recent Activity */}
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
            <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-700">
              <h3 className="font-semibold text-gray-900 dark:text-gray-100">Recent Activity</h3>
            </div>
            <div className="divide-y divide-gray-100 dark:divide-gray-700 max-h-80 overflow-y-auto">
              {activities.length === 0 ? (
                <div className="p-5 text-center text-gray-500">
                  <Clock className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                  <p>No activity yet</p>
                  <p className="text-sm mt-1">Activity will appear here as you work</p>
                </div>
              ) : (
                activities.map((activity) => (
                  <div key={activity.id} className="px-5 py-3 hover:bg-gray-50 dark:hover:bg-gray-700/50">
                    <div className="flex items-start gap-3">
                      {getActivityIcon(activity.type)}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-gray-900 dark:text-gray-100">
                          <span className="font-medium">{activity.user?.displayName || 'Someone'}</span>
                          {' '}{getActivityText(activity)}
                        </p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {formatDate(activity.createdAt)}
                        </p>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
          <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-4">Quick Actions</h3>
          <div className="flex gap-3">
            <button
              onClick={() => router.push(`/project/${projectId}?tab=kanban`)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add Task
            </button>
            <button
              onClick={() => router.push(`/project/${projectId}?tab=calendar`)}
              className="flex items-center gap-2 px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
            >
              <Calendar className="w-4 h-4" />
              View Calendar
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
