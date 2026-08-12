import {
    _decorator,
    Color,
    Component,
    Graphics,
    Label,
    Node,
    UITransform,
} from 'cc';
import { FarmSystem } from './FarmSystem';
import { InputBridge } from './InputBridge';
import { QuestSystem } from './QuestSystem';
import {
    TownBoardQuest,
    TownGoods,
    TownSellGoods,
    TownShopDef,
    POLICE_QUEST_POOL,
    POST_QUEST_POOL,
    TOWN_SELL_GOODS,
    TOWN_SHOPS,
} from './TownCatalog';
import { playUiClick } from './UiAudio';
import {
    PANEL_CLOSE_BTN,
    PANEL_CLOSE_PAD,
    UI_CREAM,
    UI_GOLD,
    UI_INK,
    UI_INK_MUTE,
    UI_PRICE,
    UI_STROKE,
    drawParchmentRow,
    drawWoodButton,
    drawWoodParchmentPanel,
    mountPanelCloseButton,
} from './UiChrome';
import { styleUiLabel } from './UiFont';
import { GoldAmountHandle, formatGoldAmount, mountGoldAmount } from './UiGoldAmount';

const { ccclass } = _decorator;

const PANEL_W = 720;
const PANEL_H = 980;
const ROW_H = 92;
/** Compact header: title → purse → buy/sell tabs → list. */
const TITLE_Y = PANEL_H * 0.5 - 64;
const GOLD_Y = PANEL_H * 0.5 - 118;
const TAB_Y = PANEL_H * 0.5 - 178;
const TAB_H = 48;
/** Top edge of first shop row (panel-local). */
const LIST_TOP_SHOP = PANEL_H * 0.5 - 248;
const ROW_GAP = 8;
/** Footer: hint above qty / confirm dock. */
const HINT_Y = -PANEL_H * 0.5 + 168;
/** Accept / OK / trade-confirm button center Y (panel-local). */
const ACTION_Y = -PANEL_H * 0.5 + 88;
const ACTION_W = 320;
const ACTION_H = 72;
/** Qty stepper (±) while a shop row is selected. */
const QTY_BTN = 56;
const QTY_Y = ACTION_Y;
const MINUS_X = -250;
const PLUS_X = -90;
const QTY_LAB_X = -170;
const CONFIRM_X = 160;
const CONFIRM_W = 300;
const TRADE_QTY_MAX = 99;

/**
 * Town shop / board UI — FarmHUD wood + parchment chrome, gold → FarmSystem.
 */
@ccclass('TownShopPanel')
export class TownShopPanel extends Component {
    farm: FarmSystem | null = null;
    quests: QuestSystem | null = null;

    private _root: Node | null = null;
    private _dimmer: Node | null = null;
    private _title: Label | null = null;
    private _goldAmt: GoldAmountHandle | null = null;
    private _hint: Label | null = null;
    private _body: Label | null = null;
    private _bodyCard: Node | null = null;
    private _actionBtn: Node | null = null;
    private _actionLab: Label | null = null;
    /** Verb + gold chip on the trade confirm button. */
    private _tradeVerbLab: Label | null = null;
    private _tradeGold: GoldAmountHandle | null = null;
    private _buyTab: Node | null = null;
    private _sellTab: Node | null = null;
    private _buyTabLab: Label | null = null;
    private _sellTabLab: Label | null = null;
    private _closeBtn: Node | null = null;
    private _minusBtn: Node | null = null;
    private _plusBtn: Node | null = null;
    private _qtyLab: Label | null = null;
    private _rows: Node[] = [];
    private _sellRows: TownSellGoods[] = [];
    private _shop: TownShopDef | null = null;
    private _board: 'police' | 'post' | null = null;
    private _quest: TownBoardQuest | null = null;
    private _mode: 'shop' | 'board' | 'info' = 'shop';
    private _shopSide: 'buy' | 'sell' = 'buy';
    private _selIndex = -1;
    private _tradeQty = 1;
    private _infoTitle = '';
    private _infoBody = '';
    private _prevBlocking = false;

    get isOpen() {
        return !!this._root?.active;
    }

    get isBoardOpen() {
        return this.isOpen && this._mode === 'board';
    }

    get isShopOpen() {
        return this.isOpen && this._mode === 'shop';
    }

    get shopSide(): 'buy' | 'sell' {
        return this._shopSide;
    }

    /** True when a buy/sell row is selected (qty dock + confirm live). */
    get hasTradeSelection(): boolean {
        return this.isShopOpen && this._selIndex >= 0;
    }

    /** Accept / OK / trade-confirm — TutorialGuide points here. */
    acceptBtnNode(): Node | null {
        if (!this.isOpen || !this._actionBtn?.active) return null;
        return this._actionBtn;
    }

    /** Shop confirm after a row is selected (same chrome as accept). */
    confirmBtnNode(): Node | null {
        if (!this.isShopOpen || this._selIndex < 0) return null;
        return this.acceptBtnNode();
    }

    buyTabNode(): Node | null {
        if (!this.isShopOpen || !this._buyTab?.active) return null;
        return this._buyTab;
    }

    sellTabNode(): Node | null {
        if (!this.isShopOpen || !this._sellTab?.active) return null;
        return this._sellTab;
    }

    /** First buy / sell list row — TutorialGuide hollow target. */
    firstBuyRowNode(): Node | null {
        if (!this.isShopOpen || this._shopSide !== 'buy') return null;
        const row = this._rows[0];
        return row?.isValid ? row : null;
    }

    firstSellRowNode(): Node | null {
        if (!this.isShopOpen || this._shopSide !== 'sell') return null;
        const row = this._rows[0];
        return row?.isValid ? row : null;
    }

