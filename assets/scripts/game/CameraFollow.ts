import { _decorator, Component, Node, UITransform, Vec3 } from 'cc';
import { DESIGN_H, DESIGN_W } from './PortraitFit';

const { ccclass, property } = _decorator;

/**
 * Keeps the protagonist centered in the portrait frame, then clamps so the
 * camera never pans past the authored map edges (player de-centers near borders).
 * Moves World (not the UI Camera) so Canvas HUD / joystick stay screen-fixed.
 */
@ccclass('CameraFollow')
export class CameraFollow extends Component {
    @property(Node)
    target: Node | null = null;

    @property(Node)
    world: Node | null = null;

    /** World-space Y lift so the torso sits near screen center (feet-anchored sprite). */
    @property
    focusYOffset = 28;

    private readonly _tmp = new Vec3();
    private _hasBounds = false;
    private _mapMinX = 0;
    private _mapMaxX = 0;
    private _mapMinY = 0;
    private _mapMaxY = 0;

    /** Inclusive world-space AABB of walkable ground (tile edges, not centers). */
    setMapBounds(minX: number, maxX: number, minY: number, maxY: number) {
        this._mapMinX = minX;
        this._mapMaxX = maxX;
        this._mapMinY = minY;
        this._mapMaxY = maxY;
        this._hasBounds = maxX > minX && maxY > minY;
    }

    start() {
        this.snap();
    }

    lateUpdate() {
        this.snap();
    }

    snap() {
        const target = this.target;
        const world = this.world;
        if (!target?.isValid || !world?.isValid) return;

        const p = target.position;
        const s = Math.max(1e-6, world.scale.x);
        let wx = -p.x * s;
        let wy = -(p.y + this.focusYOffset) * s;

        if (this._hasBounds) {
            const { halfW, halfH } = this.viewHalf();
            let minWx = halfW - this._mapMaxX * s;
            let maxWx = -halfW - this._mapMinX * s;
            if (minWx > maxWx) {
                const mid = (minWx + maxWx) * 0.5;
                minWx = maxWx = mid;
            }
            let minWy = halfH - this._mapMaxY * s;
            let maxWy = -halfH - this._mapMinY * s;
            if (minWy > maxWy) {
                const mid = (minWy + maxWy) * 0.5;
                minWy = maxWy = mid;
            }
            wx = Math.max(minWx, Math.min(maxWx, wx));
            wy = Math.max(minWy, Math.min(maxWy, wy));
        }

        this._tmp.set(wx, wy, world.position.z);
        world.setPosition(this._tmp);
    }

    private viewHalf(): { halfW: number; halfH: number } {
        const ut = this.node.getComponent(UITransform);
        const w = ut?.contentSize.width || DESIGN_W;
        const h = ut?.contentSize.height || DESIGN_H;
        return { halfW: w * 0.5, halfH: h * 0.5 };
    }
}
