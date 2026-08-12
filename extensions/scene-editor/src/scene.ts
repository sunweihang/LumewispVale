/**
 * 场景脚本：在打开的资源 Prefab 上绘制逻辑种植预览（DontSave，不写回 Prefab）。
 * 点位/区域中心实例化单位模型（avatar.model → unit prefab）；区域另画半透明盒。
 * 另：资源场景阻挡种植 —— 鼠标跟手笔刷（cce.Operation）。
 */
'use strict';

import { stampBrushCells, worldToCell } from './blockPlantUtil';

const PREVIEW_ROOT = '__MonsterSpawnPreview';
const BLOCK_PREVIEW_ROOT = '__BlockPlantPreview';
const BLOCK_BRUSH_CURSOR = '__BlockBrushCursor';
const BLOCK_GRID_ROOT = '__BlockPlantGrid';
const AREA_COLOR = { r: 40, g: 220, b: 255, a: 70 };
const POINT_COLOR = { r: 255, g: 180, b: 40, a: 110 };
/** 用不透明：半透明在编辑器里常被画成白框/几乎看不见 */
const BLOCK_COLOR = { r: 230, g: 55, b: 55, a: 255 };
const BRUSH_COLOR = { r: 255, g: 120, b: 40, a: 255 };
const GRID_COLOR = { r: 60, g: 170, b: 255, a: 220 };
/** 预览时临时隐藏 Prefab 旧刷怪节点，避免与逻辑种植青盒叠成「多一个」 */
const HIDDEN_BORN_FLAG = '__spawnPreviewHidden';
/** 涂抹时压过 Gizmo 框选（Preview=999，再抬高一档） */
const BRUSH_OP_PRIORITY = 99999;
let _previewGen = 0;
let _blockPreviewGen = 0;

type MouseBrushState = {
  active: boolean;
  painting: boolean;
  erase: boolean;
  cellSize: number;
  originX: number;
  originZ: number;
  brushRadius: number;
  cells: Set<string>;
  lastCellKey: string;
  dirty: boolean;
};

const _mouseBrush: MouseBrushState = {
  active: false,
  painting: false,
  erase: false,
  cellSize: 1,
  originX: 0,
  originZ: 0,
  brushRadius: 1,
  cells: new Set(),
  lastCellKey: '',
  dirty: false,
};

let _onBrushMove: ((e: any) => boolean | void) | null = null;
let _onBrushDown: ((e: any) => boolean | void) | null = null;
let _onBrushUp: ((e: any) => boolean | void) | null = null;
/** DOM 捕获 */
let _domTargets: EventTarget[] = [];
let _domMove: ((ev: Event) => void) | null = null;
let _domDown: ((ev: Event) => void) | null = null;
let _domUp: ((ev: Event) => void) | null = null;
let _domContext: ((ev: Event) => void) | null = null;
/** 全局 mouseup，防止点一下后 painting 卡死导致场景一直跟鼠标 */
let _domUpGlobal: ((ev: Event) => void) | null = null;
/** 引擎 input 监听 */
let _onEngineMouseMove: ((e: any) => void) | null = null;
let _onEngineMouseDown: ((e: any) => void) | null = null;
let _onEngineMouseUp: ((e: any) => void) | null = null;
/** 地面高度（取 Floor 世界 Y，避免写死 0） */
let _groundY = 0;
/** 隐藏框选 DOM 的 style 标签 */
let _marqueeStyleEl: HTMLStyleElement | null = null;
/** 盖在场景 canvas 上的捕获层：左键涂抹，右键穿透给相机 */
let _brushOverlay: HTMLDivElement | null = null;
let _overlayPassThrough = false;
let _selWatchTimer: ReturnType<typeof setInterval> | null = null;
/**
 * DOM 后备用：clientY → 与 Operation.e.y 对齐。
 * 0 未判定，1=顶左直通，2=翻成左下。Operation 主路径直接用 e.x/e.y，不走这套。
 */
let _clientYMode = 0;
/** 最近一次 Operation 处理时间，避免 DOM 二次映射把位置冲偏 */
let _lastOpBrushAt = 0;

type Vec3 = { x?: number; y?: number; z?: number };
type SpawnItem = {
  position?: Vec3;
  scale?: Vec3;
  eulerAngles?: Vec3;
  enemyKeys?: string[];
  enemyCount?: number;
  monsterKey?: string;
  unitConfigId?: number;
  unitKind?: string;
  avatarId?: number;
  spawnShape?: 'area' | 'point';
  level?: number;
  previewPrefabUuid?: string;
  previewModelId?: number;
};
type SpawnLayer = { layerId?: number; layerName?: string; items?: SpawnItem[] };

export function load(): void {
  console.log('[scene-editor] scene script load');
}

export function unload(): void {
  stopMouseBrushTool();
  console.log('[scene-editor] scene script unload');
}

function getCce(): any {
  return (globalThis as any).cce || null;
}

function rayHitGround(ray: any, groundY: number): { ok: boolean; x?: number; z?: number; t?: number; reason?: string } {
  const oy = Number(ray?.o?.y ?? ray?.orig?.y ?? 0);
  const dy = Number(ray?.d?.y ?? ray?.dir?.y ?? 0);
  if (!Number.isFinite(dy) || Math.abs(dy) < 1e-8) return { ok: false, reason: '镜头几乎水平' };
  const t = (groundY - oy) / dy;
  // 允许贴地近距（旧阈值 0.01 会在俯视时误杀）
  if (!Number.isFinite(t) || t < 0) return { ok: false, reason: '未打到地面' };
  const ox = Number(ray?.o?.x ?? ray?.orig?.x ?? 0);
  const oz = Number(ray?.o?.z ?? ray?.orig?.z ?? 0);
  const dx = Number(ray?.d?.x ?? ray?.dir?.x ?? 0);
  const dz = Number(ray?.d?.z ?? ray?.dir?.z ?? 0);
  return { ok: true, x: ox + dx * t, z: oz + dz * t, t };
}

function rayDirectionLen2(ray: any): number {
  const dx = Number(ray?.d?.x ?? ray?.dir?.x ?? 0);
  const dy = Number(ray?.d?.y ?? ray?.dir?.y ?? 0);
  const dz = Number(ray?.d?.z ?? ray?.dir?.z ?? 0);
  return dx * dx + dy * dy + dz * dz;
}

function getEditorCamComp(): any | null {
  try {
    return getCce()?.Camera?.camera || null;
  } catch {
    return null;
  }
}

function getEditorCamInst(): any | null {
  try {
    return getCce()?.Camera?.getCamera?.() || getEditorCamComp()?.camera || null;
  } catch {
    return null;
  }
}

/** 把地面点投回屏幕，用于 round-trip 校验跟手 */
type RayFillKind = 'comp' | 'inst' | 'stw';

function fillRayVariant(
  screenX: number,
  screenY: number,
  ray: any,
  kind: RayFillKind
): boolean {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const cc = require('cc');
  const { geometry, Vec3 } = cc;
  try {
    if (kind === 'comp') {
      const camComp = getEditorCamComp();
      if (!camComp?.screenPointToRay) return false;
      const ret = camComp.screenPointToRay(screenX, screenY, ray);
      if (ret && ret !== ray && rayDirectionLen2(ray) <= 1e-12) {
        if (ret.o) ray.o = ret.o;
        if (ret.d) ray.d = ret.d;
      }
      return rayDirectionLen2(ray) > 1e-12;
    }
    if (kind === 'inst') {
      const camInst = getEditorCamInst();
      if (!camInst?.screenPointToRay) return false;
      camInst.screenPointToRay(ray, screenX, screenY);
      return rayDirectionLen2(ray) > 1e-12;
    }
    if (kind === 'stw') {
      // screenToWorld 近/远平面构图射线（不依赖 screenPointToRay 签名）
      const camComp = getEditorCamComp();
      if (!camComp?.screenToWorld) return false;
      const near = new Vec3();
      const far = new Vec3();
      const a = camComp.screenToWorld(new Vec3(screenX, screenY, 0), near) || near;
      const b = camComp.screenToWorld(new Vec3(screenX, screenY, 1), far) || far;
      const ox = Number(a.x);
      const oy = Number(a.y);
      const oz = Number(a.z);
      const dx = Number(b.x) - ox;
      const dy = Number(b.y) - oy;
      const dz = Number(b.z) - oz;
      if (!Number.isFinite(dx) || dx * dx + dy * dy + dz * dz < 1e-12) return false;
      if (geometry?.Ray?.set) {
        geometry.Ray.set(ray, ox, oy, oz, dx, dy, dz);
      } else {
        ray.o = { x: ox, y: oy, z: oz };
        ray.d = { x: dx, y: dy, z: dz };
      }
      return true;
    }
  } catch {
    return false;
  }
  return false;
}

function pickGroundWithRay(
  screenX: number,
  screenY: number,
  kind: RayFillKind,
  groundY = 0
): { ok: boolean; reason?: string; x?: number; y?: number; z?: number; t?: number } {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const cc = require('cc');
  const { geometry } = cc;
  const ray = new geometry.Ray();
  if (!fillRayVariant(screenX, screenY, ray, kind)) {
    return { ok: false, reason: `ray:${kind}` };
  }
  const hit = rayHitGround(ray, groundY);
  if (!hit.ok) return { ok: false, reason: hit.reason };
  return { ok: true, x: hit.x, y: groundY, z: hit.z, t: hit.t };
}

function pickGroundAtScreen(screenX: number, screenY: number, groundY = 0): {
  ok: boolean;
  reason?: string;
  x?: number;
  y?: number;
  z?: number;
  t?: number;
} {
  // 兼容旧调用：按优先级试
  for (const kind of ['comp', 'inst', 'stw'] as RayFillKind[]) {
    const hit = pickGroundWithRay(screenX, screenY, kind, groundY);
    if (hit.ok) return hit;
  }
  return { ok: false, reason: '未找到编辑器相机' };
}

/**
 * 手动 NDC → 射线 → 地面（不依赖 screenPointToRay，避免编辑器相机吞坐标）。
 * screenY：左下原点。
 */