    /** Top-right X — TutorialGuide points here after buy / sell completes. */
    closeBtnNode(): Node | null {
        if (!this.isShopOpen || !this._closeBtn?.isValid || !this._closeBtn.active) return null;
        return this._closeBtn;
    }

    /**
     * Quest 1020 / 1021 while shop is open and trade not yet done — force tab →
     * row → confirm (TutorialGuide hollow + guided taps).
     */
    needsShopTradeGuide(): boolean {
        if (!this.isShopOpen) return false;
        const quests = this.quests;
        const q = quests?.activeQuest;
        if (!q || quests?.isAwaitingClaim) return false;
        return q.id === 1020 || q.id === 1021;
    }

    /**
     * After shop_buy / shop_sell flips awaiting-claim, force close before the
     * quest dock tip (modal still swallows world / HUD taps).
     */
    needsShopCloseGuide(): boolean {
        if (!this.isShopOpen) return false;
        const quests = this.quests;
        const q = quests?.activeQuest;
        if (!q || !quests?.isAwaitingClaim) return false;
        return q.id === 1020 || q.id === 1021;
    }

    onLoad() {
        this.build();
        this.close();
    }

    onDestroy() {
        if (this.isOpen) this.releaseInputLock();
    }

    openShop(shopId: string) {
        const shop = TOWN_SHOPS.find((s) => s.id === shopId) ?? null;
        if (!shop) return;
        this._mode = 'shop';
        const active = this.quests?.activeQuest?.id ?? 0;
        // Open on the opposite tab so TutorialGuide can teach「购买/出售」页签.
        if (active === 1020) this._shopSide = 'sell';
        else if (active === 1021) this._shopSide = 'buy';
        else this._shopSide = 'buy';
        this._shop = shop;
        this._board = null;
        this._quest = null;
        this.clearTradeSelection();
        this.refresh();
        this.show();
    }

    openBoard(kind: 'police' | 'post') {
        this._mode = 'board';
        this._board = kind;
        this._shop = null;
        this.clearTradeSelection();
        const pool = kind === 'police' ? POLICE_QUEST_POOL : POST_QUEST_POOL;
        const fresh = pool.filter((q) => !this.quests?.hasBoardQuest(q.id));
        const pick = fresh.length > 0 ? fresh : pool;
        this._quest = pick[Math.floor(Math.random() * pick.length)];
        this.refresh();
        this.show();
    }

    openInfo(title: string, body: string) {
        this._mode = 'info';
        this._infoTitle = title;
        this._infoBody = body;
        this._shop = null;
        this._board = null;
        this._quest = null;
        this.clearTradeSelection();
        this.refresh();
        this.show();
    }

    close() {
        const wasOpen = this.isOpen;
        if (this._root) this._root.active = false;
        if (this._dimmer) this._dimmer.active = false;
        if (wasOpen) this.releaseInputLock();
    }

    /** Screen-space tap (UI bottom-left). Returns true if consumed. */
    handleTap(uiX: number, uiY: number): boolean {
        if (!this.isOpen || !this._root) return false;
        const canvas = this.uiToCanvasLocal(uiX, uiY);
        // Panel is offset (0, 40) on canvas.
        const local = { x: canvas.x - this._root.position.x, y: canvas.y - this._root.position.y };
        const guide = this.tradeGuideTarget();
        // Close chip top-right — blocked while buy/sell tutorial needs a click.
        const closeHalf = PANEL_CLOSE_BTN * 0.85;
        const closeX = PANEL_W * 0.5 - PANEL_CLOSE_PAD - PANEL_CLOSE_BTN * 0.5;
        const closeY = PANEL_H * 0.5 - PANEL_CLOSE_PAD - PANEL_CLOSE_BTN * 0.5;
        if (
            Math.abs(local.x - closeX) <= closeHalf &&
            Math.abs(local.y - closeY) <= closeHalf
        ) {
            if (guide) return true;
            playUiClick();
            this.close();
            return true;
        }
        if (this._mode === 'shop' && this._shop) {
            if (guide) {
                this.handleGuidedShopTap(local.x, local.y, guide);
                return true;
            }
            // Buy / Sell tabs
            if (local.y > TAB_Y - TAB_H * 0.5 - 6 && local.y < TAB_Y + TAB_H * 0.5 + 6) {
                if (local.x > -220 && local.x < -20) {
                    playUiClick();
                    this._shopSide = 'buy';
                    this.clearTradeSelection();
                    this.refresh();
                    return true;
                }
                if (local.x > 20 && local.x < 220) {
                    playUiClick();
                    this._shopSide = 'sell';
                    this.clearTradeSelection();
                    this.refresh();
                    return true;
                }
            }
            // Qty stepper + confirm (only when a row is selected).
            if (this._selIndex >= 0 && this.hitQtyDock(local.x, local.y)) {
                return true;
            }
            const listTop = LIST_TOP_SHOP;
            if (this._shopSide === 'buy') {
                for (let i = 0; i < this._shop.goods.length; i++) {
                    const rowY = listTop - i * (ROW_H + ROW_GAP) - ROW_H * 0.5;
                    if (Math.abs(local.y - rowY) < ROW_H * 0.5 && Math.abs(local.x) < PANEL_W * 0.42) {
                        playUiClick();
                        this.selectTradeRow(i);
                        return true;
                    }
                }
            } else {
                for (let i = 0; i < this._sellRows.length; i++) {
                    const rowY = listTop - i * (ROW_H + ROW_GAP) - ROW_H * 0.5;
                    if (Math.abs(local.y - rowY) < ROW_H * 0.5 && Math.abs(local.x) < PANEL_W * 0.42) {
                        playUiClick();
                        this.selectTradeRow(i);
                        return true;
                    }
                }
            }
        }
        if (this._mode === 'board' && this._quest) {
            if (this.hitAction(local.x, local.y)) {
                playUiClick();
                this.acceptQuest();
                return true;
            }
        }
        if (this._mode === 'info') {
            if (this.hitAction(local.x, local.y)) {
                playUiClick();
                this.close();
                return true;
            }
        }
        return true;
    }

