import {
    _decorator,
    assetManager,
    Color,
    Component,
    EventKeyboard,
    EventMouse,
    EventTouch,
    Graphics,
    Input,
    KeyCode,
    Label,
    Node,
    Sprite,
    SpriteFrame,
    UIOpacity,
    UITransform,
    Vec3,
    input,
    tween,
    view,
} from 'cc';
import { CraftItemId, CraftRecipe, getCraftRecipes } from './CraftRecipes';
import { FarmMaterial, FarmSystem, FarmTool } from './FarmSystem';
import { FARM_FRAMES } from './FarmFrames';
import { FishingMinigame } from './FishingMinigame';
import { GmPanel } from './GmPanel';
import { InputBridge } from './InputBridge';
import { MATERIAL_FRAMES } from './MaterialFrames';
import { QuestSystem } from './QuestSystem';
import { TOOL_FRAMES } from './ToolFrames';
import { applyUiFont, loadUiFont, styleUiLabel } from './UiFont';

const { ccclass, property } = _decorator;

/** Hotbar shortcut / backpack item ids. */
export type InvItemId = FarmTool | 'parsnip' | FarmMaterial;

interface InvStack {
    id: InvItemId;
    count: number;
}

const ITEM_TIP: Record<InvItemId, { title: string; kind: string; desc: string }> = {
    hand: { title: '手', kind: '工具', desc: '拔除杂草与灌木，收获成熟作物' },
    hoe: { title: '锄头', kind: '工具', desc: '开垦荒地，翻出可种植的田地；也可挖起石头' },
    seeds: { title: '种子', kind: '种子', desc: '在翻好的田地上播种' },
    can: { title: '水壶', kind: '工具', desc: '给作物浇水，促进生长' },
    axe: { title: '斧头', kind: '工具', desc: '砍伐野外的松树和橡树' },
    rod: { title: '鱼竿', kind: '工具', desc: '在湖边或码头抛竿钓鱼' },
    parsnip: { title: '防风草', kind: '作物', desc: '刚收获的作物，可以出售或食用' },
    wood: { title: '木头', kind: '材料', desc: '砍伐树木获得，可用于建造' },
    grass: { title: '草料', kind: '材料', desc: '拔除杂草与灌木获得' },
    dirt: { title: '泥土', kind: '材料', desc: '锄地开垦时翻出的土壤' },
    stone: { title: '石头', kind: '材料', desc: '用锄头挖开石子与岩石获得' },
    fish: { title: '鱼', kind: '食材', desc: '从湖里钓上来的鲜鱼' },
    copper: { title: '铜矿石', kind: '矿石', desc: '矿脉商会出售的入门矿' },
    iron: { title: '铁矿石', kind: '矿石', desc: '更坚硬的锻造材料' },
    goldOre: { title: '金矿石', kind: '矿石', desc: '稀有闪光矿脉' },
};

const MATERIAL_FRAME_UUID: Record<FarmMaterial, string> = {
    wood: MATERIAL_FRAMES.wood,
    grass: MATERIAL_FRAMES.grass,
    dirt: MATERIAL_FRAMES.dirt,
    stone: MATERIAL_FRAMES.stone,
    fish: MATERIAL_FRAMES.fish,
    copper: MATERIAL_FRAMES.copper,
    iron: MATERIAL_FRAMES.iron,
    goldOre: MATERIAL_FRAMES.goldOre,
};

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
/** Below FarmActionHint (−700) so the bar doesn't cover the cue text. */
const BAR_Y = -860;
const TIP_HIDE_SEC = 2.4;
const TIP_SLOT_GAP = 36;

/** One baked badge (warm wood plate + pack); bottom flush with slot tops. */
const BAG_BTN = Math.round(120 * UI_SCALE);
const CLOSE_BTN = Math.round(56 * UI_SCALE);
/** Full bag is 4 rows × 7; bottom dock is row 4 (also the always-visible toolbar). */
const INV_COLS = 7;
const INV_ROWS = 4;
const INV_STORAGE_ROWS = 3;
const HOTBAR_BASE = INV_STORAGE_ROWS * INV_COLS;
/** Dock slot 0 is permanently the bare hand — never swapped or overwritten. */
const HAND_SLOT = HOTBAR_BASE;
/** Same cell size for storage + dock so columns line up as one grid. */
const INV_SLOT = SLOT;
const INV_GAP = GAP;
const INV_PAD = Math.round(22 * UI_SCALE);
const INV_TITLE_H = Math.round(48 * UI_SCALE);
/** Gap between storage rows and the 4th-row dock inside the unified bag. */
const INV_DOCK_GAP = Math.round(12 * UI_SCALE);
const DRAG_THRESH = 16;

/** Yard chest: dual-grid panel (chest ↔ backpack + dock row 4). */
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
/** Ad chip sits at the right; progress bar stretches from costs → ad. */
const CRAFT_AD_SZ = Math.round(52 * UI_SCALE);
const CRAFT_BAR_H = Math.round(40 * UI_SCALE);
/** Mock rewarded-ad watch (seconds), same cadence as crop boost. */
const CRAFT_AD_WATCH_SEC = 1.2;

function isFarmTool(id: InvItemId): id is FarmTool {
    return (
        id === 'hand' ||
        id === 'hoe' ||
        id === 'seeds' ||
        id === 'can' ||
        id === 'axe' ||
        id === 'rod'
    );
}

function isHandLockedSlot(index: number): boolean {
    return index === HAND_SLOT;
}

/**
 * Backpack HUD: 4×7 grid. Bottom row is always visible (toolbar = bag row 4);
 * open bag reveals the upper 3 storage rows as one continuous panel.
 */
@ccclass('FarmHUD')
export class FarmHUD extends Component {
    @property(FarmSystem)
    farm: FarmSystem | null = null;

    private _bar: Node | null = null;
    private _barBg: Node | null = null;
    private _bagBtn: Node | null = null;
    private _bagGlow: Graphics | null = null;
    private _closeBtn: Node | null = null;
    private _dimmer: Node | null = null;
    private _panel: Node | null = null;
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

    /** Full backpack stacks (INV_ROWS × INV_COLS); indices HOTBAR_BASE.. are row 4 / toolbar. */
    private _backpack: (InvStack | null)[] = [];
    private _bagOpen = false;

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

