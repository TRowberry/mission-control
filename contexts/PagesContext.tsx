'use client';

import { createContext, useContext, useState, useCallback, ReactNode } from 'react';

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

interface PagesContextType {
  pages: Page[];
  loading: boolean;
  fetchPages: () => Promise<void>;
  refreshPages: () => void;
  expandedBooklets: Set<string>;
  toggleBooklet: (bookletId: string) => void;
}

const PagesContext = createContext<PagesContextType | null>(null);

export function PagesProvider({ children }: { children: ReactNode }) {
  const [pages, setPages] = useState<Page[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedBooklets, setExpandedBooklets] = useState<Set<string>>(new Set());

  const fetchPages = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/pages?includeChildren=true');
      if (res.ok) {
        const data = await res.json();
        // Filter to root pages only (children are nested in booklets)
        const rootPages = (data || [])
          .filter((p: Page) => !p.parentId && !p.archived)
          .sort((a: Page, b: Page) => a.position - b.position);
        setPages(rootPages);
      }
    } catch (err) {
      console.error('Failed to fetch pages:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshPages = useCallback(() => {
    fetchPages();
  }, [fetchPages]);

  const toggleBooklet = useCallback((bookletId: string) => {
    setExpandedBooklets(prev => {
      const next = new Set(prev);
      if (next.has(bookletId)) {
        next.delete(bookletId);
      } else {
        next.add(bookletId);
      }
      return next;
    });
  }, []);

  return (
    <PagesContext.Provider value={{
      pages,
      loading,
      fetchPages,
      refreshPages,
      expandedBooklets,
      toggleBooklet,
    }}>
      {children}
    </PagesContext.Provider>
  );
}

export function usePages() {
  const context = useContext(PagesContext);
  if (!context) {
    throw new Error('usePages must be used within a PagesProvider');
  }
  return context;
}
