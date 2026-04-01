'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Search, X, MessageSquare, CheckSquare, Hash, User, Calendar, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useRouter } from 'next/navigation';

interface SearchResult {
  messages: MessageResult[];
  tasks: TaskResult[];
}

interface MessageResult {
  id: string;
  content: string;
  createdAt: string;
  author: {
    id: string;
    displayName: string;
    avatar: string | null;
  };
  channel: {
    id: string;
    name: string;
  };
}

interface TaskResult {
  id: string;
  title: string;
  description: string | null;
  priority: string;
  column: {
    id: string;
    name: string;
  };
  project: {
    id: string;
    name: string;
  };
  tags: { id: string; name: string; color: string }[];
  assignee: {
    id: string;
    displayName: string;
    avatar: string | null;
  } | null;
}

interface SearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialQuery?: string;
}

export default function SearchModal({ isOpen, onClose, initialQuery = '' }: SearchModalProps) {
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<SearchResult>({ messages: [], tasks: [] });
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'all' | 'messages' | 'tasks'>('all');
  const [hasSearched, setHasSearched] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  // Focus input when modal opens
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
      if (initialQuery) {
        setQuery(initialQuery);
        performSearch(initialQuery);
      }
    }
  }, [isOpen, initialQuery]);

  // Close on escape
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      return () => document.removeEventListener('keydown', handleEscape);
    }
  }, [isOpen, onClose]);

  const performSearch = useCallback(async (searchQuery: string) => {
    if (searchQuery.length < 2) {
      setResults({ messages: [], tasks: [] });
      setHasSearched(false);
      return;
    }

    setLoading(true);
    setHasSearched(true);

    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(searchQuery)}&type=${activeTab}&limit=50`);
      if (res.ok) {
        const data = await res.json();
        setResults(data.results);
      }
    } catch (error) {
      console.error('Search error:', error);
    } finally {
      setLoading(false);
    }
  }, [activeTab]);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      if (query.length >= 2) {
        performSearch(query);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [query, performSearch]);

  const handleMessageClick = (message: MessageResult) => {
    router.push(`/chat/${message.channel.id}?highlight=${message.id}`);
    onClose();
  };

  const handleTaskClick = (task: TaskResult) => {
    router.push(`/kanban?project=${task.project.id}&task=${task.id}`);
    onClose();
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else if (days === 1) {
      return 'Yesterday';
    } else if (days < 7) {
      return date.toLocaleDateString([], { weekday: 'short' });
    } else {
      return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    }
  };

  const highlightMatch = (text: string, query: string) => {
    if (!query) return text;
    const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    const parts = text.split(regex);
    return parts.map((part, i) =>
      regex.test(part) ? <mark key={i} className="bg-yellow-500/30 text-yellow-200">{part}</mark> : part
    );
  };

  if (!isOpen) return null;

  const totalResults = results.messages.length + results.tasks.length;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-20">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />

      {/* Modal */}
      <div className="relative w-full max-w-2xl bg-[#2B2D31] rounded-lg shadow-xl border border-gray-700 overflow-hidden">
        {/* Search input */}
        <div className="flex items-center gap-3 p-4 border-b border-gray-700">
          <Search className="w-5 h-5 text-gray-400 flex-shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search messages and tasks..."
            className="flex-1 bg-transparent text-lg placeholder:text-gray-500 focus:outline-none"
          />
          {loading && <Loader2 className="w-5 h-5 text-gray-400 animate-spin" />}
          <button onClick={onClose} className="p-1 hover:bg-white/10 rounded">
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 px-4 py-2 border-b border-gray-700 bg-[#232428]">
          {(['all', 'messages', 'tasks'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={cn(
                'px-3 py-1.5 text-sm rounded transition-colors capitalize',
                activeTab === tab
                  ? 'bg-primary text-white'
                  : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'
              )}
            >
              {tab === 'all' ? 'All' : tab === 'messages' ? 'Messages' : 'Tasks'}
              {hasSearched && (
                <span className="ml-1.5 text-xs opacity-70">
                  ({tab === 'all' ? totalResults : tab === 'messages' ? results.messages.length : results.tasks.length})
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Results */}
        <div className="max-h-96 overflow-y-auto">
          {!hasSearched ? (
            <div className="p-8 text-center text-gray-500">
              <Search className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>Type at least 2 characters to search</p>
            </div>
          ) : loading ? (
            <div className="p-8 text-center">
              <Loader2 className="w-8 h-8 mx-auto animate-spin text-gray-400" />
            </div>
          ) : totalResults === 0 ? (
            <div className="p-8 text-center text-gray-500">
              <p>No results found for "{query}"</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-700/50">
              {/* Messages */}
              {(activeTab === 'all' || activeTab === 'messages') && results.messages.length > 0 && (
                <div>
                  {activeTab === 'all' && (
                    <div className="px-4 py-2 text-xs font-semibold text-gray-400 uppercase bg-[#232428]">
                      Messages ({results.messages.length})
                    </div>
                  )}
                  {results.messages.map((message) => (
                    <button
                      key={message.id}
                      onClick={() => handleMessageClick(message)}
                      className="w-full px-4 py-3 flex items-start gap-3 hover:bg-white/5 text-left transition-colors"
                    >
                      <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-xs font-semibold flex-shrink-0">
                        {message.author.avatar ? (
                          <img src={message.author.avatar} alt="" className="w-full h-full rounded-full object-cover" />
                        ) : (
                          message.author.displayName.slice(0, 2).toUpperCase()
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="font-medium text-sm">{message.author.displayName}</span>
                          <span className="text-xs text-gray-500 flex items-center gap-1">
                            <Hash className="w-3 h-3" />
                            {message.channel.name}
                          </span>
                          <span className="text-xs text-gray-500">{formatDate(message.createdAt)}</span>
                        </div>
                        <p className="text-sm text-gray-300 truncate">
                          {highlightMatch(message.content, query)}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {/* Tasks */}
              {(activeTab === 'all' || activeTab === 'tasks') && results.tasks.length > 0 && (
                <div>
                  {activeTab === 'all' && (
                    <div className="px-4 py-2 text-xs font-semibold text-gray-400 uppercase bg-[#232428]">
                      Tasks ({results.tasks.length})
                    </div>
                  )}
                  {results.tasks.map((task) => (
                    <button
                      key={task.id}
                      onClick={() => handleTaskClick(task)}
                      className="w-full px-4 py-3 flex items-start gap-3 hover:bg-white/5 text-left transition-colors"
                    >
                      <div className={cn(
                        'w-8 h-8 rounded flex items-center justify-center flex-shrink-0',
                        task.priority === 'high' ? 'bg-red-500/20 text-red-400' :
                        task.priority === 'medium' ? 'bg-yellow-500/20 text-yellow-400' :
                        'bg-gray-500/20 text-gray-400'
                      )}>
                        <CheckSquare className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="font-medium text-sm">{highlightMatch(task.title, query)}</span>
                          <span className="text-xs text-gray-500">{task.column.name}</span>
                        </div>
                        {task.description && (
                          <p className="text-sm text-gray-400 truncate">
                            {highlightMatch(task.description, query)}
                          </p>
                        )}
                        {task.tags.length > 0 && (
                          <div className="flex gap-1 mt-1">
                            {task.tags.slice(0, 3).map((tag) => (
                              <span
                                key={tag.id}
                                className="px-1.5 py-0.5 text-xs rounded"
                                style={{ backgroundColor: `${tag.color}30`, color: tag.color }}
                              >
                                {tag.name}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer hint */}
        <div className="px-4 py-2 border-t border-gray-700 bg-[#232428] text-xs text-gray-500">
          <kbd className="px-1.5 py-0.5 bg-gray-700 rounded">↵</kbd> to select
          <span className="mx-2">•</span>
          <kbd className="px-1.5 py-0.5 bg-gray-700 rounded">↑↓</kbd> to navigate
          <span className="mx-2">•</span>
          <kbd className="px-1.5 py-0.5 bg-gray-700 rounded">esc</kbd> to close
        </div>
      </div>
    </div>
  );
}
