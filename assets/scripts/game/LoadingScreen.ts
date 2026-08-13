import {
    _decorator,
    Color,
    Component,
    EventMouse,
    EventTouch,
    Graphics,
    Input,
    Label,
    Node,
    Prefab,
    Sprite,
    SpriteFrame,
    UIOpacity,
    UITransform,
    assetManager,
    game,
    input,
    instantiate,
    sys,
    tween,
    Tween,
    view,
} from 'cc';
import {
    LOADING_SCREEN_LAYOUT as L,
    LOADING_SCREEN_PREFAB_UUID,
} from './LoadingScreenFrames';
import { DESIGN_W, portraitVisibleSize } from './PortraitFit';
import { applyUiFont, loadUiFont, styleUiLabel } from './UiFont';
import { playUiClick } from './UiAudio';

const { ccclass } = _decorator;

/** Formal splash art — 1080×2200, fixed-width friendly. */
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
    'GmDimmer',
    'GmPanel',
    'TouchControls',
    'StickVisual',
    // DialogueBox / StoryIntro stay mountable under the gate for seamless handoff.
    'QuestPanel',
    'TownShopPanel',
    'RewardPopup',
];

/**
 * Full-screen boot gate with splash key art + progress.
 * Stays above all runtime UI until close().
 * Layout from LoadingScreen.prefab; script binds data + progress fill.
 */
@ccclass('LoadingScreen')
export class LoadingScreen extends Component {
    private _root: Node | null = null;
    private _veil: Graphics | null = null;
    private _splash: Sprite | null = null;
    private _barFillGfx: Graphics | null = null;
    private _tipLab: Label | null = null;
    private _titleLab: Label | null = null;
    private _subLab: Label | null = null;
    private _startHint: Node | null = null;
    private _startHintLab: Label | null = null;
    private _startHintOp: UIOpacity | null = null;
    private _barTrack: Node | null = null;
    private _progress = 0;
    private _barW = L.barW;
    private _barH = L.barH;
    private _open = false;
    private _readyForStart = false;
    private _startResolved = false;
    private _suppressChrome = true;
    private _onStart: (() => void) | null = null;
    private _chromeWas = new Map<string, boolean>();
    private _ready = false;
    private _pendingTip: string | undefined;

    /** Build and show immediately (call before other UI). */
    static mount(canvas: Node): LoadingScreen {
        const old = canvas.getChildByName('LoadingScreen');
        // removeFromParent first — deferred destroy alone leaves a one-frame hole.
        if (old?.isValid) {
            old.removeFromParent();
            old.destroy();
        }
        let comp = canvas.getComponent(LoadingScreen);
        if (comp) canvas.removeComponent(comp);
        comp = canvas.addComponent(LoadingScreen);
        comp.beginMount(canvas);
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
        if (tip !== undefined) this._pendingTip = tip;
        if (!this._ready) return;
        this.paintBar();
        if (tip !== undefined && this._tipLab) this._tipLab.string = tip;
        else if (this._pendingTip !== undefined && this._tipLab) {
            this._tipLab.string = this._pendingTip;
        }
        this.layoutToVisible();
        this.bringToFront();
        this.suppressGameChrome();
    }

    /**
     * After assets hit 100%, reveal「开始游戏」and wait for a tap.
     * Call before close() so the player controls when to enter.
     */
    waitForStart(): Promise<void> {
        if (this._startResolved || !this._root?.isValid) {
            return Promise.resolve();
        }
        return new Promise((resolve) => {
            this._onStart = () => resolve();
            this.showStartGate();
        });
    }

    /** Restore HUD under the opaque splash so the next overlay can re-hide and own it. */
    releaseSuppressedChrome() {
        this._suppressChrome = false;
        this.restoreGameChrome();
    }

    /**
     * @param opts.fadeMs 0 = instant lift (use when story/dialogue already covers).
     * @param opts.restoreChrome false when the next overlay already owns HUD hiding.
     */
    close(done?: () => void, opts?: { fadeMs?: number; restoreChrome?: boolean }) {
        // Unblock any pending waitForStart if close races ahead.
        this.resolveStart();
        this.unlistenStart();
        const fadeMs = opts?.fadeMs ?? 350;
        const restoreChrome = opts?.restoreChrome !== false;
        const finish = () => {
            if (restoreChrome) this.restoreGameChrome();
            if (this._root?.isValid) {
                this._root.removeFromParent();
                this._root.destroy();
                this._root = null;
            }
            done?.();
        };
        if (!this._root) {
            this._open = false;
            finish();
            return;
        }
        this._open = false;
        if (fadeMs <= 0) {
            finish();
            return;
        }
        const op = this._root.getComponent(UIOpacity) ?? this._root.addComponent(UIOpacity);
        Tween.stopAllByTarget(op);
        tween(op)
            .to(fadeMs / 1000, { opacity: 0 })
            .call(finish)
            .start();
    }

