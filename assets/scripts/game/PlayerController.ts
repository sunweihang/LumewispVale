import { _decorator, Component, Node, UITransform, Vec3 } from 'cc';
import { InputBridge } from './InputBridge';

const { ccclass, property } = _decorator;

@ccclass('PlayerController')
export class PlayerController extends Component {
    @property
    speed = 300;

    @property
    bodyWidth = 24;

    @property
    bodyHeight = 16;

    @property
    enableCollision = true;

    @property(Node)
    world: Node | null = null;

    private readonly _tmp = new Vec3();
    private _solids: { x: number; y: number; hw: number; hh: number }[] = [];

    start() {
        this.rebuildSolids();
    }

    rebuildSolids() {
        this._solids.length = 0;
        if (!this.world) return;
        for (const child of this.world.children) {
            if (child === this.node) continue;
            if (!this.isSolidName(child.name)) continue;
            const ui = child.getComponent(UITransform);
            if (!ui) continue;
            const pos = child.position;
            const hw = Math.max(14, ui.contentSize.width * 0.28);
            const hh = Math.max(10, ui.contentSize.height * 0.12);
            this._solids.push({ x: pos.x, y: pos.y + hh, hw, hh });
        }
    }

    update(dt: number) {
        const dir = InputBridge.move;
        if (dir.lengthSqr() < 0.0001) return;

        const pos = this.node.position;
        let nx = pos.x + dir.x * this.speed * dt;
        let ny = pos.y + dir.y * this.speed * dt;

        if (this.enableCollision) {
            if (this.collides(nx, pos.y)) nx = pos.x;
            if (this.collides(nx, ny)) ny = pos.y;
        }

        // Portrait map after width-fit scale — allow the full authored field.
        nx = Math.max(-520, Math.min(520, nx));
        ny = Math.max(-900, Math.min(900, ny));
        this._tmp.set(nx, ny, 0);
        this.node.setPosition(this._tmp);
    }

    private collides(x: number, y: number): boolean {
        const hw = this.bodyWidth * 0.5;
        const hh = this.bodyHeight * 0.5;
        const cy = y + hh;
        for (let i = 0; i < this._solids.length; i++) {
            const s = this._solids[i];
            if (Math.abs(x - s.x) < hw + s.hw && Math.abs(cy - s.y) < hh + s.hh) {
                return true;
            }
        }
        return false;
    }

    private isSolidName(name: string): boolean {
        return (
            name.startsWith('cottage_') ||
            name.startsWith('shed') ||
            name.startsWith('fence') ||
            name.startsWith('tree_') ||
            name.startsWith('prop_shipping') ||
            name.startsWith('prop_mailbox') ||
            // decor_rock_solid_0 / decor_pine_solid_n1 — weeds are soft
            (name.startsWith('decor_') && name.includes('_solid_'))
        );
    }
}
