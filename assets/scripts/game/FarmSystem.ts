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
import { FishingMinigame, FishingResult } from './FishingMinigame';
import { InputBridge } from './InputBridge';
import { ActionAnim, PlayerAnimator } from './PlayerAnimator';
import { footSolidFor } from './GridPath';
import { PlayerController } from './PlayerController';
import { TOOL_FRAMES } from './ToolFrames';
import { applyUiFont, loadUiFont, styleUiLabel } from './UiFont';

const { ccclass, property } = _decorator;

const TILE = 64;
/** Mock rewarded-ad watch duration (seconds) until a real SDK is wired. */
const AD_WATCH_SECONDS = 1.2;
/** World-space ad icon under the countdown (vertical stack inside one 64px tile). */
const AD_BTN_SIZE = 28;
/** Vertical gap between timer and ad icon. */
const GROW_UI_GAP = 2;
/** Timer label box (font size 22 — keep original). */
const GROW_TIMER_W = 56;
const GROW_TIMER_H = 28;
/** Walk until this close to the tile center before acting. */
const ARRIVE_PLOT = 20;
/** Soft weeds — walk up to the foot (must look close). */
const ARRIVE_NATURE_SOFT = 18;
/** After arrive, refuse to act if still farther than this (safety). */
const ACT_MAX_PLOT = 36;
const ACT_MAX_NATURE = 56;
/** Soft pull: never act from farther than this (actFocus must stay ≤ this). */
const ACT_MAX_SOFT_PULL = 28;
/**
 * Pullable by hand: soft weeds + flowering bushes (soft understory and solid wild bushes).
 * Pebbles / rocks need the hoe; pine / oak still need the axe.
 */
const GRASS_NAME_RE =
    /^decor_soft_(?:shore_)?(weed|weedBloom|weedTall|weedPink|tuft|fiber|twig)_|^decor_bush_(soft|solid)_/;
/** Chopable wild cover: pine / oak only. */
const TREE_NAME_RE = /^decor_(pine|oak)_solid_/;
/** Diggable ground litter / boulders — hoe only. */
const ROCK_NAME_RE =
    /^decor_soft_(?:shore_)?(?:rock_|pebble_)|^decor_rock(?:Big)?_solid_/;
/** Yard storage chest (prop_shipping sprite — orthographic 3/4 bin). */
const CHEST_NAME_RE = /^prop_shipping/;
/** Yard crafting workbench. */
const CRAFT_NAME_RE = /^prop_craftbench/;
/** Axe hits needed before a tree falls. */
const TREE_CHOPS_TO_FELL = 5;

export type FarmTool = 'hand' | 'hoe' | 'seeds' | 'can' | 'axe' | 'rod';
/** Gathered world materials that stack in the backpack. */
export type FarmMaterial =
    | 'wood'
    | 'grass'
    | 'dirt'
    | 'stone'
    | 'fish'
    | 'copper'
    | 'iron'
    | 'goldOre';

const ALL_TOOLS: FarmTool[] = ['hand', 'hoe', 'seeds', 'can', 'axe', 'rod'];
const NEED_ROD_TIP = '请装备鱼竿';

type PlotPhase = 'soil' | 'tilled' | 'crop';
type NatureAct = 'pull' | 'chop' | 'dig';

interface Plot {
    phase: PlotPhase;
    stage: number;
    watered: boolean;
    /** Elapsed seconds since watering (0 → growSeconds). */
    grow: number;
    tile: Node | null;
    crop: Node | null;
    /** World-space grow HUD root (timer + ad button). */
    growUi: Node | null;
    /** Countdown label under growUi. */
    timer: Label | null;
    /** Rewarded-ad boost chip under growUi. */
    adBtn: Node | null;
    untilledSf: SpriteFrame | null;
}

type PendingKind = 'plot' | 'nature' | 'chest' | 'craft' | 'fish';

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
    /** Craftbench node when kind === 'craft'. */
    craft?: Node;
    /** Water aim point when kind === 'fish'. */
    fishAimX?: number;
    fishAimY?: number;
}

