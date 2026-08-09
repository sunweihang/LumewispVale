import {
    _decorator,
    assetManager,
    Color,
    Component,
    EventKeyboard,
    Graphics,
    Input,
    KeyCode,
    Label,
    Node,
    Sprite,
    SpriteFrame,
    UITransform,
    input,
    view,
} from 'cc';
import { FarmSystem, FarmTool } from './FarmSystem';
import { TOOL_FRAMES } from './ToolFrames';
import { applyUiFont, loadUiFont, styleUiLabel } from './UiFont';

const { ccclass, property } = _decorator;

const TOOLS: FarmTool[] = ['hoe', 'seeds', 'can', 'axe'];
const TOOL_TIP: Record<FarmTool, { title: string; desc: string }> = {
    hoe: { title: '锄头', desc: '开垦荒地，翻出可种植的田地' },
    seeds: { title: '种子', desc: '在翻好的田地上播种' },
    can: { title: '水壶', desc: '给作物浇水，促进生长' },
    axe: { title: '斧头', desc: '砍伐野外的松树和橡树' },
};
/** Hotbar + tip chrome vs previous baseline (100px slots). */
const UI_SCALE = 1.5;
const SLOT = Math.round(100 * UI_SCALE);
const PLATE = Math.round(88 * UI_SCALE);
const ICON = Math.round(64 * UI_SCALE);
const GLOW_HALF = Math.round(48 * UI_SCALE);
/** Fixed slot size; count fills design width (empty slots ok). */
const SLOT_COUNT = 7;
const BAR_INNER_PAD = 3;
/** Tightened from 18 so 7×150 still fits 1080. */
const GAP = 4;
const BAR_BG_W = SLOT_COUNT * SLOT + (SLOT_COUNT - 1) * GAP + BAR_INNER_PAD * 2;
const BAR_PAD_Y = Math.round(20 * UI_SCALE);
const BAR_H = SLOT + BAR_PAD_Y;
/** Below FarmActionHint (−700) so the bar doesn't cover the cue text. */
const BAR_Y = -860;
const TIP_HIDE_SEC = 2.4;
/** Vertical air between tip pointer and slot top (was cramped at 8). */
const TIP_SLOT_GAP = 36;

/**
 * Bottom hotbar: tap slot to equip; tap world tile to use (via TouchJoystick.onTap).
 */
@ccclass('FarmHUD')
export class FarmHUD extends Component {
    @property(FarmSystem)
    farm: FarmSystem | null = null;

    private _bar: Node | null = null;
    private _tip: Node | null = null;
    private _tipTitle: Label | null = null;
    private _tipDesc: Label | null = null;
    private _tipGfx: Graphics | null = null;
    private _tipHideAt = 0;
    /** Tip bubble size in tip-local space (for tap-to-dismiss). */
    private _tipHit = { w: 280, h: 110, tail: 20, tailX: 0 };
    /** Keep tip chrome inside the visible canvas on both edges. */
    private static readonly TIP_EDGE_PAD = Math.round(16 * UI_SCALE);
    private _slots: { tool: FarmTool | null; root: Node; glow: Graphics }[] = [];
    private _frames: Partial<Record<keyof typeof TOOL_FRAMES, SpriteFrame>> = {};

    onLoad() {
        this.loadFrames(() => this.build());
        loadUiFont().then((font) => {
            if (!font) return;
            if (this._tipTitle) applyUiFont(this._tipTitle);
            if (this._tipDesc) applyUiFont(this._tipDesc);
        });
        input.on(Input.EventType.KEY_DOWN, this.onKey, this);
    }

    onDestroy() {
        input.off(Input.EventType.KEY_DOWN, this.onKey, this);
    }

    update() {
        if (this._tip?.active && this._tipHideAt > 0 && Date.now() >= this._tipHideAt) {
            this.hideTip();
        }
    }

    /** Wired from TouchJoystick: short tap (not drag). */
    handleTap(uiX: number, uiY: number) {
        if (this.hitTip(uiX, uiY)) {
            this.hideTip();
            return;
        }
        if (this.hitHotbar(uiX, uiY)) return;
        this.hideTip();
        this.farm?.tryActAtUi(uiX, uiY);
    }

    private loadFrames(done: () => void) {
        const keys = Object.keys(TOOL_FRAMES) as (keyof typeof TOOL_FRAMES)[];
        let left = keys.length;
        if (!left) {
            done();
            return;
        }
        keys.forEach((k) => {
            const uuid = TOOL_FRAMES[k];
            if (!uuid) {
                left--;
                if (left <= 0) done();
                return;
            }
            assetManager.loadAny({ uuid }, (err, asset) => {
                if (!err && asset) this._frames[k] = asset as SpriteFrame;
                left--;
                if (left <= 0) done();
            });
        });
    }