    lateUpdate() {
        if (!this._open || !this._root?.isValid) return;
        if (this._suppressChrome) this.suppressGameChrome();
        this.bringToFront();
    }

    onDestroy() {
        view.off('canvas-resize', this.layoutToVisible, this);
        this.stopStartPulse();
        this.unlistenStart();
        if (this._open) this.restoreGameChrome();
    }

    private beginMount(canvas: Node) {
        this._open = true;
        // Instant veil so teardown never flashes the farm while the prefab loads.
        this.mountTempGate(canvas);
        this.suppressGameChrome();
        this.bringToFront();
        view.on('canvas-resize', this.layoutToVisible, this);

        assetManager.loadAny({ uuid: LOADING_SCREEN_PREFAB_UUID }, (err, asset) => {
            if (err || !asset) {
                console.warn('[LoadingScreen] prefab missing', err);
                this._ready = true;
                this.setProgress(this._progress, this._pendingTip);
                return;
            }
            const old = this._root;
            const inst = instantiate(asset as Prefab);
            inst.name = 'LoadingScreen';
            inst.layer = canvas.layer;
            inst.setParent(canvas);
            inst.setSiblingIndex(canvas.children.length - 1);
            if (old?.isValid) {
                old.removeFromParent();
                old.destroy();
            }
            this._root = inst;
            this.bindRefs(inst);
            this.paintChromeOnce();
            this._ready = true;
            this.setProgress(this._progress, this._pendingTip);
            this.bringToFront();
            loadUiFont().then((font) => {
                if (!font) return;
                if (this._titleLab) applyUiFont(this._titleLab);
                if (this._subLab) applyUiFont(this._subLab);
                if (this._tipLab) applyUiFont(this._tipLab);
                if (this._startHintLab) applyUiFont(this._startHintLab);
            });
        });
    }

    /** Sync opaque cover — replaced when the prefab instantiates. */
    private mountTempGate(canvas: Node) {
        const root = new Node('LoadingScreen');
        root.layer = canvas.layer;
        root.setParent(canvas);
        root.setSiblingIndex(canvas.children.length - 1);
        root.addComponent(UITransform).setContentSize(L.designW, L.splashH);
        const op = root.addComponent(UIOpacity);
        op.opacity = 255;
        this._root = root;

        const veilN = new Node('Veil');
        veilN.layer = root.layer;
        veilN.setParent(root);
        veilN.addComponent(UITransform).setContentSize(2400, 3200);
        this._veil = veilN.addComponent(Graphics);
        this.paintVeil(2400, 3200);
    }

