# Architecture

Technical architecture and design decisions for the Collaborative Canvas application.

## Data Flow Diagram

### Drawing Operation Flow

```
User Action (Mouse/Touch)
    │
    ▼
CanvasManager (client) - Immediate local rendering
    │
    └─► WebSocket → Server
        │
        ├─► Store operation in history
        │
        └─► Broadcast to all other clients
            │
            ▼
        Other clients receive and render
```

**Key Points:**
- Local rendering provides instant feedback
- Server stores operation and broadcasts to all clients
- Each client maintains own operation history for undo/redo

## WebSocket Protocol

### Client → Server Messages

| Event | Payload | Description |
|-------|---------|-------------|
| `join-room` | `{ roomId: string, userName?: string }` | Join/create a room |
| `draw-start` | `{ point: {x, y}, color: string, lineWidth: number, operationId: string }` | Start drawing stroke |
| `draw-progress` | `{ operationId: string, point: {x, y} }` | Update ongoing stroke |
| `draw-end` | `{ operationId: string }` | End drawing stroke |
| `erase` | `{ point: {x, y}, radius: number }` | Erase at point |
| `clear-canvas` | `{}` | Clear entire canvas |
| `undo` | `{}` | Undo last operation |
| `cursor-move` | `{ point: {x, y} }` | Update cursor position |
| `set-name` | `{ userName: string }` | Change display name |

### Server → Client Messages

| Event | Payload | Description |
|-------|---------|-------------|
| `room-state` | `{ operations: DrawingOperation[], users: UserInfo[] }` | Initial room state |
| `draw-start` | `DrawingOperation` | Remote user started drawing |
| `draw-progress` | `{ operationId: string, point: Point }` | Remote drawing progress |
| `draw-end` | `{ operationId: string, userId: string }` | Remote drawing ended |
| `erase` | `DrawingOperation` | Remote erase operation |
| `clear-canvas` | `DrawingOperation` | Canvas cleared |
| `undo` | `{ operationId: string, userId: string }` | Operation undone |
| `user-joined` | `{ userId: string, userName: string, color: string }` | User joined room |
| `user-left` | `{ userId: string }` | User left room |
| `cursor-move` | `{ userId: string, point: Point, color: string }` | Remote cursor moved |

## Undo/Redo Strategy

### Global Undo Implementation

**Challenge:** When any user undoes an operation, all clients must remove it.

**Solution:** Operation-based history with global synchronization.

1. **Operation Storage**: Each drawing operation stored individually with unique ID
2. **Undo Process**:
   ```
   User clicks Undo
   → Remove from local history
   → Send undo event to server
   → Server removes from server history
   → Server broadcasts to all clients
   → All clients remove operation and redraw
   ```
3. **Redraw Strategy**: Full canvas redraw on undo (simple, reliable)

**Limitations:**
- Linear undo only (can't undo specific operations)
- Full redraw required (could be optimized)

### Redo Implementation

- Undone operations stored in local `undoStack`
- Redo restores from stack (local only)
- New operations clear redo stack

## Performance Decisions

### 1. Socket.io over Native WebSockets

**Why:** 
- Automatic reconnection handling
- Built-in room support
- Better browser compatibility
- HTTP long-polling fallback

### 2. Operation-Based State

**Why:**
- Enables undo/redo functionality
- Easier state synchronization between clients
- Simpler persistence (can save operation history)
- Easier debugging with operation history

### 3. Path Optimization

**Implementation:**
```typescript
// Skip points too close together (< 2px distance)
if (distance < 2) return;
```

**Why:** Reduces network traffic and processing overhead for smooth drawing.

### 4. Canvas Layering

**Structure:**
- Main canvas: Drawing operations
- Cursor canvas: Cursor preview and remote cursors

**Why:** Separate layers prevent unnecessary redraws when cursors move.

### 5. Operation History Limit

**Limit:** 500 operations per room

**Why:** Prevents memory issues with long drawing sessions. Oldest operations removed when limit exceeded.

### 6. Full Redraw on Undo

**Why:** 
- Simpler implementation
- Guaranteed correct state
- Performance acceptable for typical use

## Conflict Resolution

### Simultaneous Drawing

**Problem:** Multiple users drawing at the same time in overlapping areas.

**Solution:** Last-write-wins with FIFO ordering
- Operations applied in order received
- Each operation has unique ID and timestamp
- Works well for drawing (additive)
- Works less well for erasing (can create gaps)

**Future Enhancement:** Operation merging for overlapping operations

### Network Latency

**Problem:** Network delay causes jittery drawing.

**Solution:** Optimistic rendering
- Local canvas updates immediately (no waiting for server)
- Remote updates applied as received
- Path optimization reduces network traffic

### State Synchronization

**Problem:** Clients may miss operations or have inconsistent state.

**Solution:** 
- Initial state snapshot on room join
- All operations broadcast to all clients
- Operation IDs prevent duplicates
- Clients can rejoin to resync state

## System Architecture

```
┌─────────────┐         WebSocket          ┌─────────────┐
│   Client 1  │◄──────────────────────────►│             │
└─────────────┘                              │   Server    │
                                             │  (Node.js)  │
┌─────────────┐         WebSocket          │             │
│   Client 2  │◄──────────────────────────►│             │
└─────────────┘                              └─────────────┘
```

**Server Components:**
- `DrawingStateManager`: Manages operation history per room
- `RoomManager`: Handles room creation and user color assignment
- Socket.io server: WebSocket communication

**Client Components:**
- `CanvasManager`: Drawing logic and local rendering
- `WebSocketManager`: WebSocket communication
