'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  DndContext,
  DragOverlay,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragStartEvent,
  DragEndEvent,
  DragOverEvent,
} from '@dnd-kit/core';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import {
  FileText,
  FolderOpen,
  Folder,
  ChevronRight,
  Plus,
  MoreHorizontal,
  Edit,
  Trash2,
  FolderPlus,
  FilePlus,
  Pencil,
  RefreshCw,
  GripVertical,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { usePages } from '@/contexts/PagesContext';

interface Page {
  id: string;
  title: string;
  icon: string | null;
  type: 'PAGE' | 'BOOKLET';
  position: number;
  parentId: string | null;
  archived: boolean;
  children?: Page[];
  _count?: { children: number };
}

interface PagesListProps {
  selectedId?: string;
  onSelect?: (page: Page) => void;
}

// Helper to sanitize icon (handle encoding issues)
const getIcon = (icon: string | null, type: 'PAGE' | 'BOOKLET'): string => {
  if (!icon || icon === '????' || icon.includes('?')) {
    return type === 'BOOKLET' ? '📁' : '📄';
  }
  return icon;
};

// Draggable page item
function DraggablePageItem({ 
  page, 
  depth, 
  isSelected, 
  isExpanded,
  isRenaming,
  renameValue,
  onRenameChange,
  onRenameSubmit,
  onRenameCancel,
  onToggleBooklet,
  onContextMenu,
  onNavigate,
}: {
  page: Page;
  depth: number;
  isSelected: boolean;
  isExpanded: boolean;
  isRenaming: boolean;
  renameValue: string;
  onRenameChange: (value: string) => void;
  onRenameSubmit: () => void;
  onRenameCancel: () => void;
  onToggleBooklet: (e: React.MouseEvent) => void;
  onContextMenu: (e: React.MouseEvent) => void;
  onNavigate: () => void;
}) {
  const isBooklet = page.type === 'BOOKLET';
  const icon = getIcon(page.icon, page.type);
  
  const { attributes, listeners, setNodeRef: setDragRef, isDragging } = useDraggable({
    id: page.id,
    data: { page },
    disabled: isBooklet, // Only pages can be dragged, not booklets
  });

  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: `drop-${page.id}`,
    data: { page },
    disabled: !isBooklet, // Only booklets can be drop targets
  });

  // Combine refs for booklets (both draggable check and droppable)
  const combinedRef = (node: HTMLDivElement | null) => {
    setDragRef(node);
    if (isBooklet) {
      setDropRef(node);
    }
  };

  return (
    <div
      ref={combinedRef}
      onClick={(e) => {
        if (isBooklet) {
          onToggleBooklet(e);
        } else {
          onNavigate();
        }
      }}
      onContextMenu={onContextMenu}
      className={cn(
        'group flex items-center gap-1 px-2 py-1.5 rounded-md text-sm transition-colors cursor-pointer',
        'hover:bg-white/5',
        isSelected && 'bg-white/10 text-white',
        !isSelected && 'text-gray-400',
        isDragging && 'opacity-50',
        isOver && isBooklet && 'bg-primary/20 ring-1 ring-primary'
      )}
      style={{ paddingLeft: `${8 + depth * 16}px` }}
    >
      {/* Drag handle for pages */}
      {!isBooklet && (
        <div
          {...attributes}
          {...listeners}
          className="opacity-0 group-hover:opacity-50 hover:opacity-100 cursor-grab active:cursor-grabbing p-0.5"
        >
          <GripVertical className="w-3 h-3" />
        </div>
      )}
      
      {isBooklet ? (
        <>
          <ChevronRight
            className={cn(
              'w-4 h-4 transition-transform flex-shrink-0',
              isExpanded && 'rotate-90'
            )}
          />
          {isExpanded ? (
            <FolderOpen className="w-4 h-4 text-yellow-500 flex-shrink-0" />
          ) : (
            <Folder className={cn(
              'w-4 h-4 flex-shrink-0',
              isOver ? 'text-primary' : 'text-yellow-500'
            )} />
          )}
        </>
      ) : (
        <span className="flex-shrink-0">{icon}</span>
      )}
      
      {isRenaming ? (
        <input
          type="text"
          value={renameValue}
          onChange={(e) => onRenameChange(e.target.value)}
          onBlur={onRenameSubmit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onRenameSubmit();
            if (e.key === 'Escape') onRenameCancel();
          }}
          className="flex-1 bg-gray-700 px-1 rounded text-sm focus:outline-none focus:ring-1 focus:ring-primary"
          autoFocus
          onClick={(e) => e.stopPropagation()}
        />
      ) : (
        <span className="truncate flex-1">{page.title}</span>
      )}
      
      {isBooklet && page._count && !isRenaming && (
        <span className="text-xs text-gray-500">{page._count.children}</span>
      )}
      
      <button
        data-menu-trigger
        onClick={(e) => {
          e.stopPropagation();
          onContextMenu(e);
        }}
        className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-white/10 rounded"
      >
        <MoreHorizontal className="w-4 h-4" />
      </button>
    </div>
  );
}