    /** Forced control while quest 1020 / 1021 is live inside the shop. */
    private tradeGuideTarget(): 'buy-tab' | 'sell-tab' | 'buy-row' | 'sell-row' | 'confirm' | null {
        if (!this.needsShopTradeGuide() || !this._shop) return null;
        const qid = this.quests?.activeQuest?.id ?? 0;
        if (qid === 1021) {
            if (this._shopSide !== 'sell') return 'sell-tab';
            if (this._sellRows.length === 0) return null;
            if (this._selIndex !== 0) return 'sell-row';
            return 'confirm';
        }
        if (qid === 1020) {
            if (this._shopSide !== 'buy') return 'buy-tab';
            if (this._shop.goods.length === 0) return null;
            if (this._selIndex !== 0) return 'buy-row';
            return 'confirm';
        }
        return null;
    }

    /** Swallow every tap except the guided tab / first list row / confirm. */
    private handleGuidedShopTap(
        lx: number,
        ly: number,
        guide: 'buy-tab' | 'sell-tab' | 'buy-row' | 'sell-row' | 'confirm',
    ) {
        if (guide === 'buy-tab' || guide === 'sell-tab') {
            if (ly > TAB_Y - TAB_H * 0.5 - 6 && ly < TAB_Y + TAB_H * 0.5 + 6) {
                if (guide === 'buy-tab' && lx > -220 && lx < -20) {
                    playUiClick();
                    this._shopSide = 'buy';
                    this.clearTradeSelection();
                    this.refresh();
                    return;
                }
                if (guide === 'sell-tab' && lx > 20 && lx < 220) {
                    playUiClick();
                    this._shopSide = 'sell';
                    this.clearTradeSelection();
                    this.refresh();
                    return;
                }
            }
            return;
        }
        if (guide === 'confirm') {
            if (this.hitConfirm(lx, ly)) {
                playUiClick();
                this.confirmTrade();
            }
            return;
        }
        const listTop = LIST_TOP_SHOP;
        const rowY = listTop - ROW_H * 0.5;
        if (Math.abs(ly - rowY) >= ROW_H * 0.5 || Math.abs(lx) >= PANEL_W * 0.42) return;
        playUiClick();
        this.selectTradeRow(0);
    }

    private hitAction(lx: number, ly: number): boolean {
        return Math.abs(lx) < ACTION_W * 0.5 && Math.abs(ly - ACTION_Y) < ACTION_H * 0.5 + 8;
    }

    private hitConfirm(lx: number, ly: number): boolean {
        return (
            Math.abs(lx - CONFIRM_X) < CONFIRM_W * 0.5 &&
            Math.abs(ly - QTY_Y) < ACTION_H * 0.5 + 8
        );
    }

    /** Qty − / + / confirm. Returns true if a control was hit. */
    private hitQtyDock(lx: number, ly: number): boolean {
        if (Math.abs(ly - QTY_Y) > QTY_BTN * 0.55 + 8) return false;
        if (Math.abs(lx - MINUS_X) < QTY_BTN * 0.55) {
            playUiClick();
            this.nudgeTradeQty(-1);
            return true;
        }
        if (Math.abs(lx - PLUS_X) < QTY_BTN * 0.55) {
            playUiClick();
            this.nudgeTradeQty(1);
            return true;
        }
        if (this.hitConfirm(lx, ly)) {
            playUiClick();
            this.confirmTrade();
            return true;
        }
        return false;
    }

    private uiToCanvasLocal(uiX: number, uiY: number): { x: number; y: number } {
        const ut = this.node.getComponent(UITransform);
        const hw = (ut?.contentSize.width ?? 1080) * 0.5;
        const hh = (ut?.contentSize.height ?? 1920) * 0.5;
        return { x: uiX - hw, y: uiY - hh };
    }

    private show() {
        if (!this._root?.active) {
            this._prevBlocking = InputBridge.uiBlocking;
            InputBridge.uiBlocking = true;
            InputBridge.clear();
        }
        if (this._dimmer) this._dimmer.active = true;
        if (this._root) {
            this._root.active = true;
            this._root.setSiblingIndex(this.node.children.length - 1);
        }
        if (this._dimmer) this._dimmer.setSiblingIndex(Math.max(0, this.node.children.length - 2));
    }

    private releaseInputLock() {
        const rewardOpen = !!(this.node.getComponent('RewardPopup') as { isOpen?: boolean } | null)
            ?.isOpen;
        const questOpen = !!(this.node.getComponent('QuestPanel') as { isOpen?: boolean } | null)
            ?.isOpen;
        const dlgOpen = !!(this.node.getComponent('DialoguePanel') as { isOpen?: boolean } | null)
            ?.isOpen;
        const hud = this.node.getComponent('FarmHUD') as { isModalOpen?: boolean } | null;
        if (rewardOpen || questOpen || dlgOpen || hud?.isModalOpen) {
            InputBridge.uiBlocking = true;
        } else {
            InputBridge.uiBlocking = this._prevBlocking;
        }
        InputBridge.clear();
    }

    private clearTradeSelection() {
        this._selIndex = -1;
        this._tradeQty = 1;
    }

