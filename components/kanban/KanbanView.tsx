'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { Plus, ChevronDown, Settings, Archive, Search, Trash2, MoreVertical, ArchiveRestore } from 'lucide-react';
import KanbanBoard from './KanbanBoard';
import ProjectSettingsModal from './ProjectSettingsModal';
import { cn } from '@/lib/utils';

interface Project {
  id: string;
  name: string;
  description: string | null;
  color: string;
  columns: any[];
  workspace: { id: string; name: string };
  archived?: boolean;
}

interface KanbanViewProps {
  initialProjects: Project[];
  userId: string;
}

export default function KanbanView({ initialProjects, userId }: KanbanViewProps) {
  const [projects, setProjects] = useState<Project[]>(initialProjects);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(
    initialProjects[0]?.id || null
  );
  const [showProjectMenu, setShowProjectMenu] = useState(false);
  const [isCreatingProject, setIsCreatingProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [contextMenuProject, setContextMenuProject] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const selectedProject = projects.find(p => p.id === selectedProjectId);

  // Close menus when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowProjectMenu(false);
        setContextMenuProject(null);
      }
    }

    if (showProjectMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showProjectMenu]);

  const fetchProjects = useCallback(async (includeArchived = false) => {
    try {
      const url = includeArchived 
        ? '/api/kanban/projects?includeArchived=true'
        : '/api/kanban/projects';
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setProjects(data);
      }
    } catch (err) {
      console.error('Failed to fetch projects:', err);
    }
  }, []);

  async function handleArchiveProject(projectId: string, archive: boolean) {
    try {
      const res = await fetch('/api/kanban/projects', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: projectId, archived: archive }),
      });

      if (res.ok) {
        // If we archived the selected project, deselect it
        if (archive && projectId === selectedProjectId) {
          const remaining = projects.filter(p => p.id !== projectId && !p.archived);
          setSelectedProjectId(remaining[0]?.id || null);
        }
        fetchProjects(showArchived);
        setContextMenuProject(null);
      }
    } catch (err) {
      console.error('Failed to archive project:', err);
    }
  }

  async function handleDeleteProject(projectId: string) {
    if (!confirm('Are you sure you want to permanently delete this project? This will also delete all tasks and cannot be undone.')) {
      return;
    }

    try {
      const res = await fetch(`/api/kanban/projects?id=${projectId}`, {
        method: 'DELETE',
      });

      if (res.ok) {
        if (projectId === selectedProjectId) {
          const remaining = projects.filter(p => p.id !== projectId);
          setSelectedProjectId(remaining[0]?.id || null);
        }
        fetchProjects(showArchived);
        setContextMenuProject(null);
      }
    } catch (err) {
      console.error('Failed to delete project:', err);
    }
  }

  async function handleCreateProject() {
    if (!newProjectName.trim()) {
      setIsCreatingProject(false);
      return;
    }

    try {
      // Get default workspace
      const workspaceId = projects[0]?.workspace?.id;
      if (!workspaceId) {
        console.error('No workspace found');
        return;
      }

      const res = await fetch('/api/kanban/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newProjectName.trim(),
          workspaceId,
        }),
      });

      if (res.ok) {
        const project = await res.json();
        setProjects(prev => [...prev, project]);
        setSelectedProjectId(project.id);
        setNewProjectName('');
        setIsCreatingProject(false);
        fetchProjects();
      }
    } catch (err) {
      console.error('Failed to create project:', err);
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
        <div className="flex items-center gap-4">
          {/* Project selector */}
          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => setShowProjectMenu(!showProjectMenu)}
              className="flex items-center gap-2 px-3 py-2 bg-[#1E1F22] rounded-lg hover:bg-[#2B2D31]"
            >
              {selectedProject && (
                <div 
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: selectedProject.color }}
                />
              )}
              <span className="font-medium">{selectedProject?.name || 'Select Project'}</span>
              <ChevronDown className="w-4 h-4 text-gray-400" />
            </button>

            {showProjectMenu && (
              <div className="absolute top-full left-0 mt-1 w-72 bg-[#1E1F22] rounded-lg shadow-xl border border-gray-700 z-50">
                <div className="p-2 max-h-64 overflow-y-auto">
                  {projects.filter(p => showArchived || !p.archived).map(project => (
                    <div
                      key={project.id}
                      className={cn(
                        'relative flex items-center gap-2 px-3 py-2 rounded hover:bg-white/10 group',
                        project.id === selectedProjectId && 'bg-primary/20',
                        project.archived && 'opacity-60'
                      )}
                    >
                      <button
                        onClick={() => {
                          setSelectedProjectId(project.id);
                          setShowProjectMenu(false);
                        }}
                        className="flex items-center gap-2 flex-1 text-left"
                      >
                        <div 
                          className="w-3 h-3 rounded-full flex-shrink-0"
                          style={{ backgroundColor: project.color }}
                        />
                        <span className="truncate">{project.name}</span>
                        {project.archived && (
                          <Archive className="w-3 h-3 text-gray-500 flex-shrink-0" />
                        )}
                      </button>
                      
                      {/* Context menu button */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setContextMenuProject(contextMenuProject === project.id ? null : project.id);
                        }}
                        className="p-1 rounded hover:bg-white/20 opacity-0 group-hover:opacity-100"
                      >
                        <MoreVertical className="w-4 h-4 text-gray-400" />
                      </button>

                      {/* Context menu */}
                      {contextMenuProject === project.id && (
                        <div className="absolute right-0 top-full mt-1 w-40 bg-[#2B2D31] rounded-lg shadow-xl border border-gray-600 z-50">
                          {project.archived ? (
                            <button
                              onClick={() => handleArchiveProject(project.id, false)}
                              className="w-full flex items-center gap-2 px-3 py-2 rounded-t hover:bg-white/10 text-left"
                            >
                              <ArchiveRestore className="w-4 h-4 text-green-400" />
                              <span>Unarchive</span>
                            </button>
                          ) : (
                            <button
                              onClick={() => handleArchiveProject(project.id, true)}
                              className="w-full flex items-center gap-2 px-3 py-2 rounded-t hover:bg-white/10 text-left"
                            >
                              <Archive className="w-4 h-4 text-yellow-400" />
                              <span>Archive</span>
                            </button>
                          )}
                          <button
                            onClick={() => handleDeleteProject(project.id)}
                            className="w-full flex items-center gap-2 px-3 py-2 rounded-b hover:bg-white/10 text-left text-red-400"
                          >
                            <Trash2 className="w-4 h-4" />
                            <span>Delete</span>
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                
                <div className="border-t border-gray-700 p-2 space-y-1">
                  {/* Show archived toggle */}
                  <button
                    onClick={() => {
                      setShowArchived(!showArchived);
                      fetchProjects(!showArchived);
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 rounded hover:bg-white/10 text-gray-400"
                  >
                    <Archive className="w-4 h-4" />
                    <span>{showArchived ? 'Hide Archived' : 'Show Archived'}</span>
                  </button>

                  {isCreatingProject ? (
                    <div className="px-3 py-2">
                      <input
                        autoFocus
                        value={newProjectName}
                        onChange={(e) => setNewProjectName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleCreateProject();
                          if (e.key === 'Escape') {
                            setIsCreatingProject(false);
                            setNewProjectName('');
                          }
                        }}
                        onBlur={handleCreateProject}
                        placeholder="Project name..."
                        className="w-full bg-[#2B2D31] rounded px-2 py-1 text-sm"
                      />
                    </div>
                  ) : (
                    <button
                      onClick={() => setIsCreatingProject(true)}
                      className="w-full flex items-center gap-2 px-3 py-2 rounded hover:bg-white/10 text-gray-400"
                    >
                      <Plus className="w-4 h-4" />
                      <span>New Project</span>
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search tasks..."
              className="pl-9 pr-4 py-2 bg-[#1E1F22] rounded-lg text-sm w-64 focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          {projects.length === 0 && (
            <button
              onClick={async () => {
                if (!confirm('Import projects from old kanban?')) return;
                try {
                  const res = await fetch('/api/kanban/import', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(await fetch('/api/kanban/import-data').then(r => r.json())),
                  });
                  if (res.ok) {
                    const result = await res.json();
                    alert(`Imported ${result.projectsCreated} projects, ${result.tasksCreated} tasks!`);
                    fetchProjects();
                  }
                } catch (err) {
                  console.error('Import failed:', err);
                }
              }}
              className="px-3 py-1.5 bg-green-600 hover:bg-green-500 rounded text-sm"
            >
              Import Old Kanban
            </button>
          )}
          <button 
            onClick={() => selectedProject && setShowSettings(true)}
            className="p-2 hover:bg-white/10 rounded disabled:opacity-50"
            title="Project Settings"
            disabled={!selectedProject}
          >
            <Settings className="w-5 h-5 text-gray-400" />
          </button>
        </div>
      </div>

      {/* Board */}
      <div className="flex-1 overflow-hidden p-4">
        {selectedProjectId ? (
          <KanbanBoard 
            projectId={selectedProjectId}
          />
        ) : (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <h2 className="text-xl font-semibold mb-2">No projects yet</h2>
              <p className="text-gray-400 mb-4">Create your first project to get started</p>
              <button
                onClick={() => {
                  setShowProjectMenu(true);
                  setIsCreatingProject(true);
                }}
                className="px-4 py-2 bg-primary rounded-lg hover:bg-primary-hover"
              >
                Create Project
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Project Settings Modal */}
      {showSettings && selectedProject && (
        <ProjectSettingsModal
          projectId={selectedProject.id}
          projectName={selectedProject.name}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  );
}