    private build() {
        for (const name of ['FarmActionBtn', 'FarmHotbar', 'FarmUseBtn', 'FarmToolTip']) {
            const n = this.node.getChildByName(name);
            if (n) n.destroy();
        }

        const canvas = this.node;
        const bar = new Node('FarmHotbar');
        bar.layer = canvas.layer;
        bar.setParent(canvas);
        const totalW = SLOT_COUNT * SLOT + (SLOT_COUNT - 1) * GAP;
        bar.setPosition(0, BAR_Y, 0);
        bar.addComponent(UITransform).setContentSize(BAR_BG_W, BAR_H);
        this._bar = bar;

        const bg = new Node('BarBg');
        bg.layer = canvas.layer;
        bg.setParent(bar);
        bg.addComponent(UITransform).setContentSize(BAR_BG_W, BAR_H);
        const bgG = bg.addComponent(Graphics);
        const barR = Math.round(16 * UI_SCALE);
        bgG.fillColor = new Color(62, 42, 28, 220);
        bgG.roundRect(-BAR_BG_W * 0.5, -BAR_H * 0.5, BAR_BG_W, BAR_H, barR);
        bgG.fill();
        bgG.strokeColor = new Color(40, 28, 18, 255);
        bgG.lineWidth = Math.round(4 * UI_SCALE);
        bgG.roundRect(-BAR_BG_W * 0.5, -BAR_H * 0.5, BAR_BG_W, BAR_H, barR);
        bgG.stroke();

        const startX = -totalW * 0.5 + SLOT * 0.5;
        const plateFallback = Math.round(40 * UI_SCALE);
        this._slots = [];
        for (let i = 0; i < SLOT_COUNT; i++) {
            const tool = i < TOOLS.length ? TOOLS[i]! : null;
            const x = startX + i * (SLOT + GAP);
            const root = new Node(tool ? `Slot_${tool}` : `Slot_empty_${i}`);
            root.layer = canvas.layer;
            root.setParent(bar);
            root.setPosition(x, 0, 0);
            root.addComponent(UITransform).setContentSize(SLOT, SLOT);

            const glowN = new Node('Glow');
            glowN.layer = canvas.layer;
            glowN.setParent(root);
            const glow = glowN.addComponent(Graphics);

            if (this._frames.slot) {
                const plate = new Node('Plate');
                plate.layer = canvas.layer;
                plate.setParent(root);
                plate.addComponent(UITransform).setContentSize(PLATE, PLATE);
                const sp = plate.addComponent(Sprite);
                sp.sizeMode = Sprite.SizeMode.CUSTOM;
                sp.spriteFrame = this._frames.slot;
            } else {
                const g = root.addComponent(Graphics);
                g.fillColor = new Color(210, 180, 120, 255);
                g.roundRect(-plateFallback, -plateFallback, plateFallback * 2, plateFallback * 2, Math.round(10 * UI_SCALE));
                g.fill();
            }

            if (tool) {
                const iconSf = this._frames[tool];
                if (iconSf) {
                    const icon = new Node('Icon');
                    icon.layer = canvas.layer;
                    icon.setParent(root);
                    icon.addComponent(UITransform).setContentSize(ICON, ICON);
                    const sp = icon.addComponent(Sprite);
                    sp.sizeMode = Sprite.SizeMode.CUSTOM;
                    sp.spriteFrame = iconSf;
                }
            }

            this._slots.push({ tool, root, glow });
        }

        this.buildTip();
        this.farm?.onToolChange(() => this.refreshSelection());
        this.refreshSelection();
    }

