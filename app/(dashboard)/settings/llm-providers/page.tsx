'use client';

import { useState, useEffect } from 'react';
import {
  Server,
  Plus,
  Check,
  X,
  AlertCircle,
  Loader2,
  RefreshCw,
  Trash2,
  Edit,
  Zap,
  Star,
  TestTube2,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface LLMProvider {
  id: string;
  name: string;
  displayName: string;
  endpoint: string | null;
  apiKey: string | null;
  orgId: string | null;
  isDefault: boolean;
  isEnabled: boolean;
  models: string[];
  costPerInputToken: number | null;
  costPerOutputToken: number | null;
  lastHealthCheck: string | null;
  isHealthy: boolean;
  healthMessage: string | null;
}

const PROVIDER_TEMPLATES = [
  { name: 'ollama', displayName: 'Ollama', icon: '🦙', defaultEndpoint: 'http://localhost:11434' },
  { name: 'openai', displayName: 'OpenAI', icon: '🤖', defaultEndpoint: null },
  { name: 'anthropic', displayName: 'Anthropic', icon: '🧠', defaultEndpoint: null },
  { name: 'openclaw', displayName: 'OpenClaw Gateway', icon: '🦞', defaultEndpoint: null },
];

export default function LLMProvidersPage() {
  const [providers, setProviders] = useState<LLMProvider[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [editingProvider, setEditingProvider] = useState<LLMProvider | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);

  useEffect(() => {
    fetchProviders();
  }, []);

  async function fetchProviders() {
    setLoading(true);
    try {
      const res = await fetch('/api/llm-providers');
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      setProviders(data.providers || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }

  async function handleTest(provider: LLMProvider) {
    setTestingId(provider.id);
    try {
      const res = await fetch(`/api/llm-providers/${provider.id}/test`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setProviders(prev => prev.map(p => 
          p.id === provider.id 
            ? { ...p, isHealthy: true, healthMessage: data.message, models: data.models || p.models }
            : p
        ));
      } else {
        setProviders(prev => prev.map(p =>
          p.id === provider.id
            ? { ...p, isHealthy: false, healthMessage: data.message }
            : p
        ));
      }
    } catch (err) {
      setProviders(prev => prev.map(p =>
        p.id === provider.id
          ? { ...p, isHealthy: false, healthMessage: 'Test failed' }
          : p
      ));
    } finally {
      setTestingId(null);
    }
  }

  async function handleDelete(provider: LLMProvider) {
    if (!confirm(`Delete ${provider.displayName}?`)) return;
    try {
      const res = await fetch(`/api/llm-providers/${provider.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete');
      setProviders(prev => prev.filter(p => p.id !== provider.id));
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Delete failed');
    }
  }

  async function handleSetDefault(provider: LLMProvider) {
    try {
      const res = await fetch(`/api/llm-providers/${provider.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isDefault: true }),
      });
      if (!res.ok) throw new Error('Failed to update');
      setProviders(prev => prev.map(p => ({
        ...p,
        isDefault: p.id === provider.id,
      })));
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Update failed');
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-white">LLM Providers</h1>
          <p className="text-gray-400 text-sm mt-1">
            Configure AI model providers for your agents
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchProviders}
            className="p-2 text-gray-400 hover:text-white hover:bg-gray-700/50 rounded-lg"
          >
            <RefreshCw className="w-5 h-5" />
          </button>
          <button
            onClick={() => { setEditingProvider(null); setShowModal(true); }}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
          >
            <Plus className="w-4 h-4" />
            Add Provider
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 mb-6">
          <p className="text-red-400">{error}</p>
        </div>
      )}

      {/* Provider Cards */}
      <div className="space-y-4">
        {providers.length === 0 ? (
          <div className="bg-gray-800/50 border border-gray-700/50 rounded-lg p-12 text-center">
            <Server className="w-16 h-16 text-gray-600 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-white mb-2">No providers configured</h3>
            <p className="text-gray-400 mb-6">
              Add an LLM provider to enable AI capabilities for your agents.
            </p>
            <button
              onClick={() => setShowModal(true)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
            >
              <Plus className="w-4 h-4" />
              Add Your First Provider
            </button>
          </div>
        ) : (
          providers.map(provider => {
            const template = PROVIDER_TEMPLATES.find(t => t.name === provider.name);
            return (
              <div
                key={provider.id}
                className={cn(
                  "bg-gray-800/50 border rounded-lg p-4",
                  provider.isEnabled ? "border-gray-700/50" : "border-gray-700/30 opacity-60"
                )}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    <div className="text-2xl">{template?.icon || '🔌'}</div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-medium text-white">{provider.displayName}</h3>
                        {provider.isDefault && (
                          <span className="flex items-center gap-1 text-xs bg-yellow-500/20 text-yellow-400 px-2 py-0.5 rounded">
                            <Star className="w-3 h-3" /> Default
                          </span>
                        )}
                        {!provider.isEnabled && (
                          <span className="text-xs bg-gray-500/20 text-gray-400 px-2 py-0.5 rounded">
                            Disabled
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-400 mt-1">
                        {provider.endpoint || 'API configured'}
                      </p>
                      {provider.models.length > 0 && (
                        <p className="text-xs text-gray-500 mt-1">
                          Models: {provider.models.slice(0, 5).join(', ')}
                          {provider.models.length > 5 && ` +${provider.models.length - 5} more`}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {/* Health Status */}
                    <div className={cn(
                      "flex items-center gap-1.5 px-2 py-1 rounded text-xs",
                      provider.isHealthy ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"
                    )}>
                      {provider.isHealthy ? <Check className="w-3 h-3" /> : <AlertCircle className="w-3 h-3" />}
                      {provider.isHealthy ? 'Healthy' : 'Error'}
                    </div>

                    {/* Actions */}
                    <button
                      onClick={() => handleTest(provider)}
                      disabled={testingId === provider.id}
                      className="p-2 text-gray-400 hover:text-white hover:bg-gray-700/50 rounded-lg"
                      title="Test connection"
                    >
                      {testingId === provider.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <TestTube2 className="w-4 h-4" />
                      )}
                    </button>
                    {!provider.isDefault && (
                      <button
                        onClick={() => handleSetDefault(provider)}
                        className="p-2 text-gray-400 hover:text-yellow-400 hover:bg-gray-700/50 rounded-lg"
                        title="Set as default"
                      >
                        <Star className="w-4 h-4" />
                      </button>
                    )}
                    <button
                      onClick={() => { setEditingProvider(provider); setShowModal(true); }}
                      className="p-2 text-gray-400 hover:text-white hover:bg-gray-700/50 rounded-lg"
                    >
                      <Edit className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(provider)}
                      className="p-2 text-gray-400 hover:text-red-400 hover:bg-gray-700/50 rounded-lg"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {provider.healthMessage && !provider.isHealthy && (
                  <div className="mt-3 text-sm text-red-400 bg-red-500/10 rounded p-2">
                    {provider.healthMessage}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <ProviderModal
          provider={editingProvider}
          onClose={() => { setShowModal(false); setEditingProvider(null); }}
          onSave={() => { setShowModal(false); setEditingProvider(null); fetchProviders(); }}
        />
      )}
    </div>
  );
}

interface ProviderModalProps {
  provider: LLMProvider | null;
  onClose: () => void;
  onSave: () => void;
}

function ProviderModal({ provider, onClose, onSave }: ProviderModalProps) {
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    name: provider?.name || 'ollama',
    displayName: provider?.displayName || '',
    endpoint: provider?.endpoint || '',
    apiKey: '',
    orgId: provider?.orgId || '',
    isDefault: provider?.isDefault || false,
    isEnabled: provider?.isEnabled ?? true,
  });

  const isEditing = !!provider;
  const template = PROVIDER_TEMPLATES.find(t => t.name === form.name);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    try {
      const url = isEditing ? `/api/llm-providers/${provider.id}` : '/api/llm-providers';
      const method = isEditing ? 'PATCH' : 'POST';
      
      const body: Record<string, unknown> = {
        ...form,
        displayName: form.displayName || template?.displayName || form.name,
      };
      
      // Only include apiKey if it was changed
      if (!form.apiKey && isEditing) {
        delete body.apiKey;
      }

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Save failed');
      }

      onSave();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-[#313338] rounded-lg shadow-xl w-full max-w-lg">
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <h2 className="text-lg font-semibold text-white">
            {isEditing ? 'Edit Provider' : 'Add LLM Provider'}
          </h2>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {/* Provider Type */}
          {!isEditing && (
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Provider Type</label>
              <div className="grid grid-cols-2 gap-2">
                {PROVIDER_TEMPLATES.map(t => (
                  <button
                    key={t.name}
                    type="button"
                    onClick={() => setForm({ ...form, name: t.name, displayName: t.displayName, endpoint: t.defaultEndpoint || '' })}
                    className={cn(
                      "flex items-center gap-2 p-3 rounded-lg border text-left",
                      form.name === t.name
                        ? "border-indigo-500 bg-indigo-500/20"
                        : "border-gray-700 bg-gray-800/50 hover:border-gray-600"
                    )}
                  >
                    <span className="text-xl">{t.icon}</span>
                    <span className="text-white">{t.displayName}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Display Name */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Display Name</label>
            <input
              type="text"
              value={form.displayName}
              onChange={e => setForm({ ...form, displayName: e.target.value })}
              placeholder={template?.displayName}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:border-indigo-500 focus:outline-none"
            />
          </div>

          {/* Endpoint (for Ollama/OpenClaw) */}
          {(form.name === 'ollama' || form.name === 'openclaw') && (
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Endpoint URL</label>
              <input
                type="url"
                value={form.endpoint}
                onChange={e => setForm({ ...form, endpoint: e.target.value })}
                placeholder={template?.defaultEndpoint || 'https://...'}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:border-indigo-500 focus:outline-none"
              />
            </div>
          )}

          {/* API Key (for OpenAI/Anthropic/OpenClaw) */}
          {form.name !== 'ollama' && (
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                API Key {isEditing && <span className="text-gray-500">(leave blank to keep existing)</span>}
              </label>
              <input
                type="password"
                value={form.apiKey}
                onChange={e => setForm({ ...form, apiKey: e.target.value })}
                placeholder={isEditing ? '••••••••' : 'sk-...'}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:border-indigo-500 focus:outline-none"
              />
            </div>
          )}

          {/* Org ID (OpenAI only) */}
          {form.name === 'openai' && (
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Organization ID (optional)</label>
              <input
                type="text"
                value={form.orgId}
                onChange={e => setForm({ ...form, orgId: e.target.value })}
                placeholder="org-..."
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:border-indigo-500 focus:outline-none"
              />
            </div>
          )}

          {/* Toggles */}
          <div className="flex items-center gap-6">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.isEnabled}
                onChange={e => setForm({ ...form, isEnabled: e.target.checked })}
                className="w-4 h-4 rounded border-gray-600 bg-gray-800 text-indigo-600 focus:ring-indigo-500"
              />
              <span className="text-gray-300">Enabled</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.isDefault}
                onChange={e => setForm({ ...form, isDefault: e.target.checked })}
                className="w-4 h-4 rounded border-gray-600 bg-gray-800 text-indigo-600 focus:ring-indigo-500"
              />
              <span className="text-gray-300">Set as default</span>
            </label>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-4 border-t border-gray-700">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-300 hover:text-white"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-2"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              {isEditing ? 'Save Changes' : 'Add Provider'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
