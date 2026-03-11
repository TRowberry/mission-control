'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useSocket } from '@/components/providers/SocketProvider';
import MessageItem from './MessageItem';

// Helper to get/set last read timestamp from localStorage
const getLastReadTimestamp = (channelId: string): number => {
  if (typeof window === 'undefined') return 0;
  const stored = localStorage.getItem(`mc_lastRead_${channelId}`);
  return stored ? parseInt(stored, 10) : 0;
};

const setLastReadTimestamp = (channelId: string, timestamp: number) => {
  if (typeof window === 'undefined') return;
  localStorage.setItem(`mc_lastRead_${channelId}`, timestamp.toString());
};

interface Author {
  id: string;
  username: string;
  displayName: string;
  avatar: string | null;
  status: string;
}

interface Reaction {
  id: string;
  emoji: string;
  user: { id: string; username: string };
}

interface Attachment {
  id: string;
  name: string;
  url: string;
  type: string;
  size: number;
}

interface Message {
  id: string;
  content: string;
  type: string;
  createdAt: string;
  edited: boolean;
  author: Author;
  reactions: Reaction[];
  attachments?: Attachment[];
  channelId?: string;
  replyTo?: {
    id: string;
    content: string;
    author: Author;
  } | null;
}

interface MessageListProps {
  channelId: string;
  currentUserId: string;
  onReply?: (message: Message) => void;
  onThreadOpen?: (message: Message) => void;
}

