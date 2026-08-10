import {
    _decorator,
    Color,
    Component,
    Graphics,
    Label,
    Node,
    Sprite,
    SpriteFrame,
    UIOpacity,
    UITransform,
    assetManager,
    tween,
    Tween,
    view,
} from 'cc';
import { DESIGN_W, portraitVisibleSize } from './PortraitFit';
import { applyUiFont, loadUiFont, styleUiLabel } from './UiFont';

const { ccclass } = _decorator;

/** Formal splash art — 1080×2200, fixed-width friendly. */
const SPLASH_W = 1080;
const SPLASH_H = 2200;
const SPLASH_SF_UUID = '5a4ebb12-2f98-4075-a870-b9286e9ac348@f9941';

/** Game HUD that must stay hidden under the boot gate. */
const HIDE_WHILE_LOADING = [
    'FarmHotbar',
    'QuestHud',
    'QuestTracker',
    'QuestBtn',
    'FarmActionHint',
    'FarmToolTip',
    'FarmActionBtn',
    'FarmUseBtn',
    'FarmInfoBoard',
    'GmChip',
    'GmPanel',
    'TouchControls',
    'StickVisual',
    'DialogueBox',
    'QuestPanel',
    'TownShopPanel',
    'TownShopDimmer',
    'RewardPopup',
    'RewardDimmer',
];

/**
 * Full-screen boot gate with splash key art + progress.
 * Stays above all runtime UI until close().
 */
@ccclass('LoadingScreen')
export class LoadingScreen extends Component {
    private _root: Node | null = null;
    private _veil: Graphics | null = null;
    private _splash: Sprite | null = null;
    private _barFillGfx: Graphics | null = null;
    private _tipLab: Label | null = null;
    private _pctLab: Label | null = null;
    private _titleLab: Label | null = null;
    private _subLab: Label | null = null;
    private _progress = 0;
    private _barW = 720;
    private _barH = 32;
    private _open = false;
    private _chromeWas = new Map<string, boolean>();

    /** Build and show immediately (call before other UI). */
    static mount(canvas: Node): LoadingScreen {
        const old = canvas.getChildByName('LoadingScreen');
        if (old) old.destroy();
        let comp = canvas.getComponent(LoadingScreen);
        if (comp) canvas.removeComponent(comp);
        comp = canvas.addComponent(LoadingScreen);
        comp.build(canvas);
        return comp;
    }

    get progress() {
        return this._progress;
    }

    get isOpen() {
        return this._open;
    }

    setProgress(p: number, tip?: string) {
        this._progress = Math.max(0, Math.min(1, p));
        this.paintBar();
        if (this._pctLab) this._pctLab.string = `${Math.round(this._progress * 100)}%`;
        if (tip !== undefined && this._tipLab) this._tipLab.string = tip;
        this.layoutToVisible();
        this.bringToFront();
        this.suppressGameChrome();
    }

    close(done?: () => void) {
        if (!this._root) {
            this._open = false;
            this.restoreGameChrome();
            done?.();
            return;
        }
        this._open = false;
        const op = this._root.getComponent(UIOpacity) ?? this._root.addComponent(UIOpacity);
        Tween.stopAllByTarget(op);
        tween(op)
            .to(0.35, { opacity: 0 })
            .call(() => {
                this.restoreGameChrome();
                if (this._root?.isValid) {
                    this._root.destroy();
                    this._root = null;
                }
                done?.();
            })
            .start();
    }

    lateUpdate() {
        if (!this._open || !this._root?.isValid) return;
        this.suppressGameChrome();
        this.bringToFront();
    }

