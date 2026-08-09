import { _decorator, Component, Node, Vec3 } from 'cc';

const { ccclass, property } = _decorator;

/**
 * Keeps the protagonist centered in the portrait frame.
 * Moves World (not the UI Camera) so Canvas HUD / joystick stay screen-fixed.
 * FarmSystem.uiToPlotKey already accounts for world.position.
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
        const s = world.scale.x;
        this._tmp.set(-p.x * s, -(p.y + this.focusYOffset) * s, world.position.z);
        world.setPosition(this._tmp);
    }
}