function pickGroundManualNDC(
  screenX: number,
  screenY: number,
  viewW: number,
  viewH: number,
  groundY = 0
): { ok: boolean; reason?: string; x?: number; y?: number; z?: number; t?: number } {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const cc = require('cc');
  const { Vec3, Camera } = cc;
  const camComp = getEditorCamComp();
  const node = camComp?.node;
  if (!node || viewW < 2 || viewH < 2) return { ok: false, reason: '无编辑器相机' };

  const ndcX = (screenX / viewW) * 2 - 1;
  const ndcY = (screenY / viewH) * 2 - 1;

  const forward = new Vec3();
  const right = new Vec3();
  const up = new Vec3();
  Vec3.transformQuat(forward, new Vec3(0, 0, -1), node.worldRotation);
  Vec3.transformQuat(right, new Vec3(1, 0, 0), node.worldRotation);
  Vec3.transformQuat(up, new Vec3(0, 1, 0), node.worldRotation);

  const origin = new Vec3(node.worldPosition.x, node.worldPosition.y, node.worldPosition.z);
  const dir = new Vec3();
  const aspect = viewW / viewH;

  const projOrtho =
    Camera?.ProjectionType?.ORTHO !== undefined
      ? camComp.projection === Camera.ProjectionType.ORTHO
      : camComp.projection === 0;

  if (projOrtho) {
    const oh = Number(camComp.orthoHeight) || 10;
    const ow = oh * aspect;
    // 正交：起点在近平面上偏移，方向为 forward
    origin.x += right.x * ndcX * ow + up.x * ndcY * oh;
    origin.y += right.y * ndcX * ow + up.y * ndcY * oh;
    origin.z += right.z * ndcX * ow + up.z * ndcY * oh;
    Vec3.copy(dir, forward);
  } else {
    const fov = ((Number(camComp.fov) || 45) * Math.PI) / 180;
    const tanHalf = Math.tan(fov * 0.5);
    const axis = camComp.fovAxis;
    const horizontal =
      Camera?.FOVAxis?.HORIZONTAL !== undefined
        ? axis === Camera.FOVAxis.HORIZONTAL
        : axis === 1;
    Vec3.copy(dir, forward);
    if (horizontal) {
      // 水平 FOV：tanHalf 对应 X
      Vec3.scaleAndAdd(dir, dir, right, ndcX * tanHalf);
      Vec3.scaleAndAdd(dir, dir, up, (ndcY * tanHalf) / aspect);
    } else {
      // 垂直 FOV（默认）：tanHalf 对应 Y
      Vec3.scaleAndAdd(dir, dir, right, ndcX * tanHalf * aspect);
      Vec3.scaleAndAdd(dir, dir, up, ndcY * tanHalf);
    }
    Vec3.normalize(dir, dir);
  }

  const hit = rayHitGround({ o: origin, d: dir }, groundY);
  if (!hit.ok) return { ok: false, reason: hit.reason };
  return { ok: true, x: hit.x, y: groundY, z: hit.z, t: hit.t };
}

/**
 * 屏幕点 → 地面。
 * 优先编辑器相机 screenPointToRay / screenToWorld（与 Gizmo 同系），再退回手动 NDC。
 * screenY：左下原点。
 */
function pickGroundForBrush(
  screenX: number,
  screenY: number,
  viewH: number,
  groundY = 0,
  viewW?: number
): { ok: boolean; reason?: string; x?: number; y?: number; z?: number; variant?: string } {
  const { w } = resolveViewSize();
  const vw = viewW && viewW > 1 ? viewW : w > 1 ? w : 800;
  const vh = viewH > 1 ? viewH : 600;

  for (const kind of ['comp', 'stw', 'inst'] as RayFillKind[]) {
    const hit = pickGroundWithRay(screenX, screenY, kind, groundY);
    if (hit.ok) return { ...hit, variant: kind };
  }

  const manual = pickGroundManualNDC(screenX, screenY, vw, vh, groundY);
  if (manual.ok) return { ...manual, variant: 'ndc' };
  return { ok: false, reason: manual.reason || '未打到地面' };
}

/** 从 Floor 节点取地面高度 */
function refreshGroundY(): number {
  try {
    const room = findRoomRoot();
    const floor = room?.getChildByName?.('Floor');
    if (floor) {
      const p = floor.worldPosition || floor.position;
      if (Number.isFinite(p?.y)) {
        _groundY = Number(p.y);
        return _groundY;
      }
    }
  } catch {
    /* ignore */
  }
  _groundY = 0;
  return 0;
}

function resolveViewSize(): { w: number; h: number } {
  const cceApi = getCce();
  try {
    const cam = cceApi?.Camera?.camera?.camera || cceApi?.Camera?.getCamera?.();
    const w = Number(cam?.width) || 0;
    const h = Number(cam?.height) || 0;
    if (w > 1 && h > 1) return { w, h };
  } catch {
    /* ignore */
  }
  const canvas = findSceneCanvas();
  if (canvas) {
    return {
      w: canvas.width || canvas.clientWidth || 800,
      h: canvas.height || canvas.clientHeight || 600,
    };
  }
  return { w: 800, h: 600 };
}

function listSceneCanvases(): HTMLCanvasElement[] {
  try {
    const doc = (globalThis as any).document as Document | undefined;
    if (!doc) return [];
    return Array.from(doc.querySelectorAll('canvas')) as HTMLCanvasElement[];
  } catch {
    return [];
  }
}

/** 优先匹配编辑器相机分辨率的 canvas，避免误绑到更大的隐藏 canvas */
function findSceneCanvas(): HTMLCanvasElement | null {
  const list = listSceneCanvases();
  if (!list.length) return null;
  const { w, h } = (() => {
    try {
      const cam = getCce()?.Camera?.camera?.camera || getCce()?.Camera?.getCamera?.();
      return { w: Number(cam?.width) || 0, h: Number(cam?.height) || 0 };
    } catch {
      return { w: 0, h: 0 };
    }
  })();
  let best = list[0];
  let bestScore = -1;
  for (const c of list) {
    const cw = c.width || c.clientWidth || 0;
    const ch = c.height || c.clientHeight || 0;
    const area = (c.clientWidth || 0) * (c.clientHeight || 0);
    if (area < 4) continue;
    let score = area;
    if (w > 1 && h > 1) {
      const dw = Math.abs(cw - w) + Math.abs(ch - h);
      score = 1e12 - dw * 1000 + area; // 分辨率越接近越好
    }
    if (score > bestScore) {
      best = c;
      bestScore = score;
    }
  }
  return best;
}

/** 鼠标下的 canvas（比「最大 canvas」更准） */
function canvasUnderPoint(clientX: number, clientY: number): HTMLCanvasElement | null {
  const list = listSceneCanvases();
  let hit: HTMLCanvasElement | null = null;
  let bestArea = 0;
  for (const c of list) {
    const rect = c.getBoundingClientRect?.();
    if (!rect || rect.width < 2 || rect.height < 2) continue;
    if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) {
      continue;
    }
    const area = rect.width * rect.height;
    // 取面积最小的命中（更可能是场景视图，而不是全屏垫底 canvas）
    if (!hit || area < bestArea) {
      hit = c;
      bestArea = area;
    }
  }
  return hit || findSceneCanvas();
}

function clearEditorSelection(): void {
  try {
    getCce()?.Selection?.clear?.();
  } catch {
    /* ignore */
  }
  try {
    getCce()?.Selection?.reset?.();
  } catch {
    /* ignore */
  }
  try {
    const sel = getCce()?.Selection;
    if (sel) sel._isMouseDown = false;
  } catch {
    /* ignore */
  }
  try {
    (globalThis as any).Editor?.Selection?.clear?.('node');
  } catch {
    /* ignore */
  }
  try {
    (globalThis as any).Editor?.Selection?.clear?.();
  } catch {
    /* ignore */
  }
}

/**
 * 强杀拖拽白框。
 * Creator 用 GeometryRenderer.addQuad 画半透明白矩形；hide 靠 removeData('addQuad')。
 * Operation 约定：监听器 return false 才会中断后续（含 Gizmo=99）。
 */
function killRegionSelectRect(): void {
  const cceApi = getCce();
  if (!cceApi) return;

  // 立刻擦掉白框（GeometryRenderer quad）
  try {
    cceApi.Engine?.getGeometryRenderer?.()?.removeData?.('addQuad');
    cceApi.Engine?.repaintInEditMode?.();
  } catch {
    /* ignore */
  }

  const visit = (obj: any, depth: number) => {
    if (!obj || depth > 5) return;
    try {
      if (typeof obj === 'object' && ('_regionSelecting' in obj || '_noGizmoMouseDownEvent' in obj)) {
        if ('_regionSelecting' in obj) obj._regionSelecting = false;
        if ('_noGizmoMouseDownEvent' in obj) obj._noGizmoMouseDownEvent = null;
        if ('_gizmoMouseDownEvent' in obj) obj._gizmoMouseDownEvent = null;
        try {
          obj.clear?.();
        } catch {
          /* ignore */
        }
      }
    } catch {
      /* ignore */
    }
    if (depth >= 2) return;
    try {
      for (const k of Object.getOwnPropertyNames(obj)) {
        if (!k.startsWith('_') && k !== 'constructor') continue;
        try {
          visit(obj[k], depth + 1);
        } catch {
          /* ignore */
        }
      }
    } catch {
      /* ignore */
    }
  };

  try {
    visit(cceApi.Gizmo, 0);
  } catch {
    /* ignore */
  }
  try {
    visit((cceApi.Gizmo as any)?.gizmoOperation, 0);
    visit((cceApi.Gizmo as any)?._gizmoOperation, 0);
    visit((cceApi.Gizmo as any)?.operation, 0);
  } catch {
    /* ignore */
  }

  clearEditorSelection();
}

/**
 * 笔刷开启：清选中 + 藏框选 DOM。
 * 不再盖全屏 overlay——会抢走 canvas 事件，导致 Operation 的 e.x/e.y 跟手失效。
 * 框选靠 Operation return false + killRegionSelectRect；右中键交给相机。
 * 绝不能改 viewMode / change-gizmo-tool('view') —— 会导致左键拖场景跟着跑。
 */
function suppressEditorMarquee(): void {
  try {
    const doc = (globalThis as any).document as Document | undefined;
    if (doc && !_marqueeStyleEl) {
      _marqueeStyleEl = doc.createElement('style');
      _marqueeStyleEl.setAttribute('data-scene-editor-brush', '1');
      _marqueeStyleEl.textContent = `
        .selection-rect, .select-rect, .rect-selection,
        [class*="selection-rect"], [class*="select-rect"],
        [class*="SelectionRect"], [class*="rectSelect"],
        [class*="box-select"], [class*="BoxSelect"] {
          display: none !important;
          visibility: hidden !important;
          opacity: 0 !important;
          pointer-events: none !important;
        }
      `;
      doc.head?.appendChild(_marqueeStyleEl);
    }
  } catch {
    /* ignore */
  }
  clearEditorSelection();
  // 确保旧版 overlay 被清掉
  removeBrushOverlay();
  startSelectionWatch();
}

