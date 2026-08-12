'use strict';

import { GraphCanvas } from '../canvas/GraphCanvas';
import { filterNodeDefs } from '../canvas/NodeCreator';
import { measureNode } from '../canvas/NodeDrawer';
import { GraphProfile, GraphProfileJSON } from '../core/GraphProfile';
import { NodeGraph, NodeGraphJSON } from '../core/NodeGraph';
import { fieldsForNode } from '../core/nodeFields';
import { NodeRegistry } from '../core/NodeRegistry';
import { PortTypeRegistry } from '../core/PortTypeRegistry';
import { graphToString, loadGraphFromDb, saveGraphToDb, saveGraphToFile } from '../core/serialize';
import { BUILTIN_NODES } from '../nodes/builtins';
import type { FieldDef, NodeDefinition, PortTypeDef } from '../nodes/types';
import type { OpenGraphPayload } from '../api/messages';
import * as fs from 'fs';

const PKG = 'node-graph';

let graphCanvas: GraphCanvas | null = null;
let currentPath: string | null = null;
let dirty = false;
let addNodeCanvasPos = { x: 0, y: 0 };
let resizeObserver: ResizeObserver | null = null;

function ensureLocalRegistry(defs: NodeDefinition[], portTypes?: PortTypeDef[]): void {
  PortTypeRegistry.ensureInit();
  if (portTypes?.length) PortTypeRegistry.registerMany(portTypes);
  for (const d of defs) NodeRegistry.register(d);
  if (!NodeRegistry.get('FlowStart')) {
    NodeRegistry.registerMany(BUILTIN_NODES);
  }
}

async function syncRegistryFromMain(): Promise<void> {
  const [defs, portTypes] = await Promise.all([
    Editor.Message.request(PKG, 'query-node-defs') as Promise<NodeDefinition[]>,
    Editor.Message.request(PKG, 'query-port-types') as Promise<PortTypeDef[]>,
  ]);
  ensureLocalRegistry(defs ?? [], portTypes ?? []);
}

function setDirty(v: boolean, panel: PanelThis): void {
  dirty = v;
  const el = panel.$.dirty;
  if (el) el.textContent = v ? '●' : '';
  const pathEl = panel.$.path;
  if (pathEl) {
    const base = currentPath ? currentPath : '(未保存)';
    pathEl.textContent = base;
  }
}

function broadcastChanged(reason: string): void {
  Editor.Message.broadcast('node-graph:graph-changed', {
    path: currentPath,
    reason,
    graph: graphCanvas?.graph.toJSON() ?? null,
  });
}

