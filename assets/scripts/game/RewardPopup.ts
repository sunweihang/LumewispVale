import {
    _decorator,
    assetManager,
    Color,
    Component,
    Graphics,
    Label,
    Node,
    Prefab,
    Sprite,
    SpriteFrame,
    UIOpacity,
    UITransform,
    Vec3,
    instantiate,
    tween,
    Tween,
} from 'cc';
import { CQuest } from '../cfg/schema';
import { InputBridge } from './InputBridge';
import { itemIcon, itemName } from './ItemCatalog';
import { QuestSystem } from './QuestSystem';
import { REWARD_FRAMES } from './RewardFrames';
import {
    REWARD_POPUP_LAYOUT as L,
    REWARD_POPUP_PREFAB_UUID,
} from './RewardPopupFrames';
import { playUiGold } from './UiAudio';
import {
    UI_INK as INK,
    UI_INK_MUTE as INK_MUTE,
    UI_PRICE as COUNT_INK,
    drawWoodParchmentPanel,
} from './UiChrome';
import { applyUiFont, loadUiFont, styleUiLabel } from './UiFont';

const { ccclass } = _decorator;

type RewardChip = {
    uuid: string | null;
    count: number;
    name: string;
    /** Gold flies to the top-right G mark; items to the backpack. */
    kind: 'gold' | 'item';
};

/**
 * Quest claim modal — title + reward grid + 领取.
 * No quest name, no icon wells (icons float on parchment).
 */
@ccclass('RewardPopup')
export class RewardPopup extends Component {
    quests: QuestSystem | null = null;

    private _prefabRoot: Node | null = null;
    private _dimmer: Node | null = null;
    private _root: Node | null = null;
    private _titleLab: Label | null = null;
    private _chipHost: Node | null = null;
    private _btnLab: Label | null = null;
    private _closeBtn: Node | null = null;
    private _rootOp: UIOpacity | null = null;
    private _dimOp: UIOpacity | null = null;
    private _open = false;
    private _prevBlocking = false;
    private _iconCache = new Map<string, SpriteFrame>();
    private _fontReady = false;
    private _ready = false;
    private _pendingOpen = false;

    get isOpen() {
        return this._open;
    }

    onLoad() {
        this.loadPrefab();
        loadUiFont().then(() => {
            this._fontReady = true;
            this.applyFonts();
            if (this._pendingOpen && this._ready) {
                this._pendingOpen = false;
                this.openForActive();
            }
        });
    }

    onDestroy() {
        if (this._open) InputBridge.uiBlocking = this._prevBlocking;
        this.killTweens();
    }

    bind(quests: QuestSystem) {
        this.quests = quests;
    }

    /** Open claim modal for the active awaiting-claim quest. */
    openForActive(): boolean {
        const q = this.quests?.activeQuest;
        if (!this.quests?.isAwaitingClaim || !q) return false;
        if (!this._fontReady || !this._ready) {
            this._pendingOpen = true;
            if (!this._fontReady) loadUiFont();
            return true;
        }
        this.paint(q);
        this.show();
        return true;
    }

    handleTap(_uiX: number, _uiY: number): boolean {
        if (!this._open || !this._root) return false;
        // Anywhere on modal / dimmer / close X claims — one-tap friendly.
        this.confirmClaim();
        return true;
    }

    private confirmClaim() {
        if (!this._open) return;
        playUiGold();
        // Snapshot chip icons → bag fly, then hide chips so we don't double-draw.
        const flies = this.collectFlyPayloads();
        if (this._chipHost) this._chipHost.active = false;
        this.playRewardFlies(flies);
        // Claim AFTER hide so the next quest intro dialogue does not nest while
        // this popup still owns uiBlocking (that left blocking stuck true).
        this.hide(() => {
            this.quests?.claimActive();
        });
    }

