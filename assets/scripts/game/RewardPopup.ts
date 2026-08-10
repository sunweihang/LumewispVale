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
} from 'cc';
import { CQuest } from '../cfg/schema';
import { InputBridge } from './InputBridge';
import { MATERIAL_FRAMES } from './MaterialFrames';
import { QUEST_FRAMES } from './QuestFrames';
import { QuestSystem } from './QuestSystem';
import { REWARD_FRAMES } from './RewardFrames';
import { TOOL_FRAMES } from './ToolFrames';
import { playUiGold } from './UiAudio';
import { applyUiFont, loadUiFont, styleUiLabel } from './UiFont';

const { ccclass } = _decorator;

const PANEL_W = 680;
const PANEL_H = 500;
const BTN_W = 280;
const BTN_H = 88;

/** Max columns before wrapping to next row. */
const COLS_MAX = 3;
const CHIP_W = 160;
const CHIP_H = 150;
const GAP_X = 28;
const GAP_Y = 20;
/** Single reward gets a bigger icon; multi shrinks slightly. */
const ICON_ONE = 96;
const ICON_MULTI = 80;

const WOOD = new Color(176, 110, 48, 255);
const WOOD_DARK = new Color(120, 72, 32, 255);
const PARCHMENT = new Color(236, 210, 158, 255);
const GOLD = new Color(210, 150, 70, 255);
const STROKE = new Color(60, 36, 18, 255);
const INK = new Color(68, 40, 18, 255);
const INK_MUTE = new Color(110, 78, 42, 255);
const COUNT_INK = new Color(140, 84, 24, 255);

type RewardChip = { uuid: string | null; count: number; name: string };

/**
 * Quest claim modal — title + reward grid + 领取.
 * No quest name, no icon wells (icons float on parchment).
 */
@ccclass('RewardPopup')
export class RewardPopup extends Component {
    quests: QuestSystem | null = null;

    private _dimmer: Node | null = null;
    private _root: Node | null = null;
    private _titleLab: Label | null = null;
    private _chipHost: Node | null = null;
    private _btnLab: Label | null = null;
    private _rootOp: UIOpacity | null = null;
    private _dimOp: UIOpacity | null = null;
    private _open = false;
    private _prevBlocking = false;
    private _iconCache = new Map<string, SpriteFrame>();
    private _fontReady = false;
    private _pendingOpen = false;

    get isOpen() {
        return this._open;
    }

