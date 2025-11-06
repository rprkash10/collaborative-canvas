/**
 * Room Management
 * 
 * Handles room creation, user assignment, and color allocation
 */

export interface RoomConfig {
  id: string;
  name: string;
  maxUsers?: number;
  createdAt: number;
}

export class RoomManager {
  private rooms: Map<string, RoomConfig> = new Map();
  private userColors: Map<string, string> = new Map(); // userId -> color
  private readonly DEFAULT_COLORS = [
    '#FF6B6B', // Red
    '#4ECDC4', // Teal
    '#45B7D1', // Blue
    '#FFA07A', // Light Salmon
    '#98D8C8', // Mint
    '#F7DC6F', // Yellow
    '#BB8FCE', // Purple
    '#85C1E2', // Sky Blue
    '#F8B739', // Orange
    '#52BE80'  // Green
  ];
  private colorIndex = 0;

  /**
   * Create a new room
   */
  createRoom(roomId: string, roomName?: string): RoomConfig {
    const config: RoomConfig = {
      id: roomId,
      name: roomName || `Room ${roomId}`,
      createdAt: Date.now()
    };
    this.rooms.set(roomId, config);
    return config;
  }

  /**
   * Get room configuration
   */
  getRoom(roomId: string): RoomConfig | undefined {
    return this.rooms.get(roomId);
  }

  /**
   * Check if room exists
   */
  roomExists(roomId: string): boolean {
    return this.rooms.has(roomId);
  }

  /**
   * Assign a color to a user
   * Reuses colors if user already has one
   */
  assignUserColor(userId: string): string {
    if (this.userColors.has(userId)) {
      return this.userColors.get(userId)!;
    }

    const color = this.DEFAULT_COLORS[this.colorIndex % this.DEFAULT_COLORS.length];
    this.colorIndex++;
    this.userColors.set(userId, color);
    return color;
  }

  /**
   * Release user color (when user disconnects)
   */
  releaseUserColor(userId: string): void {
    this.userColors.delete(userId);
  }

  /**
   * Get user color
   */
  getUserColor(userId: string): string | undefined {
    return this.userColors.get(userId);
  }

  /**
   * Get all rooms
   */
  getAllRooms(): RoomConfig[] {
    return Array.from(this.rooms.values());
  }

  /**
   * Delete room
   */
  deleteRoom(roomId: string): void {
    this.rooms.delete(roomId);
  }
}

