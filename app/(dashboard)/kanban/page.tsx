'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { Plus, ChevronDown, Folder, FolderOpen } from 'lucide-react';
import KanbanBoard from '@/components/kanban/KanbanBoard';

interface Project {
  id: string;
  name: string;
  description: string | null;
  createdAt: string;
  _count: {
    columns: number;
  };
}

export default function KanbanPage() {
  const searchParams = useSearchParams();
  const projectParam = searchParams.get('project');
  const taskParam = searchParams.get('task');
  
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showProjectMenu, setShowProjectMenu] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [creating, setCreating] = useState(false);
  const [highlightedTaskId, setHighlightedTaskId] = useState<string | null>(null);

  useEffect(() => {
    fetchProjects();
  }, []);

  // Handle URL params after projects are loaded
  useEffect(() => {
    if (projects.length > 0 && projectParam) {
      // Check if projectParam matches an actual project ID
      const matchingProject = projects.find(p => p.id === projectParam);
      if (matchingProject) {
        setSelectedProjectId(matchingProject.id);
        if (taskParam) {
          setHighlightedTaskId(taskParam);
        }
      }
    }
  }, [projects, projectParam, taskParam]);

  const fetchProjects = async () => {
    try {
      const res = await fetch('/api/kanban/projects');
      const data = await res.json();
      setProjects(data);
      
      // Auto-select first project if none selected
      if (data.length > 0 && !selectedProjectId) {
        setSelectedProjectId(data[0].id);
      }
    } catch (error) {
      console.error('Failed to fetch projects:', error);
    } finally {
      setLoading(false);
    }
  };

  const createProject = async () => {
    if (!newProjectName.trim()) return;

    setCreating(true);
    try {
      const res = await fetch('/api/kanban/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newProjectName.trim() }),
      });
      const project = await res.json();
      setProjects([...projects, project]);
      setSelectedProjectId(project.id);
      setNewProjectName('');
      setShowProjectMenu(false);
    } catch (error) {
      console.error('Failed to create project:', error);
    } finally {
      setCreating(false);
    }
  };

  const selectedProject = projects.find((p) => p.id === selectedProjectId);

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
        <div className="flex items-center gap-4">
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Kanban</h1>

          {/* Project Selector */}
          <div className="relative">
            <button
              onClick={() => setShowProjectMenu(!showProjectMenu)}
              className="flex items-center gap-2 px-3 py-1.5 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
            >
              {selectedProject ? (
                <>
                  <FolderOpen className="w-4 h-4 text-blue-500" />
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-200">
                    {selectedProject.name}
                  </span>
                </>
              ) : (
                <>
                  <Folder className="w-4 h-4 text-gray-400" />
                  <span className="text-sm text-gray-500">Select Project</span>
                </>
              )}
              <ChevronDown className="w-4 h-4 text-gray-400" />
            </button>

            {/* Dropdown */}
            {showProjectMenu && (
              <div className="absolute top-full left-0 mt-1 w-64 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 z-50">
                <div className="p-2">
                  {projects.map((project) => (
                    <button
                      key={project.id}
                      onClick={() => {
                        setSelectedProjectId(project.id);
                        setShowProjectMenu(false);
                      }}
                      className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left transition-colors ${
                        project.id === selectedProjectId
                          ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600'
                          : 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200'
                      }`}
                    >
                      <Folder className="w-4 h-4" />
                      <span className="text-sm font-medium truncate">{project.name}</span>
                    </button>
                  ))}
                </div>

                <div className="border-t border-gray-200 dark:border-gray-700 p-2">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newProjectName}
                      onChange={(e) => setNewProjectName(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && createProject()}
                      placeholder="New project name..."
                      className="flex-1 px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-1 focus:ring-blue-500"
                    />
                    <button
                      onClick={createProject}
                      disabled={creating || !newProjectName.trim()}
                      className="px-2 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 transition-colors"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Board */}
      <div className="flex-1 overflow-hidden">
        {selectedProjectId ? (
          <KanbanBoard projectId={selectedProjectId} highlightedTaskId={highlightedTaskId} />
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-gray-500">
            <Folder className="w-16 h-16 mb-4 text-gray-300" />
            <p className="text-lg mb-2">No project selected</p>
            <p className="text-sm">Select a project or create a new one to get started</p>
          </div>
        )}
      </div>

      {/* Click outside to close menu */}
      {showProjectMenu && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setShowProjectMenu(false)}
        />
      )}
    </div>
  );
}
