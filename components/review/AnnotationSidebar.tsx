'use client';

import { useState } from 'react';
import { Check, CheckCircle, Circle, MessageCircle, Send, Filter } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface Reply {
  id: string;
  content: string;
  author: {
    id: string;
    displayName: string | null;
    avatar: string | null;
  };
  createdAt: string;
}

interface Annotation {
  id: string;
  type: string;
  x: number | null;
  y: number | null;
  content: string;
  resolved: boolean;
  color: string;
  author: {
    id: string;
    displayName: string | null;
    avatar: string | null;
  };
  replies: Reply[];
  createdAt: string;
}

interface AnnotationSidebarProps {
  annotations: Annotation[];
  selectedAnnotationId: string | null;
  onSelect: (id: string) => void;
  onResolve: (id: string, resolved: boolean) => void;
  onReply?: (annotationId: string, content: string) => void;
}

type FilterType = 'all' | 'open' | 'resolved';

export function AnnotationSidebar({
  annotations,
  selectedAnnotationId,
  onSelect,
  onResolve,
  onReply,
}: AnnotationSidebarProps) {
  const [filter, setFilter] = useState<FilterType>('all');
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyContent, setReplyContent] = useState('');

  const filteredAnnotations = annotations.filter((a) => {
    if (filter === 'all') return true;
    if (filter === 'open') return !a.resolved;
    if (filter === 'resolved') return a.resolved;
    return true;
  });

  const handleSubmitReply = (annotationId: string) => {
    if (!replyContent.trim() || !onReply) return;
    onReply(annotationId, replyContent.trim());
    setReplyContent('');
    setReplyingTo(null);
  };

  const openCount = annotations.filter(a => !a.resolved).length;
  const resolvedCount = annotations.filter(a => a.resolved).length;

  return (
    <div className="w-80 bg-zinc-900 border-l border-zinc-800 flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-zinc-800">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-semibold text-white">Comments</h3>
          <span className="text-sm text-zinc-500">{annotations.length} total</span>
        </div>

        {/* Filter tabs */}
        <div className="flex gap-1 p-1 bg-zinc-800 rounded-lg">
          <button
            onClick={() => setFilter('all')}
            className={`flex-1 px-3 py-1.5 text-sm rounded-md transition-colors ${
              filter === 'all' ? 'bg-zinc-700 text-white' : 'text-zinc-400 hover:text-white'
            }`}
          >
            All
          </button>
          <button
            onClick={() => setFilter('open')}
            className={`flex-1 px-3 py-1.5 text-sm rounded-md transition-colors ${
              filter === 'open' ? 'bg-zinc-700 text-white' : 'text-zinc-400 hover:text-white'
            }`}
          >
            Open ({openCount})
          </button>
          <button
            onClick={() => setFilter('resolved')}
            className={`flex-1 px-3 py-1.5 text-sm rounded-md transition-colors ${
              filter === 'resolved' ? 'bg-zinc-700 text-white' : 'text-zinc-400 hover:text-white'
            }`}
          >
            Resolved ({resolvedCount})
          </button>
        </div>
      </div>

      {/* Annotations list */}
      <div className="flex-1 overflow-y-auto">
        {filteredAnnotations.length === 0 ? (
          <div className="p-4 text-center text-zinc-500">
            {filter === 'all'
              ? 'No comments yet. Click on the image to add one.'
              : `No ${filter} comments.`}
          </div>
        ) : (
          <div className="divide-y divide-zinc-800">
            {filteredAnnotations.map((annotation) => (
              <div
                key={annotation.id}
                className={`p-4 cursor-pointer transition-colors ${
                  selectedAnnotationId === annotation.id
                    ? 'bg-zinc-800'
                    : 'hover:bg-zinc-800/50'
                }`}
                onClick={() => onSelect(annotation.id)}
              >
                {/* Annotation header */}
                <div className="flex items-start gap-3">
                  {/* Author avatar */}
                  <div className="flex-shrink-0">
                    {annotation.author.avatar ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={annotation.author.avatar}
                        alt={annotation.author.displayName || 'User'}
                        className="w-8 h-8 rounded-full"
                      />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-zinc-700 flex items-center justify-center">
                        <span className="text-sm text-zinc-400">
                          {(annotation.author.displayName || 'U')[0].toUpperCase()}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-medium text-white truncate">
                        {annotation.author.displayName || 'Anonymous'}
                      </span>
                      <span className="text-xs text-zinc-500">
                        {formatDistanceToNow(new Date(annotation.createdAt), { addSuffix: true })}
                      </span>
                    </div>
                    <p className="text-sm text-zinc-300">{annotation.content}</p>
                  </div>

                  {/* Resolve button */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onResolve(annotation.id, !annotation.resolved);
                    }}
                    className={`flex-shrink-0 p-1 rounded transition-colors ${
                      annotation.resolved
                        ? 'text-green-500 hover:text-green-400'
                        : 'text-zinc-500 hover:text-white'
                    }`}
                    title={annotation.resolved ? 'Mark as unresolved' : 'Mark as resolved'}
                  >
                    {annotation.resolved ? (
                      <CheckCircle className="w-5 h-5" />
                    ) : (
                      <Circle className="w-5 h-5" />
                    )}
                  </button>
                </div>

                {/* Replies */}
                {annotation.replies.length > 0 && (
                  <div className="mt-3 ml-11 space-y-2">
                    {annotation.replies.map((reply) => (
                      <div key={reply.id} className="flex gap-2">
                        <div className="flex-shrink-0">
                          {reply.author.avatar ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={reply.author.avatar}
                              alt={reply.author.displayName || 'User'}
                              className="w-6 h-6 rounded-full"
                            />
                          ) : (
                            <div className="w-6 h-6 rounded-full bg-zinc-700 flex items-center justify-center">
                              <span className="text-xs text-zinc-400">
                                {(reply.author.displayName || 'U')[0].toUpperCase()}
                              </span>
                            </div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <span className="text-xs font-medium text-zinc-400">
                            {reply.author.displayName || 'Anonymous'}
                          </span>
                          <p className="text-sm text-zinc-400">{reply.content}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Reply input */}
                {selectedAnnotationId === annotation.id && onReply && (
                  <div className="mt-3 ml-11">
                    {replyingTo === annotation.id ? (
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={replyContent}
                          onChange={(e) => setReplyContent(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                              e.preventDefault();
                              handleSubmitReply(annotation.id);
                            }
                            if (e.key === 'Escape') {
                              setReplyingTo(null);
                              setReplyContent('');
                            }
                          }}
                          placeholder="Reply..."
                          className="flex-1 bg-zinc-700 text-white text-sm rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
                          autoFocus
                        />
                        <button
                          onClick={() => handleSubmitReply(annotation.id)}
                          disabled={!replyContent.trim()}
                          className="p-1.5 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <Send className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setReplyingTo(annotation.id);
                        }}
                        className="text-sm text-zinc-500 hover:text-white"
                      >
                        Reply...
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default AnnotationSidebar;
