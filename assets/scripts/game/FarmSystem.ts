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
    Tween,
    tween,
    view,
} from 'cc';
import { GotoAction } from '../cfg/schema';
import { FARM_FRAMES } from './FarmFrames';
import { FarmWorldLayout } from './FarmWorldLayout';
import { FishingMinigame, FishingResult } from './FishingMinigame';
import { GameState } from './GameState';
import { InputBridge } from './InputBridge';
import { ActionAnim, PlayerAnimator } from './PlayerAnimator';
import { footSolidFor } from './GridPath';
import { ClickMoveMarker } from './ClickMoveMarker';
import { PlayerController } from './PlayerController';
import { itemName, resolveItemId } from './ItemCatalog';
import { TOOL_FRAMES } from './ToolFrames';
import { playFarmGather, playFarmTool } from './UiAudio';
import { applyUiFont, loadUiFont, styleUiLabel } from './UiFont';

const { ccclass, property } = _decorator;

const TILE = 64;
/** Mock rewarded-ad watch duration (seconds) until a real SDK is wired. */
const AD_WATCH_SECONDS = 1.2;
/** World-space ad icon under the countdown (vertical stack inside one 64px tile). */
const AD_BTN_SIZE = 40;
/** Vertical gap between timer and ad icon. */
const GROW_UI_GAP = 2;
/** Timer label box (font size 22 — keep original). */
const GROW_TIMER_W = 56;
const GROW_TIMER_H = 28;
/** Walk until this close to the tile center before acting. */
const ARRIVE_PLOT = 20;
/** Soft weeds — walk up to the foot (must look close). */
const ARRIVE_NATURE_SOFT = 18;
/**
 * Early-arrive / actFocus for plots & fish stands — must look next to the tile
 * before hoe / plant crouch. Keep well under one TILE (64) so we don't swing
 * from the neighboring cell mid-walk.
 */
const ACT_FOCUS_PLOT = 24;
/**
 * After arrive, refuse to act if still farther than this (safety).
 * Adjacent-tile stands (~64) must still count — too-tight 36 made boost/water
 * walk→stop→need a second tap. Do NOT reuse this for actFocus / readyDist.
 */
const ACT_MAX_PLOT = 56;
const ACT_MAX_NATURE = 56;
/** Soft pull: never act from farther than this (actFocus must stay ≤ this). */
const ACT_MAX_SOFT_PULL = 40;
/**
 * Pullable by hand: soft weeds + flowering bushes (soft understory and solid wild bushes).
 * Pebbles / rocks need the hoe; pine / oak still need the axe.
 */
const GRASS_NAME_RE =
    /^decor_soft_(?:shore_)?(weed|weedBloom|weedTall|weedPink|weedYellow|weedBlue|tuft|fiber|twig)_|^decor_bush_(soft|solid)_|^decor_garden_/;
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

export type FarmTool = 'hand' | 'hoe' | 'seeds' | 'can' | 'axe' | 'rod' | 'boost';
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

const ALL_TOOLS: FarmTool[] = ['hand', 'hoe', 'seeds', 'can', 'axe', 'rod', 'boost'];
const NEED_ROD_TIP = '请装备鱼竿';

