import {
    _decorator,
    Color,
    Component,
    EventKeyboard,
    Graphics,
    Input,
    KeyCode,
    Label,
    Node,
    UITransform,
    input,
    view,
} from 'cc';
import { FarmInfoBoard } from './FarmInfoBoard';
import { InputBridge } from './InputBridge';
import { applyUiFont, loadUiFont, styleUiLabel } from './UiFont';

const { ccclass } = _decorator;

type GmBtn = {
    node: Node;
    action: () => void;
};

/**
 * Dev / GM overlay for scrubbing the farm clock.
 * Toggle: F1 or ` · Esc closes · small GM chip stays on-screen.
 */
@ccclass('GmPanel')
export class GmPanel extends Component {
    infoBoard: FarmInfoBoard | null = null;

    private _open = false;
    private _prevBlocking = false;
    private _chip: Node | null = null;
    private _root: Node | null = null;
    private _clockLab: Label | null = null;
    private _dateLab: Label | null = null;
    private _pauseLab: Label | null = null;
    private _btns: GmBtn[] = [];
    private _chipHit = { x: 0, y: 0, hw: 0, hh: 0 };

    onLoad() {
        InputBridge.gmUiHit = (x, y) => this.hitChip(x, y) || this._open;
        input.on(Input.EventType.KEY_DOWN, this.onKey, this);
        this.buildChip();
        loadUiFont().then((font) => {
            if (!font) return;
            const title = this._chip?.getChildByName('Label')?.getComponent(Label);
            if (title) applyUiFont(title);
            if (this._clockLab) applyUiFont(this._clockLab);
            if (this._dateLab) applyUiFont(this._dateLab);
            if (this._pauseLab) applyUiFont(this._pauseLab);
        });
    }

    onDestroy() {
        if (InputBridge.gmUiHit) InputBridge.gmUiHit = null;
        input.off(Input.EventType.KEY_DOWN, this.onKey, this);
        if (this._open) InputBridge.uiBlocking = this._prevBlocking;
        this._root?.destroy();
        this._chip?.destroy();
    }

    get isOpen(): boolean {
        return this._open;
    }

    setInfoBoard(info: FarmInfoBoard | null) {
        this.infoBoard = info;
        if (this._open) this.refreshLabels();
    }

    toggle() {
        this.setOpen(!this._open);
    }

    setOpen(open: boolean) {
        if (open === this._open) {
            if (open) this.refreshLabels();
            return;
        }
        this._open = open;
        if (open) {
            this._prevBlocking = InputBridge.uiBlocking;
            InputBridge.uiBlocking = true;
            InputBridge.clear();
            this.buildPanel();
            this.refreshLabels();
        } else {
            InputBridge.uiBlocking = this._prevBlocking;
            if (this._root?.isValid) this._root.destroy();
            this._root = null;
            this._clockLab = null;
            this._dateLab = null;
            this._pauseLab = null;
            this._btns = [];
        }
        if (this._chip) this._chip.active = !open;
    }

    /** UI coords origin bottom-left. Returns true if consumed. */
    handleTap(uiX: number, uiY: number): boolean {
        if (!this._open) {
            if (this.hitChip(uiX, uiY)) {
                this.setOpen(true);
                return true;
            }
            return false;
        }
        const local = this.uiToCanvasLocal(uiX, uiY);
        for (const b of this._btns) {
            if (this.hitNode(b.node, local.x, local.y)) {
                b.action();
                this.refreshLabels();
                return true;
            }
        }
        // Dimmer swallows the rest.
        return true;
    }

    update() {
        if (this._open) this.refreshLabels();
    }

    private onKey = (e: EventKeyboard) => {
        if (e.keyCode === KeyCode.F1 || e.keyCode === KeyCode.BACK_QUOTE) {
            this.toggle();
            return;
        }
        if (e.keyCode === KeyCode.ESCAPE && this._open) {
            this.setOpen(false);
        }
    };

