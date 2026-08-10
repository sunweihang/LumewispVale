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
    UIOpacity,
    UITransform,
    Vec3,
    input,
    tween,
    Tween,
} from 'cc';
import { InputBridge } from './InputBridge';
import { applyUiFont, loadUiFont, styleUiLabel } from './UiFont';

const { ccclass } = _decorator;

export type DialogueLine = {
    /** Empty / omit = narration (no name plate). */
    speaker?: string;
    text: string;
};

const BOX_W = 1000;
const BOX_H = 260;
/** Low on the portrait frame — HUD chrome is hidden while open. */
const BOX_Y = -780;

const FADE_IN = 0.18;
const FADE_OUT = 0.12;
/** Block input until fade finishes + a short beat (prevents open-click eating line 1). */
const INPUT_GUARD_SEC = FADE_IN + 0.35;

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
    private _hintRoot: Node | null = null;
    private _hintLab: Label | null = null;
    private _hintArrow: Node | null = null;
    private _hintOp: UIOpacity | null = null;
    private _rootOp: UIOpacity | null = null;
    private _hintBaseY = 0;
    private _arrowBaseY = 18;

    private _lines: DialogueLine[] = [];
    private _index = 0;
    private _onDone: (() => void) | null = null;
    private _prevBlocking = false;
    private _open = false;
    private _listening = false;
    private _inputReady = false;
    private _busy = false;
    private _lastAdvanceAt = 0;
    private _chromeWas: Map<string, boolean> = new Map();
    private _fadeGen = 0;
    private _fontReady = false;
    private _pending: { lines: DialogueLine[]; onDone?: () => void } | null = null;

    get isOpen() {
        return this._open;
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
        if (!this._fontReady) {
            // Keep latest request; open only after ZCOOL font is on the labels.
            this._pending = { lines, onDone };
            loadUiFont();
            return;
        }
        this.beginPlay(lines, onDone);
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
    }

    /**
     * From GameBootstrap stick.onTap — consume while open, but only our
     * input listeners advance (avoids mouse+touch double-step).
     */
    handleTap(_uiX: number, _uiY: number): boolean {
        return this._open;
    }

    private tryAdvance() {
        if (!this._open || !this._inputReady || this._busy) return;
        // Mouse+touch often both fire for one desktop click — one advance only.
        const now = Date.now();
        if (now - this._lastAdvanceAt < 280) return;
        this._lastAdvanceAt = now;
        this._busy = true;
        try {
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
        if (this._namePlate) this._namePlate.active = !!speaker;
        if (this._nameLab) this._nameLab.string = speaker || ' ';
        if (this._bodyLab) {
            this._bodyLab.string = line.text;
            // Keep copy near the top of the box (name plate steals a bit when present).
            this._bodyLab.node.setPosition(0, speaker ? 78 : 96, 0);
        }
        if (this._hintLab) this._hintLab.string = '点击继续';
        this.startHintPulse();
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
        this.fadeOut(() => {
            this.restoreChrome();
            InputBridge.uiBlocking = this._prevBlocking;
            // Nested reward→dialogue can stash prevBlocking=true; if nothing else
            // owns the block, clear so move-stick / idle quest arrows keep working.
            if (InputBridge.uiBlocking) {
                const rewardOpen = !!(this.node.getComponent('RewardPopup') as { isOpen?: boolean } | null)
                    ?.isOpen;
                const questOpen = !!(this.node.getComponent('QuestPanel') as { isOpen?: boolean } | null)
                    ?.isOpen;
                if (!rewardOpen && !questOpen) InputBridge.uiBlocking = false;
            }
            after?.();
        });
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
        // Opacity must be 0 *before* active=true, or the first frame flashes full.
        if (this._rootOp) this._rootOp.opacity = 0;
        if (this._root) this._root.active = true;
        this.bringToFront();
        this.ensureChromeHidden();

        if (this._rootOp) {
            tween(this._rootOp).to(FADE_IN, { opacity: 255 }).start();
        }
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

        // Drop leftover dimmer from older builds (full-screen black).
        const oldDim = canvas.getChildByName('DialogueDimmer');
        if (oldDim) oldDim.destroy();

        const root = new Node('DialogueBox');
        root.layer = canvas.layer;
        root.setParent(canvas);
        root.setPosition(0, BOX_Y, 0);
        root.addComponent(UITransform).setContentSize(BOX_W, BOX_H);
        this._rootOp = root.addComponent(UIOpacity);
        this._rootOp.opacity = 0;

        const g = root.addComponent(Graphics);
        const x0 = -BOX_W * 0.5;
        const y0 = -BOX_H * 0.5;
        g.fillColor = new Color(36, 28, 20, 250);
        g.roundRect(x0, y0, BOX_W, BOX_H, 22);
        g.fill();
        g.fillColor = new Color(52, 40, 28, 255);
        g.roundRect(x0 + 10, y0 + 10, BOX_W - 20, BOX_H - 20, 14);
        g.fill();
        g.strokeColor = new Color(214, 176, 104, 255);
        g.lineWidth = 4;
        g.roundRect(x0, y0, BOX_W, BOX_H, 22);
        g.stroke();
        this._root = root;

        const namePlate = new Node('NamePlate');
        namePlate.layer = root.layer;
        namePlate.setParent(root);
        namePlate.setPosition(x0 + 130, BOX_H * 0.5 + 2, 0);
        namePlate.addComponent(UITransform).setContentSize(220, 48);
        const ng = namePlate.addComponent(Graphics);
        ng.fillColor = new Color(132, 86, 46, 255);
        ng.roundRect(-110, -24, 220, 48, 10);
        ng.fill();
        ng.strokeColor = new Color(240, 214, 150, 255);
        ng.lineWidth = 2;
        ng.roundRect(-110, -24, 220, 48, 10);
        ng.stroke();
        this._namePlate = namePlate;

        const nameN = new Node('Name');
        nameN.layer = namePlate.layer;
        nameN.setParent(namePlate);
        nameN.addComponent(UITransform).setContentSize(200, 36);
        const nameLab = nameN.addComponent(Label);
        styleUiLabel(nameLab, {
            size: 28,
            color: new Color(255, 244, 214, 255),
            outline: true,
            outlineWidth: 2,
        });
        nameLab.horizontalAlign = Label.HorizontalAlign.CENTER;
        nameLab.verticalAlign = Label.VerticalAlign.CENTER;
        this._nameLab = nameLab;

        const bodyN = new Node('Body');
        bodyN.layer = root.layer;
        bodyN.setParent(root);
        // Top-anchored: sit just under the top padding / name plate.
        bodyN.setPosition(0, 96, 0);
        const bodyUt = bodyN.addComponent(UITransform);
        bodyUt.setContentSize(BOX_W - 100, 150);
        bodyUt.setAnchorPoint(0.5, 1);
        const body = bodyN.addComponent(Label);
        styleUiLabel(body, {
            size: 34,
            color: new Color(255, 246, 220, 255),
            outline: true,
            outlineWidth: 3,
        });
        body.overflow = Label.Overflow.RESIZE_HEIGHT;
        body.enableWrapText = true;
        body.horizontalAlign = Label.HorizontalAlign.LEFT;
        body.verticalAlign = Label.VerticalAlign.TOP;
        body.lineHeight = 48;
        this._bodyLab = body;

        // Continue cue — fully inside the box (bottom-right padding ≥ 28px).
        const hintRoot = new Node('Hint');
        hintRoot.layer = root.layer;
        hintRoot.setParent(root);
        this._hintBaseY = y0 + 70;
        hintRoot.setPosition(x0 + BOX_W - 100, this._hintBaseY, 0);
        hintRoot.addComponent(UITransform).setContentSize(150, 64);
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
        hintN.addComponent(UITransform).setContentSize(150, 32);
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
        hint.string = '点击继续';
        this._hintLab = hint;
    }
}
