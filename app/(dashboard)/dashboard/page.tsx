import { getCurrentUser } from '@/lib/auth';
import prisma from '@/lib/db';
import { cookies } from 'next/headers';
import { LayoutGrid, MessageSquare, Users, Bell, TrendingUp, Clock, Bot } from 'lucide-react';
import Link from 'next/link';

// Helper for relative time
function getRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

type DueBucket = 'overdue' | 'today' | 'tomorrow' | 'this_week' | 'next_month' | 'later' | 'no_date';

function getDueBucket(dueDate: Date | null, completedAt: Date | null): DueBucket {
  if (!dueDate) return 'no_date';
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const due = new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate());
  const diffDays = Math.round((due.getTime() - today.getTime()) / 86400000);
  if (diffDays < 0 && !completedAt) return 'overdue';
  if (diffDays === 0) return 'today';
  if (diffDays === 1) return 'tomorrow';
  if (diffDays <= 7) return 'this_week';
  if (diffDays <= 30) return 'next_month';
  return 'later';
}

const BUCKET_LABELS: Record<DueBucket, string> = {
  overdue: 'Overdue',
  today: 'Today',
  tomorrow: 'Tomorrow',
  this_week: 'This week',
  next_month: 'Next month',
  later: 'Later',
  no_date: 'No due date',
};

const BUCKET_ORDER: DueBucket[] = ['overdue', 'today', 'tomorrow', 'this_week', 'next_month', 'later', 'no_date'];

