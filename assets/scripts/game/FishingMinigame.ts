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
    Prefab,
    Sprite,
    SpriteFrame,
    UIOpacity,
    UITransform,
    assetManager,
    input,
    instantiate,
    tween,
} from 'cc';
import { FISHING_FRAMES } from './FishingFrames';
import {
    FISHING_MINIGAME_LAYOUT as L,
    FISHING_MINIGAME_PREFAB_UUID,
} from './FishingMinigameFrames';
import { InputBridge } from './InputBridge';
import { applyUiFont, loadUiFont, styleUiLabel } from './UiFont';

const { ccclass } = _decorator;

export type FishingResult = 'catch' | 'perfect' | 'escape';

type CoachKind = 'hold' | 'release' | 'steady' | 'hurry' | 'ready';

/** Stardew-like vertical fishing bar — hold pad lifts the green zone. */
@ccclass('FishingMinigame')
export class FishingMinigame extends Component {
    private _root: Node | null = null;
    private _panel: Node | null = null;
    private _barNode: Node | null = null;
    private _fishNode: Node | null = null;
    private _progG: Graphics | null = null;
    private _banner: Label | null = null;
    private _holdLabel: Label | null = null;
    private _holdSp: Sprite | null = null;
    private _holdN: Node | null = null;
    private _barSp: Sprite | null = null;

    private _panelSf: SpriteFrame | null = null;
    private _barSf: SpriteFrame | null = null;
    /** Red AI paddle when fish is outside the catch zone. */
    private _barMissSf: SpriteFrame | null = null;
    private _fishSf: SpriteFrame | null = null;
    private _holdSf: SpriteFrame | null = null;
    private _holdPressedSf: SpriteFrame | null = null;
    private _holdReleaseSf: SpriteFrame | null = null;
    private _framesReady = false;
    private _loadGen = 0;
    private _barShowingMiss = false;
    private _holdKind: 'idle' | 'pressed' | 'release' = 'idle';

    private _active = false;
    private _holding = false;
    private _perfect = true;
    private _ended = false;
    private _fishIn = false;
    private _coach: CoachKind = 'ready';
    private _age = 0;
    private _pulseT = 0;

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
    private _prefab: Prefab | null = null;
    private _ready = false;
    private _chromePainted = false;

    /** True from open() until the result banner finishes. */
    get isOpen(): boolean {
        return this._active || !!this._root?.active;
    }

    onLoad() {
        this.loadPrefab();
        this.ensureFrames();
    }

    /** Seconds after open with no progress drain (reaction window). */
    private _grace = 0;
    /** First mainline cast — longer grace + gentler start. */
    private _tutorial = false;

    /**
     * Open the minigame overlay.
     * @param difficulty 0 easy … 1 hard (shorter bar, faster fish, harsher drain).
     */
    open(
        difficulty = 0.4,
        onDone?: (r: FishingResult) => void,
        opts?: { tutorial?: boolean },
    ) {
        if (this._active) this.close(false);
        this._onDone = onDone ?? null;
        this._tutorial = !!opts?.tutorial;
        this._diff = Math.max(0.15, Math.min(0.9, difficulty));
        // ~34% track easy → ~24% hard — must track the fish, not AFK.
        this._barH = 0.36 - this._diff * 0.14;
        this._barVel = 0;
        // Fish starts mid/high; bar starts near bottom so you have to lift.
        this._fishY = 0.42 + Math.random() * 0.28;
        this._fishTarget = this._fishY;
        this._fishRetarget = 0.25 + Math.random() * 0.35;
        this._barY = 0.02 + Math.random() * 0.06;
        // Tutorial: start fuller + give a longer reaction window before drain.
        this._progress = this._tutorial ? 0.42 : 0.28;
        this._grace = this._tutorial ? 1.35 : 0.35;
        this._holding = false;
        this._perfect = true;
        this._ended = false;
        this._fishIn = false;
        this._barShowingMiss = true;
        this._coach = 'ready';
        this._age = 0;
        this._pulseT = 0;
        this._active = true;

        this._prevBlocking = InputBridge.uiBlocking;
        this._prevMoveLocked = InputBridge.moveLocked;
        InputBridge.uiBlocking = true;
        InputBridge.moveLocked = true;
        InputBridge.clear();
        // Kill any in-flight press so the cast tap / hold never becomes a stick.
        InputBridge.abortStick?.();

        this.whenReady(() => {
            if (!this._active) return;
            this.showUi();
            this.bindInput(true);
            this.layoutDynamic();
            this.refreshHoldPad();
        });
    }

