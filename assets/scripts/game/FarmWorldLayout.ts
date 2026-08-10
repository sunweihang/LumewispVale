import { assetManager, Node, Sprite, SpriteFrame, UITransform } from 'cc';
import { NATURE_FRAMES } from './NatureFrames';
import { TERRAIN_FRAMES } from './TerrainFrames';

const TILE = 64;

type TileKind = 'grass' | 'dirt';
type FrameKey = keyof typeof NATURE_FRAMES;
type TerrainKey = keyof typeof TERRAIN_FRAMES;

const HIDE_PROPS = [
    'meteor',
    'shop',
    'community',
    'cottage_blue',
    'fountain',
    'lamp1',
    'lamp2',
    'bench',
    'tree_blossom',
    'sign',
    // runtime-spawned from AI frames instead
    'tree_oak1',
    'tree_oak2',
    'bush1',
    'bush2',
];

/** Clean clearing south-west of the house — the playable farm plots. */
const TILLABLE: Array<[number, number]> = [
    [-3, 1], [-2, 1], [-1, 1], [0, 1],
    [-3, 0], [-2, 0], [-1, 0], [0, 0],
    [-3, -1], [-2, -1], [-1, -1], [0, -1],
    [-2, 2], [-1, 2], [0, 2],
];

/**
 * Landmark solids (extra trees/weeds are filled procedurally — see placeWildCover).
 */
const DECOR: Array<{ kind: FrameKey; x: number; y: number; solid?: boolean }> = [
    { kind: 'rockBig', x: -240, y: 220, solid: true },
    { kind: 'stump', x: -200, y: 140, solid: true },
    { kind: 'rockBig', x: 200, y: -60, solid: true },
    { kind: 'log', x: -120, y: -260, solid: true },
    { kind: 'stump', x: 120, y: -140, solid: true },
    { kind: 'rock', x: 280, y: -200, solid: true },
    { kind: 'stump', x: -40, y: -280, solid: true },
    { kind: 'rock', x: -260, y: 80, solid: true },
];

/** Soft ground litter — weeds dominate; pebbles/twigs as accents. */
const SOFT_KINDS: FrameKey[] = [
    'weed',
    'weedBloom',
    'weedTall',
    'weedPink',
    'tuft',
    'pebble',
    'twig',
    'fiber',
];

/**
 * Dock: short dirt approach → one footbridge span (wood + rails match 1:1).
 * No tip stub / extra pier tiles past the rails.
 */
const LAKE_PIER: Array<[number, number]> = [
    [-2, -2], // dirt approach
    [-3, -2],
    [-4, -2],
    [-5, -2],
    [-6, -2],
    [-7, -2], // west end of bridge
];

/** Dirt path only — never under the bridge. */
const LAKE_PIER_DIRT: Array<[number, number]> = [
    [-2, -2],
    [-3, -2],
];

/** Wood deck exactly under the 4-tile bridge (same cells as rails). */
const LAKE_PIER_WOOD: Array<[number, number]> = [
    [-4, -2],
    [-5, -2],
    [-6, -2],
    [-7, -2],
];

/** Bridge art size — must match LAKE_PIER_WOOD span (4 × 64). */
const BRIDGE_W = 256;
const BRIDGE_H = 88;
const BRIDGE_RAIL_H = 40;

const BRIDGE_UUID = '7aa6cfc8-27bf-4b43-b089-e517d86b64a2@f9941';
const BRIDGE_RAIL_S_UUID = '42966d38-2c6d-44fb-b938-bf882cb6890f@f9941';

const SIZE: Record<string, { w: number; h: number }> = {
    rock: { w: 48, h: 40 },
    rockBig: { w: 72, h: 56 },
    stump: { w: 56, h: 48 },
    log: { w: 80, h: 32 },
    weed: { w: 40, h: 36 },
    weedBloom: { w: 40, h: 36 },
    weedTall: { w: 36, h: 40 },
    weedPink: { w: 36, h: 40 },
    tuft: { w: 28, h: 24 },
    pebble: { w: 24, h: 18 },
    twig: { w: 32, h: 20 },
    fiber: { w: 20, h: 16 },
    pine: { w: 96, h: 144 },
    oak: { w: 128, h: 160 },
    bush: { w: 64, h: 64 },
    mailbox: { w: 48, h: 64 },
    shipping: { w: 96, h: 80 },
    craftbench: { w: 96, h: 80 },
    fence: { w: 64, h: 64 },
    lily: { w: 28, h: 24 },
    lilyBloom: { w: 28, h: 24 },
    reed: { w: 40, h: 44 },
    rockWet: { w: 40, h: 28 },
    logSunk: { w: 88, h: 36 },
};

/**
 * Stardew-like portrait farm map:
 * forest fringe → house yard (UR) → open tillable clearing → wild fringe → river.
 */
export class FarmWorldLayout {
    /** Porch path in front of the farmhouse. */
    static readonly PLAYER_SPAWN = { x: 160, y: 280 };

    private static _tillable: Set<string> | null = null;
    private static _pondWater: Set<string> | null = null;
    private static _pondCells: Set<string> | null = null;
    private static _lakePier: Set<string> | null = null;

    static farmPlotKeys(): Set<string> {
        if (!this._tillable) {
            this._tillable = new Set(TILLABLE.map(([ix, iy]) => `${ix},${iy}`));
        }
        return this._tillable;
    }

    /**
     * Lake footprint — same idea as dirt fields: warped blob + noisy rim
     * nibble so the macro shape isn't an axis-aligned box. Pixel-soft edges
     * come from grass fringe overlays (see paintWaterFringe), not shore tiles.
     */
    private static buildPondWater(): Array<[number, number]> {
        const set = new Set<string>();
        // Wide scan — lake spans most of the western map
        for (let iy = -18; iy <= 9; iy++) {
            for (let ix = -24; ix <= -2; ix++) {
                if (!this.isLakeCell(ix, iy)) continue;
                set.add(`${ix},${iy}`);
            }
        }

        // Light corner nibble only (heavy nibble was shrinking the lake)
        for (const key of [...set]) {
            const [ix, iy] = key.split(',').map(Number);
            const n = set.has(`${ix},${iy + 1}`);
            const s = set.has(`${ix},${iy - 1}`);
            const e = set.has(`${ix + 1},${iy}`);
            const w = set.has(`${ix - 1},${iy}`);
            const landOrtho =
                (n ? 0 : 1) + (s ? 0 : 1) + (e ? 0 : 1) + (w ? 0 : 1);
            if (landOrtho >= 2 && this.noise01(ix, iy, 70) > 0.62) {
                set.delete(key);
            }
        }

        this.jitterShoreline(set);

        // Drop orphan puddles
        for (const key of [...set]) {
            const [ix, iy] = key.split(',').map(Number);
            let n = 0;
            if (set.has(`${ix},${iy + 1}`)) n++;
            if (set.has(`${ix},${iy - 1}`)) n++;
            if (set.has(`${ix + 1},${iy}`)) n++;
            if (set.has(`${ix - 1},${iy}`)) n++;
            if (n < 2) set.delete(key);
        }

        // Carve continuous pier land; flood water on N/S of the wood dock only
        const pier = this.lakePierKeys();
        for (const key of pier) set.delete(key);
        for (const [ix, iy] of LAKE_PIER_WOOD) {
            for (const dy of [1, -1]) {
                const nKey = `${ix},${iy + dy}`;
                if (pier.has(nKey)) continue;
                if (this.farmPlotKeys().has(nKey)) continue;
                set.add(nKey);
            }
        }

        return [...set].map((key) => {
            const [ix, iy] = key.split(',').map(Number);
            return [ix, iy] as [number, number];
        });
    }

