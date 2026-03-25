'use client';

import { useState, useEffect, useCallback } from 'react';
import { 
  Brain, Search, Filter, Pin, Archive, Trash2, ChevronDown, ChevronRight,
  Clock, Star, Eye, RefreshCw, MoreHorizontal, Edit2, X, Layers
} from 'lucide-react';

// Memory tier configuration with display info
const TIER_CONFIG: Record<string, { label: string; color: string; icon: string; description: string }> = {
  core: { 
    label: 'Core', 
    color: 'text-yellow-500 bg-yellow-500/10 border-yellow-500/30',
    icon: '⭐',
    description: 'Foundational memories that define the agent\'s understanding'
  },
  established: { 
    label: 'Established', 
    color: 'text-blue-500 bg-blue-500/10 border-blue-500/30',
    icon: '🏛️',
    description: 'Well-reinforced memories from repeated interactions'
  },
  recent: { 
    label: 'Recent', 
    color: 'text-green-500 bg-green-500/10 border-green-500/30',
    icon: '🌱',
    description: 'Fresh memories that may become established'
  },
  working: { 
    label: 'Working', 
    color: 'text-purple-500 bg-purple-500/10 border-purple-500/30',
    icon: '💭',
    description: 'Active context from current or recent sessions'
  },
  episodic: { 
    label: 'Episodic', 
    color: 'text-orange-500 bg-orange-500/10 border-orange-500/30',
    icon: '📅',
    description: 'Time-bound memories of specific events'
  },
};

const CATEGORY_CONFIG: Record<string, { label: string; icon: string }> = {
  facts: { label: 'Facts', icon: '📋' },
  preferences: { label: 'Preferences', icon: '❤️' },
  relationships: { label: 'Relationships', icon: '👥' },
  events: { label: 'Events', icon: '📅' },
  general: { label: 'General', icon: '📝' },
};

interface Memory {
  id: string;
  content: string;
  summary?: string;
  category: string;
  tier: string;
  source: string;
  importance: number;
  decayScore: number;
  accessCount: number;
  isPinned: boolean;
  isArchived: boolean;
  entities: Array<{ name: string; type: string; role?: string }>;
  createdAt: string;
  updatedAt: string;
}

interface MemoryStats {
  byCategory: Record<string, number>;
  byTier: Record<string, number>;
  total: number;
  pinned: number;
  archived: number;
}

interface MemoryBrowserTabProps {
  agentId: string;
  agentName?: string;
}

