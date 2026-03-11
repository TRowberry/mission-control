'use client';

import { useState, useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';

interface User {
  id: string;
  username: string;
  displayName: string;
  avatar: string | null;
  status: string;
}

interface MentionAutocompleteProps {
  search: string;
  onSelect: (user: User) => void;
  onClose: () => void;
  position: { top: number; left: number };
}

export default function MentionAutocomplete({ search, onSelect, onClose, position }: MentionAutocompleteProps) {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fetchUsers = async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/users?search=${encodeURIComponent(search)}&limit=8`);
        if (res.ok) {
          const data = await res.json();
          setUsers(data);
          setSelectedIndex(0);
        }
      } catch (error) {
        console.error('Failed to fetch users:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchUsers();
  }, [search]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % users.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev - 1 + users.length) % users.length);
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        if (users[selectedIndex]) {
          onSelect(users[selectedIndex]);
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [users, selectedIndex, onSelect, onClose]);

  // Click outside to close
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  if (users.length === 0 && !loading) {
    return null;
  }

  return (
    <div
      ref={containerRef}
      className="absolute z-50 w-64 bg-[#2B2D31] border border-gray-700 rounded-lg shadow-xl overflow-hidden"
      style={{ bottom: `calc(100% + 8px)`, left: position.left }}
    >
      <div className="px-3 py-2 text-xs font-semibold text-gray-400 uppercase border-b border-gray-700">
        Members
      </div>
      {loading ? (
        <div className="px-3 py-4 text-center text-gray-500 text-sm">Loading...</div>
      ) : (
        <div className="max-h-48 overflow-y-auto">
          {users.map((user, index) => (
            <button
              key={user.id}
              onClick={() => onSelect(user)}
              className={cn(
                'w-full flex items-center gap-3 px-3 py-2 text-left transition-colors',
                index === selectedIndex ? 'bg-primary/30' : 'hover:bg-white/5'
              )}
            >
              <div className="relative">
                <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-xs font-semibold">
                  {user.avatar ? (
                    <img src={user.avatar} alt="" className="w-full h-full rounded-full object-cover" />
                  ) : (
                    user.displayName.slice(0, 2).toUpperCase()
                  )}
                </div>
                <div
                  className={cn(
                    'absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-[#2B2D31]',
                    user.status === 'online' ? 'bg-green-500' :
                    user.status === 'idle' ? 'bg-yellow-500' :
                    user.status === 'dnd' ? 'bg-red-500' : 'bg-gray-500'
                  )}
                />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm truncate">{user.displayName}</div>
                <div className="text-xs text-gray-400 truncate">@{user.username}</div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
