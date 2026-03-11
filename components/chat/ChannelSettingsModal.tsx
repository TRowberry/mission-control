'use client';

import { useState, useEffect } from 'react';
import { X, Hash, Archive, Users, Settings, Bot, User as UserIcon } from 'lucide-react';
import { useSocket } from '@/components/providers/SocketProvider';

interface Channel {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  type: string;
}

interface MemberChannel {
  id: string;
  name: string;
  slug: string;
}

interface Member {
  id: string;
  username: string;
  displayName: string;
  avatar: string | null;
  status: string;
  isAgent: boolean;
  role?: string;
  joinedAt?: string;
  channels?: MemberChannel[];
}

interface ChannelSettingsModalProps {
  channel: Channel;
  defaultTab?: 'about' | 'members';
  onClose: () => void;
  onUpdate: (channel: Channel) => void;
  onDelete: () => void;
}

type Tab = 'about' | 'members';

export default function ChannelSettingsModal({
  channel,
  defaultTab = 'about',
  onClose,
  onUpdate,
  onDelete,
}: ChannelSettingsModalProps) {
  const { isUserOnline } = useSocket();
  const [activeTab, setActiveTab] = useState<Tab>(defaultTab);
  const [name, setName] = useState(channel.name);
  const [description, setDescription] = useState(channel.description || '');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [error, setError] = useState('');
  
  // Members state
  const [members, setMembers] = useState<Member[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [channelType, setChannelType] = useState<string>('');

  // Fetch members when Members tab is selected
  useEffect(() => {
    if (activeTab === 'members' && members.length === 0) {
      fetchMembers();
    }
  }, [activeTab]);

  const fetchMembers = async () => {
    setLoadingMembers(true);
    try {
      const res = await fetch(`/api/channels/${channel.id}/members`);
      if (res.ok) {
        const data = await res.json();
        setMembers(data.members);
        setChannelType(data.channelType);
      }
    } catch (err) {
      console.error('Failed to fetch members:', err);
    } finally {
      setLoadingMembers(false);
    }
  };

  const handleSave = async () => {
    if (!name.trim()) {
      setError('Channel name is required');
      return;
    }

    setSaving(true);
    setError('');

    try {
      const res = await fetch('/api/channels', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: channel.id,
          name: name.trim(),
          description: description.trim() || null,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to update channel');
      }

      const updated = await res.json();
      onUpdate(updated);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update channel');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);

    try {
      const res = await fetch(`/api/channels?id=${channel.id}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        throw new Error('Failed to delete channel');
      }

      onDelete();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete channel');
    } finally {
      setDeleting(false);
    }
  };

  const getStatusColor = (memberId: string, fallbackStatus: string) => {
    // Use real-time presence if available
    if (isUserOnline(memberId)) {
      return 'bg-green-500';
    }
    // Fall back to stored status
    switch (fallbackStatus) {
      case 'online': return 'bg-green-500';
      case 'idle': return 'bg-yellow-500';
      case 'dnd': return 'bg-red-500';
      default: return 'bg-gray-500';
    }
  };

  const getRoleBadge = (role?: string) => {
    if (!role || role === 'member') return null;
    const colors: Record<string, string> = {
      owner: 'bg-yellow-500/20 text-yellow-300',
      admin: 'bg-blue-500/20 text-blue-300',
      guest: 'bg-gray-500/20 text-gray-300',
    };
    return (
      <span className={`text-xs px-1.5 py-0.5 rounded ${colors[role] || 'bg-gray-500/20 text-gray-300'}`}>
        {role}
      </span>
    );
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-[#313338] rounded-lg shadow-xl w-full max-w-md max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <div className="flex items-center gap-2">
            <Hash className="w-5 h-5 text-gray-400" />
            <h2 className="text-xl font-semibold">Channel Settings</h2>
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
            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors ${
              activeTab === 'about'
                ? 'text-white border-b-2 border-blue-500'
                : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            <Settings className="w-4 h-4" />
            About
          </button>
          <button
            onClick={() => setActiveTab('members')}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors ${
              activeTab === 'members'
                ? 'text-white border-b-2 border-blue-500'
                : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            <Users className="w-4 h-4" />
            Members
            {members.length > 0 && (
              <span className="text-xs bg-gray-600 px-1.5 py-0.5 rounded-full">
                {members.length}
              </span>
            )}
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {activeTab === 'about' ? (
            <div className="p-4 space-y-4">
              {/* Channel Name */}
              <div>
                <label className="block text-xs font-semibold text-gray-400 uppercase mb-2">
                  Channel Name
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value.toLowerCase().replace(/\s+/g, '-'))}
                  className="w-full px-4 py-2 bg-[#1E1F22] rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-semibold text-gray-400 uppercase mb-2">
                  Description
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="What's this channel about?"
                  rows={3}
                  className="w-full px-4 py-2 bg-[#1E1F22] rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
              </div>

              {/* Error */}
              {error && (
                <p className="text-red-400 text-sm">{error}</p>
              )}

              {/* Danger Zone */}
              <div className="pt-4 border-t border-gray-700">
                <h3 className="text-xs font-semibold text-red-400 uppercase mb-3">Danger Zone</h3>
                
                {showDeleteConfirm ? (
                  <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4">
                    <p className="text-sm text-red-400 mb-3">
                      Are you sure you want to archive <strong>#{channel.name}</strong>? 
                      Messages will be preserved but the channel will be hidden.
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setShowDeleteConfirm(false)}
                        className="px-3 py-1.5 text-sm text-gray-300 hover:text-white transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleDelete}
                        disabled={deleting}
                        className="px-3 py-1.5 text-sm bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50 transition-colors"
                      >
                        {deleting ? 'Archiving...' : 'Yes, Archive Channel'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowDeleteConfirm(true)}
                    className="flex items-center gap-2 px-3 py-2 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg transition-colors"
                  >
                    <Archive className="w-4 h-4" />
                    <span>Archive Channel</span>
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="p-4">
              {loadingMembers ? (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin rounded-full h-6 w-6 border-2 border-gray-500 border-t-white" />
                </div>
              ) : (
                <div className="space-y-1">
                  <p className="text-xs text-gray-400 uppercase font-semibold mb-3">
                    {channelType === 'dm' ? 'Participants' : 'Channel Members'} — {members.length}
                  </p>
                  {members.map((member) => (
                    <div
                      key={member.id}
                      className="flex items-center gap-3 p-2 rounded-lg hover:bg-[#404249] transition-colors"
                    >
                      {/* Avatar */}
                      <div className="relative">
                        {member.avatar ? (
                          <img
                            src={member.avatar}
                            alt={member.displayName}
                            className="w-8 h-8 rounded-full object-cover"
                          />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-[#5865f2] flex items-center justify-center">
                            {member.isAgent ? (
                              <Bot className="w-4 h-4 text-white" />
                            ) : (
                              <UserIcon className="w-4 h-4 text-white" />
                            )}
                          </div>
                        )}
                        {/* Status indicator */}
                        <div className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-[#313338] ${getStatusColor(member.id, member.status)}`} />
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium truncate">{member.displayName}</span>
                          {member.isAgent && (
                            <span className="text-xs bg-blue-500/20 text-blue-300 px-1.5 py-0.5 rounded">
                              Bot
                            </span>
                          )}
                          {getRoleBadge(member.role)}
                        </div>
                        <p className="text-xs text-gray-400 truncate">@{member.username}</p>
                        {/* Channel memberships */}
                        {member.channels && member.channels.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {member.channels
                              .filter((ch) => ch.slug !== 'dm')
                              .slice(0, 5)
                              .map((ch) => (
                                <span
                                  key={ch.id}
                                  className="text-xs bg-gray-700 text-gray-300 px-1.5 py-0.5 rounded"
                                >
                                  #{ch.name}
                                </span>
                              ))}
                            {member.channels.filter((ch) => ch.slug !== 'dm').length > 5 && (
                              <span className="text-xs text-gray-500">
                                +{member.channels.filter((ch) => ch.slug !== 'dm').length - 5} more
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer - only show for About tab */}
        {activeTab === 'about' && (
          <div className="flex justify-end gap-2 p-4 border-t border-gray-700">
            <button
              onClick={onClose}
              className="px-4 py-2 text-gray-300 hover:text-white transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving || !name.trim()}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
