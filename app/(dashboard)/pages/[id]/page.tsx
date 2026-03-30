import { notFound } from 'next/navigation';
import prisma from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import PageEditorWrapper from './PageEditorWrapper';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function PageDetailPage({ params }: Props) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) {
    notFound();
  }

  const page = await prisma.page.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      icon: true,
      content: true,
      type: true,
      parentId: true,
      archived: true,
    },
  });

  if (!page || page.archived) {
    notFound();
  }

  return (
    <div className="flex h-full">
      <PageEditorWrapper page={page as any} />
    </div>
  );
}
