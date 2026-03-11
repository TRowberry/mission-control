'use client';

import { useState, useEffect, useRef } from 'react';
import { Pin, X, User } from 'lucide-react';

interface Author {
  id: string;
  username: string;
  displayName: string;
  avatar: string | null;
}

interface PinnedMessage {
  id: string;
  content: string;
  createdAt: string;
  author: Author;
}

interface PinnedMessagesPanelProps {
  channelId: string;
  isOpen: boolean;
  onClose: () => void;
  onMessageClick?: (messageId: string) => void;
}

export default function PinnedMessagesPanel({ 
  channelId, 
  isOpen, 
  onClose,
  onMessageClick,
}: PinnedMessagesPanelProps) {
  const [messages, setMessages] = useState<PinnedMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      fetchPinnedMessages();
    }
  }, [isOpen, channelId]);

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen, onClose]);

  const fetchPinnedMessages = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/chat/messages/pin?channelId=${channelId}`);
      if (res.ok) {
        const data = await res.json();
        setMessages(data.messages);
      }
    } catch (err) {
      console.error('Failed to fetch pinned messages:', err);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric',
      year: date.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined,
    });
  };

  if (!isOpen) return null;

  return (
    <div 
      ref={panelRef}
      className="absolute top-12 right-4 w-80 max-h-96 bg-[#2F3136] border border-gray-700 rounded-lg shadow-xl z-50 flex flex-col"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
        <div className="flex items-center gap-2">
          <Pin className="w-4 h-4 text-yellow-500" />
          <span className="font-semibold">Pinned Messages</span>
          <span className="text-xs text-gray-400">({messages.length})</span>
        </div>
        <button 
          onClick={onClose}
          className="text-gray-400 hover:text-gray-200 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Messages list */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-6 w-6 border-2 border-gray-500 border-t-white" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 px-4 text-center">
            <Pin className="w-8 h-8 text-gray-600 mb-2" />
            <p className="text-gray-400 text-sm">No pinned messages</p>
            <p className="text-gray-500 text-xs mt-1">
              Pin important messages to keep them handy
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-700">
            {messages.map((msg) => (
              <div 
                key={msg.id}
                className="px-4 py-3 hover:bg-[#36393F] cursor-pointer transition-colors"
                onClick={() => onMessageClick?.(msg.id)}
              >
                <div className="flex items-center gap-2 mb-1">
                  {/* Avatar */}
                  <div className="w-6 h-6 rounded-full bg-primary flex-shrink-0 flex items-center justify-center text-xs font-semibold">
                    {msg.author.avatar ? (
                      <img 
                        src={msg.author.avatar} 
                        alt="" 
                        className="w-full h-full rounded-full object-cover" 
                      />
                    ) : (
                      msg.author.displayName.slice(0, 2).toUpperCase()
                    )}
                  </div>
                  <span className="font-medium text-sm">{msg.author.displayName}</span>
                  <span className="text-xs text-gray-500">{formatDate(msg.createdAt)}</span>
                </div>
                <p className="text-sm text-gray-300 line-clamp-2">{msg.content}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