    private bindRefs(root: Node) {
        const op = root.getComponent(UIOpacity) ?? root.addComponent(UIOpacity);
        op.opacity = 255;
        this._veil = root.getChildByName('Veil')?.getComponent(Graphics) ?? null;
        this._splash = root.getChildByName('Splash')?.getComponent(Sprite) ?? null;
        if (this._splash) {
            this._splash.sizeMode = Sprite.SizeMode.CUSTOM;
            this._splash.type = Sprite.Type.SIMPLE;
            const cached = assetManager.assets.get(SPLASH_SF_UUID) as SpriteFrame | null | undefined;
            if (cached) this._splash.spriteFrame = cached;
            else if (!this._splash.spriteFrame) {
                assetManager.loadAny({ uuid: SPLASH_SF_UUID }, (err, asset) => {
                    if (!err && asset && this._splash?.isValid) {
                        this._splash.spriteFrame = asset as SpriteFrame;
                        this.layoutToVisible();
                        this.bringToFront();
                    }
                });
            }
        }
        this._titleLab = root.getChildByName('Title')?.getComponent(Label) ?? null;
        this._subLab = root.getChildByName('Sub')?.getComponent(Label) ?? null;
        const dock = root.getChildByName('ProgressDock');
        this._barTrack = dock?.getChildByName('BarTrack') ?? null;
        const fill = this._barTrack?.getChildByName('BarFill');
        this._barFillGfx = fill?.getComponent(Graphics) ?? null;
        const fillUt = fill?.getComponent(UITransform);
        if (fillUt) {
            this._barW = fillUt.contentSize.width || L.barW;
            this._barH = fillUt.contentSize.height || L.barH;
        }
        this._tipLab = dock?.getChildByName('Tip')?.getComponent(Label) ?? null;
        this._startHint = dock?.getChildByName('StartHint') ?? null;
        this._startHintLab = this._startHint?.getChildByName('Label')?.getComponent(Label) ?? null;
        this._startHintOp =
            this._startHint?.getComponent(UIOpacity) ?? this._startHint?.addComponent(UIOpacity) ?? null;
        if (this._startHint) this._startHint.active = false;

        if (this._titleLab) {
            styleUiLabel(this._titleLab, {
                size: 72,
                color: new Color(255, 236, 180, 255),
                outline: true,
                outlineWidth: 5,
                outlineColor: new Color(40, 28, 12, 255),
            });
            this._titleLab.horizontalAlign = Label.HorizontalAlign.CENTER;
        }
        if (this._subLab) {
            styleUiLabel(this._subLab, {
                size: 28,
                color: new Color(230, 220, 180, 240),
                outline: true,
                outlineWidth: 3,
                outlineColor: new Color(30, 24, 12, 230),
            });
            this._subLab.horizontalAlign = Label.HorizontalAlign.CENTER;
        }
        if (this._tipLab) {
            styleUiLabel(this._tipLab, {
                size: 28,
                color: new Color(255, 242, 210, 255),
                outline: true,
                outlineWidth: 3,
                outlineColor: new Color(40, 28, 14, 230),
            });
            this._tipLab.horizontalAlign = Label.HorizontalAlign.CENTER;
        }
        if (this._startHintLab) {
            styleUiLabel(this._startHintLab, {
                size: 48,
                color: new Color(255, 242, 210, 255),
                outline: true,
                outlineWidth: 4,
                outlineColor: new Color(40, 28, 14, 230),
            });
            this._startHintLab.horizontalAlign = Label.HorizontalAlign.CENTER;
            this._startHintLab.verticalAlign = Label.VerticalAlign.CENTER;
        }
    }

    private paintChromeOnce() {
        if (this._veil) {
            const ut = this._veil.node.getComponent(UITransform);
            const w = ut?.contentSize.width ?? 2400;
            const h = ut?.contentSize.height ?? 3200;
            this.paintVeil(w, h);
        }
        const track = this._barTrack?.getComponent(Graphics);
        if (track) {
            const tw = L.trackW;
            const th = L.trackH;
            track.clear();
            track.fillColor = new Color(28, 22, 16, 230);
            track.roundRect(-tw * 0.5, -th * 0.5, tw, th, 16);
            track.fill();
            track.strokeColor = new Color(220, 180, 100, 255);
            track.lineWidth = 3;
            track.roundRect(-tw * 0.5, -th * 0.5, tw, th, 16);
            track.stroke();
        }
        this.paintBar();
    }

    private showStartGate() {
        if (!this._root?.isValid) {
            this.resolveStart();
            return;
        }
        this._readyForStart = true;
        if (this._tipLab) this._tipLab.node.active = false;
        if (this._barTrack) this._barTrack.active = false;
        if (this._startHint?.isValid) {
            this._startHint.active = true;
            this.startHintPulse();
        }
        this.listenStart();
        this.layoutToVisible();
        this.bringToFront();
        this.suppressGameChrome();
    }

    private startHintPulse() {
        if (!this._startHintOp) return;
        this.stopStartPulse();
        this._startHintOp.opacity = 255;
        // Slower than dialogue tip — splash reads better at a calm breath.
        tween(this._startHintOp)
            .repeatForever(
                tween(this._startHintOp).to(0.9, { opacity: 255 }).to(0.9, { opacity: 120 }),
            )
            .start();
    }

    private stopStartPulse() {
        if (this._startHintOp) {
            Tween.stopAllByTarget(this._startHintOp);
            this._startHintOp.opacity = 255;
        }
    }

