import {
    _decorator,
    assetManager,
    Color,
    Component,
    EventMouse,
    EventTouch,
    Graphics,
    Input,
    Label,
    Node,
    Sprite,
    SpriteFrame,
    UIOpacity,
    UITransform,
    Vec3,
    input,
    tween,
    Tween,
} from 'cc';
import { DIALOGUE_PORTRAIT_FRAMES } from './DialoguePortraitFrames';
import { InputBridge } from './InputBridge';
import { playUiClick } from './UiAudio';
import { UI_CREAM, UI_GOLD, UI_WOOD, UI_WOOD_DARK, drawDialogueChrome } from './UiChrome';
import { applyUiFont, loadUiFont, styleUiLabel } from './UiFont';

const { ccclass } = _decorator;

export type DialogueLine = {
    /** Empty / omit = narration (no name plate / avatar). */
    speaker?: string;
    text: string;
};

const BOX_W = 1000;
const BOX_H = 260;
/** Low on the portrait frame — HUD chrome is hidden while open. */
const BOX_Y = -780;

/** Headshot above the name plate (96px nearest portrait). */
const AVATAR = 96;
const AVATAR_FRAME = 108;
const NAME_PLATE_W = 220;
const NAME_PLATE_H = 48;
/** Name stack X — left lip of the dialogue box. */
const NAME_STACK_X = -BOX_W * 0.5 + 130;

const FADE_IN = 0.18;
const FADE_OUT = 0.12;
/** Block input until fade finishes + a short beat (prevents open-click eating line 1). */
const INPUT_GUARD_SEC = FADE_IN + 0.35;

/** Speaker display name → headshot SpriteFrame uuid (`@f9941`). */
function portraitUuidForSpeaker(speaker: string): string | null {
    const s = speaker.trim();
    if (!s) return null;
    if (s === '露穗' || s.includes('露穗')) return DIALOGUE_PORTRAIT_FRAMES.girl;
    if (s.includes('艾岚') || s.includes('镇长')) return DIALOGUE_PORTRAIT_FRAMES.mayor;
    if (s.includes('石楠') || s.includes('工匠')) return DIALOGUE_PORTRAIT_FRAMES.carpenter;
    if (s.includes('荷叶') || s.includes('医生')) return DIALOGUE_PORTRAIT_FRAMES.doctor;
    if (s.includes('苔青') || s.includes('管理员')) return DIALOGUE_PORTRAIT_FRAMES.caretaker;
    if (s === '路人' || s.includes('路人')) return DIALOGUE_PORTRAIT_FRAMES.passerby;
    if (s === '你') return DIALOGUE_PORTRAIT_FRAMES.farmer;
    return null;
}

function bodyY(hasSpeaker: boolean): number {
    return hasSpeaker ? 78 : 96;
}

/**
 * Visual HUD that overlaps the dialogue band.
 * Never hide TouchControls — that node owns TouchJoystick input listeners.
 */
const HUD_CHROME = [
    'FarmHotbar',
    'QuestHud',
    'QuestTracker',
    'QuestBtn',
    'FarmActionHint',
    'FarmToolTip',
    'FarmActionBtn',
    'FarmUseBtn',
];

/**
 * Bottom dialogue — tap to advance. Hint: 点击继续.
 * Uses uiBlocking only (never moveLocked).
 */
@ccclass('DialoguePanel')
export class DialoguePanel extends Component {
    private _root: Node | null = null;
    private _nameLab: Label | null = null;
    private _namePlate: Node | null = null;
    private _bodyLab: Label | null = null;
    private _portraitRoot: Node | null = null;
    private _portraitSp: Sprite | null = null;
    private _hintRoot: Node | null = null;
    private _hintLab: Label | null = null;
    private _hintArrow: Node | null = null;
    private _hintOp: UIOpacity | null = null;
    private _rootOp: UIOpacity | null = null;
    private _hintBaseY = 0;
    private _arrowBaseY = 18;
    private _sfCache = new Map<string, SpriteFrame>();
    private _portraitLoadGen = 0;
    private _hasPortrait = false;

    private _lines: DialogueLine[] = [];
    private _index = 0;
    private _onDone: (() => void) | null = null;
    private _prevBlocking = false;
    private _open = false;
    private _listening = false;
    private _inputReady = false;
    private _busy = false;
    private _lastAdvanceAt = 0;
    private _openedAt = 0;
    private _chromeWas: Map<string, boolean> = new Map();
    private _fadeGen = 0;
    private _fontReady = false;
    private _pending: { lines: DialogueLine[]; onDone?: () => void } | null = null;