    /**
     * Push coasts in/out so long cardinal walls break into steps and bays
     * (same role as dirt-field rim noise).
     */
    private static jitterShoreline(set: Set<string>) {
        const canExpand = (ix: number, iy: number) => {
            const key = `${ix},${iy}`;
            if (this.farmPlotKeys().has(key) || this.lakePierKeys().has(key)) return false;
            if (ix >= -8 && ix <= -4 && iy >= 2 && iy <= 5) return false;
            if (ix >= -2) return false;
            return true;
        };

        // North edge — prefer steps / small bays over shrinking the lake
        const cols = new Map<number, number>();
        for (const key of set) {
            const [ix, iy] = key.split(',').map(Number);
            cols.set(ix, Math.max(cols.get(ix) ?? -999, iy));
        }
        for (const [ix, maxY] of cols) {
            const roll = this.noise01(ix, maxY, 91);
            if (roll > 0.72) {
                set.delete(`${ix},${maxY}`);
            } else if (roll < 0.22 && canExpand(ix, maxY + 1)) {
                set.add(`${ix},${maxY + 1}`);
            }
            const left = cols.get(ix - 1);
            const right = cols.get(ix + 1);
            if (left === maxY && right === maxY && this.noise01(ix, 3, 93) > 0.55) {
                set.delete(`${ix},${maxY}`);
            }
        }

        // South edge
        const colsS = new Map<number, number>();
        for (const key of set) {
            const [ix, iy] = key.split(',').map(Number);
            colsS.set(ix, Math.min(colsS.get(ix) ?? 999, iy));
        }
        for (const [ix, minY] of colsS) {
            const roll = this.noise01(ix, minY, 97);
            if (roll > 0.74) {
                set.delete(`${ix},${minY}`);
            } else if (roll < 0.2 && canExpand(ix, minY - 1)) {
                set.add(`${ix},${minY - 1}`);
            }
        }

        // West edge
        const rows = new Map<number, number>();
        for (const key of set) {
            const [ix, iy] = key.split(',').map(Number);
            rows.set(iy, Math.min(rows.get(iy) ?? 999, ix));
        }
        for (const [iy, minX] of rows) {
            const roll = this.noise01(minX, iy, 95);
            if (roll > 0.74) {
                set.delete(`${minX},${iy}`);
            } else if (roll < 0.2 && canExpand(minX - 1, iy)) {
                set.add(`${minX - 1},${iy}`);
            }
            const up = rows.get(iy + 1);
            const down = rows.get(iy - 1);
            if (up === minX && down === minX && this.noise01(5, iy, 96) > 0.55) {
                set.delete(`${minX},${iy}`);
            }
        }

        // East edge (toward farm) — mostly keep size; only step long flats
        const rowsE = new Map<number, number>();
        for (const key of set) {
            const [ix, iy] = key.split(',').map(Number);
            rowsE.set(iy, Math.max(rowsE.get(iy) ?? -999, ix));
        }
        for (const [iy, maxX] of rowsE) {
            const roll = this.noise01(maxX, iy, 98);
            if (roll > 0.78) {
                set.delete(`${maxX},${iy}`);
            } else if (roll < 0.18 && canExpand(maxX + 1, iy)) {
                set.add(`${maxX + 1},${iy}`);
            }
        }
    }

    private static lakePierKeys(): Set<string> {
        if (!this._lakePier) {
            this._lakePier = new Set(LAKE_PIER.map(([ix, iy]) => `${ix},${iy}`));
        }
        return this._lakePier;
    }

    /** Huge western lake — wide core, soft noisy rim (doesn't eat farm / shed). */
    private static isLakeCell(ix: number, iy: number): boolean {
        if (this.farmPlotKeys().has(`${ix},${iy}`)) return false;
        if (this.lakePierKeys().has(`${ix},${iy}`)) return false;
        // Keep shed yard on land
        if (ix >= -8 && ix <= -4 && iy >= 2 && iy <= 5) return false;
        // Don't flood the farm clearing / house side
        if (ix >= -2) return false;

        // Centered west of the pier; spans ~22×18 tiles before rim noise
        const cx = -12.2;
        const cy = -3.2;
        let dx = (ix - cx) / 12.4;
        let dy = (iy - cy) / 10.2;
        // Mild warp — keep a large open body of water
        dx += Math.sin(iy * 0.45) * 0.12 + this.noise(ix, iy + 3) * 0.14;
        dy += Math.sin(ix * 0.4 + 1.1) * 0.1 + this.noise(ix + 2, iy) * 0.12;
        let d = dx * dx + dy * dy;
        d += Math.sin(ix * 0.55 - iy * 0.35) * 0.06;
        d += Math.sin(iy * 0.7 + ix * 0.2) * 0.05;
        const wobble = this.noise01(ix, iy, 4) * 0.28;

        // Broad solid core (most of the lake)
        if (d < 0.78 + wobble * 0.2) return true;
        // Soft outer rim — mostly keep water, light nibble only
        if (d < 0.98 + wobble) return this.noise01(ix, iy, 19) > 0.18;
        if (d < 1.12 + wobble * 0.35) return this.noise01(ix, iy, 29) > 0.45;
        return false;
    }

    private static pondWaterKeys(): Set<string> {
        if (!this._pondWater) {
            this._pondWater = new Set(this.buildPondWater().map(([ix, iy]) => `${ix},${iy}`));
        }
        return this._pondWater;
    }

    private static pondCellKeys(): Set<string> {
        if (!this._pondCells) {
            this._pondCells = new Set(this.pondWaterKeys());
        }
        return this._pondCells;
    }

    /** True when World was authored/baked into the scene (see tools/ui/bake_farm_scene.py). */
    static isBaked(world: Node): boolean {
        return !!world.getChildByName('__farm_baked');
    }

    static apply(
        world: Node,
        _localW: number,
        _localH: number,
        onDecorDone?: () => void,
    ) {
        // Scene-authored farm — do not rebuild tiles/props at runtime.
        if (this.isBaked(world)) {
            onDecorDone?.();
            return;
        }
        // Rebuild lake footprint each apply (shape / pier tweaks)
        this._pondWater = null;
        this._pondCells = null;
        this._lakePier = null;
        this.clearRuntimeDecor(world);
        this.hideClutter(world);
        this.placeCoreProps(world);
        this.loadTerrainThenDecor(world, onDecorDone);
    }

    static placeBridge(world: Node) {
        let waterY = -448;
        for (const child of world.children) {
            if (!child.name.startsWith('water_')) continue;
            waterY = Math.min(waterY, child.position.y);
        }
        const bridge = world.getChildByName('bridge');
        if (bridge) {
            bridge.active = true;
            bridge.setPosition(0, waterY + 40, 0);
        }
    }

    private static clearRuntimeDecor(world: Node) {
        for (const child of [...world.children]) {
            if (
                child.name.startsWith('fence_auto_') ||
                child.name.startsWith('decor_') ||
                child.name.startsWith('prop_mailbox') ||
                child.name.startsWith('prop_shipping') ||
                child.name.startsWith('prop_craftbench') ||
                child.name.startsWith('fringe_') ||
                child.name.startsWith('pond_') ||
                child.name === 'lake_bridge' ||
                child.name === 'lake_bridge_rail_s' ||
                child.name.startsWith('pond_deco_')
            ) {
                child.destroy();
            }
        }
    }

    static isPondCell(ix: number, iy: number): boolean {
        return this.pondCellKeys().has(`${ix},${iy}`);
    }

    /** Pier / dock boards (walkable land over the lake). */
    static isPierCell(ix: number, iy: number): boolean {
        return this.lakePierKeys().has(`${ix},${iy}`);
    }

    /** One-tile land ring around pond water (shore walk lane). */
    static isPondShoreCell(ix: number, iy: number): boolean {
        return this.isPondShore(ix, iy);
    }

    /**
     * Resolve a cast target (water / shore / pier) into a walk stand + aim point.
     * Returns null when the tap is not a fishing spot.
     */
    /** Mid-pier stand for idle quest arrows. */
    static fishingHintWorld(): { x: number; y: number } {
        return { x: -5 * TILE, y: -2 * TILE };
    }

