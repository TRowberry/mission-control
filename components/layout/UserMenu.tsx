'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Settings, Bell, LogOut, Circle, Moon, MinusCircle, Eye } from 'lucide-react';
import { cn } from '@/lib/utils';

interface User {
  id: string;
  displayName: string;
  avatar: string | null;
  status: string;
}

interface UserMenuProps {
  user: User;
}

const statusOptions = [
  { value: 'online', label: 'Online', icon: Circle, color: 'text-green-500', bgColor: 'bg-green-500' },
  { value: 'idle', label: 'Away', icon: Moon, color: 'text-yellow-500', bgColor: 'bg-yellow-500' },
  { value: 'dnd', label: 'Do Not Disturb', icon: MinusCircle, color: 'text-red-500', bgColor: 'bg-red-500' },
  { value: 'offline', label: 'Invisible', icon: Eye, color: 'text-gray-500', bgColor: 'bg-gray-500' },
];

export default function UserMenu({ user }: UserMenuProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [currentStatus, setCurrentStatus] = useState(user.status || 'online');
  const [isUpdating, setIsUpdating] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Close menu on escape key
  useEffect(() => {
    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') setIsOpen(false);
    }
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, []);

  async function handleStatusChange(newStatus: string) {
    setIsUpdating(true);
    try {
      const res = await fetch('/api/user/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        setCurrentStatus(newStatus);
        router.refresh();
      }
    } catch (err) {
      console.error('Failed to update status:', err);
    } finally {
      setIsUpdating(false);
    }
  }

  async function handleLogout() {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      router.push('/login');
    } catch (err) {
      console.error('Logout failed:', err);
    }
  }

  const currentStatusOption = statusOptions.find(s => s.value === currentStatus) || statusOptions[0];

  return (
    <div ref={menuRef} className="relative">
      {/* User Avatar Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative w-10 h-10 rounded-full bg-primary flex items-center justify-center text-sm font-semibold cursor-pointer hover:ring-2 hover:ring-primary/50 transition-all"
        title={user.displayName}
      >
        {user.avatar ? (
          <img src={user.avatar} alt="" className="w-full h-full rounded-full object-cover" />
        ) : (
          user.displayName.slice(0, 2).toUpperCase()
        )}
        {/* Status indicator */}
        <span className={cn(
          'absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-gray-900',
          currentStatusOption.bgColor
        )} />
      </button>

      {/* Popout Menu */}
      {isOpen && (
        <div className="absolute bottom-full left-0 mb-2 w-64 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-50 overflow-hidden">
          {/* User Info Header */}
          <div className="p-3 bg-gray-900/50 border-b border-gray-700">
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className="w-12 h-12 rounded-full bg-primary flex items-center justify-center text-lg font-semibold">
                  {user.avatar ? (
                    <img src={user.avatar} alt="" className="w-full h-full rounded-full object-cover" />
                  ) : (
                    user.displayName.slice(0, 2).toUpperCase()
                  )}
                </div>
                <span className={cn(
                  'absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-gray-900',
                  currentStatusOption.bgColor
                )} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-white font-medium truncate">{user.displayName}</p>
                <p className="text-gray-400 text-sm truncate">{currentStatusOption.label}</p>
              </div>
            </div>
          </div>

          {/* Status Selection */}
          <div className="p-2 border-b border-gray-700">
            <p className="px-2 py-1 text-xs font-semibold text-gray-500 uppercase">Set Status</p>
            {statusOptions.map((option) => {
              const Icon = option.icon;
              const isActive = currentStatus === option.value;
              return (
                <button
                  key={option.value}
                  onClick={() => handleStatusChange(option.value)}
                  disabled={isUpdating}
                  className={cn(
                    'w-full flex items-center gap-3 px-2 py-2 rounded-md transition-colors',
                    isActive ? 'bg-primary/20 text-white' : 'text-gray-300 hover:bg-gray-700/50 hover:text-white',
                    isUpdating && 'opacity-50 cursor-not-allowed'
                  )}
                >
                  <Icon className={cn('w-4 h-4', option.color)} fill={isActive ? 'currentColor' : 'none'} />
                  <span className="text-sm">{option.label}</span>
                  {isActive && (
                    <span className="ml-auto text-xs text-primary">✓</span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Quick Links */}
          <div className="p-2">
            <button
              onClick={() => { router.push('/account'); setIsOpen(false); }}
              className="w-full flex items-center gap-3 px-2 py-2 rounded-md text-gray-300 hover:bg-gray-700/50 hover:text-white transition-colors"
            >
              <Settings className="w-4 h-4" />
              <span className="text-sm">Account Settings</span>
            </button>
            <button
              onClick={() => { router.push('/notifications'); setIsOpen(false); }}
              className="w-full flex items-center gap-3 px-2 py-2 rounded-md text-gray-300 hover:bg-gray-700/50 hover:text-white transition-colors"
            >
              <Bell className="w-4 h-4" />
              <span className="text-sm">Notifications</span>
            </button>
            <div className="my-1 border-t border-gray-700" />
            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-3 px-2 py-2 rounded-md text-red-400 hover:bg-red-500/10 hover:text-red-300 transition-colors"
            >
              <LogOut className="w-4 h-4" />
              <span className="text-sm">Log Out</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
