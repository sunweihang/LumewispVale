import {
    _decorator,
    assetManager,
    Color,
    Component,
    Label,
    Node,
    Sprite,
    SpriteFrame,
    UITransform,
    view,
} from 'cc';
import { FARM_FRAMES } from './FarmFrames';
import { FarmWorldLayout } from './FarmWorldLayout';
import { InputBridge } from './InputBridge';
import { PlayerController } from './PlayerController';
import { applyUiFont, loadUiFont, styleUiLabel } from './UiFont';

const { ccclass, property } = _decorator;

const TILE = 64;
/**
 * Pullable by hand: soft weeds + flowering bushes (soft understory and solid wild bushes).
 * Pebble / rock litter stay non-pullable; pine / oak still need the axe.
 */
const GRASS_NAME_RE =
    /^decor_soft_(weed|weedBloom|weedTall|weedPink|tuft|fiber|twig)_|^decor_bush_(soft|solid)_/;
/** Chopable wild cover: pine / oak only. */
const TREE_NAME_RE = /^decor_(pine|oak)_solid_/;

export type FarmTool = 'hoe' | 'seeds' | 'can' | 'axe';

type PlotPhase = 'soil' | 'tilled' | 'crop';

interface Plot {
    phase: PlotPhase;
    stage: number;
    watered: boolean;
    grow: number;
    tile: Node | null;
    crop: Node | null;
    untilledSf: SpriteFrame | null;
}

/**
 * Stardew-like farm loop: equip a tool, then use it on the facing / underfoot plot.
 * Hoe → seeds → water. Mature crops / weeds / bushes are free taps; trees need the axe.
 */
@ccclass('FarmSystem')
export class FarmSystem extends Component {
    @property(Node)
    player: Node | null = null;

    @property(Node)
    world: Node | null = null;

    @property
    growSeconds = 2.2;

    seeds = 12;
    crops = 0;
    tool: FarmTool = 'hoe';

    private _plots = new Map<string, Plot>();
    private _tilledSf: SpriteFrame | null = null;
    private _wetSf: SpriteFrame | null = null;
    private _cropSf: SpriteFrame[] = [];
    private _ready = false;
    private _actionHint: Label | null = null;
    private _onToolChange: ((t: FarmTool) => void) | null = null;

    onLoad() {
        if (this.tool !== 'hoe' && this.tool !== 'seeds' && this.tool !== 'can' && this.tool !== 'axe') {
            this.tool = 'hoe';
        }
        this.loadFrames();
        loadUiFont().then((font) => {
            if (!font || !this._actionHint) return;
            applyUiFont(this._actionHint);
        });
    }

    start() {
        if (!this.world) return;
        this.initPlots();
        this.spawnHudLabels();
        this.refreshHud();
    }

    setTool(tool: FarmTool) {
        this.tool = tool;
        this.refreshHud();
        this._onToolChange?.(tool);
    }

    onToolChange(cb: (t: FarmTool) => void) {
        this._onToolChange = cb;
    }

    /** Desktop: use tool / free-act on facing plot, pull grass, or axe-chop trees. */
    tryAct() {
        if (!this._ready || !this.player) return;
        const key = this.facingPlotKey();
        if (key && this.canActOnPlot(this._plots.get(key)!)) {
            this.tryActOnKey(key);
            return;
        }
        const aim = this.facingAimPoint();
        this.tryClearNatureAt(aim.x, aim.y);
    }

    /**
     * Tap a screen point (UI coords, origin bottom-left) → tool on that tile / object.
     * No reach limit, but the tap must land on the plot or sprite.
     */
    tryActAtUi(uiX: number, uiY: number) {
        if (!this._ready || !this.player || !this.world) return;
        const worldPt = this.uiToWorld(uiX, uiY);
        if (!worldPt) return;
        const key = `${Math.round(worldPt.x / TILE)},${Math.round(worldPt.y / TILE)}`;
        const plot = this._plots.get(key);
        if (plot) {
            // Tap landed on a farm plot — only act if the tool matches; don't spill onto decor.
            if (this.canActOnPlot(plot)) this.tryActOnKey(key);
            return;
        }
        this.tryClearNatureAt(worldPt.x, worldPt.y);
    }

    private tryActOnKey(key: string) {
        if (!this._ready || !this.player) return;
        const plot = this._plots.get(key);
        if (!plot) return;

        if (!this.canActOnPlot(plot)) return;

        if (plot.phase === 'crop' && plot.stage >= 2) {
            this.harvest(plot);
        } else if (this.tool === 'hoe' && plot.phase === 'soil') {
            this.till(plot);
        } else if (this.tool === 'seeds' && plot.phase === 'tilled') {
            if (this.seeds <= 0) return;
            this.plant(plot);
            this.seeds -= 1;
        } else if (this.tool === 'can' && plot.phase === 'crop' && !plot.watered && plot.stage < 2) {
            this.water(plot);
        }
        this.refreshHud();
    }

