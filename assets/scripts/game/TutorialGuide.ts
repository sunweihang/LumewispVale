import {
    _decorator,
    assetManager,
    Color,
    Component,
    Graphics,
    Label,
    Node,
    Prefab,
    Sprite,
    SpriteFrame,
    UIOpacity,
    UITransform,
    Vec3,
    gfx,
    instantiate,
    tween,
    Tween,
} from 'cc';
import { GotoAction } from '../cfg/schema';
import {
    GuideAim,
    GuideAimHost,
    GuideCommonResult,
    GuideDecorKind,
    GuidePlotKind,
} from '../guide/GuideAim';
import { GuideRuntime } from '../guide/GuideRuntime';
import { getCraftRecipes } from './CraftRecipes';
import { ClickMoveMarker } from './ClickMoveMarker';
import { DialoguePanel } from './DialoguePanel';
import { FarmHUD } from './FarmHUD';
import { FarmSystem } from './FarmSystem';
import { FarmWorldLayout } from './FarmWorldLayout';
import { FISHING_FRAMES } from './FishingFrames';
import { FishingMinigame } from './FishingMinigame';
import { GameState } from './GameState';
import { InputBridge } from './InputBridge';
import { itemIcon, itemName } from './ItemCatalog';
import { PlayerController } from './PlayerController';
import { QUEST_FRAMES } from './QuestFrames';
import { QuestPanel } from './QuestPanel';
import { QuestSystem } from './QuestSystem';
import { RewardPopup } from './RewardPopup';
import { StoryIntroPanel } from './StoryIntroPanel';
import { StoryWorldHooks } from './StoryWorldHooks';
import { TownShopPanel } from './TownShopPanel';
import {
    TUTORIAL_GUIDE_LAYOUT as GL,
    TUTORIAL_GUIDE_PREFAB_UUID,
} from './TutorialGuideFrames';
import { portraitVisibleSize } from './PortraitFit';
import { playUiClick } from './UiAudio';
import { applyUiFont, loadUiFont, styleUiLabel } from './UiFont';
import { WorldYSort } from './WorldYSort';

const { ccclass, executionOrder } = _decorator;

const GUIDE_ID = 'guide_wake_yard';
const DIM_A = 150;
const HOLE_PAD = 14;
/** Keep tip / ring inside the portrait frame. */
const SCREEN_INSET = 24;
const TIP_W = GL.tipW;
const TIP_H = GL.tipH;
const FADE_IN = 0.16;
const INPUT_GUARD = 0.35;
/** Keep quest arrows clear of bottom hotbar / quest dock and top info board. */
const ARROW_UI_FLOOR = -560;
/**
 * Soft top inset for the playfield band. Info-board corner is excluded
 * separately — left/civic aims (mayor) must stay on-target when visible.
 */
const ARROW_TOP_RESERVE = 200;
/** Chevron half-height above its node center (sprite / fallback). */
const ARROW_EXTENT_UP = 48;
/** 「点击」label box — tight to glyphs so side/down gaps match. */
const CLICK_LAB_W = 80;
const CLICK_LAB_H = 48;
/** Clearance between chevron base edge and「点击」box edge (all aims). */
const CLICK_LAB_GAP = 20;
/**
 * Place-aim chevron center above the ground-ripple origin.
 * Tip sits ~8px above the ring (96px sprite, tip ≈ center − 48).
 */
const PLACE_ARROW_ABOVE = 56;
/**
 * Ground ripple diameter in World-local px. Canvas size = this × world.scale
 * (World carries fitWorldToDesign / WORLD_ZOOM).
 */
const PLACE_RIPPLE_WORLD = 64;
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
/** Keep the same world target this long so nearest-picking can't thrash the arrow. */
const STICKY_MS = 1800;
/** Prefer the stuck target until a rival is this much closer (world units²). */
const STICKY_SWITCH_SQ = 160 * 160;
/**
 * Extra inset (canvas px) before leaving edge-chevron mode.
 * Stops on-screen ↔ edge thrash when the aim sits on the playfield lip.
 */
const EDGE_HYSTERESIS = 96;
/** Hold the last good idle aim briefly when HUD/world holes flicker on farm boot. */
const LAST_GUIDE_HOLD_MS = 450;
/** World spacing between starlight path dots (denser trail, still pooled). */
const PATH_DOT_STEP = 16;
/**
 * Recompute A* this often while walking. Painted motes re-densify from the
 * live feet every frame using cached waypoints — this only refreshes the corridor.
 */
const PATH_REPATH_MS = 140;
/**
 * Cap path samples (world polyline). High enough that long A* routes still
 * densify through a full playfield (not just the first ~screen of walk).
 */
const PATH_DOT_MAX = 200;
/**
 * Hard cap on live Sprite nodes. When more on-screen samples exist, thin
 * evenly so the trail still spans the whole visible segment.
 */
const PATH_VISIBLE_MAX = 64;
/** Canvas size of each ground mote. */
const PATH_DOT_SIZE = 28;
/**
 * Arc length (world) past the player's nearest path sample before the first mote.
 * Small so stars read as rising from under the feet, not starting mid-path.
 */
const PATH_START_CLEAR = 22;
/** Feet pad (world) — skip samples stacked on the stand point only. */
const PATH_BODY_HW = 16;
const PATH_BODY_DOWN = 10;
const PATH_BODY_UP = 22;

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
     * On-screen click: 0 = from above; 90 = from left (point right);
     * -90 = from right (point left). With edgeWalk: off-screen cue
     * (90 east / -90 west / 180 north; south uses 0 + edgeWalk).
     */
    arrowDeg?: number;
    /** Off-screen「前往xxx」— hide floating finger; starlight path still leads. */
    edgeWalk?: boolean;
    /**
     * Click-aim light ring under the chevron (plots / plants / doors…).
     */
    groundRipple?: boolean;
    /**
     * Parent the ring in World (under plants, over soil). False / omitted =
     * Canvas ring (doors / gates — porch sprites used to bury World rings).
     */
    rippleInWorld?: boolean;
    /** Optional world lock for the chevron (pier / door feet / portal beam). */
    rippleWorld?: WorldPos;
    /** World feet goal for the ground starlight path (player → here). */
    pathWorld?: WorldPos;
};


/**
 * Yard guide after wake_farm (quest+bag HUD unlock fly + idle arrows; spotlight retired):
 * Talk to 露穗 → center icons fly to dock → soft idle arrows for weeds.
 *
 * Also: while a quest is active, keep guiding — wrong tool → yellow click arrow
 * on hotbar; walk-to world aims use a ground starlight path (edge when off-screen).
 *
 * lateUpdate after CameraFollow so world→UI holes match the snapped World pose.
 */
@ccclass('TutorialGuide')
@executionOrder(40)
export class TutorialGuide extends Component implements GuideAimHost {
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
    private _fingerSp: Sprite | null = null;
    /** Graphics chevron on Finger/Fallback — only while SpriteFrame is missing. */
    private _fingerFallback: Graphics | null = null;
    /** Yellow chevron — click prompts (UI dock / tutorial hollow / click-move). */
    private _arrowFrame: SpriteFrame | null = null;
    /** Legacy firefly (kept loaded; walk cues now use ground path dots). */
    private _wispFrame: SpriteFrame | null = null;
    private _guideMode: 'arrow' | 'wisp' = 'arrow';
    /** Dark halo under the edge trail so it pops on bright grass / dirt. */
    private _edgeHaloN: Node | null = null;
    private _edgeHaloG: Graphics | null = null;
    /** Canvas starlight path root (place-ring aims) or world-dot pool parent. */
    private _pathRoot: Node | null = null;
    /**
     * True when live motes are direct World children (`guide_path_dot`) so each
     * footY weaves with props. Soft garden decor is promoted past in WorldYSort.
     */
    private _pathInWorld = false;
    private _pathDots: Node[] = [];
    private _pathDotFrames: SpriteFrame[] = [];
    private _pathFramesLoaded = false;
    private _pathRepathAt = 0;
    /** One-shot World orphan sweep while on canvas trails (hot-reload / stuck ghosts). */
    private _orphanPathSweepDone = false;
    /** Sparse A* corridor (goal-relative); densified from live feet each frame. */
    private _pathWaypoints: WorldPos[] = [];
    private _pathPts: WorldPos[] = [];
    private _pathGoal: WorldPos | null = null;
    private _dragGhost: Node | null = null;
    private _dragGhostSp: Sprite | null = null;
    private _dragGhostOp: UIOpacity | null = null;
    private _trailN: Node | null = null;
    private _trailG: Graphics | null = null;
    private _rootOp: UIOpacity | null = null;
    /** Canvas place-aim ripple under the chevron (doors / gates / pier). */
    private _rippleN: Node | null = null;
    private _rippleOp: UIOpacity | null = null;
    private _rippleSp: Sprite | null = null;
    private _rippleLoaded = false;
    private _ripplePulsing = false;
    /** World-space aim ring (plots / plants) — Y-sorted under actors. */
    private _worldRippleN: Node | null = null;
    private _worldRippleOp: UIOpacity | null = null;
    private _worldRippleSp: Sprite | null = null;
    private _worldRippleLoaded = false;
    private _worldRipplePulsing = false;
    /** 「点击」label on the yellow chevron. */
    private _clickLab: Label | null = null;

    private _open = false;
    private _idleOn = false;
    private _idleUiDock = false;
    private _idleSilent = false;
    private _idleTip = '';
    private _idleDragTo: HoleRect | null = null;
    private _idleDragItem = '';
    /** Idle chevron Z euler; 0 = down, 90 = right. */
    private _idleArrowDeg = 0;
    /** True only for off-screen walk-direction cues (ground path). */
    private _idleEdgeWalk = false;
    private _idleGroundRipple = false;
    private _idleRippleInWorld = false;
    private _idleRippleWorld: WorldPos | null = null;
    private _idlePathWorld: WorldPos | null = null;
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
    /** Latched off-screen chevron — needs a clear re-entry before snapping on-target. */
    private _edgeLatch = false;
    private _edgeGuide: IdleGuide | null = null;
    private _edgeUntil = 0;
    /** Last non-null idle guide — bridges one-frame questHole / world holes on boot. */
    private _lastIdleGuide: IdleGuide | null = null;
    private _lastIdleUntil = 0;
    /** Fishing near/far tip latch (hysteresis around FISH_NEAR_RANGE). */
    private _fishNearLatch = false;
    private readonly _worldPt = new Vec3();
    private readonly _localPt = new Vec3();

    get isOpen() {
        return this._open;
    }

