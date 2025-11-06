/**
 * Main Application Initialization
 * 
 * Connects all components together:
 * - Canvas Manager
 * - WebSocket Manager
 * - UI Controls
 * - User Management
 */

import { CanvasManager, Point, DrawingOperation } from './canvas.js';
import { WebSocketManager } from './websocket.js';

class CollaborativeCanvasApp {
  private canvasManager!: CanvasManager;
  private wsManager!: WebSocketManager;
  private mainCanvas!: HTMLCanvasElement;
  private cursorCanvas!: HTMLCanvasElement;
  private userCursors: Map<string, { element: HTMLDivElement; color: string }> = new Map();
  
  // UI Elements
  private brushBtn!: HTMLButtonElement;
  private eraserBtn!: HTMLButtonElement;
  private rectangleBtn!: HTMLButtonElement;
  private circleBtn!: HTMLButtonElement;
  private textBtn!: HTMLButtonElement;
  private imageBtn!: HTMLButtonElement;
  private imageInput!: HTMLInputElement;
  private clearBtn!: HTMLButtonElement;
  private colorPicker!: HTMLInputElement;
  private strokeWidth!: HTMLInputElement;
  private widthValue!: HTMLElement;
  private undoBtn!: HTMLButtonElement;
  private redoBtn!: HTMLButtonElement;
  private userNameDisplay!: HTMLElement;
  private nameInput!: HTMLInputElement;
  private userCount!: HTMLElement;
  private usersList!: HTMLUListElement;
  private roomInput!: HTMLInputElement;
  private joinRoomBtn!: HTMLButtonElement;
  private status!: HTMLElement;
  private fpsCounter!: HTMLElement;
  private latencyDisplay!: HTMLElement;