    private uiToWorld(uiX: number, uiY: number): { x: number; y: number } | null {
        if (!this.world) return null;
        // Use canvas content size (portrait visible frame), not design 1080×1920 —
        // FIXED_WIDTH phones grow taller than DESIGN_H and design-center misses tiles.
        const canvasUi = this.node.getComponent(UITransform);
        const vis = view.getVisibleSize();
        const hw = (canvasUi?.contentSize.width || vis.width) * 0.5;
        const hh = (canvasUi?.contentSize.height || vis.height) * 0.5;
        const canvasX = uiX - hw;
        const canvasY = uiY - hh;
        const s = Math.max(0.0001, this.world.scale.x);
        return {
            x: (canvasX - this.world.position.x) / s,
            y: (canvasY - this.world.position.y) / s,
        };
    }

    /** Pull grass / chop tree only when the tap lands inside that sprite's bounds. */
    private tryClearNatureAt(wx: number, wy: number): boolean {
        if (!this.world || !this.player) return false;
        const grass = this.findDecorHit(wx, wy, GRASS_NAME_RE);
        const tree = this.tool === 'axe' ? this.findDecorHit(wx, wy, TREE_NAME_RE) : null;
        let target: Node | null = null;
        let chopTree = false;
        if (grass && tree) {
            if (grass.area <= tree.area) target = grass.node;
            else {
                target = tree.node;
                chopTree = true;
            }
        } else if (grass) {
            target = grass.node;
        } else if (tree) {
            target = tree.node;
            chopTree = true;
        }
        if (!target) return false;
        const wasSolid = chopTree || target.name.includes('_solid_');
        target.destroy();
        if (wasSolid) {
            this.player.getComponent(PlayerController)?.rebuildSolids();
        }
        this.refreshHud();
        return true;
    }

    /** True sprite hit-test (bottom/center anchors). Must click on the object. */
    private findDecorHit(
        wx: number,
        wy: number,
        nameRe: RegExp,
    ): { node: Node; dSq: number; area: number } | null {
        if (!this.world) return null;
        let best: Node | null = null;
        let bestSq = Infinity;
        let bestArea = Infinity;
        const pad = 6;
        for (const child of this.world.children) {
            if (!child.isValid || !nameRe.test(child.name)) continue;
            const ui = child.getComponent(UITransform);
            if (!ui) continue;
            const w = ui.contentSize.width;
            const h = ui.contentSize.height;
            if (w <= 0 || h <= 0) continue;
            const p = child.position;
            const left = p.x - w * ui.anchorX - pad;
            const right = p.x + w * (1 - ui.anchorX) + pad;
            const bottom = p.y - h * ui.anchorY - pad;
            const top = p.y + h * (1 - ui.anchorY) + pad;
            if (wx < left || wx > right || wy < bottom || wy > top) continue;
            const cx = (left + right) * 0.5;
            const cy = (bottom + top) * 0.5;
            const dx = cx - wx;
            const dy = cy - wy;
            const dSq = dx * dx + dy * dy;
            const area = w * h;
            if (area < bestArea - 1 || (Math.abs(area - bestArea) <= 1 && dSq < bestSq)) {
                best = child;
                bestSq = dSq;
                bestArea = area;
            }
        }
        return best ? { node: best, dSq: bestSq, area: bestArea } : null;
    }

    /** Facing / underfoot preview — proximity, not a tap hit. */
    private findDecorNear(
        wx: number,
        wy: number,
        maxDist: number,
        nameRe: RegExp,
        yLift: number,
    ): { node: Node; dSq: number } | null {
        if (!this.world) return null;
        const maxSq = maxDist * maxDist;
        let best: Node | null = null;
        let bestSq = maxSq;
        for (const child of this.world.children) {
            if (!child.isValid || !nameRe.test(child.name)) continue;
            const ui = child.getComponent(UITransform);
            const lift = ui ? Math.min(yLift, ui.contentSize.height * 0.4) : yLift;
            const cx = child.position.x;
            const cy = child.position.y + lift;
            const dx = cx - wx;
            const dy = cy - wy;
            const dSq = dx * dx + dy * dy;
            if (dSq <= bestSq) {
                bestSq = dSq;
                best = child;
            }
        }
        return best ? { node: best, dSq: bestSq } : null;
    }

    private facingAimPoint(): { x: number; y: number } {
        const p = this.player!.position;
        return {
            x: p.x + InputBridge.facingX * TILE * 0.7,
            y: p.y + InputBridge.facingY * TILE * 0.7,
        };
    }