function restoreEditorMarquee(): void {
  removeBrushOverlay();
  stopSelectionWatch();
  try {
    if (_marqueeStyleEl?.parentNode) _marqueeStyleEl.parentNode.removeChild(_marqueeStyleEl);
  } catch {
    /* ignore */
  }
  _marqueeStyleEl = null;
  clearEditorSelection();
}

/** 若误选了笔刷/网格/预览节点，立刻清掉（绿点箭头 gizmo） */
function startSelectionWatch(): void {
  stopSelectionWatch();
  _selWatchTimer = setInterval(() => {
    if (!_mouseBrush.active) return;
    try {
      const sel = getCce()?.Selection?.query?.() || [];
      if (!sel.length) return;
      const room = findRoomRoot();
      if (!room) return;
      const banned = new Set<string>();
      for (const name of [BLOCK_BRUSH_CURSOR, BLOCK_GRID_ROOT, BLOCK_PREVIEW_ROOT]) {
        const n = room.getChildByName?.(name);
        if (n?.uuid) banned.add(n.uuid);
        for (const c of n?.children || []) {
          if (c?.uuid) banned.add(c.uuid);
        }
      }
      if (sel.some((u: string) => banned.has(u))) {
        clearEditorSelection();
      }
    } catch {
      /* ignore */
    }
  }, 100);
}

function stopSelectionWatch(): void {
  if (_selWatchTimer) {
    clearInterval(_selWatchTimer);
    _selWatchTimer = null;
  }
}

function removeBrushOverlay(): void {
  try {
    _brushOverlay?.parentNode?.removeChild(_brushOverlay);
  } catch {
    /* ignore */
  }
  _brushOverlay = null;
  _overlayPassThrough = false;
}

/**
 * 透明层盖住场景 canvas（fixed + 跟随 getBoundingClientRect）：
 * - 左键：自己处理涂抹，并强杀 regionSelecting 白框
 * - 右/中键：临时 pointer-events:none → 相机仍可转
 */
function installBrushOverlay(): void {
  removeBrushOverlay();
  const canvas = findSceneCanvas();
  const doc = (globalThis as any).document as Document | undefined;
  if (!canvas || !doc?.body) return;

  const overlay = doc.createElement('div');
  overlay.setAttribute('data-scene-editor-brush-overlay', '1');
  overlay.style.cssText = [
    'position:fixed',
    'z-index:2147483646',
    'cursor:crosshair',
    'background:rgba(0,0,0,0)',
    'pointer-events:auto',
    'margin:0',
    'padding:0',
    'border:0',
  ].join(';');

  const syncRect = () => {
    try {
      const r = canvas.getBoundingClientRect();
      overlay.style.left = `${r.left}px`;
      overlay.style.top = `${r.top}px`;
      overlay.style.width = `${r.width}px`;
      overlay.style.height = `${r.height}px`;
    } catch {
      /* ignore */
    }
  };
  syncRect();

  const onDown = (raw: Event) => {
    if (!_mouseBrush.active) return;
    const ev = raw as MouseEvent;
    // 中/右键：穿透给相机。必须把本次 mousedown 补发给下方，且 mouseup 先交给相机再盖回 overlay
    if (ev.button === 2 || ev.button === 1 || ev.altKey) {
      _overlayPassThrough = true;
      overlay.style.pointerEvents = 'none';
      try {
        const below = doc.elementFromPoint(ev.clientX, ev.clientY) as any;
        if (below && below !== overlay) {
          below.dispatchEvent?.(
            new MouseEvent('mousedown', {
              bubbles: true,
              cancelable: true,
              view: doc.defaultView,
              clientX: ev.clientX,
              clientY: ev.clientY,
              screenX: ev.screenX,
              screenY: ev.screenY,
              button: ev.button,
              buttons: ev.buttons,
              ctrlKey: ev.ctrlKey,
              shiftKey: ev.shiftKey,
              altKey: ev.altKey,
              metaKey: ev.metaKey,
            })
          );
        }
      } catch {
        /* ignore */
      }
      const restore = () => {
        doc.removeEventListener('mouseup', restore, true);
        doc.removeEventListener('pointerup', restore, true);
        // 下一帧再盖回，避免挡住本次抬起导致相机拖拽卡死
        const unlock = () => {
          try {
            overlay.style.pointerEvents = 'auto';
          } catch {
            /* ignore */
          }
          _overlayPassThrough = false;
        };
        if (typeof requestAnimationFrame === 'function') requestAnimationFrame(unlock);
        else setTimeout(unlock, 0);
      };
      doc.addEventListener('mouseup', restore, true);
      doc.addEventListener('pointerup', restore, true);
      return;
    }
    if (ev.button !== 0) return;
    eatDomEvent(ev, { immediate: true });
    _mouseBrush.painting = true;
    _mouseBrush.lastCellKey = '';
    killRegionSelectRect();
    brushFromDomEvent(ev, true);
  };

  const onMove = (raw: Event) => {
    if (!_mouseBrush.active || _overlayPassThrough) return;
    const ev = raw as MouseEvent;
    if (ev.buttons === 2 || ev.buttons === 4 || ev.altKey) return;
    if (_mouseBrush.painting && (ev.buttons & 1) === 0) {
      endBrushStroke();
    }
    const paint = _mouseBrush.painting || (ev.buttons & 1) === 1;
    if (paint) killRegionSelectRect();
    brushFromDomEvent(ev, paint);
    if (paint) eatDomEvent(ev, { immediate: true });
  };

  const onUp = (raw: Event) => {
    if (!_mouseBrush.active) return;
    const ev = raw as MouseEvent;
    if (ev.button === 0) {
      endBrushStroke();
      killRegionSelectRect();
    }
  };

  overlay.addEventListener('mousedown', onDown, true);
  overlay.addEventListener('mousemove', onMove, true);
  overlay.addEventListener('mouseup', onUp, true);
  overlay.addEventListener(
    'contextmenu',
    (e) => {
      if (_mouseBrush.active) eatDomEvent(e, { immediate: true });
    },
    true
  );
  (globalThis as any).addEventListener?.('resize', syncRect);
  doc.defaultView?.addEventListener?.('resize', syncRect);

  doc.body.appendChild(overlay);
  _brushOverlay = overlay;
  // 布局变化时再同步一次
  setTimeout(syncRect, 0);
  setTimeout(syncRect, 200);
}

function endBrushStroke(): void {
  _mouseBrush.painting = false;
  _mouseBrush.lastCellKey = '';
  clearEditorSelection();
}

function eatDomEvent(ev: Event, opts?: { immediate?: boolean }): void {
  try {
    ev.preventDefault();
    ev.stopPropagation();
    // 仅 mousedown 用 immediate，拦住框选起笔；mouseup 绝不用，否则拖拽/相机卡死
    if (opts?.immediate) ev.stopImmediatePropagation();
  } catch {
    /* ignore */
  }
}

/** 预览节点勿被框选（避免「类型不同」提示） */
function markEditorOnly(n: any): void {
  if (!n) return;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { CCObject } = require('cc');
    n._objFlags |= CCObject.Flags.DontSave;
    if (CCObject.Flags.LockedInEditor) n._objFlags |= CCObject.Flags.LockedInEditor;
    if (CCObject.Flags.HideInHierarchy) n._objFlags |= CCObject.Flags.HideInHierarchy;
  } catch {
    /* ignore */
  }
}

/**
 * 笔刷光标：DontSave + 隐藏层级。
 * 绝不能 LockedInEditor —— 会拦住位移；靠 overlay 防点选 + 选中监视清掉。
 */
function markBrushMovable(n: any): void {
  if (!n) return;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { CCObject } = require('cc');
    n._objFlags |= CCObject.Flags.DontSave;
    if (CCObject.Flags.LockedInEditor) {
      n._objFlags &= ~CCObject.Flags.LockedInEditor;
    }
    if (CCObject.Flags.HideInHierarchy) {
      n._objFlags |= CCObject.Flags.HideInHierarchy;
    }
  } catch {
    /* ignore */
  }
}

function refreshBrushPreview(opts?: { refreshGrid?: boolean; gridX?: number; gridZ?: number }): void {
  const room = findRoomRoot();
  if (!room) return;
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const cc = require('cc');
  const { Node, CCObject } = cc;
  let preview = room.getChildByName?.(BLOCK_PREVIEW_ROOT);
  if (!preview || !preview.isValid) {
    preview = new Node(BLOCK_PREVIEW_ROOT);
    markEditorOnly(preview);
    preview.setParent(room);
  }
  rebuildBlockCellBoxes(
    preview,
    [..._mouseBrush.cells],
    _mouseBrush.cellSize,
    _mouseBrush.originX,
    _mouseBrush.originZ
  );
  ensureBlockBrushCursor(room, _mouseBrush.cellSize, _mouseBrush.brushRadius);
  if (opts?.refreshGrid) {
    const start = guessBrushStartPos(room);
    ensureBlockGrid(
      room,
      _mouseBrush.cellSize,
      _mouseBrush.originX,
      _mouseBrush.originZ,
      opts.gridX ?? start.x,
      opts.gridZ ?? start.z
    );
  }
}

function placeBrushCursor(x: number, z: number): void {
  const room = findRoomRoot();
  if (!room) return;
  const cursor = ensureBlockBrushCursor(
    room,
    _mouseBrush.cellSize,
    _mouseBrush.brushRadius
  );
  const y = _groundY + 0.55;
  markBrushMovable(cursor);
  try {
    if (typeof cursor.setWorldPosition === 'function') {
      cursor.setWorldPosition(x, y, z);
    } else {
      const rp = room.worldPosition || room.position;
      cursor.setPosition(
        x - (Number(rp?.x) || 0),
        y - (Number(rp?.y) || 0),
        z - (Number(rp?.z) || 0)
      );
    }
    // 编辑器非播放态不会每帧刷，不 repaint 会感觉「不跟手」
    try {
      getCce()?.Engine?.repaintInEditMode?.();
    } catch {
      /* ignore */
    }
  } catch (e) {
    console.warn('[scene-editor] placeBrushCursor failed', e);
  }
}

function applyBrushAtWorld(x: number, z: number, paint: boolean): void {
  placeBrushCursor(x, z);
  if (!paint) return;
  const c = worldToCell(x, z, _mouseBrush.cellSize, _mouseBrush.originX, _mouseBrush.originZ);
  const key = `${c.cx},${c.cz},${_mouseBrush.erase ? 1 : 0}`;
  if (key === _mouseBrush.lastCellKey) return;
  _mouseBrush.lastCellKey = key;
  stampBrushCells(
    _mouseBrush.cells,
    c.cx,
    c.cz,
    _mouseBrush.brushRadius,
    _mouseBrush.erase
  );
  _mouseBrush.dirty = true;
  refreshBrushPreview();
}

