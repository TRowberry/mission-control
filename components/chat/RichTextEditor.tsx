'use client';

import { useEditor, EditorContent, ReactRenderer } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import Mention from '@tiptap/extension-mention';
import { useEffect, useImperativeHandle, forwardRef, useCallback, useRef, useState } from 'react';
import { Bold, Italic, Strikethrough, Link2, List, Code } from 'lucide-react';
import { cn } from '@/lib/utils';
import { createPortal } from 'react-dom';

interface MentionUser {
  id: string;
  username: string;
  displayName: string;
  avatar: string | null;
}

// Mention suggestion list component
interface MentionListProps {
  items: MentionUser[];
  command: (item: { id: string; label: string }) => void;
  selectedIndex: number;
  position: { bottom: number; left: number } | null;
}

const MentionList = forwardRef<{ onKeyDown: (props: { event: KeyboardEvent }) => boolean }, MentionListProps>(
  ({ items, command, selectedIndex, position }, ref) => {
    const selectItem = (index: number) => {
      const item = items[index];
      if (item) {
        command({ id: item.id, label: item.username });
      }
    };

    useImperativeHandle(ref, () => ({
      onKeyDown: ({ event }: { event: KeyboardEvent }) => {
        if (event.key === 'Enter' || event.key === 'Tab') {
          selectItem(selectedIndex);
          return true;
        }
        return false;
      },
    }));

    if (!position) return null;

    const content = (
      <div 
        className="fixed bg-gray-800 border border-gray-700 rounded-lg shadow-xl overflow-hidden min-w-[200px] max-h-[200px] overflow-y-auto z-50"
        style={{ bottom: position.bottom, left: position.left }}
      >
        {items.length === 0 ? (
          <div className="px-3 py-2 text-gray-400 text-sm">No users found</div>
        ) : (
          items.map((item, index) => (
            <button
              key={item.id}
              onClick={() => selectItem(index)}
              className={cn(
                'flex items-center gap-2 w-full px-3 py-2 text-left transition-colors',
                index === selectedIndex ? 'bg-primary/20 text-white' : 'text-gray-300 hover:bg-gray-700'
              )}
            >
              {item.avatar ? (
                <img src={item.avatar} alt="" className="w-6 h-6 rounded-full" />
              ) : (
                <div className="w-6 h-6 rounded-full bg-gray-600 flex items-center justify-center text-xs">
                  {item.displayName.charAt(0).toUpperCase()}
                </div>
              )}
              <div>
                <div className="text-sm font-medium">{item.displayName}</div>
                <div className="text-xs text-gray-400">@{item.username}</div>
              </div>
            </button>
          ))
        )}
      </div>
    );

    return typeof document !== 'undefined' ? createPortal(content, document.body) : null;
  }
);

MentionList.displayName = 'MentionList';

interface RichTextEditorProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  placeholder?: string;
  disabled?: boolean;
  onTyping?: () => void;
  onPasteFiles?: (files: File[]) => void;
  className?: string;
}

export interface RichTextEditorRef {
  focus: () => void;
  clear: () => void;
  insertText: (text: string) => void;
  setContent: (content: string) => void;
}