    private listenStart() {
        this.unlistenStart();
        // Global input — same as DialoguePanel「点击继续」(node hits can miss over Splash).
        input.on(Input.EventType.TOUCH_END, this.onStartTouch, this);
        input.on(Input.EventType.MOUSE_UP, this.onStartMouse, this);
        // Web fallback — Cocos input can miss browser pointer events on web-mobile.
        if (sys.isBrowser) {
            window.addEventListener('pointerup', this.onStartDomPointer, {
                passive: true,
                capture: true,
            });
            window.addEventListener('pointercancel', this.onStartDomPointer, {
                passive: true,
                capture: true,
            });
        }
    }

    private unlistenStart() {
        input.off(Input.EventType.TOUCH_END, this.onStartTouch, this);
        input.off(Input.EventType.MOUSE_UP, this.onStartMouse, this);
        if (sys.isBrowser) {
            window.removeEventListener('pointerup', this.onStartDomPointer, true);
            window.removeEventListener('pointercancel', this.onStartDomPointer, true);
        }
    }

    private onStartTouch = (e: EventTouch) => {
        if (!this._readyForStart || this._startResolved) return;
        e.propagationStopped = true;
        playUiClick();
        this.resolveStart();
    };

    private onStartMouse = (e: EventMouse) => {
        if (!this._readyForStart || this._startResolved) return;
        if (e.getButton() !== EventMouse.BUTTON_LEFT) return;
        e.propagationStopped = true;
        playUiClick();
        this.resolveStart();
    };

    private onStartDomPointer = (e: PointerEvent) => {
        if (!this._readyForStart || this._startResolved) return;
        const canvas = game.canvas as HTMLCanvasElement | null;
        if (canvas) {
            const box = canvas.getBoundingClientRect();
            const lx = e.clientX - box.left;
            const ly = e.clientY - box.top;
            if (lx < 0 || ly < 0 || lx > box.width || ly > box.height) return;
        }
        playUiClick();
        this.resolveStart();
    };

    private resolveStart() {
        if (this._startResolved) return;
        this._startResolved = true;
        this._readyForStart = false;
        this.stopStartPulse();
        this.unlistenStart();
        const cb = this._onStart;
        this._onStart = null;
        cb?.();
    }

    private bringToFront() {
        if (!this._root?.isValid) return;
        const canvas = this.node;
        this._root.setSiblingIndex(canvas.children.length - 1);
    }

    private suppressGameChrome() {
        if (!this._suppressChrome) return;
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
        // Always-on HUD can be snapshotted while still building / suppressed —
        // force the dock + stick back on after the splash.
        const bar = canvas.getChildByName('FarmHotbar');
        if (bar?.isValid) bar.active = true;
        const touchHost = canvas.getChildByName('TouchControls');
        if (touchHost?.isValid) touchHost.active = true;
        const stickVisual = canvas.getChildByName('StickVisual');
        if (stickVisual?.isValid) stickVisual.active = true;
        const hud = this.node.getComponent('FarmHUD') as {
            ensureDockVisible?: () => void;
        } | null;
        hud?.ensureDockVisible?.();
        const stick = canvas
            .getChildByName('TouchControls')
            ?.getComponent('TouchJoystick') as { showFixedStick?: () => void } | null;
        stick?.showFixedStick?.();
        // Town/mine boot may flag claimable quests while the splash hid HUD —
        // resync so QuestHud isn't stuck on the pre-flag inactive snapshot.
        const questUi = this.node.getComponent('QuestPanel') as {
            revealQuestHud?: () => void;
        } | null;
        questUi?.revealQuestHud?.();
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
        if (!this._root?.isValid || !this._ready) return;
        const vis = portraitVisibleSize();
        const visW = Math.max(DESIGN_W, vis.width || DESIGN_W);
        const visH = Math.max(vis.height || 1920, 1920);
        const scale = Math.max(visW / L.splashW, visH / L.splashH);
        const w = Math.ceil(L.splashW * scale);
        const h = Math.ceil(L.splashH * scale);

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
        if (title) title.setPosition(0, L.titleY * scale, 0);
        if (sub) sub.setPosition(0, L.subY * scale, 0);
        const dockY = this._readyForStart ? L.dockYReady : L.dockYLoading;
        if (dock) dock.setPosition(0, dockY * scale, 0);
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
        g.roundRect(
            -this._barW * 0.5,
            -this._barH * 0.5 + this._barH * 0.55,
            w,
            this._barH * 0.32,
            10,
        );
        g.fill();
    }
}
