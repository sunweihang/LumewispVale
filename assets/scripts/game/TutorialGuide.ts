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
import { GameState } from './GameState';
import { InputBridge } from './InputBridge';
import { QUEST_FRAMES } from './QuestFrames';
import { QuestPanel } from './QuestPanel';
import { QuestSystem } from './QuestSystem';
import { RewardPopup } from './RewardPopup';
import { applyUiFont, loadUiFont, styleUiLabel } from './UiFont';

const { ccclass } = _decorator;

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
/** Only guide weeds this close to the player (world units). */
const GRASS_HINT_RANGE = 340;

type GuideStep = 'quest' | 'hand' | 'grass';

type HoleRect = { x: number; y: number; w: number; h: number };

/** Continuous idle quest cue: swap tool first, then click the world target. */
type IdleGuide = {
    hole: HoleRect;
    tip: string;
    /** Hotbar / quest dock / bag — keep arrow near UI, not playfield band. */
    uiDock: boolean;
    /** Arrow on hotbar only — no FarmActionHint caption (tool swap). */
    silent?: boolean;
};

const TOOL_LABEL: Record<string, string> = {
    hand: '手',
    hoe: '锄头',
    seeds: '种子',
    can: '水壶',
    rod: '鱼竿',
};

/**
 * Hollow spotlight tutorial after wake_farm dialogue:
 * 1) show quest tracker → 2) select hand → 3) pull a weed.
 *
 * Also: while a quest is active, keep guiding — wrong tool → arrow on hotbar,
 * then arrow on the objective (no dim mask, no tip caption under the arrow).
 */