  constructor() {
    // Wait for DOM to be fully loaded before initializing
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => this.init());
    } else {
      this.init();
    }
  }

  private init(): void {
    // Get canvas elements
    this.mainCanvas = document.getElementById('main-canvas') as HTMLCanvasElement;
    this.cursorCanvas = document.getElementById('cursor-canvas') as HTMLCanvasElement;

    if (!this.mainCanvas || !this.cursorCanvas) {
      console.error('Canvas elements not found');
      alert('Error: Canvas elements not found. Please refresh the page.');
      return;
    }

    // Initialize managers
    const serverUrl = (window as any).WS_SERVER_URL || window.location.origin;
    try {
      this.wsManager = new WebSocketManager(serverUrl);
      this.canvasManager = new CanvasManager(this.mainCanvas, this.cursorCanvas);
    } catch (error) {
      console.error('Failed to initialize managers:', error);
      alert('Error initializing application. Please check console for details.');
      return;
    }

    // Get UI elements - add null checks
    this.brushBtn = document.getElementById('brush-btn') as HTMLButtonElement;
    this.eraserBtn = document.getElementById('eraser-btn') as HTMLButtonElement;
    this.rectangleBtn = document.getElementById('rectangle-btn') as HTMLButtonElement;
    this.circleBtn = document.getElementById('circle-btn') as HTMLButtonElement;
    this.textBtn = document.getElementById('text-btn') as HTMLButtonElement;
    this.imageBtn = document.getElementById('image-btn') as HTMLButtonElement;
    this.imageInput = document.getElementById('image-input') as HTMLInputElement;
    this.clearBtn = document.getElementById('clear-btn') as HTMLButtonElement;
    this.colorPicker = document.getElementById('color-picker') as HTMLInputElement;
    this.strokeWidth = document.getElementById('stroke-width') as HTMLInputElement;
    this.widthValue = document.getElementById('width-value') as HTMLElement;
    this.undoBtn = document.getElementById('undo-btn') as HTMLButtonElement;
    this.redoBtn = document.getElementById('redo-btn') as HTMLButtonElement;
    this.userNameDisplay = document.getElementById('user-name') as HTMLElement;
    this.nameInput = document.getElementById('name-input') as HTMLInputElement;
    this.userCount = document.getElementById('user-count') as HTMLElement;
    this.usersList = document.getElementById('users-list') as HTMLUListElement;
    this.roomInput = document.getElementById('room-input') as HTMLInputElement;
    this.joinRoomBtn = document.getElementById('join-room-btn') as HTMLButtonElement;
    this.status = document.getElementById('status') as HTMLElement;
    this.fpsCounter = document.getElementById('fps-counter') as HTMLElement;
    this.latencyDisplay = document.getElementById('latency-display') as HTMLElement;

    // Verify all UI elements exist
    const uiElements = [
      this.brushBtn, this.eraserBtn, this.rectangleBtn, this.circleBtn,
      this.textBtn, this.imageBtn, this.imageInput, this.clearBtn,
      this.colorPicker, this.strokeWidth, this.widthValue, this.undoBtn,
      this.redoBtn, this.userNameDisplay, this.nameInput, this.userCount,
      this.usersList, this.roomInput, this.joinRoomBtn, this.status,
      this.fpsCounter, this.latencyDisplay
    ];

    const missingElements = uiElements.filter(el => !el);
    if (missingElements.length > 0) {
      console.error('Missing UI elements:', missingElements);
      alert('Error: Some UI elements not found. Please refresh the page.');
      return;
    }

    this.setupEventListeners();
    this.setupWebSocketCallbacks();
    this.setupCanvasCallbacks();
    this.setupPerformanceMetrics();

    // Initialize button states
    this.undoBtn.disabled = !this.canvasManager.canUndo();
    this.redoBtn.disabled = !this.canvasManager.canRedo();
  }

  private setupPerformanceMetrics(): void {
    // FPS Counter
    let lastTime = performance.now();
    let frameCount = 0;
    let fps = 60;

    const updateFPS = () => {
      frameCount++;
      const currentTime = performance.now();
      const elapsed = currentTime - lastTime;

      if (elapsed >= 1000) {
        fps = Math.round((frameCount * 1000) / elapsed);
        this.fpsCounter.textContent = fps.toString();
        frameCount = 0;
        lastTime = currentTime;
      }
      requestAnimationFrame(updateFPS);
    };
    updateFPS();

    // Latency measurement
    let pingInterval: number;
    const measureLatency = () => {
      const startTime = performance.now();
      this.wsManager.getSocket().emit('ping', Date.now());
      
      // Set timeout for latency measurement
      pingInterval = window.setInterval(() => {
        this.wsManager.getSocket().emit('ping', Date.now());
      }, 2000);
    };

    // Start latency measurement when connected
    const originalOnConnected = this.wsManager.onConnected;
    this.wsManager.onConnected = (userId) => {
      if (originalOnConnected) originalOnConnected(userId);
      measureLatency();
    };

    // Listen for pong
    this.wsManager.getSocket().on('pong', (timestamp: number) => {
      const latency = Math.round(performance.now() - timestamp);
      this.latencyDisplay.textContent = latency.toString();
    });
  }

  private setupEventListeners(): void {
    // Tool selection
    const toolButtons = [this.brushBtn, this.eraserBtn, this.rectangleBtn, this.circleBtn, this.textBtn, this.imageBtn];
    const deactivateAllTools = () => {
      toolButtons.forEach(btn => btn.classList.remove('active'));
    };

    this.brushBtn.addEventListener('click', () => {
      deactivateAllTools();
      this.brushBtn.classList.add('active');
      this.canvasManager.setTool('brush');
    });

    this.eraserBtn.addEventListener('click', () => {
      deactivateAllTools();
      this.eraserBtn.classList.add('active');
      this.canvasManager.setTool('eraser');
    });

    this.rectangleBtn.addEventListener('click', () => {
      deactivateAllTools();
      this.rectangleBtn.classList.add('active');
      this.canvasManager.setTool('rectangle');
    });

    this.circleBtn.addEventListener('click', () => {
      deactivateAllTools();
      this.circleBtn.classList.add('active');
      this.canvasManager.setTool('circle');
    });

    this.textBtn.addEventListener('click', () => {
      deactivateAllTools();
      this.textBtn.classList.add('active');
      this.canvasManager.setTool('text');
    });

    this.imageBtn.addEventListener('click', () => {
      this.imageInput.click();
    });

    this.imageInput.addEventListener('change', (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file && file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = (event) => {
          const imageData = event.target?.result as string;
          const img = new Image();
          img.onload = () => {
            // User will click on canvas to place image
            this.canvasManager.setTool('image');
            const placeImage = (e: MouseEvent) => {
              const rect = this.mainCanvas.getBoundingClientRect();
              const point = {
                x: Math.max(0, Math.min(e.clientX - rect.left, this.mainCanvas.width)),
                y: Math.max(0, Math.min(e.clientY - rect.top, this.mainCanvas.height))
              };
              
              const operation = {
                id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                userId: this.wsManager.getUserId(),
                type: 'image' as const,
                timestamp: Date.now(),
                startPoint: point,
                imageData: imageData,
                imageWidth: Math.min(img.width, 300),
                imageHeight: Math.min(img.height, 300)
              };
              
              this.canvasManager.drawImageFromData(operation);
              this.canvasManager.addOperation(operation);
              this.wsManager.sendImage(operation);
              
              // Reset tool and remove listener
              this.canvasManager.setTool('brush');
              this.brushBtn.classList.add('active');
              this.imageBtn.classList.remove('active');
              this.mainCanvas.removeEventListener('click', placeImage);
            };
            
            this.mainCanvas.addEventListener('click', placeImage, { once: true });
          };
          img.src = imageData;
        };
        reader.readAsDataURL(file);
      }
    });

    // Clear canvas
    this.clearBtn.addEventListener('click', () => {
      if (confirm('Clear the entire canvas? This cannot be undone.')) {
        this.canvasManager.clearCanvas();
        this.wsManager.sendClearCanvas();
      }
    });

    // Color picker
    this.colorPicker.addEventListener('change', (e) => {
      const color = (e.target as HTMLInputElement).value;
      this.canvasManager.setColor(color);
    });

    // Stroke width
    this.strokeWidth.addEventListener('input', (e) => {
      const width = parseInt((e.target as HTMLInputElement).value);
      this.widthValue.textContent = width.toString();
      this.canvasManager.setLineWidth(width);
      this.canvasManager.setEraserRadius(width);
    });

    // Undo/Redo
    this.undoBtn.addEventListener('click', () => {
      const undone = this.canvasManager.undo();
      if (undone) {
        this.wsManager.sendUndo();
        // Enable redo button when something is undone
        this.redoBtn.disabled = false;
      } else {
        // Disable undo button if nothing to undo
        this.undoBtn.disabled = true;
      }
    });

    this.redoBtn.addEventListener('click', () => {
      const redone = this.canvasManager.redo();
      if (redone) {
        // Disable redo button if nothing left to redo
        const canRedo = this.canvasManager.canRedo();
        this.redoBtn.disabled = !canRedo;
        // Enable undo button since we have operations again
        this.undoBtn.disabled = false;
      }
    });

    // User name
    this.nameInput.addEventListener('change', (e) => {
      const name = (e.target as HTMLInputElement).value.trim();
      if (name) {
        this.wsManager.setUserName(name);
        this.userNameDisplay.textContent = name;
      }
    });

    // Room management
    this.joinRoomBtn.addEventListener('click', () => {
      const roomId = this.roomInput.value.trim() || 'default';
      const userName = this.nameInput.value.trim() || undefined;
      this.wsManager.joinRoom(roomId, userName);
      this.showStatus(`Joining room: ${roomId}...`);
    });

    // Enter key for name input
    this.nameInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        (e.target as HTMLInputElement).blur();
      }
    });
  }

  private setupWebSocketCallbacks(): void {
    this.wsManager.onConnected = (userId) => {
      this.showStatus('Connected to server');
      this.userNameDisplay.textContent = this.wsManager.getUserName();
    };

    this.wsManager.onDisconnected = () => {
      this.showStatus('Disconnected from server', 'error');
    };

    this.wsManager.onError = (error) => {
      console.error('WebSocket error:', error);
      this.showStatus('Connection error', 'error');
    };

    this.wsManager.onRoomState = (operations, users) => {
      this.canvasManager.loadOperations(operations);
      this.updateUsersList(users);
      this.updateUserCount(users.length);
      this.undoBtn.disabled = !this.canvasManager.canUndo();
      this.redoBtn.disabled = !this.canvasManager.canRedo();
    };

    this.wsManager.onRemoteDrawStart = (operation) => {
      this.canvasManager.applyRemoteOperation(operation);
    };

    this.wsManager.onRemoteDrawProgress = (operationId, point) => {
      this.canvasManager.addPointToRemoteOperation(operationId, point);
    };

    this.wsManager.onRemoteDrawEnd = (operationId) => {
      // Drawing complete
    };

    this.wsManager.onRemoteErase = (operation) => {
      this.canvasManager.applyRemoteOperation(operation);
    };

    this.wsManager.onRemoteShape = (operation) => {
      this.canvasManager.applyRemoteOperation(operation);
    };

    this.wsManager.onRemoteText = (operation) => {
      this.canvasManager.applyRemoteOperation(operation);
    };

    this.wsManager.onRemoteImage = (operation) => {
      this.canvasManager.applyRemoteOperation(operation);
    };

    this.wsManager.onRemoteClear = (operation) => {
      this.canvasManager.applyRemoteOperation(operation);
    };

    this.wsManager.onRemoteUndo = (operationId, userId) => {
      this.canvasManager.removeOperation(operationId);
    };

    this.wsManager.onUserJoined = (data) => {
      this.updateUsersList(this.wsManager.getUsers());
      this.updateUserCount(this.wsManager.getUsers().length);
      this.showStatus(`${data.userName} joined`);
    };

    this.wsManager.onUserLeft = (userId) => {
      this.removeUserCursor(userId);
      this.updateUsersList(this.wsManager.getUsers());
      this.updateUserCount(this.wsManager.getUsers().length);
    };

    this.wsManager.onUserNameChanged = (data) => {
      this.updateUsersList(this.wsManager.getUsers());
    };

    this.wsManager.onRemoteCursorMove = (userId, point, color) => {
      this.updateUserCursor(userId, point, color);
    };
  }

  private setupCanvasCallbacks(): void {
    this.canvasManager.onOperationStart = (operation) => {
      operation.userId = this.wsManager.getUserId();
      
      if (operation.type === 'draw') {
        this.wsManager.sendDrawStart(
          operation.path![0],
          operation.color!,
          operation.lineWidth!,
          operation.id
        );
      } else if (operation.type === 'erase') {
        this.wsManager.sendErase(
          operation.path![0],
          operation.eraserRadius!
        );
      } else if (operation.type === 'rectangle' || operation.type === 'circle') {
      } else if (operation.type === 'text') {
        this.wsManager.sendText(operation);
      }
    };

    this.canvasManager.onOperationProgress = (operationId, point) => {
      this.wsManager.sendDrawProgress(operationId, point);
      this.wsManager.sendCursorMove(point);
    };

    this.canvasManager.onOperationEnd = (operation) => {
      if (operation.type === 'rectangle' || operation.type === 'circle') {
        if (!operation.startPoint || !operation.endPoint) {
          console.error('Shape operation missing startPoint or endPoint:', operation);
          return;
        }
        
        const userId = this.wsManager.getUserId();
        if (!userId) {
          console.error('Cannot send shape: userId not set yet');
          return;
        }
        
        const shapeOperation: DrawingOperation = {
          id: operation.id,
          userId: userId,
          type: operation.type,
          timestamp: operation.timestamp,
          startPoint: { x: operation.startPoint.x, y: operation.startPoint.y },
          endPoint: { x: operation.endPoint.x, y: operation.endPoint.y },
          color: operation.color,
          lineWidth: operation.lineWidth
        };
        this.wsManager.sendShape(shapeOperation);
      } else if (operation.type === 'draw') {
        this.wsManager.sendDrawEnd(operation.id);
      }
      this.undoBtn.disabled = !this.canvasManager.canUndo();
      this.redoBtn.disabled = !this.canvasManager.canRedo();
    };

    this.mainCanvas.addEventListener('mousemove', (e) => {
      const rect = this.mainCanvas.getBoundingClientRect();
      const point = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
      };
      this.wsManager.sendCursorMove(point);
    });
  }

  private updateUsersList(users: any[]): void {
    this.usersList.innerHTML = '';
    users.forEach(user => {
      const li = document.createElement('li');
      li.innerHTML = `
        <span class="user-color" style="background-color: ${user.color}"></span>
        <span class="user-name">${user.name || user.id.substring(0, 6)}</span>
      `;
      this.usersList.appendChild(li);
    });
  }

  private updateUserCount(count: number): void {
    this.userCount.textContent = count.toString();
  }

  private updateUserCursor(userId: string, point: Point, color: string): void {
    let cursor = this.userCursors.get(userId);
    
    if (!cursor) {
      const element = document.createElement('div');
      element.className = 'remote-cursor';
      element.style.position = 'absolute';
      element.style.width = '20px';
      element.style.height = '20px';
      element.style.borderRadius = '50%';
      element.style.border = `2px solid ${color}`;
      element.style.pointerEvents = 'none';
      element.style.transform = 'translate(-50%, -50%)';
      element.style.zIndex = '1000';
      element.style.transition = 'all 0.1s ease-out';
      
      const container = this.mainCanvas.parentElement!;
      container.style.position = 'relative';
      container.appendChild(element);
      
      cursor = { element, color };
      this.userCursors.set(userId, cursor);
    }

    const rect = this.mainCanvas.getBoundingClientRect();
    cursor.element.style.left = `${rect.left + point.x}px`;
    cursor.element.style.top = `${rect.top + point.y}px`;
    cursor.element.style.borderColor = color;
  }

  private removeUserCursor(userId: string): void {
    const cursor = this.userCursors.get(userId);
    if (cursor) {
      cursor.element.remove();
      this.userCursors.delete(userId);
    }
  }

  private showStatus(message: string, type: 'info' | 'error' = 'info'): void {
    this.status.textContent = message;
    this.status.className = `status ${type}`;
    this.status.style.display = 'block';
    
    setTimeout(() => {
      this.status.style.display = 'none';
    }, 3000);
  }
}

// Initialize app - constructor handles DOM ready check
try {
  new CollaborativeCanvasApp();
} catch (error) {
  console.error('Failed to initialize application:', error);
  document.body.innerHTML = '<div style="padding: 20px; color: red;"><h1>Error Loading Application</h1><p>Please check the browser console for details.</p><p>' + String(error) + '</p></div>';
}

