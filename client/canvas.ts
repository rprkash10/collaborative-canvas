/**
 * Canvas Drawing Logic
 * 
 * Handles all canvas drawing operations:
 * - Brush drawing
 * - Eraser functionality
 * - Path optimization
 * - Layer management for undo/redo
 */

export interface Point {
  x: number;
  y: number;
  pressure?: number;
}

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

export class CanvasManager {
  private mainCanvas: HTMLCanvasElement;
  private cursorCanvas: HTMLCanvasElement;
  private mainCtx: CanvasRenderingContext2D;
  private cursorCtx: CanvasRenderingContext2D;
  private isDrawing = false;
  private currentOperation: DrawingOperation | null = null;
  private operations: DrawingOperation[] = [];
  private undoStack: DrawingOperation[] = [];
  private remoteOperations: Map<string, DrawingOperation> = new Map(); // Track remote operations in progress
  
  // Drawing state
  private currentTool: 'brush' | 'eraser' | 'rectangle' | 'circle' | 'text' | 'image' = 'brush';
  private currentColor = '#000000';
  private currentLineWidth = 5;
  private eraserRadius = 20;
  private startPoint: Point | null = null;
  private textInput: HTMLInputElement | null = null;

  constructor(mainCanvas: HTMLCanvasElement, cursorCanvas: HTMLCanvasElement) {
    this.mainCanvas = mainCanvas;
    this.cursorCanvas = cursorCanvas;
    
    const mainCtx = mainCanvas.getContext('2d');
    const cursorCtx = cursorCanvas.getContext('2d');
    
    if (!mainCtx || !cursorCtx) {
      throw new Error('Failed to get canvas context');
    }
    
    this.mainCtx = mainCtx;
    this.cursorCtx = cursorCtx;
    
    this.setupCanvas();
    this.setupEventListeners();
  }

  private setupCanvas(): void {
    // Set canvas size
    const resize = () => {
      const container = this.mainCanvas.parentElement!;
      const width = container.clientWidth;
      const height = container.clientHeight - 200; // Account for header/toolbar
      
      this.mainCanvas.width = width;
      this.mainCanvas.height = height;
      this.cursorCanvas.width = width;
      this.cursorCanvas.height = height;
      
      // Redraw all operations
      this.redrawCanvas();
    };
    
    resize();
    window.addEventListener('resize', resize);
    
    // Set canvas styles
    this.mainCtx.lineCap = 'round';
    this.mainCtx.lineJoin = 'round';
    this.cursorCtx.lineCap = 'round';
    this.cursorCtx.lineJoin = 'round';
  }

  private setupEventListeners(): void {
    // Mouse events
    this.mainCanvas.addEventListener('mousedown', (e) => this.handleStart(e));
    this.mainCanvas.addEventListener('mousemove', (e) => this.handleMove(e));
    this.mainCanvas.addEventListener('mouseup', () => this.handleEnd());
    this.mainCanvas.addEventListener('mouseleave', () => this.handleEnd());
    
    // Touch events for mobile support
    this.mainCanvas.addEventListener('touchstart', (e) => {
      e.preventDefault();
      const touch = e.touches[0];
      const mouseEvent = new MouseEvent('mousedown', {
        clientX: touch.clientX,
        clientY: touch.clientY
      });
      this.handleStart(mouseEvent);
    });
    
    this.mainCanvas.addEventListener('touchmove', (e) => {
      e.preventDefault();
      const touch = e.touches[0];
      const mouseEvent = new MouseEvent('mousemove', {
        clientX: touch.clientX,
        clientY: touch.clientY
      });
      this.handleMove(mouseEvent);
    });
    
    this.mainCanvas.addEventListener('touchend', (e) => {
      e.preventDefault();
      this.handleEnd();
    });
  }

