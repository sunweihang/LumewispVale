import {
    _decorator,
    assetManager,
    Color,
    Component,
    Graphics,
    Label,
    Node,
    Sprite,
    SpriteFrame,
    UIOpacity,
    UITransform,
    Vec3,
    tween,
    Tween,
    view,
} from 'cc';
import { GotoAction } from '../cfg/schema';
import { DialoguePanel } from './DialoguePanel';
import { FarmHUD } from './FarmHUD';
import { FarmSystem } from './FarmSystem';
import { FarmWorldLayout } from './FarmWorldLayout';
import { FISHING_FRAMES } from './FishingFrames';
import { FishingMinigame } from './FishingMinigame';
import { GameState } from './GameState';
import { InputBridge } from './InputBridge';
import { QUEST_FRAMES } from './QuestFrames';
import { QuestPanel } from './QuestPanel';
import { QuestSystem } from './QuestSystem';
import { RewardPopup } from './RewardPopup';
import { StoryWorldHooks } from './StoryWorldHooks';
import { TOOL_FRAMES } from './ToolFrames';
import { playUiClick } from './UiAudio';
import { applyUiFont, loadUiFont, styleUiLabel } from './UiFont';

const { ccclass, executionOrder } = _decorator;

const GUIDE_ID = 'guide_wake_yard';
const DIM_A = 150;
const HOLE_PAD = 14;
/** Keep tip / ring inside the portrait frame. */
const SCREEN_INSET = 24;
const TIP_W = 560;
const TIP_H = 64;
const FADE_IN = 0.16;
const INPUT_GUARD = 0.35;
/** Keep quest arrows clear of bottom hotbar / quest dock and top info board. */
const ARROW_UI_FLOOR = -560;
/** Distance below canvas top reserved for clock / gold board. */
const ARROW_TOP_RESERVE = 380;
/** Chevron half-height above its node center (sprite / fallback). */
const ARROW_EXTENT_UP = 48;
/** Gap between arrow top and tip banner bottom. */
const TIP_ARROW_GAP = 18;
/** Bag → hotbar drag demo loop (ms). */
const DRAG_DEMO_MS = 2200;
/** Ghost icon size while demo-dragging an item. */
const DRAG_GHOST = 72;
/** Only guide weeds this close to the player (world units). */
const GRASS_HINT_RANGE = 340;
/**
 * Front-yard band for quest 1001 — south of the cottage, west of the town road.
 * Prefer these so the arrow never jumps into the house / wild fringe.
 */
const YARD_GRASS = { x0: -40, x1: 260, y0: 140, y1: 280 };
/** Within this range of the pier, tip switches from “walk” to “cast”. */
const FISH_NEAR_RANGE = 300;
/** Quest 1003 first-seed recipe — matches FarmHUD guided craft. */
const FIRST_SEED_RECIPE = 'seed_from_grass';
/** Keep the same world target this long so nearest-picking can't thrash the arrow. */
const STICKY_MS = 1200;
/** Prefer the stuck target until a rival is this much closer (world units²). */
const STICKY_SWITCH_SQ = 160 * 160;

type GuideStep = 'quest' | 'hand' | 'grass';

type HoleRect = { x: number; y: number; w: number; h: number };
type WorldPos = { x: number; y: number };

/** Continuous idle quest cue: swap tool first, then click the world target. */
type IdleGuide = {
    hole: HoleRect;
    tip: string;
    /** Hotbar / quest dock / bag — keep arrow near UI, not playfield band. */
    uiDock: boolean;
    /** Arrow on hotbar only — no FarmActionHint caption (tool swap). */
    silent?: boolean;
    /** When set, animate finger/ghost from `hole` → `dragTo` (drag demo). */
    dragTo?: HoleRect;
    /** Item frame for the drag ghost (e.g. boost). */
    dragItem?: string;
    /**
     * Finger Z euler degrees. Sprite defaults to pointing down (0).
     * 90 = walk east / right edge; -90 = walk west / left edge;
     * 180 = walk north / top edge (target above the playfield).
     */
    arrowDeg?: number;
    /** Fishing cast step — pulse AI ripple on the pier / water aim. */
    groundRipple?: boolean;
    /** World position for `groundRipple` (mid-pier tip). */
    rippleWorld?: WorldPos;
};

const TOOL_LABEL: Record<string, string> = {
    hand: '手',
    hoe: '锄头',
    seeds: '种子',
    can: '水壶',
    rod: '鱼竿',
    boost: '催熟剂',
};

/**
 * Hollow spotlight tutorial after wake_farm dialogue:
 * 1) show quest tracker → 2) select hand → 3) pull weeds until quest 1001 is done.
 * Spotlight is forced: InputBridge.uiBlocking stays on (no walk / no other taps).
 *
 * Also: while a quest is active, keep guiding — wrong tool → arrow on hotbar,
 * then arrow on the objective (no dim mask). Off-screen world aims become a
 * left/right edge chevron until the target re-enters the playfield.
 *
 * lateUpdate after CameraFollow so world→UI holes match the snapped World pose.
 */
@ccclass('TutorialGuide')
@executionOrder(40)
export class TutorialGuide extends Component {
    farm: FarmSystem | null = null;
    quests: QuestSystem | null = null;

    private _root: Node | null = null;
    private _dimN: Node | null = null;
    private _ringN: Node | null = null;
    private _dimG: Graphics | null = null;
    private _ringG: Graphics | null = null;
    private _tipRoot: Node | null = null;
    private _tipLab: Label | null = null;
    private _finger: Node | null = null;
    private _dragGhost: Node | null = null;
    private _dragGhostSp: Sprite | null = null;
    private _dragGhostOp: UIOpacity | null = null;
    private _trailN: Node | null = null;
    private _trailG: Graphics | null = null;
    private _rootOp: UIOpacity | null = null;
    /** World-space ground ripple under the fishing cast aim. */
    private _rippleN: Node | null = null;
    private _rippleOp: UIOpacity | null = null;
    private _rippleSp: Sprite | null = null;
    private _rippleLoaded = false;
    private _ripplePulsing = false;

    private _open = false;
    private _idleOn = false;
    private _idleUiDock = false;
    private _idleSilent = false;
    private _idleTip = '';
    private _idleDragTo: HoleRect | null = null;
    private _idleDragItem = '';
    /** Idle chevron Z euler; 0 = down, 90 = right. */
    private _idleArrowDeg = 0;
    private _idleGroundRipple = false;
    private _idleRippleWorld: WorldPos | null = null;
    private _step: GuideStep = 'quest';
    private _inputReady = false;
    private _prevBlocking = false;
    private _grassTarget: Node | null = null;
    private _grassBase = 0;
    private _hole: HoleRect = { x: 0, y: 0, w: 120, h: 120 };
    /** Sticky idle world aim — stops nearest-target thrash + quest-dock flicker. */
    private _stickyKey = '';
    private _stickyNode: Node | null = null;
    private _stickyPos: WorldPos | null = null;
    private _stickyUntil = 0;
    private readonly _worldPt = new Vec3();
    private readonly _localPt = new Vec3();

    get isOpen() {
        return this._open;
    }

    onLoad() {
        this.build();
        this.hideImmediate();
        if (this.farm) {
            this.farm.guideHintProvider = () => this.currentGuideHint();
        }
        loadUiFont().then((font) => {
            if (font && this._tipLab) applyUiFont(this._tipLab);
        });
    }

    onEnable() {
        this.bindFarmHint();
    }

    /** Call after `guide.farm = farm` so the bottom cue tracks quest tips. */
    bindFarmHint() {
        if (this.farm) {
            this.farm.guideHintProvider = () => this.currentGuideHint();
        }
    }

    /**
     * Bottom FarmActionHint — spotlight steps first, then the live quest tip.
     * Tool-swap returns '' (silent): arrow on the hotbar slot, no caption.
     */
    currentGuideHint(): string | null {
        if (this._open) {
            if (this._step === 'quest') return '露穗：看这里呀 · 点一下继续';
            if (this._step === 'hand') return '露穗：先点下方「手」哦';
            return this.grassStepTip();
        }
        if (!this.quests?.activeQuest) return null;
        if (this.node.getComponent(DialoguePanel)?.isOpen) return null;
        if (this.node.getComponent(RewardPopup)?.isOpen) return null;
        const hud = this.node.getComponent(FarmHUD);
        // Craft / bag modals normally hide the cue — keep guided craft / boost steps.
        if (
            hud?.isModalOpen &&
            !hud.needsFirstSeedCraftGuide() &&
            !hud.needsHarvestBoostGuide()
        ) {
            return null;
        }
        const guide = this.resolveIdleGuide();
        if (!guide) return null;
        if (guide.silent) return '';
        return guide.tip;
    }

    onDestroy() {
        this.unschedule(this.enableInput);
        if (this.farm?.guideHintProvider) {
            this.farm.guideHintProvider = null;
        }
        if (this._open) {
            InputBridge.uiBlocking = false;
        }
    }