export default async function DashboardPage() {
  const user = await getCurrentUser();
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  // Resolve active workspace from cookie (set by WorkspaceContext client-side)
  const cookieStore = await cookies();
  let workspaceId = cookieStore.get('mc-workspace')?.value || null;

  // Fall back to user's first workspace membership if cookie not set yet
  if (!workspaceId && user) {
    const membership = await prisma.workspaceMember.findFirst({
      where: { userId: user.id },
      select: { workspaceId: true },
    });
    workspaceId = membership?.workspaceId ?? null;
  }

  const workspaceFilter = workspaceId ? { project: { workspaceId } } : {};
  const channelWorkspaceFilter = workspaceId ? { channel: { workspaceId } } : {};

  // Get all columns with task counts (columns represent status)
  const columns = await prisma.column.findMany({
    where: workspaceFilter,
    include: {
      _count: { select: { tasks: true } },
      project: { select: { name: true } },
    }
  });

  // Calculate task stats by column name
  let totalTasks = 0;
  let inProgressTasks = 0;
  let doneTasks = 0;
  let backlogTasks = 0;

  for (const col of columns) {
    const count = col._count.tasks;
    totalTasks += count;
    const colName = col.name.toLowerCase();
    if (colName.includes('progress') || colName.includes('doing')) {
      inProgressTasks += count;
    } else if (colName.includes('done') || colName.includes('complete')) {
      doneTasks += count;
    } else if (colName.includes('backlog') || colName.includes('todo')) {
      backlogTasks += count;
    }
  }

  // Get subtask stats
  const [totalSubtasks, completedSubtasks] = await Promise.all([
    prisma.subtask.count(),
    prisma.subtask.count({ where: { completed: true } }),
  ]);

  // Project count
  const projectCount = await prisma.project.count({
    where: {
      archived: false,
      ...(workspaceId && { workspaceId }),
    },
  });

  // Message count (last 24h)
  const recentMessageCount = await prisma.message.count({
    where: {
      createdAt: { gte: oneDayAgo },
      authorId: { not: user?.id || '' },
      ...channelWorkspaceFilter,
    }
  });

  // Team/agent status
  const [totalUsers, totalAgents, onlineAgents] = await Promise.all([
    prisma.user.count({ where: { isAgent: false } }),
    prisma.user.count({ where: { isAgent: true } }),
    prisma.user.count({ where: { isAgent: true, status: 'online' } }),
  ]);

  // Recent activity (messages)
  const recentMessages = await prisma.message.findMany({
    where: { createdAt: { gte: oneDayAgo }, ...channelWorkspaceFilter },
    orderBy: { createdAt: 'desc' },
    take: 8,
    include: {
      author: { select: { displayName: true, username: true, isAgent: true } },
      channel: { select: { name: true, slug: true, id: true } },
    }
  });

  // My Tasks — tasks assigned to the current user in this workspace
  const assignedTasks = user ? await prisma.task.findMany({
    where: {
      assigneeId: user.id,
      archived: false,
      column: { project: { ...(workspaceId && { workspaceId }) } },
    },
    orderBy: [{ dueDate: 'asc' }, { createdAt: 'desc' }],
    take: 100,
    include: {
      column: { include: { project: { select: { id: true, name: true, color: true } } } },
      state: { select: { id: true, name: true, color: true } },
      assignee: { select: { id: true, displayName: true, avatar: true } },
    },
  }) : [];

  const myTaskCount = assignedTasks.length;

  // Group by due date bucket
  const taskGroups: Record<DueBucket, typeof assignedTasks> = {
    overdue: [], today: [], tomorrow: [], this_week: [], next_month: [], later: [], no_date: [],
  };
  for (const t of assignedTasks) {
    taskGroups[getDueBucket(t.dueDate, t.completedAt)].push(t);
  }

  // Find #general channel for this workspace (for Quick Actions link)
  const generalChannel = workspaceId
    ? await prisma.channel.findFirst({
        where: { workspaceId, slug: 'general' },
        select: { id: true },
      })
    : null;

  const recentActivity = recentMessages.map(msg => {
    const hasMention = user?.username && msg.content.toLowerCase().includes(`@${user.username.toLowerCase()}`);
    return {
      type: hasMention ? 'mention' : 'message',
      user: msg.author.displayName || msg.author.username || 'Unknown',
      isAgent: msg.author.isAgent,
      action: hasMention ? 'mentioned you in' : 'posted in',
      target: `#${msg.channel.name}`,
      channelId: msg.channel.id,
      preview: msg.content.slice(0, 60) + (msg.content.length > 60 ? '...' : ''),
      time: getRelativeTime(msg.createdAt),
    };
  });

  // Get in-progress tasks (from "In Progress" columns)
  const inProgressColumnIds = columns
    .filter(c => c.name.toLowerCase().includes('progress'))
    .map(c => c.id);

  const currentTasks = await prisma.task.findMany({
    where: {
      columnId: { in: inProgressColumnIds.length > 0 ? inProgressColumnIds : ['none'] },
      archived: false,
    },
    orderBy: { updatedAt: 'desc' },
    take: 5,
    include: {
      subtasks: true,
      column: { include: { project: { select: { id: true, name: true } } } },
    }
  });

  const myTasks = currentTasks.map(task => {
    const subtasks = task.subtasks || [];
    const completedCount = subtasks.filter(s => s.completed).length;
    const nextSubtask = subtasks.find(s => !s.completed);
    return {
      id: task.id,
      title: task.title,
      projectId: task.column.project.id,
      projectName: task.column.project.name,
      nextTask: nextSubtask?.title,
      priority: task.priority || 'medium',
      progress: subtasks.length > 0 ? Math.round((completedCount / subtasks.length) * 100) : 0,
      subtaskCount: subtasks.length,
      completedCount,
    };
  });

  const stats = {
    tasks: { 
      total: totalTasks || totalSubtasks,
      completed: doneTasks || completedSubtasks,
      inProgress: inProgressTasks,
      backlog: backlogTasks,
      projects: projectCount,
    },
    messages: { recent: recentMessageCount },
    team: { users: totalUsers, agents: totalAgents, agentsOnline: onlineAgents },
  };

  return (
    <div className="flex-1 overflow-auto">
      {/* Header */}
      <header className="h-12 px-4 flex items-center border-b border-black/20 shadow-sm">
        <h1 className="font-semibold">Dashboard</h1>
      </header>

      <div className="p-4 md:p-6 space-y-6">
        {/* Welcome */}
        <div>
          <h2 className="text-xl sm:text-2xl font-bold">Welcome back, {user?.displayName}! 👋</h2>
          <p className="text-gray-400 mt-1">Here&apos;s what&apos;s happening today.</p>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            icon={<LayoutGrid className="w-5 h-5" />}
            label="My Tasks"
            value={myTaskCount}
            subtext={`${stats.tasks.projects} project${stats.tasks.projects !== 1 ? 's' : ''}`}
            color="primary"
          />
          <StatCard
            icon={<TrendingUp className="w-5 h-5" />}
            label="In Progress"
            value={stats.tasks.inProgress}
            subtext={`${stats.tasks.completed} completed`}
            color="warning"
          />
          <StatCard
            icon={<MessageSquare className="w-5 h-5" />}
            label="Messages"
            value={stats.messages.recent}
            subtext="last 24h"
            color="success"
          />
          <StatCard
            icon={<Bot className="w-5 h-5" />}
            label="Agents"
            value={`${stats.team.agentsOnline}/${stats.team.agents}`}
            subtext="online"
            color="secondary"
          />
        </div>

        {/* Quick Actions + Activity */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* Quick Actions */}
          <div className="card">
            <h3 className="font-semibold mb-4">Quick Actions</h3>
            <div className="space-y-2">
              <Link href="/kanban" className="btn btn-secondary w-full justify-start gap-2">
                <LayoutGrid className="w-4 h-4" />
                Open Projects
              </Link>
              <Link
                href={generalChannel ? `/chat/${generalChannel.id}` : '/chat'}
                className="btn btn-secondary w-full justify-start gap-2"
              >
                <MessageSquare className="w-4 h-4" />
                Go to #general
              </Link>
              <Link href="/notifications" className="btn btn-secondary w-full justify-start gap-2">
                <Bell className="w-4 h-4" />
                View Notifications
              </Link>
            </div>
          </div>

          {/* Recent Activity */}
          <div className="card lg:col-span-2">
            <h3 className="font-semibold mb-4">Recent Activity</h3>
            {recentActivity.length > 0 ? (
              <div className="space-y-3 max-h-[180px] overflow-y-auto">
                {recentActivity.map((item, i) => (
                  <Link 
                    key={i} 
                    href={`/chat/${item.channelId}`}
                    className="flex items-start gap-3 text-sm hover:bg-white/5 rounded p-2 -mx-2 transition-colors"
                  >
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs flex-shrink-0 ${
                      item.isAgent ? 'bg-primary/20 text-primary' : 'bg-gray-600'
                    }`}>
                      {item.isAgent ? '🤖' : item.user.slice(0, 2).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div>
                        <span className="font-medium">{item.user}</span>
                        <span className="text-gray-400"> {item.action} </span>
                        <span className="text-primary">{item.target}</span>
                      </div>
                      <p className="text-gray-500 text-xs truncate mt-0.5">{item.preview}</p>
                    </div>
                    <span className="text-gray-500 text-xs flex items-center gap-1 flex-shrink-0">
                      <Clock className="w-3 h-3" />
                      {item.time}
                    </span>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="text-gray-500 text-sm">No recent activity</p>
            )}
          </div>
        </div>

        {/* My Tasks Table */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-lg">My Tasks</h3>
            <Link href="/kanban" className="text-sm text-primary hover:underline">
              View projects →
            </Link>
          </div>

          {myTaskCount === 0 ? (
            <div className="card text-center py-10 text-gray-500">
              <LayoutGrid className="w-8 h-8 mx-auto mb-3 opacity-30" />
              <p>No tasks assigned to you yet.</p>
              <Link href="/kanban" className="text-sm text-primary hover:underline mt-2 inline-block">Open Projects →</Link>
            </div>
          ) : (
            <div className="card p-0 overflow-hidden">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b border-gray-700 bg-gray-800/50">
                    <th className="w-8 px-3 py-2" />
                    <th className="py-2 pr-4 text-left text-xs font-semibold text-gray-400 uppercase tracking-wide">Name</th>
                    <th className="py-2 px-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wide w-32">Project</th>
                    <th className="py-2 px-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wide w-28">Status</th>
                    <th className="py-2 px-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wide w-24">Start</th>
                    <th className="py-2 px-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wide w-24">Due</th>
                  </tr>
                </thead>
                <tbody>
                  {BUCKET_ORDER.map((bucket) => {
                    const tasks = taskGroups[bucket];
                    if (tasks.length === 0) return null;
                    return (
                      <>
                        {/* Group header */}
                        <tr key={`header-${bucket}`} className="border-b border-gray-700/50 bg-gray-800/30">
                          <td />
                          <td colSpan={5} className="py-2 px-3">
                            <span className={`text-xs font-semibold ${bucket === 'overdue' ? 'text-red-400' : 'text-gray-400'}`}>
                              {BUCKET_LABELS[bucket]} <span className="font-normal opacity-60">{tasks.length}</span>
                            </span>
                          </td>
                        </tr>
                        {tasks.map((task, i) => {
                          const rowColor = task.column.project.color ?? '#5865F2';
                          const statusColor = task.state?.color ?? '#6B7280';
                          const statusName = task.state?.name ?? task.column.name;
                          const dueOverdue = task.dueDate && !task.completedAt && getDueBucket(task.dueDate, task.completedAt) === 'overdue';
                          return (
                            <tr key={task.id} className="border-b border-gray-700/30 hover:bg-gray-700/20 group">
                              <td className="w-8 px-3 py-2.5 text-xs text-gray-600 text-right">{i + 1}</td>
                              <td className="py-2.5 pr-4">
                                <div className="flex items-center gap-2">
                                  <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: rowColor }} />
                                  <Link
                                    href={`/project/${task.column.project.id}?tab=kanban`}
                                    className={`text-sm hover:text-blue-400 transition-colors truncate max-w-xs ${task.completedAt ? 'text-gray-500 line-through' : 'text-gray-200'}`}
                                  >
                                    {task.title}
                                  </Link>
                                </div>
                              </td>
                              <td className="py-2.5 px-3">
                                <span className="text-xs text-gray-400 truncate">{task.column.project.name}</span>
                              </td>
                              <td className="py-2.5 px-3">
                                <span
                                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
                                  style={{ backgroundColor: `${statusColor}25`, color: statusColor }}
                                >
                                  <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: statusColor }} />
                                  {statusName}
                                </span>
                              </td>
                              <td className="py-2.5 px-3 text-xs text-gray-400">
                                {task.startDate ? task.startDate.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' }) : <span className="text-gray-600">—</span>}
                              </td>
                              <td className={`py-2.5 px-3 text-xs font-medium ${dueOverdue ? 'text-red-400' : 'text-gray-400'}`}>
                                {task.dueDate ? task.dueDate.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' }) : <span className="text-gray-600">—</span>}
                              </td>
                            </tr>
                          );
                        })}
                      </>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({ 
  icon, 
  label, 
  value, 
  subtext, 
  color 
}: { 
  icon: React.ReactNode; 
  label: string; 
  value: string | number; 
  subtext: string;
  color: 'primary' | 'success' | 'warning' | 'secondary';
}) {
  const colorClasses = {
    primary: 'bg-primary/20 text-primary',
    success: 'bg-success/20 text-success',
    warning: 'bg-warning/20 text-warning',
    secondary: 'bg-secondary/20 text-gray-300',
  };

  return (
    <div className="card flex items-center gap-4">
      <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${colorClasses[color]}`}>
        {icon}
      </div>
      <div>
        <p className="text-sm text-gray-400">{label}</p>
        <p className="text-2xl font-bold">{value}</p>
        <p className="text-xs text-gray-500">{subtext}</p>
      </div>
    </div>
  );
}
