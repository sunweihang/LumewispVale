import {
    _decorator,
    Color,
    Component,
    EventKeyboard,
    Graphics,
    Input,
    KeyCode,
    Label,
    Node,
    Prefab,
    UITransform,
    assetManager,
    director,
    input,
    instantiate,
    view,
} from 'cc';
import { ItemType } from '../cfg/schema';
import { FarmHUD } from './FarmHUD';
import { FarmInfoBoard } from './FarmInfoBoard';
import { FarmSystem } from './FarmSystem';
import { FarmWorldLayout } from './FarmWorldLayout';
import {
    GM_CHIP_PREFAB_UUID,
    GM_PANEL_LAYOUT as L,
    GM_PANEL_PREFAB_UUID,
    GM_TAB_IDS,
} from './GmPanelFrames';
import { InputBridge } from './InputBridge';
import { GameState } from './GameState';
import { STAMINA_MAX } from './DayRules';
import { gmGrantItems } from './ItemCatalog';
import { travelTo, type TravelMapId } from './MapTravel';
import { MineWorldLayout } from './MineWorldLayout';
import { QuestSystem } from './QuestSystem';
import { StoryDialogue } from './StoryDialogue';
import { TownWorldLayout } from './TownWorldLayout';
import { TutorialGuide } from './TutorialGuide';
import {
    UI_CREAM,
    UI_GOLD,
    UI_INK,
    UI_INK_MUTE,
    UI_STROKE,
    applyParchmentRow,
    applyWoodButton,
    applyWoodPanel,
    loadPanelCloseFrame,
    paintPanelCloseVisual,
    placePanelCloseButton,
} from './UiChrome';
import { applyUiFont, loadUiFont, styleUiLabel } from './UiFont';

const { ccclass } = _decorator;

type GmBtn = {
    node: Node;
    action: () => void;
};

type GmTabId = 'time' | 'item' | 'quest' | 'qtest' | 'system';

type GmTabDef = {
    id: GmTabId;
    label: string;
};

const GM_TABS: GmTabDef[] = [
    { id: 'time', label: '时间' },
    { id: 'item', label: '道具' },
    { id: 'quest', label: '章节' },
    { id: 'qtest', label: '测任务' },
    { id: 'system', label: '系统' },
];

const CHAPTER_LABEL: Record<string, string> = {
    farm: '农场',
    town: '城镇',
    market: '市集',
    spring: '春厅',
};

const QTEST_PAGE_SIZE = 6;
const SECTION_GAP = 22;
const CARD_PAD_Y = 18;
const CARD_INNER_GAP = 14;
/** Match QuestPanel / TownShop — GM was shipping 18–22 and looked tiny. */
const FONT_TITLE = 36;
const FONT_TAB = 28;
const FONT_SECTION = 28;
const FONT_BTN = 28;
const FONT_HINT = 22;
const FONT_CLOCK = 64;
const FONT_DATE = 28;
const BTN_H = 64;
const BTN_H_COMPACT = 56;

/**
 * Dev / GM overlay: farm clock, grant items, skip newbie tutorial, jump quests.
 * Toggle: F1 or ` · Esc closes · small GM chip stays on-screen.
 */
@ccclass('GmPanel')
export class GmPanel extends Component {
    infoBoard: FarmInfoBoard | null = null;

    private _open = false;
    private _prevBlocking = false;
    private _chip: Node | null = null;
    private _root: Node | null = null;
    private _clockLab: Label | null = null;
    private _dateLab: Label | null = null;
    private _pauseLab: Label | null = null;
    private _qtestStatusLab: Label | null = null;
    private _qtestPageLab: Label | null = null;
    private _qtestListHost: Node | null = null;
    private _qtestPage = 0;
    private _btns: GmBtn[] = [];
    private _chipHit = { x: 0, y: 0, hw: 0, hh: 0 };
    private _tab: GmTabId = 'time';
    private _tabPages = new Map<GmTabId, Node>();
    private _tabBtns = new Map<GmTabId, Node>();
    /** Inner content width for the active panel. */
    private _contentW = L.contentW;
    /** Top-down layout cursor (page-local Y). */
    private _layY = 0;
    private _panelPrefab: Prefab | null = null;
    private _chipPrefab: Prefab | null = null;
    private _chromePainted = false;
    private _pagesHost: Node | null = null;
    private _closeBtn: Node | null = null;

    onLoad() {
        InputBridge.gmUiHit = (x, y) => this.hitChip(x, y) || this._open;
        input.on(Input.EventType.KEY_DOWN, this.onKey, this);
        this.preloadPrefabs();
        loadUiFont().then((font) => {
            if (!font) return;
            const title = this._chip?.getChildByName('Label')?.getComponent(Label);
            if (title) applyUiFont(title);
            if (this._clockLab) applyUiFont(this._clockLab);
            if (this._dateLab) applyUiFont(this._dateLab);
            if (this._pauseLab) applyUiFont(this._pauseLab);
        });
    }

    onDestroy() {
        if (InputBridge.gmUiHit) InputBridge.gmUiHit = null;
        InputBridge.gmPanelOpen = false;
        input.off(Input.EventType.KEY_DOWN, this.onKey, this);
        if (this._open) InputBridge.uiBlocking = this._prevBlocking;
        this._root?.destroy();
        this._chip?.destroy();
    }

    get isOpen(): boolean {
        return this._open;
    }

    setInfoBoard(info: FarmInfoBoard | null) {
        this.infoBoard = info;
        if (this._open) this.refreshLabels();
    }

    toggle() {
        this.setOpen(!this._open);
    }

