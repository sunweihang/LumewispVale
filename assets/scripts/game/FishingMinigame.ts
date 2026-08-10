import {
    _decorator,
    Color,
    Component,
    EventKeyboard,
    EventMouse,
    EventTouch,
    Graphics,
    Input,
    KeyCode,
    Label,
    Mask,
    Node,
    Sprite,
    SpriteFrame,
    UIOpacity,
    UITransform,
    assetManager,
    input,
    tween,
    view,
} from 'cc';
import { FISHING_FRAMES } from './FishingFrames';
import { InputBridge } from './InputBridge';
import { applyUiFont, loadUiFont, styleUiLabel } from './UiFont';

const { ccclass } = _decorator;

export type FishingResult = 'catch' | 'perfect' | 'escape';

/** Stardew-like vertical fishing bar — mouse hold lifts the green zone. */
@ccclass('FishingMinigame')
export class FishingMinigame extends Component {
    private _root: Node | null = null;
    private _panel: Node | null = null;
    private _barNode: Node | null = null;
    private _fishNode: Node | null = null;
    private _progG: Graphics | null = null;
    private _banner: Label | null = null;
    private _hint: Label | null = null;

    private _panelSf: SpriteFrame | null = null;
    private _barSf: SpriteFrame | null = null;
    private _fishSf: SpriteFrame | null = null;
    private _framesReady = false;
    private _loadGen = 0;

    private _active = false;
    private _holding = false;
    private _perfect = true;
    private _ended = false;

    /** 0..1 bottom→top of track (bar bottom). */
    private _barY = 0.12;
    private _barVel = 0;
    /** 0..1 fish center. */
    private _fishY = 0.55;
    private _fishTarget = 0.55;
    private _fishRetarget = 0;
    /** Catch meter 0..1. */
    private _progress = 0.28;

    private _barH = 0.22;
    private _diff = 0.55;
    private _onDone: ((r: FishingResult) => void) | null = null;
    private _prevBlocking = false;
    private _prevMoveLocked = false;

    /**
     * Hand-pixel panel from tools/ui/draw_fishing_ui.py (80×292 @2x).
     * Narrow water + progress groove share the same top/bottom.
     */
    private readonly PANEL_W = 160;
    private readonly PANEL_H = 584;
    private readonly TRACK_W = 56;
    private readonly TRACK_H = 536;
    private readonly TRACK_X = -9;
    private readonly TRACK_Y = 1;
    private readonly PROG_W = 16;
    private readonly PROG_X = 41;
    private readonly PROG_INSET = 0;
    private readonly FISH_SIZE = 32;
    /** Keep paddle almost as wide as the water column (Stardew). */
    private readonly BAR_INSET_X = 3;

    get isOpen(): boolean {
        return this._active;
    }

    onLoad() {
        this.ensureFrames();
    }

    /** Seconds after open with no progress drain (reaction window). */
    private _grace = 0;

    /**
     * Open the minigame overlay.
     * @param difficulty 0 easy … 1 hard (shorter bar, faster fish, harsher drain).
     */
    open(difficulty = 0.4, onDone?: (r: FishingResult) => void) {
        if (this._active) this.close(false);
        this._onDone = onDone ?? null;
        this._diff = Math.max(0.15, Math.min(0.9, difficulty));
        // ~34% track easy → ~24% hard — must track the fish, not AFK.
        this._barH = 0.36 - this._diff * 0.14;
        this._barVel = 0;
        // Fish starts mid/high; bar starts near bottom so you have to lift.
        this._fishY = 0.42 + Math.random() * 0.28;
        this._fishTarget = this._fishY;
        this._fishRetarget = 0.25 + Math.random() * 0.35;
        this._barY = 0.02 + Math.random() * 0.06;
        this._progress = 0.28;
        this._grace = 0.2;
        this._holding = false;
        this._perfect = true;
        this._ended = false;
        this._active = true;

        this._prevBlocking = InputBridge.uiBlocking;
        this._prevMoveLocked = InputBridge.moveLocked;
        InputBridge.uiBlocking = true;
        InputBridge.moveLocked = true;
        InputBridge.clear();

        this.ensureFrames(() => {
            if (!this._active) return;
            this.buildUi();
            this.bindInput(true);
            this.layoutDynamic();
        });
    }

    /** Force-close without rewarding (cancel walk / tool swap). */
    close(notify = true) {
        if (!this._active && !this._root) return;
        this.bindInput(false);
        this._active = false;
        InputBridge.uiBlocking = this._prevBlocking;
        InputBridge.moveLocked = this._prevMoveLocked;
        InputBridge.clear();
        const root = this._root;
        this.clearUiRefs();
        if (root?.isValid) root.destroy();
        if (notify && this._onDone) {
            const cb = this._onDone;
            this._onDone = null;
            cb('escape');
        } else {
            this._onDone = null;
        }
    }