    private selectTradeRow(index: number) {
        this._selIndex = index;
        this._tradeQty = 1;
        this.clampTradeQty();
        this.refresh();
    }

    private nudgeTradeQty(delta: number) {
        this._tradeQty += delta;
        this.clampTradeQty();
        this.refreshTradeDock();
    }

    private clampTradeQty() {
        const max = this.maxTradeQty();
        if (max < 1) {
            this._tradeQty = 1;
            return;
        }
        this._tradeQty = Math.max(1, Math.min(max, this._tradeQty));
    }

    private maxTradeQty(): number {
        if (this._selIndex < 0) return 0;
        if (this._shopSide === 'buy') {
            const g = this._shop?.goods[this._selIndex];
            if (!g || g.price <= 0) return 0;
            return Math.min(TRADE_QTY_MAX, Math.floor((this.farm?.gold ?? 0) / g.price));
        }
        const g = this._sellRows[this._selIndex];
        if (!g) return 0;
        return Math.min(TRADE_QTY_MAX, this.sellCount(g.id));
    }

    private confirmTrade() {
        if (this._selIndex < 0) return;
        this.clampTradeQty();
        if (this._shopSide === 'buy') {
            const g = this._shop?.goods[this._selIndex];
            if (g) this.buy(g, this._tradeQty);
            return;
        }
        const g = this._sellRows[this._selIndex];
        if (g) this.sell(g, this._tradeQty);
    }

    private buy(g: TownGoods, packs: number) {
        const farm = this.farm;
        if (!farm) return;
        const n = Math.max(1, Math.floor(packs));
        const total = g.price * n;
        if (farm.gold < total) {
            this.setHint('金币不足');
            return;
        }
        if (!farm.spendGold(total)) {
            this.setHint('金币不足');
            return;
        }
        this.grant(g, n);
        farm.notifyInventoryChanged();
        this.quests?.noteFlag('shop_buy');
        this.setHint(`已购买 ${g.title} ×${g.count * n}`);
        this.clampTradeQty();
        this.refreshGold();
        this.refreshTradeDock();
    }

    private sell(g: TownSellGoods, count: number) {
        const farm = this.farm;
        if (!farm) return;
        const n = Math.max(1, Math.floor(count));
        const have = this.sellCount(g.id);
        if (have < 1) {
            this.setHint('没有可出售的库存');
            return;
        }
        const take = Math.min(n, have);
        this.takeSell(g.id, take);
        const gain = g.price * take;
        farm.addGold(gain);
        farm.notifyInventoryChanged();
        this.quests?.noteFlag('shop_sell');
        this.setHint(`已出售 ${g.title} ×${take}  ${formatGoldAmount(gain, { sign: '+' })}`);
        // Rebuild list — drop emptied rows; keep selection if still valid.
        const keepId = g.id;
        this._sellRows = TOWN_SELL_GOODS.filter((row) => this.sellCount(row.id) > 0);
        const next = this._sellRows.findIndex((row) => row.id === keepId);
        if (next >= 0) {
            this._selIndex = next;
            this.clampTradeQty();
        } else {
            this.clearTradeSelection();
        }
        this.refresh();
    }

    private sellCount(id: TownSellGoods['id']): number {
        const farm = this.farm;
        if (!farm) return 0;
        switch (id) {
            case 'parsnip':
                return farm.crops;
            case 'fish':
                return farm.fish;
            case 'grass':
                return farm.grass;
            case 'wood':
                return farm.wood;
            case 'stone':
                return farm.stone;
            case 'copper':
                return farm.copper;
            default:
                return 0;
        }
    }

    private takeSell(id: TownSellGoods['id'], n: number) {
        const farm = this.farm!;
        switch (id) {
            case 'parsnip':
                farm.crops = Math.max(0, farm.crops - n);
                break;
            case 'fish':
                farm.fish = Math.max(0, farm.fish - n);
                break;
            case 'grass':
                farm.grass = Math.max(0, farm.grass - n);
                break;
            case 'wood':
                farm.wood = Math.max(0, farm.wood - n);
                break;
            case 'stone':
                farm.stone = Math.max(0, farm.stone - n);
                break;
            case 'copper':
                farm.copper = Math.max(0, farm.copper - n);
                break;
            default:
                break;
        }
    }

    private grant(g: TownGoods, packs = 1) {
        const farm = this.farm!;
        const n = g.count * packs;
        switch (g.id) {
            case 'seed_parsnip':
            case 'seed_potato':
            case 'seed_cauli':
            case 'seed_berry':
            case 'seed_pumpkin':
                farm.seeds += n;
                farm.noteSeedPurchase(g.id, n);
                break;
            case 'ore_stone':
                farm.stone += n;
                break;
            case 'ore_copper':
                farm.copper += n;
                break;
            case 'ore_iron':
                farm.iron += n;
                break;
            case 'ore_gold':
                farm.goldOre += n;
                break;
            case 'wood_pack':
                farm.wood += n;
                break;
            case 'fiber_pack':
                farm.grass += n;
                break;
            case 'bait':
            case 'snack':
                // Soft goods — grant a little gold-back snack as placeholder stamina
                break;
            default:
                break;
        }
    }

    private acceptQuest() {
        const q = this._quest;
        if (!q || !this.quests) return;
        if (!this.quests.acceptBoardQuest(q)) {
            this.setHint(
                this.quests.hasBoardQuest(q.id)
                    ? '这份委托已经在任务里了'
                    : '委托栏已满，先去目标地点交付几份吧',
            );
            return;
        }
        this.quests.noteFlag('accept_board');
        this.quests.infoBoard?.showToast(`已接取「${q.title}」`);
        this.setHint(`已接取「${q.title}」— 打开任务查看`);
        this._quest = null;
        this.close();
    }

