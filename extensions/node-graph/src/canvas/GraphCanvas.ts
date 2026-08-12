import { CanvasState } from '../core/CanvasState';
import { Connection } from '../core/Connection';
import { GraphHistory } from '../core/GraphHistory';
import { fieldsForNode } from '../core/nodeFields';
import { NodeGraph } from '../core/NodeGraph';
import { NodeRegistry } from '../core/NodeRegistry';
import { drawConnections, drawBezier, hitTestConnection } from './ConnectionDrawer';
import { drawGrid } from './GridDrawer';
import {
  drawNode,
  getPortScreenPos,
  hitTestNode,
  hitTestPort,
  measureNode,
} from './NodeDrawer';

export type GraphChangeReason =
  | 'add-node'
  | 'remove'
  | 'move'
  | 'connect'
  | 'disconnect'
  | 'paste'
  | 'field'
  | 'load'
  | 'undo'
  | 'redo';

export interface GraphCanvasCallbacks {
  onChange?: (reason: GraphChangeReason) => void;
  onSelectionChange?: (ids: string[]) => void;
  onRequestAddNode?: (screenX: number, screenY: number, canvasX: number, canvasY: number) => void;
}

type DragMode =
  | { kind: 'none' }
  | { kind: 'pan'; lastX: number; lastY: number }
  | { kind: 'node'; ids: string[]; lastCX: number; lastCY: number }
  | {
      kind: 'connect';
      fromNodeId: string;
      fromPortIndex: number;
      fromIsInput: boolean;
      curX: number;
      curY: number;
    }
  | { kind: 'box'; x0: number; y0: number; x1: number; y1: number };

export class GraphCanvas {
  readonly canvasEl: HTMLCanvasElement;
  readonly state = new CanvasState();
  graph: NodeGraph;
  selected = new Set<string>();
  private ctx: CanvasRenderingContext2D;
  private drag: DragMode = { kind: 'none' };
  private callbacks: GraphCanvasCallbacks;
  private clipboard: ReturnType<NodeGraph['toJSON']>['nodes'] = [];
  private raf = 0;
  private spaceDown = false;
  private readonly history = new GraphHistory();
  /** 上一次已提交编辑后的图快照（下一次编辑前状态） */
  private baseline: ReturnType<NodeGraph['toJSON']>;

  constructor(
    canvasEl: HTMLCanvasElement,
    graph: NodeGraph,
    callbacks: GraphCanvasCallbacks = {}
  ) {
    this.canvasEl = canvasEl;
    const ctx = canvasEl.getContext('2d');
    if (!ctx) throw new Error('2d context unavailable');
    this.ctx = ctx;
    this.graph = graph;
    this.callbacks = callbacks;
    this.baseline = graph.toJSON();
    this.bind();
    this.requestDraw();
  }

  setGraph(graph: NodeGraph): void {
    this.graph = graph;
    this.selected.clear();
    this.history.clear();
    this.baseline = graph.toJSON();
    this.callbacks.onSelectionChange?.([]);
    this.requestDraw();
  }

  setCallbacks(cb: GraphCanvasCallbacks): void {
    this.callbacks = cb;
  }

  destroy(): void {
    this.unbind();
    cancelAnimationFrame(this.raf);
  }

  markDirty(reason: GraphChangeReason): void {
    if (reason !== 'undo' && reason !== 'redo' && reason !== 'load') {
      this.history.pushBefore(this.baseline, reason);
      this.baseline = this.graph.toJSON();
    } else if (reason === 'load') {
      this.history.clear();
      this.baseline = this.graph.toJSON();
    }
    this.callbacks.onChange?.(reason);
    this.requestDraw();
  }

  undo(): boolean {
    const prev = this.history.undo(this.graph.toJSON());
    if (!prev) return false;
    this.applySnapshot(prev);
    this.baseline = this.graph.toJSON();
    this.markDirty('undo');
    return true;
  }

  redo(): boolean {
    const next = this.history.redo(this.graph.toJSON());
    if (!next) return false;
    this.applySnapshot(next);
    this.baseline = this.graph.toJSON();
    this.markDirty('redo');
    return true;
  }

  private applySnapshot(json: ReturnType<NodeGraph['toJSON']>): void {
    this.graph = NodeGraph.fromJSON(json);
    for (const n of this.graph.nodes) measureNode(n);
    this.selected.clear();
    this.callbacks.onSelectionChange?.([]);
  }

