'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { PlusCircle, X, Send, Image, Film, FileText, Loader2, Reply, Bold, Italic, Strikethrough, Link2, List, Code } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSocket } from '@/components/providers/SocketProvider';
import MentionAutocomplete from './MentionAutocomplete';
import RichTextEditor, { RichTextEditorRef } from './RichTextEditor';

interface ReplyTo {
  id: string;
  content: string;
  author: {
    id: string;
    displayName: string;
  };
}

interface MessageInputProps {
  channelId: string;
  currentUser: {
    id: string;
    displayName: string;
    username?: string;
  };
  replyTo?: ReplyTo | null;
  onCancelReply?: () => void;
  // Thread mode props
  threadParentMessageId?: string;
  placeholder?: string;
}

interface PendingAttachment {
  file: File;
  preview?: string;
  type: 'image' | 'video' | 'file';
  uploading: boolean;
  error?: string;
}

interface MentionUser {
  id: string;
  username: string;
  displayName: string;
  avatar: string | null;
  status: string;
}

// Draft storage helpers
const DRAFT_KEY_PREFIX = 'mc-draft-';
function getDraft(channelId: string): string {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem(`${DRAFT_KEY_PREFIX}${channelId}`) || '';
}
function saveDraft(channelId: string, content: string) {
  if (typeof window === 'undefined') return;
  if (content && content !== '<p></p>') {
    localStorage.setItem(`${DRAFT_KEY_PREFIX}${channelId}`, content);
  } else {
    localStorage.removeItem(`${DRAFT_KEY_PREFIX}${channelId}`);
  }
}

