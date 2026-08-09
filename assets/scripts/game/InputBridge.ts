import { Vec2, view } from 'cc';

/** Touch stick writes here; player reads `move` each frame. */
export class InputBridge {
    static readonly move = new Vec2(0, 0);
    /** Last facing for farm interact (grid step). Default: down. */
    static facingX = 0;
    static facingY = -1;

    static setMove(x: number, y: number) {
        if (x * x + y * y > 1) {
            const len = Math.sqrt(x * x + y * y);
            x /= len;
            y /= len;
        }
        InputBridge.move.set(x, y);
        if (x * x + y * y > 0.01) {
            if (Math.abs(x) >= Math.abs(y)) {
                InputBridge.facingX = x >= 0 ? 1 : -1;
                InputBridge.facingY = 0;
            } else {
                InputBridge.facingX = 0;
                InputBridge.facingY = y >= 0 ? 1 : -1;
            }
        }
    }

    static clear() {
        InputBridge.move.set(0, 0);
    }

    /**
     * Bottom hotbar band — drag-to-move must not start here.
     * `uiX/uiY` are UI coords with origin at bottom-left.
     */
    static isActionZone(_uiX: number, uiY?: number): boolean {
        if (uiY !== undefined && uiY < 260) return true;
        return false;
    }
}
