import {
    _decorator,
    assetManager,
    Color,
    Component,
    EventKeyboard,
    EventTouch,
    Graphics,
    Input,
    KeyCode,
    Label,
    Node,
    Prefab,
    Sprite,
    SpriteFrame,
    UIOpacity,
    UITransform,
    Vec3,
    input,
    instantiate,
    sys,
    tween,
    view,
} from 'cc';
import { GotoAction } from '../cfg/schema';
import {
    CraftItemId,
    CraftRecipe,
    getCraftRecipes,
    getUnlockedCraftRecipes,
} from './CraftRecipes';
import {
    FARM_BAG_PANEL_PREFAB_UUID,
    FARM_CHEST_PANEL_PREFAB_UUID,
    FARM_CRAFT_PANEL_PREFAB_UUID,
    FARM_CRAFT_ROW_PREFAB_UUID,
    FARM_HOTBAR_PREFAB_UUID,
    FARM_HUD_LAYOUT as HL,
    FARM_LEARN_PANEL_PREFAB_UUID,
    FARM_TOOL_TIP_PREFAB_UUID,
} from './FarmHudFrames';
import { FarmMaterial, FarmSystem, FarmTool } from './FarmSystem';
import { FishingMinigame } from './FishingMinigame';
import { GameState } from './GameState';
import { InputBridge } from './InputBridge';
import { allItems, itemIcon, itemTip } from './ItemCatalog';
import { QUEST_FRAMES } from './QuestFrames';
import { QuestSystem } from './QuestSystem';
import { TOOL_FRAMES } from './ToolFrames';
import { clientToUiLocation, portraitVisibleSize } from './PortraitFit';
import { playFarmTool, playUiClick } from './UiAudio';
import {
    applyHotbarBg,
    applyParchmentRow,
    applySlotPlate,
    applyTipBubble,
    applyWoodButton,
    applyWoodPanel,
    paintPanelCloseVisual,
    UI_CREAM,
    UI_INK,
    UI_INK_MUTE,
} from './UiChrome';
import { applyUiFont, loadUiFont, styleUiLabel } from './UiFont';

const { ccclass, property } = _decorator;

/** Hotbar shortcut / backpack item ids. */
export type InvItemId = FarmTool | 'parsnip' | FarmMaterial | 'recipeScroll';

interface InvStack {
    id: InvItemId;
    count: number;
    /** Set when `id === 'recipeScroll'`. */
    recipeId?: string;
}

const FIRST_HARVEST_QUEST = 1006;

/** HUD chrome keys in TOOL_FRAMES that are not bag items. */
const TOOL_CHROME_KEYS = [
    'slot',
    'backpack',
    'bagTab',
    'close',
    'bagBtn',
    'adVideo',
    'craftBtn',
] as const;

const ALL_MATERIALS: FarmMaterial[] = [
    'wood',
    'grass',
    'dirt',
    'stone',
    'fish',
    'copper',
    'iron',
    'goldOre',
];

/** Hotbar + tip chrome vs previous baseline (100px slots). */
const UI_SCALE = 1.5;
const SLOT = Math.round(100 * UI_SCALE);
const PLATE = Math.round(88 * UI_SCALE);
const ICON = Math.round(64 * UI_SCALE);
const GLOW_HALF = Math.round(48 * UI_SCALE);
const SLOT_COUNT = 7;
const BAR_INNER_PAD = 3;
const GAP = 4;
const BAR_BG_W = SLOT_COUNT * SLOT + (SLOT_COUNT - 1) * GAP + BAR_INNER_PAD * 2;
const BAR_PAD_Y = Math.round(20 * UI_SCALE);
const BAR_H = SLOT + BAR_PAD_Y;
/** Hotbar sits below FarmActionHint (−560) and the quest tracker dock. */
const BAR_Y = -860;
const TIP_HIDE_SEC = 2.4;

/** One baked badge (warm wood plate + pack); bottom flush with slot tops. */
const BAG_BTN = Math.round(120 * UI_SCALE);
const CLOSE_BTN = Math.round(56 * UI_SCALE);
/** Backpack storage only (3×7). Bottom dock is a separate hotkey bar. */
const INV_COLS = 7;
const INV_STORAGE_ROWS = 3;
const BAG_SLOTS = INV_STORAGE_ROWS * INV_COLS;
/** Hotkey slot 0 is permanently the bare hand — never swapped or overwritten. */
const HAND_HOT = 0;
/** Same cell size for storage + dock so columns line up as one grid. */
const INV_SLOT = SLOT;
const INV_GAP = GAP;
const INV_PAD = Math.round(22 * UI_SCALE);
const INV_TITLE_H = Math.round(48 * UI_SCALE);
/** Gap between storage rows and the hotkey dock inside the bag chrome. */
const INV_DOCK_GAP = Math.round(12 * UI_SCALE);
const DRAG_THRESH = 16;

/** Yard chest: dual-grid panel (chest ↔ backpack + hotkey dock). */
const CHEST_COLS = 7;
const CHEST_ROWS = 3;
const CHEST_SLOTS = CHEST_COLS * CHEST_ROWS;
/** Must match hotbar SLOT/GAP so all 7 columns share one vertical grid. */
const CHEST_SLOT = SLOT;
const CHEST_GAP = GAP;
const CHEST_PAD = Math.round(18 * UI_SCALE);
const CHEST_TITLE_H = Math.round(40 * UI_SCALE);
/** Clear band between chest grid and backpack grid (holds the section label). */
const CHEST_SECTION_GAP = Math.round(36 * UI_SCALE);
const CHEST_BTN_H = Math.round(40 * UI_SCALE);
const CHEST_DOCK_GAP = INV_DOCK_GAP;

/** Yard craftbench: recipe list panel (fixed column grid). */
const CRAFT_PAD = Math.round(18 * UI_SCALE);
/** Tall header so close button sits inside the parchment, not on the chrome lip. */
const CRAFT_HEADER_H = Math.round(72 * UI_SCALE);
const CRAFT_TITLE_H = Math.round(40 * UI_SCALE);
const CRAFT_ROW_H = Math.round(88 * UI_SCALE);
const CRAFT_ROW_GAP = Math.round(10 * UI_SCALE);
/** Matches assets/textures/ui/ui-craft-btn.png */
const CRAFT_BTN_W = 180;
const CRAFT_BTN_H = 66;
const CRAFT_OUT_SZ = Math.round(64 * UI_SCALE);
/** Name column right of out icon (single-line row, like图2). */
const CRAFT_NAME_COL_W = Math.round(128 * UI_SCALE);
const CRAFT_COST_ICON = Math.round(36 * UI_SCALE);
/** Fixed cost cell so every row lines up (icon + have/need). */
const CRAFT_COST_CELL_W = Math.round(100 * UI_SCALE);
const CRAFT_COST_SLOTS = 2;
const CRAFT_COL_GAP = Math.round(14 * UI_SCALE);
/** Ad chip sits at the right; progress stays 制作-width and shifts left when ad shows. */
const CRAFT_AD_SZ = Math.round(52 * UI_SCALE);
const CRAFT_BAR_H = Math.round(40 * UI_SCALE);
/** Mock rewarded-ad watch (seconds), same cadence as crop boost. */
const CRAFT_AD_WATCH_SEC = 1.2;
/** Quest 1003 first seed — short guided craft, then close / fly→bag before claim. */
const FIRST_SEED_RECIPE = 'seed_from_grass';
const FIRST_SEED_CRAFT_SEC = 5;

/** Bag recipe-scroll → secondary learn panel. */
const LEARN_PANEL_W = Math.round(520 * UI_SCALE);
const LEARN_PANEL_H = Math.round(360 * UI_SCALE);
const LEARN_ICON = Math.round(72 * UI_SCALE);
const LEARN_BTN_W = Math.round(220 * UI_SCALE);
const LEARN_BTN_H = Math.round(72 * UI_SCALE);

function isFarmTool(id: InvItemId): id is FarmTool {
    return (
        id === 'hand' ||
        id === 'hoe' ||
        id === 'seeds' ||
        id === 'can' ||
        id === 'axe' ||
        id === 'rod' ||
        id === 'boost'
    );
}

function isRecipeScroll(stack: InvStack | null | undefined): stack is InvStack & {
    id: 'recipeScroll';
    recipeId: string;
} {
    return !!stack && stack.id === 'recipeScroll' && !!stack.recipeId;
}

function isHandHot(index: number): boolean {
    return index === HAND_HOT;
}

/**
 * Backpack HUD: 3×7 storage + always-visible hotkey dock.
 * Hotkeys are shortcuts (item stays in the bag); drag bag → dock to assign.
 */
@ccclass('FarmHUD')
export class FarmHUD extends Component {
    @property(FarmSystem)
    farm: FarmSystem | null = null;

    private _bar: Node | null = null;
    private _barBg: Node | null = null;
    private _bagBtn: Node | null = null;
    /** Opens QuestPanel — sits left of the bag badge. */
    private _questBtn: Node | null = null;
    private _questBtnFrame: SpriteFrame | null = null;
    private _bagGlow: Graphics | null = null;
    private _closeBtn: Node | null = null;
    private _bagRoot: Node | null = null;
    private _dimmer: Node | null = null;
    private _panel: Node | null = null;
    private _chestRoot: Node | null = null;
    private _craftRoot: Node | null = null;
    private _learnRoot: Node | null = null;
    private _prefabs: {
        hotbar: Prefab | null;
        bag: Prefab | null;
        chest: Prefab | null;
        craft: Prefab | null;
        craftRow: Prefab | null;
        learn: Prefab | null;
        tip: Prefab | null;
    } = {
        hotbar: null,
        bag: null,
        chest: null,
        craft: null,
        craftRow: null,
        learn: null,
        tip: null,
    };
    private _ghost: Node | null = null;
    private _ghostSp: Sprite | null = null;
    private _tip: Node | null = null;
    private _tipTitle: Label | null = null;
    private _tipDesc: Label | null = null;
    private _tipGfx: Graphics | null = null;
    private _tipHideAt = 0;
    private _tipHit = { w: 280, h: 110, tail: 20, tailX: 0 };
    private static readonly TIP_EDGE_PAD = Math.round(16 * UI_SCALE);

    private _slots: { item: InvItemId | null; root: Node; glow: Graphics; icon: Sprite | null; count: Label | null }[] = [];
    private _invCells: { root: Node; icon: Sprite | null; count: Label | null }[] = [];
    private _frames: Partial<Record<InvItemId | keyof typeof TOOL_FRAMES, SpriteFrame>> = {};

    /** Backpack storage stacks only (BAG_SLOTS). */
    private _backpack: (InvStack | null)[] = [];
    /** Hotkey bar: item ids that reference stacks in the backpack (slot 0 = hand). */
    private _hotbar: (InvItemId | null)[] = [];
    private _bagOpen = false;
    /**
     * Armed when a teach item lands on the dock while the bag is open.
     * Cleared on bag close — TutorialGuide only nags the close X once.
     */
    private _awaitBagCloseGuide = false;

    /** Yard chest storage (separate from backpack). */
    private _chest: (InvStack | null)[] = [];
    private _chestOpen = false;
    private _chestDimmer: Node | null = null;
    private _chestPanel: Node | null = null;
    private _chestCells: { root: Node; icon: Sprite | null; count: Label | null }[] = [];
    private _chestBagCells: { root: Node; icon: Sprite | null; count: Label | null }[] = [];
    private _chestCloseBtn: Node | null = null;
    private _takeAllBtn: Node | null = null;

    /** Yard craftbench UI. */
    private _craftOpen = false;
    private _craftDimmer: Node | null = null;
    private _craftPanel: Node | null = null;
    private _craftCloseBtn: Node | null = null;
    private _craftRows: {
        root: Node;
        recipe: CraftRecipe;
        costLabs: Label[];
        craftBtn: Node;
        craftLab: Label;
        btnSp: Sprite | null;
        btnOp: UIOpacity | null;
        progressRoot: Node;
        barGfx: Graphics;
        barLab: Label;
        barW: number;
        /** Progress slot matching 制作 when ad is hidden. */
        barXNoAd: number;
        /** Progress slot ending just before the ad chip. */
        barXWithAd: number;
        barWWithAd: number;
        adBtn: Node;
        adOp: UIOpacity | null;
    }[] = [];
    /** Active craft countdowns (recipe id → remaining / total). */
    private _craftJobs = new Map<
        string,
        { remain: number; total: number; out: { id: CraftItemId; count: number } }
    >();
    /** Mock rewarded-ad boost while a craft is running. */
    private _craftAdWait: { recipeId: string; left: number } | null = null;
    /** Forced craft-quest guide: panel still open after craft — point at close. */
    private _tutorialCraftAwaitClose = false;
    /** Forced craft-quest guide: panel closed — wait for deliver fly to land. */
    private _tutorialCraftAwaitFly = false;
    /** Recipe id under forced craft guide (busy countdown / reopen aim). */
    private _guidedCraftRecipeId: string | null = null;
    /** Last built workbench row set — rebuild when unlocks change. */
    private _craftPanelRecipeKey = '';

    /** Secondary panel: study a bag recipe scroll before learning. */
    private _learnOpen = false;
    private _learnDimmer: Node | null = null;
    private _learnPanel: Node | null = null;
    private _learnCloseBtn: Node | null = null;
    private _learnBtn: Node | null = null;
    private _learnTitle: Label | null = null;
    private _learnName: Label | null = null;
    private _learnDesc: Label | null = null;
    private _learnScrollIcon: Sprite | null = null;
    private _learnOutIcon: Sprite | null = null;
    private _learnBagIndex = -1;
    private _learnRecipeId = '';

    private _drag: {
        /** Bag / chest / hotbar index depending on `from`. */
        index: number;
        from: 'bag' | 'chest' | 'hotbar';
        item: InvItemId;
        active: boolean;
        ox: number;
        oy: number;
    } | null = null;
    /** Last UI pointer pos while a bag/chest press is alive. */
    private _ptrX = 0;
    private _ptrY = 0;
    private _ptrDown = false;
    /** After a real drag-drop, skip the trailing joystick tap. */
    private _suppressTap = false;
    /** Layer for loot-fly icons (above hotbar / tip). */
    private _lootFxRoot: Node | null = null;
    private _bagPulseGen = 0;
    private _questPulseGen = 0;
    /** While true, keep the matching badge hidden until its unlock fly lands. */
    private _unlockFxHideQuest = false;
    private _unlockFxHideBag = false;
    /** Recipe-scroll fly in progress — TutorialGuide waits before aiming the bag. */
    private _recipeLearnAwaitFly = false;

    onLoad() {
        this.initBackpack();
        this.loadFrames(() => this.build());
        loadUiFont().then((font) => {
            if (!font) return;
            if (this._tipTitle) applyUiFont(this._tipTitle);
            if (this._tipDesc) applyUiFont(this._tipDesc);
            for (const s of this._slots) if (s.count) applyUiFont(s.count);
            for (const c of this._invCells) if (c.count) applyUiFont(c.count);
            for (const c of this._chestCells) if (c.count) applyUiFont(c.count);
            for (const c of this._chestBagCells) if (c.count) applyUiFont(c.count);
            const chest = this._chestPanel;
            if (chest) {
                for (const name of ['Title', 'Hint', 'BagLabel']) {
                    const lab = chest.getChildByName(name)?.getComponent(Label);
                    if (lab) applyUiFont(lab);
                }
                const takeLab = this._takeAllBtn?.getChildByName('Label')?.getComponent(Label);
                if (takeLab) applyUiFont(takeLab);
            }
            const craft = this._craftPanel;
            if (craft) {
                const titleLab = craft.getChildByName('Title')?.getComponent(Label);
                if (titleLab) applyUiFont(titleLab);
            }
            for (const row of this._craftRows) {
                if (row.craftLab) applyUiFont(row.craftLab);
                if (row.barLab) applyUiFont(row.barLab);
                for (const lab of row.costLabs) applyUiFont(lab);
                const nameLab = row.root.getChildByName('Name')?.getComponent(Label);
                if (nameLab) applyUiFont(nameLab);
            }
        });
        input.on(Input.EventType.KEY_DOWN, this.onKey, this);
        // CRITICAL: use Canvas node touch (capture), NOT global `input`.
        // Global mouse/touch moves are swallowed while the cursor is over UI
        // nodes (panel / slots), so bag→hotbar drag never received MOVE/END.
        // Node touch unifies mouse + finger on desktop and mobile.
        this.node.on(Node.EventType.TOUCH_START, this.onNodeTouchStart, this, true);
        this.node.on(Node.EventType.TOUCH_MOVE, this.onNodeTouchMove, this, true);
        this.node.on(Node.EventType.TOUCH_END, this.onNodeTouchEnd, this, true);
        this.node.on(Node.EventType.TOUCH_CANCEL, this.onNodeTouchEnd, this, true);
        // Web-mobile often drops Cocos UP over UI — finish bag→hotbar drags via DOM.
        if (sys.isBrowser) {
            window.addEventListener('pointerup', this.onDomPointerUp, true);
            window.addEventListener('pointercancel', this.onDomPointerUp, true);
        }
    }

    onDestroy() {
        InputBridge.uiBlocking = false;
        input.off(Input.EventType.KEY_DOWN, this.onKey, this);
        this.node.off(Node.EventType.TOUCH_START, this.onNodeTouchStart, this, true);
        this.node.off(Node.EventType.TOUCH_MOVE, this.onNodeTouchMove, this, true);
        this.node.off(Node.EventType.TOUCH_END, this.onNodeTouchEnd, this, true);
        this.node.off(Node.EventType.TOUCH_CANCEL, this.onNodeTouchEnd, this, true);
        if (sys.isBrowser) {
            window.removeEventListener('pointerup', this.onDomPointerUp, true);
            window.removeEventListener('pointercancel', this.onDomPointerUp, true);
        }
    }

    update(dt: number) {
        if (this._tip?.active && this._tipHideAt > 0 && Date.now() >= this._tipHideAt) {
            this.hideTip();
        }
        this.tickCraftJobs(dt);
    }