    /** Kept for GameBootstrap wiring — quest arrow no longer waits on idle. */
    noteActivity() {
        // no-op: arrow stays visible while a quest is active
    }

    /**
     * First-yard guide after opening dialogue. Idempotent via GameState.
     */
    startWakeYardGuide() {
        if (GameState.hasSeenDialogue(GUIDE_ID)) return;
        if (this._open) return;
        if ((this.quests?.activeQuest?.id ?? 0) !== 1001) return;
        if (this.quests?.isCompleted(1001)) return;
        this.hideIdleArrow();
        this._step = 'quest';
        this._grassTarget = null;
        this.show();
        this.applyStep();
    }

    /**
     * GM: dismiss forced spotlight immediately (marks guide seen, unlocks input).
     * Idle quest arrows resume from the live objective on the next frame.
     */
    dismissSpotlight() {
        GameState.markDialogueSeen(GUIDE_ID);
        if (!this._open) return;
        this._open = false;
        this._inputReady = false;
        this._grassTarget = null;
        this.unschedule(this.enableInput);
        InputBridge.uiBlocking = false;
        if (this._rootOp) Tween.stopAllByTarget(this._rootOp);
        this.setSpotlightChrome(false);
        this.hideImmediate();
    }

    /** From GameBootstrap stick.onTap — consume while spotlight open. */
    handleTap(uiX: number, uiY: number): boolean {
        if (!this._open || !this._inputReady) return this._open;
        const local = this.uiToCanvasLocal(uiX, uiY);
        const inHole = this.hitHole(local.x, local.y);

        if (this._step === 'quest') {
            // Any tap advances once the tracker is visible.
            playUiClick();
            this.gotoStep('hand');
            return true;
        }

        if (this._step === 'hand') {
            if (!inHole) return true;
            playUiClick();
            this.farm?.setTool('hand');
            this.gotoStep('grass');
            return true;
        }

        // grass — hollow accepts the dig; act on the locked weed (hole > sprite).
        if (inHole) {
            playUiClick();
            const target = this._grassTarget;
            if (target?.isValid) this.farm?.tryPullGrass(target);
            else this.farm?.tryActAtUi(uiX, uiY);
            this.checkGrassDone();
        }
        return true;
    }

    update() {
        if (this._open) return;
        if (!this.canShowIdleArrow()) {
            if (this._idleOn) this.hideIdleArrow();
            return;
        }
        this.showIdleArrow();
    }

    lateUpdate() {
        if (this._open) {
            // Re-assert lock each frame — nested UI restore / stale-clear must not
            // re-enable the stick mid-spotlight (hollow would drift with the camera).
            if (!InputBridge.uiBlocking) {
                InputBridge.uiBlocking = true;
                InputBridge.clear();
            }
            if (this._root?.isValid) {
                this._root.setSiblingIndex(this.node.children.length - 1);
            }
            this.refreshHole();
            this.paint();
            this.layoutChrome(true);
            if (this._step === 'grass') this.checkGrassDone();
            return;
        }
        if (this._idleOn) {
            if (this._root?.isValid) {
                this._root.setSiblingIndex(this.node.children.length - 1);
            }
            const guide = this.resolveIdleGuide();
            if (!guide) {
                this.hideIdleArrow();
                return;
            }
            this.applyIdleGuide(guide);
            this.layoutChrome(false);
        }
    }

    private show() {
        this._prevBlocking = InputBridge.uiBlocking;
        InputBridge.uiBlocking = true;
        InputBridge.clear();
        this._open = true;
        this._idleOn = false;
        this._inputReady = false;
        GameState.markDialogueSeen(GUIDE_ID);
        this.setSpotlightChrome(true);
        if (this._rootOp) this._rootOp.opacity = 0;
        if (this._root) {
            this._root.active = true;
            this._root.setSiblingIndex(this.node.children.length - 1);
        }
        if (this._rootOp) {
            tween(this._rootOp).to(FADE_IN, { opacity: 255 }).start();
        }
        this.unschedule(this.enableInput);
        this.scheduleOnce(this.enableInput, INPUT_GUARD);
    }

    private enableInput = () => {
        if (!this._open) return;
        this._inputReady = true;
    };

    private finish() {
        if (!this._open) return;
        this._open = false;
        this._inputReady = false;
        this._grassTarget = null;
        // Spotlight is done — never restore a stale uiBlocking from dialogue nesting.
        InputBridge.uiBlocking = false;
        if (this._rootOp) Tween.stopAllByTarget(this._rootOp);
        this.setSpotlightChrome(false);
        this._idleOn = false;
        // Hand off to continuous idle arrow on the next objective (claim / tool / world).
        if (this.canShowIdleArrow()) this.showIdleArrow();
        else this.hideImmediate();
    }

    private hideImmediate() {
        if (this._rootOp) this._rootOp.opacity = 0;
        if (this._root) this._root.active = false;
        this._idleOn = false;
        this._idleSilent = false;
        this._idleUiDock = false;
        this._idleTip = '';
        this._idleDragTo = null;
        this._idleDragItem = '';
        this._idleArrowDeg = 0;
        this._idleGroundRipple = false;
        this._idleRippleWorld = null;
        if (this._finger) this._finger.setRotationFromEuler(0, 0, 0);
        this.clearStickyTarget();
        this.clearDragDemoChrome();
        this.hideGroundRipple();
    }

    private canShowIdleArrow(): boolean {
        if (this._open) return false;
        if (!this.quests?.activeQuest) return false;
        // Concrete modals only — do NOT trust InputBridge.uiBlocking (nested
        // reward→dialogue restore can leave it stuck true and kill all arrows).
        if (this.node.getComponent(DialoguePanel)?.isOpen) return false;
        if (this.node.getComponent(RewardPopup)?.isOpen) return false;
        // Quest journal open → still show arrow (points at close so guide never dies).
        if (this.node.getComponent(FishingMinigame)?.isOpen) return false;
        const hud = this.node.getComponent(FarmHUD);
        // Allow arrow over craft (first seed) and bag (drag boost to hotbar).
        if (
            hud?.isModalOpen &&
            !hud.needsFirstSeedCraftGuide() &&
            !hud.needsHarvestBoostGuide()
        ) {
            return false;
        }
        if (InputBridge.moveLocked) return false;
        return true;
    }

    private showIdleArrow() {
        const guide = this.resolveIdleGuide();
        if (!guide) return;
        this._idleOn = true;
        this.applyIdleGuide(guide);
        // Arrow only (no dim / tip banner) — caption used to cover the chevron.
        if (this._dimN) this._dimN.active = false;
        if (this._ringN) this._ringN.active = false;
        if (this._tipRoot) this._tipRoot.active = false;
        if (this._finger) this._finger.active = true;
        if (this._rootOp) {
            Tween.stopAllByTarget(this._rootOp);
            this._rootOp.opacity = 255;
        }
        if (this._root) {
            this._root.active = true;
            this._root.setSiblingIndex(this.node.children.length - 1);
        }
        this.layoutChrome(false);
    }

    private hideIdleArrow() {
        if (!this._idleOn) return;
        this._idleOn = false;
        this._idleTip = '';
        this._idleUiDock = false;
        this._idleSilent = false;
        this._idleDragTo = null;
        this._idleDragItem = '';
        this._idleArrowDeg = 0;
        this._idleGroundRipple = false;
        this._idleRippleWorld = null;
        if (this._finger) this._finger.setRotationFromEuler(0, 0, 0);
        // Keep sticky aim across brief dialogue / modal hides so the arrow
        // doesn't re-pick a different weed/plot when it comes back.
        this.clearDragDemoChrome();
        this.hideGroundRipple();
        if (!this._open && this._root) this._root.active = false;
    }

    private clearStickyTarget() {
        this._stickyKey = '';
        this._stickyNode = null;
        this._stickyPos = null;
        this._stickyUntil = 0;
    }

    private setSpotlightChrome(on: boolean) {
        if (this._dimN) this._dimN.active = on;
        if (this._ringN) this._ringN.active = on;
        if (this._tipRoot) this._tipRoot.active = on;
        if (this._finger) this._finger.active = true;
    }

    private applyIdleGuide(guide: IdleGuide) {
        this._hole = guide.hole;
        this._idleUiDock = guide.uiDock;
        this._idleSilent = !!guide.silent;
        this._idleTip = guide.tip;
        this._idleDragTo = guide.dragTo ?? null;
        this._idleDragItem = guide.dragItem ?? '';
        this._idleArrowDeg = guide.arrowDeg ?? 0;
        this._idleGroundRipple = !!guide.groundRipple;
        this._idleRippleWorld = guide.rippleWorld ?? null;
        if (this._tipLab) this._tipLab.string = guide.tip;
        if (this._idleDragItem) this.ensureDragGhostFrame(this._idleDragItem);
        this.syncGroundRipple();
    }

    private toolSwapTip(tool: string): string {
        const name = TOOL_LABEL[tool] ?? tool;
        return `露穗：换上「${name}」再继续呀`;
    }

