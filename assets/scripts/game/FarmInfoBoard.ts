import {
    _decorator,
    Color,
    Component,
    Label,
    Node,
    UITransform,
    Vec3,
    tween,
    view,
} from 'cc';
import { FarmSystem } from './FarmSystem';
import { InputBridge } from './InputBridge';
import { applyNightWash } from './NightWash';
import { DESIGN_H, DESIGN_W } from './PortraitFit';
import { applyUiFont, loadUiFont, styleUiLabel } from './UiFont';

const { ccclass, property } = _decorator;

/** Short weekdays — fits the narrow date slot on mobile. */
const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
const SEASONS = ['春', '夏', '秋', '冬'];
/** Real seconds per in-game minute. */
const SEC_PER_GAME_MIN = 0.7;
/** In-game day length (starts 06:00 → ends ~02:00). */
const DAY_MINUTES = 20 * 60;

export type GameClock = {
    day: number;
    season: number;
    weekday: number;
    hour: number;
    minute: number;
    paused: boolean;
};

/**
 * Top-right status board. Layout lives in `assets/prefabs/ui/FarmInfoBoard.prefab`
 * — this script only binds data / input.
 */
@ccclass('FarmInfoBoard')
export class FarmInfoBoard extends Component {
    @property(FarmSystem)
    farm: FarmSystem | null = null;

    @property(Label)
    dateLab: Label | null = null;

    @property(Label)
    timeLab: Label | null = null;

    @property(Label)
    goldLab: Label | null = null;

    @property(Label)
    toastLab: Label | null = null;

    @property(Node)
    needle: Node | null = null;

    private _toastHideAt = 0;
    private _day = 2;
    private _season = 0;
    private _weekday = 2;
    /** Minutes since 06:00 (game day ≈ 20h → 1200 min). */
    private _minutes = 0;
    private _acc = 0;
    private _paused = false;
    private _goldPulseGen = 0;

    private _nightIntensity = -1;

    onLoad() {
        InputBridge.infoBoardHit = (x, y) => this.containsUi(x, y);
        this.resolveRefs();
        view.on('canvas-resize', this.onCanvasResize, this);
        loadUiFont().then((font) => {
            if (!font) return;
            if (this.dateLab) applyUiFont(this.dateLab);
            if (this.timeLab) applyUiFont(this.timeLab);
            if (this.goldLab) applyUiFont(this.goldLab);
            if (this.toastLab) applyUiFont(this.toastLab);
        });
        // Size/layout only — keep prefab fill + cream outline colors.
        // Fonts must fit cream slots (date≈152×39, time≈152×43, gold bar 320×88).
        if (this.dateLab) {
            this.dateLab.fontSize = 28;
            this.dateLab.lineHeight = 34;
            this.dateLab.overflow = Label.Overflow.SHRINK;
            this.dateLab.node.getComponent(UITransform)?.setContentSize(152, 39);
        }
        if (this.timeLab) {
            this.timeLab.fontSize = 30;
            this.timeLab.lineHeight = 36;
            this.timeLab.overflow = Label.Overflow.SHRINK;
            this.timeLab.node.getComponent(UITransform)?.setContentSize(152, 43);
        }
        if (this.goldLab) {
            this.goldLab.fontSize = 30;
            this.goldLab.lineHeight = 36;
            this.goldLab.horizontalAlign = Label.HorizontalAlign.CENTER;
            this.goldLab.verticalAlign = Label.VerticalAlign.CENTER;
            this.goldLab.overflow = Label.Overflow.NONE;
            this.goldLab.isBold = false;
            this.goldLab.isItalic = false;
            this.goldLab.node.setRotationFromEuler(0, 0, 0);
            this.goldLab.node.setScale(1, 1, 1);
            this.goldLab.node.getComponent(UITransform)?.setContentSize(180, 52);
            this.goldLab.node.setPosition(48, 0, 0);
        }
        if (this.toastLab) {
            styleUiLabel(this.toastLab, {
                size: this.toastLab.fontSize || 28,
                color: new Color(255, 244, 214, 255),
                outline: true,
                outlineWidth: 4,
            });
            this.toastLab.node.active = false;
        }
    }

    onDestroy() {
        if (InputBridge.infoBoardHit) InputBridge.infoBoardHit = null;
        view.off('canvas-resize', this.onCanvasResize, this);
    }

    start() {
        this.farm?.onGoldChange(() => this.refreshGold());
        this.refreshAll();
    }

    private onCanvasResize = () => {
        this._nightIntensity = -1;
        this.refreshClock();
    };

    update(dt: number) {
        if (!this._paused) {
            this._acc += dt;
            while (this._acc >= SEC_PER_GAME_MIN) {
                this._acc -= SEC_PER_GAME_MIN;
                this.advanceMinute();
            }
        }
        if (this.toastLab?.node.active && this._toastHideAt > 0 && Date.now() >= this._toastHideAt) {
            this.toastLab.node.active = false;
        }
    }