  /** 事件是否来自本面板（含 Shadow DOM 内的 Inspector） */
  private isFromOurPanel(target: EventTarget | null): boolean {
    if (!(target instanceof Node)) return false;
    const root = this.canvasEl.getRootNode();
    if (root instanceof ShadowRoot) {
      return target.getRootNode() === root;
    }
    return this.canvasEl.contains(target);
  }

  selectOnly(ids: string[]): void {
    this.selected = new Set(ids);
    this.callbacks.onSelectionChange?.([...this.selected]);
    this.requestDraw();
  }

  getPrimarySelectedId(): string | null {
    if (this.selected.size === 0) return null;
    return [...this.selected][0];
  }

  addNodeAt(typeName: string, canvasX: number, canvasY: number): boolean {
    const node = NodeRegistry.createNode(typeName, NodeGraph.generateNodeId(), canvasX, canvasY);
    if (!node) return false;
    if (!this.graph.isNodeAllowed(typeName)) return false;
    this.graph.addNode(node);
    this.selectOnly([node.id]);
    this.markDirty('add-node');
    return true;
  }

  deleteSelection(): void {
    if (this.selected.size === 0) return;
    this.graph.removeNodes([...this.selected]);
    this.selected.clear();
    this.callbacks.onSelectionChange?.([]);
    this.markDirty('remove');
  }

  copySelection(): void {
    this.clipboard = this.graph.nodes
      .filter((n) => this.selected.has(n.id))
      .map((n) => n.toJSON());
  }

  pasteClipboard(offset = 40): void {
    if (this.clipboard.length === 0) return;
    const idMap = new Map<string, string>();
    const newIds: string[] = [];
    for (const raw of this.clipboard) {
      const newId = NodeGraph.generateNodeId();
      idMap.set(raw.id, newId);
      const node = NodeRegistry.createNode(raw.typeName, newId, raw.position.x + offset, raw.position.y + offset);
      if (!node) continue;
      node.customData = JSON.parse(JSON.stringify(raw.customData));
      node.title = raw.title;
      node.position.w = raw.position.w;
      node.position.h = raw.position.h;
      this.graph.addNode(node);
      newIds.push(newId);
    }
    // paste internal connections among clipboard
    const clipIds = new Set(this.clipboard.map((n) => n.id));
    for (const c of this.graph.connections) {
      // only from original graph — skip; use clipboard snapshot connections from graph before? 
      // We don't store connections in clipboard; rebuild from current graph between selected was better.
      void c;
      void clipIds;
    }
    this.selectOnly(newIds);
    this.markDirty('paste');
  }

  /** Copy nodes + edges among them */
  copySelectionWithEdges(): void {
    const nodes = this.graph.nodes.filter((n) => this.selected.has(n.id)).map((n) => n.toJSON());
    const ids = new Set(nodes.map((n) => n.id));
    const connections = this.graph.connections
      .filter((c) => ids.has(c.fromNodeId) && ids.has(c.toNodeId))
      .map((c) => c.toJSON());
    this._clipBundle = { nodes, connections };
    this.clipboard = nodes;
  }

  private _clipBundle: {
    nodes: ReturnType<NodeGraph['toJSON']>['nodes'];
    connections: ReturnType<NodeGraph['toJSON']>['connections'];
  } | null = null;

  pasteBundle(offset = 40): void {
    const bundle = this._clipBundle;
    if (!bundle || bundle.nodes.length === 0) {
      this.pasteClipboard(offset);
      return;
    }
    const idMap = new Map<string, string>();
    const newIds: string[] = [];
    for (const raw of bundle.nodes) {
      const newId = NodeGraph.generateNodeId();
      idMap.set(raw.id, newId);
      const node = NodeRegistry.createNode(
        raw.typeName,
        newId,
        raw.position.x + offset,
        raw.position.y + offset
      );
      if (!node) continue;
      node.customData = JSON.parse(JSON.stringify(raw.customData));
      node.title = raw.title;
      measureNode(node);
      this.graph.addNode(node);
      newIds.push(newId);
    }
    for (const c of bundle.connections) {
      const from = idMap.get(c.fromNodeId);
      const to = idMap.get(c.toNodeId);
      if (!from || !to) continue;
      this.graph.addConnection(new Connection(from, c.fromPortIndex, to, c.toPortIndex));
    }
    this.selectOnly(newIds);
    this.markDirty('paste');
  }

