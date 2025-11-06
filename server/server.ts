/**
 * WebSocket Server for Collaborative Canvas
 * 
 * Handles:
 * - WebSocket connections via Socket.io
 * - Room management
 * - Drawing state synchronization
 * - User management
 */

import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import path from 'path';
import { DrawingStateManager, DrawingOperation, Point } from './drawing-state';
import { RoomManager } from './rooms';
import { v4 as uuidv4 } from 'uuid';

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

app.use(cors());
app.use(express.json());

// Serve static files from client directory (compiled JS files)
// When running from dist/, __dirname is dist/, so we need to go up to server/, then up to root, then into client/
const clientPath = path.resolve(__dirname, '../../client');
app.use(express.static(clientPath));

// Serve index.html for all routes (SPA)
app.get('*', (req, res) => {
  // Don't serve index.html for API routes
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'Not found' });
  }
  res.sendFile(path.join(clientPath, 'index.html'));
});

const drawingState = new DrawingStateManager();
const roomManager = new RoomManager();

// Default room
const DEFAULT_ROOM = 'default';

// WebSocket connection handling
io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);

  let currentRoom = DEFAULT_ROOM;
  let userId = socket.id;
  let userName = `User ${socket.id.substring(0, 6)}`;

  // Join default room
  if (!roomManager.roomExists(currentRoom)) {
    roomManager.createRoom(currentRoom);
  }

  const userColor = roomManager.assignUserColor(userId);
  socket.join(currentRoom);

  // Send initial state to new user
  const stateSnapshot = drawingState.getStateSnapshot(currentRoom);
  socket.emit('room-state', stateSnapshot);

  // Add user to room
  drawingState.addUser(currentRoom, userId, userName, userColor);

  // Notify others of new user
  socket.to(currentRoom).emit('user-joined', {
    userId,
    userName,
    color: userColor
  });

  // Handle room join
  socket.on('join-room', (data: { roomId: string; userName?: string }) => {
    // Validate input
    if (!data || typeof data !== 'object') {
      socket.emit('error', { message: 'Invalid join-room data' });
      return;
    }

    const { roomId, userName: newName } = data;
    
    // Validate roomId
    if (!roomId || typeof roomId !== 'string' || roomId.length > 50) {
      socket.emit('error', { message: 'Invalid room ID' });
      return;
    }
    
    // Sanitize room ID (prevent path traversal)
    const sanitizedRoomId = roomId.replace(/[^a-zA-Z0-9-_]/g, '');
    if (sanitizedRoomId !== roomId) {
      socket.emit('error', { message: 'Room ID contains invalid characters' });
      return;
    }
    
    // Leave current room
    socket.leave(currentRoom);
    socket.to(currentRoom).emit('user-left', { userId });

    // Join new room
    currentRoom = roomId;
    if (!roomManager.roomExists(currentRoom)) {
      roomManager.createRoom(currentRoom);
    }

    if (newName) {
      userName = newName;
    }

    socket.join(currentRoom);
    const newUserColor = roomManager.assignUserColor(userId);
    drawingState.addUser(currentRoom, userId, userName, newUserColor);

    // Send room state to user
    const snapshot = drawingState.getStateSnapshot(currentRoom);
    socket.emit('room-state', snapshot);

    // Notify others
    socket.to(currentRoom).emit('user-joined', {
      userId,
      userName,
      color: newUserColor
    });
  });

  // Handle drawing start - this is where we receive a new stroke from a client
  socket.on('draw-start', (data: { point: Point; color: string; lineWidth: number; operationId?: string }) => {
    // Validate input
    if (!data || !data.point || typeof data.point.x !== 'number' || typeof data.point.y !== 'number') {
      socket.emit('error', { message: 'Invalid draw-start data' });
      return;
    }

    // Validate and clamp values
    const color = typeof data.color === 'string' ? data.color : '#000000';
    const lineWidth = Math.max(1, Math.min(100, data.lineWidth || 5));
    const point: Point = {
      x: Math.max(0, data.point.x),
      y: Math.max(0, data.point.y)
    };

    // Use client-provided operation ID if available, otherwise generate one
    // This ensures operation IDs match between client and server
    const operationId = data.operationId || uuidv4();

    // Create operation object - this is our custom data structure
    const operation: DrawingOperation = {
      id: operationId, // Use client's ID or generated UUID
      userId, // Track who made this operation
      type: 'draw',
      timestamp: Date.now(),
      path: [point], // Start with single point, will grow as user draws
      color: color,
      lineWidth: lineWidth
    };

    // Add to server's operation history (this is the source of truth)
    drawingState.addOperation(currentRoom, operation);
    
    // Broadcast to all other users in the room (not back to sender)
    // socket.to() sends to room except the sender (prevents echo)
    socket.to(currentRoom).emit('draw-start', operation);
  });

  // Handle drawing progress (path updates)
  socket.on('draw-progress', (data: { operationId: string; point: Point }) => {
    // Validate input
    if (!data || !data.operationId || !data.point) {
      return; // Silently ignore invalid progress updates
    }

    if (typeof data.point.x !== 'number' || typeof data.point.y !== 'number') {
      return;
    }

    const state = drawingState.getRoomState(currentRoom);
    const operation = state.operations.find(op => op.id === data.operationId);

    // Only allow user to update their own operations
    // IMPORTANT: Check if operation exists and belongs to this user
    if (operation && operation.userId === userId && operation.path) {
      // Limit path length to prevent memory issues
      if (operation.path.length < 10000) {
        const newPoint = {
          x: Math.max(0, data.point.x),
          y: Math.max(0, data.point.y)
        };
        operation.path.push(newPoint);
        
        // Broadcast to ALL users in room (including sender, so they can see their own progress if needed)
        // But actually, we use socket.to() to exclude sender since they already see it locally
        socket.to(currentRoom).emit('draw-progress', {
          operationId: data.operationId,
          point: newPoint
        });
      }
    } else {
      // Log if operation not found (for debugging)
      if (!operation) {
        console.warn(`Operation ${data.operationId} not found for user ${userId}`);
      }
    }
  });

  // Handle drawing end
  socket.on('draw-end', (data: { operationId: string }) => {
    socket.to(currentRoom).emit('draw-end', {
      operationId: data.operationId,
      userId
    });
  });

  // Handle erasing
  socket.on('erase', (data: { point: Point; radius: number }) => {
    const operation: DrawingOperation = {
      id: uuidv4(),
      userId,
      type: 'erase',
      timestamp: Date.now(),
      path: [data.point],
      eraserRadius: data.radius
    };

    drawingState.addOperation(currentRoom, operation);
    socket.to(currentRoom).emit('erase', operation);
  });

  // Handle shape operations (rectangle, circle)
  socket.on('shape', (operation: DrawingOperation) => {
    console.log('Server received shape:', JSON.stringify(operation));
    if (!operation || !operation.startPoint || !operation.endPoint) {
      console.error('Invalid shape data:', operation);
      socket.emit('error', { message: 'Invalid shape data' });
      return;
    }

    // Create a proper copy of the operation
    const shapeOperation: DrawingOperation = {
      id: operation.id || uuidv4(),
      userId: userId,
      type: operation.type,
      timestamp: Date.now(),
      startPoint: { x: operation.startPoint.x, y: operation.startPoint.y },
      endPoint: { x: operation.endPoint.x, y: operation.endPoint.y },
      color: operation.color,
      lineWidth: operation.lineWidth
    };

    console.log('Server broadcasting shape:', JSON.stringify(shapeOperation), 'to room:', currentRoom);
    drawingState.addOperation(currentRoom, shapeOperation);
    socket.to(currentRoom).emit('shape', shapeOperation);
  });

  // Handle text operations
  socket.on('text', (operation: DrawingOperation) => {
    if (!operation || !operation.text || !operation.startPoint) {
      socket.emit('error', { message: 'Invalid text data' });
      return;
    }

    operation.id = operation.id || uuidv4();
    operation.userId = userId;
    operation.timestamp = Date.now();

    drawingState.addOperation(currentRoom, operation);
    socket.to(currentRoom).emit('text', operation);
  });

  // Handle image operations
  socket.on('image', (operation: DrawingOperation) => {
    if (!operation || !operation.imageData || !operation.startPoint) {
      socket.emit('error', { message: 'Invalid image data' });
      return;
    }

    operation.id = operation.id || uuidv4();
    operation.userId = userId;
    operation.timestamp = Date.now();

    drawingState.addOperation(currentRoom, operation);
    socket.to(currentRoom).emit('image', operation);
  });

  // Handle ping/pong for latency measurement
  socket.on('ping', (timestamp: number) => {
    socket.emit('pong', timestamp);
  });

  // Handle clear canvas
  socket.on('clear-canvas', () => {
    const operation: DrawingOperation = {
      id: uuidv4(),
      userId,
      type: 'clear',
      timestamp: Date.now()
    };

    drawingState.addOperation(currentRoom, operation);
    drawingState.getRoomState(currentRoom).operations = [operation]; // Clear history
    
    io.to(currentRoom).emit('clear-canvas', operation);
  });

  // Handle cursor movement
  socket.on('cursor-move', (data: { point: Point }) => {
    drawingState.updateUserCursor(currentRoom, userId, data.point);
    socket.to(currentRoom).emit('cursor-move', {
      userId,
      point: data.point,
      color: userColor
    });
  });

  // Handle undo request - this is our custom global undo implementation
  socket.on('undo', () => {
    // Remove last operation from this user's operations (or any operation if no userId specified)
    // This returns the undone operation or null if nothing to undo
    const undoneOp = drawingState.undoOperation(currentRoom, userId);
    
    // Only broadcast if there was actually something to undo
    if (undoneOp) {
      // Broadcast undo to ALL users in room (including sender)
      // We use io.to() instead of socket.to() so sender also gets the undo event
      // This ensures everyone's canvas state stays in sync
      io.to(currentRoom).emit('undo', {
        operationId: undoneOp.id, // ID of operation that was undone
        userId: undoneOp.userId // Who originally created this operation
      });
    }
    // If nothing to undo, silently ignore (don't send error - undo can be called repeatedly)
  });

  // Handle user name change
  socket.on('set-name', (data: { userName: string }) => {
    userName = data.userName;
    socket.to(currentRoom).emit('user-name-changed', {
      userId,
      userName
    });
  });

  // Handle disconnect
  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.id}`);
    
    socket.to(currentRoom).emit('user-left', { userId });
    drawingState.removeUser(currentRoom, userId);
    roomManager.releaseUserColor(userId);
  });

  // Cleanup inactive users periodically
  setInterval(() => {
    drawingState.cleanupInactiveUsers(currentRoom);
  }, 60000); // Every minute
});

// REST API endpoints
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: Date.now() });
});

app.get('/api/rooms', (req, res) => {
  const rooms = roomManager.getAllRooms();
  res.json(rooms);
});

const PORT = process.env.PORT || 3001;

httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`WebSocket server ready for connections`);
});

