'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { MessageCircle, Check, X } from 'lucide-react';

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
  replies: Array<{
    id: string;
    content: string;
    author: {
      id: string;
      displayName: string | null;
      avatar: string | null;
    };
  }>;
  createdAt: string;
}

interface ImageReviewerProps {
  src: string;
  annotations: Annotation[];
  onAnnotationCreate?: (data: { type: string; x: number; y: number; content: string }) => void;
  onAnnotationSelect?: (id: string) => void;
  selectedAnnotationId?: string | null;
  readOnly?: boolean;
}

export function ImageReviewer({
  src,
  annotations,
  onAnnotationCreate,
  onAnnotationSelect,
  selectedAnnotationId,
  readOnly = false,
}: ImageReviewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const [isAddingAnnotation, setIsAddingAnnotation] = useState(false);
  const [pendingPosition, setPendingPosition] = useState<{ x: number; y: number } | null>(null);
  const [popupPosition, setPopupPosition] = useState<{ top: number; left: number } | null>(null);
  const [newComment, setNewComment] = useState('');
  const [hoveredAnnotation, setHoveredAnnotation] = useState<string | null>(null);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [mounted, setMounted] = useState(false);

  // Ensure we're on client for portal
  useEffect(() => {
    setMounted(true);
  }, []);

  const handleImageClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (readOnly || !containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;

    // Calculate popup position in viewport coordinates
    const popupWidth = 280;
    const popupLeft = e.clientX + 20; // 20px to the right of click
    const adjustedLeft = popupLeft + popupWidth > window.innerWidth 
      ? e.clientX - popupWidth - 20 // Position to the left if it would overflow
      : popupLeft;

    setPendingPosition({ x, y });
    setPopupPosition({ top: e.clientY - 20, left: adjustedLeft });
    setIsAddingAnnotation(true);
    setNewComment('');
  }, [readOnly]);

  const handleSubmitAnnotation = useCallback(() => {
    if (!pendingPosition || !newComment.trim() || !onAnnotationCreate) return;

    onAnnotationCreate({
      type: 'pin',
      x: pendingPosition.x,
      y: pendingPosition.y,
      content: newComment.trim(),
    });

    setPendingPosition(null);
    setPopupPosition(null);
    setIsAddingAnnotation(false);
    setNewComment('');
  }, [pendingPosition, newComment, onAnnotationCreate]);

  const handleCancelAnnotation = useCallback(() => {
    setPendingPosition(null);
    setPopupPosition(null);
    setIsAddingAnnotation(false);
    setNewComment('');
  }, []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      handleCancelAnnotation();
    } else if (e.key === 'Enter' && e.metaKey) {
      handleSubmitAnnotation();
    }
  }, [handleCancelAnnotation, handleSubmitAnnotation]);

  // Close annotation form when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (isAddingAnnotation && 
          popupRef.current && 
          !popupRef.current.contains(e.target as Node) &&
          containerRef.current &&
          !containerRef.current.contains(e.target as Node)) {
        handleCancelAnnotation();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isAddingAnnotation, handleCancelAnnotation]);

  // Comment input popup rendered via portal
  const commentPopup = mounted && isAddingAnnotation && popupPosition && createPortal(
    <div
      ref={popupRef}
      className="fixed bg-zinc-800 rounded-lg shadow-2xl w-72 p-3 z-[9999]"
      style={{
        top: popupPosition.top,
        left: popupPosition.left,
      }}
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <textarea
        autoFocus
        value={newComment}
        onChange={(e) => setNewComment(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Add a comment..."
        className="w-full bg-zinc-700 text-white rounded-lg p-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
        rows={3}
      />
      <div className="flex items-center justify-between mt-2">
        <span className="text-xs text-zinc-500">⌘ + Enter to submit</span>
        <div className="flex gap-2">
          <button
            onClick={handleCancelAnnotation}
            className="px-3 py-1 text-sm text-zinc-400 hover:text-white"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmitAnnotation}
            disabled={!newComment.trim()}
            className="px-3 py-1 text-sm bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Add
          </button>
        </div>
      </div>
    </div>,
    document.body
  );

  return (
    <div className="relative w-full h-full">
      {/* Image container */}
      <div
        ref={containerRef}
        className="relative w-full h-full cursor-crosshair overflow-hidden bg-zinc-900 rounded-lg"
        onClick={handleImageClick}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt="Review item"
          className="w-full h-full object-contain"
          onLoad={() => setImageLoaded(true)}
          draggable={false}
        />

        {/* Existing annotations */}
        {imageLoaded && annotations.map((annotation) => {
          if (annotation.x === null || annotation.y === null) return null;
          
          const isSelected = selectedAnnotationId === annotation.id;
          const isHovered = hoveredAnnotation === annotation.id;

          return (
            <div
              key={annotation.id}
              className={`absolute transform -translate-x-1/2 -translate-y-1/2 cursor-pointer transition-transform ${
                isSelected || isHovered ? 'scale-125 z-20' : 'z-10'
              }`}
              style={{
                left: `${annotation.x}%`,
                top: `${annotation.y}%`,
              }}
              onClick={(e) => {
                e.stopPropagation();
                onAnnotationSelect?.(annotation.id);
              }}
              onMouseEnter={() => setHoveredAnnotation(annotation.id)}
              onMouseLeave={() => setHoveredAnnotation(null)}
            >
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center shadow-lg border-2 ${
                  annotation.resolved
                    ? 'bg-green-500 border-green-400'
                    : 'bg-red-500 border-red-400'
                } ${isSelected ? 'ring-2 ring-white ring-offset-2 ring-offset-zinc-900' : ''}`}
                style={{ backgroundColor: annotation.resolved ? '#22c55e' : annotation.color }}
              >
                {annotation.resolved ? (
                  <Check className="w-4 h-4 text-white" />
                ) : (
                  <MessageCircle className="w-4 h-4 text-white" />
                )}
              </div>

              {/* Tooltip on hover */}
              {isHovered && !isSelected && (
                <div className={`absolute ml-2 top-1/2 -translate-y-1/2 bg-zinc-800 rounded-lg p-2 shadow-xl w-48 z-[90] ${
                  (annotation.x || 0) > 60 ? 'right-full mr-2' : 'left-full'
                }`}>
                  <p className="text-xs text-zinc-400 mb-1">
                    {annotation.author.displayName || 'Anonymous'}
                  </p>
                  <p className="text-sm text-white line-clamp-2">{annotation.content}</p>
                </div>
              )}
            </div>
          );
        })}

        {/* Pending annotation marker (blue dot) */}
        {pendingPosition && (
          <div
            className="absolute transform -translate-x-1/2 -translate-y-1/2 z-30 pointer-events-none"
            style={{
              left: `${pendingPosition.x}%`,
              top: `${pendingPosition.y}%`,
            }}
          >
            <div className="w-8 h-8 rounded-full bg-blue-500 border-2 border-blue-400 flex items-center justify-center animate-pulse">
              <MessageCircle className="w-4 h-4 text-white" />
            </div>
          </div>
        )}

        {/* Instructions hint (when no annotations and not adding) */}
        {!readOnly && annotations.length === 0 && !isAddingAnnotation && imageLoaded && (
          <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 pointer-events-none">
            <div className="bg-black/60 backdrop-blur-sm rounded-full px-4 py-1.5 text-xs text-white/80 shadow-lg">
              Click anywhere to add a comment
            </div>
          </div>
        )}
      </div>

      {/* Portal-rendered comment popup */}
      {commentPopup}
    </div>
  );
}

export default ImageReviewer;