    /** Force-close without rewarding (cancel walk / tool swap). */
    close(notify = true) {
        if (!this._active && !this._root?.active) return;
        this.bindInput(false);
        this._active = false;
        this._ended = true;
        InputBridge.uiBlocking = this._prevBlocking;
        InputBridge.moveLocked = this._prevMoveLocked;
        InputBridge.clear();
        InputBridge.abortStick?.();
        this.hideUi();
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
        this._age += t;
        this._pulseT += t;
        if (this._grace > 0) this._grace = Math.max(0, this._grace - t);

        // Stardew-like: hold lifts hard, release falls with gravity.
        const lift = 700 + this._diff * 80;
        const grav = 560 + this._diff * 180;
        if (this._holding) this._barVel += lift * t;
        else this._barVel -= grav * t;
        this._barVel *= 1 - Math.min(0.85, 1.4 * t);
        this._barVel = Math.max(-620, Math.min(680, this._barVel));
        this._barY += (this._barVel / L.trackH) * t;
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
        this._fishIn = fishIn;
        if (fishIn) {
            this._progress += (0.26 - this._diff * 0.05) * t;
        } else if (this._grace <= 0) {
            this._perfect = false;
            this._progress -= (0.16 + this._diff * 0.14) * t;
        }
        this._progress = Math.max(0, Math.min(1, this._progress));

        this.refreshCoach();
        this.layoutDynamic();
        this.refreshHoldPad();

        if (this._progress >= 1) {
            this.finish(this._perfect ? 'perfect' : 'catch');
        } else if (this._progress <= 0) {
            this.finish('escape');
        }
    }

    private refreshCoach() {
        const barMid = this._barY + this._barH * 0.5;
        const slack = this._barH * 0.18;
        let kind: CoachKind;
        if (this._grace > 0.45 && this._age < 1.2) {
            kind = 'ready';
        } else if (this._fishIn) {
            kind = this._progress < 0.22 ? 'hurry' : 'steady';
        } else if (this._fishY > barMid + slack) {
            kind = 'hold';
        } else if (this._fishY < barMid - slack) {
            kind = 'release';
        } else {
            kind = 'hold';
        }
        this._coach = kind;

        if (this._holdLabel) {
            // Keep the pad face clean — text only for the first tip / release cue.
            if (this._holding) this._holdLabel.string = '';
            else if (kind === 'release') this._holdLabel.string = '松开';
            else if (this._age < 2.8 || this._tutorial) this._holdLabel.string = '按住';
            else this._holdLabel.string = '';
        }
    }

    private finish(result: FishingResult) {
        if (this._ended) return;
        this._ended = true;
        this._active = false;
        this.bindInput(false);
        // Keep locks through the result banner — releasing early let hold become walk.
        InputBridge.uiBlocking = true;
        InputBridge.moveLocked = true;
        InputBridge.clear();
        InputBridge.abortStick?.();

        if (this._banner) {
            if (result === 'perfect') this._banner.string = '完美!';
            else if (result === 'catch') this._banner.string = '钓到了!';
            else this._banner.string = '跑掉了…';
            this._banner.node.active = true;
        }

        const cb = this._onDone;
        this._onDone = null;
        const root = this._root;
        tween(root ?? this.node)
            .delay(result === 'escape' ? 0.55 : 0.7)
            .call(() => {
                this.hideUi();
                InputBridge.uiBlocking = this._prevBlocking;
                InputBridge.moveLocked = this._prevMoveLocked;
                InputBridge.clear();
                cb?.(result);
            })
            .start();
    }

    private whenReady(fn: () => void) {
        if (this._ready) {
            if (this._root) fn();
            return;
        }
        const tick = () => {
            if (!this._ready) {
                this.scheduleOnce(tick, 0);
                return;
            }
            if (this._root) fn();
        };
        tick();
    }

    private hideUi() {
        if (this._root?.isValid) this._root.active = false;
        if (this._banner) this._banner.node.active = false;
        this._barShowingMiss = false;
        this._holdKind = 'idle';
    }

