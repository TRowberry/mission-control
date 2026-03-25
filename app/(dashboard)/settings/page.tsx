'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Camera, User, Lock, Bell, Shield, Trash2, Check, X, Loader2 } from 'lucide-react';

interface UserProfile {
  id: string;
  email: string;
  username: string;
  displayName: string;
  avatar: string | null;
  status: string;
  isAgent: boolean;
  createdAt: string;
  role?: string;
}

type TabId = 'profile' | 'security' | 'preferences';

export default function SettingsPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [activeTab, setActiveTab] = useState<TabId>('profile');
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Profile form state
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);

  // Password form state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // Preferences state
  const [status, setStatus] = useState('online');
  const [notificationSound, setNotificationSound] = useState(true);
  const [desktopNotifications, setDesktopNotifications] = useState(true);

  useEffect(() => {
    fetchProfile();
  }, []);

  async function fetchProfile() {
    try {
      const res = await fetch('/api/user/profile');
      if (!res.ok) {
        if (res.status === 401) {
          router.push('/login');
          return;
        }
        throw new Error('Failed to fetch profile');
      }
      const data = await res.json();
      setUser(data);
      setDisplayName(data.displayName);
      setUsername(data.username);
      setEmail(data.email);
      setStatus(data.status || 'online');
      setAvatarPreview(data.avatar);
    } catch (err) {
      console.error('Error fetching profile:', err);
      showMessage('error', 'Failed to load profile');
    } finally {
      setLoading(false);
    }
  }

  function showMessage(type: 'success' | 'error', text: string) {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 5000);
  }

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate
    if (!file.type.startsWith('image/')) {
      showMessage('error', 'Please select an image file');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      showMessage('error', 'Image must be under 5MB');
      return;
    }

    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
  }

  async function handleProfileSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);

    try {
      let avatarUrl = user?.avatar;

      // Upload avatar if changed
      if (avatarFile) {
        const formData = new FormData();
        formData.append('file', avatarFile);
        const uploadRes = await fetch('/api/upload', {
          method: 'POST',
          body: formData,
        });
        if (!uploadRes.ok) throw new Error('Avatar upload failed');
        const uploadData = await uploadRes.json();
        avatarUrl = uploadData.url;
      }

      // Update profile
      const res = await fetch('/api/user/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          displayName,
          username,
          email,
          avatar: avatarUrl,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to update profile');
      }

      const updated = await res.json();
      setUser(updated);
      setAvatarFile(null);
      showMessage('success', 'Profile updated successfully');
    } catch (err) {
      showMessage('error', err instanceof Error ? err.message : 'Failed to update profile');
    } finally {
      setSaving(false);
    }
  }

  async function handlePasswordSubmit(e: React.FormEvent) {
    e.preventDefault();
    
    if (newPassword !== confirmPassword) {
      showMessage('error', 'Passwords do not match');
      return;
    }
    if (newPassword.length < 8) {
      showMessage('error', 'Password must be at least 8 characters');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch('/api/user/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentPassword,
          newPassword,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to change password');
      }

      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      showMessage('success', 'Password changed successfully');
    } catch (err) {
      showMessage('error', err instanceof Error ? err.message : 'Failed to change password');
    } finally {
      setSaving(false);
    }
  }

  async function handleStatusChange(newStatus: string) {
    setStatus(newStatus);
    try {
      await fetch('/api/user/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      // Refresh to update sidebar status indicator
      router.refresh();
    } catch (err) {
      console.error('Failed to update status:', err);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    );
  }

  const tabs = [
    { id: 'profile' as TabId, label: 'Profile', icon: User },
    { id: 'security' as TabId, label: 'Security', icon: Lock },
    { id: 'preferences' as TabId, label: 'Preferences', icon: Bell },
  ];

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-2xl font-bold text-white mb-6">User Settings</h1>

      {/* Message Toast */}
      {message && (
        <div
          className={`mb-4 p-4 rounded-lg flex items-center gap-2 ${
            message.type === 'success'
              ? 'bg-green-500/20 text-green-400 border border-green-500/30'
              : 'bg-red-500/20 text-red-400 border border-red-500/30'
          }`}
        >
          {message.type === 'success' ? (
            <Check className="w-5 h-5" />
          ) : (
            <X className="w-5 h-5" />
          )}
          {message.text}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-gray-800/50 p-1 rounded-lg w-fit">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-md transition-colors ${
              activeTab === tab.id
                ? 'bg-indigo-600 text-white'
                : 'text-gray-400 hover:text-white hover:bg-gray-700/50'
            }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Profile Tab */}
      {activeTab === 'profile' && (
        <form onSubmit={handleProfileSubmit} className="space-y-6">
          <div className="bg-gray-800/50 rounded-lg p-6 border border-gray-700/50">
            <h2 className="text-lg font-semibold text-white mb-4">Profile Information</h2>
            
            {/* Avatar */}
            <div className="flex items-center gap-6 mb-6">
              <div className="relative">
                <div className="w-24 h-24 rounded-full bg-gray-700 overflow-hidden">
                  {avatarPreview ? (
                    <img
                      src={avatarPreview}
                      alt="Avatar"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-3xl text-gray-400">
                      {displayName?.[0]?.toUpperCase() || '?'}
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="absolute bottom-0 right-0 p-2 bg-indigo-600 rounded-full hover:bg-indigo-700 transition-colors"
                >
                  <Camera className="w-4 h-4 text-white" />
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleAvatarChange}
                  className="hidden"
                />
              </div>
              <div>
                <p className="text-sm text-gray-400">Click the camera icon to upload a new avatar</p>
                <p className="text-xs text-gray-500 mt-1">JPG, PNG or GIF. Max 5MB.</p>
              </div>
            </div>

            {/* Display Name */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Display Name
              </label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="w-full px-4 py-2 bg-gray-900/50 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500"
                placeholder="Your display name"
              />
            </div>

            {/* Username */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Username
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full px-4 py-2 bg-gray-900/50 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500"
                placeholder="username"
              />
            </div>

            {/* Email */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-2 bg-gray-900/50 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500"
                placeholder="you@example.com"
              />
            </div>

            {/* Role Badge */}
            {user && (
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Role
                </label>
                <div className="flex items-center gap-2">
                  <span
                    className={`px-3 py-1 rounded-full text-sm font-medium ${
                      user.isAgent
                        ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30'
                        : 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                    }`}
                  >
                    {user.isAgent ? '🤖 Agent' : '👤 Member'}
                  </span>
                  <span className="text-xs text-gray-500">
                    Member since {new Date(user.createdAt).toLocaleDateString()}
                  </span>
                </div>
              </div>
            )}
          </div>

          <button
            type="submit"
            disabled={saving}
            className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            Save Changes
          </button>
        </form>
      )}

      {/* Security Tab */}
      {activeTab === 'security' && (
        <div className="space-y-6">
          <form onSubmit={handlePasswordSubmit} className="bg-gray-800/50 rounded-lg p-6 border border-gray-700/50">
            <h2 className="text-lg font-semibold text-white mb-4">Change Password</h2>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Current Password
              </label>
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="w-full px-4 py-2 bg-gray-900/50 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500"
                placeholder="••••••••"
              />
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-300 mb-2">
                New Password
              </label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full px-4 py-2 bg-gray-900/50 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500"
                placeholder="••••••••"
              />
              <p className="text-xs text-gray-500 mt-1">Minimum 8 characters</p>
            </div>

            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Confirm New Password
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full px-4 py-2 bg-gray-900/50 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500"
                placeholder="••••••••"
              />
            </div>

            <button
              type="submit"
              disabled={saving || !currentPassword || !newPassword || !confirmPassword}
              className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              Update Password
            </button>
          </form>

          {/* Active Sessions - placeholder for future */}
          <div className="bg-gray-800/50 rounded-lg p-6 border border-gray-700/50">
            <div className="flex items-center gap-2 mb-4">
              <Shield className="w-5 h-5 text-gray-400" />
              <h2 className="text-lg font-semibold text-white">Active Sessions</h2>
            </div>
            <p className="text-gray-400 text-sm">
              Session management coming soon. You&apos;ll be able to see all devices where you&apos;re logged in and log out remotely.
            </p>
          </div>
        </div>
      )}

      {/* Preferences Tab */}
      {activeTab === 'preferences' && (
        <div className="space-y-6">
          <div className="bg-gray-800/50 rounded-lg p-6 border border-gray-700/50">
            <h2 className="text-lg font-semibold text-white mb-4">Status</h2>
            <div className="flex flex-wrap gap-2">
              {[
                { value: 'online', label: '🟢 Online', color: 'green' },
                { value: 'idle', label: '🌙 Away', color: 'yellow' },
                { value: 'dnd', label: '⛔ Do Not Disturb', color: 'red' },
                { value: 'offline', label: '⚫ Invisible', color: 'gray' },
              ].map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => handleStatusChange(opt.value)}
                  className={`px-4 py-2 rounded-lg transition-colors ${
                    status === opt.value
                      ? 'bg-indigo-600 text-white'
                      : 'bg-gray-700/50 text-gray-300 hover:bg-gray-700'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="bg-gray-800/50 rounded-lg p-6 border border-gray-700/50">
            <h2 className="text-lg font-semibold text-white mb-4">Notifications</h2>
            
            <div className="space-y-4">
              <label className="flex items-center justify-between cursor-pointer">
                <div>
                  <p className="text-white">Notification Sounds</p>
                  <p className="text-sm text-gray-400">Play sounds for new messages</p>
                </div>
                <button
                  onClick={() => setNotificationSound(!notificationSound)}
                  className={`w-12 h-6 rounded-full transition-colors ${
                    notificationSound ? 'bg-indigo-600' : 'bg-gray-600'
                  }`}
                >
                  <div
                    className={`w-5 h-5 rounded-full bg-white shadow transform transition-transform ${
                      notificationSound ? 'translate-x-6' : 'translate-x-0.5'
                    }`}
                  />
                </button>
              </label>

              <label className="flex items-center justify-between cursor-pointer">
                <div>
                  <p className="text-white">Desktop Notifications</p>
                  <p className="text-sm text-gray-400">Show desktop notifications for mentions</p>
                </div>
                <button
                  onClick={() => setDesktopNotifications(!desktopNotifications)}
                  className={`w-12 h-6 rounded-full transition-colors ${
                    desktopNotifications ? 'bg-indigo-600' : 'bg-gray-600'
                  }`}
                >
                  <div
                    className={`w-5 h-5 rounded-full bg-white shadow transform transition-transform ${
                      desktopNotifications ? 'translate-x-6' : 'translate-x-0.5'
                    }`}
                  />
                </button>
              </label>
            </div>
          </div>

          {/* Danger Zone */}
          <div className="bg-red-500/10 rounded-lg p-6 border border-red-500/30">
            <div className="flex items-center gap-2 mb-4">
              <Trash2 className="w-5 h-5 text-red-400" />
              <h2 className="text-lg font-semibold text-red-400">Danger Zone</h2>
            </div>
            <p className="text-gray-400 text-sm mb-4">
              Once you delete your account, there is no going back. Please be certain.
            </p>
            <button
              className="px-4 py-2 bg-red-600/20 text-red-400 border border-red-500/30 rounded-lg hover:bg-red-600/30 transition-colors"
              onClick={() => {
                if (confirm('Are you sure you want to delete your account? This cannot be undone.')) {
                  // TODO: Implement account deletion
                  alert('Account deletion not yet implemented');
                }
              }}
            >
              Delete Account
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
