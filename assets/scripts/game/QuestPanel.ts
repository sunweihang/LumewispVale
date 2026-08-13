import {
    _decorator,
    assetManager,
    Color,
    Component,
    EventMouse,
    EventTouch,
    Graphics,
    Input,
    Label,
    Mask,
    Node,
    Prefab,
    Sprite,
    SpriteFrame,
    UIOpacity,
    UITransform,
    input,
    instantiate,
    view,
} from 'cc';
import { CQuest } from '../cfg/schema';
import type { BoardCommissionSnapshot } from './GameState';
import { InputBridge } from './InputBridge';
import { itemName } from './ItemCatalog';
import { QUEST_FRAMES, QUEST_LAYOUT, QUEST_PANEL_PREFAB_UUID } from './QuestFrames';
import { QUEST_TRACKER_LAYOUT as TL, QUEST_TRACKER_PREFAB_UUID } from './QuestTrackerFrames';
import { QuestSystem } from './QuestSystem';
import { RewardPopup } from './RewardPopup';
import { playUiClick } from './UiAudio';
import {
    UI_CREAM,
    UI_GOLD as GOLD,
    UI_INK as INK,
    UI_INK_MUTE as INK_MUTE,
    applyWoodButton,
    applyWoodPanel,
    drawWoodButton,
    loadPanelCloseFrame,
    paintPanelCloseVisual,
} from './UiChrome';
import { applyUiFont, loadUiFont, styleUiLabel } from './UiFont';
import { formatGoldAmount } from './UiGoldAmount';

const { ccclass, property } = _decorator;

type FrameKey = keyof typeof QUEST_FRAMES;
const L = QUEST_LAYOUT;

/** Floor = FarmInfoBoard timeLab (30). Nothing in this panel goes smaller. */
const FONT_BODY = 30;
const FONT_TITLE = 36;
const FONT_DESC = 26;

const INK_DONE = new Color(48, 86, 40, 255);

/**
 * Quest journal — layout from QuestPanel.prefab; paints wood/parchment into Chrome once
 * per open. Dynamic list rows stay code-built; tracker dock from QuestTracker.prefab.
 */
@ccclass('QuestPanel')
export class QuestPanel extends Component {
    quests: QuestSystem | null = null;

    @property(Node)
    panelRoot: Node | null = null;

    @property(Node)
    dimmer: Node | null = null;

    @property(Label)
    titleLab: Label | null = null;

    @property(Node)
    heroNode: Node | null = null;

    @property(Sprite)
    heroIcon: Sprite | null = null;

    @property(Label)
    heroTitleLab: Label | null = null;

    @property(Label)
    heroDescLab: Label | null = null;

    @property(Label)
    heroProgLab: Label | null = null;

    @property(Node)
    heroBarNode: Node | null = null;

    @property(Label)
    sectionLab: Label | null = null;

    @property(Node)
    listHost: Node | null = null;

    @property(Node)
    btnClose: Node | null = null;

    /** Legacy footer button — hidden; actions live on each active row. */
    @property(Node)
    btnGoto: Node | null = null;

    private _tracker: Node | null = null;
    private _trackerDock: Node | null = null;
    private _trackerTitle: Label | null = null;
    private _trackerProg: Label | null = null;
    private _trackerCount: Label | null = null;
    private _trackerChromePainted = false;
    /** Journal tabs — 主线 / 委托. */
    private _tab: 'main' | 'board' = 'main';
    private _mainTab: Node | null = null;
    private _boardTab: Node | null = null;
    private _mainTabLab: Label | null = null;
    private _boardTabLab: Label | null = null;
    private _prefabRoot: Node | null = null;
    private _listContent: Node | null = null;
    private _listScroll = 0;
    private _listContentH = 0;
    /** Overlay thumb — does not reserve row width. */
    private _scrollBar: Node | null = null;
    private _scrollThumb: Node | null = null;
    private _scrollBarOp: UIOpacity | null = null;
    private _scrollBarLit = false;
    private static readonly SCROLL_PAD = 6;
    private static readonly SCROLL_THUMB_MIN = 48;
    private static readonly SCROLL_THUMB_MAX = 90;
    private static readonly SCROLL_FADE_DELAY = 0.85;
    /** Claim / 交付 pill on the objective row. */
    private static readonly PROG_BADGE_W = 84;
    private static readonly PROG_BADGE_H = 44;
    /** 详情 / 收起 on the description row. */
    private static readonly DESC_BADGE_W = 72;
    private static readonly DESC_BADGE_H = 40;
    /** Collapsed preview length (CJK chars). */
    private static readonly DESC_PREVIEW_CHARS = 10;
    private static readonly ROW_PAD_X = 28;
    /** 'thumb' = drag knob; 'list' = finger-drag the rows; null = idle. */
    private _scrollDrag: 'thumb' | 'list' | null = null;
    private _scrollMoved = false;
    private _scrollPtrDown = false;
    /** Swallow the click that follows a real scroll drag (mouse often has no onTap). */
    private _eatNextTap = false;
    private _scrollLastY = 0;
    private _scrollListening = false;
    /** Claimable-row progress badges (tap to 领奖). */
    private _rowActions = new Map<number, Node>();
    /** Board commission「交付」badges. */
    private _boardActions = new Map<string, Node>();
    /** Expanded full-description keys: `m:{questId}` / `b:{boardId}`. */
    private _descExpanded = new Set<string>();
    /** 详情 / 收起 hit targets. */
    private _descButtons = new Map<string, Node>();

    private _open = false;
    private _prevBlocking = false;
    private _frames = new Map<FrameKey, SpriteFrame>();
    private _closeFrame: SpriteFrame | null = null;
    private _framesReady = false;
    private _mounted = false;

    onLoad() {
        this.loadFrames(() => {
            this.buildTracker();
            this.refreshTracker();
        });
        if (this.panelRoot) {
            this._mounted = true;
            this._prefabRoot = this.node;
            this.node.active = false;
            this.paintChrome();
        }
        loadUiFont().then((font) => {
            if (!font) return;
            for (const lab of [
                this._trackerTitle,
                this._trackerProg,
                this._trackerCount,
                this.titleLab,
            ]) {
                if (lab) applyUiFont(lab);
            }
        });
    }

    onDestroy() {
        if (this._open) InputBridge.uiBlocking = this._prevBlocking;
        this._trackerDock?.destroy();
        if (this._prefabRoot && this._prefabRoot !== this.node) {
            this._prefabRoot.destroy();
        }
    }

    ensureMounted(done?: () => void) {
        if (this._mounted || this.panelRoot) {
            this._mounted = true;
            done?.();
            return;
        }
        assetManager.loadAny({ uuid: QUEST_PANEL_PREFAB_UUID }, (err, asset) => {
            if (err || !asset) {
                console.warn('[QuestPanel] prefab missing', err);
                done?.();
                return;
            }
            const canvas = this.node;
            const old = canvas.getChildByName('QuestPanel');
            if (old) old.destroy();
            const inst = instantiate(asset as Prefab);
            inst.name = 'QuestPanel';
            inst.layer = canvas.layer;
            inst.setParent(canvas);
            inst.setSiblingIndex(canvas.children.length - 1);
            inst.active = false;
            this._prefabRoot = inst;
            this.resolveRefs(inst);
            this._mounted = true;
            this.paintChrome();
            done?.();
        });
    }