    private buildChip() {
        const canvas = this.node;
        const old = canvas.getChildByName('GmChip');
        if (old) old.destroy();

        const chip = new Node('GmChip');
        chip.layer = canvas.layer;
        chip.setParent(canvas);
        chip.setSiblingIndex(canvas.children.length - 1);
        const w = 72;
        const h = 44;
        const { halfW, halfH } = this.canvasHalf();
        // Top-left, clear of the info board.
        const x = -halfW + 48;
        const y = halfH - 56;
        chip.setPosition(x, y, 0);
        chip.addComponent(UITransform).setContentSize(w, h);
        const g = chip.addComponent(Graphics);
        g.fillColor = new Color(54, 40, 28, 210);
        g.roundRect(-w * 0.5, -h * 0.5, w, h, 10);
        g.fill();
        g.strokeColor = new Color(232, 198, 140, 230);
        g.lineWidth = 3;
        g.roundRect(-w * 0.5, -h * 0.5, w, h, 10);
        g.stroke();

        const labN = new Node('Label');
        labN.layer = canvas.layer;
        labN.setParent(chip);
        labN.addComponent(UITransform).setContentSize(w, h);
        const lab = labN.addComponent(Label);
        lab.string = 'GM';
        lab.horizontalAlign = Label.HorizontalAlign.CENTER;
        lab.verticalAlign = Label.VerticalAlign.CENTER;
        styleUiLabel(lab, {
            size: 22,
            color: new Color(255, 236, 180, 255),
            outline: true,
            outlineWidth: 3,
        });

        this._chip = chip;
        this._chipHit = { x, y, hw: w * 0.5 + 8, hh: h * 0.5 + 8 };
    }

