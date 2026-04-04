'use client';

import { useMobile } from './MobileContext';
import Sidebar from './Sidebar';
import WorkspaceSidebar from './WorkspaceSidebar';
import { cn } from '@/lib/utils';

interface User {
  id: string;
  displayName: string;
  avatar: string | null;
  status: string;
}

interface MobileSidebarDrawerProps {
  user: User;
}

export default function MobileSidebarDrawer({ user }: MobileSidebarDrawerProps) {
  const { isSidebarOpen, closeSidebar } = useMobile();

  return (
    <>
      {/* Backdrop */}
      <div
        className={cn(
          'md:hidden fixed inset-0 bg-black/50 z-40 transition-opacity duration-200',
          isSidebarOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        )}
        onClick={closeSidebar}
      />

      {/* Drawer */}
      <div
        className={cn(
          'md:hidden fixed inset-y-0 left-0 z-50 flex',
          'transform transition-transform duration-200 ease-out',
          isSidebarOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <Sidebar user={user} />
        <WorkspaceSidebar user={user} mobile />
      </div>
    </>
  );
}
