"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.drawGrid = drawGrid;
function drawGrid(ctx, width, height, canvas, light = false) {
    const bg = light ? '#e8e8e8' : '#1e1e1e';
    const major = light ? '#c8c8c8' : '#2a2a2a';
    const minor = light ? '#d8d8d8' : '#252525';
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, width, height);
    const grid = 20;
    const majorEvery = 5;
    const start = canvas.screenToCanvas(0, 0);
    const end = canvas.screenToCanvas(width, height);
    const x0 = Math.floor(start.x / grid) * grid;
    const y0 = Math.floor(start.y / grid) * grid;
    for (let x = x0; x <= end.x; x += grid) {
        const s = canvas.canvasToScreen(x, 0);
        const isMajor = Math.round(x / grid) % majorEvery === 0;
        ctx.strokeStyle = isMajor ? major : minor;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(s.x + 0.5, 0);
        ctx.lineTo(s.x + 0.5, height);
        ctx.stroke();
    }
    for (let y = y0; y <= end.y; y += grid) {
        const s = canvas.canvasToScreen(0, y);
        const isMajor = Math.round(y / grid) % majorEvery === 0;
        ctx.strokeStyle = isMajor ? major : minor;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, s.y + 0.5);
        ctx.lineTo(width, s.y + 0.5);
        ctx.stroke();
    }
}
//# sourceMappingURL=GridDrawer.js.map