/** World interaction kinds gated by the live mainline goto. */
type TutorialActKind = 'plot' | 'nature' | 'fish' | 'chest' | 'craft' | 'grow';

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
 * rod → tap lake water to start fishing minigame.
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

    seeds = 0;
    crops = 0;
    /** Consumable crop accelerator (hotbar item). */
    boosts = 0;
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
    /** Hoe arrives on quest 1002; can / axe / rod come from craft. Survives travel via GameState. */
    ownedTools = { hoe: false, can: false, axe: false, rod: false };
    /**
     * Optional quest / tutorial override for the bottom action cue.
     * When it returns a non-empty string, local aim preview is suppressed.
     */
    guideHintProvider: (() => string | null) | null = null;

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
    /**
     * Gather-quest clearance: hide rival nature stacked on the current target
     * type so guide taps can't land on the wrong resource.
     */
    private _gatherClearAct: NatureAct | null = null;
    private _gatherHidden: Node[] = [];
    /** World child count when clearance was last applied — gather/despawn triggers resync. */
    private _gatherClearChildCount = -1;

    onLoad() {
        if (!ALL_TOOLS.includes(this.tool)) this.tool = 'hand';
        this.loadFrames();
    }

    start() {
        if (!this.world) return;
        // Plots only exist on the farm — town / mine / mayor house share tile
        // indices with TILLABLE and must not steal empty-ground click-to-move.
        if (FarmWorldLayout.isBaked(this.world)) this.initPlots();
        this.spawnHudLabels();
        this.refreshHud();
    }

    /** True while walking to / performing a farm job (incl. cast walk-up). */
    get isBusy() {
        return this._acting || !!this._pending;
    }

    setTool(tool: FarmTool) {
        this.tool = tool;
        // Do NOT call refreshHud() here — that re-syncs bag counts and pruneHotbar
        // can wipe a just-bound consumable (boost) and bounce the tool back to hand.
        this._hintSig = '';
        this.refreshActionHint();
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

    /**
     * GM: grant materials / consumables / tools / gold.
     * Returns a short label for toast, or null if `id` is unknown.
     */
    gmGrant(id: string, amount = 1): string | null {
        const n = Math.max(0, amount | 0);
        if (n <= 0) return null;
        const key = resolveItemId(id);
        const label = itemName(key, key);
        const mats: FarmMaterial[] = [
            'wood',
            'grass',
            'dirt',
            'stone',
            'fish',
            'copper',
            'iron',
            'goldOre',
        ];
        if ((mats as string[]).includes(key)) {
            this[key as FarmMaterial] += n;
            this.notifyInventoryChanged();
            return `${label}+${n}`;
        }
        if (key === 'seeds') {
            this.seeds += n;
            this.notifyInventoryChanged();
            return `${label}+${n}`;
        }
        if (key === 'parsnip') {
            this.crops += n;
            this.notifyInventoryChanged();
            return `${label}+${n}`;
        }
        if (key === 'boost') {
            this.boosts += n;
            this.notifyInventoryChanged();
            return `${label}+${n}`;
        }
        if (key === 'gold') {
            this.addGold(n);
            return `${label}+${n}`;
        }
        if (key === 'hoe' || key === 'can' || key === 'axe' || key === 'rod') {
            this.ownedTools[key] = true;
            this.notifyInventoryChanged();
            return `获得${label}`;
        }
        return null;
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
        // Active fishing owns the pointer (hold = lift bar). Stick drag must not
        // tear the minigame down and unlock the farmer mid-cast.
        if (this.node.getComponent(FishingMinigame)?.isOpen) return;
        if (!this._pending && !this._acting) return;
        this._jobGen += 1;
        this._pending = null;
        this._acting = false;
        this.unschedule(this.forceUnlockJob);
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
            if (this.rejectTutorialAct('chest')) return;
            this.queueChestJob(chest.node);
            return;
        }
        const craft = this.findDecorNear(aim.x, aim.y, TILE * 1.45, CRAFT_NAME_RE, TILE * 0.3);
        if (craft) {
            if (this.rejectTutorialAct('craft')) return;
            this.queueCraftJob(craft.node);
            return;
        }
        const nature = this.resolveNatureNear(aim.x, aim.y);
        if (nature) {
            if (this.rejectTutorialAct('nature')) return;
            if (!this.toolMatchesNature(nature.act)) {
                this.floatTip(this.wrongToolTipFor(nature.act));
                return;
            }
            this.queueNatureJob(nature);
            return;
        }
        const fish = FarmWorldLayout.findFishingStand(aim.x, aim.y);
        if (fish) {
            if (this.rejectTutorialAct('fish')) return;
            this.tryFishAt(fish);
            return;
        }
        const key = this.facingPlotKey();
        if (!key) return;
        const plot = this._plots.get(key);
        if (!plot) return;
        if (this.rejectTutorialAct('plot')) return;
        this.tryPlotWithTool(key, plot);
    }

    /**
     * Tap a screen point (UI coords, origin bottom-left) → walk over, play action, then apply.
     * Resolve by what the world point actually hits: decor sprite AABB, then fish stand,
     * then the plot tile under the point. No type-vs-type priority stacking.
     * @returns true when the tap was consumed (job / tip / modal); false = empty ground.
     */
    tryActAtUi(uiX: number, uiY: number): boolean {
        // false = empty ground → click-to-move; true = farm job / tip ate the tap.
        if (!this.player || !this.world) return false;
        if (!this._ready) return false;
        if (this.node.getComponent(FishingMinigame)?.isOpen) return true;
        // Idle quest chevron sits above the tile — remap arrow taps to the aim feet.
        const guide = this.node.getComponent('TutorialGuide') as {
            snapIdleActAim?: (x: number, y: number) => { x: number; y: number } | null;
        } | null;
        const guided = guide?.snapIdleActAim?.(uiX, uiY) ?? null;
        const worldPt = guided ?? this.uiToWorld(uiX, uiY);
        if (!worldPt) return false;
        if (guided) {
            console.log(
                `[FarmTap] guide-snap ui=(${uiX.toFixed(0)},${uiY.toFixed(0)}) ` +
                    `→ world=(${worldPt.x.toFixed(1)},${worldPt.y.toFixed(1)})`,
            );
        }
        // Grow-boost ad chip is its own UI hit box under the tap.
        const adKey = this.hitGrowAdKey(worldPt.x, worldPt.y);
        if (adKey) {
            if (this.rejectTutorialAct('grow')) return true;
            this.requestGrowBoost(adKey);
            return true;
        }
        const chest = this.findDecorHit(worldPt.x, worldPt.y, CHEST_NAME_RE);
        if (chest) {
            if (this.rejectTutorialAct('chest')) return true;
            this.queueChestJob(chest.node);
            return true;
        }
        const craft = this.findDecorHit(worldPt.x, worldPt.y, CRAFT_NAME_RE);
        if (craft) {
            if (this.rejectTutorialAct('craft')) return true;
            this.queueCraftJob(craft.node);
            return true;
        }

        // Point-in-sprite first — if the tap is inside a decor AABB, that is the target.
        const nature = this.resolveNatureHit(worldPt.x, worldPt.y);
        if (nature) {
            const natureBlock = this.tutorialBlocks('nature');
            if (natureBlock) {
                this.floatTip(natureBlock);
                return true;
            }
            const ok = this.toolMatchesNature(nature.act);
            console.log(
                `[FarmTap] tool=${this.tool} → ${nature.act} ${nature.node.name} ` +
                    `foot=(${nature.node.position.x.toFixed(1)},${nature.node.position.y.toFixed(1)}) ` +
                    `toolOk=${ok}`,
            );
            if (!ok) {
                const tip = this.wrongToolTipFor(nature.act);
                console.log(`[FarmTap] REJECT wrong tool → tip="${tip}"`);
                this.floatTip(tip);
                return true;
            }
            this.queueNatureJob(nature);
            return true;
        }
        const fish = FarmWorldLayout.findFishingStand(worldPt.x, worldPt.y);
        if (fish) {
            if (this.rejectTutorialAct('fish')) return true;
            console.log('[FarmTap] → fish stand', fish);
            this.tryFishAt(fish);
            return true;
        }
        // No decor under the point — resolve the soil tile at that coordinate.
        const plotKey = this.plotKeyAt(worldPt.x, worldPt.y);
        const plot = plotKey ? this._plots.get(plotKey) ?? null : null;
        if (plot && plotKey) {
            if (this.rejectTutorialAct('plot')) return true;
            console.log(`[FarmTap] → plot ${plotKey} phase=${plot.phase}`);
            this.tryPlotWithTool(plotKey, plot);
            return true;
        }
        console.log(
            `[FarmTap] MISS ui=(${uiX.toFixed(0)},${uiY.toFixed(0)}) ` +
                `world=(${worldPt.x.toFixed(1)},${worldPt.y.toFixed(1)}) tool=${this.tool}`,
        );
        return false;
    }

    /**
     * Plot under the world point. Prefer the exact tile; only search nearby when
     * the tap lands on empty ground above grow UI / chevron chrome (not on a plot).
     */
    private plotKeyAt(wx: number, wy: number): string | null {
        const direct = `${Math.round(wx / TILE)},${Math.round(wy / TILE)}`;
        if (this._plots.has(direct)) return direct;

        // Grow timer / ad stack sits above the sprout — tap may miss the soil cell.
        const maxSq = (TILE * 1.25) * (TILE * 1.25);
        let bestAct: string | null = null;
        let bestActSq = maxSq;
        for (const [key, p] of this._plots) {
            if (!this.canActOnPlot(p)) continue;
            const parts = key.split(',');
            const ix = Number(parts[0]);
            const iy = Number(parts[1]);
            if (!Number.isFinite(ix) || !Number.isFinite(iy)) continue;
            const dx = ix * TILE - wx;
            const dy = iy * TILE - wy;
            const dSq = dx * dx + dy * dy;
            if (dSq < bestActSq) {
                bestActSq = dSq;
                bestAct = key;
            }
        }
        return bestAct;
    }

    /**
     * Soft guide only: idle arrows still point at the objective, but quests never
     * swallow world taps with「先跟着星光…」redirect tips.
     */
    private rejectTutorialAct(_kind: TutorialActKind): boolean {
        return false;
    }

    /** Always null — player may act freely; TutorialGuide owns soft cues. */
    private tutorialBlocks(_kind: TutorialActKind): string | null {
        return null;
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
            // Consumable boost: tapping the crop selects it — no extra hotbar tap.
            if (need === 'boost' && this.boosts > 0) {
                this.setTool('boost');
            } else {
                this.floatTip(`需选择：${this.toolName(need)}`);
                return;
            }
        }
        if (need === 'seeds' && this.seeds <= 0) return;
        if (need === 'boost' && this.boosts <= 0) return;
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
        if (need === 'hand' || need === 'seeds' || need === 'can' || need === 'boost') {
            return 'pick';
        }
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
        // Soft weeds / plots / props: act as soon as we're in range — don't orbit
        // a trunk or require a second tap after stopping one tile short.
        const readyDist = softNature
            ? ACT_MAX_SOFT_PULL
            : job.kind === 'plot' || job.kind === 'fish'
              ? ACT_FOCUS_PLOT
              : job.kind === 'chest' ||
                  job.kind === 'craft' ||
                  (job.kind === 'nature' &&
                      (job.natureAct === 'chop' ||
                          job.natureAct === 'dig' ||
                          job.nature?.name.includes('_solid_')))
                ? ACT_MAX_NATURE
                : actDist;
        const readyNow = Math.sqrt(adx * adx + ady * ady);
        if (readyNow <= readyDist) {
            console.log(
                `[FarmJob] already in range dist=${readyNow.toFixed(1)} readyDist=${readyDist} ` +
                    `kind=${job.kind} → act now`,
            );
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
                walkArrive = 16;
                ignoreSolid = null;
            } else {
                // Do NOT ignore the trunk and path into it — stand beside the foot instead.
                const side = ctrl.freeStandNear(job.targetX, job.targetY, p.x, p.y, 56);
                walkX = side.x;
                walkY = side.y;
                walkArrive = 14;
                ignoreSolid = null;
            }
            // Generous interact radius: pressed against the prop counts as arrived.
            actFocus = { x: job.targetX, y: job.targetY, dist: ACT_MAX_NATURE };
        } else if (softNature) {
            // Stand must stay inside act range of the weed foot (log showed SW tree
            // ring at dist 46 while ACT_MAX is 40 → ARRIVE then ACT REJECT).
            ctrl.rebuildSolids();
            const standBudget = Math.max(16, ACT_MAX_SOFT_PULL - 12);
            const stand = ctrl.freeStandNear(job.targetX, job.targetY, p.x, p.y, standBudget);
            walkX = stand.x;
            walkY = stand.y;
            walkArrive = 14;
            // Stop as soon as we're beside the weed — don't finish the long south leg.
            actFocus = { x: job.targetX, y: job.targetY, dist: Math.max(ARRIVE_NATURE_SOFT, 22) };
            const standToWeed = Math.hypot(stand.x - job.targetX, stand.y - job.targetY);
            console.log(
                `[FarmJob] soft stand→weed=${standToWeed.toFixed(1)} budget=${standBudget} ` +
                    `(must be ≤ ${ACT_MAX_SOFT_PULL} after arrive)`,
            );
        } else if (job.kind === 'plot' || job.kind === 'fish') {
            // Early-arrive next to the tile — tighter than ACT_MAX_PLOT so plant /
            // hoe don't crouch from a cell away. Abort retry still uses ACT_MAX_PLOT.
            actFocus = { x: job.targetX, y: job.targetY, dist: ACT_FOCUS_PLOT };
        }

        const softActMax = softNature ? ACT_MAX_SOFT_PULL : ACT_MAX_NATURE;
        console.log(
            `[FarmJob] walk start from=(${p.x.toFixed(1)},${p.y.toFixed(1)}) ` +
                `target=(${job.targetX.toFixed(1)},${job.targetY.toFixed(1)}) ` +
                `stand=(${walkX.toFixed(1)},${walkY.toFixed(1)}) arrive=${walkArrive} ` +
                `kind=${job.kind} soft=${softNature} distNow=${readyNow.toFixed(1)}`,
        );
        this.node.getComponent(ClickMoveMarker)?.hide();
        ctrl.walkTo(
            walkX,
            walkY,
            () => {
                if (this._jobGen !== gen || this._pending !== job) return;
                const pp = this.player!.position;
                console.log(
                    `[FarmJob] walk ARRIVE at=(${pp.x.toFixed(1)},${pp.y.toFixed(1)}) ` +
                        `targetDist=${Math.hypot(job.targetX - pp.x, job.targetY - pp.y).toFixed(1)}`,
                );
                this.runActionPhase(gen);
            },
            () => {
                if (this._jobGen !== gen || this._pending !== job) return;
                // Path aborted — still act if we ended beside the target
                // (nature weeds, craftbench, chest).
                if (this.player?.isValid) {
                    const pp = this.player.position;
                    const d = Math.hypot(job.targetX - pp.x, job.targetY - pp.y);
                    const retryMax =
                        job.kind === 'nature'
                            ? softActMax
                            : job.kind === 'craft' || job.kind === 'chest'
                              ? ACT_MAX_NATURE
                              : job.kind === 'plot' || job.kind === 'fish'
                                ? ACT_MAX_PLOT
                                : 0;
                    console.log(
                        `[FarmJob] walk ABORT at=(${pp.x.toFixed(1)},${pp.y.toFixed(1)}) ` +
                            `targetDist=${d.toFixed(1)} retryMax=${retryMax} kind=${job.kind}`,
                    );
                    if (retryMax > 0 && d <= retryMax) {
                        this.runActionPhase(gen);
                        return;
                    }
                } else {
                    console.log('[FarmJob] walk ABORT (no player)');
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
            console.log(
                `[FarmJob] ACT REJECT dist=${dist.toFixed(1)} > limit=${limit} ` +
                    `kind=${job.kind} softPull=${softPull} ` +
                    `at=(${p.x.toFixed(1)},${p.y.toFixed(1)}) ` +
                    `target=(${job.targetX.toFixed(1)},${job.targetY.toFixed(1)})`,
            );
            this._pending = null;
            this._acting = false;
            this.player.getComponent(PlayerController)?.setLocked(false);
            return;
        }

        console.log(
            `[FarmJob] ACT START dist=${dist.toFixed(1)} limit=${limit} anim=${job.anim} ` +
                `kind=${job.kind}`,
        );
        const anim = this.player.getComponent(PlayerAnimator);
        const ctrl = this.player.getComponent(PlayerController);
        const faceX = job.kind === 'fish' ? (job.fishAimX ?? job.targetX) : job.targetX;
        const faceY = job.kind === 'fish' ? (job.fishAimY ?? job.targetY) : job.targetY;
        anim?.faceToward(faceX, faceY);
        ctrl?.setLocked(true);
        this._acting = true;
        // Hard unlock if the action clip never finishes (missing frames / hot-reload).
        this.unschedule(this.forceUnlockJob);
        this.scheduleOnce(this.forceUnlockJob, 2.5);
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

    private forceUnlockJob = () => {
        if (!this._acting && !this._pending) return;
        console.warn('[FarmJob] force-unlock stale action lock');
        this._jobGen += 1;
        this._pending = null;
        this._acting = false;
        this.player?.getComponent(PlayerAnimator)?.cancelAction();
        this.player?.getComponent(PlayerController)?.setLocked(false);
    };

    private completeJob(job: PendingJob, gen: number) {
        if (this._jobGen !== gen || this._pending !== job) {
            this.unschedule(this.forceUnlockJob);
            this.player?.getComponent(PlayerController)?.setLocked(false);
            this._acting = false;
            return;
        }

        if (job.kind === 'chest') {
            this.unschedule(this.forceUnlockJob);
            this._pending = null;
            this._acting = false;
            this.player?.getComponent(PlayerController)?.setLocked(false);
            this._onChestOpen?.();
            return;
        }

        if (job.kind === 'craft') {
            this.unschedule(this.forceUnlockJob);
            this._pending = null;
            this._acting = false;
            this.player?.getComponent(PlayerController)?.setLocked(false);
            this._onCraftOpen?.();
            return;
        }

        if (job.kind === 'fish') {
            this.unschedule(this.forceUnlockJob);
            this._pending = null;
            // Stay locked for the whole minigame — unlock in the result callback.
            this.player?.getComponent(PlayerController)?.setLocked(true);
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

        this.unschedule(this.forceUnlockJob);
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
        // First mainline cast (quest 1007): gentler bar so the tutorial lands.
        // String lookup avoids a FarmSystem ↔ QuestSystem import cycle.
        const quests = this.node.getComponent('QuestSystem') as {
            activeQuest?: { id: number } | null;
            isAwaitingClaim?: boolean;
        } | null;
        const tutorialCast =
            !!quests?.activeQuest &&
            quests.activeQuest.id === 1007 &&
            !quests.isAwaitingClaim;
        const difficulty = tutorialCast ? 0.18 : 0.32 + Math.random() * 0.28;
        mini.open(
            difficulty,
            (result: FishingResult) => {
                this._acting = false;
                this.player?.getComponent(PlayerController)?.setLocked(false);
                if (result === 'perfect' || result === 'catch') {
                    // One fish per cast; perfect only changes the tip (no double loot).
                    this.grant('fish', 1, { x: aimX, y: aimY + 20 });
                    this._onQuestStat?.('fish', undefined, 1);
                    this.floatTip(result === 'perfect' ? '完美!' : '钓到了鱼!');
                } else {
                    this.floatTip(tutorialCast ? '鱼跑了 · 再点码头重试' : '鱼跑掉了…');
                }
                this.refreshHud();
            },
            { tutorial: tutorialCast },
        );
    }

    private applyPlotAction(key: string) {
        const plot = this._plots.get(key);
        if (!plot || !this.canActOnPlot(plot)) return;
        if (this.tool === 'hand' && plot.phase === 'crop' && plot.stage >= 2) {
            this.harvest(plot);
            playFarmGather();
            this._onQuestStat?.('harvest', undefined, 1);
        } else if (this.tool === 'hoe' && plot.phase === 'soil') {
            this.till(plot);
            playFarmTool();
            this._onQuestStat?.('till', undefined, 1);
        } else if (this.tool === 'seeds' && plot.phase === 'tilled') {
            if (this.seeds <= 0) return;
            this.plant(plot);
            this.seeds -= 1;
            playFarmTool();
            this._onQuestStat?.('plant', undefined, 1);
        } else if (this.tool === 'can' && plot.phase === 'crop' && !plot.watered && plot.stage < 2) {
            this.water(plot);
            playFarmTool();
            this._onQuestStat?.('water', undefined, 1);
        } else if (
            this.tool === 'boost' &&
            plot.phase === 'crop' &&
            plot.watered &&
            plot.stage < 2
        ) {
            if (this.boosts <= 0) return;
            this.applyBoost(plot);
            this.boosts -= 1;
            playFarmTool();
            this.floatTip('催熟完成！');
            this._onInvChange?.();
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
                playFarmTool();
                if (act === 'chop') this.shakeChopTarget(target, hits, need);
                return true;
            }
            this._natureHits.delete(id);
        }
        this.grantNatureLoot(target, act);
        playFarmGather();
        const wasSolid = act === 'chop' || target.name.includes('_solid_');
        if (act === 'chop') {
            this.fellChopTarget(target, wasSolid);
            return false;
        }
        target.destroy();
        if (wasSolid) {
            this.player.getComponent(PlayerController)?.rebuildSolids();
        }
        return false;
    }

    /** Trunk-anchored sway — grows as the tree takes more axe hits. */
    private shakeChopTarget(target: Node, hits: number, need: number) {
        if (!target.isValid) return;
        Tween.stopAllByTarget(target);
        target.angle = 0;
        const t = Math.max(0, Math.min(1, hits / Math.max(1, need)));
        const amp = 4.5 + t * 7;
        tween(target)
            .to(0.03, { angle: amp })
            .to(0.04, { angle: -amp })
            .to(0.035, { angle: amp * 0.75 })
            .to(0.035, { angle: -amp * 0.5 })
            .to(0.04, { angle: amp * 0.25 })
            .to(0.045, { angle: 0 })
            .start();
    }

    /** Final chop: lean over, then remove (solids rebuild after the node is gone). */
    private fellChopTarget(target: Node, wasSolid: boolean) {
        if (!target.isValid) {
            if (wasSolid) this.player?.getComponent(PlayerController)?.rebuildSolids();
            return;
        }
        Tween.stopAllByTarget(target);
        const lean = Math.random() < 0.5 ? 22 : -22;
        tween(target)
            .to(0.05, { angle: lean * 0.35 })
            .to(0.14, { angle: lean }, { easing: 'quadIn' })
            .call(() => {
                if (target.isValid) target.destroy();
                if (wasSolid) this.player?.getComponent(PlayerController)?.rebuildSolids();
            })
            .start();
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
            if (target.name.includes('ore_copper')) {
                this.grant('copper', target.name.includes('rockBig') ? 2 : 1, at);
                this.grant('stone', 1, at);
                return;
            }
            if (target.name.includes('ore_iron')) {
                this.grant('iron', target.name.includes('rockBig') ? 2 : 1, at);
                this.grant('stone', 1, at);
                return;
            }
            if (target.name.includes('ore_crystal')) {
                this.grant('goldOre', 1, at);
                this.grant('stone', 1, at);
                return;
            }
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

    /**
     * Hide stacked rival resources while a gather goto is active.
     * `pull` → hide rocks near weeds; `dig` → hide weeds near rocks;
     * `chop` → hide weeds/rocks under tree feet. Pass null to restore.
     */
    setGatherClearance(act: NatureAct | null) {
        if (act === this._gatherClearAct) {
            // Re-apply only after a gather/despawn changes the world tree.
            if (act && this.world && this.world.children.length !== this._gatherClearChildCount) {
                this.applyGatherClearance(act);
            }
            return;
        }
        this.restoreGatherClearance();
        if (!act) return;
        this._gatherClearAct = act;
        this.applyGatherClearance(act);
    }

    private restoreGatherClearance() {
        if (!this._gatherHidden.length && !this._gatherClearAct) return;
        for (let i = 0; i < this._gatherHidden.length; i++) {
            const n = this._gatherHidden[i]!;
            if (n.isValid) n.active = true;
        }
        this._gatherHidden.length = 0;
        this._gatherClearAct = null;
        this._gatherClearChildCount = -1;
        this.invalidateDecorBuckets();
    }

    private applyGatherClearance(act: NatureAct) {
        for (let i = 0; i < this._gatherHidden.length; i++) {
            const n = this._gatherHidden[i]!;
            if (n.isValid) n.active = true;
        }
        this._gatherHidden.length = 0;

        const keep =
            act === 'pull' ? this.listGrass() : act === 'dig' ? this.listRocks() : this.listTrees();
        if (!keep.length) {
            this._gatherClearChildCount = this.world?.children.length ?? -1;
            this.invalidateDecorBuckets();
            return;
        }
        const rivals: Node[] = [];
        if (act === 'pull') rivals.push(...this.listRocks());
        else if (act === 'dig') rivals.push(...this.listGrass());
        else {
            rivals.push(...this.listGrass());
            rivals.push(...this.listRocks());
        }
        // One tile for soft pairs; slightly wider under tree crowns.
        const clearR = act === 'chop' ? 88 : 56;
        const clearR2 = clearR * clearR;
        for (let i = 0; i < rivals.length; i++) {
            const rival = rivals[i]!;
            if (!rival.isValid || !rival.active) continue;
            const rx = rival.position.x;
            const ry = rival.position.y;
            for (let j = 0; j < keep.length; j++) {
                const k = keep[j]!;
                if (!k.isValid || !k.active) continue;
                const dx = rx - k.position.x;
                const dy = ry - k.position.y;
                if (dx * dx + dy * dy <= clearR2) {
                    rival.active = false;
                    this._gatherHidden.push(rival);
                    break;
                }
            }
        }
        this._gatherClearChildCount = this.world?.children.length ?? -1;
        this.invalidateDecorBuckets();
    }

    private invalidateDecorBuckets() {
        this._decorBuckets = null;
        this._decorChildCount = -1;
        this._hintSig = '';
    }

    /** Live gather goto → prefer that nature act under mixed taps. */
    private guideNatureAct(): NatureAct | null {
        // Craft-mats / TutorialGuide clearance wins over quest goto labels.
        if (this._gatherClearAct) return this._gatherClearAct;
        const quests = this.node.getComponent('QuestSystem') as {
            activeQuest?: { id: number } | null;
            isAwaitingClaim?: boolean;
            activeGotoAction?: () => GotoAction;
        } | null;
        if (!quests?.activeQuest || quests.isAwaitingClaim) return null;
        if (
            quests.activeQuest.id === 1001 &&
            !GameState.hasSeenDialogue('guide_wake_yard')
        ) {
            return null;
        }
        const action = quests.activeGotoAction?.() ?? GotoAction.None;
        if (action === GotoAction.HintGrass) return 'pull';
        if (action === GotoAction.HintRock) return 'dig';
        if (action === GotoAction.SelectAxe) return 'chop';
        return null;
    }

    /** Tap hit-test by sprite bounds. */
    private resolveNatureHit(wx: number, wy: number): { node: Node; act: NatureAct } | null {
        if (!this.world || !this.player) return null;
        const grass = this.findDecorHit(wx, wy, GRASS_NAME_RE);
        const rock = this.findDecorHit(wx, wy, ROCK_NAME_RE);
        const tree = this.findDecorHit(wx, wy, TREE_NAME_RE);

        const hitLine = (tag: string, h: { node: Node; area: number } | null) =>
            h
                ? `${tag}=${h.node.name}@(${h.node.position.x.toFixed(0)},${h.node.position.y.toFixed(0)}) area=${h.area | 0}`
                : `${tag}=null`;
        console.log(
            `[FarmHit] tap=(${wx.toFixed(1)},${wy.toFixed(1)}) tool=${this.tool} | ` +
                `${hitLine('grass', grass)} | ${hitLine('rock', rock)} | ${hitLine('tree', tree)}`,
        );

        if (!grass && !rock && !tree) {
            console.log('[FarmHit] raw: none');
            return null;
        }

        // Gather quests: always prefer the objective type when it sits under the tap.
        const prefer = this.guideNatureAct();
        if (prefer === 'pull' && grass) {
            console.log(`[FarmHit] decide: gather-prefer pull → ${grass.node.name}`);
            return { node: grass.node, act: 'pull' };
        }
        if (prefer === 'dig' && rock) {
            console.log(`[FarmHit] decide: gather-prefer dig → ${rock.node.name}`);
            return { node: rock.node, act: 'dig' };
        }
        if (prefer === 'chop' && tree) {
            console.log(`[FarmHit] decide: gather-prefer chop → ${tree.node.name}`);
            return { node: tree.node, act: 'chop' };
        }

        // Tree vs understory: neighbor bushes/rocks often sit inside a pine/oak AABB.
        // Tap on a rock/grass sprite keeps dig/pull (tool tip if wrong) — never steal
        // for canopy chop. Forcing chop here asked for 斧头 during dig-stone (1030)
        // before the axe is crafted. Axe equipped still chops; bare mid-canopy too.
        if (tree && (grass || rock)) {
            const rel = this.decorRelY(tree.node, wy);
            let pick: { node: Node; act: NatureAct };
            let reason: string;
            if (rock && this.tool === 'hoe') {
                pick = { node: rock.node, act: 'dig' };
                reason = `tree+understory tool=hoe → dig`;
            } else if (grass && this.tool === 'hand') {
                pick = { node: grass.node, act: 'pull' };
                reason = `tree+understory tool=hand → pull grass`;
            } else if (this.tool === 'axe') {
                pick = { node: tree.node, act: 'chop' };
                reason = `tree+understory tool=axe → chop`;
            } else if (rock && this.tool !== 'axe') {
                // Rock sprite under the tap — dig intent (需选择：锄头, not 斧头).
                pick = { node: rock.node, act: 'dig' };
                reason = `tree+understory rock sprite → dig`;
            } else if (grass && this.tool !== 'axe') {
                pick = { node: grass.node, act: 'pull' };
                reason = `tree+understory grass sprite → pull`;
            } else if (rel >= 0.3) {
                pick = { node: tree.node, act: 'chop' };
                reason = `tree+understory relY=${rel.toFixed(2)}>=0.3 → canopy=chop`;
            } else if (grass && rock) {
                pick =
                    grass.area <= rock.area
                        ? { node: grass.node, act: 'pull' }
                        : { node: rock.node, act: 'dig' };
                reason = `tree+understory relY=${rel.toFixed(2)} smaller area → ${pick.act}`;
            } else if (grass) {
                pick = { node: grass.node, act: 'pull' };
                reason = `tree+understory relY=${rel.toFixed(2)} → grass`;
            } else if (rock) {
                pick = { node: rock.node, act: 'dig' };
                reason = `tree+understory relY=${rel.toFixed(2)} → rock`;
            } else {
                pick = { node: tree.node, act: 'chop' };
                reason = `tree+understory relY=${rel.toFixed(2)} fallback chop`;
            }
            console.log(`[FarmHit] decide: ${reason} → ${pick.act} ${pick.node.name}`);
            return pick;
        }

        type Cand = { node: Node; area: number; act: NatureAct };
        const cands: Cand[] = [];
        if (grass) cands.push({ node: grass.node, area: grass.area, act: 'pull' });
        if (rock) cands.push({ node: rock.node, area: rock.area, act: 'dig' });
        if (tree) cands.push({ node: tree.node, area: tree.area, act: 'chop' });
        cands.sort((a, b) => a.area - b.area);
        const best = cands[0]!;
        console.log(
            `[FarmHit] decide: single-layer smallest area → ${best.act} ${best.node.name} area=${best.area | 0}`,
        );
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
        const prefer = this.guideNatureAct();
        if (prefer) {
            const guided = cands.find((c) => c.act === prefer);
            if (guided) return { node: guided.node, act: guided.act };
        }
        cands.sort((a, b) => a.dSq - b.dSq);
        const best = cands[0]!;
        return { node: best.node, act: best.act };
    }

    /** Nearest pullable weed/bush — used by the wake-yard tutorial spotlight. */
    nearestGrass(): Node | null {
        const list = this.listGrass();
        if (!list.length || !this.player) return null;
        const px = this.player.position.x;
        const py = this.player.position.y;
        let best: Node | null = null;
        let bestSq = Number.POSITIVE_INFINITY;
        for (let i = 0; i < list.length; i++) {
            const n = list[i]!;
            const dx = n.position.x - px;
            const dy = n.position.y - py;
            const dSq = dx * dx + dy * dy;
            if (dSq < bestSq) {
                bestSq = dSq;
                best = n;
            }
        }
        return best;
    }

    /** Live pullable weeds/bushes (for quest arrows). */
    listGrass(): Node[] {
        if (!this.world) return [];
        this.ensureDecorBuckets();
        const list = this._decorBuckets?.grass ?? [];
        return list.filter((n) => n.isValid && n.active);
    }

    listRocks(): Node[] {
        if (!this.world) return [];
        this.ensureDecorBuckets();
        const list = this._decorBuckets?.rock ?? [];
        return list.filter((n) => n.isValid && n.active);
    }

    listTrees(): Node[] {
        if (!this.world) return [];
        this.ensureDecorBuckets();
        const list = this._decorBuckets?.tree ?? [];
        return list.filter((n) => n.isValid && n.active);
    }

    /**
     * Front-yard tutorial weeds (`*_tut_*`) for quest 1001.
     * Prefer these over random fringe litter so the guide never drifts.
     */
    listTutorialGrass(): Node[] {
        return this.listGrass().filter((n) => n.name.includes('_tut_'));
    }

    /** Walk-and-pull a specific weed (tutorial hollow may be larger than the sprite). */
    tryPullGrass(node: Node | null) {
        if (!node?.isValid) return;
        if (this.rejectTutorialAct('nature')) return;
        if (!this.toolMatchesNature('pull')) {
            this.floatTip(this.wrongToolTipFor('pull'));
            return;
        }
        this.queueNatureJob({ node, act: 'pull' });
    }

    /** First matching world child (exact name or prefix). */
    findWorldNode(...names: string[]): Node | null {
        if (!this.world) return null;
        // Exact match first — `bld_mayor` must not resolve to `bld_mayor_yard`.
        for (const n of names) {
            for (const child of this.world.children) {
                if (child.isValid && child.name === n) return child;
            }
        }
        for (const n of names) {
            for (const child of this.world.children) {
                if (child.isValid && child.name.startsWith(n)) return child;
            }
        }
        return null;
    }

    /**
     * World-space center of a plot matching the idle-hint need.
     * `soil` / `tilled` / `water` (unwatered) / `grow` (watered, immature) / `harvest`.
     */
    hintPlotPos(
        need: 'soil' | 'tilled' | 'water' | 'grow' | 'harvest',
    ): { x: number; y: number } | null {
        if (!this.player) return null;
        const px = this.player.position.x;
        const py = this.player.position.y;
        let best: { x: number; y: number } | null = null;
        let bestSq = Number.POSITIVE_INFINITY;
        for (const [key, plot] of this._plots) {
            if (!this.plotMatchesNeed(plot, need)) continue;
            const parts = key.split(',');
            const ix = Number(parts[0]);
            const iy = Number(parts[1]);
            if (!Number.isFinite(ix) || !Number.isFinite(iy)) continue;
            const x = ix * TILE;
            const y = iy * TILE;
            const dx = x - px;
            const dy = y - py;
            const dSq = dx * dx + dy * dy;
            if (dSq < bestSq) {
                bestSq = dSq;
                best = { x, y };
            }
        }
        return best;
    }

    /** True when the plot under world (wx, wy) still matches an idle-hint need. */
    plotPosMatchesNeed(
        wx: number,
        wy: number,
        need: 'soil' | 'tilled' | 'water' | 'grow' | 'harvest',
    ): boolean {
        const key = `${Math.round(wx / TILE)},${Math.round(wy / TILE)}`;
        const plot = this._plots.get(key);
        return !!plot && this.plotMatchesNeed(plot, need);
    }

    private plotMatchesNeed(
        plot: Plot,
        need: 'soil' | 'tilled' | 'water' | 'grow' | 'harvest',
    ): boolean {
        if (need === 'soil') return plot.phase === 'soil';
        if (need === 'tilled') return plot.phase === 'tilled';
        if (need === 'water') return plot.phase === 'crop' && !plot.watered && plot.stage < 2;
        if (need === 'grow') return plot.phase === 'crop' && plot.watered && plot.stage < 2;
        if (need === 'harvest') return plot.phase === 'crop' && plot.stage >= 2;
        return false;
    }

    /** True while a mock rewarded-ad grow boost is ticking. */
    isGrowBoostPlaying() {
        return !!this._adWait;
    }

    /**
     * World-local center of the nearest growing crop's ad chip
     * (countdown stack). Used by harvest-quest idle arrows.
     */
    hintGrowAdPos(): { x: number; y: number } | null {
        if (!this.player) return null;
        const px = this.player.position.x;
        const py = this.player.position.y;
        let best: { x: number; y: number } | null = null;
        let bestSq = Number.POSITIVE_INFINITY;
        for (const [key, plot] of this._plots) {
            if (plot.phase !== 'crop' || !plot.watered || plot.stage >= 2) continue;
            let x: number;
            let y: number;
            if (plot.growUi?.isValid && plot.adBtn?.isValid) {
                x = plot.growUi.position.x + plot.adBtn.position.x;
                y = plot.growUi.position.y + plot.adBtn.position.y;
            } else if (plot.tile) {
                x = plot.tile.position.x;
                y = plot.tile.position.y + 10;
            } else {
                const parts = key.split(',');
                const ix = Number(parts[0]);
                const iy = Number(parts[1]);
                if (!Number.isFinite(ix) || !Number.isFinite(iy)) continue;
                x = ix * TILE;
                y = iy * TILE;
            }
            const dx = x - px;
            const dy = y - py;
            const dSq = dx * dx + dy * dy;
            if (dSq < bestSq) {
                bestSq = dSq;
                best = { x, y };
            }
        }
        return best;
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
        const taperTree = nameRe === TREE_NAME_RE;
        // Trees: tiny pad — large pad made neighboring canopies steal taps.
        const pad = taperTree ? 1 : 6;
        const list = this.decorListFor(nameRe);
        for (let i = 0; i < list.length; i++) {
            const child = list[i]!;
            if (!child.isValid || !child.active) continue;
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
            // Pine/oak: triangular trunk→canopy. Among overlaps, pick nearest trunk
            // axis — never "smallest sprite" (pine always beat oak before).
            if (taperTree) {
                const boxH = Math.max(1, top - bottom);
                const relY = (wy - bottom) / boxH;
                const halfW = (right - left) * 0.5;
                const halfAllow = halfW * (0.2 + relY * 0.5); // foot ~20% → crown ~70%
                if (Math.abs(wx - p.x) > halfAllow) continue;
                const trunkDx = wx - p.x;
                const footDy = wy - p.y;
                const score = trunkDx * trunkDx * 4 + footDy * footDy;
                if (score < bestSq) {
                    best = child;
                    bestSq = score;
                    bestArea = w * h;
                }
                continue;
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
            if (!child.isValid || !child.active) continue;
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
        if (plot.phase === 'crop' && plot.watered && plot.stage < 2 && this.boosts > 0) {
            return 'boost';
        }
        return null;
    }

    private canActOnPlot(plot: Plot): boolean {
        const need = this.neededTool(plot);
        if (!need || this.tool !== need) return false;
        if (need === 'seeds' && this.seeds <= 0) return false;
        if (need === 'boost' && this.boosts <= 0) return false;
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
        return itemName(t, t);
    }

    private previewForPlot(plot: Plot): string {
        const need = this.neededTool(plot);
        if (!need) return '生长中…';
        if (this.tool !== need) return `需选择：${this.toolName(need)}`;
        if (plot.phase === 'crop' && plot.stage >= 2) return '点击收获';
        if (plot.phase === 'soil') return '点击锄地';
        if (plot.phase === 'tilled') {
            return this.seeds > 0 ? '点击播种' : `缺${itemName('seeds', '种子')}`;
        }
        if (plot.phase === 'crop' && !plot.watered) return '点击浇水';
        if (need === 'boost') {
            return this.boosts > 0 ? '点击催熟' : `缺${itemName('boost', '催熟剂')}`;
        }
        return '生长中…';
    }

    /** Instantly mature a watered growing crop (consumable boost / ad finish). */
    private applyBoost(plot: Plot) {
        plot.grow = Math.max(0.1, this.growSeconds);
        plot.stage = 2;
        this.applyCropVisual(plot);
        this.syncGrowTimer(plot);
        this.refreshHud();
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
        // null = no guide (use preview); '' = guide active but silent (tool-swap arrow).
        const guided = this.guideHintProvider?.() ?? null;
        const p = this.player.position;
        const plotKey = this.facingPlotKey();
        let plotSig = '';
        if (plotKey) {
            const plot = this._plots.get(plotKey);
            if (plot) {
                plotSig = `${plot.phase},${plot.stage},${plot.watered ? 1 : 0},${plot.grow | 0}`;
            }
        }
        const sig = `${p.x | 0},${p.y | 0},${InputBridge.facingX},${InputBridge.facingY},${this.tool},${this.seeds},${this._decorChildCount}|${plotSig}|${guided ?? '\u0000'}`;
        if (sig === this._hintSig) return;
        this._hintSig = sig;
        const text = guided !== null ? guided : this.previewAction();
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
            // Prefer the consumable boost item — hide the ad chip while the player has one.
            plot.adBtn.active = this.boosts <= 0;
            if (plot.adBtn.active) {
                const sp = plot.adBtn.getComponent(Sprite);
                if (sp && this._adSf && sp.spriteFrame !== this._adSf) sp.spriteFrame = this._adSf;
                const op = plot.adBtn.getComponent(UIOpacity) ?? plot.adBtn.addComponent(UIOpacity);
                op.opacity = this._adWait ? 120 : 255;
            }
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
        // Consumable boost hides the chip — must not steal taps onto the plot.
        if (this.boosts > 0) return null;
        const pad = 14;
        let bestKey: string | null = null;
        let bestSq = Infinity;
        for (const [key, plot] of this._plots) {
            if (!plot.adBtn?.isValid || !plot.adBtn.active || !plot.growUi?.isValid) continue;
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
        this.applyBoost(plot);
        this.floatTip('加速完成！');
    }

    private spawnHudLabels() {
        // Bottom cue used to sit at y −560 ("点击锄地" etc.) and stacked on the
        // always-visible move stick (TouchJoystick REST_STICK_Y −600). Drop it.
        const old = this.node.getChildByName('FarmActionHint');
        if (old) old.destroy();
        this._actionHint = null;
    }

    private refreshHud() {
        this._hintSig = '';
        this.refreshActionHint();
        this._onInvChange?.();
    }
}