export default function PagesList({ selectedId, onSelect }: PagesListProps) {
  const router = useRouter();
  const { pages, loading, fetchPages, refreshPages, expandedBooklets, toggleBooklet } = usePages();
  const [contextMenu, setContextMenu] = useState<{ page: Page; x: number; y: number } | null>(null);
  const [showNewMenu, setShowNewMenu] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [activeId, setActiveId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8, // 8px movement required before drag starts
      },
    })
  );

  useEffect(() => {
    fetchPages();
  }, [fetchPages]);

  // Close menus on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest('[data-menu-trigger]')) {
        return;
      }
      if (contextMenu && menuRef.current && !menuRef.current.contains(target)) {
        setContextMenu(null);
      }
      if (showNewMenu) {
        setShowNewMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [contextMenu, showNewMenu]);

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragOver = (event: DragOverEvent) => {
    const overId = event.over?.id as string;
    if (overId?.startsWith('drop-')) {
      setOverId(overId.replace('drop-', ''));
    } else {
      setOverId(null);
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);
    setOverId(null);

    if (!over) return;

    const draggedPageId = active.id as string;
    const dropTargetId = (over.id as string).replace('drop-', '');
    
    // Find the booklet we're dropping onto
    const targetBooklet = pages.find(p => p.id === dropTargetId && p.type === 'BOOKLET');
    if (!targetBooklet) return;

    // Don't allow dropping onto the same parent
    const draggedPage = findPageById(pages, draggedPageId);
    if (draggedPage?.parentId === dropTargetId) return;

    // Move the page to the booklet
    try {
      const res = await fetch('/api/pages/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'move',
          pageIds: [draggedPageId],
          parentId: dropTargetId,
        }),
      });

      if (res.ok) {
        refreshPages();
        // Auto-expand the target booklet
        if (!expandedBooklets.has(dropTargetId)) {
          toggleBooklet(dropTargetId);
        }
      }
    } catch (err) {
      console.error('Failed to move page:', err);
    }
  };

  const findPageById = (pages: Page[], id: string): Page | undefined => {
    for (const page of pages) {
      if (page.id === id) return page;
      if (page.children) {
        const found = findPageById(page.children, id);
        if (found) return found;
      }
    }
    return undefined;
  };

  const handleContextMenu = (e: React.MouseEvent, page: Page) => {
    e.preventDefault();
    e.stopPropagation();
    const x = Math.min(e.clientX, window.innerWidth - 200);
    const y = Math.min(e.clientY, window.innerHeight - 150);
    setContextMenu({ page, x, y });
  };

  const createPage = async (type: 'PAGE' | 'BOOKLET', parentId?: string) => {
    try {
      const res = await fetch('/api/pages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: type === 'BOOKLET' ? 'New Booklet' : 'Untitled',
          type,
          parentId,
          icon: type === 'BOOKLET' ? '📁' : '📄',
          content: { type: 'doc', content: [{ type: 'paragraph' }] },
        }),
      });
      if (res.ok) {
        const newPage = await res.json();
        refreshPages();
        if (type === 'PAGE') {
          router.push(`/pages/${newPage.id}`);
        }
      }
    } catch (err) {
      console.error('Failed to create page:', err);
    }
    setShowNewMenu(false);
    setContextMenu(null);
  };

  const deletePage = async (pageId: string) => {
    if (!confirm('Delete this item? This cannot be undone.')) return;
    try {
      const res = await fetch(`/api/pages/${pageId}`, { method: 'DELETE' });
      if (res.ok) {
        refreshPages();
        if (selectedId === pageId) {
          router.push('/pages');
        }
      }
    } catch (err) {
      console.error('Failed to delete page:', err);
    }
    setContextMenu(null);
  };

  const renamePage = async (pageId: string, newTitle: string) => {
    if (!newTitle.trim()) return;
    try {
      const res = await fetch(`/api/pages/${pageId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newTitle.trim() }),
      });
      if (res.ok) {
        refreshPages();
      }
    } catch (err) {
      console.error('Failed to rename:', err);
    }
    setRenaming(null);
  };

  const renderPage = (page: Page, depth = 0) => {
    const isBooklet = page.type === 'BOOKLET';
    const isExpanded = expandedBooklets.has(page.id);
    const isSelected = selectedId === page.id;
    const hasChildren = page.children && page.children.length > 0;
    const isRenaming = renaming === page.id;

    return (
      <div key={page.id}>
        <DraggablePageItem
          page={page}
          depth={depth}
          isSelected={isSelected}
          isExpanded={isExpanded}
          isRenaming={isRenaming}
          renameValue={renameValue}
          onRenameChange={setRenameValue}
          onRenameSubmit={() => renamePage(page.id, renameValue)}
          onRenameCancel={() => setRenaming(null)}
          onToggleBooklet={(e) => {
            e.preventDefault();
            e.stopPropagation();
            toggleBooklet(page.id);
          }}
          onContextMenu={(e) => handleContextMenu(e, page)}
          onNavigate={() => router.push(`/pages/${page.id}`)}
        />

        {/* Children (for booklets) */}
        {isBooklet && isExpanded && (
          <div className="ml-2">
            {hasChildren ? (
              page.children!
                .sort((a, b) => a.position - b.position)
                .map((child) => renderPage(child, depth + 1))
            ) : (
              <div 
                className="text-xs text-gray-500 py-2 italic"
                style={{ paddingLeft: `${24 + depth * 16}px` }}
              >
                Drop pages here
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  // Find active page for drag overlay
  const activePage = activeId ? findPageById(pages, activeId) : null;

  if (loading) {
    return (
      <div className="p-4 text-center text-gray-500">
        Loading pages...
      </div>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <div className="h-full flex flex-col">
        {/* Header */}
        <div className="px-3 py-2 flex items-center justify-between border-b border-gray-700">
          <h3 className="font-semibold text-sm">Pages</h3>
          <div className="flex items-center gap-1">
            <button
              onClick={() => refreshPages()}
              className="p-1 hover:bg-white/10 rounded text-gray-400 hover:text-gray-200"
              title="Refresh"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
            <div className="relative">
              <button
                data-menu-trigger
                onClick={(e) => {
                  e.stopPropagation();
                  setShowNewMenu(!showNewMenu);
                }}
                className="p-1 hover:bg-white/10 rounded"
                title="New page or booklet"
              >
                <Plus className="w-4 h-4" />
              </button>
              {showNewMenu && (
                <div className="absolute right-0 top-full mt-1 w-40 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-50">
                  <button
                    onClick={() => createPage('PAGE')}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-300 hover:bg-white/10 rounded-t-lg"
                  >
                    <FileText className="w-4 h-4" />
                    New Page
                  </button>
                  <button
                    onClick={() => createPage('BOOKLET')}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-300 hover:bg-white/10 rounded-b-lg"
                  >
                    <FolderPlus className="w-4 h-4" />
                    New Booklet
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Pages list */}
        <div className="flex-1 overflow-y-auto p-2">
          {pages.length === 0 ? (
            <div className="text-center text-gray-500 text-sm py-8">
              <p>No pages yet.</p>
              <button
                onClick={() => createPage('PAGE')}
                className="mt-2 text-primary hover:underline"
              >
                Create your first page
              </button>
            </div>
          ) : (
            pages.map((page) => renderPage(page))
          )}
        </div>

        {/* Context menu */}
        {contextMenu && (
          <div
            ref={menuRef}
            className="fixed bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-[100] min-w-[160px] py-1"
            style={{ left: contextMenu.x, top: contextMenu.y }}
            onClick={(e) => e.stopPropagation()}
          >
            {contextMenu.page.type === 'BOOKLET' && (
              <button
                onClick={() => createPage('PAGE', contextMenu.page.id)}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-300 hover:bg-white/10"
              >
                <FilePlus className="w-4 h-4" />
                Add Page Inside
              </button>
            )}
            {contextMenu.page.type === 'PAGE' && (
              <Link
                href={`/pages/${contextMenu.page.id}`}
                className="flex items-center gap-2 px-3 py-2 text-sm text-gray-300 hover:bg-white/10"
                onClick={() => setContextMenu(null)}
              >
                <Edit className="w-4 h-4" />
                Edit
              </Link>
            )}
            <button
              onClick={() => {
                setRenameValue(contextMenu.page.title);
                setRenaming(contextMenu.page.id);
                setContextMenu(null);
              }}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-300 hover:bg-white/10"
            >
              <Pencil className="w-4 h-4" />
              Rename
            </button>
            <button
              onClick={() => deletePage(contextMenu.page.id)}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-400 hover:bg-white/10"
            >
              <Trash2 className="w-4 h-4" />
              Delete
            </button>
          </div>
        )}

        {/* Drag overlay */}
        <DragOverlay>
          {activePage && (
            <div className="flex items-center gap-2 px-3 py-2 bg-gray-800 border border-gray-600 rounded-md shadow-xl text-sm">
              <span>{getIcon(activePage.icon, activePage.type)}</span>
              <span>{activePage.title}</span>
            </div>
          )}
        </DragOverlay>
      </div>
    </DndContext>
  );
}