/** 编辑器 Gizmo 同款 Engine3D（能正确解释 Operation 的 e.x/e.y） */
function getEditorEngine3D(): any | null {
  const cceApi = getCce();
  return (
    cceApi?.Gizmo?.__EngineUtils__ ||
    cceApi?.Gizmo?.engine ||
    cceApi?.Engine?.__EngineUtils__ ||
    null
  );
}

function isBrushHelperNode(n: any): boolean {
  let cur = n;
  for (let i = 0; i < 8 && cur; i++) {
    const name = String(cur.name || '');
    if (
      name === BLOCK_BRUSH_CURSOR ||
      name === BLOCK_PREVIEW_ROOT ||
      name === BLOCK_GRID_ROOT ||
      name.startsWith('Cell_') ||
      name.startsWith('gx_') ||
      name.startsWith('gz_')
    ) {
      return true;
    }
    cur = cur.parent;
  }
  return false;
}

/** 笔刷/网格/预览不参与射线，否则会打到自己把光标钉死在初始位置 */
function applyIgnoreRaycastLayer(n: any): void {
  if (!n) return;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { Layers } = require('cc');
    const ignore =
      Layers?.Enum?.IGNORE_RAYCAST ??
      Layers?.BitMask?.IGNORE_RAYCAST ??
      (1 << 20);
    n.layer = ignore;
    for (const c of n.children || []) applyIgnoreRaycastLayer(c);
  } catch {
    /* ignore */
  }
}

/**
 * 屏幕坐标 → 地面 XZ。
 * 入口统一做一次 Y 翻转（h - y）：编辑器事件 Y 与地面拾取相反，不翻则鼠标上下 ↔ 场景 Z 反了。
 */
function pickWorldXZFromEditorScreen(
  screenX: number,
  screenY: number
): { ok: boolean; x?: number; z?: number; variant?: string; reason?: string } {
  const { w, h } = resolveViewSize();
  const sx = screenX;
  const sy = h > 1 ? h - screenY : screenY;

  const room = findRoomRoot();
  const engine = getEditorEngine3D();
  if (engine?.getRaycastResults && room) {
    try {
      const results = engine.getRaycastResults(room, sx, sy, 1e6);
      // 1) 编辑器射线 ∩ 地面（跟手主路径）
      const ray = results?.ray;
      if (ray) {
        const hit = rayHitGround(ray, _groundY);
        if (hit.ok) return { ok: true, x: hit.x, z: hit.z, variant: 'engine-ray' };
      }
      // 2) 真实场景模型命中（排除笔刷辅助节点）
      if (results?.length) {
        for (const r of results) {
          if (isBrushHelperNode(r?.node)) continue;
          const hp = r?.hitPoint;
          if (!hp) continue;
          const hx = Number(hp.x);
          const hz = Number(hp.z);
          if (Number.isFinite(hx) && Number.isFinite(hz)) {
            return { ok: true, x: hx, z: hz, variant: 'engine-hit' };
          }
        }
      }
    } catch {
      /* fall through */
    }
  }

  const raw = pickGroundForBrush(sx, sy, h, _groundY, w);
  if (raw.ok) return { ok: true, x: raw.x, z: raw.z, variant: `cam-${raw.variant}` };
  return { ok: false, reason: raw.reason || '未打到地面' };
}

/** 标定 DOM：client 映射对齐 Operation.e.y（入口还会统一再 flip 一次） */
function calibrateClientYFromOperation(e: any): void {
  if (_clientYMode !== 0) return;
  const ey = Number(e?.y);
  const cx = Number(e?.clientX);
  const cy = Number(e?.clientY);
  if (![ey, cx, cy].every(Number.isFinite)) return;
  const canvas = canvasUnderPoint(cx, cy) || findSceneCanvas();
  if (!canvas?.getBoundingClientRect) return;
  const rect = canvas.getBoundingClientRect();
  if (rect.height < 2) return;
  const { h: camH } = resolveViewSize();
  const bufH = camH > 1 ? camH : canvas.height || rect.height;
  const vTop = (cy - rect.top) / rect.height;
  const yTop = vTop * bufH;
  const yBottom = (1 - vTop) * bufH;
  const dTop = Math.abs(yTop - ey);
  const dBottom = Math.abs(yBottom - ey);
  if (dTop < dBottom - 2) _clientYMode = 1;
  else if (dBottom < dTop - 2) _clientYMode = 2;
  else _clientYMode = 2;
}

/** DOM/client → 与 Operation.e.y 同系的屏幕像素（随后在 pick 入口统一 flip） */
function pointerFromClient(
  clientX: number,
  clientY: number
): { x: number; y: number; h: number; w: number } | null {
  const canvas = canvasUnderPoint(clientX, clientY) || findSceneCanvas();
  if (!canvas?.getBoundingClientRect) return null;
  const rect = canvas.getBoundingClientRect();
  if (rect.width < 2 || rect.height < 2) return null;
  if (
    clientX < rect.left ||
    clientX > rect.right ||
    clientY < rect.top ||
    clientY > rect.bottom
  ) {
    return null;
  }
  const { w: camW, h: camH } = resolveViewSize();
  const bufW = camW > 1 ? camW : canvas.width || rect.width;
  const bufH = camH > 1 ? camH : canvas.height || rect.height;
  const u = (clientX - rect.left) / rect.width;
  const vTop = (clientY - rect.top) / rect.height;
  const x = u * bufW;
  const y = _clientYMode === 1 ? vTop * bufH : (1 - vTop) * bufH;
  return { x, y, h: bufH, w: bufW };
}

function brushFromPick(screenX: number, screenY: number, paint: boolean): boolean {
  const hit = pickWorldXZFromEditorScreen(screenX, screenY);
  if (!hit.ok) return false;
  applyBrushAtWorld(hit.x!, hit.z!, paint);
  return true;
}

function brushFromOperationEvent(e: any, paint: boolean): boolean {
  calibrateClientYFromOperation(e);
  const x = Number(e?.x);
  const y = Number(e?.y);
  if (Number.isFinite(x) && Number.isFinite(y)) {
    _lastOpBrushAt = Date.now();
    // 传入原始 e.y，Y 翻转只在 pickWorldXZFromEditorScreen 做一次
    return brushFromPick(x, y, paint);
  }
  const cx = Number(e?.clientX);
  const cy = Number(e?.clientY);
  if (Number.isFinite(cx) && Number.isFinite(cy)) {
    const p = pointerFromClient(cx, cy);
    if (p && brushFromPick(p.x, p.y, paint)) {
      _lastOpBrushAt = Date.now();
      return true;
    }
  }
  return false;
}

function brushFromDomEvent(ev: MouseEvent, paint: boolean): boolean {
  // Operation 刚处理过则跳过，避免两套坐标打架
  if (Date.now() - _lastOpBrushAt < 50) return false;
  const p = pointerFromClient(ev.clientX, ev.clientY);
  if (!p) return false;
  return brushFromPick(p.x, p.y, paint);
}

function handleBrushMouseMove(e: any): boolean | void {
  if (!_mouseBrush.active) return;
  // 右键/中键/Alt：交给相机旋转（不要 return false）
  if (e.rightButton || e.middleButton || e.altKey) return;
  if (_mouseBrush.painting && e.leftButton === false) {
    endBrushStroke();
    killRegionSelectRect();
  }
  const paint = _mouseBrush.painting || !!e.leftButton || (e.buttons & 1) === 1;
  if (paint) killRegionSelectRect();
  brushFromOperationEvent(e, paint);
  // Operation：只有 return false 才会中断后续 Gizmo 框选
  if (paint) return false;
}

function handleBrushMouseDown(e: any): boolean | void {
  if (!_mouseBrush.active) return;
  if (e.rightButton || e.middleButton || e.altKey) return;
  if (!e.leftButton && e.button !== 0 && (e.buttons & 1) !== 1) return;
  _mouseBrush.painting = true;
  _mouseBrush.lastCellKey = '';
  suppressEditorMarquee();
  killRegionSelectRect();
  brushFromOperationEvent(e, true);
  // 必须 false：Operation.emit 见 false 才停，Gizmo 拿不到 mousedown 就不会起白框
  return false;
}

function handleBrushMouseUp(e: any): boolean | void {
  if (!_mouseBrush.active) return;
  // 中/右键抬起必须放行 Camera；之前用 leftButton===false 误伤，导致拖场景停不下来
  if (e.button === 1 || e.button === 2 || e.middleButton || e.rightButton || e.altKey) {
    return;
  }
  if (e.button !== 0 && e.button != null) return;
  endBrushStroke();
  killRegionSelectRect();
  return false;
}

function unbindEngineInput(): void {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { input, Input } = require('cc');
    if (_onEngineMouseMove) input.off(Input.EventType.MOUSE_MOVE, _onEngineMouseMove);
    if (_onEngineMouseDown) input.off(Input.EventType.MOUSE_DOWN, _onEngineMouseDown);
    if (_onEngineMouseUp) input.off(Input.EventType.MOUSE_UP, _onEngineMouseUp);
  } catch {
    /* ignore */
  }
  _onEngineMouseMove = null;
  _onEngineMouseDown = null;
  _onEngineMouseUp = null;
}

/** 引擎 input 坐标系与场景视图常不一致，跟手路径不再使用 */
function bindEngineInput(): boolean {
  unbindEngineInput();
  return false;
}

function unbindDomBrush(): void {
  if (!_domMove && !_domDown) return;
  for (const t of _domTargets) {
    try {
      if (_domMove) t.removeEventListener('mousemove', _domMove as EventListener, true);
      if (_domDown) t.removeEventListener('mousedown', _domDown as EventListener, true);
      if (_domUp) t.removeEventListener('mouseup', _domUp as EventListener, true);
      if (_domContext) t.removeEventListener('contextmenu', _domContext as EventListener, true);
    } catch {
      /* ignore */
    }
  }
  _domTargets = [];
  _domMove = null;
  _domDown = null;
  _domUp = null;
  _domContext = null;
  _domUpGlobal = null;
}

