'use client';

import { useState, useEffect } from 'react';
import { X, Bot, Settings, Folder, Plus, Trash2, Shield, User, Eye, CheckCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Agent {
  id: string;
  username: string;
  displayName: string;
  avatar: string | null;
  status: string;
}

interface ProjectAccess {
  id: string;
  name: string;
  description: string | null;
  color: string;
  icon: string | null;
  role: string;
  grantedBy: {
    id: string;
    displayName: string;
  };
  grantedAt: string;
}

interface Project {
  id: string;
  name: string;
  color: string;
  description: string | null;
}

interface AgentSettingsModalProps {
  agent: Agent;
  onClose: () => void;
}

type Tab = 'about' | 'projects';

const roleIcons: Record<string, typeof Shield> = {
  admin: Shield,
  member: User,
  readonly: Eye,
};

const roleLabels: Record<string, string> = {
  admin: 'Admin - Full access',
  member: 'Member - Create & edit tasks',
  readonly: 'Read Only - View only',
};

export default function AgentSettingsModal({
  agent,
  onClose,
}: AgentSettingsModalProps) {
  const [activeTab, setActiveTab] = useState<Tab>('projects');
  const [projectAccess, setProjectAccess] = useState<ProjectAccess[]>([]);
  const [allProjects, setAllProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddPanel, setShowAddPanel] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [selectedRole, setSelectedRole] = useState('member');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Fetch project access and all projects
  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      try {
        const [accessRes, projectsRes] = await Promise.all([
          fetch(`/api/agents/${agent.id}/projects`),
          fetch('/api/kanban/projects'),
        ]);

        if (accessRes.ok) {
          const data = await accessRes.json();
          setProjectAccess(data.projects || []);
        }

        if (projectsRes.ok) {
          const data = await projectsRes.json();
          setAllProjects(data || []);
        }
      } catch (err) {
        console.error('Failed to fetch data:', err);
        setError('Failed to load project access');
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [agent.id]);

  // Filter out projects that the agent already has access to
  const availableProjects = allProjects.filter(
    project => !projectAccess.some(access => access.id === project.id)
  );

  // Grant project access
  async function handleAddAccess() {
    if (!selectedProjectId) return;

    setError(null);
    setSaving(true);
    try {
      const res = await fetch(`/api/agents/${agent.id}/projects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: selectedProjectId, role: selectedRole }),
      });

      if (res.ok) {
        // Refresh project access
        const accessRes = await fetch(`/api/agents/${agent.id}/projects`);
        if (accessRes.ok) {
          const data = await accessRes.json();
          setProjectAccess(data.projects || []);
        }
        setShowAddPanel(false);
        setSelectedProjectId('');
        setSelectedRole('member');
        setSuccessMessage('Project access granted');
        setTimeout(() => setSuccessMessage(null), 3000);
      } else {
        const data = await res.json();
        setError(data.error || 'Failed to grant access');
      }
    } catch (err) {
      setError('Failed to grant access');
    } finally {
      setSaving(false);
    }
  }

  // Revoke project access
  async function handleRemoveAccess(projectId: string, projectName: string) {
    if (!confirm(`Remove ${agent.displayName}'s access to "${projectName}"?`)) return;

    setError(null);
    try {
      const res = await fetch(
        `/api/agents/${agent.id}/projects?projectId=${projectId}`,
        { method: 'DELETE' }
      );

      if (res.ok) {
        setProjectAccess(prev => prev.filter(p => p.id !== projectId));
        setSuccessMessage('Access revoked');
        setTimeout(() => setSuccessMessage(null), 3000);
      } else {
        const data = await res.json();
        setError(data.error || 'Failed to revoke access');
      }
    } catch (err) {
      setError('Failed to revoke access');
    }
  }

  // Update role
  async function handleUpdateRole(projectId: string, newRole: string) {
    setError(null);
    try {
      const res = await fetch(`/api/agents/${agent.id}/projects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, role: newRole }),
      });

      if (res.ok) {
        setProjectAccess(prev =>
          prev.map(p => (p.id === projectId ? { ...p, role: newRole } : p))
        );
      } else {
        const data = await res.json();
        setError(data.error || 'Failed to update role');
      }
    } catch (err) {
      setError('Failed to update role');
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'online': return 'bg-green-500';
      case 'idle': return 'bg-yellow-500';
      case 'dnd': return 'bg-red-500';
      default: return 'bg-gray-500';
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-[#313338] rounded-lg shadow-xl w-full max-w-lg max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <div className="flex items-center gap-3">
            {/* Agent Avatar */}
            <div className="relative">
              {agent.avatar ? (
                <img
                  src={agent.avatar}
                  alt={agent.displayName}
                  className="w-10 h-10 rounded-full object-cover"
                />
              ) : (
                <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center">
                  <Bot className="w-5 h-5" />
                </div>
              )}
              <div className={cn(
                'absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-[#313338]',
                getStatusColor(agent.status)
              )} />
            </div>
            <div>
              <h2 className="text-lg font-semibold flex items-center gap-2">
                {agent.displayName}
                <span className="text-xs bg-blue-500/20 text-blue-300 px-1.5 py-0.5 rounded">
                  Agent
                </span>
              </h2>
              <p className="text-sm text-gray-400">@{agent.username}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-gray-200 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-700">
          <button
            onClick={() => setActiveTab('about')}
            className={cn(
              'flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors',
              activeTab === 'about'
                ? 'text-white border-b-2 border-blue-500'
                : 'text-gray-400 hover:text-gray-200'
            )}
          >
            <Settings className="w-4 h-4" />
            About
          </button>
          <button
            onClick={() => setActiveTab('projects')}
            className={cn(
              'flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors',
              activeTab === 'projects'
                ? 'text-white border-b-2 border-blue-500'
                : 'text-gray-400 hover:text-gray-200'
            )}
          >
            <Folder className="w-4 h-4" />
            Project Access
            {projectAccess.length > 0 && (
              <span className="text-xs bg-gray-600 px-1.5 py-0.5 rounded-full">
                {projectAccess.length}
              </span>
            )}
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {activeTab === 'about' ? (
            <div className="p-4 space-y-4">
              <div className="bg-[#2B2D31] rounded-lg p-4">
                <h3 className="text-xs font-semibold text-gray-400 uppercase mb-3">
                  Agent Information
                </h3>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-gray-400">Username</span>
                    <span>@{agent.username}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Display Name</span>
                    <span>{agent.displayName}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Status</span>
                    <span className="flex items-center gap-2">
                      <div className={cn('w-2 h-2 rounded-full', getStatusColor(agent.status))} />
                      <span className="capitalize">{agent.status}</span>
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Type</span>
                    <span className="flex items-center gap-1">
                      <Bot className="w-4 h-4 text-blue-400" />
                      AI Agent
                    </span>
                  </div>
                </div>
              </div>

              <div className="text-sm text-gray-500">
                <p>
                  Agents can access kanban projects and manage tasks when granted
                  explicit project access by an admin.
                </p>
              </div>
            </div>
          ) : (
            <div className="p-4">
              {/* Success/Error Messages */}
              {successMessage && (
                <div className="mb-4 p-3 bg-green-500/20 border border-green-500/30 rounded-lg flex items-center gap-2 text-green-400">
                  <CheckCircle className="w-4 h-4" />
                  {successMessage}
                </div>
              )}
              {error && (
                <div className="mb-4 p-3 bg-red-500/20 border border-red-500/30 rounded-lg text-red-400">
                  {error}
                </div>
              )}

              {/* Header with Add button */}
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-gray-400 uppercase">
                  Projects ({projectAccess.length})
                </h3>
                <button
                  onClick={() => setShowAddPanel(true)}
                  disabled={availableProjects.length === 0}
                  className={cn(
                    'flex items-center gap-1 px-2 py-1 text-sm rounded transition-colors',
                    availableProjects.length === 0
                      ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
                      : 'bg-primary hover:bg-primary-hover text-white'
                  )}
                >
                  <Plus className="w-4 h-4" />
                  Add Project
                </button>
              </div>

              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin rounded-full h-6 w-6 border-2 border-gray-500 border-t-white" />
                </div>
              ) : (
                <>
                  {/* Add Project Panel */}
                  {showAddPanel && (
                    <div className="mb-4 bg-[#2B2D31] rounded-lg p-4">
                      <h4 className="font-medium mb-3">Add Project Access</h4>

                      {availableProjects.length === 0 ? (
                        <p className="text-gray-400 text-sm">
                          No projects available. The agent has access to all projects.
                        </p>
                      ) : (
                        <>
                          <div className="mb-3">
                            <label className="text-sm text-gray-400 block mb-1">
                              Select Project
                            </label>
                            <select
                              value={selectedProjectId}
                              onChange={e => setSelectedProjectId(e.target.value)}
                              className="w-full bg-[#1E1F22] border border-gray-600 rounded px-3 py-2 text-white"
                            >
                              <option value="">Choose a project...</option>
                              {availableProjects.map(project => (
                                <option key={project.id} value={project.id}>
                                  {project.name}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div className="mb-4">
                            <label className="text-sm text-gray-400 block mb-1">
                              Role
                            </label>
                            <select
                              value={selectedRole}
                              onChange={e => setSelectedRole(e.target.value)}
                              className="w-full bg-[#1E1F22] border border-gray-600 rounded px-3 py-2 text-white"
                            >
                              <option value="admin">{roleLabels.admin}</option>
                              <option value="member">{roleLabels.member}</option>
                              <option value="readonly">{roleLabels.readonly}</option>
                            </select>
                          </div>
                        </>
                      )}

                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => {
                            setShowAddPanel(false);
                            setError(null);
                            setSelectedProjectId('');
                          }}
                          className="px-3 py-1.5 text-gray-400 hover:text-white"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={handleAddAccess}
                          disabled={!selectedProjectId || saving}
                          className="px-3 py-1.5 bg-primary rounded hover:bg-primary-hover disabled:opacity-50"
                        >
                          {saving ? 'Adding...' : 'Add Access'}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Project Access List */}
                  <div className="space-y-2">
                    {projectAccess.length === 0 ? (
                      <div className="text-center py-8 text-gray-400">
                        <Folder className="w-12 h-12 mx-auto mb-3 text-gray-600" />
                        <p className="text-sm">No project access granted yet.</p>
                        <p className="text-xs mt-1">
                          Click "Add Project" to grant this agent access to a project.
                        </p>
                      </div>
                    ) : (
                      projectAccess.map(project => {
                        const RoleIcon = roleIcons[project.role] || User;
                        return (
                          <div
                            key={project.id}
                            className="flex items-center justify-between p-3 bg-[#2B2D31] rounded-lg"
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <div
                                className="w-3 h-3 rounded-sm flex-shrink-0"
                                style={{ backgroundColor: project.color }}
                              />
                              <div className="min-w-0">
                                <p className="font-medium truncate">{project.name}</p>
                                <p className="text-xs text-gray-500 truncate">
                                  Granted by {project.grantedBy.displayName}
                                </p>
                              </div>
                            </div>

                            <div className="flex items-center gap-2 flex-shrink-0">
                              <select
                                value={project.role}
                                onChange={e => handleUpdateRole(project.id, e.target.value)}
                                className="bg-[#1E1F22] border border-gray-600 rounded px-2 py-1 text-sm"
                              >
                                <option value="admin">Admin</option>
                                <option value="member">Member</option>
                                <option value="readonly">Read Only</option>
                              </select>
                              <button
                                onClick={() => handleRemoveAccess(project.id, project.name)}
                                className="p-1.5 text-red-400 hover:bg-red-400/10 rounded transition-colors"
                                title="Remove access"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 p-4 border-t border-gray-700">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-600 rounded hover:bg-gray-500 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