    /** Tool required for this plot, or null when free (harvest) / waiting. */
    neededTool(plot: Plot): FarmTool | null {
        if (plot.phase === 'soil') return 'hoe';
        if (plot.phase === 'tilled') return 'seeds';
        if (plot.phase === 'crop' && plot.stage >= 2) return null;
        if (plot.phase === 'crop' && !plot.watered) return 'can';
        return null;
    }

    private canActOnPlot(plot: Plot): boolean {
        if (plot.phase === 'crop' && plot.stage >= 2) return true;
        const need = this.neededTool(plot);
        if (!need || this.tool !== need) return false;
        if (need === 'seeds' && this.seeds <= 0) return false;
        return true;
    }

    previewAction(): string {
        const key = this.facingPlotKey();
        if (key && this._plots.has(key)) {
            return this.previewForPlot(this._plots.get(key)!);
        }
        if (this.player) {
            const aim = this.facingAimPoint();
            const grass = this.findDecorNear(aim.x, aim.y, TILE * 1.15, GRASS_NAME_RE, TILE * 0.25);
            const tree = this.findDecorNear(aim.x, aim.y, TILE * 1.55, TREE_NAME_RE, TILE * 0.7);
            if (grass && tree) {
                if (grass.dSq <= tree.dSq) {
                    return grass.node.name.includes('bush') ? '点击拔除灌木' : '点击拔除杂草';
                }
                return this.tool === 'axe' ? '点击砍伐树木' : '需切换：斧头';
            }
            if (grass) {
                return grass.node.name.includes('bush') ? '点击拔除灌木' : '点击拔除杂草';
            }
            if (tree) return this.tool === 'axe' ? '点击砍伐树木' : '需切换：斧头';
        }
        return '点击使用工具，或点杂草/灌木拔除';
    }

    private previewForPlot(plot: Plot): string {
        if (plot.phase === 'crop' && plot.stage >= 2) return '点击收获';
        const need = this.neededTool(plot);
        if (need && this.tool !== need) {
            const names: Record<FarmTool, string> = {
                hoe: '锄头',
                seeds: '种子',
                can: '水壶',
                axe: '斧头',
            };
            return `需切换：${names[need]}`;
        }
        if (plot.phase === 'soil') return '点击锄地';
        if (plot.phase === 'tilled') return this.seeds > 0 ? '点击播种' : '缺种子';
        if (plot.phase === 'crop' && !plot.watered) return '点击浇水';
        return '生长中…';
    }

    update(dt: number) {
        if (!this._ready) return;
        for (const plot of this._plots.values()) {
            if (plot.phase !== 'crop' || !plot.watered || plot.stage >= 2) continue;
            plot.grow += dt;
            if (plot.grow < this.growSeconds) continue;
            plot.grow = 0;
            plot.stage += 1;
            this.applyCropVisual(plot);
        }
        if (this._actionHint) {
            this._actionHint.string = this.previewAction();
        }
    }

    private loadFrames() {
        const uuids = [FARM_FRAMES.tilled, FARM_FRAMES.wet, ...FARM_FRAMES.crop];
        let done = 0;
        const total = uuids.length;
        uuids.forEach((uuid, i) => {
            assetManager.loadAny({ uuid }, (err, asset) => {
                done++;
                if (!err && asset) {
                    const sf = asset as SpriteFrame;
                    if (i === 0) this._tilledSf = sf;
                    else if (i === 1) this._wetSf = sf;
                    else this._cropSf[i - 2] = sf;
                }
                if (done >= total) {
                    this._ready = true;
                    for (const plot of this._plots.values()) {
                        this.applyTileVisual(plot);
                        this.applyCropVisual(plot);
                    }
                }
            });
        });
    }

    private initPlots() {
        if (!this.world) return;
        const tiles = new Map<string, Node>();
        for (const child of this.world.children) {
            if (!child.name.startsWith('tile-')) continue;
            const ix = Math.round(child.position.x / TILE);
            const iy = Math.round(child.position.y / TILE);
            tiles.set(`${ix},${iy}`, child);
        }
        for (const key of FarmWorldLayout.farmPlotKeys()) {
            const tile = tiles.get(key) ?? null;
            let untilledSf: SpriteFrame | null = null;
            if (tile) {
                const sp = tile.getComponent(Sprite);
                untilledSf = sp?.spriteFrame ?? null;
            }
            this._plots.set(key, {
                phase: 'soil',
                stage: 0,
                watered: false,
                grow: 0,
                tile,
                crop: null,
                untilledSf,
            });
        }
    }