    setOpen(open: boolean) {
        if (open === this._open) {
            if (open) this.refreshLabels();
            return;
        }
        this._open = open;
        InputBridge.gmPanelOpen = open;
        if (open) {
            this._prevBlocking = InputBridge.uiBlocking;
            InputBridge.uiBlocking = true;
            InputBridge.clear();
            this.buildPanel();
            this.bringFront();
            this.refreshLabels();
        } else {
            InputBridge.uiBlocking = this._prevBlocking;
            if (this._root?.isValid) this._root.destroy();
            this._root = null;
            this._clockLab = null;
            this._dateLab = null;
            this._pauseLab = null;
            this._qtestStatusLab = null;
            this._qtestPageLab = null;
            this._qtestListHost = null;
            this._pagesHost = null;
            this._closeBtn = null;
            this._chromePainted = false;
            this._btns = [];
            this._tabPages.clear();
            this._tabBtns.clear();
        }
        if (this._chip) this._chip.active = !open;
    }

    /** UI coords origin bottom-left. Returns true if consumed. */
    handleTap(uiX: number, uiY: number): boolean {
        if (!this._open) {
            if (this.hitChip(uiX, uiY)) {
                this.setOpen(true);
                return true;
            }
            return false;
        }
        const local = this.uiToCanvasLocal(uiX, uiY);
        for (const b of this._btns) {
            if (this.hitNode(b.node, local.x, local.y)) {
                b.action();
                this.refreshLabels();
                return true;
            }
        }
        // Dimmer swallows the rest.
        return true;
    }

    update() {
        if (!this._open) return;
        this.bringFront();
        this.refreshLabels();
    }

    /** Keep GM above TutorialGuide / HUD / toasts while open. */
    private bringFront() {
        if (!this._root?.isValid) return;
        const want = this.node.children.length - 1;
        if (this._root.getSiblingIndex() !== want) this._root.setSiblingIndex(want);
    }

    private onKey = (e: EventKeyboard) => {
        if (e.keyCode === KeyCode.F1 || e.keyCode === KeyCode.BACK_QUOTE) {
            this.toggle();
            return;
        }
        if (e.keyCode === KeyCode.ESCAPE && this._open) {
            this.setOpen(false);
        }
    };

    private preloadPrefabs() {
        assetManager.loadAny({ uuid: GM_CHIP_PREFAB_UUID }, (err, asset) => {
            if (err || !asset) {
                console.warn('[GmPanel] chip prefab missing', err);
                return;
            }
            this._chipPrefab = asset as Prefab;
            this.mountChip();
        });
        assetManager.loadAny({ uuid: GM_PANEL_PREFAB_UUID }, (err, asset) => {
            if (err || !asset) {
                console.warn('[GmPanel] panel prefab missing', err);
                return;
            }
            this._panelPrefab = asset as Prefab;
        });
    }

    private mountChip() {
        const canvas = this.node;
        const old = canvas.getChildByName('GmChip');
        if (old) old.destroy();
        if (!this._chipPrefab) return;

        const chip = instantiate(this._chipPrefab);
        chip.name = 'GmChip';
        chip.layer = canvas.layer;
        chip.setParent(canvas);
        chip.setSiblingIndex(canvas.children.length - 1);
        const { halfW, halfH } = this.canvasHalf();
        const x = -halfW + 48;
        const y = halfH - 56;
        chip.setPosition(x, y, 0);
        this.paintChipChrome(chip);
        const lab = chip.getChildByName('Label')?.getComponent(Label);
        if (lab) {
            styleUiLabel(lab, {
                size: 22,
                color: new Color(255, 236, 180, 255),
                outline: true,
                outlineWidth: 3,
            });
            applyUiFont(lab);
        }
        this._chip = chip;
        this._chipHit = { x, y, hw: L.chipW * 0.5 + 8, hh: L.chipH * 0.5 + 8 };
    }

    private paintChipChrome(chip: Node) {
        const g = chip.getComponent(Graphics);
        if (!g) return;
        const w = L.chipW;
        const h = L.chipH;
        g.clear();
        g.fillColor = new Color(54, 40, 28, 210);
        g.roundRect(-w * 0.5, -h * 0.5, w, h, 10);
        g.fill();
        g.strokeColor = new Color(232, 198, 140, 230);
        g.lineWidth = 3;
        g.roundRect(-w * 0.5, -h * 0.5, w, h, 10);
        g.stroke();
    }

    private buildPanel() {
        const canvas = this.node;
        const old = canvas.getChildByName('GmPanel');
        if (old) old.destroy();
        const oldDim = canvas.getChildByName('GmDimmer');
        if (oldDim) oldDim.destroy();
        this._btns = [];
        this._tabPages.clear();
        this._tabBtns.clear();
        this._chromePainted = false;
        this._pagesHost = null;
        this._closeBtn = null;
        this._contentW = L.contentW;
        if (!GM_TABS.some((t) => t.id === this._tab)) this._tab = 'time';

        const finish = (root: Node) => {
            root.name = 'GmPanel';
            root.layer = canvas.layer;
            root.setParent(canvas);
            root.active = true;
            this._root = root;
            this.bindPanelRefs(root);
            this.paintPanelChromeOnce();
            this.populatePages();
            this.applyTabVisuals();
            this.bringFront();
            loadUiFont().then((font) => {
                if (!font || !root.isValid) return;
                for (const lab of root.getComponentsInChildren(Label)) applyUiFont(lab);
            });
        };

        if (this._panelPrefab) {
            finish(instantiate(this._panelPrefab));
            return;
        }
        assetManager.loadAny({ uuid: GM_PANEL_PREFAB_UUID }, (err, asset) => {
            if (err || !asset) {
                console.warn('[GmPanel] panel prefab missing', err);
                return;
            }
            this._panelPrefab = asset as Prefab;
            if (!this._open) return;
            finish(instantiate(this._panelPrefab));
        });
    }

