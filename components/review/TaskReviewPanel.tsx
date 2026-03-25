'use client';

import { useState, useCallback, useEffect } from 'react';
import { Upload, Image as ImageIcon, Film, Check, X, Eye, Plus, Users, Maximize2 } from 'lucide-react';
import { ImageReviewer } from './ImageReviewer';
import { VideoReviewer } from './VideoReviewer';
import { AnnotationSidebar } from './AnnotationSidebar';
import { ReviewerAssignment } from './ReviewerAssignment';

interface ReviewerUser {
  id: string;
  displayName: string | null;
  avatar: string | null;
  username?: string;
}

interface ReviewAssignment {
  id: string;
  status: string;
  userId: string;
  user: ReviewerUser;
  reviewedAt: string | null;
}

interface ReviewItem {
  id: string;
  type: string;
  url: string;
  thumbnailUrl?: string;
  name: string;
  status: string;
  version: number;
  uploadedBy: {
    id: string;
    displayName: string | null;
    avatar: string | null;
  };
  reviewers?: ReviewAssignment[];
  annotations: Array<{
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
      createdAt: string;
    }>;
    createdAt: string;
  }>;
  createdAt: string;
}

interface TaskReviewPanelProps {
  taskId: string;
  reviewItems: ReviewItem[];
  currentUserId?: string;
  fullscreen?: boolean;
  onUpload?: (file: File) => Promise<void>;
  onAnnotationCreate?: (reviewItemId: string, annotation: { type: string; x: number; y: number; content: string }) => Promise<void>;
  onAnnotationResolve?: (annotationId: string, resolved: boolean) => Promise<void>;
  onAnnotationReply?: (annotationId: string, content: string) => Promise<void>;
  onStatusChange?: (reviewItemId: string, status: string) => Promise<void>;
  onAssignReviewers?: (reviewItemId: string, userIds: string[]) => Promise<void>;
  onRemoveReviewer?: (reviewItemId: string, userId: string) => Promise<void>;
  onApprove?: (reviewItemId: string) => Promise<void>;
  onReject?: (reviewItemId: string, reason?: string) => Promise<void>;
  onViewModeChange?: (mode: 'grid' | 'review') => void;
  onPopOut?: () => void;
}

