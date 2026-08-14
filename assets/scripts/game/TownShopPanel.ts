import {
    _decorator,
    Color,
    Component,
    Graphics,
    Label,
    Node,
    Prefab,
    UITransform,
    assetManager,
    instantiate,
} from 'cc';
import { FarmSystem } from './FarmSystem';
import { GameState } from './GameState';
import { SNACK_STAMINA, clockHour } from './DayRules';
import { InputBridge } from './InputBridge';
import { itemName } from './ItemCatalog';
import { QuestSystem } from './QuestSystem';
import {
    TownBoardQuest,
    TownGoods,
    TownSellGoods,
    TownShopDef,
    POLICE_QUEST_POOL,
    POST_QUEST_POOL,
    getTownSellGoods,
    TOWN_SHOPS,
    shopOpenAt,
    SHOP_HOURS,
} from './TownCatalog';
import {
    TOWN_SHOP_LAYOUT as L,
    TOWN_SHOP_PREFAB_UUID,
    TOWN_SHOP_ROW_PREFAB_UUID,
} from './TownShopFrames';
import { playUiClick } from './UiAudio';
import {
    UI_CREAM,
    UI_GOLD,
    UI_INK,
    UI_INK_MUTE,
    UI_PRICE,
    UI_STROKE,
    applyParchmentRow,
    applyWoodButton,
    applyWoodPanel,
} from './UiChrome';
import { styleUiLabel } from './UiFont';
import { GoldAmountHandle, bindGoldAmount, formatGoldAmount } from './UiGoldAmount';

const { ccclass } = _decorator;

const TRADE_QTY_MAX = 99;

/**
 * Town shop / board UI — layout from TownShopPanel.prefab; script binds data only.
 */
@ccclass('TownShopPanel')
export class TownShopPanel extends Component {
    farm: FarmSystem | null = null;
    quests: QuestSystem | null = null;

    private _prefabRoot: Node | null = null;
    private _root: Node | null = null;
    private _dimmer: Node | null = null;
    private _title: Label | null = null;
    private _goldAmt: GoldAmountHandle | null = null;
    private _hint: Label | null = null;
    private _body: Label | null = null;
    private _bodyCard: Node | null = null;
    private _listHost: Node | null = null;
    private _confirmBtn: Node | null = null;
    private _acceptBtn: Node | null = null;
    private _plainLab: Label | null = null;
    private _acceptLab: Label | null = null;
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
    private _rowPrefab: Prefab | null = null;
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
    private _ready = false;