    private bindPanelRefs(root: Node) {
        const panel = root.getChildByName('Panel');
        if (!panel) return;
        this._closeBtn = panel.getChildByName('Close');
        if (this._closeBtn) {
            this._btns.push({ node: this._closeBtn, action: () => this.setOpen(false) });
        }
        for (const id of GM_TAB_IDS) {
            const btn = panel.getChildByName(`Tab_${id}`);
            if (!btn) continue;
            this._tabBtns.set(id, btn);
            this._btns.push({ node: btn, action: () => this.selectTab(id) });
            const lab = btn.getChildByName('Label')?.getComponent(Label);
            if (lab) styleUiLabel(lab, { size: FONT_TAB, color: UI_INK, outline: false });
        }
        this._pagesHost = panel.getChildByName('Pages');
        const title = panel.getChildByName('Title')?.getComponent(Label);
        if (title) {
            styleUiLabel(title, {
                size: FONT_TITLE,
                color: new Color(255, 244, 214, 255),
                outline: true,
            });
        }
        const hint = panel.getChildByName('Hint')?.getComponent(Label);
        if (hint) {
            styleUiLabel(hint, {
                size: FONT_HINT,
                color: new Color(180, 160, 120, 255),
                outline: false,
            });
        }
    }

    private paintPanelChromeOnce() {
        if (this._chromePainted || !this._root?.isValid) return;
        const dim = this._root.getChildByName('Dim')?.getComponent(Graphics);
        if (dim) {
            dim.clear();
            dim.fillColor = new Color(0, 0, 0, 200);
            dim.rect(-1100, -2000, 2200, 4000);
            dim.fill();
        }
        const panel = this._root.getChildByName('Panel');
        const chrome = panel?.getChildByName('Chrome');
        if (chrome) applyWoodPanel(chrome, L.panelW, L.panelH);
        for (const [id, btn] of this._tabBtns) {
            this.paintBtn(btn, id === this._tab ? 'tabOn' : 'tabOff');
        }
        if (this._closeBtn) {
            // Re-place with rim-safe pad and keep above chrome / title.
            placePanelCloseButton(this._closeBtn, L.panelW, L.panelH, {
                size: L.closeBtn,
                pad: L.closePad,
            });
            if (panel) this._closeBtn.setSiblingIndex(panel.children.length - 1);
            loadPanelCloseFrame((sf) => {
                if (!this._closeBtn?.isValid) return;
                paintPanelCloseVisual(this._closeBtn, {
                    size: L.closeBtn,
                    layer: this._closeBtn.layer,
                    frame: sf,
                });
            });
        }
        this._chromePainted = true;
    }

    private populatePages() {
        const pageHost = this._pagesHost;
        if (!pageHost?.isValid) return;
        pageHost.removeAllChildren();

        const timePage = this.makePage(pageHost, 'Page_time');
        this.buildTimePage(timePage);
        this._tabPages.set('time', timePage);

        const itemPage = this.makePage(pageHost, 'Page_item');
        this.buildItemPage(itemPage);
        this._tabPages.set('item', itemPage);

        const questPage = this.makePage(pageHost, 'Page_quest');
        this.buildQuestPage(questPage);
        this._tabPages.set('quest', questPage);

        const qtestPage = this.makePage(pageHost, 'Page_qtest');
        this.buildQuestTestPage(qtestPage);
        this._tabPages.set('qtest', qtestPage);

        const systemPage = this.makePage(pageHost, 'Page_system');
        this.buildSystemPage(systemPage);
        this._tabPages.set('system', systemPage);
    }

    private makePage(host: Node, name: string): Node {
        const page = new Node(name);
        page.layer = host.layer;
        page.setParent(host);
        page.setPosition(0, 0, 0);
        page.addComponent(UITransform).setContentSize(host.getComponent(UITransform)!.contentSize);
        return page;
    }

