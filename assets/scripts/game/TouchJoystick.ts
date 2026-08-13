import {
    _decorator,
    Component,
    EventMouse,
    EventTouch,
    Input,
    Node,
    UITransform,
    Vec3,
    game,
    input,
    sys,
} from 'cc';
import { clientToUiLocation, portraitVisibleSize } from './PortraitFit';
import { FishingMinigame } from './FishingMinigame';
import { InputBridge } from './InputBridge';
import { STICK_VISUAL_LAYOUT } from './StickVisualFrames';

const { ccclass, property } = _decorator;

/**
 * Collapse Cocos + DOM duplicate deliveries of the same physical press.
 * Must be long enough to cover engine→DOM ordering, short enough to feel snappy.
 */
const TAP_DEDUP_MS = 140;

/** Extra hit padding beyond `radius` so the rest dock is easy to grab. */
const STICK_HIT_PAD = 36;

/**
 * On-screen move stick + tap detection:
 * - Rest dock (main HUD): always visible at center-bottom
 * - Press + drag (free ground): stick jumps to the finger and walks
 * - Short tap outside a drag → farm / UI / interact; never click-to-move
 *
 * On web-mobile, Cocos `input` often delivers DOWN but drops UP. DOM owns
 * completion: any in-flight press can be finished by pointerup, and a lone
 * pointerup still synthesizes a tap so clicks are not lost.
 */
@ccclass('TouchJoystick')
export class TouchJoystick extends Component {
    @property
    radius = 80;

    /** Pixels of movement before a press becomes a drag. */
    @property
    dragThreshold = 22;

    @property(Node)
    visualRoot: Node | null = null;

    @property(Node)
    knob: Node | null = null;

    /**
     * Always-visible rest dock (center-bottom). Drag relocates the stick to
     * the finger; release snaps back to rest.
     */
    @property
    fixedStick = true;

    /** Fired on short tap (ui coords, origin bottom-left). */
    onTap: ((uiX: number, uiY: number) => void) | null = null;

    /** Fired when a press becomes a drag stick — cancel auto-walk jobs. */
    onDragStart: (() => void) | null = null;

    private _tracking = false;
    private _dragging = false;
    /** Finger slid inside UI zone — suppress world/UI tap (item drag handled elsewhere). */
    private _uiSlid = false;
    /** Press began on the rest dock (short dock taps are not world clicks). */
    private _onStick = false;
    private _id = -1;
    private _ox = 0;
    private _oy = 0;
    private readonly _tmp = new Vec3();
    private _domBound = false;
    /** Wall-clock of last delivered onTap — dedupes Cocos + DOM doubles. */
    private _lastTapAt = 0;
    /** Last press end (tap or drag) — blocks synthetic taps after a finished gesture. */
    private _lastGestureAt = 0;
    private _capturedPtr: number | null = null;

    onEnable() {
        input.on(Input.EventType.TOUCH_START, this.onTouchStart, this);
        input.on(Input.EventType.TOUCH_MOVE, this.onTouchMove, this);
        input.on(Input.EventType.TOUCH_END, this.onTouchEnd, this);
        input.on(Input.EventType.TOUCH_CANCEL, this.onTouchEnd, this);
        input.on(Input.EventType.MOUSE_DOWN, this.onMouseDown, this);
        input.on(Input.EventType.MOUSE_MOVE, this.onMouseMove, this);
        input.on(Input.EventType.MOUSE_UP, this.onMouseUp, this);
        this.bindDomFallback(true);
        InputBridge.abortStick = () => this.abortTracking();
        if (this.fixedStick) this.showFixedStick();
        else this.hideVisual();
    }

    onDisable() {
        input.off(Input.EventType.TOUCH_START, this.onTouchStart, this);
        input.off(Input.EventType.TOUCH_MOVE, this.onTouchMove, this);
        input.off(Input.EventType.TOUCH_END, this.onTouchEnd, this);
        input.off(Input.EventType.TOUCH_CANCEL, this.onTouchEnd, this);
        input.off(Input.EventType.MOUSE_DOWN, this.onMouseDown, this);
        input.off(Input.EventType.MOUSE_MOVE, this.onMouseMove, this);
        input.off(Input.EventType.MOUSE_UP, this.onMouseUp, this);
        this.bindDomFallback(false);
        if (InputBridge.abortStick) InputBridge.abortStick = null;
        InputBridge.clear();
        this.hideVisual();
    }

    update() {
        // Mid-press cast open: kill the stick so hold-to-lift can't drag-walk.
        if (this._tracking && this.fishingOpen()) this.abortTracking();
    }

    /** Place the rest dock in canvas-local space (call after parenting StickVisual). */
    layoutFixedStick() {
        if (!this.visualRoot?.isValid) return;
        const rest = this.restLocal();
        this.visualRoot.setPosition(rest.x, rest.y, 0);
        if (this.knob) this.knob.setPosition(0, 0, 0);
    }