    onLoad() {
        this.build();
        this.hideImmediate();
        loadUiFont().then(() => {
            this._fontReady = true;
            this.applyFonts();
            if (this._pendingOpen) {
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
        if (!this._fontReady) {
            this._pendingOpen = true;
            loadUiFont();
            return true;
        }
        this.paint(q);
        this.show();
        return true;
    }

    handleTap(_uiX: number, _uiY: number): boolean {
        if (!this._open || !this._root) return false;
        // Anywhere on modal / dimmer claims — one-tap friendly.
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

    private collectFlyPayloads(): { sf: SpriteFrame; x: number; y: number; count: number }[] {
        const host = this._chipHost;
        if (!host?.isValid) return [];
        const out: { sf: SpriteFrame; x: number; y: number; count: number }[] = [];
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
            out.push({ sf, x: pos.x, y: pos.y, count });
        }
        return out;
    }

    private playRewardFlies(flies: { sf: SpriteFrame; x: number; y: number; count: number }[]) {
        const hud = this.quests?.hud;
        if (!hud || flies.length <= 0) return;
        for (let i = 0; i < flies.length; i++) {
            const f = flies[i]!;
            const delay = i * 0.08;
            if (delay <= 0) {
                hud.playCanvasLootFly(f.sf, f.x, f.y, f.count);
            } else {
                this.scheduleOnce(() => {
                    if (!hud.isValid) return;
                    hud.playCanvasLootFly(f.sf, f.x, f.y, f.count);
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
     *   4+ → wrap at COLS_MAX, each row centered
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
        const cols = Math.min(COLS_MAX, n);
        const rows = Math.ceil(n / cols);
        const iconS = n === 1 ? ICON_ONE : ICON_MULTI;
        const chipW = n === 1 ? 200 : CHIP_W;
        const chipH = n === 1 ? 170 : CHIP_H;
        const gapX = n === 1 ? 0 : GAP_X;
        const gapY = GAP_Y;

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
        const chip = new Node('Chip');
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

        // Single line: 金币 x 20
        const labN = new Node('Label');
        labN.layer = host.layer;
        labN.setParent(chip);
        labN.setPosition(0, -48, 0);
        labN.addComponent(UITransform).setContentSize(chipW - 4, 36);
        const lab = labN.addComponent(Label);
        lab.string = `${r.name} x ${r.count}`;
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
                name: '金币',
            });
        }
        if (q.rewardItem && q.rewardCount > 0) {
            out.push({
                uuid: this.rewardIconUuid(q.rewardItem),
                count: q.rewardCount,
                name: this.rewardName(q.rewardItem),
            });
        }
        return out;
    }

    private rewardName(kind: string): string {
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
        if (!this._root || !this._dimmer) return;
        this.killTweens();
        if (!this._open) {
            this._prevBlocking = InputBridge.uiBlocking;
            InputBridge.uiBlocking = true;
        }
        this._open = true;
        this._dimmer.active = true;
        this._root.active = true;
        this._dimmer.setSiblingIndex(this.node.children.length - 1);
        this._root.setSiblingIndex(this.node.children.length - 1);
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

    private build() {
        const canvas = this.node;

        const oldDim = canvas.getChildByName('RewardDimmer');
        if (oldDim) oldDim.destroy();
        const oldRoot = canvas.getChildByName('RewardPopup');
        if (oldRoot) oldRoot.destroy();

        const dim = new Node('RewardDimmer');
        dim.layer = canvas.layer;
        dim.setParent(canvas);
        dim.addComponent(UITransform).setContentSize(1200, 2200);
        const dg = dim.addComponent(Graphics);
        dg.fillColor = new Color(0, 0, 0, 150);
        dg.rect(-600, -1100, 1200, 2200);
        dg.fill();
        this._dimOp = dim.addComponent(UIOpacity);
        this._dimmer = dim;

        const root = new Node('RewardPopup');
        root.layer = canvas.layer;
        root.setParent(canvas);
        root.setPosition(0, 40, 0);
        root.addComponent(UITransform).setContentSize(PANEL_W, PANEL_H);
        this._rootOp = root.addComponent(UIOpacity);

        const chrome = new Node('Chrome');
        chrome.layer = root.layer;
        chrome.setParent(root);
        chrome.addComponent(UITransform).setContentSize(PANEL_W, PANEL_H);
        const g = chrome.addComponent(Graphics);
        const x0 = -PANEL_W * 0.5;
        const y0 = -PANEL_H * 0.5;
        g.fillColor = WOOD_DARK;
        g.roundRect(x0, y0, PANEL_W, PANEL_H, 28);
        g.fill();
        g.fillColor = WOOD;
        g.roundRect(x0 + 6, y0 + 6, PANEL_W - 12, PANEL_H - 12, 24);
        g.fill();
        g.fillColor = PARCHMENT;
        g.roundRect(x0 + 16, y0 + 16, PANEL_W - 32, PANEL_H - 32, 20);
        g.fill();
        g.strokeColor = GOLD;
        g.lineWidth = 3;
        g.roundRect(x0 + 12, y0 + 12, PANEL_W - 24, PANEL_H - 24, 22);
        g.stroke();
        g.strokeColor = STROKE;
        g.lineWidth = 3;
        g.roundRect(x0, y0, PANEL_W, PANEL_H, 28);
        g.stroke();
        this._root = root;

        const titleN = new Node('Title');
        titleN.layer = root.layer;
        titleN.setParent(root);
        titleN.setPosition(0, PANEL_H * 0.5 - 58, 0);
        titleN.addComponent(UITransform).setContentSize(560, 48);
        const title = titleN.addComponent(Label);
        title.string = '获得奖励';
        title.horizontalAlign = Label.HorizontalAlign.CENTER;
        title.verticalAlign = Label.VerticalAlign.CENTER;
        styleUiLabel(title, {
            size: 40,
            color: INK,
            outline: true,
            outlineWidth: 3,
            outlineColor: new Color(255, 240, 200, 180),
        });
        this._titleLab = title;

        // Reward grid — vertically centered between title and button.
        const chips = new Node('Chips');
        chips.layer = root.layer;
        chips.setParent(root);
        chips.setPosition(0, 18, 0);
        chips.addComponent(UITransform).setContentSize(600, 220);
        this._chipHost = chips;

        const btn = new Node('ClaimBtn');
        btn.layer = root.layer;
        btn.setParent(root);
        btn.setPosition(0, -PANEL_H * 0.5 + 78, 0);
        btn.addComponent(UITransform).setContentSize(BTN_W, BTN_H);
        // Pixel chrome from quest primary — no runtime Graphics fill.
        const btnFace = new Node('Face');
        btnFace.layer = root.layer;
        btnFace.setParent(btn);
        btnFace.addComponent(UITransform).setContentSize(BTN_W, BTN_H);
        const btnSp = btnFace.addComponent(Sprite);
        btnSp.sizeMode = Sprite.SizeMode.CUSTOM;
        btnSp.trim = false;
        btnSp.type = Sprite.Type.SLICED;
        this.loadIcon(QUEST_FRAMES.btnPrimary, btnSp);

        const btnLabN = new Node('Lab');
        btnLabN.layer = root.layer;
        btnLabN.setParent(btn);
        btnLabN.setPosition(0, 2, 0);
        btnLabN.addComponent(UITransform).setContentSize(BTN_W, BTN_H);
        const btnLab = btnLabN.addComponent(Label);
        btnLab.string = '领取';
        btnLab.horizontalAlign = Label.HorizontalAlign.CENTER;
        btnLab.verticalAlign = Label.VerticalAlign.CENTER;
        styleUiLabel(btnLab, {
            size: 34,
            color: new Color(255, 252, 230, 255),
            outline: true,
            outlineWidth: 3,
            outlineColor: new Color(40, 24, 12, 220),
        });
        this._btnLab = btnLab;
    }
}