    get isOpen() {
        return this._open;
    }

    /** GM / skip: close immediately without running the play `onDone` callback. */
    forceClose() {
        this._pending = null;
        this._onDone = null;
        this._lines = [];
        this._index = 0;
        this._busy = false;
        if (this._open) this.hide();
    }

    onLoad() {
        this.build();
        this.hideVisualImmediate();
        // Never show with system-font fallback — swapping to UI font is the flash.
        loadUiFont().then(() => {
            this.applyFonts();
            this._fontReady = true;
            const pending = this._pending;
            this._pending = null;
            if (pending) this.beginPlay(pending.lines, pending.onDone);
        });
    }

    onDestroy() {
        this.unlisten();
        this.killFades();
        this.unschedule(this.enableInput);
        if (this._open) {
            this.restoreChrome();
            InputBridge.uiBlocking = this._prevBlocking;
        }
    }

    update() {
        if (!this._open) return;
        // Keep hotbar tucked; world + player stay visible (no full-screen dim).
        this.ensureChromeHidden();
    }

    /** Play a script; replaces any current lines. */
    play(lines: DialogueLine[], onDone?: () => void) {
        if (!lines.length) {
            onDone?.();
            return;
        }
        // Font is warm after AssetWarmup — don't defer (avoids gate→world flash).
        if (!this._fontReady) {
            void loadUiFont().then(() => {
                this._fontReady = true;
                this.applyFonts();
            });
        }
        this.beginPlay(lines, onDone);
    }

    /** Snap opaque while LoadingScreen still covers — then the gate can lift cleanly. */
    async ensureCovered(_timeoutMs = 500): Promise<void> {
        if (!this._open || !this._root?.isValid) return;
        this.killFades();
        if (this._rootOp) this._rootOp.opacity = 255;
        this._root.active = true;
        this.ensureChromeHidden();
        this.bringToFront();
    }

    private beginPlay(lines: DialogueLine[], onDone?: () => void) {
        if (this._open) {
            const prev = this._onDone;
            this._onDone = null;
            prev?.();
        }
        this._lines = lines;
        this._index = 0;
        this._onDone = onDone ?? null;
        this.applyFonts();
        this.renderLine();
        this.show();
    }

    private applyFonts() {
        if (this._nameLab) applyUiFont(this._nameLab);
        if (this._bodyLab) applyUiFont(this._bodyLab);
        if (this._hintLab) applyUiFont(this._hintLab);
        this.ensureBodyLayout();
    }

    /**
     * From GameBootstrap stick.onTap — advance + consume while open.
     * Global input listeners also call tryAdvance; 280ms debounce merges
     * mouse+touch double-fires. Returning true after finish() keeps the
     * tap from leaking into farm/world actions.
     */
    handleTap(_uiX: number, _uiY: number): boolean {
        if (!this._open) return false;
        this.tryAdvance();
        return true;
    }

    private tryAdvance() {
        if (!this._open || this._busy) return;
        // scheduleOnce can miss after editor hot-reload — accept taps once guard elapsed.
        if (!this._inputReady) {
            if (Date.now() - this._openedAt < INPUT_GUARD_SEC * 1000) return;
            this.enableInput();
        }
        if (!this._inputReady) return;
        // Mouse+touch often both fire for one desktop click — one advance only.
        const now = Date.now();
        if (now - this._lastAdvanceAt < 280) return;
        this._lastAdvanceAt = now;
        this._busy = true;
        try {
            playUiClick();
            if (this._index + 1 < this._lines.length) {
                this._index += 1;
                this.renderLine();
            } else {
                this.finish();
            }
        } finally {
            this._busy = false;
        }
    }

    private finish() {
        const done = this._onDone;
        this._onDone = null;
        this._lines = [];
        this._index = 0;
        this.hide(() => done?.());
    }

    private renderLine() {
        const line = this._lines[this._index];
        if (!line) return;
        const speaker = (line.speaker ?? '').trim();
        const uuid = portraitUuidForSpeaker(speaker);
        this._hasPortrait = !!uuid;
        if (this._namePlate) this._namePlate.active = !!speaker;
        if (this._nameLab) this._nameLab.string = speaker || ' ';
        this.layoutChrome(!!speaker, this._hasPortrait);
        this.setPortrait(uuid);
        if (this._bodyLab) {
            this._bodyLab.string = line.text;
            this.ensureBodyLayout();
        }
        if (this._hintLab) {
            this._hintLab.string = '点击继续';
            this._hintLab.node.getComponent(UITransform)?.setContentSize(200, 32);
        }
        this.startHintPulse();
    }