    bind(quests: QuestSystem) {
        this.quests = quests;
        quests.onChange(() => {
            this.refreshTracker();
            this.quests?.hud?.syncQuestEntryVisible();
            if (this._open) this.refreshPanel();
        });
        this.refreshTracker();
        this.quests?.hud?.syncQuestEntryVisible();
    }

    /** After first 露穗 talk marks guide_wake_yard — unlock quest + bag badges. */
    revealQuestHud() {
        this.refreshTracker();
        this.quests?.hud?.syncQuestEntryVisible();
        this.quests?.hud?.syncBagEntryVisible();
        if (this._open) this.refreshPanel();
    }

    get isOpen(): boolean {
        return this._open;
    }

    toggle() {
        this.setOpen(!this._open);
    }

    setOpen(open: boolean) {
        if (open === this._open) {
            if (open) this.refreshPanel();
            return;
        }
        const apply = () => {
            this._open = open;
            if (open) {
                this._prevBlocking = InputBridge.uiBlocking;
                InputBridge.uiBlocking = true;
                InputBridge.clear();
                if (this._prefabRoot) {
                    this._prefabRoot.active = true;
                    // Above FarmActionHint / info-board zoom — otherwise they poke through.
                    this._prefabRoot.setSiblingIndex(this.node.children.length - 1);
                }
                this.setHudVisible(false);
                // Graphics must paint while active — inactive bake often drops the frame.
                this.paintChrome();
                this.bindTabs();
                this.ensureListViewport(true);
                this.refreshPanel();
                this.quests?.hud?.syncQuestEntryVisible();
            } else {
                InputBridge.uiBlocking = this._prevBlocking;
                if (this._prefabRoot) this._prefabRoot.active = false;
                this.setHudVisible(true);
                this.refreshTracker();
                this.quests?.hud?.syncQuestEntryVisible();
            }
        };
        if (open && !this._mounted) {
            this.ensureMounted(() => {
                if (this._framesReady) apply();
                else this.loadFrames(apply);
            });
            return;
        }
        if (open && !this._framesReady) {
            this.loadFrames(apply);
            return;
        }
        apply();
    }

    onEnable() {
        this.bindScrollInput(true);
    }

    onDisable() {
        this.bindScrollInput(false);
        this.clearScrollPtr();
    }

    handleTap(uiX: number, uiY: number): boolean {
        if (!this._open) {
            // Claim chip only — journal opens from the bag-side quest icon.
            if (this.hitHud(uiX, uiY) && this.quests?.isAwaitingClaim) {
                playUiClick();
                this.openRewardPopup();
                return true;
            }
            return false;
        }
        // Real drag already scrolled — don't treat finger-up as a button tap.
        if (this._eatNextTap) {
            this._eatNextTap = false;
            this.clearScrollPtr();
            return true;
        }
        this.clearScrollPtr();
        const local = this.uiToCanvasLocal(uiX, uiY);
        if (this.hitNodeWorld(this.btnClose, local.x, local.y)) {
            playUiClick();
            this.setOpen(false);
            return true;
        }
        if (this.handleTabTap(local.x, local.y)) {
            playUiClick();
            return true;
        }
        if (this.handleDescDetailTap(local.x, local.y)) {
            playUiClick();
            return true;
        }
        if (this.handleRowActionTap(local.x, local.y)) {
            playUiClick();
            return true;
        }
        if (this.handleBoardActionTap(local.x, local.y)) {
            playUiClick();
            return true;
        }
        if (this.handleScrollBarTap(local.x, local.y)) return true;
        return true;
    }

    private bindScrollInput(on: boolean) {
        if (on) {
            if (this._scrollListening) return;
            input.on(Input.EventType.TOUCH_START, this.onScrollTouchStart, this);
            input.on(Input.EventType.TOUCH_MOVE, this.onScrollTouchMove, this);
            input.on(Input.EventType.TOUCH_END, this.onScrollTouchEnd, this);
            input.on(Input.EventType.TOUCH_CANCEL, this.onScrollTouchEnd, this);
            input.on(Input.EventType.MOUSE_DOWN, this.onScrollMouseDown, this);
            input.on(Input.EventType.MOUSE_MOVE, this.onScrollMouseMove, this);
            input.on(Input.EventType.MOUSE_UP, this.onScrollMouseUp, this);
            this._scrollListening = true;
        } else if (this._scrollListening) {
            input.off(Input.EventType.TOUCH_START, this.onScrollTouchStart, this);
            input.off(Input.EventType.TOUCH_MOVE, this.onScrollTouchMove, this);
            input.off(Input.EventType.TOUCH_END, this.onScrollTouchEnd, this);
            input.off(Input.EventType.TOUCH_CANCEL, this.onScrollTouchEnd, this);
            input.off(Input.EventType.MOUSE_DOWN, this.onScrollMouseDown, this);
            input.off(Input.EventType.MOUSE_MOVE, this.onScrollMouseMove, this);
            input.off(Input.EventType.MOUSE_UP, this.onScrollMouseUp, this);
            this._scrollListening = false;
        }
    }

    private onScrollTouchStart(e: EventTouch) {
        const loc = e.getUILocation();
        this.beginScrollPtr(loc.x, loc.y);
    }

    private onScrollTouchMove(e: EventTouch) {
        const loc = e.getUILocation();
        this.moveScrollPtr(loc.x, loc.y);
    }

    private onScrollTouchEnd() {
        this.endScrollPtr();
    }

    private onScrollMouseDown(e: EventMouse) {
        if (e.getButton() !== EventMouse.BUTTON_LEFT) return;
        const loc = e.getUILocation();
        this.beginScrollPtr(loc.x, loc.y);
    }

    private onScrollMouseMove(e: EventMouse) {
        // Mouse move fires while idle — only drag after a real press on this panel.
        if (!this._scrollPtrDown) return;
        const loc = e.getUILocation();
        this.moveScrollPtr(loc.x, loc.y);
    }

    private onScrollMouseUp(_e: EventMouse) {
        // Clear on any mouse-up while dragging — some hosts omit BUTTON_LEFT on up.
        if (!this._scrollPtrDown) return;
        this.endScrollPtr();
    }

    private beginScrollPtr(uiX: number, uiY: number) {
        if (!this._open || !this.panelRoot) return;
        const local = this.uiToCanvasLocal(uiX, uiY);
        const maxScroll = Math.max(0, this._listContentH - this.listH());
        if (maxScroll <= 0) return;

        // Only grab the overlay thumb while it's visible — otherwise rows keep full hit area.
        if (
            (this._scrollBarOp?.opacity ?? 0) >= 40 &&
            this.hitNodeWorld(this._scrollBar, local.x, local.y)
        ) {
            this.scrollToTrackY(local.y);
            this._scrollPtrDown = true;
            this._scrollDrag = 'thumb';
            this._scrollMoved = false;
            this._eatNextTap = false;
            this._scrollLastY = local.y;
            this.flashScrollBar();
            return;
        }
        if (this.hitNodeWorld(this.listHost, local.x, local.y)) {
            this._scrollPtrDown = true;
            this._scrollDrag = 'list';
            this._scrollMoved = false;
            this._eatNextTap = false;
            this._scrollLastY = local.y;
        }
    }

