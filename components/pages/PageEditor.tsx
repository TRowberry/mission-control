'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import LinkExtension from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import { Image } from '@tiptap/extension-image';
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { TableCell } from '@tiptap/extension-table-cell';
import { TableHeader } from '@tiptap/extension-table-header';
import {
  Save,
  ArrowLeft,
  Bold,
  Italic,
  Strikethrough,
  Code,
  List,
  ListOrdered,
  Quote,
  Heading1,
  Heading2,
  Heading3,
  Link2,
  Image as ImageIcon,
  Table as TableIcon,
  Undo,
  Redo,
  Trash2,
  FolderInput,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { usePages } from '@/contexts/PagesContext';

interface Page {
  id: string;
  title: string;
  icon: string | null;
  content: any;
  type: 'PAGE' | 'BOOKLET';
  parentId: string | null;
}

interface Booklet {
  id: string;
  title: string;
  icon: string | null;
}

// Helper to sanitize icon (handle encoding issues)
const getBookletIcon = (icon: string | null): string => {
  if (!icon || icon === '????' || icon.includes('?')) {
    return '📁';
  }
  return icon;
};

interface PageEditorProps {
  page: Page;
}

export default function PageEditor({ page }: PageEditorProps) {
  const router = useRouter();
  const { refreshPages } = usePages();
  const [title, setTitle] = useState(page.title);
  const [icon, setIcon] = useState(page.icon || '📄');
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [booklets, setBooklets] = useState<Booklet[]>([]);
  const [showMoveMenu, setShowMoveMenu] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      LinkExtension.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: 'text-blue-400 underline hover:text-blue-300 cursor-pointer',
        },
      }),
      Placeholder.configure({
        placeholder: 'Start writing...',
      }),
      Image.configure({
        HTMLAttributes: {
          class: 'max-w-full rounded-lg my-4',
        },
      }),
      Table.configure({
        resizable: true,
      }),
      TableRow,
      TableCell,
      TableHeader,
    ],
    content: page.content,
    editorProps: {
      attributes: {
        class: 'prose prose-invert max-w-none focus:outline-none min-h-[400px] px-4 py-2',
      },
    },
    onUpdate: () => {
      setHasChanges(true);
    },
  });

  useEffect(() => {
    fetchBooklets();
  }, []);

  // Autosave
  useEffect(() => {
    if (!hasChanges) return;
    const timeout = setTimeout(() => {
      savePage();
    }, 2000);
    return () => clearTimeout(timeout);
  }, [hasChanges, title, editor?.getJSON()]);

  const fetchBooklets = async () => {
    try {
      const res = await fetch('/api/pages?type=BOOKLET');
      if (res.ok) {
        const data = await res.json();
        setBooklets(data.filter((b: Booklet) => b.id !== page.id));
      }
    } catch (err) {
      console.error('Failed to fetch booklets:', err);
    }
  };

  const savePage = async () => {
    if (!editor) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/pages/${page.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          icon,
          content: editor.getJSON(),
        }),
      });
      if (res.ok) {
        setLastSaved(new Date());
        setHasChanges(false);
      }
    } catch (err) {
      console.error('Failed to save page:', err);
    } finally {
      setSaving(false);
    }
  };

  const deletePage = async () => {
    if (!confirm('Delete this page? This cannot be undone.')) return;
    try {
      const res = await fetch(`/api/pages/${page.id}`, { method: 'DELETE' });
      if (res.ok) {
        router.push('/pages');
      }
    } catch (err) {
      console.error('Failed to delete page:', err);
    }
  };

  const moveToBooklet = async (bookletId: string | null) => {
    try {
      console.log('[PageEditor] Moving page', page.id, 'to booklet', bookletId);
      const res = await fetch('/api/pages/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'move',
          pageIds: [page.id],
          parentId: bookletId,
        }),
      });
      
      if (!res.ok) {
        const error = await res.json().catch(() => ({ error: 'Unknown error' }));
        console.error('[PageEditor] Move failed:', error);
        alert(`Failed to move page: ${error.error || 'Unknown error'}`);
        return;
      }
      
      const result = await res.json();
      console.log('[PageEditor] Move succeeded:', result);
      setShowMoveMenu(false);
      // Update local state to reflect the move
      page.parentId = bookletId;
      // Refresh the sidebar pages list via context
      refreshPages();
      router.refresh();
    } catch (err) {
      console.error('[PageEditor] Failed to move page:', err);
      alert('Failed to move page. Please try again.');
    }
  };

  const addLink = useCallback(() => {
    if (!editor) return;
    const url = prompt('Enter URL:');
    if (url) {
      editor.chain().focus().setLink({ href: url }).run();
    }
  }, [editor]);

  const addImage = useCallback(() => {
    if (!editor) return;
    const url = prompt('Enter image URL:');
    if (url) {
      editor.chain().focus().setImage({ src: url }).run();
    }
  }, [editor]);

  const addTable = useCallback(() => {
    if (!editor) return;
    editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
  }, [editor]);

  if (!editor) return null;

  return (
    <div className="h-full flex flex-col bg-chat-bg">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-700">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push('/pages')}
            className="p-1.5 hover:bg-white/10 rounded"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <button
            onClick={() => {
              const newIcon = prompt('Enter emoji icon:', icon);
              if (newIcon) {
                setIcon(newIcon);
                setHasChanges(true);
              }
            }}
            className="text-xl hover:bg-white/10 rounded p-1"
          >
            {icon}
          </button>
          <input
            type="text"
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              setHasChanges(true);
            }}
            className="text-xl font-semibold bg-transparent border-none focus:outline-none focus:ring-0"
            placeholder="Untitled"
          />
        </div>
        <div className="flex items-center gap-2">
          {lastSaved && (
            <span className="text-xs text-gray-500">
              {saving ? 'Saving...' : `Saved ${lastSaved.toLocaleTimeString()}`}
            </span>
          )}
          <div className="relative">
            <button
              onClick={() => setShowMoveMenu(!showMoveMenu)}
              className="p-1.5 hover:bg-white/10 rounded text-gray-400"
              title="Move to booklet"
            >
              <FolderInput className="w-5 h-5" />
            </button>
            {showMoveMenu && (
              <div className="absolute right-0 top-full mt-1 w-48 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-50">
                <div className="px-3 py-2 text-xs text-gray-500 border-b border-gray-700">
                  Move to booklet
                </div>
                <button
                  onClick={() => moveToBooklet(null)}
                  className={cn(
                    'w-full text-left px-3 py-2 text-sm hover:bg-white/10',
                    !page.parentId && 'text-primary'
                  )}
                >
                  📄 No booklet (root)
                </button>
                {booklets.map((booklet) => (
                  <button
                    key={booklet.id}
                    onClick={() => moveToBooklet(booklet.id)}
                    className={cn(
                      'w-full text-left px-3 py-2 text-sm hover:bg-white/10',
                      page.parentId === booklet.id && 'text-primary'
                    )}
                  >
                    {getBookletIcon(booklet.icon)} {booklet.title}
                  </button>
                ))}
                {booklets.length === 0 && (
                  <div className="px-3 py-2 text-sm text-gray-500">
                    No booklets yet
                  </div>
                )}
              </div>
            )}
          </div>
          <button
            onClick={savePage}
            disabled={saving || !hasChanges}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded text-sm',
              hasChanges
                ? 'bg-primary text-white hover:bg-primary/90'
                : 'bg-gray-700 text-gray-400'
            )}
          >
            <Save className="w-4 h-4" />
            {saving ? 'Saving...' : 'Save'}
          </button>
          <button
            onClick={deletePage}
            className="p-1.5 hover:bg-red-500/20 rounded text-red-400"
            title="Delete page"
          >
            <Trash2 className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-1 px-4 py-2 border-b border-gray-700 flex-wrap">
        <button
          onClick={() => editor.chain().focus().undo().run()}
          disabled={!editor.can().undo()}
          className="p-1.5 hover:bg-white/10 rounded disabled:opacity-30"
          title="Undo"
        >
          <Undo className="w-4 h-4" />
        </button>
        <button
          onClick={() => editor.chain().focus().redo().run()}
          disabled={!editor.can().redo()}
          className="p-1.5 hover:bg-white/10 rounded disabled:opacity-30"
          title="Redo"
        >
          <Redo className="w-4 h-4" />
        </button>
        <div className="w-px h-5 bg-gray-700 mx-1" />
        <button
          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
          className={cn('p-1.5 hover:bg-white/10 rounded', editor.isActive('heading', { level: 1 }) && 'bg-white/10')}
          title="Heading 1"
        >
          <Heading1 className="w-4 h-4" />
        </button>
        <button
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          className={cn('p-1.5 hover:bg-white/10 rounded', editor.isActive('heading', { level: 2 }) && 'bg-white/10')}
          title="Heading 2"
        >
          <Heading2 className="w-4 h-4" />
        </button>
        <button
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          className={cn('p-1.5 hover:bg-white/10 rounded', editor.isActive('heading', { level: 3 }) && 'bg-white/10')}
          title="Heading 3"
        >
          <Heading3 className="w-4 h-4" />
        </button>
        <div className="w-px h-5 bg-gray-700 mx-1" />
        <button
          onClick={() => editor.chain().focus().toggleBold().run()}
          className={cn('p-1.5 hover:bg-white/10 rounded', editor.isActive('bold') && 'bg-white/10')}
          title="Bold"
        >
          <Bold className="w-4 h-4" />
        </button>
        <button
          onClick={() => editor.chain().focus().toggleItalic().run()}
          className={cn('p-1.5 hover:bg-white/10 rounded', editor.isActive('italic') && 'bg-white/10')}
          title="Italic"
        >
          <Italic className="w-4 h-4" />
        </button>
        <button
          onClick={() => editor.chain().focus().toggleStrike().run()}
          className={cn('p-1.5 hover:bg-white/10 rounded', editor.isActive('strike') && 'bg-white/10')}
          title="Strikethrough"
        >
          <Strikethrough className="w-4 h-4" />
        </button>
        <button
          onClick={() => editor.chain().focus().toggleCode().run()}
          className={cn('p-1.5 hover:bg-white/10 rounded', editor.isActive('code') && 'bg-white/10')}
          title="Inline code"
        >
          <Code className="w-4 h-4" />
        </button>
        <div className="w-px h-5 bg-gray-700 mx-1" />
        <button
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          className={cn('p-1.5 hover:bg-white/10 rounded', editor.isActive('bulletList') && 'bg-white/10')}
          title="Bullet list"
        >
          <List className="w-4 h-4" />
        </button>
        <button
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          className={cn('p-1.5 hover:bg-white/10 rounded', editor.isActive('orderedList') && 'bg-white/10')}
          title="Numbered list"
        >
          <ListOrdered className="w-4 h-4" />
        </button>
        <button
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
          className={cn('p-1.5 hover:bg-white/10 rounded', editor.isActive('blockquote') && 'bg-white/10')}
          title="Quote"
        >
          <Quote className="w-4 h-4" />
        </button>
        <div className="w-px h-5 bg-gray-700 mx-1" />
        <button
          onClick={addLink}
          className={cn('p-1.5 hover:bg-white/10 rounded', editor.isActive('link') && 'bg-white/10')}
          title="Add link"
        >
          <Link2 className="w-4 h-4" />
        </button>
        <button
          onClick={addImage}
          className="p-1.5 hover:bg-white/10 rounded"
          title="Add image"
        >
          <ImageIcon className="w-4 h-4" />
        </button>
        <button
          onClick={addTable}
          className="p-1.5 hover:bg-white/10 rounded"
          title="Insert table"
        >
          <TableIcon className="w-4 h-4" />
        </button>
      </div>

      {/* Editor */}
      <div className="flex-1 overflow-y-auto">
        <EditorContent editor={editor} className="h-full" />
      </div>
    </div>
  );
}