  private getPointFromEvent(e: MouseEvent): Point {
    const rect = this.mainCanvas.getBoundingClientRect();
    // Clamp coordinates to canvas bounds
    const x = Math.max(0, Math.min(e.clientX - rect.left, this.mainCanvas.width));
    const y = Math.max(0, Math.min(e.clientY - rect.top, this.mainCanvas.height));
    return { x, y };
  }

  private handleStart(e: MouseEvent): void {
    if (this.isDrawing) return;
    
    this.isDrawing = true;
    const point = this.getPointFromEvent(e);
    
    if (this.currentTool === 'brush') {
      this.startDrawing(point);
    } else if (this.currentTool === 'eraser') {
      this.startErasing(point);
    } else if (this.currentTool === 'rectangle' || this.currentTool === 'circle') {
      this.startShape(point);
    } else if (this.currentTool === 'text') {
      this.startText(point);
    }
  }

  private handleMove(e: MouseEvent): void {
    const point = this.getPointFromEvent(e);
    
    if (this.isDrawing && this.currentOperation) {
      if (this.currentTool === 'brush' || this.currentTool === 'eraser') {
        this.addPointToOperation(point);
      } else if (this.currentTool === 'rectangle' || this.currentTool === 'circle') {
        this.updateShape(point);
      }
    }
    
    // Update cursor preview
    this.updateCursorPreview(point);
  }

  private handleEnd(): void {
    if (!this.isDrawing) return;
    
    this.isDrawing = false;
    
    if (this.currentTool === 'rectangle' || this.currentTool === 'circle') {
      // Ensure endPoint is set (might be same as startPoint if user just clicked)
      if (this.currentOperation && this.startPoint) {
        // If endPoint wasn't updated during drag, set it to startPoint
        if (!this.currentOperation.endPoint) {
          this.currentOperation.endPoint = { ...this.startPoint };
        }
        // Draw final shape on main canvas
        this.drawShape(this.currentOperation);
        this.cursorCtx.clearRect(0, 0, this.cursorCanvas.width, this.cursorCanvas.height);
      }
    }
    
    this.finishOperation();
    this.startPoint = null;
  }

  private startDrawing(point: Point): void {
    this.currentOperation = {
      id: this.generateId(),
      userId: '',
      type: 'draw',
      timestamp: Date.now(),
      path: [point],
      color: this.currentColor,
      lineWidth: this.currentLineWidth
    };
    
    this.drawPoint(point, this.currentColor, this.currentLineWidth);
    this.onOperationStart?.(this.currentOperation);
  }

  private startErasing(point: Point): void {
    this.currentOperation = {
      id: this.generateId(),
      userId: '',
      type: 'erase',
      timestamp: Date.now(),
      path: [point],
      eraserRadius: this.eraserRadius
    };
    
    // Erase initial area
    this.erasePoint(point, this.eraserRadius);
    
    this.onOperationStart?.(this.currentOperation);
  }

  private addPointToOperation(point: Point): void {
    if (!this.currentOperation || !this.currentOperation.path) return;
    
    const lastPoint = this.currentOperation.path[this.currentOperation.path.length - 1];
    
    const distance = Math.sqrt(
      Math.pow(point.x - lastPoint.x, 2) + Math.pow(point.y - lastPoint.y, 2)
    );
    
    if (distance < 2) return;
    
    this.currentOperation.path.push(point);
    
    if (this.currentOperation.type === 'draw') {
      this.drawLine(lastPoint, point, this.currentOperation.color!, this.currentOperation.lineWidth!);
    } else if (this.currentOperation.type === 'erase') {
      this.eraseLine(lastPoint, point, this.currentOperation.eraserRadius!);
    }
    
    this.onOperationProgress?.(this.currentOperation.id, point);
  }