    private buildTimePage(page: Node) {
        const pageH = page.getComponent(UITransform)!.contentSize.height;
        this.layReset(pageH * 0.5 - 8);

        // —— 当前时刻 ——
        const clockCardH = 188;
        const clockY = this.beginSection(page, '当前时刻', clockCardH);
        const clockN = new Node('Clock');
        clockN.layer = page.layer;
        clockN.setParent(page);
        clockN.setPosition(0, clockY + 8, 0);
        clockN.addComponent(UITransform).setContentSize(this._contentW - 40, 72);
        const clock = clockN.addComponent(Label);
        clock.string = '06:00';
        clock.horizontalAlign = Label.HorizontalAlign.CENTER;
        clock.verticalAlign = Label.VerticalAlign.CENTER;
        styleUiLabel(clock, {
            size: FONT_CLOCK,
            color: new Color(255, 236, 160, 255),
            outline: true,
            outlineWidth: 5,
        });
        this._clockLab = clock;

        const dateN = new Node('Date');
        dateN.layer = page.layer;
        dateN.setParent(page);
        dateN.setPosition(0, clockY - 44, 0);
        dateN.addComponent(UITransform).setContentSize(this._contentW - 40, 36);
        const date = dateN.addComponent(Label);
        date.string = '';
        date.horizontalAlign = Label.HorizontalAlign.CENTER;
        date.verticalAlign = Label.VerticalAlign.CENTER;
        styleUiLabel(date, {
            size: FONT_DATE,
            color: UI_INK_MUTE,
            outline: false,
        });
        this._dateLab = date;

        // Shared column width so 2-col / 3-col edges line up across sections.
        const gap = 16;
        const col2W = Math.floor((this._contentW - 48 - gap) / 2);
        const col3W = Math.floor((this._contentW - 48 - gap * 2) / 3);

        // —— 快捷跳转：2×2 ——
        const presets: { label: string; fn: () => void }[] = [
            { label: '清晨 6:00', fn: () => this.infoBoard?.setTime(6, 0) },
            { label: '正午 12:00', fn: () => this.infoBoard?.setTime(12, 0) },
            { label: '黄昏 18:00', fn: () => this.infoBoard?.setTime(18, 0) },
            { label: '深夜 22:00', fn: () => this.infoBoard?.setTime(22, 0) },
        ];
        const presetCardH = this.cardHeightForGrid(2, BTN_H);
        const presetY = this.beginSection(page, '快捷跳转', presetCardH);
        this.placeBtnGridFixed(page, presets, presetY - 8, 2, col2W, BTN_H);

        // —— 微调：2×2 ——
        const nudges: { label: string; fn: () => void }[] = [
            { label: '-1时', fn: () => this.infoBoard?.addMinutes(-60) },
            { label: '+1时', fn: () => this.infoBoard?.addMinutes(60) },
            { label: '-10分', fn: () => this.infoBoard?.addMinutes(-10) },
            { label: '+10分', fn: () => this.infoBoard?.addMinutes(10) },
        ];
        const nudgeCardH = this.cardHeightForGrid(2, BTN_H);
        const nudgeY = this.beginSection(page, '微调时间', nudgeCardH);
        this.placeBtnGridFixed(page, nudges, nudgeY - 8, 2, col2W, BTN_H);

        // —— 日期 · 运行：一行三键 ——
        const dayCardH = CARD_PAD_Y + 34 + CARD_INNER_GAP + BTN_H + CARD_PAD_Y;
        const dayY = this.beginSection(page, '日期 · 运行', dayCardH);
        const dayBtns: { label: string; fn: () => void }[] = [
            { label: '-1日', fn: () => this.infoBoard?.addMinutes(-20 * 60) },
            { label: '睡到明天', fn: () => this.infoBoard?.onSkipDay?.() },
            {
                label: '暂停',
                fn: () => {
                    const board = this.infoBoard;
                    if (!board) return;
                    board.setPaused(!board.paused);
                },
            },
        ];
        const pauseBtn = this.placeBtnRowFixed(page, dayBtns, dayY - 8, col3W, BTN_H);
        this._pauseLab = pauseBtn?.getChildByName('Label')?.getComponent(Label) ?? null;

        const staCardH = CARD_PAD_Y + 34 + CARD_INNER_GAP + BTN_H + CARD_PAD_Y;
        const staY = this.beginSection(page, '体力', staCardH);
        this.placeBtnRowFixed(
            page,
            [
                {
                    label: '体力回满',
                    fn: () => {
                        GameState.stamina = STAMINA_MAX;
                        this.infoBoard?.refreshStamina();
                    },
                },
                {
                    label: '体力清空',
                    fn: () => {
                        GameState.stamina = 0;
                        this.infoBoard?.refreshStamina();
                    },
                },
            ],
            staY - 8,
            col2W,
            BTN_H,
        );
    }

    private buildItemPage(page: Node) {
        type Grant = { label: string; id: string; n: number; fn: () => void };
        const grants = gmGrantItems();
        const asGrant = (rows: typeof grants): Grant[] =>
            rows.map((r) => ({
                label: r.gmAmount > 1 ? `${r.name}+${r.gmAmount}` : r.name,
                id: r.id,
                n: r.gmAmount,
                fn: () => this.grantItem(r.id, r.gmAmount),
            }));

        const materials = asGrant(
            grants.filter(
                (r) =>
                    r.type === ItemType.Material &&
                    !['copper', 'iron', 'goldOre'].includes(r.id),
            ),
        );
        const ores = asGrant(
            grants.filter((r) => ['copper', 'iron', 'goldOre'].includes(r.id)),
        );
        const consumables = asGrant(
            grants.filter(
                (r) =>
                    r.type === ItemType.Seed ||
                    r.type === ItemType.Crop ||
                    r.type === ItemType.Consumable ||
                    r.type === ItemType.Currency,
            ),
        );
        const tools = grants.filter((r) => r.type === ItemType.Tool);

        const pageH = page.getComponent(UITransform)!.contentSize.height;
        this.layReset(pageH * 0.5 - 8);
        const cellH = BTN_H_COMPACT;
        const gap = 14;
        const col4W = Math.floor((this._contentW - 48 - gap * 3) / 4);
        const col3W = Math.floor((this._contentW - 48 - gap * 2) / 3);
        const col2W = Math.floor((this._contentW - 48 - gap) / 2);

        const matRows = Math.ceil(materials.length / 4);
        const matH = this.cardHeightForGrid(matRows, cellH);
        const matY = this.beginSection(page, '采集材料', matH);
        this.placeBtnGridFixed(
            page,
            materials.map((m) => ({ label: m.label, fn: m.fn })),
            matY - 8,
            4,
            col4W,
            cellH,
        );

        const oreH = this.cardHeightForGrid(1, cellH);
        const oreY = this.beginSection(page, '矿石', oreH);
        this.placeBtnGridFixed(
            page,
            ores.map((m) => ({ label: m.label, fn: m.fn })),
            oreY - 8,
            3,
            col3W,
            cellH,
        );

        const cropRows = Math.ceil(consumables.length / 4);
        const cropH = this.cardHeightForGrid(cropRows, cellH);
        const cropY = this.beginSection(page, '作物 · 消耗', cropH);
        this.placeBtnGridFixed(
            page,
            consumables.map((m) => ({ label: m.label, fn: m.fn })),
            cropY - 8,
            4,
            col4W,
            cellH,
        );

        const toolH = this.cardHeightForGrid(1, cellH);
        const toolY = this.beginSection(page, '工具', toolH);
        this.placeBtnRowFixed(
            page,
            tools.map((t) => ({
                label: t.name,
                fn: () => this.grantItem(t.id, t.gmAmount || 1),
            })),
            toolY - 8,
            col4W,
            cellH,
        );

        const packH = CARD_PAD_Y + 34 + CARD_INNER_GAP + BTN_H + CARD_PAD_Y;
        const packY = this.beginSection(page, '一键发放', packH);
        this.placeBtnRowFixed(
            page,
            [
                { label: '材料全+50', fn: () => this.grantStarterPack() },
                { label: '全工具', fn: () => this.grantAllTools() },
            ],
            packY - 8,
            col2W,
            BTN_H,
        );
    }