  requestDraw(): void {
    cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame(() => this.draw());
  }

  resize(): void {
    const parent = this.canvasEl.parentElement;
    if (!parent) return;
    const dpr = window.devicePixelRatio || 1;
    const w = parent.clientWidth;
    const h = parent.clientHeight;
    this.canvasEl.width = Math.max(1, Math.floor(w * dpr));
    this.canvasEl.height = Math.max(1, Math.floor(h * dpr));
    this.canvasEl.style.width = `${w}px`;
    this.canvasEl.style.height = `${h}px`;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.requestDraw();
  }

  private draw(): void {
    const w = this.canvasEl.clientWidth;
    const h = this.canvasEl.clientHeight;
    const light = this.graph.profile.useLightTheme;
    drawGrid(this.ctx, w, h, this.state, light);
    drawConnections(this.ctx, this.graph, this.state);

    if (this.drag.kind === 'connect') {
      const fromNode = this.graph.findNode(this.drag.fromNodeId);
      if (fromNode) {
        const p = getPortScreenPos(
          fromNode,
          this.drag.fromPortIndex,
          this.drag.fromIsInput,
          this.state
        );
        const x1 = this.drag.fromIsInput ? this.drag.curX : p.x;
        const y1 = this.drag.fromIsInput ? this.drag.curY : p.y;
        const x2 = this.drag.fromIsInput ? p.x : this.drag.curX;
        const y2 = this.drag.fromIsInput ? p.y : this.drag.curY;
        drawBezier(this.ctx, x1, y1, x2, y2, '#ffcc33', 2);
      }
    }

    // draw nodes in order; selected on top
    const nodes = [...this.graph.nodes].sort((a, b) => {
      const as = this.selected.has(a.id) ? 1 : 0;
      const bs = this.selected.has(b.id) ? 1 : 0;
      return as - bs;
    });
    for (const node of nodes) {
      drawNode(this.ctx, node, this.state, this.selected.has(node.id), light);
    }

    if (this.drag.kind === 'box') {
      const x = Math.min(this.drag.x0, this.drag.x1);
      const y = Math.min(this.drag.y0, this.drag.y1);
      const bw = Math.abs(this.drag.x1 - this.drag.x0);
      const bh = Math.abs(this.drag.y1 - this.drag.y0);
      this.ctx.fillStyle = 'rgba(80,140,255,0.15)';
      this.ctx.strokeStyle = 'rgba(80,140,255,0.9)';
      this.ctx.lineWidth = 1;
      this.ctx.fillRect(x, y, bw, bh);
      this.ctx.strokeRect(x, y, bw, bh);
    }
  }

