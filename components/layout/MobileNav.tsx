'use client';

import { Menu, Rocket } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { useMobile } from './MobileContext';

export default function MobileNav() {
  const { toggleSidebar } = useMobile();
  const pathname = usePathname();

  // Chat pages have their own mobile header with hamburger built in
  if (pathname.startsWith('/chat/')) return null;

  return (
    <div className="md:hidden flex items-center h-12 px-3 gap-3 bg-channel-bg border-b border-black/20 shrink-0">
      <button
        onClick={toggleSidebar}
        className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"
        aria-label="Toggle sidebar"
      >
        <Menu className="w-5 h-5" />
      </button>
      <Rocket className="w-5 h-5 text-primary" />
      <span className="font-semibold text-sm truncate">Mission Control</span>
    </div>
  );
}
