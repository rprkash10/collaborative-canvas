# Collaborative Canvas

A real-time collaborative drawing application where multiple users can draw simultaneously on the same canvas with instant synchronization.

## Live Demo

[https://collaborative-canvas-7f11c.up.railway.app/](https://collaborative-canvas-7f11c.up.railway.app/)

Share the link with others to draw together in real-time.

## Features

- Real-time Collaboration: Multiple users can draw simultaneously with instant synchronization
- Drawing Tools: Brush, eraser, shapes (rectangle, circle), text, and image support
- Mobile Touch Support: Works on mobile devices with touch gestures
- Performance Metrics: Real-time FPS counter and latency display
- Room System: Create separate canvases with different room IDs
- Global Undo/Redo: Undo and redo operations across all users
- User Indicators: See cursor positions and active users in real-time
- Customizable: Adjustable brush size, colors, and stroke width

## Setup

Prerequisites: Node.js (v16 or higher)

```bash
npm install && npm start
```

This will:
1. Install dependencies for both server and client
2. Build TypeScript files
3. Start the server on port 3001

Open `http://localhost:3001` in your browser.

## Testing with Multiple Users

1. Start the server:
   ```bash
   npm start
   ```

2. Open multiple browser windows/tabs:
   - Navigate to `http://localhost:3001` in each window
   - Or use the live demo and share the link

3. Test collaborative features:
   - Draw in one window - drawings appear instantly in all other windows
   - Multiple users can draw simultaneously
   - See cursor positions of other users in real-time
   - Test shapes, text, and image tools
   - Try global undo/redo functionality

## Technical Stack

- Frontend: Vanilla TypeScript, HTML5 Canvas (no frameworks)
- Backend: Node.js, Express, Socket.io
- Real-time: WebSocket-based synchronization

## Known Limitations

1. No Drawing Persistence: Drawings are lost when the server restarts
2. Limited Operation History: Maximum 500 operations per room (to prevent memory issues)
3. No Image Export: Cannot save drawings as images
4. No Authentication: All users are anonymous
5. Basic Conflict Resolution: Simultaneous operations may occasionally conflict

## Documentation

For detailed architecture and implementation details, see ARCHITECTURE.md.

## License

MIT