  private bind(): void {
    this.onPointerDown = this.onPointerDown.bind(this);
    this.onPointerMove = this.onPointerMove.bind(this);
    this.onPointerUp = this.onPointerUp.bind(this);
    this.onWheel = this.onWheel.bind(this);
    this.onKeyDown = this.onKeyDown.bind(this);
    this.onKeyUp = this.onKeyUp.bind(this);
    this.onContextMenu = this.onContextMenu.bind(this);
    this.onDblClick = this.onDblClick.bind(this);

    this.canvasEl.addEventListener('pointerdown', this.onPointerDown);
    window.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerUp);
    this.canvasEl.addEventListener('wheel', this.onWheel, { passive: false });
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    this.canvasEl.addEventListener('contextmenu', this.onContextMenu);
    this.canvasEl.addEventListener('dblclick', this.onDblClick);
  }

  private unbind(): void {
    this.canvasEl.removeEventListener('pointerdown', this.onPointerDown);
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup', this.onPointerUp);
    this.canvasEl.removeEventListener('wheel', this.onWheel);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    this.canvasEl.removeEventListener('contextmenu', this.onContextMenu);
    this.canvasEl.removeEventListener('dblclick', this.onDblClick);
  }

  private localPos(e: PointerEvent | WheelEvent | MouseEvent): { x: number; y: number } {
    const rect = this.canvasEl.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  private onWheel(e: WheelEvent): void {
    e.preventDefault();
    const { x, y } = this.localPos(e);
    const factor = e.deltaY > 0 ? 0.9 : 1.1;
    this.state.zoomAt(x, y, factor);
    this.requestDraw();
  }

  private onContextMenu(e: MouseEvent): void {
    e.preventDefault();
    const { x, y } = this.localPos(e);
    const c = this.state.screenToCanvas(x, y);
    this.callbacks.onRequestAddNode?.(x, y, c.x, c.y);
  }

  private onDblClick(e: MouseEvent): void {
    const { x, y } = this.localPos(e);
    const c = this.state.screenToCanvas(x, y);
    // Double-click a node with fields → edit first field (e.g. float constant value).
    for (let i = this.graph.nodes.length - 1; i >= 0; i--) {
      const node = this.graph.nodes[i];
      if (!hitTestNode(node, c.x, c.y)) continue;
      const field = fieldsForNode(node)[0];
      if (field) {
        this.selectOnly([node.id]);
        const cur = node.customData[field.key] ?? field.default ?? '';
        const next = window.prompt(`请输入「${field.label}」`, String(cur));
        if (next != null) {
          if (field.type === 'number' || field.type === 'int') {
            const n = field.type === 'int' ? parseInt(next, 10) : parseFloat(next);
            if (!Number.isNaN(n)) node.customData[field.key] = n;
          } else if (field.type === 'bool') {
            node.customData[field.key] = next === 'true' || next === '1';
          } else {
            node.customData[field.key] = next;
          }
          this.markDirty('field');
          this.requestDraw();
        }
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      break;
    }
    this.callbacks.onRequestAddNode?.(x, y, c.x, c.y);
  }

  private onKeyDown(e: KeyboardEvent): void {
    if (e.code === 'Space') this.spaceDown = true;

    const target = e.target as HTMLElement | null;
    const inEditable =
      !!target &&
      (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
    const mod = e.ctrlKey || e.metaKey;
    const key = e.key.toLowerCase();

    // 系统撤销/重做：Cmd/Ctrl+Z、Cmd/Ctrl+Shift+Z、Ctrl+Y
    // Inspector 内输入时也走图撤销（属性已实时写入 customData，原生文本撤销无效）
    if (mod && key === 'z') {
      if (!inEditable || this.isFromOurPanel(target)) {
        if (e.shiftKey) this.redo();
        else this.undo();
        e.preventDefault();
      }
      return;
    }
    if (mod && key === 'y') {
      if (!inEditable || this.isFromOurPanel(target)) {
        this.redo();
        e.preventDefault();
      }
      return;
    }

    if (inEditable) return;

    if (e.key === 'Delete' || e.key === 'Backspace') {
      this.deleteSelection();
      e.preventDefault();
    } else if (mod && key === 'c') {
      this.copySelectionWithEdges();
      e.preventDefault();
    } else if (mod && key === 'v') {
      this.pasteBundle();
      e.preventDefault();
    } else if (mod && key === 'a') {
      this.selectOnly(this.graph.nodes.map((n) => n.id));
      e.preventDefault();
    } else if (e.key === 'a' || e.key === 'A') {
      // open add node at view center
      const sx = this.canvasEl.clientWidth / 2;
      const sy = this.canvasEl.clientHeight / 2;
      const c = this.state.screenToCanvas(sx, sy);
      this.callbacks.onRequestAddNode?.(sx, sy, c.x, c.y);
    }
  }

  private onKeyUp(e: KeyboardEvent): void {
    if (e.code === 'Space') this.spaceDown = false;
  }

  private onPointerDown(e: PointerEvent): void {
    this.canvasEl.setPointerCapture(e.pointerId);
    const { x, y } = this.localPos(e);
    const c = this.state.screenToCanvas(x, y);

    if (e.button === 1 || (e.button === 0 && (this.spaceDown || e.altKey))) {
      this.drag = { kind: 'pan', lastX: x, lastY: y };
      return;
    }

    if (e.button === 2) return;

    // ports first (topmost node)
    const nodesTopFirst = [...this.graph.nodes].reverse();
    for (const node of nodesTopFirst) {
      const port = hitTestPort(node, this.state, x, y);
      if (port) {
        this.drag = {
          kind: 'connect',
          fromNodeId: node.id,
          fromPortIndex: port.index,
          fromIsInput: port.isInput,
          curX: x,
          curY: y,
        };
        return;
      }
    }

    for (const node of nodesTopFirst) {
      if (hitTestNode(node, c.x, c.y)) {
        if (!this.selected.has(node.id)) {
          if (e.shiftKey) this.selected.add(node.id);
          else this.selected = new Set([node.id]);
          this.callbacks.onSelectionChange?.([...this.selected]);
        }
        this.drag = {
          kind: 'node',
          ids: [...this.selected],
          lastCX: c.x,
          lastCY: c.y,
        };
        this.requestDraw();
        return;
      }
    }

    // empty — box select or clear
    if (!e.shiftKey) {
      this.selected.clear();
      this.callbacks.onSelectionChange?.([]);
    }
    this.drag = { kind: 'box', x0: x, y0: y, x1: x, y1: y };
    this.requestDraw();
  }

  private onPointerMove(e: PointerEvent): void {
    const { x, y } = this.localPos(e);
    if (this.drag.kind === 'pan') {
      this.state.pan(x - this.drag.lastX, y - this.drag.lastY);
      this.drag.lastX = x;
      this.drag.lastY = y;
      this.requestDraw();
    } else if (this.drag.kind === 'node') {
      const c = this.state.screenToCanvas(x, y);
      const dx = c.x - this.drag.lastCX;
      const dy = c.y - this.drag.lastCY;
      for (const id of this.drag.ids) {
        const n = this.graph.findNode(id);
        if (!n) continue;
        n.position.x += dx;
        n.position.y += dy;
      }
      this.drag.lastCX = c.x;
      this.drag.lastCY = c.y;
      this.requestDraw();
    } else if (this.drag.kind === 'connect') {
      this.drag.curX = x;
      this.drag.curY = y;
      this.requestDraw();
    } else if (this.drag.kind === 'box') {
      this.drag.x1 = x;
      this.drag.y1 = y;
      this.requestDraw();
    }
  }

  private onPointerUp(e: PointerEvent): void {
    const { x, y } = this.localPos(e);
    if (this.drag.kind === 'connect') {
      const start = this.drag;
      const nodesTopFirst = [...this.graph.nodes].reverse();
      let connected = false;
      for (const node of nodesTopFirst) {
        const port = hitTestPort(node, this.state, x, y);
        if (!port) continue;
        if (node.id === start.fromNodeId && port.index === start.fromPortIndex && port.isInput === start.fromIsInput) {
          break;
        }
        // normalize: connection always from output -> input
        let fromNodeId: string;
        let fromPortIndex: number;
        let toNodeId: string;
        let toPortIndex: number;
        if (!start.fromIsInput && port.isInput) {
          fromNodeId = start.fromNodeId;
          fromPortIndex = start.fromPortIndex;
          toNodeId = node.id;
          toPortIndex = port.index;
        } else if (start.fromIsInput && !port.isInput) {
          fromNodeId = node.id;
          fromPortIndex = port.index;
          toNodeId = start.fromNodeId;
          toPortIndex = start.fromPortIndex;
        } else {
          break;
        }
        const ok = this.graph.addConnection(
          new Connection(fromNodeId, fromPortIndex, toNodeId, toPortIndex)
        );
        if (ok) {
          connected = true;
          this.markDirty('connect');
        }
        break;
      }
      if (!connected) {
        // click on connection line to delete? handled elsewhere
        const hit = hitTestConnection(this.graph, this.state, x, y);
        if (hit && e.altKey) {
          this.graph.removeConnection(hit);
          this.markDirty('disconnect');
        }
      }
    } else if (this.drag.kind === 'box') {
      const x0 = Math.min(this.drag.x0, this.drag.x1);
      const y0 = Math.min(this.drag.y0, this.drag.y1);
      const x1 = Math.max(this.drag.x0, this.drag.x1);
      const y1 = Math.max(this.drag.y0, this.drag.y1);
      if (Math.hypot(x1 - x0, y1 - y0) > 4) {
        const c0 = this.state.screenToCanvas(x0, y0);
        const c1 = this.state.screenToCanvas(x1, y1);
        const next = e.shiftKey ? new Set(this.selected) : new Set<string>();
        for (const n of this.graph.nodes) {
          measureNode(n);
          const nx0 = n.position.x;
          const ny0 = n.position.y;
          const nx1 = n.position.x + n.position.w;
          const ny1 = n.position.y + n.position.h;
          if (nx0 >= c0.x && ny0 >= c0.y && nx1 <= c1.x && ny1 <= c1.y) {
            next.add(n.id);
          }
        }
        this.selected = next;
        this.callbacks.onSelectionChange?.([...this.selected]);
      }
    } else if (this.drag.kind === 'node') {
      this.markDirty('move');
    }

    this.drag = { kind: 'none' };
    this.requestDraw();
  }
}