    update(dt: number) {
        if (!this._active || this._ended) return;
        // Hard-kill stick while fishing — even if TouchJoystick misfires.
        InputBridge.clear();
        InputBridge.moveLocked = true;

        const t = Math.min(0.05, Math.max(0, dt));
        if (this._grace > 0) this._grace = Math.max(0, this._grace - t);

        // Stardew-like: hold lifts hard, release falls with gravity.
        const lift = 700 + this._diff * 80;
        const grav = 560 + this._diff * 180;
        if (this._holding) this._barVel += lift * t;
        else this._barVel -= grav * t;
        this._barVel *= 1 - Math.min(0.85, 1.4 * t);
        this._barVel = Math.max(-620, Math.min(680, this._barVel));
        this._barY += (this._barVel / this.TRACK_H) * t;
        const maxBar = Math.max(0, 1 - this._barH);
        if (this._barY < 0) {
            this._barY = 0;
            this._barVel = Math.abs(this._barVel) * 0.35;
        } else if (this._barY > maxBar) {
            this._barY = maxBar;
            this._barVel = 0;
        }

        this._fishRetarget -= t;
        if (this._fishRetarget <= 0) {
            const wander = 0.18 + this._diff * 0.22;
            this._fishTarget = Math.max(
                0.08,
                Math.min(0.92, this._fishY + (Math.random() * 2 - 1) * wander),
            );
            this._fishRetarget = 0.28 + Math.random() * (0.55 - this._diff * 0.15);
            // Darts force the player to re-aim.
            if (Math.random() < 0.18 + this._diff * 0.28) {
                this._fishTarget = Math.max(
                    0.08,
                    Math.min(0.92, this._fishY + (Math.random() - 0.5) * (0.4 + this._diff * 0.25)),
                );
                this._fishRetarget = 0.2 + Math.random() * 0.28;
            }
        }
        const fishSpeed = 0.42 + this._diff * 0.65;
        const dy = this._fishTarget - this._fishY;
        this._fishY += Math.sign(dy) * Math.min(Math.abs(dy), fishSpeed * t);
        this._fishY = Math.max(0.06, Math.min(0.94, this._fishY));

        const pad = 0.012;
        const fishIn =
            this._fishY + pad >= this._barY && this._fishY - pad <= this._barY + this._barH;
        if (fishIn) {
            this._progress += (0.26 - this._diff * 0.05) * t;
        } else if (this._grace <= 0) {
            this._perfect = false;
            this._progress -= (0.16 + this._diff * 0.14) * t;
        }
        this._progress = Math.max(0, Math.min(1, this._progress));

        this.layoutDynamic();

        if (this._progress >= 1) {
            this.finish(this._perfect ? 'perfect' : 'catch');
        } else if (this._progress <= 0) {
            this.finish('escape');
        }
    }

    private finish(result: FishingResult) {
        if (this._ended) return;
        this._ended = true;
        this._active = false;
        this.bindInput(false);
        InputBridge.uiBlocking = this._prevBlocking;
        InputBridge.moveLocked = this._prevMoveLocked;
        InputBridge.clear();

        if (this._banner) {
            if (result === 'perfect') this._banner.string = '完美!';
            else if (result === 'catch') this._banner.string = '钓到了!';
            else this._banner.string = '跑掉了…';
            this._banner.node.active = true;
        }
        if (this._hint) this._hint.string = '';

        const cb = this._onDone;
        this._onDone = null;
        const root = this._root;
        tween(root ?? this.node)
            .delay(result === 'escape' ? 0.55 : 0.7)
            .call(() => {
                if (root?.isValid) root.destroy();
                if (this._root === root) this.clearUiRefs();
                cb?.(result);
            })
            .start();
    }

    private clearUiRefs() {
        this._root = null;
        this._panel = null;
        this._barNode = null;
        this._fishNode = null;
        this._progG = null;
        this._banner = null;
        this._hint = null;
    }

    private ensureFrames(done?: () => void) {
        if (this._framesReady && this._panelSf && this._barSf && this._fishSf) {
            done?.();
            return;
        }
        const gen = ++this._loadGen;
        const jobs: { key: 'panel' | 'bar' | 'fish'; uuid: string }[] = [
            { key: 'panel', uuid: FISHING_FRAMES.panel },
            { key: 'bar', uuid: FISHING_FRAMES.bar },
            { key: 'fish', uuid: FISHING_FRAMES.fish },
        ];
        let left = jobs.length;
        const finishOne = () => {
            left--;
            if (left > 0 || gen !== this._loadGen) return;
            this._framesReady = !!(this._panelSf && this._barSf && this._fishSf);
            done?.();
        };
        for (const job of jobs) {
            if (!job.uuid) {
                finishOne();
                continue;
            }
            assetManager.loadAny({ uuid: job.uuid }, (err, asset) => {
                if (!err && asset) {
                    if (job.key === 'panel') this._panelSf = asset as SpriteFrame;
                    else if (job.key === 'bar') this._barSf = asset as SpriteFrame;
                    else this._fishSf = asset as SpriteFrame;
                }
                finishOne();
            });
        }
    }