    /** Wrong tool → arrow on that hotbar slot only (no caption, no quest-chip fallback). */
    private toolSwapGuide(tool: string, slot: string): IdleGuide | null {
        const slotHole = this.toolSlotHole(slot) ?? this.toolSlotHoleFallback(slot);
        if (!slotHole) return null;
        return { hole: slotHole, tip: this.toolSwapTip(tool), uiDock: true, silent: true };
    }

    /** Match FarmHUD dock layout if the slot node is not ready yet. */
    private toolSlotHoleFallback(itemId: string): HoleRect | null {
        const order = ['hand', 'hoe', 'seeds', 'can', 'axe', 'rod'];
        const i = order.indexOf(itemId);
        if (i < 0) return null;
        const slot = 150;
        const gap = 4;
        const barY = -860;
        const totalW = 7 * slot + 6 * gap;
        const startX = -totalW * 0.5 + slot * 0.5;
        return { x: startX + i * (slot + gap), y: barY, w: slot, h: slot };
    }

    /**
     * Point at a world hole. Off-screen → left/right edge chevron (not quest dock).
     * Quest dock only when there is truly no world aim.
     */
    private worldOrQuest(hole: HoleRect | null, tip: string, fallbackTip?: string): IdleGuide | null {
        if (hole) {
            if (this.isInPlayfield(hole)) {
                return { hole, tip, uiDock: false, arrowDeg: 0 };
            }
            return this.offscreenEdgeGuide(hole, fallbackTip ?? tip);
        }
        const q = this.questHole();
        if (!q) return null;
        return { hole: q, tip: fallbackTip ?? tip, uiDock: true };
    }

    /** World node → directed hole (on-sprite or screen-edge pointer). */
    private worldNodeGuide(node: Node | null, tip: string, fallbackTip?: string): IdleGuide | null {
        return this.worldOrQuest(this.worldNodeHole(node), tip, fallbackTip);
    }

    /** World pos → directed hole. */
    private worldPosGuide(pos: WorldPos | null, tip: string, fallbackTip?: string): IdleGuide | null {
        return this.worldOrQuest(this.worldPosHole(pos), tip, fallbackTip);
    }

    /**
     * Resolve idle finger + tip for the live quest.
     * Tool-gated steps always prefer the hotbar until the right tool is selected.
     */
    private resolveIdleGuide(): IdleGuide | null {
        const quests = this.quests;
        if (!quests?.activeQuest) return null;

        // Journal open blocks movement — force close before any world step.
        const journal = this.node.getComponent(QuestPanel);
        if (journal?.isOpen) {
            const hole = this.uiNodeHole(journal.btnClose);
            if (!hole) return null;
            this.clearStickyTarget();
            return { hole, tip: '露穗：关掉这个，继续任务呀', uiDock: true };
        }

        // Before yard spotlight — free roam (no lock); soft arrow on 露穗 only.
        if (quests.activeQuest.id === 1001 && !GameState.hasSeenDialogue(GUIDE_ID)) {
            return this.worldNodeGuide(
                this.farm?.findWorldNode('npc_girl') ?? null,
                '露穗：点我说话呀～',
                '露穗：走近点我，点一下～',
            );
        }

        // First-seed craft panel: make → wait (locked 5s) → close, then claim / next.
        const craftGuide = this.resolveFirstSeedCraftGuide();
        if (craftGuide) {
            this.clearStickyTarget();
            return craftGuide;
        }

        if (quests.isAwaitingClaim) {
            const hole = this.questHole();
            if (!hole) return null;
            this.clearStickyTarget();
            return { hole, tip: '露穗：点任务栏领奖吧～', uiDock: true };
        }

        const action = quests.activeGotoAction();
        const tool = this.farm?.tool;

        const needTool = (
            t: string,
            slot: string,
            clickTip: string,
            world: () => HoleRect | null,
        ): IdleGuide | null => {
            if (tool !== t) {
                this.clearStickyTarget();
                return this.toolSwapGuide(t, slot);
            }
            return this.worldOrQuest(world(), clickTip);
        };

        switch (action) {
            case GotoAction.SelectHand: {
                // Harvest (1006): bag→hotbar boost → use on crop → hand harvest.
                const harvestPos = this.stickyPlotPos('harvest');
                if (!harvestPos) {
                    const boost = this.resolveHarvestBoostGuide();
                    if (boost) return boost;
                    return this.worldOrQuest(null, '露穗：再等等，作物就要熟啦');
                }
                return needTool('hand', 'hand', '露穗：点成熟作物收获呀', () =>
                    this.worldPosHole(harvestPos),
                );
            }
            case GotoAction.HintGrass:
                return needTool('hand', 'hand', '露穗：点这里拔掉杂草～', () =>
                    this.worldNodeHole(this.pickHintGrass()),
                );
            case GotoAction.SelectHoe:
                return needTool('hoe', 'hoe', '露穗：点这里开垦田地哦', () =>
                    this.worldPosHole(this.stickyPlotPos('soil')),
                );
            case GotoAction.SelectSeeds:
                return needTool('seeds', 'seeds', '露穗：点翻好的地播种呀', () =>
                    this.worldPosHole(this.stickyPlotPos('tilled')),
                );
            case GotoAction.SelectCan:
                return needTool('can', 'can', '露穗：给作物浇点水吧', () =>
                    this.worldPosHole(this.stickyPlotPos('water')),
                );
            case GotoAction.SelectRod:
            case GotoAction.HintFish:
                return this.resolveFishGuide(tool);
            case GotoAction.HintFarm: {
                const soil = this.stickyPlotPos('soil');
                if (soil) {
                    if (tool !== 'hoe') {
                        this.clearStickyTarget();
                        return this.toolSwapGuide('hoe', 'hoe');
                    }
                    return this.worldPosGuide(soil, '露穗：点这里开垦田地哦');
                }
                const tilled = this.stickyPlotPos('tilled');
                if (tilled) {
                    if (tool !== 'seeds') {
                        this.clearStickyTarget();
                        return this.toolSwapGuide('seeds', 'seeds');
                    }
                    return this.worldPosGuide(tilled, '露穗：点翻好的地播种呀');
                }
                return this.worldOrQuest(null, '露穗：去田边操作一下吧');
            }
            case GotoAction.HintCraft:
            case GotoAction.OpenCraft: {
                const hud = this.node.getComponent(FarmHUD);
                if (hud?.isCraftOpen) {
                    // Panel open mid-quest — fall through to in-panel guide above.
                    const again = this.resolveFirstSeedCraftGuide();
                    if (again) {
                        this.clearStickyTarget();
                        return again;
                    }
                }
                return this.worldNodeGuide(
                    this.farm?.findWorldNode('prop_craftbench') ?? null,
                    '露穗：点工作台打开合成呀',
                );
            }
            case GotoAction.OpenBag: {
                const bag = this.bagHole() ?? this.questHole();
                if (!bag) return null;
                this.clearStickyTarget();
                return { hole: bag, tip: '露穗：点开背包看看～', uiDock: true };
            }
            case GotoAction.HintMeteor:
            case GotoAction.HintTownGate:
                return this.resolveTownGateGuide();
            case GotoAction.HintMayor:
                return this.resolveMayorGuide();
            default: {
                const id = quests.activeQuest.id;
                if (id === 1011) {
                    return this.worldNodeGuide(
                        this.farm?.findWorldNode('bld_police', 'bld_post', 'police', 'post') ?? null,
                        '点击警局或邮局接任务',
                    );
                }
                if (id === 1012) {
                    return this.worldNodeGuide(
                        this.farm?.findWorldNode('npc_carpenter', 'bld_carpenter', 'carpenter') ??
                            null,
                        '点击工匠·石楠打招呼',
                    );
                }
                if (id === 1013) {
                    return this.worldNodeGuide(
                        this.farm?.findWorldNode('bld_community', 'community') ?? null,
                        '点击社区中心查看工程',
                    );
                }
                if (id === 1020) {
                    return this.worldNodeGuide(
                        this.farm?.findWorldNode(
                            'bld_seedshop',
                            'bld_general',
                            'seedshop',
                            'general',
                        ) ?? null,
                        '走进商店，点击购买商品',
                    );
                }
                if (id === 1021) {
                    return this.worldNodeGuide(
                        this.farm?.findWorldNode(
                            'bld_seedshop',
                            'bld_general',
                            'seedshop',
                            'general',
                        ) ?? null,
                        '打开商店，点「出售」卖掉一件收获物',
                    );
                }
                if (id === 1022 || id === 1027) {
                    return this.worldNodeGuide(
                        this.farm?.findWorldNode('bld_community', 'community') ?? null,
                        id === 1022 ? '点击社区中心，签署春厅收集包' : '点击社区中心，点亮春厅',
                    );
                }
                if (id === 1023) {
                    return this.worldNodeGuide(
                        this.farm?.findWorldNode('bld_clinic', 'clinic') ?? null,
                        '点击微光诊所听取叮嘱',
                    );
                }
                if (id === 1024) {
                    return this.worldNodeGuide(
                        this.farm?.findWorldNode('bld_oreshop', 'oreshop') ?? null,
                        '点击矿脉商会取得通行证',
                    );
                }
                if (id === 1025) {
                    return this.worldNodeGuide(
                        this.farm?.findWorldNode('sign_mine') ?? null,
                        '点击北山矿洞路牌进入',
                    );
                }
                if (id === 1026) {
                    return this.worldNodeGuide(
                        this.farm?.findWorldNode(
                            'decor_rock_solid_ore_copper',
                            'ore_copper',
                        ) ?? null,
                        '选中锄头，挖开铜矿石',
                    );
                }
                const q = this.questHole();
                if (!q) return null;
                return { hole: q, tip: '查看当前任务目标', uiDock: true };
            }
        }
    }