  private finishOperation(): void {
    if (!this.currentOperation) return;
    
    const operationCopy: DrawingOperation = {
      ...this.currentOperation
    };
    
    if (this.currentOperation.path) {
      operationCopy.path = [...this.currentOperation.path];
    }
    
    if (this.currentOperation.startPoint) {
      operationCopy.startPoint = { ...this.currentOperation.startPoint };
    }
    if (this.currentOperation.endPoint) {
      operationCopy.endPoint = { ...this.currentOperation.endPoint };
    }
    
    this.operations.push(operationCopy);
    this.remoteOperations.set(operationCopy.id, operationCopy);
    this.undoStack = [];
    this.onOperationEnd?.(this.currentOperation);
    this.currentOperation = null;
  }

  private drawPoint(point: Point, color: string, lineWidth: number): void {
    this.mainCtx.save();
    this.mainCtx.strokeStyle = color;
    this.mainCtx.lineWidth = lineWidth;
    this.mainCtx.beginPath();
    this.mainCtx.arc(point.x, point.y, lineWidth / 2, 0, Math.PI * 2);
    this.mainCtx.fillStyle = color;
    this.mainCtx.fill();
    this.mainCtx.restore();
  }

  private drawLine(from: Point, to: Point, color: string, lineWidth: number): void {
    this.mainCtx.save();
    this.mainCtx.strokeStyle = color;
    this.mainCtx.lineWidth = lineWidth;
    this.mainCtx.beginPath();
    this.mainCtx.moveTo(from.x, from.y);
    this.mainCtx.lineTo(to.x, to.y);
    this.mainCtx.stroke();
    this.mainCtx.restore();
  }

  private erasePoint(point: Point, radius: number): void {
    this.mainCtx.save();
    this.mainCtx.globalCompositeOperation = 'destination-out';
    this.mainCtx.beginPath();
    this.mainCtx.arc(point.x, point.y, radius, 0, Math.PI * 2);
    this.mainCtx.fill();
    this.mainCtx.restore();
  }

  private eraseLine(from: Point, to: Point, radius: number): void {
    this.mainCtx.save();
    this.mainCtx.globalCompositeOperation = 'destination-out';
    this.mainCtx.lineWidth = radius * 2;
    this.mainCtx.lineCap = 'round';
    this.mainCtx.beginPath();
    this.mainCtx.moveTo(from.x, from.y);
    this.mainCtx.lineTo(to.x, to.y);
    this.mainCtx.stroke();
    this.mainCtx.restore();
  }

  private updateCursorPreview(point: Point): void {
    this.cursorCtx.clearRect(0, 0, this.cursorCanvas.width, this.cursorCanvas.height);
    
    if (this.currentTool === 'brush') {
      this.cursorCtx.save();
      this.cursorCtx.strokeStyle = this.currentColor;
      this.cursorCtx.lineWidth = 2;
      this.cursorCtx.beginPath();
      this.cursorCtx.arc(point.x, point.y, this.currentLineWidth / 2, 0, Math.PI * 2);
      this.cursorCtx.stroke();
      this.cursorCtx.restore();
    } else if (this.currentTool === 'eraser') {
      this.cursorCtx.save();
      this.cursorCtx.strokeStyle = '#999';
      this.cursorCtx.lineWidth = 2;
      this.cursorCtx.setLineDash([5, 5]);
      this.cursorCtx.beginPath();
      this.cursorCtx.arc(point.x, point.y, this.eraserRadius, 0, Math.PI * 2);
      this.cursorCtx.stroke();
      this.cursorCtx.restore();
    }
  }