    onLoad() {
        this.build();
        if (this.farm) {
            this.farm.guideHintProvider = () => this.currentGuideHint();
        }
        loadUiFont().then((font) => {
            if (font && this._tipLab) applyUiFont(this._tipLab);
            if (font && this._clickLab) applyUiFont(this._clickLab);
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
            if (this._step === 'quest') return '露穗：点任务打开日志 · 点一下继续';
            if (this._step === 'hand') return '露穗：先点下方「手」';
            return this.grassStepTip();
        }
        if (!this.quests?.activeQuest) return null;
        if (this.node.getComponent(DialoguePanel)?.isOpen) return null;
        if (this.node.getComponent(RewardPopup)?.isOpen) return null;
        const shop = this.node.getComponent(TownShopPanel);
        // Board / buy-sell / post-trade close keep the caption; other shop/info mute it.
        if (
            shop?.isOpen &&
            !shop.isBoardOpen &&
            !shop.needsShopTradeGuide() &&
            !shop.needsShopCloseGuide()
        ) {
            return null;
        }
        const hud = this.node.getComponent(FarmHUD);
        // Craft countdown / deliver fly — no caption nag; player closes when ready.
        if (hud?.isTutorialCraftBusy || hud?.isTutorialCraftAwaitFly) {
            return null;
        }
        if (hud?.isRecipeLearnAwaitFly) {
            return '露穗：新配方飞进背包了';
        }
        // Craft / bag modals normally hide the cue — keep guided craft / bag / learn steps.
        if (
            hud?.isModalOpen &&
            !hud.needsCraftQuestGuide() &&
            !hud.needsBagHotbarGuide() &&
            !hud.needsRecipeLearnGuide()
        ) {
            return null;
        }
        const guide = this.resolveIdleGuideStable();
        if (!guide) return null;
        if (guide.silent) return '';
        return guide.tip;
    }

    onDestroy() {
        this.unschedule(this.enableInput);
        if (this.farm?.guideHintProvider) {
            this.farm.guideHintProvider = null;
        }
        this.farm?.setGatherClearance(null);
        // Live motes parent under World — must destroy before the component dies
        // or remount leaves ghost star trails (multiple lines to the same aim).
        this.hideGroundPath();
        this.releaseAllPathDots();
        if (this._pathRoot?.isValid) this._pathRoot.destroy();
        this._pathRoot = null;
        if (this._open) {
            InputBridge.uiBlocking = false;
        }
    }

    /** Kept for GameBootstrap wiring — quest arrow no longer waits on idle. */
    noteActivity() {
        // no-op: arrow stays visible while a quest is active
    }

    /**
     * After first 露穗 talk: unlock quest + bag HUD (center→badge fly) + idle arrows.
     * No forced 镂空 spotlight — player can walk and pull weeds freely.
     */
    startWakeYardGuide() {
        if (GameState.hasSeenDialogue(GUIDE_ID)) return;
        if ((this.quests?.activeQuest?.id ?? 0) !== 1001) return;
        if (this.quests?.isCompleted(1001)) return;
        GameState.markDialogueSeen(GUIDE_ID);
        this.node.getComponent(FarmHUD)?.playHudUnlockFx();
        this.node.getComponent(QuestPanel)?.revealQuestHud();
        // Soft idle arrow (no dim / hole lock) resumes on the next frame.
        if (this._open) this.dismissSpotlight();
    }

    /**
     * GM: dismiss forced spotlight immediately (marks guide seen, unlocks input).
     * Idle quest arrows resume from the live objective on the next frame.
     */
    dismissSpotlight() {
        GameState.markDialogueSeen(GUIDE_ID);
        this.node.getComponent(QuestPanel)?.revealQuestHud();
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
        if (!this._open) return false;
        // Fade-in guard: still consume (don't walk) but accept hole taps once ready.
        if (!this._inputReady) return true;
        const local = this.uiToCanvasLocal(uiX, uiY);
        const inHole = this.hitHole(local.x, local.y);

        if (this._step === 'quest') {
            // Any tap advances once the tracker is visible.
            playUiClick();
            this.gotoStep('hand');
            return true;
        }

        if (this._step === 'hand') {
            // Accept the painted hollow OR a direct hotbar-hand hit (coord skew).
            if (!inHole && !this.hitUiGuideNode(uiX, uiY, this.handHoleNode())) return true;
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
            // Drop held aim so a long dialogue / loading gate can't revive a stale hole.
            this._lastIdleGuide = null;
            this._lastIdleUntil = 0;
            return;
        }
        // Only arm the arrow here — aim math waits for lateUpdate (after CameraFollow).
        if (!this._idleOn) this.showIdleArrow();
    }

    lateUpdate() {
        // GM modal owns the canvas — park guide chrome until it closes.
        if (InputBridge.gmPanelOpen) {
            if (this._root?.isValid) this._root.active = false;
            return;
        }
        if (this._open) {
            // Re-assert lock each frame — nested UI restore / stale-clear must not
            // re-enable the stick mid-spotlight (hollow would drift with the camera).
            if (!InputBridge.uiBlocking) {
                InputBridge.uiBlocking = true;
                InputBridge.clear();
            }
            if (this._root?.isValid) this._root.active = true;
            this.bringGuideFront();
            this.refreshHole();
            this.paint();
            this.layoutChrome(true);
            if (this._step === 'grass') this.checkGrassDone();
            return;
        }
        if (!this.canShowIdleArrow()) {
            if (this._idleOn) this.hideIdleArrow();
            return;
        }
        this.bringGuideFront();
        const guide = this.resolveIdleGuideStable();
        if (!guide) {
            this.hideIdleArrow();
            return;
        }
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
        if (this._root) this._root.active = true;
        this.layoutChrome(false);
    }

    private show() {
        this._prevBlocking = InputBridge.uiBlocking;
        InputBridge.uiBlocking = true;
        InputBridge.clear();
        this._open = true;
        this._idleOn = false;
        this._inputReady = false;
        GameState.markDialogueSeen(GUIDE_ID);
        // Dock was hidden until this talk — reveal before the quest-tracker spotlight.
        this.node.getComponent(QuestPanel)?.revealQuestHud();
        this.setSpotlightChrome(true);
        if (this._rootOp) this._rootOp.opacity = 0;
        if (this._root) {
            this._root.active = true;
            this.bringGuideFront();
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
        this._idleEdgeWalk = false;
        this._idleGroundRipple = false;
        this._idleRippleInWorld = false;
        this._idleRippleWorld = null;
        this._idlePathWorld = null;
        this.syncClickLabel(false);
        if (this._finger) this._finger.setRotationFromEuler(0, 0, 0);
        this._lastIdleGuide = null;
        this._lastIdleUntil = 0;
        this._fishNearLatch = false;
        this.clearStickyTarget();
        this.clearDragDemoChrome();
        this.hideGroundRipple();
        this.hideGroundPath();
    }

    private canShowIdleArrow(): boolean {
        if (this._open) return false;
        if (!this.quests?.activeQuest) return false;
        // GM modal owns the full canvas — never paint guide chrome over it.
        if (InputBridge.gmPanelOpen) return false;
        // Concrete modals only — do NOT trust InputBridge.uiBlocking (nested
        // reward→dialogue restore can leave it stuck true and kill all arrows).
        if (this.node.getComponent(DialoguePanel)?.isOpen) return false;
        if (this.node.getComponent(RewardPopup)?.isOpen) return false;
        // Skip unlocks moveLocked before the intro fade ends — keep the quest
        // arrow suppressed while StoryIntro is still covering the farm.
        if (this.node.getComponent(StoryIntroPanel)?.isCovering) return false;
        // Quest journal open → still show arrow (points at close so guide never dies).
        if (this.node.getComponent(FishingMinigame)?.isOpen) return false;
        const shop = this.node.getComponent(TownShopPanel);
        // Board accept + shop buy/sell + post-trade close keep the arrow; else hide.
        if (
            shop?.isOpen &&
            !shop.isBoardOpen &&
            !shop.needsShopTradeGuide() &&
            !shop.needsShopCloseGuide()
        ) {
            return false;
        }
        const hud = this.node.getComponent(FarmHUD);
        // Countdown / bag-fly: no click arrow; claim waits until deliver lands.
        if (hud?.isTutorialCraftBusy || hud?.isTutorialCraftAwaitFly) return false;
        if (hud?.isRecipeLearnAwaitFly) return false;
        // Allow arrow over craft / bag hotbar teach / recipe-scroll learn.
        if (
            hud?.isModalOpen &&
            !hud.needsCraftQuestGuide() &&
            !hud.needsBagHotbarGuide() &&
            !hud.needsRecipeLearnGuide()
        ) {
            return false;
        }
        if (InputBridge.moveLocked) return false;
        return true;
    }

    private showIdleArrow() {
        const guide = this.resolveIdleGuideStable();
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
            this.bringGuideFront();
        }
        // Defer layout to lateUpdate so the first paint matches CameraFollow snap.
    }

    /** Guide under active quest Toast so progress text is never covered. */
    private bringGuideFront() {
        if (!this._root?.isValid) return;
        const parent = this.node;
        this._root.setSiblingIndex(parent.children.length - 1);
        const toast = parent.getChildByName('Toast');
        if (toast?.isValid && toast.active) {
            toast.setSiblingIndex(parent.children.length - 1);
        }
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
        this._idleEdgeWalk = false;
        this._idleGroundRipple = false;
        this._idleRippleInWorld = false;
        this._idleRippleWorld = null;
        this._idlePathWorld = null;
        this.syncClickLabel(false);
        if (this._finger) this._finger.setRotationFromEuler(0, 0, 0);
        // Keep sticky aim across brief dialogue / modal hides so the arrow
        // doesn't re-pick a different weed/plot when it comes back.
        this.clearDragDemoChrome();
        this.hideGroundRipple();
        this.hideGroundPath();
        this.syncEdgeHalo(false, 0, 0);
        if (!this._open && this._root) this._root.active = false;
    }

    private clearStickyTarget() {
        this._stickyKey = '';
        this._stickyNode = null;
        this._stickyPos = null;
        this._stickyUntil = 0;
        this._edgeLatch = false;
        this._edgeGuide = null;
        this._edgeUntil = 0;
    }

    /**
     * resolveIdleGuide + short hold so boot / HUD rebuild null frames don't
     * yank the chevron to the quest dock (or hide it) for a single tick.
     * Also keeps a UI-dock cue (bag / claim) from snapping to a world/edge aim
     * when FarmHotbar is inactive for a frame mid-chrome restore.
     */
    private resolveIdleGuideStable(): IdleGuide | null {
        const guide = this.resolveIdleGuide();
        const now = Date.now();
        const prev = this._lastIdleGuide;
        if (guide) {
            if (prev?.uiDock && !guide.uiDock && now < this._lastIdleUntil) {
                // Keep dock aims only while a FarmHUD modal can still thrash holes.
                // After bag/craft/chest dismiss, accept the world aim immediately —
                // otherwise the chevron parks on a dead close-X for ~900ms.
                const hud = this.node.getComponent(FarmHUD);
                if (hud?.isModalOpen) return prev;
            }
            this._lastIdleGuide = guide;
            // Dock aims need a longer bridge — bag↔hotbar thrash is worse than a
            // one-frame world miss.
            this._lastIdleUntil = now + (guide.uiDock ? LAST_GUIDE_HOLD_MS * 2 : LAST_GUIDE_HOLD_MS);
            return guide;
        }
        if (prev && now < this._lastIdleUntil) {
            return prev;
        }
        this._lastIdleGuide = null;
        return null;
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
        this._idleEdgeWalk = !!guide.edgeWalk;
        this._idleGroundRipple = !!guide.groundRipple;
        this._idleRippleInWorld = !!guide.rippleInWorld;
        this._idleRippleWorld = guide.rippleWorld ?? null;
        this._idlePathWorld = guide.pathWorld ?? guide.rippleWorld ?? null;
        if (this._tipLab) this._tipLab.string = guide.tip;
        if (this._idleDragItem) this.ensureDragGhostFrame(this._idleDragItem);
        this.syncGroundRipple();
        this.syncGroundPath();
    }

    /**
     * Mark place aims (doors / gates / pier / signs) for the ground ripple.
     * NPCs and props must not call this — chevron only.
     */
    private withPlaceRipple(guide: IdleGuide | null, world?: WorldPos | null): IdleGuide | null {
        if (!guide || guide.uiDock) return guide;
        if (world) guide.pathWorld = world;
        // Ripple only when the aim is on-target (arrowDeg 0). Edge walks keep path.
        if ((guide.arrowDeg ?? 0) !== 0) return guide;
        guide.groundRipple = true;
        // Canvas ring — World parenting used to hide under porch / facade sprites.
        guide.rippleInWorld = false;
        if (world) guide.rippleWorld = world;
        return guide;
    }

    /** Outdoor enter FX: `bld_mayor` → `door_portal_mayor`. */
    private doorPortalForBuilding(bldName: string): Node | null {
        const kind = bldName.startsWith('bld_') ? bldName.slice(4) : bldName;
        if (!kind) return null;
        return this.farm?.findWorldNode(`door_portal_${kind}`) ?? null;
    }

    /** Indoor leave FX (`door_portal_beam` / ring) shared across rooms. */
    private indoorDoorPortal(): Node | null {
        return (
            this.farm?.findWorldNode('door_portal_beam') ??
            this.farm?.findWorldNode('door_portal_ring') ??
            null
        );
    }

    /**
     * Door / exit place cue. When portal VFX is present, aim the chevron at it
     * and skip the ground ripple — the portal already marks the tap spot.
     */
    private doorPlaceGuide(
        stand: WorldPos,
        tip: string,
        walkTip: string,
        portal: Node | null,
    ): IdleGuide | null {
        if (portal?.isValid) {
            // Mid-beam lock point (portal ay=0, ~144 tall). rippleWorld keeps the
            // chevron glued like place aims; groundRipple stays off so no water ring.
            const aim = {
                x: portal.position.x,
                y: portal.position.y + 40,
            };
            const guide = this.worldOrQuest(this.worldPosHole(aim), tip, walkTip);
            if (!guide || guide.uiDock) return guide;
            guide.pathWorld = stand;
            if ((guide.arrowDeg ?? 0) === 0) {
                guide.rippleWorld = aim;
            }
            return guide;
        }
        return this.withPlaceRipple(this.worldPosGuide(stand, tip, walkTip), stand);
    }

    /** Attach a world feet goal so the starlight path can A* even on edge cues. */
    private withPathWorld(guide: IdleGuide | null, world?: WorldPos | null): IdleGuide | null {
        if (!guide || !world) return guide;
        guide.pathWorld = world;
        return guide;
    }

    private toolSwapTip(tool: string): string {
        const name = itemName(tool, tool);
        return `露穗：换上「${name}」再继续`;
    }

    /** Wrong tool → arrow on that hotbar slot only (no caption, no quest-chip fallback). */
    private toolSwapGuide(tool: string, slot: string): IdleGuide | null {
        const slotHole = this.toolSlotHole(slot);
        if (slotHole) {
            return { hole: slotHole, tip: this.toolSwapTip(tool), uiDock: true, silent: true };
        }
        // Geometric fallback only when the tool is already docked but the slot
        // node is mid-rebuild. Never invent an empty hoe/seeds seat — that used
        // to yank the chevron off the bag during bag→hotbar lessons.
        const hud = this.node.getComponent(FarmHUD);
        if (!hud?.isHotbarBound(slot)) return null;
        const fb = this.toolSlotHoleFallback(slot);
        if (!fb) return null;
        return { hole: fb, tip: this.toolSwapTip(tool), uiDock: true, silent: true };
    }

    /** Match FarmHUD dock layout if the slot node is not ready yet. */
    private toolSlotHoleFallback(itemId: string): HoleRect | null {
        // Slot 0 = hand (locked); 1..6 = hoe/seeds/can/axe/rod/(boost or empty).
        const order = ['hand', 'hoe', 'seeds', 'can', 'axe', 'rod', 'boost'];
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
     * Point at a world hole. Off-screen → edge chevron (not quest dock).
     * Quest dock only when there is truly no world aim.
     */
    private worldOrQuest(hole: HoleRect | null, tip: string, fallbackTip?: string): IdleGuide | null {
        // Recover from a one-frame projection miss (camera / World UITransform).
        if (!hole && this._stickyPos) {
            hole = this.worldPosHole(this._stickyPos);
        }
        if (hole) {
            if (this.isInPlayfieldForMode(hole)) {
                this._edgeLatch = false;
                this._edgeGuide = null;
                this._edgeUntil = 0;
                return { hole, tip, uiDock: false, arrowDeg: 0 };
            }
            this._edgeLatch = true;
            return this.stickEdgeGuide(
                this.offscreenEdgeGuide(hole, fallbackTip ?? tip, this._stickyPos),
            );
        }
        const q = this.questHole();
        if (!q) return null;
        this._edgeLatch = false;
        this._edgeGuide = null;
        this._edgeUntil = 0;
        return { hole: q, tip: fallbackTip ?? tip, uiDock: true };
    }

    /** World node → directed hole (on-sprite or screen-edge pointer). */
    private worldNodeGuide(node: Node | null, tip: string, fallbackTip?: string): IdleGuide | null {
        const guide = this.worldOrQuest(this.worldNodeHole(node), tip, fallbackTip);
        if (!guide || !node?.isValid) return guide;
        const pos = { x: node.position.x, y: node.position.y };
        return this.withWorldAimRipple(this.withPathWorld(guide, pos), pos);
    }

    /** World pos → directed hole. */
    private worldPosGuide(pos: WorldPos | null, tip: string, fallbackTip?: string): IdleGuide | null {
        return this.withWorldAimRipple(
            this.withPathWorld(this.worldOrQuest(this.worldPosHole(pos), tip, fallbackTip), pos),
            pos,
        );
    }

    /**
     * Plot / plant / NPC click aims: yellow arrow + World light ring
     * (under plants via WorldYSort, over soil tiles).
     */
    private withWorldAimRipple(guide: IdleGuide | null, world?: WorldPos | null): IdleGuide | null {
        if (!guide || guide.uiDock || !world) return guide;
        if ((guide.arrowDeg ?? 0) !== 0) return guide;
        guide.groundRipple = true;
        guide.rippleInWorld = true;
        guide.rippleWorld = world;
        return guide;
    }

    /**
     * Resolve idle finger + tip for the live quest.
     * Per-goto aims come from guide-graphs / TsGuide via GuideRuntime.
     */
    private resolveIdleGuide(): IdleGuide | null {
        const quests = this.quests;
        if (!quests?.activeQuest) {
            this.farm?.setGatherClearance(null);
            return null;
        }

        const action = quests.activeGotoAction();
        this.syncGatherClearance(action);

        const gotoId = quests.activeQuest.gotoId | 0;
        const fromGraph = GuideRuntime.Inst.resolveGoto(this, gotoId);
        if (fromGraph !== undefined) return fromGraph as IdleGuide;

        // No TsGuide for this goto — legacy switch (should be empty once all seeded).
        return this.resolveIdleGuideLegacy(action);
    }

    /**
     * Modal / claim / recipe / wake priority — runs before the per-goto graph.
     */
    resolveCommonPriority(): GuideCommonResult {
        const quests = this.quests;
        if (!quests?.activeQuest) return { kind: 'suppress' };

        const journal = this.node.getComponent(QuestPanel);
        if (journal?.isOpen) {
            const hole = this.uiNodeHole(journal.btnClose);
            if (!hole) return { kind: 'suppress' };
            this.clearStickyTarget();
            return {
                kind: 'aim',
                aim: { hole, tip: '露穗：关掉这个，继续任务', uiDock: true },
            };
        }

        const boardGuide = this.resolveTownBoardGuide();
        if (boardGuide) return { kind: 'aim', aim: boardGuide };

        const shopGuide = this.resolveTownShopGuide();
        if (shopGuide) return { kind: 'aim', aim: shopGuide };

        if (quests.activeQuest.id === 1001 && !GameState.hasSeenDialogue(GUIDE_ID)) {
            this.farm?.setGatherClearance(null);
            const aim = this.worldNodeGuide(
                this.farm?.findWorldNode('npc_girl') ?? null,
                '露穗：点我说话',
                '露穗：走近一点，再点我',
            );
            return aim ? { kind: 'aim', aim } : { kind: 'suppress' };
        }

        if (quests.activeQuest.id === 1035) {
            this.farm?.setGatherClearance(null);
            const house = this.farm?.findWorldNode('cottage_red') ?? null;
            const aim = this.worldNodeGuide(
                house,
                '露穗：点小屋门睡觉',
                '露穗：走近小屋门，再点一下',
            );
            return aim ? { kind: 'aim', aim } : { kind: 'suppress' };
        }

        const hudPending = this.node.getComponent(FarmHUD);
        if (hudPending?.isTutorialCraftBusy || hudPending?.isTutorialCraftAwaitFly) {
            this.clearStickyTarget();
            return { kind: 'suppress' };
        }
        if (hudPending?.isRecipeLearnAwaitFly) {
            this.clearStickyTarget();
            return { kind: 'suppress' };
        }

        if (hudPending?.isCraftOpen) {
            this.clearStickyTarget();
            const aim = this.resolveCraftQuestGuide();
            return aim ? { kind: 'aim', aim } : { kind: 'suppress' };
        }

        if (quests.isAwaitingClaim) {
            this.farm?.setGatherClearance(null);
            this.node.getComponent(FarmHUD)?.ensureDockVisible();
            this.node.getComponent(QuestPanel)?.revealQuestHud();
            const hole = this.claimHole();
            if (hole) {
                this.clearStickyTarget();
                return {
                    kind: 'aim',
                    aim: { hole, tip: '露穗：点这里领奖', uiDock: true },
                };
            }
            // Claim chip missing — allow goto graph (e.g. mine copper).
        }

        if (quests.pendingCraftRecipeIds().length) {
            this.clearStickyTarget();
            const aim = this.resolveRecipeLearnGuide();
            return aim ? { kind: 'aim', aim } : { kind: 'suppress' };
        }

        return { kind: 'continue' };
    }

    // --- GuideAimHost: graph try* nodes call these ---

    resolveBagToHotbar(
        itemId: string,
        opts?: { ensureHoe?: boolean; openTip?: string },
    ): GuideAim | null {
        return this.resolveBagToHotbarGuide(itemId, {
            ensure: opts?.ensureHoe
                ? () => this.node.getComponent(FarmHUD)?.ensureStoryHoe()
                : undefined,
            openTip: opts?.openTip,
        });
    }

    resolveSelectTool(tool: string): GuideAim | null {
        if (this.farm?.tool === tool) return null;
        this.clearStickyTarget();
        return this.toolSwapGuide(tool, tool);
    }

    resolveOpenBag(tip: string): GuideAim | null {
        const hud = this.node.getComponent(FarmHUD);
        if (hud?.isBagOpen) return null;
        const bag = this.bagHole();
        if (!bag) return null;
        this.clearStickyTarget();
        return { hole: bag, tip, uiDock: true };
    }

    resolveWorldPlot(plot: GuidePlotKind, tip: string): GuideAim | null {
        return this.worldPosGuide(this.stickyPlotPos(plot), tip);
    }

    resolveWorldDecor(kind: GuideDecorKind, tip: string): GuideAim | null {
        if (kind === 'grass') {
            this.farm?.setGatherClearance('pull');
            return this.worldNodeGuide(this.pickHintGrass(), tip);
        }
        if (kind === 'rock') {
            this.farm?.setGatherClearance('dig');
            return this.worldNodeGuide(
                this.pickNearestDecor(this.farm?.listRocks() ?? [], 'rock'),
                tip,
            );
        }
        if (kind === 'tree') {
            this.farm?.setGatherClearance('chop');
            return this.worldNodeGuide(
                this.pickNearestDecor(this.farm?.listTrees() ?? [], 'tree'),
                tip,
            );
        }
        if (kind === 'copper') return this.resolveMineCopperGuide();
        return null;
    }

    resolveWorldNode(nodeName: string, tip: string, placeRipple: boolean): GuideAim | null {
        const n = this.farm?.findWorldNode(nodeName) ?? null;
        const g = this.worldNodeGuide(n, tip);
        if (!g || g.uiDock || !placeRipple) return g;
        return this.withPlaceRipple(g, n ? { x: n.position.x, y: n.position.y } : null);
    }

    resolveFish(): GuideAim | null {
        return this.resolveFishGuide(this.farm?.tool);
    }

    resolveCraftBench(): GuideAim | null {
        const hud = this.node.getComponent(FarmHUD);
        if (hud?.isCraftOpen) {
            const again = this.resolveCraftQuestGuide();
            if (again) {
                this.clearStickyTarget();
                return again;
            }
        }
        const recipeId = hud?.guidedCraftRecipeId;
        if (recipeId && hud && !hud.canAffordRecipe(recipeId)) {
            const gather = this.resolveCraftMatsGatherGuide(hud.firstMissingCraftCost(recipeId));
            if (gather) {
                if (this._stickyKey === 'craftbench') this.clearStickyTarget();
                return gather;
            }
        }
        const bench = this.farm?.findWorldNode('prop_craftbench') ?? null;
        if (!bench) return this.worldOrQuest(null, '露穗：点工作台打开制作');
        const tip = '露穗：点工作台打开制作';
        const desk = this.stickyWorldPos('craftbench', {
            x: bench.position.x,
            y: bench.position.y + 42,
        });
        const guide = this.worldOrQuest(this.worldPosHole(desk), tip);
        if (!guide || guide.uiDock) return guide;
        guide.pathWorld = { x: bench.position.x, y: bench.position.y };
        if ((guide.arrowDeg ?? 0) === 0) {
            guide.groundRipple = true;
            guide.rippleInWorld = false;
            guide.rippleWorld = desk;
        }
        return guide;
    }

    resolveHarvestBoost(): GuideAim | null {
        const harvestPos = this.stickyPlotPos('harvest');
        if (harvestPos) {
            if (this.farm?.tool !== 'hand') {
                this.clearStickyTarget();
                return this.toolSwapGuide('hand', 'hand');
            }
            return this.worldPosGuide(harvestPos, '露穗：点成熟作物收获');
        }
        const boost = this.resolveHarvestBoostGuide();
        if (boost) return boost;
        return this.worldOrQuest(null, '露穗：今晚睡一觉，明早再收');
    }

    resolveHintFarm(): GuideAim | null {
        const soil = this.stickyPlotPos('soil');
        if (soil) {
            const hoeBag = this.resolveBagToHotbar('hoe', {
                ensureHoe: true,
                openTip: '露穗：点开背包，把锄头拿出来',
            });
            if (hoeBag) return hoeBag;
            if (this.farm?.tool !== 'hoe') {
                this.clearStickyTarget();
                return this.toolSwapGuide('hoe', 'hoe');
            }
            return this.worldPosGuide(soil, '露穗：点这里开垦田地');
        }
        const tilled = this.stickyPlotPos('tilled');
        if (tilled) {
            const seedBag = this.resolveBagToHotbar('seeds');
            if (seedBag) return seedBag;
            if (this.farm?.tool !== 'seeds') {
                this.clearStickyTarget();
                return this.toolSwapGuide('seeds', 'seeds');
            }
            return this.worldPosGuide(tilled, '露穗：点翻好的地播种');
        }
        return this.worldOrQuest(null, '露穗：去田边操作一下');
    }

    resolveTownGate(): GuideAim | null {
        return this.resolveTownGateGuide();
    }

    resolveMayor(): GuideAim | null {
        return this.resolveMayorGuide();
    }

    resolveTownOutdoor(namesCsv: string, nearTip: string, farTip: string): GuideAim | null {
        const names = namesCsv
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean);
        // Graph miss → next Try* (e.g. town mine sign → inside dig copper).
        // Do not fall back to door_exit / quest dock here.
        if (!this.nearestWorldNode(names)) return null;
        return this.resolveTownOutdoorGuide(names, nearTip, farTip);
    }

    resolveIndoorOrDoor(opts: {
        indoorName: string;
        doorName: string;
        indoorTip: string;
        doorTip: string;
        farTip: string;
    }): GuideAim | null {
        return this.resolveIndoorOrDoorGuide(
            opts.indoorName,
            opts.doorName,
            opts.indoorTip,
            opts.doorTip,
            opts.farTip,
        );
    }

    resolveMineCopper(): GuideAim | null {
        return this.resolveMineCopperGuide();
    }

    resolveQuestDock(tip: string): GuideAim | null {
        const q = this.questHole();
        if (!q) return null;
        return { hole: q, tip, uiDock: true };
    }

    /** Legacy GotoAction switch — kept only for unseeded goto ids. */
    private resolveIdleGuideLegacy(action: GotoAction): IdleGuide | null {
        const quests = this.quests;
        if (!quests?.activeQuest) return null;
        const tool = this.farm?.tool;

        switch (action) {
            case GotoAction.SelectHand: {
                // Harvest (1006): bag→hotbar boost → use on crop → hand harvest.
                const harvestPos = this.stickyPlotPos('harvest');
                if (!harvestPos) {
                    const boost = this.resolveHarvestBoostGuide();
                    if (boost) return boost;
                    return this.worldOrQuest(null, '露穗：今晚睡一觉，明早再收');
                }
                if (tool !== 'hand') {
                    this.clearStickyTarget();
                    return this.toolSwapGuide('hand', 'hand');
                }
                return this.worldPosGuide(harvestPos, '露穗：点成熟作物收获');
            }
            case GotoAction.HintGrass: {
                if (tool !== 'hand') {
                    this.clearStickyTarget();
                    return this.toolSwapGuide('hand', 'hand');
                }
                return this.worldNodeGuide(
                    this.pickHintGrass(),
                    '露穗：点这里拔掉杂草',
                );
            }
            case GotoAction.SelectHoe: {
                const hoeBag = this.resolveBagToHotbarGuide('hoe', {
                    ensure: () => this.node.getComponent(FarmHUD)?.ensureStoryHoe(),
                    openTip: '露穗：点开背包，把锄头拿出来',
                });
                if (hoeBag) return hoeBag;
                if (tool !== 'hoe') {
                    this.clearStickyTarget();
                    return this.toolSwapGuide('hoe', 'hoe');
                }
                // worldPosGuide attaches pathWorld so arrow taps snap to the plot.
                return this.worldPosGuide(this.stickyPlotPos('soil'), '露穗：点这里开垦田地');
            }
            case GotoAction.HintRock: {
                const hoeBag = this.resolveBagToHotbarGuide('hoe', {
                    ensure: () => this.node.getComponent(FarmHUD)?.ensureStoryHoe(),
                    openTip: '露穗：点开背包，把锄头拿出来',
                });
                if (hoeBag) return hoeBag;
                if (tool !== 'hoe') {
                    this.clearStickyTarget();
                    return this.toolSwapGuide('hoe', 'hoe');
                }
                return this.worldNodeGuide(
                    this.pickNearestDecor(this.farm?.listRocks() ?? [], 'rock'),
                    '露穗：点石头挖石料',
                );
            }
            case GotoAction.SelectAxe: {
                const axeBag = this.resolveBagToHotbarGuide('axe');
                if (axeBag) return axeBag;
                if (tool !== 'axe') {
                    this.clearStickyTarget();
                    return this.toolSwapGuide('axe', 'axe');
                }
                return this.worldNodeGuide(
                    this.pickNearestDecor(this.farm?.listTrees() ?? [], 'tree'),
                    '露穗：点树砍几下，攒木料',
                );
            }
            case GotoAction.SelectSeeds: {
                const seedBag = this.resolveBagToHotbarGuide('seeds');
                if (seedBag) return seedBag;
                if (tool !== 'seeds') {
                    this.clearStickyTarget();
                    return this.toolSwapGuide('seeds', 'seeds');
                }
                return this.worldPosGuide(this.stickyPlotPos('tilled'), '露穗：点翻好的地播种');
            }
            case GotoAction.SelectCan: {
                const canBag = this.resolveBagToHotbarGuide('can');
                if (canBag) return canBag;
                if (tool !== 'can') {
                    this.clearStickyTarget();
                    return this.toolSwapGuide('can', 'can');
                }
                return this.worldPosGuide(this.stickyPlotPos('water'), '露穗：给作物浇点水');
            }
            case GotoAction.SelectRod:
            case GotoAction.HintFish:
                return this.resolveFishGuide(tool);
            case GotoAction.HintFarm: {
                const soil = this.stickyPlotPos('soil');
                if (soil) {
                    const hoeBag = this.resolveBagToHotbarGuide('hoe', {
                        ensure: () => this.node.getComponent(FarmHUD)?.ensureStoryHoe(),
                        openTip: '露穗：点开背包，把锄头拿出来',
                    });
                    if (hoeBag) return hoeBag;
                    if (tool !== 'hoe') {
                        this.clearStickyTarget();
                        return this.toolSwapGuide('hoe', 'hoe');
                    }
                    return this.worldPosGuide(soil, '露穗：点这里开垦田地');
                }
                const tilled = this.stickyPlotPos('tilled');
                if (tilled) {
                    const seedBag = this.resolveBagToHotbarGuide('seeds');
                    if (seedBag) return seedBag;
                    if (tool !== 'seeds') {
                        this.clearStickyTarget();
                        return this.toolSwapGuide('seeds', 'seeds');
                    }
                    return this.worldPosGuide(tilled, '露穗：点翻好的地播种');
                }
                return this.worldOrQuest(null, '露穗：去田边操作一下');
            }
            case GotoAction.HintCraft:
            case GotoAction.OpenCraft: {
                const hud = this.node.getComponent(FarmHUD);
                if (hud?.isCraftOpen) {
                    const again = this.resolveCraftQuestGuide();
                    if (again) {
                        this.clearStickyTarget();
                        return again;
                    }
                }
                // Mats short → gather first; don't park the arrow on a dead bench.
                const recipeId = hud?.guidedCraftRecipeId;
                if (recipeId && !hud!.canAffordRecipe(recipeId)) {
                    const gather = this.resolveCraftMatsGatherGuide(
                        hud!.firstMissingCraftCost(recipeId),
                    );
                    if (gather) {
                        // Only drop the desk lock — do NOT wipe grass/rock sticky
                        // every frame (that made the chevron thrash while walking).
                        if (this._stickyKey === 'craftbench') this.clearStickyTarget();
                        return gather;
                    }
                }
                // Aim the place chevron at the desk (anvil), not sprite-top /
                // feet — worldNodeGuide sat the tip on dirt above the bench.
                const bench = this.farm?.findWorldNode('prop_craftbench') ?? null;
                if (!bench) {
                    return this.worldOrQuest(null, '露穗：点工作台打开制作');
                }
                const tip = '露穗：点工作台打开制作';
                const desk = this.stickyWorldPos('craftbench', {
                    x: bench.position.x,
                    y: bench.position.y + 42,
                });
                const guide = this.worldOrQuest(this.worldPosHole(desk), tip);
                if (!guide || guide.uiDock) return guide;
                guide.pathWorld = { x: bench.position.x, y: bench.position.y };
                if ((guide.arrowDeg ?? 0) === 0) {
                    guide.groundRipple = true;
                    guide.rippleInWorld = false;
                    guide.rippleWorld = desk;
                }
                return guide;
            }
            case GotoAction.OpenBag: {
                const bag = this.bagHole();
                if (!bag) return null;
                this.clearStickyTarget();
                return { hole: bag, tip: '露穗：点开背包看看', uiDock: true };
            }
            case GotoAction.HintMeteor:
            case GotoAction.HintTownGate:
                return this.resolveTownGateGuide();
            case GotoAction.HintMayor:
                return this.resolveMayorGuide();
            default: {
                const id = quests.activeQuest.id;
                if (id === 1011) {
                    return this.resolveTownOutdoorGuide(
                        ['bld_police', 'bld_post'],
                        '点击警局或邮局接任务',
                        '往警局或邮局走，再点公告板',
                    );
                }
                if (id === 1012) {
                    return this.resolveIndoorOrDoorGuide(
                        'npc_carpenter',
                        'bld_carpenter',
                        '点工匠·石楠打招呼',
                        '点木工坊大门进屋',
                        '往东市木工坊走，点大门进屋',
                    );
                }
                if (id === 1013) {
                    return this.resolveIndoorOrDoorGuide(
                        'npc_caretaker',
                        'bld_community',
                        '点管理员·苔青打招呼',
                        '点社区中心大门进屋',
                        '往社区中心走，点大门进屋',
                    );
                }
                if (id === 1020) {
                    return this.resolveTownOutdoorGuide(
                        ['bld_seedshop', 'bld_general'],
                        '走进商店，点击购买商品',
                        '往种子店走，再点门面',
                    );
                }
                if (id === 1021) {
                    return this.resolveTownOutdoorGuide(
                        ['bld_seedshop', 'bld_general'],
                        '打开商店，点「出售」卖掉一件收获物',
                        '往种子店走，再点门面',
                    );
                }
                if (id === 1022) {
                    return this.resolveIndoorOrDoorGuide(
                        'prop_spring_desk',
                        'bld_community',
                        '点春厅名册桌签字',
                        '点社区中心大门进屋',
                        '往社区中心走，点大门进屋',
                    );
                }
                if (id === 1027) {
                    return this.resolveIndoorOrDoorGuide(
                        'prop_spring_lamp',
                        'bld_community',
                        '点春厅旧灯，献上铜矿',
                        '点社区中心大门进屋',
                        '往社区中心走，点大门进屋',
                    );
                }
                if (id === 1023) {
                    return this.resolveIndoorOrDoorGuide(
                        'npc_doctor',
                        'bld_clinic',
                        '点医生·荷叶听取叮嘱',
                        '点微光诊所大门进屋',
                        '往微光诊所走，点大门进屋',
                    );
                }
                if (id === 1024) {
                    return this.resolveTownOutdoorGuide(
                        ['bld_oreshop'],
                        '点矿脉商会，向掌柜·赤铜打听放行',
                        '往矿脉商会走，再点一下找掌柜',
                    );
                }
                if (id === 1025) {
                    // Town: point at the mine portal. Already inside → dig guide
                    // (enter_mine claim is handled above when awaitingClaim).
                    const outdoor = this.nearestWorldNode(['sign_mine', 'door_portal_mine']);
                    if (outdoor) {
                        return this.resolveTownOutdoorGuide(
                            ['sign_mine', 'door_portal_mine'],
                            '点击东门外矿洞路牌进入',
                            '往东走到矿洞路牌',
                        );
                    }
                    return this.resolveMineCopperGuide();
                }
                if (id === 1026) {
                    return this.resolveMineCopperGuide();
                }
                const q = this.questHole();
                if (!q) return null;
                return { hole: q, tip: '查看当前任务目标', uiDock: true };
            }
        }
    }

    /**
     * While the police / post panel is open, point at「接受委托」instead of the
     * building under the modal (chevron used to sit on top and kill the step).
     */
    private resolveTownBoardGuide(): IdleGuide | null {
        const shop = this.node.getComponent(TownShopPanel);
        if (!shop?.isBoardOpen) return null;
        const hole = this.uiNodeHole(shop.acceptBtnNode());
        if (!hole) return null;
        this.clearStickyTarget();
        return { hole, tip: '露穗：点「接受委托」，再去目标地点交付', uiDock: true };
    }

    /**
     * Quest 1020 / 1021 while the shop is open: force「购买/出售」tab → first
     * list row → confirm → close X after trade (panel still blocks claim / world taps).
     */
    private resolveTownShopGuide(): IdleGuide | null {
        const shop = this.node.getComponent(TownShopPanel);
        if (!shop?.isShopOpen) return null;
        this.clearStickyTarget();
        // Purchase / sale done — point at X before the quest-dock claim tip.
        if (shop.needsShopCloseGuide()) {
            const hole = this.uiNodeHole(shop.closeBtnNode());
            if (!hole) return null;
            return { hole, tip: '露穗：关掉商店继续', uiDock: true };
        }
        if (!shop.needsShopTradeGuide()) return null;
        const qid = this.quests?.activeQuest?.id ?? 0;
        if (qid === 1021) {
            if (shop.shopSide !== 'sell') {
                const hole = this.uiNodeHole(shop.sellTabNode());
                if (!hole) return null;
                return { hole, tip: '露穗：先点「出售」页签', uiDock: true };
            }
            if (!shop.hasTradeSelection) {
                const hole = this.uiNodeHole(shop.firstSellRowNode());
                if (hole) {
                    return { hole, tip: '露穗：先点这一行选中', uiDock: true };
                }
                // Empty sell list — keep the panel cue (don't fall through to buildings).
                const tab = this.uiNodeHole(shop.sellTabNode());
                if (!tab) return null;
                return { hole: tab, tip: '露穗：背包里还没有可卖的收获物', uiDock: true };
            }
            const confirm = this.uiNodeHole(shop.confirmBtnNode());
            if (!confirm) return null;
            return { hole: confirm, tip: '露穗：点确认出售', uiDock: true };
        }
        if (qid === 1020) {
            if (shop.shopSide !== 'buy') {
                const hole = this.uiNodeHole(shop.buyTabNode());
                if (!hole) return null;
                return { hole, tip: '露穗：先点「购买」页签', uiDock: true };
            }
            if (!shop.hasTradeSelection) {
                const hole = this.uiNodeHole(shop.firstBuyRowNode());
                if (!hole) return null;
                return { hole, tip: '露穗：先点这一行选中', uiDock: true };
            }
            const confirm = this.uiNodeHole(shop.confirmBtnNode());
            if (!confirm) return null;
            return { hole: confirm, tip: '露穗：点确认购买', uiDock: true };
        }
        return null;
    }

    /**
     * Town outdoor POI guide. If the target is missing (e.g. still inside
     * MayorHouse after quest 1010), point at door_exit instead of the quest dock.
     *
     * Aim door / board feet — `worldNodeHole` uses the full sprite bounds, so the
     * chevron sits above the roof (police board looked “blocked” behind the station).
     */
    private resolveTownOutdoorGuide(
        names: string[],
        tip: string,
        walkTip: string,
    ): IdleGuide | null {
        const node = this.nearestWorldNode(names);
        if (node) {
            // Police board sits left of the door on the facade.
            const biasX = node.name === 'bld_police' ? -40 : 0;
            const pos = this.stickyWorldPos(`town:${names[0] ?? node.name}`, {
                x: node.position.x + biasX,
                y: node.position.y + 28,
            });
            // Buildings / signs = place; NPCs keep arrow above the sprite hole.
            if (node.name.startsWith('npc_')) {
                return this.worldPosGuide(pos, tip, walkTip);
            }
            const portal = node.name.startsWith('bld_')
                ? this.doorPortalForBuilding(node.name)
                : null;
            return this.doorPlaceGuide(pos, tip, walkTip, portal);
        }
        const exit = this.farm?.findWorldNode('door_exit') ?? null;
        if (exit) {
            const pos = this.stickyWorldPos('door-exit', {
                x: exit.position.x,
                y: exit.position.y + 24,
            });
            return this.doorPlaceGuide(
                pos,
                '点击门口回镇子',
                '走到门口后点一下出门',
                this.indoorDoorPortal(),
            );
        }
        return this.worldOrQuest(null, tip, walkTip);
    }

    /** Closest matching world child among `names` (exact or prefix). */
    private nearestWorldNode(names: string[]): Node | null {
        const farm = this.farm;
        if (!farm?.world) return null;
        const px = farm.player?.position.x ?? 0;
        const py = farm.player?.position.y ?? 0;
        let best: Node | null = null;
        let bestSq = Number.POSITIVE_INFINITY;
        for (const child of farm.world.children) {
            if (!child.isValid) continue;
            let hit = false;
            for (let i = 0; i < names.length; i++) {
                const n = names[i]!;
                if (child.name === n || child.name.startsWith(n)) {
                    hit = true;
                    break;
                }
            }
            if (!hit) continue;
            const dx = child.position.x - px;
            const dy = child.position.y - py;
            const dSq = dx * dx + dy * dy;
            if (dSq < bestSq) {
                bestSq = dSq;
                best = child;
            }
        }
        return best;
    }

    /**
     * Earned recipe scroll: open bag → tap scroll to learn → workbench unlocks.
     */
    private resolveRecipeLearnGuide(): IdleGuide | null {
        const hud = this.node.getComponent(FarmHUD);
        const quests = this.quests;
        if (!hud || !quests) return null;
        const pending = quests.pendingCraftRecipeIds();
        if (!pending.length) return null;

        this.clearStickyTarget();
        const recipeId = pending[0]!;
        const recipe = getCraftRecipes().find((r) => r.id === recipeId);
        const name = recipe?.name ?? '配方';
        if (hud.isRecipeLearnOpen) {
            const learn = this.uiNodeHole(hud.recipeLearnBtnNode());
            if (!learn) return null;
            // From the right — a top-down chevron covers the recipe desc above「学习」.
            return {
                hole: learn,
                tip: `露穗：点「学习」，学会「${name}」`,
                uiDock: true,
                arrowDeg: -90,
            };
        }
        if (!hud.isBagOpen) {
            const bag = this.bagHole();
            if (!bag) return null;
            return { hole: bag, tip: '露穗：新配方飞进背包了，打开学习', uiDock: true };
        }
        if (!hud.recipeScrollSlotNode(recipeId)) {
            hud.grantRecipeScroll(recipeId, { fly: false });
        }
        const hole = this.uiNodeHole(hud.recipeScrollSlotNode(recipeId));
        if (!hole) return null;
        return { hole, tip: `露穗：点卷轴，打开「${name}」配方`, uiDock: true };
    }

    /**
     * Shared bag → hotbar drag lesson for dockable tools / consumables.
     * open bag → drag item → close once (caller handles post-close equip / world aim).
     * Reopening the bag later must not re-nag the close X.
     */
    private resolveBagToHotbarGuide(
        itemId: string,
        opts?: {
            ensure?: () => void;
            openTip?: string;
            dragTip?: string;
            dragTipShort?: string;
            closeTip?: string;
        },
    ): IdleGuide | null {
        const hud = this.node.getComponent(FarmHUD);
        if (!hud) return null;
        opts?.ensure?.();

        const label = itemName(itemId, itemId);
        const openTip = opts?.openTip ?? `露穗：点开背包，把${label}拖到快捷栏`;
        const dragTip = opts?.dragTip ?? `露穗：按住${label}，拖到空快捷栏`;
        const dragTipShort = opts?.dragTipShort ?? `露穗：把${label}拖到下方快捷栏`;
        const closeTip = opts?.closeTip ?? '露穗：关掉背包继续';

        if (hud.isHotbarBound(itemId)) {
            if (hud.isBagOpen) {
                // Only the first close after the teach drag — not every reopen.
                if (!hud.needsBagCloseGuide()) return null;
                this.clearStickyTarget();
                const close = this.uiNodeHole(hud.bagCloseBtnNode());
                if (!close) return null;
                return { hole: close, tip: closeTip, uiDock: true };
            }
            return null;
        }

        this.clearStickyTarget();
        if (!hud.isBagOpen) {
            // Always keep the bag seat — never fall through to soil / phantom slots.
            const bag = this.bagHole();
            if (!bag) return null;
            return { hole: bag, tip: openTip, uiDock: true };
        }
        const itemHole = this.uiNodeHole(hud.bagSlotNode(itemId));
        if (!itemHole) return null;
        const dropHole = this.uiNodeHole(hud.emptyHotbarSlotNode());
        if (!dropHole) {
            return { hole: itemHole, tip: dragTipShort, uiDock: true };
        }
        return {
            hole: itemHole,
            tip: dragTip,
            uiDock: true,
            dragTo: dropHole,
            dragItem: itemId,
        };
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

        const bagGuide = this.resolveBagToHotbarGuide('boost', {
            openTip: '露穗：点开背包看看',
        });
        if (bagGuide) return bagGuide;

        if (farm.tool !== 'boost') {
            // Already on the dock — select it so the crop tap is one shot (not equip+use).
            const slot = hud.hotbarSlotNode('boost');
            if (slot) {
                farm.setTool('boost');
            } else {
                this.clearStickyTarget();
                return this.toolSwapGuide('boost', 'boost');
            }
        }

        return this.worldPosGuide(this.stickyPlotPos('grow'), '露穗：点作物用催熟剂');
    }

    /** Forced craft-quest steps while the workbench is open — only aim the recipe button. */
    private resolveCraftQuestGuide(): IdleGuide | null {
        const quests = this.quests;
        const q = quests?.activeQuest;
        if (!q) return null;
        const hud = this.node.getComponent(FarmHUD);
        if (!hud?.isCraftOpen) return null;

        // Countdown / claim / short mats: stay quiet — don't nag close or gather.
        if (hud.isTutorialCraftBusy || hud.isTutorialCraftAwaitClose) return null;
        if (quests.isAwaitingClaim) return null;
        if (q.conditionId !== 3 || !q.param) return null;
        if (!hud.canAffordRecipe(q.param)) return null;

        const btn = hud.craftRecipeBtnNode(q.param);
        const hole = this.uiNodeHole(btn);
        if (!hole) return null;
        const tip =
            q.param === 'can_basic'
                ? '露穗：点这里打造水壶'
                : q.param === 'axe_basic'
                  ? '露穗：点这里打造斧头'
                  : q.param === 'rod_basic'
                    ? '露穗：点这里编织鱼竿'
                    : q.param === 'seed_from_grass'
                      ? '露穗：点这里制作种子'
                      : '露穗：点这里制作';
        return { hole, tip, uiDock: true };
    }

    /**
     * Craft quest short on mats → aim the matching gather action
     * (grass / rock / till / chop) instead of the workbench.
     */
    private resolveCraftMatsGatherGuide(missing: string | null): IdleGuide | null {
        if (!missing) return null;
        const tool = this.farm?.tool;
        if (missing === 'grass') {
            this.farm?.setGatherClearance('pull');
            if (tool !== 'hand') {
                this.clearStickyTarget();
                return this.toolSwapGuide('hand', 'hand');
            }
            return this.worldNodeGuide(this.pickHintGrass(), '露穗：先拔草凑材料');
        }
        if (missing === 'stone') {
            this.farm?.setGatherClearance('dig');
            const hoeBag = this.resolveBagToHotbarGuide('hoe', {
                ensure: () => this.node.getComponent(FarmHUD)?.ensureStoryHoe(),
                openTip: '露穗：点开背包，把锄头拿出来挖石',
            });
            if (hoeBag) return hoeBag;
            if (tool !== 'hoe') {
                this.clearStickyTarget();
                return this.toolSwapGuide('hoe', 'hoe');
            }
            return this.worldNodeGuide(
                this.pickNearestDecor(this.farm?.listRocks() ?? [], 'craft-mat-rock'),
                '露穗：先挖石头凑材料',
            );
        }
        if (missing === 'dirt') {
            this.farm?.setGatherClearance(null);
            const hoeBag = this.resolveBagToHotbarGuide('hoe', {
                ensure: () => this.node.getComponent(FarmHUD)?.ensureStoryHoe(),
                openTip: '露穗：点开背包，把锄头拿出来翻土',
            });
            if (hoeBag) return hoeBag;
            if (tool !== 'hoe') {
                this.clearStickyTarget();
                return this.toolSwapGuide('hoe', 'hoe');
            }
            return this.worldPosGuide(this.stickyPlotPos('soil'), '露穗：先开垦田地凑泥土');
        }
        if (missing === 'wood') {
            this.farm?.setGatherClearance('chop');
            const axeBag = this.resolveBagToHotbarGuide('axe');
            if (axeBag) return axeBag;
            if (tool !== 'axe') {
                this.clearStickyTarget();
                return this.toolSwapGuide('axe', 'axe');
            }
            return this.worldNodeGuide(
                this.pickNearestDecor(this.farm?.listTrees() ?? [], 'craft-mat-tree'),
                '露穗：先砍点木料凑材料',
            );
        }
        return null;
    }

    /** Hide stacked rival nature while a gather goto is live. */
    /** Mine copper quest — bag→hotbar hoe, equip, then nearest copper ore. */
    private resolveMineCopperGuide(): IdleGuide | null {
        this.farm?.setGatherClearance('dig');
        const hoeBag = this.resolveBagToHotbarGuide('hoe', {
            ensure: () => this.node.getComponent(FarmHUD)?.ensureStoryHoe(),
            openTip: '露穗：点开背包，把锄头拿出来',
        });
        if (hoeBag) return hoeBag;
        if (this.farm?.tool !== 'hoe') {
            this.clearStickyTarget();
            return this.toolSwapGuide('hoe', 'hoe');
        }
        const ore = this.pickNearestCopperOre();
        return this.worldNodeGuide(ore, '露穗：点铜矿石开采', '往铜矿石走，再点一下挖');
    }

    private pickNearestCopperOre(): Node | null {
        const world = this.farm?.world;
        if (!world?.isValid) return null;
        const list: Node[] = [];
        for (const child of world.children) {
            if (child.isValid && child.active && child.name.includes('ore_copper')) {
                list.push(child);
            }
        }
        return this.pickNearestDecor(list, 'ore_copper');
    }

    private syncGatherClearance(action: GotoAction) {
        const farm = this.farm;
        if (!farm) return;
        // Mine copper dig clearance is set inside resolveMineCopperGuide.
        if (action === GotoAction.HintGrass) farm.setGatherClearance('pull');
        else if (action === GotoAction.HintRock) farm.setGatherClearance('dig');
        else if (action === GotoAction.SelectAxe) farm.setGatherClearance('chop');
        else if (action === GotoAction.HintCraft || action === GotoAction.OpenCraft) {
            // Mats short → same clearance as resolveCraftMatsGatherGuide.
            // Must set here (not null→pull later) or buckets rebuild every frame.
            const hud = this.node.getComponent(FarmHUD);
            const recipeId = hud?.guidedCraftRecipeId;
            if (recipeId && !hud!.canAffordRecipe(recipeId)) {
                const missing = hud!.firstMissingCraftCost(recipeId);
                if (missing === 'grass') farm.setGatherClearance('pull');
                else if (missing === 'stone') farm.setGatherClearance('dig');
                else if (missing === 'wood') farm.setGatherClearance('chop');
                else farm.setGatherClearance(null);
            } else {
                farm.setGatherClearance(null);
            }
        } else farm.setGatherClearance(null);
    }

    /**
     * Sticky nearest decor (rocks / trees) — same hysteresis as weeds so the
     * craft-mats chevron doesn't hop every step toward a new nearest stump.
     */
    private pickNearestDecor(list: Node[], stickyKey = 'decor'): Node | null {
        const farm = this.farm;
        if (!farm?.player || !list.length) {
            if (this._stickyKey === stickyKey) this.clearStickyTarget();
            return null;
        }
        const px = farm.player.position.x;
        const py = farm.player.position.y;
        let best: Node | null = null;
        let bestSq = Number.POSITIVE_INFINITY;
        for (let i = 0; i < list.length; i++) {
            const n = list[i]!;
            if (!n.isValid || !n.active) continue;
            const dx = n.position.x - px;
            const dy = n.position.y - py;
            const dSq = dx * dx + dy * dy;
            if (dSq < bestSq) {
                bestSq = dSq;
                best = n;
            }
        }
        if (!best) return null;
        const now = Date.now();
        if (this._stickyKey === stickyKey && this._stickyNode?.isValid) {
            if (list.includes(this._stickyNode)) {
                const sx = this._stickyNode.position.x - px;
                const sy = this._stickyNode.position.y - py;
                const stickySq = sx * sx + sy * sy;
                if (bestSq + STICKY_SWITCH_SQ >= stickySq) {
                    this._stickyUntil = now + STICKY_MS;
                    this._stickyPos = {
                        x: this._stickyNode.position.x,
                        y: this._stickyNode.position.y,
                    };
                    return this._stickyNode;
                }
            }
        }
        this._stickyKey = stickyKey;
        this._stickyNode = best;
        this._stickyPos = { x: best.position.x, y: best.position.y };
        this._stickyUntil = now + STICKY_MS;
        return best;
    }

    /**
     * Quest 1010: outdoors → enter bld_mayor; indoors → talk to npc_mayor.
     * Off-screen → “往北走”, never a down-arrow on clinic.
     */
    private resolveMayorGuide(): IdleGuide | null {
        return this.resolveIndoorOrDoorGuide(
            'npc_mayor',
            'bld_mayor',
            '点镇长·艾岚打招呼',
            '点镇长府大门进屋',
            '往北走到镇长府，点大门进屋',
        );
    }

    /**
     * Indoors: aim NPC / prop. Outdoors: aim building door feet.
     * If neither is present but door_exit is, cue leaving the room.
     */
    private resolveIndoorOrDoorGuide(
        indoorName: string,
        outdoorBld: string,
        indoorTip: string,
        outdoorTip: string,
        walkTip: string,
    ): IdleGuide | null {
        const indoor = this.farm?.findWorldNode(indoorName) ?? null;
        if (indoor) {
            const isNpc = indoor.name.startsWith('npc_');
            const pos = this.stickyWorldPos(`in:${indoorName}`, {
                x: indoor.position.x,
                y: indoor.position.y + (isNpc ? 36 : 28),
            });
            const guide = this.worldPosGuide(
                pos,
                indoorTip,
                isNpc ? `走近后再点一下` : walkTip,
            );
            return isNpc ? guide : this.withPlaceRipple(guide, pos);
        }
        const bld = this.farm?.findWorldNode(outdoorBld) ?? null;
        if (bld) {
            const stand = StoryWorldHooks.standForInteract(bld);
            const pos = this.stickyWorldPos(`door:${outdoorBld}`, stand);
            return this.doorPlaceGuide(
                pos,
                outdoorTip,
                walkTip,
                this.doorPortalForBuilding(outdoorBld),
            );
        }
        const exit = this.farm?.findWorldNode('door_exit') ?? null;
        if (exit) {
            const pos = this.stickyWorldPos('door-exit', {
                x: exit.position.x,
                y: exit.position.y + 20,
            });
            return this.doorPlaceGuide(
                pos,
                '点击门口离开',
                '走到门口后点一下离开',
                this.indoorDoorPortal(),
            );
        }
        const q = this.questHole();
        if (!q) return null;
        return { hole: q, tip: outdoorTip, uiDock: true };
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
        return this.withPlaceRipple(
            this.worldPosGuide(
                pos,
                '露穗：点路牌去微光溪谷镇',
                '露穗：往右走，去东侧路牌',
            ),
            pos,
        );
    }

    /**
     * Fishing quest chain: equip rod → walk toward pier (edge arrow if off-screen)
     * → tap lake water to cast. Never falls back to the quest chip alone.
     */
    private resolveFishGuide(tool: string | undefined): IdleGuide | null {
        const rodBag = this.resolveBagToHotbarGuide('rod');
        if (rodBag) return rodBag;
        if (tool !== 'rod') {
            this.clearStickyTarget();
            this._fishNearLatch = false;
            const slotHole = this.toolSlotHole('rod') ?? this.toolSlotHoleFallback('rod');
            if (!slotHole) return null;
            // Caption on — first fishing step is easy to miss with a silent hotbar arrow.
            return { hole: slotHole, tip: '露穗：先点下方「鱼竿」', uiDock: true };
        }

        const target = this.fishGuideTarget();
        if (this.farm?.isBusy) {
            return this.withPlaceRipple(
                this.worldPosGuide(target.pos, '露穗：走到钓点就会抛竿', '露穗：往西边码头走，再点湖面'),
                target.pos,
            );
        }
        if (target.near) {
            return this.withPlaceRipple(
                this.worldPosGuide(
                    target.pos,
                    '露穗：点湖面抛竿',
                    '露穗：往西边码头走，再点湖面',
                ),
                target.pos,
            );
        }
        return this.withPlaceRipple(
            this.worldPosGuide(target.pos, '露穗：跟着星光走到湖边码头', '露穗：往西边码头走，再点湖面'),
            target.pos,
        );
    }

    /** Always the fixed lake-water tip by the pier — never retarget (avoids bounce). */
    private fishGuideTarget(): { pos: WorldPos; near: boolean } {
        const hint = FarmWorldLayout.fishingHintWorld();
        const pos = this.stickyWorldPos('fish', hint);
        const player = this.farm?.player;
        if (!player?.isValid) return { pos, near: this._fishNearLatch };
        const dist = Math.hypot(player.position.x - hint.x, player.position.y - hint.y);
        // Hysteresis — walking the lip of FISH_NEAR_RANGE used to flip tip + ripple.
        if (this._fishNearLatch) {
            if (dist > FISH_NEAR_RANGE + 60) this._fishNearLatch = false;
        } else if (dist <= FISH_NEAR_RANGE - 40) {
            this._fishNearLatch = true;
        }
        return { pos, near: this._fishNearLatch };
    }

    /** Hold a fixed world point briefly (pier / portal) so the edge arrow stays put. */
    private stickyWorldPos(key: string, pos: WorldPos): WorldPos {
        const now = Date.now();
        if (this._stickyKey === key && this._stickyPos) {
            const dx = pos.x - this._stickyPos.x;
            const dy = pos.y - this._stickyPos.y;
            if (dx * dx + dy * dy <= STICKY_SWITCH_SQ) {
                this._stickyUntil = now + STICKY_MS;
                return this._stickyPos;
            }
        }
        this._stickyKey = key;
        this._stickyNode = null;
        this._stickyPos = pos;
        this._stickyUntil = now + STICKY_MS;
        return pos;
    }

    /**
     * Target off the playfield → edge chevron pointing that way.
     * Prefer world delta (player → aim) so a north POI never becomes a
     * down-arrow parked on clinic / general store after the camera pans.
     */
    private offscreenEdgeGuide(
        hole: HoleRect,
        tip: string,
        worldAim?: WorldPos | null,
    ): IdleGuide {
        const band = this.playfieldBand();
        const deg = this.resolveEdgeDeg(hole, band, worldAim);
        return this.edgeGuideForDeg(deg, hole, tip, band);
    }

    /**
     * Pick edge chevron facing. World delta wins when the aim is clearly
     * farther on one axis — screen-space alone used to flip N/S around the lip.
     */
    private resolveEdgeDeg(
        hole: HoleRect,
        band: { x0: number; x1: number; y0: number; y1: number },
        worldAim?: WorldPos | null,
    ): number {
        const prevDeg = this._edgeGuide?.arrowDeg;
        const player = this.farm?.player;
        if (worldAim && player?.isValid) {
            const dx = worldAim.x - player.position.x;
            const dy = worldAim.y - player.position.y;
            const adx = Math.abs(dx);
            const ady = Math.abs(dy);
            // Mostly vertical / horizontal — ignore the weak axis.
            if (ady >= adx * 0.75) {
                let above = dy > 0;
                if (prevDeg === 180 || prevDeg === 0) {
                    // Hysteresis so tiny foot jitter can't flip N↔S.
                    if (prevDeg === 180 && dy > -80) above = true;
                    else if (prevDeg === 0 && dy < 80) above = false;
                }
                return above ? 180 : 0;
            }
            if (adx >= ady * 0.75) {
                let goRight = dx > 0;
                if (prevDeg === 90 || prevDeg === -90) {
                    if (prevDeg === 90 && dx > -80) goRight = true;
                    else if (prevDeg === -90 && dx < 80) goRight = false;
                }
                return goRight ? 90 : -90;
            }
        }

        const midX = (band.x0 + band.x1) * 0.5;
        const midY = (band.y0 + band.y1) * 0.5;
        const outL = band.x0 - hole.x;
        const outR = hole.x - band.x1;
        const outD = band.y0 - hole.y;
        const outU = hole.y - band.y1;
        const best = Math.max(outL, outR, outD, outU);
        if (best === outU || (best <= 0 && hole.y >= midY)) {
            if (prevDeg === 0 && hole.y < band.y1 + EDGE_HYSTERESIS) return 0;
            return 180;
        }
        if (best === outD || (best <= 0 && hole.y < midY)) {
            if (prevDeg === 180 && hole.y > band.y0 - EDGE_HYSTERESIS) return 180;
            return 0;
        }
        let goRight = best === outR || (best !== outL && hole.x >= midX);
        if (prevDeg === 90 || prevDeg === -90) {
            if (prevDeg === 90 && hole.x > midX - EDGE_HYSTERESIS) goRight = true;
            else if (prevDeg === -90 && hole.x < midX + EDGE_HYSTERESIS) goRight = false;
        }
        return goRight ? 90 : -90;
    }

    private edgeGuideForDeg(
        deg: number,
        hole: HoleRect,
        tip: string,
        band?: { x0: number; x1: number; y0: number; y1: number },
    ): IdleGuide {
        const b = band ?? this.playfieldBand();
        const x = Math.max(b.x0 + 56, Math.min(b.x1 - 56, hole.x));
        const midY = (b.y0 + b.y1) * 0.5;
        if (deg === 180) {
            return {
                hole: { x, y: b.y1 - 56, w: 80, h: 80 },
                tip: this.edgeWalkTip(tip, 180),
                uiDock: false,
                arrowDeg: 180,
                edgeWalk: true,
            };
        }
        if (deg === 0) {
            return {
                hole: { x, y: b.y0 + 56, w: 80, h: 80 },
                tip: this.edgeWalkTip(tip, 0),
                uiDock: false,
                arrowDeg: 0,
                edgeWalk: true,
            };
        }
        if (deg === 90) {
            return {
                hole: { x: b.x1 - 56, y: midY, w: 80, h: 80 },
                tip: this.edgeWalkTip(tip, 90),
                uiDock: false,
                arrowDeg: 90,
                edgeWalk: true,
            };
        }
        return {
            hole: { x: b.x0 + 56, y: midY, w: 80, h: 80 },
            tip: this.edgeWalkTip(tip, -90),
            uiDock: false,
            arrowDeg: -90,
            edgeWalk: true,
        };
    }

    /**
     * Off-screen tip: chevron already shows which way — just「前往xxx」.
     * Keep the author line only when we can't parse a place name.
     */
    private edgeWalkTip(tip: string, deg: number): string {
        if (tip.startsWith('前往')) return tip;
        // Stale latch / old copy may still carry the retired line.
        if (tip.includes('靠近了再动手')) return '前往目标';
        const dest = this.extractGoToDest(tip);
        if (dest) return `前往${dest}`;

        const north = tip.includes('北');
        const south = tip.includes('南');
        const east = tip.includes('右') || tip.includes('东');
        const west = tip.includes('左') || tip.includes('西');
        if (deg === 180 && (north || (!south && !east && !west && tip.includes('走')))) return tip;
        if (deg === 0 && (south || (!north && !east && !west && tip.includes('走')))) return tip;
        if (deg === 90 && (east || (!west && !north && !south && tip.includes('走')))) return tip;
        if (deg === -90 && (west || (!east && !north && !south && tip.includes('走')))) return tip;
        // Direction mismatch / no place parse — never「靠近了再动手」
        return tip || '前往目标';
    }

    /** Pull a short place name out of walk tips like「往北走到镇长府，点大门」. */
    private extractGoToDest(tip: string): string | null {
        const t = tip.replace(/^露穗[：:]/, '').trim();
        if (!t || t.includes('靠近了再动手')) return null;

        let m = t.match(/去(.+?)(?:呀|～|吧|哦|啦|，|,|$)/);
        if (m?.[1]) return this.cleanGoToDest(m[1]);

        m = t.match(/往[南北左右]走到(.+?)(?:，|,|$)/);
        if (m?.[1]) return this.cleanGoToDest(m[1]);

        m = t.match(/往(.+?)走/);
        if (m?.[1]) {
            const inner = m[1].replace(/^[南北左右]边?侧?/, '');
            if (inner) return this.cleanGoToDest(inner);
        }

        m = t.match(/走[到至](.+?)(?:后|，|,|$)/);
        if (m?.[1]) return this.cleanGoToDest(m[1]);

        m = t.match(/点(.+?)大门/);
        if (m?.[1]) return this.cleanGoToDest(m[1]);

        return null;
    }

    private cleanGoToDest(raw: string): string | null {
        let s = raw.replace(/^(到|去)/, '').trim();
        s = s.replace(/再点.*$/, '').trim();
        s = s.replace(/[呀～吧哦啦。！!…]+$/g, '').trim();
        if (!s || s.length > 14) return null;
        if (/^(点|再|近)$/.test(s)) return null;
        return s;
    }

    /**
     * Latch edge *facing* so N/S/L/R don't thrash, but always refresh the
     * hole from the live guide — freezing canvas coords made the chevron
     * sit on whatever building scrolled underneath (shop / clinic).
     */
    private stickEdgeGuide(guide: IdleGuide): IdleGuide {
        const now = Date.now();
        const prev = this._edgeGuide;
        const prevDeg = prev?.arrowDeg ?? 0;
        const nextDeg = guide.arrowDeg ?? 0;
        if (prev && now < this._edgeUntil && prevDeg !== nextDeg) {
            const oppositeLR =
                Math.abs(prevDeg) === 90 &&
                Math.abs(nextDeg) === 90 &&
                prevDeg !== nextDeg;
            const oppositeNS =
                (prevDeg === 180 && nextDeg === 0) || (prevDeg === 0 && nextDeg === 180);
            if (oppositeLR || oppositeNS) {
                const held = this.edgeGuideForDeg(prevDeg, guide.hole, guide.tip);
                held.groundRipple = guide.groundRipple;
                held.rippleWorld = guide.rippleWorld;
                held.pathWorld = guide.pathWorld;
                held.edgeWalk = true;
                this._edgeGuide = held;
                return held;
            }
        }
        if (!prev || prevDeg !== nextDeg || now >= this._edgeUntil) {
            this._edgeUntil = now + STICKY_MS;
        }
        this._edgeGuide = guide;
        return guide;
    }

    /**
     * Sticky plot aim — hold the same tile so nearest-picking can't
     * thrash the arrow between two equal-distance plots.
     * Drop the latch once that tile no longer matches (e.g. just tilled),
     * otherwise the guide stays locked on the front plot forever.
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
        if (this._stickyKey === key && this._stickyPos) {
            const stillGood = this.farm?.plotPosMatchesNeed(
                this._stickyPos.x,
                this._stickyPos.y,
                need,
            );
            if (stillGood) {
                const dx = fresh.x - this._stickyPos.x;
                const dy = fresh.y - this._stickyPos.y;
                if (dx * dx + dy * dy <= STICKY_SWITCH_SQ) {
                    this._stickyUntil = now + STICKY_MS;
                    return this._stickyPos;
                }
            }
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
            if (this._step === 'quest') this._tipLab.string = '露穗：点任务打开日志 · 点一下继续';
            else if (this._step === 'hand') this._tipLab.string = '露穗：先点下方「手」';
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
                ? `露穗：点镂空处拔草（还剩 ${left} 棵）`
                : '露穗：最后一棵了，轻轻拔掉';
        }
        return '露穗：走近杂草，点镂空处拔掉';
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
        // Journal entry sits left of the bag (not the claim chip).
        const btn = this.node.getComponent(FarmHUD)?.questBtnNode() ?? null;
        return this.uiNodeHole(btn);
    }

    /** Mainline quick-claim chip (QuestHud / QuestTracker). */
    private claimHole(): HoleRect | null {
        const dock = this.node.getChildByName('QuestHud');
        if (dock?.active) {
            const bar = dock.getChildByName('QuestTracker');
            const hole = this.uiNodeHole(bar?.active ? bar : dock);
            if (hole) return hole;
        }
        // Chrome restore race (town enter_town under Loading) can leave the
        // claim dock hidden for a frame — still aim the journal entry.
        return this.questHole();
    }

    private handHole(): HoleRect | null {
        return this.toolSlotHole('hand');
    }

    private handHoleNode(): Node | null {
        return this.node.getComponent(FarmHUD)?.hotbarSlotNode('hand') ?? null;
    }

    /** Generous hit on a UI guide target (hotbar slot etc.). */
    private hitUiGuideNode(uiX: number, uiY: number, node: Node | null): boolean {
        const hole = this.uiNodeHole(node);
        if (!hole) return false;
        const local = this.uiToCanvasLocal(uiX, uiY);
        const pad = 40;
        return (
            Math.abs(local.x - hole.x) <= hole.w * 0.5 + pad &&
            Math.abs(local.y - hole.y) <= hole.h * 0.5 + pad
        );
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
        const hud = this.node.getComponent(FarmHUD);
        // Loading / dialogue chrome restore can leave FarmHotbar inactive for a
        // tick — wake it before measuring, else the chevron falls through to soil.
        hud?.ensureDockVisible();
        const btn = hud?.bagBtnNode() ?? null;
        if (btn?.isValid && btn.active) {
            let parentOk = true;
            for (let p: Node | null = btn.parent; p; p = p.parent) {
                if (!p.active) {
                    parentOk = false;
                    break;
                }
            }
            if (parentOk) {
                const live = this.uiNodeHole(btn);
                if (live) return live;
            }
        } else if (btn?.isValid && !btn.active) {
            // Modal open — real bag badge is meant to be gone.
            if (hud.isBagOpen || hud.isModalOpen) return null;
            // Unlock fly / chrome hide — keep the seat so teach aims don't
            // snap to a soil plot for a frame.
            return this.bagHoleFallback();
        }
        // Button missing or parent chain still dark — keep the dock seat so
        // OpenBag / bag→hotbar never snaps to a world plot for one frame.
        if (!hud || hud.isBagOpen || hud.isModalOpen) return null;
        return this.bagHoleFallback();
    }

    /** Match FarmHUD.buildBagButton when the live node isn't measurable yet. */
    private bagHoleFallback(): HoleRect {
        const slot = 150;
        const gap = 4;
        const bagBtn = 180;
        const barInnerPad = 3;
        const barBgW = 7 * slot + 6 * gap + barInnerPad * 2;
        const edgePad = 9;
        const barY = -860;
        const x = barBgW * 0.5 - bagBtn * 0.5 - edgePad;
        const y = barY + slot * 0.5 + bagBtn * 0.5;
        return { x, y, w: bagBtn, h: bagBtn };
    }

    /**
     * Canvas-local hole for a UI node. Uses pivot + design contentSize so local
     * scale pulses (bag/quest unlock) can't change hole.h and yank the chevron.
     */
    private uiNodeHole(node: Node | null): HoleRect | null {
        if (!node?.isValid) return null;
        const ui = node.getComponent(UITransform);
        const canvasUi = this.node.getComponent(UITransform);
        if (!ui || !canvasUi) return null;
        const w = ui.contentSize.width;
        const h = ui.contentSize.height;
        if (w <= 0 || h <= 0) return null;
        const ax = ui.anchorX;
        const ay = ui.anchorY;
        // Pivot is stable under local scale; only walk parent scales for the
        // pivot→center offset (Canvas UI parents stay at scale 1).
        canvasUi.convertToNodeSpaceAR(node.worldPosition, this._localPt);
        let psx = 1;
        let psy = 1;
        for (let p = node.parent; p && p !== this.node; p = p.parent) {
            psx *= p.scale.x;
            psy *= p.scale.y;
        }
        return {
            x: this._localPt.x + w * (0.5 - ax) * psx,
            y: this._localPt.y + h * (0.5 - ay) * psy,
            w: w * Math.abs(psx),
            h: h * Math.abs(psy),
        };
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
        // Match CameraFollow / FarmHUD — World UIT is 0×0 and convertToWorldSpaceAR
        // can disagree with the snapped world.position math used for gameplay.
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

        // Off-screen “往×走” → hide floating finger (starlight path still leads).
        // On-screen click aims / UI → yellow arrow; path stays until the tap.
        // Bob AFTER clamp — claim / dock targets pin to the playfield floor and
        // would otherwise eat the sine offset every frame.
        const arrowDeg = this._idleOn ? this._idleArrowDeg : 0;
        const band = this.playfieldBand();
        // Quest / hand / claim / tool-swap sit in the bottom dock — don't force playfield band.
        const uiDock =
            (this._open && (this._step === 'quest' || this._step === 'hand')) ||
            (!this._open && this._idleOn && this._idleUiDock);
        // Screen-edge walk cues: path only (no floating finger). On-screen: arrow + path.
        const walkGuide = !this._open && this._idleOn && this._idleEdgeWalk;
        // Door / gate / pier / portal — glue chevron to the place cue.
        // World rings (plots / plants / NPCs) keep the arrow above the hole so
        // the tap target stays visible under the tip.
        const placeAim =
            !this._open &&
            this._idleOn &&
            !!this._idleRippleWorld &&
            !this._idleRippleInWorld &&
            !this._idleUiDock &&
            arrowDeg === 0;
        this.syncGroundPath();
        const rippleHole =
            (placeAim && this._idleRippleWorld
                ? this.worldPosHole(this._idleRippleWorld)
                : null) ?? this._hole;
        let fx = rippleHole.x;
        let fy = this._idleSilent ? top + 40 : top + 56;
        if (walkGuide) {
            finger.active = false;
            this.syncClickLabel(false);
            this.syncEdgeHalo(false, 0, 0);
        } else {
            finger.active = true;
            const bob = Math.sin(Date.now() * 0.01) * 12;
            if (placeAim) {
                fx = rippleHole.x;
                fy = rippleHole.y + PLACE_ARROW_ABOVE;
            } else if (arrowDeg === 90) {
                // Sit outside the hole (wide「学习」etc.) — not on the button face.
                fx = this._hole.x - this._hole.w * 0.5 - 56;
                fy = this._hole.y;
            } else if (arrowDeg === -90) {
                fx = this._hole.x + this._hole.w * 0.5 + 56;
                fy = this._hole.y;
            } else if (arrowDeg === 180) {
                fy = this._hole.y - 56;
            } else {
                // Upper-half UI (craft/bag close): sit closer to the hole so the
                // tip isn't tapped instead of the button underneath.
                const nearTop = uiDock && this._hole.y > 0;
                const above = this._idleSilent ? 40 : nearTop ? 28 : 56;
                fy = top + above;
            }
            if (uiDock) {
                fx = Math.max(-halfW + 40, Math.min(halfW - 40, fx));
                fy = Math.max(-halfH + 80, Math.min(halfH - 50, fy));
            } else if (placeAim) {
                // X only — Y stays on the place aim so door / portal don't split.
                fx = Math.max(band.x0 + 40, Math.min(band.x1 - 40, fx));
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
            finger.setScale(1, 1, 1);
            const fingerUi = finger.getComponent(UITransform);
            if (fingerUi) fingerUi.setContentSize(96, 96);
            this.syncGuideSprite(false);
            this.syncEdgeHalo(false, 0, 0);
            this.syncClickLabel(true);
        }

        if (withTip && tip && !walkGuide) {
            const tipHalfW = TIP_W * 0.5;
            const tipHalfH = TIP_H * 0.5;
            const minX = -halfW + SCREEN_INSET + tipHalfW;
            const maxX = halfW - SCREEN_INSET - tipHalfW;
            const minY = -halfH + SCREEN_INSET + tipHalfH;
            const maxY = halfH - SCREEN_INSET - tipHalfH;

            let tipY: number;
            if (arrowDeg === 180) {
                // North edge cue at screen top — banner sits under it.
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
     * Click aim / UI → yellow chevron. Walk cues use ground path (finger hidden).
     */
    private syncGuideSprite(walkGuide: boolean) {
        const sp = this._fingerSp;
        if (!sp?.isValid) return;
        const mode: 'arrow' | 'wisp' = walkGuide ? 'wisp' : 'arrow';
        const want = mode === 'wisp' ? this._wispFrame : this._arrowFrame;
        if (mode === this._guideMode && sp.spriteFrame && want && sp.spriteFrame === want) {
            this.disableFingerFallback();
            return;
        }
        this._guideMode = mode;
        if (want) {
            sp.spriteFrame = want;
            this.disableFingerFallback();
        } else {
            // Keep gold Graphics chevron until the SpriteFrame resolves.
            this.ensureFingerFallback();
        }
    }

    /** Warm disc behind the edge trail — reads even on bright dirt / flowers. */
    private syncEdgeHalo(edge: boolean, x: number, y: number) {
        if (!edge) {
            if (this._edgeHaloN?.isValid) this._edgeHaloN.active = false;
            return;
        }
        const n = this.ensureEdgeHalo();
        if (!n) return;
        n.active = true;
        n.setPosition(x, y, 0);
        const pulse = 0.92 + Math.sin(Date.now() * 0.008) * 0.1;
        n.setScale(pulse, pulse, 1);
        // Keep halo under the trail sprite.
        const finger = this._finger;
        if (finger?.isValid) n.setSiblingIndex(Math.max(0, finger.getSiblingIndex() - 1));
    }

    private ensureEdgeHalo(): Node | null {
        const root = this._root;
        if (!root?.isValid) return null;
        let n = this._edgeHaloN;
        if (n?.isValid && n.parent === root) return n;
        if (n?.isValid) n.destroy();

        n = new Node('EdgeHalo');
        n.layer = root.layer;
        n.setParent(root);
        n.active = false;
        n.addComponent(UITransform).setContentSize(160, 160);
        const g = n.addComponent(Graphics);
        // Soft stacked discs — dark rim + warm gold core (Graphics can't blur).
        g.fillColor = new Color(40, 28, 12, 110);
        g.circle(0, 0, 54);
        g.fill();
        g.fillColor = new Color(255, 200, 70, 90);
        g.circle(0, 0, 38);
        g.fill();
        g.fillColor = new Color(255, 240, 160, 70);
        g.circle(0, 0, 22);
        g.fill();
        this._edgeHaloN = n;
        this._edgeHaloG = g;
        return n;
    }

    /** 「点击」on yellow click-arrows (down / side UI aims — not edge walks / drag). */
    private syncClickLabel(on: boolean) {
        const lab = this._clickLab;
        if (!lab?.isValid) return;
        const host = lab.node;
        const deg = this._idleArrowDeg ?? 0;
        const side = deg === 90 || deg === -90;
        const sideOrDown = deg === 0 || side;
        const show =
            on &&
            !!this._finger?.active &&
            this._guideMode === 'arrow' &&
            sideOrDown &&
            !this._idleDragTo &&
            !this._idleEdgeWalk;
        host.active = show;
        if (!show) return;
        // Keep text upright when the chevron rotates (edge cues hide it anyway).
        host.setRotationFromEuler(0, 0, -deg);
        // Local +Y is the shaft base. Side aims put the wide text edge against
        // the chevron — clear half-width; down aims clear half-height.
        const half = (side ? CLICK_LAB_W : CLICK_LAB_H) * 0.5;
        host.setPosition(0, ARROW_EXTENT_UP + half + CLICK_LAB_GAP, 0);
    }

    /**
     * Loop: press on bag item → drag down to empty hotbar → release → reset.
     * Ghost item + dashed path make the gesture read as drag, not tap.
     */
    private layoutDragDemo(halfW: number, halfH: number) {
        const finger = this._finger;
        const dest = this._idleDragTo;
        if (!finger || !dest) return;
        this.syncClickLabel(false);

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
            // Drag reorder used to leave Finger under guide_ground_ripple.
            if (this._rippleN?.isValid) this.assertCanvasRippleUnderArrow(this._rippleN);
        }

        // Chevron rides just above the dragged icon (points into the drop slot).
        finger.setPosition(clampX(px), clampY(py) + 52, 0);
        finger.setRotationFromEuler(0, 0, 0);
        finger.setScale(1, 1, 1);
        const fingerUi = finger.getComponent(UITransform);
        if (fingerUi) fingerUi.setContentSize(96, 96);
        this.syncGuideSprite(false);
        this.syncEdgeHalo(false, 0, 0);
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
        const uuid = itemIcon(itemId);
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

    /**
     * Viewport for painting star-path motes. Wider than `playfieldBand` on the
     * sides / top (that band reserves ~200px under the info board for arrows,
     * which used to chop the trail mid-screen). Bottom floor matches the arrow
     * band so canvas trails never paint over hotbar / quest / bag badges —
     * GuidePath sits on TutorialGuideRoot above FarmHUD.
     */
    private pathPaintBand() {
        const { halfW, halfH } = this.canvasHalf();
        return {
            x0: -halfW + 12,
            x1: halfW - 12,
            y0: ARROW_UI_FLOOR,
            y1: halfH - 12,
        };
    }

    private isInPlayfield(hole: HoleRect): boolean {
        return this.isInPlayfieldInset(hole, 0);
    }

    /**
     * Edge latch: stay on the chevron until the aim is clearly inside the band
     * (inset), so lip jitter can't flip on-target ↔ edge every frame.
     */
    private isInPlayfieldForMode(hole: HoleRect): boolean {
        return this.isInPlayfieldInset(hole, this._edgeLatch ? EDGE_HYSTERESIS : 0);
    }

    private isInPlayfieldInset(hole: HoleRect, inset: number): boolean {
        const b = this.playfieldBand();
        const { halfW, halfH } = this.canvasHalf();
        const x0 = b.x0 + inset;
        const x1 = b.x1 - inset;
        const y0 = b.y0 + inset;
        // Left/civic column can use more of the top; right side yields to the clock board.
        const y1Soft = hole.x <= 120 ? halfH - 120 - inset : b.y1 - inset;
        // Only the clock/gold plaque — not the whole upper-right playfield.
        // A wide (x>80, y>halfH-340) exclude kept east-road / town-gate aims
        // stuck in edgeWalk (path only, no yellow chevron) while clearly on-screen.
        if (hole.x > halfW - 280 && hole.y > halfH - 200) return false;
        return hole.x >= x0 && hole.x <= x1 && hole.y >= y0 && hole.y <= y1Soft;
    }

    /**
     * Sticky weed aim for quest 1001 / HintGrass / craft-mats.
     * Priority: baked `*_tut_*` → yard → near weeds → any weed → litter.
     * Never aim at cottage body; prefer bushes/weeds over tiny twigs.
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
        let bestNearWeed: Node | null = null;
        let bestNearWeedSq = Number.POSITIVE_INFINITY;
        let bestNear: Node | null = null;
        let bestNearSq = Number.POSITIVE_INFINITY;
        let bestWeed: Node | null = null;
        let bestWeedSq = Number.POSITIVE_INFINITY;
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
            const litter = /_(?:twig|fiber|tuft)_/.test(n.name);
            if (dSq < bestAnySq) {
                bestAnySq = dSq;
                bestAny = n;
            }
            if (!litter && dSq < bestWeedSq) {
                bestWeedSq = dSq;
                bestWeed = n;
            }
            if (dSq <= rangeSq && dSq < bestNearSq) {
                bestNearSq = dSq;
                bestNear = n;
            }
            if (!litter && dSq <= rangeSq && dSq < bestNearWeedSq) {
                bestNearWeedSq = dSq;
                bestNearWeed = n;
            }
            if (n.name.includes('_tut_') && dSq < bestTutSq) {
                bestTutSq = dSq;
                bestTut = n;
            }
            if (
                !litter &&
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
        const fresh = bestTut ?? bestYard ?? bestNearWeed ?? bestWeed ?? bestNear ?? bestAny;
        if (!fresh) return null;

        const key = 'grass';
        const now = Date.now();
        // Keep the locked weed until pulled or a rival is clearly closer —
        // do NOT retarget just because STICKY_MS elapsed (that was a bounce).
        if (this._stickyKey === key && this._stickyNode?.isValid) {
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
                          : bestNearWeedSq < Number.POSITIVE_INFINITY
                            ? bestNearWeedSq
                            : bestWeedSq < Number.POSITIVE_INFINITY
                              ? bestWeedSq
                              : bestNearSq;
                if (
                    rivalSq + STICKY_SWITCH_SQ >= stickySq ||
                    !(bestTut ?? bestYard ?? bestNearWeed ?? bestWeed ?? bestNear)
                ) {
                    this._stickyUntil = now + STICKY_MS;
                    this._stickyPos = {
                        x: this._stickyNode.position.x,
                        y: this._stickyNode.position.y,
                    };
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
        // UI dock steps (hand / quest) need a wider pad — mouse aims the arrow tip.
        const uiStep = this._step === 'hand' || this._step === 'quest';
        const pad = HOLE_PAD + (uiStep ? 28 : 8);
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
        // Match FarmHUD / TouchJoystick — portraitVisibleSize, not raw visible alone.
        const vis = portraitVisibleSize();
        return {
            halfW: (ui?.contentSize.width || vis.width) * 0.5,
            halfH: (ui?.contentSize.height || vis.height) * 0.5,
        };
    }

    private _tipChromePainted = false;

    private build() {
        const canvas = this.node;
        const old = canvas.getChildByName('TutorialGuideRoot');
        if (old) old.destroy();

        assetManager.loadAny({ uuid: TUTORIAL_GUIDE_PREFAB_UUID }, (err, asset) => {
            if (err || !asset) {
                console.warn('[TutorialGuide] prefab missing', err);
                return;
            }
            const root = instantiate(asset as Prefab);
            root.name = 'TutorialGuideRoot';
            root.layer = canvas.layer;
            root.setParent(canvas);
            this._rootOp = root.getComponent(UIOpacity) ?? root.addComponent(UIOpacity);
            this._rootOp.opacity = 0;
            this._root = root;

            this._dimN = root.getChildByName('Dim');
            this._dimG = this._dimN?.getComponent(Graphics) ?? null;
            this._ringN = root.getChildByName('Ring');
            this._ringG = this._ringN?.getComponent(Graphics) ?? null;
            this._trailN = root.getChildByName('DragTrail');
            this._trailG = this._trailN?.getComponent(Graphics) ?? null;
            if (this._trailN) this._trailN.active = false;

            const ghost = root.getChildByName('DragGhost');
            if (ghost) {
                let ghostSp = ghost.getComponent(Sprite);
                if (!ghostSp) ghostSp = ghost.addComponent(Sprite);
                ghostSp.sizeMode = Sprite.SizeMode.CUSTOM;
                ghostSp.trim = false;
                this._dragGhostOp = ghost.getComponent(UIOpacity) ?? ghost.addComponent(UIOpacity);
                this._dragGhostOp.opacity = 220;
                ghost.active = false;
                this._dragGhost = ghost;
                this._dragGhostSp = ghostSp;
            }

            const finger = root.getChildByName('Finger');
            this._finger = finger;
            if (finger) finger.layer = canvas.layer;
            let sp = finger?.getComponent(Sprite) ?? null;
            if (finger && !sp) sp = finger.addComponent(Sprite);
            if (sp) {
                sp.sizeMode = Sprite.SizeMode.CUSTOM;
                sp.trim = false;
            }
            // Prefab: Graphics on child Fallback — same-node Sprite+Graphics after
            // instantiate cleared the chevron while ClickLab still drew.
            const fallbackN = finger?.getChildByName('Fallback') ?? null;
            if (fallbackN) fallbackN.layer = canvas.layer;
            this._fingerFallback =
                fallbackN?.getComponent(Graphics) ??
                finger?.getComponent(Graphics) ??
                null;
            this._fingerSp = sp;
            if (sp?.spriteFrame) {
                this._arrowFrame = sp.spriteFrame;
                this.disableFingerFallback();
            } else {
                this.ensureFingerFallback();
            }
            if (sp) this.loadGuideSprites(sp);

            const clickN = finger?.getChildByName('ClickLab') ?? null;
            this._clickLab = clickN?.getComponent(Label) ?? null;
            if (this._clickLab) {
                styleUiLabel(this._clickLab, {
                    size: 34,
                    color: new Color(255, 248, 220, 255),
                    outline: true,
                    outlineWidth: 3,
                    outlineColor: new Color(70, 42, 16, 255),
                });
                this._clickLab.horizontalAlign = Label.HorizontalAlign.CENTER;
                this._clickLab.verticalAlign = Label.VerticalAlign.CENTER;
                this._clickLab.overflow = Label.Overflow.SHRINK;
                this._clickLab.string = '点击';
            }
            if (clickN) clickN.active = false;

            this._tipRoot = root.getChildByName('Tip');
            this._tipLab = this._tipRoot?.getChildByName('TipLab')?.getComponent(Label) ?? null;
            if (this._tipLab) {
                styleUiLabel(this._tipLab, {
                    size: 30,
                    color: new Color(255, 244, 214, 255),
                    outline: true,
                    outlineWidth: 2,
                });
                this._tipLab.horizontalAlign = Label.HorizontalAlign.CENTER;
                this._tipLab.verticalAlign = Label.VerticalAlign.CENTER;
                this._tipLab.overflow = Label.Overflow.SHRINK;
            }
            this.paintTipChromeOnce();
            this.hideImmediate();
        });
    }

    private paintTipChromeOnce() {
        if (this._tipChromePainted || !this._tipRoot?.isValid) return;
        const tipBg = this._tipRoot.getComponent(Graphics);
        if (!tipBg) return;
        const tw = TIP_W;
        const th = TIP_H;
        tipBg.clear();
        tipBg.fillColor = new Color(48, 34, 22, 230);
        tipBg.roundRect(-tw * 0.5, -th * 0.5, tw, th, 14);
        tipBg.fill();
        tipBg.strokeColor = new Color(230, 190, 110, 255);
        tipBg.lineWidth = 3;
        tipBg.roundRect(-tw * 0.5, -th * 0.5, tw, th, 14);
        tipBg.stroke();
        this._tipChromePainted = true;
    }

    private loadGuideSprites(sp: Sprite) {
        const applyIf = (mode: 'arrow' | 'wisp', frame: SpriteFrame) => {
            if (this._guideMode !== mode || !sp.isValid) return;
            sp.spriteFrame = frame;
            this.disableFingerFallback();
        };
        const arrowUuid = QUEST_FRAMES.questArrow;
        if (arrowUuid) {
            assetManager.loadAny({ uuid: arrowUuid }, (err, asset) => {
                if (err || !asset || !sp.isValid) {
                    if (this._guideMode === 'arrow') this.ensureFingerFallback();
                    return;
                }
                this._arrowFrame = asset as SpriteFrame;
                applyIf('arrow', this._arrowFrame);
            });
        } else if (this._guideMode === 'arrow' && !sp.spriteFrame) {
            this.ensureFingerFallback();
        }
        const wispUuid = QUEST_FRAMES.questWisp;
        if (wispUuid) {
            assetManager.loadAny({ uuid: wispUuid }, (err, asset) => {
                if (err || !asset) return;
                this._wispFrame = asset as SpriteFrame;
                applyIf('wisp', this._wispFrame);
            });
        }
    }

    private disableFingerFallback() {
        const fg = this._fingerFallback;
        if (!fg?.isValid) return;
        fg.clear();
        fg.enabled = false;
        if (fg.node?.isValid && fg.node !== this._finger) fg.node.active = false;
    }

    private ensureFingerFallback() {
        let fg = this._fingerFallback;
        const finger = this._finger;
        if (!fg?.isValid && finger?.isValid) {
            let n = finger.getChildByName('Fallback');
            if (!n?.isValid) {
                n = new Node('Fallback');
                n.layer = finger.layer;
                n.setParent(finger);
                n.addComponent(UITransform).setContentSize(96, 96);
                n.setSiblingIndex(0);
            }
            fg = n.getComponent(Graphics) ?? n.addComponent(Graphics);
            this._fingerFallback = fg;
        }
        if (!fg?.isValid) return;
        fg.enabled = true;
        if (fg.node?.isValid) fg.node.active = true;
        this.paintFingerFallback(fg);
    }

    /**
     * Ground starlight trail: player feet → quest world aim (A*).
     * World walk aims only (not hotbar / drag / silent tool-swap).
     */
    private syncGroundPath() {
        const want =
            this._idleOn &&
            !this._open &&
            !this._idleUiDock &&
            !this._idleDragTo &&
            !this._idleSilent;
        const goal = this._idlePathWorld ?? this._idleRippleWorld ?? this._stickyPos;
        const player = this.farm?.player;
        if (!want || !goal || !player?.isValid) {
            this.hideGroundPath();
            return;
        }

        const now = Date.now();
        const px = player.position.x;
        const py = player.position.y;
        const goalMoved =
            !this._pathGoal ||
            Math.hypot(this._pathGoal.x - goal.x, this._pathGoal.y - goal.y) > 18;
        if (goalMoved || now >= this._pathRepathAt || !this._pathWaypoints.length) {
            const ctrl = player.getComponent(PlayerController);
            if (!ctrl) {
                this.hideGroundPath();
                return;
            }
            // Solids may lag a frame after world rebuild — refresh cheaply.
            if (!ctrl.pathSolids.length) ctrl.rebuildSolids();
            // Cache sparse corridor only — paint samples rebuild from live feet below.
            this._pathWaypoints = ctrl.previewPath(goal.x, goal.y);
            this._pathGoal = { x: goal.x, y: goal.y };
            this._pathRepathAt = now + PATH_REPATH_MS;
        }

        // Every frame: densify from current feet so the trail sticks while walking.
        // A* stays on the PATH_REPATH_MS budget above.
        this.trimPathWaypointsAhead(px, py);
        this._pathPts = this.densifyPath(
            [{ x: px, y: py }, ...this._pathWaypoints],
            PATH_DOT_STEP,
            PATH_DOT_MAX,
        );
        // Canvas place rings sit on top of props (craftbench desk / porch).
        // A* stops outside solids, so extend the painted tip onto the ring —
        // otherwise stars die at the table lip and look "occluded".
        this.extendPathToCanvasRing();

        const inWorld = this.shouldPathInWorld();
        const root = this.ensurePathRoot(inWorld);
        if (!root) return;
        if (!inWorld) {
            root.active = true;
            this.assertGuidePathLayer();
            // Already on canvas (no root rebuild) — still purge leftover World motes.
            if (!this._orphanPathSweepDone) {
                this.sweepOrphanWorldPathDots();
                this._orphanPathSweepDone = true;
            }
        } else {
            this._orphanPathSweepDone = false;
        }
        this.loadPathDotFrames();

        const frames = this._pathDotFrames;
        const fallback = this._pathDotFrames[0] ?? null;
        // Slow traveling shimmer along the trail (not a harsh per-dot blink).
        const t = now * 0.0042;
        const wave = now * 0.0031;
        // Full viewport (not arrow playfieldBand) so the trail reaches screen edges.
        const band = this.pathPaintBand();
        // Trail starts ahead of the body toward the goal — never behind / through the sprite.
        const startI = this.pathTrailStartIndex(px, py);
        // Collect every on-screen sample first, then paint (thin evenly if over budget).
        // Early PATH_VISIBLE_MAX break used to clip the trail mid-playfield.
        const visible: { i: number; x: number; y: number }[] = [];
        for (let i = startI; i < this._pathPts.length; i++) {
            const pt = this._pathPts[i]!;
            // Safety: skip zigzags that still skim the character AABB.
            if (this.pathDotHitsBody(pt.x - px, pt.y - py)) continue;
            const hole = this.worldPosHole(pt);
            if (!hole) continue;
            // Paint through the whole viewport; off-screen samples stay walk-only.
            if (
                hole.x < band.x0 ||
                hole.x > band.x1 ||
                hole.y < band.y0 ||
                hole.y > band.y1
            ) {
                continue;
            }
            // World motes use world feet; canvas shares the place-ring stack.
            visible.push(inWorld ? { i, x: pt.x, y: pt.y } : { i, x: hole.x, y: hole.y });
        }
        const pick = this.thinPathVisible(visible, PATH_VISIBLE_MAX);
        const world = inWorld ? this.farm?.world ?? null : null;
        let shown = 0;
        for (let s = 0; s < pick.length; s++) {
            const sample = pick[s]!;
            const dot = this.ensurePathDot(shown, inWorld);
            if (!dot) break;
            // Live world motes must be direct World children for per-dot Y-sort.
            if (inWorld && world?.isValid && dot.parent !== world) {
                dot.layer = world.layer;
                dot.setParent(world);
            }
            dot.active = true;
            // Soft float — tiny bob, no sideways jitter (that looked like dirt flecks).
            const bob = Math.sin(t + sample.i * 0.55) * 1.4;
            dot.setPosition(sample.x, sample.y - 4 + bob, 0);
            const breath = 0.96 + Math.sin(t * 1.1 + sample.i * 0.4) * 0.08;
            dot.setScale(breath, breath, 1);
            // Flowing bright crest — keep a high floor so dirt paths still read.
            const crest = 0.5 + 0.5 * Math.sin(wave * 2.2 - shown * 0.4);
            const op = dot.getComponent(UIOpacity);
            if (op) op.opacity = Math.round(210 + crest * 45);
            const sp = dot.getComponent(Sprite);
            if (sp && frames.length) {
                // Soft / spark only — never the dim frame (vanishes on sand).
                const fi = crest > 0.65 ? 2 : shown % 2 === 0 ? 0 : 3;
                const frame = frames[fi] ?? fallback;
                if (frame && sp.spriteFrame !== frame) sp.spriteFrame = frame;
            }
            shown++;
        }
        for (let i = shown; i < this._pathDots.length; i++) {
            this.parkPathDot(this._pathDots[i]);
        }
        // Hierarchy size changed (pool ↔ world) — force a Y-sort rebuild.
        if (inWorld) world?.getComponent(WorldYSort)?.sortNow();
    }

    /**
     * Keep the full visible span of the star trail. If over budget, subsample
     * evenly (always keep first + last) instead of truncating the tip.
     */
    private thinPathVisible<T>(samples: T[], max: number): T[] {
        const n = samples.length;
        if (n <= max) return samples;
        if (max <= 1) return samples.slice(0, max);
        const out: T[] = [];
        const last = max - 1;
        for (let k = 0; k <= last; k++) {
            const idx = Math.round((k * (n - 1)) / last);
            out.push(samples[idx]!);
        }
        return out;
    }

    private densifyPath(pts: WorldPos[], step: number, maxDots: number): WorldPos[] {
        if (pts.length < 2) return pts.slice(0, maxDots);
        const out: WorldPos[] = [{ x: pts[0]!.x, y: pts[0]!.y }];
        let carry = 0;
        for (let i = 1; i < pts.length && out.length < maxDots; i++) {
            const a = pts[i - 1]!;
            const b = pts[i]!;
            let dx = b.x - a.x;
            let dy = b.y - a.y;
            let len = Math.hypot(dx, dy);
            if (len < 1e-3) continue;
            dx /= len;
            dy /= len;
            let d = step - carry;
            while (d < len && out.length < maxDots) {
                out.push({ x: a.x + dx * d, y: a.y + dy * d });
                d += step;
            }
            carry = len - (d - step);
            if (carry < 0) carry = 0;
        }
        const last = pts[pts.length - 1]!;
        const tip = out[out.length - 1]!;
        if (Math.hypot(tip.x - last.x, tip.y - last.y) > step * 0.35 && out.length < maxDots) {
            out.push({ x: last.x, y: last.y });
        }
        return out;
    }

    /**
     * Canvas place rings (craftbench / doors / pier) float over props.
     * Climb the star tip onto that ring so the trail doesn't stop at the lip.
     */
    private extendPathToCanvasRing() {
        if (!this._idleGroundRipple || this._idleRippleInWorld) return;
        const tip = this._idleRippleWorld;
        if (!tip) return;
        const pts = this._pathPts;
        if (!pts.length) {
            pts.push({ x: tip.x, y: tip.y });
            return;
        }
        const last = pts[pts.length - 1]!;
        if (Math.hypot(last.x - tip.x, last.y - tip.y) < PATH_DOT_STEP * 0.4) {
            pts[pts.length - 1] = { x: tip.x, y: tip.y };
            return;
        }
        const climb = this.densifyPath([last, tip], PATH_DOT_STEP, PATH_DOT_MAX);
        for (let i = 1; i < climb.length && pts.length < PATH_DOT_MAX; i++) {
            pts.push(climb[i]!);
        }
    }

    /**
     * First path index that is ahead of the player by PATH_START_CLEAR.
     * Drops the segment under / behind the body so motes only lead toward the goal.
     */
    private pathTrailStartIndex(px: number, py: number): number {
        const pts = this._pathPts;
        if (pts.length < 2) return pts.length;
        let nearest = 0;
        let nearestDist = Infinity;
        for (let i = 0; i < pts.length; i++) {
            const pt = pts[i]!;
            const d = Math.hypot(pt.x - px, pt.y - py);
            if (d < nearestDist) {
                nearestDist = d;
                nearest = i;
            }
        }
        let along = 0;
        for (let i = nearest; i < pts.length - 1; i++) {
            const a = pts[i]!;
            const b = pts[i + 1]!;
            along += Math.hypot(b.x - a.x, b.y - a.y);
            if (along >= PATH_START_CLEAR) return i + 1;
        }
        // Almost at the goal — still show the last samples from the feet.
        return Math.min(nearest + 1, pts.length - 1);
    }

    /** True when a world offset sits on the feet stand point (avoid stacked motes). */
    private pathDotHitsBody(dx: number, dy: number): boolean {
        return Math.abs(dx) <= PATH_BODY_HW && dy >= -PATH_BODY_DOWN && dy <= PATH_BODY_UP;
    }

    /**
     * Drop corridor vertices the player has already passed so densify stays
     * glued to the feet instead of stretching back to stale A* samples.
     */
    private trimPathWaypointsAhead(px: number, py: number) {
        const wps = this._pathWaypoints;
        while (wps.length > 1) {
            const a = wps[0]!;
            const b = wps[1]!;
            const ax = a.x - px;
            const ay = a.y - py;
            const bx = b.x - px;
            const by = b.y - py;
            // Past vertex A when B is closer and A is behind the A→B direction.
            if (ax * ax + ay * ay <= bx * bx + by * by + 4) break;
            const abx = b.x - a.x;
            const aby = b.y - a.y;
            if (ax * abx + ay * aby > 0) break;
            wps.shift();
        }
        // Single leftover tip already underfoot — keep it (densify + start clear).
    }

    private hideGroundPath() {
        this._pathPts.length = 0;
        this._pathWaypoints.length = 0;
        this._pathGoal = null;
        this._pathRepathAt = 0;
        const root = this._pathRoot;
        if (root?.isValid && !this._pathInWorld) root.active = false;
        for (let i = 0; i < this._pathDots.length; i++) {
            this.parkPathDot(this._pathDots[i]);
        }
        if (this._pathInWorld) {
            this.farm?.world?.getComponent(WorldYSort)?.sortNow();
        }
    }

    /**
     * Destroy every tracked mote (+ any orphan World `guide_path_dot`).
     * Required before world↔canvas root swaps — live motes are World children,
     * so clearing `_pathDots` alone leaves ghost trails on the ground.
     */
    private releaseAllPathDots() {
        for (let i = 0; i < this._pathDots.length; i++) {
            const n = this._pathDots[i];
            if (n?.isValid) n.destroy();
        }
        this._pathDots = [];
        this.sweepOrphanWorldPathDots();
    }

    /** Remove stray `guide_path_dot` nodes left under World after failed parks. */
    private sweepOrphanWorldPathDots() {
        const world = this.farm?.world;
        if (!world?.isValid) return;
        const kids = world.children.slice();
        let swept = false;
        for (let i = 0; i < kids.length; i++) {
            const c = kids[i]!;
            if (c.isValid && c.name === 'guide_path_dot') {
                c.destroy();
                swept = true;
            }
        }
        if (swept) world.getComponent(WorldYSort)?.sortNow();
    }

    /**
     * World-ripple aims (ore / plots / plants / NPCs): each mote is a World
     * child so timber / rocks / buildings occlude by footY. Soft garden decor
     * is promoted past in WorldYSort so bushes don't punch holes in the trail.
     * Canvas place rings (craftbench / doors / pier) keep the trail on Canvas
     * so it can climb onto the floating ring over desk/porch sprites.
     */
    private shouldPathInWorld(): boolean {
        if (this._idleGroundRipple && !this._idleRippleInWorld) return false;
        return true;
    }

    private ensurePathRoot(inWorld = this.shouldPathInWorld()): Node | null {
        if (inWorld) return this.ensureWorldPathPool();
        return this.ensureCanvasPathRoot();
    }

    private ensureCanvasPathRoot(): Node | null {
        const root = this._root;
        if (!root?.isValid) return null;
        let n = this._pathRoot;
        if (n?.isValid && n.parent === root && !this._pathInWorld) {
            this.assertGuidePathLayer();
            return n;
        }
        // World→canvas: motes sit under World, not the pool — release first.
        this.releaseAllPathDots();
        if (n?.isValid) n.destroy();
        n = new Node('GuidePath');
        n.layer = root.layer;
        n.setParent(root);
        n.addComponent(UITransform).setContentSize(10, 10);
        n.active = false;
        this._pathRoot = n;
        this._pathInWorld = false;
        this.assertGuidePathLayer();
        return n;
    }

    /**
     * Off-world pool for unused motes. Live dots parent directly under World.
     */
    private ensureWorldPathPool(): Node | null {
        const root = this._root;
        const world = this.farm?.world;
        if (!root?.isValid || !world?.isValid) return null;
        let n = this._pathRoot;
        if (n?.isValid && n.parent === root && this._pathInWorld && n.name === 'guide_path_pool') {
            return n;
        }
        this.releaseAllPathDots();
        if (n?.isValid) n.destroy();
        n = new Node('guide_path_pool');
        n.layer = root.layer;
        n.setParent(root);
        n.addComponent(UITransform).setContentSize(10, 10);
        n.active = false;
        this._pathRoot = n;
        this._pathInWorld = true;
        world.getComponent(WorldYSort)?.sortNow();
        return n;
    }

    /** Deactivate a mote and keep it out of WorldYSort when unused. */
    private parkPathDot(n: Node | null | undefined) {
        if (!n?.isValid) return;
        n.active = false;
        const pool = this._pathRoot;
        if (this._pathInWorld && pool?.isValid && n.parent !== pool) {
            n.layer = pool.layer;
            n.setParent(pool);
        }
    }

    /**
     * Star path shares the canvas place-ring stack: just under the circle,
     * circle just under the chevron — same layer story as guide_ground_ripple.
     */
    private assertGuidePathLayer() {
        const path = this._pathRoot;
        const root = this._root;
        if (!path?.isValid || !root?.isValid || path.parent !== root || this._pathInWorld) {
            return;
        }
        const ripple = this._rippleN;
        const finger = this._finger;
        if (ripple?.isValid && ripple.active && ripple.parent === root) {
            const want = Math.max(0, ripple.getSiblingIndex());
            if (path.getSiblingIndex() !== want) path.setSiblingIndex(want);
            // Inserting path at ripple's index pushes the ring up — keep ring above.
            if (ripple.getSiblingIndex() <= path.getSiblingIndex()) {
                ripple.setSiblingIndex(path.getSiblingIndex() + 1);
            }
            this.assertCanvasRippleUnderArrow(ripple);
            return;
        }
        if (finger?.isValid && finger.parent === root) {
            const want = Math.max(0, finger.getSiblingIndex() - 1);
            if (path.getSiblingIndex() !== want) path.setSiblingIndex(want);
            return;
        }
        if (path.getSiblingIndex() !== 1) path.setSiblingIndex(1);
    }

    private ensurePathDot(index: number, inWorld = this._pathInWorld): Node | null {
        const root = this.ensurePathRoot(inWorld);
        if (!root) return null;
        let n = this._pathDots[index];
        if (n?.isValid) {
            // World live parent is World; pool/canvas parent is root.
            const okParent =
                (!inWorld && n.parent === root) ||
                (inWorld && (n.parent === root || n.parent === this.farm?.world));
            if (okParent) {
                if (inWorld && n.name !== 'guide_path_dot') n.name = 'guide_path_dot';
                this.stylePathDot(n);
                return n;
            }
            // Wrong parent — replace, don't leave the old mote on World.
            n.destroy();
        }
        n = new Node(inWorld ? 'guide_path_dot' : `PathDot_${index}`);
        n.layer = root.layer;
        n.setParent(root);
        n.addComponent(UITransform).setContentSize(PATH_DOT_SIZE, PATH_DOT_SIZE);
        const sp = n.addComponent(Sprite);
        sp.sizeMode = Sprite.SizeMode.CUSTOM;
        sp.trim = false;
        if (this._pathDotFrames[0]) sp.spriteFrame = this._pathDotFrames[0];
        n.addComponent(UIOpacity).opacity = 210;
        this._pathDots[index] = n;
        this.stylePathDot(n);
        return n;
    }

    /** Soft additive mote — bright on grass, no muddy dark fringe. */
    private stylePathDot(n: Node) {
        const ui = n.getComponent(UITransform);
        if (ui) ui.setContentSize(PATH_DOT_SIZE, PATH_DOT_SIZE);
        const sp = n.getComponent(Sprite);
        if (!sp) return;
        sp.srcBlendFactor = gfx.BlendFactor.SRC_ALPHA;
        sp.dstBlendFactor = gfx.BlendFactor.ONE;
        sp.color = new Color(255, 246, 210, 255);
    }

    private loadPathDotFrames() {
        if (this._pathFramesLoaded) return;
        this._pathFramesLoaded = true;
        const keys = [
            QUEST_FRAMES.questPathDot0,
            QUEST_FRAMES.questPathDot1,
            QUEST_FRAMES.questPathDot2,
            QUEST_FRAMES.questPathDot3,
            QUEST_FRAMES.questPathDot,
        ];
        const frames: SpriteFrame[] = [];
        let pending = 0;
        for (let i = 0; i < keys.length; i++) {
            const uuid = keys[i];
            if (!uuid) continue;
            pending++;
            const slot = i;
            assetManager.loadAny({ uuid }, (err, asset) => {
                pending--;
                if (!err && asset) frames[slot] = asset as SpriteFrame;
                if (pending <= 0) {
                    this._pathDotFrames = frames.filter(Boolean);
                    // Apply first frame to any already-spawned dots.
                    const first = this._pathDotFrames[0];
                    if (first) {
                        for (const n of this._pathDots) {
                            const sp = n?.getComponent(Sprite);
                            if (sp && !sp.spriteFrame) sp.spriteFrame = first;
                        }
                    }
                }
            });
        }
        if (pending === 0) this._pathFramesLoaded = false;
    }

    /**
     * If a world tap lands on the place aim (ripple or door portal beam), snap
     * walk-to to the feet goal so click-move and the guide share one destination.
     */
    snapPlaceAim(wx: number, wy: number, radius = 96): { x: number; y: number } | null {
        if (!this._idleOn || this._idleUiDock) return null;
        const aim = this._idleRippleWorld;
        if (!aim) return null;
        if ((this._idleArrowDeg ?? 0) !== 0) return null;
        if (Math.hypot(wx - aim.x, wy - aim.y) > radius) return null;
        // Portal aims lock on the beam but walk to door feet (pathWorld).
        const dest = this._idlePathWorld ?? aim;
        return { x: dest.x, y: dest.y };
    }

    /**
     * Quest-only click-to-move: when the idle guide has a world feet goal
     * (starlight path / place ring), empty-ground taps walk there. Hotbar /
     * claim UI docks return null — stick remains the only free roam move.
     */
    questClickMoveDest(wx: number, wy: number): { x: number; y: number } | null {
        if (!this._idleOn || this._idleUiDock) return null;
        const snapped = this.snapPlaceAim(wx, wy);
        if (snapped) return snapped;
        const dest = this._idlePathWorld;
        if (!dest) return null;
        return { x: dest.x, y: dest.y };
    }

    /**
     * Idle farm chevron sits well above the tile hole — remap UI taps on the
     * arrow / hole / tip banner back to the sticky world aim so till / plant /
     * water / boost fire (chevron taps otherwise round() onto the north soil).
     */
    snapIdleActAim(uiX: number, uiY: number): WorldPos | null {
        if (!this._idleOn || this._idleUiDock || this._idleEdgeWalk) return null;
        if ((this._idleArrowDeg ?? 0) !== 0) return null;
        const aim = this._idlePathWorld ?? this._stickyPos ?? this._idleRippleWorld;
        if (!aim) return null;
        const local = this.uiToCanvasLocal(uiX, uiY);
        const hx = this._hole.x;
        const hy = this._hole.y;
        const hw = this._hole.w * 0.5 + HOLE_PAD + 24;
        const hh = this._hole.h * 0.5 + HOLE_PAD + 24;
        // layoutChrome: arrow at hole-top + 56 (+ bob); tip may sit above or
        // clamp under the hole when the crop is high on screen.
        const arrowTop = hy + this._hole.h * 0.5 + HOLE_PAD + 56 + 72;
        const tipBot = hy - this._hole.h * 0.5 - HOLE_PAD - TIP_H - TIP_ARROW_GAP - 24;
        const tipTop = arrowTop + TIP_H + TIP_ARROW_GAP + 24;
        const onHole =
            Math.abs(local.x - hx) <= hw && Math.abs(local.y - hy) <= hh;
        // Tip banner is wide; keep X modest so left-dock UI isn't swallowed.
        const onArrowOrTip =
            Math.abs(local.x - hx) <= Math.max(96, hw) &&
            local.y >= tipBot &&
            local.y <= tipTop;
        if (!onHole && !onArrowOrTip) return null;
        return { x: aim.x, y: aim.y };
    }

    /**
     * Click aims: light ring under the chevron.
     * - World ring (plots / plants / NPCs): ground-band Y-sort — over soil, under crops.
     * - Canvas ring (doors / gates / pier): stays above porch facades.
     */
    private syncGroundRipple() {
        // Click-move owns destination chrome while auto-walking — never stack rings.
        if (this.node.getComponent(ClickMoveMarker)?.isActive) {
            this.hideGroundRipple();
            return;
        }
        const aim = this._idleRippleWorld;
        const want =
            this._idleOn &&
            this._idleGroundRipple &&
            !this._idleUiDock &&
            !this._idleDragTo &&
            (this._idleArrowDeg ?? 0) === 0 &&
            !!aim;
        if (!want || !aim) {
            this.hideGroundRipple();
            return;
        }
        const world = this.farm?.world;
        if (!world?.isValid) {
            this.hideGroundRipple();
            return;
        }

        if (this._idleRippleInWorld) {
            this.hideCanvasRipple();
            const n = this.ensureWorldRipple();
            if (!n) return;
            n.active = true;
            n.setPosition(aim.x, aim.y, 0);
            this.applyGroundRippleSize(n, 1);
            this.pulseRippleNode(n, this._worldRippleOp, 'world');
            return;
        }

        this.hideWorldRipple();
        const hole = this.worldPosHole(aim);
        if (!hole) {
            this.hideCanvasRipple();
            return;
        }
        const n = this.ensureCanvasRipple();
        if (!n) return;
        n.active = true;
        n.setPosition(hole.x, hole.y, 0);
        this.applyGroundRippleSize(n, world.scale.x);
        // Arrow must cover the ring — drag demo used to yank Finger under it.
        this.assertCanvasRippleUnderArrow(n);
        this.pulseRippleNode(n, this._rippleOp, 'canvas');
    }

    /** Canvas place ring stays under Finger (chevron) / Tip. */
    private assertCanvasRippleUnderArrow(ripple: Node) {
        const finger = this._finger;
        if (!finger?.isValid || finger.parent !== ripple.parent) return;
        const want = Math.max(0, finger.getSiblingIndex() - 1);
        if (ripple.getSiblingIndex() !== want) ripple.setSiblingIndex(want);
        // If Tip somehow sat between them, bump Finger back above the ring.
        if (ripple.getSiblingIndex() >= finger.getSiblingIndex()) {
            finger.setSiblingIndex(ripple.getSiblingIndex() + 1);
        }
    }

    private hideGroundRipple() {
        this.hideCanvasRipple();
        this.hideWorldRipple();
    }

    private hideCanvasRipple() {
        const n = this._rippleN;
        this._ripplePulsing = false;
        if (!n?.isValid) return;
        if (this._rippleOp) Tween.stopAllByTarget(this._rippleOp);
        Tween.stopAllByTarget(n);
        n.active = false;
        n.setScale(1, 1, 1);
        if (this._rippleOp) this._rippleOp.opacity = 0;
    }

    private hideWorldRipple() {
        const n = this._worldRippleN;
        this._worldRipplePulsing = false;
        if (!n?.isValid) return;
        if (this._worldRippleOp) Tween.stopAllByTarget(this._worldRippleOp);
        Tween.stopAllByTarget(n);
        n.active = false;
        n.setScale(1, 1, 1);
        if (this._worldRippleOp) this._worldRippleOp.opacity = 0;
    }

    private ensureCanvasRipple(): Node | null {
        const root = this._root;
        if (!root?.isValid) return null;
        let n = this._rippleN;
        if (n?.isValid && n.parent === root) return n;
        if (n?.isValid) n.destroy();
        this._ripplePulsing = false;

        n = new Node('guide_ground_ripple');
        n.layer = root.layer;
        n.setParent(root);
        // Under Finger / Tip; above dim + path so porch aims stay readable.
        this.assertCanvasRippleUnderArrow(n);
        n.active = false;
        const ui = n.addComponent(UITransform);
        ui.setAnchorPoint(0.5, 0.5);
        this.applyGroundRippleSize(n, this.farm?.world?.scale.x ?? 1);
        const sp = n.addComponent(Sprite);
        sp.sizeMode = Sprite.SizeMode.CUSTOM;
        sp.trim = false;
        const op = n.addComponent(UIOpacity);
        op.opacity = 0;
        this._rippleN = n;
        this._rippleSp = sp;
        this._rippleOp = op;
        this._rippleLoaded = false;
        this.loadRippleFrame('canvas');
        return n;
    }

    private ensureWorldRipple(): Node | null {
        const world = this.farm?.world;
        if (!world?.isValid) return null;
        let n = this._worldRippleN;
        if (n?.isValid && n.parent === world) return n;
        if (n?.isValid) n.destroy();
        this._worldRipplePulsing = false;

        n = new Node('guide_aim_ripple');
        n.layer = world.layer;
        n.setParent(world);
        n.active = false;
        const ui = n.addComponent(UITransform);
        ui.setAnchorPoint(0.5, 0.5);
        this.applyGroundRippleSize(n, 1);
        const sp = n.addComponent(Sprite);
        sp.sizeMode = Sprite.SizeMode.CUSTOM;
        sp.trim = false;
        const op = n.addComponent(UIOpacity);
        op.opacity = 0;
        this._worldRippleN = n;
        this._worldRippleSp = sp;
        this._worldRippleOp = op;
        this._worldRippleLoaded = false;
        this.loadRippleFrame('world');
        // Force WorldYSort to rebuild with the new ground-band child.
        world.getComponent(WorldYSort)?.sortNow();
        return n;
    }

    private applyGroundRippleSize(n: Node, worldScale = 1) {
        const ui = n.getComponent(UITransform);
        if (!ui) return;
        const px = PLACE_RIPPLE_WORLD * Math.max(0.0001, worldScale);
        if (
            Math.abs(ui.contentSize.width - px) > 0.5 ||
            Math.abs(ui.contentSize.height - px) > 0.5
        ) {
            ui.setContentSize(px, px);
        }
    }

    private loadRippleFrame(kind: 'canvas' | 'world') {
        const sp = kind === 'world' ? this._worldRippleSp : this._rippleSp;
        const loaded = kind === 'world' ? this._worldRippleLoaded : this._rippleLoaded;
        if (!sp?.isValid || loaded) return;
        const uuid = FISHING_FRAMES.groundRipple;
        if (!uuid) return;
        assetManager.loadAny({ uuid }, (err, asset) => {
            if (err || !asset || !sp.isValid) return;
            sp.spriteFrame = asset as SpriteFrame;
            sp.sizeMode = Sprite.SizeMode.CUSTOM;
            if (kind === 'world') {
                const host = this._worldRippleN;
                if (host?.isValid) this.applyGroundRippleSize(host, 1);
                this._worldRippleLoaded = true;
            } else {
                const host = this._rippleN;
                if (host?.isValid) {
                    this.applyGroundRippleSize(host, this.farm?.world?.scale.x ?? 1);
                }
                this._rippleLoaded = true;
            }
        });
    }

    /** Expand + fade loop so the tap spot reads as “click here”. */
    private pulseRippleNode(n: Node, op: UIOpacity | null, kind: 'canvas' | 'world') {
        if (!n?.isValid || !op?.isValid || !n.active) return;
        if (kind === 'world') {
            if (this._worldRipplePulsing) return;
            this._worldRipplePulsing = true;
        } else {
            if (this._ripplePulsing) return;
            this._ripplePulsing = true;
        }
        n.setScale(0.85, 0.85, 1);
        op.opacity = 255;
        tween(n)
            .repeatForever(
                tween(n)
                    .to(1.1, { scale: new Vec3(1.15, 1.15, 1) }, { easing: 'sineOut' })
                    .set({ scale: new Vec3(0.85, 0.85, 1) }),
            )
            .start();
        tween(op)
            .repeatForever(
                tween(op)
                    .to(1.1, { opacity: 140 }, { easing: 'sineOut' })
                    .set({ opacity: 255 }),
            )
            .start();
    }

    /** Temporary flat chevron if the AI sprite is missing. */
    private paintFingerFallback(g: Graphics) {
        g.enabled = true;
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