    private build(canvas: Node) {
        this._open = true;
        const root = new Node('LoadingScreen');
        root.layer = canvas.layer;
        root.setParent(canvas);
        root.setSiblingIndex(canvas.children.length - 1);
        root.addComponent(UITransform).setContentSize(DESIGN_W, SPLASH_H);
        const op = root.addComponent(UIOpacity);
        op.opacity = 255;
        this._root = root;

        // Oversized opaque veil — never leave gaps while splash scales / loads.
        const veilN = new Node('Veil');
        veilN.layer = root.layer;
        veilN.setParent(root);
        veilN.setSiblingIndex(0);
        veilN.addComponent(UITransform).setContentSize(2400, 3200);
        this._veil = veilN.addComponent(Graphics);
        this.paintVeil(2400, 3200);

        const splashN = new Node('Splash');
        splashN.layer = root.layer;
        splashN.setParent(root);
        splashN.setPosition(0, 0, 0);
        const splashUt = splashN.addComponent(UITransform);
        splashUt.setContentSize(SPLASH_W, SPLASH_H);
        splashUt.setAnchorPoint(0.5, 0.5);
        const sp = splashN.addComponent(Sprite);
        sp.sizeMode = Sprite.SizeMode.CUSTOM;
        sp.type = Sprite.Type.SIMPLE;
        this._splash = sp;
        assetManager.loadAny({ uuid: SPLASH_SF_UUID }, (err, asset) => {
            if (!err && asset && sp.isValid) {
                sp.spriteFrame = asset as SpriteFrame;
                this.layoutToVisible();
                this.bringToFront();
            }
        });

        const titleN = new Node('Title');
        titleN.layer = root.layer;
        titleN.setParent(root);
        titleN.setPosition(0, 820, 0);
        titleN.addComponent(UITransform).setContentSize(900, 100);
        const title = titleN.addComponent(Label);
        styleUiLabel(title, {
            size: 72,
            color: new Color(255, 236, 180, 255),
            outline: true,
            outlineWidth: 5,
            outlineColor: new Color(40, 28, 12, 255),
        });
        title.horizontalAlign = Label.HorizontalAlign.CENTER;
        title.string = '微光溪谷';
        this._titleLab = title;

        const subN = new Node('Sub');
        subN.layer = root.layer;
        subN.setParent(root);
        subN.setPosition(0, 740, 0);
        subN.addComponent(UITransform).setContentSize(700, 40);
        const sub = subN.addComponent(Label);
        styleUiLabel(sub, {
            size: 28,
            color: new Color(230, 220, 180, 240),
            outline: true,
            outlineWidth: 3,
            outlineColor: new Color(30, 24, 12, 230),
        });
        sub.horizontalAlign = Label.HorizontalAlign.CENTER;
        sub.string = 'Lumewisp Vale';
        this._subLab = sub;

        const dock = new Node('ProgressDock');
        dock.layer = root.layer;
        dock.setParent(root);
        dock.setPosition(0, -880, 0);
        dock.addComponent(UITransform).setContentSize(800, 160);

        const track = new Node('BarTrack');
        track.layer = root.layer;
        track.setParent(dock);
        track.setPosition(0, 24, 0);
        track.addComponent(UITransform).setContentSize(this._barW + 14, this._barH + 14);
        const tg = track.addComponent(Graphics);
        tg.fillColor = new Color(28, 22, 16, 230);
        tg.roundRect(-(this._barW + 14) * 0.5, -(this._barH + 14) * 0.5, this._barW + 14, this._barH + 14, 16);
        tg.fill();
        tg.strokeColor = new Color(220, 180, 100, 255);
        tg.lineWidth = 3;
        tg.roundRect(-(this._barW + 14) * 0.5, -(this._barH + 14) * 0.5, this._barW + 14, this._barH + 14, 16);
        tg.stroke();

        const fill = new Node('BarFill');
        fill.layer = root.layer;
        fill.setParent(track);
        fill.addComponent(UITransform).setContentSize(this._barW, this._barH);
        this._barFillGfx = fill.addComponent(Graphics);

        const tipN = new Node('Tip');
        tipN.layer = root.layer;
        tipN.setParent(dock);
        tipN.setPosition(0, -30, 0);
        tipN.addComponent(UITransform).setContentSize(900, 40);
        const tip = tipN.addComponent(Label);
        styleUiLabel(tip, {
            size: 28,
            color: new Color(255, 242, 210, 255),
            outline: true,
            outlineWidth: 3,
            outlineColor: new Color(40, 28, 14, 230),
        });
        tip.horizontalAlign = Label.HorizontalAlign.CENTER;
        tip.string = '正在唤醒溪谷…';
        this._tipLab = tip;

        const pctN = new Node('Pct');
        pctN.layer = root.layer;
        pctN.setParent(dock);
        pctN.setPosition(0, -70, 0);
        pctN.addComponent(UITransform).setContentSize(200, 36);
        const pct = pctN.addComponent(Label);
        styleUiLabel(pct, {
            size: 24,
            color: new Color(230, 210, 160, 255),
            outline: true,
            outlineWidth: 2,
        });
        pct.horizontalAlign = Label.HorizontalAlign.CENTER;
        pct.string = '0%';
        this._pctLab = pct;

        this.paintBar();
        this.layoutToVisible();
        this.suppressGameChrome();
        this.bringToFront();
        view.on('canvas-resize', this.layoutToVisible, this);

        loadUiFont().then((font) => {
            if (!font) return;
            if (this._titleLab) applyUiFont(this._titleLab);
            if (this._subLab) applyUiFont(this._subLab);
            if (this._tipLab) applyUiFont(this._tipLab);
            if (this._pctLab) applyUiFont(this._pctLab);
        });
    }