  // Apply remote operation
  applyRemoteOperation(operation: DrawingOperation): void {
    // Validate operation
    if (!operation || !operation.id) {
      console.warn('Invalid operation received:', operation);
      return;
    }

    if (operation.type === 'clear') {
      this.clearCanvas();
      this.operations = [];
      this.undoStack = [];
      this.remoteOperations.clear();
      return;
    }
    
    // Handle operations that don't use paths (shapes, text, images)
    if (operation.type === 'rectangle' || operation.type === 'circle') {
      if (!operation.startPoint || !operation.endPoint) {
        return;
      }
      this.drawShape(operation);
      const existingIndex = this.operations.findIndex(op => op.id === operation.id);
      if (existingIndex === -1) {
        const shapeCopy = this.copyOperation(operation);
        this.operations.push(shapeCopy);
        this.remoteOperations.set(operation.id, shapeCopy);
      }
      return;
    }
    
    if (operation.type === 'text') {
      this.drawText(operation);
      const existingIndex = this.operations.findIndex(op => op.id === operation.id);
      if (existingIndex === -1) {
        const textCopy = this.copyOperation(operation);
        this.operations.push(textCopy);
        this.remoteOperations.set(operation.id, textCopy);
      }
      return;
    }
    
    if (operation.type === 'image') {
      this.drawImageFromData(operation);
      const existingIndex = this.operations.findIndex(op => op.id === operation.id);
      if (existingIndex === -1) {
        const imageCopy = this.copyOperation(operation);
        this.operations.push(imageCopy);
        this.remoteOperations.set(operation.id, imageCopy);
      }
      return;
    }
    
    if (!operation.path || operation.path.length === 0) {
      console.warn('Operation has no path:', operation);
      return;
    }

    // Validate operation type
    if (operation.type !== 'draw' && operation.type !== 'erase') {
      console.warn('Unknown operation type:', operation.type);
      return;
    }
    
    const existingOp = this.remoteOperations.get(operation.id);
    if (existingOp && existingOp.path && existingOp.path.length > 0) {
      const existingLength = existingOp.path.length;
      
      if (operation.path.length > existingLength) {
        const newPoints = operation.path.slice(existingLength);
        
        for (let i = 0; i < newPoints.length; i++) {
          const prevPoint = i === 0 ? existingOp.path[existingOp.path.length - 1] : newPoints[i - 1];
          const currPoint = newPoints[i];
          
          if (operation.type === 'draw') {
            this.drawLine(prevPoint, currPoint, operation.color!, operation.lineWidth!);
          } else if (operation.type === 'erase') {
            this.eraseLine(prevPoint, currPoint, operation.eraserRadius!);
          }
        }
      }
      
      existingOp.path = [...operation.path];
    } else {
      if (operation.type === 'draw') {
        if (operation.path.length === 1) {
          const point = operation.path[0];
          this.drawPoint(point, operation.color!, operation.lineWidth!);
        } else {
          this.drawRemotePath(operation.path, operation.color!, operation.lineWidth!);
        }
      } else if (operation.type === 'erase') {
        this.eraseRemotePath(operation.path, operation.eraserRadius!);
      }
      
      this.remoteOperations.set(operation.id, {
        ...operation,
        path: [...operation.path]
      });
    }
    
    const existingIndex = this.operations.findIndex(op => op.id === operation.id);
    if (existingIndex === -1) {
      this.operations.push({ ...operation, path: [...operation.path] });
    } else {
      this.operations[existingIndex].path = [...operation.path];
    }
  }

  addPointToRemoteOperation(operationId: string, point: Point): void {
    let operation = this.remoteOperations.get(operationId);
    
    if (!operation || !operation.path) {
      const opInArray = this.operations.find(op => op.id === operationId);
      if (opInArray && opInArray.path && opInArray.path.length > 0) {
        operation = {
          ...opInArray,
          path: [...opInArray.path]
        };
        this.remoteOperations.set(operationId, operation);
      } else {
        return;
      }
    }

    if (!operation.path) {
      return;
    }

    operation.path.push(point);
    
    if (operation.path.length >= 2) {
      const lastPoint = operation.path[operation.path.length - 2];
      if (operation.type === 'draw') {
        this.drawLine(lastPoint, point, operation.color!, operation.lineWidth!);
      } else if (operation.type === 'erase') {
        this.eraseLine(lastPoint, point, operation.eraserRadius!);
      }
    }

    const opIndex = this.operations.findIndex(op => op.id === operationId);
    if (opIndex !== -1) {
      if (this.operations[opIndex].path) {
        this.operations[opIndex].path = [...operation.path];
      }
    } else {
      this.operations.push({
        ...operation,
        path: operation.path ? [...operation.path] : []
      });
    }
  }

