'use client';

import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import { io, Socket } from 'socket.io-client';

interface OnlineUser {
  socketId: string;
  userId: string;
  username?: string;
  displayName?: string;
}

interface SocketContextType {
  socket: Socket | null;
  isConnected: boolean;
  onlineUsers: OnlineUser[];
  isUserOnline: (userId: string) => boolean;
  joinChannel: (channelId: string) => void;
  leaveChannel: (channelId: string) => void;
  sendMessage: (message: any) => void;
  startTyping: (channelId: string, user: any) => void;
  stopTyping: (channelId: string, user: any) => void;
}

const SocketContext = createContext<SocketContextType>({
  socket: null,
  isConnected: false,
  onlineUsers: [],
  isUserOnline: () => false,
  joinChannel: () => {},
  leaveChannel: () => {},
  sendMessage: () => {},
  startTyping: () => {},
  stopTyping: () => {},
});

export function useSocket() {
  return useContext(SocketContext);
}

interface SocketProviderProps {
  children: ReactNode;
  userId?: string;
  username?: string;
  displayName?: string;
}

export function SocketProvider({ children, userId, username, displayName }: SocketProviderProps) {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [onlineUsers, setOnlineUsers] = useState<OnlineUser[]>([]);

  useEffect(() => {
    // Connect to Socket.io server (same origin)
    const socketInstance = io({
      path: '/socket.io',
      transports: ['websocket', 'polling'],
    });

    socketInstance.on('connect', () => {
      console.log('[Socket] Connected:', socketInstance.id);
      setIsConnected(true);

      // Authenticate if we have user info
      if (userId) {
        socketInstance.emit('auth', { userId, username, displayName });
      }
    });

    socketInstance.on('disconnect', () => {
      console.log('[Socket] Disconnected');
      setIsConnected(false);
    });

    socketInstance.on('connect_error', (error) => {
      console.error('[Socket] Connection error:', error);
    });

    // Listen for online users updates
    socketInstance.on('users:online', (users: OnlineUser[]) => {
      console.log('[Socket] Online users updated:', users.length);
      setOnlineUsers(users);
    });

    setSocket(socketInstance);

    return () => {
      socketInstance.disconnect();
    };
  }, [userId, username, displayName]);

  const joinChannel = useCallback((channelId: string) => {
    if (socket && isConnected) {
      socket.emit('channel:join', channelId);
    }
  }, [socket, isConnected]);

  const leaveChannel = useCallback((channelId: string) => {
    if (socket && isConnected) {
      socket.emit('channel:leave', channelId);
    }
  }, [socket, isConnected]);

  const sendMessage = useCallback((message: any) => {
    if (socket && isConnected) {
      socket.emit('message:send', message);
    }
  }, [socket, isConnected]);

  const startTyping = useCallback((channelId: string, user: any) => {
    if (socket && isConnected) {
      socket.emit('typing:start', { channelId, user });
    }
  }, [socket, isConnected]);

  const stopTyping = useCallback((channelId: string, user: any) => {
    if (socket && isConnected) {
      socket.emit('typing:stop', { channelId, user });
    }
  }, [socket, isConnected]);

  const isUserOnline = useCallback((userId: string) => {
    return onlineUsers.some(u => u.userId === userId);
  }, [onlineUsers]);

  return (
    <SocketContext.Provider
      value={{
        socket,
        isConnected,
        onlineUsers,
        isUserOnline,
        joinChannel,
        leaveChannel,
        sendMessage,
        startTyping,
        stopTyping,
      }}
    >
      {children}
    </SocketContext.Provider>
  );
}
