'use client';

import { useState } from 'react';
import { X, Hash, Volume2, Megaphone } from 'lucide-react';

interface Channel {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  type: string;
}

interface CreateChannelModalProps {
  onClose: () => void;
  onCreate: (channel: Channel) => void;
}

const channelTypes = [
  { id: 'text', name: 'Text', icon: Hash, description: 'Send messages, images, and files' },
  { id: 'voice', name: 'Voice', icon: Volume2, description: 'Voice chat with your team' },
  { id: 'announcement', name: 'Announcement', icon: Megaphone, description: 'Important updates (admins only)' },
];

export default function CreateChannelModal({ onClose, onCreate }: CreateChannelModalProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState('text');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!name.trim()) {
      setError('Channel name is required');
      return;
    }

    setCreating(true);
    setError('');

    try {
      const res = await fetch('/api/channels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), description: description.trim(), type }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to create channel');
      }

      const channel = await res.json();
      onCreate(channel);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create channel');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-[#313338] rounded-lg shadow-xl w-full max-w-md">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <h2 className="text-xl font-semibold">Create Channel</h2>
          <button
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-gray-200 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {/* Channel Type */}
          <div>
            <label className="block text-xs font-semibold text-gray-400 uppercase mb-2">
              Channel Type
            </label>
            <div className="space-y-2">
              {channelTypes.map((ct) => (
                <label
                  key={ct.id}
                  className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors ${
                    type === ct.id
                      ? 'bg-[#404249] ring-2 ring-blue-500'
                      : 'bg-[#2B2D31] hover:bg-[#404249]'
                  }`}
                >
                  <input
                    type="radio"
                    name="type"
                    value={ct.id}
                    checked={type === ct.id}
                    onChange={(e) => setType(e.target.value)}
                    className="sr-only"
                  />
                  <ct.icon className="w-5 h-5 text-gray-400" />
                  <div>
                    <p className="font-medium">{ct.name}</p>
                    <p className="text-xs text-gray-400">{ct.description}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Channel Name */}
          <div>
            <label className="block text-xs font-semibold text-gray-400 uppercase mb-2">
              Channel Name
            </label>
            <div className="relative">
              <Hash className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value.toLowerCase().replace(/\s+/g, '-'))}
                placeholder="new-channel"
                className="w-full pl-9 pr-4 py-2 bg-[#1E1F22] rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                autoFocus
              />
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-semibold text-gray-400 uppercase mb-2">
              Description <span className="text-gray-500 font-normal">(optional)</span>
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What's this channel about?"
              rows={2}
              className="w-full px-4 py-2 bg-[#1E1F22] rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>

          {/* Error */}
          {error && (
            <p className="text-red-400 text-sm">{error}</p>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-300 hover:text-white transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={creating || !name.trim()}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {creating ? 'Creating...' : 'Create Channel'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