    get isOpen() {
        return !!this._prefabRoot?.active;
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

    get hasTradeSelection(): boolean {
        return this.isShopOpen && this._selIndex >= 0;
    }

    acceptBtnNode(): Node | null {
        if (!this.isOpen) return null;
        if (this._mode === 'shop') {
            if (!this._confirmBtn?.active) return null;
            return this._confirmBtn;
        }
        if (!this._acceptBtn?.active) return null;
        return this._acceptBtn;
    }

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

    closeBtnNode(): Node | null {
        if (!this.isShopOpen || !this._closeBtn?.isValid || !this._closeBtn.active) return null;
        return this._closeBtn;
    }

    needsShopTradeGuide(): boolean {
        if (!this.isShopOpen) return false;
        const quests = this.quests;
        const q = quests?.activeQuest;
        if (!q || quests?.isAwaitingClaim) return false;
        return q.id === 1020 || q.id === 1021;
    }

    needsShopCloseGuide(): boolean {
        if (!this.isShopOpen) return false;
        const quests = this.quests;
        const q = quests?.activeQuest;
        if (!q || !quests?.isAwaitingClaim) return false;
        return q.id === 1020 || q.id === 1021;
    }

    onLoad() {
        this.loadPrefab();
    }

    onDestroy() {
        if (this.isOpen) this.releaseInputLock();
    }

    openShop(shopId: string) {
        const shop = TOWN_SHOPS.find((s) => s.id === shopId) ?? null;
        if (!shop) return;
        const hour = clockHour(GameState.ensureClock().minutes);
        if (!shopOpenAt(shop.id, hour)) {
            const hours = SHOP_HOURS[shop.id]?.label ?? '';
            this.quests?.infoBoard?.showToast(
                hours ? `${shop.title}打烊了（${hours}）` : `${shop.title}打烊了`,
            );
            return;
        }
        this._mode = 'shop';
        const active = this.quests?.activeQuest?.id ?? 0;
        if (active === 1020) this._shopSide = 'sell';
        else if (active === 1021) this._shopSide = 'buy';
        else this._shopSide = 'buy';
        this._shop = shop;
        this._board = null;
        this._quest = null;
        this.clearTradeSelection();
        this.whenReady(() => {
            this.refresh();
            this.show();
        });
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
        this.whenReady(() => {
            this.refresh();
            this.show();
        });
    }

    openInfo(title: string, body: string) {
        this._mode = 'info';
        this._infoTitle = title;
        this._infoBody = body;
        this._shop = null;
        this._board = null;
        this._quest = null;
        this.clearTradeSelection();
        this.whenReady(() => {
            this.refresh();
            this.show();
        });
    }

    close() {
        const wasOpen = this.isOpen;
        if (this._prefabRoot) this._prefabRoot.active = false;
        if (wasOpen) this.releaseInputLock();
    }

    handleTap(uiX: number, uiY: number): boolean {
        if (!this.isOpen || !this._root) return false;
        const canvas = this.uiToCanvasLocal(uiX, uiY);
        const local = {
            x: canvas.x - this._root.position.x,
            y: canvas.y - this._root.position.y,
        };
        const guide = this.tradeGuideTarget();
        const closeHalf = L.closeHit * 0.5;
        if (Math.abs(local.x - L.closeX) <= closeHalf && Math.abs(local.y - L.closeY) <= closeHalf) {
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
            if (local.y > L.tabY - L.tabH * 0.5 - 6 && local.y < L.tabY + L.tabH * 0.5 + 6) {
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
            if (this._selIndex >= 0 && this.hitQtyDock(local.x, local.y)) return true;
            if (this._shopSide === 'buy') {
                for (let i = 0; i < this._shop.goods.length; i++) {
                    const rowY = L.listTop - i * (L.rowH + L.rowGap) - L.rowH * 0.5;
                    if (Math.abs(local.y - rowY) < L.rowH * 0.5 && Math.abs(local.x) < L.panelW * 0.42) {
                        playUiClick();
                        this.selectTradeRow(i);
                        return true;
                    }
                }
            } else {
                for (let i = 0; i < this._sellRows.length; i++) {
                    const rowY = L.listTop - i * (L.rowH + L.rowGap) - L.rowH * 0.5;
                    if (Math.abs(local.y - rowY) < L.rowH * 0.5 && Math.abs(local.x) < L.panelW * 0.42) {
                        playUiClick();
                        this.selectTradeRow(i);
                        return true;
                    }
                }
            }
        }
        if (this._mode === 'board' && this._quest) {
            if (this.hitAccept(local.x, local.y)) {
                playUiClick();
                this.acceptQuest();
                return true;
            }
        }
        if (this._mode === 'info') {
            if (this.hitAccept(local.x, local.y)) {
                playUiClick();
                this.close();
                return true;
            }
        }
        return true;
    }

    private whenReady(fn: () => void) {
        if (this._ready) {
            fn();
            return;
        }
        const t0 = Date.now();
        const tick = () => {
            if (this._ready) {
                fn();
                return;
            }
            if (Date.now() - t0 > 8000) {
                console.warn('[TownShopPanel] prefab not ready');
                return;
            }
            this.scheduleOnce(tick, 0);
        };
        tick();
    }

    private loadPrefab() {
        let pending = 2;
        const done = () => {
            pending -= 1;
            if (pending <= 0) this._ready = true;
        };
        assetManager.loadAny({ uuid: TOWN_SHOP_PREFAB_UUID }, (err, asset) => {
            if (err || !asset) {
                console.warn('[TownShopPanel] prefab missing', err);
                done();
                return;
            }
            const old = this.node.getChildByName('TownShopPanel');
            if (old) old.destroy();
            const inst = instantiate(asset as Prefab);
            inst.setParent(this.node);
            this._prefabRoot = inst;
            this.bindRefs(inst);
            this.paintChromeOnce();
            inst.active = false;
            done();
        });
        assetManager.loadAny({ uuid: TOWN_SHOP_ROW_PREFAB_UUID }, (err, asset) => {
            if (err || !asset) {
                console.warn('[TownShopPanel] row prefab missing', err);
                done();
                return;
            }
            this._rowPrefab = asset as Prefab;
            done();
        });
    }

    private bindRefs(root: Node) {
        this._dimmer = root.getChildByName('Dimmer');
        this._root = root.getChildByName('Panel');
        const panel = this._root;
        if (!panel) return;
        this._title = panel.getChildByName('Title')?.getComponent(Label) ?? null;
        const goldN = panel.getChildByName('Gold');
        if (goldN) this._goldAmt = bindGoldAmount(goldN, { color: UI_PRICE });
        this._buyTab = panel.getChildByName('BuyTab');
        this._sellTab = panel.getChildByName('SellTab');
        this._buyTabLab = this._buyTab?.getChildByName('Label')?.getComponent(Label) ?? null;
        this._sellTabLab = this._sellTab?.getChildByName('Label')?.getComponent(Label) ?? null;
        this._listHost = panel.getChildByName('ListHost');
        this._bodyCard = panel.getChildByName('BodyCard');
        this._body = this._bodyCard?.getChildByName('Body')?.getComponent(Label) ?? null;
        this._hint = panel.getChildByName('Hint')?.getComponent(Label) ?? null;
        this._minusBtn = panel.getChildByName('QtyMinus');
        this._plusBtn = panel.getChildByName('QtyPlus');
        this._qtyLab = panel.getChildByName('QtyValue')?.getComponent(Label) ?? null;
        this._confirmBtn = panel.getChildByName('ConfirmBtn');
        this._acceptBtn = panel.getChildByName('AcceptBtn');
        this._plainLab = this._confirmBtn?.getChildByName('PlainLab')?.getComponent(Label) ?? null;
        this._tradeVerbLab =
            this._confirmBtn?.getChildByName('TradeVerb')?.getComponent(Label) ?? null;
        const tg = this._confirmBtn?.getChildByName('TradeGold');
        if (tg) this._tradeGold = bindGoldAmount(tg, { color: UI_INK });
        this._acceptLab = this._acceptBtn?.getChildByName('Label')?.getComponent(Label) ?? null;
        this._closeBtn = panel.getChildByName('Close');
        if (this._title) styleUiLabel(this._title, { size: 36, color: UI_INK, outline: false });
        if (this._hint) styleUiLabel(this._hint, { size: 22, color: UI_INK_MUTE, outline: false });
        if (this._body) {
            styleUiLabel(this._body, { size: 28, color: UI_INK, outline: false });
            this._body.lineHeight = 40;
        }
        if (this._buyTabLab) styleUiLabel(this._buyTabLab, { size: 26, color: UI_INK, outline: false });
        if (this._sellTabLab) styleUiLabel(this._sellTabLab, { size: 26, color: UI_INK, outline: false });
        if (this._qtyLab) styleUiLabel(this._qtyLab, { size: 32, color: UI_INK, outline: false });
        if (this._plainLab) styleUiLabel(this._plainLab, { size: 28, color: UI_INK, outline: false });
        if (this._tradeVerbLab)
            styleUiLabel(this._tradeVerbLab, { size: 28, color: UI_INK, outline: false });
        if (this._acceptLab) styleUiLabel(this._acceptLab, { size: 28, color: UI_INK, outline: false });
    }

    private paintChromeOnce() {
        const panel = this._root;
        if (!panel) return;
        const chrome = panel.getChildByName('Chrome');
        if (chrome) applyWoodPanel(chrome, L.panelW, L.panelH);
        if (this._bodyCard) applyParchmentRow(this._bodyCard, L.panelW - 100, 420);
        if (this._dimmer) {
            const dg = this._dimmer.getComponent(Graphics);
            if (dg) {
                dg.clear();
                dg.fillColor = new Color(0, 0, 0, 140);
                dg.rect(-1100, -2000, 2200, 4000);
                dg.fill();
            }
        }
        this.paintTab(this._buyTab, this._buyTabLab, true);
        this.paintTab(this._sellTab, this._sellTabLab, false);
        this.paintQtyBtn(this._minusBtn, true);
        this.paintQtyBtn(this._plusBtn, true);
        this.paintConfirm(true);
        this.paintAccept(true);
    }

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

    private handleGuidedShopTap(
        lx: number,
        ly: number,
        guide: 'buy-tab' | 'sell-tab' | 'buy-row' | 'sell-row' | 'confirm',
    ) {
        if (guide === 'buy-tab' || guide === 'sell-tab') {
            if (ly > L.tabY - L.tabH * 0.5 - 6 && ly < L.tabY + L.tabH * 0.5 + 6) {
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
        const rowY = L.listTop - L.rowH * 0.5;
        if (Math.abs(ly - rowY) >= L.rowH * 0.5 || Math.abs(lx) >= L.panelW * 0.42) return;
        playUiClick();
        this.selectTradeRow(0);
    }

    private hitAccept(lx: number, ly: number): boolean {
        return Math.abs(lx) < L.actionW * 0.5 && Math.abs(ly - L.actionY) < L.actionH * 0.5 + 8;
    }

    private hitConfirm(lx: number, ly: number): boolean {
        return (
            Math.abs(lx - L.confirmX) < L.confirmW * 0.5 &&
            Math.abs(ly - L.qtyY) < L.actionH * 0.5 + 8
        );
    }

    private hitQtyDock(lx: number, ly: number): boolean {
        if (Math.abs(ly - L.qtyY) > L.qtyBtn * 0.55 + 8) return false;
        if (Math.abs(lx - L.minusX) < L.qtyBtn * 0.55) {
            playUiClick();
            this.nudgeTradeQty(-1);
            return true;
        }
        if (Math.abs(lx - L.plusX) < L.qtyBtn * 0.55) {
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
        if (!this._prefabRoot?.active) {
            this._prevBlocking = InputBridge.uiBlocking;
            InputBridge.uiBlocking = true;
            InputBridge.clear();
        }
        if (this._prefabRoot) {
            this._prefabRoot.active = true;
            this._prefabRoot.setSiblingIndex(this.node.children.length - 1);
        }
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
        const currency = g.currency || 'gold';
        if (currency === 'gold') {
            farm.addGold(gain);
        } else {
            farm.gmGrant(currency, gain);
        }
        farm.notifyInventoryChanged();
        this.quests?.noteFlag('shop_sell');
        const payLabel =
            currency === 'gold'
                ? formatGoldAmount(gain, { sign: '+' })
                : `${itemName(currency, currency)}+${gain}`;
        this.setHint(`已出售 ${g.title} ×${take}  ${payLabel}`);
        const keepId = g.id;
        this._sellRows = getTownSellGoods().filter((row) => this.sellCount(row.id) > 0);
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
                break;
            case 'snack':
                GameState.addStamina(SNACK_STAMINA * packs);
                this.quests?.infoBoard?.showToast(`体力 +${SNACK_STAMINA * packs}`);
                this.quests?.infoBoard?.refreshStamina();
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
        if (!this._ready || !this._title || !this._hint) return;
        this.clearRows();
        this.refreshGold();
        const tabsOn = this._mode === 'shop' && !!this._shop;
        if (this._buyTab) this._buyTab.active = tabsOn;
        if (this._sellTab) this._sellTab.active = tabsOn;
        const boardOrInfo = this._mode === 'board' || this._mode === 'info';
        if (this._bodyCard) this._bodyCard.active = boardOrInfo;
        if (this._goldAmt) this._goldAmt.setVisible(this._mode !== 'info');
        if (this._confirmBtn) this._confirmBtn.active = false;
        if (this._acceptBtn) this._acceptBtn.active = false;

        if (this._mode === 'shop' && this._shop) {
            this._title.string = this._shop.title;
            this.paintTab(this._buyTab, this._buyTabLab, this._shopSide === 'buy');
            this.paintTab(this._sellTab, this._sellTabLab, this._shopSide === 'sell');
            if (this._body) this._body.string = '';
            if (this._shopSide === 'buy') {
                this.buildShopRows(this._shop.goods);
                if (this._selIndex >= this._shop.goods.length) this.clearTradeSelection();
                this._hint.string =
                    this._selIndex < 0 ? '点选商品，调节数量后确认' : '确认购买';
            } else {
                this._sellRows = getTownSellGoods().filter((g) => this.sellCount(g.id) > 0);
                if (this._selIndex >= this._sellRows.length) this.clearTradeSelection();
                if (this._sellRows.length === 0) {
                    this._hint.string = '暂无可出售的收获物';
                } else {
                    this.buildSellRows(this._sellRows);
                    this._hint.string =
                        this._selIndex < 0 ? '点选收获物，调节数量后确认' : '确认出售';
                }
            }
            this.refreshTradeDock();
        } else if (this._mode === 'board' && this._quest) {
            this.setQtyDockActive(false);
            if (this._acceptBtn) this._acceptBtn.active = true;
            const head = this._board === 'police' ? '警察局任务板' : '邮局急件';
            this._title.string = head;
            if (this._body) {
                this._body.string =
                    `「${this._quest.title}」\n\n` +
                    `${this._quest.desc}\n\n` +
                    `报酬  ${formatGoldAmount(this._quest.rewardGold)}`;
            }
            this._hint.string = '接取后走到目标地点交互交付（任务「委托」可查看）';
            if (this._acceptLab) this._acceptLab.string = '接受委托';
            this.paintAccept(true);
        } else if (this._mode === 'info') {
            this.setQtyDockActive(false);
            if (this._acceptBtn) this._acceptBtn.active = true;
            this._title.string = this._infoTitle;
            if (this._body) this._body.string = this._infoBody;
            this._hint.string = '';
            if (this._acceptLab) this._acceptLab.string = '知道了';
            this.paintAccept(false);
        }
    }

    private setPlainConfirm(s: string) {
        if (this._plainLab) {
            this._plainLab.node.active = true;
            this._plainLab.string = s;
        }
        if (this._tradeVerbLab) this._tradeVerbLab.node.active = false;
        this._tradeGold?.setVisible(false);
    }

    private setTradeConfirm(verb: string, total: number, sign: '+' | '' = '') {
        if (this._plainLab) this._plainLab.node.active = false;
        if (this._tradeVerbLab) {
            this._tradeVerbLab.node.active = true;
            this._tradeVerbLab.string = verb;
            this._tradeVerbLab.color = UI_INK;
        }
        if (this._tradeGold) {
            this._tradeGold.setVisible(true);
            this._tradeGold.setAmount(total, { sign });
        }
    }

    private paintConfirm(primary: boolean) {
        if (this._confirmBtn) {
            applyWoodButton(this._confirmBtn, primary ? 'primary' : 'muted', L.confirmW, L.actionH);
        }
        if (this._plainLab?.node.active) this._plainLab.color = primary ? UI_INK : UI_CREAM;
        if (this._tradeVerbLab?.node.active) this._tradeVerbLab.color = primary ? UI_INK : UI_CREAM;
    }

    private paintAccept(primary: boolean) {
        if (this._acceptBtn) {
            applyWoodButton(this._acceptBtn, primary ? 'primary' : 'muted', L.actionW, L.actionH);
        }
        if (this._acceptLab) this._acceptLab.color = primary ? UI_INK : UI_CREAM;
    }

    private paintTab(node: Node | null, lab: Label | null, on: boolean) {
        if (!node) return;
        applyWoodButton(node, on ? 'on' : 'off', L.tabW, L.tabH);
        if (lab) lab.color = on ? UI_CREAM : UI_INK;
    }

    private setQtyDockActive(on: boolean) {
        if (this._minusBtn) this._minusBtn.active = on;
        if (this._plusBtn) this._plusBtn.active = on;
        if (this._qtyLab) this._qtyLab.node.active = on;
        if (!on && this._confirmBtn && this._mode === 'shop') {
            this._confirmBtn.active = false;
        }
    }

    private refreshTradeDock() {
        const on = this._mode === 'shop' && this._selIndex >= 0;
        this.setQtyDockActive(on);
        if (!on || !this._confirmBtn || !this._qtyLab) return;

        this.clampTradeQty();
        this._qtyLab.string = `${this._tradeQty}`;
        this._confirmBtn.active = true;

        const max = this.maxTradeQty();
        const can = max >= 1 && this._tradeQty >= 1 && this._tradeQty <= max;
        if (this._shopSide === 'buy') {
            const g = this._shop?.goods[this._selIndex];
            const total = g ? g.price * this._tradeQty : 0;
            if (can) this.setTradeConfirm('购买', total);
            else this.setPlainConfirm('金币不足');
            this.paintConfirm(can);
        } else {
            const g = this._sellRows[this._selIndex];
            const total = g ? g.price * this._tradeQty : 0;
            if (can) this.setTradeConfirm('出售', total, '+');
            else this.setPlainConfirm('无法出售');
            this.paintConfirm(can);
        }

        this.paintQtyBtn(this._minusBtn, this._tradeQty > 1);
        this.paintQtyBtn(this._plusBtn, this._tradeQty < max);
    }

    private paintQtyBtn(node: Node | null, enabled: boolean) {
        if (!node) return;
        applyWoodButton(node, enabled ? 'primary' : 'muted', L.qtyBtn, L.qtyBtn);
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

    private buildShopRows(goods: TownGoods[]) {
        goods.forEach((g, i) => {
            this._rows.push(
                this.makeRow(
                    L.listTop - i * (L.rowH + L.rowGap) - L.rowH * 0.5,
                    g.title,
                    `每份 ×${g.count}`,
                    g.price,
                    '',
                    i === this._selIndex,
                ),
            );
        });
    }

    private buildSellRows(goods: TownSellGoods[]) {
        goods.forEach((g, i) => {
            const n = this.sellCount(g.id);
            this._rows.push(
                this.makeRow(
                    L.listTop - i * (L.rowH + L.rowGap) - L.rowH * 0.5,
                    g.title,
                    `持有 ×${n}`,
                    g.price,
                    '+',
                    i === this._selIndex,
                ),
            );
        });
    }

    private makeRow(
        y: number,
        title: string,
        meta: string,
        price: number,
        sign: '+' | '',
        selected: boolean,
    ): Node {
        const host = this._listHost ?? this._root!;
        let row: Node;
        if (this._rowPrefab) {
            row = instantiate(this._rowPrefab);
        } else {
            row = new Node('TownShopRow');
            row.addComponent(UITransform).setContentSize(L.rowW, L.rowH);
            row.addComponent(Graphics);
        }
        row.layer = host.layer;
        row.setParent(host);
        // ListHost is centered at listY; convert panel-local row Y → list-local.
        const listY = this._listHost ? L.listY : 0;
        row.setPosition(0, y - listY, 0);

        applyParchmentRow(row, L.rowW, L.rowH);
        let sel = row.getChildByName('Sel');
        if (selected) {
            if (!sel) {
                sel = new Node('Sel');
                sel.layer = row.layer;
                sel.setParent(row);
                sel.addComponent(UITransform).setContentSize(L.rowW, L.rowH);
                sel.addComponent(Graphics);
            }
            sel.active = true;
            const sg = sel.getComponent(Graphics)!;
            sg.clear();
            sg.enabled = true;
            sg.strokeColor = UI_GOLD;
            sg.lineWidth = 4;
            sg.roundRect(-L.rowW * 0.5, -L.rowH * 0.5, L.rowW, L.rowH, 12);
            sg.stroke();
            sg.strokeColor = UI_STROKE;
            sg.lineWidth = 2;
            sg.roundRect(-L.rowW * 0.5 + 3, -L.rowH * 0.5 + 3, L.rowW - 6, L.rowH - 6, 10);
            sg.stroke();
        } else if (sel) {
            sel.active = false;
        }

        const titleLab = row.getChildByName('Title')?.getComponent(Label);
        const metaLab = row.getChildByName('Meta')?.getComponent(Label);
        if (titleLab) {
            titleLab.string = title;
            styleUiLabel(titleLab, { size: 28, color: UI_INK, outline: false });
        }
        if (metaLab) {
            metaLab.string = meta;
            styleUiLabel(metaLab, { size: 20, color: UI_INK_MUTE, outline: false });
        }
        const priceN = row.getChildByName('Price');
        if (priceN) {
            const handle = bindGoldAmount(priceN, { color: UI_PRICE });
            handle.setAmount(price, { sign });
        }
        return row;
    }
}
