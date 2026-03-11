'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Smile, Reply, Pin, Pencil, Trash2, Download, Play, FileText, MessageSquare } from 'lucide-react';
import { cn } from '@/lib/utils';
import EmojiPicker from './EmojiPicker';
import UserProfileCard from './UserProfileCard';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';

// Custom event for coordinating action bar visibility across messages
const HIDE_ALL_ACTIONS_EVENT = 'messageitem:hideall';

// Markdown renderer with @mention support
function MessageContent({ 
  content, 
  onMentionClick 
}: { 
  content: string; 
  onMentionClick?: (username: string, event: React.MouseEvent) => void;
}) {
  const components = {
    p: ({ children }: { children?: React.ReactNode }) => (
      <p className="mb-1 last:mb-0">{children}</p>
    ),
    code: ({ inline, children }: { inline?: boolean; children?: React.ReactNode }) => (
      inline 
        ? <code className="bg-gray-800 px-1 py-0.5 rounded text-sm font-mono">{children}</code>
        : <code className="block bg-gray-800 p-2 rounded text-sm font-mono overflow-x-auto my-2">{children}</code>
    ),
    a: ({ href, children }: { href?: string; children?: React.ReactNode }) => (
      <a href={href} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">{children}</a>
    ),
    ul: ({ children }: { children?: React.ReactNode }) => (
      <ul className="list-disc list-inside my-1 ml-2">{children}</ul>
    ),
    ol: ({ children }: { children?: React.ReactNode }) => (
      <ol className="list-decimal list-inside my-1 ml-2">{children}</ol>
    ),
    h1: ({ children }: { children?: React.ReactNode }) => <h1 className="text-lg font-bold mt-2 mb-1">{children}</h1>,
    h2: ({ children }: { children?: React.ReactNode }) => <h2 className="text-base font-bold mt-2 mb-1">{children}</h2>,
    h3: ({ children }: { children?: React.ReactNode }) => <h3 className="text-sm font-bold mt-1 mb-1">{children}</h3>,
    blockquote: ({ children }: { children?: React.ReactNode }) => (
      <blockquote className="border-l-2 border-gray-500 pl-2 my-1 text-gray-400 italic">{children}</blockquote>
    ),
    span: ({ className, children, ...props }: { className?: string; children?: React.ReactNode; 'data-mention'?: string }) => {
      const dataMention = props['data-mention'];
      if (dataMention) {
        return (
          <span
            className="bg-primary/30 text-primary-light px-0.5 rounded cursor-pointer hover:underline"
            onClick={(e) => {
              e.stopPropagation();
              onMentionClick?.(dataMention, e);
            }}
          >
            {children}
          </span>
        );
      }
      return <span className={className} {...props}>{children}</span>;
    },
  };

  return (
    <ReactMarkdown 
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[rehypeRaw]}
      components={components}
    >
      {content}
    </ReactMarkdown>
  );
}

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

interface Thread {
  id: string;
  _count: { messages: number };
  messages?: { author: { displayName: string }; createdAt: string }[];
}

interface Message {
  id: string;
  content: string;
  type: string;
  createdAt: string;
  edited: boolean;
  pinned?: boolean;
  author: Author;
  reactions: Reaction[];
  attachments?: Attachment[];
  replyTo?: {
    id: string;
    content: string;
    author: Author;
  } | null;
  thread?: Thread | null;
}

interface MessageItemProps {
  message: Message;
  isFirstInGroup: boolean;
  currentUserId: string;
  onMessageUpdate?: (message: Message) => void;
  onMessageDelete?: (messageId: string) => void;
  onReply?: (message: Message) => void;
  onReactionUpdate?: (messageId: string, reactions: Reaction[]) => void;
  onThreadOpen?: (message: Message) => void;
  onPinToggle?: (messageId: string, pinned: boolean) => void;
}

