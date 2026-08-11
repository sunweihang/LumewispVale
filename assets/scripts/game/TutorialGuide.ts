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
    gfx,
    tween,
    Tween,
} from 'cc';
import { GotoAction } from '../cfg/schema';
import { ClickMoveMarker } from './ClickMoveMarker';
import { DialoguePanel } from './DialoguePanel';
import { FarmHUD } from './FarmHUD';
import { FarmSystem } from './FarmSystem';
import { FarmWorldLayout } from './FarmWorldLayout';
import { FISHING_FRAMES } from './FishingFrames';
import { FishingMinigame } from './FishingMinigame';
import { GameState } from './GameState';
import { InputBridge } from './InputBridge';
import { PlayerController } from './PlayerController';
import { QUEST_FRAMES } from './QuestFrames';
import { QuestPanel } from './QuestPanel';
import { QuestSystem } from './QuestSystem';
import { RewardPopup } from './RewardPopup';
import { StoryIntroPanel } from './StoryIntroPanel';
import { StoryWorldHooks } from './StoryWorldHooks';
import { TOOL_FRAMES } from './ToolFrames';
import { TownShopPanel } from './TownShopPanel';
import { portraitVisibleSize } from './PortraitFit';
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
/**
 * Soft top inset for the playfield band. Info-board corner is excluded
 * separately — left/civic aims (mayor) must stay on-target when visible.
 */
const ARROW_TOP_RESERVE = 200;
/** Chevron half-height above its node center (sprite / fallback). */
const ARROW_EXTENT_UP = 48;
/**
 * Place-aim chevron center above the ground-ripple origin.
 * Tip sits ~8px above the ring (96px sprite, tip ≈ center − 48).
 */
const PLACE_ARROW_ABOVE = 56;
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
/** Recompute A* at most this often while the player walks. */
const PATH_REPATH_MS = 320;
/** Cap path samples (world polyline); only on-screen dots are activated. */
const PATH_DOT_MAX = 80;
/** Hard cap on live Sprite nodes — performance budget. */
const PATH_VISIBLE_MAX = 36;
/** Canvas size of each ground mote. */
const PATH_DOT_SIZE = 28;
/**
 * Arc length (world) past the player's nearest path sample before the first mote.
 * Clears feet / torso so the trail starts in front of the sprite, not through it.
 */
