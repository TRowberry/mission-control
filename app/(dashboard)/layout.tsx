import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import Sidebar from '@/components/layout/Sidebar';
import WorkspaceSidebar from '@/components/layout/WorkspaceSidebar';
import ClientProviders from '@/components/providers/ClientProviders';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();

  if (!user) {
    redirect('/login');
  }

  return (
    <ClientProviders user={{ id: user.id, username: user.username, displayName: user.displayName }}>
      <div className="flex h-screen overflow-hidden">
        {/* Server/Workspace selector (Discord-style left bar) */}
        <Sidebar user={user} />
        
        {/* Channel/Section sidebar */}
        <WorkspaceSidebar user={user} />
        
        {/* Main content area */}
        <main className="flex-1 flex flex-col overflow-hidden bg-chat-bg">
          {children}
        </main>
      </div>
    </ClientProviders>
  );
}