    private refresh() {
        if (!this._title || !this._hint) return;
        this.clearRows();
        this.refreshGold();
        const tabsOn = this._mode === 'shop' && !!this._shop;
        if (this._buyTab) this._buyTab.active = tabsOn;
        if (this._sellTab) this._sellTab.active = tabsOn;
        const boardOrInfo = this._mode === 'board' || this._mode === 'info';
        if (this._bodyCard) this._bodyCard.active = boardOrInfo;
        if (this._goldAmt) {
            // Board still shows purse; info dialogs hide it.
            this._goldAmt.setVisible(this._mode !== 'info');
        }
        if (this._mode === 'shop' && this._shop) {
            this._title.string = this._shop.title;
            this.paintTab(this._buyTab, this._buyTabLab, this._shopSide === 'buy');
            this.paintTab(this._sellTab, this._sellTabLab, this._shopSide === 'sell');
            if (this._body) this._body.string = '';
            if (this._shopSide === 'buy') {
                this.buildShopRows(this._shop.goods, LIST_TOP_SHOP);
                if (this._selIndex >= this._shop.goods.length) this.clearTradeSelection();
                this._hint.string =
                    this._selIndex < 0 ? '点选商品，调节数量后确认' : '确认购买';
            } else {
                this._sellRows = TOWN_SELL_GOODS.filter((g) => this.sellCount(g.id) > 0);
                if (this._selIndex >= this._sellRows.length) this.clearTradeSelection();
                if (this._sellRows.length === 0) {
                    this._hint.string = '暂无可出售的收获物';
                } else {
                    this.buildSellRows(this._sellRows, LIST_TOP_SHOP);
                    this._hint.string =
                        this._selIndex < 0 ? '点选收获物，调节数量后确认' : '确认出售';
                }
            }
            this.refreshTradeDock();
            this.ensureHintLayout();
        } else if (this._mode === 'board' && this._quest) {
            this.setQtyDockActive(false);
            if (this._actionBtn) {
                this._actionBtn.active = true;
                this._actionBtn.setPosition(0, ACTION_Y, 0);
                const ut = this._actionBtn.getComponent(UITransform);
                ut?.setContentSize(ACTION_W, ACTION_H);
            }
            const head = this._board === 'police' ? '警察局任务板' : '邮局急件';
            this._title.string = head;
            if (this._body) {
                this._body.string =
                    `「${this._quest.title}」\n\n` +
                    `${this._quest.desc}\n\n` +
                    `报酬  ${formatGoldAmount(this._quest.rewardGold)}`;
            }
            this._hint.string = '接取后走到目标地点交互交付（任务「委托」可查看）';
            this.setPlainAction('接受委托');
            this.paintAction(true);
            this.ensureBodyLayout();
            this.ensureHintLayout();
        } else if (this._mode === 'info') {
            this.setQtyDockActive(false);
            if (this._actionBtn) {
                this._actionBtn.active = true;
                this._actionBtn.setPosition(0, ACTION_Y, 0);
                const ut = this._actionBtn.getComponent(UITransform);
                ut?.setContentSize(ACTION_W, ACTION_H);
            }
            this._title.string = this._infoTitle;
            if (this._body) this._body.string = this._infoBody;
            this._hint.string = '';
            this.setPlainAction('知道了');
            this.paintAction(false);
            this.ensureBodyLayout();
            this.ensureHintLayout();
        }
    }

    /** Keep wrap width after string updates (Label can shrink the node to ~2 glyphs). */
    private ensureBodyLayout() {
        const n = this._body?.node;
        if (!n?.isValid) return;
        const ut = n.getComponent(UITransform);
        if (!ut) return;
        const w = PANEL_W - 140;
        const h = 380;
        if (ut.contentSize.width < w - 1 || ut.contentSize.width > w + 1) {
            ut.setContentSize(w, Math.max(ut.contentSize.height, h));
        } else if (ut.contentSize.height < h) {
            ut.setContentSize(w, h);
        }
    }

    private ensureHintLayout() {
        const n = this._hint?.node;
        if (!n?.isValid) return;
        const ut = n.getComponent(UITransform);
        if (!ut) return;
        const w = 640;
        const h = 48;
        if (ut.contentSize.width < w - 1 || ut.contentSize.width > w + 1) {
            ut.setContentSize(w, Math.max(ut.contentSize.height, h));
        } else if (ut.contentSize.height < h) {
            ut.setContentSize(w, h);
        }
    }

    /** Plain centered label (board accept / info OK / disabled trade). */
    private setPlainAction(s: string) {
        if (this._actionLab) {
            this._actionLab.node.active = true;
            this._actionLab.string = s;
        }
        if (this._tradeVerbLab) this._tradeVerbLab.node.active = false;
        this._tradeGold?.setVisible(false);
    }

    /** Trade confirm: verb + [G] x N. */
    private setTradeAction(verb: string, total: number, sign: '+' | '' = '') {
        if (this._actionLab) this._actionLab.node.active = false;
        if (this._tradeVerbLab) {
            this._tradeVerbLab.node.active = true;
            this._tradeVerbLab.string = verb;
            this._tradeVerbLab.color = UI_INK;
        }
        if (this._tradeGold) {
            this._tradeGold.setVisible(true);
            this._tradeGold.setAmount(total, { sign });
            this.layoutTradeConfirm(verb);
        }
    }