    private buildPanel() {
        const canvas = this.node;
        const old = canvas.getChildByName('GmPanel');
        if (old) old.destroy();
        this._btns = [];

        const root = new Node('GmPanel');
        root.layer = canvas.layer;
        root.setParent(canvas);
        root.setSiblingIndex(canvas.children.length - 1);
        const vis = view.getVisibleSize();
        root.addComponent(UITransform).setContentSize(vis.width, vis.height);
        this._root = root;

        const dim = new Node('Dim');
        dim.layer = root.layer;
        dim.setParent(root);
        dim.addComponent(UITransform).setContentSize(vis.width * 2, vis.height * 2);
        const dimG = dim.addComponent(Graphics);
        dimG.fillColor = new Color(0, 0, 0, 150);
        dimG.rect(-vis.width, -vis.height, vis.width * 2, vis.height * 2);
        dimG.fill();

        const panelW = 560;
        const panelH = 520;
        const panel = new Node('Panel');
        panel.layer = root.layer;
        panel.setParent(root);
        panel.setPosition(0, 20, 0);
        panel.addComponent(UITransform).setContentSize(panelW, panelH);

        const chrome = panel.addComponent(Graphics);
        this.drawChrome(chrome, panelW, panelH);

        const titleN = new Node('Title');
        titleN.layer = root.layer;
        titleN.setParent(panel);
        titleN.setPosition(0, panelH * 0.5 - 40, 0);
        titleN.addComponent(UITransform).setContentSize(panelW, 40);
        const title = titleN.addComponent(Label);
        title.string = 'GM · 游戏时间';
        title.horizontalAlign = Label.HorizontalAlign.CENTER;
        title.verticalAlign = Label.VerticalAlign.CENTER;
        styleUiLabel(title, {
            size: 30,
            color: new Color(255, 244, 214, 255),
            outline: true,
        });

        const clockN = new Node('Clock');
        clockN.layer = root.layer;
        clockN.setParent(panel);
        clockN.setPosition(0, panelH * 0.5 - 110, 0);
        clockN.addComponent(UITransform).setContentSize(panelW - 40, 64);
        const clock = clockN.addComponent(Label);
        clock.string = '06:00';
        clock.horizontalAlign = Label.HorizontalAlign.CENTER;
        clock.verticalAlign = Label.VerticalAlign.CENTER;
        styleUiLabel(clock, {
            size: 52,
            color: new Color(255, 236, 160, 255),
            outline: true,
            outlineWidth: 5,
        });
        this._clockLab = clock;

        const dateN = new Node('Date');
        dateN.layer = root.layer;
        dateN.setParent(panel);
        dateN.setPosition(0, panelH * 0.5 - 168, 0);
        dateN.addComponent(UITransform).setContentSize(panelW - 40, 36);
        const date = dateN.addComponent(Label);
        date.string = '';
        date.horizontalAlign = Label.HorizontalAlign.CENTER;
        date.verticalAlign = Label.VerticalAlign.CENTER;
        styleUiLabel(date, {
            size: 24,
            color: new Color(220, 200, 160, 255),
            outline: true,
        });
        this._dateLab = date;

        const hintN = new Node('Hint');
        hintN.layer = root.layer;
        hintN.setParent(panel);
        hintN.setPosition(0, -panelH * 0.5 + 28, 0);
        hintN.addComponent(UITransform).setContentSize(panelW - 24, 28);
        const hint = hintN.addComponent(Label);
        hint.string = 'F1 / ` 开关 · Esc 关闭';
        hint.horizontalAlign = Label.HorizontalAlign.CENTER;
        hint.verticalAlign = Label.VerticalAlign.CENTER;
        styleUiLabel(hint, {
            size: 18,
            color: new Color(180, 160, 120, 255),
            outline: false,
        });

        // Presets
        const presets: { label: string; h: number; m: number }[] = [
            { label: '清晨 6:00', h: 6, m: 0 },
            { label: '正午 12:00', h: 12, m: 0 },
            { label: '黄昏 18:00', h: 18, m: 0 },
            { label: '深夜 22:00', h: 22, m: 0 },
        ];
        const presetY = 70;
        const presetW = 118;
        const presetGap = 12;
        const presetTotal = presets.length * presetW + (presets.length - 1) * presetGap;
        presets.forEach((p, i) => {
            const x = -presetTotal * 0.5 + presetW * 0.5 + i * (presetW + presetGap);
            this.addBtn(panel, p.label, x, presetY, presetW, 48, () => {
                this.infoBoard?.setTime(p.h, p.m);
            });
        });

        // Nudge row
        const nudges: { label: string; fn: () => void }[] = [
            { label: '-1时', fn: () => this.infoBoard?.addMinutes(-60) },
            { label: '-10分', fn: () => this.infoBoard?.addMinutes(-10) },
            { label: '+10分', fn: () => this.infoBoard?.addMinutes(10) },
            { label: '+1时', fn: () => this.infoBoard?.addMinutes(60) },
        ];
        const nudgeY = -10;
        const nudgeW = 110;
        const nudgeGap = 14;
        const nudgeTotal = nudges.length * nudgeW + (nudges.length - 1) * nudgeGap;
        nudges.forEach((n, i) => {
            const x = -nudgeTotal * 0.5 + nudgeW * 0.5 + i * (nudgeW + nudgeGap);
            this.addBtn(panel, n.label, x, nudgeY, nudgeW, 48, n.fn);
        });

        // Day / pause / close
        const dayY = -90;
        this.addBtn(panel, '-1日', -180, dayY, 100, 48, () => this.infoBoard?.addMinutes(-20 * 60));
        this.addBtn(panel, '+1日', -60, dayY, 100, 48, () => this.infoBoard?.addMinutes(20 * 60));

        const pauseBtn = this.addBtn(panel, '暂停', 80, dayY, 110, 48, () => {
            const board = this.infoBoard;
            if (!board) return;
            board.setPaused(!board.paused);
        });
        this._pauseLab = pauseBtn.getChildByName('Label')?.getComponent(Label) ?? null;

        this.addBtn(panel, '关闭', 200, dayY, 100, 48, () => this.setOpen(false), true);

        loadUiFont().then((font) => {
            if (!font || !root.isValid) return;
            for (const lab of root.getComponentsInChildren(Label)) applyUiFont(lab);
        });
    }