    onDestroy() {
        view.off('canvas-resize', this.layoutToVisible, this);
        if (this._open) this.restoreGameChrome();
    }

    private bringToFront() {
        if (!this._root?.isValid) return;
        const canvas = this.node;
        this._root.setSiblingIndex(canvas.children.length - 1);
    }

    private suppressGameChrome() {
        const canvas = this.node;
        for (const name of HIDE_WHILE_LOADING) {
            const n = canvas.getChildByName(name);
            if (!n?.isValid) continue;
            if (!this._chromeWas.has(name)) this._chromeWas.set(name, n.active);
            if (n.active) n.active = false;
        }
        // QuestHud is a dock that may spawn later with children.
        const questHud = canvas.getChildByName('QuestHud');
        if (questHud?.isValid) {
            if (!this._chromeWas.has('QuestHud')) this._chromeWas.set('QuestHud', questHud.active);
            questHud.active = false;
        }
    }

    private restoreGameChrome() {
        const canvas = this.node;
        for (const [name, was] of this._chromeWas) {
            const n = canvas.getChildByName(name);
            if (n?.isValid) n.active = was;
        }
        this._chromeWas.clear();
    }

    private paintVeil(w: number, h: number) {
        if (!this._veil) return;
        this._veil.clear();
        this._veil.fillColor = new Color(36, 52, 42, 255);
        this._veil.rect(-w * 0.5, -h * 0.5, w, h);
        this._veil.fill();
    }

    /**
     * FIXED_WIDTH: design width stays 1080; visible height grows on tall phones.
     * Scale splash with cover so width always fills and height never letterboxes.
     */
    private layoutToVisible = () => {
        if (!this._root?.isValid) return;
        const vis = portraitVisibleSize();
        const visW = Math.max(DESIGN_W, vis.width || DESIGN_W);
        const visH = Math.max(vis.height || 1920, 1920);
        const scale = Math.max(visW / SPLASH_W, visH / SPLASH_H);
        const w = Math.ceil(SPLASH_W * scale);
        const h = Math.ceil(SPLASH_H * scale);

        // Veil larger than visible frame — blocks any HUD peeking at edges.
        const veilW = Math.ceil(Math.max(w, visW) + 400);
        const veilH = Math.ceil(Math.max(h, visH) + 600);
        this._root.getComponent(UITransform)?.setContentSize(veilW, veilH);
        this._veil?.node.getComponent(UITransform)?.setContentSize(veilW, veilH);
        this.paintVeil(veilW, veilH);

        const splashUt = this._splash?.node.getComponent(UITransform);
        splashUt?.setContentSize(w, h);

        const title = this._titleLab?.node;
        const sub = this._subLab?.node;
        const dock = this._root.getChildByName('ProgressDock');
        if (title) title.setPosition(0, 820 * scale, 0);
        if (sub) sub.setPosition(0, 740 * scale, 0);
        if (dock) dock.setPosition(0, -880 * scale, 0);
        this.bringToFront();
    };

    private paintBar() {
        const g = this._barFillGfx;
        if (!g) return;
        g.clear();
        const w = Math.max(0, this._barW * this._progress);
        if (w < 1) return;
        g.fillColor = new Color(210, 150, 60, 255);
        g.roundRect(-this._barW * 0.5, -this._barH * 0.5, w, this._barH, 12);
        g.fill();
        g.fillColor = new Color(255, 220, 130, 110);
        g.roundRect(-this._barW * 0.5, -this._barH * 0.5 + this._barH * 0.55, w, this._barH * 0.32, 10);
        g.fill();
    }
}