const RichTextEditor = forwardRef<RichTextEditorRef, RichTextEditorProps>(
  ({ value, onChange, onSubmit, placeholder, disabled, onTyping, onPasteFiles, className }, ref) => {
    const [users, setUsers] = useState<MentionUser[]>([]);
    // Use ref so the suggestion callback always sees current users
    const usersRef = useRef<MentionUser[]>([]);
    const [mentionPopup, setMentionPopup] = useState<{
      items: MentionUser[];
      command: (item: { id: string; label: string }) => void;
      selectedIndex: number;
      position: { bottom: number; left: number } | null;
    } | null>(null);
    
    // Fetch users for mentions
    useEffect(() => {
      fetch('/api/users', { credentials: 'include' })
        .then(res => res.json())
        .then(data => {
          // API returns array directly, not { users: [] }
          if (Array.isArray(data)) {
            setUsers(data);
            usersRef.current = data;
          }
        })
        .catch(err => console.error('Failed to fetch users for mentions:', err));
    }, []);

    // Use ref to ensure extensions are only created once
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const extensionsRef = useRef<any[] | null>(null);
    const selectedIndexRef = useRef(0);
    
    // Create mention suggestion config
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const suggestion: any = {
      items: ({ query }: { query: string }) => {
        // Use ref to always get current users (closure would capture initial empty array)
        return usersRef.current
          .filter(user => 
            user.username.toLowerCase().includes(query.toLowerCase()) ||
            user.displayName.toLowerCase().includes(query.toLowerCase())
          )
          .slice(0, 5);
      },
      render: () => {
        return {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          onStart: (props: any) => {
            selectedIndexRef.current = 0;
            const rect = props.clientRect?.();
            // Position above input bar using bottom positioning
            // bottom = viewport height - top of cursor + small gap
            const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : 800;
            setMentionPopup({
              items: props.items,
              command: props.command,
              selectedIndex: 0,
              position: rect ? { bottom: viewportHeight - rect.top + 8, left: rect.left } : null,
            });
          },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          onUpdate: (props: any) => {
            const rect = props.clientRect?.();
            const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : 800;
            setMentionPopup(prev => prev ? {
              ...prev,
              items: props.items,
              command: props.command,
              position: rect ? { bottom: viewportHeight - rect.top + 8, left: rect.left } : null,
            } : null);
          },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          onKeyDown: (props: any) => {
            if (props.event.key === 'Escape') {
              setMentionPopup(null);
              return true;
            }
            
            if (props.event.key === 'ArrowUp') {
              props.event.preventDefault();
              selectedIndexRef.current = Math.max(0, selectedIndexRef.current - 1);
              setMentionPopup(prev => prev ? { ...prev, selectedIndex: selectedIndexRef.current } : null);
              return true;
            }
            
            if (props.event.key === 'ArrowDown') {
              props.event.preventDefault();
              setMentionPopup(prev => {
                if (!prev) return null;
                selectedIndexRef.current = Math.min(prev.items.length - 1, selectedIndexRef.current + 1);
                return { ...prev, selectedIndex: selectedIndexRef.current };
              });
              return true;
            }
            
            if (props.event.key === 'Enter' || props.event.key === 'Tab') {
              setMentionPopup(prev => {
                if (prev && prev.items[selectedIndexRef.current]) {
                  prev.command({ 
                    id: prev.items[selectedIndexRef.current].id, 
                    label: prev.items[selectedIndexRef.current].username 
                  });
                }
                return null;
              });
              return true;
            }

            return false;
          },
          onExit: () => {
            setMentionPopup(null);
          },
        };
      },
    };

    if (!extensionsRef.current) {
      extensionsRef.current = [
        StarterKit.configure({
          heading: false,
          horizontalRule: false,
          blockquote: false,
          codeBlock: false,
        }),
        Link.configure({
          openOnClick: false,
          HTMLAttributes: {
            class: 'text-primary underline',
          },
        }),
        Placeholder.configure({
          placeholder: placeholder || 'Write a message...',
          showOnlyWhenEditable: true,
        }),
        Mention.configure({
          HTMLAttributes: {
            class: 'mention bg-primary/30 text-primary-light px-0.5 rounded',
          },
          suggestion,
          renderHTML({ options, node }) {
            return [
              'span',
              {
                class: options.HTMLAttributes?.class,
                'data-mention': node.attrs.id,
              },
              `@${node.attrs.label}`,
            ];
          },
        }),
      ];
    }
    const extensions = extensionsRef.current;

    const editor = useEditor({
      immediatelyRender: false,
      extensions,
      content: value,
      editorProps: {
        attributes: {
          class: 'prose prose-invert prose-sm max-w-none focus:outline-none min-h-[24px] max-h-[200px] overflow-y-auto',
        },
        handleKeyDown: (view, event) => {
          // Don't handle Enter if mention popup is open
          if (mentionPopup && ['Enter', 'Tab', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
            return false;
          }
          
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            onSubmit();
            return true;
          }
          return false;
        },
        handlePaste: (view, event) => {
          const items = event.clipboardData?.items;
          if (!items) return false;
          
          const files: File[] = [];
          for (const item of Array.from(items)) {
            if (item.kind === 'file') {
              const file = item.getAsFile();
              if (file) files.push(file);
            }
          }
          
          if (files.length > 0 && onPasteFiles) {
            event.preventDefault();
            onPasteFiles(files);
            return true;
          }
          return false;
        },
      },
      onUpdate: ({ editor }) => {
        const html = editor.getHTML();
        onChange(html);
        onTyping?.();
      },
    });

    // Sync external value changes (e.g., clear)
    useEffect(() => {
      if (editor && value === '' && editor.getHTML() !== '<p></p>') {
        editor.commands.clearContent();
      }
    }, [editor, value]);

    useImperativeHandle(ref, () => ({
      focus: () => editor?.commands.focus(),
      clear: () => editor?.commands.clearContent(),
      insertText: (text: string) => editor?.commands.insertContent(text),
      setContent: (content: string) => editor?.commands.setContent(content),
    }));

    const setLink = useCallback(() => {
      if (!editor) return;
      
      const { from, to } = editor.state.selection;
      const hasSelection = from !== to;
      const previousUrl = editor.getAttributes('link').href;
      
      if (hasSelection) {
        const url = window.prompt('Enter URL:', previousUrl || 'https://');
        if (url === null) return;
        if (url === '') {
          editor.chain().focus().extendMarkRange('link').unsetLink().run();
          return;
        }
        editor.chain().focus().setLink({ href: url }).run();
        setTimeout(() => {
          editor.chain().focus()
            .setTextSelection(to)
            .unsetMark('link')
            .insertContent(' ')
            .run();
        }, 0);
      } else {
        const text = window.prompt('Enter link text:');
        if (!text) return;
        const url = window.prompt('Enter URL:', 'https://');
        if (!url) return;
        
        editor.chain().focus()
          .insertContent(`<a href="${url}">${text}</a>`)
          .run();
        setTimeout(() => {
          editor.chain().focus()
            .unsetMark('link')
            .insertContent(' ')
            .run();
        }, 0);
      }
    }, [editor]);

    if (!editor) return null;

    return (
      <div className={cn('relative', className)}>
        {/* Formatting toolbar */}
        <div className="flex items-center gap-0.5 mb-1">
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleBold().run()}
            className={cn(
              'p-1 rounded transition-colors',
              editor.isActive('bold') ? 'text-primary bg-primary/20' : 'text-gray-400 hover:text-white hover:bg-white/10'
            )}
            title="Bold (Ctrl+B)"
          >
            <Bold className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleItalic().run()}
            className={cn(
              'p-1 rounded transition-colors',
              editor.isActive('italic') ? 'text-primary bg-primary/20' : 'text-gray-400 hover:text-white hover:bg-white/10'
            )}
            title="Italic (Ctrl+I)"
          >
            <Italic className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleStrike().run()}
            className={cn(
              'p-1 rounded transition-colors',
              editor.isActive('strike') ? 'text-primary bg-primary/20' : 'text-gray-400 hover:text-white hover:bg-white/10'
            )}
            title="Strikethrough"
          >
            <Strikethrough className="w-3.5 h-3.5" />
          </button>
          <div className="w-px h-3 bg-gray-600 mx-1" />
          <button
            type="button"
            onClick={setLink}
            className={cn(
              'p-1 rounded transition-colors',
              editor.isActive('link') ? 'text-primary bg-primary/20' : 'text-gray-400 hover:text-white hover:bg-white/10'
            )}
            title="Link"
          >
            <Link2 className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            className={cn(
              'p-1 rounded transition-colors',
              editor.isActive('bulletList') ? 'text-primary bg-primary/20' : 'text-gray-400 hover:text-white hover:bg-white/10'
            )}
            title="Bullet List"
          >
            <List className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleCode().run()}
            className={cn(
              'p-1 rounded transition-colors',
              editor.isActive('code') ? 'text-primary bg-primary/20' : 'text-gray-400 hover:text-white hover:bg-white/10'
            )}
            title="Code"
          >
            <Code className="w-3.5 h-3.5" />
          </button>
        </div>

        <EditorContent 
          editor={editor} 
          disabled={disabled}
          className="text-gray-100 [&_.ProseMirror]:outline-none [&_.ProseMirror_p]:my-0 [&_.ProseMirror_p.is-editor-empty:first-child::before]:content-[attr(data-placeholder)] [&_.ProseMirror_p.is-editor-empty:first-child::before]:text-gray-500 [&_.ProseMirror_p.is-editor-empty:first-child::before]:float-left [&_.ProseMirror_p.is-editor-empty:first-child::before]:h-0 [&_.ProseMirror_p.is-editor-empty:first-child::before]:pointer-events-none [&_.ProseMirror_strong]:font-bold [&_.ProseMirror_em]:italic [&_.ProseMirror_s]:line-through [&_.ProseMirror_code]:bg-gray-700 [&_.ProseMirror_code]:px-1 [&_.ProseMirror_code]:rounded [&_.ProseMirror_code]:font-mono [&_.ProseMirror_code]:text-sm [&_.ProseMirror_ul]:list-disc [&_.ProseMirror_ul]:pl-4 [&_.ProseMirror_ol]:list-decimal [&_.ProseMirror_ol]:pl-4 [&_.mention]:bg-primary/30 [&_.mention]:text-primary-light [&_.mention]:px-0.5 [&_.mention]:rounded"
        />

        {/* Mention popup */}
        {mentionPopup && (
          <MentionList
            items={mentionPopup.items}
            command={mentionPopup.command}
            selectedIndex={mentionPopup.selectedIndex}
            position={mentionPopup.position}
          />
        )}
      </div>
    );
  }
);

RichTextEditor.displayName = 'RichTextEditor';

export default RichTextEditor;