    private buildUi() {
        const canvas = this.node;
        const old = canvas.getChildByName('FishingMinigame');
        if (old) old.destroy();

        const root = new Node('FishingMinigame');
        root.layer = canvas.layer;
        root.setParent(canvas);
        root.setSiblingIndex(canvas.children.length - 1);
        const vis = view.getVisibleSize();
        root.addComponent(UITransform).setContentSize(vis.width, vis.height);
        root.addComponent(UIOpacity).opacity = 255;
        this._root = root;

        const dim = new Node('Dim');
        dim.layer = root.layer;
        dim.setParent(root);
        dim.addComponent(UITransform).setContentSize(vis.width, vis.height);
        const dimG = dim.addComponent(Graphics);
        dimG.fillColor = new Color(12, 18, 28, 80);
        dimG.rect(-vis.width * 0.5, -vis.height * 0.5, vis.width, vis.height);
        dimG.fill();

        const panel = new Node('Panel');
        panel.layer = root.layer;
        panel.setParent(root);
        // Left-of-center like Stardew — keep pier / player readable on the right.
        panel.setPosition(-180, 24, 0);
        panel.addComponent(UITransform).setContentSize(this.PANEL_W, this.PANEL_H);
        if (this._panelSf) {
            const sp = panel.addComponent(Sprite);
            sp.sizeMode = Sprite.SizeMode.CUSTOM;
            sp.trim = false;
            sp.spriteFrame = this._panelSf;
            sp.type = Sprite.Type.SIMPLE;
        }
        this._panel = panel;

        const track = new Node('Track');
        track.layer = root.layer;
        track.setParent(panel);
        track.setPosition(this.TRACK_X, this.TRACK_Y, 0);
        track.addComponent(UITransform).setContentSize(this.TRACK_W, this.TRACK_H);
        // Clip bar/fish to the water column so stretched edges never cover wood.
        const mask = track.addComponent(Mask);
        mask.type = Mask.Type.GRAPHICS_RECT;
        mask.inverted = false;

        const bar = new Node('Bar');
        bar.layer = root.layer;
        bar.setParent(track);
        const barW = Math.max(20, this.TRACK_W - this.BAR_INSET_X * 2);
        bar.addComponent(UITransform).setContentSize(barW, 120);
        if (this._barSf) {
            // Vertical 9-slice only — left/right slice was collapsing the AI bar to a hairline.
            this._barSf.insetTop = 18;
            this._barSf.insetBottom = 18;
            this._barSf.insetLeft = 0;
            this._barSf.insetRight = 0;
            const sp = bar.addComponent(Sprite);
            sp.sizeMode = Sprite.SizeMode.CUSTOM;
            sp.trim = false;
            sp.type = Sprite.Type.SLICED;
            sp.spriteFrame = this._barSf;
            // Stardew: solid opaque green paddle (AI texture, fish draws on top).
            sp.color = new Color(255, 255, 255, 255);
        }
        this._barNode = bar;

        const fish = new Node('Fish');
        fish.layer = root.layer;
        fish.setParent(track);
        fish.addComponent(UITransform).setContentSize(this.FISH_SIZE, this.FISH_SIZE);
        if (this._fishSf) {
            const sp = fish.addComponent(Sprite);
            sp.sizeMode = Sprite.SizeMode.CUSTOM;
            sp.trim = false;
            sp.spriteFrame = this._fishSf;
        }
        this._fishNode = fish;

        const prog = new Node('Progress');
        prog.layer = root.layer;
        prog.setParent(panel);
        prog.setPosition(this.PROG_X, this.TRACK_Y, 0);
        prog.addComponent(UITransform).setContentSize(this.PROG_W + 4, this.TRACK_H);
        this._progG = prog.addComponent(Graphics);

        const bannerN = new Node('Banner');
        bannerN.layer = root.layer;
        bannerN.setParent(root);
        bannerN.setPosition(-180, 24 + this.PANEL_H * 0.5 + 36, 0);
        bannerN.addComponent(UITransform).setContentSize(320, 52);
        const banner = bannerN.addComponent(Label);
        banner.string = '';
        banner.horizontalAlign = Label.HorizontalAlign.CENTER;
        banner.verticalAlign = Label.VerticalAlign.CENTER;
        styleUiLabel(banner, {
            size: 40,
            color: new Color(255, 236, 160, 255),
            outline: true,
            outlineWidth: 5,
            outlineColor: new Color(40, 24, 12, 240),
        });
        bannerN.active = false;
        this._banner = banner;

        const hintN = new Node('Hint');
        hintN.layer = root.layer;
        hintN.setParent(panel);
        hintN.setPosition(0, -this.PANEL_H * 0.5 - 32, 0);
        hintN.addComponent(UITransform).setContentSize(400, 40);
        const hint = hintN.addComponent(Label);
        hint.string = '按住上升 · 松开下落';
        hint.horizontalAlign = Label.HorizontalAlign.CENTER;
        styleUiLabel(hint, {
            size: 26,
            color: new Color(240, 228, 200, 255),
            outline: true,
            outlineWidth: 3,
            outlineColor: new Color(30, 20, 12, 220),
        });
        this._hint = hint;

        loadUiFont().then((font) => {
            if (!font) return;
            if (bannerN.isValid) applyUiFont(banner);
            if (hintN.isValid) applyUiFont(hint);
        });
    }