    private layoutChrome(hasSpeaker: boolean, hasPortrait: boolean) {
        const nameY = BOX_H * 0.5 + 2;
        if (this._namePlate) {
            this._namePlate.setPosition(NAME_STACK_X, nameY, 0);
        }
        if (this._portraitRoot) {
            // Headshot sits directly above the name plate (may peek above the box).
            const avatarY = nameY + NAME_PLATE_H * 0.5 + 8 + AVATAR_FRAME * 0.5;
            this._portraitRoot.setPosition(NAME_STACK_X, avatarY, 0);
            this._portraitRoot.active = hasPortrait && hasSpeaker;
        }
        if (this._bodyLab) {
            this._bodyLab.node.setPosition(0, bodyY(hasSpeaker), 0);
        }
    }

    private setPortrait(uuid: string | null) {
        if (!this._portraitSp || !this._portraitRoot) return;
        if (!uuid) {
            this._portraitLoadGen += 1;
            this._portraitSp.spriteFrame = null;
            this._portraitRoot.active = false;
            return;
        }
        this._portraitRoot.active = true;
        const cached = this._sfCache.get(uuid);
        if (cached) {
            this._portraitSp.spriteFrame = cached;
            return;
        }
        const gen = ++this._portraitLoadGen;
        assetManager.loadAny({ uuid }, (err, asset) => {
            if (gen !== this._portraitLoadGen || !this._portraitSp?.isValid) return;
            if (err || !asset) {
                this._portraitSp.spriteFrame = null;
                return;
            }
            const sf = asset as SpriteFrame;
            this._sfCache.set(uuid, sf);
            this._portraitSp.spriteFrame = sf;
        });
    }

    private show() {
        if (!this._open) {
            this._prevBlocking = InputBridge.uiBlocking;
            InputBridge.uiBlocking = true;
            InputBridge.clear();
            this._chromeWas.clear();
        }
        this._open = true;
        this._inputReady = false;
        this._openedAt = Date.now();
        this.unschedule(this.enableInput);
        this.unlisten();
        this.fadeIn();
        // Accept taps only after the box is readable — kills open-click skip.
        this.scheduleOnce(this.enableInput, INPUT_GUARD_SEC);
    }

    private enableInput = () => {
        if (!this._open) return;
        this._inputReady = true;
        this.listen();
        this.startHintPulse();
    };

    private hide(after?: () => void) {
        if (!this._open) {
            after?.();
            return;
        }
        this._open = false;
        this._inputReady = false;
        this.stopHintPulse();
        this.unschedule(this.enableInput);
        this.unlisten();
        // Unlock immediately — waiting for fadeOut left uiBlocking stuck when a
        // nested play() captured prevBlocking=true mid-fade.
        this.releaseInputLocks();
        this.fadeOut(() => {
            this.restoreChrome();
            after?.();
        });
    }

    private releaseInputLocks() {
        if (this.anyModalBlocking()) {
            InputBridge.uiBlocking = true;
        } else {
            InputBridge.uiBlocking = false;
        }
        if (!this.anyMoveLockOwner()) {
            InputBridge.moveLocked = false;
        }
        InputBridge.clear();
    }

    private anyModalBlocking(): boolean {
        const rewardOpen = !!(this.node.getComponent('RewardPopup') as { isOpen?: boolean } | null)
            ?.isOpen;
        const questOpen = !!(this.node.getComponent('QuestPanel') as { isOpen?: boolean } | null)
            ?.isOpen;
        const shopOpen = !!(this.node.getComponent('TownShopPanel') as { isOpen?: boolean } | null)
            ?.isOpen;
        const hud = this.node.getComponent('FarmHUD') as { isModalOpen?: boolean } | null;
        return rewardOpen || questOpen || shopOpen || !!hud?.isModalOpen;
    }

    private anyMoveLockOwner(): boolean {
        const intro = this.node.getComponent('StoryIntroPanel') as { isOpen?: boolean } | null;
        const fish = this.node.getComponent('FishingMinigame') as { isOpen?: boolean } | null;
        return !!intro?.isOpen || !!fish?.isOpen;
    }

