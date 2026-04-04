import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import Sidebar from '@/components/layout/Sidebar';
import WorkspaceSidebar from '@/components/layout/WorkspaceSidebar';
import ClientProviders from '@/components/providers/ClientProviders';
import { MobileProvider } from '@/components/layout/MobileContext';
import MobileNav from '@/components/layout/MobileNav';
import MobileSidebarDrawer from '@/components/layout/MobileSidebarDrawer';

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
      <MobileProvider>
        <div className="flex h-screen overflow-hidden">
          {/* Desktop sidebars - hidden on mobile */}
          <div className="hidden md:flex">
            <Sidebar user={user} />
            <WorkspaceSidebar user={user} />
          </div>

          {/* Mobile sidebar drawer */}
          <MobileSidebarDrawer user={user} />

          {/* Main content area */}
          <main className="flex-1 flex flex-col overflow-hidden bg-chat-bg min-w-0">
            {/* Mobile top nav */}
            <MobileNav />
            {children}
          </main>
        </div>
      </MobileProvider>
    </ClientProviders>
  );
}
