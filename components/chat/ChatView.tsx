'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import MessageList from './MessageList';
import MessageInput from './MessageInput';
import ThreadPanel from './ThreadPanel';

interface Author {
  id: string;
  displayName: string;
  avatar: string | null;
}

interface ReplyTo {
  id: string;
  content: string;
  author: Author;
}

interface ThreadMessage {
  id: string;
  content: string;
  createdAt: string;
  author: Author;
}

interface ThreadInfo {
  threadId: string | null;
  parentMessage: ThreadMessage | null;
}

interface ChatViewProps {
  channelId: string;
  currentUser: {
    id: string;
    displayName: string;
    username?: string;
  };
}

export default function ChatView({ channelId, currentUser }: ChatViewProps) {
  const searchParams = useSearchParams();
  const highlightMessageId = searchParams.get('highlight');
  const [replyTo, setReplyTo] = useState<ReplyTo | null>(null);
  const [threadInfo, setThreadInfo] = useState<ThreadInfo | null>(null);

  // Mark channel as read when viewing
  useEffect(() => {
    const markAsRead = async () => {
      try {
        await fetch('/api/channels/read', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ channelId }),
        });
      } catch (err) {
        console.error('Failed to mark channel as read:', err);
      }
    };
    
    markAsRead();
    
    // Also mark as read periodically while viewing (every 30s)
    // and when window regains focus
    const interval = setInterval(markAsRead, 30000);
    const handleFocus = () => markAsRead();
    window.addEventListener('focus', handleFocus);
    
    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', handleFocus);
    };
  }, [channelId]);

  const handleOpenThread = (message: any) => {
    setThreadInfo({
      threadId: message.thread?.id || null,
      parentMessage: {
        id: message.id,
        content: message.content,
        createdAt: message.createdAt,
        author: {
          id: message.author.id,
          displayName: message.author.displayName,
          avatar: message.author.avatar,
        },
      },
    });
  };

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* Main chat area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <MessageList 
          channelId={channelId} 
          currentUserId={currentUser.id}
          highlightMessageId={highlightMessageId}
          onReply={(message) => {
            setReplyTo({
              id: message.id,
              content: message.content,
              author: {
                id: message.author.id,
                displayName: message.author.displayName,
                avatar: message.author.avatar || null,
              },
            });
          }}
          onThreadOpen={handleOpenThread}
        />
        <MessageInput 
          channelId={channelId} 
          currentUser={currentUser}
          replyTo={replyTo}
          onCancelReply={() => setReplyTo(null)}
        />
      </div>

      {/* Thread panel - full screen overlay on mobile, side panel on desktop */}
      {threadInfo && (
        <>
          {/* Mobile backdrop */}
          <div 
            className="md:hidden fixed inset-0 bg-black/50 z-40"
            onClick={() => setThreadInfo(null)}
          />
          <div className="fixed inset-0 z-50 md:relative md:inset-auto md:z-auto">
            <ThreadPanel
              threadId={threadInfo.threadId}
              parentMessage={threadInfo.parentMessage}
              channelId={channelId}
              currentUser={currentUser}
              onClose={() => setThreadInfo(null)}
            />
          </div>
        </>
      )}
    </div>
  );
}