    private _drag: {
        /** Absolute backpack index, or chest index when from === 'chest'. */
        index: number;
        from: 'bag' | 'chest';
        item: InvItemId;
        active: boolean;
        ox: number;
        oy: number;
    } | null = null;
    /** After a real drag-drop, skip the trailing joystick tap. */
    private _suppressTap = false;
    /** Layer for loot-fly icons (above hotbar / tip). */
    private _lootFxRoot: Node | null = null;
    private _bagPulseGen = 0;

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
        input.on(Input.EventType.TOUCH_START, this.onTouchStart, this);
        input.on(Input.EventType.TOUCH_MOVE, this.onTouchMove, this);
        input.on(Input.EventType.TOUCH_END, this.onTouchEnd, this);
        input.on(Input.EventType.TOUCH_CANCEL, this.onTouchEnd, this);
        input.on(Input.EventType.MOUSE_DOWN, this.onMouseDown, this);
        input.on(Input.EventType.MOUSE_MOVE, this.onMouseMove, this);
        input.on(Input.EventType.MOUSE_UP, this.onMouseUp, this);
    }

    onDestroy() {
        InputBridge.uiBlocking = false;
        input.off(Input.EventType.KEY_DOWN, this.onKey, this);
        input.off(Input.EventType.TOUCH_START, this.onTouchStart, this);
        input.off(Input.EventType.TOUCH_MOVE, this.onTouchMove, this);
        input.off(Input.EventType.TOUCH_END, this.onTouchEnd, this);
        input.off(Input.EventType.TOUCH_CANCEL, this.onTouchEnd, this);
        input.off(Input.EventType.MOUSE_DOWN, this.onMouseDown, this);
        input.off(Input.EventType.MOUSE_MOVE, this.onMouseMove, this);
        input.off(Input.EventType.MOUSE_UP, this.onMouseUp, this);
    }

    update(dt: number) {
        if (this._tip?.active && this._tipHideAt > 0 && Date.now() >= this._tipHideAt) {
            this.hideTip();
        }
        this.tickCraftJobs(dt);
    }

    /** Wired from TouchJoystick: short tap (not drag). */
    handleTap(uiX: number, uiY: number) {
        if (this.node.getComponent(FishingMinigame)?.isOpen) return;
        if (this._suppressTap) {
            this._suppressTap = false;
            return;
        }
        if (this._drag?.active) return;
        if (this.hitTip(uiX, uiY)) {
            this.hideTip();
            return;
        }
        if (this._chestOpen) {
            if (this.hitChestClose(uiX, uiY) || this.hitTakeAll(uiX, uiY)) return;
            if (this.hitChestSlot(uiX, uiY, true) >= 0) return;
            if (this.hitChestBagSlot(uiX, uiY, true) >= 0) return;
            if (this.hitHotbar(uiX, uiY, true)) return;
            if (this.hitChestPanel(uiX, uiY)) return;
            this.setChestOpen(false);
            return;
        }
        if (this._craftOpen) {
            if (
                this.hitCraftClose(uiX, uiY) ||
                this.hitCraftAd(uiX, uiY) ||
                this.hitCraftRow(uiX, uiY)
            ) {
                return;
            }
            if (this.hitHotbar(uiX, uiY, true)) return;
            if (this.hitCraftPanel(uiX, uiY)) return;
            this.setCraftOpen(false);
            return;
        }
        if (this._bagOpen && this.hitCloseBtn(uiX, uiY)) {
            this.setBagOpen(false);
            return;
        }
        if (!this._bagOpen && this.hitBagBtn(uiX, uiY)) {
            this.toggleBag();
            return;
        }
        if (this._bagOpen) {
            if (this.hitHotbar(uiX, uiY, true)) return;
            if (this.hitInvSlot(uiX, uiY, true) >= 0) return;
            if (this.hitPanel(uiX, uiY)) return;
            // Dimmer / outside → close
            this.setBagOpen(false);
            return;
        }
        if (this.hitHotbar(uiX, uiY, false)) return;
        this.hideTip();
        this.farm?.tryActAtUi(uiX, uiY);
    }

    private initBackpack() {
        this._backpack = new Array(INV_COLS * INV_ROWS).fill(null);
        // Starter tools sit in row 4 (toolbar), not duplicated in storage.
        // Slot 0 is always bare hand and cannot be replaced.
        const starter: InvStack[] = [
            { id: 'hand', count: 1 },
            { id: 'hoe', count: 1 },
            { id: 'seeds', count: Math.max(1, this.farm?.seeds ?? 12) },
            { id: 'can', count: 1 },
            { id: 'axe', count: 1 },
            { id: 'rod', count: 1 },
        ];
        starter.forEach((s, i) => {
            this._backpack[HOTBAR_BASE + i] = s;
        });
        this._chest = new Array(CHEST_SLOTS).fill(null);
        // A few yard leftovers so the chest feels lived-in on first open.
        this._chest[0] = { id: 'wood', count: 8 };
        this._chest[1] = { id: 'stone', count: 4 };
        this.farm?.setTool('hand');
    }

    private hotbarItem(i: number): InvItemId | null {
        return this._backpack[HOTBAR_BASE + i]?.id ?? null;
    }

    private ensureHandSlot() {
        this._backpack[HAND_SLOT] = { id: 'hand', count: 1 };
    }

    private swapBag(a: number, b: number) {
        if (a < 0 || b < 0 || a === b) return;
        if (a >= this._backpack.length || b >= this._backpack.length) return;
        // Bare hand is locked to dock slot 0.
        if (isHandLockedSlot(a) || isHandLockedSlot(b)) return;
        if (this._backpack[a]?.id === 'hand' || this._backpack[b]?.id === 'hand') return;
        const tmp = this._backpack[a];
        this._backpack[a] = this._backpack[b];
        this._backpack[b] = tmp;
        this.ensureHandSlot();
    }

    private syncFromFarm() {
        if (!this.farm) return;
        this.syncStackCount('seeds', this.farm.seeds);
        this.syncStackCount('parsnip', this.farm.crops);
        for (const id of ALL_MATERIALS) {
            this.syncStackCount(id, this.farm.materialCount(id));
        }
        this.refreshHotbarIcons();
        this.refreshInvIcons();
        if (this._chestOpen) this.refreshChestIcons();
        if (this._craftOpen) this.refreshCraftRows();
    }

    /** Mirror an absolute farm counter into the bag (0 removes the stack). */
    private syncStackCount(id: InvItemId, count: number) {
        if (id === 'hand') {
            this.ensureHandSlot();
            return;
        }
        const n = Math.max(0, count | 0);
        const idx = this._backpack.findIndex((s) => s?.id === id);
        if (n > 0) {
            if (idx >= 0 && this._backpack[idx]) this._backpack[idx]!.count = n;
            else this.placeInBag({ id, count: n });
        } else if (idx >= 0 && !isHandLockedSlot(idx)) {
            this._backpack[idx] = null;
        }
        this.ensureHandSlot();
    }

    private placeInBag(stack: InvStack) {
        if (stack.id === 'hand') {
            this.ensureHandSlot();
            return;
        }
        const exist = this._backpack.findIndex((s) => s?.id === stack.id);
        if (exist >= 0) {
            this._backpack[exist] = stack;
            return;
        }
        // Prefer upper storage rows; fall back to dock slots 1+ (never overwrite hand).
        let empty = -1;
        for (let i = 0; i < HOTBAR_BASE; i++) {
            if (!this._backpack[i]) {
                empty = i;
                break;
            }
        }
        if (empty < 0) {
            for (let i = HAND_SLOT + 1; i < this._backpack.length; i++) {
                if (!this._backpack[i]) {
                    empty = i;
                    break;
                }
            }
        }
        if (empty >= 0) this._backpack[empty] = stack;
        this.ensureHandSlot();
    }

    private loadFrames(done: () => void) {
        const toolKeys = Object.keys(TOOL_FRAMES) as (keyof typeof TOOL_FRAMES)[];
        const extra: { key: InvItemId; uuid: string }[] = [];
        const cropSf = FARM_FRAMES.crop?.[2];
        if (cropSf) extra.push({ key: 'parsnip', uuid: cropSf });
        for (const id of ALL_MATERIALS) {
            const uuid = MATERIAL_FRAME_UUID[id];
            if (uuid) extra.push({ key: id, uuid });
        }
        let left = toolKeys.length + extra.length;
        if (!left) {
            done();
            return;
        }
        const finish = () => {
            left--;
            if (left <= 0) done();
        };
        toolKeys.forEach((k) => {
            const uuid = TOOL_FRAMES[k];
            if (!uuid) {
                finish();
                return;
            }
            assetManager.loadAny({ uuid }, (err, asset) => {
                if (!err && asset) this._frames[k] = asset as SpriteFrame;
                finish();
            });
        });
        extra.forEach(({ key, uuid }) => {
            assetManager.loadAny({ uuid }, (err, asset) => {
                if (!err && asset) this._frames[key] = asset as SpriteFrame;
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
            'FarmBagDimmer',
            'FarmBagPanel',
            'FarmChestDimmer',
            'FarmChestPanel',
            'FarmDragGhost',
            'FarmLootFx',
        ]) {
            const n = this.node.getChildByName(name);
            if (n) n.destroy();
        }
        this._lootFxRoot = null;

        const canvas = this.node;
        const bar = new Node('FarmHotbar');
        bar.layer = canvas.layer;
        bar.setParent(canvas);
        const totalW = SLOT_COUNT * SLOT + (SLOT_COUNT - 1) * GAP;
        bar.setPosition(0, BAR_Y, 0);
        bar.addComponent(UITransform).setContentSize(BAR_BG_W, BAR_H);
        this._bar = bar;

        const bg = new Node('BarBg');
        bg.layer = canvas.layer;
        bg.setParent(bar);
        bg.addComponent(UITransform).setContentSize(BAR_BG_W, BAR_H);
        const bgG = bg.addComponent(Graphics);
        const barR = Math.round(16 * UI_SCALE);
        bgG.fillColor = new Color(62, 42, 28, 220);
        bgG.roundRect(-BAR_BG_W * 0.5, -BAR_H * 0.5, BAR_BG_W, BAR_H, barR);
        bgG.fill();
        bgG.strokeColor = new Color(40, 28, 18, 255);
        bgG.lineWidth = Math.round(4 * UI_SCALE);
        bgG.roundRect(-BAR_BG_W * 0.5, -BAR_H * 0.5, BAR_BG_W, BAR_H, barR);
        bgG.stroke();
        this._barBg = bg;

        const startX = -totalW * 0.5 + SLOT * 0.5;
        this._slots = [];
        for (let i = 0; i < SLOT_COUNT; i++) {
            const item = this.hotbarItem(i);
            const x = startX + i * (SLOT + GAP);
            const root = new Node(item ? `Slot_${item}` : `Slot_empty_${i}`);
            root.layer = canvas.layer;
            root.setParent(bar);
            root.setPosition(x, 0, 0);
            root.addComponent(UITransform).setContentSize(SLOT, SLOT);

            const glowN = new Node('Glow');
            glowN.layer = canvas.layer;
            glowN.setParent(root);
            const glow = glowN.addComponent(Graphics);

            this.addSlotPlate(root);

            let icon: Sprite | null = null;
            if (item && this.frameFor(item)) {
                icon = this.addIcon(root, this.frameFor(item)!, ICON);
            }
            const count = this.addCountLabel(root, SLOT);

            this._slots.push({ item, root, glow, icon, count });
        }

        this.buildBagButton(bar);
        this.buildBagPanel();
        this.buildChestPanel();
        this.buildCraftPanel();
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
        this.orderLayers();
    }

    /** Rebuild craft rows after Luban tables load. */
    reloadCraftRecipes() {
        if (this._craftPanel?.isValid) this._craftPanel.destroy();
        if (this._craftDimmer?.isValid) this._craftDimmer.destroy();
        if (this._craftCloseBtn?.isValid) this._craftCloseBtn.destroy();
        this._craftPanel = null;
        this._craftDimmer = null;
        this._craftCloseBtn = null;
        this._craftRows = [];
        this.buildCraftPanel();
        this.setCraftOpen(false);
        this.orderLayers();
    }

    openCraftPanel() {
        this.setCraftOpen(true);
    }

    openBagPanel() {
        this.setBagOpen(true);
    }

    private _quests: QuestSystem | null = null;

    bindQuests(quests: QuestSystem | null) {
        this._quests = quests;
    }

    /** Dimmer < panels < hotbar < tip < drag ghost < loot fly */
    private orderLayers() {
        const nodes = [
            this._dimmer,
            this._panel,
            this._chestDimmer,
            this._chestPanel,
            this._craftDimmer,
            this._craftPanel,
            this._bar,
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
        const to = this.bagFlyTarget();
        const n = Math.max(1, Math.min(count, 5));
        for (let i = 0; i < n; i++) {
            this.spawnLootFlyIcon(sf, from.x, from.y, to.x, to.y, i, n);
        }
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

    private spawnLootFlyIcon(
        sf: SpriteFrame,
        fromX: number,
        fromY: number,
        toX: number,
        toY: number,
        index: number,
        total: number,
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

        const delay = index * 0.05;
        const peakX = startX + (toX - startX) * 0.35 + spread * 0.35;
        const peakY = Math.max(startY, toY) + 72 + (index % 3) * 10;
        const peak = new Vec3(peakX, peakY, 0);
        const end = new Vec3(toX, toY, 0);
        const landScale = new Vec3(0.3, 0.3, 1);

        tween(node)
            .delay(delay)
            .to(0.12, { scale: new Vec3(1.05, 1.05, 1) }, { easing: 'backOut' })
            .to(0.2, { position: peak }, { easing: 'sineOut' })
            .parallel(
                tween().to(0.36, { position: end, scale: landScale }, { easing: 'quadIn' }),
                tween(op).delay(0.1).to(0.26, { opacity: 40 }),
            )
            .call(() => {
                if (node.isValid) node.destroy();
                if (index === total - 1) this.pulseBagBtn();
            })
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

    private buildBagButton(bar: Node) {
        const canvas = this.node;
        const btn = new Node('BagBtn');
        btn.layer = canvas.layer;
        btn.setParent(bar);
        // Sit on the dock: badge bottom flush with hotbar slot top edges.
        const edgePad = Math.round(6 * UI_SCALE);
        const x = BAR_BG_W * 0.5 - BAG_BTN * 0.5 - edgePad;
        const y = SLOT * 0.5 + BAG_BTN * 0.5;
        btn.setPosition(x, y, 0);
        btn.addComponent(UITransform).setContentSize(BAG_BTN, BAG_BTN);

        const glowN = new Node('Glow');
        glowN.layer = canvas.layer;
        glowN.setParent(btn);
        this._bagGlow = glowN.addComponent(Graphics);

        // Single sprite: AI wood badge + backpack baked together (process_bag_ai.py).
        const face = new Node('Face');
        face.layer = canvas.layer;
        face.setParent(btn);
        face.addComponent(UITransform).setContentSize(BAG_BTN, BAG_BTN);
        if (this._frames.bagBtn) {
            const sp = face.addComponent(Sprite);
            sp.sizeMode = Sprite.SizeMode.CUSTOM;
            sp.spriteFrame = this._frames.bagBtn;
        } else if (this._frames.backpack) {
            const sp = face.addComponent(Sprite);
            sp.sizeMode = Sprite.SizeMode.CUSTOM;
            sp.spriteFrame = this._frames.backpack;
        } else {
            const g = face.addComponent(Graphics);
            const half = BAG_BTN * 0.5;
            const r = Math.round(22 * UI_SCALE);
            g.fillColor = new Color(196, 152, 72, 255);
            g.roundRect(-half, -half, BAG_BTN, BAG_BTN, r);
            g.fill();
            g.fillColor = new Color(158, 100, 52, 255);
            const inset = Math.round(18 * UI_SCALE);
            g.roundRect(-half + inset, -half + inset, BAG_BTN - inset * 2, BAG_BTN - inset * 2, Math.round(14 * UI_SCALE));
            g.fill();
        }

        this._bagBtn = btn;
    }

    private buildBagPanel() {
        const canvas = this.node;
        const dimmer = new Node('FarmBagDimmer');
        dimmer.layer = canvas.layer;
        dimmer.setParent(canvas);
        const vis = view.getVisibleSize();
        dimmer.addComponent(UITransform).setContentSize(vis.width * 2, vis.height * 2);
        const dG = dimmer.addComponent(Graphics);
        dG.fillColor = new Color(0, 0, 0, 140);
        dG.rect(-vis.width, -vis.height, vis.width * 2, vis.height * 2);
        dG.fill();
        this._dimmer = dimmer;

        const gridW = INV_COLS * INV_SLOT + (INV_COLS - 1) * INV_GAP;
        const gridH = INV_STORAGE_ROWS * INV_SLOT + (INV_STORAGE_ROWS - 1) * INV_GAP;
        const dockH = BAR_H;
        // One wood panel: storage rows on top + row-4 dock on bottom (same slot size).
        const panelW = Math.max(gridW + INV_PAD * 2, BAR_BG_W + Math.round(16 * UI_SCALE));
        const upperH = INV_PAD + INV_TITLE_H + gridH + INV_DOCK_GAP;
        const panelH = upperH + dockH;
        const panel = new Node('FarmBagPanel');
        panel.layer = canvas.layer;
        panel.setParent(canvas);
        // Align dock with the hotbar so slots sit inside the bag chrome.
        const panelBottom = BAR_Y - BAR_H * 0.5;
        const panelY = panelBottom + panelH * 0.5;
        panel.setPosition(0, panelY, 0);
        panel.addComponent(UITransform).setContentSize(panelW, panelH);
        this._panel = panel;

        const chrome = new Node('Chrome');
        chrome.layer = canvas.layer;
        chrome.setParent(panel);
        chrome.addComponent(UITransform).setContentSize(panelW, panelH);
        const g = chrome.addComponent(Graphics);
        this.drawPanelChrome(g, panelW, panelH, dockH);

        const titleN = new Node('Title');
        titleN.layer = canvas.layer;
        titleN.setParent(panel);
        // Centered in panel; sit lower in the header band (not flush to the top rim).
        const titleY = panelH * 0.5 - INV_PAD - INV_TITLE_H * 0.42;
        titleN.setPosition(0, titleY, 0);
        titleN.addComponent(UITransform).setContentSize(panelW, INV_TITLE_H);
        const title = titleN.addComponent(Label);
        title.string = '背包';
        title.horizontalAlign = Label.HorizontalAlign.CENTER;
        title.verticalAlign = Label.VerticalAlign.CENTER;
        styleUiLabel(title, {
            size: Math.round(28 * UI_SCALE),
            color: new Color(255, 244, 214, 255),
            outline: true,
        });

        const hintN = new Node('Hint');
        hintN.layer = canvas.layer;
        hintN.setParent(panel);
        hintN.setPosition(0, titleY - INV_TITLE_H * 0.55, 0);
        hintN.addComponent(UITransform).setContentSize(panelW, Math.round(22 * UI_SCALE));
        const hint = hintN.addComponent(Label);
        hint.string = '下方一行为第4行（快捷装备）';
        hint.horizontalAlign = Label.HorizontalAlign.CENTER;
        hint.verticalAlign = Label.VerticalAlign.CENTER;
        styleUiLabel(hint, {
            size: Math.round(16 * UI_SCALE),
            color: new Color(210, 190, 150, 255),
            outline: false,
        });

        this.buildCloseButton(panel, panelW, panelH);

        const grid = new Node('Grid');
        grid.layer = canvas.layer;
        grid.setParent(panel);
        const gridY = -panelH * 0.5 + dockH + INV_DOCK_GAP + gridH * 0.5;
        grid.setPosition(0, gridY, 0);
        grid.addComponent(UITransform).setContentSize(gridW, gridH);

        this._invCells = [];
        const originX = -gridW * 0.5 + INV_SLOT * 0.5;
        const originY = gridH * 0.5 - INV_SLOT * 0.5;
        for (let r = 0; r < INV_STORAGE_ROWS; r++) {
            for (let c = 0; c < INV_COLS; c++) {
                const root = new Node(`Inv_${r}_${c}`);
                root.layer = canvas.layer;
                root.setParent(grid);
                root.setPosition(originX + c * (INV_SLOT + INV_GAP), originY - r * (INV_SLOT + INV_GAP), 0);
                root.addComponent(UITransform).setContentSize(INV_SLOT, INV_SLOT);
                this.addSlotPlate(root, Math.round(INV_SLOT * 0.9));
                const icon = this.addIcon(root, null, Math.round(INV_SLOT * 0.62));
                const count = this.addCountLabel(root, INV_SLOT);
                this._invCells.push({ root, icon, count });
            }
        }
    }

    /** Shared corner placement for bag / chest / craft close buttons. */
    private placePanelCloseButton(btn: Node, panelW: number, panelH: number) {
        const pad = Math.round(14 * UI_SCALE);
        const hit = Math.round(CLOSE_BTN * 1.35);
        btn.setPosition(panelW * 0.5 - pad - hit * 0.5, panelH * 0.5 - pad - hit * 0.5, 0);
        btn.addComponent(UITransform).setContentSize(hit, hit);
    }

    private fillPanelCloseVisual(btn: Node, layer: number) {
        if (this._frames.close) {
            const icon = new Node('Icon');
            icon.layer = layer;
            icon.setParent(btn);
            icon.addComponent(UITransform).setContentSize(CLOSE_BTN, CLOSE_BTN);
            const sp = icon.addComponent(Sprite);
            sp.sizeMode = Sprite.SizeMode.CUSTOM;
            sp.spriteFrame = this._frames.close;
            return;
        }
        const g = btn.addComponent(Graphics);
        const half = CLOSE_BTN * 0.5;
        g.fillColor = new Color(186, 110, 36, 255);
        g.roundRect(-half, -half, CLOSE_BTN, CLOSE_BTN, Math.round(10 * UI_SCALE));
        g.fill();
        g.strokeColor = new Color(54, 30, 14, 255);
        g.lineWidth = Math.round(4 * UI_SCALE);
        g.roundRect(-half, -half, CLOSE_BTN, CLOSE_BTN, Math.round(10 * UI_SCALE));
        g.stroke();
        g.strokeColor = new Color(72, 42, 22, 255);
        g.lineWidth = Math.round(5 * UI_SCALE);
        const m = Math.round(14 * UI_SCALE);
        g.moveTo(-m, m);
        g.lineTo(m, -m);
        g.moveTo(-m, -m);
        g.lineTo(m, m);
        g.stroke();
    }

    private buildCloseButton(panel: Node, panelW: number, panelH: number) {
        const canvas = this.node;
        const btn = new Node('CloseBtn');
        btn.layer = canvas.layer;
        btn.setParent(panel);
        this.placePanelCloseButton(btn, panelW, panelH);
        this.fillPanelCloseVisual(btn, canvas.layer);
        this._closeBtn = btn;
    }

    private drawPanelChrome(g: Graphics, w: number, h: number, dockH: number) {
        g.clear();
        const x0 = -w * 0.5;
        const y0 = -h * 0.5;
        const r = Math.round(18 * UI_SCALE);
        // Outer wood frame (Stardew-like orange-brown)
        g.fillColor = new Color(176, 110, 48, 255);
        g.roundRect(x0, y0, w, h, r);
        g.fill();
        g.fillColor = new Color(120, 72, 32, 255);
        g.roundRect(x0 + 6, y0 + 6, w - 12, h - 12, r - 4);
        g.fill();
        // Inner parchment
        g.fillColor = new Color(232, 198, 140, 255);
        g.roundRect(x0 + 14, y0 + 14, w - 28, h - 28, r - 8);
        g.fill();
        // Slightly darker strip behind backpack row 4 (toolbar dock).
        const dockTop = y0 + 14;
        const dockInnerH = Math.max(8, dockH - 10);
        g.fillColor = new Color(210, 168, 112, 255);
        g.rect(x0 + 14, dockTop, w - 28, dockInnerH);
        g.fill();
        // Wood rail between storage rows and row-4 dock.
        const railY = y0 + dockH - Math.round(3 * UI_SCALE);
        const railH = Math.round(10 * UI_SCALE);
        g.fillColor = new Color(176, 110, 48, 255);
        g.rect(x0 + 14, railY, w - 28, railH);
        g.fill();
        g.fillColor = new Color(210, 150, 70, 255);
        g.rect(x0 + 14, railY + railH - 2, w - 28, 2);
        g.fill();
        g.fillColor = new Color(120, 72, 32, 255);
        g.rect(x0 + 14, railY, w - 28, 2);
        g.fill();

        g.strokeColor = new Color(60, 36, 18, 255);
        g.lineWidth = Math.round(4 * UI_SCALE);
        g.roundRect(x0, y0, w, h, r);
        g.stroke();
        g.strokeColor = new Color(210, 150, 70, 255);
        g.lineWidth = Math.round(3 * UI_SCALE);
        g.roundRect(x0 + 8, y0 + 8, w - 16, h - 16, r - 5);
        g.stroke();
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
        if (this._frames.slot) {
            const plate = new Node('Plate');
            plate.layer = root.layer;
            plate.setParent(root);
            plate.addComponent(UITransform).setContentSize(size, size);
            const sp = plate.addComponent(Sprite);
            sp.sizeMode = Sprite.SizeMode.CUSTOM;
            sp.spriteFrame = this._frames.slot;
        } else {
            const g = root.addComponent(Graphics);
            const half = size * 0.5;
            g.fillColor = new Color(210, 180, 120, 255);
            g.roundRect(-half, -half, size, size, Math.round(10 * UI_SCALE));
            g.fill();
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

    private refreshHotbarIcons() {
        for (let i = 0; i < this._slots.length; i++) {
            const s = this._slots[i]!;
            const stack = this._backpack[HOTBAR_BASE + i] ?? null;
            const item = stack?.id ?? null;
            s.item = item;
            const sf = item ? this.frameFor(item) : null;
            if (s.icon) {
                s.icon.spriteFrame = sf;
                s.icon.node.active = !!sf;
            }
            if (s.count) {
                const n = stack?.count ?? 0;
                const show = !!stack && n > 1;
                s.count.string = show ? String(n) : '';
                s.count.node.active = show;
            }
        }
    }

    private refreshInvIcons() {
        // Upper 3 storage rows only; row 4 is the dock / hotbar.
        for (let i = 0; i < this._invCells.length; i++) {
            const cell = this._invCells[i]!;
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

    private toggleBag() {
        if (this._chestOpen) this.setChestOpen(false);
        if (this._craftOpen) this.setCraftOpen(false);
        this.setBagOpen(!this._bagOpen);
    }

    private setBagOpen(open: boolean) {
        this._bagOpen = open;
        if (open && this._chestOpen) this.setChestOpen(false);
        if (open && this._craftOpen) this.setCraftOpen(false);
        InputBridge.uiBlocking = open || this._chestOpen || this._craftOpen;
        if (this._dimmer) this._dimmer.active = open;
        if (this._panel) this._panel.active = open;
        // Unified bag chrome covers the standalone hotbar plate + bag tab.
        if (this._barBg) this._barBg.active = !open && !this._chestOpen && !this._craftOpen;
        if (this._bagBtn) this._bagBtn.active = !open && !this._chestOpen && !this._craftOpen;
        if (this._closeBtn) this._closeBtn.active = open;
        if (!open) this.cancelDrag();
        this.refreshBagBtn();
        if (open) {
            this.syncFromFarm();
            this.hideTip();
            this.orderLayers();
        }
    }

    private buildChestPanel() {
        const canvas = this.node;
        const dimmer = new Node('FarmChestDimmer');
        dimmer.layer = canvas.layer;
        dimmer.setParent(canvas);
        const vis = view.getVisibleSize();
        dimmer.addComponent(UITransform).setContentSize(vis.width * 2, vis.height * 2);
        const dG = dimmer.addComponent(Graphics);
        dG.fillColor = new Color(0, 0, 0, 150);
        dG.rect(-vis.width, -vis.height, vis.width * 2, vis.height * 2);
        dG.fill();
        this._chestDimmer = dimmer;

        // Same pitch as hotbar: 7×SLOT + 6×GAP — columns must land on the dock slots.
        const gridW = SLOT_COUNT * SLOT + (SLOT_COUNT - 1) * GAP;
        const gridH = CHEST_ROWS * CHEST_SLOT + (CHEST_ROWS - 1) * CHEST_GAP;
        const bagH = INV_STORAGE_ROWS * CHEST_SLOT + (INV_STORAGE_ROWS - 1) * CHEST_GAP;
        const dockH = BAR_H;
        // Panel width tracks the hotbar plate so left/right chrome is symmetric around the grid.
        const panelW = Math.max(gridW + CHEST_PAD * 2, BAR_BG_W + Math.round(16 * UI_SCALE));
        // Header + chest + section gap (label inside) + bag rows + dock (row-4 tools).
        const upperH =
            CHEST_PAD +
            CHEST_TITLE_H +
            Math.round(22 * UI_SCALE) +
            gridH +
            CHEST_SECTION_GAP +
            bagH +
            CHEST_DOCK_GAP;
        const panelH = upperH + dockH;

        const panel = new Node('FarmChestPanel');
        panel.layer = canvas.layer;
        panel.setParent(canvas);
        // Align dock with the always-visible hotbar so tools sit inside the wood chrome.
        const panelBottom = BAR_Y - BAR_H * 0.5;
        const panelY = panelBottom + panelH * 0.5;
        panel.setPosition(0, panelY, 0);
        panel.addComponent(UITransform).setContentSize(panelW, panelH);
        this._chestPanel = panel;

        const chrome = new Node('Chrome');
        chrome.layer = canvas.layer;
        chrome.setParent(panel);
        chrome.addComponent(UITransform).setContentSize(panelW, panelH);
        const g = chrome.addComponent(Graphics);
        this.drawChestChrome(g, panelW, panelH, dockH);

        const titleY = panelH * 0.5 - CHEST_PAD - CHEST_TITLE_H * 0.42;
        const titleN = new Node('Title');
        titleN.layer = canvas.layer;
        titleN.setParent(panel);
        titleN.setPosition(0, titleY, 0);
        titleN.addComponent(UITransform).setContentSize(panelW, CHEST_TITLE_H);
        const title = titleN.addComponent(Label);
        title.string = '储藏箱';
        title.horizontalAlign = Label.HorizontalAlign.CENTER;
        title.verticalAlign = Label.VerticalAlign.CENTER;
        styleUiLabel(title, {
            size: Math.round(28 * UI_SCALE),
            color: new Color(255, 244, 214, 255),
            outline: true,
        });

        const hintN = new Node('Hint');
        hintN.layer = canvas.layer;
        hintN.setParent(panel);
        hintN.setPosition(0, titleY - CHEST_TITLE_H * 0.55, 0);
        hintN.addComponent(UITransform).setContentSize(panelW, Math.round(22 * UI_SCALE));
        const hint = hintN.addComponent(Label);
        hint.string = '拖拽：箱 ↔ 背包 · 底行是快捷工具';
        hint.horizontalAlign = Label.HorizontalAlign.CENTER;
        hint.verticalAlign = Label.VerticalAlign.CENTER;
        styleUiLabel(hint, {
            size: Math.round(15 * UI_SCALE),
            color: new Color(210, 190, 150, 255),
            outline: false,
        });

        this.buildChestCloseButton(panel, panelW, panelH);
        this.buildTakeAllButton(panel, panelW, panelH, titleY);

        // Chest grid
        const chestGrid = new Node('ChestGrid');
        chestGrid.layer = canvas.layer;
        chestGrid.setParent(panel);
        const chestGridY = titleY - CHEST_TITLE_H * 0.75 - Math.round(8 * UI_SCALE) - gridH * 0.5;
        chestGrid.setPosition(0, chestGridY, 0);
        chestGrid.addComponent(UITransform).setContentSize(gridW, gridH);
        this._chestCells = this.buildGridCells(chestGrid, CHEST_ROWS, CHEST_COLS, CHEST_SLOT, CHEST_GAP, 'Chest');

        // Section label centered in the gap between chest grid and bag grid.
        const secN = new Node('BagLabel');
        secN.layer = canvas.layer;
        secN.setParent(panel);
        const chestBottom = chestGridY - gridH * 0.5;
        const bagGridY = chestBottom - CHEST_SECTION_GAP - bagH * 0.5;
        const secY = (chestBottom + (bagGridY + bagH * 0.5)) * 0.5;
        secN.setPosition(0, secY, 0);
        secN.addComponent(UITransform).setContentSize(panelW, Math.round(26 * UI_SCALE));
        const sec = secN.addComponent(Label);
        sec.string = '我的背包';
        sec.horizontalAlign = Label.HorizontalAlign.CENTER;
        sec.verticalAlign = Label.VerticalAlign.CENTER;
        styleUiLabel(sec, {
            size: Math.round(28 * UI_SCALE),
            color: new Color(255, 244, 214, 255),
            outline: true,
        });

        const bagGrid = new Node('BagGrid');
        bagGrid.layer = canvas.layer;
        bagGrid.setParent(panel);
        bagGrid.setPosition(0, bagGridY, 0);
        bagGrid.addComponent(UITransform).setContentSize(gridW, bagH);
        this._chestBagCells = this.buildGridCells(
            bagGrid,
            INV_STORAGE_ROWS,
            CHEST_COLS,
            CHEST_SLOT,
            CHEST_GAP,
            'Bag',
        );
    }

    private buildTakeAllButton(panel: Node, panelW: number, _panelH: number, titleY: number) {
        const btn = new Node('TakeAll');
        btn.layer = panel.layer;
        btn.setParent(panel);
        // Wide enough for title-sized「全部取出」(28×UI_SCALE).
        const btnW = Math.round(220 * UI_SCALE);
        const btnH = Math.max(CHEST_BTN_H, Math.round(44 * UI_SCALE));
        const pad = Math.round(18 * UI_SCALE);
        // Top-left of header — keeps the dock free for tools.
        btn.setPosition(-panelW * 0.5 + pad + btnW * 0.5, titleY, 0);
        btn.addComponent(UITransform).setContentSize(btnW, btnH);
        const btnG = btn.addComponent(Graphics);
        const bw = btnW * 0.5;
        const bh = btnH * 0.5;
        btnG.fillColor = new Color(120, 72, 32, 255);
        btnG.roundRect(-bw, -bh, btnW, btnH, Math.round(12 * UI_SCALE));
        btnG.fill();
        btnG.fillColor = new Color(186, 110, 36, 255);
        btnG.roundRect(-bw + 4, -bh + 4, btnW - 8, btnH - 8, Math.round(10 * UI_SCALE));
        btnG.fill();
        btnG.strokeColor = new Color(54, 30, 14, 255);
        btnG.lineWidth = Math.round(3 * UI_SCALE);
        btnG.roundRect(-bw, -bh, btnW, btnH, Math.round(12 * UI_SCALE));
        btnG.stroke();
        const btnLabN = new Node('Label');
        btnLabN.layer = panel.layer;
        btnLabN.setParent(btn);
        btnLabN.addComponent(UITransform).setContentSize(btnW, btnH);
        const btnLab = btnLabN.addComponent(Label);
        btnLab.string = '全部取出';
        btnLab.horizontalAlign = Label.HorizontalAlign.CENTER;
        btnLab.verticalAlign = Label.VerticalAlign.CENTER;
        styleUiLabel(btnLab, {
            size: Math.round(28 * UI_SCALE),
            color: new Color(255, 244, 214, 255),
            outline: true,
        });
        this._takeAllBtn = btn;
    }

    private buildGridCells(
        parent: Node,
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
                root.layer = parent.layer;
                root.setParent(parent);
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

    private buildChestCloseButton(panel: Node, panelW: number, panelH: number) {
        const btn = new Node('CloseBtn');
        btn.layer = panel.layer;
        btn.setParent(panel);
        this.placePanelCloseButton(btn, panelW, panelH);
        this.fillPanelCloseVisual(btn, panel.layer);
        this._chestCloseBtn = btn;
    }

    private drawChestChrome(g: Graphics, w: number, h: number, dockH: number) {
        g.clear();
        const x0 = -w * 0.5;
        const y0 = -h * 0.5;
        const r = Math.round(18 * UI_SCALE);
        g.fillColor = new Color(176, 110, 48, 255);
        g.roundRect(x0, y0, w, h, r);
        g.fill();
        g.fillColor = new Color(120, 72, 32, 255);
        g.roundRect(x0 + 6, y0 + 6, w - 12, h - 12, r - 4);
        g.fill();
        g.fillColor = new Color(232, 198, 140, 255);
        g.roundRect(x0 + 14, y0 + 14, w - 28, h - 28, r - 8);
        g.fill();
        // Darker strip behind row-4 toolbar dock (same as bag).
        const dockTop = y0 + 14;
        const dockInnerH = Math.max(8, dockH - 10);
        g.fillColor = new Color(210, 168, 112, 255);
        g.rect(x0 + 14, dockTop, w - 28, dockInnerH);
        g.fill();
        const railY = y0 + dockH - Math.round(3 * UI_SCALE);
        const railH = Math.round(10 * UI_SCALE);
        g.fillColor = new Color(176, 110, 48, 255);
        g.rect(x0 + 14, railY, w - 28, railH);
        g.fill();
        g.fillColor = new Color(210, 150, 70, 255);
        g.rect(x0 + 14, railY + railH - 2, w - 28, 2);
        g.fill();
        g.fillColor = new Color(120, 72, 32, 255);
        g.rect(x0 + 14, railY, w - 28, 2);
        g.fill();
        g.strokeColor = new Color(60, 36, 18, 255);
        g.lineWidth = Math.round(4 * UI_SCALE);
        g.roundRect(x0, y0, w, h, r);
        g.stroke();
        g.strokeColor = new Color(210, 150, 70, 255);
        g.lineWidth = Math.round(3 * UI_SCALE);
        g.roundRect(x0 + 8, y0 + 8, w - 16, h - 16, r - 5);
        g.stroke();
    }

    private setChestOpen(open: boolean) {
        this._chestOpen = open;
        if (open && this._bagOpen) this.setBagOpen(false);
        if (open && this._craftOpen) this.setCraftOpen(false);
        InputBridge.uiBlocking = open || this._bagOpen || this._craftOpen;
        if (this._chestDimmer) this._chestDimmer.active = open;
        if (this._chestPanel) this._chestPanel.active = open;
        if (this._chestCloseBtn) this._chestCloseBtn.active = open;
        if (this._takeAllBtn) this._takeAllBtn.active = open;
        // Hide standalone hotbar plate + bag tab; keep slot icons so they sit in the dock.
        if (this._barBg) this._barBg.active = !open && !this._bagOpen && !this._craftOpen;
        if (this._bagBtn) this._bagBtn.active = !open && !this._bagOpen && !this._craftOpen;
        if (this._bar) this._bar.active = true;
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

    private buildCraftPanel() {
        const canvas = this.node;
        const dimmer = new Node('FarmCraftDimmer');
        dimmer.layer = canvas.layer;
        dimmer.setParent(canvas);
        const vis = view.getVisibleSize();
        dimmer.addComponent(UITransform).setContentSize(vis.width * 2, vis.height * 2);
        const dG = dimmer.addComponent(Graphics);
        dG.fillColor = new Color(0, 0, 0, 150);
        dG.rect(-vis.width, -vis.height, vis.width * 2, vis.height * 2);
        dG.fill();
        this._craftDimmer = dimmer;

        const recipes = getCraftRecipes();
        const n = Math.max(1, recipes.length);
        const listH = n * CRAFT_ROW_H + Math.max(0, n - 1) * CRAFT_ROW_GAP;
        // out | name | costs | craft btn (→ progress+ad while busy) — single-line like图2
        const midW =
            CRAFT_NAME_COL_W + CRAFT_COL_GAP + CRAFT_COST_SLOTS * CRAFT_COST_CELL_W;
        const panelW = Math.max(
            BAR_BG_W + Math.round(48 * UI_SCALE),
            CRAFT_PAD * 2 + CRAFT_OUT_SZ + CRAFT_COL_GAP + midW + CRAFT_COL_GAP + CRAFT_BTN_W,
        );
        const panelH = CRAFT_PAD + CRAFT_HEADER_H + Math.round(8 * UI_SCALE) + listH + CRAFT_PAD;

        const panel = new Node('FarmCraftPanel');
        panel.layer = canvas.layer;
        panel.setParent(canvas);
        // Keep the panel body above the hotbar; clamp so the header/close stay on-screen.
        const panelBottom = BAR_Y + BAR_H * 0.5 + Math.round(18 * UI_SCALE);
        let panelY = panelBottom + panelH * 0.5;
        const maxTop = view.getVisibleSize().height * 0.5 - Math.round(24 * UI_SCALE);
        const top = panelY + panelH * 0.5;
        if (top > maxTop) panelY -= top - maxTop;
        panel.setPosition(0, panelY, 0);
        panel.addComponent(UITransform).setContentSize(panelW, panelH);
        this._craftPanel = panel;

        const chrome = new Node('Chrome');
        chrome.layer = canvas.layer;
        chrome.setParent(panel);
        chrome.addComponent(UITransform).setContentSize(panelW, panelH);
        const g = chrome.addComponent(Graphics);
        this.drawCraftChrome(g, panelW, panelH);

        const headerTop = panelH * 0.5 - CRAFT_PAD;
        const titleY = headerTop - CRAFT_HEADER_H * 0.5;
        const titleN = new Node('Title');
        titleN.layer = canvas.layer;
        titleN.setParent(panel);
        titleN.setPosition(0, titleY, 0);
        // Leave side gutters so title never sits under the close hit plate.
        const titleW = panelW - Math.round(CLOSE_BTN * 2.8);
        titleN.addComponent(UITransform).setContentSize(titleW, CRAFT_TITLE_H);
        const title = titleN.addComponent(Label);
        title.string = '制作台';
        title.horizontalAlign = Label.HorizontalAlign.CENTER;
        title.verticalAlign = Label.VerticalAlign.CENTER;
        styleUiLabel(title, {
            size: Math.round(28 * UI_SCALE),
            color: new Color(255, 244, 214, 255),
            outline: true,
        });

        this.buildCraftCloseButton(panel, panelW, panelH);

        const listTop = headerTop - CRAFT_HEADER_H - Math.round(6 * UI_SCALE);
        this._craftRows = [];
        recipes.forEach((recipe, i) => {
            const rowY = listTop - CRAFT_ROW_H * 0.5 - i * (CRAFT_ROW_H + CRAFT_ROW_GAP);
            this._craftRows.push(this.buildCraftRow(panel, panelW, recipe, rowY));
        });

        // Close above rows / chrome so it never draws under the first recipe plate.
        if (this._craftCloseBtn?.isValid) {
            this._craftCloseBtn.setSiblingIndex(panel.children.length - 1);
        }
    }

    private drawCraftChrome(g: Graphics, w: number, h: number) {
        g.clear();
        const x0 = -w * 0.5;
        const y0 = -h * 0.5;
        const r = Math.round(18 * UI_SCALE);
        g.fillColor = new Color(176, 110, 48, 255);
        g.roundRect(x0, y0, w, h, r);
        g.fill();
        g.fillColor = new Color(120, 72, 32, 255);
        g.roundRect(x0 + 6, y0 + 6, w - 12, h - 12, r - 4);
        g.fill();
        g.fillColor = new Color(232, 198, 140, 255);
        g.roundRect(x0 + 14, y0 + 14, w - 28, h - 28, r - 8);
        g.fill();
        g.strokeColor = new Color(60, 36, 18, 255);
        g.lineWidth = Math.round(4 * UI_SCALE);
        g.roundRect(x0, y0, w, h, r);
        g.stroke();
        g.strokeColor = new Color(210, 150, 70, 255);
        g.lineWidth = Math.round(3 * UI_SCALE);
        g.roundRect(x0 + 8, y0 + 8, w - 16, h - 16, r - 5);
        g.stroke();
    }

    private buildCraftCloseButton(panel: Node, panelW: number, panelH: number) {
        const btn = new Node('CloseBtn');
        btn.layer = panel.layer;
        btn.setParent(panel);
        this.placePanelCloseButton(btn, panelW, panelH);
        this.fillPanelCloseVisual(btn, panel.layer);
        this._craftCloseBtn = btn;
    }

    private buildCraftRow(
        panel: Node,
        panelW: number,
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
        adBtn: Node;
        adOp: UIOpacity | null;
    } {
        const rowW = panelW - CRAFT_PAD * 2;
        const root = new Node(`Craft_${recipe.id}`);
        root.layer = panel.layer;
        root.setParent(panel);
        root.setPosition(0, rowY, 0);
        root.addComponent(UITransform).setContentSize(rowW, CRAFT_ROW_H);

        const plate = root.addComponent(Graphics);
        const rw = rowW * 0.5;
        const rh = CRAFT_ROW_H * 0.5;
        plate.fillColor = new Color(210, 168, 112, 255);
        plate.roundRect(-rw, -rh, rowW, CRAFT_ROW_H, Math.round(12 * UI_SCALE));
        plate.fill();
        plate.strokeColor = new Color(120, 72, 32, 255);
        plate.lineWidth = Math.round(2 * UI_SCALE);
        plate.roundRect(-rw, -rh, rowW, CRAFT_ROW_H, Math.round(12 * UI_SCALE));
        plate.stroke();

        // Idle: [out] [name] [cost…] …… [制作]
        // Busy: [out] [name] [cost…] [========进度条========][广告]
        const left = -rowW * 0.5 + Math.round(12 * UI_SCALE);
        const right = rowW * 0.5 - Math.round(12 * UI_SCALE);
        const outX = left + CRAFT_OUT_SZ * 0.5;
        const actionLeft = right - CRAFT_BTN_W;
        const btnX = actionLeft + CRAFT_BTN_W * 0.5;
        const nameLeft = outX + CRAFT_OUT_SZ * 0.5 + CRAFT_COL_GAP;
        const costOrigin = nameLeft + CRAFT_NAME_COL_W + CRAFT_COL_GAP;
        const costRight = costOrigin + CRAFT_COST_SLOTS * CRAFT_COST_CELL_W;
        const adX = right - CRAFT_AD_SZ * 0.5;
        const barLeft = costRight + CRAFT_COL_GAP;
        const barRight = adX - CRAFT_AD_SZ * 0.5 - CRAFT_COL_GAP;
        const barW = Math.max(CRAFT_BTN_W, Math.round(barRight - barLeft));
        const barX = (barLeft + barRight) * 0.5;

        const outRoot = new Node('Out');
        outRoot.layer = panel.layer;
        outRoot.setParent(root);
        outRoot.setPosition(outX, 0, 0);
        outRoot.addComponent(UITransform).setContentSize(CRAFT_OUT_SZ, CRAFT_OUT_SZ);
        this.addSlotPlate(outRoot, Math.round(CRAFT_OUT_SZ * 0.95));
        this.addIcon(outRoot, this.frameFor(recipe.out.id), Math.round(CRAFT_OUT_SZ * 0.7));
        const outCount = this.addCountLabel(outRoot, CRAFT_OUT_SZ);
        if (outCount) {
            outCount.string = recipe.out.count > 1 ? String(recipe.out.count) : '';
            outCount.node.active = recipe.out.count > 1;
        }

        const nameH = Math.round(32 * UI_SCALE);
        const nameN = new Node('Name');
        nameN.layer = panel.layer;
        nameN.setParent(root);
        nameN.setPosition(nameLeft + CRAFT_NAME_COL_W * 0.5, 0, 0);
        nameN.addComponent(UITransform).setContentSize(CRAFT_NAME_COL_W, nameH);
        const nameLab = nameN.addComponent(Label);
        nameLab.string = recipe.name;
        nameLab.horizontalAlign = Label.HorizontalAlign.LEFT;
        nameLab.verticalAlign = Label.VerticalAlign.CENTER;
        nameLab.overflow = Label.Overflow.CLAMP;
        styleUiLabel(nameLab, {
            size: Math.round(22 * UI_SCALE),
            color: new Color(60, 40, 22, 255),
            outline: false,
        });

        const costLabs: Label[] = [];
        for (let i = 0; i < CRAFT_COST_SLOTS; i++) {
            const cell = new Node(`Cost_${i}`);
            cell.layer = panel.layer;
            cell.setParent(root);
            const cellX = costOrigin + i * CRAFT_COST_CELL_W + CRAFT_COST_CELL_W * 0.5;
            cell.setPosition(cellX, 0, 0);
            cell.addComponent(UITransform).setContentSize(CRAFT_COST_CELL_W, CRAFT_COST_ICON + 4);

            const cost = recipe.cost[i];
            if (!cost) {
                cell.active = false;
                continue;
            }

            const iconN = new Node('Icon');
            iconN.layer = panel.layer;
            iconN.setParent(cell);
            iconN.setPosition(-CRAFT_COST_CELL_W * 0.5 + CRAFT_COST_ICON * 0.5 + 2, 0, 0);
            iconN.addComponent(UITransform).setContentSize(CRAFT_COST_ICON, CRAFT_COST_ICON);
            this.addIcon(iconN, this.frameFor(cost.id), Math.round(CRAFT_COST_ICON * 0.92));

            const labN = new Node('Need');
            labN.layer = panel.layer;
            labN.setParent(cell);
            const labW = CRAFT_COST_CELL_W - CRAFT_COST_ICON - 8;
            labN.setPosition(CRAFT_COST_CELL_W * 0.5 - labW * 0.5 - 2, 0, 0);
            labN.addComponent(UITransform).setContentSize(labW, CRAFT_COST_ICON);
            const lab = labN.addComponent(Label);
            lab.string = `0/${cost.count}`;
            lab.horizontalAlign = Label.HorizontalAlign.LEFT;
            lab.verticalAlign = Label.VerticalAlign.CENTER;
            styleUiLabel(lab, {
                size: Math.round(18 * UI_SCALE),
                color: new Color(70, 48, 28, 255),
                outline: false,
            });
            costLabs.push(lab);
        }

        const btn = new Node('CraftBtn');
        btn.layer = panel.layer;
        btn.setParent(root);
        btn.setPosition(btnX, 0, 0);
        btn.addComponent(UITransform).setContentSize(CRAFT_BTN_W, CRAFT_BTN_H);
        let btnSp: Sprite | null = null;
        let btnOp: UIOpacity | null = null;
        if (this._frames.craftBtn) {
            btnSp = btn.addComponent(Sprite);
            btnSp.sizeMode = Sprite.SizeMode.CUSTOM;
            btnSp.trim = false;
            btnSp.spriteFrame = this._frames.craftBtn;
            btnOp = btn.addComponent(UIOpacity);
            btnOp.opacity = 255;
        } else {
            const g = btn.addComponent(Graphics);
            this.paintCraftBtnFallback(g, true);
        }

        const btnLabN = new Node('Label');
        btnLabN.layer = panel.layer;
        btnLabN.setParent(btn);
        btnLabN.addComponent(UITransform).setContentSize(CRAFT_BTN_W, CRAFT_BTN_H);
        const craftLab = btnLabN.addComponent(Label);
        craftLab.string = '制作';
        craftLab.horizontalAlign = Label.HorizontalAlign.CENTER;
        craftLab.verticalAlign = Label.VerticalAlign.CENTER;
        styleUiLabel(craftLab, {
            size: Math.round(24 * UI_SCALE),
            color: new Color(255, 244, 214, 255),
            outline: true,
        });

        // Progress stretches from after material costs to just before the ad chip.
        const progressRoot = new Node('Progress');
        progressRoot.layer = panel.layer;
        progressRoot.setParent(root);
        progressRoot.setPosition(barX, 0, 0);
        progressRoot.addComponent(UITransform).setContentSize(barW, CRAFT_BAR_H);
        progressRoot.active = false;
        const barGfx = progressRoot.addComponent(Graphics);
        this.paintCraftProgress(barGfx, barW, 0);

        const barLabN = new Node('BarLabel');
        barLabN.layer = panel.layer;
        barLabN.setParent(progressRoot);
        barLabN.addComponent(UITransform).setContentSize(barW, CRAFT_BAR_H);
        const barLab = barLabN.addComponent(Label);
        barLab.string = '';
        barLab.horizontalAlign = Label.HorizontalAlign.CENTER;
        barLab.verticalAlign = Label.VerticalAlign.CENTER;
        styleUiLabel(barLab, {
            size: Math.round(18 * UI_SCALE),
            color: new Color(255, 244, 214, 255),
            outline: true,
        });

        const adBtn = new Node('AdBtn');
        adBtn.layer = panel.layer;
        adBtn.setParent(root);
        adBtn.setPosition(adX, 0, 0);
        adBtn.addComponent(UITransform).setContentSize(CRAFT_AD_SZ, CRAFT_AD_SZ);
        adBtn.active = false;
        let adOp: UIOpacity | null = null;
        if (this._frames.adVideo) {
            const sp = adBtn.addComponent(Sprite);
            sp.sizeMode = Sprite.SizeMode.CUSTOM;
            sp.trim = false;
            sp.spriteFrame = this._frames.adVideo;
            adOp = adBtn.addComponent(UIOpacity);
            adOp.opacity = 255;
        } else {
            const g = adBtn.addComponent(Graphics);
            const half = CRAFT_AD_SZ * 0.5;
            g.fillColor = new Color(186, 110, 36, 255);
            g.roundRect(-half, -half, CRAFT_AD_SZ, CRAFT_AD_SZ, Math.round(10 * UI_SCALE));
            g.fill();
        }

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
            barW,
            adBtn,
            adOp,
        };
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

    /** Fallback if AI craftBtn frame failed to load. */
    private paintCraftBtnFallback(g: Graphics, can: boolean) {
        g.clear();
        const bw = CRAFT_BTN_W * 0.5;
        const bh = CRAFT_BTN_H * 0.5;
        const fill = can ? new Color(120, 72, 32, 255) : new Color(110, 96, 78, 255);
        const inner = can ? new Color(186, 110, 36, 255) : new Color(150, 130, 100, 255);
        g.fillColor = fill;
        g.roundRect(-bw, -bh, CRAFT_BTN_W, CRAFT_BTN_H, Math.round(12 * UI_SCALE));
        g.fill();
        g.fillColor = inner;
        g.roundRect(-bw + 4, -bh + 4, CRAFT_BTN_W - 8, CRAFT_BTN_H - 8, Math.round(10 * UI_SCALE));
        g.fill();
        g.strokeColor = new Color(54, 30, 14, 255);
        g.lineWidth = Math.round(3 * UI_SCALE);
        g.roundRect(-bw, -bh, CRAFT_BTN_W, CRAFT_BTN_H, Math.round(12 * UI_SCALE));
        g.stroke();
    }

    private setCraftOpen(open: boolean) {
        this._craftOpen = open;
        if (open && this._bagOpen) this.setBagOpen(false);
        if (open && this._chestOpen) this.setChestOpen(false);
        InputBridge.uiBlocking = open || this._bagOpen || this._chestOpen;
        if (this._craftDimmer) this._craftDimmer.active = open;
        if (this._craftPanel) this._craftPanel.active = open;
        if (this._craftCloseBtn) this._craftCloseBtn.active = open;
        if (this._barBg) this._barBg.active = !open && !this._bagOpen && !this._chestOpen;
        if (this._bagBtn) this._bagBtn.active = !open && !this._bagOpen && !this._chestOpen;
        if (this._bar) this._bar.active = true;
        if (!open) return;
        this.syncFromFarm();
        this.refreshCraftRows();
        this.refreshHotbarIcons();
        this.refreshSelection();
        this.hideTip();
        this.orderLayers();
    }

    private bagCount(id: CraftItemId): number {
        return this._backpack.reduce((n, s) => n + (s?.id === id ? s.count : 0), 0);
    }

    private canAfford(recipe: CraftRecipe): boolean {
        return recipe.cost.every((c) => this.bagCount(c.id) >= c.count);
    }

    private consumeFromBag(id: CraftItemId, count: number): boolean {
        let left = count;
        for (let i = 0; i < this._backpack.length && left > 0; i++) {
            const s = this._backpack[i];
            if (!s || s.id !== id) continue;
            if (isHandLockedSlot(i) || s.id === 'hand') continue;
            const take = Math.min(left, s.count);
            s.count -= take;
            left -= take;
            if (s.count <= 0) this._backpack[i] = null;
        }
        this.ensureHandSlot();
        return left <= 0;
    }

    private refreshCraftRows() {
        for (const row of this._craftRows) {
            const job = this._craftJobs.get(row.recipe.id);
            const busy = !!job;
            const can = !busy && this.canAfford(row.recipe);
            row.recipe.cost.forEach((c, i) => {
                const lab = row.costLabs[i];
                if (!lab) return;
                const have = this.bagCount(c.id);
                lab.string = `${have}/${c.count}`;
                lab.color = have >= c.count ? new Color(50, 110, 45, 255) : new Color(150, 55, 40, 255);
            });

            row.craftBtn.active = !busy;
            row.progressRoot.active = busy;
            row.adBtn.active = busy;

            if (busy && job) {
                const t01 = 1 - Math.max(0, job.remain) / Math.max(0.001, job.total);
                this.paintCraftProgress(row.barGfx, row.barW, t01);
                row.barLab.string = `${Math.max(0, Math.ceil(job.remain))}秒`;
                if (row.adOp) row.adOp.opacity = this._craftAdWait ? 120 : 255;
            } else {
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
    }

    private tryCraftRecipe(recipe: CraftRecipe) {
        if (this._craftJobs.has(recipe.id)) return;
        if (!this.canAfford(recipe)) return;
        for (const c of recipe.cost) {
            if (!this.consumeFromBag(c.id, c.count)) {
                this.refreshCraftRows();
                return;
            }
        }
        const total = Math.max(1, recipe.craftSeconds);
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
        this._craftJobs.delete(recipeId);
        if (this._craftAdWait?.recipeId === recipeId) this._craftAdWait = null;
        this.mergeOrPlaceInBag({ id: job.out.id, count: job.out.count });
        this.syncFarmFromBag();
        this._quests?.noteCraft(recipeId, 1);
        this.refreshHotbarIcons();
        this.refreshInvIcons();
        this.refreshSelection();
        this.refreshCraftRows();
    }

    private requestCraftAdBoost(recipeId: string) {
        if (this._craftAdWait) return;
        if (!this._craftJobs.has(recipeId)) return;
        this._craftAdWait = { recipeId, left: CRAFT_AD_WATCH_SEC };
        this.refreshCraftRows();
    }

    private finishCraftAdBoost(recipeId: string) {
        const job = this._craftJobs.get(recipeId);
        if (!job) return;
        job.remain = 0;
        this.completeCraftJob(recipeId);
    }

    private hitCraftClose(uiX: number, uiY: number): boolean {
        if (!this._craftCloseBtn?.isValid || !this._craftCloseBtn.active || !this._craftPanel?.isValid) {
            return false;
        }
        const ui = this._craftCloseBtn.getComponent(UITransform);
        if (!ui) return false;
        const { x, y } = this.toDesignLocal(uiX, uiY);
        const bx = this._craftPanel.position.x + this._craftCloseBtn.position.x;
        const by = this._craftPanel.position.y + this._craftCloseBtn.position.y;
        if (Math.abs(x - bx) <= ui.contentSize.width * 0.5 && Math.abs(y - by) <= ui.contentSize.height * 0.5) {
            this.setCraftOpen(false);
            return true;
        }
        return false;
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

    /** Merge stack into backpack storage (prefer upper rows). */
    private mergeOrPlaceInBag(stack: InvStack) {
        const exist = this._backpack.findIndex((s) => s?.id === stack.id);
        if (exist >= 0 && this._backpack[exist]) {
            this._backpack[exist]!.count += stack.count;
            return;
        }
        let empty = -1;
        for (let i = 0; i < HOTBAR_BASE; i++) {
            if (!this._backpack[i]) {
                empty = i;
                break;
            }
        }
        if (empty < 0) empty = this._backpack.findIndex((s) => !s);
        if (empty >= 0) this._backpack[empty] = { id: stack.id, count: stack.count };
    }

    /** Push material/seed/crop counts from bag stacks back into FarmSystem. */
    private syncFarmFromBag() {
        if (!this.farm) return;
        const countOf = (id: InvItemId) =>
            this._backpack.reduce((n, s) => n + (s?.id === id ? s.count : 0), 0);
        this.farm.seeds = countOf('seeds');
        this.farm.crops = countOf('parsnip');
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
        const canvas = this.node;
        const tip = new Node('FarmToolTip');
        tip.layer = canvas.layer;
        tip.setParent(canvas);
        tip.addComponent(UITransform).setContentSize(Math.round(280 * UI_SCALE), Math.round(110 * UI_SCALE));
        tip.active = false;
        this._tip = tip;

        const gfxN = new Node('Bubble');
        gfxN.layer = canvas.layer;
        gfxN.setParent(tip);
        gfxN.addComponent(UITransform).setContentSize(Math.round(280 * UI_SCALE), Math.round(110 * UI_SCALE));
        this._tipGfx = gfxN.addComponent(Graphics);

        const titleN = new Node('Title');
        titleN.layer = canvas.layer;
        titleN.setParent(tip);
        titleN.setPosition(0, Math.round(26 * UI_SCALE), 0);
        titleN.addComponent(UITransform).setContentSize(Math.round(240 * UI_SCALE), Math.round(40 * UI_SCALE));
        const title = titleN.addComponent(Label);
        title.horizontalAlign = Label.HorizontalAlign.CENTER;
        title.verticalAlign = Label.VerticalAlign.CENTER;
        styleUiLabel(title, {
            size: Math.round(28 * UI_SCALE),
            color: new Color(40, 36, 30, 255),
            outline: false,
        });
        this._tipTitle = title;

        const descN = new Node('Desc');
        descN.layer = canvas.layer;
        descN.setParent(tip);
        descN.setPosition(0, Math.round(-18 * UI_SCALE), 0);
        descN.addComponent(UITransform).setContentSize(Math.round(260 * UI_SCALE), Math.round(56 * UI_SCALE));
        const desc = descN.addComponent(Label);
        desc.horizontalAlign = Label.HorizontalAlign.CENTER;
        desc.verticalAlign = Label.VerticalAlign.CENTER;
        desc.overflow = Label.Overflow.RESIZE_HEIGHT;
        styleUiLabel(desc, {
            size: Math.round(22 * UI_SCALE),
            color: new Color(70, 64, 54, 255),
            outline: false,
        });
        this._tipDesc = desc;
    }

    private showTip(item: InvItemId, slotLocalX: number) {
        if (!this._bar) return;
        const barPos = this._bar.position;
        const anchorX = barPos.x + slotLocalX;
        const tipY = barPos.y + SLOT * 0.5 + TIP_SLOT_GAP;
        this.placeTip(item, anchorX, tipY, true);
    }

    /** Tip above a backpack cell (anchor = top of cell in design space). */
    private showBagItemTip(item: InvItemId, anchorX: number, anchorTopY: number) {
        this.placeTip(item, anchorX, anchorTopY, true);
    }

    private placeTip(item: InvItemId, anchorX: number, anchorTopY: number, withTail: boolean) {
        if (!this._tip || !this._tipGfx || !this._tipTitle || !this._tipDesc) return;
        const info = ITEM_TIP[item];
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

        this.drawTipBubble(boxW, boxH, tail, tailX);

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

    private drawTipBubble(w: number, h: number, tail: number, tailX = 0) {
        const g = this._tipGfx!;
        g.clear();
        const x0 = -w * 0.5;
        const y0 = -h * 0.5;
        const r = Math.round(18 * UI_SCALE);
        const fill = new Color(253, 251, 245, 255);
        const stroke = new Color(36, 34, 30, 255);
        const tw = Math.round(13 * UI_SCALE);

        g.fillColor = fill;
        g.roundRect(x0, y0, w, h, r);
        g.fill();
        g.moveTo(tailX - tw, y0 + 1);
        g.lineTo(tailX, y0 - tail);
        g.lineTo(tailX + tw, y0 + 1);
        g.close();
        g.fill();

        g.strokeColor = stroke;
        g.lineWidth = Math.round(3 * UI_SCALE);
        g.roundRect(x0, y0, w, h, r);
        g.stroke();
        g.fillColor = fill;
        g.rect(tailX - tw + 1, y0 - Math.round(3 * UI_SCALE), (tw - 1) * 2, Math.round(8 * UI_SCALE));
        g.fill();
        g.strokeColor = stroke;
        g.moveTo(tailX - tw, y0);
        g.lineTo(tailX, y0 - tail);
        g.lineTo(tailX + tw, y0);
        g.stroke();
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
        const vis = view.getVisibleSize();
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
                    this.showBagItemTip(stack.id, cx, cy + CHEST_SLOT * 0.55);
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
        for (let i = 0; i < this._slots.length; i++) {
            const s = this._slots[i]!;
            const sx = barPos.x + s.root.position.x;
            const sy = barPos.y + s.root.position.y;
            if (Math.abs(x - sx) < SLOT * 0.5 && Math.abs(y - sy) < SLOT * 0.55) return i;
        }
        return -1;
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
                    this.showBagItemTip(stack.id, cx, cy + INV_SLOT * 0.55);
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
            if (item) {
                if (isFarmTool(item)) {
                    this.farm?.setTool(item);
                    this.refreshSelection();
                }
                this.showTip(item, this._slots[idx]!.root.position.x);
            } else {
                this.hideTip();
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
        if (isFarmTool(item)) {
            this.farm?.setTool(item);
            this.refreshSelection();
        }
        this.showTip(item, this._slots[idx]!.root.position.x);
    }

    // ── drag ──────────────────────────────────────────────

    private onTouchStart(e: EventTouch) {
        const loc = e.getUILocation();
        this.beginPtr(loc.x, loc.y);
    }

    private onTouchMove(e: EventTouch) {
        const loc = e.getUILocation();
        this.movePtr(loc.x, loc.y);
    }

    private onTouchEnd(e: EventTouch) {
        const loc = e.getUILocation();
        this.endPtr(loc.x, loc.y);
    }

    private onMouseDown(e: EventMouse) {
        if (e.getButton() !== EventMouse.BUTTON_LEFT) return;
        const loc = e.getUILocation();
        this.beginPtr(loc.x, loc.y);
    }

    private onMouseMove(e: EventMouse) {
        const loc = e.getUILocation();
        this.movePtr(loc.x, loc.y);
    }

    private onMouseUp(e: EventMouse) {
        if (e.getButton() !== EventMouse.BUTTON_LEFT) return;
        const loc = e.getUILocation();
        this.endPtr(loc.x, loc.y);
    }

    private beginPtr(uiX: number, uiY: number) {
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
            if (bag >= 0 && this._backpack[bag] && !isHandLockedSlot(bag) && this._backpack[bag]!.id !== 'hand') {
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
            if (hot > 0 && this._backpack[HOTBAR_BASE + hot]) {
                this._drag = {
                    index: HOTBAR_BASE + hot,
                    from: 'bag',
                    item: this._backpack[HOTBAR_BASE + hot]!.id,
                    active: false,
                    ox: uiX,
                    oy: uiY,
                };
            }
            return;
        }
        if (!this._bagOpen) return;
        const inv = this.hitInvSlot(uiX, uiY, false);
        if (inv >= 0 && this._backpack[inv] && !isHandLockedSlot(inv) && this._backpack[inv]!.id !== 'hand') {
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
        // Dock slot 0 (hand) cannot be dragged.
        if (hot > 0 && this._backpack[HOTBAR_BASE + hot]) {
            this._drag = {
                index: HOTBAR_BASE + hot,
                from: 'bag',
                item: this._backpack[HOTBAR_BASE + hot]!.id,
                active: false,
                ox: uiX,
                oy: uiY,
            };
        }
    }

    private movePtr(uiX: number, uiY: number) {
        if (!this._drag) return;
        const dx = uiX - this._drag.ox;
        const dy = uiY - this._drag.oy;
        if (!this._drag.active) {
            if (dx * dx + dy * dy < DRAG_THRESH * DRAG_THRESH) return;
            this._drag.active = true;
            this.hideTip();
            if (this._ghost && this._ghostSp) {
                const sf = this.frameFor(this._drag.item);
                this._ghostSp.spriteFrame = sf;
                this._ghost.active = !!sf;
            }
        }
        if (this._ghost?.active) {
            const { x, y } = this.toDesignLocal(uiX, uiY);
            this._ghost.setPosition(x, y, 0);
            // Keep ghost on top
            this._ghost.setSiblingIndex(this.node.children.length - 1);
        }
    }

    private endPtr(uiX: number, uiY: number) {
        // No drag started: still handle chest chrome taps here so close works
        // even if the joystick tap path is skipped.
        if (!this._drag) {
            if (this._chestOpen) {
                if (this.hitChestClose(uiX, uiY) || this.hitTakeAll(uiX, uiY)) {
                    this._suppressTap = true;
                }
            } else if (this._craftOpen) {
                if (
                    this.hitCraftClose(uiX, uiY) ||
                    this.hitCraftAd(uiX, uiY) ||
                    this.hitCraftRow(uiX, uiY)
                ) {
                    this._suppressTap = true;
                }
            } else if (this._bagOpen && this.hitCloseBtn(uiX, uiY)) {
                this.setBagOpen(false);
                this._suppressTap = true;
            }
            return;
        }
        const drag = this._drag;
        if (drag.active) {
            this._suppressTap = true;
            if (this._chestOpen) {
                this.endChestDrag(uiX, uiY, drag);
            } else {
                const hot = this.hitHotbarIndex(uiX, uiY);
                const inv = this.hitInvSlot(uiX, uiY, false);
                let dest = -1;
                if (hot > 0) dest = HOTBAR_BASE + hot; // never drop onto locked hand slot
                else if (inv >= 0 && !isHandLockedSlot(inv)) dest = inv;
                if (dest >= 0 && drag.from === 'bag' && !isHandLockedSlot(drag.index)) {
                    this.swapBag(drag.index, dest);
                    this.refreshHotbarIcons();
                    this.refreshInvIcons();
                    this.refreshSelection();
                    if (hot > 0) this.equipFromHotbar(hot);
                }
            }
        }
        this.cancelDrag();
    }

    private endChestDrag(
        uiX: number,
        uiY: number,
        drag: { index: number; from: 'bag' | 'chest'; item: InvItemId },
    ) {
        const chestDest = this.hitChestSlot(uiX, uiY, false);
        const bagDest = this.hitChestBagSlot(uiX, uiY, false);
        const hot = this.hitHotbarIndex(uiX, uiY);
        // Hand slot is immovable / non-replaceable.
        if (drag.from === 'bag' && (isHandLockedSlot(drag.index) || drag.item === 'hand')) {
            this.ensureHandSlot();
            return;
        }

        if (drag.from === 'chest') {
            if (chestDest >= 0) {
                const tmp = this._chest[drag.index];
                this._chest[drag.index] = this._chest[chestDest];
                this._chest[chestDest] = tmp;
            } else if ((bagDest >= 0 && !isHandLockedSlot(bagDest)) || hot > 0) {
                const dest = hot > 0 ? HOTBAR_BASE + hot : bagDest;
                const moved = this._chest[drag.index];
                this._chest[drag.index] = this._backpack[dest!] ?? null;
                this._backpack[dest!] = moved;
                this.ensureHandSlot();
                this.syncFarmFromBag();
                if (hot > 0) this.equipFromHotbar(hot);
            }
        } else {
            // from bag / hotbar
            if (chestDest >= 0) {
                const moved = this._backpack[drag.index];
                this._backpack[drag.index] = this._chest[chestDest];
                this._chest[chestDest] = moved;
                this.ensureHandSlot();
                this.syncFarmFromBag();
            } else if ((bagDest >= 0 && !isHandLockedSlot(bagDest)) || hot > 0) {
                const dest = hot > 0 ? HOTBAR_BASE + hot : bagDest;
                if (dest !== null && dest >= 0) {
                    this.swapBag(drag.index, dest);
                    if (hot > 0) this.equipFromHotbar(hot);
                }
            }
        }
        this.ensureHandSlot();
        this.refreshHotbarIcons();
        this.refreshInvIcons();
        this.refreshChestIcons();
        this.refreshSelection();
    }

    private cancelDrag() {
        this._drag = null;
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
            if (this.node.getComponent(GmPanel)?.isOpen) return;
            if (this._chestOpen) this.setChestOpen(false);
            else if (this._craftOpen) this.setCraftOpen(false);
            else if (this._bagOpen) this.setBagOpen(false);
        }
        if (e.keyCode === KeyCode.SPACE || e.keyCode === KeyCode.KEY_E) {
            if (this._chestOpen || this._craftOpen || this._bagOpen) return;
            if (this.node.getComponent(FishingMinigame)?.isOpen) return;
            this.farm?.tryAct();
        }
    }
}
