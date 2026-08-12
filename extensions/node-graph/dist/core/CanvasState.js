"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CanvasState = void 0;
class CanvasState {
    constructor() {
        this.offsetX = 0;
        this.offsetY = 0;
        this.zoom = 1;
    }
    setZoom(z) {
        this.zoom = Math.min(CanvasState.MAX_ZOOM, Math.max(CanvasState.MIN_ZOOM, z));
    }
    screenToCanvas(sx, sy) {
        return {
            x: (sx - this.offsetX) / this.zoom,
            y: (sy - this.offsetY) / this.zoom,
        };
    }
    canvasToScreen(cx, cy) {
        return {
            x: cx * this.zoom + this.offsetX,
            y: cy * this.zoom + this.offsetY,
        };
    }
    pan(dx, dy) {
        this.offsetX += dx;
        this.offsetY += dy;
    }
    zoomAt(screenX, screenY, factor) {
        const before = this.screenToCanvas(screenX, screenY);
        this.setZoom(this.zoom * factor);
        const after = this.screenToCanvas(screenX, screenY);
        this.offsetX += (after.x - before.x) * this.zoom;
        this.offsetY += (after.y - before.y) * this.zoom;
    }
}
exports.CanvasState = CanvasState;
CanvasState.MIN_ZOOM = 0.15;
CanvasState.MAX_ZOOM = 3;
//# sourceMappingURL=CanvasState.js.map