'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Rocket, Check, X } from 'lucide-react';
import { useWorkspace } from '@/components/providers/WorkspaceContext';

interface InviteInfo {
  workspace: { id: string; name: string; slug: string; icon: string | null };
  role: string;
  invitedBy: { username: string; displayName: string };
  expiresAt: string;
  alreadyMember: boolean;
}

export default function InvitePage() {
  const params = useParams();
  const router = useRouter();
  const token = params.token as string;
  const { refreshWorkspaces, setActiveWorkspaceId } = useWorkspace();

  const [info, setInfo] = useState<InviteInfo | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);

  useEffect(() => {
    fetch(`/api/invites/${token}`)
      .then(r => r.json())
      .then(data => {
        if (data.error) setError(data.error);
        else setInfo(data);
      })
      .catch(() => setError('Failed to load invite'))
      .finally(() => setLoading(false));
  }, [token]);

  const accept = async () => {
    setAccepting(true);
    try {
      const res = await fetch(`/api/invites/${token}`, { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        await refreshWorkspaces();
        setActiveWorkspaceId(data.workspaceId);
        router.push('/dashboard');
      } else {
        setError(data.error || 'Failed to accept invite');
      }
    } catch {
      setError('Failed to accept invite');
    } finally {
      setAccepting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#1E1F22] flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex items-center justify-center gap-2 mb-8">
          <Rocket className="w-8 h-8 text-primary" />
          <span className="text-xl font-bold text-white">Mission Control</span>
        </div>

        <div className="bg-[#2B2D31] rounded-xl p-6 shadow-xl">
          {loading && (
            <p className="text-center text-gray-400">Loading invite…</p>
          )}

          {error && (
            <div className="text-center">
              <div className="w-12 h-12 rounded-full bg-red-900/30 flex items-center justify-center mx-auto mb-3">
                <X className="w-6 h-6 text-red-400" />
              </div>
              <p className="text-red-400 font-medium">{error}</p>
              <button
                onClick={() => router.push('/login')}
                className="mt-4 text-sm text-gray-400 hover:text-white"
              >
                Go to login
              </button>
            </div>
          )}

          {!loading && !error && info && (
            <div className="text-center">
              {/* Workspace icon */}
              <div className="w-16 h-16 rounded-2xl bg-primary/20 flex items-center justify-center mx-auto mb-4 text-3xl">
                {info.workspace.icon || info.workspace.name.slice(0, 2).toUpperCase()}
              </div>

              <h2 className="text-lg font-semibold text-white mb-1">
                {info.alreadyMember ? 'You\'re already a member' : 'You\'ve been invited'}
              </h2>
              <p className="text-gray-400 text-sm mb-1">
                {info.alreadyMember
                  ? `You already have access to ${info.workspace.name}.`
                  : (
                    <>
                      <span className="text-white">{info.invitedBy.displayName}</span>
                      {' '}invited you to join{' '}
                      <span className="text-white font-medium">{info.workspace.name}</span>
                      {' '}as a{' '}
                      <span className="text-primary">{info.role}</span>.
                    </>
                  )}
              </p>

              {info.alreadyMember ? (
                <button
                  onClick={() => { setActiveWorkspaceId(info.workspace.id); router.push('/dashboard'); }}
                  className="mt-5 w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-primary text-white rounded-lg hover:bg-primary/90 text-sm font-medium"
                >
                  <Check className="w-4 h-4" />
                  Go to {info.workspace.name}
                </button>
              ) : (
                <button
                  onClick={accept}
                  disabled={accepting}
                  className="mt-5 w-full px-4 py-2.5 bg-primary text-white rounded-lg hover:bg-primary/90 text-sm font-medium disabled:opacity-50"
                >
                  {accepting ? 'Joining…' : `Join ${info.workspace.name}`}
                </button>
              )}

              <button
                onClick={() => router.push('/dashboard')}
                className="mt-2 w-full px-4 py-2 text-sm text-gray-400 hover:text-white rounded-lg hover:bg-white/5"
              >
                Maybe later
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