    private moveScrollPtr(uiX: number, uiY: number) {
        if (!this._open || !this._scrollPtrDown || !this._scrollDrag || !this.panelRoot) return;
        const local = this.uiToCanvasLocal(uiX, uiY);
        const dy = local.y - this._scrollLastY;
        this._scrollLastY = local.y;
        if (Math.abs(dy) < 0.5) return;
        this._scrollMoved = true;

        const maxScroll = Math.max(0, this._listContentH - this.listH());
        if (maxScroll <= 0) return;

        if (this._scrollDrag === 'thumb') {
            // Finger down → thumb down → more negative scroll.
            const trackH = this.listH() - QuestPanel.SCROLL_PAD * 2;
            const thumbH = this.scrollThumbH(trackH);
            const travel = Math.max(1, trackH - thumbH);
            const dt = -dy / travel;
            const t = Math.max(0, Math.min(1, -this._listScroll / maxScroll + dt));
            this._listScroll = -t * maxScroll;
            this.applyListScroll();
            return;
        }

        // List drag: finger up pulls content up → reveal lower rows (more negative scroll).
        this._listScroll -= dy;
        this.applyListScroll();
    }

    private endScrollPtr() {
        if (!this._scrollPtrDown) return;
        if (this._scrollMoved) this._eatNextTap = true;
        this.clearScrollPtr();
    }

    private clearScrollPtr() {
        this._scrollPtrDown = false;
        this._scrollDrag = null;
        this._scrollMoved = false;
    }

    /** Jump scroll so the thumb centers on the pointer's track Y. */
    private scrollToTrackY(canvasLy: number) {
        if (!this._scrollBar || !this.panelRoot) return;
        const maxScroll = Math.max(0, this._listContentH - this.listH());
        if (maxScroll <= 0) return;
        const barPy = this.panelRoot.position.y + this._scrollBar.position.y;
        const localY = canvasLy - barPy;
        const trackH = this.listH() - QuestPanel.SCROLL_PAD * 2;
        const thumbH = this.scrollThumbH(trackH);
        const travel = Math.max(1, trackH - thumbH);
        const yFromTop = trackH * 0.5 - localY;
        const nt = Math.max(0, Math.min(1, (yFromTop - thumbH * 0.5) / travel));
        this._listScroll = -nt * maxScroll;
        this.applyListScroll();
    }

    private nudgeListScroll(delta: number) {
        this._listScroll += delta;
        this.applyListScroll();
    }

    private applyListScroll() {
        if (!this._listContent) return;
        const maxScroll = Math.max(0, this._listContentH - this.listH());
        // scroll: 0 = top, -maxScroll = bottom (thumb). Content must move OPPOSITE the thumb.
        this._listScroll = Math.max(-maxScroll, Math.min(0, this._listScroll));
        const baseY = this.listH() * 0.5 - this._listContentH * 0.5;
        // Minus scroll: thumb down (more negative) → content moves up → lower rows enter view.
        this._listContent.setPosition(0, baseY - this._listScroll, 0);
        // Hard cull — Graphics can ignore Mask on some builds.
        const half = this.listH() * 0.5;
        const contentY = this._listContent.position.y;
        for (const row of this._listContent.children) {
            const y = contentY + row.position.y;
            const rh = this.rowH() * 0.5;
            row.active = y + rh > -half + 1 && y - rh < half - 1;
        }
        this.paintScrollBar();
        if (maxScroll > 1 && this._scrollMoved) this.flashScrollBar();
    }

    /** Short tap on track: jump thumb to that spot (drag already handled above). */
    private handleScrollBarTap(lx: number, ly: number): boolean {
        if (!this._scrollBar?.active || !this.panelRoot) return false;
        if ((this._scrollBarOp?.opacity ?? 0) < 40) return false;
        if (!this.hitNodeWorld(this._scrollBar, lx, ly)) return false;
        this.scrollToTrackY(ly);
        this.flashScrollBar();
        return true;
    }

    private scrollThumbH(trackH: number): number {
        if (this._listContentH <= this.listH()) return trackH;
        // Cap height so the thumb stays a short wood knob (not a full-height sausage).
        const raw = trackH * (this.listH() / this._listContentH);
        return Math.max(
            QuestPanel.SCROLL_THUMB_MIN,
            Math.min(QuestPanel.SCROLL_THUMB_MAX, raw),
        );
    }

    /** Full content width — scrollbar overlays the right edge. */
    private listW(): number {
        return L.contentW;
    }

    private rowH(): number {
        return L.rowH;
    }

    private rowGap(): number {
        return L.rowGap;
    }

    private listH(): number {
        const ut = this.listHost?.getComponent(UITransform);
        return ut?.contentSize.height || L.listH;
    }

    private resolveRefs(root: Node) {
        this.panelRoot = root.getChildByName('Panel');
        this.dimmer = root.getChildByName('Dim');
        const panel = this.panelRoot;
        if (!panel) return;
        this.titleLab = panel.getChildByName('Title')?.getComponent(Label) ?? null;
        this.heroNode = panel.getChildByName('Hero');
        if (this.heroNode) this.heroNode.active = false;
        this.heroIcon = null;
        this.heroTitleLab = null;
        this.heroDescLab = null;
        this.heroProgLab = null;
        this.heroBarNode = null;
        const section = panel.getChildByName('Section');
        if (section) section.active = false;
        this.sectionLab = null;
        this.listHost = panel.getChildByName('List');
        this.btnClose = panel.getChildByName('BtnClose');
        this.btnGoto = panel.getChildByName('BtnGoto');
        if (this.btnGoto) this.btnGoto.active = false;
        this._mainTab = panel.getChildByName('TabMain');
        this._boardTab = panel.getChildByName('TabBoard');
        this._mainTabLab = this._mainTab?.getChildByName('Lab')?.getComponent(Label) ?? null;
        this._boardTabLab = this._boardTab?.getChildByName('Lab')?.getComponent(Label) ?? null;
        this._scrollBar = panel.getChildByName('ScrollBar');
        this._scrollThumb = this._scrollBar?.getChildByName('Thumb') ?? null;
        this._scrollBarOp = this._scrollBar?.getComponent(UIOpacity) ?? null;
        if (this._scrollBar && !this._scrollBarOp) {
            this._scrollBarOp = this._scrollBar.addComponent(UIOpacity);
        }
    }

    private loadFrames(done?: () => void) {
        const keys = Object.keys(QUEST_FRAMES) as FrameKey[];
        let left = keys.length + 1;
        const finish = () => {
            left--;
            if (left <= 0) {
                this._framesReady = true;
                // Chrome needs close icon once frames arrive.
                if (this._mounted) this.paintCloseButton();
                done?.();
            }
        };
        if (keys.length <= 0) {
            left = 1;
        }
        for (const key of keys) {
            assetManager.loadAny({ uuid: QUEST_FRAMES[key] }, (err, asset) => {
                if (!err && asset) this._frames.set(key, asset as SpriteFrame);
                else console.warn('[QuestPanel] frame missing', key, err);
                finish();
            });
        }
        loadPanelCloseFrame((frame) => {
            this._closeFrame = frame;
            finish();
        });
    }

