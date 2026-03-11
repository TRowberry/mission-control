'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { 
  Hash, 
  Volume2, 
  Megaphone,
  ChevronDown, 
  Plus,
  LayoutGrid,
  MessageSquare,
  Settings,
  Users,
  Bell,
  Mail,
  Folder,
  MoreVertical,
  Archive,
  Trash2
} from 'lucide-react';
import { cn } from '@/lib/utils';
import CreateChannelModal from '@/components/chat/CreateChannelModal';
import ChannelSettingsModal from '@/components/chat/ChannelSettingsModal';
import { useSocket } from '@/components/providers/SocketProvider';

const MIN_SIDEBAR_WIDTH = 200;
const MAX_SIDEBAR_WIDTH = 400;
const DEFAULT_SIDEBAR_WIDTH = 240;

interface User {
  id: string;
  displayName: string;
  status: string;
}

interface TeamMember {
  id: string;
  username: string;
  displayName: string;
  avatar: string | null;
  status: string;
  isAgent: boolean;
}

interface Channel {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  type: string;
  _count?: { messages: number };
}

interface DMConversation {
  id: string;
  channelId: string;
  otherUser: {
    id: string;
    username: string;
    displayName: string;
    avatar: string | null;
    status: string;
    isAgent: boolean;
  };
  lastMessage: {
    content: string;
    createdAt: string;
  } | null;
  unreadCount: number;
}

interface Project {
  id: string;
  name: string;
  color: string;
  archived?: boolean;
}

interface WorkspaceSidebarProps {
  user: User;
}

const channelIcons: Record<string, typeof Hash> = {
  text: Hash,
  voice: Volume2,
  announcement: Megaphone,
};

