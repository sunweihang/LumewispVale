import {
    _decorator,
    assetManager,
    Color,
    Component,
    Label,
    Node,
    Sprite,
    SpriteFrame,
    UIOpacity,
    UITransform,
    Vec3,
    tween,
    view,
} from 'cc';
import { FARM_FRAMES } from './FarmFrames';
import { FarmWorldLayout } from './FarmWorldLayout';
import { InputBridge } from './InputBridge';
import { ActionAnim, PlayerAnimator } from './PlayerAnimator';
import { footSolidFor } from './GridPath';
import { PlayerController } from './PlayerController';
import { applyUiFont, loadUiFont, styleUiLabel } from './UiFont';

const { ccclass, property } = _decorator;

const TILE = 64;
/** Walk until this close to the tile center before acting. */
const ARRIVE_PLOT = 20;
/** Soft weeds — walk up to the foot. */
const ARRIVE_NATURE_SOFT = 26;
/** After arrive, refuse to act if still farther than this (safety). */
const ACT_MAX_PLOT = 36;
const ACT_MAX_NATURE = 56;
/**
 * Pullable by hand: soft weeds + flowering bushes (soft understory and solid wild bushes).
 * Pebbles / rocks need the hoe; pine / oak still need the axe.
 */
const GRASS_NAME_RE =
    /^decor_soft_(weed|weedBloom|weedTall|weedPink|tuft|fiber|twig)_|^decor_bush_(soft|solid)_/;
/** Chopable wild cover: pine / oak only. */
const TREE_NAME_RE = /^decor_(pine|oak)_solid_/;
/** Diggable ground litter / boulders — hoe only. */
const ROCK_NAME_RE =
    /^decor_soft_rock_|^decor_soft_(?:shore_)?pebble_|^decor_rock(?:Big)?_solid_/;
/** Yard storage chest (prop_shipping sprite — orthographic 3/4 bin). */
const CHEST_NAME_RE = /^prop_shipping/;
/** Axe hits needed before a tree falls. */
const TREE_CHOPS_TO_FELL = 5;

export type FarmTool = 'hand' | 'hoe' | 'seeds' | 'can' | 'axe';
/** Gathered world materials that stack in the backpack. */
export type FarmMaterial = 'wood' | 'grass' | 'dirt' | 'stone';

const ALL_TOOLS: FarmTool[] = ['hand', 'hoe', 'seeds', 'can', 'axe'];
const WRONG_TOOL_TIP = '请选择正确的工具';

type PlotPhase = 'soil' | 'tilled' | 'crop';
type NatureAct = 'pull' | 'chop' | 'dig';

interface Plot {
    phase: PlotPhase;
    stage: number;
    watered: boolean;
    grow: number;
    tile: Node | null;
    crop: Node | null;
    untilledSf: SpriteFrame | null;
}

type PendingKind = 'plot' | 'nature' | 'chest';

interface PendingJob {
    kind: PendingKind;
    anim: ActionAnim;
    targetX: number;
    targetY: number;
    /** Plot map key when kind === 'plot'. */
    plotKey?: string;
    /** Nature node when kind === 'nature'. */
    nature?: Node;
    natureAct?: NatureAct;
    /** Storage chest node when kind === 'chest'. */
    chest?: Node;
}