export function TaskReviewPanel({
  taskId,
  reviewItems,
  currentUserId,
  fullscreen = false,
  onUpload,
  onAnnotationCreate,
  onAnnotationResolve,
  onAnnotationReply,
  onStatusChange,
  onAssignReviewers,
  onRemoveReviewer,
  onApprove,
  onReject,
  onViewModeChange,
  onPopOut,
}: TaskReviewPanelProps) {
  const [selectedItemId, setSelectedItemId] = useState<string | null>(
    reviewItems.length > 0 ? reviewItems[0].id : null
  );
  const [selectedAnnotationId, setSelectedAnnotationId] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [viewMode, setViewModeState] = useState<'grid' | 'review'>('grid');
  
  // Wrapper to notify parent of view mode changes
  const setViewMode = (mode: 'grid' | 'review') => {
    setViewModeState(mode);
    onViewModeChange?.(mode);
  };

  // Preserve selection when reviewItems changes (e.g., after adding annotation)
  const selectedItem = reviewItems.find((item) => item.id === selectedItemId);
  
  // If selected item exists in new reviewItems, keep selection; otherwise reset only if viewMode was grid
  useEffect(() => {
    if (selectedItemId && !reviewItems.find(item => item.id === selectedItemId)) {
      // Selected item no longer exists, reset
      setSelectedItemId(reviewItems.length > 0 ? reviewItems[0].id : null);
      setViewMode('grid');
    }
  }, [reviewItems, selectedItemId]);

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !onUpload) return;

    setIsUploading(true);
    try {
      await onUpload(file);
    } finally {
      setIsUploading(false);
    }
  }, [onUpload]);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (!file || !onUpload) return;

    setIsUploading(true);
    try {
      await onUpload(file);
    } finally {
      setIsUploading(false);
    }
  }, [onUpload]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'approved': return 'bg-green-500';
      case 'rejected': return 'bg-red-500';
      case 'in_review': return 'bg-yellow-500';
      default: return 'bg-zinc-500';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'approved': return 'Approved';
      case 'rejected': return 'Rejected';
      case 'in_review': return 'In Review';
      default: return 'Pending';
    }
  };

  // Grid view - show thumbnails
  if (viewMode === 'grid' || !selectedItem) {
    return (
      <div className="bg-zinc-900 rounded-lg p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-white">Review Items</h3>
          <label className="flex items-center gap-2 px-3 py-1.5 bg-blue-500 text-white rounded-lg cursor-pointer hover:bg-blue-600 transition-colors">
            <Plus className="w-4 h-4" />
            <span className="text-sm">Upload</span>
            <input
              type="file"
              accept="image/*,video/mp4,video/webm,video/quicktime"
              className="hidden"
              onChange={handleFileSelect}
              disabled={isUploading}
            />
          </label>
        </div>

        {reviewItems.length === 0 ? (
          <div
            className="border-2 border-dashed border-zinc-700 rounded-lg p-8 text-center"
            onDrop={handleDrop}
            onDragOver={handleDragOver}
          >
            <Upload className="w-12 h-12 text-zinc-600 mx-auto mb-3" />
            <p className="text-zinc-400 mb-1">Drop a file here or click Upload</p>
            <p className="text-sm text-zinc-600">Images or videos up to 100MB</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {reviewItems.map((item) => (
              <div
                key={item.id}
                className="relative group cursor-pointer rounded-lg overflow-hidden bg-zinc-800"
                onClick={() => {
                  setSelectedItemId(item.id);
                  setViewMode('review');
                }}
              >
                {/* Thumbnail - use thumbnailUrl if available, fall back to full url */}
                <div className="aspect-video relative">
                  {item.type === 'video' ? (
                    // Video thumbnail
                    <>
                      {item.thumbnailUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={item.thumbnailUrl}
                          alt={item.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <video
                          src={item.url}
                          className="w-full h-full object-cover"
                          muted
                          preload="metadata"
                        />
                      )}
                      {/* Video indicator */}
                      <div className="absolute top-1 right-1 bg-black/60 rounded px-1.5 py-0.5">
                        <Film className="w-3 h-3 text-white" />
                      </div>
                    </>
                  ) : (
                    // Image thumbnail
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={item.thumbnailUrl || item.url}
                      alt={item.name}
                      className="w-full h-full object-cover"
                    />
                  )}
                  {/* Overlay on hover */}
                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <Eye className="w-8 h-8 text-white" />
                  </div>
                </div>

                {/* Info bar */}
                <div className="p-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-white truncate flex-1">{item.name}</span>
                    <span className={`px-2 py-0.5 rounded text-xs text-white ${getStatusColor(item.status)}`}>
                      {getStatusLabel(item.status)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-1 text-xs text-zinc-500">
                    <span>v{item.version}</span>
                    <span>•</span>
                    <span>{item.annotations.filter(a => !a.resolved).length} comments</span>
                  </div>
                </div>
              </div>
            ))}

            {/* Add more button */}
            <label
              className="aspect-video border-2 border-dashed border-zinc-700 rounded-lg flex flex-col items-center justify-center cursor-pointer hover:border-zinc-500 transition-colors"
              onDrop={handleDrop}
              onDragOver={handleDragOver}
            >
              <Plus className="w-8 h-8 text-zinc-600 mb-1" />
              <span className="text-sm text-zinc-600">Add Media</span>
              <input
                type="file"
                accept="image/*,video/mp4,video/webm,video/quicktime"
                className="hidden"
                onChange={handleFileSelect}
                disabled={isUploading}
              />
            </label>
          </div>
        )}
      </div>
    );
  }

  // Review view - full image with annotations
  return (
    <div className={`bg-zinc-900 rounded-lg ${fullscreen ? 'h-full flex flex-col' : ''}`}>
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-zinc-800">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setViewMode('grid')}
            className="text-zinc-400 hover:text-white"
          >
            ← Back
          </button>
          <span className="text-white font-medium">{selectedItem.name}</span>
          <span className={`px-2 py-0.5 rounded text-xs text-white ${getStatusColor(selectedItem.status)}`}>
            {getStatusLabel(selectedItem.status)}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {onPopOut && (
            <button
              onClick={onPopOut}
              className="flex items-center gap-1 px-3 py-1.5 bg-zinc-700 text-white rounded-lg hover:bg-zinc-600 text-sm"
              title="Open in fullscreen modal"
            >
              <Maximize2 className="w-4 h-4" />
              Expand
            </button>
          )}
          {onStatusChange && selectedItem.status !== 'approved' && (
            <button
              onClick={() => onStatusChange(selectedItem.id, 'approved')}
              className="flex items-center gap-1 px-3 py-1.5 bg-green-500 text-white rounded-lg hover:bg-green-600 text-sm"
            >
              <Check className="w-4 h-4" />
              Approve
            </button>
          )}
          {onStatusChange && selectedItem.status !== 'rejected' && (
            <button
              onClick={() => onStatusChange(selectedItem.id, 'rejected')}
              className="flex items-center gap-1 px-3 py-1.5 bg-red-500 text-white rounded-lg hover:bg-red-600 text-sm"
            >
              <X className="w-4 h-4" />
              Reject
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className={`flex overflow-hidden ${fullscreen ? 'flex-1' : 'h-[600px]'}`}>
        {/* Media viewer - switch based on type */}
        <div className="flex-1 min-w-0 p-4 overflow-hidden">
          {selectedItem.type === 'video' ? (
            <VideoReviewer
              src={selectedItem.url}
              annotations={selectedItem.annotations}
              selectedAnnotationId={selectedAnnotationId}
              onAnnotationSelect={setSelectedAnnotationId}
              onAnnotationCreate={onAnnotationCreate ? (data) => onAnnotationCreate(selectedItem.id, data) : undefined}
            />
          ) : (
            <ImageReviewer
              src={selectedItem.url}
              annotations={selectedItem.annotations}
              selectedAnnotationId={selectedAnnotationId}
              onAnnotationSelect={setSelectedAnnotationId}
              onAnnotationCreate={onAnnotationCreate ? (data) => onAnnotationCreate(selectedItem.id, data) : undefined}
            />
          )}
        </div>

        {/* Sidebar */}
        <div className="w-80 flex flex-col border-l border-zinc-800">
          {/* Reviewer Assignment Section */}
          <div className="p-4 border-b border-zinc-800">
            <ReviewerAssignment
              reviewItemId={selectedItem.id}
              assignments={selectedItem.reviewers || []}
              currentUserId={currentUserId}
              onAssign={onAssignReviewers ? (userIds) => onAssignReviewers(selectedItem.id, userIds) : undefined}
              onRemove={onRemoveReviewer ? (userId) => onRemoveReviewer(selectedItem.id, userId) : undefined}
              onApprove={onApprove ? () => onApprove(selectedItem.id) : undefined}
              onReject={onReject ? (reason) => onReject(selectedItem.id, reason) : undefined}
            />
          </div>
          
          {/* Annotations Section */}
          <div className="flex-1 overflow-hidden">
            <AnnotationSidebar
              annotations={selectedItem.annotations}
              selectedAnnotationId={selectedAnnotationId}
              onSelect={setSelectedAnnotationId}
              onResolve={onAnnotationResolve || (() => {})}
              onReply={onAnnotationReply}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export default TaskReviewPanel;