    private facingPlotKey(): string | null {
        if (!this.player) return null;
        const p = this.player.position;
        const under = `${Math.round(p.x / TILE)},${Math.round(p.y / TILE)}`;
        if (this._plots.has(under)) return under;
        const tx = Math.round(p.x / TILE) + InputBridge.facingX;
        const ty = Math.round(p.y / TILE) + InputBridge.facingY;
        const key = `${tx},${ty}`;
        return this._plots.has(key) ? key : null;
    }

    private till(plot: Plot) {
        plot.phase = 'tilled';
        plot.stage = 0;
        plot.watered = false;
        plot.grow = 0;
        this.applyTileVisual(plot);
        this.clearCrop(plot);
    }

    private plant(plot: Plot) {
        plot.phase = 'crop';
        plot.stage = 0;
        plot.watered = false;
        plot.grow = 0;
        this.applyTileVisual(plot);
        this.applyCropVisual(plot);
    }

    private water(plot: Plot) {
        plot.watered = true;
        plot.grow = 0;
        this.applyTileVisual(plot);
    }

    private harvest(plot: Plot) {
        this.crops += 1;
        this.seeds += 1;
        plot.phase = 'tilled';
        plot.stage = 0;
        plot.watered = false;
        plot.grow = 0;
        this.applyTileVisual(plot);
        this.clearCrop(plot);
    }

    private applyTileVisual(plot: Plot) {
        if (!plot.tile) return;
        const sp = plot.tile.getComponent(Sprite);
        if (!sp) return;
        if (plot.phase === 'soil') {
            if (plot.untilledSf) sp.spriteFrame = plot.untilledSf;
            sp.color = Color.WHITE;
        } else if (plot.watered && this._wetSf) {
            sp.spriteFrame = this._wetSf;
            sp.color = Color.WHITE;
        } else if (this._tilledSf) {
            sp.spriteFrame = this._tilledSf;
            sp.color = Color.WHITE;
        }
    }

    private applyCropVisual(plot: Plot) {
        if (plot.phase !== 'crop') {
            this.clearCrop(plot);
            return;
        }
        if (!this.world || !plot.tile) return;
        if (!plot.crop) {
            const n = new Node('Crop');
            n.layer = this.world.layer;
            n.setParent(this.world);
            const ui = n.addComponent(UITransform);
            ui.setContentSize(48, 64);
            ui.setAnchorPoint(0.5, 0);
            const spNew = n.addComponent(Sprite);
            spNew.sizeMode = Sprite.SizeMode.CUSTOM;
            spNew.type = Sprite.Type.SIMPLE;
            // trim=true: quad matches UITransform (avoids dynamic-atlas / trimmedBorder drift).
            spNew.trim = true;
            plot.crop = n;
        }
        // Tile is center-anchored 64×64; crop frames are bottom-packed (art at foot).
        // Pin X to tile center. Ground the foot on the tile midline so sprouts sit
        // mid-plot — NOT on the south edge (tile.y - 32), which read as "stuck low".
        const t = plot.tile.position;
        const stage = Math.min(2, plot.stage);
        // Opaque heights in crop-parsnip-{0,1,2}.png (bottom-aligned in the 64px frame).
        const artH = stage === 0 ? 14 : stage === 1 ? 38 : 56;
        plot.crop.setPosition(t.x, t.y - artH * 0.5, 0);
        const sp = plot.crop.getComponent(Sprite);
        const sf = this._cropSf[stage];
        if (sp && sf) {
            sp.trim = true;
            sp.spriteFrame = sf;
        }
    }

    private clearCrop(plot: Plot) {
        if (plot.crop?.isValid) plot.crop.destroy();
        plot.crop = null;
    }

    private spawnHudLabels() {
        const canvas = this.node;
        const mk = (name: string, y: number, size: number, color: Color, outlineW?: number) => {
            const n = new Node(name);
            n.layer = canvas.layer;
            n.setParent(canvas);
            n.setPosition(0, y, 0);
            n.addComponent(UITransform).setContentSize(1000, 56);
            const lab = n.addComponent(Label);
            lab.horizontalAlign = Label.HorizontalAlign.CENTER;
            lab.verticalAlign = Label.VerticalAlign.CENTER;
            lab.overflow = Label.Overflow.SHRINK;
            styleUiLabel(lab, {
                size,
                color,
                outline: true,
                outlineWidth: outlineW,
                outlineColor: new Color(20, 28, 22, 235),
            });
            return lab;
        };
        // Bottom action cue — thicker outline so it stays readable on grass/water.
        this._actionHint = mk('FarmActionHint', -700, 34, new Color(255, 252, 235, 255), 5);
    }

    private refreshHud() {
        if (this._actionHint) {
            this._actionHint.string = this.previewAction();
        }
    }
}
