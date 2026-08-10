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
import { InputBridge } from './InputBridge';
import { MATERIAL_FRAMES } from './MaterialFrames';
import { QUEST_FRAMES, QUEST_LAYOUT, QUEST_PANEL_PREFAB_UUID } from './QuestFrames';
import { QuestSystem } from './QuestSystem';
import { RewardPopup } from './RewardPopup';
import { REWARD_FRAMES } from './RewardFrames';
import { TOOL_FRAMES } from './ToolFrames';
import { playUiClick } from './UiAudio';
import { applyUiFont, loadUiFont, styleUiLabel } from './UiFont';

const CLOSE_FRAME_UUID = TOOL_FRAMES.close;

const { ccclass, property } = _decorator;

type FrameKey = keyof typeof QUEST_FRAMES;
const L = QUEST_LAYOUT;

/** Floor = FarmInfoBoard timeLab (30). Nothing in this panel goes smaller. */
const FONT_BODY = 30;
const FONT_TITLE = 36;
const FONT_DESC = 26;

const INK = new Color(68, 40, 18, 255);
const INK_MUTE = new Color(110, 78, 42, 255);
const INK_DONE = new Color(48, 86, 40, 255);
const WOOD = new Color(176, 110, 48, 255);
const WOOD_DARK = new Color(120, 72, 32, 255);
const PARCHMENT = new Color(236, 210, 158, 255);
const GOLD = new Color(210, 150, 70, 255);
const STROKE = new Color(60, 36, 18, 255);