    private paintChrome() {
        this.paintPanelFrame();
        this.paintDimmer();
        this.paintCloseButton();
        this.paintButtons();
        this.bindTabs();
        // List Mask must wait until the panel is active — see ensureListViewport.
        this.ensureListViewport(false);
        this.ensureScrollBar();
        if (this.heroNode) this.heroNode.active = false;
        if (this.sectionLab) this.sectionLab.node.active = false;
        if (this.titleLab) {
            this.titleLab.string = '旅途日志';
            styleUiLabel(this.titleLab, {
                size: FONT_TITLE,
                color: new Color(255, 244, 214, 255),
                outline: true,
                outlineWidth: 4,
                outlineColor: new Color(62, 34, 16, 230),
            });
            applyUiFont(this.titleLab);
        }
        if (this.btnGoto) this.btnGoto.active = false;
    }

    /** Tabs live in the prefab — bind labels + paint on/off chrome. */
    private bindTabs() {
        if (!this.panelRoot) return;
        if (!this._mainTab) this._mainTab = this.panelRoot.getChildByName('TabMain');
        if (!this._boardTab) this._boardTab = this.panelRoot.getChildByName('TabBoard');
        if (!this._mainTabLab) {
            this._mainTabLab = this._mainTab?.getChildByName('Lab')?.getComponent(Label) ?? null;
        }
        if (!this._boardTabLab) {
            this._boardTabLab = this._boardTab?.getChildByName('Lab')?.getComponent(Label) ?? null;
        }
        for (const lab of [this._mainTabLab, this._boardTabLab]) {
            if (!lab) continue;
            styleUiLabel(lab, { size: FONT_BODY, color: INK, outline: false });
            applyUiFont(lab);
        }
        this.paintTabs();
    }

    private paintTabs() {
        this.paintTab(this._mainTab, this._mainTabLab, this._tab === 'main');
        this.paintTab(this._boardTab, this._boardTabLab, this._tab === 'board');
    }

    private paintTab(node: Node | null, lab: Label | null, on: boolean) {
        if (!node) return;
        const ut = node.getComponent(UITransform);
        const tw = ut?.contentSize.width || L.tabW;
        const th = ut?.contentSize.height || L.tabH;
        applyWoodButton(node, on ? 'on' : 'off', tw, th);
        if (lab) lab.color = on ? UI_CREAM : INK;
    }

    private handleTabTap(lx: number, ly: number): boolean {
        if (!this.panelRoot) return false;
        const py = this.panelRoot.position.y;
        const px = this.panelRoot.position.x;
        const hit = (node: Node | null) => {
            if (!node?.isValid || !node.active) return false;
            const ui = node.getComponent(UITransform);
            if (!ui) return false;
            const hw = ui.contentSize.width * 0.5 + 6;
            const hh = ui.contentSize.height * 0.5 + 6;
            const x = px + node.position.x;
            const y = py + node.position.y;
            return Math.abs(lx - x) <= hw && Math.abs(ly - y) <= hh;
        };
        if (hit(this._mainTab)) {
            if (this._tab !== 'main') {
                this._tab = 'main';
                this.refreshPanel();
            }
            return true;
        }
        if (hit(this._boardTab)) {
            if (this._tab !== 'board') {
                this._tab = 'board';
                this.refreshPanel();
            }
            return true;
        }
        return false;
    }

    /** Prefer prefab AI panel sprite; Chrome uses shared AI wood panel. */
    private paintPanelFrame() {
        if (!this.panelRoot) return;
        const sp = this.panelRoot.getComponent(Sprite);
        if (sp) {
            sp.enabled = true;
            sp.sizeMode = Sprite.SizeMode.CUSTOM;
            sp.type = Sprite.Type.SLICED;
        }
        const chrome = this.panelRoot.getChildByName('Chrome');
        if (!chrome) return;
        chrome.setSiblingIndex(0);
        // When Panel already has quest AI frame, hide duplicate Chrome fill.
        if (sp?.spriteFrame) {
            chrome.active = false;
            return;
        }
        chrome.active = true;
        const cut = chrome.getComponent(UITransform);
        const w = cut?.contentSize.width || L.panelW;
        const h = cut?.contentSize.height || L.panelH;
        applyWoodPanel(chrome, w, h);
    }

    /** Top-right X — prefab places BtnClose; only refresh the icon visual. */
    private paintCloseButton() {
        if (!this.btnClose) return;
        const lab = this.btnClose.getChildByName('Label');
        if (lab) lab.active = false;
        paintPanelCloseVisual(this.btnClose, {
            size: L.closeBtn,
            layer: this.btnClose.layer,
            frame: this._closeFrame,
        });
    }

    /**
     * Clip list to the panel band above the footer buttons.
     * Mask can only be added while the node is activeInHierarchy — setting
     * Mask.type (or addComponent while inactive) hits `subComp is null`.
     */
    private ensureListViewport(attachMask = true) {
        if (!this.listHost) return;
        const lw = this.listW();
        const lh = this.listH();
        // Drop legacy loose rows from before the scroll viewport existed.
        for (const child of [...this.listHost.children]) {
            if (child.name !== 'Content') child.destroy();
        }
        let content = this.listHost.getChildByName('Content');
        if (!content) {
            content = new Node('Content');
            content.layer = this.listHost.layer;
            content.setParent(this.listHost);
            content.addComponent(UITransform).setContentSize(lw, lh);
        }
        this._listContent = content;

        if (attachMask && this.listHost.activeInHierarchy && !this.listHost.getComponent(Mask)) {
            // Default type is already a rect clip — do not assign `.type` (crashes if subComp unset).
            this.listHost.addComponent(Mask);
        }
        // If open path called us before hierarchy settled, retry next frame.
        if (attachMask && !this.listHost.getComponent(Mask)) {
            this.scheduleOnce(() => {
                if (this.listHost?.activeInHierarchy && !this.listHost.getComponent(Mask)) {
                    this.listHost.addComponent(Mask);
                }
            }, 0);
        }
    }

    /** ScrollBar/Thumb from prefab — thumb Y still updates with scroll. */
    private ensureScrollBar() {
        if (!this.panelRoot) return;
        for (const name of ['BtnScrollUp', 'BtnScrollDown']) {
            const old = this.panelRoot.getChildByName(name);
            if (old?.isValid) old.destroy();
        }

        let bar = this._scrollBar ?? this.panelRoot.getChildByName('ScrollBar');
        if (!bar) {
            // Fallback if an older prefab is still cached.
            const w = L.scrollW;
            bar = new Node('ScrollBar');
            bar.layer = this.panelRoot.layer;
            bar.setParent(this.panelRoot);
            bar.setPosition(L.scrollX, L.listY, 0);
            bar.addComponent(UITransform).setContentSize(w, L.listH);
            bar.addComponent(Graphics);
            bar.addComponent(UIOpacity);
            const thumb = new Node('Thumb');
            thumb.layer = bar.layer;
            thumb.setParent(bar);
            thumb.addComponent(UITransform).setContentSize(w - 2, 48);
            thumb.addComponent(Graphics);
        }
        this._scrollBar = bar;
        this._scrollThumb = bar.getChildByName('Thumb');
        this._scrollBarOp = bar.getComponent(UIOpacity) ?? bar.addComponent(UIOpacity);
        this.paintScrollBar();
    }

    private flashScrollBar() {
        if (!this._scrollBar || !this._scrollBarOp) return;
        const maxScroll = Math.max(0, this._listContentH - this.listH());
        if (maxScroll <= 1) return;
        this._scrollBar.active = true;
        this._scrollBarLit = true;
        this._scrollBarOp.opacity = 200;
        this.unschedule(this.hideScrollBar);
        this.scheduleOnce(this.hideScrollBar, QuestPanel.SCROLL_FADE_DELAY);
    }