export default function WorkspaceSidebar({ user }: WorkspaceSidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { isUserOnline } = useSocket();
  const [channels, setChannels] = useState<Channel[]>([]);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingChannel, setEditingChannel] = useState<Channel | null>(null);
  const [channelsExpanded, setChannelsExpanded] = useState(true);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [teamExpanded, setTeamExpanded] = useState(true);
  const [unreadCounts, setUnreadCounts] = useState<Record<string, { unreadCount: number; hasUnread: boolean }>>({});
  const [dms, setDms] = useState<DMConversation[]>([]);
  const [dmsExpanded, setDmsExpanded] = useState(true);
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectsExpanded, setProjectsExpanded] = useState(true);
  const [projectMenuId, setProjectMenuId] = useState<string | null>(null);
  
  // Sidebar resize state
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_SIDEBAR_WIDTH);
  const [isResizing, setIsResizing] = useState(false);
  const [isHoveringResize, setIsHoveringResize] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);

  // Load saved sidebar width from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('mc-sidebar-width');
    if (saved) {
      const width = parseInt(saved, 10);
      if (width >= MIN_SIDEBAR_WIDTH && width <= MAX_SIDEBAR_WIDTH) {
        setSidebarWidth(width);
      }
    }
  }, []);

  // Handle resize
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  }, []);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;
      
      const newWidth = e.clientX - 48; // Account for icon rail (w-12 = 48px)
      const clampedWidth = Math.max(MIN_SIDEBAR_WIDTH, Math.min(MAX_SIDEBAR_WIDTH, newWidth));
      setSidebarWidth(clampedWidth);
    };

    const handleMouseUp = () => {
      if (isResizing) {
        setIsResizing(false);
        localStorage.setItem('mc-sidebar-width', sidebarWidth.toString());
      }
    };

    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isResizing, sidebarWidth]);

  // Close project menu when clicking outside
  useEffect(() => {
    function handleClickOutside() {
      setProjectMenuId(null);
    }
    if (projectMenuId) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [projectMenuId]);

  // Fetch channels, team members, DMs, and projects
  useEffect(() => {
    fetchChannels();
    fetchTeamMembers();
    fetchUnreadCounts();
    fetchDMs();
    fetchProjects();
    
    // Refresh team members every 30 seconds for status updates
    const interval = setInterval(fetchTeamMembers, 30000);
    // Refresh unread counts every 10 seconds
    const unreadInterval = setInterval(fetchUnreadCounts, 10000);
    // Refresh DMs every 15 seconds
    const dmInterval = setInterval(fetchDMs, 15000);
    return () => {
      clearInterval(interval);
      clearInterval(unreadInterval);
      clearInterval(dmInterval);
    };
  }, []);

  const fetchChannels = async () => {
    try {
      const res = await fetch('/api/channels');
      if (res.ok) {
        const data = await res.json();
        setChannels(data.channels || []);
        setWorkspaceId(data.workspaceId);
      }
    } catch (err) {
      console.error('Failed to fetch channels:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchTeamMembers = async () => {
    try {
      const res = await fetch('/api/users?limit=20');
      if (res.ok) {
        const users = await res.json();
        setTeamMembers(users);
      }
    } catch (err) {
      console.error('Failed to fetch team members:', err);
    }
  };

  const fetchUnreadCounts = async () => {
    try {
      const res = await fetch('/api/channels/read');
      if (res.ok) {
        const data = await res.json();
        setUnreadCounts(data);
      }
    } catch (err) {
      console.error('Failed to fetch unread counts:', err);
    }
  };

  const fetchDMs = async () => {
    try {
      const res = await fetch('/api/dms');
      if (res.ok) {
        const data = await res.json();
        setDms(data);
      }
    } catch (err) {
      console.error('Failed to fetch DMs:', err);
    }
  };

  const fetchProjects = async () => {
    try {
      const res = await fetch('/api/kanban/projects');
      if (res.ok) {
        const data = await res.json();
        setProjects(data.filter((p: Project) => !p.archived));
      }
    } catch (err) {
      console.error('Failed to fetch projects:', err);
    }
  };

  const handleArchiveProject = async (projectId: string, projectName: string) => {
    if (!confirm(`Archive project "${projectName}"? You can view archived projects later.`)) {
      return;
    }
    try {
      const res = await fetch('/api/kanban/projects', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: projectId, archived: true }),
      });
      if (res.ok) {
        fetchProjects();
        // If we're on that project page, redirect to kanban
        if (pathname.includes(`/project/${projectId}`)) {
          router.push('/kanban');
        }
      }
    } catch (err) {
      console.error('Failed to archive project:', err);
    }
    setProjectMenuId(null);
  };

  const handleDeleteProject = async (projectId: string, projectName: string) => {
    if (!confirm(`Permanently delete project "${projectName}"? This will also delete all tasks and cannot be undone.`)) {
      return;
    }
    try {
      const res = await fetch(`/api/kanban/projects?id=${projectId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        fetchProjects();
        // If we're on that project page, redirect to kanban
        if (pathname.includes(`/project/${projectId}`)) {
          router.push('/kanban');
        }
      }
    } catch (err) {
      console.error('Failed to delete project:', err);
    }
    setProjectMenuId(null);
  };

  const startDM = async (userId: string) => {
    try {
      const res = await fetch('/api/dms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });
      if (res.ok) {
        const data = await res.json();
        router.push(`/chat/${data.channelId}`);
        fetchDMs(); // Refresh DM list
      }
    } catch (err) {
      console.error('Failed to start DM:', err);
    }
  };

  const handleCreateChannel = (channel: Channel) => {
    setChannels(prev => [...prev, channel]);
    router.push(`/chat/${channel.id}`);
  };

  const handleUpdateChannel = (updated: Channel) => {
    setChannels(prev => prev.map(c => c.id === updated.id ? updated : c));
  };

  const handleDeleteChannel = () => {
    if (editingChannel) {
      setChannels(prev => prev.filter(c => c.id !== editingChannel.id));
      // Navigate away if we're on the deleted channel
      if (pathname === `/chat/${editingChannel.id}`) {
        router.push('/dashboard');
      }
    }
  };

  return (
    <>
      <div 
        ref={sidebarRef}
        className="bg-sidebar-bg flex flex-col relative"
        style={{ width: sidebarWidth }}
      >
        {/* Resize handle - positioned at right edge, extends slightly beyond */}
        <div
          className={cn(
            'absolute -right-1 top-0 bottom-0 w-3 cursor-col-resize z-50 flex items-center justify-center',
            'hover:bg-primary/20'
          )}
          onMouseDown={handleMouseDown}
          onMouseEnter={() => setIsHoveringResize(true)}
          onMouseLeave={() => setIsHoveringResize(false)}
        >
          {/* Visual indicator line */}
          <div
            className={cn(
              'w-0.5 h-full transition-all duration-150',
              isResizing ? 'bg-primary w-1' : isHoveringResize ? 'bg-primary' : 'bg-gray-600 hover:bg-primary'
            )}
          />
        </div>
        {/* Workspace header */}
        <div className="h-12 px-4 flex items-center justify-between border-b border-black/20 shadow-sm cursor-pointer hover:bg-white/5">
          <h2 className="font-semibold truncate">Mission Control</h2>
          <ChevronDown className="w-4 h-4 text-gray-400" />
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto py-4 space-y-4">
          {/* Quick links */}
          <div className="px-2">
            <Link
              href="/dashboard"
              className={cn(
                'channel-item',
                pathname === '/dashboard' && 'active'
              )}
            >
              <MessageSquare className="w-5 h-5" />
              <span>Dashboard</span>
            </Link>
            <Link
              href="/kanban"
              className={cn(
                'channel-item',
                pathname.startsWith('/kanban') && 'active'
              )}
            >
              <LayoutGrid className="w-5 h-5" />
              <span>Kanban</span>
            </Link>
            <Link
              href="/notifications"
              className={cn(
                'channel-item',
                pathname === '/notifications' && 'active'
              )}
            >
              <Bell className="w-5 h-5" />
              <span>Notifications</span>
            </Link>
            <Link
              href="/pages"
              className={cn(
                'channel-item',
                pathname.startsWith('/pages') && 'active'
              )}
            >
              <Folder className="w-5 h-5" />
              <span>Pages</span>
            </Link>
          </div>

          {/* Chat Channels */}
          <div>
            <div className="px-2 mb-1 flex items-center justify-between">
              <button 
                onClick={() => setChannelsExpanded(!channelsExpanded)}
                className="flex items-center gap-1 text-xs font-semibold text-gray-400 hover:text-gray-200 uppercase tracking-wide"
              >
                <ChevronDown className={cn(
                  'w-3 h-3 transition-transform',
                  !channelsExpanded && '-rotate-90'
                )} />
                Chat Channels
              </button>
              <button 
                onClick={() => setShowCreateModal(true)}
                className="text-gray-400 hover:text-gray-200"
                title="Create Channel"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
            
            {channelsExpanded && (
              <div className="px-2 space-y-0.5">
                {loading ? (
                  <div className="px-2 py-4 text-center text-gray-500 text-sm">
                    Loading...
                  </div>
                ) : channels.length === 0 ? (
                  <div className="px-2 py-4 text-center text-gray-500 text-sm">
                    No channels yet.
                    <button
                      onClick={() => setShowCreateModal(true)}
                      className="block mx-auto mt-2 text-blue-400 hover:text-blue-300"
                    >
                      Create one
                    </button>
                  </div>
                ) : (
                  channels.map((channel) => {
                    const Icon = channelIcons[channel.type] || Hash;
                    const isActive = pathname === `/chat/${channel.id}`;
                    const unread = unreadCounts[channel.id];
                    const hasUnread = unread?.hasUnread && !isActive;
                    
                    return (
                      <div
                        key={channel.id}
                        className={cn(
                          'group flex items-center justify-between rounded hover:bg-white/5',
                          isActive && 'bg-white/10'
                        )}
                      >
                        <Link
                          href={`/chat/${channel.id}`}
                          className="flex-1 flex items-center gap-2 px-2 py-1.5"
                        >
                          <Icon className={cn(
                            'w-5 h-5',
                            hasUnread ? 'text-white' : 'text-gray-400'
                          )} />
                          <span className={cn(
                            'truncate',
                            isActive ? 'text-white' : hasUnread ? 'text-white font-semibold' : 'text-gray-400'
                          )}>
                            {channel.name}
                          </span>
                          {hasUnread && unread.unreadCount > 0 && (
                            <span className="ml-auto px-1.5 py-0.5 text-xs bg-danger text-white rounded-full min-w-[20px] text-center">
                              {unread.unreadCount > 99 ? '99+' : unread.unreadCount}
                            </span>
                          )}
                        </Link>
                        <button
                          onClick={(e) => {
                            e.preventDefault();
                            setEditingChannel(channel);
                          }}
                          className="p-1 mr-1 text-gray-500 opacity-0 group-hover:opacity-100 hover:text-gray-300 transition-opacity"
                          title="Channel Settings"
                        >
                          <Settings className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </div>

          {/* Projects */}
          <div>
            <div className="px-2 mb-1 flex items-center justify-between">
              <button 
                onClick={() => setProjectsExpanded(!projectsExpanded)}
                className="flex items-center gap-1 text-xs font-semibold text-gray-400 hover:text-gray-200 uppercase tracking-wide"
              >
                <ChevronDown className={cn(
                  'w-3 h-3 transition-transform',
                  !projectsExpanded && '-rotate-90'
                )} />
                Projects
              </button>
              <Link
                href="/kanban"
                className="text-gray-400 hover:text-gray-200"
                title="View All Projects"
              >
                <LayoutGrid className="w-4 h-4" />
              </Link>
            </div>
            {projectsExpanded && (
              <div className="px-2 space-y-0.5">
                {projects.length === 0 ? (
                  <div className="px-2 py-2 text-center text-gray-500 text-xs">
                    No projects yet.
                    <Link href="/kanban" className="block text-blue-400 hover:text-blue-300 mt-1">
                      Create one
                    </Link>
                  </div>
                ) : (
                  projects.map((project) => {
                    const isActive = pathname === `/project/${project.id}`;
                    
                    return (
                      <div
                        key={project.id}
                        className={cn(
                          'group relative flex items-center rounded hover:bg-white/5',
                          isActive && 'bg-white/10'
                        )}
                      >
                        <Link
                          href={`/project/${project.id}`}
                          className="flex-1 flex items-center gap-2 px-2 py-1.5"
                        >
                          <div 
                            className="w-3 h-3 rounded-sm flex-shrink-0"
                            style={{ backgroundColor: project.color }}
                          />
                          <span className={cn(
                            'truncate',
                            isActive ? 'text-white' : 'text-gray-400'
                          )}>
                            {project.name}
                          </span>
                        </Link>
                        
                        {/* Project menu button */}
                        <button
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setProjectMenuId(projectMenuId === project.id ? null : project.id);
                          }}
                          className="p-1 mr-1 rounded opacity-0 group-hover:opacity-100 hover:bg-white/10 transition-opacity"
                        >
                          <MoreVertical className="w-3.5 h-3.5 text-gray-400" />
                        </button>
                        
                        {/* Project context menu */}
                        {projectMenuId === project.id && (
                          <div className="absolute right-0 top-full mt-1 w-40 bg-[#2B2D31] rounded-lg shadow-xl border border-gray-600 z-50">
                            <button
                              onClick={() => handleArchiveProject(project.id, project.name)}
                              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-300 hover:bg-white/10 rounded-t-lg"
                            >
                              <Archive className="w-4 h-4 text-yellow-400" />
                              Archive
                            </button>
                            <button
                              onClick={() => handleDeleteProject(project.id, project.name)}
                              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-400 hover:bg-white/10 rounded-b-lg"
                            >
                              <Trash2 className="w-4 h-4" />
                              Delete
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </div>

          {/* Direct Messages */}
          <div>
            <div className="px-2 mb-1 flex items-center justify-between">
              <button 
                onClick={() => setDmsExpanded(!dmsExpanded)}
                className="flex items-center gap-1 text-xs font-semibold text-gray-400 hover:text-gray-200 uppercase tracking-wide"
              >
                <ChevronDown className={cn(
                  'w-3 h-3 transition-transform',
                  !dmsExpanded && '-rotate-90'
                )} />
                Direct Messages
              </button>
            </div>
            {dmsExpanded && (
              <div className="px-2 space-y-0.5">
                {dms.length === 0 ? (
                  <div className="px-2 py-2 text-center text-gray-500 text-xs">
                    No conversations yet.<br />
                    Click a team member to start.
                  </div>
                ) : (
                  dms.map((dm) => {
                    const isActive = pathname === `/chat/${dm.channelId}`;
                    const hasUnread = dm.unreadCount > 0 && !isActive;
                    
                    return (
                      <Link
                        key={dm.id}
                        href={`/chat/${dm.channelId}`}
                        className={cn(
                          'flex items-center gap-2 px-2 py-1.5 rounded hover:bg-white/5',
                          isActive && 'bg-white/10'
                        )}
                      >
                        <div className="relative flex-shrink-0">
                          <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center text-[10px] font-semibold">
                            {dm.otherUser.avatar ? (
                              <img src={dm.otherUser.avatar} alt="" className="w-full h-full rounded-full object-cover" />
                            ) : (
                              dm.otherUser.displayName.slice(0, 2).toUpperCase()
                            )}
                          </div>
                          <span className={cn(
                            'absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-sidebar-bg',
                            isUserOnline(dm.otherUser.id) ? 'bg-success' : (
                              dm.otherUser.status === 'online' ? 'bg-success' :
                              dm.otherUser.status === 'idle' ? 'bg-warning' :
                              dm.otherUser.status === 'dnd' ? 'bg-danger' : 'bg-gray-500'
                            )
                          )} />
                        </div>
                        <span className={cn(
                          'truncate flex-1',
                          isActive ? 'text-white' : hasUnread ? 'text-white font-semibold' : 'text-gray-400'
                        )}>
                          {dm.otherUser.displayName}
                        </span>
                        {hasUnread && (
                          <span className="px-1.5 py-0.5 text-xs bg-danger text-white rounded-full min-w-[20px] text-center">
                            {dm.unreadCount > 99 ? '99+' : dm.unreadCount}
                          </span>
                        )}
                      </Link>
                    );
                  })
                )}
              </div>
            )}
          </div>

          {/* Team Members */}
          <div>
            <div className="px-2 mb-1 flex items-center justify-between">
              <button 
                onClick={() => setTeamExpanded(!teamExpanded)}
                className="flex items-center gap-1 text-xs font-semibold text-gray-400 hover:text-gray-200 uppercase tracking-wide"
              >
                <ChevronDown className={cn(
                  'w-3 h-3 transition-transform',
                  !teamExpanded && '-rotate-90'
                )} />
                Team — {teamMembers.filter(m => m.status === 'online').length} Online
              </button>
              <button className="text-gray-400 hover:text-gray-200">
                <Users className="w-4 h-4" />
              </button>
            </div>
            {teamExpanded && (
              <div className="px-2 space-y-0.5">
                {/* Online members first, then others */}
                {teamMembers
                  .sort((a, b) => {
                    const statusOrder = { online: 0, idle: 1, dnd: 2, offline: 3 };
                    return (statusOrder[a.status as keyof typeof statusOrder] || 3) - 
                           (statusOrder[b.status as keyof typeof statusOrder] || 3);
                  })
                  .filter((member) => member.id !== user.id) // Don't show self
                  .map((member) => (
                    <button
                      key={member.id}
                      onClick={() => startDM(member.id)}
                      className="channel-item group w-full text-left"
                      title={`Start DM with ${member.displayName}`}
                    >
                      <div className="relative">
                        <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center text-[10px] font-semibold flex-shrink-0">
                          {member.avatar ? (
                            <img src={member.avatar} alt="" className="w-full h-full rounded-full object-cover" />
                          ) : (
                            member.displayName.slice(0, 2).toUpperCase()
                          )}
                        </div>
                        <span className={cn(
                          'absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-sidebar-bg',
                          isUserOnline(member.id) ? 'bg-success' : (
                            member.status === 'online' ? 'bg-success' :
                            member.status === 'idle' ? 'bg-warning' :
                            member.status === 'dnd' ? 'bg-danger' : 'bg-gray-500'
                          )
                        )} />
                      </div>
                      <span className="truncate text-sm">{member.displayName}</span>
                      {member.isAgent && (
                        <span className="ml-auto px-1 py-0.5 text-[9px] bg-primary/20 text-primary rounded opacity-0 group-hover:opacity-100 transition-opacity">
                          BOT
                        </span>
                      )}
                    </button>
                  ))}
                {teamMembers.length === 0 && (
                  <div className="px-2 py-2 text-center text-gray-500 text-xs">
                    No team members
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

      </div>

      {/* Modals */}
      {showCreateModal && (
        <CreateChannelModal
          onClose={() => setShowCreateModal(false)}
          onCreate={handleCreateChannel}
        />
      )}

      {editingChannel && (
        <ChannelSettingsModal
          channel={editingChannel}
          onClose={() => setEditingChannel(null)}
          onUpdate={handleUpdateChannel}
          onDelete={handleDeleteChannel}
        />
      )}
    </>
  );
}