    /**
     * Quest 1006 before the crop is mature:
     * open bag → drag boost to hotbar → close → equip → use on crop.
     */
    private resolveHarvestBoostGuide(): IdleGuide | null {
        const farm = this.farm;
        const hud = this.node.getComponent(FarmHUD);
        if (!farm || !hud) return null;
        if (farm.boosts <= 0) return null;

        if (!hud.isHotbarBound('boost')) {
            this.clearStickyTarget();
            if (!hud.isBagOpen) {
                const bag = this.bagHole() ?? this.questHole();
                if (!bag) return null;
                return { hole: bag, tip: '露穗：点开背包看看～', uiDock: true };
            }
            const itemHole = this.uiNodeHole(hud.bagSlotNode('boost'));
            if (!itemHole) return null;
            const dropHole = this.uiNodeHole(hud.emptyHotbarSlotNode());
            if (!dropHole) {
                return { hole: itemHole, tip: '露穗：把催熟剂拖到下方快捷栏', uiDock: true };
            }
            return {
                hole: itemHole,
                tip: '露穗：按住催熟剂，拖到空快捷栏呀',
                uiDock: true,
                dragTo: dropHole,
                dragItem: 'boost',
            };
        }

        if (hud.isBagOpen) {
            this.clearStickyTarget();
            const close = this.uiNodeHole(hud.bagCloseBtnNode());
            if (!close) return null;
            return { hole: close, tip: '露穗：关掉背包继续吧', uiDock: true };
        }

        if (farm.tool !== 'boost') {
            this.clearStickyTarget();
            return this.toolSwapGuide('boost', 'boost');
        }

        return this.worldPosGuide(this.stickyPlotPos('grow'), '露穗：点作物用催熟剂～');
    }

    /**
     * Quest 1003 craft modal steps (FarmHUD enforces 5s lock).
     * Returns null when the panel is closed or this quest doesn't need it.
     */
    private resolveFirstSeedCraftGuide(): IdleGuide | null {
        const hud = this.node.getComponent(FarmHUD);
        if (!hud?.needsFirstSeedCraftGuide()) return null;

        if (hud.isTutorialCraftLocked) {
            const node = hud.craftRecipeBtnNode(FIRST_SEED_RECIPE);
            const hole = this.uiNodeHole(node);
            if (!hole) return null;
            return { hole, tip: '露穗：种子正在搓呢，稍等～', uiDock: true };
        }

        if (hud.isTutorialCraftAwaitClose) {
            const hole = this.uiNodeHole(hud.craftCloseBtnNode());
            if (!hole) return null;
            return { hole, tip: '露穗：关掉工作台继续吧', uiDock: true };
        }

        const btn = hud.craftRecipeBtnNode(FIRST_SEED_RECIPE);
        const hole = this.uiNodeHole(btn);
        if (!hole) return null;
        return { hole, tip: '露穗：点这里制作种子呀', uiDock: true };
    }

    /**
     * Quest 1010: outdoors → enter bld_mayor; indoors → talk to npc_mayor.
     * Off-screen → “往北走”, never a down-arrow on clinic.
     */
    private resolveMayorGuide(): IdleGuide | null {
        const npc = this.farm?.findWorldNode('npc_mayor') ?? null;
        if (npc) {
            const pos = this.stickyWorldPos('mayor', {
                x: npc.position.x,
                y: npc.position.y + 36,
            });
            return this.worldPosGuide(
                pos,
                '点镇长·艾岚打招呼',
                '走近镇长·艾岚，再点一下',
            );
        }
        const bld = this.farm?.findWorldNode('bld_mayor') ?? null;
        if (!bld) {
            const q = this.questHole();
            if (!q) return null;
            return { hole: q, tip: '任务：去北区镇长府进屋拜访', uiDock: true };
        }
        // Door feet — building sprite center sits too high and reads as “clinic”.
        const pos = this.stickyWorldPos('mayor', {
            x: bld.position.x,
            y: bld.position.y + 20,
        });
        return this.worldPosGuide(
            pos,
            '点镇长府大门进屋',
            '往北走到镇长府，点大门进屋',
        );
    }

    /**
     * Quest 1009: off-screen gate → right-edge walk cue; on-screen → tap the sign.
     */
    private resolveTownGateGuide(): IdleGuide | null {
        const node = this.farm?.findWorldNode('portal_town') ?? null;
        const raw = node
            ? { x: node.position.x, y: node.position.y + 40 }
            : { x: StoryWorldHooks.farmPortalPos().x, y: StoryWorldHooks.farmPortalPos().y + 40 };
        const pos = this.stickyWorldPos('town-gate', raw);
        return this.worldPosGuide(
            pos,
            '露穗：点路牌去微光溪谷镇吧',
            '露穗：往右走，去东侧路牌呀',
        );
    }

    /**
     * Fishing quest chain: equip rod → walk toward pier (edge arrow if off-screen)
     * → tap lake water to cast. Never falls back to the quest chip alone.
     */
    private resolveFishGuide(tool: string | undefined): IdleGuide | null {
        if (tool !== 'rod') {
            this.clearStickyTarget();
            const slotHole = this.toolSlotHole('rod') ?? this.toolSlotHoleFallback('rod');
            if (!slotHole) return null;
            // Caption on — first fishing step is easy to miss with a silent hotbar arrow.
            return { hole: slotHole, tip: '露穗：先点下方「鱼竿」哦', uiDock: true };
        }

        const target = this.fishGuideTarget();
        if (this.farm?.isBusy) {
            return this.worldPosGuide(target.pos, '露穗：走到钓点就会抛竿啦', '露穗：往西边码头走，再点湖面～');
        }
        if (target.near) {
            const guide = this.worldPosGuide(
                target.pos,
                '露穗：点湖面抛竿呀',
                '露穗：往西边码头走，再点湖面～',
            );
            // On-screen tap aim → ground ripple; edge chevron (walk) keeps arrow only.
            if (guide && !guide.uiDock && (guide.arrowDeg ?? 0) === 0) {
                guide.groundRipple = true;
                guide.rippleWorld = target.pos;
            }
            return guide;
        }
        return this.worldPosGuide(target.pos, '露穗：跟着箭头走到湖边码头', '露穗：往西边码头走，再点湖面～');
    }

    /** Always the fixed lake-water tip by the pier — never retarget (avoids bounce). */
    private fishGuideTarget(): { pos: WorldPos; near: boolean } {
        const hint = FarmWorldLayout.fishingHintWorld();
        const pos = this.stickyWorldPos('fish', hint);
        const player = this.farm?.player;
        if (!player?.isValid) return { pos, near: false };
        const dist = Math.hypot(player.position.x - hint.x, player.position.y - hint.y);
        return { pos, near: dist <= FISH_NEAR_RANGE };
    }

    /** Hold a fixed world point briefly (pier / portal) so the edge arrow stays put. */
    private stickyWorldPos(key: string, pos: WorldPos): WorldPos {
        const now = Date.now();
        if (
            this._stickyKey === key &&
            this._stickyPos &&
            now < this._stickyUntil
        ) {
            const dx = pos.x - this._stickyPos.x;
            const dy = pos.y - this._stickyPos.y;
            if (dx * dx + dy * dy <= STICKY_SWITCH_SQ) return this._stickyPos;
        }
        this._stickyKey = key;
        this._stickyNode = null;
        this._stickyPos = pos;
        this._stickyUntil = now + STICKY_MS;
        return pos;
    }

