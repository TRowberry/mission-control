'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Rocket, Plus, Settings, X, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import UserMenu from './UserMenu';
import { useWorkspace } from '@/components/providers/WorkspaceContext';

interface User {
  id: string;
  displayName: string;
  avatar: string | null;
  status: string;
}

interface SidebarProps {
  user: User;
}

function WorkspaceIcon({ name, icon }: { name: string; icon: string | null }) {
  if (icon) return <span className="text-xl leading-none">{icon}</span>;
  // Initials fallback
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map(w => w[0])
    .join('')
    .toUpperCase();
  return <span className="text-sm font-bold">{initials}</span>;
}

function CreateWorkspaceModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState('');
  const [icon, setIcon] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/workspaces', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), icon: icon.trim() || null }),
      });
      if (res.ok) {
        onCreated();
        onClose();
      } else {
        const data = await res.json();
        setError(data.error || 'Failed to create workspace');
      }
    } catch {
      setError('Failed to create workspace');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div className="bg-[#2B2D31] rounded-xl p-6 w-full max-w-sm shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white">Create Workspace</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Workspace Name</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. My Team"
              className="w-full px-3 py-2 bg-[#1E1F22] text-white rounded-lg border border-gray-600 focus:outline-none focus:border-primary text-sm"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Icon (emoji, optional)</label>
            <input
              type="text"
              value={icon}
              onChange={e => setIcon(e.target.value)}
              placeholder="e.g. 🚀"
              className="w-full px-3 py-2 bg-[#1E1F22] text-white rounded-lg border border-gray-600 focus:outline-none focus:border-primary text-sm"
            />
          </div>
          {error && <p className="text-sm text-red-400">{error}</p>}
          <div className="flex gap-2 justify-end pt-1">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-300 hover:text-white rounded-lg hover:bg-white/10"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !name.trim()}
              className="px-4 py-2 text-sm bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50"
            >
              {loading ? 'Creating...' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function Sidebar({ user }: SidebarProps) {
  const pathname = usePathname();
  const { workspaces, activeWorkspaceId, setActiveWorkspaceId, refreshWorkspaces, loading } = useWorkspace();
  const [showCreate, setShowCreate] = useState(false);

  return (
    <>
      <div className="w-[72px] bg-channel-bg flex flex-col items-center py-3 gap-2">
        {/* Home button */}
        <Link
          href="/dashboard"
          className={cn(
            'w-12 h-12 rounded-2xl flex items-center justify-center transition-all hover:rounded-xl',
            pathname === '/dashboard'
              ? 'bg-primary rounded-xl'
              : 'bg-chat-bg hover:bg-primary'
          )}
          title="Home"
        >
          <Rocket className="w-6 h-6" />
        </Link>

        <div className="w-8 h-0.5 bg-gray-700 rounded-full my-1" />

        {/* Workspaces */}
        {!loading && workspaces.map((workspace) => {
          const isActive = workspace.id === activeWorkspaceId;
          return (
            <button
              key={workspace.id}
              onClick={() => setActiveWorkspaceId(workspace.id)}
              className={cn(
                'w-12 h-12 rounded-2xl flex items-center justify-center transition-all hover:rounded-xl bg-chat-bg hover:bg-primary',
                isActive && 'bg-primary rounded-xl'
              )}
              title={workspace.name}
            >
              <WorkspaceIcon name={workspace.name} icon={workspace.icon} />
            </button>
          );
        })}

        {/* Add workspace */}
        <button
          onClick={() => setShowCreate(true)}
          className="w-12 h-12 rounded-2xl flex items-center justify-center transition-all hover:rounded-xl bg-chat-bg hover:bg-success text-success hover:text-white"
          title="Create Workspace"
        >
          <Plus className="w-6 h-6" />
        </button>

        <div className="flex-1" />

        {/* Settings */}
        <Link
          href="/settings"
          className="w-12 h-12 rounded-2xl flex items-center justify-center transition-all hover:rounded-xl bg-chat-bg hover:bg-secondary"
          title="Settings"
        >
          <Settings className="w-5 h-5" />
        </Link>

        <UserMenu user={user} />
      </div>

      {showCreate && (
        <CreateWorkspaceModal
          onClose={() => setShowCreate(false)}
          onCreated={refreshWorkspaces}
        />
      )}
    </>
  );
}