  private drawRemotePath(path: Point[], color: string, lineWidth: number): void {
    if (path.length === 0) return;
    
    try {
      // Validate inputs
      if (!color || typeof color !== 'string') {
        console.warn('Invalid color:', color);
        return;
      }
      if (!lineWidth || lineWidth <= 0 || lineWidth > 100) {
        console.warn('Invalid line width:', lineWidth);
        return;
      }

      this.mainCtx.save();
      this.mainCtx.strokeStyle = color;
      this.mainCtx.fillStyle = color;
      this.mainCtx.lineWidth = Math.max(1, Math.min(100, lineWidth)); // Clamp line width
      
      // Validate and clamp first point
      const firstPoint = path[0];
      if (!firstPoint || typeof firstPoint.x !== 'number' || typeof firstPoint.y !== 'number') {
        console.warn('Invalid path point:', firstPoint);
        this.mainCtx.restore();
        return;
      }
      
      const clampedFirstX = Math.max(0, Math.min(firstPoint.x, this.mainCanvas.width));
      const clampedFirstY = Math.max(0, Math.min(firstPoint.y, this.mainCanvas.height));
      
      // If only one point, draw it as a filled circle (like the initial point)
      if (path.length === 1) {
        this.mainCtx.beginPath();
        this.mainCtx.arc(clampedFirstX, clampedFirstY, lineWidth / 2, 0, Math.PI * 2);
        this.mainCtx.fill();
        this.mainCtx.restore();
        return;
      }
      
      // Multiple points - draw as a path
      this.mainCtx.beginPath();
      this.mainCtx.moveTo(clampedFirstX, clampedFirstY);
      
      for (let i = 1; i < path.length; i++) {
        const point = path[i];
        if (point && typeof point.x === 'number' && typeof point.y === 'number') {
          this.mainCtx.lineTo(
            Math.max(0, Math.min(point.x, this.mainCanvas.width)),
            Math.max(0, Math.min(point.y, this.mainCanvas.height))
          );
        }
      }
      
      this.mainCtx.stroke();
      this.mainCtx.restore();
    } catch (error) {
      console.error('Error drawing remote path:', error);
      this.mainCtx.restore();
    }
  }

  private eraseRemotePath(path: Point[], radius: number): void {
    if (path.length === 0) return;
    
    this.mainCtx.save();
    this.mainCtx.globalCompositeOperation = 'destination-out';
    this.mainCtx.lineWidth = radius * 2;
    this.mainCtx.lineCap = 'round';
    this.mainCtx.beginPath();
    this.mainCtx.moveTo(path[0].x, path[0].y);
    
    for (let i = 1; i < path.length; i++) {
      this.mainCtx.lineTo(path[i].x, path[i].y);
    }
    
    this.mainCtx.stroke();
    this.mainCtx.restore();
  }

  undo(): DrawingOperation | null {
    if (this.operations.length === 0) return null;
    
    const operation = this.operations.pop()!;
    this.undoStack.push(operation);
    this.remoteOperations.delete(operation.id);
    this.redrawCanvas();
    
    return operation;
  }

  // Redo last undone operation
  redo(): DrawingOperation | null {
    if (this.undoStack.length === 0) return null;
    
    const operation = this.undoStack.pop()!;
    this.operations.push(operation);
    
    // Redraw the operation directly
    if (operation.type === 'draw' && operation.path && operation.path.length > 0) {
      this.drawRemotePath(operation.path, operation.color!, operation.lineWidth!);
    } else if (operation.type === 'erase' && operation.path && operation.path.length > 0) {
      this.eraseRemotePath(operation.path, operation.eraserRadius!);
    } else if (operation.type === 'rectangle' || operation.type === 'circle') {
      this.drawShape(operation);
    } else if (operation.type === 'text') {
      this.drawText(operation);
    } else if (operation.type === 'image') {
      this.drawImageFromData(operation);
    }
    
    // Also add to remoteOperations map if it's not already there
    if (!this.remoteOperations.has(operation.id)) {
      this.remoteOperations.set(operation.id, this.copyOperation(operation));
    }
    
    return operation;
  }