/**
 * Stardew-like farm loop: equip a tool, then use it on a matching target.
 * Hand → weeds / harvest; hoe → till / dig rock; seeds → plant; can → water; axe → chop;
 * rod → shore / pier fishing minigame.
 */
@ccclass('FarmSystem')
export class FarmSystem extends Component {
    @property(Node)
    player: Node | null = null;

    @property(Node)
    world: Node | null = null;

    /** Total seconds from watering until the crop is mature (stage 2). */
    @property
    growSeconds = 30;

    seeds = 12;
    crops = 0;
    /** Gathered materials (backpack sync). */
    wood = 0;
    grass = 0;
    dirt = 0;
    stone = 0;
    fish = 0;
    /** Town miner shop ores. */
    copper = 0;
    iron = 0;
    goldOre = 0;
    /** Purse gold (info board). */
    gold = 590;
    /** Named seed packs bought in town (planting still spends generic `seeds`). */
    seedPacks: Record<string, number> = {};
    tool: FarmTool = 'hand';

    private _plots = new Map<string, Plot>();
    private _tilledSf: SpriteFrame | null = null;
    private _wetSf: SpriteFrame | null = null;
    private _cropSf: SpriteFrame[] = [];
    private _adSf: SpriteFrame | null = null;
    private _ready = false;
    private _actionHint: Label | null = null;
    /** Cached interactable lists — avoids scanning every tile each preview. */
    private _decorBuckets: {
        grass: Node[];
        rock: Node[];
        tree: Node[];
        chest: Node[];
        craft: Node[];
    } | null = null;
    private _decorChildCount = -1;
    private _hintSig = '';
    private _hintText = '';
    private _floatGen = 0;
    private _onToolChange: ((t: FarmTool) => void) | null = null;
    private _onInvChange: (() => void) | null = null;
    private _onGoldChange: ((g: number) => void) | null = null;
    /** World-space pickup → backpack fly FX. */
    private _onLootFly: ((id: FarmMaterial, count: number, wx: number, wy: number) => void) | null =
        null;
    /** Open yard storage chest UI after walk-up. */
    private _onChestOpen: (() => void) | null = null;
    /** Open yard craftbench UI after walk-up. */
    private _onCraftOpen: (() => void) | null = null;
    private _pending: PendingJob | null = null;
    private _acting = false;
    /** Bumped on cancel so stale walk/anim callbacks cannot finish a replaced job. */
    private _jobGen = 0;
    /** Multi-hit progress for trees / solid rocks (node uuid → hits). */
    private _natureHits = new Map<string, number>();
    /** Pending rewarded-ad boost (survives cancelPending / unscheduleAll). */
    private _adWait: { key: string; left: number } | null = null;

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

    /** Yard craftbench opened (walk-up complete). */
    onCraftOpen(cb: () => void) {
        this._onCraftOpen = cb;
    }

    /** Quest / HUD listeners for farm actions. */
    private _onQuestStat:
        | ((kind: string, param?: string, n?: number) => void)
        | null = null;

    onQuestStat(cb: (kind: string, param?: string, n?: number) => void) {
        this._onQuestStat = cb;
    }

