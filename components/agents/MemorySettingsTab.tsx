'use client';

import { useState, useEffect } from 'react';
import { Brain, Database, Users, GitBranch, AlertCircle, CheckCircle, Info } from 'lucide-react';
import { cn } from '@/lib/utils';

interface MemorySettings {
  enabled: boolean;
  categories: string[];
  decayRate: number;
  minImportance: number;
  injectionCount: number;
  retentionDays: number;
}

interface MemoryStats {
  totalMemories: number;
  totalEntities: number;
  totalRelationships: number;
}

interface MemorySettingsTabProps {
  agentId: string;
  agentName: string;
}

const CATEGORY_INFO: Record<string, { label: string; description: string; icon: typeof Brain }> = {
  facts: {
    label: 'Facts',
    description: 'General knowledge and information',
    icon: Database,
  },
  preferences: {
    label: 'Preferences',
    description: 'User preferences and settings',
    icon: Brain,
  },
  relationships: {
    label: 'Relationships',
    description: 'Connections between people and entities',
    icon: Users,
  },
  events: {
    label: 'Events',
    description: 'Past events and interactions',
    icon: GitBranch,
  },
};

export default function MemorySettingsTab({ agentId, agentName }: MemorySettingsTabProps) {
  const [settings, setSettings] = useState<MemorySettings | null>(null);
  const [stats, setStats] = useState<MemoryStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Fetch settings on mount
  useEffect(() => {
    fetchSettings();
  }, [agentId]);

  async function fetchSettings() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/agents/${agentId}/memory-settings`);
      if (res.ok) {
        const data = await res.json();
        setSettings(data.settings);
        setStats(data.stats);
      } else {
        const data = await res.json();
        setError(data.error || 'Failed to load settings');
      }
    } catch (err) {
      setError('Failed to load settings');
    } finally {
      setLoading(false);
    }
  }

  async function saveSettings(updates: Partial<MemorySettings>) {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(`/api/agents/${agentId}/memory-settings`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (res.ok) {
        const data = await res.json();
        setSettings(data.settings);
        setSuccess('Settings saved');
        setTimeout(() => setSuccess(null), 3000);
      } else {
        const data = await res.json();
        setError(data.error || 'Failed to save settings');
      }
    } catch (err) {
      setError('Failed to save settings');
    } finally {
      setSaving(false);
    }
  }

  function handleToggleEnabled() {
    if (!settings) return;
    saveSettings({ enabled: !settings.enabled });
  }

  function handleCategoryToggle(category: string) {
    if (!settings) return;
    const newCategories = settings.categories.includes(category)
      ? settings.categories.filter(c => c !== category)
      : [...settings.categories, category];
    saveSettings({ categories: newCategories });
  }

  function handleSliderChange(field: keyof MemorySettings, value: number) {
    if (!settings) return;
    setSettings({ ...settings, [field]: value });
  }

  function handleSliderCommit(field: keyof MemorySettings, value: number) {
    saveSettings({ [field]: value });
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!settings) {
    return (
      <div className="flex items-center justify-center h-48 text-muted">
        Failed to load memory settings
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Status Messages */}
      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-500/10 text-red-400 rounded-lg">
          <AlertCircle className="w-4 h-4" />
          {error}
        </div>
      )}
      {success && (
        <div className="flex items-center gap-2 p-3 bg-green-500/10 text-green-400 rounded-lg">
          <CheckCircle className="w-4 h-4" />
          {success}
        </div>
      )}

      {/* Enable/Disable Toggle */}
      <div className="flex items-center justify-between p-4 bg-surface rounded-lg border border-border">
        <div className="flex items-center gap-3">
          <Brain className="w-5 h-5 text-primary" />
          <div>
            <div className="font-medium">Extended Memory</div>
            <div className="text-sm text-muted">
              Enable semantic memory for {agentName}
            </div>
          </div>
        </div>
        <button
          onClick={handleToggleEnabled}
          disabled={saving}
          className={cn(
            'relative inline-flex h-6 w-11 items-center rounded-full transition-colors',
            settings.enabled ? 'bg-primary' : 'bg-gray-600'
          )}
        >
          <span
            className={cn(
              'inline-block h-4 w-4 transform rounded-full bg-white transition-transform',
              settings.enabled ? 'translate-x-6' : 'translate-x-1'
            )}
          />
        </button>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-3 gap-3">
          <div className="p-3 bg-surface rounded-lg border border-border text-center">
            <div className="text-2xl font-bold text-primary">{stats.totalMemories}</div>
            <div className="text-xs text-muted">Memories</div>
          </div>
          <div className="p-3 bg-surface rounded-lg border border-border text-center">
            <div className="text-2xl font-bold text-primary">{stats.totalEntities}</div>
            <div className="text-xs text-muted">Entities</div>
          </div>
          <div className="p-3 bg-surface rounded-lg border border-border text-center">
            <div className="text-2xl font-bold text-primary">{stats.totalRelationships}</div>
            <div className="text-xs text-muted">Relationships</div>
          </div>
        </div>
      )}

      {/* Categories */}
      <div className="space-y-3">
        <div className="text-sm font-medium text-muted uppercase tracking-wider">
          Memory Categories
        </div>
        <div className="grid grid-cols-2 gap-2">
          {Object.entries(CATEGORY_INFO).map(([key, info]) => {
            const Icon = info.icon;
            const isActive = settings.categories.includes(key);
            return (
              <button
                key={key}
                onClick={() => handleCategoryToggle(key)}
                disabled={saving || !settings.enabled}
                className={cn(
                  'flex items-center gap-2 p-3 rounded-lg border transition-all text-left',
                  isActive
                    ? 'bg-primary/10 border-primary text-primary'
                    : 'bg-surface border-border text-muted hover:border-gray-500',
                  (!settings.enabled || saving) && 'opacity-50 cursor-not-allowed'
                )}
              >
                <Icon className="w-4 h-4" />
                <div>
                  <div className="text-sm font-medium">{info.label}</div>
                  <div className="text-xs opacity-70">{info.description}</div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Advanced Settings */}
      <div className="space-y-4">
        <div className="text-sm font-medium text-muted uppercase tracking-wider">
          Advanced Settings
        </div>

        {/* Injection Count */}
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span>Memories per turn</span>
            <span className="text-primary">{settings.injectionCount}</span>
          </div>
          <input
            type="range"
            min="0"
            max="20"
            value={settings.injectionCount}
            onChange={(e) => handleSliderChange('injectionCount', parseInt(e.target.value))}
            onMouseUp={(e) => handleSliderCommit('injectionCount', settings.injectionCount)}
            onTouchEnd={(e) => handleSliderCommit('injectionCount', settings.injectionCount)}
            disabled={!settings.enabled || saving}
            className="w-full accent-primary disabled:opacity-50"
          />
          <div className="flex justify-between text-xs text-muted">
            <span>None</span>
            <span>20</span>
          </div>
        </div>

        {/* Decay Rate */}
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span>Decay rate (per day)</span>
            <span className="text-primary">{(settings.decayRate * 100).toFixed(0)}%</span>
          </div>
          <input
            type="range"
            min="0"
            max="50"
            value={settings.decayRate * 100}
            onChange={(e) => handleSliderChange('decayRate', parseInt(e.target.value) / 100)}
            onMouseUp={(e) => handleSliderCommit('decayRate', settings.decayRate)}
            onTouchEnd={(e) => handleSliderCommit('decayRate', settings.decayRate)}
            disabled={!settings.enabled || saving}
            className="w-full accent-primary disabled:opacity-50"
          />
          <div className="flex justify-between text-xs text-muted">
            <span>No decay</span>
            <span>Fast decay</span>
          </div>
        </div>

        {/* Min Importance */}
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span>Minimum importance</span>
            <span className="text-primary">{(settings.minImportance * 100).toFixed(0)}%</span>
          </div>
          <input
            type="range"
            min="0"
            max="100"
            value={settings.minImportance * 100}
            onChange={(e) => handleSliderChange('minImportance', parseInt(e.target.value) / 100)}
            onMouseUp={(e) => handleSliderCommit('minImportance', settings.minImportance)}
            onTouchEnd={(e) => handleSliderCommit('minImportance', settings.minImportance)}
            disabled={!settings.enabled || saving}
            className="w-full accent-primary disabled:opacity-50"
          />
          <div className="flex justify-between text-xs text-muted">
            <span>Keep all</span>
            <span>Only important</span>
          </div>
        </div>

        {/* Retention Days */}
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span>Retention period</span>
            <span className="text-primary">{settings.retentionDays} days</span>
          </div>
          <input
            type="range"
            min="7"
            max="365"
            step="7"
            value={settings.retentionDays}
            onChange={(e) => handleSliderChange('retentionDays', parseInt(e.target.value))}
            onMouseUp={(e) => handleSliderCommit('retentionDays', settings.retentionDays)}
            onTouchEnd={(e) => handleSliderCommit('retentionDays', settings.retentionDays)}
            disabled={!settings.enabled || saving}
            className="w-full accent-primary disabled:opacity-50"
          />
          <div className="flex justify-between text-xs text-muted">
            <span>1 week</span>
            <span>1 year</span>
          </div>
        </div>
      </div>

      {/* Info */}
      <div className="flex items-start gap-2 p-3 bg-blue-500/10 text-blue-300 rounded-lg text-sm">
        <Info className="w-4 h-4 mt-0.5 flex-shrink-0" />
        <div>
          Extended memory allows the agent to remember facts, preferences, and context across
          conversations. Memories are automatically recalled based on relevance to the current
          conversation.
        </div>
      </div>
    </div>
  );
}