  // Check if redo is available
  canRedo(): boolean {
    return this.undoStack.length > 0;
  }

  // Check if undo is available
  canUndo(): boolean {
    return this.operations.length > 0;
  }

  // Redraw entire canvas from operations
  redrawCanvas(): void {
    this.mainCtx.clearRect(0, 0, this.mainCanvas.width, this.mainCanvas.height);
    
    for (const operation of this.operations) {
      if (operation.type === 'draw' && operation.path && operation.path.length > 0) {
        this.drawRemotePath(operation.path, operation.color!, operation.lineWidth!);
      } else if (operation.type === 'erase' && operation.path && operation.path.length > 0) {
        this.eraseRemotePath(operation.path, operation.eraserRadius!);
      } else if (operation.type === 'rectangle' || operation.type === 'circle') {
        this.drawShape(operation);
      } else if (operation.type === 'text') {
        this.drawText(operation);
      } else if (operation.type === 'image') {
        this.drawImageFromData(operation);
      }
    }
  }

  // Remove operation by ID (for remote undo)
  removeOperation(operationId: string): void {
    const index = this.operations.findIndex(op => op.id === operationId);
    if (index !== -1) {
      this.operations.splice(index, 1);
      this.redrawCanvas();
    }
  }

  clearCanvas(): void {
    this.mainCtx.clearRect(0, 0, this.mainCanvas.width, this.mainCanvas.height);
  }

  // Shape methods
  private startShape(point: Point): void {
    this.isDrawing = true;
    this.startPoint = point;
    this.currentOperation = {
      id: this.generateId(),
      userId: '',
      type: this.currentTool as 'rectangle' | 'circle',
      timestamp: Date.now(),
      startPoint: point,
      endPoint: point, // Initially same as startPoint
      color: this.currentColor,
      lineWidth: this.currentLineWidth
    };
    this.onOperationStart?.(this.currentOperation);
  }

  private updateShape(point: Point): void {
    if (!this.currentOperation || !this.startPoint) return;
    
    this.currentOperation.endPoint = point;
    
    // Redraw cursor canvas with preview
    this.cursorCtx.clearRect(0, 0, this.cursorCanvas.width, this.cursorCanvas.height);
    this.drawShapePreview(this.startPoint, point, this.currentTool as 'rectangle' | 'circle');
  }

  private drawShapePreview(start: Point, end: Point, type: 'rectangle' | 'circle'): void {
    this.cursorCtx.save();
    this.cursorCtx.strokeStyle = this.currentColor;
    this.cursorCtx.lineWidth = this.currentLineWidth;
    this.cursorCtx.setLineDash([5, 5]);
    
    const width = end.x - start.x;
    const height = end.y - start.y;
    
    if (type === 'rectangle') {
      this.cursorCtx.strokeRect(start.x, start.y, width, height);
    } else {
      const radius = Math.sqrt(width * width + height * height) / 2;
      const centerX = start.x + width / 2;
      const centerY = start.y + height / 2;
      this.cursorCtx.beginPath();
      this.cursorCtx.arc(centerX, centerY, radius, 0, Math.PI * 2);
      this.cursorCtx.stroke();
    }
    
    this.cursorCtx.restore();
  }

