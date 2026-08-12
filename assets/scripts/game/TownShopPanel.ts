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
    UI_INK,
    UI_INK_MUTE,
    UI_PRICE,
    drawParchmentRow,
    drawWoodButton,
    drawWoodParchmentPanel,
    mountPanelCloseButton,
} from './UiChrome';
import { styleUiLabel } from './UiFont';

const { ccclass } = _decorator;

const PANEL_W = 720;
const PANEL_H = 980;
const ROW_H = 96;
/** Header Y (panel-local) — airy top stack so title / gold / tabs aren't crammed. */
const TITLE_Y = PANEL_H * 0.5 - 72;
const GOLD_Y = PANEL_H * 0.5 - 132;
const TAB_Y = PANEL_H * 0.5 - 200;
const TAB_H = 48;
/** Top edge of first shop row (panel-local). */
const LIST_TOP_SHOP = PANEL_H * 0.5 - 280;
/** Accept / OK button center Y (panel-local). */
const ACTION_Y = -PANEL_H * 0.35;
const ACTION_W = 320;
const ACTION_H = 72;

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
    private _goldLab: Label | null = null;
    private _hint: Label | null = null;
    private _body: Label | null = null;
    private _bodyCard: Node | null = null;
    private _actionBtn: Node | null = null;
    private _actionLab: Label | null = null;
    private _buyTab: Node | null = null;
    private _sellTab: Node | null = null;
    private _buyTabLab: Label | null = null;
    private _sellTabLab: Label | null = null;
    private _closeBtn: Node | null = null;
    private _rows: Node[] = [];
    private _sellRows: TownSellGoods[] = [];
    private _shop: TownShopDef | null = null;
    private _board: 'police' | 'post' | null = null;
    private _quest: TownBoardQuest | null = null;
    private _mode: 'shop' | 'board' | 'info' = 'shop';
    private _shopSide: 'buy' | 'sell' = 'buy';
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

    /** Accept / OK chrome — TutorialGuide points here while the board is open. */
    acceptBtnNode(): Node | null {
        if (!this.isOpen || !this._actionBtn?.active) return null;
        return this._actionBtn;
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
     * Quest 1020 / 1021: keep the idle arrow over the shop and lock taps to the
     * guided control (tab or first row) until buy / sell completes.
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
        // Prefer sell tab when the live mainline step is「出手盈余」.
        this._shopSide = active === 1021 ? 'sell' : 'buy';
        this._shop = shop;
        this._board = null;
        this._quest = null;
        this.refresh();
        this.show();
    }

    openBoard(kind: 'police' | 'post') {
        this._mode = 'board';
        this._board = kind;
        this._shop = null;
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
                    this.refresh();
                    return true;
                }
                if (local.x > 20 && local.x < 220) {
                    playUiClick();
                    this._shopSide = 'sell';
                    this.refresh();
                    return true;
                }
            }
            const listTop = LIST_TOP_SHOP;
            if (this._shopSide === 'buy') {
                for (let i = 0; i < this._shop.goods.length; i++) {
                    const rowY = listTop - i * (ROW_H + 10) - ROW_H * 0.5;
                    if (Math.abs(local.y - rowY) < ROW_H * 0.5 && Math.abs(local.x) < PANEL_W * 0.42) {
                        playUiClick();
                        this.buy(this._shop.goods[i]);
                        return true;
                    }
                }
            } else {
                for (let i = 0; i < this._sellRows.length; i++) {
                    const rowY = listTop - i * (ROW_H + 10) - ROW_H * 0.5;
                    if (Math.abs(local.y - rowY) < ROW_H * 0.5 && Math.abs(local.x) < PANEL_W * 0.42) {
                        playUiClick();
                        this.sell(this._sellRows[i]);
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
    private tradeGuideTarget(): 'buy-tab' | 'sell-tab' | 'buy-row' | 'sell-row' | null {
        if (!this.needsShopTradeGuide() || !this._shop) return null;
        const qid = this.quests?.activeQuest?.id ?? 0;
        if (qid === 1021) {
            if (this._shopSide !== 'sell') return 'sell-tab';
            return this._sellRows.length > 0 ? 'sell-row' : null;
        }
        if (qid === 1020) {
            if (this._shopSide !== 'buy') return 'buy-tab';
            return this._shop.goods.length > 0 ? 'buy-row' : null;
        }
        return null;
    }

    /** Swallow every tap except the guided tab / first list row. */
    private handleGuidedShopTap(
        lx: number,
        ly: number,
        guide: 'buy-tab' | 'sell-tab' | 'buy-row' | 'sell-row',
    ) {
        if (guide === 'buy-tab' || guide === 'sell-tab') {
            if (ly > TAB_Y - TAB_H * 0.5 - 6 && ly < TAB_Y + TAB_H * 0.5 + 6) {
                if (guide === 'buy-tab' && lx > -220 && lx < -20) {
                    playUiClick();
                    this._shopSide = 'buy';
                    this.refresh();
                    return;
                }
                if (guide === 'sell-tab' && lx > 20 && lx < 220) {
                    playUiClick();
                    this._shopSide = 'sell';
                    this.refresh();
                    return;
                }
            }
            return;
        }
        const listTop = LIST_TOP_SHOP;
        const rowY = listTop - ROW_H * 0.5;
        if (Math.abs(ly - rowY) >= ROW_H * 0.5 || Math.abs(lx) >= PANEL_W * 0.42) return;
        if (guide === 'buy-row') {
            const g = this._shop?.goods[0];
            if (!g) return;
            playUiClick();
            this.buy(g);
            return;
        }
        const g = this._sellRows[0];
        if (!g) return;
        playUiClick();
        this.sell(g);
    }

    private hitAction(lx: number, ly: number): boolean {
        return Math.abs(lx) < ACTION_W * 0.5 && Math.abs(ly - ACTION_Y) < ACTION_H * 0.5 + 8;
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

    private buy(g: TownGoods) {
        const farm = this.farm;
        if (!farm) return;
        if (farm.gold < g.price) {
            this.setHint('金币不足');
            return;
        }
        if (!farm.spendGold(g.price)) {
            this.setHint('金币不足');
            return;
        }
        this.grant(g);
        farm.notifyInventoryChanged();
        this.quests?.noteFlag('shop_buy');
        this.setHint(`已购买 ${g.title} ×${g.count}`);
        this.refreshGold();
    }

    private sell(g: TownSellGoods) {
        const farm = this.farm;
        if (!farm) return;
        const have = this.sellCount(g.id);
        if (have < 1) {
            this.setHint('没有可出售的库存');
            return;
        }
        this.takeSell(g.id, 1);
        farm.addGold(g.price);
        farm.notifyInventoryChanged();
        this.quests?.noteFlag('shop_sell');
        this.setHint(`已出售 ${g.title} +${g.price}G`);
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

    private grant(g: TownGoods) {
        const farm = this.farm!;
        switch (g.id) {
            case 'seed_parsnip':
            case 'seed_potato':
            case 'seed_cauli':
            case 'seed_berry':
            case 'seed_pumpkin':
                farm.seeds += g.count;
                farm.noteSeedPurchase(g.id, g.count);
                break;
            case 'ore_stone':
                farm.stone += g.count;
                break;
            case 'ore_copper':
                farm.copper += g.count;
                break;
            case 'ore_iron':
                farm.iron += g.count;
                break;
            case 'ore_gold':
                farm.goldOre += g.count;
                break;
            case 'wood_pack':
                farm.wood += g.count;
                break;
            case 'fiber_pack':
                farm.grass += g.count;
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
                    : '委托栏已满，先去任务里交付几份吧',
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
        if (this._actionBtn) this._actionBtn.active = boardOrInfo;
        if (this._goldLab) {
            // Board / info still show purse — reward text references gold.
            this._goldLab.node.active = this._mode !== 'info';
        }
        if (this._mode === 'shop' && this._shop) {
            this._title.string = this._shop.title;
            this.paintTab(this._buyTab, this._buyTabLab, this._shopSide === 'buy');
            this.paintTab(this._sellTab, this._sellTabLab, this._shopSide === 'sell');
            if (this._body) this._body.string = '';
            if (this._shopSide === 'buy') {
                this._hint.string = '点击商品行购买';
                this.buildShopRows(this._shop.goods, LIST_TOP_SHOP);
            } else {
                this._sellRows = TOWN_SELL_GOODS.filter((g) => this.sellCount(g.id) > 0);
                if (this._sellRows.length === 0) {
                    this._hint.string = '背包里暂无可出售的收获物\n（作物、鱼、草料、木石矿）';
                } else {
                    this._hint.string = '点击一行出售 1 件';
                    this.buildSellRows(this._sellRows, LIST_TOP_SHOP);
                }
            }
        } else if (this._mode === 'board' && this._quest) {
            const head = this._board === 'police' ? '警察局任务板' : '邮局急件';
            this._title.string = head;
            if (this._body) {
                this._body.string =
                    `「${this._quest.title}」\n\n` +
                    `${this._quest.desc}\n\n` +
                    `报酬  ${this._quest.rewardGold}G`;
            }
            this._hint.string = '接取后可在任务「委托」页查看与交付';
            this.setActionLabel('接受委托');
            this.paintAction(true);
            this.ensureBodyLayout();
            this.ensureHintLayout();
        } else if (this._mode === 'info') {
            this._title.string = this._infoTitle;
            if (this._body) this._body.string = this._infoBody;
            this._hint.string = '';
            this.setActionLabel('知道了');
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
        const h = 72;
        if (ut.contentSize.width < w - 1 || ut.contentSize.width > w + 1) {
            ut.setContentSize(w, Math.max(ut.contentSize.height, h));
        } else if (ut.contentSize.height < h) {
            ut.setContentSize(w, h);
        }
    }

    private setActionLabel(s: string) {
        if (this._actionLab) this._actionLab.string = s;
    }

    private paintAction(primary: boolean) {
        const gfx = this._actionBtn?.getComponent(Graphics);
        if (!gfx) return;
        drawWoodButton(gfx, ACTION_W, ACTION_H, primary ? 'primary' : 'muted');
        if (this._actionLab) {
            this._actionLab.color = primary ? UI_INK : UI_CREAM;
        }
    }

    private paintTab(node: Node | null, lab: Label | null, on: boolean) {
        if (!node) return;
        const gfx = node.getComponent(Graphics);
        if (gfx) drawWoodButton(gfx, 180, TAB_H, on ? 'on' : 'off');
        if (lab) lab.color = on ? UI_CREAM : UI_INK;
    }

    private refreshGold() {
        if (this._goldLab) {
            this._goldLab.string = `金币 ${this.farm?.gold ?? 0}`;
        }
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
                    listTop - i * (ROW_H + 10) - ROW_H * 0.5,
                    `${g.title}  ×${g.count}`,
                    g.desc,
                    `${g.price}G`,
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
                    listTop - i * (ROW_H + 10) - ROW_H * 0.5,
                    `${g.title}  ×${n}`,
                    g.desc,
                    `+${g.price}G`,
                ),
            );
        });
    }

    private makeRow(name: string, y: number, title: string, desc: string, priceText: string): Node {
        const row = new Node(name);
        row.layer = this.node.layer;
        row.setParent(this._root!);
        row.setPosition(0, y, 0);
        const rowW = PANEL_W - 80;
        const ut = row.addComponent(UITransform);
        ut.setContentSize(rowW, ROW_H);
        const gfx = row.addComponent(Graphics);
        drawParchmentRow(gfx, rowW, ROW_H, 12);

        const labN = new Node('lab');
        labN.layer = row.layer;
        labN.setParent(row);
        labN.setPosition(-20, 8, 0);
        labN.addComponent(UITransform).setContentSize(480, 40);
        const lab = labN.addComponent(Label);
        lab.string = title;
        lab.horizontalAlign = Label.HorizontalAlign.LEFT;
        styleUiLabel(lab, { size: 28, color: UI_INK, outline: false });

        const descN = new Node('desc');
        descN.layer = row.layer;
        descN.setParent(row);
        descN.setPosition(-20, -22, 0);
        descN.addComponent(UITransform).setContentSize(480, 28);
        const descLab = descN.addComponent(Label);
        descLab.string = desc;
        descLab.horizontalAlign = Label.HorizontalAlign.LEFT;
        styleUiLabel(descLab, { size: 20, color: UI_INK_MUTE, outline: false });

        const priceN = new Node('price');
        priceN.layer = row.layer;
        priceN.setParent(row);
        priceN.setPosition(260, 0, 0);
        priceN.addComponent(UITransform).setContentSize(120, 40);
        const price = priceN.addComponent(Label);
        price.string = priceText;
        price.horizontalAlign = Label.HorizontalAlign.RIGHT;
        styleUiLabel(price, { size: 28, color: UI_PRICE, outline: false });
        return row;
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

        const goldN = new Node('Gold');
        goldN.layer = root.layer;
        goldN.setParent(root);
        goldN.setPosition(0, GOLD_Y, 0);
        goldN.addComponent(UITransform).setContentSize(400, 36);
        const gold = goldN.addComponent(Label);
        gold.horizontalAlign = Label.HorizontalAlign.CENTER;
        styleUiLabel(gold, { size: 26, color: UI_PRICE, outline: false });
        this._goldLab = gold;

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
        hintN.setPosition(0, -PANEL_H * 0.5 + 168, 0);
        const hintUt = hintN.addComponent(UITransform);
        const hint = hintN.addComponent(Label);
        hint.overflow = Label.Overflow.CLAMP;
        hint.enableWrapText = true;
        hint.horizontalAlign = Label.HorizontalAlign.CENTER;
        hint.verticalAlign = Label.VerticalAlign.CENTER;
        styleUiLabel(hint, { size: 22, color: UI_INK_MUTE, outline: false });
        hintUt.setContentSize(640, 72);
        this._hint = hint;

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
        styleUiLabel(actionLab, { size: 30, color: UI_INK, outline: false });
        this._actionBtn = action;
        this._actionLab = actionLab;

        this._closeBtn = mountPanelCloseButton(root, PANEL_W, PANEL_H, { name: 'Close' });
    }
}
