'use client';

import { useState, useEffect, useRef } from 'react';
import { AtSign, X, MessageSquare, Hash } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useRouter } from 'next/navigation';

interface MentionMessage {
  id: string;
  content: string;
  createdAt: string;
  author: {
    id: string;
    username: string;
    displayName: string;
    avatar: string | null;
    isAgent: boolean;
  };
  channel: {
    id: string;
    name: string;
    slug: string;
  };
}

interface MentionsDropdownProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigate?: (channelId: string, messageId: string) => void;
}

export default function MentionsDropdown({ isOpen, onClose, onNavigate }: MentionsDropdownProps) {
  const [mentions, setMentions] = useState<MentionMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (isOpen) {
      fetchMentions();
    }
  }, [isOpen]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, onClose]);

  const fetchMentions = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/mentions?limit=20');
      if (res.ok) {
        const data = await res.json();
        setMentions(data.messages);
      } else {
        setError('Failed to load mentions');
      }
    } catch (err) {
      setError('Failed to load mentions');
    } finally {
      setLoading(false);
    }
  };

  const handleMentionClick = (mention: MentionMessage) => {
    if (onNavigate) {
      onNavigate(mention.channel.id, mention.id);
    } else {
      router.push(`/chat/${mention.channel.id}?highlight=${mention.id}`);
    }
    onClose();
  };

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  if (!isOpen) return null;

  return (
    <div
      ref={dropdownRef}
      className="absolute top-full right-0 mt-2 w-96 bg-[#2B2D31] border border-gray-700 rounded-lg shadow-xl overflow-hidden z-50"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
        <div className="flex items-center gap-2">
          <AtSign className="w-5 h-5 text-primary" />
          <h3 className="font-semibold">Mentions</h3>
        </div>
        <button onClick={onClose} className="p-1 hover:bg-white/10 rounded">
          <X className="w-4 h-4 text-gray-400" />
        </button>
      </div>

      {/* Content */}
      <div className="max-h-[400px] overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
          </div>
        ) : error ? (
          <div className="px-4 py-8 text-center text-gray-400">
            <p>{error}</p>
            <button onClick={fetchMentions} className="mt-2 text-primary hover:underline text-sm">
              Try again
            </button>
          </div>
        ) : mentions.length === 0 ? (
          <div className="px-4 py-8 text-center text-gray-400">
            <AtSign className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p>No mentions yet</p>
            <p className="text-sm mt-1">When someone @mentions you, it'll show up here</p>
          </div>
        ) : (
          <div>
            {mentions.map((mention) => (
              <button
                key={mention.id}
                onClick={() => handleMentionClick(mention)}
                className="w-full px-4 py-3 text-left hover:bg-white/5 transition-colors border-b border-gray-700/50 last:border-0"
              >
                <div className="flex items-start gap-3">
                  {/* Avatar */}
                  <div className="w-10 h-10 rounded-full bg-primary flex-shrink-0 flex items-center justify-center text-sm font-semibold">
                    {mention.author.avatar ? (
                      <img src={mention.author.avatar} alt="" className="w-full h-full rounded-full object-cover" />
                    ) : (
                      mention.author.displayName.slice(0, 2).toUpperCase()
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium text-sm">{mention.author.displayName}</span>
                      {mention.author.isAgent && (
                        <span className="px-1 py-0.5 text-[10px] bg-primary/20 text-primary rounded">BOT</span>
                      )}
                      <span className="text-xs text-gray-500">{formatTime(mention.createdAt)}</span>
                    </div>
                    <p className="text-sm text-gray-300 line-clamp-2">{mention.content}</p>
                    <div className="flex items-center gap-1 mt-1 text-xs text-gray-500">
                      <Hash className="w-3 h-3" />
                      <span>{mention.channel.name}</span>
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
