import { Color, Graphics, Node, Sprite, SpriteFrame, UITransform, assetManager } from 'cc';
import { TOOL_FRAMES } from './ToolFrames';
import { UI_CHROME_FRAMES } from './UiChromeFrames';

/** Farm / Stardew-like panel palette — labels / accents only (chrome is AI sprites). */
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

type ChromeKey = keyof typeof UI_CHROME_FRAMES;

let _closeFrameCache: SpriteFrame | null | undefined;
const _closeFrameWaiters: Array<(frame: SpriteFrame | null) => void> = [];
const _frameCache = new Map<string, SpriteFrame | null>();
const _frameWaiters = new Map<string, Array<(sf: SpriteFrame | null) => void>>();

function loadChromeFrame(uuid: string, done: (sf: SpriteFrame | null) => void) {
    if (_frameCache.has(uuid)) {
        done(_frameCache.get(uuid) ?? null);
        return;
    }
    const list = _frameWaiters.get(uuid) ?? [];
    list.push(done);
    _frameWaiters.set(uuid, list);
    if (list.length > 1) return;
    assetManager.loadAny({ uuid }, (err, asset) => {
        const sf = !err && asset ? (asset as SpriteFrame) : null;
        if (err || !asset) console.warn('[UiChrome] AI frame missing', uuid, err);
        _frameCache.set(uuid, sf);
        const waiters = _frameWaiters.get(uuid) ?? [];
        _frameWaiters.delete(uuid);
        for (const w of waiters) w(sf);
    });
}

function disableGraphics(node: Node) {
    const g = node.getComponent(Graphics);
    if (g) {
        g.clear();
        g.enabled = false;
    }
}

/**
 * Apply an AI nine-slice / simple chrome sprite onto `node`.
 * Clears any procedural Graphics on the same node.
 */
export function applyAiChrome(
    node: Node,
    key: ChromeKey,
    opts?: { w?: number; h?: number; sliced?: boolean },
) {
    if (!node?.isValid) return;
    const uuid = UI_CHROME_FRAMES[key];
    if (!uuid) {
        console.warn('[UiChrome] unknown chrome key', key);
        return;
    }
    const ut = node.getComponent(UITransform) ?? node.addComponent(UITransform);
    if (opts?.w && opts?.h) ut.setContentSize(opts.w, opts.h);
    let sp = node.getComponent(Sprite);
    if (!sp) sp = node.addComponent(Sprite);
    sp.sizeMode = Sprite.SizeMode.CUSTOM;
    sp.trim = false;
    sp.type = opts?.sliced === false ? Sprite.Type.SIMPLE : Sprite.Type.SLICED;
    disableGraphics(node);
    loadChromeFrame(uuid, (sf) => {
        if (!node.isValid || !sf || !sp.isValid) return;
        sp.spriteFrame = sf;
    });
}

/** Outer wood frame + parchment — AI sprite (nine-slice). */
export function applyWoodPanel(node: Node, w?: number, h?: number) {
    applyAiChrome(node, 'wood_panel', { w, h, sliced: true });
}

/** Beveled wood button — AI sprite by kind. */
export function applyWoodButton(
    node: Node,
    kind: 'on' | 'off' | 'primary' | 'muted' = 'primary',
    w?: number,
    h?: number,
) {
    const key: ChromeKey =
        kind === 'on'
            ? 'wood_btn_on'
            : kind === 'off'
              ? 'wood_btn_off'
              : kind === 'muted'
                ? 'wood_btn_muted'
                : 'wood_btn_primary';
    applyAiChrome(node, key, { w, h, sliced: true });
}

/** Shop / list row parchment plate — AI sprite. */
export function applyParchmentRow(node: Node, w?: number, h?: number) {
    applyAiChrome(node, 'parchment_row', { w, h, sliced: true });
}

/** Dialogue caption band — AI sprite. */
export function applyDialogueChrome(node: Node, w?: number, h?: number) {
    applyAiChrome(node, 'dialogue_box', { w, h, sliced: true });
}

/** Tooltip bubble — AI sprite. */
export function applyTipBubble(node: Node, w?: number, h?: number) {
    applyAiChrome(node, 'tip_bubble', { w, h, sliced: true });
}

/** Hotbar dock plate — AI sprite. */
export function applyHotbarBg(node: Node, w?: number, h?: number) {
    applyAiChrome(node, 'hotbar_bg', { w, h, sliced: true });
}

/** Inventory slot well — AI sprite. */
export function applySlotPlate(node: Node, w?: number, h?: number) {
    applyAiChrome(node, 'slot_plate', { w, h, sliced: true });
}

/**
 * @deprecated Use applyWoodPanel(node). Kept so existing call sites paint AI chrome.
 */
export function drawWoodParchmentPanel(
    g: Graphics,
    w: number,
    h: number,
    _opts?: { radius?: number; lightInset?: boolean },
) {
    applyWoodPanel(g.node, w, h);
}

/**
 * @deprecated Use applyWoodButton(node, kind).
 */
export function drawWoodButton(
    g: Graphics,
    w: number,
    h: number,
    kind: 'on' | 'off' | 'primary' | 'muted' = 'primary',
) {
    applyWoodButton(g.node, kind, w, h);
}

/**
 * @deprecated Use applyParchmentRow(node).
 */
export function drawParchmentRow(g: Graphics, w: number, h: number, _radius = 12) {
    applyParchmentRow(g.node, w, h);
}

/**
 * @deprecated Close chip must use TOOL_FRAMES.close AI sprite — no Graphics X.
 */
export function drawWoodClose(_g: Graphics, _size: number) {
    /* no-op: procedural close removed */
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
 * Bag-standard close visual: `TOOL_FRAMES.close` AI sprite only.
 */
export function paintPanelCloseVisual(
    btn: Node,
    opts: { size?: number; layer: number; frame?: SpriteFrame | null },
) {
    const size = opts.size ?? PANEL_CLOSE_BTN;
    const { layer } = opts;
    disableGraphics(btn);
    const apply = (frame: SpriteFrame | null) => {
        if (!btn.isValid || !frame) return;
        let icon = btn.getChildByName('Icon');
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
        sp.trim = false;
        sp.spriteFrame = frame;
    };
    if (opts.frame) {
        apply(opts.frame);
        return;
    }
    loadPanelCloseFrame(apply);
}

/**
 * Create bag-standard close button under `parent`, load AI close sprite.
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
    return btn;
}

/**
 * @deprecated Use applyDialogueChrome(node).
 */
export function drawDialogueChrome(g: Graphics, w: number, h: number) {
    applyDialogueChrome(g.node, w, h);
}