    private collectFlyPayloads(): {
        sf: SpriteFrame;
        x: number;
        y: number;
        count: number;
        target: 'bag' | 'gold';
    }[] {
        const host = this._chipHost;
        if (!host?.isValid) return [];
        const out: {
            sf: SpriteFrame;
            x: number;
            y: number;
            count: number;
            target: 'bag' | 'gold';
        }[] = [];
        for (const chip of host.children) {
            const icon = chip.getChildByName('Icon');
            const sf = icon?.getComponent(Sprite)?.spriteFrame ?? null;
            if (!sf || !icon) continue;
            const pos = this.nodeCanvasPos(icon);
            if (!pos) continue;
            let count = 1;
            const lab = chip.getChildByName('Label')?.getComponent(Label)?.string ?? '';
            const m = /x\s*(\d+)/i.exec(lab);
            if (m) count = Math.max(1, parseInt(m[1]!, 10) || 1);
            const target: 'bag' | 'gold' = chip.name === 'ChipGold' ? 'gold' : 'bag';
            out.push({ sf, x: pos.x, y: pos.y, count, target }); // ChipGold → G mark
        }
        return out;
    }

    private playRewardFlies(
        flies: { sf: SpriteFrame; x: number; y: number; count: number; target: 'bag' | 'gold' }[],
    ) {
        const hud = this.quests?.hud;
        if (!hud || flies.length <= 0) return;
        for (let i = 0; i < flies.length; i++) {
            const f = flies[i]!;
            const delay = i * 0.08;
            if (delay <= 0) {
                hud.playCanvasLootFly(f.sf, f.x, f.y, f.count, f.target);
            } else {
                this.scheduleOnce(() => {
                    if (!hud.isValid) return;
                    hud.playCanvasLootFly(f.sf, f.x, f.y, f.count, f.target);
                }, delay);
            }
        }
    }

    /** Accumulate local positions up to the Canvas this component lives on. */
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

    private paint(q: CQuest) {
        if (this._titleLab) this._titleLab.string = '获得奖励';
        if (this._btnLab) this._btnLab.string = '领取';
        if (this._chipHost) this._chipHost.active = true;
        this.rebuildChips(this.listRewards(q));
        this.applyFonts();
    }

    /**
     * Centered grid:
     *   1 → one large chip
     *   2–3 → single centered row
     *   4+ → wrap at colsMax, each row centered
     */
    private rebuildChips(rewards: RewardChip[]) {
        const host = this._chipHost;
        if (!host) return;
        host.removeAllChildren();

        if (rewards.length <= 0) {
            const empty = new Node('Empty');
            empty.layer = host.layer;
            empty.setParent(host);
            empty.addComponent(UITransform).setContentSize(400, 48);
            const lab = empty.addComponent(Label);
            lab.string = '（无道具）';
            lab.horizontalAlign = Label.HorizontalAlign.CENTER;
            lab.verticalAlign = Label.VerticalAlign.CENTER;
            styleUiLabel(lab, { size: 28, color: INK_MUTE, outline: false });
            applyUiFont(lab);
            return;
        }

        const n = rewards.length;
        const cols = Math.min(L.colsMax, n);
        const rows = Math.ceil(n / cols);
        const iconS = n === 1 ? L.iconOne : L.iconMulti;
        const chipW = n === 1 ? 200 : L.chipW;
        const chipH = n === 1 ? 170 : L.chipH;
        const gapX = n === 1 ? 0 : L.gapX;
        const gapY = L.gapY;

        const gridW = cols * chipW + (cols - 1) * gapX;
        const gridH = rows * chipH + (rows - 1) * gapY;
        host.getComponent(UITransform)?.setContentSize(Math.max(gridW, 200), Math.max(gridH, 120));

        for (let i = 0; i < n; i++) {
            const row = Math.floor(i / cols);
            const col = i % cols;
            // Last row may be shorter — center that row alone.
            const rowStart = row * cols;
            const rowCount = Math.min(cols, n - rowStart);
            const rowW = rowCount * chipW + (rowCount - 1) * gapX;
            const x0 = -rowW * 0.5 + chipW * 0.5;
            const y0 = gridH * 0.5 - chipH * 0.5;
            const x = x0 + col * (chipW + gapX);
            const y = y0 - row * (chipH + gapY);
            this.addChip(host, rewards[i], x, y, chipW, chipH, iconS);
        }
    }

