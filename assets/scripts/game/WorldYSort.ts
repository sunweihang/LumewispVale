import { _decorator, Component, Node, UITransform } from 'cc';

const { ccclass, property } = _decorator;

type StaticEntry = { node: Node; y: number };

/**
 * Stable painter sort for 3/4 top-down:
 * - Ground tiles always behind (never Y-merged with actors)
 * - Static props sorted once (rebuilt when hierarchy size changes)
 * - Only movers (player / crops / grow UI) re-merge each tick
 */
@ccclass('WorldYSort')
export class WorldYSort extends Component {
    @property
    interval = 0.05;

    private _cd = 0;
    /** Ground band — always drawn first, never mixed by footY with actors. */
    private _groundOrder: Node[] = [];
    /** Static props in draw order (behind → front by footY). */
    private _staticActors: StaticEntry[] = [];
    private _childCount = -1;
    private _moverSig = '';

    update(dt: number) {
        this._cd -= dt;
        if (this._cd > 0) return;
        this._cd = this.interval;
        this.sortNow();
    }

    sortNow() {
        const world = this.node;
        const children = world.children;
        const childCount = children.length;

        if (childCount !== this._childCount || !this._groundOrder.length) {
            this.rebuildStatic(children);
        }

        const movers: StaticEntry[] = [];
        for (let i = 0; i < children.length; i++) {
            const child = children[i]!;
            if (this.isMover(child.name)) {
                movers.push({ node: child, y: this.footY(child) });
            }
        }
        movers.sort((a, b) => b.y - a.y);

        // Skip hierarchy writes when movers haven't moved enough to change order.
        let sig = `${childCount}|${movers.length}`;
        for (let i = 0; i < movers.length; i++) {
            const m = movers[i]!;
            // Quantize to ~4px so micro-jitter doesn't thrash sibling indices.
            sig += `|${m.node.uuid}:${(m.y / 4) | 0}`;
        }
        if (sig === this._moverSig && childCount === this._childCount) {
            return;
        }
        this._moverSig = sig;

        const ground = this._groundOrder;
        const statics = this._staticActors;
        const desired: Node[] = new Array(ground.length + statics.length + movers.length);
        let di = 0;
        for (let g = 0; g < ground.length; g++) {
            desired[di++] = ground[g]!;
        }

        // Merge static actors with movers by footY (higher Y draws first / behind).
        let si = 0;
        let mi = 0;
        while (si < statics.length || mi < movers.length) {
            const s = si < statics.length ? statics[si] : null;
            const m = mi < movers.length ? movers[mi] : null;
            if (!m) {
                desired[di++] = s!.node;
                si++;
                continue;
            }
            if (!s) {
                desired[di++] = m.node;
                mi++;
                continue;
            }
            if (s.y >= m.y) {
                desired[di++] = s.node;
                si++;
            } else {
                desired[di++] = m.node;
                mi++;
            }
        }

        for (let i = 0; i < desired.length; i++) {
            const n = desired[i]!;
            if (!n.isValid) {
                this._childCount = -1;
                return;
            }
            if (n.getSiblingIndex() !== i) n.setSiblingIndex(i);
        }
    }

    private rebuildStatic(children: readonly Node[]) {
        const ground: Node[] = [];
        const staticActors: StaticEntry[] = [];

        for (let i = 0; i < children.length; i++) {
            const child = children[i]!;
            if (this.isMover(child.name)) continue;
            if (this.isGround(child.name)) {
                ground.push(child);
            } else {
                staticActors.push({ node: child, y: this.footY(child) });
            }
        }

        staticActors.sort((a, b) => b.y - a.y);
        ground.sort((a, b) => this.groundRank(a.name) - this.groundRank(b.name));

        this._groundOrder = ground;
        this._staticActors = staticActors;
        this._childCount = children.length;
        this._moverSig = '';
    }

    /** Nodes that move or spawn/despawn often — must Y-sort every tick. */
    private isMover(name: string): boolean {
        return name === 'Player' || name === 'Crop' || name === 'CropGrowUi';
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
            name === '__farm_baked' ||
            name === '__town_baked' ||
            name === '__town_spawn' ||
            name.startsWith('tile-') ||
            name.startsWith('fringe_') ||
            name.startsWith('water_') ||
            name.startsWith('cliff_') ||
            name.startsWith('pond_') ||
            name === 'lake_bridge'
        );
    }
}