    private hideScrollBar = () => {
        if (this._scrollPtrDown && this._scrollDrag === 'thumb') return;
        this._scrollBarLit = false;
        if (this._scrollBarOp) this._scrollBarOp.opacity = 0;
    };

    private paintScrollBar() {
        if (!this._scrollBar || !this._scrollThumb) return;
        const maxScroll = Math.max(0, this._listContentH - this.listH());
        const need = maxScroll > 1;
        this._scrollBar.active = need;
        if (!need) {
            this._scrollBarLit = false;
            if (this._scrollBarOp) this._scrollBarOp.opacity = 0;
            return;
        }
        if (this._scrollBarOp && !this._scrollBarLit) this._scrollBarOp.opacity = 0;

        const w = L.scrollW;
        const pad = QuestPanel.SCROLL_PAD;
        const trackH = this.listH() - pad * 2;
        const thumbH = this.scrollThumbH(trackH);
        const travel = Math.max(1, trackH - thumbH);
        const t = -this._listScroll / maxScroll;
        const thumbY = trackH * 0.5 - thumbH * 0.5 - t * travel;

        const track = this._scrollBar.getComponent(Graphics);
        if (track) {
            track.clear();
            // Ghost rail — barely there so rows stay readable underneath.
            track.fillColor = new Color(60, 36, 18, 50);
            track.roundRect(-w * 0.5, -trackH * 0.5, w, trackH, 6);
            track.fill();
        }

        const tw = Math.max(6, w - 2);
        this._scrollThumb.setPosition(0, thumbY, 0);
        this._scrollThumb.getComponent(UITransform)?.setContentSize(tw, thumbH);
        const tg = this._scrollThumb.getComponent(Graphics);
        if (tg) {
            tg.clear();
            tg.fillColor = new Color(120, 72, 32, 210);
            tg.roundRect(-tw * 0.5, -thumbH * 0.5, tw, thumbH, 5);
            tg.fill();
            tg.fillColor = new Color(210, 150, 70, 230);
            tg.roundRect(-tw * 0.5 + 1, -thumbH * 0.5 + 1, tw - 2, thumbH - 2, 4);
            tg.fill();
        }
    }

    private paintDimmer() {
        if (!this.dimmer) return;
        let g = this.dimmer.getComponent(Graphics);
        if (!g) g = this.dimmer.addComponent(Graphics);
        const vis = view.getVisibleSize();
        const ut = this.dimmer.getComponent(UITransform);
        if (ut) ut.setContentSize(vis.width * 2.2, vis.height * 2.2);
        g.clear();
        // Match FarmHUD craft dimmer — must actually veil world HUD under the modal.
        g.fillColor = new Color(0, 0, 0, 160);
        g.rect(-vis.width, -vis.height, vis.width * 2, vis.height * 2);
        g.fill();
    }

    private paintButtons() {
        // Footer primary removed — per-row actions are painted in addQuestRow.
        if (this.btnGoto) this.btnGoto.active = false;
    }

    private refreshTracker() {
        this.syncQuestHudVisibility();
        if (!this._trackerTitle || !this._trackerProg) return;
        const q = this.quests?.activeQuest;
        if (!q || !this.quests?.isAwaitingClaim) {
            this._trackerTitle.string = '';
            this._trackerProg.string = '';
            if (this._trackerCount) this._trackerCount.string = '';
            return;
        }
        this._trackerTitle.string = q.name;
        this._trackerProg.string = '点击领奖';
        if (this._trackerCount) {
            this._trackerCount.string = '✓';
            styleUiLabel(this._trackerCount, {
                size: FONT_TITLE,
                color: new Color(70, 140, 50, 255),
                outline: false,
            });
            applyUiFont(this._trackerCount);
        }
    }

    private refreshPanel() {
        if (!this.listHost || !this.quests) return;
        this.bindTabs();
        this.paintTabs();
        this.ensureListViewport();
        const content = this._listContent;
        if (!content) return;
        content.removeAllChildren();
        this._rowActions.clear();
        this._boardActions.clear();
        this._descButtons.clear();

        if (this._tab === 'board') {
            this.refreshBoardList(content);
            return;
        }

        // Current quest only — completed / locked steps stay out of the journal.
        const q = this.quests.activeQuest;
        const quests = this.quests.visibleQuests();
        const activeId = q?.id ?? -1;
        const n = quests.length;
        const heights = quests.map((quest) => this.rowHForDesc(quest.desc || '', `m:${quest.id}`));
        const totalH =
            n > 0
                ? heights.reduce((a, b) => a + b, 0) + Math.max(0, n - 1) * this.rowGap()
                : this.listH();
        this._listContentH = totalH;
        const lw = this.listW();
        content.getComponent(UITransform)?.setContentSize(lw, totalH);

        let y = totalH * 0.5;
        let activeOffset = 0;
        for (let i = 0; i < n; i++) {
            const quest = quests[i]!;
            const rh = heights[i]!;
            y -= rh * 0.5;
            if (quest.id === activeId) {
                activeOffset = totalH * 0.5 - (y + rh * 0.5);
            }
            this.addQuestRow(
                content,
                quest,
                quest.id === activeId,
                this.quests.isCompleted(quest.id),
                y,
                rh,
            );
            y -= rh * 0.5 + this.rowGap();
        }

        const maxScroll = Math.max(0, totalH - this.listH());
        this._listScroll = -Math.min(maxScroll, activeOffset);
        this.applyListScroll();
    }

    private refreshBoardList(content: Node) {
        const boards = this.quests?.activeBoardQuests() ?? [];
        const n = boards.length;
        const heights = boards.map((b) => this.rowHForDesc(b.desc || '', `b:${b.id}`));
        const totalH =
            n > 0
                ? heights.reduce((a, b) => a + b, 0) + Math.max(0, n - 1) * this.rowGap()
                : this.listH();
        this._listContentH = totalH;
        const lw = this.listW();
        content.getComponent(UITransform)?.setContentSize(lw, totalH);

        if (n <= 0) {
            this.addEmptyBoardRow(content);
            this._listScroll = 0;
            this.applyListScroll();
            return;
        }

        let y = totalH * 0.5;
        for (let i = 0; i < n; i++) {
            const rh = heights[i]!;
            y -= rh * 0.5;
            this.addBoardRow(content, boards[i]!, y, rh);
            y -= rh * 0.5 + this.rowGap();
        }
        this._listScroll = 0;
        this.applyListScroll();
    }

    private addEmptyBoardRow(host: Node) {
        const rw = this.listW();
        const rh = this.rowH();
        const row = new Node('BoardEmpty');
        row.layer = host.layer;
        row.setParent(host);
        row.setPosition(0, 0, 0);
        row.addComponent(UITransform).setContentSize(rw, rh);
        const g = row.addComponent(Graphics);
        this.paintRowPlate(g, rw, rh, false, false);
        const labN = new Node('Lab');
        labN.layer = host.layer;
        labN.setParent(row);
        labN.setPosition(0, 0, 0);
        labN.addComponent(UITransform).setContentSize(rw - QuestPanel.ROW_PAD_X * 2, rh - 24);
        const lab = labN.addComponent(Label);
        lab.string = '还没有委托\n去镇上警察局或邮局接取吧';
        lab.overflow = Label.Overflow.CLAMP;
        lab.enableWrapText = true;
        lab.horizontalAlign = Label.HorizontalAlign.CENTER;
        lab.verticalAlign = Label.VerticalAlign.CENTER;
        styleUiLabel(lab, { size: FONT_DESC, color: INK_MUTE, outline: false });
        applyUiFont(lab);
    }