    static findFishingStand(
        wx: number,
        wy: number,
    ): { standX: number; standY: number; waterX: number; waterY: number } | null {
        const ix = Math.round(wx / TILE);
        const iy = Math.round(wy / TILE);
        const water = this.pondWaterKeys();
        const pier = this.lakePierKeys();

        const nearestWater = (sx: number, sy: number): { x: number; y: number } | null => {
            let best: { x: number; y: number; d: number } | null = null;
            for (let dy = -2; dy <= 2; dy++) {
                for (let dx = -2; dx <= 2; dx++) {
                    if (!dx && !dy) continue;
                    const nx = sx + dx;
                    const ny = sy + dy;
                    if (!water.has(`${nx},${ny}`)) continue;
                    const d = dx * dx + dy * dy;
                    if (!best || d < best.d) best = { x: nx * TILE, y: ny * TILE, d };
                }
            }
            return best ? { x: best.x, y: best.y } : null;
        };

        // Standing on shore / pier — cast into adjacent water.
        if (!water.has(`${ix},${iy}`) && (this.isPondShore(ix, iy) || pier.has(`${ix},${iy}`))) {
            const w = nearestWater(ix, iy);
            if (!w) return null;
            return { standX: ix * TILE, standY: iy * TILE, waterX: w.x, waterY: w.y };
        }

        // Tapped water — walk to the nearest shore / pier neighbor.
        if (water.has(`${ix},${iy}`)) {
            let best: { sx: number; sy: number; d: number } | null = null;
            for (let r = 1; r <= 4; r++) {
                for (let dy = -r; dy <= r; dy++) {
                    for (let dx = -r; dx <= r; dx++) {
                        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
                        const sx = ix + dx;
                        const sy = iy + dy;
                        const key = `${sx},${sy}`;
                        if (water.has(key)) continue;
                        if (!this.isPondShore(sx, sy) && !pier.has(key)) continue;
                        const d = dx * dx + dy * dy;
                        if (!best || d < best.d) best = { sx, sy, d };
                    }
                }
                if (best) break;
            }
            if (!best) return null;
            return {
                standX: best.sx * TILE,
                standY: best.sy * TILE,
                waterX: ix * TILE,
                waterY: iy * TILE,
            };
        }

        return null;
    }