export default function MessageInput({ channelId, currentUser, replyTo, onCancelReply, threadParentMessageId, placeholder }: MessageInputProps) {
  const [message, setMessage] = useState(() => getDraft(channelId));
  const [sending, setSending] = useState(false);
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const [showMentions, setShowMentions] = useState(false);
  const [mentionSearch, setMentionSearch] = useState('');
  const [mentionStartIndex, setMentionStartIndex] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [showFormatting, setShowFormatting] = useState(false);
  const [useRichText, setUseRichText] = useState(true);
  const dragCounterRef = useRef(0);
  const richEditorRef = useRef<RichTextEditorRef>(null);

  // Format text with markdown
  const insertFormatting = useCallback((prefix: string, suffix: string = prefix, placeholder: string = '') => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = message.slice(start, end);
    const textToWrap = selectedText || placeholder;
    
    const newMessage = message.slice(0, start) + prefix + textToWrap + suffix + message.slice(end);
    setMessage(newMessage);

    // Set cursor position after the operation
    setTimeout(() => {
      textarea.focus();
      if (selectedText) {
        // Select the wrapped text
        textarea.setSelectionRange(start + prefix.length, start + prefix.length + selectedText.length);
      } else {
        // Place cursor inside the formatting
        textarea.setSelectionRange(start + prefix.length, start + prefix.length + placeholder.length);
      }
    }, 0);
  }, [message]);

  const formatBold = () => insertFormatting('**', '**', 'bold text');
  const formatItalic = () => insertFormatting('*', '*', 'italic text');
  const formatStrikethrough = () => insertFormatting('~~', '~~', 'strikethrough');
  const formatCode = () => insertFormatting('`', '`', 'code');
  const formatLink = () => insertFormatting('[', '](url)', 'link text');
  const formatList = () => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const beforeCursor = message.slice(0, start);
    const afterCursor = message.slice(start);
    
    // Check if we're at the start of a line
    const lastNewline = beforeCursor.lastIndexOf('\n');
    const isStartOfLine = lastNewline === beforeCursor.length - 1 || start === 0;
    
    const bullet = isStartOfLine ? '• ' : '\n• ';
    const newMessage = beforeCursor + bullet + afterCursor;
    setMessage(newMessage);
    
    setTimeout(() => {
      textarea.focus();
      const newPos = start + bullet.length;
      textarea.setSelectionRange(newPos, newPos);
    }, 0);
  };
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { socket, sendMessage, startTyping, stopTyping } = useSocket();

  // Detect @ mentions while typing
  const checkForMention = useCallback((text: string, cursorPos: number) => {
    // Find the @ symbol before cursor
    const textBeforeCursor = text.slice(0, cursorPos);
    const lastAtIndex = textBeforeCursor.lastIndexOf('@');
    
    if (lastAtIndex === -1) {
      setShowMentions(false);
      return;
    }

    // Check if @ is at start or preceded by whitespace
    const charBefore = textBeforeCursor[lastAtIndex - 1];
    if (lastAtIndex > 0 && charBefore && !/\s/.test(charBefore)) {
      setShowMentions(false);
      return;
    }

    // Get the search text after @
    const searchText = textBeforeCursor.slice(lastAtIndex + 1);
    
    // If there's a space after @, close mentions
    if (searchText.includes(' ')) {
      setShowMentions(false);
      return;
    }

    setMentionStartIndex(lastAtIndex);
    setMentionSearch(searchText);
    setShowMentions(true);
  }, []);

  const handleMentionSelect = useCallback((user: MentionUser) => {
    const before = message.slice(0, mentionStartIndex);
    const after = message.slice(mentionStartIndex + mentionSearch.length + 1);
    const newMessage = `${before}@${user.username} ${after}`;
    setMessage(newMessage);
    setShowMentions(false);
    
    // Focus and set cursor position
    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        const newCursorPos = mentionStartIndex + user.username.length + 2;
        textareaRef.current.setSelectionRange(newCursorPos, newCursorPos);
      }
    }, 0);
  }, [message, mentionStartIndex, mentionSearch]);

  // Load draft when channel changes
  useEffect(() => {
    const draft = getDraft(channelId);
    setMessage(draft);
    if (useRichText && richEditorRef.current) {
      richEditorRef.current.setContent(draft);
    }
  }, [channelId]);

  // Save draft when message changes (debounced)
  useEffect(() => {
    const timeout = setTimeout(() => {
      saveDraft(channelId, message);
    }, 300);
    return () => clearTimeout(timeout);
  }, [message, channelId]);

  // Focus textarea when reply is set
  useEffect(() => {
    if (replyTo && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [replyTo]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
    }
  }, [message]);

  // Cleanup preview URLs on unmount
  useEffect(() => {
    return () => {
      attachments.forEach(a => {
        if (a.preview) URL.revokeObjectURL(a.preview);
      });
    };
  }, []);

  function getFileType(file: File): 'image' | 'video' | 'file' {
    if (file.type.startsWith('image/')) return 'image';
    if (file.type.startsWith('video/')) return 'video';
    return 'file';
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files) return;

    const newAttachments: PendingAttachment[] = [];
    
    for (const file of Array.from(files)) {
      const type = getFileType(file);
      const preview = type === 'image' ? URL.createObjectURL(file) : undefined;
      newAttachments.push({ file, preview, type, uploading: false });
    }

    setAttachments(prev => [...prev, ...newAttachments]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function removeAttachment(index: number) {
    setAttachments(prev => {
      const removed = prev[index];
      if (removed.preview) URL.revokeObjectURL(removed.preview);
      return prev.filter((_, i) => i !== index);
    });
  }

  async function uploadFile(file: File): Promise<{ url: string; name: string; type: string; size: number } | null> {
    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch('/api/upload', { method: 'POST', body: formData });
      if (!res.ok) throw new Error('Upload failed');
      return await res.json();
    } catch (error) {
      console.error('Upload error:', error);
      return null;
    }
  }

  // Helper to check if message has actual content
  const hasMessageContent = useCallback(() => {
    if (!message) return false;
    // For rich text, check if it's just empty paragraph
    if (useRichText) {
      const stripped = message.replace(/<p><\/p>/g, '').replace(/<br\/?>/g, '').trim();
      return stripped.length > 0;
    }
    return message.trim().length > 0;
  }, [message, useRichText]);

  async function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault();
    
    const hasContent = hasMessageContent() || attachments.length > 0;
    if (!hasContent || sending) return;

    setSending(true);
    
    try {
      // Upload attachments
      const uploadedAttachments: Array<{ url: string; name: string; type: string; size: number }> = [];
      
      for (let i = 0; i < attachments.length; i++) {
        setAttachments(prev => prev.map((a, idx) => idx === i ? { ...a, uploading: true } : a));
        const result = await uploadFile(attachments[i].file);
        
        if (result) {
          uploadedAttachments.push(result);
        } else {
          setAttachments(prev => prev.map((a, idx) => idx === i ? { ...a, uploading: false, error: 'Upload failed' } : a));
          throw new Error('Failed to upload attachment');
        }
      }

      // Send message - either to thread or channel
      let res: Response;
      let newMessage: any;
      
      if (threadParentMessageId) {
        // Thread mode - post to threads endpoint
        res = await fetch('/api/chat/threads', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            parentMessageId: threadParentMessageId,
            content: message.trim() || ' ',
            attachments: uploadedAttachments,
          }),
        });
        
        if (!res.ok) throw new Error('Failed to send thread reply');
        
        const data = await res.json();
        newMessage = data.message;
      } else {
        // Channel mode - post to messages endpoint
        res = await fetch('/api/chat/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            channelId,
            content: message.trim() || ' ',
            attachments: uploadedAttachments,
            replyToId: replyTo?.id || null,
          }),
        });
        
        if (!res.ok) throw new Error('Failed to send message');
        
        newMessage = await res.json();
      }
      
      sendMessage({ ...newMessage, channelId, threadId: threadParentMessageId ? newMessage.threadId : undefined });

      // Stop typing
      if (isTyping) {
        stopTyping(channelId, currentUser);
        setIsTyping(false);
      }

      // Clear state and draft
      setMessage('');
      saveDraft(channelId, ''); // Clear the draft
      if (useRichText) {
        richEditorRef.current?.clear();
      }
      attachments.forEach(a => { if (a.preview) URL.revokeObjectURL(a.preview); });
      setAttachments([]);
      onCancelReply?.();
    } catch (error) {
      console.error('Failed to send message:', error);
    } finally {
      setSending(false);
      // Refocus the input after everything completes
      requestAnimationFrame(() => {
        if (useRichText) {
          richEditorRef.current?.focus();
        } else {
          textareaRef.current?.focus();
        }
      });
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    } else if (e.key === 'Escape' && replyTo) {
      onCancelReply?.();
    }
  }

  function handlePaste(e: React.ClipboardEvent) {
    const items = e.clipboardData.items;
    const files: File[] = [];
    
    for (const item of Array.from(items)) {
      if (item.kind === 'file') {
        const file = item.getAsFile();
        if (file) files.push(file);
      }
    }
    
    if (files.length > 0) {
      e.preventDefault();
      const newAttachments: PendingAttachment[] = files.map(file => ({
        file,
        preview: file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined,
        type: getFileType(file),
        uploading: false,
      }));
      setAttachments(prev => [...prev, ...newAttachments]);
    }
  }

  const hasContent = hasMessageContent() || attachments.length > 0;

  // Drag & Drop handlers
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current++;
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setIsDragging(true);
    }
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current--;
    if (dragCounterRef.current === 0) {
      setIsDragging(false);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    dragCounterRef.current = 0;

    const files = Array.from(e.dataTransfer.files);
    if (files.length === 0) return;

    const newAttachments: PendingAttachment[] = files.map(file => ({
      file,
      preview: file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined,
      type: getFileType(file),
      uploading: false,
    }));
    setAttachments(prev => [...prev, ...newAttachments]);
  }, []);

  return (
    <div 
      className="px-4 pb-6 relative"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {/* Drag overlay */}
      {isDragging && (
        <div className="absolute inset-0 bg-primary/20 border-2 border-dashed border-primary rounded-lg flex items-center justify-center z-50 pointer-events-none">
          <div className="bg-[#36393F] px-6 py-4 rounded-lg shadow-lg">
            <p className="text-lg font-medium text-white">Drop files to upload</p>
            <p className="text-sm text-gray-400">Images, videos, or documents</p>
          </div>
        </div>
      )}
      {/* Reply context */}
      {replyTo && (
        <div className="flex items-center gap-2 mb-2 px-3 py-2 bg-[#40444B] rounded-t-lg border-b border-[#2D2F34]">
          <Reply className="w-4 h-4 text-gray-400" />
          <span className="text-sm text-gray-400">Replying to</span>
          <span className="text-sm font-medium text-primary">{replyTo.author.displayName}</span>
          <span className="text-sm text-gray-400 truncate flex-1">{replyTo.content}</span>
          <button onClick={onCancelReply} className="p-1 hover:bg-white/10 rounded">
            <X className="w-4 h-4 text-gray-400" />
          </button>
        </div>
      )}

      {/* Attachment previews */}
      {attachments.length > 0 && (
        <div className={cn(
          "flex flex-wrap gap-2 mb-2 p-2 bg-[#40444B] border-b border-[#2D2F34]",
          replyTo ? '' : 'rounded-t-lg'
        )}>
          {attachments.map((attachment, index) => (
            <div
              key={index}
              className={cn('relative group', attachment.type === 'image' ? 'w-24 h-24' : 'w-48 h-12')}
            >
              {attachment.type === 'image' && attachment.preview ? (
                <img src={attachment.preview} alt={attachment.file.name} className="w-full h-full object-cover rounded" />
              ) : (
                <div className="w-full h-full bg-[#2D2F34] rounded flex items-center gap-2 px-3">
                  {attachment.type === 'video' ? <Film className="w-5 h-5 text-gray-400 flex-shrink-0" /> : <FileText className="w-5 h-5 text-gray-400 flex-shrink-0" />}
                  <span className="text-sm text-gray-300 truncate">{attachment.file.name}</span>
                </div>
              )}
              
              {attachment.uploading && (
                <div className="absolute inset-0 bg-black/50 flex items-center justify-center rounded">
                  <Loader2 className="w-6 h-6 text-white animate-spin" />
                </div>
              )}
              
              {attachment.error && (
                <div className="absolute inset-0 bg-red-500/50 flex items-center justify-center rounded">
                  <span className="text-xs text-white">Error</span>
                </div>
              )}
              
              <button
                onClick={() => removeAttachment(index)}
                className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <X className="w-3 h-3 text-white" />
              </button>
            </div>
          ))}
        </div>
      )}

      <form onSubmit={handleSubmit} className="relative">
        {/* Formatting toolbar - only for plain text mode */}
        {showFormatting && !useRichText && (
          <div className="flex items-center gap-1 px-3 py-1.5 bg-[#36393F] border-b border-[#2D2F34] rounded-t-lg">
            <button
              type="button"
              onClick={formatBold}
              className="p-1.5 text-gray-400 hover:text-gray-200 hover:bg-white/10 rounded"
              title="Bold (Ctrl+B)"
            >
              <Bold className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={formatItalic}
              className="p-1.5 text-gray-400 hover:text-gray-200 hover:bg-white/10 rounded"
              title="Italic (Ctrl+I)"
            >
              <Italic className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={formatStrikethrough}
              className="p-1.5 text-gray-400 hover:text-gray-200 hover:bg-white/10 rounded"
              title="Strikethrough"
            >
              <Strikethrough className="w-4 h-4" />
            </button>
            <div className="w-px h-4 bg-gray-600 mx-1" />
            <button
              type="button"
              onClick={formatLink}
              className="p-1.5 text-gray-400 hover:text-gray-200 hover:bg-white/10 rounded"
              title="Link"
            >
              <Link2 className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={formatList}
              className="p-1.5 text-gray-400 hover:text-gray-200 hover:bg-white/10 rounded"
              title="Bullet List"
            >
              <List className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={formatCode}
              className="p-1.5 text-gray-400 hover:text-gray-200 hover:bg-white/10 rounded"
              title="Code"
            >
              <Code className="w-4 h-4" />
            </button>
          </div>
        )}
        <div className={cn(
          'flex items-end gap-2 bg-[#40444B]',
          showFormatting ? 'rounded-b-lg' : (attachments.length > 0 || replyTo) ? 'rounded-b-lg' : 'rounded-lg'
        )}>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="p-3 text-gray-400 hover:text-gray-200"
            title="Upload a file"
          >
            <PlusCircle className="w-6 h-6" />
          </button>

          <input
            ref={fileInputRef}
            type="file"
            onChange={handleFileSelect}
            multiple
            accept="image/*,video/*,.pdf,.txt,.json"
            className="hidden"
          />

          <div className="flex-1 py-2.5 relative">
            {useRichText ? (
              <RichTextEditor
                ref={richEditorRef}
                value={message}
                onChange={(html) => {
                  setMessage(html);
                  
                  if (html && html !== '<p></p>' && !isTyping) {
                    setIsTyping(true);
                    startTyping(channelId, currentUser);
                  }
                  
                  if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
                  
                  typingTimeoutRef.current = setTimeout(() => {
                    if (isTyping) {
                      setIsTyping(false);
                      stopTyping(channelId, currentUser);
                    }
                  }, 2000);
                }}
                onSubmit={() => {
                  const form = document.querySelector('form');
                  if (form) {
                    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
                  }
                }}
                placeholder={placeholder || (replyTo ? `Reply to ${replyTo.author.displayName}...` : "Message #general")}
                disabled={sending}
                onPasteFiles={(files) => {
                  const newAttachments: PendingAttachment[] = files.map(file => ({
                    file,
                    preview: file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined,
                    type: getFileType(file),
                    uploading: false,
                  }));
                  setAttachments(prev => [...prev, ...newAttachments]);
                }}
              />
            ) : (
              <textarea
                ref={textareaRef}
                value={message}
                onChange={(e) => {
                  setMessage(e.target.value);
                  
                  // Check for @mention
                  checkForMention(e.target.value, e.target.selectionStart || 0);
                  
                  if (e.target.value.trim() && !isTyping) {
                    setIsTyping(true);
                    startTyping(channelId, currentUser);
                  }
                  
                  if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
                  
                  typingTimeoutRef.current = setTimeout(() => {
                    if (isTyping) {
                      setIsTyping(false);
                      stopTyping(channelId, currentUser);
                    }
                  }, 2000);
                }}
                onKeyDown={(e) => {
                  // If mention autocomplete is open, let it handle arrow keys/enter/tab
                  if (showMentions && ['ArrowUp', 'ArrowDown', 'Enter', 'Tab', 'Escape'].includes(e.key)) {
                    return; // Let MentionAutocomplete handle it
                  }
                  // Formatting shortcuts
                  if ((e.ctrlKey || e.metaKey) && !e.shiftKey) {
                    if (e.key === 'b') {
                      e.preventDefault();
                      formatBold();
                      return;
                    }
                    if (e.key === 'i') {
                      e.preventDefault();
                      formatItalic();
                      return;
                    }
                  }
                  handleKeyDown(e);
                }}
                onPaste={handlePaste}
                placeholder={placeholder || (replyTo ? `Reply to ${replyTo.author.displayName}...` : "Message #general")}
                className="w-full bg-transparent resize-none text-gray-100 placeholder:text-gray-500 focus:outline-none max-h-[200px]"
                rows={1}
                disabled={sending}
              />
            )}
            
            {/* Mention Autocomplete */}
            {showMentions && !useRichText && (
              <MentionAutocomplete
                search={mentionSearch}
                onSelect={handleMentionSelect}
                onClose={() => setShowMentions(false)}
                position={{ top: 0, left: 0 }}
              />
            )}
          </div>

          <div className="flex items-center gap-1 p-2">
            {!useRichText && (
              <button
                type="button"
                onClick={() => setShowFormatting(!showFormatting)}
                className={cn(
                  "p-1.5 rounded transition-colors",
                  showFormatting ? "text-primary bg-primary/20" : "text-gray-400 hover:text-gray-200"
                )}
                title="Formatting options"
              >
                <Bold className="w-5 h-5" />
              </button>
            )}
            {useRichText && (
              <span className="px-2 text-xs text-gray-500" title="Select text for formatting options">
                Aa
              </span>
            )}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="p-1.5 text-gray-400 hover:text-gray-200"
              title="Add image"
            >
              <Image className="w-5 h-5" />
            </button>
            
            {hasContent && (
              <button
                type="submit"
                disabled={sending}
                className={cn(
                  'p-1.5 rounded text-white ml-1',
                  sending ? 'bg-primary/50' : 'bg-primary hover:bg-primary-hover'
                )}
                title="Send message"
              >
                {sending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
              </button>
            )}
          </div>
        </div>
      </form>
    </div>
  );
}
