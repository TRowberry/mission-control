'use client';

import { useState, useEffect, useCallback } from 'react';
import { Plus, Upload } from 'lucide-react';
import { ImageReviewer } from '@/components/review/ImageReviewer';
import { AnnotationSidebar } from '@/components/review/AnnotationSidebar';

interface Annotation {
  id: string;
  type: string;
  x: number | null;
  y: number | null;
  width?: number | null;
  height?: number | null;
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
}

interface ReviewItem {
  id: string;
  type: string;
  url: string;
  name: string;
  status: string;
  annotations: Annotation[];
}

export default function ReviewPage() {
  const [reviewItems, setReviewItems] = useState<ReviewItem[]>([]);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [selectedAnnotationId, setSelectedAnnotationId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const selectedItem = reviewItems.find((item) => item.id === selectedItemId);

  // Fetch review items
  useEffect(() => {
    async function fetchItems() {
      try {
        const res = await fetch('/api/review');
        if (res.ok) {
          const data = await res.json();
          setReviewItems(data.items || []);
          if (data.items?.length > 0) {
            setSelectedItemId(data.items[0].id);
          }
        }
      } catch (error) {
        console.error('Failed to fetch review items:', error);
      } finally {
        setLoading(false);
      }
    }
    fetchItems();
  }, []);

  // Handle file upload
  const handleUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Upload file first
    const formData = new FormData();
    formData.append('file', file);

    try {
      const uploadRes = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      if (!uploadRes.ok) throw new Error('Upload failed');
      const { url } = await uploadRes.json();

      // Create review item
      const createRes = await fetch('/api/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: file.name,
          url,
          type: 'image',
        }),
      });

      if (createRes.ok) {
        const newItem = await createRes.json();
        setReviewItems((prev) => [newItem, ...prev]);
        setSelectedItemId(newItem.id);
      }
    } catch (error) {
      console.error('Failed to upload:', error);
    }
  }, []);

  // Handle annotation creation
  const handleAnnotationCreate = useCallback(async (data: { 
    type: string; 
    x: number; 
    y: number; 
    width?: number;
    height?: number;
    content: string;
  }) => {
    if (!selectedItemId) return;

    try {
      const res = await fetch(`/api/review/${selectedItemId}/annotations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      if (res.ok) {
        const annotation = await res.json();
        setReviewItems((prev) =>
          prev.map((item) =>
            item.id === selectedItemId
              ? { ...item, annotations: [...(item.annotations || []), annotation] }
              : item
          )
        );
      }
    } catch (error) {
      console.error('Failed to create annotation:', error);
    }
  }, [selectedItemId]);

  // Handle annotation resolve
  const handleAnnotationResolve = useCallback(async (annotationId: string, resolved: boolean) => {
    try {
      const res = await fetch(`/api/annotations/${annotationId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resolved }),
      });

      if (res.ok) {
        setReviewItems((prev) =>
          prev.map((item) => ({
            ...item,
            annotations: item.annotations.map((a) =>
              a.id === annotationId ? { ...a, resolved } : a
            ),
          }))
        );
      }
    } catch (error) {
      console.error('Failed to resolve annotation:', error);
    }
  }, []);

  // Handle annotation reply
  const handleAnnotationReply = useCallback(async (annotationId: string, content: string) => {
    try {
      const res = await fetch(`/api/annotations/${annotationId}/replies`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      });

      if (res.ok) {
        const reply = await res.json();
        setReviewItems((prev) =>
          prev.map((item) => ({
            ...item,
            annotations: item.annotations.map((a) =>
              a.id === annotationId ? { ...a, replies: [...a.replies, reply] } : a
            ),
          }))
        );
      }
    } catch (error) {
      console.error('Failed to add reply:', error);
    }
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-zinc-400">Loading...</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-zinc-950">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-zinc-800">
        <h1 className="text-xl font-semibold text-white">Media Review</h1>
        <label className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg cursor-pointer hover:bg-blue-600 transition-colors">
          <Upload className="w-4 h-4" />
          <span>Upload Image</span>
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleUpload}
          />
        </label>
      </div>

      {/* Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Item list sidebar */}
        <div className="w-64 border-r border-zinc-800 overflow-y-auto">
          <div className="p-2">
            {reviewItems.length === 0 ? (
              <div className="p-4 text-center text-zinc-500">
                <p>No review items yet.</p>
                <p className="text-sm mt-1">Upload an image to get started.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {reviewItems.map((item) => (
                  <div
                    key={item.id}
                    className={`p-2 rounded-lg cursor-pointer transition-colors ${
                      selectedItemId === item.id
                        ? 'bg-zinc-800'
                        : 'hover:bg-zinc-800/50'
                    }`}
                    onClick={() => setSelectedItemId(item.id)}
                  >
                    <div className="aspect-video rounded overflow-hidden bg-zinc-900 mb-2">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={item.url}
                        alt={item.name}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <p className="text-sm text-white truncate">{item.name}</p>
                    <p className="text-xs text-zinc-500">
                      {(item.annotations || []).filter((a) => !a.resolved).length} open comments
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Main content */}
        {selectedItem ? (
          <>
            {/* Image viewer */}
            <div className="flex-1 p-4">
              <ImageReviewer
                src={selectedItem.url}
                annotations={selectedItem.annotations}
                selectedAnnotationId={selectedAnnotationId}
                onAnnotationSelect={setSelectedAnnotationId}
                onAnnotationCreate={handleAnnotationCreate}
              />
            </div>

            {/* Annotation sidebar */}
            <AnnotationSidebar
              annotations={selectedItem.annotations}
              selectedAnnotationId={selectedAnnotationId}
              onSelect={setSelectedAnnotationId}
              onResolve={handleAnnotationResolve}
              onReply={handleAnnotationReply}
            />
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center text-zinc-500">
              <p>Select an item to review</p>
              <p className="text-sm mt-1">or upload a new image</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
