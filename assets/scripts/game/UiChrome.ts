import { Color } from 'cc';
import type { Graphics } from 'cc';

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

/** Wood square close with X (fallback when no sprite). */
export function drawWoodClose(g: Graphics, size: number) {
    const half = size * 0.5;
    const r = Math.round(size * 0.18);
    g.clear();
    g.fillColor = UI_WOOD;
    g.roundRect(-half, -half, size, size, r);
    g.fill();
    g.strokeColor = UI_STROKE;
    g.lineWidth = 4;
    g.roundRect(-half, -half, size, size, r);
    g.stroke();
    g.strokeColor = new Color(72, 42, 22, 255);
    g.lineWidth = 5;
    const m = Math.round(size * 0.28);
    g.moveTo(-m, m);
    g.lineTo(m, -m);
    g.moveTo(-m, -m);
    g.lineTo(m, m);
    g.stroke();
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