    private layoutTradeConfirm(verb: string) {
        const verbN = this._tradeVerbLab?.node;
        const gold = this._tradeGold;
        if (!verbN || !gold) return;
        const fontSize = 28;
        const verbW = Math.max(56, Math.ceil(fontSize * 0.95 * verb.length));
        verbN.getComponent(UITransform)?.setContentSize(verbW, ACTION_H - 8);
        const goldW = gold.root.getComponent(UITransform)?.contentSize.width ?? 100;
        const gap = 10;
        const total = verbW + gap + goldW;
        const left = -total * 0.5;
        verbN.setPosition(left + verbW * 0.5, 0, 0);
        gold.root.setPosition(left + verbW + gap + goldW * 0.5, 0, 0);
    }

    private paintAction(primary: boolean) {
        const gfx = this._actionBtn?.getComponent(Graphics);
        if (!gfx) return;
        const w = this._actionBtn?.getComponent(UITransform)?.contentSize.width ?? ACTION_W;
        drawWoodButton(gfx, w, ACTION_H, primary ? 'primary' : 'muted');
        if (this._actionLab?.node.active) {
            this._actionLab.color = primary ? UI_INK : UI_CREAM;
        }
        if (this._tradeVerbLab?.node.active) {
            this._tradeVerbLab.color = primary ? UI_INK : UI_CREAM;
        }
    }

    private paintTab(node: Node | null, lab: Label | null, on: boolean) {
        if (!node) return;
        const gfx = node.getComponent(Graphics);
        if (gfx) drawWoodButton(gfx, 180, TAB_H, on ? 'on' : 'off');
        if (lab) lab.color = on ? UI_CREAM : UI_INK;
    }

    private setQtyDockActive(on: boolean) {
        if (this._minusBtn) this._minusBtn.active = on;
        if (this._plusBtn) this._plusBtn.active = on;
        if (this._qtyLab) this._qtyLab.node.active = on;
        if (!on && this._actionBtn && this._mode === 'shop') {
            this._actionBtn.active = false;
            if (this._tradeVerbLab) this._tradeVerbLab.node.active = false;
            this._tradeGold?.setVisible(false);
        }
    }

    private refreshTradeDock() {
        const on = this._mode === 'shop' && this._selIndex >= 0;
        this.setQtyDockActive(on);
        if (!on || !this._actionBtn || !this._qtyLab) return;

        this.clampTradeQty();
        this._qtyLab.string = `${this._tradeQty}`;

        this._actionBtn.active = true;
        this._actionBtn.setPosition(CONFIRM_X, QTY_Y, 0);
        const ut = this._actionBtn.getComponent(UITransform);
        ut?.setContentSize(CONFIRM_W, ACTION_H);
        const labUt = this._actionLab?.node.getComponent(UITransform);
        labUt?.setContentSize(CONFIRM_W - 20, ACTION_H - 8);

        const max = this.maxTradeQty();
        const can = max >= 1 && this._tradeQty >= 1 && this._tradeQty <= max;
        if (this._shopSide === 'buy') {
            const g = this._shop?.goods[this._selIndex];
            const total = g ? g.price * this._tradeQty : 0;
            if (can) this.setTradeAction('购买', total);
            else this.setPlainAction('金币不足');
            this.paintAction(can);
        } else {
            const g = this._sellRows[this._selIndex];
            const total = g ? g.price * this._tradeQty : 0;
            if (can) this.setTradeAction('出售', total, '+');
            else this.setPlainAction('无法出售');
            this.paintAction(can);
        }

        this.paintQtyBtn(this._minusBtn, this._tradeQty > 1);
        this.paintQtyBtn(this._plusBtn, this._tradeQty < max);
    }

    private paintQtyBtn(node: Node | null, enabled: boolean) {
        if (!node) return;
        const gfx = node.getComponent(Graphics);
        if (gfx) drawWoodButton(gfx, QTY_BTN, QTY_BTN, enabled ? 'primary' : 'muted');
        const lab = node.getChildByName('Label')?.getComponent(Label);
        if (lab) lab.color = enabled ? UI_INK : UI_CREAM;
    }

    private refreshGold() {
        this._goldAmt?.setAmount(this.farm?.gold ?? 0);
    }

    private setHint(s: string) {
        if (this._hint) this._hint.string = s;
    }

    private clearRows() {
        for (const n of this._rows) n.destroy();
        this._rows.length = 0;
    }

    private buildShopRows(goods: TownGoods[], listTop: number) {
        goods.forEach((g, i) => {
            this._rows.push(
                this.makeRow(
                    `row_${g.id}_${i}`,
                    listTop - i * (ROW_H + ROW_GAP) - ROW_H * 0.5,
                    g.title,
                    `每份 ×${g.count}`,
                    g.price,
                    '',
                    i === this._selIndex,
                ),
            );
        });
    }

    private buildSellRows(goods: TownSellGoods[], listTop: number) {
        goods.forEach((g, i) => {
            const n = this.sellCount(g.id);
            this._rows.push(
                this.makeRow(
                    `sell_${g.id}_${i}`,
                    listTop - i * (ROW_H + ROW_GAP) - ROW_H * 0.5,
                    g.title,
                    `持有 ×${n}`,
                    g.price,
                    '+',
                    i === this._selIndex,
                ),
            );
        });
    }