@ccclass('TutorialGuide')
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
    private _rootOp: UIOpacity | null = null;

    private _open = false;
    private _idleOn = false;
    private _idleUiDock = false;
    private _idleSilent = false;
    private _idleTip = '';
    private _step: GuideStep = 'quest';
    private _inputReady = false;
    private _prevBlocking = false;
    private _grassTarget: Node | null = null;
    private _grassBase = 0;
    private _hole: HoleRect = { x: 0, y: 0, w: 120, h: 120 };

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
            if (this._step === 'quest') return '这是当前任务 · 点击继续';
            if (this._step === 'hand') return '点击下方「手」以选中';
            return '走近杂草，点击镂空处拔除';
        }
        if (!this.quests?.activeQuest) return null;
        if (this.node.getComponent(DialoguePanel)?.isOpen) return null;
        if (this.node.getComponent(RewardPopup)?.isOpen) return null;
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

    /** From GameBootstrap stick.onTap — consume while spotlight open. */
    handleTap(uiX: number, uiY: number): boolean {
        if (!this._open || !this._inputReady) return this._open;
        const local = this.uiToCanvasLocal(uiX, uiY);
        const inHole = this.hitHole(local.x, local.y);

        if (this._step === 'quest') {
            // Any tap advances once the tracker is visible.
            this.gotoStep('hand');
            return true;
        }

        if (this._step === 'hand') {
            if (!inHole) return true;
            this.farm?.setTool('hand');
            this.gotoStep('grass');
            return true;
        }

        // grass — only the hollow accepts the dig tap; elsewhere stays blocked.
        if (inHole) {
            console.log(
                `[TutorialGuide] grass-step tap IN hole → tryActAtUi ` +
                    `hole=(${this._hole.x.toFixed(0)},${this._hole.y.toFixed(0)}) ` +
                    `${this._hole.w.toFixed(0)}x${this._hole.h.toFixed(0)} ` +
                    `target=${this._grassTarget?.name ?? 'null'}`,
            );
            this.farm?.tryActAtUi(uiX, uiY);
            this.checkGrassDone();
        } else {
            console.log(
                `[TutorialGuide] grass-step tap OUTSIDE hole (blocked, no FarmTap) ` +
                    `local=(${local.x.toFixed(0)},${local.y.toFixed(0)}) ` +
                    `hole=(${this._hole.x.toFixed(0)},${this._hole.y.toFixed(0)}) ` +
                    `${this._hole.w.toFixed(0)}x${this._hole.h.toFixed(0)}`,
            );
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
    }

    private canShowIdleArrow(): boolean {
        if (this._open) return false;
        if (!this.quests?.activeQuest) return false;
        // Concrete modals only — do NOT trust InputBridge.uiBlocking (nested
        // reward→dialogue restore can leave it stuck true and kill all arrows).
        if (this.node.getComponent(DialoguePanel)?.isOpen) return false;
        if (this.node.getComponent(RewardPopup)?.isOpen) return false;
        if (this.node.getComponent(QuestPanel)?.isOpen) return false;
        if (this.node.getComponent(FarmHUD)?.isModalOpen) return false;
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
        if (!this._open && this._root) this._root.active = false;
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
        if (this._tipLab) this._tipLab.string = guide.tip;
    }

    private toolSwapTip(tool: string): string {
        const name = TOOL_LABEL[tool] ?? tool;
        return `道具不对 · 点击下方「${name}」换上`;
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

    private worldOrQuest(hole: HoleRect | null, tip: string, fallbackTip?: string): IdleGuide | null {
        if (hole) return { hole, tip, uiDock: false };
        const q = this.questHole();
        if (!q) return null;
        return { hole: q, tip: fallbackTip ?? tip, uiDock: true };
    }

    /**
     * Resolve idle finger + tip for the live quest.
     * Tool-gated steps always prefer the hotbar until the right tool is selected.
     */
    private resolveIdleGuide(): IdleGuide | null {
        const quests = this.quests;
        if (!quests?.activeQuest) return null;
        if (quests.isAwaitingClaim) {
            const hole = this.questHole();
            if (!hole) return null;
            return { hole, tip: '点击任务栏领取奖励', uiDock: true };
        }

        const action = quests.activeGotoAction();
        const tool = this.farm?.tool;

        const needTool = (
            t: string,
            slot: string,
            clickTip: string,
            world: () => HoleRect | null,
        ): IdleGuide | null => {
            if (tool !== t) return this.toolSwapGuide(t, slot);
            return this.worldOrQuest(world(), clickTip);
        };

        switch (action) {
            case GotoAction.SelectHand:
                // Harvest (1006) — bare hand on mature crop, not yard weeds.
                return needTool('hand', 'hand', '点击成熟作物收获', () =>
                    this.playfieldPosHole(this.farm?.hintPlotPos('harvest') ?? null),
                );
            case GotoAction.HintGrass:
                return needTool('hand', 'hand', '点击目标拔除杂草', () =>
                    this.playfieldWorldHole(this.pickHintGrass()),
                );
            case GotoAction.SelectHoe:
                return needTool('hoe', 'hoe', '点击目标开垦田地', () =>
                    this.playfieldPosHole(this.farm?.hintPlotPos('soil') ?? null),
                );
            case GotoAction.SelectSeeds:
                return needTool('seeds', 'seeds', '点击翻好地块播种', () =>
                    this.playfieldPosHole(this.farm?.hintPlotPos('tilled') ?? null),
                );
            case GotoAction.SelectCan:
                return needTool('can', 'can', '点击作物浇水', () =>
                    this.playfieldPosHole(this.farm?.hintPlotPos('water') ?? null),
                );
            case GotoAction.SelectRod:
                return needTool('rod', 'rod', '走到湖边，点击钓鱼', () =>
                    this.playfieldPosHole(FarmWorldLayout.fishingHintWorld()),
                );
            case GotoAction.HintFarm: {
                const soil = this.playfieldPosHole(this.farm?.hintPlotPos('soil') ?? null);
                if (soil) {
                    if (tool !== 'hoe') return this.toolSwapGuide('hoe', 'hoe');
                    return { hole: soil, tip: '点击目标开垦田地', uiDock: false };
                }
                const tilled = this.playfieldPosHole(this.farm?.hintPlotPos('tilled') ?? null);
                if (tilled) {
                    if (tool !== 'seeds') return this.toolSwapGuide('seeds', 'seeds');
                    return { hole: tilled, tip: '点击翻好地块播种', uiDock: false };
                }
                return this.worldOrQuest(null, '前往农田地块操作');
            }
            case GotoAction.HintFish:
                return needTool('rod', 'rod', '走到湖边，点击钓鱼', () =>
                    this.playfieldPosHole(FarmWorldLayout.fishingHintWorld()),
                );
            case GotoAction.HintCraft:
            case GotoAction.OpenCraft:
                return this.worldOrQuest(
                    this.playfieldWorldHole(this.farm?.findWorldNode('prop_craftbench') ?? null),
                    '点击工作台打开合成',
                );
            case GotoAction.OpenBag: {
                const bag = this.bagHole() ?? this.questHole();
                if (!bag) return null;
                return { hole: bag, tip: '点击打开背包', uiDock: true };
            }
            case GotoAction.HintMeteor:
                return this.worldOrQuest(
                    this.playfieldWorldHole(this.farm?.findWorldNode('meteor') ?? null),
                    '走近紫晶陨石查看异象',
                );
            case GotoAction.HintTownGate:
                return this.worldOrQuest(
                    this.playfieldWorldHole(this.farm?.findWorldNode('portal_town') ?? null),
                    '点击路牌前往小镇',
                );
            case GotoAction.HintMayor:
                return this.worldOrQuest(
                    this.playfieldWorldHole(this.farm?.findWorldNode('bld_mayor', 'mayor') ?? null),
                    '点击镇长府拜访',
                );
            default: {
                const id = quests.activeQuest.id;
                if (id === 1011) {
                    return this.worldOrQuest(
                        this.playfieldWorldHole(
                            this.farm?.findWorldNode(
                                'bld_seedshop',
                                'bld_general',
                                'seedshop',
                                'general',
                            ) ?? null,
                        ),
                        '走进商店，点击购买商品',
                    );
                }
                if (id === 1012) {
                    return this.worldOrQuest(
                        this.playfieldWorldHole(
                            this.farm?.findWorldNode('bld_police', 'bld_post', 'police', 'post') ??
                                null,
                        ),
                        '点击警局或邮局接任务',
                    );
                }
                if (id === 1013) {
                    return this.worldOrQuest(
                        this.playfieldWorldHole(
                            this.farm?.findWorldNode('bld_carpenter', 'carpenter') ?? null,
                        ),
                        '点击木工坊了解工匠',
                    );
                }
                if (id === 1014) {
                    return this.worldOrQuest(
                        this.playfieldWorldHole(
                            this.farm?.findWorldNode('bld_community', 'community') ?? null,
                        ),
                        '点击社区中心查看工程',
                    );
                }
                const q = this.questHole();
                if (!q) return null;
                return { hole: q, tip: '查看当前任务目标', uiDock: true };
            }
        }
    }

    private gotoStep(step: GuideStep) {
        this._step = step;
        this.applyStep();
    }

    private applyStep() {
        if (this._step === 'quest' || this._step === 'hand') {
            InputBridge.uiBlocking = true;
            InputBridge.clear();
        } else {
            // Let the player walk up to weeds; stick still works.
            InputBridge.uiBlocking = false;
        }

        if (this._step === 'grass') {
            this._grassTarget = this.pickHintGrass() ?? this.farm?.nearestGrass() ?? null;
            const q = this.quests?.activeQuest;
            this._grassBase = q ? this.quests!.progressOf(q).current : 0;
        }

        if (this._tipLab) {
            if (this._step === 'quest') this._tipLab.string = '这是当前任务 · 点击继续';
            else if (this._step === 'hand') this._tipLab.string = '点击下方「手」以选中';
            else this._tipLab.string = '走近杂草，点击镂空处拔除';
        }
        this.refreshHole();
        this.paint();
        this.layoutChrome(true);
    }

    private checkGrassDone() {
        if (this._step !== 'grass' || !this._open) return;
        const q = this.quests?.activeQuest;
        if (q && this.quests!.progressOf(q).current > this._grassBase) {
            this.finish();
            return;
        }
        if (this._grassTarget && !this._grassTarget.isValid) {
            this.finish();
            return;
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

    private worldNodeHole(node: Node | null): HoleRect | null {
        if (!node?.isValid || !this.farm?.world?.isValid) return null;
        const world = this.farm.world;
        const s = Math.max(0.0001, world.scale.x);
        const ui = node.getComponent(UITransform);
        const ww = (ui?.contentSize.width ?? 64) * s;
        const hh = (ui?.contentSize.height ?? 64) * s;
        // Feet-anchored decor: hole centers on the sprite body.
        const ax = ui?.anchorX ?? 0.5;
        const ay = ui?.anchorY ?? 0;
        const cx = world.position.x + (node.position.x + (0.5 - ax) * (ui?.contentSize.width ?? 64)) * s;
        const cy =
            world.position.y + (node.position.y + (0.5 - ay) * (ui?.contentSize.height ?? 64)) * s;
        return {
            x: cx,
            y: cy,
            w: Math.max(72, ww + 20),
            h: Math.max(72, hh + 20),
        };
    }

    private worldPosHole(pos: { x: number; y: number } | null): HoleRect | null {
        if (!pos || !this.farm?.world?.isValid) return null;
        const world = this.farm.world;
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

        // Big chevron sits centered above the target and bobs into it.
        // Bob AFTER clamp — claim / dock targets pin to the playfield floor and
        // would otherwise eat the sine offset every frame.
        let fx = this._hole.x;
        // Tool-swap: sit tight above the slot so the tip clearly reads as "this tool".
        let fy = this._idleSilent ? top + 40 : top + 56;
        const band = this.playfieldBand();
        // Quest / hand / claim / tool-swap sit in the bottom dock — don't force playfield band.
        const uiDock =
            (this._open && (this._step === 'quest' || this._step === 'hand')) ||
            (!this._open && this._idleOn && this._idleUiDock);
        if (uiDock) {
            fx = Math.max(-halfW + 40, Math.min(halfW - 40, fx));
            fy = Math.max(-halfH + 80, Math.min(halfH - 50, fy));
        } else {
            fx = Math.max(band.x0 + 40, Math.min(band.x1 - 40, fx));
            fy = Math.max(band.y0 + 50, Math.min(band.y1 - 20, fy));
        }
        const bob = Math.sin(Date.now() * 0.01) * 12;
        finger.setPosition(fx, fy + bob, 0);

        if (withTip && tip) {
            const tipHalfW = TIP_W * 0.5;
            const tipHalfH = TIP_H * 0.5;
            const minX = -halfW + SCREEN_INSET + tipHalfW;
            const maxX = halfW - SCREEN_INSET - tipHalfW;
            const minY = -halfH + SCREEN_INSET + tipHalfH;
            const maxY = halfH - SCREEN_INSET - tipHalfH;

            // Sit the banner above the chevron stem (not through its middle).
            const arrowTop = fy + ARROW_EXTENT_UP + 12;
            let tipY = arrowTop + tipHalfH + TIP_ARROW_GAP;
            if (tipY > maxY) tipY = bot - tipHalfH - TIP_ARROW_GAP;
            tipY = Math.max(minY, Math.min(maxY, tipY));

            // Clamp X — left dock targets (quest / hand) must not shove the tip off-frame.
            const tipX = Math.max(minX, Math.min(maxX, this._hole.x));
            tip.setPosition(tipX, tipY, 0);
            // Tip after Finger so text never sits under the arrow.
            tip.setSiblingIndex(Math.max(finger.getSiblingIndex() + 1, tip.getSiblingIndex()));
        }
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

    /** World node → hole only if the sprite sits in the playfield (never on the clock). */
    private playfieldWorldHole(node: Node | null): HoleRect | null {
        const hole = this.worldNodeHole(node);
        if (!hole || !this.isInPlayfield(hole)) return null;
        return hole;
    }

    private playfieldPosHole(pos: { x: number; y: number } | null): HoleRect | null {
        const hole = this.worldPosHole(pos);
        if (!hole || !this.isInPlayfield(hole)) return null;
        return hole;
    }

    /**
     * Nearest weed/bush beside the player that is actually in the playfield.
     * Far / off-screen / under the clock board → ignore (caller falls back to quest chip).
     */
    private pickHintGrass(): Node | null {
        const farm = this.farm;
        if (!farm?.player) return null;
        const list = farm.listGrass();
        if (!list.length) return null;
        const px = farm.player.position.x;
        const py = farm.player.position.y;
        let best: Node | null = null;
        let bestSq = Number.POSITIVE_INFINITY;
        const rangeSq = GRASS_HINT_RANGE * GRASS_HINT_RANGE;
        for (let i = 0; i < list.length; i++) {
            const n = list[i]!;
            const dx = n.position.x - px;
            const dy = n.position.y - py;
            const dSq = dx * dx + dy * dy;
            if (dSq > rangeSq || dSq >= bestSq) continue;
            const hole = this.worldNodeHole(n);
            if (!hole || !this.isInPlayfield(hole)) continue;
            bestSq = dSq;
            best = n;
        }
        return best;
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
