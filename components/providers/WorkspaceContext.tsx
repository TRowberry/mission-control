'use client';

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';

export interface Workspace {
  id: string;
  name: string;
  slug: string;
  icon: string | null;
  description: string | null;
  role: string;
}

interface WorkspaceContextType {
  workspaces: Workspace[];
  activeWorkspace: Workspace | null;
  activeWorkspaceId: string | null;
  setActiveWorkspaceId: (id: string) => void;
  refreshWorkspaces: () => Promise<void>;
  loading: boolean;
}

const WorkspaceContext = createContext<WorkspaceContextType | null>(null);

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeWorkspaceId, setActiveWorkspaceIdState] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchWorkspaces = useCallback(async () => {
    try {
      const res = await fetch('/api/workspaces');
      if (!res.ok) return;
      const data: Workspace[] = await res.json();
      setWorkspaces(data);

      if (data.length === 0) return;

      // Restore saved selection or default to first workspace
      const saved = typeof window !== 'undefined' ? localStorage.getItem('mc-active-workspace') : null;
      const isValid = saved && data.some(w => w.id === saved);
      const targetId = isValid ? saved! : data[0].id;
      setActiveWorkspaceIdState(targetId);
      if (typeof window !== 'undefined') {
        localStorage.setItem('mc-active-workspace', targetId);
      }
    } catch (err) {
      console.error('Failed to fetch workspaces:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchWorkspaces();
  }, [fetchWorkspaces]);

  const setActiveWorkspaceId = (id: string) => {
    setActiveWorkspaceIdState(id);
    if (typeof window !== 'undefined') {
      localStorage.setItem('mc-active-workspace', id);
    }
  };

  const activeWorkspace = workspaces.find(w => w.id === activeWorkspaceId) ?? null;

  return (
    <WorkspaceContext.Provider value={{
      workspaces,
      activeWorkspace,
      activeWorkspaceId,
      setActiveWorkspaceId,
      refreshWorkspaces: fetchWorkspaces,
      loading,
    }}>
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace() {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error('useWorkspace must be used within WorkspaceProvider');
  return ctx;
}
