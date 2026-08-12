export class CanvasState {
  offsetX = 0;
  offsetY = 0;
  zoom = 1;

  static readonly MIN_ZOOM = 0.15;
  static readonly MAX_ZOOM = 3;

  setZoom(z: number): void {
    this.zoom = Math.min(CanvasState.MAX_ZOOM, Math.max(CanvasState.MIN_ZOOM, z));
  }

  screenToCanvas(sx: number, sy: number): { x: number; y: number } {
    return {
      x: (sx - this.offsetX) / this.zoom,
      y: (sy - this.offsetY) / this.zoom,
    };
  }

  canvasToScreen(cx: number, cy: number): { x: number; y: number } {
    return {
      x: cx * this.zoom + this.offsetX,
      y: cy * this.zoom + this.offsetY,
    };
  }

  pan(dx: number, dy: number): void {
    this.offsetX += dx;
    this.offsetY += dy;
  }

  zoomAt(screenX: number, screenY: number, factor: number): void {
    const before = this.screenToCanvas(screenX, screenY);
    this.setZoom(this.zoom * factor);
    const after = this.screenToCanvas(screenX, screenY);
    this.offsetX += (after.x - before.x) * this.zoom;
    this.offsetY += (after.y - before.y) * this.zoom;
  }
}