export default function MessageList({ channelId, currentUserId, onReply, onThreadOpen }: MessageListProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [typingUsers, setTypingUsers] = useState<Map<string, string>>(new Map());
  const [lastReadTimestamp, setLastReadState] = useState<number>(0);
  const [newMessageDividerIndex, setNewMessageDividerIndex] = useState<number | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const topSentinelRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hasMarkedRead = useRef(false);
  const isInitialLoad = useRef(true);
  const { socket, isConnected, joinChannel, leaveChannel } = useSocket();

  // Load last read timestamp on mount
  useEffect(() => {
    const stored = getLastReadTimestamp(channelId);
    setLastReadState(stored);
  }, [channelId]);

  // Fetch initial messages
  const fetchMessages = useCallback(async () => {
    try {
      const res = await fetch(`/api/chat/messages?channelId=${channelId}&limit=50`);
      if (res.ok) {
        const data = await res.json();
        setMessages(data);
        // If we got fewer than 50 messages, there are no more to load
        setHasMore(data.length >= 50);
        isInitialLoad.current = true;
      }
    } catch (err) {
      console.error('Failed to fetch messages:', err);
    } finally {
      setLoading(false);
    }
  }, [channelId]);

  // Load older messages when scrolling up
  const loadOlderMessages = useCallback(async () => {
    if (loadingMore || !hasMore || messages.length === 0) return;
    
    setLoadingMore(true);
    const oldestMessage = messages[0];
    const scrollContainer = containerRef.current;
    const previousScrollHeight = scrollContainer?.scrollHeight || 0;
    
    try {
      const res = await fetch(
        `/api/chat/messages?channelId=${channelId}&limit=50&before=${oldestMessage.createdAt}`
      );
      if (res.ok) {
        const olderMessages = await res.json();
        if (olderMessages.length > 0) {
          setMessages(prev => [...olderMessages, ...prev]);
          // Maintain scroll position after prepending
          requestAnimationFrame(() => {
            if (scrollContainer) {
              const newScrollHeight = scrollContainer.scrollHeight;
              scrollContainer.scrollTop = newScrollHeight - previousScrollHeight;
            }
          });
        }
        setHasMore(olderMessages.length >= 50);
      }
    } catch (err) {
      console.error('Failed to load older messages:', err);
    } finally {
      setLoadingMore(false);
    }
  }, [channelId, loadingMore, hasMore, messages]);

  // Load messages and join channel on mount
  useEffect(() => {
    fetchMessages();
    
    if (isConnected) {
      joinChannel(channelId);
    }

    return () => {
      if (isConnected) {
        leaveChannel(channelId);
      }
    };
  }, [channelId, isConnected, joinChannel, leaveChannel, fetchMessages]);

  // Listen for messages via WebSocket
  useEffect(() => {
    if (!socket) return;

    const handleNewMessage = (message: Message & { threadId?: string }) => {
      // Only add to main channel if it's not a thread reply
      if (message.channelId === channelId && !message.threadId) {
        setMessages(prev => {
          if (prev.some(m => m.id === message.id)) return prev;
          return [...prev, message];
        });
      }
    };

    const handleUpdateMessage = (message: Message) => {
      if (message.channelId === channelId) {
        setMessages(prev => prev.map(m => m.id === message.id ? message : m));
      }
    };

    const handleDeleteMessage = ({ messageId, channelId: msgChannelId }: { messageId: string; channelId: string }) => {
      if (msgChannelId === channelId) {
        setMessages(prev => prev.filter(m => m.id !== messageId));
      }
    };

    const handleReactionAdd = ({ messageId, reaction, channelId: msgChannelId }: { messageId: string; reaction: Reaction; channelId: string }) => {
      if (msgChannelId === channelId) {
        setMessages(prev => prev.map(m => {
          if (m.id === messageId) {
            // Don't add duplicate
            if (m.reactions.some(r => r.id === reaction.id)) return m;
            return { ...m, reactions: [...m.reactions, reaction] };
          }
          return m;
        }));
      }
    };

    const handleReactionRemove = ({ messageId, emoji, userId, channelId: msgChannelId }: { messageId: string; emoji: string; userId: string; channelId: string }) => {
      if (msgChannelId === channelId) {
        setMessages(prev => prev.map(m => {
          if (m.id === messageId) {
            return { ...m, reactions: m.reactions.filter(r => !(r.emoji === emoji && r.user.id === userId)) };
          }
          return m;
        }));
      }
    };

    const handleTypingUpdate = ({ userId, username, isTyping }: { userId: string; username: string; isTyping: boolean }) => {
      setTypingUsers(prev => {
        const next = new Map(prev);
        if (isTyping) {
          next.set(userId, username);
        } else {
          next.delete(userId);
        }
        return next;
      });
    };

    socket.on('message:new', handleNewMessage);
    socket.on('message:update', handleUpdateMessage);
    socket.on('message:delete', handleDeleteMessage);
    socket.on('reaction:add', handleReactionAdd);
    socket.on('reaction:remove', handleReactionRemove);
    socket.on('typing:update', handleTypingUpdate);

    return () => {
      socket.off('message:new', handleNewMessage);
      socket.off('message:update', handleUpdateMessage);
      socket.off('message:delete', handleDeleteMessage);
      socket.off('reaction:add', handleReactionAdd);
      socket.off('reaction:remove', handleReactionRemove);
      socket.off('typing:update', handleTypingUpdate);
    };
  }, [socket, channelId]);

  // Auto-scroll to bottom only on initial load or new messages (not when loading older)
  useEffect(() => {
    if (messages.length > 0 && isInitialLoad.current) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
      isInitialLoad.current = false;
    }
  }, [messages]);

  // Scroll to bottom when a new message arrives (check if we're already near bottom)
  useEffect(() => {
    if (!socket) return;
    
    const handleNewMessageScroll = () => {
      const container = containerRef.current;
      if (!container) return;
      
      // Only auto-scroll if user is near the bottom (within 100px)
      const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 100;
      if (isNearBottom) {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
      }
    };
    
    socket.on('message:new', handleNewMessageScroll);
    return () => { socket.off('message:new', handleNewMessageScroll); };
  }, [socket]);

  // IntersectionObserver for infinite scroll - load more when top sentinel is visible
  useEffect(() => {
    const sentinel = topSentinelRef.current;
    const container = containerRef.current;
    if (!sentinel || !container) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry.isIntersecting && hasMore && !loadingMore && !loading) {
          loadOlderMessages();
        }
      },
      {
        root: container,
        rootMargin: '100px 0px 0px 0px', // Trigger 100px before reaching top
        threshold: 0,
      }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, loadingMore, loading, loadOlderMessages]);

  // Calculate new message divider position
  useEffect(() => {
    if (lastReadTimestamp && messages.length > 0 && !hasMarkedRead.current) {
      // Find the first message after the last read timestamp
      const firstUnreadIndex = messages.findIndex(
        m => new Date(m.createdAt).getTime() > lastReadTimestamp
      );
      
      if (firstUnreadIndex > 0) {
        setNewMessageDividerIndex(firstUnreadIndex);
      } else {
        setNewMessageDividerIndex(null);
      }
    }
  }, [messages, lastReadTimestamp]);

  // Mark channel as read after viewing for 2 seconds
  useEffect(() => {
    if (messages.length === 0 || hasMarkedRead.current) return;

    const timer = setTimeout(() => {
      const latestMessage = messages[messages.length - 1];
      if (latestMessage) {
        const latestTimestamp = new Date(latestMessage.createdAt).getTime();
        setLastReadTimestamp(channelId, latestTimestamp);
        hasMarkedRead.current = true;
        // Clear the divider after marking as read
        setNewMessageDividerIndex(null);
      }
    }, 2000);

    return () => clearTimeout(timer);
  }, [messages, channelId]);

  const groupedMessages = groupMessages(messages);

  if (loading) {
    return (
      <div ref={containerRef} className="flex-1 overflow-y-auto overflow-x-hidden">
        <div className="flex items-center justify-center h-full">
          <div className="text-gray-400">Loading messages...</div>
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="flex-1 overflow-y-auto overflow-x-hidden">
      <div className="flex flex-col justify-end min-h-full">
        {messages.length === 0 && (
          <div className="p-4 text-center">
            <div className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center mx-auto mb-4">
              <span className="text-3xl">#</span>
            </div>
            <h2 className="text-2xl font-bold mb-2">Welcome to the channel!</h2>
            <p className="text-gray-400">This is the start of the conversation.</p>
          </div>
        )}

        <div className="py-4">
          {/* Top sentinel for infinite scroll */}
          <div ref={topSentinelRef} className="h-1" />
          
          {/* Loading indicator for older messages */}
          {loadingMore && (
            <div className="flex items-center justify-center py-4">
              <div className="flex items-center gap-2 text-gray-400">
                <div className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
                <span>Loading older messages...</span>
              </div>
            </div>
          )}
          
          {/* "Beginning of channel" indicator */}
          {!hasMore && messages.length > 0 && (
            <div className="flex items-center justify-center py-4 mb-4">
              <div className="text-center">
                <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center mx-auto mb-2">
                  <span className="text-xl">#</span>
                </div>
                <p className="text-sm text-gray-400">This is the beginning of the channel</p>
              </div>
            </div>
          )}

          {groupedMessages.map((group, groupIndex) => {
            // Check if any message in this group is the first unread
            const groupStartIndex = groupedMessages
              .slice(0, groupIndex)
              .reduce((sum, g) => sum + g.messages.length, 0);
            
            const showNewIndicatorBeforeGroup = newMessageDividerIndex !== null && 
              groupStartIndex === newMessageDividerIndex;

            return (
              <div key={group.id} className="group">
                {/* New messages divider */}
                {showNewIndicatorBeforeGroup && (
                  <div className="flex items-center gap-2 px-4 py-2 my-2">
                    <div className="flex-1 h-px bg-red-500" />
                    <span className="text-xs text-red-500 font-semibold uppercase px-2">
                      New
                    </span>
                    <div className="flex-1 h-px bg-red-500" />
                  </div>
                )}

                {group.showDate && (
                  <div className="flex items-center gap-2 px-4 py-2">
                    <div className="flex-1 h-px bg-gray-700" />
                    <span className="text-xs text-gray-400 font-medium">
                      {formatDate(group.messages[0].createdAt)}
                    </span>
                    <div className="flex-1 h-px bg-gray-700" />
                  </div>
                )}

                {group.messages.map((message, messageIndex) => {
                  // Check if this specific message should show the new indicator
                  const messageAbsoluteIndex = groupStartIndex + messageIndex;
                  const showNewIndicatorBeforeMessage = newMessageDividerIndex !== null &&
                    messageAbsoluteIndex === newMessageDividerIndex &&
                    messageIndex !== 0; // Don't show twice if it's first in group

                  return (
                    <div key={message.id}>
                      {showNewIndicatorBeforeMessage && (
                        <div className="flex items-center gap-2 px-4 py-2 my-2">
                          <div className="flex-1 h-px bg-red-500" />
                          <span className="text-xs text-red-500 font-semibold uppercase px-2">
                            New
                          </span>
                          <div className="flex-1 h-px bg-red-500" />
                        </div>
                      )}
                      <MessageItem
                        message={message}
                        isFirstInGroup={messageIndex === 0}
                        currentUserId={currentUserId}
                        onMessageUpdate={(updated) => {
                          setMessages(prev => prev.map(m => m.id === updated.id ? updated : m));
                        }}
                        onMessageDelete={(messageId) => {
                          setMessages(prev => prev.filter(m => m.id !== messageId));
                        }}
                        onReply={onReply}
                        onThreadOpen={onThreadOpen}
                      />
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>

        {typingUsers.size > 0 && (
          <div className="px-4 py-2 text-sm text-gray-400">
            <span className="inline-flex items-center gap-1">
              <span className="flex gap-1">
                <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </span>
              <span className="ml-2">
                {Array.from(typingUsers.values()).join(', ')} {typingUsers.size === 1 ? 'is' : 'are'} typing...
              </span>
            </span>
          </div>
        )}

        <div ref={bottomRef} />
      </div>
    </div>
  );
}

interface MessageGroup {
  id: string;
  messages: Message[];
  showDate: boolean;
}

function groupMessages(messages: Message[]): MessageGroup[] {
  const groups: MessageGroup[] = [];
  let currentGroup: MessageGroup | null = null;
  let lastDate: string | null = null;

  for (const message of messages) {
    const messageDate = new Date(message.createdAt).toDateString();
    const showDate = messageDate !== lastDate;
    lastDate = messageDate;

    const shouldStartNewGroup =
      !currentGroup ||
      showDate ||
      currentGroup.messages[0].author.id !== message.author.id ||
      new Date(message.createdAt).getTime() - 
        new Date(currentGroup.messages[currentGroup.messages.length - 1].createdAt).getTime() > 
        5 * 60 * 1000;

    if (shouldStartNewGroup) {
      currentGroup = { id: message.id, messages: [message], showDate };
      groups.push(currentGroup);
    } else {
      currentGroup!.messages.push(message);
    }
  }

  return groups;
}

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (date.toDateString() === today.toDateString()) {
    return 'Today';
  } else if (date.toDateString() === yesterday.toDateString()) {
    return 'Yesterday';
  } else {
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: date.getFullYear() !== today.getFullYear() ? 'numeric' : undefined,
    });
  }
}
