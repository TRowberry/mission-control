// Custom server with Socket.io integration
const { createServer } = require('http');
const { parse } = require('url');
const next = require('next');
const { Server } = require('socket.io');

// Import scheduler
const { startScheduler } = require('./scheduler');

const dev = process.env.NODE_ENV !== 'production';
const hostname = process.env.HOSTNAME || '0.0.0.0';
const port = parseInt(process.env.PORT || '3000', 10);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

// Store connected users
const connectedUsers = new Map();

app.prepare().then(() => {
  const httpServer = createServer((req, res) => {
    const parsedUrl = parse(req.url, true);
    handle(req, res, parsedUrl);
  });

  // Initialize Socket.io
  const io = new Server(httpServer, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
    },
    // Increase timeout for slower connections
    pingTimeout: 60000,
  });

  // Make io accessible globally for API routes
  global.io = io;
  // Also expose connectedUsers for finding user sockets
  global.connectedUsers = connectedUsers;

  io.on('connection', (socket) => {
    console.log(`[Socket] Client connected: ${socket.id}`);

    // Handle user authentication
    socket.on('auth', (userData) => {
      if (userData?.userId) {
        connectedUsers.set(socket.id, {
          ...userData,
          socketId: socket.id,
        });
        console.log(`[Socket] User authenticated: ${userData.userId}`);
        
        // Join user-specific room for direct notifications
        socket.join(`user:${userData.userId}`);
        console.log(`[Socket] ${socket.id} joined user:${userData.userId}`);
        
        // Broadcast updated user list
        io.emit('users:online', Array.from(connectedUsers.values()));
      }
    });

    // Join a channel room
    socket.on('channel:join', (channelId) => {
      socket.join(`channel:${channelId}`);
      console.log(`[Socket] ${socket.id} joined channel:${channelId}`);
    });

    // Leave a channel room
    socket.on('channel:leave', (channelId) => {
      socket.leave(`channel:${channelId}`);
      console.log(`[Socket] ${socket.id} left channel:${channelId}`);
    });

    // Handle new message (emitted from API route, but can also be direct)
    socket.on('message:send', (message) => {
      // Broadcast to everyone in the channel
      io.to(`channel:${message.channelId}`).emit('message:new', message);
      
      // Also send directly to mentioned users (for cross-channel notifications)
      if (message.mentions && message.mentions.length > 0) {
        message.mentions.forEach((mention) => {
          const userId = mention.userId || mention;
          // Send to user's personal room (they may not be in the channel)
          io.to(`user:${userId}`).emit('message:new', message);
        });
      }
    });

    // Handle typing indicator
    socket.on('typing:start', ({ channelId, user }) => {
      socket.to(`channel:${channelId}`).emit('typing:update', {
        userId: user.id,
        username: user.displayName || user.username,
        isTyping: true,
      });
    });

    socket.on('typing:stop', ({ channelId, user }) => {
      socket.to(`channel:${channelId}`).emit('typing:update', {
        userId: user.id,
        username: user.displayName || user.username,
        isTyping: false,
      });
    });

    // Handle disconnect
    socket.on('disconnect', () => {
      const user = connectedUsers.get(socket.id);
      if (user) {
        console.log(`[Socket] User disconnected: ${user.userId}`);
        connectedUsers.delete(socket.id);
        io.emit('users:online', Array.from(connectedUsers.values()));
      } else {
        console.log(`[Socket] Client disconnected: ${socket.id}`);
      }
    });
  });

  httpServer.listen(port, hostname, () => {
    console.log(`> Ready on http://${hostname}:${port}`);
    console.log(`> Socket.io server running`);
    
    // Start the agent scheduler
    startScheduler();
  });
});
