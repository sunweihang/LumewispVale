import {
    _decorator,
    Color,
    Component,
    Label,
    Node,
    UITransform,
    view,
} from 'cc';
import { CameraFollow } from './CameraFollow';
import { FarmSystem } from './FarmSystem';
import { InputBridge } from './InputBridge';
import { applyNightWash } from './NightWash';
import { DESIGN_H, DESIGN_W } from './PortraitFit';
import { applyUiFont, loadUiFont, styleUiLabel } from './UiFont';

const { ccclass, property } = _decorator;

/** Short weekdays — fits the narrow date slot on mobile. */
const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
/** Real seconds per in-game minute. */
const SEC_PER_GAME_MIN = 0.7;

/**
 * Top-right status board. Layout lives in `assets/prefabs/ui/FarmInfoBoard.prefab`
 * — this script only binds data / input.
 */
@ccclass('FarmInfoBoard')
export class FarmInfoBoard extends Component {
    @property(FarmSystem)
    farm: FarmSystem | null = null;

    @property(CameraFollow)
    cameraFollow: CameraFollow | null = null;

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

    @property(Node)
    btnMinus: Node | null = null;

    @property(Node)
    btnPlus: Node | null = null;

    @property(Node)
    btnQuest: Node | null = null;

    private _toastHideAt = 0;
    private _day = 2;
    private _season = 0;
    private _weekday = 2;
    /** Minutes since 06:00 (game day ≈ 20h → 1200 min). */
    private _minutes = (18 - 6) * 60 + 10;
    private _acc = 0;

    private _baseWorldScale = 1;
    private _zoom = 1;
    private readonly _zoomMin = 0.85;
    private readonly _zoomMax = 1.35;
    private readonly _zoomStep = 0.1;

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
        const world = this.cameraFollow?.world;
        if (world) this._baseWorldScale = world.scale.x;
        this.farm?.onGoldChange(() => this.refreshGold());
        this.refreshAll();
    }

    private onCanvasResize = () => {
        this._nightIntensity = -1;
        this.refreshClock();
    };

    update(dt: number) {
        this._acc += dt;
        while (this._acc >= SEC_PER_GAME_MIN) {
            this._acc -= SEC_PER_GAME_MIN;
            this.advanceMinute();
        }
        if (this.toastLab?.node.active && this._toastHideAt > 0 && Date.now() >= this._toastHideAt) {
            this.toastLab.node.active = false;
        }
    }

    /** UI coords: origin bottom-left. Returns true if consumed. */
    handleTap(uiX: number, uiY: number): boolean {
        if (!this.node.active) return false;
        const local = this.uiToLocal(uiX, uiY);
        if (!local) return false;
        if (this.hitNode(this.btnMinus, local.x, local.y)) {
            this.nudgeZoom(-1);
            return true;
        }
        if (this.hitNode(this.btnPlus, local.x, local.y)) {
            this.nudgeZoom(1);
            return true;
        }
        if (this.hitNode(this.btnQuest, local.x, local.y)) {
            this.showToast('今日暂无新任务');
            return true;
        }
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
        if (!this.btnMinus) this.btnMinus = this.node.getChildByName('BtnMinus');
        if (!this.btnPlus) this.btnPlus = this.node.getChildByName('BtnPlus');
        if (!this.btnQuest) this.btnQuest = this.node.getChildByName('BtnQuest');
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
        if (this._minutes >= 20 * 60) {
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
            const t = this._minutes / (20 * 60);
            const angle = 200 - t * 280;
            this.needle.setRotationFromEuler(0, 0, angle);
        }
        this.refreshNightTint(hour, min);
    }

    /** 0 = full day, 1 = darkest night. Day clear → dusk from 17:00 → deep after 20:00. */
    private nightIntensity(hour: number, min: number): number {
        const t = hour + min / 60;
        if (t >= 6 && t < 17) return 0;
        // Ease-in dusk so ~18:00 already reads as evening (game starts ~18:10).
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

    private nudgeZoom(dir: number) {
        const world = this.cameraFollow?.world;
        if (!world) {
            this.showToast(dir > 0 ? '放大' : '缩小');
            return;
        }
        if (this._baseWorldScale <= 0) this._baseWorldScale = world.scale.x;
        this._zoom = Math.max(this._zoomMin, Math.min(this._zoomMax, this._zoom + dir * this._zoomStep));
        const s = this._baseWorldScale * this._zoom;
        world.setScale(s, s, 1);
        this.cameraFollow?.snap();
    }

    private showToast(msg: string) {
        if (!this.toastLab) return;
        this.toastLab.string = msg;
        this.toastLab.node.active = true;
        this._toastHideAt = Date.now() + 1600;
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

    private hitNode(n: Node | null, lx: number, ly: number): boolean {
        if (!n?.isValid || !n.active) return false;
        const ut = n.getComponent(UITransform);
        if (!ut) return false;
        const hw = ut.contentSize.width * 0.5;
        const hh = ut.contentSize.height * 0.5;
        const pad = 12;
        const px = n.position.x;
        const py = n.position.y;
        return lx >= px - hw - pad && lx <= px + hw + pad && ly >= py - hh - pad && ly <= py + hh + pad;
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