    private buildQuestPage(page: Node) {
        const pageH = page.getComponent(UITransform)!.contentSize.height;
        this.layReset(pageH * 0.5 - 8);

        const introH = CARD_PAD_Y + 30 + CARD_INNER_GAP + 28 + CARD_PAD_Y;
        const introY = this.beginSection(page, '主线章节跳转', introH);
        this.addHintLabel(page, '跳到该线起点 · 必要时自动前往小镇', introY - 10);

        const lines: { label: string; line: 'town' | 'market' | 'spring'; desc: string }[] = [
            { label: '城镇任务', line: 'town', desc: '解锁小镇后的城镇线' },
            { label: '市集任务', line: 'market', desc: '市集 / 交易相关章节' },
            { label: '春厅任务', line: 'spring', desc: '春厅剧情线' },
        ];
        lines.forEach((q) => {
            const h = CARD_PAD_Y + 34 + CARD_INNER_GAP + BTN_H + 10 + 28 + CARD_PAD_Y;
            const y = this.beginSection(page, q.label, h);
            this.addBtn(
                page,
                `跳转 · ${q.label}`,
                0,
                y + 6,
                Math.min(400, this._contentW - 80),
                BTN_H,
                () => this.jumpQuestLine(q.line),
            );
            this.addHintLabel(page, q.desc, y - 40);
        });
    }

    private buildQuestTestPage(page: Node) {
        const pageH = page.getComponent(UITransform)!.contentSize.height;
        this.layReset(pageH * 0.5 - 8);

        const headH = CARD_PAD_Y + 30 + CARD_INNER_GAP + 56 + CARD_PAD_Y;
        const headY = this.beginSection(page, '单任务调试', headH);
        this.addHintLabel(page, '完成前置后跳入 · 可反复测', headY + 12);
        const statusN = new Node('QStatus');
        statusN.layer = page.layer;
        statusN.setParent(page);
        statusN.setPosition(0, headY - 22, 0);
        statusN.addComponent(UITransform).setContentSize(this._contentW - 40, 28);
        const status = statusN.addComponent(Label);
        status.string = '';
        status.horizontalAlign = Label.HorizontalAlign.CENTER;
        status.verticalAlign = Label.VerticalAlign.CENTER;
        styleUiLabel(status, {
            size: FONT_HINT,
            color: UI_INK_MUTE,
            outline: false,
        });
        this._qtestStatusLab = status;

        const rowH = BTN_H_COMPACT;
        const listInnerH = QTEST_PAGE_SIZE * rowH + (QTEST_PAGE_SIZE - 1) * 12;
        const listCardH = CARD_PAD_Y + 34 + CARD_INNER_GAP + listInnerH + CARD_PAD_Y;
        const listY = this.beginSection(page, '任务列表', listCardH);
        const list = new Node('QList');
        list.layer = page.layer;
        list.setParent(page);
        list.setPosition(0, listY - 8, 0);
        list.addComponent(UITransform).setContentSize(this._contentW - 32, listInnerH);
        this._qtestListHost = list;

        const pageCardH = CARD_PAD_Y + 34 + CARD_INNER_GAP + BTN_H_COMPACT + CARD_PAD_Y;
        const pageY = this.beginSection(page, '翻页', pageCardH);
        this.addBtn(page, '上一页', -180, pageY - 8, 160, BTN_H_COMPACT, () =>
            this.shiftQuestTestPage(-1),
        );
        const pageLabN = new Node('QPage');
        pageLabN.layer = page.layer;
        pageLabN.setParent(page);
        pageLabN.setPosition(0, pageY - 8, 0);
        pageLabN.addComponent(UITransform).setContentSize(120, 40);
        const pageLab = pageLabN.addComponent(Label);
        pageLab.string = '1/1';
        pageLab.horizontalAlign = Label.HorizontalAlign.CENTER;
        pageLab.verticalAlign = Label.VerticalAlign.CENTER;
        styleUiLabel(pageLab, {
            size: FONT_HINT,
            color: UI_INK_MUTE,
            outline: false,
        });
        this._qtestPageLab = pageLab;
        this.addBtn(page, '下一页', 180, pageY - 8, 160, BTN_H_COMPACT, () =>
            this.shiftQuestTestPage(1),
        );

        this.rebuildQuestTestList();
    }

    private buildSystemPage(page: Node) {
        const pageH = page.getComponent(UITransform)!.contentSize.height;
        this.layReset(pageH * 0.5 - 8);

        const h = CARD_PAD_Y + 34 + CARD_INNER_GAP + BTN_H + 14 + 28 + 10 + 28 + CARD_PAD_Y;
        const y = this.beginSection(page, '新手引导', h);
        this.addBtn(
            page,
            '跳过新手引导',
            0,
            y + 22,
            Math.min(420, this._contentW - 80),
            BTN_H,
            () => this.skipNewbieGuide(),
            true,
        );
        this.addHintLabel(page, '结束农场新手 · 解锁小镇 · 跳到城镇线', y - 32);
        this.addHintLabel(page, '会关闭当前引导高亮与剧情锁定', y - 62);
    }

    // ── layout helpers ────────────────────────────────────

    private layReset(topY: number) {
        this._layY = topY;
    }

    /** Card height for a titled block with `rows` of `btnH` buttons. */
    private cardHeightForGrid(rows: number, btnH: number): number {
        const gapY = 14;
        const gridH = rows * btnH + Math.max(0, rows - 1) * gapY;
        return CARD_PAD_Y + 34 + CARD_INNER_GAP + gridH + CARD_PAD_Y;
    }