    /**
     * Hotbar / bag / quest btn / modals only — never farm jobs.
     * Call this BEFORE world NPC / building / portal hit-tests so dock chrome
     * cannot click-through into approachInteract / approachNpc.
     */
    handleUiTap(uiX: number, uiY: number): boolean {
        if (this.node.getComponent(FishingMinigame)?.isOpen) return true;
        if (this._suppressTap) {
            this._suppressTap = false;
            return true;
        }
        if (this._drag?.active) return true;
        if (this.hitTip(uiX, uiY)) {
            this.hideTip();
            return true;
        }
        if (this._chestOpen) {
            if (this.hitChestClose(uiX, uiY) || this.hitTakeAll(uiX, uiY)) {
                playUiClick();
                return true;
            }
            if (this.hitChestSlot(uiX, uiY, true) >= 0) {
                playUiClick();
                return true;
            }
            if (this.hitChestBagSlot(uiX, uiY, true) >= 0) {
                playUiClick();
                return true;
            }
            if (this.hitHotbar(uiX, uiY, true)) {
                playUiClick();
                return true;
            }
            if (this.hitChestPanel(uiX, uiY)) return true;
            playUiClick();
            this.setChestOpen(false);
            return true;
        }
        if (this._craftOpen) {
            // Forced craft quest: only the objective「制作」is live before it starts.
            // Once the countdown runs, close / ad stay free — no input lock.
            // If mats are missing, still allow close so the player can gather.
            const forcedPre = this.isForcedCraftInputLock();
            if (forcedPre) {
                if (this.hitCraftRow(uiX, uiY)) {
                    playUiClick();
                    return true;
                }
                return true;
            }
            // Close first — header X is small and the guide arrow sits above it.
            if (this.hitCraftClose(uiX, uiY)) {
                playUiClick();
                return true;
            }
            if (this.hitCraftAd(uiX, uiY) || this.hitCraftRow(uiX, uiY)) {
                playUiClick();
                return true;
            }
            if (this.hitHotbar(uiX, uiY, true)) {
                playUiClick();
                return true;
            }
            if (this.hitCraftPanel(uiX, uiY)) {
                return true;
            }
            playUiClick();
            this.setCraftOpen(false);
            return true;
        }
        if (this._learnOpen) {
            if (this.hitLearnConfirm(uiX, uiY)) {
                playUiClick();
                this.confirmLearnRecipe();
                return true;
            }
            if (this.hitLearnClose(uiX, uiY)) {
                playUiClick();
                this.setLearnOpen(false);
                return true;
            }
            if (this.hitLearnPanel(uiX, uiY)) return true;
            playUiClick();
            this.setLearnOpen(false);
            return true;
        }
        if (this._bagOpen && this.hitCloseBtn(uiX, uiY)) {
            playUiClick();
            this.setBagOpen(false);
            return true;
        }
        if (!this._bagOpen && this.hitQuestBtn(uiX, uiY)) {
            playUiClick();
            this.openQuestPanel();
            return true;
        }
        if (!this._bagOpen && this.hitBagBtn(uiX, uiY)) {
            playUiClick();
            this.toggleBag();
            return true;
        }
        if (this._bagOpen) {
            if (this.hitHotbar(uiX, uiY, true)) {
                playUiClick();
                return true;
            }
            if (this.hitInvSlot(uiX, uiY, true) >= 0) {
                playUiClick();
                return true;
            }
            if (this.hitPanel(uiX, uiY)) return true;
            // Dimmer / outside → close
            playUiClick();
            this.setBagOpen(false);
            return true;
        }
        if (this.hitHotbar(uiX, uiY, false)) {
            playUiClick();
            return true;
        }
        return false;
    }

    /**
     * Wired from TouchJoystick: short tap (not drag).
     * @returns true when UI / farm action consumed the tap; false = empty ground.
     */
    handleTap(uiX: number, uiY: number): boolean {
        if (this.handleUiTap(uiX, uiY)) return true;
        this.hideTip();
        // true = farm job / tip consumed the tap; false = empty ground (click-to-move).
        return !!this.farm?.tryActAtUi(uiX, uiY);
    }

    private initBackpack() {
        this._backpack = new Array(BAG_SLOTS).fill(null);
        this._hotbar = new Array(SLOT_COUNT).fill(null);
        // Hoe is granted on quest 1002 (fly→bag→hotbar); can / axe / rod from craft.
        if (this.farm && !GameState.inventory) this.farm.seeds = 0;
        const owned = this.farm?.ownedTools ?? { hoe: false, can: false, axe: false, rod: false };
        const starter: InvStack[] = [];
        if (owned.hoe) starter.push({ id: 'hoe', count: 1 });
        if (owned.can) starter.push({ id: 'can', count: 1 });
        if (owned.axe) starter.push({ id: 'axe', count: 1 });
        if (owned.rod) starter.push({ id: 'rod', count: 1 });
        starter.forEach((s, i) => {
            this._backpack[i] = s;
        });
        this._hotbar[HAND_HOT] = 'hand';
        // Travel / mid-session: restore dock shortcuts. First farm session keeps
        // tools bag-only so TutorialGuide can teach bag → hotbar for each item.
        const restoreDock = !!GameState.inventory;
        let hot = 1;
        for (const s of starter) {
            if (!restoreDock) continue;
            if (hot >= SLOT_COUNT) break;
            this._hotbar[hot++] = s.id;
        }
        this._chest = new Array(CHEST_SLOTS).fill(null);
        // A few yard leftovers so the chest feels lived-in on first open.
        this._chest[0] = { id: 'wood', count: 8 };
        this._chest[1] = { id: 'stone', count: 4 };
        this.farm?.setTool('hand');
    }

    private hotbarItem(i: number): InvItemId | null {
        return this._hotbar[i] ?? null;
    }

    /** Bag / chest / craft / recipe-learn modal covering the playfield. */
    get isModalOpen() {
        return this._bagOpen || this._chestOpen || this._craftOpen || this._learnOpen;
    }

    /** Recipe-scroll study panel open over bag/chest. */
    get isRecipeLearnOpen() {
        return this._learnOpen;
    }

    get isCraftOpen() {
        return this._craftOpen;
    }

    /** Guided craft countdown still running (panel may be open or closed). */
    get isTutorialCraftBusy() {
        const id = this._guidedCraftRecipeId;
        return !!id && this._craftJobs.has(id);
    }

    /** @deprecated Use isTutorialCraftBusy — countdown no longer locks input. */
    get isTutorialCraftLocked() {
        return this.isTutorialCraftBusy;
    }

    /** Guided craft done with panel open — TutorialGuide should point at close. */
    get isTutorialCraftAwaitClose() {
        return this._tutorialCraftAwaitClose;
    }

    /** Guided craft done with panel closed — wait for bag fly before next guide. */
    get isTutorialCraftAwaitFly() {
        return this._tutorialCraftAwaitFly;
    }

    /** New recipe scroll flying into the bag badge. */
    get isRecipeLearnAwaitFly() {
        return this._recipeLearnAwaitFly;
    }

    /** GM: drop forced craft guide state so the player can leave the panel. */
    clearTutorialCraftGuide() {
        this._tutorialCraftAwaitClose = false;
        this._tutorialCraftAwaitFly = false;
        this._guidedCraftRecipeId = null;
    }

    /** Recipe currently under forced craft guide (arrow / busy). */
    get guidedCraftRecipeId(): string | null {
        return this.liveGuidedCraftRecipeId();
    }

    /**
     * Keep TutorialGuide arrows while the workbench is open on the recipe button.
     * Busy / claim / short mats stay quiet — no close-panel nag.
     */
    needsCraftQuestGuide() {
        if (!this._craftOpen) return false;
        if (this.isTutorialCraftBusy || this._tutorialCraftAwaitClose) return false;
        const q = this._quests?.activeQuest;
        if (!q || this._quests!.isAwaitingClaim) return false;
        if (q.conditionId !== 3 || !q.param) return false;
        return this.canAffordRecipe(q.param);
    }

    /** Active craft-quest recipe that must be the only clickable row. */
    private liveGuidedCraftRecipeId(): string | null {
        if (this._guidedCraftRecipeId) return this._guidedCraftRecipeId;
        const q = this._quests?.activeQuest;
        if (!q || this._quests!.isAwaitingClaim) return null;
        if (q.conditionId === 3 && q.param) return q.param;
        return null;
    }

    private guidedCraftRecipe(): CraftRecipe | null {
        const id = this.liveGuidedCraftRecipeId();
        if (!id) return null;
        for (const row of this._craftRows) {
            if (row.recipe.id === id) return row.recipe;
        }
        return getCraftRecipes().find((r) => r.id === id) ?? null;
    }

    /**
     * Soft craft guide only — never lock other rows / close while a quest recipe is up.
     */
    private isForcedCraftInputLock(): boolean {
        return false;
    }

    /** Craft-row «制作» button for tutorial holes. */
    craftRecipeBtnNode(recipeId: string): Node | null {
        if (!this._craftOpen) return null;
        for (const row of this._craftRows) {
            if (row.recipe.id !== recipeId) continue;
            if (this._craftJobs.has(recipeId)) return row.progressRoot?.isValid ? row.progressRoot : row.root;
            return row.craftBtn?.isValid ? row.craftBtn : null;
        }
        return null;
    }

    craftCloseBtnNode(): Node | null {
        if (!this._craftOpen || !this._craftCloseBtn?.isValid || !this._craftCloseBtn.active) return null;
        return this._craftCloseBtn;
    }

    get isBagOpen() {
        return this._bagOpen;
    }

    /** True when an item id is bound on the hotkey dock (not slot 0). */
    isHotbarBound(itemId: string): boolean {
        for (let i = 0; i < this._hotbar.length; i++) {
            if (isHandHot(i)) continue;
            if (this._hotbar[i] === itemId) return true;
        }
        return false;
    }

    /** Bag storage cell for an item — tutorial drag source. */
    bagSlotNode(itemId: string): Node | null {
        if (!this._bagOpen || !this._panel?.isValid) return null;
        const idx = this._backpack.findIndex((s) => s?.id === itemId);
        if (idx < 0) return null;
        const cell = this._invCells[idx];
        return cell?.root?.isValid ? cell.root : null;
    }

    bagCloseBtnNode(): Node | null {
        if (!this._bagOpen || !this._closeBtn?.isValid || !this._closeBtn.active) return null;
        return this._closeBtn;
    }

    /**
     * Which dockable item the live goto wants taught bag → hotbar.
     * Null when no teach step is active.
     */
    teachHotbarItem(): InvItemId | null {
        if (!this._quests?.activeQuest || this._quests.isAwaitingClaim) return null;
        const action = this._quests.activeGotoAction();
        switch (action) {
            case GotoAction.SelectHoe:
            case GotoAction.HintRock:
                return 'hoe';
            case GotoAction.HintFarm:
                // Match TutorialGuide: till first, then plant.
                if (this.farm?.hintPlotPos('soil') && !this.isHotbarBound('hoe')) return 'hoe';
                if (this.farm?.hintPlotPos('tilled') && !this.isHotbarBound('seeds')) return 'seeds';
                if (!this.isHotbarBound('hoe')) return 'hoe';
                if (!this.isHotbarBound('seeds')) return 'seeds';
                return null;
            case GotoAction.SelectSeeds:
                return 'seeds';
            case GotoAction.SelectCan:
                return 'can';
            case GotoAction.SelectAxe:
                return 'axe';
            case GotoAction.SelectRod:
            case GotoAction.HintFish:
                return 'rod';
            case GotoAction.SelectHand: {
                // Quest 1006: boost before the crop is mature enough to harvest.
                const q = this._quests.activeQuest;
                if (!q || q.id !== FIRST_HARVEST_QUEST) return null;
                if ((this.farm?.boosts ?? 0) <= 0) return null;
                if (this.farm?.hintPlotPos('harvest')) return null;
                return 'boost';
            }
            default:
                return null;
        }
    }

    /** Live goto still wants this item on the dock, and it isn't bound yet. */
    shouldTeachHotbar(itemId?: string) {
        const want = this.teachHotbarItem();
        if (!want) return false;
        if (itemId && itemId !== want) return false;
        return !this.isHotbarBound(want);
    }

    /**
     * Bag open while teaching any item → hotbar → close.
     * Lets TutorialGuide keep the arrow over the bag modal (including close X
     * after the drag lands — one shot only).
     */
    needsBagHotbarGuide() {
        if (!this._bagOpen) return false;
        if (!this._quests?.activeQuest || this._quests.isAwaitingClaim) return false;
        const want = this.teachHotbarItem();
        if (!want) return false;
        if (this.shouldTeachHotbar(want)) return true;
        return this.needsBagCloseGuide();
    }

    /** True only for the first close after a bag→hotbar teach drag. */
    needsBagCloseGuide() {
        if (!this._bagOpen || !this._awaitBagCloseGuide) return false;
        if (!this._quests?.activeQuest || this._quests.isAwaitingClaim) return false;
        const want = this.teachHotbarItem();
        return !!want && this.isHotbarBound(want);
    }

    /** Bag open with an unlearned recipe scroll — keep the learn arrow. */
    needsRecipeLearnGuide() {
        if (!this._bagOpen && !this._learnOpen) return false;
        return (this._quests?.pendingCraftRecipeIds().length ?? 0) > 0;
    }

    /** Bag cell holding a pending recipe scroll (tutorial hole). */
    recipeScrollSlotNode(recipeId: string): Node | null {
        if (!this._bagOpen || !this._panel?.isValid || !recipeId) return null;
        const idx = this._backpack.findIndex(
            (s) => s?.id === 'recipeScroll' && s.recipeId === recipeId,
        );
        if (idx < 0) return null;
        const cell = this._invCells[idx];
        return cell?.root?.isValid ? cell.root : null;
    }

    /** 「学习」 button on the secondary recipe panel (tutorial hole). */
    recipeLearnBtnNode(): Node | null {
        if (!this._learnOpen || !this._learnBtn?.isValid) return null;
        return this._learnBtn;
    }

    /**
     * Put an earned recipe scroll in the bag and optionally fly its icon in.
     * Idempotent per recipeId.
     */
    grantRecipeScroll(recipeId: string, opts?: { fly?: boolean }) {
        if (!recipeId) return;
        const recipe = getCraftRecipes().find((r) => r.id === recipeId);
        if (!recipe) return;
        const had = this._backpack.some(
            (s) => s?.id === 'recipeScroll' && s.recipeId === recipeId,
        );
        if (!had) {
            this.mergeOrPlaceInBag({ id: 'recipeScroll', count: 1, recipeId });
            this.refreshInvIcons();
        }
        if (had || opts?.fly === false) return;
        const sf = this.frameForStack({ id: 'recipeScroll', count: 1, recipeId });
        if (!sf) return;
        this._recipeLearnAwaitFly = true;
        this.playCanvasLootFly(sf, 0, 80, 1, 'bag', () => {
            this._recipeLearnAwaitFly = false;
        });
    }

    /** Drop a bag recipe scroll (retired recipes / save cleanup). */
    revokeRecipeScroll(recipeId: string) {
        if (!recipeId) return;
        let changed = false;
        for (let i = 0; i < this._backpack.length; i++) {
            const s = this._backpack[i];
            if (s?.id === 'recipeScroll' && s.recipeId === recipeId) {
                this._backpack[i] = null;
                changed = true;
            }
        }
        if (this._learnOpen && this._learnRecipeId === recipeId) {
            this.setLearnOpen(false);
        }
        if (changed) {
            this.refreshInvIcons();
            this.refreshChestIcons();
        }
    }

    /** Remove scrolls whose recipe id no longer exists in config. */
    purgeUnknownRecipeScrolls() {
        const known = new Set(getCraftRecipes().map((r) => r.id));
        let changed = false;
        for (let i = 0; i < this._backpack.length; i++) {
            const s = this._backpack[i];
            if (s?.id === 'recipeScroll' && s.recipeId && !known.has(s.recipeId)) {
                this._backpack[i] = null;
                changed = true;
                if (this._learnOpen && this._learnRecipeId === s.recipeId) {
                    this.setLearnOpen(false);
                }
            }
        }
        if (changed) {
            this.refreshInvIcons();
            this.refreshChestIcons();
        }
    }

    /** @deprecated Use needsBagHotbarGuide — kept for call-site clarity during boost steps. */
    needsHarvestBoostGuide() {
        return this.needsBagHotbarGuide() && this.teachHotbarItem() === 'boost';
    }

    /** @deprecated Use needsBagHotbarGuide */
    needsHoeHotbarGuide() {
        return this.needsBagHotbarGuide();
    }

    /** @deprecated Use shouldTeachHotbar('hoe') */
    shouldTeachHoeHotbar() {
        return this.shouldTeachHotbar('hoe');
    }

    /**
     * Quest 1002: put the borrowed hoe in the bag (not the dock) and optionally
     * fly the icon into the backpack badge. Idempotent.
     */
    grantStoryHoe(opts?: { fly?: boolean }) {
        const farm = this.farm;
        if (!farm) return;
        const had = farm.ownedTools.hoe && this.bagCount('hoe') > 0;
        farm.ownedTools.hoe = true;
        if (this.bagCount('hoe') <= 0) {
            this.mergeOrPlaceInBag({ id: 'hoe', count: 1 });
        }
        // Leave bag-only — TutorialGuide teaches bag → hotbar drag.
        this.refreshHotbarIcons();
        this.refreshInvIcons();
        farm.notifyInventoryChanged();
        if (had || opts?.fly === false) return;
        const sf = this.frameFor('hoe');
        if (sf) this.playCanvasLootFly(sf, 0, 80, 1, 'bag');
    }

    /** Ensure hoe exists once the tilling quest line is live (dialogue already seen). */
    ensureStoryHoe() {
        if (!this.needsStoryHoe()) return;
        if (this.farm?.ownedTools.hoe && this.bagCount('hoe') > 0) return;
        this.grantStoryHoe({ fly: !this.farm?.ownedTools.hoe });
    }

    private needsStoryHoe(): boolean {
        const q = this._quests;
        if (!q) return false;
        if (q.isCompleted(1002) || q.isCompleted(1030)) return true;
        const id = q.activeQuest?.id ?? 0;
        return id === 1002 || id === 1030 || id === 1026;
    }

    /** Dock slot node for an item — used by TutorialGuide arrows. */
    hotbarSlotNode(itemId: string): Node | null {
        if (!this._bar?.isValid) return null;
        for (let i = 0; i < this._slots.length; i++) {
            const s = this._slots[i]!;
            if (s.item === itemId && s.root?.isValid) return s.root;
        }
        const named = this._bar.getChildByName(`Slot_${itemId}`);
        return named?.isValid ? named : null;
    }