function renderInspector(panel: PanelThis): void {
  const box = panel.$.inspectorBody;
  if (!box || !graphCanvas) return;
  const id = graphCanvas.getPrimarySelectedId();
  if (!id) {
    box.innerHTML = '<div class="hint">选中节点以编辑属性</div>';
    return;
  }
  const node = graphCanvas.graph.findNode(id);
  if (!node) {
    box.innerHTML = '<div class="hint">选中节点以编辑属性</div>';
    return;
  }
  const def = NodeRegistry.get(node.typeName);
  const fields: FieldDef[] = fieldsForNode(node);

  let html = `<div class="insp-title">${escapeHtml(node.title)}</div>`;
  html += `<div class="insp-meta">${escapeHtml(node.typeName)}</div>`;
  if (!def) {
    html += '<div class="hint" style="color:#fc6">节点定义未注册：请扩展管理器重载 skill-editor / node-graph 后重新打开图</div>';
  }
  if (fields.length === 0) {
    html += '<div class="hint">该节点无可编辑字段</div>';
  } else {
    html += '<div class="hint">在下方修改；也可双击节点输入</div>';
    for (const f of fields) {
      const val = node.customData[f.key] ?? f.default ?? '';
      html += `<label class="field"><span>${escapeHtml(f.label)}</span>`;
      if (f.type === 'bool') {
        html += `<input type="checkbox" data-key="${escapeHtml(f.key)}" ${val ? 'checked' : ''}/>`;
      } else if (f.type === 'enum' && f.options) {
        html += `<select data-key="${escapeHtml(f.key)}">`;
        for (const opt of f.options) {
          const selected = String(opt.value) === String(val) ? 'selected' : '';
          html += `<option value="${escapeHtml(String(opt.value))}" ${selected}>${escapeHtml(opt.label)}</option>`;
        }
        html += `</select>`;
      } else if (f.type === 'number' || f.type === 'int') {
        html += `<input type="number" data-key="${escapeHtml(f.key)}" value="${escapeHtml(String(val))}" step="${f.step ?? (f.type === 'int' ? 1 : 0.1)}"/>`;
      } else {
        html += `<input type="text" data-key="${escapeHtml(f.key)}" value="${escapeHtml(String(val))}"/>`;
      }
      html += `</label>`;
    }
  }
  box.innerHTML = html;

  const applyField = (el: Element) => {
    const key = (el as HTMLElement).dataset.key;
    if (!key || !node) return;
    const field = fields.find((f) => f.key === key);
    let value: unknown;
    if (el instanceof HTMLInputElement && el.type === 'checkbox') {
      value = el.checked;
    } else if (el instanceof HTMLInputElement && el.type === 'number') {
      value = field?.type === 'int' ? parseInt(el.value, 10) : parseFloat(el.value);
      if (Number.isNaN(value as number)) return;
    } else if (el instanceof HTMLSelectElement) {
      // enum：按 options 原类型回写（number 保持 number，避免画布/导出变成字符串）
      const raw = el.value;
      if (field?.type === 'enum' && field.options?.length) {
        const opt = field.options.find((o) => String(o.value) === raw);
        value = opt ? opt.value : raw;
      } else {
        const n = Number(raw);
        value = raw !== '' && Number.isFinite(n) && String(n) === raw ? n : raw;
      }
    } else if (el instanceof HTMLInputElement) {
      value = el.value;
    }
    node.customData[key] = value;
    setDirty(true, panel);
    graphCanvas!.markDirty('field');
    graphCanvas!.requestDraw();
    broadcastChanged('field');
  };

  box.querySelectorAll('input,select').forEach((el) => {
    el.addEventListener('change', () => applyField(el));
    el.addEventListener('input', () => applyField(el));
  });

  const first = box.querySelector('input[type="number"],input[type="text"]') as HTMLInputElement | null;
  first?.focus();
  first?.select();
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function showCreator(panel: PanelThis, screenX: number, screenY: number, cx: number, cy: number): void {
  addNodeCanvasPos = { x: cx, y: cy };
  const pop = panel.$.creator;
  const list = panel.$.creatorList;
  const input = panel.$.creatorSearch as HTMLInputElement;
  if (!pop || !list || !input || !graphCanvas) return;

  const rect = panel.$.canvasHost!.getBoundingClientRect();
  pop.style.display = 'flex';
  pop.style.left = `${Math.min(screenX, rect.width - 280)}px`;
  pop.style.top = `${Math.min(screenY, rect.height - 320)}px`;
  input.value = '';
  refreshCreatorList(panel, '');
  setTimeout(() => input.focus(), 0);
}

function hideCreator(panel: PanelThis): void {
  const pop = panel.$.creator;
  if (pop) pop.style.display = 'none';
}

function refreshCreatorList(panel: PanelThis, query: string): void {
  const list = panel.$.creatorList;
  if (!list || !graphCanvas) return;
  const items = filterNodeDefs(NodeRegistry.list(), graphCanvas.graph.profile, query);
  if (items.length === 0) {
    list.innerHTML = '<div class="hint">无匹配节点</div>';
    return;
  }
  let html = '';
  let lastCat = '';
  for (const item of items) {
    if (item.def.category !== lastCat) {
      lastCat = item.def.category;
      html += `<div class="cat">${escapeHtml(lastCat)}</div>`;
    }
    html += `<button class="node-item" data-type="${escapeHtml(item.def.typeName)}">${escapeHtml(item.def.title)} <span>${escapeHtml(item.def.typeName)}</span></button>`;
  }
  list.innerHTML = html;
  list.querySelectorAll('button.node-item').forEach((btn) => {
    btn.addEventListener('click', () => {
      const typeName = (btn as HTMLElement).dataset.type!;
      graphCanvas!.addNodeAt(typeName, addNodeCanvasPos.x, addNodeCanvasPos.y);
      setDirty(true, panel);
      broadcastChanged('add-node');
      hideCreator(panel);
      renderInspector(panel);
    });
  });
}

async function loadPayload(panel: PanelThis, payload: OpenGraphPayload): Promise<void> {
  await syncRegistryFromMain();

  let graph: NodeGraph;
  if (payload.path) {
    const loaded = await loadGraphFromDb(payload.path);
    if (loaded) {
      graph = loaded;
      currentPath = payload.path;
    } else {
      graph = NodeGraph.createEmpty(payload.profile);
      currentPath = payload.path;
    }
  } else if (payload.graph) {
    graph = NodeGraph.fromJSON(payload.graph);
    currentPath = null;
  } else {
    graph = NodeGraph.createEmpty(payload.profile);
    currentPath = null;
  }

  if (payload.profile) {
    graph.profile = GraphProfile.fromJSON(payload.profile);
  }

  if (!graphCanvas) return;
  // 按当前注册表字段重算节点高度（避免新字段节点仍是矮框）
  for (const n of graph.nodes) measureNode(n);
  graphCanvas.setGraph(graph);
  setDirty(false, panel);
  renderInspector(panel);
}

async function doSave(panel: PanelThis, pathOverride?: string): Promise<{ ok: boolean; path?: string | null }> {
  if (!graphCanvas) return { ok: false };
  const target = pathOverride ?? currentPath;
  if (!target) {
    return doSaveAs(panel);
  }
  let ok = false;
  if (target.startsWith('db://')) {
    ok = await saveGraphToDb(target, graphCanvas.graph);
  } else {
    try {
      saveGraphToFile(target, graphCanvas.graph);
      ok = true;
    } catch (e) {
      console.error(e);
      ok = false;
    }
  }
  if (ok) {
    currentPath = target;
    setDirty(false, panel);
    Editor.Message.broadcast('node-graph:graph-saved', {
      path: currentPath,
      graph: graphCanvas.graph.toJSON(),
    });
  }
  return { ok, path: currentPath };
}

async function doSaveAs(panel: PanelThis): Promise<{ ok: boolean; path?: string | null }> {
  if (!graphCanvas) return { ok: false };
  // Prefer project assets folder via dialog if available; fallback to db path prompt
  try {
    const result = (await (Editor as any).Dialog?.select?.({
      title: '保存节点图',
      type: 'file',
      filters: [{ extensions: ['graph.json', 'json'], name: 'Graph JSON' }],
    })) as string[] | string | null;
    const file = Array.isArray(result) ? result[0] : result;
    if (!file) return { ok: false };
    saveGraphToFile(file, graphCanvas.graph);
    currentPath = file;
    setDirty(false, panel);
    Editor.Message.broadcast('node-graph:graph-saved', {
      path: currentPath,
      graph: graphCanvas.graph.toJSON(),
    });
    return { ok: true, path: currentPath };
  } catch {
    const suggested = `db://assets/graphs/untitled.graph.json`;
    currentPath = suggested;
    const ok = await saveGraphToDb(suggested, graphCanvas.graph);
    if (ok) {
      setDirty(false, panel);
      Editor.Message.broadcast('node-graph:graph-saved', {
        path: currentPath,
        graph: graphCanvas.graph.toJSON(),
      });
    }
    return { ok, path: currentPath };
  }
}

async function doOpen(panel: PanelThis): Promise<void> {
  try {
    const result = (await (Editor as any).Dialog?.select?.({
      title: '打开节点图',
      type: 'file',
      filters: [{ extensions: ['graph.json', 'json'], name: 'Graph JSON' }],
      multi: false,
    })) as string[] | string | null;
    const file = Array.isArray(result) ? result[0] : result;
    if (!file) return;
    const text = fs.readFileSync(file, 'utf8');
    const json = JSON.parse(text) as NodeGraphJSON;
    await loadPayload(panel, { graph: json });
    currentPath = file;
    setDirty(false, panel);
  } catch (e) {
    console.warn('[node-graph] open dialog failed, use set-graph / open-graph API', e);
  }
}

interface PanelThis {
  $: Record<string, HTMLElement | null>;
}

export = Editor.Panel.define({
  listeners: {
    show() {
      graphCanvas?.resize();
      graphCanvas?.requestDraw();
    },
  },

  template: `
    <div class="root">
      <header class="toolbar">
        <div class="left">
          <strong>节点图</strong>
          <span class="dirty" id="dirty"></span>
          <span class="path" id="path">(未保存)</span>
        </div>
        <div class="right">
          <button id="btnOpen">打开</button>
          <button id="btnSave">保存</button>
          <button id="btnSaveAs">另存为</button>
          <button id="btnAdd">添加节点</button>
          <button id="btnDelete">删除</button>
        </div>
      </header>
      <div class="main">
        <div class="canvas-host" id="canvasHost">
          <canvas id="graphCanvas"></canvas>
          <div class="creator" id="creator" style="display:none">
            <input id="creatorSearch" placeholder="搜索节点…"/>
            <div class="creator-list" id="creatorList"></div>
          </div>
        </div>
        <aside class="inspector">
          <div class="insp-head">Inspector</div>
          <div class="inspector-body" id="inspectorBody">
            <div class="hint">选中节点以编辑属性</div>
          </div>
          <div class="tips">
            <div>右键 / 双击 / A：添加节点</div>
            <div>中键或 Alt+拖：平移 · 滚轮：缩放</div>
            <div>Ctrl/⌘+C/V：复制粘贴 · Del：删除</div>
            <div>Ctrl/⌘+Z：撤销 · Ctrl/⌘+Shift+Z / Ctrl+Y：重做</div>
          </div>
        </aside>
      </div>
    </div>
  `,

  style: `
    :host { display: flex; flex: 1; }
    .root { display: flex; flex-direction: column; flex: 1; height: 100%; background: #1a1a1a; color: #ddd; font-size: 12px; }
    .toolbar { display: flex; align-items: center; justify-content: space-between; padding: 6px 10px; background: #252525; border-bottom: 1px solid #111; gap: 8px; }
    .toolbar .left { display: flex; align-items: center; gap: 8px; min-width: 0; }
    .toolbar .path { color: #888; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 420px; }
    .toolbar .dirty { color: #ffcc33; width: 12px; }
    .toolbar .right { display: flex; gap: 6px; flex-shrink: 0; }
    .toolbar button { background: #3a3a3a; color: #eee; border: 1px solid #555; border-radius: 3px; padding: 3px 8px; cursor: pointer; }
    .toolbar button:hover { background: #4a4a4a; }
    .main { display: flex; flex: 1; min-height: 0; }
    .canvas-host { position: relative; flex: 1; min-width: 0; overflow: hidden; }
    canvas { display: block; width: 100%; height: 100%; touch-action: none; }
    .inspector { width: 260px; border-left: 1px solid #111; background: #222; display: flex; flex-direction: column; }
    .insp-head { padding: 8px 10px; font-weight: 600; border-bottom: 1px solid #111; }
    .inspector-body { padding: 10px; flex: 1; overflow: auto; }
    .insp-title { font-size: 14px; font-weight: 600; margin-bottom: 2px; }
    .insp-meta { color: #888; margin-bottom: 10px; }
    .field { display: flex; flex-direction: column; gap: 4px; margin-bottom: 10px; }
    .field input, .field select { background: #1a1a1a; color: #eee; border: 1px solid #555; border-radius: 3px; padding: 4px 6px; }
    .hint { color: #777; }
    .tips { padding: 8px 10px; border-top: 1px solid #111; color: #666; font-size: 11px; line-height: 1.5; }
    .creator { position: absolute; width: 260px; max-height: 340px; background: #2a2a2a; border: 1px solid #555; border-radius: 6px; box-shadow: 0 8px 24px rgba(0,0,0,.45); display: flex; flex-direction: column; z-index: 10; }
    .creator input { margin: 8px; background: #1a1a1a; color: #eee; border: 1px solid #555; border-radius: 3px; padding: 6px 8px; }
    .creator-list { overflow: auto; padding: 0 6px 8px; }
    .creator .cat { color: #888; padding: 6px 6px 2px; font-size: 11px; }
    .node-item { display: flex; justify-content: space-between; width: 100%; text-align: left; background: transparent; color: #eee; border: none; border-radius: 3px; padding: 6px; cursor: pointer; }
    .node-item span { color: #666; font-size: 10px; }
    .node-item:hover { background: #3a6ea5; }
  `,

  $: {
    dirty: '#dirty',
    path: '#path',
    canvasHost: '#canvasHost',
    graphCanvas: '#graphCanvas',
    creator: '#creator',
    creatorSearch: '#creatorSearch',
    creatorList: '#creatorList',
    inspectorBody: '#inspectorBody',
    btnOpen: '#btnOpen',
    btnSave: '#btnSave',
    btnSaveAs: '#btnSaveAs',
    btnAdd: '#btnAdd',
    btnDelete: '#btnDelete',
  },

  methods: {
    async loadIntoPanel(payload: OpenGraphPayload) {
      await loadPayload(this as unknown as PanelThis, payload || {});
      return { ok: true, path: currentPath };
    },

    panelGetGraph() {
      return graphCanvas?.graph.toJSON() ?? null;
    },

    async panelSetGraph(arg: { graph?: NodeGraphJSON; profile?: GraphProfileJSON }) {
      await loadPayload(this as unknown as PanelThis, {
        graph: arg?.graph,
        profile: arg?.profile,
      });
      return { ok: true };
    },

    async panelSaveGraph(arg?: { path?: string }) {
      return doSave(this as unknown as PanelThis, arg?.path);
    },

    async panelRefreshRegistry() {
      await syncRegistryFromMain();
      if (graphCanvas) {
        for (const n of graphCanvas.graph.nodes) measureNode(n);
        graphCanvas.requestDraw();
      }
      return { ok: true };
    },
  },

  async ready() {
    const panel = this as unknown as PanelThis;
    const info = (await Editor.Message.request(PKG, 'panel-ready')) as {
      nodes: NodeDefinition[];
      portTypes: PortTypeDef[];
    };
    ensureLocalRegistry(info?.nodes ?? BUILTIN_NODES, info?.portTypes);

    const canvasEl = panel.$.graphCanvas as HTMLCanvasElement;
    graphCanvas = new GraphCanvas(canvasEl, NodeGraph.createEmpty(), {
      onChange: (reason) => {
        if (reason !== 'load') {
          setDirty(true, panel);
          broadcastChanged(reason);
        }
        if (
          reason === 'field' ||
          reason === 'add-node' ||
          reason === 'remove' ||
          reason === 'paste' ||
          reason === 'undo' ||
          reason === 'redo'
        ) {
          renderInspector(panel);
        }
      },
      onSelectionChange: () => renderInspector(panel),
      onRequestAddNode: (sx, sy, cx, cy) => showCreator(panel, sx, sy, cx, cy),
    });

    graphCanvas.resize();
    resizeObserver = new ResizeObserver(() => graphCanvas?.resize());
    if (panel.$.canvasHost) resizeObserver.observe(panel.$.canvasHost);

    panel.$.btnOpen?.addEventListener('click', () => doOpen(panel));
    panel.$.btnSave?.addEventListener('click', () => doSave(panel));
    panel.$.btnSaveAs?.addEventListener('click', () => doSaveAs(panel));
    panel.$.btnDelete?.addEventListener('click', () => {
      graphCanvas?.deleteSelection();
      setDirty(true, panel);
      broadcastChanged('remove');
      renderInspector(panel);
    });
    panel.$.btnAdd?.addEventListener('click', () => {
      if (!graphCanvas) return;
      const sx = canvasEl.clientWidth / 2;
      const sy = canvasEl.clientHeight / 2;
      const c = graphCanvas.state.screenToCanvas(sx, sy);
      showCreator(panel, sx, sy, c.x, c.y);
    });

    const search = panel.$.creatorSearch as HTMLInputElement;
    search?.addEventListener('input', () => refreshCreatorList(panel, search.value));
    search?.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') hideCreator(panel);
    });

    // Panel runs in Shadow DOM: document-level e.target is retargeted to :host,
    // so pop.contains(e.target) is always false for in-popup clicks and would
    // hide the menu before the item click fires (nodes appear uncreatable).
    document.addEventListener('pointerdown', (e) => {
      const pop = panel.$.creator;
      if (!pop || pop.style.display === 'none') return;
      const path = typeof e.composedPath === 'function' ? e.composedPath() : [];
      if (path.includes(pop) || pop.contains(e.target as Node)) return;
      hideCreator(panel);
    });

    setDirty(false, panel);
  },

  close() {
    resizeObserver?.disconnect();
    resizeObserver = null;
    graphCanvas?.destroy();
    graphCanvas = null;
    Editor.Message.send(PKG, 'panel-closed');
  },
});
