'use client';

import { ReactNode } from 'react';
import { SocketProvider } from './SocketProvider';

interface ClientProvidersProps {
  children: ReactNode;
  user: {
    id: string;
    username: string;
    displayName: string;
  };
}

export default function ClientProviders({ children, user }: ClientProvidersProps) {
  return (
    <SocketProvider 
      userId={user.id} 
      username={user.username} 
      displayName={user.displayName}
    >
      {children}
    </SocketProvider>
  );
}