    /** Re-show the dock after Loading / intro chrome restore. */
    showFixedStick() {
        if (!this.fixedStick || !this.visualRoot?.isValid) return;
        this.layoutFixedStick();
        this.visualRoot.active = true;
        if (this.knob) this.knob.setPosition(0, 0, 0);
    }

    /** Web-only: canvas/window pointer → reliable begin/move/end on hosts that drop Cocos UP. */
    private bindDomFallback(on: boolean) {
        if (!sys.isBrowser) return;
        const canvas = game.canvas as HTMLCanvasElement | null;
        if (!canvas) return;
        if (on) {
            if (this._domBound) return;
            canvas.addEventListener('pointerdown', this.onDomPointerDown, { passive: true });
            canvas.addEventListener('pointermove', this.onDomPointerMove, { passive: true });
            // Window capture: release outside the canvas still completes the press.
            window.addEventListener('pointerup', this.onDomPointerUp, { passive: true, capture: true });
            window.addEventListener('pointercancel', this.onDomPointerUp, {
                passive: true,
                capture: true,
            });
            this._domBound = true;
        } else if (this._domBound) {
            canvas.removeEventListener('pointerdown', this.onDomPointerDown);
            canvas.removeEventListener('pointermove', this.onDomPointerMove);
            window.removeEventListener('pointerup', this.onDomPointerUp, true);
            window.removeEventListener('pointercancel', this.onDomPointerUp, true);
            this.releaseCapture();
            this._domBound = false;
        }
    }

    private releaseCapture() {
        if (this._capturedPtr == null) return;
        const canvas = game.canvas as HTMLCanvasElement | null;
        try {
            canvas?.releasePointerCapture?.(this._capturedPtr);
        } catch {
            /* already released */
        }
        this._capturedPtr = null;
    }

    private onDomPointerDown = (ev: PointerEvent) => {
        // Never steal an in-flight Cocos mouse/touch — that replaced correct
        // getUILocation() with a naive CSS map and broke letterboxed preview.
        if (this._tracking) return;
        const ui = clientToUiLocation(ev.clientX, ev.clientY, false);
        if (!ui) return;
        const canvas = game.canvas as HTMLCanvasElement | null;
        try {
            canvas?.setPointerCapture?.(ev.pointerId);
            this._capturedPtr = ev.pointerId;
        } catch {
            this._capturedPtr = null;
        }
        this.begin(-200, ui.x, ui.y);
    };

    private onDomPointerMove = (ev: PointerEvent) => {
        if (!this._tracking) return;
        // Only drive DOM-owned presses; Cocos mouse/touch keep engine moves.
        if (this._id !== -200) return;
        const ui = clientToUiLocation(ev.clientX, ev.clientY, true);
        if (!ui) return;
        this.move(ui.x, ui.y);
    };

    private onDomPointerUp = (ev: PointerEvent) => {
        const tracking = this._tracking;
        const id = this._id;
        const ui = clientToUiLocation(ev.clientX, ev.clientY, tracking);
        this.releaseCapture();
        if (!ui) {
            if (tracking && id === -200) this.abortTracking();
            return;
        }

        if (tracking) {
            // DOM-owned press, or Cocos press that lost its UP — finish the gesture.
            this.end(ui.x, ui.y);
            return;
        }
        // Gesture already finished by Cocos end/drag/abort — never synth a tap
        // after a completed gesture (drag mouse-up must not enter buildings).
        if (Date.now() - this._lastGestureAt < TAP_DEDUP_MS) return;
        if (Date.now() - this._lastTapAt < TAP_DEDUP_MS) return;
        // Missed down entirely — still treat as a short tap (no prior gesture).
        this.fireTap(ui.x, ui.y);
    };

    private onTouchStart(e: EventTouch) {
        if (this._tracking) return;
        const loc = e.getUILocation();
        this.begin(e.getID(), loc.x, loc.y);
    }

    private onTouchMove(e: EventTouch) {
        if (!this._tracking || e.getID() !== this._id) return;
        const loc = e.getUILocation();
        this.move(loc.x, loc.y);
    }

    private onTouchEnd(e: EventTouch) {
        if (!this._tracking) return;
        if (e.getID() !== this._id) return;
        const loc = e.getUILocation();
        this.end(loc.x, loc.y);
    }

    private onMouseDown(e: EventMouse) {
        if (this._tracking) return;
        if (e.getButton() !== EventMouse.BUTTON_LEFT) return;
        const loc = e.getUILocation();
        this.begin(-100, loc.x, loc.y);
    }