    /** First empty hotkey cell (not hand) — tutorial drag drop target. */
    emptyHotbarSlotNode(): Node | null {
        if (!this._bar?.isValid) return null;
        for (let i = 0; i < this._slots.length; i++) {
            if (isHandHot(i)) continue;
            if (this._hotbar[i]) continue;
            const s = this._slots[i];
            if (s?.root?.isValid) return s.root;
        }
        // Full dock: still point at a bindable slot (assign overwrites).
        for (let i = 0; i < this._slots.length; i++) {
            if (isHandHot(i)) continue;
            const s = this._slots[i];
            if (s?.root?.isValid) return s.root;
        }
        return null;
    }

    private ensureHandSlot() {
        this._hotbar[HAND_HOT] = 'hand';
    }

    private swapBag(a: number, b: number) {
        if (a < 0 || b < 0 || a === b) return;
        if (a >= this._backpack.length || b >= this._backpack.length) return;
        if (this._backpack[a]?.id === 'hand' || this._backpack[b]?.id === 'hand') return;
        const tmp = this._backpack[a];
        this._backpack[a] = this._backpack[b];
        this._backpack[b] = tmp;
    }

    private swapHotbar(a: number, b: number) {
        if (a < 0 || b < 0 || a === b) return;
        if (a >= this._hotbar.length || b >= this._hotbar.length) return;
        if (isHandHot(a) || isHandHot(b)) return;
        const tmp = this._hotbar[a];
        this._hotbar[a] = this._hotbar[b];
        this._hotbar[b] = tmp;
        this.ensureHandSlot();
    }

    /** Assign a backpack item onto a hotkey slot (item stays in the bag). */
    private assignHotbar(hotIdx: number, item: InvItemId) {
        if (hotIdx < 0 || hotIdx >= this._hotbar.length || isHandHot(hotIdx)) return;
        if (item === 'hand' || item === 'recipeScroll') return;
        const armClose =
            this._bagOpen && this.teachHotbarItem() === item && !this.isHotbarBound(item);
        this._hotbar[hotIdx] = item;
        this.ensureHandSlot();
        if (armClose) this._awaitBagCloseGuide = true;
    }

    private clearHotbar(hotIdx: number) {
        if (hotIdx < 0 || hotIdx >= this._hotbar.length || isHandHot(hotIdx)) return;
        const was = this._hotbar[hotIdx];
        this._hotbar[hotIdx] = null;
        this.ensureHandSlot();
        if (was && this.farm?.tool === was) this.farm.setTool('hand');
    }

    /** Drop hotkey bindings whose stacks no longer exist in the backpack. */
    private pruneHotbar() {
        for (let i = 0; i < this._hotbar.length; i++) {
            if (isHandHot(i)) continue;
            const id = this._hotbar[i];
            if (!id) continue;
            if (!this._backpack.some((s) => s?.id === id)) this._hotbar[i] = null;
        }
        this.ensureHandSlot();
        const cur = this.farm?.tool;
        if (cur && cur !== 'hand' && !this._backpack.some((s) => s?.id === cur)) {
            this.farm?.setTool('hand');
        }
    }

    private syncFromFarm() {
        if (!this.farm) return;
        this.syncStackCount('seeds', this.farm.seeds);
        this.syncStackCount('parsnip', this.farm.crops);
        this.syncStackCount('boost', this.farm.boosts);
        for (const id of ALL_MATERIALS) {
            this.syncStackCount(id, this.farm.materialCount(id));
        }
        this.ensureOwnedToolsInBag();
        this.refreshHotbarIcons();
        this.refreshInvIcons();
        if (this._chestOpen) this.refreshChestIcons();
        if (this._craftOpen) this.refreshCraftRows();
    }

    /** Mirror FarmSystem.ownedTools into the bag (travel / GM skip). */
    private ensureOwnedToolsInBag() {
        const owned = this.farm?.ownedTools;
        if (!owned) return;
        const ids = [
            ['hoe', owned.hoe],
            ['can', owned.can],
            ['axe', owned.axe],
            ['rod', owned.rod],
        ] as const;
        for (const [id, on] of ids) {
            if (!on || this.bagCount(id) > 0) continue;
            this.mergeOrPlaceInBag({ id, count: 1 });
            // Leave bag-only — TutorialGuide teaches bag → hotbar for each tool.
        }
    }

    /** Mirror an absolute farm counter into the bag (0 removes the stack). */
    private syncStackCount(id: InvItemId, count: number) {
        if (id === 'hand') {
            this.ensureHandSlot();
            return;
        }
        if (id === 'recipeScroll') return;
        const n = Math.max(0, count | 0);
        const idx = this._backpack.findIndex((s) => s?.id === id);
        if (n > 0) {
            if (idx >= 0 && this._backpack[idx]) this._backpack[idx]!.count = n;
            else this.placeInBag({ id, count: n });
        } else if (idx >= 0) {
            this._backpack[idx] = null;
        }
        this.pruneHotbar();
        this.ensureHandSlot();
    }

    private placeInBag(stack: InvStack) {
        if (stack.id === 'hand') {
            this.ensureHandSlot();
            return;
        }
        if (stack.id === 'recipeScroll') {
            const exist = this._backpack.findIndex(
                (s) => s?.id === 'recipeScroll' && s.recipeId === stack.recipeId,
            );
            if (exist >= 0) {
                this._backpack[exist] = { id: 'recipeScroll', count: 1, recipeId: stack.recipeId };
                return;
            }
            const empty = this._backpack.findIndex((s) => !s);
            if (empty >= 0) {
                this._backpack[empty] = { id: 'recipeScroll', count: 1, recipeId: stack.recipeId };
            }
            return;
        }
        const exist = this._backpack.findIndex((s) => s?.id === stack.id);
        if (exist >= 0) {
            this._backpack[exist] = stack;
            return;
        }
        const empty = this._backpack.findIndex((s) => !s);
        if (empty >= 0) this._backpack[empty] = stack;
        this.ensureHandSlot();
    }

    private loadFrames(done: () => void) {
        const chrome: { key: string; uuid: string }[] = [];
        for (const k of TOOL_CHROME_KEYS) {
            const uuid = TOOL_FRAMES[k];
            if (uuid) chrome.push({ key: k, uuid });
        }
        const items: { key: InvItemId; uuid: string }[] = [];
        for (const row of allItems()) {
            const uuid = itemIcon(row.id);
            if (!uuid) continue;
            items.push({ key: row.id as InvItemId, uuid });
        }
        // Fallback if config / display not ready yet (boot race).
        if (items.length === 0) {
            for (const id of [
                'hand',
                'hoe',
                'seeds',
                'can',
                'axe',
                'rod',
                'boost',
                'recipeScroll',
                'parsnip',
                ...ALL_MATERIALS,
            ] as InvItemId[]) {
                const uuid = itemIcon(id) || (TOOL_FRAMES as Record<string, string>)[id];
                if (uuid) items.push({ key: id, uuid });
            }
        }
        const questUuid = QUEST_FRAMES.questBtn;
        const prefabLoads: { key: keyof FarmHUD['_prefabs']; uuid: string }[] = [
            { key: 'hotbar', uuid: FARM_HOTBAR_PREFAB_UUID },
            { key: 'bag', uuid: FARM_BAG_PANEL_PREFAB_UUID },
            { key: 'chest', uuid: FARM_CHEST_PANEL_PREFAB_UUID },
            { key: 'craft', uuid: FARM_CRAFT_PANEL_PREFAB_UUID },
            { key: 'craftRow', uuid: FARM_CRAFT_ROW_PREFAB_UUID },
            { key: 'learn', uuid: FARM_LEARN_PANEL_PREFAB_UUID },
            { key: 'tip', uuid: FARM_TOOL_TIP_PREFAB_UUID },
        ];
        let left = chrome.length + items.length + (questUuid ? 1 : 0) + prefabLoads.length;
        if (!left) {
            done();
            return;
        }
        const finish = () => {
            left--;
            if (left <= 0) done();
        };
        chrome.forEach(({ key, uuid }) => {
            assetManager.loadAny({ uuid }, (err, asset) => {
                if (!err && asset) this._frames[key as keyof typeof TOOL_FRAMES] = asset as SpriteFrame;
                finish();
            });
        });
        items.forEach(({ key, uuid }) => {
            assetManager.loadAny({ uuid }, (err, asset) => {
                if (!err && asset) this._frames[key] = asset as SpriteFrame;
                finish();
            });
        });
        if (questUuid) {
            assetManager.loadAny({ uuid: questUuid }, (err, asset) => {
                if (!err && asset) this._questBtnFrame = asset as SpriteFrame;
                finish();
            });
        }
        prefabLoads.forEach(({ key, uuid }) => {
            assetManager.loadAny({ uuid }, (err, asset) => {
                if (!err && asset) this._prefabs[key] = asset as Prefab;
                else console.warn('[FarmHUD] prefab missing', key, err);
                finish();
            });
        });
    }

    private build() {
        for (const name of [
            'FarmActionBtn',
            'FarmHotbar',
            'FarmUseBtn',
            'FarmToolTip',
            'FarmBagPanel',
            'FarmChestPanel',
            'FarmCraftPanel',
            'FarmLearnPanel',
            // Legacy flat dimmers (pre-prefab nesting)
            'FarmBagDimmer',
            'FarmChestDimmer',
            'FarmCraftDimmer',
            'FarmLearnDimmer',
            'FarmDragGhost',
            'FarmLootFx',
        ]) {
            const n = this.node.getChildByName(name);
            if (n) n.destroy();
        }
        this._lootFxRoot = null;
        this._bagRoot = null;
        this._chestRoot = null;
        this._craftRoot = null;
        this._learnRoot = null;

        this.buildHotbarFromPrefab();
        this.buildBagPanel();
        this.buildChestPanel();
        this.ensureCraftPanel(true);
        this.buildLearnPanel();
        this.buildGhost();
        this.buildTip();

        this.farm?.onToolChange(() => this.refreshSelection());
        this.farm?.onInvChange(() => this.syncFromFarm());
        this.farm?.onLootFly((id, count, wx, wy) => this.playLootFly(id, count, wx, wy));
        this.farm?.onChestOpen(() => this.setChestOpen(true));
        this.farm?.onCraftOpen(() => this.setCraftOpen(true));
        this.buildLootFxRoot();
        this.syncFromFarm();
        this.refreshHotbarIcons();
        this.refreshSelection();
        this.setBagOpen(false);
        this.setChestOpen(false);
        this.setCraftOpen(false);
        this.setLearnOpen(false);
        this.orderLayers();
    }

    /** Rebuild craft rows after Luban tables load. */
    reloadCraftRecipes() {
        this.destroyCraftPanel();
        this.ensureCraftPanel(true);
        this.setCraftOpen(false);
        this.orderLayers();
    }

    private destroyCraftPanel() {
        if (this._craftRoot?.isValid) this._craftRoot.destroy();
        else {
            if (this._craftPanel?.isValid) this._craftPanel.destroy();
            if (this._craftDimmer?.isValid) this._craftDimmer.destroy();
        }
        this._craftRoot = null;
        this._craftPanel = null;
        this._craftDimmer = null;
        this._craftCloseBtn = null;
        this._craftRows = [];
        this._craftPanelRecipeKey = '';
    }

    private visibleCraftRecipes(): CraftRecipe[] {
        const quests = this._quests;
        if (!quests) return getCraftRecipes();
        return getUnlockedCraftRecipes({
            isCompleted: (id) => quests.isCompleted(id),
            isActive: (id) => quests.isActive(id),
            craftCount: (id) => quests.craftCount(id),
            isLearned: (id) => quests.isCraftRecipeLearned(id),
        });
    }

    /** Rebuild when unlock set changes (open craft / recipe tables reload). */
    private ensureCraftPanel(force = false) {
        const recipes = this.visibleCraftRecipes();
        const key = recipes.map((r) => r.id).join('|') || '__empty__';
        if (!force && this._craftPanel?.isValid && key === this._craftPanelRecipeKey) return;
        const wasOpen = this._craftOpen;
        this.destroyCraftPanel();
        this.buildCraftPanel(recipes);
        this._craftPanelRecipeKey = key;
        if (this._craftDimmer) this._craftDimmer.active = wasOpen;
        if (this._craftPanel) this._craftPanel.active = wasOpen;
        if (this._craftCloseBtn) this._craftCloseBtn.active = wasOpen;
    }

    openCraftPanel() {
        this.setCraftOpen(true);
    }

    openBagPanel() {
        if (!this.isBagHudUnlocked()) return;
        this.setBagOpen(true);
    }

    private _quests: QuestSystem | null = null;
    private _questPanelOpen: (() => boolean) | null = null;
    private _openQuestPanelFn: (() => void) | null = null;

    bindQuests(quests: QuestSystem | null) {
        this._quests = quests;
        this.syncQuestEntryVisible();
        this.syncBagEntryVisible();
    }

    /**
     * Force the hotkey dock visible after Loading / dialogue chrome restore.
     * Suppressors can snapshot FarmHotbar while it was still hidden and leave
     * it inactive (mine / town boot especially).
     */
    ensureDockVisible() {
        if (this._bar?.isValid) this._bar.active = !this._learnOpen;
        if (this._barBg?.isValid) {
            this._barBg.active =
                !this._bagOpen && !this._chestOpen && !this._craftOpen && !this._learnOpen;
        }
        this.syncBagEntryVisible();
        this.syncQuestEntryVisible();
        this.orderLayers();
    }

    /** Wire journal open without importing QuestPanel (avoids circular deps). */
    bindQuestPanel(opts: { isOpen: () => boolean; open: () => void } | null) {
        this._questPanelOpen = opts?.isOpen ?? null;
        this._openQuestPanelFn = opts?.open ?? null;
        this.syncQuestEntryVisible();
        this.syncBagEntryVisible();
    }

    /** Bag-adjacent quest journal entry (TutorialGuide spotlight). */
    questBtnNode(): Node | null {
        return this._questBtn?.isValid ? this._questBtn : null;
    }

    /** Backpack badge (TutorialGuide / unlock FX). */
    bagBtnNode(): Node | null {
        return this._bagBtn?.isValid ? this._bagBtn : null;
    }

    private isBagHudUnlocked(): boolean {
        return this._quests?.isBagHudUnlocked() ?? false;
    }

    /** Hide while bag/craft/chest/quest modal open, or before 露穗 unlock. */
    syncQuestEntryVisible() {
        if (!this._questBtn?.isValid) return;
        if (this._unlockFxHideQuest) {
            this._questBtn.active = false;
            return;
        }
        const modal =
            this._bagOpen ||
            this._chestOpen ||
            this._craftOpen ||
            this._learnOpen ||
            !!this._questPanelOpen?.();
        const unlocked = this._quests?.isQuestHudUnlocked() ?? false;
        this._questBtn.active = unlocked && !modal;
    }

    /** Hide backpack badge while modal open, unlock fly playing, or before 露穗 talk. */
    syncBagEntryVisible() {
        if (!this._bagBtn?.isValid) return;
        if (this._unlockFxHideBag) {
            this._bagBtn.active = false;
            return;
        }
        const modal =
            this._bagOpen || this._chestOpen || this._craftOpen || this._learnOpen;
        this._bagBtn.active = this.isBagHudUnlocked() && !modal;
    }

    /**
     * First 露穗 unlock: quest + bag icons pop at screen center, then arc into
     * their hotbar badges. Real buttons stay hidden until each fly lands.
     */
    playHudUnlockFx() {
        if (this._unlockFxHideQuest || this._unlockFxHideBag) return;
        if (!this._quests?.isQuestHudUnlocked()) return;

        this._unlockFxHideQuest = true;
        this._unlockFxHideBag = true;
        if (this._questBtn?.isValid) this._questBtn.active = false;
        if (this._bagBtn?.isValid) this._bagBtn.active = false;

        const questSf = this._questBtnFrame;
        const bagSf = this._frames.bagBtn ?? this._frames.backpack ?? null;
        const questTo = this.questFlyTarget();
        const bagTo = this.bagFlyTarget();

        const landQuest = () => {
            this._unlockFxHideQuest = false;
            this.syncQuestEntryVisible();
            this.pulseQuestBtn();
        };
        const landBag = () => {
            this._unlockFxHideBag = false;
            this.syncBagEntryVisible();
            this.pulseBagBtn();
        };

        this.spawnUnlockFlyIcon(questSf, 0, 40, questTo.x, questTo.y, 0, landQuest);
        this.spawnUnlockFlyIcon(bagSf, 0, 40, bagTo.x, bagTo.y, 0.16, landBag);
        if (this._lootFxRoot?.isValid) {
            this._lootFxRoot.setSiblingIndex(this.node.children.length - 1);
        }
    }

    private openQuestPanel() {
        if (this._chestOpen) this.setChestOpen(false);
        if (this._craftOpen) this.setCraftOpen(false);
        if (this._bagOpen) this.setBagOpen(false);
        this._openQuestPanelFn?.();
        this.syncQuestEntryVisible();
    }

    /** Dimmer < panels < hotbar < learn (covers bag+dock) < tip < drag ghost < loot fly */
    private orderLayers() {
        const nodes = [
            this._bagRoot ?? this._dimmer,
            this._bagRoot ? null : this._panel,
            this._chestRoot ?? this._chestDimmer,
            this._chestRoot ? null : this._chestPanel,
            this._craftRoot ?? this._craftDimmer,
            this._craftRoot ? null : this._craftPanel,
            this._bar,
            this._learnRoot ?? this._learnDimmer,
            this._learnRoot ? null : this._learnPanel,
            this._tip,
            this._ghost,
            this._lootFxRoot,
        ];
        for (const n of nodes) {
            if (n?.isValid) n.setSiblingIndex(this.node.children.length - 1);
        }
    }

    private buildLootFxRoot() {
        const root = new Node('FarmLootFx');
        root.layer = this.node.layer;
        root.setParent(this.node);
        root.addComponent(UITransform).setContentSize(4, 4);
        this._lootFxRoot = root;
    }

    /** Arc icons from world pickup → backpack button. */
    private playLootFly(id: FarmMaterial, count: number, wx: number, wy: number) {
        if (!this._lootFxRoot?.isValid) return;
        const sf = this.frameFor(id);
        if (!sf) return;
        const from = this.worldToCanvas(wx, wy);
        this.playCanvasLootFly(sf, from.x, from.y, count);
    }