    private addBoardRow(host: Node, q: BoardCommissionSnapshot, y: number, rh = this.rowH()) {
        const rw = this.listW();
        const row = new Node(`B_${q.id}`);
        row.layer = host.layer;
        row.setParent(host);
        row.setPosition(0, y, 0);
        row.addComponent(UITransform).setContentSize(rw, rh);

        const g = row.addComponent(Graphics);
        this.paintRowPlate(g, rw, rh, true, false);

        const padX = QuestPanel.ROW_PAD_X;
        const actionW = QuestPanel.PROG_BADGE_W + 12;
        const textLeft = -rw * 0.5 + padX;
        const bodyW = Math.max(160, rw - padX * 2 - actionW);
        const actionX = rw * 0.5 - padX - QuestPanel.PROG_BADGE_W * 0.5;
        const src = q.source === 'police' ? '警察局' : '邮局';
        const title = (q.title || '委托').trim();
        const fullDesc = (q.desc || '').trim();
        const { yTitle, y2, y3 } = this.layoutDescBlock(
            row,
            `b:${q.id}`,
            fullDesc,
            textLeft,
            bodyW,
            rh,
            INK,
        );

        this.addRowLine(row, 'Title', title, textLeft, yTitle, bodyW, {
            size: FONT_BODY,
            color: INK,
        });
        const hint = this.quests?.boardDeliverHint(q.id) || '目标地点';
        this.addRowLine(row, 'Goal', `目标  前往${hint}`, textLeft, y2, bodyW, {
            size: FONT_DESC,
            color: INK_MUTE,
        });
        this.addRowLine(
            row,
            'Reward',
            `奖励  ${formatGoldAmount(q.rewardGold)} · ${src}`,
            textLeft,
            y3,
            bodyW,
            {
                size: FONT_DESC,
                color: new Color(168, 108, 36, 255),
            },
        );

        // Hint only — gold pays when the player interacts at deliverKey in town.
        const badge = this.addActionBadge(row, actionX, y2, '前往', true);
        this._boardActions.set(q.id, badge);
    }

    private handleBoardActionTap(lx: number, ly: number): boolean {
        if (!this.quests || this._tab !== 'board') return false;
        for (const [id, node] of this._boardActions) {
            if (!this.hitNodeNested(node, lx, ly)) continue;
            const hint = this.quests.boardDeliverHint(id) || '任务描述里的地点';
            this.quests.infoBoard?.showToast(`去${hint}交互交付`);
            this.setOpen(false);
            return true;
        }
        return false;
    }

    /**
     * Quest card — four text rows, no icon:
     *   1 标题  2 描述（可截断 + 详情展开）  3 目标+进度  4 奖励
     * Claimable rows put「领奖」on the objective line.
     */
    private addQuestRow(
        host: Node,
        q: CQuest,
        active: boolean,
        done: boolean,
        y: number,
        rh = this.rowH(),
    ) {
        const rw = this.listW();
        const row = new Node(`Q_${q.id}`);
        row.layer = host.layer;
        row.setParent(host);
        row.setPosition(0, y, 0);
        row.addComponent(UITransform).setContentSize(rw, rh);

        const g = row.addComponent(Graphics);
        this.paintRowPlate(g, rw, rh, active, done);

        const claimable = active && !!this.quests?.isAwaitingClaim;
        const padX = QuestPanel.ROW_PAD_X;
        const actionW = claimable ? QuestPanel.PROG_BADGE_W + 12 : 0;
        const textLeft = -rw * 0.5 + padX;
        const bodyW = Math.max(160, rw - padX * 2 - actionW);

        const ink = done ? INK_DONE : INK;
        const mute = done ? new Color(70, 100, 58, 255) : INK_MUTE;
        const title = (q.name || '任务').trim();
        const fullDesc = (q.desc || '').trim();
        const { yTitle, y2, y3 } = this.layoutDescBlock(
            row,
            `m:${q.id}`,
            fullDesc,
            textLeft,
            bodyW,
            rh,
            ink,
        );

        this.addRowLine(row, 'Title', title, textLeft, yTitle, bodyW, {
            size: FONT_BODY,
            color: ink,
        });

        let goal = '目标  —';
        if (done) goal = '目标  已完成';
        else if (this.quests) {
            const p = this.quests.progressOf(q);
            const obj = this.quests.objectiveLabel(q);
            goal = obj
                ? `目标  ${obj}  ${p.current}/${p.target}`
                : `目标  ${p.current}/${p.target}`;
        }
        this.addRowLine(row, 'Goal', goal, textLeft, y2, bodyW, {
            size: FONT_DESC,
            color: mute,
        });

        const rewardText = this.rewardTextOf(q);
        this.addRowLine(row, 'Reward', rewardText || '奖励  —', textLeft, y3, bodyW, {
            size: FONT_DESC,
            color: done ? new Color(90, 120, 60, 255) : new Color(168, 108, 36, 255),
        });

        if (claimable) {
            const actionX = rw * 0.5 - padX - QuestPanel.PROG_BADGE_W * 0.5;
            const badge = this.addActionBadge(row, actionX, y2, '领奖', true);
            this._rowActions.set(q.id, badge);
        }
    }

    /** Title band + collapsed / expanded description + optional 详情 button. */
    private layoutDescBlock(
        row: Node,
        key: string,
        fullDesc: string,
        textLeft: number,
        bodyW: number,
        rh: number,
        color: Color,
    ): { yTitle: number; y2: number; y3: number } {
        const expanded = this._descExpanded.has(key);
        const preview = this.truncateDesc(fullDesc, QuestPanel.DESC_PREVIEW_CHARS);
        const showBtn = !!fullDesc && (preview.needsMore || expanded);
        const btnW = showBtn ? QuestPanel.DESC_BADGE_W + 10 : 0;
        const textW = Math.max(120, bodyW - btnW);
        const lineH = 34;
        const bottomPad = 18;
        const y3 = -rh * 0.5 + bottomPad + 18;
        const y2 = y3 + 44;
        const yTitle = rh * 0.5 - 28;
        const descTop = yTitle - 34;
        const descBottom = y2 + 28;
        const descCenterY = (descTop + descBottom) * 0.5;
        const descText = fullDesc || '—';

        if (expanded && fullDesc) {
            const descH = Math.max(lineH, descTop - descBottom);
            this.addRowLine(row, 'Desc', `描述  ${fullDesc}`, textLeft, descCenterY, textW, {
                size: FONT_BODY,
                color,
                wrap: true,
                height: descH,
            });
        } else {
            const y1 = descTop - 16;
            this.addRowLine(
                row,
                'Desc',
                `描述  ${fullDesc ? preview.short : descText}`,
                textLeft,
                y1,
                textW,
                {
                    size: FONT_BODY,
                    color,
                },
            );
        }

        if (showBtn) {
            const btnX = textLeft + textW + QuestPanel.DESC_BADGE_W * 0.5 + 4;
            const btnY = expanded ? descTop - QuestPanel.DESC_BADGE_H * 0.5 : descTop - 16;
            const badge = this.addDetailBadge(row, btnX, btnY, expanded ? '收起' : '详情');
            this._descButtons.set(key, badge);
        }
        return { yTitle, y2, y3 };
    }

