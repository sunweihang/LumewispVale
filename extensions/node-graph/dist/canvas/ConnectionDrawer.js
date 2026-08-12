"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.drawBezier = drawBezier;
exports.drawConnections = drawConnections;
exports.hitTestConnection = hitTestConnection;
const PortTypeRegistry_1 = require("../core/PortTypeRegistry");
const NodeDrawer_1 = require("./NodeDrawer");
function drawBezier(ctx, x1, y1, x2, y2, color, width = 2) {
    const dx = Math.max(40, Math.abs(x2 - x1) * 0.5);
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.bezierCurveTo(x1 + dx, y1, x2 - dx, y2, x2, y2);
    ctx.stroke();
}
function drawConnections(ctx, graph, canvas) {
    var _a, _b;
    for (const conn of graph.connections) {
        const from = graph.findNode(conn.fromNodeId);
        const to = graph.findNode(conn.toNodeId);
        if (!from || !to)
            continue;
        const p1 = (0, NodeDrawer_1.getPortScreenPos)(from, conn.fromPortIndex, false, canvas);
        const p2 = (0, NodeDrawer_1.getPortScreenPos)(to, conn.toPortIndex, true, canvas);
        const type = (_b = (_a = from.outputs[conn.fromPortIndex]) === null || _a === void 0 ? void 0 : _a.portType) !== null && _b !== void 0 ? _b : PortTypeRegistry_1.PortTypeRegistry.Any;
        const color = type === PortTypeRegistry_1.PortTypeRegistry.GraphFlow
            ? '#dddddd'
            : PortTypeRegistry_1.PortTypeRegistry.getColor(type);
        drawBezier(ctx, p1.x, p1.y, p2.x, p2.y, color, 2 * canvas.zoom);
    }
}
function hitTestConnection(graph, canvas, sx, sy, threshold = 6) {
    for (let i = graph.connections.length - 1; i >= 0; i--) {
        const conn = graph.connections[i];
        const from = graph.findNode(conn.fromNodeId);
        const to = graph.findNode(conn.toNodeId);
        if (!from || !to)
            continue;
        const p1 = (0, NodeDrawer_1.getPortScreenPos)(from, conn.fromPortIndex, false, canvas);
        const p2 = (0, NodeDrawer_1.getPortScreenPos)(to, conn.toPortIndex, true, canvas);
        if (distToBezier(sx, sy, p1.x, p1.y, p2.x, p2.y) <= threshold) {
            return conn;
        }
    }
    return null;
}
function distToBezier(px, py, x1, y1, x2, y2) {
    const dx = Math.max(40, Math.abs(x2 - x1) * 0.5);
    let min = Infinity;
    for (let t = 0; t <= 1; t += 0.05) {
        const u = 1 - t;
        const bx = u * u * u * x1 +
            3 * u * u * t * (x1 + dx) +
            3 * u * t * t * (x2 - dx) +
            t * t * t * x2;
        const by = u * u * u * y1 + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y2;
        const d = Math.hypot(px - bx, py - by);
        if (d < min)
            min = d;
    }
    return min;
}
//# sourceMappingURL=ConnectionDrawer.js.map