function bindDomBrush(): boolean {
  unbindDomBrush();
  const doc = (globalThis as any).document as Document | undefined;
  if (!doc) return false;

  const canvas = findSceneCanvas();
  const targets: EventTarget[] = [];
  if (canvas) targets.push(canvas);
  targets.push(doc);

  _domMove = (raw: Event) => {
    if (!_mouseBrush.active) return;
    const ev = raw as MouseEvent;
    if (ev.buttons === 2 || ev.buttons === 4 || ev.altKey) return;
    if (_mouseBrush.painting && (ev.buttons & 1) === 0) {
      endBrushStroke();
    }
    const paint = _mouseBrush.painting || (ev.buttons & 1) === 1;
    brushFromDomEvent(ev, paint);
    if (paint) {
      clearEditorSelection();
      eatDomEvent(ev);
    }
  };

  _domDown = (raw: Event) => {
    if (!_mouseBrush.active) return;
    const ev = raw as MouseEvent;
    if (ev.button !== 0 || ev.altKey) return;
    // 即使没落到 canvas 上，左键也要拦住，否则会拖出白框
    suppressEditorMarquee();
    clearEditorSelection();
    _mouseBrush.painting = true;
    _mouseBrush.lastCellKey = '';
    brushFromDomEvent(ev, true);
    eatDomEvent(ev, { immediate: true });
  };

  _domUp = (raw: Event) => {
    if (!_mouseBrush.active) return;
    const ev = raw as MouseEvent;
    if (ev.button === 0) endBrushStroke();
  };

  _domContext = (raw: Event) => {
    if (_mouseBrush.active && _mouseBrush.painting) eatDomEvent(raw);
  };

  for (const t of targets) {
    t.addEventListener('mousemove', _domMove, true);
    t.addEventListener('mousedown', _domDown, true);
    t.addEventListener('mouseup', _domUp, true);
    t.addEventListener('contextmenu', _domContext, true);
  }
  _domTargets = targets;
  return true;
}

function stopMouseBrushTool(): { ok: boolean; cells: string[]; cellCount: number } {
  const cceApi = getCce();
  const op = cceApi?.Operation;
  if (op && _onBrushMove) {
    try {
      op.removeListener?.('mousemove', _onBrushMove);
      op.removeListener?.('mousedown', _onBrushDown);
      op.removeListener?.('mouseup', _onBrushUp);
    } catch {
      /* ignore */
    }
  }
  unbindDomBrush();
  unbindEngineInput();
  _onBrushMove = null;
  _onBrushDown = null;
  _onBrushUp = null;
  _mouseBrush.active = false;
  _mouseBrush.painting = false;
  restoreEditorMarquee();
  try {
    const room = findRoomRoot();
    if (room) clearBlockGrid(room);
  } catch {
    /* ignore */
  }
  try {
    op?.changePointer?.('default');
  } catch {
    /* ignore */
  }
  return {
    ok: true,
    cells: [..._mouseBrush.cells],
    cellCount: _mouseBrush.cells.size,
  };
}

function startMouseBrushTool(args?: {
  cells?: string[];
  cellSize?: number;
  originX?: number;
  originZ?: number;
  brushRadius?: number;
  erase?: boolean;
}): { ok: boolean; reason?: string; cellCount?: number } {
  const room = findRoomRoot();
  if (!room) return { ok: false, reason: '请先打开资源 Prefab（点场景预览）' };

  stopMouseBrushTool();

  _mouseBrush.active = true;
  _mouseBrush.painting = false;
  _mouseBrush.erase = !!args?.erase;
  _mouseBrush.cellSize = args?.cellSize && args.cellSize > 1e-6 ? args.cellSize : 1;
  _mouseBrush.originX = Number(args?.originX) || 0;
  _mouseBrush.originZ = Number(args?.originZ) || 0;
  _mouseBrush.brushRadius = Math.max(1, Math.floor(Number(args?.brushRadius) || 1));
  _mouseBrush.cells = new Set(args?.cells || []);
  _mouseBrush.lastCellKey = '';
  _mouseBrush.dirty = false;
  _clientYMode = 0;
  _lastOpBrushAt = 0;
  refreshGroundY();

  // 强制丢掉可能被 LockedInEditor 钉死的旧光标
  try {
    const old = room.getChildByName?.(BLOCK_BRUSH_CURSOR);
    if (old?.isValid) {
      old.removeFromParent?.();
      old.destroy?.();
    }
  } catch {
    /* ignore */
  }

  refreshBrushPreview({ refreshGrid: true });
  suppressEditorMarquee();
  clearEditorSelection();

  const domOk = bindDomBrush();
  const engineOk = bindEngineInput();

  const cceApi = getCce();
  let opOk = false;
  _onBrushMove = handleBrushMouseMove;
  _onBrushDown = handleBrushMouseDown;
  _onBrushUp = handleBrushMouseUp;
  if (cceApi?.Operation?.addListener) {
    cceApi.Operation.addListener('mousemove', _onBrushMove, BRUSH_OP_PRIORITY);
    cceApi.Operation.addListener('mousedown', _onBrushDown, BRUSH_OP_PRIORITY);
    cceApi.Operation.addListener('mouseup', _onBrushUp, BRUSH_OP_PRIORITY);
    opOk = true;
  } else if (cceApi?.Operation?.on) {
    // 无 priority 再绑一次，避免三参 on 在部分版本失效
    cceApi.Operation.on('mousemove', _onBrushMove, BRUSH_OP_PRIORITY);
    cceApi.Operation.on('mousedown', _onBrushDown, BRUSH_OP_PRIORITY);
    cceApi.Operation.on('mouseup', _onBrushUp, BRUSH_OP_PRIORITY);
    try {
      cceApi.Operation.on('mousemove', _onBrushMove);
      cceApi.Operation.on('mousedown', _onBrushDown);
      cceApi.Operation.on('mouseup', _onBrushUp);
    } catch {
      /* ignore */
    }
    opOk = true;
  }
  if (opOk) {
    try {
      cceApi.Operation.changePointer?.('crosshair');
    } catch {
      /* ignore */
    }
  }

  if (!domOk && !opOk && !engineOk) {
    _mouseBrush.active = false;
    return { ok: false, reason: '无法绑定鼠标（DOM/Operation/engine 都不可用）' };
  }

  // 开刷时立刻把光标挪到镜头中心地面，确认可见
  try {
    const { w, h } = resolveViewSize();
    const hit = pickGroundForBrush(w * 0.5, h * 0.5, h, _groundY);
    if (hit.ok) placeBrushCursor(hit.x!, hit.z!);
    else {
      const start = guessBrushStartPos(findRoomRoot());
      placeBrushCursor(start.x, start.z);
    }
  } catch {
    /* ignore */
  }

  return { ok: true, cellCount: _mouseBrush.cells.size };
}

function configureMouseBrush(args?: {
  erase?: boolean;
  brushRadius?: number;
  cellSize?: number;
}): { ok: boolean; active: boolean } {
  if (typeof args?.erase === 'boolean') _mouseBrush.erase = args.erase;
  if (typeof args?.brushRadius === 'number') {
    _mouseBrush.brushRadius = Math.max(1, Math.floor(args.brushRadius));
  }
  let cellChanged = false;
  if (typeof args?.cellSize === 'number' && args.cellSize > 1e-6) {
    cellChanged = Math.abs(_mouseBrush.cellSize - args.cellSize) > 1e-6;
    _mouseBrush.cellSize = args.cellSize;
  }
  if (_mouseBrush.active) {
    refreshBrushPreview({ refreshGrid: cellChanged });
  }
  return { ok: true, active: _mouseBrush.active };
}

function queryMouseBrushState(): {
  ok: boolean;
  active: boolean;
  erase: boolean;
  cellCount: number;
  cells: string[];
  dirty: boolean;
  brushRadius: number;
} {
  return {
    ok: true,
    active: _mouseBrush.active,
    erase: _mouseBrush.erase,
    cellCount: _mouseBrush.cells.size,
    cells: [..._mouseBrush.cells],
    dirty: _mouseBrush.dirty,
    brushRadius: _mouseBrush.brushRadius,
  };
}

function findRoomRoot(): any | null {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const cc = require('cc');
  const { director } = cc;
  const scene = director.getScene();
  if (!scene) return null;

  let found: any = null;
  const walk = (n: any) => {
    if (found) return;
    if (n.getChildByName?.('EnemyBornRoot') || n.getComponent?.('LevelController')) {
      found = n;
      return;
    }
    for (const c of n.children || []) walk(c);
  };
  walk(scene);

  if (!found) {
    for (const c of scene.children || []) {
      const name = c.name || '';
      if (name && !name.startsWith('__') && name !== 'Main Light' && name !== 'Main Camera') {
        found = c;
        break;
      }
    }
  }
  return found;
}

function isAreaItem(item: SpawnItem): boolean {
  if (item.spawnShape === 'area') return true;
  if (item.spawnShape === 'point') return false;
  return (item.enemyCount ?? 0) > 0 || (item.enemyKeys?.length ?? 0) > 0;
}

function ensureMaterial(mesh: any, color: { r: number; g: number; b: number; a: number }): void {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const cc = require('cc');
  const { Material, Color } = cc;
  // 半透明盒在编辑器里经常被画成「白框」，笔刷指示器用不透明
  const opaque = color.a >= 250;
  let mat = mesh.getSharedMaterial?.(0);
  if (!mat || !mat.effectAsset) {
    mat = new Material();
    mat.initialize({
      effectName: 'builtin-unlit',
      technique: opaque ? 0 : 1,
      defines: { USE_COLOR: true },
    });
    mesh.setSharedMaterial(mat, 0);
  }
  try {
    const inst = mesh.getMaterialInstance?.(0) ?? mat;
    inst.setProperty('mainColor', new Color(color.r, color.g, color.b, opaque ? 255 : color.a));
  } catch {
    /* ignore */
  }
}

/**
 * 区域根节点（scale=1，便于挂 Model 子节点不被区域尺寸拉伸）。
 * 青盒画在子节点 Volume 上。
 */
function makeAreaRoot(parent: any, name: string, pos: Vec3, scale: Vec3, color: typeof AREA_COLOR): any {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const cc = require('cc');
  const { Node, MeshRenderer, primitives, utils, CCObject } = cc;

  const n = new Node(name);
  n._objFlags |= CCObject.Flags.DontSave;
  // 允许在编辑器里拖拽改位置（仍 DontSave，不写回 Prefab）
  n.setParent(parent);
  n.setPosition(pos.x ?? 0, pos.y ?? 0, pos.z ?? 0);
  n.setScale(1, 1, 1);

  const vol = new Node('Volume');
  vol._objFlags |= CCObject.Flags.DontSave;
  vol.setParent(n);
  vol.setPosition(0, 0, 0);
  vol.setScale(Math.max(0.05, scale.x ?? 1), Math.max(0.05, scale.y ?? 1), Math.max(0.05, scale.z ?? 1));
  const mr = vol.addComponent(MeshRenderer);
  mr.mesh = utils.MeshUtils.createMesh(primitives.box(1, 1, 1));
  ensureMaterial(mr, color);
  return n;
}