    /** Snapshot of calendar + wall clock (display hour wraps 0–23). */
    getClock(): GameClock {
        const hour = (6 + Math.floor(this._minutes / 60)) % 24;
        const minute = this._minutes % 60;
        return {
            day: this._day,
            season: this._season,
            weekday: this._weekday,
            hour,
            minute,
            paused: this._paused,
        };
    }

    get paused(): boolean {
        return this._paused;
    }

    setPaused(paused: boolean) {
        this._paused = !!paused;
        if (paused) this._acc = 0;
    }

    /** Set display hour:minute within the 20h game day (06:00→01:59). */
    setTime(hour: number, minute = 0) {
        const h = ((Math.floor(hour) % 24) + 24) % 24;
        const m = Math.max(0, Math.min(59, Math.floor(minute)));
        let since6 = ((h - 6 + 24) % 24) * 60 + m;
        if (since6 >= DAY_MINUTES) since6 = DAY_MINUTES - 1;
        this._minutes = since6;
        this._acc = 0;
        this._nightIntensity = -1;
        this.refreshClock();
    }

    /** Nudge clock by signed in-game minutes (can roll day / season). */
    addMinutes(delta: number) {
        let d = Math.trunc(delta);
        if (!d) return;
        this._acc = 0;
        if (d > 0) {
            while (d-- > 0) this.advanceMinute();
            return;
        }
        while (d++ < 0) this.rewindMinute();
    }

    setDay(day: number, weekday?: number, season?: number) {
        this._day = Math.max(1, Math.min(28, Math.floor(day)));
        if (weekday !== undefined) this._weekday = ((Math.floor(weekday) % 7) + 7) % 7;
        if (season !== undefined) this._season = ((Math.floor(season) % 4) + 4) % 4;
        this._nightIntensity = -1;
        this.refreshClock();
    }

    /** Season label for UI (春夏秋冬). */
    seasonName(season = this._season): string {
        return SEASONS[((season % 4) + 4) % 4] ?? '春';
    }

    weekdayName(weekday = this._weekday): string {
        return WEEKDAYS[((weekday % 7) + 7) % 7] ?? '周日';
    }

    /** UI coords: origin bottom-left. Returns true if consumed. */
    handleTap(uiX: number, uiY: number): boolean {
        if (!this.node.active) return false;
        const local = this.uiToLocal(uiX, uiY);
        if (!local) return false;
        return this.hitRoot(local.x, local.y);
    }

    containsUi(uiX: number, uiY: number): boolean {
        if (!this.node.active) return false;
        const local = this.uiToLocal(uiX, uiY);
        if (!local) return false;
        return this.hitRoot(local.x, local.y);
    }

    private resolveRefs() {
        if (!this.dateLab) this.dateLab = this.findLabel(['Panel', 'Date']);
        if (!this.timeLab) this.timeLab = this.findLabel(['Panel', 'Time']);
        if (!this.goldLab) this.goldLab = this.findLabel(['Gold', 'GoldVal']);
        if (!this.toastLab) this.toastLab = this.findLabel(['Toast']);
        if (!this.needle) this.needle = this.findNode(['Panel', 'Needle']);
        // Retired zoom (−/+) and board quest (!) — keep nodes out of the tree.
        for (const name of ['BtnMinus', 'BtnPlus', 'BtnQuest']) {
            const btn = this.node.getChildByName(name);
            if (btn?.isValid) btn.destroy();
        }
    }

    private findNode(path: string[]): Node | null {
        let n: Node | null = this.node;
        for (const name of path) {
            n = n?.getChildByName(name) ?? null;
            if (!n) return null;
        }
        return n;
    }

    private findLabel(path: string[]): Label | null {
        return this.findNode(path)?.getComponent(Label) ?? null;
    }

    private advanceMinute() {
        this._minutes += 1;
        if (this._minutes >= DAY_MINUTES) {
            this._minutes = 0;
            this._day += 1;
            this._weekday = (this._weekday + 1) % 7;
            if (this._day > 28) {
                this._day = 1;
                this._season = (this._season + 1) % 4;
            }
        }
        this.refreshClock();
    }

    private rewindMinute() {
        this._minutes -= 1;
        if (this._minutes < 0) {
            this._minutes = DAY_MINUTES - 1;
            this._day -= 1;
            this._weekday = (this._weekday + 6) % 7;
            if (this._day < 1) {
                this._day = 28;
                this._season = (this._season + 3) % 4;
            }
        }
        this.refreshClock();
    }

    private refreshAll() {
        this.refreshClock();
        this.refreshGold();
    }