  private drawShape(operation: DrawingOperation): void {
    if (!operation.startPoint || !operation.endPoint) return;
    
    this.mainCtx.save();
    this.mainCtx.strokeStyle = operation.color || '#000000';
    this.mainCtx.lineWidth = operation.lineWidth || 5;
    
    const width = operation.endPoint.x - operation.startPoint.x;
    const height = operation.endPoint.y - operation.startPoint.y;
    
    if (operation.type === 'rectangle') {
      this.mainCtx.strokeRect(operation.startPoint.x, operation.startPoint.y, width, height);
    } else if (operation.type === 'circle') {
      const radius = Math.sqrt(width * width + height * height) / 2;
      const centerX = operation.startPoint.x + width / 2;
      const centerY = operation.startPoint.y + height / 2;
      this.mainCtx.beginPath();
      this.mainCtx.arc(centerX, centerY, radius, 0, Math.PI * 2);
      this.mainCtx.stroke();
    }
    
    this.mainCtx.restore();
  }

  // Text methods
  private startText(point: Point): void {
    const text = prompt('Enter text:');
    if (!text) {
      this.isDrawing = false;
      return;
    }
    
    this.currentOperation = {
      id: this.generateId(),
      userId: '',
      type: 'text',
      timestamp: Date.now(),
      startPoint: point,
      text: text,
      color: this.currentColor,
      fontSize: this.currentLineWidth * 3
    };
    
    this.drawText(this.currentOperation);
    // Add to operations immediately
    this.operations.push({ ...this.currentOperation });
    this.onOperationStart?.(this.currentOperation);
    this.finishOperation();
  }

  private drawText(operation: DrawingOperation): void {
    if (!operation.startPoint || !operation.text) return;
    
    this.mainCtx.save();
    this.mainCtx.fillStyle = operation.color || '#000000';
    this.mainCtx.font = `${operation.fontSize || 15}px Arial`;
    this.mainCtx.fillText(operation.text, operation.startPoint.x, operation.startPoint.y);
    this.mainCtx.restore();
  }

  // Image methods
  drawImageFromData(operation: DrawingOperation): void {
    if (!operation.imageData || !operation.startPoint) return;
    
    const img = new Image();
    img.onload = () => {
      this.mainCtx.drawImage(
        img,
        operation.startPoint!.x,
        operation.startPoint!.y,
        operation.imageWidth || img.width,
        operation.imageHeight || img.height
      );
    };
    img.src = operation.imageData;
  }

  // Setters
  setTool(tool: 'brush' | 'eraser' | 'rectangle' | 'circle' | 'text' | 'image'): void {
    this.currentTool = tool;
  }

  setColor(color: string): void {
    this.currentColor = color;
  }

  setLineWidth(width: number): void {
    this.currentLineWidth = width;
  }

  setEraserRadius(radius: number): void {
    this.eraserRadius = radius;
  }

  private copyOperation(operation: DrawingOperation): DrawingOperation {
    const copy: DrawingOperation = { ...operation };
    
    if (operation.path) {
      copy.path = [...operation.path];
    }
    
    if (operation.startPoint) {
      copy.startPoint = { ...operation.startPoint };
    }
    if (operation.endPoint) {
      copy.endPoint = { ...operation.endPoint };
    }
    
    return copy;
  }

  // Load initial state from server
  loadOperations(operations: DrawingOperation[]): void {
    this.operations = [];
    this.undoStack = [];
    this.remoteOperations.clear();
    
    for (const op of operations) {
      if (op && op.id) {
        const operationCopy = this.copyOperation(op);
        this.operations.push(operationCopy);
        this.remoteOperations.set(op.id, operationCopy);
      }
    }
    
    this.redrawCanvas();
  }

  // Get operations (for external access)
  getOperations(): DrawingOperation[] {
    return [...this.operations];
  }

  // Add operation (for image operations)
  addOperation(operation: DrawingOperation): void {
    const operationCopy = this.copyOperation(operation);
    this.operations.push(operationCopy);
    this.remoteOperations.set(operation.id, operationCopy);
  }

  // Callbacks
  onOperationStart?: (operation: DrawingOperation) => void;
  onOperationProgress?: (operationId: string, point: Point) => void;
  onOperationEnd?: (operation: DrawingOperation) => void;

  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}