    /**
     * Draw section card + header; returns the content center Y inside the card
     * (below the title). Advances the layout cursor.
     */
    private beginSection(page: Node, title: string, cardH: number): number {
        const cardY = this._layY - cardH * 0.5;
        this._layY -= cardH + SECTION_GAP;
        this.addSectionCard(page, cardY, cardH, this._contentW);
        const titleY = cardY + cardH * 0.5 - CARD_PAD_Y - 15;
        this.addSectionHeader(page, title, titleY);
        // Content band center under the title.
        const contentTop = titleY - 15 - CARD_INNER_GAP;
        const contentBot = cardY - cardH * 0.5 + CARD_PAD_Y;
        return (contentTop + contentBot) * 0.5;
    }

    /** Category title with gold accent bars. */
    private addSectionHeader(parent: Node, text: string, y: number) {
        const n = new Node(`Sec_${text}`);
        n.layer = parent.layer;
        n.setParent(parent);
        n.setPosition(0, y, 0);
        n.addComponent(UITransform).setContentSize(this._contentW, 30);

        const g = n.addComponent(Graphics);
        const barW = 64;
        const gap = 14;
        const titleBand = Math.min(280, 36 + text.length * 20);
        const barX = titleBand * 0.5 + gap + barW * 0.5;
        g.fillColor = UI_GOLD;
        g.rect(-barX - barW * 0.5, -1.5, barW, 3);
        g.fill();
        g.rect(barX - barW * 0.5, -1.5, barW, 3);
        g.fill();

        const labN = new Node('Label');
        labN.layer = parent.layer;
        labN.setParent(n);
        labN.addComponent(UITransform).setContentSize(titleBand + 48, 30);
        const lab = labN.addComponent(Label);
        lab.string = text;
        lab.horizontalAlign = Label.HorizontalAlign.CENTER;
        lab.verticalAlign = Label.VerticalAlign.CENTER;
        styleUiLabel(lab, {
            size: FONT_SECTION,
            color: UI_INK,
            outline: false,
        });
        return lab;
    }

    private addHintLabel(parent: Node, text: string, y: number) {
        const n = new Node('Hint');
        n.layer = parent.layer;
        n.setParent(parent);
        n.setPosition(0, y, 0);
        n.addComponent(UITransform).setContentSize(this._contentW - 24, 32);
        const lab = n.addComponent(Label);
        lab.string = text;
        lab.horizontalAlign = Label.HorizontalAlign.CENTER;
        lab.verticalAlign = Label.VerticalAlign.CENTER;
        styleUiLabel(lab, {
            size: FONT_HINT,
            color: UI_INK_MUTE,
            outline: false,
        });
        return lab;
    }

    /** Soft inset plate behind a grouped block. */
    private addSectionCard(parent: Node, y: number, h: number, w = 520) {
        const n = new Node('Card');
        n.layer = parent.layer;
        n.setParent(parent);
        n.setSiblingIndex(0);
        n.setPosition(0, y, 0);
        n.addComponent(UITransform).setContentSize(w, h);
        n.addComponent(Graphics);
        applyParchmentRow(n, w, h);
        return n;
    }

    /** Row of equal-width buttons. Returns the last button. */
    private placeBtnRowFixed(
        parent: Node,
        items: { label: string; fn: () => void }[],
        y: number,
        btnW: number,
        btnH: number,
    ): Node | null {
        if (!items.length) return null;
        const gap = 16;
        const total = items.length * btnW + (items.length - 1) * gap;
        let last: Node | null = null;
        items.forEach((it, i) => {
            const x = -total * 0.5 + btnW * 0.5 + i * (btnW + gap);
            last = this.addBtn(parent, it.label, x, y, btnW, btnH, it.fn);
        });
        return last;
    }

    /** Grid of fixed-size buttons centered at `centerY`. */
    private placeBtnGridFixed(
        parent: Node,
        items: { label: string; fn: () => void }[],
        centerY: number,
        cols: number,
        cellW: number,
        btnH: number,
    ) {
        if (!items.length) return;
        const gapX = 16;
        const gapY = 14;
        const rows = Math.ceil(items.length / cols);
        const gridH = rows * btnH + (rows - 1) * gapY;
        const startY = centerY + gridH * 0.5 - btnH * 0.5;
        items.forEach((m, i) => {
            const r = Math.floor(i / cols);
            const c = i % cols;
            const rowLen = Math.min(cols, items.length - r * cols);
            const rowW = rowLen * cellW + (rowLen - 1) * gapX;
            const x = -rowW * 0.5 + cellW * 0.5 + c * (cellW + gapX);
            const y = startY - r * (btnH + gapY);
            this.addBtn(parent, m.label, x, y, cellW, btnH, m.fn);
        });
    }

    private selectTab(id: GmTabId) {
        if (this._tab === id) return;
        this._tab = id;
        if (id === 'qtest') this.rebuildQuestTestList();
        this.applyTabVisuals();
    }

    private applyTabVisuals() {
        for (const [id, page] of this._tabPages) {
            page.active = id === this._tab;
        }
        for (const [id, btn] of this._tabBtns) {
            this.paintBtn(btn, id === this._tab ? 'tabOn' : 'tabOff');
        }
    }

    private paintBtn(btn: Node, kind: 'normal' | 'danger' | 'tabOn' | 'tabOff') {
        const ut = btn.getComponent(UITransform);
        if (!ut) return;
        const w = ut.contentSize.width;
        const h = ut.contentSize.height;
        const plate = btn.getChildByName('AiPlate');
        if (kind === 'danger') {
            if (plate) plate.active = false;
            const g = btn.getComponent(Graphics) ?? btn.addComponent(Graphics);
            g.enabled = true;
            g.clear();
            g.fillColor = new Color(160, 72, 48, 255);
            g.roundRect(-w * 0.5, -h * 0.5, w, h, 12);
            g.fill();
            g.fillColor = new Color(210, 120, 80, 255);
            g.roundRect(-w * 0.5 + 4, -h * 0.5 + 4, w - 8, h - 8, 9);
            g.fill();
            g.strokeColor = UI_STROKE;
            g.lineWidth = 3;
            g.roundRect(-w * 0.5, -h * 0.5, w, h, 12);
            g.stroke();
        } else {
            const map =
                kind === 'tabOn' ? 'on' : kind === 'tabOff' ? 'off' : 'primary';
            applyWoodButton(btn, map, w, h);
        }

        const lab = btn.getChildByName('Label')?.getComponent(Label);
        if (lab) {
            lab.color = kind === 'tabOn' || kind === 'danger' ? UI_CREAM : UI_INK;
        }
    }