    private buildTip() {
        const canvas = this.node;
        const tip = new Node('FarmToolTip');
        tip.layer = canvas.layer;
        tip.setParent(canvas);
        tip.addComponent(UITransform).setContentSize(Math.round(280 * UI_SCALE), Math.round(110 * UI_SCALE));
        tip.active = false;
        this._tip = tip;

        const gfxN = new Node('Bubble');
        gfxN.layer = canvas.layer;
        gfxN.setParent(tip);
        gfxN.addComponent(UITransform).setContentSize(Math.round(280 * UI_SCALE), Math.round(110 * UI_SCALE));
        this._tipGfx = gfxN.addComponent(Graphics);

        const titleN = new Node('Title');
        titleN.layer = canvas.layer;
        titleN.setParent(tip);
        titleN.setPosition(0, Math.round(26 * UI_SCALE), 0);
        titleN.addComponent(UITransform).setContentSize(Math.round(240 * UI_SCALE), Math.round(40 * UI_SCALE));
        const title = titleN.addComponent(Label);
        title.horizontalAlign = Label.HorizontalAlign.CENTER;
        title.verticalAlign = Label.VerticalAlign.CENTER;
        styleUiLabel(title, {
            size: Math.round(28 * UI_SCALE),
            color: new Color(40, 36, 30, 255),
            outline: false,
        });
        this._tipTitle = title;

        const descN = new Node('Desc');
        descN.layer = canvas.layer;
        descN.setParent(tip);
        descN.setPosition(0, Math.round(-18 * UI_SCALE), 0);
        descN.addComponent(UITransform).setContentSize(Math.round(260 * UI_SCALE), Math.round(56 * UI_SCALE));
        const desc = descN.addComponent(Label);
        desc.horizontalAlign = Label.HorizontalAlign.CENTER;
        desc.verticalAlign = Label.VerticalAlign.CENTER;
        desc.overflow = Label.Overflow.RESIZE_HEIGHT;
        styleUiLabel(desc, {
            size: Math.round(22 * UI_SCALE),
            color: new Color(70, 64, 54, 255),
            outline: false,
        });
        this._tipDesc = desc;
    }

    private showTip(tool: FarmTool, slotLocalX: number) {
        if (!this._tip || !this._bar || !this._tipGfx || !this._tipTitle || !this._tipDesc) return;
        const info = TOOL_TIP[tool];
        this._tipTitle.string = info.title;
        this._tipDesc.string = info.desc;

        const boxW = Math.max(Math.round(240 * UI_SCALE), Math.min(Math.round(360 * UI_SCALE), Math.round(60 * UI_SCALE) + info.desc.length * Math.round(22 * UI_SCALE)));
        const boxH = Math.round(118 * UI_SCALE);
        const tail = Math.round(22 * UI_SCALE);

        // Prefer centered on slot; clamp bubble into canvas so edge slots stay fully visible.
        const barPos = this._bar.position;
        const anchorX = barPos.x + slotLocalX;
        const canvasUi = this.node.getComponent(UITransform);
        const vis = view.getVisibleSize();
        const halfW = (canvasUi?.contentSize.width || vis.width) * 0.5;
        const maxShift = Math.max(0, boxW * 0.5 - Math.round(24 * UI_SCALE));
        const minX = -halfW + boxW * 0.5 + FarmHUD.TIP_EDGE_PAD;
        const maxX = halfW - boxW * 0.5 - FarmHUD.TIP_EDGE_PAD;
        const tipX = Math.min(maxX, Math.max(minX, anchorX));
        // Pointer stays aimed at the slot; keep it on the bubble underside.
        const tailX = Math.max(-maxShift, Math.min(maxShift, anchorX - tipX));

        this._tipHit = { w: boxW, h: boxH, tail, tailX };
        this._tip.getComponent(UITransform)?.setContentSize(boxW, boxH + tail);
        this._tip.getChildByName('Bubble')?.getComponent(UITransform)?.setContentSize(boxW, boxH + tail);

        const textW = boxW - Math.round(36 * UI_SCALE);
        this._tipTitle!.node.getComponent(UITransform)?.setContentSize(textW, Math.round(40 * UI_SCALE));
        this._tipTitle!.node.setPosition(0, Math.round(28 * UI_SCALE), 0);
        this._tipDesc!.node.getComponent(UITransform)?.setContentSize(textW, Math.round(56 * UI_SCALE));
        this._tipDesc!.node.setPosition(0, Math.round(-22 * UI_SCALE), 0);

        this.drawTipBubble(boxW, boxH, tail, tailX);

        // Tip origin = bubble center; pointer tip sits above the slot with air gap.
        const tipY = barPos.y + SLOT * 0.5 + boxH * 0.5 + tail + TIP_SLOT_GAP;
        this._tip.setPosition(tipX, tipY, 0);
        this._tip.active = true;
        this._tipHideAt = Date.now() + TIP_HIDE_SEC * 1000;
    }

    private hideTip() {
        if (this._tip?.isValid) this._tip.active = false;
        this._tipHideAt = 0;
    }