    /**
     * Target off the playfield → edge chevron pointing that way.
     * Vertical off-screen must NOT clamp a down-arrow onto a wrong building
     * (e.g. mayor north of camera looked like “click the clinic”).
     */
    private offscreenEdgeGuide(hole: HoleRect, tip: string): IdleGuide {
        const band = this.playfieldBand();
        const inX = hole.x >= band.x0 && hole.x <= band.x1;
        if (inX) {
            const above = hole.y > band.y1;
            const walkTip = tip.includes('走')
                ? tip
                : above
                  ? '跟着箭头往北走，靠近了再动手'
                  : '跟着箭头往南走，靠近了再动手';
            return {
                hole: {
                    x: Math.max(band.x0 + 56, Math.min(band.x1 - 56, hole.x)),
                    y: above ? band.y1 - 56 : band.y0 + 56,
                    w: 80,
                    h: 80,
                },
                tip: walkTip,
                uiDock: false,
                arrowDeg: above ? 180 : 0,
            };
        }

        const goRight = hole.x > (band.x0 + band.x1) * 0.5;
        let y = Math.max(band.y0 + 80, Math.min(band.y1 - 80, hole.y));
        const player = this.farm?.player;
        if (player?.isValid) {
            const ph = this.worldPosHole({ x: player.position.x, y: player.position.y });
            if (ph) y = Math.max(band.y0 + 80, Math.min(band.y1 - 80, ph.y));
        }
        if (goRight) {
            return {
                hole: { x: band.x1 - 56, y, w: 80, h: 80 },
                tip: tip.includes('走') ? tip : '跟着箭头往右走，靠近了再动手',
                uiDock: false,
                arrowDeg: 90,
            };
        }
        return {
            hole: { x: band.x0 + 56, y, w: 80, h: 80 },
            tip: tip.includes('走') ? tip : '跟着箭头往左走，靠近了再动手',
            uiDock: false,
            arrowDeg: -90,
        };
    }

    /**
     * Sticky plot aim — hold the same tile briefly so nearest-picking can't
     * thrash the arrow between two equal-distance plots.
     */
    private stickyPlotPos(
        need: 'soil' | 'tilled' | 'water' | 'grow' | 'harvest',
    ): WorldPos | null {
        const key = `plot:${need}`;
        const now = Date.now();
        const fresh = this.farm?.hintPlotPos(need) ?? null;
        if (!fresh) {
            if (this._stickyKey === key) this.clearStickyTarget();
            return null;
        }
        if (this._stickyKey === key && this._stickyPos && now < this._stickyUntil) {
            const dx = fresh.x - this._stickyPos.x;
            const dy = fresh.y - this._stickyPos.y;
            if (dx * dx + dy * dy <= STICKY_SWITCH_SQ) return this._stickyPos;
        }
        this._stickyKey = key;
        this._stickyNode = null;
        this._stickyPos = fresh;
        this._stickyUntil = now + STICKY_MS;
        return fresh;
    }

    private gotoStep(step: GuideStep) {
        this._step = step;
        this.applyStep();
    }

    private applyStep() {
        // Forced hollow guide — lock stick / world taps for every step (incl. grass).
        InputBridge.uiBlocking = true;
        InputBridge.clear();

        if (this._step === 'grass') {
            this._grassTarget = this.pickHintGrass() ?? this.farm?.nearestGrass() ?? null;
            const q = this.quests?.activeQuest;
            this._grassBase = q ? this.quests!.progressOf(q).current : 0;
        }

        if (this._tipLab) {
            if (this._step === 'quest') this._tipLab.string = '露穗：看这里呀 · 点一下继续';
            else if (this._step === 'hand') this._tipLab.string = '露穗：先点下方「手」哦';
            else this._tipLab.string = this.grassStepTip();
        }
        this.refreshHole();
        this.paint();
        this.layoutChrome(true);
    }

    private grassStepTip(): string {
        const q = this.quests?.activeQuest;
        if (q?.id === 1001) {
            const p = this.quests!.progressOf(q);
            const left = Math.max(1, p.target - p.current);
            return left > 1
                ? `露穗：点镂空处拔草呀（还剩 ${left} 棵）`
                : '露穗：最后一棵啦，轻轻拔掉～';
        }
        return '露穗：走近杂草，点镂空处拔掉哦';
    }

    private checkGrassDone() {
        if (this._step !== 'grass' || !this._open) return;
        const q = this.quests?.activeQuest;
        // Quest 1001: keep the hollow until all 3 weeds are pulled.
        if (q?.id === 1001 && this.quests) {
            const prog = this.quests.progressOf(q);
            if (
                prog.current >= prog.target ||
                this.quests.isAwaitingClaim ||
                this.quests.isCompleted(1001)
            ) {
                this.finish();
                return;
            }
            if (!this._grassTarget?.isValid || prog.current > this._grassBase) {
                this._grassBase = prog.current;
                this.clearStickyTarget();
                this._grassTarget = this.pickHintGrass() ?? this.farm?.nearestGrass() ?? null;
                if (this._tipLab) this._tipLab.string = this.grassStepTip();
            }
            return;
        }
        if (q && this.quests!.progressOf(q).current > this._grassBase) {
            this.finish();
            return;
        }
        if (this._grassTarget && !this._grassTarget.isValid) {
            this.finish();
        }
    }

    private refreshHole() {
        if (this._step === 'quest') {
            this._hole = this.questHole() ?? { x: -120, y: -620, w: 560, h: 140 };
            return;
        }
        if (this._step === 'hand') {
            this._hole = this.handHole() ?? { x: -450, y: -860, w: 160, h: 160 };
            return;
        }
        if (!this._grassTarget?.isValid) {
            this._grassTarget = this.pickHintGrass() ?? this.farm?.nearestGrass() ?? null;
        }
        this._hole =
            this.worldNodeHole(this._grassTarget) ??
            this.questHole() ?? {
                x: 0,
                y: 80,
                w: 100,
                h: 100,
            };
    }

    private questHole(): HoleRect | null {
        const dock = this.node.getChildByName('QuestHud');
        if (!dock?.active) return null;
        const btn = dock.getChildByName('QuestBtn');
        const bar = dock.getChildByName('QuestTracker');
        if (!btn?.isValid || !bar?.isValid) return null;
        const a = this.uiNodeHole(btn);
        const b = this.uiNodeHole(bar);
        if (!a || !b) return null;
        const x0 = Math.min(a.x - a.w * 0.5, b.x - b.w * 0.5);
        const x1 = Math.max(a.x + a.w * 0.5, b.x + b.w * 0.5);
        const y0 = Math.min(a.y - a.h * 0.5, b.y - b.h * 0.5);
        const y1 = Math.max(a.y + a.h * 0.5, b.y + b.h * 0.5);
        return { x: (x0 + x1) * 0.5, y: (y0 + y1) * 0.5, w: x1 - x0, h: y1 - y0 };
    }

    private handHole(): HoleRect | null {
        return this.toolSlotHole('hand');
    }

    private toolSlotHole(itemId: string): HoleRect | null {
        const fromHud = this.node.getComponent(FarmHUD)?.hotbarSlotNode(itemId) ?? null;
        if (fromHud) return this.uiNodeHole(fromHud);
        const bar = this.node.getChildByName('FarmHotbar');
        if (!bar?.active) return null;
        const slot =
            bar.getChildByName(`Slot_${itemId}`) ??
            bar.children.find((c) => c.name === `Slot_${itemId}` || c.name.startsWith(`Slot_${itemId}`)) ??
            null;
        return this.uiNodeHole(slot);
    }

    private bagHole(): HoleRect | null {
        const bar = this.node.getChildByName('FarmHotbar');
        if (!bar?.active) return null;
        return this.uiNodeHole(bar.getChildByName('BagBtn'));
    }

    /** Canvas-local AABB of a UI node (handles parent offsets / anchors). */
    private uiNodeHole(node: Node | null): HoleRect | null {
        if (!node?.isValid) return null;
        const ui = node.getComponent(UITransform);
        const canvasUi = this.node.getComponent(UITransform);
        if (!ui || !canvasUi) return null;
        const w = ui.contentSize.width;
        const h = ui.contentSize.height;
        const ax = ui.anchorX;
        const ay = ui.anchorY;
        // Corners in node local space → canvas local.
        const corners = [
            new Vec3(-w * ax, -h * ay, 0),
            new Vec3(w * (1 - ax), -h * ay, 0),
            new Vec3(-w * ax, h * (1 - ay), 0),
            new Vec3(w * (1 - ax), h * (1 - ay), 0),
        ];
        let x0 = Infinity;
        let y0 = Infinity;
        let x1 = -Infinity;
        let y1 = -Infinity;
        const world = new Vec3();
        const local = new Vec3();
        for (let i = 0; i < corners.length; i++) {
            ui.convertToWorldSpaceAR(corners[i]!, world);
            canvasUi.convertToNodeSpaceAR(world, local);
            if (local.x < x0) x0 = local.x;
            if (local.y < y0) y0 = local.y;
            if (local.x > x1) x1 = local.x;
            if (local.y > y1) y1 = local.y;
        }
        return { x: (x0 + x1) * 0.5, y: (y0 + y1) * 0.5, w: x1 - x0, h: y1 - y0 };
    }

