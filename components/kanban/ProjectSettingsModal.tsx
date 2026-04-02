'use client';

import { useState, useEffect } from 'react';
import { X, UserPlus, Bot, User, Crown, Shield, Eye, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Member {
  id: string;
  username: string;
  displayName: string;
  avatar: string | null;
  isAgent: boolean;
  role: string;
  source: 'workspace' | 'explicit';
  grantedBy?: { id: string; displayName: string };
  grantedAt?: string;
}

interface Agent {
  id: string;
  username: string;
  displayName: string;
  avatar: string | null;
  status: string;
}

interface ProjectSettingsModalProps {
  projectId: string;
  projectName: string;
  onClose: () => void;
}

const roleIcons: Record<string, typeof Crown> = {
  owner: Crown,
  admin: Shield,
  member: User,
  readonly: Eye,
};

const roleColors: Record<string, string> = {
  owner: 'text-yellow-400',
  admin: 'text-blue-400',
  member: 'text-gray-400',
  readonly: 'text-gray-500',
};

export default function ProjectSettingsModal({
  projectId,
  projectName,
  onClose,
}: ProjectSettingsModalProps) {
  const [members, setMembers] = useState<Member[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddAgent, setShowAddAgent] = useState(false);
  const [selectedAgentId, setSelectedAgentId] = useState('');
  const [selectedRole, setSelectedRole] = useState('member');
  const [error, setError] = useState<string | null>(null);

  // Fetch members and available agents
  useEffect(() => {
    async function fetchData() {
      try {
        const [membersRes, agentsRes] = await Promise.all([
          fetch(`/api/kanban/projects/${projectId}/members`),
          fetch('/api/agents'),
        ]);

        if (membersRes.ok) {
          const data = await membersRes.json();
          setMembers(data.members);
        }

        if (agentsRes.ok) {
          const data = await agentsRes.json();
          setAgents(data.agents);
        }
      } catch (err) {
        console.error('Failed to fetch data:', err);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [projectId]);

  // Filter out agents that already have access
  const availableAgents = agents.filter(
    agent => !members.some(m => m.id === agent.id)
  );

  async function handleAddAgent() {
    if (!selectedAgentId) return;

    setError(null);
    try {
      const res = await fetch(`/api/kanban/projects/${projectId}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId: selectedAgentId, role: selectedRole }),
      });

      if (res.ok) {
        // Refresh members
        const membersRes = await fetch(`/api/kanban/projects/${projectId}/members`);
        if (membersRes.ok) {
          const data = await membersRes.json();
          setMembers(data.members);
        }
        setShowAddAgent(false);
        setSelectedAgentId('');
        setSelectedRole('member');
      } else {
        const data = await res.json();
        setError(data.error || 'Failed to add agent');
      }
    } catch (err) {
      setError('Failed to add agent');
    }
  }

  async function handleRemoveAgent(agentId: string) {
    if (!confirm('Remove this agent from the project?')) return;

    try {
      const res = await fetch(
        `/api/kanban/projects/${projectId}/members?agentId=${agentId}`,
        { method: 'DELETE' }
      );

      if (res.ok) {
        setMembers(prev => prev.filter(m => m.id !== agentId));
      }
    } catch (err) {
      console.error('Failed to remove agent:', err);
    }
  }

  async function handleUpdateRole(agentId: string, newRole: string) {
    try {
      const res = await fetch(`/api/kanban/projects/${projectId}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId, role: newRole }),
      });

      if (res.ok) {
        setMembers(prev =>
          prev.map(m => (m.id === agentId ? { ...m, role: newRole } : m))
        );
      }
    } catch (err) {
      console.error('Failed to update role:', err);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-[#1E1F22] rounded-lg w-full max-w-lg mx-4 shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
          <h2 className="text-lg font-semibold">Project Settings</h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-white/10 rounded"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 max-h-[70vh] overflow-y-auto">
          <h3 className="text-sm font-medium text-gray-400 mb-2">
            {projectName}
          </h3>

          {/* Members Section */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-3">
              <h4 className="font-medium">Members</h4>
              <button
                onClick={() => setShowAddAgent(true)}
                className="flex items-center gap-1 px-2 py-1 text-sm bg-primary rounded hover:bg-primary-hover"
              >
                <UserPlus className="w-4 h-4" />
                Add Agent
              </button>
            </div>

            {loading ? (
              <div className="text-gray-400 text-sm">Loading...</div>
            ) : (
              <div className="space-y-2">
                {members.map(member => {
                  const RoleIcon = roleIcons[member.role] || User;
                  return (
                    <div
                      key={member.id}
                      className="flex items-center justify-between p-2 bg-[#2B2D31] rounded"
                    >
                      <div className="flex items-center gap-3">
                        {member.avatar ? (
                          <img
                            src={member.avatar}
                            alt=""
                            className="w-8 h-8 rounded-full"
                          />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-gray-600 flex items-center justify-center">
                            {member.isAgent ? (
                              <Bot className="w-4 h-4" />
                            ) : (
                              <User className="w-4 h-4" />
                            )}
                          </div>
                        )}
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-medium">
                              {member.displayName}
                            </span>
                            {member.isAgent && (
                              <span className="text-xs px-1.5 py-0.5 bg-blue-500/20 text-blue-400 rounded">
                                Agent
                              </span>
                            )}
                          </div>
                          <div className="text-sm text-gray-400">
                            @{member.username}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {member.source === 'explicit' && member.isAgent ? (
                          <>
                            <select
                              value={member.role}
                              onChange={e =>
                                handleUpdateRole(member.id, e.target.value)
                              }
                              className="bg-[#1E1F22] border border-gray-600 rounded px-2 py-1 text-sm"
                            >
                              <option value="admin">Admin</option>
                              <option value="member">Member</option>
                              <option value="readonly">Read Only</option>
                            </select>
                            <button
                              onClick={() => handleRemoveAgent(member.id)}
                              className="p-1 text-red-400 hover:bg-red-400/10 rounded"
                              title="Remove agent"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </>
                        ) : (
                          <div
                            className={cn(
                              'flex items-center gap-1 text-sm',
                              roleColors[member.role]
                            )}
                          >
                            <RoleIcon className="w-4 h-4" />
                            <span className="capitalize">{member.role}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}

                {members.length === 0 && (
                  <div className="text-gray-400 text-sm text-center py-4">
                    No members yet
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Add Agent Panel */}
          {showAddAgent && (
            <div className="bg-[#2B2D31] rounded p-4 mb-4">
              <h4 className="font-medium mb-3">Add Agent to Project</h4>
              
              {error && (
                <div className="text-red-400 text-sm mb-3">{error}</div>
              )}

              {availableAgents.length === 0 ? (
                <div className="text-gray-400 text-sm">
                  No agents available to add. All agents already have access.
                </div>
              ) : (
                <>
                  <div className="mb-3">
                    <label className="text-sm text-gray-400 block mb-1">
                      Select Agent
                    </label>
                    <select
                      value={selectedAgentId}
                      onChange={e => setSelectedAgentId(e.target.value)}
                      className="w-full bg-[#1E1F22] border border-gray-600 rounded px-3 py-2"
                    >
                      <option value="">Choose an agent...</option>
                      {availableAgents.map(agent => (
                        <option key={agent.id} value={agent.id}>
                          {agent.displayName} (@{agent.username})
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
                      className="w-full bg-[#1E1F22] border border-gray-600 rounded px-3 py-2"
                    >
                      <option value="admin">Admin - Full access</option>
                      <option value="member">Member - Create & edit tasks</option>
                      <option value="readonly">Read Only - View only</option>
                    </select>
                  </div>
                </>
              )}

              <div className="flex justify-end gap-2">
                <button
                  onClick={() => {
                    setShowAddAgent(false);
                    setError(null);
                  }}
                  className="px-3 py-1.5 text-gray-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddAgent}
                  disabled={!selectedAgentId}
                  className="px-3 py-1.5 bg-primary rounded hover:bg-primary-hover disabled:opacity-50"
                >
                  Add Agent
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-4 py-3 border-t border-gray-700">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-600 rounded hover:bg-gray-500"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