    private truncateDesc(text: string, maxChars: number): { short: string; needsMore: boolean } {
        const t = text.replace(/\s+/g, ' ').trim();
        if (t.length <= maxChars) return { short: t, needsMore: false };
        return { short: `${t.slice(0, maxChars)}…`, needsMore: true };
    }

    private rowHForDesc(fullDesc: string, key: string): number {
        if (!this._descExpanded.has(key)) return this.rowH();
        const rw = this.listW();
        const padX = QuestPanel.ROW_PAD_X;
        const textW = Math.max(120, rw - padX * 2 - QuestPanel.DESC_BADGE_W - 10);
        const charsPerLine = Math.max(8, Math.floor(textW / (FONT_BODY * 0.95)));
        const lines = Math.max(1, Math.ceil((`描述  ${fullDesc}`.length) / charsPerLine));
        const descH = lines * 34 + 8;
        // title + desc + goal + reward
        return Math.max(this.rowH(), descH + 40 + 44 + 44 + 36);
    }

    private handleDescDetailTap(lx: number, ly: number): boolean {
        for (const [key, node] of this._descButtons) {
            if (!this.hitNodeNested(node, lx, ly)) continue;
            if (this._descExpanded.has(key)) this._descExpanded.delete(key);
            else this._descExpanded.add(key);
            this.refreshPanel();
            return true;
        }
        return false;
    }

    private addRowLine(
        row: Node,
        name: string,
        text: string,
        left: number,
        y: number,
        w: number,
        style: { size: number; color: Color; wrap?: boolean; height?: number },
    ) {
        const n = new Node(name);
        n.layer = row.layer;
        n.setParent(row);
        n.setPosition(left, y, 0);
        const ut = n.addComponent(UITransform);
        const h = style.height ?? 36;
        ut.setContentSize(w, h);
        ut.setAnchorPoint(0, 0.5);
        const lab = n.addComponent(Label);
        lab.string = text;
        // CLAMP + wrap keeps multi-line text inside the card; RESIZE_HEIGHT can blow past the plate.
        lab.overflow = Label.Overflow.CLAMP;
        lab.enableWrapText = !!style.wrap;
        lab.horizontalAlign = Label.HorizontalAlign.LEFT;
        lab.verticalAlign = style.wrap ? Label.VerticalAlign.TOP : Label.VerticalAlign.CENTER;
        styleUiLabel(lab, { size: style.size, color: style.color, outline: false });
        applyUiFont(lab);
        return lab;
    }

    private addDetailBadge(row: Node, cx: number, cy: number, text: string): Node {
        const w = QuestPanel.DESC_BADGE_W;
        const h = QuestPanel.DESC_BADGE_H;
        const badge = new Node('DescDetail');
        badge.layer = row.layer;
        badge.setParent(row);
        badge.setPosition(cx, cy, 0);
        badge.addComponent(UITransform).setContentSize(w, h);
        const bg = badge.addComponent(Graphics);
        const x0 = -w * 0.5;
        const y0 = -h * 0.5;
        bg.fillColor = WOOD_DARK;
        bg.roundRect(x0, y0, w, h, 10);
        bg.fill();
        bg.fillColor = PARCHMENT;
        bg.roundRect(x0 + 2, y0 + 2, w - 4, h - 4, 8);
        bg.fill();
        bg.strokeColor = STROKE;
        bg.lineWidth = 2;
        bg.roundRect(x0, y0, w, h, 10);
        bg.stroke();

        const labN = new Node('Lab');
        labN.layer = row.layer;
        labN.setParent(badge);
        labN.addComponent(UITransform).setContentSize(w, h);
        const lab = labN.addComponent(Label);
        lab.string = text;
        lab.horizontalAlign = Label.HorizontalAlign.CENTER;
        lab.verticalAlign = Label.VerticalAlign.CENTER;
        styleUiLabel(lab, { size: FONT_DESC, color: INK, outline: false });
        applyUiFont(lab);
        return badge;
    }

    private addActionBadge(row: Node, cx: number, cy: number, text: string, lit: boolean): Node {
        const w = QuestPanel.PROG_BADGE_W;
        const h = QuestPanel.PROG_BADGE_H;
        const badge = new Node('Action');
        badge.layer = row.layer;
        badge.setParent(row);
        badge.setPosition(cx, cy, 0);
        badge.addComponent(UITransform).setContentSize(w, h);
        const bg = badge.addComponent(Graphics);
        const x0 = -w * 0.5;
        const y0 = -h * 0.5;
        if (lit) {
            bg.fillColor = new Color(86, 140, 54, 255);
            bg.roundRect(x0, y0, w, h, 12);
            bg.fill();
            bg.fillColor = new Color(120, 176, 72, 255);
            bg.roundRect(x0 + 3, y0 + 3, w - 6, h - 6, 10);
            bg.fill();
            bg.strokeColor = GOLD;
            bg.lineWidth = 2;
            bg.roundRect(x0 + 1, y0 + 1, w - 2, h - 2, 11);
            bg.stroke();
        } else {
            bg.fillColor = WOOD_DARK;
            bg.roundRect(x0, y0, w, h, 12);
            bg.fill();
            bg.fillColor = PARCHMENT;
            bg.roundRect(x0 + 3, y0 + 3, w - 6, h - 6, 10);
            bg.fill();
        }
        bg.strokeColor = STROKE;
        bg.lineWidth = 2;
        bg.roundRect(x0, y0, w, h, 12);
        bg.stroke();

        const labN = new Node('Lab');
        labN.layer = row.layer;
        labN.setParent(badge);
        labN.addComponent(UITransform).setContentSize(w, h);
        const lab = labN.addComponent(Label);
        lab.string = text;
        lab.horizontalAlign = Label.HorizontalAlign.CENTER;
        lab.verticalAlign = Label.VerticalAlign.CENTER;
        styleUiLabel(lab, {
            size: FONT_BODY,
            color: lit ? new Color(255, 252, 230, 255) : INK,
            outline: lit,
            outlineWidth: 3,
            outlineColor: new Color(40, 24, 12, 220),
        });
        applyUiFont(lab);
        return badge;
    }

    private rewardTextOf(q: CQuest): string {
        const parts: string[] = [];
        if (q.rewardGold > 0) parts.push(formatGoldAmount(q.rewardGold));
        if (q.rewardItem && q.rewardCount > 0) {
            parts.push(`${this.rewardItemName(q.rewardItem)} x ${q.rewardCount}`);
        }
        return parts.length > 0 ? `奖励  ${parts.join('　')}` : '';
    }

    private rewardItemName(kind: string): string {
        return itemName(kind, kind);
    }

    private openRewardPopup() {
        const popup = this.node.getComponent(RewardPopup);
        if (popup?.openForActive()) return;
        // Fallback if popup not mounted yet.
        this.quests?.claimActive();
    }

    private handleRowActionTap(lx: number, ly: number): boolean {
        if (!this.quests) return false;
        for (const [questId, node] of this._rowActions) {
            if (!this.hitNodeNested(node, lx, ly)) continue;
            if (!this.quests.isActive(questId)) return true;
            // Progress rail only claims — 前往 navigation removed from the journal.
            if (this.quests.isAwaitingClaim) {
                this.setOpen(false);
                this.openRewardPopup();
            }
            return true;
        }
        return false;
    }