    /** Icon (no well) + name + count under — inventory-drop style. */
    private addChip(
        host: Node,
        r: RewardChip,
        x: number,
        y: number,
        chipW: number,
        chipH: number,
        iconS: number,
    ) {
        const chip = new Node(r.kind === 'gold' ? 'ChipGold' : 'ChipItem');
        chip.layer = host.layer;
        chip.setParent(host);
        chip.setPosition(x, y, 0);
        chip.addComponent(UITransform).setContentSize(chipW, chipH);

        // Icon floats on parchment — no slot plate.
        if (r.uuid) {
            const iconN = new Node('Icon');
            iconN.layer = host.layer;
            iconN.setParent(chip);
            iconN.setPosition(0, 22, 0);
            iconN.addComponent(UITransform).setContentSize(iconS, iconS);
            const sp = iconN.addComponent(Sprite);
            sp.sizeMode = Sprite.SizeMode.CUSTOM;
            sp.trim = false;
            this.loadIcon(r.uuid, sp);
        }

        // Gold: icon already above → "x 20". Items keep "名称 x N".
        const labN = new Node('Label');
        labN.layer = host.layer;
        labN.setParent(chip);
        labN.setPosition(0, -48, 0);
        labN.addComponent(UITransform).setContentSize(chipW - 4, 36);
        const lab = labN.addComponent(Label);
        lab.string = r.kind === 'gold' ? `x ${r.count}` : `${r.name} x ${r.count}`;
        lab.horizontalAlign = Label.HorizontalAlign.CENTER;
        lab.verticalAlign = Label.VerticalAlign.CENTER;
        lab.overflow = Label.Overflow.SHRINK;
        styleUiLabel(lab, { size: 26, color: COUNT_INK, outline: false });
        applyUiFont(lab);
    }

    private listRewards(q: CQuest): RewardChip[] {
        const out: RewardChip[] = [];
        if (q.rewardGold > 0) {
            out.push({
                uuid: this.rewardIconUuid('gold'),
                count: q.rewardGold,
                name: itemName('gold', '金币'),
                kind: 'gold',
            });
        }
        if (q.rewardItem && q.rewardCount > 0) {
            out.push({
                uuid: this.rewardIconUuid(q.rewardItem),
                count: q.rewardCount,
                name: itemName(q.rewardItem, q.rewardItem),
                kind: 'item',
            });
        }
        return out;
    }