/**
 * Quest journal — FarmHUD bag/craft chrome (Graphics wood + parchment) + top-right X.
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
    private _questBtn: Node | null = null;
    private _trackerTitle: Label | null = null;
    private _trackerProg: Label | null = null;
    private _trackerCount: Label | null = null;
    private _prefabRoot: Node | null = null;
    private _listContent: Node | null = null;
    private _listScroll = 0;
    private _listContentH = 0;
    /** Overlay thumb — does not reserve row width. */
    private _scrollBar: Node | null = null;
    private _scrollThumb: Node | null = null;
    private _scrollBarOp: UIOpacity | null = null;
    private _scrollBarLit = false;
    private static readonly SCROLL_W = 12;
    private static readonly SCROLL_PAD = 6;
    private static readonly SCROLL_THUMB_MIN = 48;
    private static readonly SCROLL_THUMB_MAX = 90;
    private static readonly SCROLL_FADE_DELAY = 0.85;
    private static readonly ICON_WELL = 56;
    private static readonly REWARD_ICON = 30;
    /** Right rail — progress / 完成 / 可领 only (no 前往 button). */
    private static readonly PROG_RAIL_W = 100;
    private static readonly PROG_BADGE_W = 84;
    private static readonly PROG_BADGE_H = 44;
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

    /** Match FarmHUD bag badge size (UI_SCALE 1.5 → 120). */
    private static readonly HUD_BTN = 120;
    /** FarmHUD BAR_Y / BAR_H — keep quest HUD fully above the hotbar. */
    private static readonly HUD_BAR_Y = -860;
    private static readonly HUD_BAR_H = 150 + 30;
    /** Same BAR_BG_W as FarmHUD — 7×150 slots + gaps + pad. */
    private static readonly HUD_BAR_W = 7 * 150 + 6 * 4 + 6;
    /** Gap between hotbar top and quest dock bottom. */
    private static readonly HUD_CLEARANCE = 28;
    private _open = false;
    private _prevBlocking = false;
    private _frames = new Map<FrameKey, SpriteFrame>();
    private _closeFrame: SpriteFrame | null = null;
    private _iconCache = new Map<string, SpriteFrame>();
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
        this._tracker?.destroy();
        this._questBtn?.destroy();
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
            if (this._open) this.refreshPanel();
        });
        this.refreshTracker();
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
                this.ensureListViewport(true);
                this.refreshPanel();
            } else {
                InputBridge.uiBlocking = this._prevBlocking;
                if (this._prefabRoot) this._prefabRoot.active = false;
                this.setHudVisible(true);
                this.refreshTracker();
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
            if (this.hitHud(uiX, uiY)) {
                playUiClick();
                if (this.quests?.isAwaitingClaim) {
                    this.openRewardPopup();
                    return true;
                }
                this.setOpen(true);
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
        if (this.handleRowActionTap(local.x, local.y)) {
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
        const maxScroll = Math.max(0, this._listContentH - L.listH);
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

        const maxScroll = Math.max(0, this._listContentH - L.listH);
        if (maxScroll <= 0) return;

        if (this._scrollDrag === 'thumb') {
            // Finger down → thumb down → more negative scroll.
            const trackH = L.listH - QuestPanel.SCROLL_PAD * 2;
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
        const maxScroll = Math.max(0, this._listContentH - L.listH);
        if (maxScroll <= 0) return;
        const barPy = this.panelRoot.position.y + this._scrollBar.position.y;
        const localY = canvasLy - barPy;
        const trackH = L.listH - QuestPanel.SCROLL_PAD * 2;
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
        const maxScroll = Math.max(0, this._listContentH - L.listH);
        // scroll: 0 = top, -maxScroll = bottom (thumb). Content must move OPPOSITE the thumb.
        this._listScroll = Math.max(-maxScroll, Math.min(0, this._listScroll));
        const baseY = L.listH * 0.5 - this._listContentH * 0.5;
        // Minus scroll: thumb down (more negative) → content moves up → lower rows enter view.
        this._listContent.setPosition(0, baseY - this._listScroll, 0);
        // Hard cull — Graphics can ignore Mask on some builds.
        const half = L.listH * 0.5;
        const contentY = this._listContent.position.y;
        for (const row of this._listContent.children) {
            const y = contentY + row.position.y;
            const rh = L.rowH * 0.5;
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
        if (this._listContentH <= L.listH) return trackH;
        // Cap height so the thumb stays a short wood knob (not a full-height sausage).
        const raw = trackH * (L.listH / this._listContentH);
        return Math.max(
            QuestPanel.SCROLL_THUMB_MIN,
            Math.min(QuestPanel.SCROLL_THUMB_MAX, raw),
        );
    }

    /** Full content width — scrollbar overlays the right edge. */
    private listW(): number {
        return L.contentW;
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
        assetManager.loadAny({ uuid: CLOSE_FRAME_UUID }, (err, asset) => {
            if (!err && asset) this._closeFrame = asset as SpriteFrame;
            else console.warn('[QuestPanel] close frame missing', err);
            finish();
        });
    }

    private paintChrome() {
        this.paintPanelFrame();
        this.paintDimmer();
        this.paintCloseButton();
        this.paintButtons();
        // List Mask must wait until the panel is active — see ensureListViewport.
        this.ensureListViewport(false);
        this.ensureScrollBar();
        if (this.heroNode) this.heroNode.active = false;
        if (this.sectionLab) this.sectionLab.node.active = false;
        if (this.titleLab) {
            // Same title language as FarmHUD bag / craft.
            styleUiLabel(this.titleLab, {
                size: FONT_TITLE,
                color: new Color(255, 244, 214, 255),
                outline: true,
                outlineWidth: 4,
                outlineColor: new Color(62, 34, 16, 230),
            });
            applyUiFont(this.titleLab);
            this.titleLab.node.setPosition(0, L.titleY, 0);
            const tut = this.titleLab.node.getComponent(UITransform);
            // Side gutters so title never sits under the close hit plate (craft uses ~2.8×).
            if (tut) tut.setContentSize(Math.max(200, L.panelW - L.closeBtn * 2.8), 48);
        }
        // Close stays in the header band only — never overlaps the list.
        if (this.btnClose) this.btnClose.setPosition(L.closeX, L.closeY, 0);
        if (this.btnGoto) this.btnGoto.active = false;
        // Close / scrollbar above list chrome.
        if (this.panelRoot) {
            if (this.btnClose) this.btnClose.setSiblingIndex(this.panelRoot.children.length - 1);
            if (this._scrollBar) this._scrollBar.setSiblingIndex(this.panelRoot.children.length - 1);
        }
    }

    /** Same wood + parchment chrome as FarmHUD — dedicated Chrome child behind content. */
    private paintPanelFrame() {
        if (!this.panelRoot) return;
        const ut = this.panelRoot.getComponent(UITransform);
        if (ut) ut.setContentSize(L.panelW, L.panelH);
        // Prefab panel sprite is the old AI frame — hide it; draw FarmHUD chrome instead.
        const sp = this.panelRoot.getComponent(Sprite);
        if (sp) {
            sp.enabled = false;
            sp.spriteFrame = null;
        }
        // Never put Graphics on Panel itself (fights Sprite / children). Match FarmHUD.
        let chrome = this.panelRoot.getChildByName('Chrome');
        if (!chrome) {
            chrome = new Node('Chrome');
            chrome.layer = this.panelRoot.layer;
            chrome.setParent(this.panelRoot);
            chrome.addComponent(UITransform).setContentSize(L.panelW, L.panelH);
            chrome.addComponent(Graphics);
        }
        chrome.setSiblingIndex(0);
        const cut = chrome.getComponent(UITransform);
        if (cut) cut.setContentSize(L.panelW, L.panelH);
        const g = chrome.getComponent(Graphics) ?? chrome.addComponent(Graphics);
        const w = L.panelW;
        const h = L.panelH;
        const x0 = -w * 0.5;
        const y0 = -h * 0.5;
        const r = 27;
        g.clear();
        g.fillColor = WOOD;
        g.roundRect(x0, y0, w, h, r);
        g.fill();
        g.fillColor = WOOD_DARK;
        g.roundRect(x0 + 6, y0 + 6, w - 12, h - 12, r - 4);
        g.fill();
        g.fillColor = new Color(232, 198, 140, 255);
        g.roundRect(x0 + 14, y0 + 14, w - 28, h - 28, r - 8);
        g.fill();
        g.strokeColor = STROKE;
        g.lineWidth = 4;
        g.roundRect(x0, y0, w, h, r);
        g.stroke();
        g.strokeColor = GOLD;
        g.lineWidth = 3;
        g.roundRect(x0 + 8, y0 + 8, w - 16, h - 16, r - 5);
        g.stroke();
    }

    /** Top-right X — same asset / corner placement as bag & craft. */
    private paintCloseButton() {
        if (!this.btnClose) return;
        // Keep hit near the icon so it doesn't steal taps from the hero card below.
        const hit = Math.round(L.closeBtn * 1.15);
        const ut = this.btnClose.getComponent(UITransform) ?? this.btnClose.addComponent(UITransform);
        ut.setContentSize(hit, hit);
        this.btnClose.setPosition(L.closeX, L.closeY, 0);

        // Hide legacy footer label if present.
        const lab = this.btnClose.getChildByName('Label');
        if (lab) lab.active = false;

        let icon = this.btnClose.getChildByName('Icon');
        if (!icon) {
            icon = new Node('Icon');
            icon.layer = this.btnClose.layer;
            icon.setParent(this.btnClose);
            icon.addComponent(UITransform).setContentSize(L.closeBtn, L.closeBtn);
            icon.addComponent(Sprite);
        }
        const iut = icon.getComponent(UITransform);
        if (iut) iut.setContentSize(L.closeBtn, L.closeBtn);
        const sp = icon.getComponent(Sprite);
        if (!sp) return;
        sp.sizeMode = Sprite.SizeMode.CUSTOM;
        if (this._closeFrame) {
            sp.spriteFrame = this._closeFrame;
            return;
        }
        // Fallback wood X if frame not loaded yet.
        const g = this.btnClose.getComponent(Graphics) ?? this.btnClose.addComponent(Graphics);
        const half = L.closeBtn * 0.5;
        g.clear();
        g.fillColor = WOOD;
        g.roundRect(-half, -half, L.closeBtn, L.closeBtn, 15);
        g.fill();
        g.strokeColor = STROKE;
        g.lineWidth = 4;
        g.roundRect(-half, -half, L.closeBtn, L.closeBtn, 15);
        g.stroke();
        g.strokeColor = new Color(72, 42, 22, 255);
        g.lineWidth = 5;
        const m = 21;
        g.moveTo(-m, m);
        g.lineTo(m, -m);
        g.moveTo(-m, -m);
        g.lineTo(m, m);
        g.stroke();
    }

    /**
     * Clip list to the panel band above the footer buttons.
     * Mask can only be added while the node is activeInHierarchy — setting
     * Mask.type (or addComponent while inactive) hits `subComp is null`.
     */
    private ensureListViewport(attachMask = true) {
        if (!this.listHost) return;
        const lw = this.listW();
        const ut = this.listHost.getComponent(UITransform) ?? this.listHost.addComponent(UITransform);
        ut.setContentSize(lw, L.listH);
        this.listHost.setPosition(0, L.listY, 0);
        // Drop legacy loose rows from before the scroll viewport existed.
        for (const child of [...this.listHost.children]) {
            if (child.name !== 'Content') child.destroy();
        }
        let content = this.listHost.getChildByName('Content');
        if (!content) {
            content = new Node('Content');
            content.layer = this.listHost.layer;
            content.setParent(this.listHost);
            content.addComponent(UITransform).setContentSize(lw, L.listH);
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

    /** Implicit overlay scrollbar — no layout gutter; fades after idle. */
    private ensureScrollBar() {
        if (!this.panelRoot) return;
        for (const name of ['BtnScrollUp', 'BtnScrollDown']) {
            const old = this.panelRoot.getChildByName(name);
            if (old?.isValid) old.destroy();
        }

        const w = QuestPanel.SCROLL_W;
        let bar = this.panelRoot.getChildByName('ScrollBar');
        if (!bar) {
            bar = new Node('ScrollBar');
            bar.layer = this.panelRoot.layer;
            bar.setParent(this.panelRoot);
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
        // Sit on the list's right edge without shrinking rows.
        bar.setPosition(L.contentW * 0.5 - w * 0.5 - 2, L.listY, 0);
        bar.getComponent(UITransform)?.setContentSize(w, L.listH);
        this.paintScrollBar();
    }

    private flashScrollBar() {
        if (!this._scrollBar || !this._scrollBarOp) return;
        const maxScroll = Math.max(0, this._listContentH - L.listH);
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
        const maxScroll = Math.max(0, this._listContentH - L.listH);
        const need = maxScroll > 1;
        this._scrollBar.active = need;
        if (!need) {
            this._scrollBarLit = false;
            if (this._scrollBarOp) this._scrollBarOp.opacity = 0;
            return;
        }
        if (this._scrollBarOp && !this._scrollBarLit) this._scrollBarOp.opacity = 0;

        const w = QuestPanel.SCROLL_W;
        const pad = QuestPanel.SCROLL_PAD;
        const trackH = L.listH - pad * 2;
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
        if (!this._trackerTitle || !this._trackerProg) return;
        const q = this.quests?.activeQuest;
        if (!q || this.quests?.isFinished) {
            this._trackerTitle.string = '旅途日志';
            this._trackerProg.string = this.quests?.isFinished ? '主线已完成' : '加载中…';
            if (this._trackerCount) {
                this._trackerCount.string = '';
                styleUiLabel(this._trackerCount, { size: FONT_BODY, color: INK, outline: false });
            }
            return;
        }
        this._trackerTitle.string = q.name;
        if (this.quests!.isAwaitingClaim) {
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
            return;
        }
        const prog = this.quests!.progressOf(q);
        this._trackerProg.string = this.quests!.objectiveLabel(q);
        if (this._trackerCount) {
            this._trackerCount.string = `${prog.current} / ${prog.target}`;
            styleUiLabel(this._trackerCount, { size: FONT_BODY, color: INK, outline: false });
            applyUiFont(this._trackerCount);
        }
    }

    private refreshPanel() {
        if (!this.listHost || !this.quests) return;
        const q = this.quests.activeQuest;

        this.ensureListViewport();
        const content = this._listContent;
        if (!content) return;
        content.removeAllChildren();
        this._rowActions.clear();

        // Current quest only — completed / locked steps stay out of the journal.
        const quests = this.quests.visibleQuests();
        const activeId = q?.id ?? -1;
        const n = quests.length;
        const totalH = n > 0 ? n * L.rowH + Math.max(0, n - 1) * L.rowGap : L.listH;
        this._listContentH = totalH;
        const lw = this.listW();
        content.getComponent(UITransform)?.setContentSize(lw, totalH);

        let y = totalH * 0.5 - L.rowH * 0.5;
        let activeIndex = 0;
        for (let i = 0; i < n; i++) {
            const quest = quests[i];
            if (quest.id === activeId) activeIndex = i;
            this.addQuestRow(
                content,
                quest,
                quest.id === activeId,
                this.quests.isCompleted(quest.id),
                y,
            );
            y -= L.rowH + L.rowGap;
        }

        const rowPitch = L.rowH + L.rowGap;
        const maxScroll = Math.max(0, totalH - L.listH);
        this._listScroll = -Math.min(maxScroll, activeIndex * rowPitch);
        this.applyListScroll();
    }

    /**
     * Quest card (no 前往 button):
     *   [icon]  title                         ║
     *           desc (up to two lines)        ║  [0/3]
     *           奖励  💰 ×20                   ║
     * Left column shares one edge; progress sits in a right rail, vertically centered.
     */
    private addQuestRow(host: Node, q: CQuest, active: boolean, done: boolean, y: number) {
        const rw = this.listW();
        const rh = L.rowH;
        const row = new Node(`Q_${q.id}`);
        row.layer = host.layer;
        row.setParent(host);
        row.setPosition(0, y, 0);
        row.addComponent(UITransform).setContentSize(rw, rh);

        const g = row.addComponent(Graphics);
        this.paintRowPlate(g, rw, rh, active, done);

        const padL = 20;
        const padR = 14;
        const gap = 16;
        const well = QuestPanel.ICON_WELL;
        const showProg = active || done;
        // Reserve badge width only — extra rail padding was eating desc space.
        const railW = showProg ? QuestPanel.PROG_BADGE_W + 8 : 0;
        const railX = rw * 0.5 - padR - railW * 0.5;
        const bodyRight = (showProg ? railX - railW * 0.5 : rw * 0.5 - padR) - gap;
        const wellX = -rw * 0.5 + padL + well * 0.5;
        const textLeft = wellX + well * 0.5 + gap;
        const bodyW = Math.max(180, bodyRight - textLeft);

        const ink = done ? INK_DONE : INK;
        const mute = done ? new Color(70, 100, 58, 255) : INK_MUTE;

        // Icon — vertically centered with the whole card.
        this.paintIconWell(g, wellX, 0, well, done);
        const iconUuid = this.iconUuidFor(q);
        if (iconUuid) {
            const iconN = new Node('Icon');
            iconN.layer = host.layer;
            iconN.setParent(row);
            iconN.setPosition(wellX, 0, 0);
            iconN.addComponent(UITransform).setContentSize(L.icon, L.icon);
            const isp = iconN.addComponent(Sprite);
            isp.sizeMode = Sprite.SizeMode.CUSTOM;
            if (done) isp.color = new Color(230, 230, 230, 230);
            this.loadIcon(iconUuid, isp);
        }

        // Text stack — title / wrapped desc / rewards.
        const titleY = 44;
        const descY = 10;
        const rewardY = -48;
        const descH = 58;

        const nameN = new Node('Name');
        nameN.layer = host.layer;
        nameN.setParent(row);
        nameN.setPosition(textLeft, titleY, 0);
        const nameUt = nameN.addComponent(UITransform);
        nameUt.setContentSize(bodyW, 34);
        nameUt.setAnchorPoint(0, 0.5);
        const name = nameN.addComponent(Label);
        name.string = q.name;
        name.overflow = Label.Overflow.CLAMP;
        name.horizontalAlign = Label.HorizontalAlign.LEFT;
        name.verticalAlign = Label.VerticalAlign.CENTER;
        styleUiLabel(name, { size: FONT_BODY, color: ink, outline: false });
        applyUiFont(name);

        const descN = new Node('Desc');
        descN.layer = host.layer;
        descN.setParent(row);
        descN.setPosition(textLeft, descY, 0);
        const dUt = descN.addComponent(UITransform);
        dUt.setContentSize(bodyW, descH);
        dUt.setAnchorPoint(0, 1);
        const desc = descN.addComponent(Label);
        desc.string = q.desc;
        desc.overflow = Label.Overflow.CLAMP;
        desc.enableWrapText = true;
        desc.horizontalAlign = Label.HorizontalAlign.LEFT;
        desc.verticalAlign = Label.VerticalAlign.TOP;
        styleUiLabel(desc, { size: FONT_DESC, color: mute, outline: false });
        desc.lineHeight = FONT_DESC + 4;
        applyUiFont(desc);

        this.addRewardChips(row, q, textLeft, rewardY, done);

        if (showProg) {
            const badge = this.addProgBadge(row, q, railX, 0, active, done);
            // Only claimable rows are tappable — 前往 removed.
            if (active && this.quests?.isAwaitingClaim && badge) {
                this._rowActions.set(q.id, badge);
            }
        }
    }

    private paintIconWell(g: Graphics, cx: number, cy: number, size: number, done: boolean) {
        const x0 = cx - size * 0.5;
        const y0 = cy - size * 0.5;
        g.fillColor = done ? new Color(120, 140, 80, 255) : WOOD_DARK;
        g.roundRect(x0, y0, size, size, 12);
        g.fill();
        g.fillColor = done ? new Color(200, 214, 150, 255) : new Color(232, 204, 148, 255);
        g.roundRect(x0 + 4, y0 + 4, size - 8, size - 8, 9);
        g.fill();
        g.strokeColor = done ? new Color(70, 110, 50, 255) : STROKE;
        g.lineWidth = 2;
        g.roundRect(x0, y0, size, size, 12);
        g.stroke();
        if (!done) {
            g.strokeColor = GOLD;
            g.lineWidth = 2;
            g.roundRect(x0 + 3, y0 + 3, size - 6, size - 6, 10);
            g.stroke();
        }
    }

    /** Progress / 完成 / 可领 pill — right rail, vertically centered. */
    private addProgBadge(
        row: Node,
        q: CQuest,
        cx: number,
        cy: number,
        active: boolean,
        done: boolean,
    ): Node | null {
        const claimable = active && !!this.quests?.isAwaitingClaim;
        let text = '';
        if (done) text = '完成';
        else if (claimable) text = '领奖';
        else if (active && this.quests) {
            const p = this.quests.progressOf(q);
            text = `${p.current}/${p.target}`;
        }
        if (!text) return null;

        const w = QuestPanel.PROG_BADGE_W;
        const h = QuestPanel.PROG_BADGE_H;
        const badge = new Node('Prog');
        badge.layer = row.layer;
        badge.setParent(row);
        badge.setPosition(cx, cy, 0);
        badge.addComponent(UITransform).setContentSize(w, h);
        const bg = badge.addComponent(Graphics);
        const x0 = -w * 0.5;
        const y0 = -h * 0.5;
        if (done || claimable) {
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
        labN.setPosition(0, 0, 0);
        labN.addComponent(UITransform).setContentSize(w, h);
        const lab = labN.addComponent(Label);
        lab.string = text;
        lab.horizontalAlign = Label.HorizontalAlign.CENTER;
        lab.verticalAlign = Label.VerticalAlign.CENTER;
        styleUiLabel(lab, {
            size: claimable ? FONT_BODY : FONT_DESC,
            color: done || claimable ? new Color(255, 252, 230, 255) : INK,
            outline: done || claimable,
            outlineWidth: 3,
            outlineColor: new Color(40, 24, 12, 220),
        });
        applyUiFont(lab);
        return badge;
    }

    /**
     * Reward line — no chip plate:
     *   奖励  🪙 ×20  [item] ×1
     * Caption + gold-tinted ×count make it read as a prize, not body copy.
     */
    private addRewardChips(row: Node, q: CQuest, left: number, cy: number, muted: boolean) {
        const rewards = this.listRewards(q);
        if (rewards.length <= 0) return;

        const iconS = QuestPanel.REWARD_ICON;
        const gapIcon = 6;
        const numW = 110;
        const itemGap = 18;
        const itemH = Math.max(iconS, 34);
        const captionW = 72;
        const captionColor = muted ? new Color(90, 120, 60, 255) : new Color(168, 108, 36, 255);
        const numColor = muted ? new Color(70, 110, 50, 255) : new Color(176, 96, 24, 255);

        let x = left;

        const capN = new Node('RewardCap');
        capN.layer = row.layer;
        capN.setParent(row);
        capN.setPosition(x, cy, 0);
        const capUt = capN.addComponent(UITransform);
        capUt.setContentSize(captionW, itemH);
        capUt.setAnchorPoint(0, 0.5);
        const cap = capN.addComponent(Label);
        cap.string = '奖励';
        cap.horizontalAlign = Label.HorizontalAlign.LEFT;
        cap.verticalAlign = Label.VerticalAlign.CENTER;
        styleUiLabel(cap, { size: FONT_DESC, color: captionColor, outline: false });
        applyUiFont(cap);
        x += captionW;

        for (const r of rewards) {
            const itemW = (r.uuid ? iconS + gapIcon : 0) + numW;
            const chip = new Node('Reward');
            chip.layer = row.layer;
            chip.setParent(row);
            chip.setPosition(x, cy, 0);
            const cut = chip.addComponent(UITransform);
            cut.setContentSize(itemW, itemH);
            cut.setAnchorPoint(0, 0.5);

            let numX = 0;
            if (r.uuid) {
                const iconN = new Node('Icon');
                iconN.layer = row.layer;
                iconN.setParent(chip);
                iconN.setPosition(iconS * 0.5, 0, 0);
                iconN.addComponent(UITransform).setContentSize(iconS, iconS);
                const isp = iconN.addComponent(Sprite);
                isp.sizeMode = Sprite.SizeMode.CUSTOM;
                isp.trim = false;
                if (muted) isp.color = new Color(210, 210, 210, 230);
                this.loadIcon(r.uuid, isp);
                numX = iconS + gapIcon;
            }

            const labN = new Node('Num');
            labN.layer = row.layer;
            labN.setParent(chip);
            labN.setPosition(numX, 0, 0);
            const lut = labN.addComponent(UITransform);
            lut.setContentSize(numW, itemH);
            lut.setAnchorPoint(0, 0.5);
            const lab = labN.addComponent(Label);
            lab.string = r.label;
            lab.horizontalAlign = Label.HorizontalAlign.LEFT;
            lab.verticalAlign = Label.VerticalAlign.CENTER;
            styleUiLabel(lab, { size: FONT_BODY, color: numColor, outline: false });
            applyUiFont(lab);

            x += itemW + itemGap;
        }
    }

    private listRewards(q: CQuest): { uuid: string | null; label: string }[] {
        const out: { uuid: string | null; label: string }[] = [];
        if (q.rewardGold > 0) {
            out.push({
                uuid: this.rewardIconUuid('gold'),
                label: `金币 x ${q.rewardGold}`,
            });
        }
        if (q.rewardItem && q.rewardCount > 0) {
            out.push({
                uuid: this.rewardIconUuid(q.rewardItem),
                label: `${this.rewardItemName(q.rewardItem)} x ${q.rewardCount}`,
            });
        }
        return out;
    }

    private rewardItemName(kind: string): string {
        const k = (kind || '').toLowerCase().replace(/[\s-]+/g, '_');
        const map: Record<string, string> = {
            gold: '金币',
            coin: '金币',
            money: '金币',
            seeds: '种子',
            seed: '种子',
            boost: '催熟剂',
            grass: '草料',
            wood: '木材',
            dirt: '泥土',
            stone: '石料',
            fish: '鱼',
            copper: '铜矿',
            iron: '铁矿',
            goldore: '金矿',
            gold_ore: '金矿',
            parsnip: '防风草',
        };
        return map[k] ?? kind;
    }

    /**
     * Resolve a reward chip icon. Prefer REWARD_FRAMES (dedicated AI icons),
     * then material / tool frames. Add new kinds in reward-frames.json.
     */
    private rewardIconUuid(kind: string): string | null {
        const k = (kind || '').toLowerCase().replace(/[\s-]+/g, '_');
        if (!k) return null;

        const reward = REWARD_FRAMES as Record<string, string | undefined>;
        if (reward[k]) return reward[k] ?? null;

        if (k === 'gold' || k === 'coin' || k === 'money') {
            return REWARD_FRAMES.gold ?? MATERIAL_FRAMES.gold ?? null;
        }
        if (k === 'seeds' || k.includes('seed')) return TOOL_FRAMES.seeds ?? null;
        if (k === 'boost') return TOOL_FRAMES.boost ?? null;
        if (k === 'grass') return MATERIAL_FRAMES.grass ?? null;
        if (k === 'wood') return MATERIAL_FRAMES.wood ?? null;
        if (k === 'dirt') return MATERIAL_FRAMES.dirt ?? null;
        if (k === 'stone') return MATERIAL_FRAMES.stone ?? null;
        if (k === 'fish') return MATERIAL_FRAMES.fish ?? null;
        if (k === 'copper') return MATERIAL_FRAMES.copper ?? null;
        if (k === 'iron') return MATERIAL_FRAMES.iron ?? null;
        if (k === 'goldore' || k === 'gold_ore') return MATERIAL_FRAMES.goldOre ?? null;
        if (k === 'parsnip') return MATERIAL_FRAMES.parsnip ?? null;
        return null;
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
        const x0 = -w * 0.5;
        const y0 = -h * 0.5;
        g.clear();
        if (done) {
            g.fillColor = new Color(168, 186, 120, 255);
            g.roundRect(x0, y0, w, h, 12);
            g.fill();
            g.fillColor = new Color(210, 220, 170, 255);
            g.roundRect(x0 + 3, y0 + 3, w - 6, h - 6, 10);
            g.fill();
            g.strokeColor = new Color(70, 110, 50, 255);
            g.lineWidth = 2;
            g.roundRect(x0, y0, w, h, 12);
            g.stroke();
            return;
        }
        if (active) {
            g.fillColor = WOOD;
            g.roundRect(x0, y0, w, h, 12);
            g.fill();
            g.fillColor = PARCHMENT;
            g.roundRect(x0 + 4, y0 + 4, w - 8, h - 8, 10);
            g.fill();
            g.strokeColor = GOLD;
            g.lineWidth = 3;
            g.roundRect(x0 + 1, y0 + 1, w - 2, h - 2, 11);
            g.stroke();
            g.strokeColor = STROKE;
            g.lineWidth = 2;
            g.roundRect(x0, y0, w, h, 12);
            g.stroke();
            return;
        }
        g.fillColor = new Color(150, 96, 48, 255);
        g.roundRect(x0, y0, w, h, 12);
        g.fill();
        g.fillColor = new Color(210, 176, 120, 255);
        g.roundRect(x0 + 3, y0 + 3, w - 6, h - 6, 10);
        g.fill();
        g.strokeColor = WOOD_DARK;
        g.lineWidth = 2;
        g.roundRect(x0, y0, w, h, 12);
        g.stroke();
    }

    private setHudVisible(visible: boolean) {
        const dock = this.node.getChildByName('QuestHud');
        if (dock) dock.active = visible;
        else {
            if (this._questBtn) this._questBtn.active = visible;
            if (this._tracker) this._tracker.active = visible;
        }
        // Action cue sits under the panel in Y but often above it in sibling order.
        const hint = this.node.getChildByName('FarmActionHint');
        if (hint) hint.active = visible;
    }

    private buildTracker() {
        const canvas = this.node;
        for (const name of ['QuestHud', 'QuestTracker', 'QuestBtn']) {
            const old = canvas.getChildByName(name);
            if (old) old.destroy();
        }

        const btnSize = QuestPanel.HUD_BTN;
        const edgePad = 16;
        const gap = 14;
        const tw = 420;
        const th = 120;
        // Sit fully above the hotbar (bag badge can sit on the dock; this chip cannot).
        const hotbarTop = QuestPanel.HUD_BAR_Y + QuestPanel.HUD_BAR_H * 0.5;
        const dockH = Math.max(btnSize, th);
        const dockY = hotbarTop + QuestPanel.HUD_CLEARANCE + dockH * 0.5;
        const barHalf = QuestPanel.HUD_BAR_W * 0.5;
        const btnX = -barHalf + btnSize * 0.5 + edgePad;
        const barX = btnX + btnSize * 0.5 + gap + tw * 0.5;

        // Parent dock so z-order stays together above world, below modal panels.
        const dock = new Node('QuestHud');
        dock.layer = canvas.layer;
        dock.setParent(canvas);
        dock.setPosition(0, 0, 0);
        dock.addComponent(UITransform).setContentSize(1, 1);

        // --- Quest badge: same 120px footprint as bag button ---
        const btn = new Node('QuestBtn');
        btn.layer = canvas.layer;
        btn.setParent(dock);
        btn.setPosition(btnX, dockY, 0);
        btn.addComponent(UITransform).setContentSize(btnSize, btnSize);

        const face = new Node('Face');
        face.layer = canvas.layer;
        face.setParent(btn);
        face.setPosition(0, 0, 0);
        const faceUt = face.addComponent(UITransform);
        faceUt.setContentSize(btnSize, btnSize);
        const sf = this._frames.get('questBtn');
        if (sf) {
            const sp = face.addComponent(Sprite);
            sp.sizeMode = Sprite.SizeMode.CUSTOM;
            sp.type = Sprite.Type.SIMPLE;
            sp.spriteFrame = sf;
            faceUt.setContentSize(btnSize, btnSize);
            sp.sizeMode = Sprite.SizeMode.CUSTOM;
        } else {
            // Visible fallback so a missing frame never "hides" the badge.
            const g = face.addComponent(Graphics);
            this.paintQuestBadgeFallback(g, btnSize);
        }
        this._questBtn = btn;

        // --- Tracker chip beside the badge ---
        const bar = new Node('QuestTracker');
        bar.layer = canvas.layer;
        bar.setParent(dock);
        bar.setPosition(barX, dockY, 0);
        bar.addComponent(UITransform).setContentSize(tw, th);

        const g = bar.addComponent(Graphics);
        const x0 = -tw * 0.5;
        const y0 = -th * 0.5;
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

        const textLeft = x0 + 24;
        const textRight = -x0 - 24;
        const objW = tw - 48 - 110;
        const countW = 100;

        // Title left; objective left + progress right on the second row.
        const titleY = 18;
        const rowY = -22;

        const titleN = new Node('Title');
        titleN.layer = canvas.layer;
        titleN.setParent(bar);
        titleN.setPosition(textLeft, titleY, 0);
        const tUt = titleN.addComponent(UITransform);
        tUt.setContentSize(tw - 48, 40);
        tUt.setAnchorPoint(0, 0.5);
        const title = titleN.addComponent(Label);
        title.horizontalAlign = Label.HorizontalAlign.LEFT;
        title.verticalAlign = Label.VerticalAlign.CENTER;
        styleUiLabel(title, { size: FONT_BODY, color: INK, outline: false });
        title.lineHeight = FONT_BODY + 14;
        title.spacingX = 2;
        this._trackerTitle = title;

        const progN = new Node('Prog');
        progN.layer = canvas.layer;
        progN.setParent(bar);
        progN.setPosition(textLeft, rowY, 0);
        const pUt = progN.addComponent(UITransform);
        pUt.setContentSize(objW, 40);
        pUt.setAnchorPoint(0, 0.5);
        const prog = progN.addComponent(Label);
        prog.horizontalAlign = Label.HorizontalAlign.LEFT;
        prog.verticalAlign = Label.VerticalAlign.CENTER;
        styleUiLabel(prog, { size: FONT_BODY, color: INK_MUTE, outline: false });
        prog.lineHeight = FONT_BODY + 14;
        prog.spacingX = 2;
        this._trackerProg = prog;

        const countN = new Node('Count');
        countN.layer = canvas.layer;
        countN.setParent(bar);
        countN.setPosition(textRight, rowY, 0);
        const cUt = countN.addComponent(UITransform);
        cUt.setContentSize(countW, 40);
        cUt.setAnchorPoint(1, 0.5);
        const count = countN.addComponent(Label);
        count.horizontalAlign = Label.HorizontalAlign.RIGHT;
        count.verticalAlign = Label.VerticalAlign.CENTER;
        styleUiLabel(count, { size: FONT_BODY, color: INK, outline: false });
        count.lineHeight = FONT_BODY + 14;
        count.spacingX = 2;
        this._trackerCount = count;

        this._tracker = bar;
        applyUiFont(title);
        applyUiFont(prog);
        applyUiFont(count);

        // Above hotbar / world chrome so the full 120px badge stays visible.
        dock.setSiblingIndex(canvas.children.length - 1);
    }

    private paintQuestBadgeFallback(g: Graphics, size: number) {
        const half = size * 0.5;
        g.clear();
        g.fillColor = new Color(217, 155, 62, 255);
        g.roundRect(-half, -half, size, size, 22);
        g.fill();
        g.fillColor = new Color(116, 71, 20, 255);
        g.roundRect(-half + 16, -half + 16, size - 32, size - 32, 16);
        g.fill();
        g.fillColor = new Color(245, 228, 186, 255);
        g.roundRect(-18, -28, 36, 56, 6);
        g.fill();
        g.fillColor = new Color(120, 62, 28, 255);
        g.rect(-20, -4, 40, 10);
        g.fill();
        g.fillColor = new Color(90, 150, 60, 255);
        g.circle(16, 12, 6);
        g.fill();
        g.strokeColor = new Color(28, 20, 14, 255);
        g.lineWidth = 4;
        g.roundRect(-half, -half, size, size, 22);
        g.stroke();
    }

    private iconUuidFor(q: CQuest): string | null {
        const p = (q.param || '').toLowerCase();
        if (p === 'grass' || q.id === 1001) return MATERIAL_FRAMES.grass ?? null;
        if (p === 'wood') return MATERIAL_FRAMES.wood ?? null;
        if (p === 'dirt') return MATERIAL_FRAMES.dirt ?? null;
        if (p === 'stone') return MATERIAL_FRAMES.stone ?? null;
        if (p === 'fish' || q.id === 1007) return MATERIAL_FRAMES.fish ?? null;
        if (p.includes('seed') || q.id === 1003 || q.id === 1004) return TOOL_FRAMES.seeds ?? null;
        if (q.id === 1002) return TOOL_FRAMES.hoe ?? null;
        if (q.id === 1005) return TOOL_FRAMES.can ?? null;
        if (q.id === 1006) return TOOL_FRAMES.boost ?? TOOL_FRAMES.hand ?? null;
        return null;
    }

    private loadIcon(uuid: string, sp: Sprite) {
        const cached = this._iconCache.get(uuid);
        if (cached) {
            sp.spriteFrame = cached;
            return;
        }
        assetManager.loadAny({ uuid }, (err, asset) => {
            if (err || !asset || !sp.isValid) return;
            const sf = asset as SpriteFrame;
            this._iconCache.set(uuid, sf);
            sp.spriteFrame = sf;
        });
    }

    private paintBar(g: Graphics | null, ratio: number, w: number, h: number) {
        if (!g?.isValid) return;
        g.clear();
        const x0 = -w * 0.5;
        const y0 = -h * 0.5;
        g.fillColor = new Color(70, 48, 28, 200);
        g.roundRect(x0, y0, w, h, h * 0.45);
        g.fill();
        const fillW = Math.max(0, Math.min(1, ratio)) * (w - 4);
        if (fillW > 1) {
            g.fillColor = new Color(110, 180, 70, 255);
            g.roundRect(x0 + 2, y0 + 2, fillW, h - 4, (h - 4) * 0.45);
            g.fill();
        }
    }

    private hitHud(uiX: number, uiY: number): boolean {
        const dock = this.node.getChildByName('QuestHud');
        if (dock && !dock.active) return false;
        return this.hitNodeLocal(this._questBtn, uiX, uiY) || this.hitNodeLocal(this._tracker, uiX, uiY);
    }

    private hitNodeLocal(node: Node | null, uiX: number, uiY: number): boolean {
        if (!node?.isValid || !node.active) return false;
        const local = this.uiToCanvasLocal(uiX, uiY);
        const ui = node.getComponent(UITransform);
        if (!ui) return false;
        // QuestBtn/Tracker are parented under QuestHud at (0,0) — world = local pos.
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