    /** Shop list row — title / stock hint / unit price chip; selected gets gold rim. */
    private makeRow(
        name: string,
        y: number,
        title: string,
        meta: string,
        price: number,
        sign: '+' | '',
        selected: boolean,
    ): Node {
        const row = new Node(name);
        row.layer = this.node.layer;
        row.setParent(this._root!);
        row.setPosition(0, y, 0);
        const rowW = PANEL_W - 80;
        const ut = row.addComponent(UITransform);
        ut.setContentSize(rowW, ROW_H);
        const gfx = row.addComponent(Graphics);
        drawParchmentRow(gfx, rowW, ROW_H, 12);
        if (selected) {
            gfx.strokeColor = UI_GOLD;
            gfx.lineWidth = 4;
            gfx.roundRect(-rowW * 0.5, -ROW_H * 0.5, rowW, ROW_H, 12);
            gfx.stroke();
            gfx.strokeColor = UI_STROKE;
            gfx.lineWidth = 2;
            gfx.roundRect(-rowW * 0.5 + 3, -ROW_H * 0.5 + 3, rowW - 6, ROW_H - 6, 10);
            gfx.stroke();
        }

        const textLeft = -rowW * 0.5 + 28;
        const labN = new Node('lab');
        labN.layer = row.layer;
        labN.setParent(row);
        labN.setPosition(textLeft + 200, 12, 0);
        labN.addComponent(UITransform).setContentSize(400, 36);
        const lab = labN.addComponent(Label);
        lab.string = title;
        lab.overflow = Label.Overflow.CLAMP;
        lab.horizontalAlign = Label.HorizontalAlign.LEFT;
        styleUiLabel(lab, { size: 28, color: UI_INK, outline: false });

        const descN = new Node('desc');
        descN.layer = row.layer;
        descN.setParent(row);
        descN.setPosition(textLeft + 200, -20, 0);
        descN.addComponent(UITransform).setContentSize(400, 28);
        const descLab = descN.addComponent(Label);
        descLab.string = meta;
        descLab.overflow = Label.Overflow.CLAMP;
        descLab.horizontalAlign = Label.HorizontalAlign.LEFT;
        styleUiLabel(descLab, { size: 20, color: UI_INK_MUTE, outline: false });

        mountGoldAmount(row, {
            name: 'Price',
            x: rowW * 0.5 - 88,
            y: 0,
            iconSize: 34,
            fontSize: 26,
            color: UI_PRICE,
            align: 'right',
            amount: price,
            sign,
        });
        return row;
    }

    private makeQtyBtn(name: string, x: number, label: string): Node {
        const btn = new Node(name);
        btn.layer = this._root!.layer;
        btn.setParent(this._root!);
        btn.setPosition(x, QTY_Y, 0);
        btn.addComponent(UITransform).setContentSize(QTY_BTN, QTY_BTN);
        btn.addComponent(Graphics);
        const labN = new Node('Label');
        labN.layer = btn.layer;
        labN.setParent(btn);
        labN.addComponent(UITransform).setContentSize(QTY_BTN - 8, QTY_BTN - 8);
        const lab = labN.addComponent(Label);
        lab.string = label;
        lab.horizontalAlign = Label.HorizontalAlign.CENTER;
        lab.verticalAlign = Label.VerticalAlign.CENTER;
        styleUiLabel(lab, { size: 34, color: UI_INK, outline: false });
        this.paintQtyBtn(btn, true);
        btn.active = false;
        return btn;
    }