    /**
     * World actor → canvas-local hole via UITransform (matches CameraFollow snap).
     * Manual world.position math can lag a frame and land the hollow beside the weed.
     */
    private worldNodeHole(node: Node | null): HoleRect | null {
        if (!node?.isValid) return null;
        const ui = node.getComponent(UITransform);
        const canvasUi = this.node.getComponent(UITransform);
        if (!ui || !canvasUi) return null;
        const w = ui.contentSize.width;
        const h = ui.contentSize.height;
        const ax = ui.anchorX;
        const ay = ui.anchorY;
        // Sprite body center (feet-anchored decor sits above the foot).
        this._worldPt.set(w * (0.5 - ax), h * (0.5 - ay), 0);
        ui.convertToWorldSpaceAR(this._worldPt, this._worldPt);
        canvasUi.convertToNodeSpaceAR(this._worldPt, this._localPt);
        const s = Math.max(0.0001, this.farm?.world?.scale.x ?? 1);
        return {
            x: this._localPt.x,
            y: this._localPt.y,
            w: Math.max(88, w * s + 28),
            h: Math.max(88, h * s + 28),
        };
    }

    private worldPosHole(pos: { x: number; y: number } | null): HoleRect | null {
        if (!pos || !this.farm?.world?.isValid) return null;
        const world = this.farm.world;
        const canvasUi = this.node.getComponent(UITransform);
        if (!canvasUi) return null;
        // World-local point → canvas via the World node's UITransform when present.
        const worldUi = world.getComponent(UITransform);
        if (worldUi) {
            this._worldPt.set(pos.x, pos.y, 0);
            worldUi.convertToWorldSpaceAR(this._worldPt, this._worldPt);
            canvasUi.convertToNodeSpaceAR(this._worldPt, this._localPt);
            return { x: this._localPt.x, y: this._localPt.y, w: 96, h: 96 };
        }
        const s = Math.max(0.0001, world.scale.x);
        return {
            x: world.position.x + pos.x * s,
            y: world.position.y + pos.y * s,
            w: 96,
            h: 96,
        };
    }

    private paint() {
        const g = this._dimG;
        const ring = this._ringG;
        if (!g || !ring) return;
        const { halfW, halfH } = this.canvasHalf();
        const { x0: hx0, y0: hy0, x1: hx1, y1: hy1 } = this.fittedHole(halfW, halfH);

        g.clear();
        g.fillColor = new Color(10, 8, 6, DIM_A);
        // Four panels around the hollow.
        const topH = halfH - hy1;
        if (topH > 0) {
            g.rect(-halfW, hy1, halfW * 2, topH);
            g.fill();
        }
        const botH = hy0 - -halfH;
        if (botH > 0) {
            g.rect(-halfW, -halfH, halfW * 2, botH);
            g.fill();
        }
        const midH = hy1 - hy0;
        if (midH > 0) {
            const leftW = hx0 - -halfW;
            if (leftW > 0) {
                g.rect(-halfW, hy0, leftW, midH);
                g.fill();
            }
            const rightW = halfW - hx1;
            if (rightW > 0) {
                g.rect(hx1, hy0, rightW, midH);
                g.fill();
            }
        }

        ring.clear();
        const rw = Math.max(8, hx1 - hx0);
        const rh = Math.max(8, hy1 - hy0);
        ring.strokeColor = new Color(255, 220, 120, 255);
        ring.lineWidth = 5;
        ring.roundRect(hx0, hy0, rw, rh, 18);
        ring.stroke();
        // Soft outer glow — also kept inside the portrait frame.
        const gx0 = Math.max(-halfW + 1, hx0 - 4);
        const gy0 = Math.max(-halfH + 1, hy0 - 4);
        const gx1 = Math.min(halfW - 1, hx1 + 4);
        const gy1 = Math.min(halfH - 1, hy1 + 4);
        ring.strokeColor = new Color(255, 244, 180, 90);
        ring.lineWidth = 8;
        ring.roundRect(gx0, gy0, gx1 - gx0, gy1 - gy0, 22);
        ring.stroke();
    }

    /**
     * Fit the hollow inside the portrait frame while keeping its center on the
     * target. Edge slots (hand) shrink padding evenly — never drift off-target.
     */
    private fittedHole(halfW: number, halfH: number) {
        const pad = HOLE_PAD;
        const minX = -halfW + 2;
        const maxX = halfW - 2;
        const minY = -halfH + 2;
        const maxY = halfH - 2;
        const cx = this._hole.x;
        const cy = this._hole.y;
        let hw = this._hole.w * 0.5 + pad;
        let hh = this._hole.h * 0.5 + pad;
        hw = Math.min(hw, Math.max(4, cx - minX), Math.max(4, maxX - cx));
        hh = Math.min(hh, Math.max(4, cy - minY), Math.max(4, maxY - cy));
        hw = Math.max(4, hw);
        hh = Math.max(4, hh);
        return { x0: cx - hw, y0: cy - hh, x1: cx + hw, y1: cy + hh };
    }

    private layoutChrome(withTip: boolean) {
        const tip = this._tipRoot;
        const finger = this._finger;
        if (!finger) return;
        const pad = HOLE_PAD;
        const top = this._hole.y + this._hole.h * 0.5 + pad;
        const bot = this._hole.y - this._hole.h * 0.5 - pad;
        const { halfW, halfH } = this.canvasHalf();

        // Drag demo: finger + ghost travel bag → hotbar (click bob is not enough).
        if (!this._open && this._idleOn && this._idleDragTo) {
            this.layoutDragDemo(halfW, halfH);
            return;
        }
        this.clearDragDemoChrome();

        // Big chevron sits centered above the target and bobs into it.
        // Bob AFTER clamp — claim / dock targets pin to the playfield floor and
        // would otherwise eat the sine offset every frame.
        const arrowDeg = this._idleOn ? this._idleArrowDeg : 0;
        const band = this.playfieldBand();
        // Quest / hand / claim / tool-swap sit in the bottom dock — don't force playfield band.
        const uiDock =
            (this._open && (this._step === 'quest' || this._step === 'hand')) ||
            (!this._open && this._idleOn && this._idleUiDock);
        const bob = Math.sin(Date.now() * 0.01) * 12;
        let fx = this._hole.x;
        let fy: number;
        if (arrowDeg === 90) {
            // Point east: sit left of the aim and bob into +X.
            fx = this._hole.x - 48;
            fy = this._hole.y;
        } else if (arrowDeg === -90) {
            // Point west: sit right of the aim and bob into -X.
            fx = this._hole.x + 48;
            fy = this._hole.y;
        } else if (arrowDeg === 180) {
            // Point north: sit below the aim and bob into +Y.
            fy = this._hole.y - 48;
        } else {
            // Point south / UI dock: sit above the aim.
            fy = this._idleSilent ? top + 40 : top + 56;
        }
        if (uiDock) {
            fx = Math.max(-halfW + 40, Math.min(halfW - 40, fx));
            fy = Math.max(-halfH + 80, Math.min(halfH - 50, fy));
        } else {
            fx = Math.max(band.x0 + 40, Math.min(band.x1 - 40, fx));
            fy = Math.max(band.y0 + 50, Math.min(band.y1 - 20, fy));
        }
        if (arrowDeg === 90) {
            finger.setPosition(fx + bob, fy, 0);
        } else if (arrowDeg === -90) {
            finger.setPosition(fx - bob, fy, 0);
        } else if (arrowDeg === 180) {
            finger.setPosition(fx, fy + bob, 0);
        } else {
            finger.setPosition(fx, fy + bob, 0);
        }
        finger.setRotationFromEuler(0, 0, arrowDeg);

        if (withTip && tip) {
            const tipHalfW = TIP_W * 0.5;
            const tipHalfH = TIP_H * 0.5;
            const minX = -halfW + SCREEN_INSET + tipHalfW;
            const maxX = halfW - SCREEN_INSET - tipHalfW;
            const minY = -halfH + SCREEN_INSET + tipHalfH;
            const maxY = halfH - SCREEN_INSET - tipHalfH;

            let tipY: number;
            if (arrowDeg === 180) {
                // Up-chevron at screen top — banner sits under the stem.
                const arrowBot = fy - ARROW_EXTENT_UP - 12;
                tipY = arrowBot - tipHalfH - TIP_ARROW_GAP;
            } else {
                // Sit the banner above the chevron stem (not through its middle).
                const arrowTop = fy + ARROW_EXTENT_UP + 12;
                tipY = arrowTop + tipHalfH + TIP_ARROW_GAP;
                if (tipY > maxY) tipY = bot - tipHalfH - TIP_ARROW_GAP;
            }
            tipY = Math.max(minY, Math.min(maxY, tipY));

            // Clamp X — left dock targets (quest / hand) must not shove the tip off-frame.
            const tipX = Math.max(minX, Math.min(maxX, this._hole.x));
            tip.setPosition(tipX, tipY, 0);
            // Tip after Finger so text never sits under the arrow.
            tip.setSiblingIndex(Math.max(finger.getSiblingIndex() + 1, tip.getSiblingIndex()));
        }
    }