    private grantItem(id: string, n: number) {
        const farm = this.node.getComponent(FarmSystem);
        if (!farm) {
            this.infoBoard?.showToast('FarmSystem 未就绪');
            return;
        }
        const label = farm.gmGrant(id, n);
        this.infoBoard?.showToast(label ? `已发放 ${label}` : `未知道具 ${id}`);
    }

    private grantStarterPack() {
        const farm = this.node.getComponent(FarmSystem);
        if (!farm) return;
        for (const row of gmGrantItems()) {
            if (row.type === ItemType.Tool) continue;
            farm.gmGrant(row.id, row.type === ItemType.Currency ? 2000 : 50);
        }
        this.infoBoard?.showToast('可发放道具已批量发放');
    }

    private grantAllTools() {
        const farm = this.node.getComponent(FarmSystem);
        if (!farm) return;
        for (const row of gmGrantItems()) {
            if (row.type !== ItemType.Tool) continue;
            farm.gmGrant(row.id, row.gmAmount || 1);
        }
        this.infoBoard?.showToast('已发放全部工具');
    }

    private shiftQuestTestPage(delta: number) {
        const quests = this.node.getComponent(QuestSystem);
        const total = quests?.allQuests().length ?? 0;
        const pages = Math.max(1, Math.ceil(total / QTEST_PAGE_SIZE));
        this._qtestPage = Math.max(0, Math.min(pages - 1, this._qtestPage + delta));
        this.rebuildQuestTestList();
    }

    private rebuildQuestTestList() {
        const host = this._qtestListHost;
        if (!host?.isValid) return;

        // Drop old list buttons from hit list + destroy rows.
        this._btns = this._btns.filter((b) => {
            let cur: Node | null = b.node;
            while (cur) {
                if (cur === host) return false;
                cur = cur.parent;
            }
            return true;
        });
        host.removeAllChildren();

        const quests = this.node.getComponent(QuestSystem);
        const list = quests?.allQuests() ?? [];
        const pages = Math.max(1, Math.ceil(list.length / QTEST_PAGE_SIZE));
        if (this._qtestPage >= pages) this._qtestPage = pages - 1;
        if (this._qtestPage < 0) this._qtestPage = 0;

        const active = quests?.activeQuest;
        if (this._qtestStatusLab) {
            this._qtestStatusLab.string = active
                ? `当前：${active.id} · ${active.name}`
                : '当前：无主线';
        }
        if (this._qtestPageLab) {
            this._qtestPageLab.string = `${this._qtestPage + 1}/${pages}`;
        }

        const slice = list.slice(
            this._qtestPage * QTEST_PAGE_SIZE,
            this._qtestPage * QTEST_PAGE_SIZE + QTEST_PAGE_SIZE,
        );
        const rowH = BTN_H_COMPACT;
        const gapY = 12;
        const hostH = host.getComponent(UITransform)?.contentSize.height ?? 320;
        const btnW = Math.min(this._contentW - 48, host.getComponent(UITransform)?.contentSize.width ?? 480);
        slice.forEach((q, i) => {
            const y = hostH * 0.5 - rowH * 0.5 - i * (rowH + gapY);
            const ch = CHAPTER_LABEL[q.chapter] ?? q.chapter;
            const mark = quests?.isActive(q.id) ? '● ' : quests?.isCompleted(q.id) ? '✓ ' : '';
            const label = `${mark}${q.id} ${q.name} · ${ch}`;
            this.addBtn(host, label, 0, y, btnW, rowH, () => this.jumpToQuest(q.id));
        });
    }

    /** Close spotlight / story, finish farm quests 1001–1007, unlock town → 1009. */
    private skipNewbieGuide() {
        const story = this.node.getComponent(StoryDialogue);
        const guide = this.node.getComponent(TutorialGuide);
        const quests = this.node.getComponent(QuestSystem);
        const hud = this.node.getComponent(FarmHUD);

        story?.skipNewbieGuide();
        hud?.clearTutorialCraftGuide();
        const jumped = quests?.skipFarmTutorial() ?? false;
        guide?.dismissSpotlight();

        this.infoBoard?.showToast(
            jumped ? '已跳过新手引导 · 小镇已解锁' : '新手引导已跳过 / 已完成',
        );
        this.setOpen(false);
    }

    /** Jump to chapter start and travel to the matching map when needed. */
    private jumpQuestLine(line: 'town' | 'market' | 'spring') {
        const story = this.node.getComponent(StoryDialogue);
        const guide = this.node.getComponent(TutorialGuide);
        const quests = this.node.getComponent(QuestSystem);
        const hud = this.node.getComponent(FarmHUD);
        const farm = this.node.getComponent(FarmSystem);

        story?.prepareQuestLineJump(line);
        hud?.clearTutorialCraftGuide();
        guide?.dismissSpotlight();

        const result = quests?.jumpToQuestLine(line);
        if (!result) {
            this.infoBoard?.showToast('任务线跳转失败');
            return;
        }

        const scene = director.getScene()?.name ?? '';
        const onTown = scene === 'Town';
        this.setOpen(false);

        if (!onTown) {
            this.infoBoard?.showToast(`已跳转 ${result.label} · 前往小镇`);
            travelTo('town', {
                farm,
                quests,
                spawnX: TownWorldLayout.PLAYER_SPAWN.x,
                spawnY: TownWorldLayout.PLAYER_SPAWN.y,
            });
            return;
        }

        this.infoBoard?.showToast(`已跳转 ${result.label}（${result.activeId}）`);
    }

