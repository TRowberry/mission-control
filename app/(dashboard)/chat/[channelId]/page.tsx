import { notFound } from 'next/navigation';
import prisma from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import ChatHeader from '@/components/chat/ChatHeader';
import ChatView from '@/components/chat/ChatView';

interface ChatPageProps {
  params: Promise<{ channelId: string }>;
}

export default async function ChatPage({ params }: ChatPageProps) {
  const { channelId } = await params;
  const user = await getCurrentUser();

  if (!user) {
    notFound();
  }

  // Get channel (without messages - they load via WebSocket/fetch)
  let channel = await prisma.channel.findUnique({
    where: { id: channelId },
    include: {
      workspace: {
        select: { id: true, name: true },
      },
    },
  });

  // If not found by ID, try by slug
  if (!channel) {
    channel = await prisma.channel.findFirst({
      where: { slug: channelId },
      include: {
        workspace: {
          select: { id: true, name: true },
        },
      },
    });

    if (!channel) {
      notFound();
    }
  }

  return (
    <div className="flex flex-col h-full">
      <ChatHeader channel={channel} />
      <ChatView 
        channelId={channel.id} 
        currentUser={user}
      />
    </div>
  );
}