    private addBtn(
        parent: Node,
        text: string,
        x: number,
        y: number,
        w: number,
        h: number,
        action: () => void,
        danger = false,
    ): Node {
        const btn = new Node(`Btn_${text}`);
        btn.layer = parent.layer;
        btn.setParent(parent);
        btn.setPosition(x, y, 0);
        btn.addComponent(UITransform).setContentSize(w, h);
        const g = btn.addComponent(Graphics);
        const fill = danger ? new Color(160, 72, 48, 255) : new Color(176, 110, 48, 255);
        const inner = danger ? new Color(210, 120, 80, 255) : new Color(232, 198, 140, 255);
        g.fillColor = fill;
        g.roundRect(-w * 0.5, -h * 0.5, w, h, 12);
        g.fill();
        g.fillColor = inner;
        g.roundRect(-w * 0.5 + 4, -h * 0.5 + 4, w - 8, h - 8, 9);
        g.fill();
        g.strokeColor = new Color(54, 30, 14, 255);
        g.lineWidth = 3;
        g.roundRect(-w * 0.5, -h * 0.5, w, h, 12);
        g.stroke();

        const labN = new Node('Label');
        labN.layer = parent.layer;
        labN.setParent(btn);
        labN.addComponent(UITransform).setContentSize(w, h);
        const lab = labN.addComponent(Label);
        lab.string = text;
        lab.horizontalAlign = Label.HorizontalAlign.CENTER;
        lab.verticalAlign = Label.VerticalAlign.CENTER;
        styleUiLabel(lab, {
            size: 22,
            color: new Color(48, 32, 18, 255),
            outline: false,
        });

        this._btns.push({ node: btn, action });
        return btn;
    }

    private drawChrome(g: Graphics, w: number, h: number) {
        const x0 = -w * 0.5;
        const y0 = -h * 0.5;
        g.fillColor = new Color(176, 110, 48, 255);
        g.roundRect(x0, y0, w, h, 18);
        g.fill();
        g.fillColor = new Color(120, 72, 32, 255);
        g.roundRect(x0 + 6, y0 + 6, w - 12, h - 12, 14);
        g.fill();
        g.fillColor = new Color(232, 198, 140, 255);
        g.roundRect(x0 + 14, y0 + 14, w - 28, h - 28, 10);
        g.fill();
        g.fillColor = new Color(246, 226, 180, 255);
        g.roundRect(x0 + 20, y0 + 20, w - 40, h - 40, 8);
        g.fill();
    }

    private refreshLabels() {
        const c = this.infoBoard?.getClock();
        if (!c || !this._clockLab) return;
        this._clockLab.string = `${String(c.hour).padStart(2, '0')}:${String(c.minute).padStart(2, '0')}`;
        if (this._dateLab) {
            const season = this.infoBoard?.seasonName(c.season) ?? '';
            const wd = this.infoBoard?.weekdayName(c.weekday) ?? '';
            this._dateLab.string = `${season} ${c.day}日 ${wd}${c.paused ? '  · 已暂停' : ''}`;
        }
        if (this._pauseLab) this._pauseLab.string = c.paused ? '继续' : '暂停';
    }

    private canvasHalf(): { halfW: number; halfH: number } {
        const canvasUi = this.node.getComponent(UITransform);
        const vis = view.getVisibleSize();
        return {
            halfW: (canvasUi?.contentSize.width || vis.width) * 0.5,
            halfH: (canvasUi?.contentSize.height || vis.height) * 0.5,
        };
    }

    private uiToCanvasLocal(uiX: number, uiY: number): { x: number; y: number } {
        const { halfW, halfH } = this.canvasHalf();
        return { x: uiX - halfW, y: uiY - halfH };
    }

    private hitChip(uiX: number, uiY: number): boolean {
        if (!this._chip?.active) return false;
        const local = this.uiToCanvasLocal(uiX, uiY);
        const { x, y, hw, hh } = this._chipHit;
        return local.x >= x - hw && local.x <= x + hw && local.y >= y - hh && local.y <= y + hh;
    }

    private hitNode(n: Node | null, lx: number, ly: number): boolean {
        if (!n?.isValid || !n.active || !this._root) return false;
        const ut = n.getComponent(UITransform);
        if (!ut) return false;
        // Panel is at (0, 20); buttons are children of panel.
        const panel = this._root.getChildByName('Panel');
        const px = (panel?.position.x ?? 0) + n.position.x;
        const py = (panel?.position.y ?? 0) + n.position.y;
        const hw = ut.contentSize.width * 0.5 + 6;
        const hh = ut.contentSize.height * 0.5 + 6;
        return lx >= px - hw && lx <= px + hw && ly >= py - hh && ly <= py + hh;
    }
}