    private onMouseMove(e: EventMouse) {
        if (!this._tracking || this._id !== -100) return;
        const loc = e.getUILocation();
        this.move(loc.x, loc.y);
    }

    private onMouseUp(e: EventMouse) {
        if (!this._tracking || this._id !== -100) return;
        if (e.getButton() !== EventMouse.BUTTON_LEFT) return;
        const loc = e.getUILocation();
        this.end(loc.x, loc.y);
    }

    private abortTracking() {
        this._tracking = false;
        this._dragging = false;
        this._uiSlid = false;
        this._onStick = false;
        this._id = -1;
        // Stamp gesture time so a following DOM pointerup cannot synth a tap
        // (e.g. mid-drag abort → mouse-up over a building must not enter).
        this._lastGestureAt = Date.now();
        this.releaseCapture();
        InputBridge.clear();
        this.resetKnob();
    }

    private fishingOpen(): boolean {
        const canvas = this.node.parent;
        return !!canvas?.getComponent(FishingMinigame)?.isOpen;
    }

    private begin(id: number, x: number, y: number) {
        // Self-heal stale locks left by dialogue/reward fade races.
        this.clearStaleInputLocks();
        // Fishing owns the pointer entirely — hold lifts the bar, never the stick.
        if (this.fishingOpen()) {
            this.abortTracking();
            InputBridge.clear();
            return;
        }
        // Always track for short taps. moveLocked (story intro) only suppresses the
        // walk-stick — taps still reach stick.onTap → StoryIntroPanel.handleTap.
        this._tracking = true;
        this._dragging = false;
        this._uiSlid = false;
        this._onStick = this.hitFixedStick(x, y);
        this._id = id;
        this._ox = x;
        this._oy = y;
        InputBridge.clear();
    }

    /** Drop uiBlocking / moveLocked when no real modal owns them. */
    private clearStaleInputLocks() {
        const canvas = this.node.parent;
        if (!canvas) return;
        if (InputBridge.uiBlocking) {
            const dlg = canvas.getComponent('DialoguePanel') as { isOpen?: boolean } | null;
            const reward = canvas.getComponent('RewardPopup') as { isOpen?: boolean } | null;
            const quest = canvas.getComponent('QuestPanel') as { isOpen?: boolean } | null;
            const hud = canvas.getComponent('FarmHUD') as { isModalOpen?: boolean } | null;
            const intro = canvas.getComponent('StoryIntroPanel') as { isOpen?: boolean } | null;
            const shop = canvas.getComponent('TownShopPanel') as { isOpen?: boolean } | null;
            // Forced spotlight owns uiBlocking — must not clear or the player walks
            // and the hollow drifts off the weed.
            const guide = canvas.getComponent('TutorialGuide') as { isOpen?: boolean } | null;
            const fish = canvas.getComponent(FishingMinigame);
            if (
                !dlg?.isOpen &&
                !reward?.isOpen &&
                !quest?.isOpen &&
                !hud?.isModalOpen &&
                !intro?.isOpen &&
                !shop?.isOpen &&
                !guide?.isOpen &&
                !fish?.isOpen
            ) {
                InputBridge.uiBlocking = false;
            }
        }
        if (InputBridge.moveLocked) {
            const intro = canvas.getComponent('StoryIntroPanel') as { isOpen?: boolean } | null;
            const fish = canvas.getComponent(FishingMinigame);
            if (!intro?.isOpen && !fish?.isOpen) {
                InputBridge.moveLocked = false;
            }
        }
    }

    private move(x: number, y: number) {
        const dx0 = x - this._ox;
        const dy0 = y - this._oy;
        const dist = Math.sqrt(dx0 * dx0 + dy0 * dy0);

        // Fishing: hard-abort — don't keep a zombie press that becomes a stick later.
        if (this.fishingOpen()) {
            this.abortTracking();
            return;
        }

        // Intro / forced lock: keep tap tracking, never start the walk-stick.
        if (InputBridge.moveLocked) {
            InputBridge.clear();
            return;
        }

        if (!this._dragging) {
            // Bag/chest/craft open: any small slide is a UI gesture (item drag),
            // not a world tap — match FarmHUD's drag threshold so onTap doesn't
            // fire after a successful bag→hotbar drop.
            // IMPORTANT: do NOT treat spotlight / dialogue uiBlocking as a slide —
            // mouse micro-moves (≥12px) were swallowing every tutorial hotbar tap.
            if (InputBridge.uiBlocking) {
                const canvas = this.node.parent;
                const hud = canvas?.getComponent('FarmHUD') as { isModalOpen?: boolean } | null;
                const shop = canvas?.getComponent('TownShopPanel') as { isOpen?: boolean } | null;
                if ((hud?.isModalOpen || shop?.isOpen) && dist >= 12) this._uiSlid = true;
                return;
            }
            if (dist < this.dragThreshold) return;
            // GM chip / panel: block stick, still allow onTap.
            if (InputBridge.gmUiHit?.(this._ox, this._oy)) {
                return;
            }
            // Hotbar / backpack UI: never start the move-stick (FarmHUD owns item drags).
            if (InputBridge.isActionZone(this._ox, this._oy)) {
                this._uiSlid = true;
                return;
            }
            this._dragging = true;
            // Follow-finger: jump the whole stick to the press origin.
            this.showVisualAt(this._ox, this._oy);
            this.onDragStart?.();
        }

        let dx = x - this._ox;
        let dy = y - this._oy;
        const len = Math.sqrt(dx * dx + dy * dy) || 1;
        if (len > this.radius) {
            dx = (dx / len) * this.radius;
            dy = (dy / len) * this.radius;
        }
        InputBridge.setMove(dx / this.radius, dy / this.radius);
        if (this.knob) {
            this._tmp.set(dx, dy, 0);
            this.knob.setPosition(this._tmp);
        }
    }