    private rewardIconUuid(kind: string): string | null {
        if (!kind) return null;
        const fromTable = itemIcon(kind);
        if (fromTable) return fromTable;
        const reward = REWARD_FRAMES as Record<string, string | undefined>;
        const k = kind.toLowerCase().replace(/[\s-]+/g, '_');
        return reward[k] ?? reward[kind] ?? null;
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

    private show() {
        if (!this._root || !this._dimmer || !this._prefabRoot) return;
        this.killTweens();
        if (!this._open) {
            this._prevBlocking = InputBridge.uiBlocking;
            InputBridge.uiBlocking = true;
        }
        this._open = true;
        this._prefabRoot.active = true;
        this._dimmer.active = true;
        this._root.active = true;
        this._prefabRoot.setSiblingIndex(this.node.children.length - 1);
        if (this._dimOp) this._dimOp.opacity = 0;
        if (this._rootOp) this._rootOp.opacity = 0;
        this._root.setScale(0.92, 0.92, 1);
        if (this._dimOp) tween(this._dimOp).to(0.16, { opacity: 255 }).start();
        if (this._rootOp) tween(this._rootOp).to(0.18, { opacity: 255 }).start();
        tween(this._root)
            .to(0.18, { scale: new Vec3(1, 1, 1) }, { easing: 'backOut' })
            .start();
    }

    private hide(onDone?: () => void) {
        if (!this._open) {
            onDone?.();
            return;
        }
        this.killTweens();
        this._open = false;
        InputBridge.uiBlocking = this._prevBlocking;
        const finish = () => {
            if (this._dimmer) this._dimmer.active = false;
            if (this._root) this._root.active = false;
            if (this._prefabRoot) this._prefabRoot.active = false;
            onDone?.();
        };
        if (this._dimOp) tween(this._dimOp).to(0.12, { opacity: 0 }).start();
        if (this._rootOp) {
            tween(this._rootOp).to(0.12, { opacity: 0 }).call(finish).start();
        } else {
            finish();
        }
    }

    private hideImmediate() {
        this.killTweens();
        this._open = false;
        if (this._dimmer) this._dimmer.active = false;
        if (this._root) this._root.active = false;
        if (this._prefabRoot) this._prefabRoot.active = false;
        if (this._dimOp) this._dimOp.opacity = 0;
        if (this._rootOp) this._rootOp.opacity = 0;
    }

    private killTweens() {
        if (this._dimOp) Tween.stopAllByTarget(this._dimOp);
        if (this._rootOp) Tween.stopAllByTarget(this._rootOp);
        if (this._root) Tween.stopAllByTarget(this._root);
    }

    private applyFonts() {
        if (this._titleLab) applyUiFont(this._titleLab);
        if (this._btnLab) applyUiFont(this._btnLab);
    }

    private loadPrefab() {
        const canvas = this.node;
        const oldDim = canvas.getChildByName('RewardDimmer');
        if (oldDim) oldDim.destroy();
        const oldRoot = canvas.getChildByName('RewardPopup');
        if (oldRoot) oldRoot.destroy();

        assetManager.loadAny({ uuid: REWARD_POPUP_PREFAB_UUID }, (err, asset) => {
            if (err || !asset) {
                console.warn('[RewardPopup] prefab missing', err);
                this._ready = true;
                return;
            }
            const inst = instantiate(asset as Prefab);
            inst.layer = canvas.layer;
            inst.setParent(canvas);
            this._prefabRoot = inst;
            this.bindRefs(inst);
            this.paintChromeOnce();
            this.hideImmediate();
            this._ready = true;
            if (this._pendingOpen && this._fontReady) {
                this._pendingOpen = false;
                this.openForActive();
            }
        });
    }

    private bindRefs(root: Node) {
        this._dimmer = root.getChildByName('Dimmer');
        this._root = root.getChildByName('Panel');
        this._dimOp = this._dimmer?.getComponent(UIOpacity) ?? this._dimmer?.addComponent(UIOpacity) ?? null;
        this._rootOp = this._root?.getComponent(UIOpacity) ?? this._root?.addComponent(UIOpacity) ?? null;
        const panel = this._root;
        if (!panel) return;
        this._titleLab = panel.getChildByName('Title')?.getComponent(Label) ?? null;
        this._chipHost = panel.getChildByName('Chips');
        this._closeBtn = panel.getChildByName('Close');
        const claim = panel.getChildByName('ClaimBtn');
        this._btnLab = claim?.getChildByName('Lab')?.getComponent(Label) ?? null;
        if (this._titleLab) {
            styleUiLabel(this._titleLab, {
                size: 40,
                color: INK,
                outline: true,
                outlineWidth: 3,
                outlineColor: new Color(255, 240, 200, 180),
            });
            this._titleLab.horizontalAlign = Label.HorizontalAlign.CENTER;
            this._titleLab.verticalAlign = Label.VerticalAlign.CENTER;
        }
        if (this._btnLab) {
            styleUiLabel(this._btnLab, {
                size: 34,
                color: new Color(255, 252, 230, 255),
                outline: true,
                outlineWidth: 3,
                outlineColor: new Color(40, 24, 12, 220),
            });
            this._btnLab.horizontalAlign = Label.HorizontalAlign.CENTER;
            this._btnLab.verticalAlign = Label.VerticalAlign.CENTER;
        }
        this.applyFonts();
    }

    private paintChromeOnce() {
        const panel = this._root;
        if (!panel) return;
        const chrome = panel.getChildByName('Chrome')?.getComponent(Graphics);
        if (chrome) drawWoodParchmentPanel(chrome, L.panelW, L.panelH, { radius: 28, lightInset: false });
        if (this._dimmer) {
            const dg = this._dimmer.getComponent(Graphics);
            if (dg) {
                dg.clear();
                dg.fillColor = new Color(0, 0, 0, 150);
                dg.rect(-600, -1100, 1200, 2200);
                dg.fill();
            }
        }
    }
}
