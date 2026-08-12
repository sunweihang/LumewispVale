import type { CanvasState } from '../core/CanvasState';
import type { Connection } from '../core/Connection';
import type { NodeGraph } from '../core/NodeGraph';
import { PortTypeRegistry } from '../core/PortTypeRegistry';
import { getPortScreenPos } from './NodeDrawer';

export function drawBezier(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  color: string,
  width = 2
): void {
  const dx = Math.max(40, Math.abs(x2 - x1) * 0.5);
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.bezierCurveTo(x1 + dx, y1, x2 - dx, y2, x2, y2);
  ctx.stroke();
}

export function drawConnections(
  ctx: CanvasRenderingContext2D,
  graph: NodeGraph,
  canvas: CanvasState
): void {
  for (const conn of graph.connections) {
    const from = graph.findNode(conn.fromNodeId);
    const to = graph.findNode(conn.toNodeId);
    if (!from || !to) continue;
    const p1 = getPortScreenPos(from, conn.fromPortIndex, false, canvas);
    const p2 = getPortScreenPos(to, conn.toPortIndex, true, canvas);
    const type = from.outputs[conn.fromPortIndex]?.portType ?? PortTypeRegistry.Any;
    const color =
      type === PortTypeRegistry.GraphFlow
        ? '#dddddd'
        : PortTypeRegistry.getColor(type);
    drawBezier(ctx, p1.x, p1.y, p2.x, p2.y, color, 2 * canvas.zoom);
  }
}

export function hitTestConnection(
  graph: NodeGraph,
  canvas: CanvasState,
  sx: number,
  sy: number,
  threshold = 6
): Connection | null {
  for (let i = graph.connections.length - 1; i >= 0; i--) {
    const conn = graph.connections[i];
    const from = graph.findNode(conn.fromNodeId);
    const to = graph.findNode(conn.toNodeId);
    if (!from || !to) continue;
    const p1 = getPortScreenPos(from, conn.fromPortIndex, false, canvas);
    const p2 = getPortScreenPos(to, conn.toPortIndex, true, canvas);
    if (distToBezier(sx, sy, p1.x, p1.y, p2.x, p2.y) <= threshold) {
      return conn;
    }
  }
  return null;
}

function distToBezier(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number
): number {
  const dx = Math.max(40, Math.abs(x2 - x1) * 0.5);
  let min = Infinity;
  for (let t = 0; t <= 1; t += 0.05) {
    const u = 1 - t;
    const bx =
      u * u * u * x1 +
      3 * u * u * t * (x1 + dx) +
      3 * u * t * t * (x2 - dx) +
      t * t * t * x2;
    const by =
      u * u * u * y1 + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y2;
    const d = Math.hypot(px - bx, py - by);
    if (d < min) min = d;
  }
  return min;
}
