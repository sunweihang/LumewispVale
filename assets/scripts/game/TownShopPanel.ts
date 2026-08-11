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
const LIST_TOP_SHOP = PANEL_H * 0.5 - 200;

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

    get isOpen() {
        return !!this._root?.active;
    }

    onLoad() {
        this.build();
        this.close();
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
        if (this._root) this._root.active = false;
        if (this._dimmer) this._dimmer.active = false;
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
            if (local.y > PANEL_H * 0.5 - 170 && local.y < PANEL_H * 0.5 - 110) {
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
            if (local.y < -PANEL_H * 0.28 && local.y > -PANEL_H * 0.42 && Math.abs(local.x) < 160) {
                playUiClick();
                this.acceptQuest();
                return true;
            }
        }
        if (this._mode === 'info') {
            if (local.y < -PANEL_H * 0.28 && Math.abs(local.x) < 160) {
                playUiClick();
                this.close();
                return true;
            }
        }
        return true;
    }

    private uiToCanvasLocal(uiX: number, uiY: number): { x: number; y: number } {
        const ut = this.node.getComponent(UITransform);
        const hw = (ut?.contentSize.width ?? 1080) * 0.5;
        const hh = (ut?.contentSize.height ?? 1920) * 0.5;
        return { x: uiX - hw, y: uiY - hh };
    }

    private show() {
        if (this._dimmer) this._dimmer.active = true;
        if (this._root) this._root.active = true;
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
        if (this._mode === 'shop' && this._shop) {
            this._title.string = this._shop.title;
            this.paintTab(this._buyTab, this._buyTabLab, this._shopSide === 'buy');
            this.paintTab(this._sellTab, this._sellTabLab, this._shopSide === 'sell');
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
            this._hint.string = `${this._quest.title}\n${this._quest.desc}\n报酬 ${this._quest.rewardGold}G\n（点下方接受）`;
        } else if (this._mode === 'info') {
            this._title.string = this._infoTitle;
            this._hint.string = this._infoBody;
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
        titleN.setPosition(0, PANEL_H * 0.5 - 56, 0);
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
        goldN.setPosition(0, PANEL_H * 0.5 - 100, 0);
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
        buyTab.setPosition(-120, PANEL_H * 0.5 - 140, 0);
        buyTab.addComponent(UITransform).setContentSize(180, 48);
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
        sellTab.setPosition(120, PANEL_H * 0.5 - 140, 0);
        sellTab.addComponent(UITransform).setContentSize(180, 48);
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

        const hintN = new Node('Hint');
        hintN.layer = root.layer;
        hintN.setParent(root);
        hintN.setPosition(0, -PANEL_H * 0.5 + 120, 0);
        hintN.addComponent(UITransform).setContentSize(640, 160);
        const hint = hintN.addComponent(Label);
        applyUiFont(hint);
        hint.fontSize = 24;
        hint.overflow = Label.Overflow.RESIZE_HEIGHT;
        hint.horizontalAlign = Label.HorizontalAlign.CENTER;
        hint.verticalAlign = Label.VerticalAlign.CENTER;
        hint.color = new Color(200, 195, 180, 255);
        this._hint = hint;

        const closeN = new Node('Close');
        closeN.layer = root.layer;
        closeN.setParent(root);
        closeN.setPosition(PANEL_W * 0.5 - 28, PANEL_H * 0.5 - 28, 0);
        closeN.addComponent(UITransform).setContentSize(56, 56);
        const cg = closeN.addComponent(Graphics);
        cg.fillColor = new Color(140, 60, 50, 255);
        cg.circle(0, 0, 26);
        cg.fill();
    }
}
