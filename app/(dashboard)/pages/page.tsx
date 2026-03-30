'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import PagesList from '@/components/pages/PagesList';
import { FileText, Book } from 'lucide-react';

export default function PagesPage() {
  const router = useRouter();
  const [recentPages, setRecentPages] = useState<any[]>([]);

  useEffect(() => {
    fetchRecentPages();
  }, []);

  const fetchRecentPages = async () => {
    try {
      const res = await fetch('/api/pages?limit=5&type=PAGE');
      if (res.ok) {
        const data = await res.json();
        setRecentPages(data.slice(0, 5));
      }
    } catch (err) {
      console.error('Failed to fetch recent pages:', err);
    }
  };

  return (
    <div className="flex h-full">
      {/* Sidebar */}
      <div className="w-64 border-r border-gray-700 bg-sidebar-bg flex-shrink-0">
        <PagesList />
      </div>

      {/* Main content - welcome/recent pages */}
      <div className="flex-1 p-8 bg-chat-bg overflow-y-auto">
        <div className="max-w-2xl mx-auto">
          <h1 className="text-3xl font-bold mb-2">Pages</h1>
          <p className="text-gray-400 mb-8">
            Create and organize documentation, notes, and wiki pages.
          </p>

          <div className="grid gap-6">
            {/* Quick actions */}
            <div className="grid grid-cols-2 gap-4">
              <button
                onClick={async () => {
                  const res = await fetch('/api/pages', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      title: 'Untitled',
                      type: 'PAGE',
                      icon: '????',
                      content: { type: 'doc', content: [{ type: 'paragraph' }] },
                    }),
                  });
                  if (res.ok) {
                    const page = await res.json();
                    router.push(`/pages/${page.id}`);
                  }
                }}
                className="flex items-center gap-3 p-4 bg-gray-800 rounded-lg hover:bg-gray-700 transition-colors"
              >
                <FileText className="w-8 h-8 text-blue-400" />
                <div className="text-left">
                  <div className="font-semibold">New Page</div>
                  <div className="text-sm text-gray-400">Create a blank page</div>
                </div>
              </button>
              <button
                onClick={async () => {
                  const res = await fetch('/api/pages', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      title: 'New Booklet',
                      type: 'BOOKLET',
                      icon: '????',
                      content: { type: 'doc', content: [] },
                    }),
                  });
                  if (res.ok) {
                    router.refresh();
                  }
                }}
                className="flex items-center gap-3 p-4 bg-gray-800 rounded-lg hover:bg-gray-700 transition-colors"
              >
                <Book className="w-8 h-8 text-yellow-500" />
                <div className="text-left">
                  <div className="font-semibold">New Booklet</div>
                  <div className="text-sm text-gray-400">Folder to organize pages</div>
                </div>
              </button>
            </div>

            {/* Recent pages */}
            {recentPages.length > 0 && (
              <div>
                <h2 className="text-lg font-semibold mb-3">Recent Pages</h2>
                <div className="space-y-2">
                  {recentPages.map((page) => (
                    <button
                      key={page.id}
                      onClick={() => router.push(`/pages/${page.id}`)}
                      className="w-full flex items-center gap-3 p-3 bg-gray-800/50 rounded-lg hover:bg-gray-800 transition-colors text-left"
                    >
                      <span className="text-xl">{page.icon || '????'}</span>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate">{page.title}</div>
                        <div className="text-sm text-gray-500">
                          Updated {new Date(page.updatedAt).toLocaleDateString()}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Info box */}
            <div className="p-4 bg-primary/10 border border-primary/20 rounded-lg">
              <h3 className="font-semibold text-primary mb-2">???? About Booklets</h3>
              <p className="text-sm text-gray-300">
                Booklets let you organize related pages together, like folders. 
                Create a booklet, then drag pages into it or use the "Move to booklet" 
                option when editing a page.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