    private build() {
        const canvas = this.node;
        const dim = new Node('TownShopDimmer');
        dim.layer = canvas.layer;
        dim.setParent(canvas);
        dim.addComponent(UITransform).setContentSize(1200, 2200);
        const dg = dim.addComponent(Graphics);
        dg.fillColor = new Color(0, 0, 0, 140);
        dg.rect(-600, -1100, 1200, 2200);
        dg.fill();
        this._dimmer = dim;

        const root = new Node('TownShopPanel');
        root.layer = canvas.layer;
        root.setParent(canvas);
        root.setPosition(0, 40, 0);
        root.addComponent(UITransform).setContentSize(PANEL_W, PANEL_H);
        this._root = root;

        const chrome = new Node('Chrome');
        chrome.layer = root.layer;
        chrome.setParent(root);
        chrome.addComponent(UITransform).setContentSize(PANEL_W, PANEL_H);
        const g = chrome.addComponent(Graphics);
        drawWoodParchmentPanel(g, PANEL_W, PANEL_H, { radius: 22, lightInset: true });

        const titleN = new Node('Title');
        titleN.layer = root.layer;
        titleN.setParent(root);
        titleN.setPosition(0, TITLE_Y, 0);
        titleN.addComponent(UITransform).setContentSize(600, 48);
        const title = titleN.addComponent(Label);
        title.horizontalAlign = Label.HorizontalAlign.CENTER;
        styleUiLabel(title, { size: 36, color: UI_INK, outline: false });
        this._title = title;

        this._goldAmt = mountGoldAmount(root, {
            name: 'Gold',
            x: 0,
            y: GOLD_Y,
            iconSize: 36,
            fontSize: 28,
            color: UI_PRICE,
            align: 'center',
            amount: 0,
        });

        const buyTab = new Node('BuyTab');
        buyTab.layer = root.layer;
        buyTab.setParent(root);
        buyTab.setPosition(-120, TAB_Y, 0);
        buyTab.addComponent(UITransform).setContentSize(180, TAB_H);
        buyTab.addComponent(Graphics);
        const buyLabN = new Node('Label');
        buyLabN.layer = buyTab.layer;
        buyLabN.setParent(buyTab);
        buyLabN.addComponent(UITransform).setContentSize(160, 40);
        const buyLab = buyLabN.addComponent(Label);
        buyLab.string = '购买';
        buyLab.horizontalAlign = Label.HorizontalAlign.CENTER;
        buyLab.verticalAlign = Label.VerticalAlign.CENTER;
        styleUiLabel(buyLab, { size: 26, color: UI_INK, outline: false });
        this._buyTab = buyTab;
        this._buyTabLab = buyLab;

        const sellTab = new Node('SellTab');
        sellTab.layer = root.layer;
        sellTab.setParent(root);
        sellTab.setPosition(120, TAB_Y, 0);
        sellTab.addComponent(UITransform).setContentSize(180, TAB_H);
        sellTab.addComponent(Graphics);
        const sellLabN = new Node('Label');
        sellLabN.layer = sellTab.layer;
        sellLabN.setParent(sellTab);
        sellLabN.addComponent(UITransform).setContentSize(160, 40);
        const sellLab = sellLabN.addComponent(Label);
        sellLab.string = '出售';
        sellLab.horizontalAlign = Label.HorizontalAlign.CENTER;
        sellLab.verticalAlign = Label.VerticalAlign.CENTER;
        styleUiLabel(sellLab, { size: 26, color: UI_INK, outline: false });
        this._sellTab = sellTab;
        this._sellTabLab = sellLab;

        // Board / info card — centered body so quest text isn't crammed into the footer.
        const bodyCard = new Node('BodyCard');
        bodyCard.layer = root.layer;
        bodyCard.setParent(root);
        bodyCard.setPosition(0, 40, 0);
        const bodyW = PANEL_W - 100;
        const bodyH = 420;
        bodyCard.addComponent(UITransform).setContentSize(bodyW, bodyH);
        const bcG = bodyCard.addComponent(Graphics);
        drawParchmentRow(bcG, bodyW, bodyH, 16);
        this._bodyCard = bodyCard;

        const bodyN = new Node('Body');
        bodyN.layer = bodyCard.layer;
        bodyN.setParent(bodyCard);
        bodyN.setPosition(0, 0, 0);
        const bodyUt = bodyN.addComponent(UITransform);
        const body = bodyN.addComponent(Label);
        // Overflow BEFORE size: Label(NONE) shrinks the node to the empty string,
        // and RESIZE_HEIGHT would then wrap on that ~2-glyph width.
        body.overflow = Label.Overflow.RESIZE_HEIGHT;
        body.enableWrapText = true;
        body.horizontalAlign = Label.HorizontalAlign.CENTER;
        body.verticalAlign = Label.VerticalAlign.CENTER;
        styleUiLabel(body, { size: 28, color: UI_INK, outline: false });
        body.lineHeight = 40;
        bodyUt.setContentSize(PANEL_W - 140, 380);
        this._body = body;

        const hintN = new Node('Hint');
        hintN.layer = root.layer;
        hintN.setParent(root);
        hintN.setPosition(0, HINT_Y, 0);
        const hintUt = hintN.addComponent(UITransform);
        const hint = hintN.addComponent(Label);
        hint.overflow = Label.Overflow.CLAMP;
        hint.enableWrapText = true;
        hint.horizontalAlign = Label.HorizontalAlign.CENTER;
        hint.verticalAlign = Label.VerticalAlign.CENTER;
        styleUiLabel(hint, { size: 22, color: UI_INK_MUTE, outline: false });
        hintUt.setContentSize(640, 48);
        this._hint = hint;

        this._minusBtn = this.makeQtyBtn('QtyMinus', MINUS_X, '−');
        this._plusBtn = this.makeQtyBtn('QtyPlus', PLUS_X, '+');

        const qtyN = new Node('QtyValue');
        qtyN.layer = root.layer;
        qtyN.setParent(root);
        qtyN.setPosition(QTY_LAB_X, QTY_Y, 0);
        qtyN.addComponent(UITransform).setContentSize(80, 48);
        const qtyLab = qtyN.addComponent(Label);
        qtyLab.string = '1';
        qtyLab.horizontalAlign = Label.HorizontalAlign.CENTER;
        qtyLab.verticalAlign = Label.VerticalAlign.CENTER;
        styleUiLabel(qtyLab, { size: 32, color: UI_INK, outline: false });
        qtyN.active = false;
        this._qtyLab = qtyLab;

        const action = new Node('ActionBtn');
        action.layer = root.layer;
        action.setParent(root);
        action.setPosition(0, ACTION_Y, 0);
        action.addComponent(UITransform).setContentSize(ACTION_W, ACTION_H);
        action.addComponent(Graphics);
        const actionLabN = new Node('Label');
        actionLabN.layer = action.layer;
        actionLabN.setParent(action);
        actionLabN.addComponent(UITransform).setContentSize(ACTION_W - 20, ACTION_H - 8);
        const actionLab = actionLabN.addComponent(Label);
        actionLab.string = '接受委托';
        actionLab.horizontalAlign = Label.HorizontalAlign.CENTER;
        actionLab.verticalAlign = Label.VerticalAlign.CENTER;
        styleUiLabel(actionLab, { size: 28, color: UI_INK, outline: false });
        this._actionBtn = action;
        this._actionLab = actionLab;

        const tradeVerbN = new Node('TradeVerb');
        tradeVerbN.layer = action.layer;
        tradeVerbN.setParent(action);
        tradeVerbN.addComponent(UITransform).setContentSize(80, ACTION_H - 8);
        const tradeVerb = tradeVerbN.addComponent(Label);
        tradeVerb.string = '购买';
        tradeVerb.horizontalAlign = Label.HorizontalAlign.CENTER;
        tradeVerb.verticalAlign = Label.VerticalAlign.CENTER;
        styleUiLabel(tradeVerb, { size: 28, color: UI_INK, outline: false });
        tradeVerbN.active = false;
        this._tradeVerbLab = tradeVerb;

        this._tradeGold = mountGoldAmount(action, {
            name: 'TradeGold',
            x: 40,
            y: 0,
            iconSize: 32,
            fontSize: 26,
            color: UI_INK,
            align: 'left',
            amount: 0,
        });
        this._tradeGold.setVisible(false);

        this._closeBtn = mountPanelCloseButton(root, PANEL_W, PANEL_H, { name: 'Close' });
    }
}
