import { Color, Graphics, Node, Sprite, SpriteFrame, UITransform, assetManager } from 'cc';
import { TOOL_FRAMES } from './ToolFrames';

/** Farm / Stardew-like panel palette — shared by bag, quest, shop, GM, rewards. */
export const UI_WOOD = new Color(176, 110, 48, 255);
export const UI_WOOD_DARK = new Color(120, 72, 32, 255);
export const UI_PARCHMENT = new Color(232, 198, 140, 255);
export const UI_PARCHMENT_LIGHT = new Color(246, 226, 180, 255);
export const UI_PARCHMENT_ROW = new Color(236, 210, 158, 255);
export const UI_GOLD = new Color(210, 150, 70, 255);
export const UI_STROKE = new Color(60, 36, 18, 255);
export const UI_INK = new Color(68, 40, 18, 255);
export const UI_INK_MUTE = new Color(110, 78, 42, 255);
export const UI_CREAM = new Color(255, 244, 214, 255);
export const UI_PRICE = new Color(140, 84, 24, 255);

/** Bag-standard close chip (FarmHUD: 56 × 1.5). */
export const PANEL_CLOSE_BTN = 84;
/** Inset from panel outer edge to close icon edge. */
export const PANEL_CLOSE_PAD = 33;
/** Generous hit plate (tutorial chevron sits above the X). */
export const PANEL_CLOSE_HIT = Math.round(PANEL_CLOSE_BTN * 1.85);

let _closeFrameCache: SpriteFrame | null | undefined;
const _closeFrameWaiters: Array<(frame: SpriteFrame | null) => void> = [];

/**
 * Outer wood frame + inner parchment (matches FarmHUD / QuestPanel).
 * Draw into a dedicated Chrome Graphics node behind content.
 */
export function drawWoodParchmentPanel(
    g: Graphics,
    w: number,
    h: number,
    opts?: { radius?: number; lightInset?: boolean },
) {
    const r = opts?.radius ?? 20;
    const x0 = -w * 0.5;
    const y0 = -h * 0.5;
    g.clear();
    g.fillColor = UI_WOOD;
    g.roundRect(x0, y0, w, h, r);
    g.fill();
    g.fillColor = UI_WOOD_DARK;
    g.roundRect(x0 + 6, y0 + 6, w - 12, h - 12, Math.max(4, r - 4));
    g.fill();
    g.fillColor = UI_PARCHMENT;
    g.roundRect(x0 + 14, y0 + 14, w - 28, h - 28, Math.max(4, r - 8));
    g.fill();
    if (opts?.lightInset !== false) {
        g.fillColor = UI_PARCHMENT_LIGHT;
        g.roundRect(x0 + 20, y0 + 20, w - 40, h - 40, Math.max(2, r - 12));
        g.fill();
    }
    g.strokeColor = UI_STROKE;
    g.lineWidth = 4;
    g.roundRect(x0, y0, w, h, r);
    g.stroke();
    g.strokeColor = UI_GOLD;
    g.lineWidth = 3;
    g.roundRect(x0 + 8, y0 + 8, w - 16, h - 16, Math.max(4, r - 5));
    g.stroke();
}

/** Beveled wood button (tab / primary action). */
export function drawWoodButton(
    g: Graphics,
    w: number,
    h: number,
    kind: 'on' | 'off' | 'primary' | 'muted' = 'primary',
) {
    const r = Math.min(14, Math.round(h * 0.28));
    let fill: Color;
    let inner: Color;
    if (kind === 'on') {
        fill = UI_WOOD_DARK;
        inner = UI_GOLD;
    } else if (kind === 'off') {
        fill = UI_WOOD;
        inner = UI_PARCHMENT_LIGHT;
    } else if (kind === 'muted') {
        fill = new Color(140, 96, 52, 255);
        inner = new Color(200, 168, 118, 255);
    } else {
        fill = UI_WOOD;
        inner = UI_PARCHMENT;
    }
    g.clear();
    g.fillColor = fill;
    g.roundRect(-w * 0.5, -h * 0.5, w, h, r);
    g.fill();
    g.fillColor = inner;
    g.roundRect(-w * 0.5 + 4, -h * 0.5 + 4, w - 8, h - 8, Math.max(4, r - 3));
    g.fill();
    g.strokeColor = UI_STROKE;
    g.lineWidth = 3;
    g.roundRect(-w * 0.5, -h * 0.5, w, h, r);
    g.stroke();
}

/** Shop / list row plate on parchment. */
export function drawParchmentRow(g: Graphics, w: number, h: number, radius = 12) {
    const x0 = -w * 0.5;
    const y0 = -h * 0.5;
    g.clear();
    g.fillColor = UI_WOOD_DARK;
    g.roundRect(x0, y0, w, h, radius);
    g.fill();
    g.fillColor = UI_PARCHMENT_ROW;
    g.roundRect(x0 + 3, y0 + 3, w - 6, h - 6, Math.max(4, radius - 2));
    g.fill();
    g.strokeColor = UI_STROKE;
    g.lineWidth = 2;
    g.roundRect(x0, y0, w, h, radius);
    g.stroke();
}

/**
 * Wood-framed close chip matching bag `TOOL_FRAMES.close`
 * (rim + parchment face + dark X). Last-resort fallback only.
 */