export default function MessageItem({ 
  message, 
  isFirstInGroup, 
  currentUserId,
  onMessageUpdate,
  onMessageDelete,
  onReply,
  onReactionUpdate,
  onThreadOpen,
  onPinToggle,
}: MessageItemProps) {
  // Only state we need: editing, emoji picker, delete confirm, lightbox, profile card
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(message.content);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [profileCard, setProfileCard] = useState<{ username: string; position: { x: number; y: number } } | null>(null);
  const [showActions, setShowActions] = useState(false);
  const hideTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const editInputRef = useRef<HTMLTextAreaElement>(null);
  const router = useRouter();

  // Listen for "hide all" events from other messages - only hide if we're not the active one
  useEffect(() => {
    const handleHideAll = (e: CustomEvent<string>) => {
      // If another message is becoming active, hide our actions (unless emoji picker is open)
      if (e.detail !== message.id && !showEmojiPicker) {
        setShowActions(false);
      }
    };
    window.addEventListener(HIDE_ALL_ACTIONS_EVENT, handleHideAll as EventListener);
    return () => window.removeEventListener(HIDE_ALL_ACTIONS_EVENT, handleHideAll as EventListener);
  }, [message.id, showEmojiPicker]);

  // When showing actions, tell all other messages to hide
  const activateActions = useCallback(() => {
    window.dispatchEvent(new CustomEvent(HIDE_ALL_ACTIONS_EVENT, { detail: message.id }));
    if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
    setShowActions(true);
  }, [message.id]);

  const handleMentionClick = (username: string, event: React.MouseEvent) => {
    setProfileCard({
      username,
      position: { x: event.clientX, y: event.clientY + 10 },
    });
  };

  const handleStartDM = async (userId: string) => {
    try {
      const res = await fetch('/api/dms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });
      
      if (res.ok) {
        const dm = await res.json();
        setProfileCard(null);
        router.push(`/chat/${dm.channelId}`);
      } else {
        const error = await res.json();
        console.error('DM error:', error);
      }
    } catch (err) {
      console.error('Failed to start DM:', err);
    }
  };
  
  const isOwn = message.author.id === currentUserId;
  const isSystem = message.type === 'system';

  useEffect(() => {
    if (isEditing && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.setSelectionRange(editContent.length, editContent.length);
    }
  }, [isEditing]);

  if (isSystem) {
    return (
      <div className="px-4 py-1">
        <p className="text-sm text-gray-400 italic">{message.content}</p>
      </div>
    );
  }

  const time = new Date(message.createdAt).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });

  const groupedReactions = groupReactions(message.reactions, currentUserId);

  async function handleEdit() {
    if (!editContent.trim() || editContent.trim() === message.content) {
      setIsEditing(false);
      setEditContent(message.content);
      return;
    }

    try {
      const res = await fetch('/api/chat/messages', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messageId: message.id,
          content: editContent.trim(),
        }),
      });

      if (res.ok) {
        const updated = await res.json();
        onMessageUpdate?.(updated);
        setIsEditing(false);
      }
    } catch (err) {
      console.error('Failed to edit message:', err);
    }
  }

  async function handleDelete() {
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/chat/messages?messageId=${message.id}`, {
        method: 'DELETE',
      });

      if (res.ok) {
        onMessageDelete?.(message.id);
      }
    } catch (err) {
      console.error('Failed to delete message:', err);
    } finally {
      setIsDeleting(false);
      setShowDeleteConfirm(false);
    }
  }

  async function handleReaction(emoji: string) {
    setShowEmojiPicker(false);
    try {
      await fetch('/api/chat/reactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messageId: message.id,
          emoji,
        }),
      });
    } catch (err) {
      console.error('Failed to add reaction:', err);
    }
  }

  async function handlePinToggle() {
    try {
      const res = await fetch('/api/chat/messages/pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageId: message.id }),
      });

      if (res.ok) {
        const data = await res.json();
        onPinToggle?.(message.id, data.pinned);
      }
    } catch (err) {
      console.error('Failed to toggle pin:', err);
    }
  }

  function handleEditKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleEdit();
    } else if (e.key === 'Escape') {
      setIsEditing(false);
      setEditContent(message.content);
    }
  }

  return (
    <>
      {/* Lightbox */}
      {lightboxImage && (
        <div 
          className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center cursor-pointer"
          onClick={() => setLightboxImage(null)}
        >
          <img src={lightboxImage} alt="" className="max-w-[90vw] max-h-[90vh] object-contain" />
        </div>
      )}

      {/* Delete confirmation */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
          <div className="bg-[#2F3136] rounded-lg p-4 max-w-sm mx-4 shadow-xl">
            <h3 className="text-lg font-semibold mb-2">Delete Message</h3>
            <p className="text-gray-400 mb-4">Are you sure? This cannot be undone.</p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowDeleteConfirm(false)} className="px-4 py-2 rounded bg-gray-600 hover:bg-gray-500">
                Cancel
              </button>
              <button onClick={handleDelete} disabled={isDeleting} className="px-4 py-2 rounded bg-red-600 hover:bg-red-500 disabled:opacity-50">
                {isDeleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Emoji picker overlay - closes on click outside */}
      {showEmojiPicker && (
        <div 
          className="fixed inset-0 z-40" 
          onClick={() => setShowEmojiPicker(false)}
        />
      )}

      <div
        className={cn(
          'group/message relative px-4 py-0.5 hover:bg-chat-hover',
          isFirstInGroup && 'mt-4'
        )}
        onMouseEnter={activateActions}
        onMouseLeave={() => {
          // Brief delay to allow mouse to reach action bar
          if (!showEmojiPicker) {
            hideTimeoutRef.current = setTimeout(() => setShowActions(false), 100);
          }
        }}
      >
        {/* Action buttons - controlled by showActions state + coordination via custom event */}
        {!isEditing && (
          <div 
            className={cn(
              'absolute -top-4 right-4 flex items-center gap-0.5 bg-[#2F3136] border border-gray-700 rounded shadow-lg z-10',
              'opacity-0 pointer-events-none',
              'transition-opacity duration-75',
              // Show if hovering or emoji picker open
              (showActions || showEmojiPicker) && 'opacity-100 pointer-events-auto'
            )}
            onMouseEnter={() => {
              if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
            }}
            onMouseLeave={() => {
              if (!showEmojiPicker) {
                setShowActions(false);
              }
            }}
          >
            <div className="relative">
              <ActionButton 
                icon={<Smile className="w-4 h-4" />} 
                label="Add Reaction" 
                onClick={() => setShowEmojiPicker(!showEmojiPicker)}
              />
              {showEmojiPicker && (
                <EmojiPicker
                  onSelect={handleReaction}
                  onClose={() => setShowEmojiPicker(false)}
                />
              )}
            </div>
            <ActionButton 
              icon={<Reply className="w-4 h-4" />} 
              label="Reply"
              onClick={() => onReply?.(message)}
            />
            <ActionButton 
              icon={<MessageSquare className="w-4 h-4" />} 
              label="Reply in Thread"
              onClick={() => onThreadOpen?.(message)}
            />
            <ActionButton 
              icon={<Pin className={cn("w-4 h-4", message.pinned && "text-yellow-500")} />} 
              label={message.pinned ? "Unpin Message" : "Pin Message"}
              onClick={handlePinToggle}
            />
            {isOwn && (
              <>
                <ActionButton 
                  icon={<Pencil className="w-4 h-4" />} 
                  label="Edit"
                  onClick={() => {
                    setIsEditing(true);
                    setEditContent(message.content);
                  }}
                />
                <ActionButton 
                  icon={<Trash2 className="w-4 h-4" />} 
                  label="Delete" 
                  className="hover:text-red-400"
                  onClick={() => setShowDeleteConfirm(true)}
                />
              </>
            )}
          </div>
        )}

        <div className="flex gap-4">
          {/* Avatar */}
          {isFirstInGroup ? (
            <div 
              className="w-10 h-10 rounded-full bg-primary flex-shrink-0 flex items-center justify-center text-sm font-semibold cursor-pointer hover:opacity-80 transition-opacity"
              onClick={(e) => handleMentionClick(message.author.username, e)}
            >
              {message.author.avatar ? (
                <img src={message.author.avatar} alt="" className="w-full h-full rounded-full object-cover" />
              ) : (
                message.author.displayName.slice(0, 2).toUpperCase()
              )}
            </div>
          ) : (
            <div className="w-10 flex-shrink-0 flex items-center justify-center">
              <span className="text-[10px] text-gray-500 opacity-0 group-hover/message:opacity-100">{time}</span>
            </div>
          )}

          {/* Content */}
          <div className="flex-1 min-w-0">
            {/* Reply context */}
            {message.replyTo && (
              <div className="flex items-center gap-2 mb-1 text-sm text-gray-400">
                <div className="w-0.5 h-4 bg-gray-600 rounded" />
                <Reply className="w-3 h-3" />
                <span className="font-medium text-gray-300">{message.replyTo.author.displayName}</span>
                <span className="truncate max-w-xs">{message.replyTo.content}</span>
              </div>
            )}

            {isFirstInGroup && (
              <div className="flex items-baseline gap-2">
                <span 
                  className="font-medium hover:underline cursor-pointer"
                  onClick={(e) => handleMentionClick(message.author.username, e)}
                >
                  {message.author.displayName}
                </span>
                <span className="text-xs text-gray-500">{time}</span>
                {message.edited && <span className="text-xs text-gray-500">(edited)</span>}
                {message.pinned && (
                  <span className="flex items-center gap-1 text-xs text-yellow-500">
                    <Pin className="w-3 h-3" />
                    pinned
                  </span>
                )}
              </div>
            )}

            {/* Edit mode or content */}
            {isEditing ? (
              <div className="mt-1">
                <textarea
                  ref={editInputRef}
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  onKeyDown={handleEditKeyDown}
                  className="w-full bg-[#40444B] rounded px-3 py-2 text-gray-100 resize-none focus:outline-none focus:ring-2 focus:ring-primary"
                  rows={Math.min(editContent.split('\n').length + 1, 10)}
                />
                <div className="flex items-center gap-2 mt-1 text-xs text-gray-400">
                  <span>escape to</span>
                  <button onClick={() => { setIsEditing(false); setEditContent(message.content); }} className="text-primary hover:underline">cancel</button>
                  <span>• enter to</span>
                  <button onClick={handleEdit} className="text-primary hover:underline">save</button>
                </div>
              </div>
            ) : (
              message.content && message.content.trim() && (
                <div className="message-content text-gray-100">
                  <MessageContent content={message.content} onMentionClick={handleMentionClick} />
                </div>
              )
            )}

            {/* User Profile Card */}
            {profileCard && (
              <UserProfileCard
                username={profileCard.username}
                position={profileCard.position}
                onClose={() => setProfileCard(null)}
                onStartDM={handleStartDM}
              />
            )}

            {/* Attachments */}
            {message.attachments && message.attachments.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {message.attachments.map((attachment) => (
                  <AttachmentPreview 
                    key={attachment.id} 
                    attachment={attachment}
                    onImageClick={() => setLightboxImage(attachment.url)}
                  />
                ))}
              </div>
            )}

            {/* Thread indicator */}
            {message.thread && message.thread._count.messages > 0 && (
              <button
                onClick={() => onThreadOpen?.(message)}
                className="flex items-center gap-2 mt-2 px-2 py-1 text-sm text-blue-400 hover:text-blue-300 hover:bg-blue-500/10 rounded transition-colors"
              >
                <MessageSquare className="w-4 h-4" />
                <span className="font-medium">
                  {message.thread._count.messages} {message.thread._count.messages === 1 ? 'reply' : 'replies'}
                </span>
                {message.thread.messages?.[0] && (
                  <span className="text-gray-400">
                    Last reply from {message.thread.messages[0].author.displayName}
                  </span>
                )}
              </button>
            )}

            {/* Reactions */}
            {groupedReactions.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {groupedReactions.map((reaction) => (
                  <button
                    key={reaction.emoji}
                    onClick={() => handleReaction(reaction.emoji)}
                    className={cn(
                      'flex items-center gap-1 px-2 py-0.5 rounded-full text-sm transition-colors',
                      reaction.hasOwn
                        ? 'bg-primary/30 border border-primary/50 hover:bg-primary/40'
                        : 'bg-[#2F3136] border border-transparent hover:border-gray-600'
                    )}
                  >
                    <span>{reaction.emoji}</span>
                    <span className="text-xs text-gray-300">{reaction.count}</span>
                  </button>
                ))}
                <button 
                  onClick={() => setShowEmojiPicker(true)}
                  className="px-2 py-0.5 rounded-full bg-[#2F3136] border border-transparent hover:border-gray-600 opacity-0 group-hover/message:opacity-100 transition-opacity"
                >
                  <Smile className="w-4 h-4 text-gray-400" />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

function AttachmentPreview({ attachment, onImageClick }: { attachment: Attachment; onImageClick: () => void }) {
  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  };

  if (attachment.type === 'image') {
    return (
      <div className="relative max-w-md cursor-pointer group/attachment rounded-lg overflow-hidden" onClick={onImageClick}>
        <img src={attachment.url} alt={attachment.name} className="max-h-[300px] rounded-lg object-contain bg-black/20" loading="lazy" />
        <div className="absolute inset-0 bg-black/0 group-hover/attachment:bg-black/20 transition-colors" />
      </div>
    );
  }

  if (attachment.type === 'video') {
    return (
      <div className="max-w-lg rounded-lg overflow-hidden bg-black">
        <video src={attachment.url} controls className="max-h-[400px] w-auto" preload="metadata" />
      </div>
    );
  }

  if (attachment.type === 'audio') {
    return (
      <div className="flex items-center gap-3 p-3 bg-[#2F3136] rounded-lg max-w-md">
        <div className="w-10 h-10 bg-primary/20 rounded flex items-center justify-center">
          <Play className="w-5 h-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{attachment.name}</p>
          <audio src={attachment.url} controls className="w-full h-8 mt-1" />
        </div>
      </div>
    );
  }

  return (
    <a href={attachment.url} download={attachment.name} className="flex items-center gap-3 p-3 bg-[#2F3136] rounded-lg hover:bg-[#3A3D44] transition-colors max-w-sm">
      <div className="w-10 h-10 bg-gray-600 rounded flex items-center justify-center flex-shrink-0">
        <FileText className="w-5 h-5 text-gray-300" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-primary truncate">{attachment.name}</p>
        <p className="text-xs text-gray-400">{formatSize(attachment.size)}</p>
      </div>
      <Download className="w-5 h-5 text-gray-400 flex-shrink-0" />
    </a>
  );
}

function ActionButton({ icon, label, className, onClick }: { icon: React.ReactNode; label: string; className?: string; onClick?: () => void }) {
  return (
    <button onClick={onClick} className={cn('p-2 text-gray-400 hover:text-gray-200 hover:bg-white/10 transition-colors', className)} title={label}>
      {icon}
    </button>
  );
}

function groupReactions(reactions: Reaction[], currentUserId: string): { emoji: string; count: number; hasOwn: boolean }[] {
  const grouped: { [key: string]: { count: number; hasOwn: boolean } } = {};
  
  for (const reaction of reactions) {
    if (!grouped[reaction.emoji]) {
      grouped[reaction.emoji] = { count: 0, hasOwn: false };
    }
    grouped[reaction.emoji].count++;
    if (reaction.user.id === currentUserId) {
      grouped[reaction.emoji].hasOwn = true;
    }
  }

  return Object.entries(grouped).map(([emoji, data]) => ({ emoji, ...data }));
}
