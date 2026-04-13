'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, LayoutGrid, Archive } from 'lucide-react';
import { useWorkspace } from '@/components/providers/WorkspaceContext';

interface Project {
  id: string;
  name: string;
  description: string | null;
  color: string;
  archived: boolean;
  createdAt: string;
  _count: {
    tasks: number;
    columns: number;
  };
}

export default function ProjectsPage() {
  const router = useRouter();
  const { activeWorkspaceId } = useWorkspace();

  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    fetchProjects();
  }, [activeWorkspaceId]);

  const fetchProjects = async () => {
    setLoading(true);
    try {
      const qs = activeWorkspaceId ? `?workspaceId=${activeWorkspaceId}` : '';
      const res = await fetch(`/api/kanban/projects${qs}`);
      if (res.ok) setProjects(await res.json());
    } finally {
      setLoading(false);
    }
  };

  const createProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const res = await fetch('/api/kanban/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim(), workspaceId: activeWorkspaceId }),
      });
      if (res.ok) {
        const project = await res.json();
        setNewName('');
        setShowNew(false);
        router.push(`/project/${project.id}`);
      }
    } finally {
      setCreating(false);
    }
  };

  const active = projects.filter(p => !p.archived);
  const archived = projects.filter(p => p.archived);

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="h-12 border-b border-black/20 px-6 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <LayoutGrid className="w-4 h-4 text-gray-400" />
          <span className="font-semibold">Projects</span>
        </div>
        <button
          onClick={() => setShowNew(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-primary text-white rounded-lg hover:bg-primary/90"
        >
          <Plus className="w-4 h-4" />
          New Project
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <>
            {/* New project inline form */}
            {showNew && (
              <form
                onSubmit={createProject}
                className="mb-6 flex gap-2 items-center p-4 rounded-xl border border-primary/40 bg-primary/5"
              >
                <input
                  type="text"
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  placeholder="Project name…"
                  autoFocus
                  className="flex-1 px-3 py-1.5 bg-[#1E1F22] text-white rounded-lg border border-gray-600 focus:outline-none focus:border-primary text-sm"
                />
                <button
                  type="submit"
                  disabled={creating || !newName.trim()}
                  className="px-4 py-1.5 text-sm bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50"
                >
                  {creating ? 'Creating…' : 'Create'}
                </button>
                <button
                  type="button"
                  onClick={() => { setShowNew(false); setNewName(''); }}
                  className="px-3 py-1.5 text-sm text-gray-400 hover:text-white rounded-lg hover:bg-white/5"
                >
                  Cancel
                </button>
              </form>
            )}

            {active.length === 0 && !showNew ? (
              <div className="flex flex-col items-center justify-center h-48 text-gray-500">
                <LayoutGrid className="w-12 h-12 mb-3 text-gray-600" />
                <p className="text-sm">No projects yet</p>
                <button
                  onClick={() => setShowNew(true)}
                  className="mt-3 text-sm text-primary hover:underline"
                >
                  Create your first project
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {active.map(project => (
                  <button
                    key={project.id}
                    onClick={() => router.push(`/project/${project.id}`)}
                    className="text-left p-4 rounded-xl bg-[#2B2D31] hover:bg-[#313338] border border-transparent hover:border-gray-600 transition-all group"
                  >
                    <div className="flex items-start gap-3 mb-3">
                      <div
                        className="w-3 h-3 rounded-sm flex-shrink-0 mt-1"
                        style={{ backgroundColor: project.color || '#5865f2' }}
                      />
                      <h3 className="font-semibold text-white group-hover:text-primary transition-colors truncate flex-1">
                        {project.name}
                      </h3>
                    </div>
                    {project.description && (
                      <p className="text-sm text-gray-400 mb-3 line-clamp-2">{project.description}</p>
                    )}
                    <div className="flex items-center gap-3 text-xs text-gray-500">
                      <span>{project._count?.tasks ?? 0} tasks</span>
                      <span>{project._count?.columns ?? 0} columns</span>
                    </div>
                  </button>
                ))}
              </div>
            )}

            {/* Archived */}
            {archived.length > 0 && (
              <div className="mt-10">
                <div className="flex items-center gap-2 mb-3 text-xs text-gray-500 uppercase tracking-wide">
                  <Archive className="w-3.5 h-3.5" />
                  Archived ({archived.length})
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {archived.map(project => (
                    <button
                      key={project.id}
                      onClick={() => router.push(`/project/${project.id}`)}
                      className="text-left p-4 rounded-xl bg-[#2B2D31]/50 border border-gray-700/50 opacity-60 hover:opacity-80 transition-opacity"
                    >
                      <div className="flex items-start gap-3">
                        <div
                          className="w-3 h-3 rounded-sm flex-shrink-0 mt-0.5"
                          style={{ backgroundColor: project.color || '#5865f2' }}
                        />
                        <span className="text-sm text-gray-400 truncate">{project.name}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