    /** Cream speech bubble + bottom pointer (text-only, no icon). `tailX` shifts pointer for edge clamp. */
    private drawTipBubble(w: number, h: number, tail: number, tailX = 0) {
        const g = this._tipGfx!;
        g.clear();
        const x0 = -w * 0.5;
        const y0 = -h * 0.5;
        const r = Math.round(18 * UI_SCALE);
        const fill = new Color(253, 251, 245, 255);
        const stroke = new Color(36, 34, 30, 255);
        const tw = Math.round(13 * UI_SCALE);

        g.fillColor = fill;
        g.roundRect(x0, y0, w, h, r);
        g.fill();
        g.moveTo(tailX - tw, y0 + 1);
        g.lineTo(tailX, y0 - tail);
        g.lineTo(tailX + tw, y0 + 1);
        g.close();
        g.fill();

        g.strokeColor = stroke;
        g.lineWidth = Math.round(3 * UI_SCALE);
        g.roundRect(x0, y0, w, h, r);
        g.stroke();
        // Cover bottom stroke where the pointer attaches.
        g.fillColor = fill;
        g.rect(tailX - tw + 1, y0 - Math.round(3 * UI_SCALE), (tw - 1) * 2, Math.round(8 * UI_SCALE));
        g.fill();
        g.strokeColor = stroke;
        g.moveTo(tailX - tw, y0);
        g.lineTo(tailX, y0 - tail);
        g.lineTo(tailX + tw, y0);
        g.stroke();
    }

    private refreshSelection() {
        const cur = this.farm?.tool ?? 'hoe';
        const glowSize = GLOW_HALF * 2;
        for (const s of this._slots) {
            s.glow.clear();
            if (s.tool && s.tool === cur) {
                s.glow.strokeColor = new Color(255, 220, 80, 255);
                s.glow.lineWidth = Math.round(6 * UI_SCALE);
                s.glow.roundRect(-GLOW_HALF, -GLOW_HALF, glowSize, glowSize, Math.round(12 * UI_SCALE));
                s.glow.stroke();
            }
        }
    }

    private toDesignLocal(uiX: number, uiY: number) {
        // Match canvas content size (portrait visible frame), same as FarmSystem.uiToWorld.
        const canvasUi = this.node.getComponent(UITransform);
        const vis = view.getVisibleSize();
        const hw = (canvasUi?.contentSize.width || vis.width) * 0.5;
        const hh = (canvasUi?.contentSize.height || vis.height) * 0.5;
        return { x: uiX - hw, y: uiY - hh };
    }

    /** Tap anywhere on the tip bubble (incl. pointer) to dismiss. */
    private hitTip(uiX: number, uiY: number): boolean {
        if (!this._tip?.isValid || !this._tip.active) return false;
        const { x, y } = this.toDesignLocal(uiX, uiY);
        const tipPos = this._tip.position;
        const lx = x - tipPos.x;
        const ly = y - tipPos.y;
        const { w, h, tail, tailX } = this._tipHit;
        if (Math.abs(lx) <= w * 0.5 && Math.abs(ly) <= h * 0.5) return true;
        // Pointer triangle under the bubble (may be offset when clamped to screen edges).
        return Math.abs(lx - tailX) <= Math.round(16 * UI_SCALE) && ly < -h * 0.5 && ly >= -h * 0.5 - tail;
    }

    private hitHotbar(uiX: number, uiY: number): boolean {
        if (!this._bar?.isValid) return false;
        const { x, y } = this.toDesignLocal(uiX, uiY);
        const barPos = this._bar.position;
        for (const s of this._slots) {
            const sx = barPos.x + s.root.position.x;
            const sy = barPos.y + s.root.position.y;
            if (Math.abs(x - sx) < SLOT * 0.5 && Math.abs(y - sy) < SLOT * 0.55) {
                if (s.tool) {
                    this.farm?.setTool(s.tool);
                    this.refreshSelection();
                    this.showTip(s.tool, s.root.position.x);
                } else {
                    this.hideTip();
                }
                return true;
            }
        }
        // Tap on bar background still counts as UI (don't hoe the world under it)
        if (Math.abs(y - barPos.y) < SLOT * 0.75 && Math.abs(x - barPos.x) < BAR_BG_W * 0.5) {
            this.hideTip();
            return true;
        }
        return false;
    }

    private onKey(e: EventKeyboard) {
        const pick = (tool: FarmTool) => {
            this.farm?.setTool(tool);
            const slot = this._slots.find((s) => s.tool === tool);
            if (slot) this.showTip(tool, slot.root.position.x);
        };
        if (e.keyCode === KeyCode.DIGIT_1 || e.keyCode === KeyCode.NUM_1) pick('hoe');
        if (e.keyCode === KeyCode.DIGIT_2 || e.keyCode === KeyCode.NUM_2) pick('seeds');
        if (e.keyCode === KeyCode.DIGIT_3 || e.keyCode === KeyCode.NUM_3) pick('can');
        if (e.keyCode === KeyCode.DIGIT_4 || e.keyCode === KeyCode.NUM_4) pick('axe');
        // Desktop fallback: Space uses facing / underfoot tile
        if (e.keyCode === KeyCode.SPACE || e.keyCode === KeyCode.KEY_E) this.farm?.tryAct();
    }
}
