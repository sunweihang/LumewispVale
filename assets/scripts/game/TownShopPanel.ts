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
import { applyUiFont } from './UiFont';

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
 * Town shop / board UI — Graphics chrome, gold spend → FarmSystem inventory.
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

    /** Accept / OK chrome — TutorialGuide points here while the board is open. */
    acceptBtnNode(): Node | null {
        if (!this.isOpen || !this._actionBtn?.active) return null;
        return this._actionBtn;
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
        this._quest = pool[Math.floor(Math.random() * pool.length)];
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
        // Close chip top-right
        if (local.x > PANEL_W * 0.5 - 70 && local.y > PANEL_H * 0.5 - 70) {
            playUiClick();
            this.close();
            return true;
        }
        if (this._mode === 'shop' && this._shop) {
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
        const farm = this.farm;
        if (!q || !farm) return;
        // Instant resolve for v1 board jobs — later: walk-to objectives.
        farm.addGold(q.rewardGold);
        this.quests?.noteFlag('accept_board');
        this.setHint(`完成「${q.title}」+${q.rewardGold}G`);
        this.refreshGold();
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
            this._hint.string = '接取后立刻结算报酬';
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
        gfx.clear();
        gfx.fillColor = primary ? new Color(196, 163, 90, 255) : new Color(70, 88, 74, 255);
        gfx.roundRect(-ACTION_W * 0.5, -ACTION_H * 0.5, ACTION_W, ACTION_H, 14);
        gfx.fill();
        gfx.strokeColor = new Color(242, 220, 160, 255);
        gfx.lineWidth = 3;
        gfx.roundRect(-ACTION_W * 0.5, -ACTION_H * 0.5, ACTION_W, ACTION_H, 14);
        gfx.stroke();
        if (this._actionLab) {
            this._actionLab.color = primary
                ? new Color(40, 32, 24, 255)
                : new Color(242, 237, 224, 255);
        }
    }

    private paintTab(node: Node | null, lab: Label | null, on: boolean) {
        if (!node) return;
        const gfx = node.getComponent(Graphics);
        if (gfx) {
            gfx.clear();
            gfx.fillColor = on ? new Color(196, 163, 90, 255) : new Color(46, 58, 50, 240);
            gfx.roundRect(-90, -24, 180, 48, 10);
            gfx.fill();
            gfx.strokeColor = new Color(196, 163, 90, 220);
            gfx.lineWidth = 2;
            gfx.roundRect(-90, -24, 180, 48, 10);
            gfx.stroke();
        }
        if (lab) lab.color = on ? new Color(40, 32, 24, 255) : new Color(220, 210, 190, 255);
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
        const ut = row.addComponent(UITransform);
        ut.setContentSize(PANEL_W - 80, ROW_H);
        const gfx = row.addComponent(Graphics);
        gfx.fillColor = new Color(46, 58, 50, 240);
        gfx.rect(-(PANEL_W - 80) * 0.5, -ROW_H * 0.5, PANEL_W - 80, ROW_H);
        gfx.fill();
        gfx.strokeColor = new Color(196, 163, 90, 220);
        gfx.lineWidth = 2;
        gfx.rect(-(PANEL_W - 80) * 0.5, -ROW_H * 0.5, PANEL_W - 80, ROW_H);
        gfx.stroke();

        const labN = new Node('lab');
        labN.layer = row.layer;
        labN.setParent(row);
        labN.setPosition(-20, 8, 0);
        labN.addComponent(UITransform).setContentSize(480, 40);
        const lab = labN.addComponent(Label);
        applyUiFont(lab);
        lab.fontSize = 28;
        lab.horizontalAlign = Label.HorizontalAlign.LEFT;
        lab.color = new Color(242, 237, 224, 255);
        lab.string = title;

        const descN = new Node('desc');
        descN.layer = row.layer;
        descN.setParent(row);
        descN.setPosition(-20, -22, 0);
        descN.addComponent(UITransform).setContentSize(480, 28);
        const descLab = descN.addComponent(Label);
        applyUiFont(descLab);
        descLab.fontSize = 20;
        descLab.color = new Color(168, 160, 144, 255);
        descLab.string = desc;

        const priceN = new Node('price');
        priceN.layer = row.layer;
        priceN.setParent(row);
        priceN.setPosition(260, 0, 0);
        priceN.addComponent(UITransform).setContentSize(120, 40);
        const price = priceN.addComponent(Label);
        applyUiFont(price);
        price.fontSize = 28;
        price.horizontalAlign = Label.HorizontalAlign.RIGHT;
        price.color = new Color(240, 210, 100, 255);
        price.string = priceText;
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
        const g = root.addComponent(Graphics);
        g.fillColor = new Color(30, 40, 34, 250);
        g.roundRect(-PANEL_W * 0.5, -PANEL_H * 0.5, PANEL_W, PANEL_H, 20);
        g.fill();
        g.strokeColor = new Color(196, 163, 90, 255);
        g.lineWidth = 4;
        g.roundRect(-PANEL_W * 0.5, -PANEL_H * 0.5, PANEL_W, PANEL_H, 20);
        g.stroke();
        this._root = root;

        const titleN = new Node('Title');
        titleN.layer = root.layer;
        titleN.setParent(root);
        titleN.setPosition(0, TITLE_Y, 0);
        titleN.addComponent(UITransform).setContentSize(600, 48);
        const title = titleN.addComponent(Label);
        applyUiFont(title);
        title.fontSize = 36;
        title.horizontalAlign = Label.HorizontalAlign.CENTER;
        title.color = new Color(242, 237, 224, 255);
        this._title = title;

        const goldN = new Node('Gold');
        goldN.layer = root.layer;
        goldN.setParent(root);
        goldN.setPosition(0, GOLD_Y, 0);
        goldN.addComponent(UITransform).setContentSize(400, 36);
        const gold = goldN.addComponent(Label);
        applyUiFont(gold);
        gold.fontSize = 26;
        gold.horizontalAlign = Label.HorizontalAlign.CENTER;
        gold.color = new Color(240, 210, 100, 255);
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
        applyUiFont(buyLab);
        buyLab.fontSize = 26;
        buyLab.horizontalAlign = Label.HorizontalAlign.CENTER;
        buyLab.verticalAlign = Label.VerticalAlign.CENTER;
        buyLab.string = '购买';
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
        applyUiFont(sellLab);
        sellLab.fontSize = 26;
        sellLab.horizontalAlign = Label.HorizontalAlign.CENTER;
        sellLab.verticalAlign = Label.VerticalAlign.CENTER;
        sellLab.string = '出售';
        this._sellTab = sellTab;
        this._sellTabLab = sellLab;

        // Board / info card — centered body so quest text isn't crammed into the footer.
        const bodyCard = new Node('BodyCard');
        bodyCard.layer = root.layer;
        bodyCard.setParent(root);
        bodyCard.setPosition(0, 40, 0);
        bodyCard.addComponent(UITransform).setContentSize(PANEL_W - 100, 420);
        const bcG = bodyCard.addComponent(Graphics);
        bcG.fillColor = new Color(46, 58, 50, 240);
        bcG.roundRect(-(PANEL_W - 100) * 0.5, -210, PANEL_W - 100, 420, 16);
        bcG.fill();
        bcG.strokeColor = new Color(196, 163, 90, 180);
        bcG.lineWidth = 2;
        bcG.roundRect(-(PANEL_W - 100) * 0.5, -210, PANEL_W - 100, 420, 16);
        bcG.stroke();
        this._bodyCard = bodyCard;

        const bodyN = new Node('Body');
        bodyN.layer = bodyCard.layer;
        bodyN.setParent(bodyCard);
        bodyN.setPosition(0, 0, 0);
        const bodyUt = bodyN.addComponent(UITransform);
        const body = bodyN.addComponent(Label);
        applyUiFont(body);
        body.fontSize = 28;
        body.lineHeight = 40;
        // Overflow BEFORE size: Label(NONE) shrinks the node to the empty string,
        // and RESIZE_HEIGHT would then wrap on that ~2-glyph width.
        body.overflow = Label.Overflow.RESIZE_HEIGHT;
        body.enableWrapText = true;
        body.horizontalAlign = Label.HorizontalAlign.CENTER;
        body.verticalAlign = Label.VerticalAlign.CENTER;
        body.color = new Color(242, 237, 224, 255);
        bodyUt.setContentSize(PANEL_W - 140, 380);
        this._body = body;

        const hintN = new Node('Hint');
        hintN.layer = root.layer;
        hintN.setParent(root);
        hintN.setPosition(0, -PANEL_H * 0.5 + 168, 0);
        const hintUt = hintN.addComponent(UITransform);
        const hint = hintN.addComponent(Label);
        applyUiFont(hint);
        hint.fontSize = 22;
        hint.overflow = Label.Overflow.CLAMP;
        hint.enableWrapText = true;
        hint.horizontalAlign = Label.HorizontalAlign.CENTER;
        hint.verticalAlign = Label.VerticalAlign.CENTER;
        hint.color = new Color(200, 195, 180, 255);
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
        applyUiFont(actionLab);
        actionLab.fontSize = 30;
        actionLab.horizontalAlign = Label.HorizontalAlign.CENTER;
        actionLab.verticalAlign = Label.VerticalAlign.CENTER;
        actionLab.color = new Color(40, 32, 24, 255);
        actionLab.string = '接受委托';
        this._actionBtn = action;
        this._actionLab = actionLab;

        const closeN = new Node('Close');
        closeN.layer = root.layer;
        closeN.setParent(root);
        closeN.setPosition(PANEL_W * 0.5 - 28, PANEL_H * 0.5 - 28, 0);
        closeN.addComponent(UITransform).setContentSize(56, 56);
        const cg = closeN.addComponent(Graphics);
        cg.fillColor = new Color(140, 60, 50, 255);
        cg.circle(0, 0, 26);
        cg.fill();
        cg.strokeColor = new Color(242, 237, 224, 255);
        cg.lineWidth = 3;
        cg.moveTo(-10, -10);
        cg.lineTo(10, 10);
        cg.moveTo(10, -10);
        cg.lineTo(-10, 10);
        cg.stroke();
    }
}