    /**
     * Loop: press on bag item → drag down to empty hotbar → release → reset.
     * Ghost item + dashed path make the gesture read as drag, not tap.
     */
    private layoutDragDemo(halfW: number, halfH: number) {
        const finger = this._finger;
        const dest = this._idleDragTo;
        if (!finger || !dest) return;

        const fromX = this._hole.x;
        const fromY = this._hole.y;
        const toX = dest.x;
        const toY = dest.y;
        const u = this.dragDemoProgress();
        const px = fromX + (toX - fromX) * u;
        const py = fromY + (toY - fromY) * u;
        const clampX = (x: number) => Math.max(-halfW + 40, Math.min(halfW - 40, x));
        const clampY = (y: number) => Math.max(-halfH + 60, Math.min(halfH - 50, y));

        this.paintDragTrail(fromX, fromY, toX, toY, u);

        if (this._dragGhost) {
            this._dragGhost.active = true;
            this._dragGhost.setPosition(clampX(px), clampY(py), 0);
            if (this._dragGhostOp) {
                // Fade while resetting to the bag cell.
                const phase = (Date.now() % DRAG_DEMO_MS) / DRAG_DEMO_MS;
                this._dragGhostOp.opacity = phase > 0.88 ? Math.round(255 * (1 - (phase - 0.88) / 0.12)) : 220;
            }
            // Keep ghost under the chevron.
            if (this._trailN) this._dragGhost.setSiblingIndex(this._trailN.getSiblingIndex() + 1);
            finger.setSiblingIndex(this._dragGhost.getSiblingIndex() + 1);
        }

        // Chevron rides just above the dragged icon (points into the drop slot).
        finger.setPosition(clampX(px), clampY(py) + 52, 0);
        finger.setScale(1, 1, 1);
    }

    /** 0 = grab on bag, 1 = drop on hotbar. Holds at ends; snaps back after drop. */
    private dragDemoProgress(): number {
        const t = (Date.now() % DRAG_DEMO_MS) / DRAG_DEMO_MS;
        if (t < 0.14) return 0;
        if (t < 0.72) {
            const p = (t - 0.14) / 0.58;
            // Smoothstep — reads as a finger pull, not a teleport.
            return p * p * (3 - 2 * p);
        }
        if (t < 0.88) return 1;
        return 1;
    }

    private paintDragTrail(x0: number, y0: number, x1: number, y1: number, u: number) {
        const g = this._trailG;
        const n = this._trailN;
        if (!g || !n) return;
        n.active = true;
        g.clear();
        const dx = x1 - x0;
        const dy = y1 - y0;
        const len = Math.hypot(dx, dy) || 1;
        const nx = dx / len;
        const ny = dy / len;
        const dash = 18;
        const gap = 12;
        const gold = new Color(255, 220, 90, 200);
        const dim = new Color(255, 220, 90, 70);
        let d = 0;
        while (d < len) {
            const a0 = d;
            const a1 = Math.min(len, d + dash);
            const mid = (a0 + a1) * 0.5 / len;
            g.strokeColor = mid <= u + 0.02 ? gold : dim;
            g.lineWidth = 5;
            g.moveTo(x0 + nx * a0, y0 + ny * a0);
            g.lineTo(x0 + nx * a1, y0 + ny * a1);
            g.stroke();
            d += dash + gap;
        }
        // Drop-slot ring so the destination isn't only implied by the tip text.
        const dw = Math.max(96, this._idleDragTo?.w ?? 120) + 12;
        const dh = Math.max(96, this._idleDragTo?.h ?? 120) + 12;
        g.strokeColor = new Color(255, 220, 120, 220);
        g.lineWidth = 4;
        g.roundRect(x1 - dw * 0.5, y1 - dh * 0.5, dw, dh, 16);
        g.stroke();
    }

    private clearDragDemoChrome() {
        if (this._trailG) this._trailG.clear();
        if (this._trailN) this._trailN.active = false;
        if (this._dragGhost) this._dragGhost.active = false;
        if (this._dragGhostOp) this._dragGhostOp.opacity = 220;
    }

    private ensureDragGhostFrame(itemId: string) {
        const sp = this._dragGhostSp;
        if (!sp?.isValid || !itemId) return;
        if (sp.node.name === `Ghost_${itemId}` && sp.spriteFrame) return;
        const uuid = (TOOL_FRAMES as Record<string, string>)[itemId];
        if (!uuid) return;
        sp.node.name = `Ghost_${itemId}`;
        assetManager.loadAny({ uuid }, (err, asset) => {
            if (err || !asset || !sp.isValid) return;
            if (this._idleDragItem !== itemId) return;
            sp.spriteFrame = asset as SpriteFrame;
        });
    }

    /** Canvas band between info board (top) and hotbar (bottom). */
    private playfieldBand() {
        const { halfW, halfH } = this.canvasHalf();
        return {
            x0: -halfW + 48,
            x1: halfW - 48,
            y0: ARROW_UI_FLOOR,
            y1: halfH - ARROW_TOP_RESERVE,
        };
    }

    private isInPlayfield(hole: HoleRect): boolean {
        const b = this.playfieldBand();
        // Also keep clear of the top-right info-board corner.
        if (hole.x > 80 && hole.y > b.y1 - 80) return false;
        return hole.x >= b.x0 && hole.x <= b.x1 && hole.y >= b.y0 && hole.y <= b.y1;
    }

    /**
     * Sticky weed aim for quest 1001 / HintGrass.
     * Priority: baked `*_tut_*` cluster → front-yard band → near → any.
     * Never aim at weeds inside the cottage body.
     */
    private pickHintGrass(): Node | null {
        const farm = this.farm;
        if (!farm?.player) return null;
        const tut = farm.listTutorialGrass();
        const list = tut.length ? tut : farm.listGrass();
        if (!list.length) {
            if (this._stickyKey === 'grass') this.clearStickyTarget();
            return null;
        }
        const px = farm.player.position.x;
        const py = farm.player.position.y;
        const rangeSq = GRASS_HINT_RANGE * GRASS_HINT_RANGE;
        let bestTut: Node | null = null;
        let bestTutSq = Number.POSITIVE_INFINITY;
        let bestYard: Node | null = null;
        let bestYardSq = Number.POSITIVE_INFINITY;
        let bestNear: Node | null = null;
        let bestNearSq = Number.POSITIVE_INFINITY;
        let bestAny: Node | null = null;
        let bestAnySq = Number.POSITIVE_INFINITY;
        for (let i = 0; i < list.length; i++) {
            const n = list[i]!;
            const nx = n.position.x;
            const ny = n.position.y;
            // Cottage body — skip (arrow used to land mid-house after east-road clear).
            if (Math.abs(nx - 220) <= 110 && ny >= 376 && ny <= 640) continue;
            const dx = nx - px;
            const dy = ny - py;
            const dSq = dx * dx + dy * dy;
            if (dSq < bestAnySq) {
                bestAnySq = dSq;
                bestAny = n;
            }
            if (dSq <= rangeSq && dSq < bestNearSq) {
                bestNearSq = dSq;
                bestNear = n;
            }
            if (n.name.includes('_tut_') && dSq < bestTutSq) {
                bestTutSq = dSq;
                bestTut = n;
            }
            if (
                nx >= YARD_GRASS.x0 &&
                nx <= YARD_GRASS.x1 &&
                ny >= YARD_GRASS.y0 &&
                ny <= YARD_GRASS.y1 &&
                dSq < bestYardSq
            ) {
                bestYardSq = dSq;
                bestYard = n;
            }
        }
        const fresh = bestTut ?? bestYard ?? bestNear ?? bestAny;
        if (!fresh) return null;

        const key = 'grass';
        const now = Date.now();
        if (
            this._stickyKey === key &&
            this._stickyNode?.isValid &&
            now < this._stickyUntil
        ) {
            // Drop sticky if the locked weed was pulled / invalidated.
            const stickyStill = list.includes(this._stickyNode);
            if (stickyStill) {
                const sx = this._stickyNode.position.x - px;
                const sy = this._stickyNode.position.y - py;
                const stickySq = sx * sx + sy * sy;
                const rivalSq =
                    bestTutSq < Number.POSITIVE_INFINITY
                        ? bestTutSq
                        : bestYardSq < Number.POSITIVE_INFINITY
                          ? bestYardSq
                          : bestNearSq;
                if (rivalSq + STICKY_SWITCH_SQ >= stickySq || !(bestTut ?? bestYard ?? bestNear)) {
                    return this._stickyNode;
                }
            }
        }
        this._stickyKey = key;
        this._stickyNode = fresh;
        this._stickyPos = { x: fresh.position.x, y: fresh.position.y };
        this._stickyUntil = now + STICKY_MS;
        return fresh;
    }

    private hitHole(lx: number, ly: number): boolean {
        const pad = HOLE_PAD + 8;
        const hw = this._hole.w * 0.5 + pad;
        const hh = this._hole.h * 0.5 + pad;
        return Math.abs(lx - this._hole.x) <= hw && Math.abs(ly - this._hole.y) <= hh;
    }

