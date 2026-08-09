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
    { kind: 'rockBig', x: -300, y: 200, solid: true },
    { kind: 'stump', x: -340, y: 120, solid: true },
    { kind: 'log', x: -280, y: 60, solid: true },
    { kind: 'rockBig', x: 200, y: -60, solid: true },
    { kind: 'log', x: -200, y: -200, solid: true },
    { kind: 'stump', x: 120, y: -140, solid: true },
    { kind: 'rock', x: 280, y: -200, solid: true },
    { kind: 'stump', x: -40, y: -280, solid: true },
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
    fence: { w: 64, h: 64 },
};

/**
 * Stardew-like portrait farm map:
 * forest fringe → house yard (UR) → open tillable clearing → wild fringe → river.
 */
export class FarmWorldLayout {
    /** Porch path in front of the farmhouse. */
    static readonly PLAYER_SPAWN = { x: 160, y: 280 };

    private static _tillable: Set<string> | null = null;

    static farmPlotKeys(): Set<string> {
        if (!this._tillable) {
            this._tillable = new Set(TILLABLE.map(([ix, iy]) => `${ix},${iy}`));
        }
        return this._tillable;
    }

    static apply(
        world: Node,
        _localW: number,
        _localH: number,
        onDecorDone?: () => void,
    ) {
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
                child.name.startsWith('fringe_')
            ) {
                child.destroy();
            }
        }
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

    /** Keep farm plots + porch approach open for play. */
    private static isClearingCell(ix: number, iy: number): boolean {
        if (this.farmPlotKeys().has(`${ix},${iy}`)) return true;
        // Porch / path toward plots
        if (ix >= 0 && ix <= 3 && iy >= 1 && iy <= 4) return true;
        // House yard walkway
        if (ix >= 1 && ix <= 4 && iy >= 4 && iy <= 6) return true;
        return false;
    }

    /**
     * Stardew-like: farm plots stay grass until hoed.
     * Larger golden dirt fields + porch path (organic edges).
     * Shape is noise-nibbled so regions are not axis-aligned rectangles.
     */
    private static isDirtCell(ix: number, iy: number): boolean {
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
            this.placeSoftClutter(world, loaded);
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

    /** Mailbox, shipping bin, short L-fence around the house yard. */
    private static placeYard(
        world: Node,
        loaded: Partial<Record<FrameKey, SpriteFrame>>,
    ) {
        if (loaded.mailbox) {
            this.spawnNode(world, 'prop_mailbox', loaded.mailbox, 'mailbox', 100, 330);
        }
        if (loaded.shipping) {
            this.spawnNode(world, 'prop_shipping', loaded.shipping, 'shipping', 340, 310);
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
        for (let iy = -7; iy <= 9; iy++) {
            for (let ix = -8; ix <= 7; ix++) {
                if (this.isClearingCell(ix, iy)) continue;
                // Keep shed / house footprints readable
                if (ix >= -7 && ix <= -4 && iy >= 2 && iy <= 4) continue;
                if (ix >= 1 && ix <= 5 && iy >= 5 && iy <= 7) continue;

                const edge =
                    ix <= -6 || ix >= 5 || iy <= -5 || iy >= 7 ||
                    (ix <= -4 && iy >= 4) ||
                    (ix >= 4 && iy <= -1);
                const midWild = !edge && (ix <= -3 || ix >= 3 || iy <= -3 || iy >= 5);
                let chance = edge ? 0.78 : midWild ? 0.48 : 0.22;
                // Dirt fields get fewer big trees, more open weed space (like ref)
                if (this.isDirtCell(ix, iy)) chance *= 0.45;
                if (this.noise01(ix, iy, 31) > chance) continue;

                const roll = this.noise01(ix, iy, 33);
                let kind: FrameKey;
                if (roll < 0.34) kind = 'pine';
                else if (roll < 0.68) kind = 'oak';
                else kind = 'bush';
                if (!loaded[kind]) kind = treeKinds[Math.floor(roll * treeKinds.length)];
                const sf = loaded[kind];
                if (!sf) continue;

                const jx = this.noise(ix, iy + 2) * 22;
                const jy = this.noise(ix + 2, iy) * 18;
                this.spawnNode(
                    world,
                    `decor_${kind}_solid_w${n}`,
                    sf,
                    kind,
                    ix * TILE + jx,
                    iy * TILE + jy,
                );
                n++;

                // Extra bush tucked under many trees
                if (kind !== 'bush' && loaded.bush && this.noise01(ix, iy, 35) > 0.45) {
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

    /**
     * Blanket weeds/tufts/pebbles — nearly every non-plot cell.
     */
    private static placeSoftClutter(
        world: Node,
        loaded: Partial<Record<FrameKey, SpriteFrame>>,
    ) {
        const available = SOFT_KINDS.filter((k) => loaded[k]);
        if (!available.length) return;

        let n = 0;
        for (let iy = -7; iy <= 8; iy++) {
            for (let ix = -8; ix <= 7; ix++) {
                if (this.farmPlotKeys().has(`${ix},${iy}`)) continue;
                // Thin litter on porch so path stays readable
                if (ix >= 0 && ix <= 3 && iy >= 1 && iy <= 4) {
                    if (this.noise01(ix, iy, 11) < 0.78) continue;
                }
                if (ix >= 1 && ix <= 4 && iy >= 5 && iy <= 6) {
                    if (this.noise01(ix, iy, 12) < 0.85) continue;
                }

                const dirt = this.isDirtCell(ix, iy);
                // Cover the ground: almost every cell, 1–3 pieces
                const density = dirt ? 0.92 : 0.88;
                if (this.noise01(ix, iy, 1) > density) continue;

                const count =
                    this.noise01(ix, iy, 2) > 0.35 ? (this.noise01(ix, iy, 3) > 0.55 ? 3 : 2) : 1;
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

                if (dirt && this.noise01(ix, iy, 9) > 0.72 && loaded.rock) {
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