    /** Hit-test a node nested under the scrolling list (accumulates local positions). */
    private hitNodeNested(node: Node | null, lx: number, ly: number): boolean {
        if (!node?.isValid || !node.active) return false;
        const ui = node.getComponent(UITransform);
        if (!ui) return false;
        const pos = this.nodeCanvasPos(node);
        if (!pos) return false;
        const hw = ui.contentSize.width * 0.5 + 6;
        const hh = ui.contentSize.height * 0.5 + 6;
        return Math.abs(lx - pos.x) <= hw && Math.abs(ly - pos.y) <= hh;
    }

    private nodeCanvasPos(node: Node): { x: number; y: number } | null {
        let x = 0;
        let y = 0;
        let n: Node | null = node;
        while (n && n !== this.node) {
            x += n.position.x;
            y += n.position.y;
            n = n.parent;
        }
        return n === this.node ? { x, y } : null;
    }

    private paintRowPlate(g: Graphics, w: number, h: number, active: boolean, done: boolean) {
        const node = g.node;
        g.clear();
        g.enabled = false;
        const key: FrameKey = done ? 'rowDone' : active ? 'rowActive' : 'row';
        const sf = this._frames.get(key) ?? null;
        let sp = node.getComponent(Sprite);
        if (!sp) sp = node.addComponent(Sprite);
        sp.sizeMode = Sprite.SizeMode.CUSTOM;
        sp.trim = false;
        sp.type = Sprite.Type.SLICED;
        if (sf) {
            sp.spriteFrame = sf;
            node.getComponent(UITransform)?.setContentSize(w, h);
            return;
        }
        // AI row frames still loading — keep node sized; sprite lands on next refresh.
        node.getComponent(UITransform)?.setContentSize(w, h);
    }

    private setHudVisible(visible: boolean) {
        // Journal modal hides the claim chip; when restoring, only if awaiting claim.
        const show =
            visible &&
            (this.quests?.isQuestHudUnlocked() ?? true) &&
            !!this.quests?.isAwaitingClaim;
        const dock = this.node.getChildByName('QuestHud');
        if (dock) dock.active = show;
        else if (this._tracker) this._tracker.active = show;
    }

    /** Claim chip only when mainline objective is done and unlocked. */
    private syncQuestHudVisibility() {
        if (this._open) return;
        const show =
            (this.quests?.isQuestHudUnlocked() ?? true) && !!this.quests?.isAwaitingClaim;
        const dock = this.node.getChildByName('QuestHud');
        if (dock) dock.active = show;
        else if (this._tracker) this._tracker.active = show;
    }

    /** Quick-claim bar above the hotbar — layout from QuestTracker.prefab. */
    private buildTracker() {
        const canvas = this.node;
        for (const name of ['QuestHud', 'QuestTracker', 'QuestBtn']) {
            const old = canvas.getChildByName(name);
            if (old) old.destroy();
        }

        assetManager.loadAny({ uuid: QUEST_TRACKER_PREFAB_UUID }, (err, asset) => {
            if (err || !asset) {
                console.warn('[QuestPanel] tracker prefab missing', err);
                return;
            }
            const dock = instantiate(asset as Prefab);
            dock.name = 'QuestHud';
            dock.layer = canvas.layer;
            dock.setParent(canvas);
            dock.setSiblingIndex(canvas.children.length - 1);
            this._trackerDock = dock;
            const bar = dock.getChildByName('QuestTracker');
            this._tracker = bar;
            this._trackerTitle = bar?.getChildByName('Title')?.getComponent(Label) ?? null;
            this._trackerProg = bar?.getChildByName('Prog')?.getComponent(Label) ?? null;
            this._trackerCount = bar?.getChildByName('Count')?.getComponent(Label) ?? null;

            for (const lab of [this._trackerTitle, this._trackerProg, this._trackerCount]) {
                if (!lab) continue;
                styleUiLabel(lab, {
                    size: FONT_BODY,
                    color: lab === this._trackerProg ? INK_MUTE : INK,
                    outline: false,
                });
                lab.lineHeight = FONT_BODY + 14;
                lab.spacingX = 2;
                lab.verticalAlign = Label.VerticalAlign.CENTER;
                applyUiFont(lab);
            }
            if (this._trackerTitle) this._trackerTitle.horizontalAlign = Label.HorizontalAlign.LEFT;
            if (this._trackerProg) this._trackerProg.horizontalAlign = Label.HorizontalAlign.LEFT;
            if (this._trackerCount) this._trackerCount.horizontalAlign = Label.HorizontalAlign.RIGHT;

            this.paintTrackerChromeOnce();
            this.syncQuestHudVisibility();
            this.refreshTracker();
        });
    }

    private paintTrackerChromeOnce() {
        if (this._trackerChromePainted || !this._tracker?.isValid) return;
        const g = this._tracker.getComponent(Graphics);
        if (!g) return;
        const tw = TL.barW;
        const th = TL.barH;
        const x0 = -tw * 0.5;
        const y0 = -th * 0.5;
        g.clear();
        g.fillColor = WOOD;
        g.roundRect(x0, y0, tw, th, 16);
        g.fill();
        g.fillColor = WOOD_DARK;
        g.roundRect(x0 + 4, y0 + 4, tw - 8, th - 8, 12);
        g.fill();
        g.fillColor = PARCHMENT;
        g.roundRect(x0 + 12, y0 + 12, tw - 24, th - 24, 10);
        g.fill();
        g.strokeColor = STROKE;
        g.lineWidth = 3;
        g.roundRect(x0, y0, tw, th, 16);
        g.stroke();
        g.strokeColor = GOLD;
        g.lineWidth = 2;
        g.roundRect(x0 + 6, y0 + 6, tw - 12, th - 12, 12);
        g.stroke();
        this._trackerChromePainted = true;
    }

    private hitHud(uiX: number, uiY: number): boolean {
        const dock = this.node.getChildByName('QuestHud');
        if (dock && !dock.active) return false;
        return this.hitNodeLocal(this._tracker, uiX, uiY);
    }

    private hitNodeLocal(node: Node | null, uiX: number, uiY: number): boolean {
        if (!node?.isValid || !node.active) return false;
        const local = this.uiToCanvasLocal(uiX, uiY);
        const ui = node.getComponent(UITransform);
        if (!ui) return false;
        // Tracker is parented under QuestHud at (0,0) — world = local pos.
        const p = node.position;
        const hw = ui.contentSize.width * 0.5;
        const hh = ui.contentSize.height * 0.5;
        return Math.abs(local.x - p.x) <= hw && Math.abs(local.y - p.y) <= hh;
    }

    private hitNodeWorld(node: Node | null, lx: number, ly: number): boolean {
        if (!node?.isValid || !node.active || !this.panelRoot || !this._prefabRoot) return false;
        const ui = node.getComponent(UITransform);
        if (!ui) return false;
        const px = this.panelRoot.position.x + node.position.x;
        const py = this.panelRoot.position.y + node.position.y;
        const hw = ui.contentSize.width * 0.5 + 8;
        const hh = ui.contentSize.height * 0.5 + 8;
        return lx >= px - hw && lx <= px + hw && ly >= py - hh && ly <= py + hh;
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
}