    private end(x: number, y: number) {
        const wasDrag = this._dragging;
        const uiSlid = this._uiSlid;
        const onStick = this._onStick;
        const tracking = this._tracking;
        const ox = this._ox;
        const oy = this._oy;
        this._tracking = false;
        this._dragging = false;
        this._uiSlid = false;
        this._onStick = false;
        this._id = -1;
        this.releaseCapture();
        InputBridge.clear();
        this.resetKnob();
        this._lastGestureAt = Date.now();
        // True short tap only — UI slides / item drags must not fire onTap.
        // Also reject when down→up displacement exceeds the drag threshold even
        // if MOVE events were dropped (common on web-mobile): drag mouse-up
        // over a building must never count as a click-to-enter.
        // Rest-dock taps never fall through as world clicks.
        // moveLocked intro still needs onTap → StoryIntroPanel.handleTap.
        const displaced = Math.hypot(x - ox, y - oy);
        if (
            tracking &&
            !wasDrag &&
            !uiSlid &&
            !(this.fixedStick && onStick) &&
            displaced < this.dragThreshold
        ) {
            this.fireTap(x, y);
        }
    }

    private fireTap(x: number, y: number) {
        const now = Date.now();
        if (now - this._lastTapAt < TAP_DEDUP_MS) return;
        this._lastTapAt = now;
        this.onTap?.(x, y);
    }

    private showVisualAt(uiX: number, uiY: number) {
        if (!this.visualRoot) return;
        this.visualRoot.active = true;
        // Canvas / visible frame center (not fixed design 1080×1920).
        const canvas = this.node.parent;
        const canvasUi = canvas?.getComponent(UITransform);
        const vis = portraitVisibleSize();
        const hw = (canvasUi?.contentSize.width || vis.width) * 0.5;
        const hh = (canvasUi?.contentSize.height || vis.height) * 0.5;
        this.visualRoot.setPosition(uiX - hw, uiY - hh, 0);
        if (this.knob) this.knob.setPosition(0, 0, 0);
    }

    private hideVisual() {
        if (this.fixedStick) {
            this.resetKnob();
            return;
        }
        if (this.visualRoot) this.visualRoot.active = false;
        if (this.knob) this.knob.setPosition(0, 0, 0);
    }

    private resetKnob() {
        if (this.knob) this.knob.setPosition(0, 0, 0);
        if (this.fixedStick && this.visualRoot?.isValid) {
            this.layoutFixedStick();
            // Keep dock visible unless a chrome owner hid the node.
            if (!InputBridge.moveLocked) this.visualRoot.active = true;
        }
    }

    private hitFixedStick(uiX: number, uiY: number): boolean {
        if (!this.fixedStick || !this.visualRoot?.isValid || !this.visualRoot.active) {
            return !this.fixedStick;
        }
        const c = this.stickCenterUi();
        const hitR = this.radius + STICK_HIT_PAD;
        return Math.hypot(uiX - c.x, uiY - c.y) <= hitR;
    }

    private restLocal(): { x: number; y: number } {
        return { x: STICK_VISUAL_LAYOUT.restX, y: STICK_VISUAL_LAYOUT.restY };
    }

    private stickCenterUi(): { x: number; y: number } {
        const canvas = this.node.parent;
        const canvasUi = canvas?.getComponent(UITransform);
        const vis = portraitVisibleSize();
        const hw = (canvasUi?.contentSize.width || vis.width) * 0.5;
        const hh = (canvasUi?.contentSize.height || vis.height) * 0.5;
        const rest = this.restLocal();
        const p = this.visualRoot?.position;
        const cx = p?.x ?? rest.x;
        const cy = p?.y ?? rest.y;
        return { x: cx + hw, y: cy + hh };
    }
}
