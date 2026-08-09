import { _decorator, Component, Node, UITransform } from 'cc';

const { ccclass, property } = _decorator;

/**
 * Stable painter sort for 3/4 top-down:
 * - Ground tiles always behind
 * - Props/characters sorted by foot Y (node.y for bottom-anchored sprites)
 */
@ccclass('WorldYSort')
export class WorldYSort extends Component {
    @property
    interval = 0.05;

    private _cd = 0;

    update(dt: number) {
        this._cd -= dt;
        if (this._cd > 0) return;
        this._cd = this.interval;
        this.sortNow();
    }

    sortNow() {
        const world = this.node;
        const ground: Node[] = [];
        const actors: { node: Node; y: number }[] = [];

        for (const child of world.children) {
            if (this.isGround(child.name)) {
                ground.push(child);
            } else {
                actors.push({ node: child, y: this.footY(child) });
            }
        }

        // Higher footY (north) draws first / behind; lower footY in front
        actors.sort((a, b) => b.y - a.y);
        // Base tiles under sod fringe; both still behind every actor.
        ground.sort((a, b) => this.groundRank(a.name) - this.groundRank(b.name));

        let i = 0;
        for (const n of ground) {
            n.setSiblingIndex(i++);
        }
        for (const a of actors) {
            a.node.setSiblingIndex(i++);
        }
    }

    private groundRank(name: string): number {
        if (name.startsWith('fringe_')) return 5;
        if (name === 'lake_bridge' || name.startsWith('pond_pier_')) return 4;
        if (name.startsWith('pond_deco_')) return 3;
        if (name.startsWith('cliff_') || name.startsWith('pond_cliff_')) return 2;
        if (name.startsWith('water_') || name.startsWith('pond_water_')) return 1;
        return 0;
    }

    private footY(n: Node): number {
        // Bottom-anchored art: position.y is already the foot.
        // Center-anchored leftovers: approximate foot as y - half height.
        const ui = n.getComponent(UITransform);
        if (!ui) return n.position.y;
        if (Math.abs(ui.anchorY) < 0.05) return n.position.y;
        return n.position.y - ui.contentSize.height * ui.anchorY;
    }

    private isGround(name: string): boolean {
        // lake_bridge_rail_s is an actor (Y-sorted) so the south rail occludes correctly.
        if (name === 'lake_bridge_rail_s') return false;
        return (
            name.startsWith('tile-') ||
            name.startsWith('fringe_') ||
            name.startsWith('water_') ||
            name.startsWith('cliff_') ||
            name.startsWith('pond_') ||
            name === 'lake_bridge'
        );
    }
}
