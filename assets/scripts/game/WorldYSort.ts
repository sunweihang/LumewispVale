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

    onEnable() {
        this._childCount = -1;
        this._moverSig = '';
        this.sortNow();
    }

    start() {
        this._childCount = -1;
        this._moverSig = '';
        this.sortNow();
    }

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

        // Higher footY (north) first → lower sibling index → drawn behind.
        staticActors.sort((a, b) => b.y - a.y || a.node.uuid.localeCompare(b.node.uuid));
        // Rank bands, then north→south within litter so soft decor is stable.
        ground.sort((a, b) => {
            const ra = this.groundRank(a.name);
            const rb = this.groundRank(b.name);
            if (ra !== rb) return ra - rb;
            const dy = this.footY(b) - this.footY(a);
            if (dy !== 0) return dy;
            return a.name.localeCompare(b.name);
        });

        this._groundOrder = ground;
        this._staticActors = staticActors;
        this._childCount = children.length;
        this._moverSig = '';
    }

    /** Nodes that move or spawn/despawn often — must Y-sort every tick. */
    private isMover(name: string): boolean {
        return (
            name === 'Player' ||
            name === 'Crop' ||
            name === 'CropGrowUi' ||
            name.startsWith('npc_')
        );
    }

    private groundRank(name: string): number {
        // Soft litter above fringe so flowers/weeds aren't buried under sod lips.
        if (this.isGroundLitter(name)) return 6;
        if (name.startsWith('fringe_')) return 5;
        if (name === 'lake_bridge' || name.startsWith('pond_pier_')) return 4;
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

    /**
     * Short underfoot decor — always in the ground band so it never covers
     * the player / buildings (dense flower fields were Y-sorting over the hero).
     */
    private isGroundLitter(name: string): boolean {
        // Flowers / weeds / pebbles / twigs — never Y-merge with tree crowns.
        if (name.startsWith('decor_soft_')) return true;
        // Garden flowers/tufts stay underfoot; garden bushes still Y-sort.
        if (name.startsWith('decor_garden_') && !name.includes('_bush_')) return true;
        // Small rocks (not rockBig landmarks) stay underfoot.
        if (name.startsWith('decor_rock_solid') && !name.includes('rockBig')) return true;
        // Floating lily pads — underfoot; reeds use actor Y-sort.
        if (name.startsWith('pond_deco_lily')) return true;
        return false;
    }

    private isGround(name: string): boolean {
        // lake_bridge_rail_s is an actor (Y-sorted) so the south rail occludes correctly.
        if (name === 'lake_bridge_rail_s') return false;
        // Tall mine seal faces are props — must Y-sort with timber/ore/player.
        if (name.startsWith('cliff_seal')) return false;
        // Reeds / wet rocks / sunk logs — must Y-sort with the player (not pond_* ground).
        if (name.startsWith('pond_deco_') && !name.startsWith('pond_deco_lily')) {
            return false;
        }
        if (this.isGroundLitter(name)) return true;
        return (
            name === '__farm_baked' ||
            name === '__town_baked' ||
            name === '__town_spawn' ||
            name === '__mine_baked' ||
            name === '__mine_spawn' ||
            name === '__mayor_house_baked' ||
            name === '__mayor_house_spawn' ||
            name === '__clinic_baked' ||
            name === '__clinic_spawn' ||
            name === '__community_baked' ||
            name === '__community_spawn' ||
            name === '__carpenter_shop_baked' ||
            name === '__carpenter_shop_spawn' ||
            name.startsWith('tile-') ||
            name.startsWith('fringe_') ||
            name.startsWith('water_') ||
            name.startsWith('cliff_') ||
            name.startsWith('pond_') ||
            // Floor tracks — always under timber/mouth/player (not Y-merged as props)
            name.startsWith('prop_rails') ||
            name.startsWith('prop_rug') ||
            name === 'lake_bridge'
        );
    }
}
