'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Rocket, Plus, Settings, LogOut } from 'lucide-react';
import { cn } from '@/lib/utils';

interface User {
  id: string;
  displayName: string;
  avatar: string | null;
  status: string;
}

interface SidebarProps {
  user: User;
}

export default function Sidebar({ user }: SidebarProps) {
  const pathname = usePathname();

  // Mock workspaces - will be fetched from API
  const workspaces = [
    { id: '1', name: 'Mission Control', icon: '🚀' },
    { id: '2', name: 'Tends2Trend', icon: '📈' },
  ];

  return (
    <div className="w-[72px] bg-channel-bg flex flex-col items-center py-3 gap-2">
      {/* Home button */}
      <Link
        href="/dashboard"
        className={cn(
          'w-12 h-12 rounded-2xl flex items-center justify-center transition-all hover:rounded-xl',
          pathname === '/dashboard'
            ? 'bg-primary rounded-xl'
            : 'bg-chat-bg hover:bg-primary'
        )}
      >
        <Rocket className="w-6 h-6" />
      </Link>

      <div className="w-8 h-0.5 bg-gray-700 rounded-full my-1" />

      {/* Workspaces */}
      {workspaces.map((workspace) => (
        <Link
          key={workspace.id}
          href={`/workspace/${workspace.id}`}
          className={cn(
            'w-12 h-12 rounded-2xl flex items-center justify-center text-xl transition-all hover:rounded-xl bg-chat-bg hover:bg-primary',
            pathname.includes(`/workspace/${workspace.id}`) && 'bg-primary rounded-xl'
          )}
          title={workspace.name}
        >
          {workspace.icon}
        </Link>
      ))}

      {/* Add workspace */}
      <button
        className="w-12 h-12 rounded-2xl flex items-center justify-center transition-all hover:rounded-xl bg-chat-bg hover:bg-success text-success hover:text-white"
        title="Add Workspace"
      >
        <Plus className="w-6 h-6" />
      </button>

      <div className="flex-1" />

      {/* User section */}
      <Link
        href="/settings"
        className="w-12 h-12 rounded-2xl flex items-center justify-center transition-all hover:rounded-xl bg-chat-bg hover:bg-secondary"
        title="Settings"
      >
        <Settings className="w-5 h-5" />
      </Link>

      <div
        className="w-10 h-10 rounded-full bg-primary flex items-center justify-center text-sm font-semibold cursor-pointer"
        title={user.displayName}
      >
        {user.avatar ? (
          <img src={user.avatar} alt="" className="w-full h-full rounded-full object-cover" />
        ) : (
          user.displayName.slice(0, 2).toUpperCase()
        )}
      </div>
    </div>
  );
}