    /** Push inventory change to HUD without a farm action. */
    notifyInventoryChanged() {
        this.refreshHud();
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

    spendGold(n: number): boolean {
        if (n <= 0) return true;
        if (this.gold < n) return false;
        this.gold -= n;
        this._onGoldChange?.(this.gold);
        return true;
    }

    noteSeedPurchase(id: string, count: number) {
        if (count <= 0) return;
        this.seedPacks[id] = (this.seedPacks[id] ?? 0) + count;
    }

    /** Cancel walk-to / in-flight action (manual stick drag). */
    cancelPending() {
        const mini = this.node.getComponent(FishingMinigame);
        if (mini?.isOpen) {
            mini.close(false);
            this._jobGen += 1;
            this._pending = null;
            this._acting = false;
            this.player?.getComponent(PlayerController)?.setLocked(false);
            return;
        }
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
        if (this.node.getComponent(FishingMinigame)?.isOpen) return;
        const aim = this.facingAimPoint();
        const chest = this.findDecorNear(aim.x, aim.y, TILE * 1.45, CHEST_NAME_RE, TILE * 0.3);
        if (chest) {
            this.queueChestJob(chest.node);
            return;
        }
        const craft = this.findDecorNear(aim.x, aim.y, TILE * 1.45, CRAFT_NAME_RE, TILE * 0.3);
        if (craft) {
            this.queueCraftJob(craft.node);
            return;
        }
        const nature = this.resolveNatureNear(aim.x, aim.y);
        if (nature) {
            if (!this.toolMatchesNature(nature.act)) {
                this.floatTip(this.wrongToolTipFor(nature.act));
                return;
            }
            this.queueNatureJob(nature);
            return;
        }
        const fish = FarmWorldLayout.findFishingStand(aim.x, aim.y);
        if (fish) {
            this.tryFishAt(fish);
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
        if (this.node.getComponent(FishingMinigame)?.isOpen) return;
        const worldPt = this.uiToWorld(uiX, uiY);
        if (!worldPt) return;
        // Grow-boost ad chip wins over plot / nature under the same tap.
        const adKey = this.hitGrowAdKey(worldPt.x, worldPt.y);
        if (adKey) {
            this.requestGrowBoost(adKey);
            return;
        }
        const chest = this.findDecorHit(worldPt.x, worldPt.y, CHEST_NAME_RE);
        if (chest) {
            this.queueChestJob(chest.node);
            return;
        }
        const craft = this.findDecorHit(worldPt.x, worldPt.y, CRAFT_NAME_RE);
        if (craft) {
            this.queueCraftJob(craft.node);
            return;
        }
        // Tree / rock / weed first — canopy often overlaps a farm tile.
        const nature = this.resolveNatureHit(worldPt.x, worldPt.y);
        if (nature) {
            if (!this.toolMatchesNature(nature.act)) {
                this.floatTip(this.wrongToolTipFor(nature.act));
                return;
            }
            this.queueNatureJob(nature);
            return;
        }
        const fish = FarmWorldLayout.findFishingStand(worldPt.x, worldPt.y);
        if (fish) {
            this.tryFishAt(fish);
            return;
        }
        const key = `${Math.round(worldPt.x / TILE)},${Math.round(worldPt.y / TILE)}`;
        const plot = this._plots.get(key);
        if (plot) this.tryPlotWithTool(key, plot);
    }

    private tryFishAt(spot: {
        standX: number;
        standY: number;
        waterX: number;
        waterY: number;
    }) {
        if (this.tool !== 'rod') {
            this.floatTip(NEED_ROD_TIP);
            return;
        }
        this.beginJob({
            kind: 'fish',
            anim: 'pick',
            targetX: spot.standX,
            targetY: spot.standY,
            fishAimX: spot.waterX,
            fishAimY: spot.waterY,
        });
    }

    private tryPlotWithTool(key: string, plot: Plot) {
        const need = this.neededTool(plot);
        if (!need) return; // growing / nothing to do
        if (this.tool !== need) {
            this.floatTip(`需选择：${this.toolName(need)}`);
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

    private queueCraftJob(node: Node) {
        if (!node?.isValid) return;
        this.beginJob({
            kind: 'craft',
            anim: 'pick',
            targetX: node.position.x,
            targetY: node.position.y,
            craft: node,
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

    private toolForNature(act: NatureAct): FarmTool {
        if (act === 'pull') return 'hand';
        if (act === 'dig') return 'hoe';
        return 'axe';
    }

    private wrongToolTipFor(act: NatureAct): string {
        return `需选择：${this.toolName(this.toolForNature(act))}`;
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
        const softNature =
            job.kind === 'nature' &&
            job.nature?.isValid &&
            job.natureAct === 'pull' &&
            !job.nature.name.includes('_solid_');
        const readyDist =
            job.kind === 'chest' ||
            job.kind === 'craft' ||
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
            (job.kind === 'craft' && job.craft?.isValid ? job.craft : null) ||
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
        } else if (softNature) {
            // Weed/bush feet often sit inside a pine trunk AABB (weeds don't collide,
            // the tree does). Walk to the nearest free cell beside the foot.
            // No large actFocus — that used to finish the walk ~1 tile away.
            ctrl.rebuildSolids();
            const stand = ctrl.freeStandNear(job.targetX, job.targetY, p.x, p.y, 28);
            walkX = stand.x;
            walkY = stand.y;
            walkArrive = 10;
        }

        const softActMax = softNature ? ACT_MAX_SOFT_PULL : ACT_MAX_NATURE;
        ctrl.walkTo(
            walkX,
            walkY,
            () => {
                if (this._jobGen !== gen || this._pending !== job) return;
                this.runActionPhase(gen);
            },
            () => {
                if (this._jobGen !== gen || this._pending !== job) return;
                // Path aborted — still act only if we ended right beside the target.
                if (job.kind === 'nature' && this.player?.isValid) {
                    const pp = this.player.position;
                    const ddx = job.targetX - pp.x;
                    const ddy = job.targetY - pp.y;
                    if (Math.sqrt(ddx * ddx + ddy * ddy) <= softActMax) {
                        this.runActionPhase(gen);
                        return;
                    }
                }
                this._pending = null;
                this._acting = false;
            },
            walkArrive,
            ignoreSolid,
            actFocus,
        );
        const faceX = job.kind === 'fish' ? (job.fishAimX ?? job.targetX) : job.targetX;
        const faceY = job.kind === 'fish' ? (job.fishAimY ?? job.targetY) : job.targetY;
        anim?.faceToward(faceX, faceY);
    }

    /** How close the player must get to the target before the action plays. */
    private arriveDistFor(job: PendingJob): number {
        if (job.kind === 'chest' && job.chest?.isValid) {
            return this.natureArriveDist(job.chest, true);
        }
        if (job.kind === 'craft' && job.craft?.isValid) {
            return this.natureArriveDist(job.craft, true);
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
        const softPull =
            job.kind === 'nature' &&
            job.natureAct === 'pull' &&
            !!job.nature?.isValid &&
            !job.nature.name.includes('_solid_');
        const limit =
            job.kind === 'plot' || job.kind === 'fish'
                ? ACT_MAX_PLOT
                : softPull
                  ? ACT_MAX_SOFT_PULL
                  : Math.max(ACT_MAX_NATURE, arrive * 1.75);
        if (dist > limit) {
            this._pending = null;
            this._acting = false;
            this.player.getComponent(PlayerController)?.setLocked(false);
            return;
        }

        const anim = this.player.getComponent(PlayerAnimator);
        const ctrl = this.player.getComponent(PlayerController);
        const faceX = job.kind === 'fish' ? (job.fishAimX ?? job.targetX) : job.targetX;
        const faceY = job.kind === 'fish' ? (job.fishAimY ?? job.targetY) : job.targetY;
        anim?.faceToward(faceX, faceY);
        ctrl?.setLocked(true);
        this._acting = true;
        // Chest / craftbench: no tool swing — open UI as soon as we arrive.
        if (job.kind === 'chest' || job.kind === 'craft') {
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

        if (job.kind === 'craft') {
            this._pending = null;
            this._acting = false;
            this.player?.getComponent(PlayerController)?.setLocked(false);
            this._onCraftOpen?.();
            return;
        }

        if (job.kind === 'fish') {
            this._pending = null;
            this.beginFishingMinigame(job);
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

    private beginFishingMinigame(job: PendingJob) {
        let mini = this.node.getComponent(FishingMinigame);
        if (!mini) mini = this.node.addComponent(FishingMinigame);
        const aimX = job.fishAimX ?? job.targetX;
        const aimY = job.fishAimY ?? job.targetY;
        // Pond fish: need to track the bar — AFK should fail.
        const difficulty = 0.32 + Math.random() * 0.28;
        mini.open(difficulty, (result: FishingResult) => {
            this._acting = false;
            this.player?.getComponent(PlayerController)?.setLocked(false);
            if (result === 'perfect' || result === 'catch') {
                // One fish per cast; perfect only changes the tip (no double loot).
                this.grant('fish', 1, { x: aimX, y: aimY + 20 });
                this._onQuestStat?.('fish', undefined, 1);
                this.floatTip(result === 'perfect' ? '完美!' : '钓到了鱼!');
            } else {
                this.floatTip('鱼跑掉了…');
            }
            this.refreshHud();
        });
    }

    private applyPlotAction(key: string) {
        const plot = this._plots.get(key);
        if (!plot || !this.canActOnPlot(plot)) return;
        if (this.tool === 'hand' && plot.phase === 'crop' && plot.stage >= 2) {
            this.harvest(plot);
            this._onQuestStat?.('harvest', undefined, 1);
        } else if (this.tool === 'hoe' && plot.phase === 'soil') {
            this.till(plot);
            this._onQuestStat?.('till', undefined, 1);
        } else if (this.tool === 'seeds' && plot.phase === 'tilled') {
            if (this.seeds <= 0) return;
            this.plant(plot);
            this.seeds -= 1;
            this._onQuestStat?.('plant', undefined, 1);
        } else if (this.tool === 'can' && plot.phase === 'crop' && !plot.watered && plot.stage < 2) {
            this.water(plot);
            this._onQuestStat?.('water', undefined, 1);
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
        this._onQuestStat?.('gather', id, n);
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

    /** Tap hit-test by sprite bounds. */
    private resolveNatureHit(wx: number, wy: number): { node: Node; act: NatureAct } | null {
        if (!this.world || !this.player) return null;
        const grass = this.findDecorHit(wx, wy, GRASS_NAME_RE);
        const rock = this.findDecorHit(wx, wy, ROCK_NAME_RE);
        const tree = this.findDecorHit(wx, wy, TREE_NAME_RE);
        if (!grass && !rock && !tree) return null;

        // Tree vs understory: neighbor bushes often sit inside a pine/oak AABB.
        // Mid/upper canopy taps must chop; foot-zone keeps pull/dig (or axe bias).
        if (tree && (grass || rock)) {
            const rel = this.decorRelY(tree.node, wy);
            if (rel >= 0.3) {
                return { node: tree.node, act: 'chop' };
            }
            if (this.tool === 'axe') return { node: tree.node, act: 'chop' };
            if (rock && this.tool === 'hoe') return { node: rock.node, act: 'dig' };
            if (grass && this.tool === 'hand') return { node: grass.node, act: 'pull' };
            if (grass && rock) {
                return grass.area <= rock.area
                    ? { node: grass.node, act: 'pull' }
                    : { node: rock.node, act: 'dig' };
            }
            if (grass) return { node: grass.node, act: 'pull' };
            if (rock) return { node: rock.node, act: 'dig' };
            return { node: tree.node, act: 'chop' };
        }

        type Cand = { node: Node; area: number; act: NatureAct };
        const cands: Cand[] = [];
        if (grass) cands.push({ node: grass.node, area: grass.area, act: 'pull' });
        if (rock) cands.push({ node: rock.node, area: rock.area, act: 'dig' });
        if (tree) cands.push({ node: tree.node, area: tree.area, act: 'chop' });
        cands.sort((a, b) => a.area - b.area);
        const best = cands[0]!;
        return { node: best.node, act: best.act };
    }

    /** 0 at sprite foot → 1 at crown (bottom-anchored decor). */
    private decorRelY(node: Node, wy: number): number {
        const ui = node.getComponent(UITransform);
        if (!ui) return 0.5;
        const h = ui.contentSize.height;
        if (h <= 0) return 0.5;
        const bottom = node.position.y - h * ui.anchorY;
        return Math.max(0, Math.min(1, (wy - bottom) / h));
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

    private ensureDecorBuckets() {
        if (!this.world) return;
        const count = this.world.children.length;
        if (this._decorBuckets && count === this._decorChildCount) return;
        const grass: Node[] = [];
        const rock: Node[] = [];
        const tree: Node[] = [];
        const chest: Node[] = [];
        const craft: Node[] = [];
        const children = this.world.children;
        for (let i = 0; i < children.length; i++) {
            const child = children[i]!;
            if (!child.isValid) continue;
            const name = child.name;
            if (GRASS_NAME_RE.test(name)) grass.push(child);
            else if (ROCK_NAME_RE.test(name)) rock.push(child);
            else if (TREE_NAME_RE.test(name)) tree.push(child);
            else if (CHEST_NAME_RE.test(name)) chest.push(child);
            else if (CRAFT_NAME_RE.test(name)) craft.push(child);
        }
        this._decorBuckets = { grass, rock, tree, chest, craft };
        this._decorChildCount = count;
        this._hintSig = '';
    }

    private decorListFor(nameRe: RegExp): Node[] {
        this.ensureDecorBuckets();
        const b = this._decorBuckets;
        if (!b) return [];
        if (nameRe === GRASS_NAME_RE) return b.grass;
        if (nameRe === ROCK_NAME_RE) return b.rock;
        if (nameRe === TREE_NAME_RE) return b.tree;
        if (nameRe === CHEST_NAME_RE) return b.chest;
        if (nameRe === CRAFT_NAME_RE) return b.craft;
        return [];
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
        const taperTree = nameRe === TREE_NAME_RE;
        const list = this.decorListFor(nameRe);
        for (let i = 0; i < list.length; i++) {
            const child = list[i]!;
            if (!child.isValid) continue;
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
            // Pine/oak art is mostly empty at the sides — use a trunk→canopy taper so
            // neighboring weeds/bushes don't sit inside a huge rectangular hit box.
            if (taperTree) {
                const boxH = Math.max(1, top - bottom);
                const relY = (wy - bottom) / boxH;
                const halfW = (right - left) * 0.5;
                const halfAllow = relY < 0.28 ? halfW * 0.4 : halfW * 0.78;
                if (Math.abs(wx - p.x) > halfAllow) continue;
            }
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
        const list = this.decorListFor(nameRe);
        for (let i = 0; i < list.length; i++) {
            const child = list[i]!;
            if (!child.isValid) continue;
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
            const craft = this.findDecorNear(aim.x, aim.y, TILE * 1.45, CRAFT_NAME_RE, TILE * 0.3);
            if (craft) return '点击打开制作台';
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
            const fish = FarmWorldLayout.findFishingStand(aim.x, aim.y);
            if (fish) {
                if (this.tool !== 'rod') return `需选择：${this.toolName('rod')}`;
                return '点击钓鱼';
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
            rod: '鱼竿',
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
        if (this._adWait) {
            this._adWait.left -= dt;
            if (this._adWait.left <= 0) {
                const key = this._adWait.key;
                this._adWait = null;
                this.finishGrowBoost(key);
            }
        }
        const total = Math.max(0.1, this.growSeconds);
        const mid = total * 0.5;
        for (const plot of this._plots.values()) {
            if (plot.phase !== 'crop' || !plot.watered || plot.stage >= 2) {
                this.syncGrowTimer(plot);
                continue;
            }
            plot.grow = Math.min(total, plot.grow + dt);
            let stage = 0;
            if (plot.grow >= total) stage = 2;
            else if (plot.grow >= mid) stage = 1;
            if (stage !== plot.stage) {
                plot.stage = stage;
                this.applyCropVisual(plot);
            }
            this.syncGrowTimer(plot);
        }
        this.refreshActionHint();
    }

    /** Recompute bottom cue only when aim / tool / facing plot state changes. */
    private refreshActionHint() {
        if (!this._actionHint || !this.player) return;
        const p = this.player.position;
        const plotKey = this.facingPlotKey();
        let plotSig = '';
        if (plotKey) {
            const plot = this._plots.get(plotKey);
            if (plot) {
                plotSig = `${plot.phase},${plot.stage},${plot.watered ? 1 : 0},${plot.grow | 0}`;
            }
        }
        const sig = `${p.x | 0},${p.y | 0},${InputBridge.facingX},${InputBridge.facingY},${this.tool},${this.seeds},${this._decorChildCount}|${plotSig}`;
        if (sig === this._hintSig) return;
        this._hintSig = sig;
        const text = this.previewAction();
        if (text === this._hintText) return;
        this._hintText = text;
        this._actionHint.string = text;
    }

    private loadFrames() {
        const uuids = [
            FARM_FRAMES.tilled,
            FARM_FRAMES.wet,
            ...FARM_FRAMES.crop,
            TOOL_FRAMES.adVideo,
        ];
        let done = 0;
        const total = uuids.length;
        const cropEnd = 2 + FARM_FRAMES.crop.length;
        uuids.forEach((uuid, i) => {
            assetManager.loadAny({ uuid }, (err, asset) => {
                done++;
                if (!err && asset) {
                    const sf = asset as SpriteFrame;
                    if (i === 0) this._tilledSf = sf;
                    else if (i === 1) this._wetSf = sf;
                    else if (i < cropEnd) this._cropSf[i - 2] = sf;
                    else this._adSf = sf;
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
                growUi: null,
                timer: null,
                adBtn: null,
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
        this.syncGrowTimer(plot);
    }

    private water(plot: Plot) {
        plot.watered = true;
        plot.grow = 0;
        this.applyTileVisual(plot);
        this.syncGrowTimer(plot);
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
        this.clearGrowTimer(plot);
    }

    /** Show / refresh / hide the per-plot growth countdown + ad boost chip. */
    private syncGrowTimer(plot: Plot) {
        const growing = plot.phase === 'crop' && plot.watered && plot.stage < 2;
        if (!growing) {
            this.clearGrowTimer(plot);
            return;
        }
        if (!this.world || !plot.tile) return;
        const total = Math.max(0.1, this.growSeconds);
        const remain = Math.max(0, Math.ceil(total - plot.grow));
        const text = `${remain}秒`;
        if (!plot.growUi?.isValid) {
            this.spawnGrowUi(plot);
        }
        const t = plot.tile.position;
        // Anchor stack in the upper half of the 64px plot cell.
        plot.growUi!.setPosition(t.x, t.y + 10, 0);
        if (plot.timer && plot.timer.string !== text) plot.timer.string = text;
        if (plot.adBtn?.isValid) {
            const sp = plot.adBtn.getComponent(Sprite);
            if (sp && this._adSf && sp.spriteFrame !== this._adSf) sp.spriteFrame = this._adSf;
            const op = plot.adBtn.getComponent(UIOpacity) ?? plot.adBtn.addComponent(UIOpacity);
            op.opacity = this._adWait ? 120 : 255;
        }
    }

    private spawnGrowUi(plot: Plot) {
        if (!this.world) return;
        const root = new Node('CropGrowUi');
        root.layer = this.world.layer;
        root.setParent(this.world);
        // Vertical stack inside one tile: timer on top, ad icon below.
        const totalH = GROW_TIMER_H + GROW_UI_GAP + AD_BTN_SIZE;
        root.addComponent(UITransform).setContentSize(Math.max(GROW_TIMER_W, AD_BTN_SIZE), totalH);

        const timerN = new Node('Timer');
        timerN.layer = this.world.layer;
        timerN.setParent(root);
        timerN.setPosition(0, totalH * 0.5 - GROW_TIMER_H * 0.5, 0);
        timerN.addComponent(UITransform).setContentSize(GROW_TIMER_W, GROW_TIMER_H);
        const lab = timerN.addComponent(Label);
        lab.horizontalAlign = Label.HorizontalAlign.CENTER;
        lab.verticalAlign = Label.VerticalAlign.CENTER;
        lab.overflow = Label.Overflow.SHRINK;
        styleUiLabel(lab, {
            size: 22,
            color: new Color(255, 248, 220, 255),
            outline: true,
            outlineWidth: 3,
            outlineColor: new Color(36, 14, 8, 230),
        });

        const btn = new Node('CropAdBtn');
        btn.layer = this.world.layer;
        btn.setParent(root);
        btn.setPosition(0, -totalH * 0.5 + AD_BTN_SIZE * 0.5, 0);
        btn.addComponent(UITransform).setContentSize(AD_BTN_SIZE, AD_BTN_SIZE);
        const sp = btn.addComponent(Sprite);
        sp.sizeMode = Sprite.SizeMode.CUSTOM;
        sp.type = Sprite.Type.SIMPLE;
        sp.trim = true;
        if (this._adSf) sp.spriteFrame = this._adSf;
        loadUiFont().then((font) => {
            if (font && lab.isValid) applyUiFont(lab);
        });

        plot.growUi = root;
        plot.timer = lab;
        plot.adBtn = btn;
    }

    private clearGrowTimer(plot: Plot) {
        if (plot.growUi?.isValid) plot.growUi.destroy();
        plot.growUi = null;
        plot.timer = null;
        plot.adBtn = null;
    }

    /** World-local hit-test for a crop ad chip; returns plot key when hit. */
    private hitGrowAdKey(wx: number, wy: number): string | null {
        const pad = 8;
        let bestKey: string | null = null;
        let bestSq = Infinity;
        for (const [key, plot] of this._plots) {
            if (!plot.adBtn?.isValid || !plot.growUi?.isValid) continue;
            if (plot.phase !== 'crop' || !plot.watered || plot.stage >= 2) continue;
            const ui = plot.adBtn.getComponent(UITransform);
            if (!ui) continue;
            // Children of `world` use the same local space as uiToWorld().
            const lx = plot.growUi.position.x + plot.adBtn.position.x;
            const ly = plot.growUi.position.y + plot.adBtn.position.y;
            const hw = ui.contentSize.width * 0.5 + pad;
            const hh = ui.contentSize.height * 0.5 + pad;
            if (wx < lx - hw || wx > lx + hw || wy < ly - hh || wy > ly + hh) continue;
            const dx = lx - wx;
            const dy = ly - wy;
            const dSq = dx * dx + dy * dy;
            if (dSq < bestSq) {
                bestSq = dSq;
                bestKey = key;
            }
        }
        return bestKey;
    }

    /** Start mock rewarded ad → mature the crop on success. */
    private requestGrowBoost(key: string) {
        if (this._adWait) {
            this.floatTip('广告播放中…');
            return;
        }
        const plot = this._plots.get(key);
        if (!plot || plot.phase !== 'crop' || !plot.watered || plot.stage >= 2) return;
        this._adWait = { key, left: AD_WATCH_SECONDS };
        this.floatTip('观看广告中…');
        // Refresh chip opacity while waiting.
        this.syncGrowTimer(plot);
    }

    private finishGrowBoost(key: string) {
        const plot = this._plots.get(key);
        if (!plot || plot.phase !== 'crop' || !plot.watered || plot.stage >= 2) {
            this.floatTip('加速已取消');
            return;
        }
        plot.grow = Math.max(0.1, this.growSeconds);
        plot.stage = 2;
        this.applyCropVisual(plot);
        this.syncGrowTimer(plot);
        this.floatTip('加速完成！');
        this.refreshHud();
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
        this._hintSig = '';
        this.refreshActionHint();
        this._onInvChange?.();
    }
}
