'use client';

import { useState, useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { useSocket } from '@/components/providers/SocketProvider';
import MessageInput from './MessageInput';

interface Author {
  id: string;
  displayName: string;
  avatar: string | null;
}

interface Attachment {
  id: string;
  url: string;
  name: string;
  type: string;
  size: number;
}

interface Message {
  id: string;
  content: string;
  createdAt: string;
  author: Author;
  attachments?: Attachment[];
}

interface Thread {
  id: string;
  name: string;
  channelId: string;
  messages: Message[];
  channel: { id: string; name: string };
}

interface CurrentUser {
  id: string;
  displayName: string;
  username?: string;
}

interface ThreadPanelProps {
  threadId: string | null;
  parentMessage: Message | null;
  channelId: string;
  currentUser: CurrentUser;
  onClose: () => void;
}

export default function ThreadPanel({ threadId, parentMessage, channelId, currentUser, onClose }: ThreadPanelProps) {
  const { socket } = useSocket();
  const [thread, setThread] = useState<Thread | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Fetch thread data or mark as loaded for new threads
  useEffect(() => {
    if (threadId) {
      fetchThread();
    } else {
      // New thread - no data to fetch
      setLoading(false);
      setMessages([]);
    }
  }, [threadId]);

  // Socket listeners for real-time updates
  useEffect(() => {
    if (!socket || !parentMessage) return;

    const handleNewMessage = (message: Message & { threadId?: string; replyToId?: string }) => {
      // Match by threadId (existing thread) OR by replyToId (new thread)
      const isThreadMatch = threadId && message.threadId === threadId;
      const isReplyMatch = message.replyToId === parentMessage.id;
      
      if (isThreadMatch || isReplyMatch) {
        setMessages(prev => {
          // Avoid duplicates
          if (prev.some(m => m.id === message.id)) return prev;
          return [...prev, message];
        });
        scrollToBottom();
        
        // If this created a new thread, we might want to update thread state
        if (message.threadId && !thread) {
          setThread(prev => prev || { 
            id: message.threadId!, 
            name: parentMessage.content.slice(0, 50), 
            channelId, 
            messages: [],
            channel: { id: channelId, name: '' }
          });
        }
      }
    };

    socket.on('message:new', handleNewMessage);

    return () => {
      socket.off('message:new', handleNewMessage);
    };
  }, [socket, threadId, parentMessage, thread, channelId]);

  const fetchThread = async () => {
    try {
      const res = await fetch(`/api/chat/threads?id=${threadId}`);
      if (res.ok) {
        const data = await res.json();
        setThread(data.thread);
        setMessages(data.thread?.messages || []);
      }
    } catch (err) {
      console.error('Failed to fetch thread:', err);
    } finally {
      setLoading(false);
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  if (!parentMessage) return null;

  return (
    <div className="w-96 border-l border-gray-700 bg-[#313338] flex flex-col h-full">
      {/* Header */}
      <div className="h-12 px-4 flex items-center justify-between border-b border-gray-700 shrink-0">
        <div className="flex items-center gap-2">
          <span className="font-semibold">Thread</span>
          <span className="text-gray-400 text-sm">
            {thread ? `${messages.length} replies` : 'New thread'}
          </span>
        </div>
        <button
          onClick={onClose}
          className="p-1 text-gray-400 hover:text-gray-200 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Parent message */}
      <div className="p-4 border-b border-gray-700 bg-[#2B2D31]">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center text-sm font-semibold shrink-0">
            {parentMessage.author.avatar ? (
              <img src={parentMessage.author.avatar} alt="" className="w-full h-full rounded-full object-cover" />
            ) : (
              parentMessage.author.displayName.slice(0, 2).toUpperCase()
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-2">
              <span className="font-semibold text-white">{parentMessage.author.displayName}</span>
              <span className="text-xs text-gray-400">{formatTime(parentMessage.createdAt)}</span>
            </div>
            <p className="text-gray-200 break-words">{parentMessage.content}</p>
          </div>
        </div>
      </div>

      {/* Thread messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500"></div>
          </div>
        ) : messages.length === 0 ? (
          <div className="text-center text-gray-500 py-8">
            <p>No replies yet</p>
            <p className="text-sm">Be the first to reply!</p>
          </div>
        ) : (
          messages.map((message) => (
            <div key={message.id} className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-xs font-semibold shrink-0">
                {message.author.avatar ? (
                  <img src={message.author.avatar} alt="" className="w-full h-full rounded-full object-cover" />
                ) : (
                  message.author.displayName.slice(0, 2).toUpperCase()
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2">
                  <span className="font-medium text-white text-sm">{message.author.displayName}</span>
                  <span className="text-xs text-gray-500">{formatTime(message.createdAt)}</span>
                </div>
                {message.content && (
                  <p className="text-gray-300 text-sm break-words">{message.content}</p>
                )}
                {/* Attachments */}
                {message.attachments && message.attachments.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {message.attachments.map((attachment) => (
                      <a
                        key={attachment.id}
                        href={attachment.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block"
                      >
                        {attachment.type === 'image' || attachment.type.startsWith('image/') ? (
                          <img
                            src={attachment.url}
                            alt={attachment.name}
                            className="max-w-[200px] max-h-[150px] rounded object-cover hover:opacity-90 transition-opacity"
                          />
                        ) : (
                          <div className="flex items-center gap-2 px-3 py-2 bg-[#40444B] rounded hover:bg-[#4A4D54] transition-colors">
                            <span className="text-sm text-gray-300 truncate max-w-[150px]">{attachment.name}</span>
                          </div>
                        )}
                      </a>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="border-t border-gray-700 shrink-0">
        <MessageInput
          channelId={channelId}
          currentUser={currentUser}
          threadParentMessageId={parentMessage.id}
          placeholder="Reply in thread..."
        />
      </div>
    </div>
  );
}
