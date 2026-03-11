'use client';

import { useState, useEffect, useRef } from 'react';
import { X, MessageSquare, AtSign, Calendar } from 'lucide-react';
import { cn } from '@/lib/utils';

interface User {
  id: string;
  username: string;
  displayName: string;
  avatar: string | null;
  status: string;
  isAgent?: boolean;
  createdAt?: string;
}

interface UserProfileCardProps {
  username: string; // Can be username OR user ID (from TipTap mentions)
  position: { x: number; y: number };
  onClose: () => void;
  onStartDM?: (userId: string) => void;
}

export default function UserProfileCard({ username, position, onClose, onStartDM }: UserProfileCardProps) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fetchUser = async () => {
      try {
        // First try searching by username
        const res = await fetch(`/api/users?search=${encodeURIComponent(username)}&limit=10`, {
          credentials: 'include',
        });
        if (res.ok) {
          const users = await res.json();
          // Try exact username match first
          let match = users.find((u: User) => u.username.toLowerCase() === username.toLowerCase());
          // If no username match, try matching by ID (TipTap mentions pass user ID)
          if (!match) {
            match = users.find((u: User) => u.id === username);
          }
          // Also search all users if the "username" might be an ID not in search results
          if (!match) {
            const allRes = await fetch('/api/users?limit=50', { credentials: 'include' });
            if (allRes.ok) {
              const allUsers = await allRes.json();
              match = allUsers.find((u: User) => u.id === username);
            }
          }
          if (match) {
            setUser(match);
          } else {
            setError('User not found');
          }
        } else {
          setError('Failed to load user');
        }
      } catch (err) {
        setError('Failed to load user');
      } finally {
        setLoading(false);
      }
    };

    fetchUser();
  }, [username]);

  // Click outside to close
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (cardRef.current && !cardRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    
    // Delay adding listener to prevent immediate close
    const timeout = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 100);
    
    return () => {
      clearTimeout(timeout);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [onClose]);

  // Escape to close
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  // Calculate position to keep card in viewport
  const getCardStyle = () => {
    const cardWidth = 300;
    const cardHeight = 200;
    const padding = 16;
    
    let x = position.x;
    let y = position.y;
    
    // Adjust horizontal position
    if (x + cardWidth + padding > window.innerWidth) {
      x = window.innerWidth - cardWidth - padding;
    }
    if (x < padding) {
      x = padding;
    }
    
    // Adjust vertical position
    if (y + cardHeight + padding > window.innerHeight) {
      y = position.y - cardHeight - 10; // Show above instead
    }
    
    return { left: x, top: y };
  };

  const statusColors: Record<string, string> = {
    online: 'bg-green-500',
    idle: 'bg-yellow-500',
    dnd: 'bg-red-500',
    offline: 'bg-gray-500',
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  return (
    <div
      ref={cardRef}
      className="fixed z-50 w-[300px] bg-[#232428] border border-gray-700 rounded-lg shadow-2xl overflow-hidden"
      style={getCardStyle()}
    >
      {/* Banner */}
      <div className="h-16 bg-gradient-to-r from-primary to-primary-hover" />
      
      {/* Content */}
      <div className="px-4 pb-4">
        {/* Avatar */}
        <div className="relative -mt-10 mb-3">
          <div className="w-20 h-20 rounded-full bg-[#232428] p-1">
            <div className="w-full h-full rounded-full bg-primary flex items-center justify-center text-2xl font-bold">
              {loading ? (
                <div className="w-8 h-8 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : user?.avatar ? (
                <img src={user.avatar} alt="" className="w-full h-full rounded-full object-cover" />
              ) : (
                user?.displayName?.slice(0, 2).toUpperCase() || '??'
              )}
            </div>
          </div>
          {user && (
            <div
              className={cn(
                'absolute bottom-1 right-1 w-5 h-5 rounded-full border-4 border-[#232428]',
                statusColors[user.status] || 'bg-gray-500'
              )}
            />
          )}
        </div>

        {loading ? (
          <div className="space-y-2">
            <div className="h-6 bg-gray-700 rounded animate-pulse w-32" />
            <div className="h-4 bg-gray-700 rounded animate-pulse w-24" />
          </div>
        ) : error ? (
          <div className="text-gray-400 text-sm">{error}</div>
        ) : user ? (
          <>
            {/* Name & username */}
            <div className="mb-3">
              <div className="flex items-center gap-2">
                <h3 className="text-xl font-bold">{user.displayName}</h3>
                {user.isAgent && (
                  <span className="px-1.5 py-0.5 text-xs bg-primary/20 text-primary rounded">BOT</span>
                )}
              </div>
              <p className="text-gray-400">@{user.username}</p>
            </div>

            {/* Divider */}
            <div className="border-t border-gray-700 my-3" />

            {/* Info */}
            <div className="space-y-2 text-sm">
              {user.createdAt && (
                <div className="flex items-center gap-2 text-gray-400">
                  <Calendar className="w-4 h-4" />
                  <span>Joined {formatDate(user.createdAt)}</span>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex gap-2 mt-4">
              <button
                onClick={() => onStartDM?.(user.id)}
                className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-primary hover:bg-primary-hover rounded text-sm font-medium transition-colors"
              >
                <MessageSquare className="w-4 h-4" />
                Message
              </button>
            </div>
          </>
        ) : null}
      </div>

      {/* Close button */}
      <button
        onClick={onClose}
        className="absolute top-2 right-2 p-1 text-white/70 hover:text-white hover:bg-white/10 rounded"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
