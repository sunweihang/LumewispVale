import {
    _decorator,
    Component,
    EventMouse,
    EventTouch,
    Input,
    Node,
    UITransform,
    Vec3,
    input,
    view,
} from 'cc';
import { InputBridge } from './InputBridge';

const { ccclass, property } = _decorator;

/**
 * Drag-to-move stick + tap detection:
 * - Finger down → wait
 * - Move beyond threshold → drag stick (move)
 * - Release without dragging → tap (farm tool use / UI)
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

    /** Fired on short tap (ui coords, origin bottom-left). */
    onTap: ((uiX: number, uiY: number) => void) | null = null;

    /** Fired when a press becomes a drag stick — cancel auto-walk jobs. */
    onDragStart: (() => void) | null = null;

    private _tracking = false;
    private _dragging = false;
    /** Finger slid inside UI zone — suppress world/UI tap (item drag handled elsewhere). */
    private _uiSlid = false;
    private _id = -1;
    private _ox = 0;
    private _oy = 0;
    private readonly _tmp = new Vec3();

    onEnable() {
        input.on(Input.EventType.TOUCH_START, this.onTouchStart, this);
        input.on(Input.EventType.TOUCH_MOVE, this.onTouchMove, this);
        input.on(Input.EventType.TOUCH_END, this.onTouchEnd, this);
        input.on(Input.EventType.TOUCH_CANCEL, this.onTouchEnd, this);
        input.on(Input.EventType.MOUSE_DOWN, this.onMouseDown, this);
        input.on(Input.EventType.MOUSE_MOVE, this.onMouseMove, this);
        input.on(Input.EventType.MOUSE_UP, this.onMouseUp, this);
        this.hideVisual();
    }

    onDisable() {
        input.off(Input.EventType.TOUCH_START, this.onTouchStart, this);
        input.off(Input.EventType.TOUCH_MOVE, this.onTouchMove, this);
        input.off(Input.EventType.TOUCH_END, this.onTouchEnd, this);
        input.off(Input.EventType.TOUCH_CANCEL, this.onTouchEnd, this);
        input.off(Input.EventType.MOUSE_DOWN, this.onMouseDown, this);
        input.off(Input.EventType.MOUSE_MOVE, this.onMouseMove, this);
        input.off(Input.EventType.MOUSE_UP, this.onMouseUp, this);
        InputBridge.clear();
        this.hideVisual();
    }

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

    private begin(id: number, x: number, y: number) {
        // Fishing minigame owns the pointer — do not track / drag / tap-steal.
        if (InputBridge.moveLocked) {
            InputBridge.clear();
            return;
        }
        // Hotbar: let FarmHUD handle via tap path (still track, but don't start stick in bar).
        this._tracking = true;
        this._dragging = false;
        this._uiSlid = false;
        this._id = id;
        this._ox = x;
        this._oy = y;
        InputBridge.clear();
    }

    private move(x: number, y: number) {
        if (InputBridge.moveLocked) {
            InputBridge.clear();
            this._tracking = false;
            this._dragging = false;
            this._id = -1;
            this.hideVisual();
            return;
        }
        const dx0 = x - this._ox;
        const dy0 = y - this._oy;
        const dist = Math.sqrt(dx0 * dx0 + dy0 * dy0);

        if (!this._dragging) {
            if (dist < this.dragThreshold) return;
            // Full-screen panels (bag / chest): never start the stick, but keep the
            // gesture eligible for onTap — otherwise close buttons never fire.
            if (InputBridge.uiBlocking) {
                return;
            }
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
        if (InputBridge.moveLocked) {
            this._tracking = false;
            this._dragging = false;
            this._uiSlid = false;
            this._id = -1;
            InputBridge.clear();
            this.hideVisual();
            return;
        }
        const wasDrag = this._dragging;
        const uiSlid = this._uiSlid;
        this._tracking = false;
        this._dragging = false;
        this._uiSlid = false;
        this._id = -1;
        InputBridge.clear();
        this.hideVisual();
        // True short tap only — UI slides / item drags must not fire onTap.
        if (!wasDrag && !uiSlid) {
            this.onTap?.(x, y);
        }
    }

    private showVisualAt(uiX: number, uiY: number) {
        if (!this.visualRoot) return;
        this.visualRoot.active = true;
        // Canvas / visible frame center (not fixed design 1080×1920).
        const canvas = this.node.parent;
        const canvasUi = canvas?.getComponent(UITransform);
        const vis = view.getVisibleSize();
        const hw = (canvasUi?.contentSize.width || vis.width) * 0.5;
        const hh = (canvasUi?.contentSize.height || vis.height) * 0.5;
        this.visualRoot.setPosition(uiX - hw, uiY - hh, 0);
        if (this.knob) this.knob.setPosition(0, 0, 0);
    }

    private hideVisual() {
        if (this.visualRoot) this.visualRoot.active = false;
        if (this.knob) this.knob.setPosition(0, 0, 0);
    }
}