    /** One-tile ring around water — keep open for walking the shore. */
    private static isPondShore(ix: number, iy: number): boolean {
        if (this.pondCellKeys().has(`${ix},${iy}`)) return false;
        const water = this.pondWaterKeys();
        for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
                if (!dx && !dy) continue;
                if (water.has(`${ix + dx},${iy + dy}`)) return true;
            }
        }
        return false;
    }

    private static hideClutter(world: Node) {
        for (const name of HIDE_PROPS) {
            const n = world.getChildByName(name);
            if (n) n.active = false;
        }
    }

    /** Deterministic hash in [-0.5, 0.5). */
    private static noise(ix: number, iy: number): number {
        const n = Math.sin(ix * 12.9898 + iy * 78.233) * 43758.5453;
        return n - Math.floor(n) - 0.5;
    }

    private static noise01(ix: number, iy: number, salt = 0): number {
        return this.noise(ix + salt * 17, iy - salt * 9) + 0.5;
    }

    /** Keep farm plots + porch + pier corridor clear of trees/bushes. */
    private static isClearingCell(ix: number, iy: number): boolean {
        if (this.lakePierKeys().has(`${ix},${iy}`)) return true;
        if (this.isPondCell(ix, iy)) return true;
        if (this.farmPlotKeys().has(`${ix},${iy}`)) return true;
        // Keep decor off the pier / bridge corridor (incl. neighbors that overflow)
        if (ix >= -10 && ix <= -2 && iy >= -4 && iy <= -1) return true;
        // Porch / path toward plots
        if (ix >= 0 && ix <= 3 && iy >= 1 && iy <= 4) return true;
        // House yard walkway
        if (ix >= 1 && ix <= 4 && iy >= 4 && iy <= 6) return true;
        // Pier mouth + approach from the farm clearing
        if (ix >= -3 && ix <= -1 && iy >= -3 && iy <= -1) return true;
        // Keep a shore walk lane along the east bank (toward plots / shed)
        if (ix === -3 && iy >= -6 && iy <= 3) return true;
        // Soft north–south lane through the eastern wild fringe
        if (ix === 3 && iy >= -10 && iy <= 3) return true;
        return false;
    }

    /**
     * Stardew-like: farm plots stay grass until hoed.
     * Larger golden dirt fields + porch path (organic edges).
     * Shape is noise-nibbled so regions are not axis-aligned rectangles.
     */
    private static isDirtCell(ix: number, iy: number): boolean {
        // Pier approach only — bridge/tip use wood tiles, not golden dirt
        if (LAKE_PIER_DIRT.some(([x, y]) => x === ix && y === iy)) return true;
        if (this.lakePierKeys().has(`${ix},${iy}`)) return false;
        if (this.isPondCell(ix, iy)) return false;
        if (this.farmPlotKeys().has(`${ix},${iy}`)) return false;

        // Porch path — core cells stay dirt; rim nibbled by noise
        const onPorchCore =
            (ix === 1 && iy >= 1 && iy <= 4) ||
            (ix === 0 && iy >= 2 && iy <= 3) ||
            (ix === 2 && iy >= 2 && iy <= 4);
        const onPorchRim =
            (ix === 0 && iy === 1) ||
            (ix === 0 && iy === 4) ||
            (ix === 3 && iy === 3) ||
            (ix === 2 && iy === 1) ||
            (ix === 3 && iy === 4) ||
            (ix === -1 && iy >= 2 && iy <= 3);
        if (onPorchCore) return true;
        if (onPorchRim) return this.noise01(ix, iy, 2) > 0.35;

        // Yard dirt under / beside the house porch — soft blob, not a box
        if (ix >= 0 && ix <= 5 && iy >= 3 && iy <= 7) {
            const cx = 2.6;
            const cy = 5.1;
            const dx = (ix - cx) / 2.8;
            const dy = (iy - cy) / 1.9;
            const d = dx * dx + dy * dy;
            const wobble = this.noise01(ix, iy, 4) * 0.45;
            if (d < 0.55 + wobble) return true;
            if (d < 1.05 + wobble * 0.5) return this.noise01(ix, iy, 14) > 0.42;
        }

        // Broad worn dirt like the reference farm soil (blob + nibble)
        if (ix >= -7 && ix <= -1 && iy >= -1 && iy <= 5) {
            const dx = (ix + 3.8) / 3.2;
            const dy = (iy - 2.0) / 2.8;
            const d = dx * dx + dy * dy;
            if (d < 0.7 + this.noise01(ix, iy, 3) * 0.55) return true;
        }
        if (ix >= 1 && ix <= 7 && iy >= -4 && iy <= 3) {
            const dx = (ix - 3.8) / 3.4;
            const dy = (iy + 0.2) / 3.0;
            const d = dx * dx + dy * dy;
            if (d < 0.65 + this.noise01(ix, iy, 5) * 0.5) return true;
        }
        if (ix >= -4 && ix <= 3 && iy >= -6 && iy <= -1) {
            const dx = (ix + 0.2) / 3.6;
            const dy = (iy + 3.2) / 2.4;
            const d = dx * dx + dy * dy;
            if (d < 0.55 + this.noise01(ix, iy, 7) * 0.5) return true;
        }
        if (ix >= -6 && ix <= 0 && iy >= -3 && iy <= 1) {
            const dx = (ix + 2.8) / 2.6;
            const dy = (iy + 0.8) / 2.0;
            const d = dx * dx + dy * dy;
            if (d < 0.5 + this.noise01(ix, iy, 8) * 0.45) return true;
        }
        return false;
    }

    private static loadTerrainThenDecor(world: Node, onDone?: () => void) {
        const terrainKeys = Object.keys(TERRAIN_FRAMES) as TerrainKey[];
        const terrain: Partial<Record<TerrainKey, SpriteFrame>> = {};
        let pending = terrainKeys.length;
        const afterTerrain = () => {
            this.paintTerrain(world, terrain);
            this.placePond(world, terrain);
            this.spawnDecor(world, onDone);
        };
        if (!pending) {
            afterTerrain();
            return;
        }
        terrainKeys.forEach((k) => {
            assetManager.loadAny({ uuid: TERRAIN_FRAMES[k] }, (err, asset) => {
                pending--;
                if (!err && asset) terrain[k] = asset as SpriteFrame;
                if (pending <= 0) afterTerrain();
            });
        });
    }

    private static paintTerrain(
        world: Node,
        terrain: Partial<Record<TerrainKey, SpriteFrame>>,
    ) {
        // Drop previous fringe overlays (re-entrant layout apply).
        for (const child of [...world.children]) {
            if (child.name.startsWith('fringe_')) child.destroy();
        }

        const sceneFrames = this.collectFrames(world);
        const frames: Record<TileKind, SpriteFrame | null> = {
            grass: terrain.grass || sceneFrames.grass,
            dirt: terrain.dirt || sceneFrames.dirt,
        };
        const grassVariants = [terrain.grass, terrain.grassB, terrain.grassC].filter(
            Boolean,
        ) as SpriteFrame[];
        const dirtVariants = [terrain.dirt, terrain.dirtB].filter(Boolean) as SpriteFrame[];

        const tiles = this.indexTiles(world);
        const wanted = new Map<string, TileKind>();

        for (let iy = -7; iy <= 8; iy++) {
            for (let ix = -8; ix <= 7; ix++) {
                wanted.set(`${ix},${iy}`, this.isDirtCell(ix, iy) ? 'dirt' : 'grass');
            }
        }
        for (const key of this.farmPlotKeys()) wanted.set(key, 'grass');

        for (const [key, kind] of wanted) {
            const [ix, iy] = key.split(',').map(Number);
            let node = tiles.get(key);
            if (!node) {
                if (kind === 'grass') continue;
                node = this.spawnTile(world, kind, ix, iy, frames);
                tiles.set(key, node);
            } else {
                this.applyKind(node, kind, frames);
            }
            const variants = kind === 'dirt' ? dirtVariants : grassVariants;
            if (variants.length) {
                const pick = variants[Math.abs(Math.floor(this.noise(ix, iy) * 1000)) % variants.length];
                const sp = node.getComponent(Sprite);
                if (sp && pick) sp.spriteFrame = pick;
            }
        }

        // Also re-skin expanded grass outside the authored grid for tile variety.
        for (const child of world.children) {
            if (!child.name.startsWith('tile-grass') && !child.name.startsWith('tile-dirt')) {
                continue;
            }
            const ix = Math.round(child.position.x / TILE);
            const iy = Math.round(child.position.y / TILE);
            const key = `${ix},${iy}`;
            if (wanted.has(key)) continue;
            const kind: TileKind = child.name.startsWith('tile-dirt') ? 'dirt' : 'grass';
            const variants = kind === 'dirt' ? dirtVariants : grassVariants;
            if (!variants.length) continue;
            const pick = variants[Math.abs(Math.floor(this.noise(ix, iy) * 1000)) % variants.length];
            const sp = child.getComponent(Sprite);
            if (sp && pick) sp.spriteFrame = pick;
        }

        for (const [key, node] of tiles) {
            if (wanted.has(key)) continue;
            if (node.name.startsWith('tile-dirt') || node.name.startsWith('tile-stone')) {
                this.applyKind(node, 'grass', frames);
                if (grassVariants.length) {
                    const [ix, iy] = key.split(',').map(Number);
                    const pick =
                        grassVariants[Math.abs(Math.floor(this.noise(ix, iy) * 1000)) % grassVariants.length];
                    const sp = node.getComponent(Sprite);
                    if (sp && pick) sp.spriteFrame = pick;
                }
            }
        }

        this.paintGrassFringe(world, wanted, terrain);
    }

    /** True if cell is grass (or unknown / off-map — treat as grass for edges). */
    private static cellIsGrass(wanted: Map<string, TileKind>, ix: number, iy: number): boolean {
        const k = wanted.get(`${ix},${iy}`);
        return k !== 'dirt';
    }

    /**
     * Stardew-style sod fringe: overlay jagged grass + dark lip onto dirt cells
     * that touch grass, so the grid cut disappears.
     */
    private static paintGrassFringe(
        world: Node,
        wanted: Map<string, TileKind>,
        terrain: Partial<Record<TerrainKey, SpriteFrame>>,
    ) {
        const fringeOf = (key: TerrainKey): SpriteFrame | null => terrain[key] || null;

        for (const [key, kind] of wanted) {
            if (kind !== 'dirt') continue;
            const [ix, iy] = key.split(',').map(Number);
            const n = this.cellIsGrass(wanted, ix, iy + 1);
            const e = this.cellIsGrass(wanted, ix + 1, iy);
            const s = this.cellIsGrass(wanted, ix, iy - 1);
            const w = this.cellIsGrass(wanted, ix - 1, iy);
            const ne = this.cellIsGrass(wanted, ix + 1, iy + 1);
            const nw = this.cellIsGrass(wanted, ix - 1, iy + 1);
            const se = this.cellIsGrass(wanted, ix + 1, iy - 1);
            const sw = this.cellIsGrass(wanted, ix - 1, iy - 1);

            let coverN = false;
            let coverE = false;
            let coverS = false;
            let coverW = false;

            const place = (suffix: string, sf: SpriteFrame | null) => {
                if (!sf) return;
                this.spawnFringe(world, `fringe_${suffix}_${ix}_${iy}`, sf, ix, iy);
            };

            if (n && e) {
                place('out_ne', fringeOf('fringeOutNE'));
                coverN = true;
                coverE = true;
            }
            if (n && w) {
                place('out_nw', fringeOf('fringeOutNW'));
                coverN = true;
                coverW = true;
            }
            if (s && e) {
                place('out_se', fringeOf('fringeOutSE'));
                coverS = true;
                coverE = true;
            }
            if (s && w) {
                place('out_sw', fringeOf('fringeOutSW'));
                coverS = true;
                coverW = true;
            }

            if (n && !coverN) place('n', fringeOf('fringeN'));
            if (e && !coverE) place('e', fringeOf('fringeE'));
            if (s && !coverS) place('s', fringeOf('fringeS'));
            if (w && !coverW) place('w', fringeOf('fringeW'));

            // Concave bites where only the diagonal is grass
            if (!n && !e && ne) place('in_ne', fringeOf('fringeInNE'));
            if (!n && !w && nw) place('in_nw', fringeOf('fringeInNW'));
            if (!s && !e && se) place('in_se', fringeOf('fringeInSE'));
            if (!s && !w && sw) place('in_sw', fringeOf('fringeInSW'));
        }
    }

    private static spawnFringe(
        world: Node,
        name: string,
        sf: SpriteFrame,
        ix: number,
        iy: number,
    ) {
        const node = new Node(name);
        node.layer = world.layer;
        node.setParent(world);
        // Keep with ground stack (WorldYSort.isGround). Sit above base tiles,
        // never among actors — otherwise fringe paints over the player.
        node.setSiblingIndex(1);
        node.setPosition(ix * TILE, iy * TILE, 0);
        const ui = node.addComponent(UITransform);
        ui.setContentSize(TILE, TILE);
        ui.setAnchorPoint(0.5, 0.5);
        const sp = node.addComponent(Sprite);
        sp.sizeMode = Sprite.SizeMode.CUSTOM;
        sp.trim = false;
        sp.spriteFrame = sf;
        return node;
    }

    private static placeCoreProps(world: Node) {
        const house = world.getChildByName('cottage_red');
        if (house) {
            house.active = true;
            house.setPosition(220, 400, 0);
            const ui = house.getComponent(UITransform);
            if (ui) {
                ui.setContentSize(192, 224);
                ui.setAnchorPoint(0.5, 0);
            }
        }
        const shed = world.getChildByName('shed');
        if (shed) {
            shed.active = true;
            shed.setPosition(-380, 180, 0);
            const ui = shed.getComponent(UITransform);
            if (ui) {
                ui.setContentSize(128, 128);
                ui.setAnchorPoint(0.5, 0);
            }
        }
    }

    /**
     * Large western lake: shore-autotiled water (cliff on north banks),
     * continuous wooden pier (land) so the player never walks on water.
     */
    private static placePond(
        world: Node,
        terrain: Partial<Record<TerrainKey, SpriteFrame>>,
    ) {
        for (const child of [...world.children]) {
            if (
                child.name.startsWith('pond_') ||
                child.name === 'lake_bridge' ||
                child.name === 'lake_bridge_rail_s' ||
                child.name.startsWith('pond_pier_') ||
                child.name.startsWith('fringe_water_')
            ) {
                child.destroy();
            }
        }

        let waterSf: SpriteFrame | null = terrain.water || null;
        for (const child of world.children) {
            if (waterSf) break;
            if (!child.name.startsWith('water_')) continue;
            waterSf = child.getComponent(Sprite)?.spriteFrame ?? null;
        }
        if (!waterSf) return;

        // Plain water fill — same as dirt fields using plain dirt (no baked shore rim).
        const cells = this.buildPondWater();
        for (const [ix, iy] of cells) {
            this.spawnGroundTile(world, `pond_water_${ix}_${iy}`, waterSf, ix, iy);
        }

        // Soft jagged grass lip over water edges (identical recipe to paintGrassFringe).
        this.paintWaterFringe(world, this.pondWaterKeys(), terrain);

        this.ensureLakeShoreGrass(world, terrain);
        this.placeLakePierAndBridge(world, terrain);
    }

    /**
     * Stardew-style sod fringe on water cells that touch land — same overlays
     * used for dirt↔grass, so the tile grid cut disappears at the shore.
     * Skip pier neighbors so wood dock edges stay clean.
     */
    private static paintWaterFringe(
        world: Node,
        water: Set<string>,
        terrain: Partial<Record<TerrainKey, SpriteFrame>>,
    ) {
        const fringeOf = (key: TerrainKey): SpriteFrame | null => terrain[key] || null;
        const pier = this.lakePierKeys();
        const isLand = (ix: number, iy: number) => {
            const key = `${ix},${iy}`;
            if (water.has(key)) return false;
            if (pier.has(key)) return false;
            return true;
        };

        for (const key of water) {
            const [ix, iy] = key.split(',').map(Number);
            const n = isLand(ix, iy + 1);
            const e = isLand(ix + 1, iy);
            const s = isLand(ix, iy - 1);
            const w = isLand(ix - 1, iy);
            const ne = isLand(ix + 1, iy + 1);
            const nw = isLand(ix - 1, iy + 1);
            const se = isLand(ix + 1, iy - 1);
            const sw = isLand(ix - 1, iy - 1);

            let coverN = false;
            let coverE = false;
            let coverS = false;
            let coverW = false;

            const place = (suffix: string, sf: SpriteFrame | null) => {
                if (!sf) return;
                this.spawnFringe(world, `fringe_water_${suffix}_${ix}_${iy}`, sf, ix, iy);
            };

            if (n && e) {
                place('out_ne', fringeOf('fringeOutNE'));
                coverN = true;
                coverE = true;
            }
            if (n && w) {
                place('out_nw', fringeOf('fringeOutNW'));
                coverN = true;
                coverW = true;
            }
            if (s && e) {
                place('out_se', fringeOf('fringeOutSE'));
                coverS = true;
                coverE = true;
            }
            if (s && w) {
                place('out_sw', fringeOf('fringeOutSW'));
                coverS = true;
                coverW = true;
            }

            if (n && !coverN) place('n', fringeOf('fringeN'));
            if (e && !coverE) place('e', fringeOf('fringeE'));
            if (s && !coverS) place('s', fringeOf('fringeS'));
            if (w && !coverW) place('w', fringeOf('fringeW'));

            if (!n && !e && ne) place('in_ne', fringeOf('fringeInNE'));
            if (!n && !w && nw) place('in_nw', fringeOf('fringeInNW'));
            if (!s && !e && se) place('in_se', fringeOf('fringeInSE'));
            if (!s && !w && sw) place('in_sw', fringeOf('fringeInSW'));
        }
    }

    /** Fill land around the lake so the west bank isn't bare ScreenFill green. */
    private static ensureLakeShoreGrass(
        world: Node,
        terrain: Partial<Record<TerrainKey, SpriteFrame>>,
    ) {
        let grassSf: SpriteFrame | null = terrain.grass || terrain.grassB || null;
        if (!grassSf) {
            for (const child of world.children) {
                if (!child.name.startsWith('tile-grass')) continue;
                grassSf = child.getComponent(Sprite)?.spriteFrame ?? null;
                if (grassSf) break;
            }
        }
        if (!grassSf) return;

        const water = this.pondWaterKeys();
        const pier = this.lakePierKeys();
        const occupied = new Set<string>();
        for (const child of world.children) {
            if (!child.name.startsWith('tile-grass') && !child.name.startsWith('tile-dirt')) {
                continue;
            }
            const ix = Math.round(child.position.x / TILE);
            const iy = Math.round(child.position.y / TILE);
            occupied.add(`${ix},${iy}`);
        }

        for (let iy = -20; iy <= 11; iy++) {
            for (let ix = -26; ix <= -1; ix++) {
                const key = `${ix},${iy}`;
                if (water.has(key) || pier.has(key) || occupied.has(key)) continue;
                if (this.farmPlotKeys().has(key)) continue;
                // Only fill near the lake footprint (shore + western bank)
                let near = false;
                for (let dy = -2; dy <= 2 && !near; dy++) {
                    for (let dx = -2; dx <= 2 && !near; dx++) {
                        if (water.has(`${ix + dx},${iy + dy}`)) near = true;
                    }
                }
                if (!near && ix > -18) continue;
                if (!near && ix <= -18) {
                    // western bank strip
                    if (iy < -16 || iy > 8) continue;
                }
                this.spawnGroundTile(world, `tile-grass_${ix}_${iy}`, grassSf, ix, iy);
                occupied.add(key);
            }
        }
    }

    /** Dirt approach + tip pier planks + Stardew footbridge (deck ground + south rail actor). */
    private static placeLakePierAndBridge(
        world: Node,
        terrain: Partial<Record<TerrainKey, SpriteFrame>>,
    ) {
        const dirtSf =
            terrain.dirt ||
            terrain.dirtB ||
            (() => {
                for (const child of world.children) {
                    if (!child.name.startsWith('tile-dirt')) continue;
                    return child.getComponent(Sprite)?.spriteFrame ?? null;
                }
                return null;
            })();
        const pierSf = terrain.pier || null;
        const woodKeys = new Set(LAKE_PIER_WOOD.map(([ix, iy]) => `${ix},${iy}`));
        const dirtKeys = new Set(LAKE_PIER_DIRT.map(([ix, iy]) => `${ix},${iy}`));

        for (const [ix, iy] of LAKE_PIER) {
            const key = `${ix},${iy}`;
            const useWood = woodKeys.has(key) && !!pierSf;
            const useDirt = dirtKeys.has(key) && !!dirtSf;

            // Only the short approach is golden dirt; span/tip are wood (no yellow peek).
            if (useDirt) {
                let existing: Node | null = null;
                for (const child of world.children) {
                    if (
                        !child.name.startsWith('tile-grass') &&
                        !child.name.startsWith('tile-dirt')
                    ) {
                        continue;
                    }
                    if (
                        Math.round(child.position.x / TILE) === ix &&
                        Math.round(child.position.y / TILE) === iy
                    ) {
                        existing = child;
                        break;
                    }
                }
                if (existing) {
                    existing.name = `tile-dirt_${ix}_${iy}`;
                    existing.active = true;
                    const sp = existing.getComponent(Sprite);
                    if (sp) sp.spriteFrame = dirtSf;
                    existing.setPosition(ix * TILE, iy * TILE, 0);
                } else {
                    this.spawnGroundTile(world, `tile-dirt_${ix}_${iy}`, dirtSf!, ix, iy);
                }
            } else {
                // Hide any dirt left under the bridge from terrain paint
                for (const child of world.children) {
                    if (!child.name.startsWith('tile-dirt')) continue;
                    if (
                        Math.round(child.position.x / TILE) === ix &&
                        Math.round(child.position.y / TILE) === iy
                    ) {
                        child.active = false;
                    }
                }
            }
            if (useWood && pierSf) {
                this.spawnGroundTile(world, `pond_pier_${ix}_${iy}`, pierSf, ix, iy);
            }
        }

        // Hide authored scene bridge prop if present
        const template = world.getChildByName('bridge');
        if (template) template.active = false;

        // Footbridge centered on wood cells [-7,-2]…[-4,-2] (rails span full deck)
        const bridgeX = -5.5 * TILE;
        const bridgeFootY = -2 * TILE - 44;
        const bridge = new Node('lake_bridge');
        bridge.layer = world.layer;
        bridge.setParent(world);
        const ui = bridge.addComponent(UITransform);
        ui.setContentSize(BRIDGE_W, BRIDGE_H);
        ui.setAnchorPoint(0.5, 0);
        const sp = bridge.addComponent(Sprite);
        sp.sizeMode = Sprite.SizeMode.CUSTOM;
        sp.trim = false;
        bridge.setPosition(bridgeX, bridgeFootY, 0);
        bridge.active = true;

        // South rail + pilings — same width as deck; Y-sorted actor
        const rail = new Node('lake_bridge_rail_s');
        rail.layer = world.layer;
        rail.setParent(world);
        const rui = rail.addComponent(UITransform);
        rui.setContentSize(BRIDGE_W, BRIDGE_RAIL_H);
        rui.setAnchorPoint(0.5, 0);
        const rsp = rail.addComponent(Sprite);
        rsp.sizeMode = Sprite.SizeMode.CUSTOM;
        rsp.trim = false;
        rail.setPosition(bridgeX, -2 * TILE - 20, 0);
        rail.active = true;

        assetManager.loadAny({ uuid: BRIDGE_UUID }, (err, asset) => {
            if (err || !bridge.isValid) return;
            const bsp = bridge.getComponent(Sprite);
            if (bsp) bsp.spriteFrame = asset as SpriteFrame;
        });
        assetManager.loadAny({ uuid: BRIDGE_RAIL_S_UUID }, (err, asset) => {
            if (err || !rail.isValid) return;
            const r = rail.getComponent(Sprite);
            if (r) r.spriteFrame = asset as SpriteFrame;
        });
    }

    /**
     * Stardew lake clutter: lily pads, flower lilies, shore reeds,
     * wet rocks, half-sunk logs — scattered on water cells only.
     */
    private static placeLakeWaterDecor(
        world: Node,
        loaded: Partial<Record<FrameKey, SpriteFrame>>,
    ) {
        for (const child of [...world.children]) {
            if (child.name.startsWith('pond_deco_')) child.destroy();
        }

        const water = this.pondWaterKeys();
        const pier = this.lakePierKeys();
        if (!water.size) return;

        const isShore = (ix: number, iy: number) => {
            for (const [dx, dy] of [
                [0, 1],
                [0, -1],
                [1, 0],
                [-1, 0],
            ] as const) {
                const k = `${ix + dx},${iy + dy}`;
                if (!water.has(k) && !pier.has(k)) return true;
            }
            return false;
        };

        let n = 0;
        const place = (
            kind: FrameKey,
            x: number,
            y: number,
            anchorY = 0.5,
        ) => {
            const sf = loaded[kind];
            if (!sf) return;
            const node = new Node(`pond_deco_${kind}_${n++}`);
            node.layer = world.layer;
            node.setParent(world);
            const sz = SIZE[kind] || { w: 32, h: 32 };
            const ui = node.addComponent(UITransform);
            ui.setContentSize(sz.w, sz.h);
            ui.setAnchorPoint(0.5, anchorY);
            const sp = node.addComponent(Sprite);
            sp.sizeMode = Sprite.SizeMode.CUSTOM;
            sp.trim = false;
            sp.spriteFrame = sf;
            node.setPosition(x, y, 0);
        };

        // Landmark sunk logs across the larger lake
        if (loaded.logSunk) {
            place('logSunk', -720, -80, 0.15);
            place('logSunk', -880, -360, 0.15);
            place('logSunk', -560, -520, 0.15);
            place('logSunk', -1000, -200, 0.15);
        }

        for (const key of water) {
            const [ix, iy] = key.split(',').map(Number);
            // Keep the pier channel visually clear
            if (pier.has(`${ix},${iy}`) || pier.has(`${ix},${iy + 1}`) || pier.has(`${ix},${iy - 1}`)) {
                if (Math.abs(iy - -2) <= 1 && ix >= -9 && ix <= -3) continue;
            }

            const jx = this.noise(ix, iy + 7) * 22;
            const jy = this.noise(ix + 5, iy) * 18;
            const x = ix * TILE + jx;
            const y = iy * TILE + jy;
            const shore = isShore(ix, iy);
            const r = this.noise01(ix, iy, 51);

            if (shore) {
                // Reeds + wet rocks hug the bank
                if (loaded.reed && r > 0.42) {
                    place('reed', x + 4, y - 6, 0);
                }
                if (loaded.rockWet && this.noise01(ix, iy, 53) > 0.62) {
                    place('rockWet', x - 8, y + 4, 0.15);
                }
                if (loaded.lily && this.noise01(ix, iy, 55) > 0.55) {
                    place('lily', x, y, 0.5);
                }
            } else {
                // Open water: lily pads, occasional bloom
                if (r > 0.38 && loaded.lily) {
                    if (this.noise01(ix, iy, 57) > 0.78 && loaded.lilyBloom) {
                        place('lilyBloom', x, y, 0.5);
                    } else {
                        place('lily', x, y, 0.5);
                    }
                    // small cluster
                    if (this.noise01(ix, iy, 59) > 0.7 && loaded.lily) {
                        place(
                            'lily',
                            x + this.noise(ix, iy) * 16,
                            y + this.noise(iy, ix) * 14,
                            0.5,
                        );
                    }
                }
                if (loaded.rockWet && this.noise01(ix, iy, 61) > 0.88) {
                    place('rockWet', x, y, 0.15);
                }
            }
        }
    }

    private static spawnGroundTile(
        world: Node,
        name: string,
        sf: SpriteFrame,
        ix: number,
        iy: number,
    ) {
        const node = new Node(name);
        node.layer = world.layer;
        node.setParent(world);
        node.setSiblingIndex(1);
        node.setPosition(ix * TILE, iy * TILE, 0);
        const ui = node.addComponent(UITransform);
        ui.setContentSize(TILE, TILE);
        ui.setAnchorPoint(0.5, 0.5);
        const sp = node.addComponent(Sprite);
        sp.sizeMode = Sprite.SizeMode.CUSTOM;
        sp.trim = false;
        sp.spriteFrame = sf;
        return node;
    }

    private static spawnDecor(world: Node, onDone?: () => void) {
        const keys = Object.keys(NATURE_FRAMES) as FrameKey[];
        const loaded: Partial<Record<FrameKey, SpriteFrame>> = {};
        let pending = keys.length;
        let finished = false;
        const finish = () => {
            if (finished) return;
            finished = true;
            this.placeYard(world, loaded);
            this.placeDecorList(world, loaded);
            this.placeWildCover(world, loaded);
            this.placeLakeShoreFlora(world, loaded);
            this.placeSoftClutter(world, loaded);
            this.placeLakeWaterDecor(world, loaded);
            onDone?.();
        };
        keys.forEach((k) => {
            assetManager.loadAny({ uuid: NATURE_FRAMES[k] }, (err, asset) => {
                pending--;
                if (!err && asset) loaded[k] = asset as SpriteFrame;
                if (pending <= 0) finish();
            });
        });
    }

    /** Mailbox, yard storage chest, craftbench (left yard), short L-fence around the house yard. */
    private static placeYard(
        world: Node,
        loaded: Partial<Record<FrameKey, SpriteFrame>>,
    ) {
        if (loaded.mailbox) {
            this.spawnNode(world, 'prop_mailbox', loaded.mailbox, 'mailbox', 100, 330);
        }
        if (loaded.shipping) {
            // prop_shipping = interactive storage chest (orthographic 3/4 sprite).
            this.spawnNode(world, 'prop_shipping', loaded.shipping, 'shipping', 340, 310);
        }
        if (loaded.craftbench) {
            // Left yard clearing (door stays open; mailbox is ~100,330).
            this.spawnNode(world, 'prop_craftbench', loaded.craftbench, 'craftbench', 55, 300);
        }

        const fenceSf = loaded.fence;
        const template = world.getChildByName('fence1');
        // Behind + right of house, open toward the field (Stardew yard)
        const spots = [
            { x: 96, y: 470 },
            { x: 160, y: 470 },
            { x: 224, y: 470 },
            { x: 288, y: 470 },
            { x: 352, y: 470 },
            { x: 352, y: 406 },
            { x: 352, y: 342 },
        ];
        spots.forEach((spot, i) => {
            if (fenceSf) {
                this.spawnNode(world, `fence_auto_${i}`, fenceSf, 'fence', spot.x, spot.y);
                return;
            }
            if (!template) return;
            const node =
                i < 2
                    ? world.getChildByName(i === 0 ? 'fence1' : 'fence2')
                    : this.cloneSprite(world, template, `fence_auto_${i}`);
            if (node) {
                node.active = true;
                node.setPosition(spot.x, spot.y, 0);
            }
        });
        if (template) template.active = false;
        const f2 = world.getChildByName('fence2');
        if (f2) f2.active = false;
    }

    private static placeDecorList(
        world: Node,
        loaded: Partial<Record<FrameKey, SpriteFrame>>,
    ) {
        DECOR.forEach((d, i) => {
            const sf = loaded[d.kind];
            if (!sf) return;
            const tag = d.solid ? 'solid' : 'soft';
            this.spawnNode(world, `decor_${d.kind}_${tag}_${i}`, sf, d.kind, d.x, d.y);
        });
    }

    /**
     * Blanket the map with trees/bushes (Stardew wild fringe).
     * Clears stay open for farming + porch walk.
     */
    private static placeWildCover(
        world: Node,
        loaded: Partial<Record<FrameKey, SpriteFrame>>,
    ) {
        const treeKinds = (['pine', 'oak', 'bush'] as FrameKey[]).filter((k) => loaded[k]);
        if (!treeKinds.length) return;

        let n = 0;
        for (let iy = -20; iy <= 11; iy++) {
            for (let ix = -26; ix <= 7; ix++) {
                if (this.isPondCell(ix, iy)) continue;
                if (this.isClearingCell(ix, iy)) continue;
                // Keep shed / house footprints readable
                if (ix >= -7 && ix <= -4 && iy >= 2 && iy <= 4) continue;
                if (ix >= 1 && ix <= 5 && iy >= 5 && iy <= 7) continue;

                const shore = this.isPondShore(ix, iy);
                const edge =
                    shore ||
                    ix <= -18 ||
                    ix >= 5 ||
                    iy <= -12 ||
                    iy >= 8 ||
                    (ix <= -4 && iy >= 4) ||
                    (ix >= 4 && iy <= -1);
                const midWild = !edge && (ix <= -3 || ix >= 3 || iy <= -3 || iy >= 5);
                // Shore stays leafy but must leave walk corridors for pathfinding.
                let chance = shore ? 0.38 : edge ? 0.42 : midWild ? 0.28 : 0.12;
                if (this.isDirtCell(ix, iy)) chance *= 0.45;
                if (this.noise01(ix, iy, 31) > chance) continue;

                const roll = this.noise01(ix, iy, 33);
                let kind: FrameKey;
                if (shore) {
                    // Prefer bushes on shore — smaller collision than oak/pine trunks
                    if (roll < 0.55) kind = 'bush';
                    else if (roll < 0.8) kind = 'pine';
                    else kind = 'oak';
                } else if (roll < 0.34) kind = 'pine';
                else if (roll < 0.68) kind = 'oak';
                else kind = 'bush';
                if (!loaded[kind]) kind = treeKinds[Math.floor(roll * treeKinds.length)];
                const sf = loaded[kind];
                if (!sf) continue;

                const jx = this.noise(ix, iy + 2) * 22;
                const jy = this.noise(ix + 2, iy) * 18;
                // Bushes are soft cover (pickable); only trunks block pathfinding.
                const solid = kind !== 'bush';
                const tag = solid ? 'solid' : 'soft';
                this.spawnNode(
                    world,
                    `decor_${kind}_${tag}_w${n}`,
                    sf,
                    kind,
                    ix * TILE + jx,
                    iy * TILE + jy,
                );
                n++;

                if (kind !== 'bush' && loaded.bush && this.noise01(ix, iy, 35) > 0.4) {
                    this.spawnNode(
                        world,
                        `decor_bush_soft_w${n}`,
                        loaded.bush,
                        'bush',
                        ix * TILE + jx + 18,
                        iy * TILE + jy - 10,
                    );
                    n++;
                }
            }
        }
    }

    /** Dense flowers / weeds / tufts / rocks along the lake bank (Stardew shore). */
    private static placeLakeShoreFlora(
        world: Node,
        loaded: Partial<Record<FrameKey, SpriteFrame>>,
    ) {
        const water = this.pondWaterKeys();
        if (!water.size) return;
        const pier = this.lakePierKeys();
        let n = 0;

        for (let iy = -20; iy <= 11; iy++) {
            for (let ix = -26; ix <= -1; ix++) {
                if (water.has(`${ix},${iy}`)) continue;
                if (pier.has(`${ix},${iy}`)) continue;
                if (this.farmPlotKeys().has(`${ix},${iy}`)) continue;
                // Keep the pier / bridge visually clean — no shore bushes on the dock
                if (this.isClearingCell(ix, iy)) continue;
                if (!this.isPondShore(ix, iy) && ix > -18) continue;

                // Soft carpet — thinned for fill-rate / CPU (was nearly every shore cell).
                const softRoll = this.noise01(ix, iy, 81);
                if (softRoll > 0.55) {
                    const count = softRoll > 0.85 ? 2 : 1;
                    for (let k = 0; k < count; k++) {
                        const roll = this.noise01(ix, iy, 82 + k);
                        let kind: FrameKey;
                        if (roll < 0.18) kind = 'tuft';
                        else if (roll < 0.34) kind = 'weedBloom';
                        else if (roll < 0.5) kind = 'weedPink';
                        else if (roll < 0.68) kind = 'weed';
                        else if (roll < 0.82) kind = 'weedTall';
                        else if (roll < 0.92) kind = 'fiber';
                        else kind = 'pebble';
                        const sf = loaded[kind];
                        if (!sf) continue;
                        this.spawnNode(
                            world,
                            `decor_soft_shore_${kind}_${n}`,
                            sf,
                            kind,
                            ix * TILE + this.noise(ix + k, iy) * 28,
                            iy * TILE + this.noise(ix, iy + k) * 24 - 8,
                        );
                        n++;
                    }
                }

                // Extra shore bushes
                if (loaded.bush && this.noise01(ix, iy, 88) > 0.72) {
                    this.spawnNode(
                        world,
                        `decor_bush_soft_shore_${n}`,
                        loaded.bush,
                        'bush',
                        ix * TILE + this.noise(ix, iy) * 16,
                        iy * TILE + this.noise(iy, ix) * 14,
                    );
                    n++;
                }
                if (loaded.rock && this.noise01(ix, iy, 90) > 0.88) {
                    this.spawnNode(
                        world,
                        `decor_rock_solid_shore_${n}`,
                        loaded.rock,
                        'rock',
                        ix * TILE + this.noise(ix, 3) * 12,
                        iy * TILE + this.noise(3, iy) * 10,
                    );
                    n++;
                }
            }
        }
    }

    /**
     * Scattered weeds/tufts/pebbles — sparse enough for mobile fill-rate.
     */
    private static placeSoftClutter(
        world: Node,
        loaded: Partial<Record<FrameKey, SpriteFrame>>,
    ) {
        const available = SOFT_KINDS.filter((k) => loaded[k]);
        if (!available.length) return;

        let n = 0;
        for (let iy = -20; iy <= 11; iy++) {
            for (let ix = -26; ix <= 7; ix++) {
                if (this.isPondCell(ix, iy)) continue;
                if (this.farmPlotKeys().has(`${ix},${iy}`)) continue;
                // No weeds/rocks on the pier, bridge, or immediate approach
                if (this.lakePierKeys().has(`${ix},${iy}`)) continue;
                if (ix >= -10 && ix <= -2 && iy >= -4 && iy <= -1) continue;
                // Thin litter on porch so path stays readable
                if (ix >= 0 && ix <= 3 && iy >= 1 && iy <= 4) {
                    if (this.noise01(ix, iy, 11) < 0.9) continue;
                }
                if (ix >= 1 && ix <= 4 && iy >= 5 && iy <= 6) {
                    if (this.noise01(ix, iy, 12) < 0.92) continue;
                }

                const dirt = this.isDirtCell(ix, iy);
                const shore = this.isPondShore(ix, iy);
                // Was 0.88–0.96 (nearly every cell) — cut hard for heat.
                const density = shore ? 0.42 : dirt ? 0.38 : 0.32;
                if (this.noise01(ix, iy, 1) > density) continue;

                const count = this.noise01(ix, iy, 2) > 0.72 ? 2 : 1;
                for (let k = 0; k < count; k++) {
                    const roll = this.noise01(ix, iy, 20 + k);
                    let kind: FrameKey;
                    if (dirt) {
                        // Ref dirt: dense weeds + rocks/twigs
                        if (roll < 0.14) kind = 'pebble';
                        else if (roll < 0.26) kind = 'twig';
                        else if (roll < 0.36) kind = 'fiber';
                        else if (roll < 0.5) kind = 'tuft';
                        else if (roll < 0.7) kind = 'weed';
                        else if (roll < 0.84) kind = 'weedTall';
                        else kind = 'weedPink';
                    } else {
                        if (roll < 0.12) kind = 'tuft';
                        else if (roll < 0.22) kind = 'fiber';
                        else if (roll < 0.45) kind = 'weed';
                        else if (roll < 0.62) kind = 'weedBloom';
                        else if (roll < 0.8) kind = 'weedTall';
                        else if (roll < 0.9) kind = 'weedPink';
                        else kind = 'pebble';
                    }
                    if (!loaded[kind]) {
                        kind = available[Math.floor(roll * available.length)];
                    }
                    const sf = loaded[kind];
                    if (!sf) continue;

                    const jx = this.noise(ix + k * 3, iy) * 30;
                    const jy = this.noise(ix, iy + k * 5) * 26;
                    this.spawnNode(
                        world,
                        `decor_soft_${kind}_${n}`,
                        sf,
                        kind,
                        ix * TILE + jx,
                        iy * TILE + jy - TILE * 0.15,
                    );
                    n++;
                }

                if (dirt && this.noise01(ix, iy, 9) > 0.88 && loaded.rock) {
                    this.spawnNode(
                        world,
                        `decor_soft_rock_${n}`,
                        loaded.rock,
                        'rock',
                        ix * TILE + this.noise(ix, iy) * 20,
                        iy * TILE + this.noise(iy, ix) * 16,
                    );
                    n++;
                }
            }
        }
    }

    private static spawnNode(
        world: Node,
        name: string,
        sf: SpriteFrame,
        kind: string,
        x: number,
        y: number,
    ) {
        const node = new Node(name);
        node.layer = world.layer;
        node.setParent(world);
        const sz = SIZE[kind] || { w: 64, h: 64 };
        const ui = node.addComponent(UITransform);
        ui.setContentSize(sz.w, sz.h);
        ui.setAnchorPoint(0.5, 0);
        const sp = node.addComponent(Sprite);
        sp.sizeMode = Sprite.SizeMode.CUSTOM;
        sp.spriteFrame = sf;
        node.setPosition(x, y, 0);
        return node;
    }

    private static cloneSprite(world: Node, template: Node, name: string): Node {
        const node = new Node(name);
        node.layer = world.layer;
        node.setParent(world);
        const srcUi = template.getComponent(UITransform);
        const ui = node.addComponent(UITransform);
        if (srcUi) {
            ui.setContentSize(srcUi.contentSize);
            ui.setAnchorPoint(srcUi.anchorPoint);
        }
        const srcSp = template.getComponent(Sprite);
        const sp = node.addComponent(Sprite);
        sp.sizeMode = Sprite.SizeMode.CUSTOM;
        if (srcSp?.spriteFrame) sp.spriteFrame = srcSp.spriteFrame;
        return node;
    }

    private static collectFrames(world: Node): Record<TileKind, SpriteFrame | null> {
        const out: Record<TileKind, SpriteFrame | null> = { grass: null, dirt: null };
        for (const child of world.children) {
            const sp = child.getComponent(Sprite);
            if (!sp?.spriteFrame) continue;
            if (child.name.startsWith('tile-grass') && !out.grass) out.grass = sp.spriteFrame;
            if (child.name.startsWith('tile-dirt') && !out.dirt) out.dirt = sp.spriteFrame;
        }
        return out;
    }

    private static indexTiles(world: Node): Map<string, Node> {
        const map = new Map<string, Node>();
        for (const child of world.children) {
            if (!child.name.startsWith('tile-grass') && !child.name.startsWith('tile-dirt')) {
                continue;
            }
            const ix = Math.round(child.position.x / TILE);
            const iy = Math.round(child.position.y / TILE);
            map.set(`${ix},${iy}`, child);
        }
        return map;
    }

    private static spawnTile(
        world: Node,
        kind: TileKind,
        ix: number,
        iy: number,
        frames: Record<TileKind, SpriteFrame | null>,
    ): Node {
        const node = new Node(`tile-${kind}_${ix}_${iy}`);
        node.layer = world.layer;
        node.setParent(world);
        node.setSiblingIndex(0);
        node.setPosition(ix * TILE, iy * TILE, 0);
        const ui = node.addComponent(UITransform);
        ui.setContentSize(TILE, TILE);
        ui.setAnchorPoint(0.5, 0.5);
        const sp = node.addComponent(Sprite);
        sp.sizeMode = Sprite.SizeMode.CUSTOM;
        const sf = frames[kind] || frames.grass;
        if (sf) sp.spriteFrame = sf;
        return node;
    }

    private static applyKind(
        node: Node,
        kind: TileKind,
        frames: Record<TileKind, SpriteFrame | null>,
    ) {
        const ix = Math.round(node.position.x / TILE);
        const iy = Math.round(node.position.y / TILE);
        node.name = `tile-${kind}_${ix}_${iy}`;
        const sp = node.getComponent(Sprite);
        const sf = frames[kind] || frames.grass;
        if (sp && sf) sp.spriteFrame = sf;
    }
}
