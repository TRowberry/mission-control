'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

interface LLMProvider {
  id: string;
  name: string;
  displayName: string;
  endpoint: string | null;
  apiKey: string | null;
  isDefault: boolean;
  isEnabled: boolean;
  models: string[];
  isHealthy: boolean;
  healthMessage: string | null;
}
import {
  X,
  Bot,
  Settings2,
  Brain,
  Shield,
  Gauge,
  Cpu,
  FolderOpen,
  Loader2,
  CheckCircle,
  AlertCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { ROLE_TEMPLATES, getTemplateById, getDefaultTemplate } from './RoleTemplates';

interface AgentConfig {
  id: string;
  role: string | null;
  systemPrompt: string | null;
  llmProvider: string;
  llmModel: string | null;
  llmEndpoint: string | null;
  triggerType: string;
  cronSchedule: string | null;
  scheduledTaskPrompt: string | null;
  scheduledCommand: string | null;
  canSendMessages: boolean;
  canEditTasks: boolean;
  canCreateTasks: boolean;
  canNotifyUsers: boolean;
  requireApprovalFor: string | null;
  actionsPerMinute: number;
  actionsPerHour: number;
  dailyTokenLimit: number | null;
  dailyCostLimit: number | null;
  dockerImage: string | null;
  memoryLimitMb: number;
  cpuLimit: number;
  timeoutSeconds: number;
}

interface ProjectAccess {
  projectId: string;
  role: string;
  project: { id: string; name: string; color: string };
}

interface Agent {
  id: string;
  username: string;
  displayName: string;
  avatar: string | null;
  status: string;
  email: string;
  webhookUrl: string | null;
  createdAt: string;
  agentConfig: AgentConfig | null;
  projectAccess: ProjectAccess[];
}

interface AgentModalProps {
  agent: Agent | null;
  onClose: () => void;
  onSave: () => void;
}

type TabId = 'basic' | 'llm' | 'behavior' | 'capabilities' | 'limits' | 'resources' | 'projects';

interface FormData {
  username: string;
  displayName: string;
  avatar: string;
  webhookUrl: string;
  role: string;
  systemPrompt: string;
  llmProvider: string;
  llmModel: string;
  llmEndpoint: string;
  triggerType: string;
  cronSchedule: string;
  scheduledTaskPrompt: string;
  scheduledCommand: string;
  canSendMessages: boolean;
  canEditTasks: boolean;
  canCreateTasks: boolean;
  canNotifyUsers: boolean;
  requireApprovalFor: string[];
  actionsPerMinute: number;
  actionsPerHour: number;
  dailyTokenLimit: number | null;
  dailyCostLimit: number | null;
  dockerImage: string;
  memoryLimitMb: number;
  cpuLimit: number;
  timeoutSeconds: number;
}

// Default action types that require approval
const DEFAULT_APPROVAL_ACTIONS = ['fetch', 'code', 'unknown'];
const ALL_ACTION_TYPES = [
  { key: 'message', label: 'Send Messages', desc: 'Posting messages to channels' },
  { key: 'create_task', label: 'Create Tasks', desc: 'Creating new kanban tasks' },
  { key: 'update_task', label: 'Update Tasks', desc: 'Modifying existing tasks' },
  { key: 'complete_task', label: 'Complete Tasks', desc: 'Marking tasks as done' },
  { key: 'fetch', label: 'HTTP Requests', desc: 'Making external API calls' },
  { key: 'code', label: 'Execute Code', desc: 'Running scripts or code' },
  { key: 'search', label: 'Web Search', desc: 'Searching the web' },
  { key: 'unknown', label: 'Unknown Actions', desc: 'Unrecognized action types' },
];

const tabs: { id: TabId; label: string; icon: typeof Bot }[] = [
  { id: 'basic', label: 'Basic Info', icon: Bot },
  { id: 'llm', label: 'LLM Config', icon: Brain },
  { id: 'behavior', label: 'Behavior', icon: Settings2 },
  { id: 'capabilities', label: 'Capabilities', icon: Shield },
  { id: 'limits', label: 'Rate Limits', icon: Gauge },
  { id: 'resources', label: 'Resources', icon: Cpu },
  { id: 'projects', label: 'Projects', icon: FolderOpen },
];

export default function AgentModal({ agent, onClose, onSave }: AgentModalProps) {
  const isEditing = !!agent;
  const [activeTab, setActiveTab] = useState<TabId>('basic');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [providers, setProviders] = useState<LLMProvider[]>([]);
  const [loadingProviders, setLoadingProviders] = useState(true);

  const defaultTemplate = getDefaultTemplate();
  const [formData, setFormData] = useState<FormData>({
    username: agent?.username || '',
    displayName: agent?.displayName || '',
    avatar: agent?.avatar || '',
    webhookUrl: agent?.webhookUrl || '',
    role: agent?.agentConfig?.role || '',
    systemPrompt: agent?.agentConfig?.systemPrompt || defaultTemplate.systemPrompt,
    llmProvider: agent?.agentConfig?.llmProvider || defaultTemplate.llmProvider,
    llmModel: agent?.agentConfig?.llmModel || defaultTemplate.llmModel,
    llmEndpoint: agent?.agentConfig?.llmEndpoint || '',
    triggerType: agent?.agentConfig?.triggerType || defaultTemplate.triggerType,
    cronSchedule: agent?.agentConfig?.cronSchedule || '',
    scheduledTaskPrompt: agent?.agentConfig?.scheduledTaskPrompt || '',
    scheduledCommand: agent?.agentConfig?.scheduledCommand || '',
    canSendMessages: agent?.agentConfig?.canSendMessages ?? defaultTemplate.canSendMessages,
    canEditTasks: agent?.agentConfig?.canEditTasks ?? defaultTemplate.canEditTasks,
    canCreateTasks: agent?.agentConfig?.canCreateTasks ?? defaultTemplate.canCreateTasks,
    canNotifyUsers: agent?.agentConfig?.canNotifyUsers ?? defaultTemplate.canNotifyUsers,
    requireApprovalFor: agent?.agentConfig?.requireApprovalFor 
      ? JSON.parse(agent.agentConfig.requireApprovalFor) 
      : DEFAULT_APPROVAL_ACTIONS,
    actionsPerMinute: agent?.agentConfig?.actionsPerMinute ?? defaultTemplate.actionsPerMinute,
    actionsPerHour: agent?.agentConfig?.actionsPerHour ?? defaultTemplate.actionsPerHour,
    dailyTokenLimit: agent?.agentConfig?.dailyTokenLimit ?? null,
    dailyCostLimit: agent?.agentConfig?.dailyCostLimit ?? null,
    dockerImage: agent?.agentConfig?.dockerImage || '',
    memoryLimitMb: agent?.agentConfig?.memoryLimitMb ?? defaultTemplate.memoryLimitMb,
    cpuLimit: agent?.agentConfig?.cpuLimit ?? defaultTemplate.cpuLimit,
    timeoutSeconds: agent?.agentConfig?.timeoutSeconds ?? defaultTemplate.timeoutSeconds,
  });

  const [selectedTemplate, setSelectedTemplate] = useState<string>(isEditing ? 'custom' : '');
  const [allProjects, setAllProjects] = useState<{ id: string; name: string; color: string }[]>([]);
  const [projectAccess, setProjectAccess] = useState<{ projectId: string; role: string }[]>(
    agent?.projectAccess?.map(p => ({ projectId: p.projectId, role: p.role })) || []
  );

  useEffect(() => {
    fetch('/api/kanban/projects')
      .then(res => res.json())
      .then(data => setAllProjects(data || []))
      .catch(() => {});
  }, []);

  function updateField<K extends keyof FormData>(key: K, value: FormData[K]) {
    setFormData(prev => ({ ...prev, [key]: value }));
  }

  // Fetch configured LLM providers
  useEffect(() => {
    async function fetchProviders() {
      try {
        const res = await fetch('/api/llm-providers', { credentials: 'include' });
        if (res.ok) {
          const data = await res.json();
          setProviders(data.providers || []);
        } else {
          console.error('Failed to fetch providers:', res.status);
        }
      } catch (err) {
        console.error('Failed to fetch LLM providers:', err);
      } finally {
        setLoadingProviders(false);
      }
    }
    fetchProviders();
  }, []);

  function applyTemplate(templateId: string) {
    setSelectedTemplate(templateId);
    const template = getTemplateById(templateId);
    if (!template || templateId === 'custom') return;
    setFormData(prev => ({
      ...prev,
      role: template.name,
      systemPrompt: template.systemPrompt,
      llmProvider: template.llmProvider,
      llmModel: template.llmModel,
      triggerType: template.triggerType,
      cronSchedule: template.cronSchedule || '',
      canSendMessages: template.canSendMessages,
      canEditTasks: template.canEditTasks,
      canCreateTasks: template.canCreateTasks,
      canNotifyUsers: template.canNotifyUsers,
      actionsPerMinute: template.actionsPerMinute,
      actionsPerHour: template.actionsPerHour,
      dailyTokenLimit: template.dailyTokenLimit ?? null,
      memoryLimitMb: template.memoryLimitMb,
      cpuLimit: template.cpuLimit,
      timeoutSeconds: template.timeoutSeconds,
    }));
  }

  async function handleSubmit() {
    setError(null);
    setSaving(true);
    try {
      if (!formData.username.trim()) throw new Error('Username is required');
      if (!formData.displayName.trim()) throw new Error('Display name is required');
      if (!/^[a-z0-9_-]+$/i.test(formData.username)) {
        throw new Error('Username can only contain letters, numbers, underscores, and hyphens');
      }

      const payload = {
        username: formData.username,
        displayName: formData.displayName,
        avatar: formData.avatar || null,
        webhookUrl: formData.webhookUrl || null,
        role: formData.role || null,
        systemPrompt: formData.systemPrompt || null,
        llmProvider: formData.llmProvider,
        llmModel: formData.llmModel || null,
        llmEndpoint: formData.llmEndpoint || null,
        triggerType: formData.triggerType,
        cronSchedule: formData.cronSchedule || null,
        scheduledTaskPrompt: formData.scheduledTaskPrompt || null,
        scheduledCommand: formData.scheduledCommand || null,
        canSendMessages: formData.canSendMessages,
        canEditTasks: formData.canEditTasks,
        canCreateTasks: formData.canCreateTasks,
        canNotifyUsers: formData.canNotifyUsers,
        requireApprovalFor: JSON.stringify(formData.requireApprovalFor),
        actionsPerMinute: formData.actionsPerMinute,
        actionsPerHour: formData.actionsPerHour,
        dailyTokenLimit: formData.dailyTokenLimit,
        dailyCostLimit: formData.dailyCostLimit,
        dockerImage: formData.dockerImage || null,
        memoryLimitMb: formData.memoryLimitMb,
        cpuLimit: formData.cpuLimit,
        timeoutSeconds: formData.timeoutSeconds,
      };

      const url = isEditing ? `/api/agents/${agent.id}` : '/api/agents';
      const method = isEditing ? 'PATCH' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to save agent');
      }

      const data = await res.json();
      if (!isEditing && projectAccess.length > 0) {
        for (const access of projectAccess) {
          await fetch(`/api/agents/${data.agent.id}/projects`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(access),
          });
        }
      }

      setSuccess(isEditing ? 'Agent updated!' : 'Agent created!');
      setTimeout(onSave, 1000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save agent');
    } finally {
      setSaving(false);
    }
  }

  function toggleProjectAccess(projectId: string, role: string) {
    setProjectAccess(prev => {
      const existing = prev.find(p => p.projectId === projectId);
      if (existing) return prev.filter(p => p.projectId !== projectId);
      return [...prev, { projectId, role }];
    });
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-[#313338] rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-indigo-600 flex items-center justify-center">
              <Bot className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">
                {isEditing ? 'Edit Agent' : 'Create Agent'}
              </h2>
              <p className="text-sm text-gray-400">
                {isEditing ? `Editing @${agent.username}` : 'Configure a new AI agent for your workspace'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-200 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Messages */}
        {error && (
          <div className="mx-4 mt-4 p-3 bg-red-500/20 border border-red-500/30 rounded-lg flex items-center gap-2 text-red-400">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />{error}
          </div>
        )}
        {success && (
          <div className="mx-4 mt-4 p-3 bg-green-500/20 border border-green-500/30 rounded-lg flex items-center gap-2 text-green-400">
            <CheckCircle className="w-4 h-4 flex-shrink-0" />{success}
          </div>
        )}

        {/* Tabs */}
        <div className="flex border-b border-gray-700 overflow-x-auto">
          {tabs.map(tab => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  'flex items-center gap-2 px-4 py-3 text-sm font-medium whitespace-nowrap transition-colors',
                  activeTab === tab.id
                    ? 'text-white border-b-2 border-indigo-500'
                    : 'text-gray-400 hover:text-gray-200'
                )}
              >
                <Icon className="w-4 h-4" />{tab.label}
              </button>
            );
          })}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {/* Basic Info Tab */}
          {activeTab === 'basic' && (
            <div className="space-y-6">
              {!isEditing && (
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Start from template</label>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    {ROLE_TEMPLATES.map(template => (
                      <button
                        key={template.id}
                        onClick={() => applyTemplate(template.id)}
                        className={cn(
                          'p-3 rounded-lg border text-left transition-colors',
                          selectedTemplate === template.id
                            ? 'border-indigo-500 bg-indigo-500/10'
                            : 'border-gray-700 hover:border-gray-600 bg-gray-800/50'
                        )}
                      >
                        <div className="text-xl mb-1">{template.icon}</div>
                        <div className="font-medium text-white text-sm">{template.name}</div>
                        <div className="text-xs text-gray-400 mt-1 line-clamp-2">{template.description}</div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Username *</label>
                  <div className="flex">
                    <span className="px-3 py-2 bg-gray-700 border border-r-0 border-gray-600 rounded-l-lg text-gray-400">@</span>
                    <input
                      type="text"
                      value={formData.username}
                      onChange={e => updateField('username', e.target.value.toLowerCase())}
                      className="flex-1 px-4 py-2 bg-gray-900/50 border border-gray-600 rounded-r-lg text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500"
                      placeholder="my-agent"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Display Name *</label>
                  <input
                    type="text"
                    value={formData.displayName}
                    onChange={e => updateField('displayName', e.target.value)}
                    className="w-full px-4 py-2 bg-gray-900/50 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500"
                    placeholder="My Agent"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Role</label>
                <input type="text" value={formData.role} onChange={e => updateField('role', e.target.value)}
                  className="w-full px-4 py-2 bg-gray-900/50 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500"
                  placeholder="Project Manager, QA Tester, etc." />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Avatar URL</label>
                <input type="text" value={formData.avatar} onChange={e => updateField('avatar', e.target.value)}
                  className="w-full px-4 py-2 bg-gray-900/50 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500"
                  placeholder="https://example.com/avatar.png" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Webhook URL</label>
                <input type="text" value={formData.webhookUrl} onChange={e => updateField('webhookUrl', e.target.value)}
                  className="w-full px-4 py-2 bg-gray-900/50 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500"
                  placeholder="https://example.com/webhook" />
                <p className="text-xs text-gray-500 mt-1">Optional: Receive notifications at this URL</p>
              </div>
            </div>
          )}

          {/* LLM Config Tab */}
          {activeTab === 'llm' && (() => {
            const selectedProvider = providers.find(p => p.name === formData.llmProvider);
            const hasModels = selectedProvider && selectedProvider.models.length > 0;
            const needsConfig = selectedProvider && !selectedProvider.isHealthy;
            const noProviders = !loadingProviders && providers.length === 0;

            return (
              <div className="space-y-6">
                {/* Provider Selection */}
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">LLM Provider</label>
                  {loadingProviders ? (
                    <div className="flex items-center gap-2 text-gray-400">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Loading providers...
                    </div>
                  ) : noProviders ? (
                    <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-4">
                      <p className="text-green-400 text-sm mb-2">No LLM providers configured yet.</p>
                      <Link href="/settings/llm-providers" className="text-indigo-400 hover:text-indigo-300 text-sm underline">
                        Configure providers in Settings →
                      </Link>
                    </div>
                  ) : (
                    <select
                      value={formData.llmProvider}
                      onChange={e => {
                        updateField('llmProvider', e.target.value);
                        const newProvider = providers.find(p => p.name === e.target.value);
                        if (newProvider?.models.length) {
                          updateField('llmModel', newProvider.models[0]);
                        }
                      }}
                      className="w-full px-4 py-2 bg-gray-900/50 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-indigo-500"
                    >
                      {providers.filter(p => p.isEnabled).map(p => (
                        <option key={p.id} value={p.name}>
                          {p.displayName} {p.isDefault ? '(default)' : ''} {!p.isHealthy ? '⚠️' : ''}
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                {/* Model Selection */}
                {selectedProvider && (
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">Model</label>
                    {hasModels ? (
                      <select
                        value={formData.llmModel}
                        onChange={e => updateField('llmModel', e.target.value)}
                        className="w-full px-4 py-2 bg-gray-900/50 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-indigo-500"
                      >
                        {selectedProvider.models.map(model => (
                          <option key={model} value={model}>{model}</option>
                        ))}
                      </select>
                    ) : (
                      <div>
                        <input
                          type="text"
                          value={formData.llmModel}
                          onChange={e => updateField('llmModel', e.target.value)}
                          className="w-full px-4 py-2 bg-gray-900/50 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500"
                          placeholder="Enter model name..."
                        />
                        <p className="text-xs text-gray-500 mt-1">
                          No models discovered. Test the provider in{' '}
                          <Link href="/settings/llm-providers" className="text-indigo-400 hover:underline">Settings</Link>
                          {' '}to discover available models.
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* Custom Endpoint Override */}
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Custom Endpoint (optional)</label>
                  <input
                    type="text"
                    value={formData.llmEndpoint}
                    onChange={e => updateField('llmEndpoint', e.target.value)}
                    className="w-full px-4 py-2 bg-gray-900/50 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500"
                    placeholder={selectedProvider?.endpoint || 'Use provider default'}
                  />
                  <p className="text-xs text-gray-500 mt-1">Override the default endpoint for this agent only</p>
                </div>

                {/* Provider Status */}
                {selectedProvider && (
                  <div className={cn(
                    "rounded-lg p-4",
                    selectedProvider.isHealthy ? "bg-green-500/10 border border-green-500/30" : "bg-red-500/10 border border-red-500/30"
                  )}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {selectedProvider.isHealthy ? (
                          <CheckCircle className="w-4 h-4 text-green-400" />
                        ) : (
                          <AlertCircle className="w-4 h-4 text-red-400" />
                        )}
                        <span className={selectedProvider.isHealthy ? "text-green-400" : "text-red-400"}>
                          {selectedProvider.isHealthy ? 'Provider healthy' : 'Provider needs configuration'}
                        </span>
                      </div>
                      <Link href="/settings/llm-providers" className="text-indigo-400 hover:text-indigo-300 text-sm">
                        Configure →
                      </Link>
                    </div>
                    {selectedProvider.healthMessage && (
                      <p className="text-sm text-gray-400 mt-2">{selectedProvider.healthMessage}</p>
                    )}
                    {selectedProvider.endpoint && (
                      <p className="text-sm text-gray-500 mt-1">Endpoint: {selectedProvider.endpoint}</p>
                    )}
                  </div>
                )}
              </div>
            );
          })()}

          {/* Behavior Tab */}
          {activeTab === 'behavior' && (
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">System Prompt</label>
                <textarea value={formData.systemPrompt} onChange={e => updateField('systemPrompt', e.target.value)} rows={10}
                  className="w-full px-4 py-2 bg-gray-900/50 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 font-mono text-sm"
                  placeholder="Define the agent's behavior, responsibilities, and communication style..." />
                <p className="text-xs text-gray-500 mt-1">This prompt defines how the agent behaves and responds</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Trigger Type</label>
                  <select value={formData.triggerType} onChange={e => updateField('triggerType', e.target.value)}
                    className="w-full px-4 py-2 bg-gray-900/50 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-indigo-500">
                    <option value="manual">Manual</option>
                    <option value="scheduled">Scheduled (Cron)</option>
                    <option value="event">Event-driven</option>
                  </select>
                </div>
                {formData.triggerType === 'scheduled' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">Cron Schedule</label>
                    <input type="text" value={formData.cronSchedule} onChange={e => updateField('cronSchedule', e.target.value)}
                      className="w-full px-4 py-2 bg-gray-900/50 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 font-mono"
                      placeholder="0 9 * * 1-5" />
                    <p className="text-xs text-gray-500 mt-1">Example: 0 9 * * 1-5 = 9 AM weekdays</p>
                  </div>
                )}
              </div>
              {formData.triggerType === 'scheduled' && (
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Scheduled Task Prompt</label>
                  <textarea value={formData.scheduledTaskPrompt} onChange={e => updateField('scheduledTaskPrompt', e.target.value)} rows={4}
                    className="w-full px-4 py-2 bg-gray-900/50 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500"
                    placeholder="What should this agent do on each scheduled run? E.g., 'Check for new trends and post a summary to #reports'" />
                  <p className="text-xs text-gray-500 mt-1">This prompt is sent to the LLM on each scheduled trigger</p>
                </div>
              )}
            </div>
          )}

          {/* Capabilities Tab */}
          {activeTab === 'capabilities' && (
            <div className="space-y-4">
              <p className="text-sm text-gray-400 mb-4">Control what actions this agent is allowed to perform</p>
              {[
                { key: 'canSendMessages', label: 'Send Messages', desc: 'Post messages in channels and send DMs' },
                { key: 'canEditTasks', label: 'Edit Tasks', desc: 'Update task status, assignees, and details' },
                { key: 'canCreateTasks', label: 'Create Tasks', desc: 'Create new tasks in projects' },
                { key: 'canNotifyUsers', label: 'Notify Users', desc: 'Mention and notify users directly' },
              ].map(cap => (
                <label
                  key={cap.key}
                  className="flex items-center justify-between p-4 bg-gray-800/50 rounded-lg cursor-pointer hover:bg-gray-800/70 transition-colors"
                >
                  <div>
                    <p className="font-medium text-white">{cap.label}</p>
                    <p className="text-sm text-gray-400">{cap.desc}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => updateField(cap.key as keyof FormData, !formData[cap.key as keyof FormData])}
                    className={cn(
                      'w-12 h-6 rounded-full transition-colors relative',
                      formData[cap.key as keyof FormData] ? 'bg-indigo-600' : 'bg-gray-600'
                    )}
                  >
                    <div
                      className={cn(
                        'absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform',
                        formData[cap.key as keyof FormData] ? 'translate-x-6' : 'translate-x-0.5'
                      )}
                    />
                  </button>
                </label>
              ))}

              {/* Approval Requirements Section */}
              <div className="mt-6 pt-6 border-t border-gray-700">
                <h4 className="text-sm font-medium text-white mb-2">Actions Requiring Approval</h4>
                <p className="text-sm text-gray-400 mb-4">Select which actions need human approval before execution</p>
                <div className="grid grid-cols-2 gap-2">
                  {ALL_ACTION_TYPES.map(action => (
                    <label
                      key={action.key}
                      className="flex items-center gap-3 p-3 bg-gray-800/50 rounded-lg cursor-pointer hover:bg-gray-800/70 transition-colors"
                    >
                      <input
                        type="checkbox"
                        checked={formData.requireApprovalFor.includes(action.key)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            updateField('requireApprovalFor', [...formData.requireApprovalFor, action.key]);
                          } else {
                            updateField('requireApprovalFor', formData.requireApprovalFor.filter(a => a !== action.key));
                          }
                        }}
                        className="w-4 h-4 rounded border-gray-600 bg-gray-900 text-indigo-600 focus:ring-indigo-500"
                      />
                      <div>
                        <p className="text-sm font-medium text-white">{action.label}</p>
                        <p className="text-xs text-gray-500">{action.desc}</p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Rate Limits Tab */}
          {activeTab === 'limits' && (
            <div className="space-y-6">
              <p className="text-sm text-gray-400 mb-4">Set limits to prevent runaway agents and control costs</p>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Actions per Minute</label>
                  <input type="number" value={formData.actionsPerMinute}
                    onChange={e => updateField('actionsPerMinute', parseInt(e.target.value) || 10)}
                    className="w-full px-4 py-2 bg-gray-900/50 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-indigo-500"
                    min={1} max={100} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Actions per Hour</label>
                  <input type="number" value={formData.actionsPerHour}
                    onChange={e => updateField('actionsPerHour', parseInt(e.target.value) || 100)}
                    className="w-full px-4 py-2 bg-gray-900/50 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-indigo-500"
                    min={1} max={1000} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Daily Token Limit</label>
                  <input type="number" value={formData.dailyTokenLimit ?? ''}
                    onChange={e => updateField('dailyTokenLimit', e.target.value ? parseInt(e.target.value) : null)}
                    className="w-full px-4 py-2 bg-gray-900/50 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500"
                    placeholder="No limit" min={0} />
                  <p className="text-xs text-gray-500 mt-1">Leave empty for no limit</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Daily Cost Limit ($)</label>
                  <input type="number" value={formData.dailyCostLimit ?? ''}
                    onChange={e => updateField('dailyCostLimit', e.target.value ? parseFloat(e.target.value) : null)}
                    className="w-full px-4 py-2 bg-gray-900/50 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500"
                    placeholder="No limit" min={0} step={0.01} />
                  <p className="text-xs text-gray-500 mt-1">Agent is disabled when limit is reached</p>
                </div>
              </div>
            </div>
          )}

          {/* Resources Tab */}
          {activeTab === 'resources' && (
            <div className="space-y-6">
              <p className="text-sm text-gray-400 mb-4">Configure resource limits for agent execution</p>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Memory Limit (MB)</label>
                  <input type="number" value={formData.memoryLimitMb}
                    onChange={e => updateField('memoryLimitMb', parseInt(e.target.value) || 512)}
                    className="w-full px-4 py-2 bg-gray-900/50 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-indigo-500"
                    min={128} max={8192} />
                  <p className="text-xs text-gray-500 mt-1">Maximum memory the agent can use</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Timeout (seconds)</label>
                  <input type="number" value={formData.timeoutSeconds}
                    onChange={e => updateField('timeoutSeconds', parseInt(e.target.value) || 300)}
                    className="w-full px-4 py-2 bg-gray-900/50 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-indigo-500"
                    min={30} max={3600} />
                  <p className="text-xs text-gray-500 mt-1">Maximum time for a single run (5 min default)</p>
                </div>
              </div>
              <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
                <p className="text-sm text-blue-400">💡 Agents run as isolated child processes with enforced memory and timeout limits.</p>
              </div>
            </div>
          )}

          {/* Projects Tab */}
          {activeTab === 'projects' && (
            <div className="space-y-4">
              <p className="text-sm text-gray-400 mb-4">Grant this agent access to specific projects</p>
              {allProjects.length === 0 ? (
                <div className="text-center py-8 text-gray-400">
                  <FolderOpen className="w-12 h-12 mx-auto mb-3 text-gray-600" />
                  <p>No projects found</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {allProjects.map(project => {
                    const hasAccess = projectAccess.some(p => p.projectId === project.id);
                    return (
                      <label
                        key={project.id}
                        className="flex items-center justify-between p-3 bg-gray-800/50 rounded-lg cursor-pointer hover:bg-gray-800/70 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-4 h-4 rounded" style={{ backgroundColor: project.color }} />
                          <span className="text-white">{project.name}</span>
                        </div>
                        <input
                          type="checkbox"
                          checked={hasAccess}
                          onChange={() => toggleProjectAccess(project.id, 'member')}
                          className="w-5 h-5 rounded border-gray-600 bg-gray-900 text-indigo-600 focus:ring-indigo-500"
                        />
                      </label>
                    );
                  })}
                </div>
              )}
              {isEditing && (
                <p className="text-xs text-gray-500 mt-4">
                  Note: For detailed project role management, use the agent settings modal from the sidebar.
                </p>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-between items-center p-4 border-t border-gray-700">
          <div className="text-sm text-gray-400">
            {activeTab !== 'basic' && (
              <button
                onClick={() => {
                  const currentIdx = tabs.findIndex(t => t.id === activeTab);
                  if (currentIdx > 0) setActiveTab(tabs[currentIdx - 1].id);
                }}
                className="text-indigo-400 hover:text-indigo-300"
              >
                ← Previous
              </button>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button onClick={onClose} className="px-4 py-2 text-gray-400 hover:text-white transition-colors">
              Cancel
            </button>
            {activeTab !== 'projects' ? (
              <button
                onClick={() => {
                  const currentIdx = tabs.findIndex(t => t.id === activeTab);
                  if (currentIdx < tabs.length - 1) setActiveTab(tabs[currentIdx + 1].id);
                }}
                className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-500 transition-colors"
              >
                Next →
              </button>
            ) : (
              <button
                onClick={handleSubmit}
                disabled={saving}
                className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition-colors"
              >
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                {isEditing ? 'Save Changes' : 'Create Agent'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