/** 点位根节点（scale=1）；无模型时用子节点 Marker 画橙柱 */
function makePointRoot(parent: any, name: string, pos: Vec3, color: typeof POINT_COLOR): any {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const cc = require('cc');
  const { Node, MeshRenderer, primitives, utils, CCObject } = cc;

  const n = new Node(name);
  n._objFlags |= CCObject.Flags.DontSave;
  n.setParent(parent);
  n.setPosition(pos.x ?? 0, pos.y ?? 0.5, pos.z ?? 0);
  n.setScale(1, 1, 1);

  const marker = new Node('Marker');
  marker._objFlags |= CCObject.Flags.DontSave;
  marker.setParent(n);
  marker.setPosition(0, 0, 0);
  marker.setScale(0.6, 1.2, 0.6);
  const mr = marker.addComponent(MeshRenderer);
  mr.mesh = utils.MeshUtils.createMesh(primitives.cylinder(0.5, 0.5, 1, { radialSegments: 12 }));
  ensureMaterial(mr, color);
  return n;
}

function markDontSaveTree(n: any): void {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const cc = require('cc');
  const { CCObject } = cc;
  if (!n) return;
  try {
    n._objFlags |= CCObject.Flags.DontSave;
  } catch {
    /* ignore */
  }
  for (const c of n.children || []) markDontSaveTree(c);
}

function loadPrefabByUuid(uuid: string): Promise<any> {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const cc = require('cc');
  const { assetManager } = cc;
  return new Promise((resolve, reject) => {
    assetManager.loadAny({ uuid }, (err: Error | null, asset: any) => {
      if (err) reject(err);
      else resolve(asset);
    });
  });
}

async function makeModelNode(
  parent: any,
  name: string,
  pos: Vec3,
  euler: Vec3 | undefined,
  uuid: string
): Promise<boolean> {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const cc = require('cc');
  const { instantiate } = cc;
  try {
    const asset = await loadPrefabByUuid(uuid);
    if (!asset) return false;
    const node = instantiate(asset);
    if (!node) return false;
    node.name = name;
    markDontSaveTree(node);
    node.setParent(parent);
    node.setPosition(pos.x ?? 0, pos.y ?? 0, pos.z ?? 0);
    if (euler) {
      node.setRotationFromEuler?.(euler.x ?? 0, euler.y ?? 0, euler.z ?? 0);
    }
    // 禁用运行时逻辑组件，避免编辑器预览误触发
    try {
      for (const comp of node.getComponentsInChildren?.(cc.Component) || []) {
        const cn = comp?.constructor?.name || '';
        if (/Controller|Spawner|AI|Skill|Ability/i.test(cn) && 'enabled' in comp) {
          comp.enabled = false;
        }
      }
    } catch {
      /* ignore */
    }
    return true;
  } catch (e) {
    console.warn('[scene-editor] preview model failed', uuid, e);
    return false;
  }
}

function restoreEnemyBornVisibility(room: any): void {
  const walk = (n: any) => {
    if (!n) return;
    if (n[HIDDEN_BORN_FLAG]) {
      n.active = true;
      delete n[HIDDEN_BORN_FLAG];
    }
    for (const c of n.children || []) walk(c);
  };
  walk(room);
}

/** 隐藏房间下所有 EnemyBornRoot（含同名子节点），只保留逻辑种植预览 */
function hideEnemyBornRoots(room: any): void {
  const walk = (n: any) => {
    if (!n) return;
    if ((n.name || '') === 'EnemyBornRoot' && n.active !== false) {
      n[HIDDEN_BORN_FLAG] = true;
      n.active = false;
    }
    for (const c of n.children || []) walk(c);
  };
  walk(room);
}

function clearPreviewUnder(root: any): void {
  restoreEnemyBornVisibility(root);
  const children = [...(root.children || [])];
  for (const c of children) {
    if ((c?.name || '') === PREVIEW_ROOT) {
      try {
        c.removeFromParent?.();
      } catch {
        /* ignore */
      }
      if (c?.isValid) c.destroy();
    }
  }
}

async function previewMonsterSpawn(args?: {
  layers?: SpawnLayer[];
  layerIndex?: number;
  showAllLayers?: boolean;
}): Promise<{ ok: boolean; reason?: string; count?: number }> {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const cc = require('cc');
  const { Node, CCObject } = cc;

  const room = findRoomRoot();
  if (!room) return { ok: false, reason: '未找到房间根节点（请先打开资源 Prefab）' };

  const gen = ++_previewGen;
  clearPreviewUnder(room);

  const layers = args?.layers ?? [];
  if (!layers.length) return { ok: true, count: 0, reason: '无种植层' };

  hideEnemyBornRoots(room);

  if (gen !== _previewGen) return { ok: true, count: 0, reason: 'stale' };

  const preview = new Node(PREVIEW_ROOT);
  preview._objFlags |= CCObject.Flags.DontSave;
  preview.setParent(room);

  const showAll = !!args?.showAllLayers;
  const idx = Math.max(0, args?.layerIndex ?? 0);
  const targetLayers = showAll ? layers : [layers[idx]].filter(Boolean);

  let count = 0;
  for (const layer of targetLayers) {
    const items = layer?.items ?? [];
    for (let i = 0; i < items.length; i++) {
      if (gen !== _previewGen) break;
      const item = items[i];
      const pos = item.position || { x: 0, y: 0.5, z: 0 };
      const label = `L${layer.layerId ?? '?'}_${i + 1}`;
      const area = isAreaItem(item);

      // 父子：Area/Point 为父（世界位置），Model 为子（本地 0；区域尺寸在 Volume 上，避免拉伸模型）
      let host: any = null;
      if (area) {
        const scale = item.scale || { x: 5, y: 1, z: 5 };
        host = makeAreaRoot(
          preview,
          `Area_${label}`,
          pos,
          { x: scale.x, y: scale.y ?? 1, z: scale.z },
          AREA_COLOR
        );
      } else {
        host = makePointRoot(preview, `Point_${label}`, pos, POINT_COLOR);
      }
      if (host) {
        host.__spawnLayerId = Number(layer.layerId) || 0;
        host.__spawnItemIndex = i;
        host.__spawnHost = true;
      }

      let showedModel = false;
      if (item.previewPrefabUuid && host) {
        showedModel = await makeModelNode(
          host,
          `Model_${label}`,
          { x: 0, y: 0, z: 0 },
          item.eulerAngles,
          item.previewPrefabUuid
        );
      }
      // 点位有模型时去掉占位柱，只留 Model 子节点
      if (showedModel && !area && host) {
        const marker = host.getChildByName?.('Marker');
        if (marker?.isValid) {
          try {
            marker.removeFromParent?.();
          } catch {
            /* ignore */
          }
          marker.destroy?.();
        }
      }
      count++;
    }
  }

  if (gen !== _previewGen) {
    try {
      preview.removeFromParent?.();
    } catch {
      /* ignore */
    }
    if (preview.isValid) preview.destroy();
    return { ok: true, count: 0, reason: 'stale' };
  }

  console.log(`[scene-editor] spawn preview: ${count} item(s) under ${room.name}`);
  return { ok: true, count };
}

async function clearMonsterSpawnPreview(): Promise<{ ok: boolean; reason?: string }> {
  const room = findRoomRoot();
  if (!room) return { ok: false, reason: '未找到房间根节点' };
  _previewGen++;
  clearPreviewUnder(room);
  return { ok: true };
}

function parseHostName(name: string): { kind: 'area' | 'point'; layerId: number; itemIndex: number } | null {
  const m = /^(Area|Point)_L(\d+)_(\d+)$/.exec(name || '');
  if (!m) return null;
  return {
    kind: m[1] === 'Area' ? 'area' : 'point',
    layerId: Number(m[2]),
    itemIndex: Math.max(0, Number(m[3]) - 1),
  };
}

/** 读取预览 Area/Point 根节点当前位置（相对 __MonsterSpawnPreview），供面板回写 */
async function querySpawnPreviewTransforms(): Promise<{
  ok: boolean;
  reason?: string;
  items?: Array<{
    kind: 'area' | 'point';
    layerId: number;
    itemIndex: number;
    x: number;
    y: number;
    z: number;
  }>;
}> {
  const room = findRoomRoot();
  if (!room) return { ok: false, reason: '未找到房间根节点' };
  const preview = room.getChildByName?.(PREVIEW_ROOT);
  if (!preview) return { ok: true, items: [] };

  const items: Array<{
    kind: 'area' | 'point';
    layerId: number;
    itemIndex: number;
    x: number;
    y: number;
    z: number;
  }> = [];

  for (const child of preview.children || []) {
    if (!child) continue;
    const parsed = parseHostName(child.name || '');
    const layerId = Number(child.__spawnLayerId) || parsed?.layerId;
    const itemIndex =
      typeof child.__spawnItemIndex === 'number' ? child.__spawnItemIndex : parsed?.itemIndex;
    if (layerId == null || itemIndex == null || !Number.isFinite(layerId)) continue;
    const kind: 'area' | 'point' =
      parsed?.kind || (String(child.name || '').startsWith('Area_') ? 'area' : 'point');
    const p = child.position;
    items.push({
      kind,
      layerId,
      itemIndex,
      x: Number(p?.x) || 0,
      y: Number(p?.y) || 0,
      z: Number(p?.z) || 0,
    });
  }
  return { ok: true, items };
}

function parseCellKey(key: string): { cx: number; cz: number } | null {
  const i = String(key).indexOf(',');
  if (i < 0) return null;
  const cx = Number(key.slice(0, i));
  const cz = Number(key.slice(i + 1));
  if (!Number.isFinite(cx) || !Number.isFinite(cz)) return null;
  return { cx, cz };
}

function clearBlockPreviewUnder(room: any): void {
  const children = [...(room.children || [])];
  for (const c of children) {
    const name = c?.name || '';
    if (
      name === BLOCK_PREVIEW_ROOT ||
      name === BLOCK_BRUSH_CURSOR ||
      name === BLOCK_GRID_ROOT
    ) {
      try {
        c.removeFromParent?.();
      } catch {
        /* ignore */
      }
      if (c?.isValid) c.destroy();
    }
  }
}

