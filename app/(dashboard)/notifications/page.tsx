import { getCurrentUser } from '@/lib/auth';
import prisma from '@/lib/db';
import { cookies } from 'next/headers';
import Link from 'next/link';
import {
  Bell,
  MessageSquare,
  CheckCircle2,
  Plus,
  ArrowRight,
  User,
  LayoutGrid,
} from 'lucide-react';

function getRelativeTime(date: Date): string {
  const diffMs = Date.now() - date.getTime();
  const mins = Math.floor(diffMs / 60000);
  const hours = Math.floor(diffMs / 3600000);
  const days = Math.floor(diffMs / 86400000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString();
}

function activityIcon(type: string) {
  if (type.includes('created')) return <Plus className="w-4 h-4 text-green-400" />;
  if (type.includes('completed')) return <CheckCircle2 className="w-4 h-4 text-blue-400" />;
  if (type.includes('comment')) return <MessageSquare className="w-4 h-4 text-purple-400" />;
  if (type.includes('moved')) return <ArrowRight className="w-4 h-4 text-yellow-400" />;
  if (type.includes('assigned')) return <User className="w-4 h-4 text-orange-400" />;
  return <Bell className="w-4 h-4 text-gray-400" />;
}

function activityLabel(type: string, data: any): string {
  const d = data ?? {};
  switch (type) {
    case 'task_created': return `created task "${d.title ?? 'Untitled'}"`;
    case 'task_completed': return `completed "${d.title ?? 'a task'}"`;
    case 'task_moved': return `moved "${d.title ?? 'a task'}" to ${d.column ?? 'another column'}`;
    case 'subtask_completed': return `completed checklist item "${d.subtaskTitle ?? ''}"`;
    case 'comment_added': return `commented on "${d.task ?? 'a task'}"`;
    case 'assignee_changed': return `assigned "${d.title ?? 'a task'}" to ${d.assignee ?? 'someone'}`;
    default: return type.replace(/_/g, ' ');
  }
}

export default async function NotificationsPage() {
  const user = await getCurrentUser();
  if (!user) return null;

  const cookieStore = await cookies();
  let workspaceId = cookieStore.get('mc-workspace')?.value ?? null;
  if (!workspaceId) {
    const m = await prisma.workspaceMember.findFirst({ where: { userId: user.id }, select: { workspaceId: true } });
    workspaceId = m?.workspaceId ?? null;
  }

  const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  // @mentions in chat (messages that mention this user in the workspace)
  const mentions = await prisma.message.findMany({
    where: {
      createdAt: { gte: oneWeekAgo },
      content: { contains: `@${user.username}`, mode: 'insensitive' },
      authorId: { not: user.id },
      ...(workspaceId && { channel: { workspaceId } }),
    },
    orderBy: { createdAt: 'desc' },
    take: 20,
    include: {
      author: { select: { displayName: true, avatar: true, isAgent: true } },
      channel: { select: { id: true, name: true } },
    },
  });

  // Recent activity across the user's projects in this workspace
  const projectIds = workspaceId
    ? (await prisma.project.findMany({
        where: { workspaceId, archived: false },
        select: { id: true },
      })).map((p) => p.id)
    : [];

  const activities = projectIds.length > 0
    ? await prisma.activity.findMany({
        where: {
          projectId: { in: projectIds },
          userId: { not: user.id },
          createdAt: { gte: oneWeekAgo },
        },
        orderBy: { createdAt: 'desc' },
        take: 30,
        include: {
          user: { select: { displayName: true, avatar: true, isAgent: true } },
          task: { select: { id: true, title: true, column: { select: { projectId: true } } } },
          project: { select: { id: true, name: true } },
        },
      })
    : [];

  const hasNotifications = mentions.length > 0 || activities.length > 0;

  return (
    <div className="flex-1 overflow-auto">
      <header className="h-12 px-4 flex items-center border-b border-black/20 shadow-sm">
        <h1 className="font-semibold">Notifications</h1>
      </header>

      <div className="max-w-3xl mx-auto p-4 md:p-6 space-y-8">
        {!hasNotifications && (
          <div className="text-center py-16 text-gray-400">
            <Bell className="w-12 h-12 mx-auto mb-4 opacity-30" />
            <p className="text-lg font-medium">All caught up!</p>
            <p className="text-sm mt-1">No new notifications in the past 7 days.</p>
          </div>
        )}

        {/* @Mentions */}
        {mentions.length > 0 && (
          <section>
            <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-3 flex items-center gap-2">
              <MessageSquare className="w-4 h-4" />
              Mentions ({mentions.length})
            </h2>
            <div className="space-y-2">
              {mentions.map((msg) => (
                <Link
                  key={msg.id}
                  href={`/chat/${msg.channel.id}`}
                  className="flex items-start gap-3 p-3 bg-white/5 hover:bg-white/10 rounded-lg transition-colors border border-white/5"
                >
                  {msg.author.avatar ? (
                    <img src={msg.author.avatar} alt="" className="w-8 h-8 rounded-full flex-shrink-0 mt-0.5" />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-xs font-medium flex-shrink-0 mt-0.5">
                      {msg.author.displayName?.charAt(0) ?? '?'}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm">
                      <span className="font-medium">{msg.author.displayName}</span>
                      {msg.author.isAgent && <span className="ml-1 text-xs text-blue-400 bg-blue-400/10 px-1 rounded">Agent</span>}
                      <span className="text-gray-400"> mentioned you in </span>
                      <span className="text-gray-300">#{msg.channel.name}</span>
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5 truncate">{msg.content.slice(0, 120)}</p>
                  </div>
                  <span className="text-xs text-gray-500 flex-shrink-0">{getRelativeTime(msg.createdAt)}</span>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* Project Activity */}
        {activities.length > 0 && (
          <section>
            <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-3 flex items-center gap-2">
              <LayoutGrid className="w-4 h-4" />
              Project Activity ({activities.length})
            </h2>
            <div className="space-y-1">
              {activities.map((act) => {
                const href = act.task?.column?.projectId
                  ? `/project/${act.task.column.projectId}?tab=kanban`
                  : act.project
                  ? `/project/${act.project.id}`
                  : '#';
                return (
                  <Link
                    key={act.id}
                    href={href}
                    className="flex items-center gap-3 px-3 py-2.5 hover:bg-white/5 rounded-lg transition-colors group"
                  >
                    <div className="w-7 h-7 rounded-full bg-gray-700 flex items-center justify-center flex-shrink-0">
                      {activityIcon(act.type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-300 truncate">
                        <span className="font-medium text-white">{act.user.displayName}</span>
                        {' '}
                        {activityLabel(act.type, act.data)}
                        {act.project && (
                          <span className="text-gray-500"> · {act.project.name}</span>
                        )}
                      </p>
                    </div>
                    <span className="text-xs text-gray-500 flex-shrink-0">{getRelativeTime(act.createdAt)}</span>
                  </Link>
                );
              })}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