    /**
     * Canvas-space icons arc into a HUD target.
     * `bag` → backpack button; `gold` → top-right G coin mark on FarmInfoBoard.
     */
    playCanvasLootFly(
        sf: SpriteFrame,
        fromX: number,
        fromY: number,
        count = 1,
        target: 'bag' | 'gold' = 'bag',
        onLandExtra?: () => void,
    ) {
        if (!this._lootFxRoot?.isValid || !sf?.isValid) return;
        const to = target === 'gold' ? this.goldFlyTarget() : this.bagFlyTarget();
        const onLand = () => {
            if (target === 'gold') this.pulseGoldBar();
            else this.pulseBagBtn();
            onLandExtra?.();
        };
        // Quest UI grants often show large counts (gold×20); a few icons read cleaner.
        const n = Math.max(1, Math.min(count, 3));
        for (let i = 0; i < n; i++) {
            this.spawnLootFlyIcon(sf, fromX, fromY, to.x, to.y, i, n, onLand, target);
        }
        // Above RewardPopup / other canvas chrome while the arc plays.
        this._lootFxRoot.setSiblingIndex(this.node.children.length - 1);
    }

    private worldToCanvas(wx: number, wy: number): { x: number; y: number } {
        const world = this.farm?.world;
        if (!world?.isValid) return { x: 0, y: 0 };
        const s = Math.max(0.0001, world.scale.x);
        return {
            x: wx * s + world.position.x,
            y: wy * s + world.position.y,
        };
    }

    private bagFlyTarget(): { x: number; y: number } {
        if (this._bagOpen && this._panel?.isValid) {
            // Bag open: fly into the wood panel center.
            return { x: this._panel.position.x, y: this._panel.position.y + 40 };
        }
        if (this._bar?.isValid && this._bagBtn?.isValid) {
            return {
                x: this._bar.position.x + this._bagBtn.position.x,
                y: this._bar.position.y + this._bagBtn.position.y,
            };
        }
        return { x: 420, y: BAR_Y + SLOT };
    }

    private questFlyTarget(): { x: number; y: number } {
        if (this._bar?.isValid && this._questBtn?.isValid) {
            return {
                x: this._bar.position.x + this._questBtn.position.x,
                y: this._bar.position.y + this._questBtn.position.y,
            };
        }
        const bag = this.bagFlyTarget();
        const gap = Math.round(10 * UI_SCALE);
        return { x: bag.x - BAG_BTN - gap, y: bag.y };
    }

    /** Center-screen badge → HUD dock (feature unlock). */
    private spawnUnlockFlyIcon(
        sf: SpriteFrame | null | undefined,
        fromX: number,
        fromY: number,
        toX: number,
        toY: number,
        delay: number,
        onLand?: () => void,
    ) {
        const root = this._lootFxRoot;
        if (!root?.isValid || !sf?.isValid) {
            this.scheduleOnce(() => onLand?.(), delay + 0.05);
            return;
        }

        const size = BAG_BTN;
        const node = new Node('HudUnlockFly');
        node.layer = root.layer;
        node.setParent(root);
        node.addComponent(UITransform).setContentSize(size, size);
        const sp = node.addComponent(Sprite);
        sp.sizeMode = Sprite.SizeMode.CUSTOM;
        sp.trim = true;
        sp.spriteFrame = sf;
        const op = node.addComponent(UIOpacity);
        op.opacity = 255;

        node.setPosition(fromX, fromY, 0);
        node.setScale(0.15, 0.15, 1);

        const popDur = 0.2;
        const travel = 0.58;
        const peak = new Vec3(
            fromX + (toX - fromX) * 0.42,
            Math.max(fromY, toY) + 140,
            0,
        );
        const end = new Vec3(toX, toY, 0);

        tween(node)
            .delay(delay)
            .to(popDur, { scale: new Vec3(1.28, 1.28, 1) }, { easing: 'backOut' })
            .to(
                travel * 0.42,
                { position: peak, scale: new Vec3(1.08, 1.08, 1) },
                { easing: 'sineOut' },
            )
            .to(
                travel * 0.58,
                { position: end, scale: new Vec3(1, 1, 1) },
                { easing: 'quadIn' },
            )
            .call(() => {
                if (node.isValid) node.destroy();
                onLand?.();
            })
            .start();

        // Soft fade only on the final approach so the dock badge can take over.
        tween(op)
            .delay(delay + popDur + travel * 0.75)
            .to(travel * 0.25, { opacity: 0 }, { easing: 'sineIn' })
            .start();

        this.orderLayers();
    }

    private goldFlyTarget(): { x: number; y: number } {
        const board = this._quests?.infoBoard;
        if (board?.isValid) return board.goldFlyTarget();
        // Design-space approx of the top-right G coin (1080×1920).
        return { x: 144, y: 664 };
    }

    private spawnLootFlyIcon(
        sf: SpriteFrame,
        fromX: number,
        fromY: number,
        toX: number,
        toY: number,
        index: number,
        total: number,
        onLand?: () => void,
        target: 'bag' | 'gold' = 'bag',
    ) {
        const root = this._lootFxRoot;
        if (!root?.isValid) return;

        // Base icon (64) × UI_SCALE — same as hotbar / bag material icons.
        const size = ICON;
        const node = new Node(`LootFly_${index}`);
        node.layer = root.layer;
        node.setParent(root);
        node.addComponent(UITransform).setContentSize(size, size);
        const sp = node.addComponent(Sprite);
        sp.sizeMode = Sprite.SizeMode.CUSTOM;
        sp.trim = true;
        sp.spriteFrame = sf;
        const op = node.addComponent(UIOpacity);
        op.opacity = 255;

        // Fan out a little so stacked grants don't sit on one pixel.
        const spread = (index - (total - 1) * 0.5) * 14;
        const startX = fromX + spread;
        const startY = fromY + Math.abs(spread) * 0.15;
        node.setPosition(startX, startY, 0);
        node.setScale(0.4, 0.4, 1);

        const delay = index * 0.06;
        const dist = Math.hypot(toX - startX, toY - startY);
        // Quest claim (center → bag) is a long arc; scale duration so it doesn't vanish mid-flight.
        const travel = Math.min(0.95, Math.max(0.42, dist / 1100));
        const popDur = 0.12;
        const riseDur = travel * 0.38;
        const fallDur = travel * 0.62;
        // Gold → G mark: tighter, more direct arc so it reads as landing on the coin.
        const arcH =
            target === 'gold'
                ? Math.min(90, 36 + dist * 0.04) + (index % 3) * 6
                : Math.min(180, 70 + dist * 0.1) + (index % 3) * 12;
        const peakT = target === 'gold' ? 0.55 : 0.4;
        const peakX = startX + (toX - startX) * peakT + spread * (target === 'gold' ? 0.15 : 0.4);
        const peakY =
            target === 'gold'
                ? startY + (toY - startY) * peakT + arcH
                : Math.max(startY, toY) + arcH;
        const peak = new Vec3(peakX, peakY, 0);
        const end = new Vec3(toX, toY, 0);
        const landScale = new Vec3(0.35, 0.35, 1);

        // Keep fully visible until the final approach — early fade looked like a cut-off.
        const fadeDelay = delay + popDur + riseDur + fallDur * 0.55;
        const fadeDur = Math.max(0.12, fallDur * 0.45);

        tween(node)
            .delay(delay)
            .to(popDur, { scale: new Vec3(1.12, 1.12, 1) }, { easing: 'backOut' })
            .to(riseDur, { position: peak }, { easing: 'sineOut' })
            .to(fallDur, { position: end, scale: landScale }, { easing: 'quadIn' })
            .call(() => {
                if (node.isValid) node.destroy();
                if (index === total - 1) onLand?.();
            })
            .start();

        tween(op)
            .delay(fadeDelay)
            .to(fadeDur, { opacity: 0 }, { easing: 'sineIn' })
            .start();

        this.orderLayers();
    }

    private pulseBagBtn() {
        const btn = this._bagBtn;
        if (!btn?.isValid || !btn.active) return;
        const gen = ++this._bagPulseGen;
        tween(btn)
            .to(0.08, { scale: new Vec3(1.18, 1.18, 1) }, { easing: 'sineOut' })
            .to(0.12, { scale: new Vec3(1, 1, 1) }, { easing: 'sineIn' })
            .call(() => {
                if (gen !== this._bagPulseGen || !btn.isValid) return;
                btn.setScale(1, 1, 1);
            })
            .start();
    }

    private pulseQuestBtn() {
        const btn = this._questBtn;
        if (!btn?.isValid || !btn.active) return;
        const gen = ++this._questPulseGen;
        tween(btn)
            .to(0.08, { scale: new Vec3(1.18, 1.18, 1) }, { easing: 'sineOut' })
            .to(0.12, { scale: new Vec3(1, 1, 1) }, { easing: 'sineIn' })
            .call(() => {
                if (gen !== this._questPulseGen || !btn.isValid) return;
                btn.setScale(1, 1, 1);
            })
            .start();
    }

    private pulseGoldBar() {
        this._quests?.infoBoard?.pulseGold();
    }

    private paintDimmerOnce(dimmer: Node | null, alpha: number) {
        if (!dimmer) return;
        const g = dimmer.getComponent(Graphics);
        if (!g) return;
        g.clear();
        g.fillColor = new Color(0, 0, 0, alpha);
        g.rect(-1100, -2000, 2200, 4000);
        g.fill();
    }

    private bindCloseFromPrefab(panel: Node, assign: (n: Node) => void) {
        const btn = panel.getChildByName('CloseBtn');
        if (!btn) return;
        paintPanelCloseVisual(btn, {
            size: CLOSE_BTN,
            layer: panel.layer,
            frame: this._frames.close ?? null,
        });
        assign(btn);
    }