    /** Jump to one quest for isolated testing; travel to a sensible map. */
    private jumpToQuest(questId: number) {
        const story = this.node.getComponent(StoryDialogue);
        const guide = this.node.getComponent(TutorialGuide);
        const quests = this.node.getComponent(QuestSystem);
        const hud = this.node.getComponent(FarmHUD);
        const farm = this.node.getComponent(FarmSystem);

        story?.prepareQuestJump(questId);
        hud?.clearTutorialCraftGuide();
        guide?.dismissSpotlight();

        const result = quests?.jumpToQuest(questId);
        if (!result) {
            this.infoBoard?.showToast(`任务 ${questId} 不存在`);
            return;
        }

        const map = this.mapForQuest(result.chapter, result.unlockMap);
        const scene = director.getScene()?.name ?? '';
        const wantScene =
            map === 'farm' ? 'Main' : map === 'town' ? 'Town' : map === 'mine' ? 'Mine' : '';
        this.setOpen(false);

        if (wantScene && scene !== wantScene) {
            const spawn =
                map === 'town'
                    ? TownWorldLayout.PLAYER_SPAWN
                    : map === 'mine'
                      ? MineWorldLayout.PLAYER_SPAWN
                      : FarmWorldLayout.PLAYER_SPAWN;
            this.infoBoard?.showToast(`测任务 ${result.activeId} ${result.name} · 前往地图`);
            travelTo(map, {
                farm,
                quests,
                spawnX: spawn.x,
                spawnY: spawn.y,
            });
            return;
        }

        this.infoBoard?.showToast(`测任务 ${result.activeId} · ${result.name}`);
        this._qtestPage = 0;
    }

    private mapForQuest(chapter: string, unlockMap: string): TravelMapId {
        if (unlockMap === 'mine') return 'mine';
        if (chapter === 'farm') return 'farm';
        return 'town';
    }

    private addBtn(
        parent: Node,
        text: string,
        x: number,
        y: number,
        w: number,
        h: number,
        action: () => void,
        danger = false,
        fontSize = FONT_BTN,
    ): Node {
        const btn = new Node(`Btn_${text}`);
        btn.layer = parent.layer;
        btn.setParent(parent);
        btn.setPosition(x, y, 0);
        btn.addComponent(UITransform).setContentSize(w, h);
        btn.addComponent(Graphics);

        const labN = new Node('Label');
        labN.layer = parent.layer;
        labN.setParent(btn);
        labN.addComponent(UITransform).setContentSize(w - 12, h);
        const lab = labN.addComponent(Label);
        lab.string = text;
        lab.horizontalAlign = Label.HorizontalAlign.CENTER;
        lab.verticalAlign = Label.VerticalAlign.CENTER;
        lab.overflow = Label.Overflow.SHRINK;
        styleUiLabel(lab, {
            size: fontSize,
            color: new Color(48, 32, 18, 255),
            outline: false,
        });

        this.paintBtn(btn, danger ? 'danger' : 'normal');
        this._btns.push({ node: btn, action });
        return btn;
    }

    private refreshLabels() {
        const c = this.infoBoard?.getClock();
        if (c && this._clockLab) {
            this._clockLab.string = `${String(c.hour).padStart(2, '0')}:${String(c.minute).padStart(2, '0')}`;
            if (this._dateLab) {
                const season = this.infoBoard?.seasonName(c.season) ?? '';
                const wd = this.infoBoard?.weekdayName(c.weekday) ?? '';
                this._dateLab.string = `${season} ${c.day}日 ${wd}${c.paused ? '  · 已暂停' : ''}`;
            }
            if (this._pauseLab) this._pauseLab.string = c.paused ? '继续' : '暂停';
        }
        if (this._tab === 'qtest' && this._qtestStatusLab) {
            const active = this.node.getComponent(QuestSystem)?.activeQuest;
            this._qtestStatusLab.string = active
                ? `当前：${active.id} · ${active.name}`
                : '当前：无主线';
        }
    }

    private canvasHalf(): { halfW: number; halfH: number } {
        const canvasUi = this.node.getComponent(UITransform);
        const vis = view.getVisibleSize();
        return {
            halfW: (canvasUi?.contentSize.width || vis.width) * 0.5,
            halfH: (canvasUi?.contentSize.height || vis.height) * 0.5,
        };
    }

    private uiToCanvasLocal(uiX: number, uiY: number): { x: number; y: number } {
        const { halfW, halfH } = this.canvasHalf();
        return { x: uiX - halfW, y: uiY - halfH };
    }

    private hitChip(uiX: number, uiY: number): boolean {
        if (!this._chip?.active) return false;
        const local = this.uiToCanvasLocal(uiX, uiY);
        const { x, y, hw, hh } = this._chipHit;
        return local.x >= x - hw && local.x <= x + hw && local.y >= y - hh && local.y <= y + hh;
    }

    private hitNode(n: Node | null, lx: number, ly: number): boolean {
        if (!n?.isValid || !n.activeInHierarchy || !this._root) return false;
        const ut = n.getComponent(UITransform);
        if (!ut) return false;
        // Accumulate local positions up to canvas (root's parent).
        let px = 0;
        let py = 0;
        let cur: Node | null = n;
        while (cur && cur !== this.node) {
            px += cur.position.x;
            py += cur.position.y;
            cur = cur.parent;
        }
        const hw = ut.contentSize.width * 0.5 + 6;
        const hh = ut.contentSize.height * 0.5 + 6;
        return lx >= px - hw && lx <= px + hw && ly >= py - hh && ly <= py + hh;
    }
}
