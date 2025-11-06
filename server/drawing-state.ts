

export interface DrawingOperation {
  id: string;
  userId: string;
  type: 'draw' | 'erase' | 'clear' | 'rectangle' | 'circle' | 'text' | 'image';
  timestamp: number;
  path?: Point[];
  color?: string;
  lineWidth?: number;
  eraserRadius?: number;
  startPoint?: Point;
  endPoint?: Point;
  text?: string;
  fontSize?: number;
  imageData?: string; // Base64 encoded image
  imageWidth?: number;
  imageHeight?: number;
}

export interface Point {
  x: number;
  y: number;
  pressure?: number;
}

export interface RoomState {
  operations: DrawingOperation[];
  users: Map<string, UserInfo>;
}

export interface UserInfo {
  id: string;
  name: string;
  color: string;
  cursorPosition?: Point;
  lastSeen: number;
}

export class DrawingStateManager {
  private rooms: Map<string, RoomState> = new Map();
  private readonly MAX_OPERATIONS = 500; // Limit history size
  private readonly USER_TIMEOUT = 30000; // 30 seconds

  /**
   * Get or create room state
   */
  getRoomState(roomId: string): RoomState {
    if (!this.rooms.has(roomId)) {
      this.rooms.set(roomId, {
        operations: [],
        users: new Map()
      });
    }
    return this.rooms.get(roomId)!;
  }

  /**
   * Add a drawing operation to history
   */
  addOperation(roomId: string, operation: DrawingOperation): void {
    const state = this.getRoomState(roomId);
    state.operations.push(operation);

    // Trim history if too large
    if (state.operations.length > this.MAX_OPERATIONS) {
      state.operations.shift();
    }
  }

  /**
   * Get all operations for a room
   */
  getOperations(roomId: string): DrawingOperation[] {
    return this.getRoomState(roomId).operations;
  }

  /**
   * Undo last operation by a specific user or globally
   * Returns the operation that was undone, or null if nothing to undo
   */
  undoOperation(roomId: string, userId?: string): DrawingOperation | null {
    const state = this.getRoomState(roomId);
    const operations = state.operations;

    if (operations.length === 0) {
      return null;
    }

    // Find last operation (by userId if specified, otherwise any)
    let index = operations.length - 1;
    if (userId) {
      while (index >= 0 && operations[index].userId !== userId) {
        index--;
      }
    }

    if (index < 0) {
      return null;
    }

    const operation = operations[index];
    // Remove from history
    operations.splice(index, 1);
    return operation;
  }

  /**
   * Add user to room
   */
  addUser(roomId: string, userId: string, userName: string, color: string): void {
    const state = this.getRoomState(roomId);
    state.users.set(userId, {
      id: userId,
      name: userName,
      color: color,
      lastSeen: Date.now()
    });
  }

  /**
   * Remove user from room
   */
  removeUser(roomId: string, userId: string): void {
    const state = this.getRoomState(roomId);
    state.users.delete(userId);
  }

  /**
   * Update user cursor position
   */
  updateUserCursor(roomId: string, userId: string, position: Point): void {
    const state = this.getRoomState(roomId);
    const user = state.users.get(userId);
    if (user) {
      user.cursorPosition = position;
      user.lastSeen = Date.now();
    }
  }

  /**
   * Get all users in a room
   */
  getUsers(roomId: string): UserInfo[] {
    const state = this.getRoomState(roomId);
    return Array.from(state.users.values());
  }

  /**
   * Clean up inactive users
   */
  cleanupInactiveUsers(roomId: string): void {
    const state = this.getRoomState(roomId);
    const now = Date.now();
    const inactiveUsers: string[] = [];

    state.users.forEach((user, userId) => {
      if (now - user.lastSeen > this.USER_TIMEOUT) {
        inactiveUsers.push(userId);
      }
    });

    inactiveUsers.forEach(userId => state.users.delete(userId));
  }

  /**
   * Get room state snapshot for new user joining
   */
  getStateSnapshot(roomId: string): {
    operations: DrawingOperation[];
    users: UserInfo[];
  } {
    const state = this.getRoomState(roomId);
    return {
      operations: [...state.operations],
      users: Array.from(state.users.values())
    };
  }
}

