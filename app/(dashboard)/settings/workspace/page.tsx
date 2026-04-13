'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Settings, Users, Link2, Trash2, Copy, Check, Crown, Shield, UserIcon, UserMinus, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useWorkspace } from '@/components/providers/WorkspaceContext';

interface Member {
  id: string;
  role: string;
  joinedAt: string;
  user: {
    id: string;
    username: string;
    displayName: string;
    avatar: string | null;
    status: string;
    isAgent: boolean;
  };
}

interface Invite {
  id: string;
  email: string;
  token: string;
  role: string;
  expiresAt: string;
  inviteUrl: string;
  invitedBy: { username: string; displayName: string };
}

const ROLE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  owner: Crown,
  admin: Shield,
  member: UserIcon,
  guest: UserIcon,
};

const ROLE_COLORS: Record<string, string> = {
  owner: 'text-yellow-400',
  admin: 'text-blue-400',
  member: 'text-gray-400',
  guest: 'text-gray-500',
};

export default function WorkspaceSettingsPage() {
  const router = useRouter();
  const { activeWorkspace, activeWorkspaceId, refreshWorkspaces } = useWorkspace();

  const [tab, setTab] = useState<'general' | 'members' | 'invites'>('general');
  const [members, setMembers] = useState<Member[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [loading, setLoading] = useState(false);

  // General form state
  const [name, setName] = useState('');
  const [icon, setIcon] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');

  // Invite form
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('member');
  const [inviting, setInviting] = useState(false);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  useEffect(() => {
    if (activeWorkspace) {
      setName(activeWorkspace.name);
      setIcon(activeWorkspace.icon || '');
      setDescription(activeWorkspace.description || '');
    }
  }, [activeWorkspace]);

  useEffect(() => {
    if (!activeWorkspaceId) return;
    if (tab === 'members') fetchMembers();
    if (tab === 'invites') fetchInvites();
  }, [tab, activeWorkspaceId]);

  const fetchMembers = async () => {
    if (!activeWorkspaceId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/workspaces/${activeWorkspaceId}/members`);
      if (res.ok) setMembers(await res.json());
    } finally {
      setLoading(false);
    }
  };

  const fetchInvites = async () => {
    if (!activeWorkspaceId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/workspaces/${activeWorkspaceId}/invite`);
      if (res.ok) setInvites(await res.json());
    } finally {
      setLoading(false);
    }
  };

  const saveGeneral = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeWorkspaceId) return;
    setSaving(true);
    setSaveMsg('');
    try {
      const res = await fetch(`/api/workspaces/${activeWorkspaceId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, icon: icon || null, description: description || null }),
      });
      if (res.ok) {
        setSaveMsg('Saved!');
        await refreshWorkspaces();
        setTimeout(() => setSaveMsg(''), 2000);
      }
    } finally {
      setSaving(false);
    }
  };

  const createInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeWorkspaceId) return;
    setInviting(true);
    try {
      const res = await fetch(`/api/workspaces/${activeWorkspaceId}/invite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: inviteEmail || undefined, role: inviteRole }),
      });
      if (res.ok) {
        const data = await res.json();
        setInvites(prev => [{ ...data, inviteUrl: data.inviteUrl }, ...prev]);
        setInviteEmail('');
        // Auto-copy the link
        copyInviteLink(data.token, data.inviteUrl);
      }
    } finally {
      setInviting(false);
    }
  };

  const copyInviteLink = (token: string, url?: string) => {
    const fullUrl = `${window.location.origin}${url || `/invite/${token}`}`;
    navigator.clipboard.writeText(fullUrl).then(() => {
      setCopiedToken(token);
      setTimeout(() => setCopiedToken(null), 2000);
    });
  };

  const revokeInvite = async (token: string) => {
    if (!activeWorkspaceId) return;
    await fetch(`/api/workspaces/${activeWorkspaceId}/invite?token=${token}`, { method: 'DELETE' });
    setInvites(prev => prev.filter(i => i.token !== token));
  };

  const removeMember = async (userId: string) => {
    if (!activeWorkspaceId) return;
    if (!confirm('Remove this member from the workspace?')) return;
    const res = await fetch(`/api/workspaces/${activeWorkspaceId}/members?userId=${userId}`, { method: 'DELETE' });
    if (res.ok) fetchMembers();
  };

  const updateMemberRole = async (userId: string, role: string) => {
    if (!activeWorkspaceId) return;
    await fetch(`/api/workspaces/${activeWorkspaceId}/members`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, role }),
    });
    fetchMembers();
  };

  if (!activeWorkspace) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-400">
        No workspace selected
      </div>
    );
  }

  const isAdmin = ['owner', 'admin'].includes(activeWorkspace.role);

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="h-12 border-b border-black/20 px-6 flex items-center gap-3">
        <Settings className="w-4 h-4 text-gray-400" />
        <span className="font-semibold">{activeWorkspace.name} — Settings</span>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto py-8 px-6">
          {/* Tabs */}
          <div className="flex gap-1 mb-8 border-b border-gray-700">
            {(['general', 'members', 'invites'] as const).map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={cn(
                  'px-4 py-2 text-sm capitalize border-b-2 -mb-px transition-colors',
                  tab === t
                    ? 'border-primary text-white'
                    : 'border-transparent text-gray-400 hover:text-gray-200'
                )}
              >
                {t}
              </button>
            ))}
          </div>

          {/* General */}
          {tab === 'general' && (
            <form onSubmit={saveGeneral} className="space-y-5">
              <div>
                <label className="block text-sm text-gray-400 mb-1">Workspace Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  disabled={!isAdmin}
                  className="w-full px-3 py-2 bg-[#1E1F22] text-white rounded-lg border border-gray-600 focus:outline-none focus:border-primary text-sm disabled:opacity-50"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Icon (emoji)</label>
                <input
                  type="text"
                  value={icon}
                  onChange={e => setIcon(e.target.value)}
                  disabled={!isAdmin}
                  placeholder="e.g. 🚀"
                  className="w-full px-3 py-2 bg-[#1E1F22] text-white rounded-lg border border-gray-600 focus:outline-none focus:border-primary text-sm disabled:opacity-50"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Description</label>
                <textarea
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  disabled={!isAdmin}
                  rows={3}
                  className="w-full px-3 py-2 bg-[#1E1F22] text-white rounded-lg border border-gray-600 focus:outline-none focus:border-primary text-sm resize-none disabled:opacity-50"
                />
              </div>
              {isAdmin && (
                <div className="flex items-center gap-3">
                  <button
                    type="submit"
                    disabled={saving}
                    className="px-4 py-2 text-sm bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50"
                  >
                    {saving ? 'Saving…' : 'Save Changes'}
                  </button>
                  {saveMsg && (
                    <span className="text-sm text-green-400 flex items-center gap-1">
                      <Check className="w-4 h-4" /> {saveMsg}
                    </span>
                  )}
                </div>
              )}

              {/* Danger zone — owner only */}
              {activeWorkspace.role === 'owner' && (
                <div className="mt-10 pt-6 border-t border-red-900/30">
                  <h3 className="text-sm font-semibold text-red-400 mb-3">Danger Zone</h3>
                  <button
                    type="button"
                    onClick={async () => {
                      if (!confirm(`Delete workspace "${activeWorkspace.name}"? This cannot be undone.`)) return;
                      const res = await fetch(`/api/workspaces/${activeWorkspaceId}`, { method: 'DELETE' });
                      if (res.ok) { await refreshWorkspaces(); router.push('/dashboard'); }
                    }}
                    className="flex items-center gap-2 px-4 py-2 text-sm text-red-400 border border-red-700 rounded-lg hover:bg-red-900/20"
                  >
                    <Trash2 className="w-4 h-4" />
                    Delete Workspace
                  </button>
                </div>
              )}
            </form>
          )}

          {/* Members */}
          {tab === 'members' && (
            <div className="space-y-2">
              {loading ? (
                <p className="text-gray-500 text-sm">Loading…</p>
              ) : members.map(m => {
                const RoleIcon = ROLE_ICONS[m.role] || UserIcon;
                return (
                  <div key={m.id} className="flex items-center gap-3 p-3 rounded-lg bg-[#2B2D31] hover:bg-[#313338]">
                    <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-xs font-semibold flex-shrink-0">
                      {m.user.avatar
                        ? <img src={m.user.avatar} alt="" className="w-full h-full rounded-full object-cover" />
                        : m.user.displayName.slice(0, 2).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-white truncate">{m.user.displayName}</div>
                      <div className="text-xs text-gray-500">@{m.user.username}</div>
                    </div>
                    <div className={cn('flex items-center gap-1 text-xs', ROLE_COLORS[m.role])}>
                      <RoleIcon className="w-3 h-3" />
                      {m.role}
                    </div>
                    {isAdmin && m.role !== 'owner' && (
                      <div className="flex items-center gap-1">
                        <select
                          value={m.role}
                          onChange={e => updateMemberRole(m.user.id, e.target.value)}
                          className="text-xs bg-[#1E1F22] text-gray-300 border border-gray-600 rounded px-1 py-0.5"
                        >
                          <option value="admin">Admin</option>
                          <option value="member">Member</option>
                          <option value="guest">Guest</option>
                        </select>
                        <button
                          onClick={() => removeMember(m.user.id)}
                          className="p-1 text-gray-500 hover:text-red-400"
                          title="Remove member"
                        >
                          <UserMinus className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Invites */}
          {tab === 'invites' && (
            <div className="space-y-6">
              {isAdmin && (
                <form onSubmit={createInvite} className="flex gap-2 items-end">
                  <div className="flex-1">
                    <label className="block text-xs text-gray-400 mb-1">Email (optional — leave blank for a shareable link)</label>
                    <input
                      type="email"
                      value={inviteEmail}
                      onChange={e => setInviteEmail(e.target.value)}
                      placeholder="colleague@example.com"
                      className="w-full px-3 py-2 bg-[#1E1F22] text-white rounded-lg border border-gray-600 focus:outline-none focus:border-primary text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Role</label>
                    <select
                      value={inviteRole}
                      onChange={e => setInviteRole(e.target.value)}
                      className="px-3 py-2 bg-[#1E1F22] text-white rounded-lg border border-gray-600 text-sm"
                    >
                      <option value="admin">Admin</option>
                      <option value="member">Member</option>
                      <option value="guest">Guest</option>
                    </select>
                  </div>
                  <button
                    type="submit"
                    disabled={inviting}
                    className="flex items-center gap-1.5 px-4 py-2 text-sm bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50"
                  >
                    <Plus className="w-4 h-4" />
                    {inviting ? 'Creating…' : 'Create Invite'}
                  </button>
                </form>
              )}

              <div className="space-y-2">
                {invites.length === 0 ? (
                  <p className="text-gray-500 text-sm">No active invite links.</p>
                ) : invites.map(invite => (
                  <div key={invite.id} className="flex items-center gap-3 p-3 rounded-lg bg-[#2B2D31]">
                    <Link2 className="w-4 h-4 text-gray-400 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-white truncate font-mono text-xs">
                        {window.location.origin}/invite/{invite.token}
                      </div>
                      <div className="text-xs text-gray-500">
                        {invite.email ? `For: ${invite.email} · ` : ''}
                        Role: {invite.role} · Expires: {new Date(invite.expiresAt).toLocaleDateString()}
                      </div>
                    </div>
                    <button
                      onClick={() => copyInviteLink(invite.token)}
                      className="p-1.5 text-gray-400 hover:text-white rounded"
                      title="Copy link"
                    >
                      {copiedToken === invite.token ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
                    </button>
                    {isAdmin && (
                      <button
                        onClick={() => revokeInvite(invite.token)}
                        className="p-1.5 text-gray-400 hover:text-red-400 rounded"
                        title="Revoke"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