/**
 * Stardew-like farm loop: equip a tool, then use it on a matching target.
 * Hand → weeds / harvest; hoe → till / dig rock; seeds → plant; can → water; axe → chop.
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
    /** Gathered materials (backpack sync). */
    wood = 0;
    grass = 0;
    dirt = 0;
    stone = 0;
    /** Purse gold (info board). */
    gold = 590;
    tool: FarmTool = 'hand';

    private _plots = new Map<string, Plot>();
    private _tilledSf: SpriteFrame | null = null;
    private _wetSf: SpriteFrame | null = null;
    private _cropSf: SpriteFrame[] = [];
    private _ready = false;
    private _actionHint: Label | null = null;
    private _floatGen = 0;
    private _onToolChange: ((t: FarmTool) => void) | null = null;
    private _onInvChange: (() => void) | null = null;
    private _onGoldChange: ((g: number) => void) | null = null;
    /** World-space pickup → backpack fly FX. */
    private _onLootFly: ((id: FarmMaterial, count: number, wx: number, wy: number) => void) | null =
        null;
    /** Open yard storage chest UI after walk-up. */
    private _onChestOpen: (() => void) | null = null;
    private _pending: PendingJob | null = null;
    private _acting = false;
    /** Bumped on cancel so stale walk/anim callbacks cannot finish a replaced job. */
    private _jobGen = 0;
    /** Multi-hit progress for trees / solid rocks (node uuid → hits). */
    private _natureHits = new Map<string, number>();

    onLoad() {
        if (!ALL_TOOLS.includes(this.tool)) this.tool = 'hand';
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

    /** Seeds / crops / materials changed — backpack UI refreshes counts. */
    onInvChange(cb: () => void) {
        this._onInvChange = cb;
    }

    /** Play “material flies into bag” when loot is granted. */
    onLootFly(cb: (id: FarmMaterial, count: number, wx: number, wy: number) => void) {
        this._onLootFly = cb;
    }

    /** Yard chest opened (walk-up complete). */
    onChestOpen(cb: () => void) {
        this._onChestOpen = cb;
    }

    /** Current stack count for a gathered material. */
    materialCount(id: FarmMaterial): number {
        return this[id];
    }

    onGoldChange(cb: (g: number) => void) {
        this._onGoldChange = cb;
    }

    addGold(n: number) {
        if (!n) return;
        this.gold = Math.max(0, this.gold + n);
        this._onGoldChange?.(this.gold);
    }

    /** Cancel walk-to / in-flight action (manual stick drag). */
    cancelPending() {
        if (!this._pending && !this._acting) return;
        this._jobGen += 1;
        this._pending = null;
        this._acting = false;
        this.unscheduleAllCallbacks();
        const anim = this.player?.getComponent(PlayerAnimator);
        anim?.cancelAction();
        const ctrl = this.player?.getComponent(PlayerController);
        ctrl?.cancelWalk(false);
        ctrl?.setLocked(false);
    }

    /** Desktop: use equipped tool on facing plot / nature target. */
    tryAct() {
        if (!this._ready || !this.player) return;
        const aim = this.facingAimPoint();
        const chest = this.findDecorNear(aim.x, aim.y, TILE * 1.45, CHEST_NAME_RE, TILE * 0.3);
        if (chest) {
            this.queueChestJob(chest.node);
            return;
        }
        const nature = this.resolveNatureNear(aim.x, aim.y);
        if (nature) {
            if (!this.toolMatchesNature(nature.act)) {
                this.floatTip(WRONG_TOOL_TIP);
                return;
            }
            this.queueNatureJob(nature);
            return;
        }
        const key = this.facingPlotKey();
        if (!key) return;
        const plot = this._plots.get(key);
        if (!plot) return;
        this.tryPlotWithTool(key, plot);
    }

    /**
     * Tap a screen point (UI coords, origin bottom-left) → walk over, play action, then apply.
     * Tap must land on the plot or sprite. Nature sprites win over the plot grid underfoot.
     */
    tryActAtUi(uiX: number, uiY: number) {
        if (!this._ready || !this.player || !this.world) return;
        const worldPt = this.uiToWorld(uiX, uiY);
        if (!worldPt) return;
        const chest = this.findDecorHit(worldPt.x, worldPt.y, CHEST_NAME_RE);
        if (chest) {
            this.queueChestJob(chest.node);
            return;
        }
        // Tree / rock / weed first — canopy often overlaps a farm tile.
        const nature = this.resolveNatureHit(worldPt.x, worldPt.y);
        if (nature) {
            if (!this.toolMatchesNature(nature.act)) {
                this.floatTip(WRONG_TOOL_TIP);
                return;
            }
            this.queueNatureJob(nature);
            return;
        }
        const key = `${Math.round(worldPt.x / TILE)},${Math.round(worldPt.y / TILE)}`;
        const plot = this._plots.get(key);
        if (plot) this.tryPlotWithTool(key, plot);
    }

    private tryPlotWithTool(key: string, plot: Plot) {
        const need = this.neededTool(plot);
        if (!need) return; // growing / nothing to do
        if (this.tool !== need) {
            this.floatTip(WRONG_TOOL_TIP);
            return;
        }
        if (need === 'seeds' && this.seeds <= 0) return;
        this.queuePlotJob(key);
    }

    private queueChestJob(node: Node) {
        if (!node?.isValid) return;
        this.beginJob({
            kind: 'chest',
            anim: 'pick',
            targetX: node.position.x,
            targetY: node.position.y,
            chest: node,
        });
    }

    private queuePlotJob(key: string) {
        const plot = this._plots.get(key);
        if (!plot || !this.canActOnPlot(plot)) return;
        const anim = this.animForPlot(plot);
        if (!anim) return;
        const [ix, iy] = key.split(',').map((v) => Number(v));
        const targetX = ix * TILE;
        const targetY = iy * TILE;
        this.beginJob({
            kind: 'plot',
            anim,
            targetX,
            targetY,
            plotKey: key,
        });
    }

    private queueNatureJob(hit: { node: Node; act: NatureAct }) {
        if (!hit.node?.isValid) return;
        const anim: ActionAnim =
            hit.act === 'chop' ? 'chop' : hit.act === 'dig' ? 'hoe' : 'pick';
        // Aim at the object's foot (anchor bottom) — walk up beside it, not its crown.
        this.beginJob({
            kind: 'nature',
            anim,
            targetX: hit.node.position.x,
            targetY: hit.node.position.y,
            nature: hit.node,
            natureAct: hit.act,
        });
    }

    private toolMatchesNature(act: NatureAct): boolean {
        if (act === 'pull') return this.tool === 'hand';
        if (act === 'dig') return this.tool === 'hoe';
        if (act === 'chop') return this.tool === 'axe';
        return false;
    }

    private animForPlot(plot: Plot): ActionAnim | null {
        if (plot.phase === 'crop' && plot.stage >= 2) return 'pick';
        const need = this.neededTool(plot);
        if (need === 'hoe') return 'hoe';
        if (need === 'hand' || need === 'seeds' || need === 'can') return 'pick';
        return null;
    }

    /** Floating cue when equipped tool does not match the tapped target. */
    private floatTip(msg: string) {
        const canvas = this.node;
        if (!canvas?.isValid) return;
        const gen = ++this._floatGen;
        const n = new Node(`FarmFloatTip_${gen}`);
        n.layer = canvas.layer;
        n.setParent(canvas);
        n.setPosition(0, -520, 0);
        n.addComponent(UITransform).setContentSize(720, 56);
        const lab = n.addComponent(Label);
        lab.string = msg;
        lab.horizontalAlign = Label.HorizontalAlign.CENTER;
        lab.verticalAlign = Label.VerticalAlign.CENTER;
        lab.overflow = Label.Overflow.SHRINK;
        styleUiLabel(lab, {
            size: 36,
            color: new Color(255, 236, 196, 255),
            outline: true,
            outlineWidth: 5,
            outlineColor: new Color(40, 24, 16, 235),
        });
        const op = n.addComponent(UIOpacity);
        op.opacity = 255;
        loadUiFont().then((font) => {
            if (font && n.isValid) applyUiFont(lab);
        });
        tween(n)
            .parallel(
                tween().to(0.9, { position: new Vec3(0, -450, 0) }, { easing: 'sineOut' }),
                tween(op).delay(0.35).to(0.55, { opacity: 0 }),
            )
            .call(() => {
                if (n.isValid) n.destroy();
            })
            .start();
    }

    private beginJob(job: PendingJob) {
        // Replace any previous walk job.
        this.cancelPending();
        const gen = (this._jobGen += 1);
        this._pending = job;
        const ctrl = this.player!.getComponent(PlayerController);
        const anim = this.player!.getComponent(PlayerAnimator);
        if (!ctrl) {
            this.runActionPhase(gen);
            return;
        }
        // Already in act range of the foot / tile — swing immediately (no walk).
        const actDist = this.arriveDistFor(job);
        const p = this.player!.position;
        const adx = job.targetX - p.x;
        const ady = job.targetY - p.y;
        const readyDist =
            job.kind === 'chest' ||
            (job.kind === 'nature' &&
                (job.natureAct === 'chop' ||
                    job.natureAct === 'dig' ||
                    job.nature?.name.includes('_solid_')))
                ? ACT_MAX_NATURE
                : actDist;
        if (Math.sqrt(adx * adx + ady * ady) <= readyDist) {
            this.runActionPhase(gen);
            return;
        }

        // Solid trees/rocks/chest: stand on the nearest free side facing the player.
        // Never walk at the trunk center — that wedges into the back/rock pocket.
        let walkX = job.targetX;
        let walkY = job.targetY;
        let walkArrive = actDist;
        let ignoreSolid: Node | null = null;
        let actFocus: { x: number; y: number; dist: number } | null = null;
        const solidTarget =
            (job.kind === 'chest' && job.chest?.isValid ? job.chest : null) ||
            (job.kind === 'nature' &&
            job.nature?.isValid &&
            (job.natureAct === 'chop' || job.natureAct === 'dig' || job.nature.name.includes('_solid_'))
                ? job.nature
                : null);
        if (solidTarget) {
            // Ensure collision list is fresh before picking a stand (world decor can change).
            ctrl.rebuildSolids();
            const stand = ctrl.approachStandFor(solidTarget, p.x, p.y);
            if (stand) {
                walkX = stand.x;
                walkY = stand.y;
                walkArrive = 18;
                ignoreSolid = null;
            } else {
                ignoreSolid = solidTarget;
            }
            // Generous interact radius: pressed against the prop counts as arrived.
            actFocus = { x: job.targetX, y: job.targetY, dist: ACT_MAX_NATURE };
        }

        ctrl.walkTo(
            walkX,
            walkY,
            () => {
                if (this._jobGen !== gen || this._pending !== job) return;
                this.runActionPhase(gen);
            },
            () => {
                if (this._jobGen !== gen || this._pending !== job) return;
                this._pending = null;
                this._acting = false;
            },
            walkArrive,
            ignoreSolid,
            actFocus,
        );
        anim?.faceToward(job.targetX, job.targetY);
    }

    /** How close the player must get to the target before the action plays. */
    private arriveDistFor(job: PendingJob): number {
        if (job.kind === 'chest' && job.chest?.isValid) {
            return this.natureArriveDist(job.chest, true);
        }
        if (job.kind === 'nature' && job.nature?.isValid) {
            return this.natureArriveDist(job.nature, job.natureAct === 'chop' || job.natureAct === 'dig');
        }
        return ARRIVE_PLOT;
    }

    /** Distance to object foot that counts as “beside it”. */
    private natureArriveDist(node: Node, solidish: boolean): number {
        const ui = node.getComponent(UITransform);
        const body = 14;
        if (!ui) return ARRIVE_NATURE_SOFT;
        if (solidish || node.name.includes('_solid_')) {
            // Same trunk / foot box as PlayerController collision.
            const box = footSolidFor(
                node.name,
                ui.contentSize.width,
                ui.contentSize.height,
                node.position.x,
                node.position.y,
            );
            if (!box) return ARRIVE_NATURE_SOFT;
            return Math.max(box.hw, box.hh) + body;
        }
        // Soft weeds: small fixed radius so we actually walk up to them.
        return ARRIVE_NATURE_SOFT;
    }

    private runActionPhase(gen: number) {
        const job = this._pending;
        if (!job || !this.player || this._jobGen !== gen) return;

        // Safety: must be beside the target (or pressed against its solid).
        const p = this.player.position;
        const dx = job.targetX - p.x;
        const dy = job.targetY - p.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const arrive = this.arriveDistFor(job);
        const limit = job.kind === 'plot' ? ACT_MAX_PLOT : Math.max(ACT_MAX_NATURE, arrive * 1.75);
        if (dist > limit) {
            this._pending = null;
            this._acting = false;
            this.player.getComponent(PlayerController)?.setLocked(false);
            return;
        }

        const anim = this.player.getComponent(PlayerAnimator);
        const ctrl = this.player.getComponent(PlayerController);
        anim?.faceToward(job.targetX, job.targetY);
        ctrl?.setLocked(true);
        this._acting = true;
        // Chest: no tool swing — open UI as soon as we arrive.
        if (job.kind === 'chest') {
            this.scheduleOnce(() => this.completeJob(job, gen), 0.05);
            return;
        }
        const play = job.anim;
        if (anim) {
            anim.playAction(play, () => this.completeJob(job, gen));
        } else {
            this.scheduleOnce(() => this.completeJob(job, gen), 0.35);
        }
    }

    private completeJob(job: PendingJob, gen: number) {
        if (this._jobGen !== gen || this._pending !== job) {
            this.player?.getComponent(PlayerController)?.setLocked(false);
            this._acting = false;
            return;
        }

        if (job.kind === 'chest') {
            this._pending = null;
            this._acting = false;
            this.player?.getComponent(PlayerController)?.setLocked(false);
            this._onChestOpen?.();
            return;
        }

        if (job.kind === 'plot' && job.plotKey) {
            this.applyPlotAction(job.plotKey);
        } else if (job.kind === 'nature' && job.nature?.isValid) {
            const act = job.natureAct ?? 'pull';
            const keepHitting = this.applyNatureClear(job.nature, act);
            // Tree / boulder: walk once, then swing until it yields — no pause between hits.
            if (keepHitting && (act === 'chop' || act === 'dig') && job.nature.isValid) {
                this.refreshHud();
                this.runActionPhase(gen);
                return;
            }
        }

        this._pending = null;
        this._acting = false;
        this.player?.getComponent(PlayerController)?.setLocked(false);
        this.refreshHud();
    }

    private applyPlotAction(key: string) {
        const plot = this._plots.get(key);
        if (!plot || !this.canActOnPlot(plot)) return;
        if (this.tool === 'hand' && plot.phase === 'crop' && plot.stage >= 2) {
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
    }

    /** @returns true when more swings are still needed (tree / solid rock). */
    private applyNatureClear(target: Node, act: NatureAct): boolean {
        if (!this.player || !target.isValid) return false;
        const need = this.hitsToClear(target, act);
        if (need > 1) {
            const id = target.uuid;
            const hits = (this._natureHits.get(id) ?? 0) + 1;
            if (hits < need) {
                this._natureHits.set(id, hits);
                return true;
            }
            this._natureHits.delete(id);
        }
        this.grantNatureLoot(target, act);
        const wasSolid = act === 'chop' || target.name.includes('_solid_');
        target.destroy();
        if (wasSolid) {
            this.player.getComponent(PlayerController)?.rebuildSolids();
        }
        return false;
    }

    private hitsToClear(target: Node, act: NatureAct): number {
        if (act === 'chop') return TREE_CHOPS_TO_FELL;
        if (act === 'dig') {
            if (target.name.includes('rockBig')) return 4;
            if (target.name.includes('_solid_')) return 3;
            return 1;
        }
        return 1;
    }

    private grantNatureLoot(target: Node, act: NatureAct) {
        const at = { x: target.position.x, y: target.position.y + 28 };
        if (act === 'chop') {
            this.grant('wood', 3, at);
            return;
        }
        if (act === 'dig') {
            this.grant('stone', target.name.includes('rockBig') ? 3 : 1, at);
            return;
        }
        // Pull weeds / fiber / bushes → grass fiber
        this.grant('grass', 1, at);
    }

    private grant(id: FarmMaterial, n: number, at?: { x: number; y: number }) {
        if (n <= 0) return;
        this[id] += n;
        const p = at ?? (this.player ? { x: this.player.position.x, y: this.player.position.y + 36 } : null);
        if (p) this._onLootFly?.(id, n, p.x, p.y);
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

    /** Tap hit-test by sprite bounds; correct tool is auto-equipped when queued. */
    private resolveNatureHit(wx: number, wy: number): { node: Node; act: NatureAct } | null {
        if (!this.world || !this.player) return null;
        type Cand = { node: Node; area: number; act: NatureAct };
        const cands: Cand[] = [];
        const grass = this.findDecorHit(wx, wy, GRASS_NAME_RE);
        if (grass) cands.push({ node: grass.node, area: grass.area, act: 'pull' });
        const rock = this.findDecorHit(wx, wy, ROCK_NAME_RE);
        if (rock) cands.push({ node: rock.node, area: rock.area, act: 'dig' });
        const tree = this.findDecorHit(wx, wy, TREE_NAME_RE);
        if (tree) cands.push({ node: tree.node, area: tree.area, act: 'chop' });
        if (!cands.length) return null;
        // Prefer tree / rock over understory grass when the tap lands in both AABBs.
        cands.sort((a, b) => {
            const rank = (act: NatureAct) => (act === 'chop' ? 0 : act === 'dig' ? 1 : 2);
            const dr = rank(a.act) - rank(b.act);
            if (dr !== 0) return dr;
            return a.area - b.area;
        });
        const best = cands[0]!;
        return { node: best.node, act: best.act };
    }

    /** Facing / keyboard: proximity pick among grass / rock / tree. */
    private resolveNatureNear(wx: number, wy: number): { node: Node; act: NatureAct } | null {
        if (!this.world || !this.player) return null;
        type Cand = { node: Node; dSq: number; act: NatureAct };
        const cands: Cand[] = [];
        const grass = this.findDecorNear(wx, wy, TILE * 1.15, GRASS_NAME_RE, TILE * 0.25);
        if (grass) cands.push({ node: grass.node, dSq: grass.dSq, act: 'pull' });
        const rock = this.findDecorNear(wx, wy, TILE * 1.2, ROCK_NAME_RE, TILE * 0.3);
        if (rock) cands.push({ node: rock.node, dSq: rock.dSq, act: 'dig' });
        const tree = this.findDecorNear(wx, wy, TILE * 1.55, TREE_NAME_RE, TILE * 0.7);
        if (tree) cands.push({ node: tree.node, dSq: tree.dSq, act: 'chop' });
        if (!cands.length) return null;
        cands.sort((a, b) => a.dSq - b.dSq);
        const best = cands[0]!;
        return { node: best.node, act: best.act };
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

    /** Tool required for this plot, or null when waiting / nothing to do. */
    neededTool(plot: Plot): FarmTool | null {
        if (plot.phase === 'soil') return 'hoe';
        if (plot.phase === 'tilled') return 'seeds';
        if (plot.phase === 'crop' && plot.stage >= 2) return 'hand';
        if (plot.phase === 'crop' && !plot.watered) return 'can';
        return null;
    }

    private canActOnPlot(plot: Plot): boolean {
        const need = this.neededTool(plot);
        if (!need || this.tool !== need) return false;
        if (need === 'seeds' && this.seeds <= 0) return false;
        return true;
    }

    previewAction(): string {
        if (this.player) {
            const aim = this.facingAimPoint();
            const chest = this.findDecorNear(aim.x, aim.y, TILE * 1.45, CHEST_NAME_RE, TILE * 0.3);
            if (chest) return '点击打开储藏箱';
        }
        const key = this.facingPlotKey();
        if (key && this._plots.has(key)) {
            return this.previewForPlot(this._plots.get(key)!);
        }
        if (this.player) {
            const aim = this.facingAimPoint();
            const hit = this.resolveNatureNear(aim.x, aim.y);
            if (hit) {
                const need: FarmTool =
                    hit.act === 'pull' ? 'hand' : hit.act === 'dig' ? 'hoe' : 'axe';
                if (this.tool !== need) return `需选择：${this.toolName(need)}`;
                if (hit.act === 'pull') {
                    return hit.node.name.includes('bush') ? '点击拔除灌木' : '点击拔除杂草';
                }
                if (hit.act === 'dig') {
                    return hit.node.name.includes('pebble') ? '点击挖起石子' : '点击挖开石头';
                }
                return '点击砍伐树木';
            }
        }
        return '选择工具后点击目标';
    }

    private toolName(t: FarmTool): string {
        const names: Record<FarmTool, string> = {
            hand: '手',
            hoe: '锄头',
            seeds: '种子',
            can: '水壶',
            axe: '斧头',
        };
        return names[t];
    }

    private previewForPlot(plot: Plot): string {
        const need = this.neededTool(plot);
        if (!need) return '生长中…';
        if (this.tool !== need) return `需选择：${this.toolName(need)}`;
        if (plot.phase === 'crop' && plot.stage >= 2) return '点击收获';
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
        const t = plot.tile?.position;
        this.grant('dirt', 1, t ? { x: t.x, y: t.y + 20 } : undefined);
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
        this.addGold(35);
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
        this._onInvChange?.();
    }
}