    private fillGridHost(
        grid: Node,
        rows: number,
        cols: number,
        slot: number,
        gap: number,
        prefix: string,
    ): { root: Node; icon: Sprite | null; count: Label | null }[] {
        const cells: { root: Node; icon: Sprite | null; count: Label | null }[] = [];
        const gridW = cols * slot + (cols - 1) * gap;
        const gridH = rows * slot + (rows - 1) * gap;
        const originX = -gridW * 0.5 + slot * 0.5;
        const originY = gridH * 0.5 - slot * 0.5;
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                const root = new Node(`${prefix}_${r}_${c}`);
                root.layer = grid.layer;
                root.setParent(grid);
                root.setPosition(originX + c * (slot + gap), originY - r * (slot + gap), 0);
                root.addComponent(UITransform).setContentSize(slot, slot);
                this.addSlotPlate(root, Math.round(slot * 0.9));
                const icon = this.addIcon(root, null, Math.round(slot * 0.62));
                const count = this.addCountLabel(root, slot);
                cells.push({ root, icon, count });
            }
        }
        return cells;
    }

    private buildHotbarFromPrefab() {
        const canvas = this.node;
        const prefab = this._prefabs.hotbar;
        if (!prefab) {
            console.warn('[FarmHUD] FarmHotbar prefab missing — dock unavailable');
            return;
        }
        const bar = instantiate(prefab);
        bar.layer = canvas.layer;
        bar.setParent(canvas);
        this._bar = bar;
        this._barBg = bar.getChildByName('BarBg');
        if (this._barBg) applyHotbarBg(this._barBg, BAR_BG_W, BAR_H);

        this._slots = [];
        for (let i = 0; i < SLOT_COUNT; i++) {
            const root = bar.getChildByName(`Slot_${i}`);
            if (!root) continue;
            const item = this.hotbarItem(i);
            const glow = root.getChildByName('Glow')?.getComponent(Graphics) ?? root.addComponent(Graphics);
            this.addSlotPlate(root);
            const icon = this.addIcon(root, item ? this.frameFor(item) : null, ICON);
            const count = this.addCountLabel(root, SLOT);
            root.name = item ? `Slot_${item}` : `Slot_empty_${i}`;
            this._slots.push({ item, root, glow, icon, count });
        }

        const bag = bar.getChildByName('BagBtn');
        if (bag) {
            this._bagBtn = bag;
            this._bagGlow = bag.getChildByName('Glow')?.getComponent(Graphics) ?? null;
            const face = bag.getChildByName('Face');
            const sp = face?.getComponent(Sprite);
            if (sp) {
                const sf = this._frames.bagBtn ?? this._frames.backpack ?? null;
                if (sf) sp.spriteFrame = sf;
            }
            this.syncBagEntryVisible();
        }

        const quest = bar.getChildByName('QuestBtn');
        if (quest) {
            this._questBtn = quest;
            const face = quest.getChildByName('Face');
            const sp = face?.getComponent(Sprite);
            if (sp && this._questBtnFrame) sp.spriteFrame = this._questBtnFrame;
            this.syncQuestEntryVisible();
        }
    }

    private buildBagPanel() {
        const prefab = this._prefabs.bag;
        if (!prefab) {
            console.warn('[FarmHUD] FarmBagPanel prefab missing');
            return;
        }
        const root = instantiate(prefab);
        root.layer = this.node.layer;
        root.setParent(this.node);
        root.active = true;
        this._bagRoot = root;
        this._dimmer = root.getChildByName('Dimmer');
        this._panel = root.getChildByName('Panel');
        this.paintDimmerOnce(this._dimmer, 140);

        const panel = this._panel;
        if (!panel) return;
        const chromeN = panel.getChildByName('Chrome');
        if (chromeN) applyWoodPanel(chromeN, HL.bagPanelW, HL.bagPanelH);
        const title = panel.getChildByName('Title')?.getComponent(Label);
        if (title) {
            styleUiLabel(title, {
                size: Math.round(28 * UI_SCALE),
                color: new Color(255, 244, 214, 255),
                outline: true,
            });
        }
        this.bindCloseFromPrefab(panel, (n) => {
            this._closeBtn = n;
        });

        const grid = panel.getChildByName('Grid');
        this._invCells = grid
            ? this.fillGridHost(grid, INV_STORAGE_ROWS, INV_COLS, INV_SLOT, INV_GAP, 'Inv')
            : [];
        if (this._dimmer) this._dimmer.active = false;
        panel.active = false;
        if (this._closeBtn) this._closeBtn.active = false;
    }

    private buildGhost() {
        const canvas = this.node;
        const ghost = new Node('FarmDragGhost');
        ghost.layer = canvas.layer;
        ghost.setParent(canvas);
        ghost.addComponent(UITransform).setContentSize(ICON, ICON);
        const sp = ghost.addComponent(Sprite);
        sp.sizeMode = Sprite.SizeMode.CUSTOM;
        sp.color = new Color(255, 255, 255, 220);
        ghost.active = false;
        this._ghost = ghost;
        this._ghostSp = sp;
    }

    private addSlotPlate(root: Node, size = PLATE) {
        let plate = root.getChildByName('Plate');
        if (!plate) {
            plate = new Node('Plate');
            plate.layer = root.layer;
            plate.setParent(root);
            plate.setSiblingIndex(0);
            plate.addComponent(UITransform).setContentSize(size, size);
        }
        plate.getComponent(UITransform)?.setContentSize(size, size);
        if (this._frames.slot) {
            const sp = plate.getComponent(Sprite) ?? plate.addComponent(Sprite);
            sp.sizeMode = Sprite.SizeMode.CUSTOM;
            sp.trim = false;
            sp.spriteFrame = this._frames.slot;
        } else {
            applySlotPlate(plate, size, size);
        }
    }

    private addIcon(root: Node, sf: SpriteFrame | null, size: number): Sprite {
        const icon = new Node('Icon');
        icon.layer = root.layer;
        icon.setParent(root);
        icon.addComponent(UITransform).setContentSize(size, size);
        const sp = icon.addComponent(Sprite);
        sp.sizeMode = Sprite.SizeMode.CUSTOM;
        if (sf) sp.spriteFrame = sf;
        icon.active = !!sf;
        return sp;
    }

    private addCountLabel(root: Node, slotSize: number): Label {
        const n = new Node('Count');
        n.layer = root.layer;
        n.setParent(root);
        n.setPosition(slotSize * 0.28, -slotSize * 0.28, 0);
        n.addComponent(UITransform).setContentSize(slotSize * 0.5, slotSize * 0.35);
        const lab = n.addComponent(Label);
        lab.horizontalAlign = Label.HorizontalAlign.RIGHT;
        lab.verticalAlign = Label.VerticalAlign.BOTTOM;
        styleUiLabel(lab, {
            size: Math.round(18 * UI_SCALE),
            color: new Color(255, 255, 255, 255),
            outline: true,
        });
        lab.string = '';
        n.active = false;
        return lab;
    }

    private frameFor(id: InvItemId): SpriteFrame | null {
        return this._frames[id] ?? null;
    }

    /** Icon for a bag stack — recipe scrolls use the scroll glyph. */
    private frameForStack(stack: InvStack): SpriteFrame | null {
        return this.frameFor(stack.id);
    }

    private refreshHotbarIcons() {
        this.pruneHotbar();
        for (let i = 0; i < this._slots.length; i++) {
            const s = this._slots[i]!;
            const item = this._hotbar[i] ?? null;
            s.item = item;
            const sf = item ? this.frameFor(item) : null;
            if (!s.icon && s.root?.isValid) {
                s.icon = this.addIcon(s.root, sf, ICON);
            }
            if (s.icon) {
                s.icon.spriteFrame = sf;
                s.icon.node.active = !!sf;
            }
            if (s.root?.isValid) {
                s.root.name = item ? `Slot_${item}` : `Slot_empty_${i}`;
            }
            if (s.count) {
                const n = item && item !== 'hand' ? this.bagCount(item) : 0;
                const show = !!item && item !== 'hand' && n > 1;
                s.count.string = show ? String(n) : '';
                s.count.node.active = show;
            }
        }
    }

    private refreshInvIcons() {
        for (let i = 0; i < this._invCells.length; i++) {
            const cell = this._invCells[i]!;
            const stack = this._backpack[i] ?? null;
            const sf = stack ? this.frameForStack(stack) : null;
            if (cell.icon) {
                cell.icon.spriteFrame = sf;
                cell.icon.node.active = !!sf;
            }
            if (cell.root?.isValid) {
                cell.root.name = isRecipeScroll(stack)
                    ? `Inv_recipe_${stack.recipeId}`
                    : stack
                      ? `Inv_${stack.id}`
                      : `Inv_empty_${i}`;
            }
            if (cell.count) {
                const show = !!stack && stack.count > 1 && stack.id !== 'recipeScroll';
                cell.count.string = show ? String(stack!.count) : '';
                cell.count.node.active = show;
            }
        }
    }

    private toggleBag() {
        if (!this.isBagHudUnlocked()) return;
        if (this._chestOpen) this.setChestOpen(false);
        if (this._craftOpen) this.setCraftOpen(false);
        this.setBagOpen(!this._bagOpen);
    }

    private setBagOpen(open: boolean) {
        this._bagOpen = open;
        if (open && this._chestOpen) this.setChestOpen(false);
        if (open && this._craftOpen) this.setCraftOpen(false);
        if (!open) this.setLearnOpen(false);
        InputBridge.uiBlocking =
            open || this._chestOpen || this._craftOpen || this._learnOpen;
        // Learn modal owns the single scrim while open — don't stack bag+learn dims.
        if (this._dimmer) this._dimmer.active = open && !this._learnOpen;
        if (this._panel) this._panel.active = open && !this._learnOpen;
        // Unified bag chrome covers the standalone hotbar plate + bag tab.
        if (this._barBg) {
            this._barBg.active =
                !open && !this._chestOpen && !this._craftOpen && !this._learnOpen;
        }
        this.syncBagEntryVisible();
        if (this._closeBtn) this._closeBtn.active = open;
        if (!open) {
            this._awaitBagCloseGuide = false;
            this.cancelDrag();
        }
        this.refreshBagBtn();
        this.syncQuestEntryVisible();
        if (open) {
            this.syncFromFarm();
            this.hideTip();
            this.orderLayers();
        }
    }

    private buildChestPanel() {
        const prefab = this._prefabs.chest;
        if (!prefab) {
            console.warn('[FarmHUD] FarmChestPanel prefab missing');
            return;
        }
        const root = instantiate(prefab);
        root.layer = this.node.layer;
        root.setParent(this.node);
        root.active = true;
        this._chestRoot = root;
        this._chestDimmer = root.getChildByName('Dimmer');
        this._chestPanel = root.getChildByName('Panel');
        this.paintDimmerOnce(this._chestDimmer, 150);

        const panel = this._chestPanel;
        if (!panel) return;
        const chestChrome = panel.getChildByName('Chrome');
        if (chestChrome) applyWoodPanel(chestChrome, HL.chestPanelW, HL.chestPanelH);

        for (const name of ['Title', 'Hint', 'BagLabel']) {
            const lab = panel.getChildByName(name)?.getComponent(Label);
            if (!lab) continue;
            if (name === 'Hint') {
                styleUiLabel(lab, {
                    size: Math.round(15 * UI_SCALE),
                    color: new Color(210, 190, 150, 255),
                    outline: false,
                });
            } else {
                styleUiLabel(lab, {
                    size: Math.round(28 * UI_SCALE),
                    color: new Color(255, 244, 214, 255),
                    outline: true,
                });
            }
        }

        this.bindCloseFromPrefab(panel, (n) => {
            this._chestCloseBtn = n;
        });

        const take = panel.getChildByName('TakeAll');
        if (take) {
            this._takeAllBtn = take;
            applyWoodButton(take, 'primary', HL.takeAllW, HL.takeAllH);
            const takeLab = take.getChildByName('Label')?.getComponent(Label);
            if (takeLab) {
                styleUiLabel(takeLab, {
                    size: Math.round(28 * UI_SCALE),
                    color: new Color(255, 244, 214, 255),
                    outline: true,
                });
            }
            take.active = false;
        }

        const chestGrid = panel.getChildByName('ChestGrid');
        this._chestCells = chestGrid
            ? this.fillGridHost(chestGrid, CHEST_ROWS, CHEST_COLS, CHEST_SLOT, CHEST_GAP, 'Chest')
            : [];
        const bagGrid = panel.getChildByName('BagGrid');
        this._chestBagCells = bagGrid
            ? this.fillGridHost(bagGrid, INV_STORAGE_ROWS, CHEST_COLS, CHEST_SLOT, CHEST_GAP, 'Bag')
            : [];

        if (this._chestDimmer) this._chestDimmer.active = false;
        panel.active = false;
        if (this._chestCloseBtn) this._chestCloseBtn.active = false;
    }

    private setChestOpen(open: boolean) {
        this._chestOpen = open;
        if (open && this._bagOpen) this.setBagOpen(false);
        if (open && this._craftOpen) this.setCraftOpen(false);
        if (!open) this.setLearnOpen(false);
        InputBridge.uiBlocking =
            open || this._bagOpen || this._craftOpen || this._learnOpen;
        if (this._chestDimmer) this._chestDimmer.active = open;
        if (this._chestPanel) this._chestPanel.active = open;
        if (this._chestCloseBtn) this._chestCloseBtn.active = open;
        if (this._takeAllBtn) this._takeAllBtn.active = open;
        // Hide standalone hotbar plate + bag tab; keep slot icons so they sit in the dock.
        if (this._barBg) {
            this._barBg.active =
                !open && !this._bagOpen && !this._craftOpen && !this._learnOpen;
        }
        this.syncBagEntryVisible();
        if (this._bar) this._bar.active = true;
        this.syncQuestEntryVisible();
        if (!open) this.cancelDrag();
        if (open) {
            this.syncFromFarm();
            this.refreshChestIcons();
            this.refreshHotbarIcons();
            this.refreshSelection();
            this.hideTip();
            this.orderLayers();
        }
    }

    private buildCraftPanel(recipes: CraftRecipe[]) {
        const prefab = this._prefabs.craft;
        if (!prefab) {
            console.warn('[FarmHUD] FarmCraftPanel prefab missing');
            return;
        }
        const root = instantiate(prefab);
        root.layer = this.node.layer;
        root.setParent(this.node);
        root.active = true;
        this._craftRoot = root;
        this._craftDimmer = root.getChildByName('Dimmer');
        this._craftPanel = root.getChildByName('Panel');
        this.paintDimmerOnce(this._craftDimmer, 150);

        const n = Math.max(1, recipes.length);
        const listH = n * CRAFT_ROW_H + Math.max(0, n - 1) * CRAFT_ROW_GAP;
        const panelW = HL.craftPanelW;
        const panelH = CRAFT_PAD + CRAFT_HEADER_H + Math.round(8 * UI_SCALE) + listH + CRAFT_PAD;
        const panel = this._craftPanel;
        if (!panel) return;

        // Dynamic height for N recipes — only Panel/Chrome/ListHost sizes change.
        panel.getComponent(UITransform)?.setContentSize(panelW, panelH);
        const panelBottom = BAR_Y + BAR_H * 0.5 + Math.round(18 * UI_SCALE);
        let panelY = panelBottom + panelH * 0.5;
        const maxTop = view.getVisibleSize().height * 0.5 - Math.round(24 * UI_SCALE);
        const top = panelY + panelH * 0.5;
        if (top > maxTop) panelY -= top - maxTop;
        panel.setPosition(0, panelY, 0);

        const chromeN = panel.getChildByName('Chrome');
        chromeN?.getComponent(UITransform)?.setContentSize(panelW, panelH);
        if (chromeN) applyWoodPanel(chromeN, panelW, panelH);

        const title = panel.getChildByName('Title')?.getComponent(Label);
        if (title) {
            title.string = '制作台';
            styleUiLabel(title, {
                size: Math.round(28 * UI_SCALE),
                color: new Color(255, 244, 214, 255),
                outline: true,
            });
            const headerTop = panelH * 0.5 - CRAFT_PAD;
            title.node.setPosition(0, headerTop - CRAFT_HEADER_H * 0.5, 0);
        }
        this.bindCloseFromPrefab(panel, (btn) => {
            this._craftCloseBtn = btn;
        });

        const listHost = panel.getChildByName('ListHost') ?? panel;
        const headerTop = panelH * 0.5 - CRAFT_PAD;
        const listTop = headerTop - CRAFT_HEADER_H - Math.round(6 * UI_SCALE);
        const listHostY = listTop - listH * 0.5;
        listHost.setPosition(0, listHostY, 0);
        listHost.getComponent(UITransform)?.setContentSize(HL.craftRowW, listH);

        this._craftRows = [];
        recipes.forEach((recipe, i) => {
            const rowY = listH * 0.5 - CRAFT_ROW_H * 0.5 - i * (CRAFT_ROW_H + CRAFT_ROW_GAP);
            this._craftRows.push(this.buildCraftRow(listHost, panelW, recipe, rowY));
        });

        if (this._craftCloseBtn?.isValid) {
            this._craftCloseBtn.setSiblingIndex(panel.children.length - 1);
        }
        if (this._craftDimmer) this._craftDimmer.active = false;
        panel.active = false;
        if (this._craftCloseBtn) this._craftCloseBtn.active = false;
    }

    private buildCraftRow(
        listHost: Node,
        _panelW: number,
        recipe: CraftRecipe,
        rowY: number,
    ): {
        root: Node;
        recipe: CraftRecipe;
        costLabs: Label[];
        craftBtn: Node;
        craftLab: Label;
        btnSp: Sprite | null;
        btnOp: UIOpacity | null;
        progressRoot: Node;
        barGfx: Graphics;
        barLab: Label;
        barW: number;
        barXNoAd: number;
        barXWithAd: number;
        barWWithAd: number;
        adBtn: Node;
        adOp: UIOpacity | null;
    } {
        const rowPrefab = this._prefabs.craftRow;
        const root = rowPrefab ? instantiate(rowPrefab) : new Node(`Craft_${recipe.id}`);
        root.name = `Craft_${recipe.id}`;
        root.layer = listHost.layer;
        root.setParent(listHost);
        root.setPosition(0, rowY, 0);
        if (!rowPrefab) {
            root.addComponent(UITransform).setContentSize(HL.craftRowW, CRAFT_ROW_H);
            root.addComponent(Graphics);
        }

        const rowW = HL.craftRowW;
        applyParchmentRow(root, rowW, CRAFT_ROW_H);

        const outRoot = root.getChildByName('Out') ?? new Node('Out');
        if (!outRoot.parent) {
            outRoot.layer = root.layer;
            outRoot.setParent(root);
            outRoot.addComponent(UITransform).setContentSize(CRAFT_OUT_SZ, CRAFT_OUT_SZ);
        }
        this.addSlotPlate(outRoot, Math.round(CRAFT_OUT_SZ * 0.95));
        this.addIcon(outRoot, this.frameFor(recipe.out.id), Math.round(CRAFT_OUT_SZ * 0.7));
        const outCount = this.addCountLabel(outRoot, CRAFT_OUT_SZ);
        if (outCount) {
            outCount.string = recipe.out.count > 1 ? String(recipe.out.count) : '';
            outCount.node.active = recipe.out.count > 1;
        }

        const nameLab = root.getChildByName('Name')?.getComponent(Label);
        if (nameLab) {
            nameLab.string = recipe.name;
            styleUiLabel(nameLab, {
                size: Math.round(22 * UI_SCALE),
                color: new Color(60, 40, 22, 255),
                outline: false,
            });
        }

        const costLabs: Label[] = [];
        for (let i = 0; i < CRAFT_COST_SLOTS; i++) {
            const cell = root.getChildByName(`Cost_${i}`);
            if (!cell) continue;
            const cost = recipe.cost[i];
            if (!cost) {
                cell.active = false;
                continue;
            }
            cell.active = true;
            const iconHost = cell.getChildByName('IconHost') ?? cell;
            this.addIcon(iconHost, this.frameFor(cost.id), Math.round(CRAFT_COST_ICON * 0.92));
            const lab = cell.getChildByName('Need')?.getComponent(Label);
            if (lab) {
                lab.string = `0/${cost.count}`;
                styleUiLabel(lab, {
                    size: Math.round(18 * UI_SCALE),
                    color: new Color(70, 48, 28, 255),
                    outline: false,
                });
                costLabs.push(lab);
            }
        }

        const btn = root.getChildByName('CraftBtn') ?? new Node('CraftBtn');
        if (!btn.parent) {
            btn.layer = root.layer;
            btn.setParent(root);
            btn.addComponent(UITransform).setContentSize(CRAFT_BTN_W, CRAFT_BTN_H);
        }
        let btnSp = btn.getComponent(Sprite);
        let btnOp = btn.getComponent(UIOpacity);
        if (this._frames.craftBtn) {
            if (!btnSp) btnSp = btn.addComponent(Sprite);
            btnSp.sizeMode = Sprite.SizeMode.CUSTOM;
            btnSp.trim = false;
            btnSp.spriteFrame = this._frames.craftBtn;
            if (!btnOp) btnOp = btn.addComponent(UIOpacity);
            btnOp.opacity = 255;
        } else {
            applyWoodButton(btn, 'primary', CRAFT_BTN_W, CRAFT_BTN_H);
        }
        let craftLab = btn.getChildByName('Label')?.getComponent(Label) ?? null;
        if (!craftLab) {
            const labN = new Node('Label');
            labN.layer = btn.layer;
            labN.setParent(btn);
            labN.addComponent(UITransform).setContentSize(CRAFT_BTN_W, CRAFT_BTN_H);
            craftLab = labN.addComponent(Label);
        }
        craftLab.string = '制作';
        styleUiLabel(craftLab, {
            size: Math.round(24 * UI_SCALE),
            color: new Color(255, 244, 214, 255),
            outline: true,
        });

        const progressRoot = root.getChildByName('Progress') ?? new Node('Progress');
        if (!progressRoot.parent) {
            progressRoot.layer = root.layer;
            progressRoot.setParent(root);
            progressRoot.addComponent(UITransform).setContentSize(CRAFT_BTN_W, CRAFT_BAR_H);
        }
        progressRoot.active = false;
        const barGfx = progressRoot.getComponent(Graphics) ?? progressRoot.addComponent(Graphics);
        this.paintCraftProgress(barGfx, CRAFT_BTN_W, 0);
        const barLab =
            progressRoot.getChildByName('BarLabel')?.getComponent(Label) ??
            (() => {
                const n = new Node('BarLabel');
                n.setParent(progressRoot);
                n.addComponent(UITransform).setContentSize(CRAFT_BTN_W, CRAFT_BAR_H);
                return n.addComponent(Label);
            })();
        styleUiLabel(barLab, {
            size: Math.round(18 * UI_SCALE),
            color: new Color(255, 244, 214, 255),
            outline: true,
        });

        const adBtn = root.getChildByName('AdBtn') ?? new Node('AdBtn');
        if (!adBtn.parent) {
            adBtn.layer = root.layer;
            adBtn.setParent(root);
            adBtn.addComponent(UITransform).setContentSize(CRAFT_AD_SZ, CRAFT_AD_SZ);
        }
        adBtn.active = false;
        let adOp = adBtn.getComponent(UIOpacity);
        if (this._frames.adVideo) {
            const sp = adBtn.getComponent(Sprite) ?? adBtn.addComponent(Sprite);
            sp.sizeMode = Sprite.SizeMode.CUSTOM;
            sp.trim = false;
            sp.spriteFrame = this._frames.adVideo;
            if (!adOp) adOp = adBtn.addComponent(UIOpacity);
            adOp.opacity = 255;
        }

        const barXNoAd = btn.position.x;
        const adX = adBtn.position.x;
        const barRightWithAd = adX - CRAFT_AD_SZ * 0.5 - CRAFT_COL_GAP;
        const barWWithAd = CRAFT_BTN_W;
        const barXWithAd = barRightWithAd - barWWithAd * 0.5;

        return {
            root,
            recipe,
            costLabs,
            craftBtn: btn,
            craftLab,
            btnSp,
            btnOp,
            progressRoot,
            barGfx,
            barLab,
            barW: CRAFT_BTN_W,
            barXNoAd,
            barXWithAd,
            barWWithAd,
            adBtn,
            adOp,
        };
    }

    /** Place the craft countdown bar in the 制作 slot, or shift it left of the ad chip. */
    private layoutCraftProgress(
        row: {
            progressRoot: Node;
            barGfx: Graphics;
            barLab: Label;
            barW: number;
            barXNoAd: number;
            barXWithAd: number;
            barWWithAd: number;
        },
        showAd: boolean,
        t01: number,
        remainSec: number,
    ) {
        const w = showAd ? row.barWWithAd : CRAFT_BTN_W;
        const x = showAd ? row.barXWithAd : row.barXNoAd;
        row.barW = w;
        row.progressRoot.setPosition(x, 0, 0);
        row.progressRoot.getComponent(UITransform)?.setContentSize(w, CRAFT_BAR_H);
        row.barLab.node.getComponent(UITransform)?.setContentSize(w, CRAFT_BAR_H);
        this.paintCraftProgress(row.barGfx, w, t01);
        row.barLab.string = `${Math.max(0, Math.ceil(remainSec))}秒`;
    }

    private paintCraftProgress(g: Graphics, w: number, t01: number) {
        g.clear();
        const h = CRAFT_BAR_H;
        const x0 = -w * 0.5;
        const y0 = -h * 0.5;
        const r = Math.round(10 * UI_SCALE);
        // Track
        g.fillColor = new Color(120, 72, 32, 255);
        g.roundRect(x0, y0, w, h, r);
        g.fill();
        g.fillColor = new Color(70, 44, 22, 255);
        g.roundRect(x0 + 3, y0 + 3, w - 6, h - 6, Math.max(4, r - 4));
        g.fill();
        // Fill
        const innerW = w - 8;
        const fillW = Math.max(0, Math.min(innerW, Math.round(innerW * t01)));
        if (fillW > 0) {
            g.fillColor = new Color(210, 150, 55, 255);
            g.roundRect(x0 + 4, y0 + 4, fillW, h - 8, Math.max(3, r - 5));
            g.fill();
            g.fillColor = new Color(236, 190, 90, 255);
            g.roundRect(x0 + 4, y0 + 4, fillW, Math.max(4, (h - 8) * 0.35), Math.max(2, r - 6));
            g.fill();
        }
        g.strokeColor = new Color(54, 30, 14, 255);
        g.lineWidth = Math.round(2 * UI_SCALE);
        g.roundRect(x0, y0, w, h, r);
        g.stroke();
    }

    private setCraftOpen(open: boolean) {
        this._craftOpen = open;
        if (open && this._bagOpen) this.setBagOpen(false);
        if (open && this._chestOpen) this.setChestOpen(false);
        if (open) this.setLearnOpen(false);
        InputBridge.uiBlocking =
            open || this._bagOpen || this._chestOpen || this._learnOpen;
        if (open) this.ensureCraftPanel();
        if (this._craftDimmer) this._craftDimmer.active = open;
        if (this._craftPanel) this._craftPanel.active = open;
        if (this._craftCloseBtn) this._craftCloseBtn.active = open;
        if (this._barBg) {
            this._barBg.active =
                !open && !this._bagOpen && !this._chestOpen && !this._learnOpen;
        }
        this.syncBagEntryVisible();
        if (this._bar) this._bar.active = true;
        this.syncQuestEntryVisible();
        if (!open) {
            this._tutorialCraftAwaitClose = false;
            // Keep guided id while the job ticks so reopen still aims the recipe.
            const guidedId = this._guidedCraftRecipeId;
            if (!guidedId || !this._craftJobs.has(guidedId)) {
                this._guidedCraftRecipeId = null;
            }
            return;
        }
        this.syncFromFarm();
        this.refreshCraftRows();
        this.refreshHotbarIcons();
        this.refreshSelection();
        this.hideTip();
        this.orderLayers();
        this.applyTutorialCraftCloseVisual();
    }

    private buildLearnPanel() {
        const prefab = this._prefabs.learn;
        if (!prefab) {
            console.warn('[FarmHUD] FarmLearnPanel prefab missing');
            return;
        }
        const root = instantiate(prefab);
        root.layer = this.node.layer;
        root.setParent(this.node);
        root.active = true;
        this._learnRoot = root;
        this._learnDimmer = root.getChildByName('Dimmer');
        this._learnPanel = root.getChildByName('Panel');
        this.paintDimmerOnce(this._learnDimmer, 160);

        const panel = this._learnPanel;
        if (!panel) return;
        const learnChrome = panel.getChildByName('Chrome');
        if (learnChrome) applyWoodPanel(learnChrome, HL.learnPanelW, HL.learnPanelH);

        this._learnTitle = panel.getChildByName('Title')?.getComponent(Label) ?? null;
        if (this._learnTitle) {
            this._learnTitle.string = '学习配方';
            styleUiLabel(this._learnTitle, {
                size: Math.round(28 * UI_SCALE),
                color: UI_CREAM,
                outline: true,
            });
        }
        this.bindCloseFromPrefab(panel, (n) => {
            this._learnCloseBtn = n;
        });

        const scrollRoot = panel.getChildByName('ScrollIcon');
        if (scrollRoot) {
            this.addSlotPlate(scrollRoot, Math.round(LEARN_ICON * 0.95));
            this._learnScrollIcon = this.addIcon(scrollRoot, null, Math.round(LEARN_ICON * 0.7));
        }
        const outRoot = panel.getChildByName('OutIcon');
        if (outRoot) {
            this.addSlotPlate(outRoot, Math.round(LEARN_ICON * 0.95));
            this._learnOutIcon = this.addIcon(outRoot, null, Math.round(LEARN_ICON * 0.7));
        }
        const arrow = panel.getChildByName('Arrow')?.getComponent(Label);
        if (arrow) {
            arrow.string = '→';
            styleUiLabel(arrow, { size: Math.round(32 * UI_SCALE), color: UI_INK, outline: false });
        }

        this._learnName = panel.getChildByName('Name')?.getComponent(Label) ?? null;
        if (this._learnName) {
            styleUiLabel(this._learnName, {
                size: Math.round(26 * UI_SCALE),
                color: UI_INK,
                outline: false,
            });
        }
        this._learnDesc = panel.getChildByName('Desc')?.getComponent(Label) ?? null;
        if (this._learnDesc) {
            styleUiLabel(this._learnDesc, {
                size: Math.round(20 * UI_SCALE),
                color: UI_INK_MUTE,
                outline: false,
            });
        }

        this._learnBtn = panel.getChildByName('LearnBtn');
        if (this._learnBtn) {
            applyWoodButton(this._learnBtn, 'primary', HL.learnBtnW, HL.learnBtnH);
            const btnLab = this._learnBtn.getChildByName('Label')?.getComponent(Label);
            if (btnLab) {
                btnLab.string = '学习';
                styleUiLabel(btnLab, {
                    size: Math.round(28 * UI_SCALE),
                    color: UI_CREAM,
                    outline: true,
                });
            }
        }

        if (this._learnDimmer) this._learnDimmer.active = false;
        panel.active = false;
        if (this._learnCloseBtn) this._learnCloseBtn.active = false;
        if (this._learnCloseBtn?.isValid) {
            this._learnCloseBtn.setSiblingIndex(panel.children.length - 1);
        }
    }

    private openRecipeLearn(bagIndex: number) {
        const stack = this._backpack[bagIndex];
        if (!isRecipeScroll(stack)) return;
        const recipe = getCraftRecipes().find((r) => r.id === stack.recipeId);
        if (!recipe) return;
        this._learnBagIndex = bagIndex;
        this._learnRecipeId = stack.recipeId;
        if (this._learnScrollIcon) {
            const sf = this.frameFor('recipeScroll');
            this._learnScrollIcon.spriteFrame = sf;
            this._learnScrollIcon.node.active = !!sf;
        }
        if (this._learnOutIcon) {
            const sf = this.frameFor(recipe.out.id as InvItemId);
            this._learnOutIcon.spriteFrame = sf;
            this._learnOutIcon.node.active = !!sf;
        }
        if (this._learnName) this._learnName.string = recipe.name;
        if (this._learnDesc) {
            this._learnDesc.string = recipe.desc || '学习后可在工作台制作';
        }
        this.hideTip();
        this.cancelDrag();
        this.setLearnOpen(true);
    }

    private setLearnOpen(open: boolean) {
        this._learnOpen = open;
        if (this._learnDimmer) this._learnDimmer.active = open;
        if (this._learnPanel) this._learnPanel.active = open;
        if (this._learnCloseBtn) this._learnCloseBtn.active = open;
        InputBridge.uiBlocking =
            open || this._bagOpen || this._chestOpen || this._craftOpen;
        // One scrim only: learn dimmer while open, bag dimmer when bag returns.
        if (this._dimmer) this._dimmer.active = this._bagOpen && !open;
        // Occlude bag + dock while learning — only the recipe modal stays up.
        if (this._panel) this._panel.active = this._bagOpen && !open;
        if (this._closeBtn) this._closeBtn.active = this._bagOpen && !open;
        if (this._bar) this._bar.active = !open;
        if (this._barBg) {
            this._barBg.active =
                !open && !this._bagOpen && !this._chestOpen && !this._craftOpen;
        }
        if (!open) {
            this._learnBagIndex = -1;
            this._learnRecipeId = '';
        }
        this.syncBagEntryVisible();
        this.syncQuestEntryVisible();
        this.orderLayers();
    }

    private confirmLearnRecipe() {
        const index = this._learnBagIndex;
        const recipeId = this._learnRecipeId;
        const stack = index >= 0 ? this._backpack[index] : null;
        if (!isRecipeScroll(stack) || stack.recipeId !== recipeId) {
            this.setLearnOpen(false);
            return;
        }
        const ok = this._quests?.learnCraftRecipe(recipeId) ?? false;
        if (!ok) {
            this.setLearnOpen(false);
            return;
        }
        this._backpack[index] = null;
        this.setLearnOpen(false);
        this.refreshInvIcons();
        this.refreshChestIcons();
        this.pulseBagBtn();
    }

    private hitLearnPanel(uiX: number, uiY: number): boolean {
        if (!this._learnOpen || !this._learnPanel?.isValid) return false;
        const { x, y } = this.toDesignLocal(uiX, uiY);
        const ui = this._learnPanel.getComponent(UITransform);
        const w = ui?.contentSize.width ?? 0;
        const h = ui?.contentSize.height ?? 0;
        const p = this._learnPanel.position;
        return Math.abs(x - p.x) <= w * 0.5 && Math.abs(y - p.y) <= h * 0.5;
    }

    private hitLearnClose(uiX: number, uiY: number): boolean {
        if (!this._learnOpen || !this._learnCloseBtn?.isValid || !this._learnCloseBtn.active) {
            return false;
        }
        return this.hitNodeOnCanvas(this._learnCloseBtn, uiX, uiY, 28);
    }

    private hitLearnConfirm(uiX: number, uiY: number): boolean {
        if (!this._learnOpen || !this._learnBtn?.isValid) return false;
        return this.hitNodeOnCanvas(this._learnBtn, uiX, uiY, 8);
    }

    private bagCount(id: CraftItemId | InvItemId): number {
        return this._backpack.reduce((n, s) => n + (s?.id === id ? s.count : 0), 0);
    }

    private canAfford(recipe: CraftRecipe): boolean {
        return recipe.cost.every((c) => this.bagCount(c.id) >= c.count);
    }

    /** True when the bag covers every cost for this recipe id. */
    canAffordRecipe(recipeId: string): boolean {
        const recipe = getCraftRecipes().find((r) => r.id === recipeId);
        return !!recipe && this.canAfford(recipe);
    }

    /** First missing craft cost item, or null when affordable / unknown. */
    firstMissingCraftCost(recipeId: string): CraftItemId | null {
        const recipe = getCraftRecipes().find((r) => r.id === recipeId);
        if (!recipe) return null;
        for (const c of recipe.cost) {
            if (this.bagCount(c.id) < c.count) return c.id;
        }
        return null;
    }

    private consumeFromBag(id: CraftItemId, count: number): boolean {
        let left = count;
        for (let i = 0; i < this._backpack.length && left > 0; i++) {
            const s = this._backpack[i];
            if (!s || s.id !== id || s.id === 'hand') continue;
            const take = Math.min(left, s.count);
            s.count -= take;
            left -= take;
            if (s.count <= 0) this._backpack[i] = null;
        }
        this.pruneHotbar();
        this.ensureHandSlot();
        return left <= 0;
    }

    private refreshCraftRows() {
        const guided = this.liveGuidedCraftRecipeId();
        // Only dim sibling rows before the objective craft starts — never while a job ticks.
        const forceLock = this.isForcedCraftInputLock();
        for (const row of this._craftRows) {
            const job = this._craftJobs.get(row.recipe.id);
            const busy = !!job;
            const forcedOff = forceLock && !!guided && row.recipe.id !== guided;
            const can = !busy && !forcedOff && this.canAfford(row.recipe);
            row.recipe.cost.forEach((c, i) => {
                const lab = row.costLabs[i];
                if (!lab) return;
                const have = this.bagCount(c.id);
                lab.string = `${have}/${c.count}`;
                lab.color = have >= c.count ? new Color(50, 110, 45, 255) : new Color(150, 55, 40, 255);
            });

            row.craftBtn.active = !busy;
            row.progressRoot.active = busy;

            let rootOp = row.root.getComponent(UIOpacity);
            if (!rootOp) rootOp = row.root.addComponent(UIOpacity);
            rootOp.opacity = forcedOff ? 110 : 255;

            if (busy && job) {
                row.adBtn.active = true;
                const t01 = 1 - Math.max(0, job.remain) / Math.max(0.001, job.total);
                this.layoutCraftProgress(row, true, t01, job.remain);
                if (row.adOp) row.adOp.opacity = this._craftAdWait ? 120 : 255;
            } else {
                row.adBtn.active = false;
                row.craftLab.string = '制作';
                if (row.btnOp) row.btnOp.opacity = can ? 255 : 140;
                if (row.btnSp) {
                    row.btnSp.color = can
                        ? new Color(255, 255, 255, 255)
                        : new Color(180, 180, 180, 255);
                }
                row.craftLab.color = can
                    ? new Color(255, 244, 214, 255)
                    : new Color(220, 210, 190, 160);
            }
        }
        // Keep the X in sync — starting a craft used to leave it stuck dimmed.
        this.applyTutorialCraftCloseVisual();
    }

    private tryCraftRecipe(recipe: CraftRecipe) {
        if (this._craftJobs.has(recipe.id)) return;
        const guided = this.liveGuidedCraftRecipeId();
        // Forced craft quest: reject siblings only before the objective craft starts.
        if (this.isForcedCraftInputLock() && guided && recipe.id !== guided) return;
        if (!this.canAfford(recipe)) return;
        for (const c of recipe.cost) {
            if (!this.consumeFromBag(c.id, c.count)) {
                this.refreshCraftRows();
                return;
            }
        }
        const isGuided = !!guided && recipe.id === guided;
        const total = Math.max(
            1,
            isGuided && recipe.id === FIRST_SEED_RECIPE
                ? FIRST_SEED_CRAFT_SEC
                : recipe.craftSeconds,
        );
        if (isGuided) {
            this._tutorialCraftAwaitClose = false;
            this._tutorialCraftAwaitFly = false;
            this._guidedCraftRecipeId = recipe.id;
        }
        this._craftJobs.set(recipe.id, {
            remain: total,
            total,
            out: { id: recipe.out.id, count: recipe.out.count },
        });
        this.syncFarmFromBag();
        this.refreshCraftRows();
        this.refreshHotbarIcons();
        this.refreshInvIcons();
        this.refreshSelection();
        // Keep the panel open — player closes when they want (no auto-dismiss).
    }

    private tickCraftJobs(dt: number) {
        if (this._craftAdWait) {
            this._craftAdWait.left -= dt;
            if (this._craftAdWait.left <= 0) {
                const id = this._craftAdWait.recipeId;
                this._craftAdWait = null;
                this.finishCraftAdBoost(id);
            }
        }

        if (!this._craftJobs.size) return;
        let changed = false;
        const done: string[] = [];
        for (const [id, job] of this._craftJobs) {
            if (this._craftAdWait?.recipeId === id) continue;
            job.remain -= dt;
            changed = true;
            if (job.remain <= 0) done.push(id);
        }
        for (const id of done) this.completeCraftJob(id);
        if ((changed || done.length) && this._craftOpen) this.refreshCraftRows();
    }

    private completeCraftJob(recipeId: string) {
        const job = this._craftJobs.get(recipeId);
        if (!job) return;
        const wasGuided = recipeId === this._guidedCraftRecipeId;
        this._craftJobs.delete(recipeId);
        if (this._craftAdWait?.recipeId === recipeId) this._craftAdWait = null;
        playFarmTool();
        const outId = job.out.id as InvItemId;
        this.mergeOrPlaceInBag({ id: outId, count: job.out.count });
        this.noteOwnedTool(outId);
        // Do not auto-dock — TutorialGuide teaches bag → hotbar drag for tools / seeds / boost.
        this.syncFarmFromBag();
        this._quests?.noteCraft(recipeId, 1);
        if (wasGuided) {
            this._guidedCraftRecipeId = null;
            this._tutorialCraftAwaitClose = false;
            if (!this._craftOpen) {
                // Panel already closed → fly into bag, then claim.
                this.playGuidedCraftDeliverFly(outId, job.out.count);
            }
        }
        this.refreshHotbarIcons();
        this.refreshInvIcons();
        this.refreshSelection();
        this.refreshCraftRows();
        this.applyTutorialCraftCloseVisual();
    }

    /**
     * Guided craft finished while the workbench was closed: arc the product
     * into the bag badge, then release TutorialGuide for the claim step.
     */
    private playGuidedCraftDeliverFly(itemId: InvItemId, count: number) {
        this._tutorialCraftAwaitFly = true;
        const sf = this.frameFor(itemId);
        if (!sf || !this._lootFxRoot?.isValid) {
            this._tutorialCraftAwaitFly = false;
            return;
        }
        const from = this.guidedCraftFlyOrigin();
        const to = this.bagFlyTarget();
        const n = Math.max(1, Math.min(count, 3));
        for (let i = 0; i < n; i++) {
            this.spawnLootFlyIcon(sf, from.x, from.y, to.x, to.y, i, n, () => {
                this.pulseBagBtn();
                this._tutorialCraftAwaitFly = false;
            });
        }
        this._lootFxRoot.setSiblingIndex(this.node.children.length - 1);
    }

    /** Canvas start for closed-panel craft deliver (bench → bag). */
    private guidedCraftFlyOrigin(): { x: number; y: number } {
        const bench = this.farm?.findWorldNode('prop_craftbench');
        if (bench?.isValid) {
            return this.worldToCanvas(bench.position.x, bench.position.y + 42);
        }
        return { x: 0, y: 80 };
    }

    private requestCraftAdBoost(recipeId: string) {
        if (this._craftAdWait) return;
        if (!this._craftJobs.has(recipeId)) return;
        this._craftAdWait = { recipeId, left: CRAFT_AD_WATCH_SEC };
        this.refreshCraftRows();
    }

    /** Dim the X only while pre-craft force aims the recipe row (never during a job). */
    private applyTutorialCraftCloseVisual() {
        const btn = this._craftCloseBtn;
        if (!btn?.isValid) return;
        let op = btn.getComponent(UIOpacity);
        if (!op) op = btn.addComponent(UIOpacity);
        op.opacity = this.isForcedCraftInputLock() ? 90 : 255;
    }

    private finishCraftAdBoost(recipeId: string) {
        const job = this._craftJobs.get(recipeId);
        if (!job) return;
        job.remain = 0;
        this.completeCraftJob(recipeId);
    }

    private hitCraftClose(uiX: number, uiY: number): boolean {
        // Forced craft quest: no dismiss while the objective can be crafted now.
        // Countdown / await-close both allow the X.
        if (this.isForcedCraftInputLock()) return false;
        if (!this._craftCloseBtn?.isValid || !this._craftCloseBtn.active || !this._craftPanel?.isValid) {
            return false;
        }
        // World-space AABB + pad (matches TutorialGuide hole; covers arrow tip above X).
        const pad = this._tutorialCraftAwaitClose ? 48 : 28;
        if (!this.hitNodeOnCanvas(this._craftCloseBtn, uiX, uiY, pad)) {
            // Header-right gutter: players often tap the chrome next to the X.
            if (!this.hitCraftCloseGutter(uiX, uiY)) return false;
        }
        this.setCraftOpen(false);
        return true;
    }

    /** Top-right parchment corner around the craft close button. */
    private hitCraftCloseGutter(uiX: number, uiY: number): boolean {
        if (!this._craftPanel?.isValid || !this._craftCloseBtn?.isValid) return false;
        const { x, y } = this.toDesignLocal(uiX, uiY);
        const panel = this._craftPanel;
        const ui = panel.getComponent(UITransform);
        if (!ui) return false;
        const pw = ui.contentSize.width;
        const ph = ui.contentSize.height;
        const px = panel.position.x;
        const py = panel.position.y;
        const gutterW = Math.round(CLOSE_BTN * 2.4);
        const gutterH = Math.round(CRAFT_HEADER_H + CRAFT_PAD);
        const x0 = px + pw * 0.5 - gutterW;
        const x1 = px + pw * 0.5;
        const y0 = py + ph * 0.5 - gutterH;
        const y1 = py + ph * 0.5;
        return x >= x0 && x <= x1 && y >= y0 && y <= y1;
    }

    /** UI bottom-left → hit test a node via canvas-local AABB (parent offsets safe). */
    private hitNodeOnCanvas(node: Node, uiX: number, uiY: number, pad = 0): boolean {
        if (!node?.isValid || !node.active) return false;
        const ui = node.getComponent(UITransform);
        const canvasUi = this.node.getComponent(UITransform);
        if (!ui || !canvasUi) return false;
        const { x, y } = this.toDesignLocal(uiX, uiY);
        const w = ui.contentSize.width;
        const h = ui.contentSize.height;
        const ax = ui.anchorX;
        const ay = ui.anchorY;
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
        return x >= x0 - pad && x <= x1 + pad && y >= y0 - pad && y <= y1 + pad;
    }

    private hitCraftPanel(uiX: number, uiY: number): boolean {
        if (!this._craftPanel?.isValid || !this._craftPanel.active) return false;
        const ui = this._craftPanel.getComponent(UITransform);
        if (!ui) return false;
        const { x, y } = this.toDesignLocal(uiX, uiY);
        const p = this._craftPanel.position;
        return (
            Math.abs(x - p.x) <= ui.contentSize.width * 0.5 &&
            Math.abs(y - p.y) <= ui.contentSize.height * 0.5
        );
    }

    private hitCraftRow(uiX: number, uiY: number): boolean {
        if (!this._craftOpen || !this._craftPanel?.isValid) return false;
        const { x, y } = this.toDesignLocal(uiX, uiY);
        for (const row of this._craftRows) {
            if (this._craftJobs.has(row.recipe.id)) continue;
            const btn = row.craftBtn;
            const ui = btn.getComponent(UITransform);
            if (!ui) continue;
            const bx =
                this._craftPanel.position.x + row.root.position.x + btn.position.x;
            const by =
                this._craftPanel.position.y + row.root.position.y + btn.position.y;
            if (
                Math.abs(x - bx) <= ui.contentSize.width * 0.5 &&
                Math.abs(y - by) <= ui.contentSize.height * 0.5
            ) {
                this.tryCraftRecipe(row.recipe);
                return true;
            }
        }
        return false;
    }

    private hitCraftAd(uiX: number, uiY: number): boolean {
        if (!this._craftOpen || !this._craftPanel?.isValid) return false;
        const { x, y } = this.toDesignLocal(uiX, uiY);
        for (const row of this._craftRows) {
            if (!row.adBtn.active || !this._craftJobs.has(row.recipe.id)) continue;
            const ui = row.adBtn.getComponent(UITransform);
            if (!ui) continue;
            const bx =
                this._craftPanel.position.x + row.root.position.x + row.adBtn.position.x;
            const by =
                this._craftPanel.position.y + row.root.position.y + row.adBtn.position.y;
            if (
                Math.abs(x - bx) <= ui.contentSize.width * 0.5 &&
                Math.abs(y - by) <= ui.contentSize.height * 0.5
            ) {
                this.requestCraftAdBoost(row.recipe.id);
                return true;
            }
        }
        return false;
    }

    private refreshChestIcons() {
        for (let i = 0; i < this._chestCells.length; i++) {
            const cell = this._chestCells[i]!;
            const stack = this._chest[i] ?? null;
            const sf = stack ? this.frameFor(stack.id) : null;
            if (cell.icon) {
                cell.icon.spriteFrame = sf;
                cell.icon.node.active = !!sf;
            }
            if (cell.count) {
                const show = !!stack && stack.count > 1;
                cell.count.string = show ? String(stack!.count) : '';
                cell.count.node.active = show;
            }
        }
        for (let i = 0; i < this._chestBagCells.length; i++) {
            const cell = this._chestBagCells[i]!;
            const stack = this._backpack[i] ?? null;
            const sf = stack ? this.frameFor(stack.id) : null;
            if (cell.icon) {
                cell.icon.spriteFrame = sf;
                cell.icon.node.active = !!sf;
            }
            if (cell.count) {
                const show = !!stack && stack.count > 1;
                cell.count.string = show ? String(stack!.count) : '';
                cell.count.node.active = show;
            }
        }
    }

    private takeAllFromChest() {
        for (let i = 0; i < this._chest.length; i++) {
            const stack = this._chest[i];
            if (!stack) continue;
            this._chest[i] = null;
            this.mergeOrPlaceInBag(stack);
        }
        this.refreshChestIcons();
        this.refreshInvIcons();
        this.refreshHotbarIcons();
        this.syncFarmFromBag();
    }

    /** Merge stack into backpack storage. */
    private mergeOrPlaceInBag(stack: InvStack) {
        if (stack.id === 'hand') return;
        if (stack.id === 'recipeScroll') {
            this.placeInBag(stack);
            return;
        }
        const exist = this._backpack.findIndex((s) => s?.id === stack.id);
        if (exist >= 0 && this._backpack[exist]) {
            this._backpack[exist]!.count += stack.count;
            return;
        }
        const empty = this._backpack.findIndex((s) => !s);
        if (empty >= 0) this._backpack[empty] = { id: stack.id, count: stack.count };
    }

    /** Persist crafted tools on FarmSystem so map travel keeps them. */
    private noteOwnedTool(id: InvItemId) {
        const farm = this.farm;
        if (!farm) return;
        if (id === 'hoe') farm.ownedTools.hoe = true;
        else if (id === 'can') farm.ownedTools.can = true;
        else if (id === 'axe') farm.ownedTools.axe = true;
        else if (id === 'rod') farm.ownedTools.rod = true;
    }

    /** Push material/seed/crop counts from bag stacks back into FarmSystem. */
    private syncFarmFromBag() {
        if (!this.farm) return;
        const countOf = (id: InvItemId) => this.bagCount(id);
        this.farm.seeds = countOf('seeds');
        this.farm.crops = countOf('parsnip');
        this.farm.boosts = countOf('boost');
        for (const id of ALL_MATERIALS) {
            this.farm[id] = countOf(id);
        }
    }

    private refreshBagBtn() {
        if (!this._bagGlow) return;
        this._bagGlow.clear();
        // Bag tab is hidden while open; no open-state glow needed.
    }

    private buildTip() {
        const prefab = this._prefabs.tip;
        if (!prefab) {
            console.warn('[FarmHUD] FarmToolTip prefab missing');
            return;
        }
        const tip = instantiate(prefab);
        tip.layer = this.node.layer;
        tip.setParent(this.node);
        tip.active = false;
        this._tip = tip;
        const bubble = tip.getChildByName('Bubble');
        this._tipGfx = bubble?.getComponent(Graphics) ?? null;
        if (bubble) applyTipBubble(bubble, HL.tipW, HL.tipH);
        this._tipTitle = tip.getChildByName('Title')?.getComponent(Label) ?? null;
        this._tipDesc = tip.getChildByName('Desc')?.getComponent(Label) ?? null;
        if (this._tipTitle) {
            styleUiLabel(this._tipTitle, {
                size: Math.round(28 * UI_SCALE),
                color: new Color(40, 36, 30, 255),
                outline: false,
            });
        }
        if (this._tipDesc) {
            this._tipDesc.overflow = Label.Overflow.RESIZE_HEIGHT;
            styleUiLabel(this._tipDesc, {
                size: Math.round(22 * UI_SCALE),
                color: new Color(70, 64, 54, 255),
                outline: false,
            });
        }
    }

    /** Tip above a backpack cell (anchor = top of cell in design space). */
    private showBagItemTip(item: InvItemId, anchorX: number, anchorTopY: number) {
        this.placeTip(item, anchorX, anchorTopY, true);
    }

    private placeTip(item: InvItemId, anchorX: number, anchorTopY: number, withTail: boolean) {
        if (!this._tip || !this._tipTitle || !this._tipDesc) return;
        const info = itemTip(item);
        if (!info) return;
        this._tipTitle.string = info.title;
        this._tipDesc.string = `${info.kind} · ${info.desc}`;

        const boxW = Math.max(
            Math.round(240 * UI_SCALE),
            Math.min(Math.round(400 * UI_SCALE), Math.round(60 * UI_SCALE) + info.desc.length * Math.round(18 * UI_SCALE)),
        );
        const boxH = Math.round(118 * UI_SCALE);
        const tail = withTail ? Math.round(22 * UI_SCALE) : 0;

        const canvasUi = this.node.getComponent(UITransform);
        const vis = view.getVisibleSize();
        const halfW = (canvasUi?.contentSize.width || vis.width) * 0.5;
        const maxShift = Math.max(0, boxW * 0.5 - Math.round(24 * UI_SCALE));
        const minX = -halfW + boxW * 0.5 + FarmHUD.TIP_EDGE_PAD;
        const maxX = halfW - boxW * 0.5 - FarmHUD.TIP_EDGE_PAD;
        const tipX = Math.min(maxX, Math.max(minX, anchorX));
        const tailX = Math.max(-maxShift, Math.min(maxShift, anchorX - tipX));

        this._tipHit = { w: boxW, h: boxH, tail, tailX };
        this._tip.getComponent(UITransform)?.setContentSize(boxW, boxH + tail);
        this._tip.getChildByName('Bubble')?.getComponent(UITransform)?.setContentSize(boxW, boxH + tail);

        const textW = boxW - Math.round(36 * UI_SCALE);
        this._tipTitle!.node.getComponent(UITransform)?.setContentSize(textW, Math.round(40 * UI_SCALE));
        this._tipTitle!.node.setPosition(0, Math.round(28 * UI_SCALE), 0);
        this._tipDesc!.node.getComponent(UITransform)?.setContentSize(textW, Math.round(56 * UI_SCALE));
        this._tipDesc!.node.setPosition(0, Math.round(-22 * UI_SCALE), 0);

        const bubble = this._tip.getChildByName('Bubble');
        if (bubble) applyTipBubble(bubble, boxW, boxH + Math.max(0, Math.round(tail * 0.35)));

        // Tip origin = bubble center; pointer tip sits on anchorTopY.
        const tipY = anchorTopY + boxH * 0.5 + tail;
        this._tip.setPosition(tipX, tipY, 0);
        this._tip.active = true;
        this._tipHideAt = Date.now() + TIP_HIDE_SEC * 1000;
        this.orderLayers();
    }

    private hideTip() {
        if (this._tip?.isValid) this._tip.active = false;
        this._tipHideAt = 0;
    }

    private refreshSelection() {
        const cur = this.farm?.tool ?? 'hoe';
        const glowSize = GLOW_HALF * 2;
        for (const s of this._slots) {
            s.glow.clear();
            if (s.item && isFarmTool(s.item) && s.item === cur) {
                s.glow.strokeColor = new Color(255, 220, 80, 255);
                s.glow.lineWidth = Math.round(6 * UI_SCALE);
                s.glow.roundRect(-GLOW_HALF, -GLOW_HALF, glowSize, glowSize, Math.round(12 * UI_SCALE));
                s.glow.stroke();
            }
        }
    }

    private toDesignLocal(uiX: number, uiY: number) {
        const canvasUi = this.node.getComponent(UITransform);
        const vis = portraitVisibleSize();
        const hw = (canvasUi?.contentSize.width || vis.width) * 0.5;
        const hh = (canvasUi?.contentSize.height || vis.height) * 0.5;
        return { x: uiX - hw, y: uiY - hh };
    }

    private hitTip(uiX: number, uiY: number): boolean {
        if (!this._tip?.isValid || !this._tip.active) return false;
        const { x, y } = this.toDesignLocal(uiX, uiY);
        const tipPos = this._tip.position;
        const lx = x - tipPos.x;
        const ly = y - tipPos.y;
        const { w, h, tail, tailX } = this._tipHit;
        if (Math.abs(lx) <= w * 0.5 && Math.abs(ly) <= h * 0.5) return true;
        return Math.abs(lx - tailX) <= Math.round(16 * UI_SCALE) && ly < -h * 0.5 && ly >= -h * 0.5 - tail;
    }

    private hitBagBtn(uiX: number, uiY: number): boolean {
        if (!this._bagBtn?.isValid || !this._bagBtn.active || !this._bar?.isValid) return false;
        const { x, y } = this.toDesignLocal(uiX, uiY);
        const bx = this._bar.position.x + this._bagBtn.position.x;
        const by = this._bar.position.y + this._bagBtn.position.y;
        return Math.abs(x - bx) < BAG_BTN * 0.52 && Math.abs(y - by) < BAG_BTN * 0.52;
    }

    private hitQuestBtn(uiX: number, uiY: number): boolean {
        if (!this._questBtn?.isValid || !this._questBtn.active || !this._bar?.isValid) return false;
        const { x, y } = this.toDesignLocal(uiX, uiY);
        const bx = this._bar.position.x + this._questBtn.position.x;
        const by = this._bar.position.y + this._questBtn.position.y;
        return Math.abs(x - bx) < BAG_BTN * 0.52 && Math.abs(y - by) < BAG_BTN * 0.52;
    }

    private hitCloseBtn(uiX: number, uiY: number): boolean {
        if (!this._closeBtn?.isValid || !this._closeBtn.active || !this._panel?.isValid) return false;
        const { x, y } = this.toDesignLocal(uiX, uiY);
        const ui = this._closeBtn.getComponent(UITransform);
        const hw = (ui?.contentSize.width ?? CLOSE_BTN) * 0.55;
        const hh = (ui?.contentSize.height ?? CLOSE_BTN) * 0.55;
        const bx = this._panel.position.x + this._closeBtn.position.x;
        const by = this._panel.position.y + this._closeBtn.position.y;
        return Math.abs(x - bx) <= hw && Math.abs(y - by) <= hh;
    }

    private hitChestClose(uiX: number, uiY: number): boolean {
        if (!this._chestCloseBtn?.isValid || !this._chestCloseBtn.active || !this._chestPanel?.isValid) {
            return false;
        }
        const { x, y } = this.toDesignLocal(uiX, uiY);
        const ui = this._chestCloseBtn.getComponent(UITransform);
        const hw = (ui?.contentSize.width ?? CLOSE_BTN) * 0.55;
        const hh = (ui?.contentSize.height ?? CLOSE_BTN) * 0.55;
        const bx = this._chestPanel.position.x + this._chestCloseBtn.position.x;
        const by = this._chestPanel.position.y + this._chestCloseBtn.position.y;
        if (Math.abs(x - bx) <= hw && Math.abs(y - by) <= hh) {
            this.setChestOpen(false);
            return true;
        }
        return false;
    }

    private hitTakeAll(uiX: number, uiY: number): boolean {
        if (!this._takeAllBtn?.isValid || !this._takeAllBtn.active || !this._chestPanel?.isValid) {
            return false;
        }
        const { x, y } = this.toDesignLocal(uiX, uiY);
        const ui = this._takeAllBtn.getComponent(UITransform);
        const w = ui?.contentSize.width ?? 0;
        const h = ui?.contentSize.height ?? 0;
        const bx = this._chestPanel.position.x + this._takeAllBtn.position.x;
        const by = this._chestPanel.position.y + this._takeAllBtn.position.y;
        if (Math.abs(x - bx) <= w * 0.5 && Math.abs(y - by) <= h * 0.5) {
            this.takeAllFromChest();
            return true;
        }
        return false;
    }

    private hitChestPanel(uiX: number, uiY: number): boolean {
        if (!this._chestPanel?.isValid || !this._chestPanel.active) return false;
        const { x, y } = this.toDesignLocal(uiX, uiY);
        const ui = this._chestPanel.getComponent(UITransform);
        const w = ui?.contentSize.width ?? 0;
        const h = ui?.contentSize.height ?? 0;
        const p = this._chestPanel.position;
        return Math.abs(x - p.x) <= w * 0.5 && Math.abs(y - p.y) <= h * 0.5;
    }

    private hitChestSlot(uiX: number, uiY: number, showTipOnTap: boolean): number {
        if (!this._chestOpen || !this._chestPanel?.isValid) return -1;
        const grid = this._chestPanel.getChildByName('ChestGrid');
        if (!grid) return -1;
        const { x, y } = this.toDesignLocal(uiX, uiY);
        const gx = this._chestPanel.position.x + grid.position.x;
        const gy = this._chestPanel.position.y + grid.position.y;
        for (let i = 0; i < this._chestCells.length; i++) {
            const cell = this._chestCells[i]!;
            const cx = gx + cell.root.position.x;
            const cy = gy + cell.root.position.y;
            if (Math.abs(x - cx) < CHEST_SLOT * 0.5 && Math.abs(y - cy) < CHEST_SLOT * 0.5) {
                const stack = this._chest[i];
                if (showTipOnTap && stack) {
                    this.showBagItemTip(stack.id, cx, cy + CHEST_SLOT * 0.55);
                }
                return i;
            }
        }
        return -1;
    }

    private hitChestBagSlot(uiX: number, uiY: number, showTipOnTap: boolean): number {
        if (!this._chestOpen || !this._chestPanel?.isValid) return -1;
        const grid = this._chestPanel.getChildByName('BagGrid');
        if (!grid) return -1;
        const { x, y } = this.toDesignLocal(uiX, uiY);
        const gx = this._chestPanel.position.x + grid.position.x;
        const gy = this._chestPanel.position.y + grid.position.y;
        for (let i = 0; i < this._chestBagCells.length; i++) {
            const cell = this._chestBagCells[i]!;
            const cx = gx + cell.root.position.x;
            const cy = gy + cell.root.position.y;
            if (Math.abs(x - cx) < CHEST_SLOT * 0.5 && Math.abs(y - cy) < CHEST_SLOT * 0.5) {
                const stack = this._backpack[i];
                if (showTipOnTap && stack) {
                    if (isRecipeScroll(stack)) {
                        this.openRecipeLearn(i);
                    } else {
                        this.showBagItemTip(stack.id, cx, cy + CHEST_SLOT * 0.55);
                    }
                }
                return i;
            }
        }
        return -1;
    }

    private hitPanel(uiX: number, uiY: number): boolean {
        if (!this._panel?.isValid || !this._panel.active) return false;
        const { x, y } = this.toDesignLocal(uiX, uiY);
        const ui = this._panel.getComponent(UITransform);
        const w = ui?.contentSize.width ?? 0;
        const h = ui?.contentSize.height ?? 0;
        const p = this._panel.position;
        return Math.abs(x - p.x) <= w * 0.5 && Math.abs(y - p.y) <= h * 0.5;
    }

    private hitHotbarIndex(uiX: number, uiY: number): number {
        if (!this._bar?.isValid) return -1;
        const { x, y } = this.toDesignLocal(uiX, uiY);
        const barPos = this._bar.position;
        // Bag/chest open: dock chrome is taller — accept a wider Y band, then
        // snap to the nearest column so drops between slots still bind.
        const looseY = this._bagOpen || this._chestOpen;
        const yPad = looseY ? BAR_H * 0.55 : SLOT * 0.55;
        let best = -1;
        let bestDist = Number.POSITIVE_INFINITY;
        for (let i = 0; i < this._slots.length; i++) {
            const s = this._slots[i]!;
            const sx = barPos.x + s.root.position.x;
            const sy = barPos.y + s.root.position.y;
            if (Math.abs(y - sy) > yPad) continue;
            const dx = Math.abs(x - sx);
            const hitX = looseY ? SLOT * 0.62 : SLOT * 0.5;
            if (dx <= hitX && dx < bestDist) {
                best = i;
                bestDist = dx;
            }
        }
        if (best >= 0) return best;
        if (!looseY) return -1;
        // Finger landed on the dock strip but between / past slots — nearest col.
        if (Math.abs(y - barPos.y) > BAR_H * 0.55) return -1;
        for (let i = 0; i < this._slots.length; i++) {
            const s = this._slots[i]!;
            const sx = barPos.x + s.root.position.x;
            const d = Math.abs(x - sx);
            if (d < bestDist) {
                best = i;
                bestDist = d;
            }
        }
        return bestDist <= SLOT * 0.85 ? best : -1;
    }

    private hitInvSlot(uiX: number, uiY: number, showTipOnTap: boolean): number {
        if (!this._bagOpen || !this._panel?.isValid) return -1;
        const { x, y } = this.toDesignLocal(uiX, uiY);
        const grid = this._panel.getChildByName('Grid');
        if (!grid) return -1;
        const gx = this._panel.position.x + grid.position.x;
        const gy = this._panel.position.y + grid.position.y;
        for (let i = 0; i < this._invCells.length; i++) {
            const cell = this._invCells[i]!;
            const cx = gx + cell.root.position.x;
            const cy = gy + cell.root.position.y;
            if (Math.abs(x - cx) < INV_SLOT * 0.5 && Math.abs(y - cy) < INV_SLOT * 0.5) {
                const stack = this._backpack[i];
                if (showTipOnTap && stack) {
                    if (isRecipeScroll(stack)) {
                        this.openRecipeLearn(i);
                    } else {
                        this.showBagItemTip(stack.id, cx, cy + INV_SLOT * 0.55);
                    }
                }
                return i;
            }
        }
        return -1;
    }

    private hitHotbar(uiX: number, uiY: number, bagMode: boolean): boolean {
        if (!this._bar?.isValid) return false;
        const idx = this.hitHotbarIndex(uiX, uiY);
        if (idx >= 0) {
            const item = this.hotbarItem(idx);
            // Hotbar select only — no item tip on the dock.
            this.hideTip();
            if (item && isFarmTool(item)) {
                this.farm?.setTool(item);
                this.refreshSelection();
            }
            return true;
        }
        const { x, y } = this.toDesignLocal(uiX, uiY);
        const barPos = this._bar.position;
        if (Math.abs(y - barPos.y) < SLOT * 0.75 && Math.abs(x - barPos.x) < BAR_BG_W * 0.5) {
            if (!bagMode) this.hideTip();
            return true;
        }
        return false;
    }

    private equipFromHotbar(idx: number) {
        const item = this.hotbarItem(idx);
        if (!item) return;
        this.equipItem(item);
    }

    /** Select a tool/consumable — used after hotbar bind so drag→dock equips in one gesture. */
    private equipItem(item: InvItemId) {
        if (!isFarmTool(item)) return;
        this.hideTip();
        playUiClick();
        this.farm?.setTool(item);
        this.refreshSelection();
    }

    // ── drag (Canvas node touch, capture phase) ───────────

    private onNodeTouchStart(e: EventTouch) {
        if (!this._bagOpen && !this._chestOpen) return;
        const loc = e.getUILocation();
        this.beginPtr(loc.x, loc.y);
    }

    private onNodeTouchMove(e: EventTouch) {
        if (!this._ptrDown) return;
        const loc = e.getUILocation();
        this.movePtr(loc.x, loc.y);
    }

    private onNodeTouchEnd(e: EventTouch) {
        if (!this._ptrDown) return;
        const loc = e.getUILocation();
        // Prefer live event pos; fall back to last move / ghost inside endPtr.
        this.endPtr(loc.x, loc.y);
    }

    /** Finish an in-flight bag/chest drag when Cocos drops TOUCH_END (web-mobile). */
    private onDomPointerUp = (ev: PointerEvent) => {
        if (!this._ptrDown) return;
        if (!this._bagOpen && !this._chestOpen) return;
        const ui = clientToUiLocation(ev.clientX, ev.clientY, true);
        if (!ui) {
            this.endPtr(this._ptrX, this._ptrY);
            return;
        }
        this.endPtr(ui.x, ui.y);
    };

    private beginPtr(uiX: number, uiY: number) {
        if (this._learnOpen) return;
        if (!this._chestOpen && !this._bagOpen) return;
        this._ptrDown = true;
        this._ptrX = uiX;
        this._ptrY = uiY;
        if (this._chestOpen) {
            const chest = this.hitChestSlot(uiX, uiY, false);
            if (chest >= 0 && this._chest[chest]) {
                this._drag = {
                    index: chest,
                    from: 'chest',
                    item: this._chest[chest]!.id,
                    active: false,
                    ox: uiX,
                    oy: uiY,
                };
                return;
            }
            const bag = this.hitChestBagSlot(uiX, uiY, false);
            if (bag >= 0 && this._backpack[bag] && this._backpack[bag]!.id !== 'hand') {
                this._drag = {
                    index: bag,
                    from: 'bag',
                    item: this._backpack[bag]!.id,
                    active: false,
                    ox: uiX,
                    oy: uiY,
                };
                return;
            }
            const hot = this.hitHotbarIndex(uiX, uiY);
            if (hot > 0 && this._hotbar[hot]) {
                this._drag = {
                    index: hot,
                    from: 'hotbar',
                    item: this._hotbar[hot]!,
                    active: false,
                    ox: uiX,
                    oy: uiY,
                };
            }
            return;
        }
        if (!this._bagOpen) return;
        const inv = this.hitInvSlot(uiX, uiY, false);
        if (inv >= 0 && this._backpack[inv] && this._backpack[inv]!.id !== 'hand') {
            this._drag = {
                index: inv,
                from: 'bag',
                item: this._backpack[inv]!.id,
                active: false,
                ox: uiX,
                oy: uiY,
            };
            return;
        }
        const hot = this.hitHotbarIndex(uiX, uiY);
        // Hotkey slot 0 (hand) cannot be dragged.
        if (hot > 0 && this._hotbar[hot]) {
            this._drag = {
                index: hot,
                from: 'hotbar',
                item: this._hotbar[hot]!,
                active: false,
                ox: uiX,
                oy: uiY,
            };
        }
    }

    private movePtr(uiX: number, uiY: number) {
        this._ptrX = uiX;
        this._ptrY = uiY;
        if (!this._drag) return;
        const dx = uiX - this._drag.ox;
        const dy = uiY - this._drag.oy;
        if (!this._drag.active) {
            if (dx * dx + dy * dy < DRAG_THRESH * DRAG_THRESH) return;
            this._drag.active = true;
            this.hideTip();
            if (this._ghost && this._ghostSp) {
                const bagStack =
                    this._drag.from === 'bag' ? this._backpack[this._drag.index] : null;
                const sf = bagStack ? this.frameForStack(bagStack) : this.frameFor(this._drag.item);
                this._ghostSp.spriteFrame = sf;
                // Show ghost even without a frame (tinted plate) so drag is visible.
                this._ghost.active = true;
                if (!sf) this._ghostSp.spriteFrame = this._frames.slot ?? null;
            }
        }
        if (this._ghost?.active) {
            const { x, y } = this.toDesignLocal(uiX, uiY);
            this._ghost.setPosition(x, y, 0);
            this._ghost.setSiblingIndex(this.node.children.length - 1);
        }
    }

    private endPtr(uiX: number, uiY: number) {
        let dropX = uiX;
        let dropY = uiY;
        if (this._drag?.active) {
            // Last move is more reliable than END when releasing off the start cell
            // (TOUCH_CANCEL / stale end loc). Ghost mirrors that move.
            const fromGhost = this.ghostToUi();
            if (fromGhost) {
                dropX = fromGhost.x;
                dropY = fromGhost.y;
            } else if (this._ptrX || this._ptrY) {
                dropX = this._ptrX;
                dropY = this._ptrY;
            }
        }
        this._ptrDown = false;
        if (!this._drag) {
            if (this._chestOpen) {
                if (this.hitChestClose(dropX, dropY) || this.hitTakeAll(dropX, dropY)) {
                    this._suppressTap = true;
                }
            } else if (this._craftOpen) {
                if (
                    this.hitCraftClose(dropX, dropY) ||
                    this.hitCraftAd(dropX, dropY) ||
                    this.hitCraftRow(dropX, dropY)
                ) {
                    this._suppressTap = true;
                }
            } else if (this._bagOpen && this.hitCloseBtn(dropX, dropY)) {
                this.setBagOpen(false);
                this._suppressTap = true;
            }
            return;
        }
        const drag = this._drag;
        if (drag.active) {
            this._suppressTap = true;
            if (this._chestOpen) {
                this.endChestDrag(dropX, dropY, drag);
            } else {
                this.endBagDrag(dropX, dropY, drag);
            }
        }
        this.cancelDrag();
    }

    /** Ghost sits in canvas-local space — convert back to UI bottom-left coords. */
    private ghostToUi(): { x: number; y: number } | null {
        if (!this._ghost?.active) return null;
        const canvasUi = this.node.getComponent(UITransform);
        const vis = view.getVisibleSize();
        const hw = (canvasUi?.contentSize.width || vis.width) * 0.5;
        const hh = (canvasUi?.contentSize.height || vis.height) * 0.5;
        return {
            x: this._ghost.position.x + hw,
            y: this._ghost.position.y + hh,
        };
    }

    /** Drop target on the dock — never the locked hand slot. */
    private hitHotbarDropIndex(uiX: number, uiY: number): number {
        const hot = this.hitHotbarIndex(uiX, uiY);
        if (hot > 0) return hot;
        return this.nearestHotbarInDockBand(uiX, uiY);
    }

    /** Bag open: rearrange storage, or assign / clear hotkeys. */
    private endBagDrag(
        uiX: number,
        uiY: number,
        drag: { index: number; from: 'bag' | 'chest' | 'hotbar'; item: InvItemId },
    ) {
        let hot = this.hitHotbarDropIndex(uiX, uiY);
        const inv = this.hitInvSlot(uiX, uiY, false);
        let equipId: InvItemId | null = null;
        if (drag.from === 'bag') {
            // Recipe scrolls: rearrange in bag only — never bind to the dock.
            if (drag.item === 'recipeScroll') {
                if (inv >= 0 && inv !== drag.index) this.swapBag(drag.index, inv);
            } else {
                // Prefer dock; bottom inv row sits flush above it — tools snap to hotkey.
                if (hot <= 0) hot = this.nearestHotbarInDockBand(uiX, uiY);
                if (hot > 0) {
                    this.assignHotbar(hot, drag.item);
                    if (isFarmTool(drag.item)) equipId = drag.item;
                } else if (inv >= 0 && inv !== drag.index) {
                    this.swapBag(drag.index, inv);
                }
            }
        } else if (drag.from === 'hotbar') {
            if (hot <= 0) hot = this.nearestHotbarInDockBand(uiX, uiY);
            if (hot > 0) {
                this.swapHotbar(drag.index, hot);
                if (isFarmTool(drag.item)) equipId = drag.item;
            } else if (inv >= 0) {
                // Drop onto bag cell → remove hotkey binding (stack stays in bag).
                this.clearHotbar(drag.index);
            }
        }
        // Refresh icons/prune first, then equip — so prune can't bounce the tool away.
        this.refreshHotbarIcons();
        this.refreshInvIcons();
        if (equipId) this.equipItem(equipId);
        else this.refreshSelection();
    }

    /**
     * Snap release to nearest assignable hotkey column.
     * When bag/chest is open, the band reaches up through the bottom storage row
     * so "drag to dock" doesn't silently become a bag-cell swap.
     */
    private nearestHotbarInDockBand(uiX: number, uiY: number): number {
        if (!this._bar?.isValid) return -1;
        if (!(this._bagOpen || this._chestOpen)) return -1;
        const { x, y } = this.toDesignLocal(uiX, uiY);
        const yMin = BAR_Y - BAR_H * 0.55;
        const yMax = BAR_Y + BAR_H * 0.55 + INV_SLOT + INV_DOCK_GAP;
        if (y < yMin || y > yMax) return -1;
        if (Math.abs(x - this._bar.position.x) > BAR_BG_W * 0.6) return -1;
        let best = -1;
        let bestDist = Number.POSITIVE_INFINITY;
        for (let i = 1; i < this._slots.length; i++) {
            const s = this._slots[i]!;
            const d = Math.abs(x - (this._bar.position.x + s.root.position.x));
            if (d < bestDist) {
                best = i;
                bestDist = d;
            }
        }
        return best;
    }

    private endChestDrag(
        uiX: number,
        uiY: number,
        drag: { index: number; from: 'bag' | 'chest' | 'hotbar'; item: InvItemId },
    ) {
        const chestDest = this.hitChestSlot(uiX, uiY, false);
        const bagDest = this.hitChestBagSlot(uiX, uiY, false);
        const hot = this.hitHotbarDropIndex(uiX, uiY);
        if (drag.item === 'hand') {
            this.ensureHandSlot();
            return;
        }

        let equipId: InvItemId | null = null;
        if (drag.from === 'chest') {
            if (chestDest >= 0) {
                const tmp = this._chest[drag.index];
                this._chest[drag.index] = this._chest[chestDest];
                this._chest[chestDest] = tmp;
            } else if (bagDest >= 0) {
                const moved = this._chest[drag.index];
                this._chest[drag.index] = this._backpack[bagDest] ?? null;
                this._backpack[bagDest] = moved;
                this.syncFarmFromBag();
            } else if (hot > 0) {
                // Into bag (if needed) + bind hotkey.
                const moved = this._chest[drag.index];
                this._chest[drag.index] = null;
                if (moved) {
                    this.mergeOrPlaceInBag(moved);
                    this.assignHotbar(hot, moved.id);
                    if (isFarmTool(moved.id)) equipId = moved.id;
                }
                this.syncFarmFromBag();
            }
        } else if (drag.from === 'bag') {
            // Keep recipe scrolls out of the chest / hotbar.
            if (drag.item === 'recipeScroll') {
                if (bagDest >= 0) this.swapBag(drag.index, bagDest);
            } else if (chestDest >= 0) {
                const moved = this._backpack[drag.index];
                this._backpack[drag.index] = this._chest[chestDest];
                this._chest[chestDest] = moved;
                this.pruneHotbar();
                this.syncFarmFromBag();
            } else if (bagDest >= 0) {
                this.swapBag(drag.index, bagDest);
            } else if (hot > 0) {
                this.assignHotbar(hot, drag.item);
                if (isFarmTool(drag.item)) equipId = drag.item;
            }
        } else if (drag.from === 'hotbar') {
            if (hot > 0) {
                this.swapHotbar(drag.index, hot);
                if (isFarmTool(drag.item)) equipId = drag.item;
            } else if (bagDest >= 0 || chestDest >= 0) {
                // Unbind hotkey; moving into chest still uses the bag stack.
                this.clearHotbar(drag.index);
                if (chestDest >= 0) {
                    const bagIdx = this._backpack.findIndex((s) => s?.id === drag.item);
                    if (bagIdx >= 0) {
                        const moved = this._backpack[bagIdx];
                        this._backpack[bagIdx] = this._chest[chestDest];
                        this._chest[chestDest] = moved;
                        this.pruneHotbar();
                        this.syncFarmFromBag();
                    }
                }
            }
        }
        this.ensureHandSlot();
        this.refreshHotbarIcons();
        this.refreshInvIcons();
        this.refreshChestIcons();
        if (equipId) this.equipItem(equipId);
        else this.refreshSelection();
    }

    private cancelDrag() {
        this._drag = null;
        this._ptrDown = false;
        if (this._ghost) this._ghost.active = false;
    }

    private onKey(e: EventKeyboard) {
        const pickSlot = (idx: number) => {
            if (idx < 0 || idx >= SLOT_COUNT) return;
            this.equipFromHotbar(idx);
        };
        if (e.keyCode === KeyCode.DIGIT_1 || e.keyCode === KeyCode.NUM_1) pickSlot(0);
        if (e.keyCode === KeyCode.DIGIT_2 || e.keyCode === KeyCode.NUM_2) pickSlot(1);
        if (e.keyCode === KeyCode.DIGIT_3 || e.keyCode === KeyCode.NUM_3) pickSlot(2);
        if (e.keyCode === KeyCode.DIGIT_4 || e.keyCode === KeyCode.NUM_4) pickSlot(3);
        if (e.keyCode === KeyCode.DIGIT_5 || e.keyCode === KeyCode.NUM_5) pickSlot(4);
        if (e.keyCode === KeyCode.DIGIT_6 || e.keyCode === KeyCode.NUM_6) pickSlot(5);
        if (e.keyCode === KeyCode.DIGIT_7 || e.keyCode === KeyCode.NUM_7) pickSlot(6);
        if (e.keyCode === KeyCode.KEY_B || e.keyCode === KeyCode.TAB) this.toggleBag();
        if (e.keyCode === KeyCode.ESCAPE) {
            if (InputBridge.gmPanelOpen) return;
            if (this._chestOpen) this.setChestOpen(false);
            else if (this._craftOpen) {
                if (this.isForcedCraftInputLock()) return;
                this.setCraftOpen(false);
            } else if (this._bagOpen) this.setBagOpen(false);
        }
        if (e.keyCode === KeyCode.SPACE || e.keyCode === KeyCode.KEY_E) {
            if (this._chestOpen || this._craftOpen || this._bagOpen) return;
            if (this.node.getComponent(FishingMinigame)?.isOpen) return;
            this.farm?.tryAct();
        }
    }
}