    private showUi() {
        const root = this._root;
        if (!root?.isValid) return;
        root.active = true;
        root.setSiblingIndex(this.node.children.length - 1);
        this.paintChromeOnce();
        if (this._banner) {
            this._banner.string = '';
            this._banner.node.active = false;
        }
        if (this._holdLabel) this._holdLabel.string = '按住';
        // Start red (miss) — fish usually begins above the paddle.
        if (this._barSp) {
            const startMiss = !this._fishIn;
            this._barShowingMiss = startMiss;
            const sf = (startMiss ? this._barMissSf : this._barSf) ?? this._barSf;
            if (sf) this._barSp.spriteFrame = sf;
        }
        this._holdKind = 'idle';
        if (this._holdSp && this._holdSf) this._holdSp.spriteFrame = this._holdSf;
        if (this._holdN?.isValid) {
            this._holdN.setScale(1, 1, 1);
            this._holdN.setPosition(L.holdX, L.holdY, 0);
        }
    }

    private ensureFrames(done?: () => void) {
        if (
            this._framesReady &&
            this._panelSf &&
            this._barSf &&
            this._barMissSf &&
            this._fishSf &&
            this._holdSf &&
            this._holdPressedSf &&
            this._holdReleaseSf
        ) {
            done?.();
            return;
        }
        const gen = ++this._loadGen;
        type FrameKey =
            | 'panel'
            | 'bar'
            | 'barMiss'
            | 'fish'
            | 'hold'
            | 'holdPressed'
            | 'holdRelease';
        const jobs: { key: FrameKey; uuid: string }[] = [
            { key: 'panel', uuid: FISHING_FRAMES.panel },
            { key: 'bar', uuid: FISHING_FRAMES.bar },
            { key: 'barMiss', uuid: FISHING_FRAMES.barMiss },
            { key: 'fish', uuid: FISHING_FRAMES.fish },
            { key: 'hold', uuid: FISHING_FRAMES.hold },
            { key: 'holdPressed', uuid: FISHING_FRAMES.holdPressed },
            { key: 'holdRelease', uuid: FISHING_FRAMES.holdRelease },
        ];
        let left = jobs.length;
        const finishOne = () => {
            left--;
            if (left > 0 || gen !== this._loadGen) return;
            this._framesReady = !!(
                this._panelSf &&
                this._barSf &&
                this._barMissSf &&
                this._fishSf &&
                this._holdSf &&
                this._holdPressedSf &&
                this._holdReleaseSf
            );
            if (this._framesReady) this.paintChromeOnce();
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
                    else if (job.key === 'barMiss') this._barMissSf = asset as SpriteFrame;
                    else if (job.key === 'fish') this._fishSf = asset as SpriteFrame;
                    else if (job.key === 'hold') this._holdSf = asset as SpriteFrame;
                    else if (job.key === 'holdPressed') this._holdPressedSf = asset as SpriteFrame;
                    else this._holdReleaseSf = asset as SpriteFrame;
                }
                finishOne();
            });
        }
    }

    private loadPrefab() {
        const canvas = this.node;
        for (const name of ['FishingMinigame']) {
            const old = canvas.getChildByName(name);
            if (old) old.destroy();
        }
        assetManager.loadAny({ uuid: FISHING_MINIGAME_PREFAB_UUID }, (err, asset) => {
            if (err || !asset) {
                console.warn('[FishingMinigame] prefab missing', err);
                this._ready = true;
                return;
            }
            this._prefab = asset as Prefab;
            const inst = instantiate(this._prefab);
            inst.name = 'FishingMinigame';
            inst.layer = canvas.layer;
            inst.setParent(canvas);
            inst.active = false;
            this._root = inst;
            this.bindRefs(inst);
            this.paintChromeOnce();
            this._ready = true;
        });
    }

    private bindRefs(root: Node) {
        root.getComponent(UIOpacity) ?? root.addComponent(UIOpacity);
        this._panel = root.getChildByName('Panel');
        const track = this._panel?.getChildByName('Track') ?? null;
        if (track && !track.getComponent(Mask)) {
            const mask = track.addComponent(Mask);
            mask.type = Mask.Type.GRAPHICS_RECT;
            mask.inverted = false;
        }
        this._barNode = track?.getChildByName('Bar') ?? null;
        this._fishNode = track?.getChildByName('Fish') ?? null;
        this._barSp = this._barNode?.getComponent(Sprite) ?? null;
        if (this._barSp) {
            this._barSp.sizeMode = Sprite.SizeMode.CUSTOM;
            this._barSp.trim = false;
            this._barSp.type = Sprite.Type.SLICED;
        }
        const fishSp = this._fishNode?.getComponent(Sprite);
        if (fishSp) {
            fishSp.sizeMode = Sprite.SizeMode.CUSTOM;
            fishSp.trim = false;
        }
        const prog = this._panel?.getChildByName('Progress');
        this._progG = prog?.getComponent(Graphics) ?? null;
        this._banner = root.getChildByName('Banner')?.getComponent(Label) ?? null;
        this._holdN = root.getChildByName('HoldPad');
        this._holdSp = this._holdN?.getComponent(Sprite) ?? null;
        if (this._holdSp) {
            this._holdSp.sizeMode = Sprite.SizeMode.CUSTOM;
            this._holdSp.trim = false;
        }
        this._holdLabel = this._holdN?.getChildByName('HoldLab')?.getComponent(Label) ?? null;

        if (this._banner) {
            styleUiLabel(this._banner, {
                size: 40,
                color: new Color(255, 236, 160, 255),
                outline: true,
                outlineWidth: 5,
                outlineColor: new Color(40, 24, 12, 240),
            });
            this._banner.horizontalAlign = Label.HorizontalAlign.CENTER;
            this._banner.verticalAlign = Label.VerticalAlign.CENTER;
        }
        if (this._holdLabel) {
            styleUiLabel(this._holdLabel, {
                size: 26,
                color: new Color(255, 248, 220, 255),
                outline: true,
                outlineWidth: 4,
                outlineColor: new Color(28, 40, 18, 240),
            });
            this._holdLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
            this._holdLabel.verticalAlign = Label.VerticalAlign.CENTER;
        }
        loadUiFont().then((font) => {
            if (!font) return;
            if (this._banner) applyUiFont(this._banner);
            if (this._holdLabel) applyUiFont(this._holdLabel);
        });
    }

    private paintChromeOnce() {
        if (!this._root?.isValid) return;
        if (!this._chromePainted) {
            const dim = this._root.getChildByName('Dim')?.getComponent(Graphics);
            if (dim) {
                dim.clear();
                dim.fillColor = new Color(10, 16, 26, 110);
                dim.rect(-1100, -2000, 2200, 4000);
                dim.fill();
            }
            this._chromePainted = true;
        }
        const applyBarInsets = (sf: SpriteFrame | null) => {
            if (!sf) return;
            // Vertical 9-slice only — left/right slice was collapsing the AI bar to a hairline.
            sf.insetTop = 18;
            sf.insetBottom = 18;
            sf.insetLeft = 0;
            sf.insetRight = 0;
        };
        applyBarInsets(this._barSf);
        applyBarInsets(this._barMissSf);
        if (this._panelSf) {
            const sp = this._panel?.getComponent(Sprite);
            if (sp) sp.spriteFrame = this._panelSf;
        }
        if (this._fishSf) {
            const sp = this._fishNode?.getComponent(Sprite);
            if (sp) sp.spriteFrame = this._fishSf;
        }
        if (this._holdSf && this._holdSp && this._holdKind === 'idle') {
            this._holdSp.spriteFrame = this._holdSf;
        }
    }

    private refreshHoldPad() {
        const sp = this._holdSp;
        const n = this._holdN;
        if (!sp || !n?.isValid) return;

        const needRelease = this._coach === 'release' && !this._holding;
        let kind: 'idle' | 'pressed' | 'release' = 'idle';
        if (this._holding) kind = 'pressed';
        else if (needRelease) kind = 'release';

        if (kind !== this._holdKind) {
            this._holdKind = kind;
            const sf =
                kind === 'pressed'
                    ? this._holdPressedSf
                    : kind === 'release'
                      ? this._holdReleaseSf
                      : this._holdSf;
            if (sf) sp.spriteFrame = sf;
        }

        // Soft breathe on idle so the AI pad still reads as the tap target.
        if (!this._holding && (this._coach === 'hold' || this._coach === 'ready' || this._age < 2.5)) {
            const wave = 0.5 + 0.5 * Math.sin(this._pulseT * 4.2);
            const s = 1 + wave * 0.04;
            n.setScale(s, s, 1);
            n.setPosition(L.holdX, L.holdY - (this._holding ? 4 : 0), 0);
        } else {
            n.setScale(this._holding ? 0.96 : 1, this._holding ? 0.96 : 1, 1);
            n.setPosition(L.holdX, this._holding ? L.holdY - 4 : L.holdY, 0);
        }
    }

    private layoutDynamic() {
        const th = L.trackH;
        const halfH = th * 0.5;

        if (this._barNode?.isValid) {
            const bh = Math.max(72, this._barH * th);
            const by = -halfH + this._barY * th + bh * 0.5;
            const ui = this._barNode.getComponent(UITransform);
            const bw = Math.max(24, L.trackW - L.barInsetX * 2);
            ui?.setContentSize(bw, bh);
            this._barNode.setPosition(0, by, 0);
            if (this._barSp) {
                // Swap AI green/red paddle art — no runtime tint.
                const wantMiss = !this._fishIn;
                if (wantMiss !== this._barShowingMiss) {
                    this._barShowingMiss = wantMiss;
                    const sf = wantMiss ? this._barMissSf : this._barSf;
                    if (sf) this._barSp.spriteFrame = sf;
                }
                this._barSp.color = new Color(255, 255, 255, 255);
            }
        }

        if (this._fishNode?.isValid) {
            const bob = Math.sin(this._age * 9) * 2.2;
            const fy = -halfH + this._fishY * th + bob;
            this._fishNode.setPosition(0, fy, 0);
            const sp = this._fishNode.getComponent(Sprite);
            if (sp) {
                sp.color = this._fishIn
                    ? new Color(255, 255, 255, 255)
                    : new Color(255, 210, 200, 255);
            }
            const scale = this._fishIn ? 1.08 + Math.sin(this._pulseT * 10) * 0.04 : 1;
            this._fishNode.setScale(scale, scale, 1);
        }

        if (this._progG) {
            const g = this._progG;
            g.clear();
            // Fill only — empty groove is already in the panel art and shares track height.
            const pw = L.progW;
            const ph = th;
            const fillH = Math.max(0, Math.round(this._progress * ph));
            if (fillH > 0) {
                const x0 = -pw * 0.5;
                const y0 = -ph * 0.5;
                const danger = this._progress < 0.22 && !this._fishIn;
                const col = danger
                    ? new Color(220, 110, 70, 255)
                    : this._progress > 0.7
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
                if (danger) {
                    const flash = 0.4 + 0.6 * Math.abs(Math.sin(this._pulseT * 9));
                    g.strokeColor = new Color(255, 180, 100, Math.floor(flash * 220));
                    g.lineWidth = 2;
                    g.rect(x0 - 1, y0, pw + 2, Math.max(8, fillH));
                    g.stroke();
                }
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
            input.on(Input.EventType.KEY_UP, this.onKeyUp, this);
        } else {
            input.off(Input.EventType.MOUSE_DOWN, this.onMouseDown, this);
            input.off(Input.EventType.MOUSE_UP, this.onMouseUp, this);
            input.off(Input.EventType.TOUCH_START, this.onTouchStart, this);
            input.off(Input.EventType.TOUCH_END, this.onTouchEnd, this);
            input.off(Input.EventType.TOUCH_CANCEL, this.onTouchEnd, this);
            input.off(Input.EventType.KEY_DOWN, this.onKeyDown, this);
            input.off(Input.EventType.KEY_UP, this.onKeyUp, this);
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
        if (e.keyCode === KeyCode.ESCAPE) {
            this.finish('escape');
            return;
        }
        // Space / Enter also lift — helpful when playtesting on desktop.
        if (
            e.keyCode === KeyCode.SPACE ||
            e.keyCode === KeyCode.ENTER ||
            e.keyCode === KeyCode.KEY_W ||
            e.keyCode === KeyCode.ARROW_UP
        ) {
            this._holding = true;
        }
    }

    private onKeyUp(e: EventKeyboard) {
        if (
            e.keyCode === KeyCode.SPACE ||
            e.keyCode === KeyCode.ENTER ||
            e.keyCode === KeyCode.KEY_W ||
            e.keyCode === KeyCode.ARROW_UP
        ) {
            this._holding = false;
        }
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
