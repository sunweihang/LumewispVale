"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GraphCanvas = void 0;
const CanvasState_1 = require("../core/CanvasState");
const Connection_1 = require("../core/Connection");
const GraphHistory_1 = require("../core/GraphHistory");
const nodeFields_1 = require("../core/nodeFields");
const NodeGraph_1 = require("../core/NodeGraph");
const NodeRegistry_1 = require("../core/NodeRegistry");
const ConnectionDrawer_1 = require("./ConnectionDrawer");
const GridDrawer_1 = require("./GridDrawer");
const NodeDrawer_1 = require("./NodeDrawer");
class GraphCanvas {
    constructor(canvasEl, graph, callbacks = {}) {
        this.state = new CanvasState_1.CanvasState();
        this.selected = new Set();
        this.drag = { kind: 'none' };
        this.clipboard = [];
        this.raf = 0;
        this.spaceDown = false;
        this.history = new GraphHistory_1.GraphHistory();
        this._clipBundle = null;
        this.canvasEl = canvasEl;
        const ctx = canvasEl.getContext('2d');
        if (!ctx)
            throw new Error('2d context unavailable');
        this.ctx = ctx;
        this.graph = graph;
        this.callbacks = callbacks;
        this.baseline = graph.toJSON();
        this.bind();
        this.requestDraw();
    }
    setGraph(graph) {
        var _a, _b;
        this.graph = graph;
        this.selected.clear();
        this.history.clear();
        this.baseline = graph.toJSON();
        (_b = (_a = this.callbacks).onSelectionChange) === null || _b === void 0 ? void 0 : _b.call(_a, []);
        this.requestDraw();
    }
    setCallbacks(cb) {
        this.callbacks = cb;
    }
    destroy() {
        this.unbind();
        cancelAnimationFrame(this.raf);
    }
    markDirty(reason) {
        var _a, _b;
        if (reason !== 'undo' && reason !== 'redo' && reason !== 'load') {
            this.history.pushBefore(this.baseline, reason);
            this.baseline = this.graph.toJSON();
        }
        else if (reason === 'load') {
            this.history.clear();
            this.baseline = this.graph.toJSON();
        }
        (_b = (_a = this.callbacks).onChange) === null || _b === void 0 ? void 0 : _b.call(_a, reason);
        this.requestDraw();
    }
    undo() {
        const prev = this.history.undo(this.graph.toJSON());
        if (!prev)
            return false;
        this.applySnapshot(prev);
        this.baseline = this.graph.toJSON();
        this.markDirty('undo');
        return true;
    }
    redo() {
        const next = this.history.redo(this.graph.toJSON());
        if (!next)
            return false;
        this.applySnapshot(next);
        this.baseline = this.graph.toJSON();
        this.markDirty('redo');
        return true;
    }
    applySnapshot(json) {
        var _a, _b;
        this.graph = NodeGraph_1.NodeGraph.fromJSON(json);
        for (const n of this.graph.nodes)
            (0, NodeDrawer_1.measureNode)(n);
        this.selected.clear();
        (_b = (_a = this.callbacks).onSelectionChange) === null || _b === void 0 ? void 0 : _b.call(_a, []);
    }
    /** 事件是否来自本面板（含 Shadow DOM 内的 Inspector） */
    isFromOurPanel(target) {
        if (!(target instanceof Node))
            return false;
        const root = this.canvasEl.getRootNode();
        if (root instanceof ShadowRoot) {
            return target.getRootNode() === root;
        }
        return this.canvasEl.contains(target);
    }
    selectOnly(ids) {
        var _a, _b;
        this.selected = new Set(ids);
        (_b = (_a = this.callbacks).onSelectionChange) === null || _b === void 0 ? void 0 : _b.call(_a, [...this.selected]);
        this.requestDraw();
    }
    getPrimarySelectedId() {
        if (this.selected.size === 0)
            return null;
        return [...this.selected][0];
    }
    addNodeAt(typeName, canvasX, canvasY) {
        const node = NodeRegistry_1.NodeRegistry.createNode(typeName, NodeGraph_1.NodeGraph.generateNodeId(), canvasX, canvasY);
        if (!node)
            return false;
        if (!this.graph.isNodeAllowed(typeName))
            return false;
        this.graph.addNode(node);
        this.selectOnly([node.id]);
        this.markDirty('add-node');
        return true;
    }
    deleteSelection() {
        var _a, _b;
        if (this.selected.size === 0)
            return;
        this.graph.removeNodes([...this.selected]);
        this.selected.clear();
        (_b = (_a = this.callbacks).onSelectionChange) === null || _b === void 0 ? void 0 : _b.call(_a, []);
        this.markDirty('remove');
    }
    copySelection() {
        this.clipboard = this.graph.nodes
            .filter((n) => this.selected.has(n.id))
            .map((n) => n.toJSON());
    }
    pasteClipboard(offset = 40) {
        if (this.clipboard.length === 0)
            return;
        const idMap = new Map();
        const newIds = [];
        for (const raw of this.clipboard) {
            const newId = NodeGraph_1.NodeGraph.generateNodeId();
            idMap.set(raw.id, newId);
            const node = NodeRegistry_1.NodeRegistry.createNode(raw.typeName, newId, raw.position.x + offset, raw.position.y + offset);
            if (!node)
                continue;
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
    copySelectionWithEdges() {
        const nodes = this.graph.nodes.filter((n) => this.selected.has(n.id)).map((n) => n.toJSON());
        const ids = new Set(nodes.map((n) => n.id));
        const connections = this.graph.connections
            .filter((c) => ids.has(c.fromNodeId) && ids.has(c.toNodeId))
            .map((c) => c.toJSON());
        this._clipBundle = { nodes, connections };
        this.clipboard = nodes;
    }
    pasteBundle(offset = 40) {
        const bundle = this._clipBundle;
        if (!bundle || bundle.nodes.length === 0) {
            this.pasteClipboard(offset);
            return;
        }
        const idMap = new Map();
        const newIds = [];
        for (const raw of bundle.nodes) {
            const newId = NodeGraph_1.NodeGraph.generateNodeId();
            idMap.set(raw.id, newId);
            const node = NodeRegistry_1.NodeRegistry.createNode(raw.typeName, newId, raw.position.x + offset, raw.position.y + offset);
            if (!node)
                continue;
            node.customData = JSON.parse(JSON.stringify(raw.customData));
            node.title = raw.title;
            (0, NodeDrawer_1.measureNode)(node);
            this.graph.addNode(node);
            newIds.push(newId);
        }
        for (const c of bundle.connections) {
            const from = idMap.get(c.fromNodeId);
            const to = idMap.get(c.toNodeId);
            if (!from || !to)
                continue;
            this.graph.addConnection(new Connection_1.Connection(from, c.fromPortIndex, to, c.toPortIndex));
        }
        this.selectOnly(newIds);
        this.markDirty('paste');
    }
    requestDraw() {
        cancelAnimationFrame(this.raf);
        this.raf = requestAnimationFrame(() => this.draw());
    }
    resize() {
        const parent = this.canvasEl.parentElement;
        if (!parent)
            return;
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
    draw() {
        const w = this.canvasEl.clientWidth;
        const h = this.canvasEl.clientHeight;
        const light = this.graph.profile.useLightTheme;
        (0, GridDrawer_1.drawGrid)(this.ctx, w, h, this.state, light);
        (0, ConnectionDrawer_1.drawConnections)(this.ctx, this.graph, this.state);
        if (this.drag.kind === 'connect') {
            const fromNode = this.graph.findNode(this.drag.fromNodeId);
            if (fromNode) {
                const p = (0, NodeDrawer_1.getPortScreenPos)(fromNode, this.drag.fromPortIndex, this.drag.fromIsInput, this.state);
                const x1 = this.drag.fromIsInput ? this.drag.curX : p.x;
                const y1 = this.drag.fromIsInput ? this.drag.curY : p.y;
                const x2 = this.drag.fromIsInput ? p.x : this.drag.curX;
                const y2 = this.drag.fromIsInput ? p.y : this.drag.curY;
                (0, ConnectionDrawer_1.drawBezier)(this.ctx, x1, y1, x2, y2, '#ffcc33', 2);
            }
        }
        // draw nodes in order; selected on top
        const nodes = [...this.graph.nodes].sort((a, b) => {
            const as = this.selected.has(a.id) ? 1 : 0;
            const bs = this.selected.has(b.id) ? 1 : 0;
            return as - bs;
        });
        for (const node of nodes) {
            (0, NodeDrawer_1.drawNode)(this.ctx, node, this.state, this.selected.has(node.id), light);
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
    bind() {
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
    unbind() {
        this.canvasEl.removeEventListener('pointerdown', this.onPointerDown);
        window.removeEventListener('pointermove', this.onPointerMove);
        window.removeEventListener('pointerup', this.onPointerUp);
        this.canvasEl.removeEventListener('wheel', this.onWheel);
        window.removeEventListener('keydown', this.onKeyDown);
        window.removeEventListener('keyup', this.onKeyUp);
        this.canvasEl.removeEventListener('contextmenu', this.onContextMenu);
        this.canvasEl.removeEventListener('dblclick', this.onDblClick);
    }
    localPos(e) {
        const rect = this.canvasEl.getBoundingClientRect();
        return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    }
    onWheel(e) {
        e.preventDefault();
        const { x, y } = this.localPos(e);
        const factor = e.deltaY > 0 ? 0.9 : 1.1;
        this.state.zoomAt(x, y, factor);
        this.requestDraw();
    }
    onContextMenu(e) {
        var _a, _b;
        e.preventDefault();
        const { x, y } = this.localPos(e);
        const c = this.state.screenToCanvas(x, y);
        (_b = (_a = this.callbacks).onRequestAddNode) === null || _b === void 0 ? void 0 : _b.call(_a, x, y, c.x, c.y);
    }
    onDblClick(e) {
        var _a, _b, _c, _d;
        const { x, y } = this.localPos(e);
        const c = this.state.screenToCanvas(x, y);
        // Double-click a node with fields → edit first field (e.g. float constant value).
        for (let i = this.graph.nodes.length - 1; i >= 0; i--) {
            const node = this.graph.nodes[i];
            if (!(0, NodeDrawer_1.hitTestNode)(node, c.x, c.y))
                continue;
            const field = (0, nodeFields_1.fieldsForNode)(node)[0];
            if (field) {
                this.selectOnly([node.id]);
                const cur = (_b = (_a = node.customData[field.key]) !== null && _a !== void 0 ? _a : field.default) !== null && _b !== void 0 ? _b : '';
                const next = window.prompt(`请输入「${field.label}」`, String(cur));
                if (next != null) {
                    if (field.type === 'number' || field.type === 'int') {
                        const n = field.type === 'int' ? parseInt(next, 10) : parseFloat(next);
                        if (!Number.isNaN(n))
                            node.customData[field.key] = n;
                    }
                    else if (field.type === 'bool') {
                        node.customData[field.key] = next === 'true' || next === '1';
                    }
                    else {
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
        (_d = (_c = this.callbacks).onRequestAddNode) === null || _d === void 0 ? void 0 : _d.call(_c, x, y, c.x, c.y);
    }
    onKeyDown(e) {
        var _a, _b;
        if (e.code === 'Space')
            this.spaceDown = true;
        const target = e.target;
        const inEditable = !!target &&
            (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
        const mod = e.ctrlKey || e.metaKey;
        const key = e.key.toLowerCase();
        // 系统撤销/重做：Cmd/Ctrl+Z、Cmd/Ctrl+Shift+Z、Ctrl+Y
        // Inspector 内输入时也走图撤销（属性已实时写入 customData，原生文本撤销无效）
        if (mod && key === 'z') {
            if (!inEditable || this.isFromOurPanel(target)) {
                if (e.shiftKey)
                    this.redo();
                else
                    this.undo();
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
        if (inEditable)
            return;
        if (e.key === 'Delete' || e.key === 'Backspace') {
            this.deleteSelection();
            e.preventDefault();
        }
        else if (mod && key === 'c') {
            this.copySelectionWithEdges();
            e.preventDefault();
        }
        else if (mod && key === 'v') {
            this.pasteBundle();
            e.preventDefault();
        }
        else if (mod && key === 'a') {
            this.selectOnly(this.graph.nodes.map((n) => n.id));
            e.preventDefault();
        }
        else if (e.key === 'a' || e.key === 'A') {
            // open add node at view center
            const sx = this.canvasEl.clientWidth / 2;
            const sy = this.canvasEl.clientHeight / 2;
            const c = this.state.screenToCanvas(sx, sy);
            (_b = (_a = this.callbacks).onRequestAddNode) === null || _b === void 0 ? void 0 : _b.call(_a, sx, sy, c.x, c.y);
        }
    }
    onKeyUp(e) {
        if (e.code === 'Space')
            this.spaceDown = false;
    }
    onPointerDown(e) {
        var _a, _b, _c, _d;
        this.canvasEl.setPointerCapture(e.pointerId);
        const { x, y } = this.localPos(e);
        const c = this.state.screenToCanvas(x, y);
        if (e.button === 1 || (e.button === 0 && (this.spaceDown || e.altKey))) {
            this.drag = { kind: 'pan', lastX: x, lastY: y };
            return;
        }
        if (e.button === 2)
            return;
        // ports first (topmost node)
        const nodesTopFirst = [...this.graph.nodes].reverse();
        for (const node of nodesTopFirst) {
            const port = (0, NodeDrawer_1.hitTestPort)(node, this.state, x, y);
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
            if ((0, NodeDrawer_1.hitTestNode)(node, c.x, c.y)) {
                if (!this.selected.has(node.id)) {
                    if (e.shiftKey)
                        this.selected.add(node.id);
                    else
                        this.selected = new Set([node.id]);
                    (_b = (_a = this.callbacks).onSelectionChange) === null || _b === void 0 ? void 0 : _b.call(_a, [...this.selected]);
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
            (_d = (_c = this.callbacks).onSelectionChange) === null || _d === void 0 ? void 0 : _d.call(_c, []);
        }
        this.drag = { kind: 'box', x0: x, y0: y, x1: x, y1: y };
        this.requestDraw();
    }
    onPointerMove(e) {
        const { x, y } = this.localPos(e);
        if (this.drag.kind === 'pan') {
            this.state.pan(x - this.drag.lastX, y - this.drag.lastY);
            this.drag.lastX = x;
            this.drag.lastY = y;
            this.requestDraw();
        }
        else if (this.drag.kind === 'node') {
            const c = this.state.screenToCanvas(x, y);
            const dx = c.x - this.drag.lastCX;
            const dy = c.y - this.drag.lastCY;
            for (const id of this.drag.ids) {
                const n = this.graph.findNode(id);
                if (!n)
                    continue;
                n.position.x += dx;
                n.position.y += dy;
            }
            this.drag.lastCX = c.x;
            this.drag.lastCY = c.y;
            this.requestDraw();
        }
        else if (this.drag.kind === 'connect') {
            this.drag.curX = x;
            this.drag.curY = y;
            this.requestDraw();
        }
        else if (this.drag.kind === 'box') {
            this.drag.x1 = x;
            this.drag.y1 = y;
            this.requestDraw();
        }
    }
    onPointerUp(e) {
        var _a, _b;
        const { x, y } = this.localPos(e);
        if (this.drag.kind === 'connect') {
            const start = this.drag;
            const nodesTopFirst = [...this.graph.nodes].reverse();
            let connected = false;
            for (const node of nodesTopFirst) {
                const port = (0, NodeDrawer_1.hitTestPort)(node, this.state, x, y);
                if (!port)
                    continue;
                if (node.id === start.fromNodeId && port.index === start.fromPortIndex && port.isInput === start.fromIsInput) {
                    break;
                }
                // normalize: connection always from output -> input
                let fromNodeId;
                let fromPortIndex;
                let toNodeId;
                let toPortIndex;
                if (!start.fromIsInput && port.isInput) {
                    fromNodeId = start.fromNodeId;
                    fromPortIndex = start.fromPortIndex;
                    toNodeId = node.id;
                    toPortIndex = port.index;
                }
                else if (start.fromIsInput && !port.isInput) {
                    fromNodeId = node.id;
                    fromPortIndex = port.index;
                    toNodeId = start.fromNodeId;
                    toPortIndex = start.fromPortIndex;
                }
                else {
                    break;
                }
                const ok = this.graph.addConnection(new Connection_1.Connection(fromNodeId, fromPortIndex, toNodeId, toPortIndex));
                if (ok) {
                    connected = true;
                    this.markDirty('connect');
                }
                break;
            }
            if (!connected) {
                // click on connection line to delete? handled elsewhere
                const hit = (0, ConnectionDrawer_1.hitTestConnection)(this.graph, this.state, x, y);
                if (hit && e.altKey) {
                    this.graph.removeConnection(hit);
                    this.markDirty('disconnect');
                }
            }
        }
        else if (this.drag.kind === 'box') {
            const x0 = Math.min(this.drag.x0, this.drag.x1);
            const y0 = Math.min(this.drag.y0, this.drag.y1);
            const x1 = Math.max(this.drag.x0, this.drag.x1);
            const y1 = Math.max(this.drag.y0, this.drag.y1);
            if (Math.hypot(x1 - x0, y1 - y0) > 4) {
                const c0 = this.state.screenToCanvas(x0, y0);
                const c1 = this.state.screenToCanvas(x1, y1);
                const next = e.shiftKey ? new Set(this.selected) : new Set();
                for (const n of this.graph.nodes) {
                    (0, NodeDrawer_1.measureNode)(n);
                    const nx0 = n.position.x;
                    const ny0 = n.position.y;
                    const nx1 = n.position.x + n.position.w;
                    const ny1 = n.position.y + n.position.h;
                    if (nx0 >= c0.x && ny0 >= c0.y && nx1 <= c1.x && ny1 <= c1.y) {
                        next.add(n.id);
                    }
                }
                this.selected = next;
                (_b = (_a = this.callbacks).onSelectionChange) === null || _b === void 0 ? void 0 : _b.call(_a, [...this.selected]);
            }
        }
        else if (this.drag.kind === 'node') {
            this.markDirty('move');
        }
        this.drag = { kind: 'none' };
        this.requestDraw();
    }
}
exports.GraphCanvas = GraphCanvas;
//# sourceMappingURL=GraphCanvas.js.map