/** 笔刷初始落点（世界坐标）：优先 Floor，其次门/刷怪根，避免停在 (0,0,0) 视野外 */
function guessBrushStartPos(room: any): { x: number; y: number; z: number } {
  const pick = (name: string): { x: number; z: number } | null => {
    const n = room.getChildByName?.(name);
    if (!n) return null;
    const p = n.worldPosition || n.position;
    return { x: Number(p?.x) || 0, z: Number(p?.z) || 0 };
  };
  const floor = pick('Floor');
  if (floor) return { x: floor.x, y: 0.6, z: floor.z };
  for (const name of ['InterDoor', 'ExitDoor', 'EnemyBornRoot']) {
    const p = pick(name);
    if (p) return { x: p.x, y: 0.6, z: p.z };
  }
  // room 本地默认中心退化为世界（room 通常在原点）
  const rp = room.worldPosition || room.position;
  return {
    x: (Number(rp?.x) || 0) + 24,
    y: 0.6,
    z: (Number(rp?.z) || 0) + 24,
  };
}

function ensureBlockBrushCursor(room: any, cellSize: number, brushRadius: number): any {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const cc = require('cc');
  const { Node, MeshRenderer, primitives, utils, CCObject } = cc;

  let cursor = room.getChildByName?.(BLOCK_BRUSH_CURSOR);
  // 旧版半透明「Box」看起来像编辑器白框 → 一律毁掉重建
  const stale =
    cursor?.isValid &&
    (cursor.getChildByName?.('Box') ||
      !cursor.getChildByName?.('Disc') ||
      (CCObject?.Flags?.LockedInEditor &&
        (cursor._objFlags & CCObject.Flags.LockedInEditor) !== 0));
  if (stale) {
    try {
      cursor.removeFromParent?.();
    } catch {
      /* ignore */
    }
    if (cursor.isValid) cursor.destroy();
    cursor = null;
  }
  if (!cursor || !cursor.isValid) {
    cursor = new Node(BLOCK_BRUSH_CURSOR);
    markBrushMovable(cursor);
    if (typeof room.layer === 'number') cursor.layer = room.layer;
    cursor.setParent(room);
    const start = guessBrushStartPos(room);
    if (typeof cursor.setWorldPosition === 'function') {
      cursor.setWorldPosition(start.x, start.y, start.z);
    } else {
      const rp = room.worldPosition || room.position;
      cursor.setPosition(
        start.x - (Number(rp?.x) || 0),
        start.y - (Number(rp?.y) || 0),
        start.z - (Number(rp?.z) || 0)
      );
    }

    // 不透明圆盘 + 细高柱（绝不用半透明方盒，易被当成框选白框）
    const disc = new Node('Disc');
    markBrushMovable(disc);
    disc.setParent(cursor);
    disc.setPosition(0, 0.08, 0);
    disc.setScale(1, 0.12, 1);
    const discMr = disc.addComponent(MeshRenderer);
    discMr.mesh = utils.MeshUtils.createMesh(
      primitives.cylinder(0.5, 0.5, 1, { radialSegments: 24 })
    );
    ensureMaterial(discMr, { r: 40, g: 200, b: 255, a: 255 });

    const pole = new Node('Pole');
    markBrushMovable(pole);
    pole.setParent(cursor);
    pole.setPosition(0, 1.4, 0);
    pole.setScale(0.12, 2.8, 0.12);
    const poleMr = pole.addComponent(MeshRenderer);
    poleMr.mesh = utils.MeshUtils.createMesh(
      primitives.cylinder(0.5, 0.5, 1, { radialSegments: 10 })
    );
    ensureMaterial(poleMr, { r: 255, g: 220, b: 40, a: 255 });
  } else {
    markBrushMovable(cursor);
  }
  // 半径 = 边长格数：视觉直径 ≈ size * cellSize
  const s = Math.max(0.45, cellSize * Math.max(1, Math.floor(brushRadius)));
  cursor.setScale(s, 1, s);
  applyIgnoreRaycastLayer(cursor);
  return cursor;
}

function clearBlockGrid(room: any): void {
  const g = room?.getChildByName?.(BLOCK_GRID_ROOT);
  if (!g) return;
  try {
    g.removeFromParent?.();
  } catch {
    /* ignore */
  }
  if (g.isValid) g.destroy();
}

/** 地面画与 cellSize/origin 一致的网格，任意模型都按同一套格子对齐 */
function ensureBlockGrid(
  room: any,
  cellSize: number,
  originX: number,
  originZ: number,
  aroundX: number,
  aroundZ: number
): void {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const cc = require('cc');
  const { Node, MeshRenderer, primitives, utils, CCObject } = cc;

  clearBlockGrid(room);
  const s = cellSize > 1e-6 ? cellSize : 0.5;
  const half = 12; // 半径约 12 格的可视范围
  const c0 = worldToCell(aroundX, aroundZ, s, originX, originZ);

  const root = new Node(BLOCK_GRID_ROOT);
  markEditorOnly(root);
  root.setParent(room);
  applyIgnoreRaycastLayer(root);

  const makeLine = (name: string, x: number, z: number, sx: number, sz: number) => {
    const n = new Node(name);
    markEditorOnly(n);
    n.setParent(root);
    n.setWorldPosition?.(x, 0.02, z);
    if (!n.setWorldPosition) {
      const rp = room.worldPosition || room.position;
      n.setPosition(x - (Number(rp?.x) || 0), 0.02, z - (Number(rp?.z) || 0));
    }
    n.setScale(Math.max(0.01, sx), 0.01, Math.max(0.01, sz));
    const mr = n.addComponent(MeshRenderer);
    mr.mesh = utils.MeshUtils.createMesh(primitives.box(1, 1, 1));
    ensureMaterial(mr, GRID_COLOR);
  };

  const x0 = originX + (c0.cx - half) * s;
  const x1 = originX + (c0.cx + half + 1) * s;
  const z0 = originZ + (c0.cz - half) * s;
  const z1 = originZ + (c0.cz + half + 1) * s;
  const midX = (x0 + x1) * 0.5;
  const midZ = (z0 + z1) * 0.5;
  const spanX = x1 - x0;
  const spanZ = z1 - z0;
  const thin = Math.max(0.02, s * 0.04);

  for (let i = -half; i <= half + 1; i++) {
    const x = originX + (c0.cx + i) * s;
    const z = originZ + (c0.cz + i) * s;
    makeLine(`gx_${i}`, x, midZ, thin, spanZ);
    makeLine(`gz_${i}`, midX, z, spanX, thin);
  }
  applyIgnoreRaycastLayer(root);
}

function rebuildBlockCellBoxes(
  preview: any,
  cells: string[],
  cellSize: number,
  originX: number,
  originZ: number
): number {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const cc = require('cc');
  const { Node, MeshRenderer, primitives, utils, CCObject } = cc;

  const existing = [...(preview.children || [])];
  for (const c of existing) {
    try {
      c.removeFromParent?.();
    } catch {
      /* ignore */
    }
    if (c?.isValid) c.destroy();
  }

  const s = cellSize > 1e-6 ? cellSize : 0.5;
  const room = preview.parent;
  let count = 0;
  for (const key of cells || []) {
    const cell = parseCellKey(key);
    if (!cell) continue;
    const n = new Node(`Cell_${cell.cx}_${cell.cz}`);
    markEditorOnly(n);
    n.setParent(preview);
    const cx = originX + (cell.cx + 0.5) * s;
    const cz = originZ + (cell.cz + 0.5) * s;
    // 世界坐标落格，避免父节点偏移导致和模型错位
    if (n.setWorldPosition) n.setWorldPosition(cx, 1.0, cz);
    else n.setPosition(cx, 1.0, cz);
    n.setScale(Math.max(0.05, s), 2.0, Math.max(0.05, s));
    const mr = n.addComponent(MeshRenderer);
    mr.mesh = utils.MeshUtils.createMesh(primitives.box(1, 1, 1));
    ensureMaterial(mr, BLOCK_COLOR);
    applyIgnoreRaycastLayer(n);
    count++;
  }
  applyIgnoreRaycastLayer(preview);
  return count;
}

async function previewBlockPlant(args?: {
  cells?: string[];
  cellSize?: number;
  originX?: number;
  originZ?: number;
  brushRadius?: number;
  showBrush?: boolean;
}): Promise<{ ok: boolean; reason?: string; count?: number }> {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const cc = require('cc');
  const { Node, CCObject } = cc;

  const room = findRoomRoot();
  if (!room) return { ok: false, reason: '未找到房间根节点（请先打开资源 Prefab）' };

  const gen = ++_blockPreviewGen;
  clearBlockPreviewUnder(room);
  if (gen !== _blockPreviewGen) return { ok: true, count: 0, reason: 'stale' };

  const cellSize = args?.cellSize && args.cellSize > 1e-6 ? args.cellSize : 1;
  const originX = Number(args?.originX) || 0;
  const originZ = Number(args?.originZ) || 0;
  const brushRadius = Math.max(0, Math.floor(Number(args?.brushRadius) || 0));

  const preview = new Node(BLOCK_PREVIEW_ROOT);
  preview._objFlags |= CCObject.Flags.DontSave;
  preview.setParent(room);

  const count = rebuildBlockCellBoxes(preview, args?.cells || [], cellSize, originX, originZ);
  if (args?.showBrush !== false) {
    ensureBlockBrushCursor(room, cellSize, brushRadius);
  }

  console.log(`[scene-editor] block preview: ${count} cell(s) under ${room.name}`);
  return { ok: true, count };
}

async function syncBlockPlantCells(args?: {
  cells?: string[];
  cellSize?: number;
  originX?: number;
  originZ?: number;
  brushRadius?: number;
}): Promise<{ ok: boolean; reason?: string; count?: number }> {
  const room = findRoomRoot();
  if (!room) return { ok: false, reason: '未找到房间根节点' };

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const cc = require('cc');
  const { Node, CCObject } = cc;

  let preview = room.getChildByName?.(BLOCK_PREVIEW_ROOT);
  if (!preview || !preview.isValid) {
    preview = new Node(BLOCK_PREVIEW_ROOT);
    preview._objFlags |= CCObject.Flags.DontSave;
    preview.setParent(room);
  }

  const cellSize = args?.cellSize && args.cellSize > 1e-6 ? args.cellSize : 1;
  const originX = Number(args?.originX) || 0;
  const originZ = Number(args?.originZ) || 0;
  const brushRadius = Math.max(0, Math.floor(Number(args?.brushRadius) || 0));
  const count = rebuildBlockCellBoxes(preview, args?.cells || [], cellSize, originX, originZ);
  ensureBlockBrushCursor(room, cellSize, brushRadius);
  return { ok: true, count };
}

