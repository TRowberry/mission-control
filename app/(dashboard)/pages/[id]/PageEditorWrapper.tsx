'use client';

import PagesList from '@/components/pages/PagesList';
import PageEditor from '@/components/pages/PageEditor';

interface Page {
  id: string;
  title: string;
  icon: string | null;
  content: any;
  type: 'PAGE' | 'BOOKLET';
  parentId: string | null;
}

interface Props {
  page: Page;
}

export default function PageEditorWrapper({ page }: Props) {
  return (
    <>
      {/* Sidebar */}
      <div className="w-64 border-r border-gray-700 bg-sidebar-bg flex-shrink-0">
        <PagesList selectedId={page.id} />
      </div>

      {/* Editor */}
      <div className="flex-1">
        <PageEditor page={page} />
      </div>
    </>
  );
}