export function drawWoodClose(g: Graphics, size: number) {
    const half = size * 0.5;
    const r = Math.round(size * 0.16);
    const inset = Math.max(4, Math.round(size * 0.12));
    g.clear();
    g.fillColor = UI_WOOD;
    g.roundRect(-half, -half, size, size, r);
    g.fill();
    g.fillColor = UI_WOOD_DARK;
    g.roundRect(-half + 3, -half + 3, size - 6, size - 6, Math.max(2, r - 2));
    g.fill();
    g.fillColor = UI_PARCHMENT_LIGHT;
    g.roundRect(-half + inset, -half + inset, size - inset * 2, size - inset * 2, Math.max(2, r - 4));
    g.fill();
    g.strokeColor = UI_STROKE;
    g.lineWidth = Math.max(3, Math.round(size * 0.06));
    g.roundRect(-half, -half, size, size, r);
    g.stroke();
    g.strokeColor = new Color(54, 30, 14, 255);
    g.lineWidth = Math.max(4, Math.round(size * 0.09));
    const m = Math.round(size * 0.26);
    g.moveTo(-m, m);
    g.lineTo(m, -m);
    g.moveTo(-m, -m);
    g.lineTo(m, m);
    g.stroke();
}

/** Cached load of bag close sprite (`TOOL_FRAMES.close`). */
export function loadPanelCloseFrame(done: (frame: SpriteFrame | null) => void) {
    if (_closeFrameCache !== undefined) {
        done(_closeFrameCache);
        return;
    }
    _closeFrameWaiters.push(done);
    if (_closeFrameWaiters.length > 1) return;
    assetManager.loadAny({ uuid: TOOL_FRAMES.close }, (err, asset) => {
        _closeFrameCache = !err && asset ? (asset as SpriteFrame) : null;
        if (err || !asset) console.warn('[UiChrome] close frame missing', err);
        const waiters = _closeFrameWaiters.splice(0, _closeFrameWaiters.length);
        for (const w of waiters) w(_closeFrameCache);
    });
}

/** Top-right corner placement matching FarmHUD bag / chest / craft. */
export function placePanelCloseButton(
    btn: Node,
    panelW: number,
    panelH: number,
    opts?: { size?: number; pad?: number; hit?: number },
) {
    const size = opts?.size ?? PANEL_CLOSE_BTN;
    const pad = opts?.pad ?? PANEL_CLOSE_PAD;
    const hit = opts?.hit ?? Math.round(size * 1.85);
    btn.setPosition(panelW * 0.5 - pad - size * 0.5, panelH * 0.5 - pad - size * 0.5, 0);
    const ut = btn.getComponent(UITransform) ?? btn.addComponent(UITransform);
    ut.setContentSize(hit, hit);
}

/**
 * Bag-standard close visual: prefer `TOOL_FRAMES.close` sprite, else drawWoodClose.
 * Call after the button's hit UITransform is sized.
 */
export function paintPanelCloseVisual(
    btn: Node,
    opts: { size?: number; layer: number; frame?: SpriteFrame | null },
) {
    const size = opts.size ?? PANEL_CLOSE_BTN;
    const { layer } = opts;
    const frame = opts.frame ?? null;
    let icon = btn.getChildByName('Icon');
    if (frame) {
        if (!icon) {
            icon = new Node('Icon');
            icon.layer = layer;
            icon.setParent(btn);
            icon.addComponent(UITransform).setContentSize(size, size);
            icon.addComponent(Sprite);
        }
        icon.active = true;
        icon.layer = layer;
        const iut = icon.getComponent(UITransform) ?? icon.addComponent(UITransform);
        iut.setContentSize(size, size);
        const sp = icon.getComponent(Sprite) ?? icon.addComponent(Sprite);
        sp.sizeMode = Sprite.SizeMode.CUSTOM;
        sp.spriteFrame = frame;
        const g = btn.getComponent(Graphics);
        if (g) g.clear();
        return;
    }
    if (icon) icon.active = false;
    const g = btn.getComponent(Graphics) ?? btn.addComponent(Graphics);
    drawWoodClose(g, size);
}

/**
 * Create bag-standard close button under `parent`, load sprite async, paint when ready.
 * Returns the hit node immediately (fallback Graphics until frame arrives).
 */
export function mountPanelCloseButton(
    parent: Node,
    panelW: number,
    panelH: number,
    opts?: { name?: string; size?: number; pad?: number; frame?: SpriteFrame | null },
): Node {
    const size = opts?.size ?? PANEL_CLOSE_BTN;
    const btn = new Node(opts?.name ?? 'CloseBtn');
    btn.layer = parent.layer;
    btn.setParent(parent);
    placePanelCloseButton(btn, panelW, panelH, { size, pad: opts?.pad });
    paintPanelCloseVisual(btn, {
        size,
        layer: parent.layer,
        frame: opts?.frame ?? null,
    });
    if (!opts?.frame) {
        loadPanelCloseFrame((frame) => {
            if (!btn.isValid || !frame) return;
            paintPanelCloseVisual(btn, { size, layer: btn.layer, frame });
        });
    }
    return btn;
}

/** Bottom dialogue band — wood rim, warm dark fill (readable over world). */
export function drawDialogueChrome(g: Graphics, w: number, h: number) {
    const x0 = -w * 0.5;
    const y0 = -h * 0.5;
    const r = 22;
    g.clear();
    g.fillColor = UI_WOOD;
    g.roundRect(x0, y0, w, h, r);
    g.fill();
    g.fillColor = UI_WOOD_DARK;
    g.roundRect(x0 + 6, y0 + 6, w - 12, h - 12, r - 4);
    g.fill();
    g.fillColor = new Color(48, 34, 22, 252);
    g.roundRect(x0 + 14, y0 + 14, w - 28, h - 28, r - 8);
    g.fill();
    g.strokeColor = UI_STROKE;
    g.lineWidth = 4;
    g.roundRect(x0, y0, w, h, r);
    g.stroke();
    g.strokeColor = UI_GOLD;
    g.lineWidth = 3;
    g.roundRect(x0 + 8, y0 + 8, w - 16, h - 16, r - 5);
    g.stroke();
}
