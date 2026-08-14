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
import { ClockState, DAY_MINUTES, SEC_PER_GAME_MIN } from './DayRules';
import { FarmSystem } from './FarmSystem';
import { GameState } from './GameState';
import { InputBridge } from './InputBridge';
import { applyNightWash } from './NightWash';
import { DESIGN_H, DESIGN_W } from './PortraitFit';
import { applyUiFont, loadUiFont, styleUiLabel } from './UiFont';

const { ccclass, property } = _decorator;

/** Short weekdays — fits the narrow date slot on mobile. */
const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
const SEASONS = ['春', '夏', '秋', '冬'];

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

    @property(Label)
    staminaLab: Label | null = null;

    @property(Node)
    needle: Node | null = null;

    /** True while dialogue / shop / intro should freeze the clock. */
    clockHeld: (() => boolean) | null = null;
    /** 02:00 day-end — wired to DayCycle.passOut. */
    onDayEnd: (() => void) | null = null;
    /** GM +1 day — sleep without pass-out penalty. */
    onSkipDay: (() => void) | null = null;

    private _toastHideAt = 0;
    /** Pending toasts while one is on screen (recipe unlocks, claim hints…). */
    private _toastQueue: string[] = [];
    private _day = 2;
    private _season = 0;
    private _weekday = 2;
    /** Minutes since 06:00 (game day ≈ 20h → 1200 min). */
    private _minutes = 0;
    private _acc = 0;
    private _paused = false;
    private _dayEnding = false;
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
            if (this.staminaLab) applyUiFont(this.staminaLab);
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
            // Wider for "x N"; G coin stays in the left well of ui-info-gold.
            this.goldLab.node.getComponent(UITransform)?.setContentSize(200, 52);
            this.goldLab.node.setPosition(52, 0, 0);
        }
        this.ensureStaminaLab();
        if (this.toastLab) {
            styleUiLabel(this.toastLab, {
                size: 44,
                color: new Color(255, 244, 214, 255),
                outline: true,
                outlineWidth: 6,
            });
            this.toastLab.node.active = false;
        }
    }

    onDestroy() {
        if (InputBridge.infoBoardHit) InputBridge.infoBoardHit = null;
        view.off('canvas-resize', this.onCanvasResize, this);
    }

    start() {
        this.hydrateFromGameState();
        this.ensureStaminaLab();
        this.farm?.onGoldChange(() => this.refreshGold());
        this.refreshAll();
    }

    private onCanvasResize = () => {
        this._nightIntensity = -1;
        this.refreshClock();
    };

    update(dt: number) {
        if (!this._paused && !this.clockHeld?.()) {
            this._acc += dt;
            while (this._acc >= SEC_PER_GAME_MIN) {
                this._acc -= SEC_PER_GAME_MIN;
                this.advanceMinute();
            }
        }
        this.refreshStamina();
        if (this.toastLab?.node.active) {
            // Stay above TutorialGuide arrow / other canvas chrome while visible.
            this.pinToastFront();
            if (this._toastHideAt > 0 && Date.now() >= this._toastHideAt) {
                this.toastLab.node.active = false;
            }
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
        this.persistClock();
    }

    /** Overlay GameState clock onto the board (after travel / sleep). */
    applyClockState(c: ClockState) {
        this._day = c.day;
        this._season = c.season;
        this._weekday = c.weekday;
        this._minutes = Math.max(0, Math.min(DAY_MINUTES - 1, c.minutes | 0));
        this._paused = !!c.paused;
        this._dayEnding = false;
        this._acc = 0;
        this._nightIntensity = -1;
        this.refreshClock();
        this.persistClock();
    }

    refreshStamina() {
        if (this.staminaLab) {
            this.staminaLab.string = `体力 ${GameState.stamina}/${GameState.staminaMax}`;
        }
    }

    /** Set display hour:minute within the 20h game day (06:00→01:59). */
    setTime(hour: number, minute = 0) {
        const h = ((Math.floor(hour) % 24) + 24) % 24;
        const m = Math.max(0, Math.min(59, Math.floor(minute)));
        let since6 = ((h - 6 + 24) % 24) * 60 + m;
        if (since6 >= DAY_MINUTES) since6 = DAY_MINUTES - 1;
        this._minutes = since6;
        this._acc = 0;
        this._dayEnding = since6 >= DAY_MINUTES - 1;
        this._nightIntensity = -1;
        this.refreshClock();
        this.persistClock();
    }

    /** Nudge clock by signed in-game minutes (can roll day / season). */
    addMinutes(delta: number) {
        let d = Math.trunc(delta);
        if (!d) return;
        this._acc = 0;
        if (d > 0) {
            const remain = DAY_MINUTES - this._minutes;
            if (d >= remain && this.onSkipDay) {
                this.onSkipDay();
                return;
            }
            while (d-- > 0) this.advanceMinute();
            return;
        }
        while (d++ < 0) this.rewindMinute();
        this.persistClock();
    }

    setDay(day: number, weekday?: number, season?: number) {
        this._day = Math.max(1, Math.min(28, Math.floor(day)));
        if (weekday !== undefined) this._weekday = ((Math.floor(weekday) % 7) + 7) % 7;
        if (season !== undefined) this._season = ((Math.floor(season) % 4) + 4) % 4;
        this._nightIntensity = -1;
        this.refreshClock();
        this.persistClock();
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

    private hydrateFromGameState() {
        const c = GameState.clock;
        if (c) {
            this._day = c.day;
            this._season = c.season;
            this._weekday = c.weekday;
            this._minutes = Math.max(0, Math.min(DAY_MINUTES - 1, c.minutes | 0));
            this._paused = !!c.paused;
        } else {
            this.persistClock();
        }
    }

    private persistClock() {
        GameState.captureClock({
            day: this._day,
            season: this._season,
            weekday: this._weekday,
            minutes: this._minutes,
            paused: this._paused,
        });
    }

    private ensureStaminaLab() {
        const gold = this.goldNode();
        const parent = gold?.parent ?? this.node;
        let n = this.staminaLab?.node ?? parent.getChildByName('Stamina');
        if (!n?.isValid) {
            n = new Node('Stamina');
            n.layer = parent.layer;
            n.setParent(parent);
            n.addComponent(UITransform).setContentSize(280, 36);
            const lab = n.addComponent(Label);
            lab.horizontalAlign = Label.HorizontalAlign.RIGHT;
            lab.verticalAlign = Label.VerticalAlign.CENTER;
            lab.overflow = Label.Overflow.SHRINK;
            styleUiLabel(lab, {
                size: 26,
                color: new Color(255, 244, 214, 255),
                outline: true,
                outlineWidth: 4,
            });
            this.staminaLab = lab;
        } else if (!this.staminaLab) {
            this.staminaLab = n.getComponent(Label);
        }
        if (gold && n) {
            n.setPosition(gold.position.x, gold.position.y - 56, 0);
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
        if (this._minutes + 1 >= DAY_MINUTES) {
            this._minutes = DAY_MINUTES - 1;
            this.persistClock();
            if (this._dayEnding) return;
            this._dayEnding = true;
            this.onDayEnd?.();
            return;
        }
        this._dayEnding = false;
        this._minutes += 1;
        this.refreshClock();
        this.persistClock();
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
        this.refreshStamina();
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
        // Bar sprite already shows the G coin — label is "x N" only.
        if (this.goldLab) this.goldLab.string = `x ${this.farm?.gold ?? 0}`;
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

    /** Upper-screen toast (quest progress, claim hints, GM) — above guide/world. */
    showToast(msg: string) {
        if (!this.toastLab || !msg) return;
        const toast = this.toastLab.node;
        // Reparent to Canvas so we can sit above TutorialGuideRoot / characters.
        const canvas = this.node.parent;
        if (canvas?.isValid && toast.parent !== canvas) {
            toast.setParent(canvas, false);
        }
        styleUiLabel(this.toastLab, {
            size: 44,
            color: new Color(255, 244, 214, 255),
            outline: true,
            outlineWidth: 6,
        });
        this.toastLab.overflow = Label.Overflow.SHRINK;
        this.toastLab.string = msg;
        const { halfW, halfH } = this.canvasHalf();
        // Upper band (~78% up) — clear of hotbar / character / guide arrow.
        const uiY = halfH * 2 * 0.78;
        if (toast.parent === canvas) {
            toast.setPosition(0, uiY - halfH, 0);
        } else {
            const local = this.uiToLocal(halfW, uiY);
            if (local) toast.setPosition(local.x, local.y, 0);
        }
        const ut = toast.getComponent(UITransform);
        if (ut) ut.setContentSize(Math.min(720, halfW * 1.7), 56);
        this.pinToastFront();
        toast.active = true;
        this._toastHideAt = Date.now() + 1800;
    }

    private pinToastFront() {
        const toast = this.toastLab?.node;
        const parent = toast?.parent;
        if (!toast?.isValid || !parent?.isValid) return;
        toast.setSiblingIndex(parent.children.length - 1);
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