    private startHintPulse() {
        if (!this._hintRoot || !this._hintOp) return;
        this.stopHintPulse();
        this._hintRoot.active = true;
        this._hintOp.opacity = 255;
        this._hintRoot.setPosition(this._hintRoot.position.x, this._hintBaseY, 0);

        // Soft blink on the whole cue.
        tween(this._hintOp)
            .repeatForever(
                tween(this._hintOp)
                    .to(0.4, { opacity: 255 })
                    .to(0.4, { opacity: 130 }),
            )
            .start();

        // Arrow bobs above the label — “press this”.
        if (this._hintArrow) {
            const ax = this._hintArrow.position.x;
            this._hintArrow.setPosition(ax, this._arrowBaseY, 0);
            tween(this._hintArrow)
                .repeatForever(
                    tween(this._hintArrow)
                        .to(0.38, { position: new Vec3(ax, this._arrowBaseY + 5, 0) })
                        .to(0.38, { position: new Vec3(ax, this._arrowBaseY - 2, 0) }),
                )
                .start();
        }
    }

    private stopHintPulse() {
        if (this._hintOp) Tween.stopAllByTarget(this._hintOp);
        if (this._hintArrow) Tween.stopAllByTarget(this._hintArrow);
        if (this._hintOp) this._hintOp.opacity = 255;
        if (this._hintArrow) {
            this._hintArrow.setPosition(this._hintArrow.position.x, this._arrowBaseY, 0);
        }
        if (this._hintRoot) {
            this._hintRoot.setPosition(this._hintRoot.position.x, this._hintBaseY, 0);
        }
    }

    private fadeIn() {
        this.killFades();
        // Instant show under LoadingScreen handoff; a 0→255 fade flashes the world
        // when the splash lifts. Mid-game replays also read fine at full opacity.
        if (this._rootOp) this._rootOp.opacity = 255;
        if (this._root) this._root.active = true;
        this.bringToFront();
        this.ensureChromeHidden();
    }

    private fadeOut(done: () => void) {
        this.killFades();
        const gen = ++this._fadeGen;
        const finish = () => {
            if (gen !== this._fadeGen) return;
            this.hideVisualImmediate();
            done();
        };
        if (!this._rootOp) {
            finish();
            return;
        }
        tween(this._rootOp).to(FADE_OUT, { opacity: 0 }).call(finish).start();
    }

    private killFades() {
        if (this._rootOp) Tween.stopAllByTarget(this._rootOp);
    }

    private hideVisualImmediate() {
        this.killFades();
        // Opacity first — never leave an opaque inactive→active pop.
        if (this._rootOp) this._rootOp.opacity = 0;
        if (this._root) this._root.active = false;
    }

    private ensureChromeHidden() {
        const canvas = this.node;
        for (const name of HUD_CHROME) {
            const n = canvas.getChildByName(name);
            if (!n?.isValid) continue;
            if (!this._chromeWas.has(name)) {
                this._chromeWas.set(name, n.active);
            }
            if (n.active) n.active = false;
        }
    }

    private restoreChrome() {
        const canvas = this.node;
        for (const [name, was] of this._chromeWas) {
            const n = canvas.getChildByName(name);
            if (n?.isValid) n.active = was;
        }
        this._chromeWas.clear();
    }

    private bringToFront() {
        if (this._root?.isValid) this._root.setSiblingIndex(this.node.children.length - 1);
    }

    private listen() {
        if (this._listening) return;
        this._listening = true;
        // Mouse only on desktop; touch only on device — avoid both firing for one click.
        input.on(Input.EventType.TOUCH_END, this.onTouchEnd, this);
        input.on(Input.EventType.MOUSE_UP, this.onMouseUp, this);
    }

    private unlisten() {
        if (!this._listening) return;
        this._listening = false;
        input.off(Input.EventType.TOUCH_END, this.onTouchEnd, this);
        input.off(Input.EventType.MOUSE_UP, this.onMouseUp, this);
    }

    private onTouchEnd(e: EventTouch) {
        if (!this._open || !this._inputReady) return;
        e.propagationStopped = true;
        this.tryAdvance();
    }

    private onMouseUp(e: EventMouse) {
        if (!this._open || !this._inputReady) return;
        if (e.getButton() !== EventMouse.BUTTON_LEFT) return;
        e.propagationStopped = true;
        this.tryAdvance();
    }