    private uiToCanvasLocal(uiX: number, uiY: number) {
        const { halfW, halfH } = this.canvasHalf();
        return { x: uiX - halfW, y: uiY - halfH };
    }

    private canvasHalf() {
        const ui = this.node.getComponent(UITransform);
        const vis = view.getVisibleSize();
        return {
            halfW: (ui?.contentSize.width || vis.width) * 0.5,
            halfH: (ui?.contentSize.height || vis.height) * 0.5,
        };
    }

    private build() {
        const canvas = this.node;
        const old = canvas.getChildByName('TutorialGuideRoot');
        if (old) old.destroy();

        const root = new Node('TutorialGuideRoot');
        root.layer = canvas.layer;
        root.setParent(canvas);
        root.addComponent(UITransform).setContentSize(10, 10);
        this._rootOp = root.addComponent(UIOpacity);
        this._rootOp.opacity = 0;
        this._root = root;

        const dim = new Node('Dim');
        dim.layer = canvas.layer;
        dim.setParent(root);
        dim.addComponent(UITransform).setContentSize(10, 10);
        this._dimN = dim;
        this._dimG = dim.addComponent(Graphics);

        const ring = new Node('Ring');
        ring.layer = canvas.layer;
        ring.setParent(root);
        ring.addComponent(UITransform).setContentSize(10, 10);
        this._ringN = ring;
        this._ringG = ring.addComponent(Graphics);

        const trail = new Node('DragTrail');
        trail.layer = canvas.layer;
        trail.setParent(root);
        trail.addComponent(UITransform).setContentSize(10, 10);
        trail.active = false;
        this._trailN = trail;
        this._trailG = trail.addComponent(Graphics);

        const ghost = new Node('DragGhost');
        ghost.layer = canvas.layer;
        ghost.setParent(root);
        ghost.addComponent(UITransform).setContentSize(DRAG_GHOST, DRAG_GHOST);
        ghost.active = false;
        const ghostSp = ghost.addComponent(Sprite);
        ghostSp.sizeMode = Sprite.SizeMode.CUSTOM;
        ghostSp.trim = false;
        this._dragGhostOp = ghost.addComponent(UIOpacity);
        this._dragGhostOp.opacity = 220;
        this._dragGhost = ghost;
        this._dragGhostSp = ghostSp;

        const finger = new Node('Finger');
        finger.layer = canvas.layer;
        finger.setParent(root);
        finger.addComponent(UITransform).setContentSize(96, 96);
        const sp = finger.addComponent(Sprite);
        sp.sizeMode = Sprite.SizeMode.CUSTOM;
        sp.trim = false;
        // Fallback Graphics until AI arrow SpriteFrame resolves.
        const fg = finger.addComponent(Graphics);
        this.paintFingerFallback(fg);
        this._finger = finger;
        this.loadQuestArrow(sp, fg);

        // Tip after Finger so the caption always draws above the chevron.
        const tip = new Node('Tip');
        tip.layer = canvas.layer;
        tip.setParent(root);
        tip.addComponent(UITransform).setContentSize(TIP_W, TIP_H);
        const tipBg = tip.addComponent(Graphics);
        const tw = TIP_W;
        const th = TIP_H;
        tipBg.fillColor = new Color(48, 34, 22, 230);
        tipBg.roundRect(-tw * 0.5, -th * 0.5, tw, th, 14);
        tipBg.fill();
        tipBg.strokeColor = new Color(230, 190, 110, 255);
        tipBg.lineWidth = 3;
        tipBg.roundRect(-tw * 0.5, -th * 0.5, tw, th, 14);
        tipBg.stroke();
        this._tipRoot = tip;

        const tipLabN = new Node('TipLab');
        tipLabN.layer = canvas.layer;
        tipLabN.setParent(tip);
        tipLabN.addComponent(UITransform).setContentSize(TIP_W - 40, TIP_H - 16);
        const tipLab = tipLabN.addComponent(Label);
        styleUiLabel(tipLab, {
            size: 30,
            color: new Color(255, 244, 214, 255),
            outline: true,
            outlineWidth: 2,
        });
        tipLab.horizontalAlign = Label.HorizontalAlign.CENTER;
        tipLab.verticalAlign = Label.VerticalAlign.CENTER;
        tipLab.overflow = Label.Overflow.SHRINK;
        tipLab.string = '';
        this._tipLab = tipLab;
    }

    private loadQuestArrow(sp: Sprite, fallback: Graphics) {
        const uuid = QUEST_FRAMES.questArrow;
        if (!uuid) return;
        assetManager.loadAny({ uuid }, (err, asset) => {
            if (err || !asset || !sp.isValid) return;
            sp.spriteFrame = asset as SpriteFrame;
            fallback.clear();
            fallback.enabled = false;
        });
    }

    /**
     * Pier / lake tap cue — AI ripple locked to the world aim (canvas hole).
     * Only while idle fishing guide asks the player to click the ground.
     */
    private syncGroundRipple() {
        if (!this._idleOn || !this._idleGroundRipple || !this._idleRippleWorld) {
            this.hideGroundRipple();
            return;
        }
        // Prefer live world→UI of the pier tip so the ripple stays on the dock.
        const hole = this.worldPosHole(this._idleRippleWorld) ?? this._hole;
        const n = this.ensureGroundRipple();
        if (!n) return;
        n.active = true;
        n.setPosition(hole.x, hole.y, 0);
        this.pulseGroundRipple();
    }

    private hideGroundRipple() {
        const n = this._rippleN;
        this._ripplePulsing = false;
        if (!n?.isValid) return;
        if (this._rippleOp) Tween.stopAllByTarget(this._rippleOp);
        Tween.stopAllByTarget(n);
        n.active = false;
        n.setScale(1, 1, 1);
        if (this._rippleOp) this._rippleOp.opacity = 0;
    }

    private ensureGroundRipple(): Node | null {
        const root = this._root;
        if (!root?.isValid) return null;
        let n = this._rippleN;
        if (n?.isValid && n.parent === root) return n;
        if (n?.isValid) n.destroy();
        this._ripplePulsing = false;

        n = new Node('FishGroundRipple');
        n.layer = root.layer;
        // Under Finger / Tip so the chevron stays readable.
        n.setParent(root);
        n.setSiblingIndex(0);
        n.active = false;
        const ui = n.addComponent(UITransform);
        ui.setContentSize(140, 140);
        ui.setAnchorPoint(0.5, 0.5);
        const sp = n.addComponent(Sprite);
        sp.sizeMode = Sprite.SizeMode.CUSTOM;
        sp.trim = false;
        const op = n.addComponent(UIOpacity);
        op.opacity = 0;
        this._rippleN = n;
        this._rippleSp = sp;
        this._rippleOp = op;
        this._rippleLoaded = false;
        this.loadGroundRippleFrame();
        return n;
    }

    private loadGroundRippleFrame() {
        const sp = this._rippleSp;
        if (!sp?.isValid || this._rippleLoaded) return;
        const uuid = FISHING_FRAMES.groundRipple;
        if (!uuid) return;
        assetManager.loadAny({ uuid }, (err, asset) => {
            if (err || !asset || !sp.isValid) return;
            sp.spriteFrame = asset as SpriteFrame;
            this._rippleLoaded = true;
        });
    }

    /** Expand + fade loop so the tap spot reads as “click here”. */
    private pulseGroundRipple() {
        const n = this._rippleN;
        const op = this._rippleOp;
        if (!n?.isValid || !op?.isValid || !n.active) return;
        // Already looping — don't restart every lateUpdate frame.
        if (this._ripplePulsing) return;
        this._ripplePulsing = true;
        n.setScale(0.72, 0.72, 1);
        op.opacity = 220;
        tween(n)
            .repeatForever(
                tween(n)
                    .to(1.05, { scale: new Vec3(1.28, 1.28, 1) }, { easing: 'sineOut' })
                    .set({ scale: new Vec3(0.72, 0.72, 1) }),
            )
            .start();
        tween(op)
            .repeatForever(
                tween(op)
                    .to(1.05, { opacity: 70 }, { easing: 'sineOut' })
                    .set({ opacity: 220 }),
            )
            .start();
    }

    /** Temporary flat chevron if the AI sprite is missing. */
    private paintFingerFallback(g: Graphics) {
        g.clear();
        const gold = new Color(255, 220, 90, 255);
        const edge = new Color(70, 42, 16, 255);
        g.fillColor = edge;
        g.moveTo(0, -46);
        g.lineTo(-36, 8);
        g.lineTo(-18, 8);
        g.lineTo(-18, 42);
        g.lineTo(18, 42);
        g.lineTo(18, 8);
        g.lineTo(36, 8);
        g.close();
        g.fill();
        g.fillColor = gold;
        g.moveTo(0, -38);
        g.lineTo(-28, 4);
        g.lineTo(-12, 4);
        g.lineTo(-12, 36);
        g.lineTo(12, 36);
        g.lineTo(12, 4);
        g.lineTo(28, 4);
        g.close();
        g.fill();
    }
}
