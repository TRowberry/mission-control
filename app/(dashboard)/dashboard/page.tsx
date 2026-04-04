import { getCurrentUser } from '@/lib/auth';
import prisma from '@/lib/db';
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

export default async function DashboardPage() {
  const user = await getCurrentUser();
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  // Get all columns with task counts (columns represent status)
  const columns = await prisma.column.findMany({
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
  const projectCount = await prisma.project.count({ where: { archived: false } });

  // Message count (last 24h)
  const recentMessageCount = await prisma.message.count({
    where: {
      createdAt: { gte: oneDayAgo },
      authorId: { not: user?.id || '' }
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
    where: { createdAt: { gte: oneDayAgo } },
    orderBy: { createdAt: 'desc' },
    take: 8,
    include: {
      author: { select: { displayName: true, username: true, isAgent: true } },
      channel: { select: { name: true, slug: true, id: true } },
    }
  });

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

      <div className="p-6 space-y-6">
        {/* Welcome */}
        <div>
          <h2 className="text-2xl font-bold">Welcome back, {user?.displayName}! 👋</h2>
          <p className="text-gray-400 mt-1">Here&apos;s what&apos;s happening today.</p>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            icon={<LayoutGrid className="w-5 h-5" />}
            label="Tasks"
            value={stats.tasks.total}
            subtext={`${stats.tasks.projects} projects`}
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
                Open Kanban Board
              </Link>
              <Link href="/chat/channel-general" className="btn btn-secondary w-full justify-start gap-2">
                <MessageSquare className="w-4 h-4" />
                Go to #general
              </Link>
              <Link href="/chat/channel-reports" className="btn btn-secondary w-full justify-start gap-2">
                <Bell className="w-4 h-4" />
                View Reports
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

        {/* In Progress Tasks */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold">In Progress</h3>
            <Link href="/kanban" className="text-sm text-primary hover:underline">
              View all →
            </Link>
          </div>
          {myTasks.length > 0 ? (
            <div className="space-y-3">
              {myTasks.map((task) => (
                <Link 
                  key={task.id} 
                  href={`/kanban?project=${task.projectId}&task=${task.id}`}
                  className="block p-3 rounded-lg bg-[#36393F] hover:bg-[#3C3F45] transition-colors cursor-pointer"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{task.title}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{task.projectName}</p>
                      {task.nextTask && (
                        <p className="text-sm text-gray-400 mt-1">
                          Next: {task.nextTask}
                        </p>
                      )}
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded flex-shrink-0 ${
                      task.priority === 'high' || task.priority === 'urgent' ? 'bg-red-500/20 text-red-400' :
                      task.priority === 'medium' ? 'bg-yellow-500/20 text-yellow-400' :
                      'bg-gray-500/20 text-gray-400'
                    }`}>
                      {task.priority}
                    </span>
                  </div>
                  {task.subtaskCount > 0 && (
                    <div className="mt-2 flex items-center gap-2">
                      <div className="flex-1 h-1.5 bg-gray-700 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-primary rounded-full transition-all"
                          style={{ width: `${task.progress}%` }}
                        />
                      </div>
                      <span className="text-xs text-gray-500">
                        {task.completedCount}/{task.subtaskCount}
                      </span>
                    </div>
                  )}
                </Link>
              ))}
            </div>
          ) : (
            <p className="text-gray-500 text-sm">No tasks in progress. Check the Kanban board to get started!</p>
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