    private build() {
        const canvas = this.node;

        // Drop leftover dimmer / box from older builds.
        const oldDim = canvas.getChildByName('DialogueDimmer');
        if (oldDim) oldDim.destroy();
        const oldBox = canvas.getChildByName('DialogueBox');
        if (oldBox) oldBox.destroy();

        const root = new Node('DialogueBox');
        root.layer = canvas.layer;
        root.setParent(canvas);
        root.setPosition(0, BOX_Y, 0);
        root.addComponent(UITransform).setContentSize(BOX_W, BOX_H);
        this._rootOp = root.addComponent(UIOpacity);
        this._rootOp.opacity = 0;

        const g = root.addComponent(Graphics);
        drawDialogueChrome(g, BOX_W, BOX_H);
        this._root = root;
        const x0 = -BOX_W * 0.5;
        const y0 = -BOX_H * 0.5;

        // Headshot above the name plate (not a full-body left column).
        const portraitRoot = new Node('Portrait');
        portraitRoot.layer = root.layer;
        portraitRoot.setParent(root);
        const nameY = BOX_H * 0.5 + 2;
        portraitRoot.setPosition(
            NAME_STACK_X,
            nameY + NAME_PLATE_H * 0.5 + 8 + AVATAR_FRAME * 0.5,
            0,
        );
        portraitRoot.addComponent(UITransform).setContentSize(AVATAR_FRAME, AVATAR_FRAME);
        const pg = portraitRoot.addComponent(Graphics);
        const fw = AVATAR_FRAME;
        pg.fillColor = UI_WOOD;
        pg.roundRect(-fw * 0.5, -fw * 0.5, fw, fw, 16);
        pg.fill();
        pg.fillColor = UI_WOOD_DARK;
        pg.roundRect(-AVATAR * 0.5 - 2, -AVATAR * 0.5 - 2, AVATAR + 4, AVATAR + 4, 12);
        pg.fill();
        pg.strokeColor = UI_GOLD;
        pg.lineWidth = 3;
        pg.roundRect(-fw * 0.5, -fw * 0.5, fw, fw, 16);
        pg.stroke();
        this._portraitRoot = portraitRoot;

        const faceN = new Node('Face');
        faceN.layer = root.layer;
        faceN.setParent(portraitRoot);
        faceN.setPosition(0, 0, 0);
        const faceUt = faceN.addComponent(UITransform);
        faceUt.setContentSize(AVATAR, AVATAR);
        const faceSp = faceN.addComponent(Sprite);
        faceSp.sizeMode = Sprite.SizeMode.CUSTOM;
        faceSp.type = Sprite.Type.SIMPLE;
        this._portraitSp = faceSp;
        portraitRoot.active = false;

        const namePlate = new Node('NamePlate');
        namePlate.layer = root.layer;
        namePlate.setParent(root);
        namePlate.setPosition(NAME_STACK_X, nameY, 0);
        namePlate.addComponent(UITransform).setContentSize(NAME_PLATE_W, NAME_PLATE_H);
        const ng = namePlate.addComponent(Graphics);
        ng.fillColor = UI_WOOD;
        ng.roundRect(-NAME_PLATE_W * 0.5, -NAME_PLATE_H * 0.5, NAME_PLATE_W, NAME_PLATE_H, 10);
        ng.fill();
        ng.fillColor = new Color(196, 132, 64, 255);
        ng.roundRect(
            -NAME_PLATE_W * 0.5 + 3,
            -NAME_PLATE_H * 0.5 + 3,
            NAME_PLATE_W - 6,
            NAME_PLATE_H - 6,
            8,
        );
        ng.fill();
        ng.strokeColor = UI_GOLD;
        ng.lineWidth = 2;
        ng.roundRect(-NAME_PLATE_W * 0.5, -NAME_PLATE_H * 0.5, NAME_PLATE_W, NAME_PLATE_H, 10);
        ng.stroke();
        this._namePlate = namePlate;

        const nameN = new Node('Name');
        nameN.layer = namePlate.layer;
        nameN.setParent(namePlate);
        const nameUt = nameN.addComponent(UITransform);
        const nameLab = nameN.addComponent(Label);
        styleUiLabel(nameLab, {
            size: 28,
            color: UI_CREAM,
            outline: true,
            outlineWidth: 2,
        });
        nameLab.horizontalAlign = Label.HorizontalAlign.CENTER;
        nameLab.verticalAlign = Label.VerticalAlign.CENTER;
        nameLab.overflow = Label.Overflow.CLAMP;
        nameLab.enableWrapText = false;
        nameUt.setContentSize(200, 36);
        this._nameLab = nameLab;

        const bodyN = new Node('Body');
        bodyN.layer = root.layer;
        bodyN.setParent(root);
        // Top-anchored: sit just under the top padding / name plate.
        bodyN.setPosition(0, bodyY(false), 0);
        const bodyUt = bodyN.addComponent(UITransform);
        bodyUt.setAnchorPoint(0.5, 1);
        const body = bodyN.addComponent(Label);
        styleUiLabel(body, {
            size: 34,
            color: new Color(255, 246, 220, 255),
            outline: true,
            outlineWidth: 3,
        });
        // Overflow BEFORE size: Label(NONE) shrinks the node to the empty string,
        // and RESIZE_HEIGHT would then wrap on that ~2-glyph width.
        body.overflow = Label.Overflow.RESIZE_HEIGHT;
        body.enableWrapText = true;
        body.horizontalAlign = Label.HorizontalAlign.LEFT;
        body.verticalAlign = Label.VerticalAlign.TOP;
        body.lineHeight = 48;
        bodyUt.setContentSize(BOX_W - 100, 150);
        this._bodyLab = body;

        // Continue cue — fully inside the box (bottom-right padding ≥ 28px).
        const hintRoot = new Node('Hint');
        hintRoot.layer = root.layer;
        hintRoot.setParent(root);
        this._hintBaseY = y0 + 70;
        hintRoot.setPosition(x0 + BOX_W - 118, this._hintBaseY, 0);
        hintRoot.addComponent(UITransform).setContentSize(200, 64);
        this._hintOp = hintRoot.addComponent(UIOpacity);
        this._hintOp.opacity = 255;
        this._hintRoot = hintRoot;

        this._arrowBaseY = 16;
        const arrow = new Node('HintArrow');
        arrow.layer = root.layer;
        arrow.setParent(hintRoot);
        arrow.setPosition(0, this._arrowBaseY, 0);
        arrow.addComponent(UITransform).setContentSize(36, 24);
        const ag = arrow.addComponent(Graphics);
        const gold = new Color(255, 220, 120, 255);
        const edge = new Color(90, 50, 16, 255);
        ag.fillColor = edge;
        ag.moveTo(0, -10);
        ag.lineTo(-13, 8);
        ag.lineTo(13, 8);
        ag.close();
        ag.fill();
        ag.fillColor = gold;
        ag.moveTo(0, -7);
        ag.lineTo(-10, 6);
        ag.lineTo(10, 6);
        ag.close();
        ag.fill();
        this._hintArrow = arrow;

        const hintN = new Node('HintLab');
        hintN.layer = root.layer;
        hintN.setParent(hintRoot);
        hintN.setPosition(0, -14, 0);
        const hintUt = hintN.addComponent(UITransform);
        const hint = hintN.addComponent(Label);
        styleUiLabel(hint, {
            size: 24,
            color: new Color(255, 230, 150, 255),
            outline: true,
            outlineWidth: 2,
            outlineColor: new Color(60, 36, 12, 255),
        });
        hint.horizontalAlign = Label.HorizontalAlign.CENTER;
        hint.verticalAlign = Label.VerticalAlign.CENTER;
        hint.overflow = Label.Overflow.CLAMP;
        hint.enableWrapText = false;
        hintUt.setContentSize(200, 32);
        hint.string = '点击继续';
        this._hintLab = hint;
    }

    /** Keep wrap width after font / string updates (Label can shrink the node). */
    private ensureBodyLayout() {
        const n = this._bodyLab?.node;
        if (!n?.isValid) return;
        const ut = n.getComponent(UITransform);
        if (!ut) return;
        const hasSpeaker = !!(this._namePlate?.active);
        const w = BOX_W - 100;
        ut.setAnchorPoint(0.5, 1);
        n.setPosition(0, bodyY(hasSpeaker), 0);
        if (ut.contentSize.width < w - 1 || ut.contentSize.width > w + 1) {
            ut.setContentSize(w, Math.max(ut.contentSize.height, 150));
        } else if (ut.contentSize.height < 150) {
            ut.setContentSize(w, 150);
        }
    }
}