export default function MemoryBrowserTab({ agentId, agentName }: MemoryBrowserTabProps) {
  const [memories, setMemories] = useState<Memory[]>([]);
  const [stats, setStats] = useState<MemoryStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTier, setSelectedTier] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [showPinnedOnly, setShowPinnedOnly] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  
  // UI State
  const [expandedTiers, setExpandedTiers] = useState<Set<string>>(new Set(['core', 'established', 'recent']));
  const [selectedMemory, setSelectedMemory] = useState<Memory | null>(null);
  const [viewMode, setViewMode] = useState<'grouped' | 'list'>('grouped');

  const fetchMemories = useCallback(async () => {
    setLoading(true);
    setError(null);
    
    try {
      const params = new URLSearchParams();
      params.set('agentId', agentId);
      params.set('limit', '100');
      if (selectedTier) params.set('tier', selectedTier);
      if (selectedCategory) params.set('category', selectedCategory);
      if (showPinnedOnly) params.set('isPinned', 'true');
      if (showArchived) params.set('includeArchived', 'true');
      
      const res = await fetch(`/api/memory/browse?${params}`);
      
      if (!res.ok) {
        throw new Error('Failed to fetch memories');
      }
      
      const data = await res.json();
      setMemories(data.memories || []);
      setStats(data.stats || null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load memories');
    } finally {
      setLoading(false);
    }
  }, [agentId, selectedTier, selectedCategory, showPinnedOnly, showArchived]);

  useEffect(() => {
    fetchMemories();
  }, [fetchMemories]);

  // Group memories by tier
  const groupedMemories = memories.reduce((acc, memory) => {
    const tier = memory.tier || 'working';
    if (!acc[tier]) acc[tier] = [];
    acc[tier].push(memory);
    return acc;
  }, {} as Record<string, Memory[]>);

  // Filter by search query
  const filterBySearch = (items: Memory[]) => {
    if (!searchQuery.trim()) return items;
    const query = searchQuery.toLowerCase();
    return items.filter(m => 
      m.content.toLowerCase().includes(query) ||
      m.summary?.toLowerCase().includes(query) ||
      m.entities.some(e => e.name.toLowerCase().includes(query))
    );
  };

  const toggleTier = (tier: string) => {
    setExpandedTiers(prev => {
      const next = new Set(prev);
      if (next.has(tier)) {
        next.delete(tier);
      } else {
        next.add(tier);
      }
      return next;
    });
  };

  const handlePin = async (memory: Memory) => {
    try {
      const res = await fetch(`/api/memory/${memory.id}`, {
        method: 'PATCH',
        headers: { 
          'Content-Type': 'application/json',
          'X-Agent-Id': agentId,
        },
        body: JSON.stringify({ isPinned: !memory.isPinned }),
      });
      
      if (res.ok) {
        fetchMemories();
      }
    } catch (err) {
      console.error('Failed to toggle pin:', err);
    }
  };

  const handleArchive = async (memory: Memory) => {
    try {
      const res = await fetch(`/api/memory/${memory.id}`, {
        method: 'PATCH',
        headers: { 
          'Content-Type': 'application/json',
          'X-Agent-Id': agentId,
        },
        body: JSON.stringify({ isArchived: !memory.isArchived }),
      });
      
      if (res.ok) {
        fetchMemories();
        if (selectedMemory?.id === memory.id) {
          setSelectedMemory(null);
        }
      }
    } catch (err) {
      console.error('Failed to toggle archive:', err);
    }
  };

  const handleDelete = async (memory: Memory) => {
    if (!confirm('Delete this memory permanently?')) return;
    
    try {
      const res = await fetch(`/api/memory/${memory.id}`, {
        method: 'DELETE',
        headers: { 'X-Agent-Id': agentId },
      });
      
      if (res.ok) {
        fetchMemories();
        if (selectedMemory?.id === memory.id) {
          setSelectedMemory(null);
        }
      }
    } catch (err) {
      console.error('Failed to delete memory:', err);
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    return date.toLocaleDateString();
  };

  const tierOrder = ['core', 'established', 'recent', 'working', 'episodic'];

  return (
    <div className="flex flex-col h-full">
      {/* Header with stats */}
      <div className="p-4 border-b border-zinc-800">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Brain className="w-5 h-5 text-purple-400" />
            <h3 className="font-medium">Memory Browser</h3>
            {stats && (
              <span className="text-sm text-zinc-500">
                ({stats.total} memories)
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setViewMode(viewMode === 'grouped' ? 'list' : 'grouped')}
              className="p-1.5 rounded hover:bg-zinc-800 text-zinc-400"
              title={viewMode === 'grouped' ? 'Switch to list view' : 'Switch to grouped view'}
            >
              <Layers className="w-4 h-4" />
            </button>
            <button
              onClick={fetchMemories}
              className="p-1.5 rounded hover:bg-zinc-800 text-zinc-400"
              title="Refresh"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Search and filters */}
        <div className="flex gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search memories..."
              className="w-full pl-8 pr-3 py-1.5 bg-zinc-900 border border-zinc-700 rounded text-sm focus:outline-none focus:border-purple-500"
            />
          </div>
          
          <select
            value={selectedTier || ''}
            onChange={(e) => setSelectedTier(e.target.value || null)}
            className="px-2 py-1.5 bg-zinc-900 border border-zinc-700 rounded text-sm focus:outline-none focus:border-purple-500"
          >
            <option value="">All Tiers</option>
            {tierOrder.map(tier => (
              <option key={tier} value={tier}>
                {TIER_CONFIG[tier]?.icon} {TIER_CONFIG[tier]?.label || tier}
              </option>
            ))}
          </select>

          <select
            value={selectedCategory || ''}
            onChange={(e) => setSelectedCategory(e.target.value || null)}
            className="px-2 py-1.5 bg-zinc-900 border border-zinc-700 rounded text-sm focus:outline-none focus:border-purple-500"
          >
            <option value="">All Categories</option>
            {Object.entries(CATEGORY_CONFIG).map(([key, config]) => (
              <option key={key} value={key}>
                {config.icon} {config.label}
              </option>
            ))}
          </select>

          <button
            onClick={() => setShowPinnedOnly(!showPinnedOnly)}
            className={`px-2 py-1.5 rounded text-sm flex items-center gap-1 ${
              showPinnedOnly 
                ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30' 
                : 'bg-zinc-900 border border-zinc-700 text-zinc-400'
            }`}
          >
            <Pin className="w-3.5 h-3.5" />
            Pinned
          </button>

          <button
            onClick={() => setShowArchived(!showArchived)}
            className={`px-2 py-1.5 rounded text-sm flex items-center gap-1 ${
              showArchived 
                ? 'bg-zinc-600/20 text-zinc-300 border border-zinc-500/30' 
                : 'bg-zinc-900 border border-zinc-700 text-zinc-400'
            }`}
          >
            <Archive className="w-3.5 h-3.5" />
            Archived
          </button>
        </div>

        {/* Quick stats */}
        {stats && (
          <div className="flex gap-4 mt-3 text-xs text-zinc-500">
            {Object.entries(stats.byTier).map(([tier, count]) => (
              <span key={tier} className="flex items-center gap-1">
                <span>{TIER_CONFIG[tier]?.icon || '📦'}</span>
                <span>{TIER_CONFIG[tier]?.label || tier}: {count}</span>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Memory list */}
      <div className="flex-1 overflow-y-auto">
        {loading && memories.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-zinc-500">
            <RefreshCw className="w-5 h-5 animate-spin mr-2" />
            Loading memories...
          </div>
        ) : error ? (
          <div className="p-4 text-red-400 text-center">
            {error}
          </div>
        ) : memories.length === 0 ? (
          <div className="p-8 text-center text-zinc-500">
            <Brain className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>No memories yet</p>
            <p className="text-sm mt-1">Memories will appear here as the agent learns</p>
          </div>
        ) : viewMode === 'grouped' ? (
          // Grouped view by tier
          <div className="divide-y divide-zinc-800">
            {tierOrder.map(tier => {
              const tierMemories = filterBySearch(groupedMemories[tier] || []);
              if (tierMemories.length === 0) return null;
              
              const config = TIER_CONFIG[tier] || { label: tier, color: 'text-zinc-400', icon: '📦' };
              const isExpanded = expandedTiers.has(tier);

              return (
                <div key={tier} className="bg-zinc-900/50">
                  <button
                    onClick={() => toggleTier(tier)}
                    className={`w-full px-4 py-2 flex items-center gap-2 hover:bg-zinc-800/50 ${config.color}`}
                  >
                    {isExpanded ? (
                      <ChevronDown className="w-4 h-4" />
                    ) : (
                      <ChevronRight className="w-4 h-4" />
                    )}
                    <span className="text-lg">{config.icon}</span>
                    <span className="font-medium">{config.label}</span>
                    <span className="text-xs opacity-70">({tierMemories.length})</span>
                    <span className="text-xs opacity-50 ml-2">{config.description}</span>
                  </button>
                  
                  {isExpanded && (
                    <div className="border-t border-zinc-800">
                      {tierMemories.map(memory => (
                        <MemoryCard
                          key={memory.id}
                          memory={memory}
                          onSelect={() => setSelectedMemory(memory)}
                          onPin={() => handlePin(memory)}
                          onArchive={() => handleArchive(memory)}
                          onDelete={() => handleDelete(memory)}
                          formatDate={formatDate}
                        />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          // Flat list view
          <div className="divide-y divide-zinc-800">
            {filterBySearch(memories).map(memory => (
              <MemoryCard
                key={memory.id}
                memory={memory}
                onSelect={() => setSelectedMemory(memory)}
                onPin={() => handlePin(memory)}
                onArchive={() => handleArchive(memory)}
                onDelete={() => handleDelete(memory)}
                formatDate={formatDate}
                showTier
              />
            ))}
          </div>
        )}
      </div>

      {/* Memory detail modal */}
      {selectedMemory && (
        <MemoryDetailModal
          memory={selectedMemory}
          onClose={() => setSelectedMemory(null)}
          onPin={() => handlePin(selectedMemory)}
          onArchive={() => handleArchive(selectedMemory)}
          onDelete={() => handleDelete(selectedMemory)}
          formatDate={formatDate}
        />
      )}
    </div>
  );
}

// Memory card component
function MemoryCard({ 
  memory, 
  onSelect, 
  onPin, 
  onArchive, 
  onDelete,
  formatDate,
  showTier = false 
}: {
  memory: Memory;
  onSelect: () => void;
  onPin: () => void;
  onArchive: () => void;
  onDelete: () => void;
  formatDate: (date: string) => string;
  showTier?: boolean;
}) {
  const tierConfig = TIER_CONFIG[memory.tier] || TIER_CONFIG.working;
  const categoryConfig = CATEGORY_CONFIG[memory.category] || CATEGORY_CONFIG.general;

  return (
    <div 
      className={`px-4 py-3 hover:bg-zinc-800/50 cursor-pointer group ${
        memory.isArchived ? 'opacity-50' : ''
      }`}
      onClick={onSelect}
    >
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            {memory.isPinned && (
              <Pin className="w-3.5 h-3.5 text-yellow-500" />
            )}
            {showTier && (
              <span className={`text-xs px-1.5 py-0.5 rounded border ${tierConfig.color}`}>
                {tierConfig.icon} {tierConfig.label}
              </span>
            )}
            <span className="text-xs text-zinc-500">
              {categoryConfig.icon} {categoryConfig.label}
            </span>
            <span className="text-xs text-zinc-600">•</span>
            <span className="text-xs text-zinc-600">{formatDate(memory.createdAt)}</span>
          </div>
          
          <p className="text-sm text-zinc-300 line-clamp-2">
            {memory.summary || memory.content}
          </p>
          
          {memory.entities.length > 0 && (
            <div className="flex gap-1 mt-1.5 flex-wrap">
              {memory.entities.slice(0, 3).map((entity, i) => (
                <span 
                  key={i}
                  className="text-xs px-1.5 py-0.5 bg-zinc-800 rounded text-zinc-400"
                >
                  {entity.name}
                </span>
              ))}
              {memory.entities.length > 3 && (
                <span className="text-xs text-zinc-600">
                  +{memory.entities.length - 3} more
                </span>
              )}
            </div>
          )}
        </div>

        {/* Quick actions */}
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={(e) => { e.stopPropagation(); onPin(); }}
            className={`p-1 rounded hover:bg-zinc-700 ${memory.isPinned ? 'text-yellow-500' : 'text-zinc-500'}`}
            title={memory.isPinned ? 'Unpin' : 'Pin'}
          >
            <Pin className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onArchive(); }}
            className="p-1 rounded hover:bg-zinc-700 text-zinc-500"
            title={memory.isArchived ? 'Unarchive' : 'Archive'}
          >
            <Archive className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Metadata row */}
      <div className="flex items-center gap-3 mt-2 text-xs text-zinc-600">
        <span className="flex items-center gap-1">
          <Star className="w-3 h-3" />
          {(memory.importance * 100).toFixed(0)}%
        </span>
        <span className="flex items-center gap-1">
          <Eye className="w-3 h-3" />
          {memory.accessCount}
        </span>
        <span className="flex items-center gap-1">
          <Clock className="w-3 h-3" />
          {(memory.decayScore * 100).toFixed(0)}%
        </span>
      </div>
    </div>
  );
}

// Memory detail modal
function MemoryDetailModal({
  memory,
  onClose,
  onPin,
  onArchive,
  onDelete,
  formatDate,
}: {
  memory: Memory;
  onClose: () => void;
  onPin: () => void;
  onArchive: () => void;
  onDelete: () => void;
  formatDate: (date: string) => string;
}) {
  const tierConfig = TIER_CONFIG[memory.tier] || TIER_CONFIG.working;
  const categoryConfig = CATEGORY_CONFIG[memory.category] || CATEGORY_CONFIG.general;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-zinc-900 border border-zinc-700 rounded-lg max-w-2xl w-full max-h-[80vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
          <div className="flex items-center gap-2">
            <span className={`text-sm px-2 py-0.5 rounded border ${tierConfig.color}`}>
              {tierConfig.icon} {tierConfig.label}
            </span>
            <span className="text-sm text-zinc-500">
              {categoryConfig.icon} {categoryConfig.label}
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-zinc-800 text-zinc-400"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {memory.summary && (
            <div>
              <h4 className="text-xs font-medium text-zinc-500 uppercase mb-1">Summary</h4>
              <p className="text-zinc-300">{memory.summary}</p>
            </div>
          )}

          <div>
            <h4 className="text-xs font-medium text-zinc-500 uppercase mb-1">Full Content</h4>
            <p className="text-zinc-300 whitespace-pre-wrap">{memory.content}</p>
          </div>

          {memory.entities.length > 0 && (
            <div>
              <h4 className="text-xs font-medium text-zinc-500 uppercase mb-2">Entities</h4>
              <div className="flex flex-wrap gap-2">
                {memory.entities.map((entity, i) => (
                  <span 
                    key={i}
                    className="px-2 py-1 bg-zinc-800 rounded text-sm"
                  >
                    <span className="text-zinc-400">{entity.type}:</span>{' '}
                    <span className="text-zinc-200">{entity.name}</span>
                    {entity.role && (
                      <span className="text-zinc-500 text-xs ml-1">({entity.role})</span>
                    )}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <h4 className="text-xs font-medium text-zinc-500 uppercase mb-1">Importance</h4>
              <div className="flex items-center gap-2">
                <div className="flex-1 h-2 bg-zinc-800 rounded overflow-hidden">
                  <div 
                    className="h-full bg-yellow-500"
                    style={{ width: `${memory.importance * 100}%` }}
                  />
                </div>
                <span className="text-zinc-400">{(memory.importance * 100).toFixed(0)}%</span>
              </div>
            </div>

            <div>
              <h4 className="text-xs font-medium text-zinc-500 uppercase mb-1">Decay Score</h4>
              <div className="flex items-center gap-2">
                <div className="flex-1 h-2 bg-zinc-800 rounded overflow-hidden">
                  <div 
                    className="h-full bg-blue-500"
                    style={{ width: `${memory.decayScore * 100}%` }}
                  />
                </div>
                <span className="text-zinc-400">{(memory.decayScore * 100).toFixed(0)}%</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4 text-sm text-zinc-400">
            <div>
              <span className="text-xs text-zinc-500 block">Source</span>
              {memory.source}
            </div>
            <div>
              <span className="text-xs text-zinc-500 block">Access Count</span>
              {memory.accessCount}
            </div>
            <div>
              <span className="text-xs text-zinc-500 block">Created</span>
              {formatDate(memory.createdAt)}
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-zinc-800">
          <div className="flex items-center gap-2">
            <button
              onClick={onPin}
              className={`px-3 py-1.5 rounded text-sm flex items-center gap-1.5 ${
                memory.isPinned 
                  ? 'bg-yellow-500/20 text-yellow-400' 
                  : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
              }`}
            >
              <Pin className="w-4 h-4" />
              {memory.isPinned ? 'Pinned' : 'Pin'}
            </button>
            <button
              onClick={onArchive}
              className="px-3 py-1.5 rounded text-sm flex items-center gap-1.5 bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
            >
              <Archive className="w-4 h-4" />
              {memory.isArchived ? 'Unarchive' : 'Archive'}
            </button>
          </div>
          <button
            onClick={onDelete}
            className="px-3 py-1.5 rounded text-sm flex items-center gap-1.5 bg-red-500/20 text-red-400 hover:bg-red-500/30"
          >
            <Trash2 className="w-4 h-4" />
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}