function findEditorCamera(): any | null {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const cc = require('cc');
  const { director, Camera } = cc;
  const scene = director.getScene();
  if (!scene) return null;
  const cams = scene.getComponentsInChildren?.(Camera) || [];
  for (const c of cams) {
    if (c?.node?.isValid && c.node.activeInHierarchy !== false) return c;
  }
  return scene.getComponentInChildren?.(Camera) || null;
}

/** 镜头中心（或指定屏幕点）打到 y=groundY 平面 */
function pickGroundFromCamera(args?: {
  groundY?: number;
  screenX?: number;
  screenY?: number;
}): { ok: boolean; reason?: string; x?: number; y?: number; z?: number } {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const cc = require('cc');
  const { geometry, Vec3 } = cc;

  const cam = findEditorCamera();
  if (!cam) return { ok: false, reason: '未找到场景相机' };

  const groundY = Number.isFinite(args?.groundY) ? Number(args?.groundY) : 0;
  const ray = new geometry.Ray();
  try {
    if (typeof args?.screenX === 'number' && typeof args?.screenY === 'number' && cam.screenPointToRay) {
      cam.screenPointToRay(args.screenX, args.screenY, ray);
    } else if (cam.screenPointToRay && cam.camera) {
      const w = cam.camera.width || 800;
      const h = cam.camera.height || 600;
      cam.screenPointToRay(w * 0.5, h * 0.5, ray);
    } else {
      // 退化：从相机位置沿 forward
      const node = cam.node;
      const o = node.worldPosition;
      const forward = new Vec3();
      Vec3.transformQuat(forward, new Vec3(0, 0, -1), node.worldRotation);
      if (geometry.Ray.set) {
        geometry.Ray.set(ray, o.x, o.y, o.z, forward.x, forward.y, forward.z);
      } else {
        ray.o = o;
        ray.d = forward;
      }
    }
  } catch (e) {
    return { ok: false, reason: `射线失败: ${e}` };
  }

  const oy = ray.o?.y ?? ray.orig?.y ?? 0;
  const dy = ray.d?.y ?? ray.dir?.y ?? 0;
  if (Math.abs(dy) < 1e-6) return { ok: false, reason: '镜头几乎水平，请俯视地面' };
  const t = (groundY - oy) / dy;
  if (t < 0.01) return { ok: false, reason: '镜头未朝向地面' };
  const ox = ray.o?.x ?? ray.orig?.x ?? 0;
  const oz = ray.o?.z ?? ray.orig?.z ?? 0;
  const dx = ray.d?.x ?? ray.dir?.x ?? 0;
  const dz = ray.d?.z ?? ray.dir?.z ?? 0;
  return { ok: true, x: ox + dx * t, y: groundY, z: oz + dz * t };
}

async function moveBlockBrushTo(args?: {
  x?: number;
  z?: number;
  cellSize?: number;
  brushRadius?: number;
  snapCell?: boolean;
  originX?: number;
  originZ?: number;
}): Promise<{ ok: boolean; reason?: string; x?: number; y?: number; z?: number; uuid?: string }> {
  const room = findRoomRoot();
  if (!room) return { ok: false, reason: '未找到房间根节点（请先场景预览）' };
  const cellSize = args?.cellSize && args.cellSize > 1e-6 ? args.cellSize : 1;
  const brushRadius = Math.max(0, Math.floor(Number(args?.brushRadius) || 0));
  const cursor = ensureBlockBrushCursor(room, cellSize, brushRadius);

  let x = Number(args?.x);
  let z = Number(args?.z);
  if (!Number.isFinite(x) || !Number.isFinite(z)) {
    return { ok: false, reason: '无效坐标' };
  }
  if (args?.snapCell !== false) {
    const originX = Number(args?.originX) || 0;
    const originZ = Number(args?.originZ) || 0;
    const cx = Math.floor((x - originX) / cellSize);
    const cz = Math.floor((z - originZ) / cellSize);
    x = originX + (cx + 0.5) * cellSize;
    z = originZ + (cz + 0.5) * cellSize;
  }
  // 相对房间根
  const rp = room.worldPosition || room.position;
  const rx = Number(rp?.x) || 0;
  const rz = Number(rp?.z) || 0;
  cursor.setWorldPosition?.(x, 0.6, z);
  if (!cursor.setWorldPosition) {
    cursor.setPosition(x - rx, 0.6, z - rz);
  }
  const p = cursor.worldPosition || cursor.position;
  return {
    ok: true,
    x: Number(p?.x) || x,
    y: Number(p?.y) || 0.6,
    z: Number(p?.z) || z,
    uuid: typeof cursor.uuid === 'string' ? cursor.uuid : undefined,
  };
}

async function queryBlockBrushCursor(): Promise<{
  ok: boolean;
  reason?: string;
  x?: number;
  y?: number;
  z?: number;
  uuid?: string;
  name?: string;
}> {
  const room = findRoomRoot();
  if (!room) return { ok: false, reason: '未找到房间根节点（请先点「场景预览」打开资源 Prefab）' };
  const cursor = room.getChildByName?.(BLOCK_BRUSH_CURSOR);
  if (!cursor) return { ok: false, reason: '无笔刷光标（请先点「场景预览」）' };
  const p = cursor.worldPosition || cursor.position;
  return {
    ok: true,
    x: Number(p?.x) || 0,
    y: Number(p?.y) || 0,
    z: Number(p?.z) || 0,
    uuid: typeof cursor.uuid === 'string' ? cursor.uuid : undefined,
    name: BLOCK_BRUSH_CURSOR,
  };
}

/** 按 uuid 取节点世界坐标（用于「选中处落笔」） */
async function queryNodeWorldPos(args?: { uuid?: string }): Promise<{
  ok: boolean;
  reason?: string;
  x?: number;
  y?: number;
  z?: number;
  name?: string;
}> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const cc = require('cc');
    const { director } = cc;
    const uuid = args?.uuid;
    if (!uuid) return { ok: false, reason: '未选中节点' };
    const scene = director.getScene();
    if (!scene) return { ok: false, reason: '无场景' };
    let found: any = null;
    const walk = (n: any) => {
      if (found || !n) return;
      if (n.uuid === uuid) {
        found = n;
        return;
      }
      for (const c of n.children || []) walk(c);
    };
    walk(scene);
    if (!found) return { ok: false, reason: '选中节点不在当前场景' };
    if ((found.name || '') === BLOCK_BRUSH_CURSOR) {
      return { ok: false, reason: '请选中墙体/地面等节点，而不是笔刷本身' };
    }
    const p = found.worldPosition || found.position;
    return {
      ok: true,
      x: Number(p?.x) || 0,
      y: Number(p?.y) || 0,
      z: Number(p?.z) || 0,
      name: String(found.name || ''),
    };
  } catch (e) {
    return { ok: false, reason: String(e) };
  }
}

async function clearBlockPlantPreview(): Promise<{ ok: boolean; reason?: string }> {
  const room = findRoomRoot();
  if (!room) return { ok: false, reason: '未找到房间根节点' };
  _blockPreviewGen++;
  clearBlockPreviewUnder(room);
  return { ok: true };
}

export const methods = {
  async previewMonsterSpawn(args?: {
    layers?: SpawnLayer[];
    layerIndex?: number;
    showAllLayers?: boolean;
  }) {
    try {
      return await previewMonsterSpawn(args);
    } catch (e) {
      return { ok: false, reason: String(e) };
    }
  },

  async clearMonsterSpawnPreview() {
    try {
      return await clearMonsterSpawnPreview();
    } catch (e) {
      return { ok: false, reason: String(e) };
    }
  },

  async querySpawnPreviewTransforms() {
    try {
      return await querySpawnPreviewTransforms();
    } catch (e) {
      return { ok: false, reason: String(e) };
    }
  },

  async previewBlockPlant(args?: {
    cells?: string[];
    cellSize?: number;
    originX?: number;
    originZ?: number;
    brushRadius?: number;
    showBrush?: boolean;
  }) {
    try {
      return await previewBlockPlant(args);
    } catch (e) {
      return { ok: false, reason: String(e) };
    }
  },

  async syncBlockPlantCells(args?: {
    cells?: string[];
    cellSize?: number;
    originX?: number;
    originZ?: number;
    brushRadius?: number;
  }) {
    try {
      return await syncBlockPlantCells(args);
    } catch (e) {
      return { ok: false, reason: String(e) };
    }
  },

  async queryBlockBrushCursor() {
    try {
      return await queryBlockBrushCursor();
    } catch (e) {
      return { ok: false, reason: String(e) };
    }
  },

  async pickGroundFromCamera(args?: { groundY?: number; screenX?: number; screenY?: number }) {
    try {
      return pickGroundFromCamera(args);
    } catch (e) {
      return { ok: false, reason: String(e) };
    }
  },

  async moveBlockBrushTo(args?: {
    x?: number;
    z?: number;
    cellSize?: number;
    brushRadius?: number;
    snapCell?: boolean;
    originX?: number;
    originZ?: number;
  }) {
    try {
      return await moveBlockBrushTo(args);
    } catch (e) {
      return { ok: false, reason: String(e) };
    }
  },

  async queryNodeWorldPos(args?: { uuid?: string }) {
    try {
      return await queryNodeWorldPos(args);
    } catch (e) {
      return { ok: false, reason: String(e) };
    }
  },

  async clearBlockPlantPreview() {
    try {
      return await clearBlockPlantPreview();
    } catch (e) {
      return { ok: false, reason: String(e) };
    }
  },

  async startMouseBrushTool(args?: {
    cells?: string[];
    cellSize?: number;
    originX?: number;
    originZ?: number;
    brushRadius?: number;
    erase?: boolean;
  }) {
    try {
      return startMouseBrushTool(args);
    } catch (e) {
      return { ok: false, reason: String(e) };
    }
  },

  async stopMouseBrushTool() {
    try {
      return stopMouseBrushTool();
    } catch (e) {
      return { ok: false, reason: String(e), cells: [], cellCount: 0 };
    }
  },

  async configureMouseBrush(args?: { erase?: boolean; brushRadius?: number; cellSize?: number }) {
    try {
      return configureMouseBrush(args);
    } catch (e) {
      return { ok: false, active: false, reason: String(e) };
    }
  },

  async queryMouseBrushState() {
    try {
      return queryMouseBrushState();
    } catch (e) {
      return {
        ok: false,
        active: false,
        erase: false,
        cellCount: 0,
        cells: [],
        dirty: false,
        brushRadius: 1,
        reason: String(e),
      };
    }
  },
};
