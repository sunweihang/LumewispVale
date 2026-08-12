import { Vec2, view } from 'cc';

/** Touch stick writes here; player reads `move` each frame. */
export class InputBridge {
    static readonly move = new Vec2(0, 0);
    /** Last facing for farm interact (grid step). Default: down. */
    static facingX = 0;
    static facingY = -1;
    /** Full-screen UI (backpack open) — block move-stick entirely. */
    static uiBlocking = false;
    /**
     * Fishing / exclusive pointer modes — TouchJoystick must not track at all
     * (mouse hold must not become drag-to-move).
     */
    static moveLocked = false;

    /**
     * Wired by TouchJoystick — exclusive UIs (fishing) call this to kill an
     * in-flight press so hold-to-lift never becomes drag-to-move.
     */
    static abortStick: (() => void) | null = null;

    static setMove(x: number, y: number) {
        if (InputBridge.moveLocked) {
            InputBridge.move.set(0, 0);
            return;
        }
        const lenSq = x * x + y * y;
        if (lenSq > 1) {
            const len = Math.sqrt(lenSq);
            x /= len;
            y /= len;
        }
        InputBridge.move.set(x, y);
        if (x * x + y * y <= 0.01) return;
        // Facing hysteresis: keep current axis until the other clearly wins.
        const ax = Math.abs(x);
        const ay = Math.abs(y);
        const onX = InputBridge.facingY === 0;
        const bias = 1.3;
        if (onX) {
            if (ay > ax * bias) {
                InputBridge.facingX = 0;
                InputBridge.facingY = y >= 0 ? 1 : -1;
            } else {
                InputBridge.facingX = x >= 0 ? 1 : -1;
                InputBridge.facingY = 0;
            }
        } else if (ax > ay * bias) {
            InputBridge.facingX = x >= 0 ? 1 : -1;
            InputBridge.facingY = 0;
        } else {
            InputBridge.facingX = 0;
            InputBridge.facingY = y >= 0 ? 1 : -1;
        }
    }

    static clear() {
        InputBridge.move.set(0, 0);
    }

    /**
     * Optional top-right info board hit-test (set by FarmInfoBoard).
     * `uiX/uiY` are UI coords with origin at bottom-left.
     */
    static infoBoardHit: ((uiX: number, uiY: number) => boolean) | null = null;

    /**
     * Optional GM chip hit-test (set by GmPanel).
     * `uiX/uiY` are UI coords with origin at bottom-left.
     */
    static gmUiHit: ((uiX: number, uiY: number) => boolean) | null = null;

    /** True while the GM overlay owns Escape (avoids FarmHUD↔GmPanel imports). */
    static gmPanelOpen = false;

    /**
     * Bottom hotbar band / info board — drag-to-move must not start here.
     * `uiX/uiY` are UI coords with origin at bottom-left.
     * Left dock stick sits above this band (canvas Y ≈ -560 → uiY ≈ 400).
     */
    static isActionZone(uiX?: number, uiY?: number): boolean {
        if (InputBridge.moveLocked || InputBridge.uiBlocking) return true;
        if (uiY !== undefined && uiY < 260) return true;
        if (uiX !== undefined && uiY !== undefined && InputBridge.infoBoardHit?.(uiX, uiY)) {
            return true;
        }
        if (uiX !== undefined && uiY !== undefined && InputBridge.gmUiHit?.(uiX, uiY)) {
            return true;
        }
        return false;
    }
}