const PATH_START_CLEAR = 78;
/** Extra body AABB around feet (world) — catch path zigzags that skim the sprite. */
const PATH_BODY_HW = 34;
const PATH_BODY_DOWN = 18;
const PATH_BODY_UP = 78;

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
     * Finger Z euler degrees when on-screen. Sprite defaults to pointing down (0).
     * Non-zero = off-screen edge cue:
     * 90 = walk east / right edge; -90 = walk west / left edge;
     * 180 = walk north / top edge (target above the playfield).
     * South edge uses arrowDeg 0 + edgeWalk.
     */
    arrowDeg?: number;
    /** Off-screen “往×走” — ground starlight path (no floating firefly). */
    edgeWalk?: boolean;
    /**
     * Place-only cue (door / gate / pier…). Never for NPCs or props —
     * those keep the chevron alone.
     */
    groundRipple?: boolean;
    /** Optional world lock for the ripple (e.g. pier tip / door feet). */
    rippleWorld?: WorldPos;
    /** World feet goal for the ground starlight path (player → here). */
    pathWorld?: WorldPos;
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
 * Also: while a quest is active, keep guiding — wrong tool → yellow click arrow
 * on hotbar; walk-to world aims use a ground starlight path (edge when off-screen).
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
    private _fingerSp: Sprite | null = null;
    /** Yellow chevron — click prompts (UI dock / tutorial hollow / click-move). */
    private _arrowFrame: SpriteFrame | null = null;
    /** Legacy firefly (kept loaded; walk cues now use ground path dots). */
    private _wispFrame: SpriteFrame | null = null;
    private _guideMode: 'arrow' | 'wisp' = 'arrow';
    /** Dark halo under the edge trail so it pops on bright grass / dirt. */
    private _edgeHaloN: Node | null = null;
    private _edgeHaloG: Graphics | null = null;
    /** Ground starlight path (player → world aim). */
    private _pathRoot: Node | null = null;
    private _pathDots: Node[] = [];
    private _pathDotFrames: SpriteFrame[] = [];
    private _pathFramesLoaded = false;
    private _pathRepathAt = 0;
    private _pathPts: WorldPos[] = [];
    private _pathGoal: WorldPos | null = null;
    private _dragGhost: Node | null = null;
    private _dragGhostSp: Sprite | null = null;
    private _dragGhostOp: UIOpacity | null = null;
    private _trailN: Node | null = null;
    private _trailG: Graphics | null = null;
    private _rootOp: UIOpacity | null = null;
    /** World-space ground ripple under place aims (doors / gates / pier). */
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
    /** True only for off-screen walk-direction cues (ground path). */
    private _idleEdgeWalk = false;
    private _idleGroundRipple = false;
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
        // Craft / bag modals normally hide the cue — keep guided craft / boost steps.
        if (
            hud?.isModalOpen &&
            !hud.needsFirstSeedCraftGuide() &&
            !hud.needsHarvestBoostGuide()
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
        if (!this.canShowIdleArrow()) {
            if (this._idleOn) this.hideIdleArrow();
            return;
        }
        if (this._root?.isValid) {
            this._root.setSiblingIndex(this.node.children.length - 1);
        }
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
        this._idleEdgeWalk = false;
        this._idleGroundRipple = false;
        this._idleRippleWorld = null;
        this._idlePathWorld = null;
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
            this._root.setSiblingIndex(this.node.children.length - 1);
        }
        // Defer layout to lateUpdate so the first paint matches CameraFollow snap.
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
        this._idleRippleWorld = null;
        this._idlePathWorld = null;
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
     */
    private resolveIdleGuideStable(): IdleGuide | null {
        const guide = this.resolveIdleGuide();
        const now = Date.now();
        if (guide) {
            this._lastIdleGuide = guide;
            this._lastIdleUntil = now + LAST_GUIDE_HOLD_MS;
            return guide;
        }
        if (this._lastIdleGuide && now < this._lastIdleUntil) {
            return this._lastIdleGuide;
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
        if (world) guide.rippleWorld = world;
        return guide;
    }

    /** Attach a world feet goal so the starlight path can A* even on edge cues. */
    private withPathWorld(guide: IdleGuide | null, world?: WorldPos | null): IdleGuide | null {
        if (!guide || !world) return guide;
        guide.pathWorld = world;
        return guide;
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
        return this.withPathWorld(guide, { x: node.position.x, y: node.position.y });
    }

    /** World pos → directed hole. */
    private worldPosGuide(pos: WorldPos | null, tip: string, fallbackTip?: string): IdleGuide | null {
        return this.withPathWorld(this.worldOrQuest(this.worldPosHole(pos), tip, fallbackTip), pos);
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

        // Police / post board open — hand off to Accept (quest 1011 used to die here).
        const boardGuide = this.resolveTownBoardGuide();
        if (boardGuide) return boardGuide;

        // Shop buy (1020) / sell (1021) — tab / row, then close after trade.
        const shopGuide = this.resolveTownShopGuide();
        if (shopGuide) return shopGuide;

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

        switch (action) {
            case GotoAction.SelectHand: {
                // Harvest (1006): bag→hotbar boost → use on crop → hand harvest.
                const harvestPos = this.stickyPlotPos('harvest');
                if (!harvestPos) {
                    const boost = this.resolveHarvestBoostGuide();
                    if (boost) return boost;
                    return this.worldOrQuest(null, '露穗：再等等，作物就要熟啦');
                }
                if (tool !== 'hand') {
                    this.clearStickyTarget();
                    return this.toolSwapGuide('hand', 'hand');
                }
                return this.worldPosGuide(harvestPos, '露穗：点成熟作物收获呀');
            }
            case GotoAction.HintGrass: {
                if (tool !== 'hand') {
                    this.clearStickyTarget();
                    return this.toolSwapGuide('hand', 'hand');
                }
                return this.worldNodeGuide(
                    this.pickHintGrass(),
                    '露穗：点这里拔掉杂草～',
                );
            }
            case GotoAction.SelectHoe: {
                if (tool !== 'hoe') {
                    this.clearStickyTarget();
                    return this.toolSwapGuide('hoe', 'hoe');
                }
                // worldPosGuide attaches pathWorld so arrow taps snap to the plot.
                return this.worldPosGuide(this.stickyPlotPos('soil'), '露穗：点这里开垦田地哦');
            }
            case GotoAction.SelectSeeds: {
                if (tool !== 'seeds') {
                    this.clearStickyTarget();
                    return this.toolSwapGuide('seeds', 'seeds');
                }
                return this.worldPosGuide(this.stickyPlotPos('tilled'), '露穗：点翻好的地播种呀');
            }
            case GotoAction.SelectCan: {
                if (tool !== 'can') {
                    this.clearStickyTarget();
                    return this.toolSwapGuide('can', 'can');
                }
                return this.worldPosGuide(this.stickyPlotPos('water'), '露穗：给作物浇点水吧');
            }
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
                        '点击矿脉商会取得通行证',
                        '往矿脉商会走，再点一下',
                    );
                }
                if (id === 1025) {
                    return this.resolveTownOutdoorGuide(
                        ['sign_mine'],
                        '点击北山矿洞路牌进入',
                        '往北走到矿洞路牌',
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
     * While the police / post panel is open, point at「接受委托」instead of the
     * building under the modal (chevron used to sit on top and kill the step).
     */
    private resolveTownBoardGuide(): IdleGuide | null {
        const shop = this.node.getComponent(TownShopPanel);
        if (!shop?.isBoardOpen) return null;
        const hole = this.uiNodeHole(shop.acceptBtnNode());
        if (!hole) return null;
        this.clearStickyTarget();
        return { hole, tip: '露穗：点「接受委托」接任务呀', uiDock: true };
    }

    /**
     * Quest 1020 / 1021 while the shop is open: force「购买/出售」tab → first
     * list row → close X after trade (panel still blocks claim / world taps).
     */
    private resolveTownShopGuide(): IdleGuide | null {
        const shop = this.node.getComponent(TownShopPanel);
        if (!shop?.isShopOpen) return null;
        this.clearStickyTarget();
        // Purchase / sale done — point at X before the quest-dock claim tip.
        if (shop.needsShopCloseGuide()) {
            const hole = this.uiNodeHole(shop.closeBtnNode());
            if (!hole) return null;
            return { hole, tip: '露穗：关掉商店继续吧', uiDock: true };
        }
        if (!shop.needsShopTradeGuide()) return null;
        const qid = this.quests?.activeQuest?.id ?? 0;
        if (qid === 1021) {
            if (shop.shopSide !== 'sell') {
                const hole = this.uiNodeHole(shop.sellTabNode());
                if (!hole) return null;
                return { hole, tip: '露穗：先点「出售」页签呀', uiDock: true };
            }
            const hole = this.uiNodeHole(shop.firstSellRowNode());
            if (hole) {
                return { hole, tip: '露穗：点这一行卖掉一件呀', uiDock: true };
            }
            // Empty sell list — keep the panel cue (don't fall through to buildings).
            const tab = this.uiNodeHole(shop.sellTabNode());
            if (!tab) return null;
            return { hole: tab, tip: '露穗：背包里还没有可卖的收获物呀', uiDock: true };
        }
        if (qid === 1020) {
            if (shop.shopSide !== 'buy') {
                const hole = this.uiNodeHole(shop.buyTabNode());
                if (!hole) return null;
                return { hole, tip: '露穗：先点「购买」页签呀', uiDock: true };
            }
            const hole = this.uiNodeHole(shop.firstBuyRowNode());
            if (!hole) return null;
            return { hole, tip: '露穗：点这一行买一件呀', uiDock: true };
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
            const guide = this.worldPosGuide(pos, tip, walkTip);
            // Buildings / signs = place; NPCs keep arrow only.
            if (node.name.startsWith('npc_')) return guide;
            return this.withPlaceRipple(guide, pos);
        }
        const exit = this.farm?.findWorldNode('door_exit') ?? null;
        if (exit) {
            const pos = this.stickyWorldPos('door-exit', {
                x: exit.position.x,
                y: exit.position.y + 24,
            });
            return this.withPlaceRipple(
                this.worldPosGuide(
                    pos,
                    '往南走到门口即可回镇子',
                    '往南走到门口出门',
                ),
                pos,
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
            const pos = this.stickyWorldPos(`door:${outdoorBld}`, {
                x: bld.position.x,
                y: bld.position.y + 20,
            });
            return this.withPlaceRipple(
                this.worldPosGuide(pos, outdoorTip, walkTip),
                pos,
            );
        }
        const exit = this.farm?.findWorldNode('door_exit') ?? null;
        if (exit) {
            const pos = this.stickyWorldPos('door-exit', {
                x: exit.position.x,
                y: exit.position.y + 20,
            });
            return this.withPlaceRipple(
                this.worldPosGuide(pos, '往南走到门口离开', '往南走到门口离开'),
                pos,
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
                '露穗：点路牌去微光溪谷镇吧',
                '露穗：往右走，去东侧路牌呀',
            ),
            pos,
        );
    }

    /**
     * Fishing quest chain: equip rod → walk toward pier (edge arrow if off-screen)
     * → tap lake water to cast. Never falls back to the quest chip alone.
     */
    private resolveFishGuide(tool: string | undefined): IdleGuide | null {
        if (tool !== 'rod') {
            this.clearStickyTarget();
            this._fishNearLatch = false;
            const slotHole = this.toolSlotHole('rod') ?? this.toolSlotHoleFallback('rod');
            if (!slotHole) return null;
            // Caption on — first fishing step is easy to miss with a silent hotbar arrow.
            return { hole: slotHole, tip: '露穗：先点下方「鱼竿」哦', uiDock: true };
        }

        const target = this.fishGuideTarget();
        if (this.farm?.isBusy) {
            return this.withPlaceRipple(
                this.worldPosGuide(target.pos, '露穗：走到钓点就会抛竿啦', '露穗：往西边码头走，再点湖面～'),
                target.pos,
            );
        }
        if (target.near) {
            return this.withPlaceRipple(
                this.worldPosGuide(
                    target.pos,
                    '露穗：点湖面抛竿呀',
                    '露穗：往西边码头走，再点湖面～',
                ),
                target.pos,
            );
        }
        return this.withPlaceRipple(
            this.worldPosGuide(target.pos, '露穗：跟着星光走到湖边码头', '露穗：往西边码头走，再点湖面～'),
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

    /** Keep author tips only when they match the chevron facing. */
    private edgeWalkTip(tip: string, deg: number): string {
        const north = tip.includes('北');
        const south = tip.includes('南');
        const east = tip.includes('右') || tip.includes('东');
        const west = tip.includes('左') || tip.includes('西');
        if (deg === 180 && (north || (!south && !east && !west && tip.includes('走')))) return tip;
        if (deg === 0 && (south || (!north && !east && !west && tip.includes('走')))) return tip;
        if (deg === 90 && (east || (!west && !north && !south && tip.includes('走')))) return tip;
        if (deg === -90 && (west || (!east && !north && !south && tip.includes('走')))) return tip;
        if (deg === 180) return '往北走，靠近了再动手';
        if (deg === 0) return '往南走，靠近了再动手';
        if (deg === 90) return '往右走，靠近了再动手';
        return '往左走，靠近了再动手';
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
            const dx = fresh.x - this._stickyPos.x;
            const dy = fresh.y - this._stickyPos.y;
            if (dx * dx + dy * dy <= STICKY_SWITCH_SQ) {
                this._stickyUntil = now + STICKY_MS;
                return this._stickyPos;
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

        // Off-screen “往×走” → ground starlight path (hide floating finger).
        // On-screen click aims / UI → yellow arrow.
        // Bob AFTER clamp — claim / dock targets pin to the playfield floor and
        // would otherwise eat the sine offset every frame.
        const arrowDeg = this._idleOn ? this._idleArrowDeg : 0;
        const band = this.playfieldBand();
        // Quest / hand / claim / tool-swap sit in the bottom dock — don't force playfield band.
        const uiDock =
            (this._open && (this._step === 'quest' || this._step === 'hand')) ||
            (!this._open && this._idleOn && this._idleUiDock);
        // Screen-edge walk cues use the ground path (incl. south, deg 0).
        const walkGuide = !this._open && this._idleOn && this._idleEdgeWalk;
        // Door / gate / pier — chevron must stay locked to the ground ripple.
        // Playfield Y clamp used to drag the arrow south while the ring stayed on the feet.
        const placeRipple =
            !this._open &&
            this._idleOn &&
            this._idleGroundRipple &&
            !this._idleUiDock &&
            arrowDeg === 0;
        this.syncGroundPath();
        const rippleHole =
            (placeRipple && this._idleRippleWorld
                ? this.worldPosHole(this._idleRippleWorld)
                : null) ?? this._hole;
        let fx = rippleHole.x;
        let fy = this._idleSilent ? top + 40 : top + 56;
        if (walkGuide) {
            finger.active = false;
            this.syncEdgeHalo(false, 0, 0);
        } else {
            finger.active = true;
            const bob = Math.sin(Date.now() * 0.01) * 12;
            if (placeRipple) {
                fx = rippleHole.x;
                fy = rippleHole.y + PLACE_ARROW_ABOVE;
            } else if (arrowDeg === 90) {
                fx = this._hole.x - 56;
                fy = this._hole.y;
            } else if (arrowDeg === -90) {
                fx = this._hole.x + 56;
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
            } else if (placeRipple) {
                // X only — Y stays on the ripple so door aims don't split.
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
            return;
        }
        this._guideMode = mode;
        if (want) sp.spriteFrame = want;
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
        const { halfH } = this.canvasHalf();
        const x0 = b.x0 + inset;
        const x1 = b.x1 - inset;
        const y0 = b.y0 + inset;
        // Left/civic column can use more of the top; right side yields to the clock board.
        const y1Soft = hole.x <= 120 ? halfH - 120 - inset : b.y1 - inset;
        // Hard exclude the top-right info-board corner.
        if (hole.x > 80 && hole.y > halfH - 340) return false;
        return hole.x >= x0 && hole.x <= x1 && hole.y >= y0 && hole.y <= y1Soft;
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
                          : bestNearSq;
                if (
                    rivalSq + STICKY_SWITCH_SQ >= stickySq ||
                    !(bestTut ?? bestYard ?? bestNear)
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
        this._fingerSp = sp;
        this.loadGuideSprites(sp, fg);

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

    private loadGuideSprites(sp: Sprite, fallback: Graphics) {
        const clearFallback = () => {
            if (!fallback.isValid) return;
            fallback.clear();
            fallback.enabled = false;
        };
        const applyIf = (mode: 'arrow' | 'wisp', frame: SpriteFrame) => {
            if (this._guideMode !== mode || !sp.isValid) return;
            sp.spriteFrame = frame;
            clearFallback();
        };
        const arrowUuid = QUEST_FRAMES.questArrow;
        if (arrowUuid) {
            assetManager.loadAny({ uuid: arrowUuid }, (err, asset) => {
                if (err || !asset) return;
                this._arrowFrame = asset as SpriteFrame;
                applyIf('arrow', this._arrowFrame);
            });
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

    /**
     * Ground starlight trail: player feet → quest world aim (A*).
     * Only while the aim is off-screen (`edgeWalk`); on-screen aims keep the yellow arrow.
     */
    private syncGroundPath() {
        // Only when the quest aim is off the playfield — on-screen keeps the yellow arrow.
        const want =
            this._idleOn &&
            !this._open &&
            this._idleEdgeWalk &&
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
        const goalMoved =
            !this._pathGoal ||
            Math.hypot(this._pathGoal.x - goal.x, this._pathGoal.y - goal.y) > 18;
        if (goalMoved || now >= this._pathRepathAt || !this._pathPts.length) {
            const ctrl = player.getComponent(PlayerController);
            if (!ctrl) {
                this.hideGroundPath();
                return;
            }
            // Solids may lag a frame after world rebuild — refresh cheaply.
            if (!ctrl.pathSolids.length) ctrl.rebuildSolids();
            const path = ctrl.previewPath(goal.x, goal.y);
            this._pathPts = this.densifyPath(
                [{ x: player.position.x, y: player.position.y }, ...path],
                PATH_DOT_STEP,
                PATH_DOT_MAX,
            );
            this._pathGoal = { x: goal.x, y: goal.y };
            this._pathRepathAt = now + PATH_REPATH_MS;
        }

        const root = this.ensurePathRoot();
        if (!root) return;
        root.active = true;
        this.loadPathDotFrames();

        const frames = this._pathDotFrames;
        const fallback = this._pathDotFrames[0] ?? null;
        // Slow traveling shimmer along the trail (not a harsh per-dot blink).
        const t = now * 0.0042;
        const wave = now * 0.0031;
        const band = this.playfieldBand();
        const px = player.position.x;
        const py = player.position.y;
        // Trail starts ahead of the body toward the goal — never behind / through the sprite.
        const startI = this.pathTrailStartIndex(px, py);
        let shown = 0;
        for (let i = startI; i < this._pathPts.length; i++) {
            if (shown >= PATH_VISIBLE_MAX) break;
            const pt = this._pathPts[i]!;
            // Safety: skip zigzags that still skim the character AABB.
            if (this.pathDotHitsBody(pt.x - px, pt.y - py)) continue;
            const hole = this.worldPosHole(pt);
            if (!hole) continue;
            // Only paint dots inside the playfield (path continues off-screen as walk).
            if (
                hole.x < band.x0 + 20 ||
                hole.x > band.x1 - 20 ||
                hole.y < band.y0 + 24 ||
                hole.y > band.y1 - 24
            ) {
                continue;
            }
            const dot = this.ensurePathDot(shown);
            if (!dot) break;
            dot.active = true;
            // Soft float — tiny bob, no sideways jitter (that looked like dirt flecks).
            const bob = Math.sin(t + i * 0.55) * 1.4;
            dot.setPosition(hole.x, hole.y - 4 + bob, 0);
            const breath = 0.96 + Math.sin(t * 1.1 + i * 0.4) * 0.08;
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
            const n = this._pathDots[i];
            if (n?.isValid) n.active = false;
        }
        if (shown === 0) {
            // Aim off-screen and no visible segment yet — keep root for next frame.
            return;
        }
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
        // Goal is within the clear radius — hide the short stub rather than pierce the body.
        return pts.length;
    }

    /** True when a world offset from feet still overlaps the standing sprite. */
    private pathDotHitsBody(dx: number, dy: number): boolean {
        return Math.abs(dx) <= PATH_BODY_HW && dy >= -PATH_BODY_DOWN && dy <= PATH_BODY_UP;
    }

    private hideGroundPath() {
        this._pathPts.length = 0;
        this._pathGoal = null;
        this._pathRepathAt = 0;
        const root = this._pathRoot;
        if (root?.isValid) root.active = false;
        for (let i = 0; i < this._pathDots.length; i++) {
            const n = this._pathDots[i];
            if (n?.isValid) n.active = false;
        }
    }

    private ensurePathRoot(): Node | null {
        const root = this._root;
        if (!root?.isValid) return null;
        let n = this._pathRoot;
        if (n?.isValid && n.parent === root) return n;
        if (n?.isValid) n.destroy();
        n = new Node('GuidePath');
        n.layer = root.layer;
        n.setParent(root);
        // Under Finger / Tip; above dim. Ground ripple lives in World.
        n.setSiblingIndex(1);
        n.addComponent(UITransform).setContentSize(10, 10);
        n.active = false;
        this._pathRoot = n;
        this._pathDots = [];
        return n;
    }

    private ensurePathDot(index: number): Node | null {
        const root = this.ensurePathRoot();
        if (!root) return null;
        let n = this._pathDots[index];
        if (n?.isValid && n.parent === root) {
            this.stylePathDot(n);
            return n;
        }
        n = new Node(`PathDot_${index}`);
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
     * If a world tap lands on the place-aim ripple, snap walk-to to that feet
     * goal so click-move and the guide share one destination (no double ring).
     */
    snapPlaceAim(wx: number, wy: number, radius = 96): { x: number; y: number } | null {
        if (!this._idleOn || !this._idleGroundRipple || this._idleUiDock) return null;
        const aim = this._idleRippleWorld;
        if (!aim) return null;
        if ((this._idleArrowDeg ?? 0) !== 0) return null;
        if (Math.hypot(wx - aim.x, wy - aim.y) > radius) return null;
        return { x: aim.x, y: aim.y };
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
     * Place aims only (door / gate / pier / sign). NPCs, props, crops, weeds —
     * chevron alone. Edge / UI-dock / drag-demo also skip the ripple.
     * Lives in World ground band so the ring never paints over the player.
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
        const n = this.ensureGroundRipple(world);
        if (!n) return;
        n.active = true;
        n.setPosition(aim.x, aim.y, 0);
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

    private ensureGroundRipple(world: Node): Node | null {
        let n = this._rippleN;
        if (n?.isValid && n.parent === world) return n;
        if (n?.isValid) n.destroy();
        this._ripplePulsing = false;

        // World child named for WorldYSort ground litter — under player / porch.
        n = new Node('guide_ground_ripple');
        n.layer = world.layer;
        n.setParent(world);
        n.active = false;
        const ui = n.addComponent(UITransform);
        ui.setContentSize(160, 160);
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
        n.setScale(0.65, 0.65, 1);
        op.opacity = 235;
        tween(n)
            .repeatForever(
                tween(n)
                    .to(1.1, { scale: new Vec3(1.45, 1.45, 1) }, { easing: 'sineOut' })
                    .set({ scale: new Vec3(0.65, 0.65, 1) }),
            )
            .start();
        tween(op)
            .repeatForever(
                tween(op)
                    .to(1.1, { opacity: 55 }, { easing: 'sineOut' })
                    .set({ opacity: 235 }),
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