    private layoutDynamic() {
        const th = this.TRACK_H;
        const halfH = th * 0.5;

        if (this._barNode?.isValid) {
            const bh = Math.max(72, this._barH * th);
            const by = -halfH + this._barY * th + bh * 0.5;
            const ui = this._barNode.getComponent(UITransform);
            const bw = Math.max(24, this.TRACK_W - this.BAR_INSET_X * 2);
            ui?.setContentSize(bw, bh);
            this._barNode.setPosition(0, by, 0);
        }

        if (this._fishNode?.isValid) {
            const fy = -halfH + this._fishY * th;
            this._fishNode.setPosition(0, fy, 0);
        }

        if (this._progG) {
            const g = this._progG;
            g.clear();
            // Fill only — empty groove is already in the panel art and shares track height.
            const pw = this.PROG_W;
            const ph = th;
            const fillH = Math.max(0, Math.round(this._progress * ph));
            if (fillH > 0) {
                const x0 = -pw * 0.5;
                const y0 = -ph * 0.5;
                // Stardew progress fill: pale yellow-green (not neon lime).
                const col =
                    this._progress > 0.7
                        ? new Color(210, 230, 120, 255)
                        : this._progress > 0.35
                          ? new Color(200, 210, 90, 255)
                          : new Color(200, 150, 60, 255);
                g.fillColor = col;
                g.rect(x0, y0, pw, fillH);
                g.fill();
                g.fillColor = new Color(
                    Math.min(255, col.r + 28),
                    Math.min(255, col.g + 22),
                    Math.min(255, col.b + 20),
                    255,
                );
                g.rect(x0, y0, Math.max(2, Math.floor(pw * 0.3)), fillH);
                g.fill();
            }
        }
    }

    private bindInput(on: boolean) {
        if (on) {
            // Pointer hold lifts the bar. Stick/move stays locked via moveLocked.
            input.on(Input.EventType.MOUSE_DOWN, this.onMouseDown, this);
            input.on(Input.EventType.MOUSE_UP, this.onMouseUp, this);
            input.on(Input.EventType.TOUCH_START, this.onTouchStart, this);
            input.on(Input.EventType.TOUCH_END, this.onTouchEnd, this);
            input.on(Input.EventType.TOUCH_CANCEL, this.onTouchEnd, this);
            input.on(Input.EventType.KEY_DOWN, this.onKeyDown, this);
        } else {
            input.off(Input.EventType.MOUSE_DOWN, this.onMouseDown, this);
            input.off(Input.EventType.MOUSE_UP, this.onMouseUp, this);
            input.off(Input.EventType.TOUCH_START, this.onTouchStart, this);
            input.off(Input.EventType.TOUCH_END, this.onTouchEnd, this);
            input.off(Input.EventType.TOUCH_CANCEL, this.onTouchEnd, this);
            input.off(Input.EventType.KEY_DOWN, this.onKeyDown, this);
            this._holding = false;
        }
    }

    private onMouseDown(e: EventMouse) {
        if (e.getButton() === EventMouse.BUTTON_LEFT && this._active && !this._ended) {
            this._holding = true;
        }
    }

    private onMouseUp(e: EventMouse) {
        if (e.getButton() === EventMouse.BUTTON_LEFT) this._holding = false;
    }

    private onTouchStart(_e: EventTouch) {
        if (this._active && !this._ended) this._holding = true;
    }

    private onTouchEnd(_e: EventTouch) {
        this._holding = false;
    }

    private onKeyDown(e: EventKeyboard) {
        if (!this._active || this._ended) return;
        if (e.keyCode === KeyCode.ESCAPE) this.finish('escape');
    }

    onDestroy() {
        this.bindInput(false);
        if (this._active) {
            InputBridge.uiBlocking = this._prevBlocking;
            InputBridge.moveLocked = this._prevMoveLocked;
            InputBridge.clear();
        }
    }
}
