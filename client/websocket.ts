/**
 * WebSocket Client Manager
 * 
 * Handles all WebSocket communication:
 * - Connection management
 * - Real-time event handling
 * - User management
 * - Cursor synchronization
 */

import { DrawingOperation, Point } from './canvas.js';

export interface UserInfo {
  id: string;
  name: string;
  color: string;
  cursorPosition?: Point;
}

export class WebSocketManager {
  private socket: any; // Socket.io client
  private userId: string = '';
  private userName: string = 'User';
  private currentRoom: string = 'default';
  private users: Map<string, UserInfo> = new Map();
  private isConnected = false;

  constructor(serverUrl: string) {
    const ioClient = (window as any).io;
    
    if (!ioClient) {
      throw new Error('Socket.io client not loaded. Make sure to include socket.io script in HTML.');
    }
    
    this.socket = ioClient(serverUrl);
    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    this.socket.on('connect', () => {
      this.isConnected = true;
      this.userId = this.socket.id;
      this.onConnected?.(this.userId);
    });

    this.socket.on('disconnect', () => {
      this.isConnected = false;
      this.onDisconnected?.();
    });

    this.socket.on('connect_error', (error: Error) => {
      this.onError?.(error);
      setTimeout(() => {
        if (!this.isConnected) {
          this.socket.connect();
        }
      }, 3000);
    });

    // Room state (initial state when joining)
    this.socket.on('room-state', (data: { operations: DrawingOperation[]; users: UserInfo[] }) => {
      this.users = new Map(data.users.map(u => [u.id, u]));
      this.onRoomState?.(data.operations, Array.from(this.users.values()));
    });

    this.socket.on('draw-start', (operation: DrawingOperation) => {
      if (operation.userId !== this.userId) {
        this.onRemoteDrawStart?.(operation);
      }
    });

    this.socket.on('draw-progress', (data: { operationId: string; point: Point }) => {
      this.onRemoteDrawProgress?.(data.operationId, data.point);
    });

    this.socket.on('draw-end', (data: { operationId: string; userId: string }) => {
      if (data.userId !== this.userId) {
        this.onRemoteDrawEnd?.(data.operationId);
      }
    });

    this.socket.on('erase', (operation: DrawingOperation) => {
      if (operation.userId !== this.userId) {
        this.onRemoteErase?.(operation);
      }
    });

    this.socket.on('shape', (operation: DrawingOperation) => {
      if (operation.userId !== this.userId) {
        this.onRemoteShape?.(operation);
      }
    });

    this.socket.on('text', (operation: DrawingOperation) => {
      if (operation.userId !== this.userId) {
        this.onRemoteText?.(operation);
      }
    });

    this.socket.on('image', (operation: DrawingOperation) => {
      if (operation.userId !== this.userId) {
        this.onRemoteImage?.(operation);
      }
    });

    this.socket.on('clear-canvas', (operation: DrawingOperation) => {
      this.onRemoteClear?.(operation);
    });

    this.socket.on('undo', (data: { operationId: string; userId: string }) => {
      this.onRemoteUndo?.(data.operationId, data.userId);
    });

    // User events
    this.socket.on('user-joined', (data: { userId: string; userName: string; color: string }) => {
      this.users.set(data.userId, {
        id: data.userId,
        name: data.userName,
        color: data.color
      });
      this.onUserJoined?.(data);
    });

    this.socket.on('user-left', (data: { userId: string }) => {
      this.users.delete(data.userId);
      this.onUserLeft?.(data.userId);
    });

    this.socket.on('user-name-changed', (data: { userId: string; userName: string }) => {
      const user = this.users.get(data.userId);
      if (user) {
        user.name = data.userName;
        this.onUserNameChanged?.(data);
      }
    });

    this.socket.on('cursor-move', (data: { userId: string; point: Point; color: string }) => {
      if (data.userId !== this.userId) {
        const user = this.users.get(data.userId);
        if (user) {
          user.cursorPosition = data.point;
          this.onRemoteCursorMove?.(data.userId, data.point, data.color);
        }
      }
    });
  }

  // Send drawing start
  sendDrawStart(point: Point, color: string, lineWidth: number, operationId: string): void {
    // Include operation ID so server can track it for progress updates
    this.socket.emit('draw-start', { point, color, lineWidth, operationId });
  }

  // Send drawing progress
  sendDrawProgress(operationId: string, point: Point): void {
    this.socket.emit('draw-progress', { operationId, point });
  }

  // Send drawing end
  sendDrawEnd(operationId: string): void {
    this.socket.emit('draw-end', { operationId });
  }

  // Send erase
  sendErase(point: Point, radius: number): void {
    this.socket.emit('erase', { point, radius });
  }

  // Send shape operation
  sendShape(operation: DrawingOperation): void {
    this.socket.emit('shape', operation);
  }

  // Send text operation
  sendText(operation: DrawingOperation): void {
    this.socket.emit('text', operation);
  }

  // Send image operation
  sendImage(operation: DrawingOperation): void {
    this.socket.emit('image', operation);
  }

  // Send clear canvas
  sendClearCanvas(): void {
    this.socket.emit('clear-canvas');
  }

  // Send undo
  sendUndo(): void {
    this.socket.emit('undo');
  }

  // Send cursor movement
  sendCursorMove(point: Point): void {
    this.socket.emit('cursor-move', { point });
  }

  // Expose socket for ping/pong
  getSocket() {
    return this.socket;
  }

  // Join room
  joinRoom(roomId: string, userName?: string): void {
    this.currentRoom = roomId;
    if (userName) {
      this.userName = userName;
    }
    this.socket.emit('join-room', { roomId, userName: this.userName });
  }

  // Set user name
  setUserName(userName: string): void {
    this.userName = userName;
    this.socket.emit('set-name', { userName });
  }

  // Getters
  getUserId(): string {
    return this.userId;
  }

  getUserName(): string {
    return this.userName;
  }

  getUsers(): UserInfo[] {
    return Array.from(this.users.values());
  }

  getCurrentRoom(): string {
    return this.currentRoom;
  }

  isSocketConnected(): boolean {
    return this.isConnected;
  }

  // Callbacks
  onConnected?: (userId: string) => void;
  onDisconnected?: () => void;
  onError?: (error: Error) => void;
  onRoomState?: (operations: DrawingOperation[], users: UserInfo[]) => void;
  onRemoteDrawStart?: (operation: DrawingOperation) => void;
  onRemoteDrawProgress?: (operationId: string, point: Point) => void;
  onRemoteDrawEnd?: (operationId: string) => void;
  onRemoteErase?: (operation: DrawingOperation) => void;
  onRemoteShape?: (operation: DrawingOperation) => void;
  onRemoteText?: (operation: DrawingOperation) => void;
  onRemoteImage?: (operation: DrawingOperation) => void;
  onRemoteClear?: (operation: DrawingOperation) => void;
  onRemoteUndo?: (operationId: string, userId: string) => void;
  onUserJoined?: (data: { userId: string; userName: string; color: string }) => void;
  onUserLeft?: (userId: string) => void;
  onUserNameChanged?: (data: { userId: string; userName: string }) => void;
  onRemoteCursorMove?: (userId: string, point: Point, color: string) => void;
}