    private refreshClock() {
        const hour = (6 + Math.floor(this._minutes / 60)) % 24;
        const min = this._minutes % 60;
        if (this.dateLab) this.dateLab.string = `${this._day}日 ${WEEKDAYS[this._weekday]}`;
        if (this.timeLab) {
            this.timeLab.string = `${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
        }
        if (this.needle) {
            const t = this._minutes / DAY_MINUTES;
            const angle = 200 - t * 280;
            this.needle.setRotationFromEuler(0, 0, angle);
        }
        this.refreshNightTint(hour, min);
    }

    /** 0 = full day, 1 = darkest night. Day clear → dusk from 17:00 → deep after 20:00. */
    private nightIntensity(hour: number, min: number): number {
        const t = hour + min / 60;
        if (t >= 6 && t < 17) return 0;
        // Ease-in dusk so ~18:00 already reads as evening.
        if (t >= 17 && t < 20) {
            const u = (t - 17) / 3;
            return Math.min(1, 0.25 + u * 0.75);
        }
        if (t >= 20) return Math.min(1, 0.9 + ((t - 20) / 4) * 0.1);
        if (t < 2) return 1;
        if (t < 6) return Math.max(0, 1 - (t - 2) / 4);
        return 0;
    }

    private refreshNightTint(hour: number, min: number) {
        const intensity = this.nightIntensity(hour, min);
        // Quantize so we don't rewrite opacity every tiny float jitter.
        const key = Math.round(intensity * 100);
        if (key === this._nightIntensity) return;
        this._nightIntensity = key;

        const { halfW, halfH } = this.canvasHalf();
        applyNightWash(this.node.parent, intensity, halfW * 2, halfH * 2);
    }

    private refreshGold() {
        if (this.goldLab) this.goldLab.string = String(this.farm?.gold ?? 0);
    }

    /**
     * Canvas-local center of the round G coin (left well on the gold bar).
     * Not the cream digit field — claim FX lands on the G mark itself.
     */
    goldFlyTarget(): { x: number; y: number } {
        const { halfW, halfH } = this.canvasHalf();
        // Board top-right inset + Gold center + left G well (~barH square).
        const fallback = { x: halfW - 396, y: halfH - 296 };

        const gold = this.goldNode();
        const canvas = this.node.parent;
        const canvasUt = canvas?.getComponent(UITransform);
        const goldUt = gold?.getComponent(UITransform);
        if (!gold?.isValid || !canvasUt || !goldUt) return fallback;

        const barW = goldUt.contentSize.width || 320;
        const barH = goldUt.contentSize.height || 88;
        // ui-info-gold: circular G coin is the left height×height well.
        const gLocal = new Vec3(-barW * 0.5 + barH * 0.5, 0, 0);
        const world = goldUt.convertToWorldSpaceAR(gLocal);
        const local = canvasUt.convertToNodeSpaceAR(world);
        return { x: local.x, y: local.y };
    }

    /** Brief pop when quest gold lands on the top-right bar. */
    pulseGold() {
        const gold = this.goldNode();
        if (!gold?.isValid) return;
        const gen = ++this._goldPulseGen;
        tween(gold)
            .to(0.08, { scale: new Vec3(1.12, 1.12, 1) }, { easing: 'sineOut' })
            .to(0.12, { scale: new Vec3(1, 1, 1) }, { easing: 'sineIn' })
            .call(() => {
                if (gen !== this._goldPulseGen || !gold.isValid) return;
                gold.setScale(1, 1, 1);
            })
            .start();
    }

    private goldNode(): Node | null {
        return this.goldLab?.node.parent ?? this.node.getChildByName('Gold');
    }

    /** Mid-screen toast retired — bottom FarmActionHint / guide already cover tips. */
    showToast(_msg: string) {
        if (this.toastLab) this.toastLab.node.active = false;
    }

    private canvasHalf(): { halfW: number; halfH: number } {
        const parent = this.node.parent;
        const canvasUi = parent?.getComponent(UITransform);
        const vis = view.getVisibleSize();
        return {
            halfW: (canvasUi?.contentSize.width || vis.width || DESIGN_W) * 0.5,
            halfH: (canvasUi?.contentSize.height || vis.height || DESIGN_H) * 0.5,
        };
    }

    /** UI bottom-left → this.node local (anchor space). */
    private uiToLocal(uiX: number, uiY: number): { x: number; y: number } | null {
        const { halfW, halfH } = this.canvasHalf();
        return {
            x: uiX - halfW - this.node.position.x,
            y: uiY - halfH - this.node.position.y,
        };
    }

    private hitRoot(lx: number, ly: number): boolean {
        const ut = this.node.getComponent(UITransform);
        if (!ut) return false;
        const w = ut.contentSize.width;
        const h = ut.contentSize.height;
        const ax = ut.anchorPoint.x;
        const ay = ut.anchorPoint.y;
        const left = -w * ax;
        const right = w * (1 - ax);
        const bottom = -h * ay;
        const top = h * (1 - ay);
        return lx >= left && lx <= right && ly >= bottom && ly <= top;
    }
}
