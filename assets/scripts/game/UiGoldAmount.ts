import {
    Color,
    Label,
    Node,
    Sprite,
    SpriteFrame,
    UITransform,
    assetManager,
} from 'cc';
import { REWARD_FRAMES } from './RewardFrames';
import { UI_PRICE } from './UiChrome';
import { styleUiLabel } from './UiFont';

/** Shared G-coin sprite (`ic-gold` / reward gold). */
export const GOLD_ICON_UUID = REWARD_FRAMES.gold;

/** Text-only fallback when a sprite cannot be mounted (toasts, etc.). */
export function formatGoldAmount(n: number, opts?: { sign?: '+' | '-' | '' }): string {
    const sign = opts?.sign ?? '';
    return `金币 x ${sign}${Math.max(0, Math.floor(n))}`;
}

export type GoldAmountHandle = {
    root: Node;
    setAmount: (n: number, opts?: { sign?: '+' | '-' | '' }) => void;
    setVisible: (on: boolean) => void;
};

let _goldSf: SpriteFrame | null | undefined;
const _goldWaiters: Array<(sf: SpriteFrame | null) => void> = [];

function loadGoldFrame(done: (sf: SpriteFrame | null) => void) {
    if (_goldSf !== undefined) {
        done(_goldSf);
        return;
    }
    _goldWaiters.push(done);
    if (_goldWaiters.length > 1) return;
    assetManager.loadAny({ uuid: GOLD_ICON_UUID }, (err, asset) => {
        _goldSf = !err && asset ? (asset as SpriteFrame) : null;
        if (err || !asset) console.warn('[UiGoldAmount] ic-gold missing', err);
        const waiters = _goldWaiters.splice(0, _goldWaiters.length);
        for (const w of waiters) w(_goldSf);
    });
}

/**
 * Bind to an existing prefab GoldAmount root (`Icon` + `Amount` children).
 * Does not move or resize nodes — layout stays in the prefab.
 */
export function bindGoldAmount(root: Node, opts?: { color?: Color }): GoldAmountHandle {
    const color = opts?.color ?? UI_PRICE;
    const iconN = root.getChildByName('Icon');
    const labN = root.getChildByName('Amount');
    const lab = labN?.getComponent(Label) ?? null;
    if (lab) {
        styleUiLabel(lab, { size: lab.fontSize || 26, color, outline: false });
        lab.overflow = Label.Overflow.SHRINK;
    }
    if (iconN) {
        const sp = iconN.getComponent(Sprite) ?? iconN.addComponent(Sprite);
        sp.sizeMode = Sprite.SizeMode.CUSTOM;
        sp.trim = false;
        loadGoldFrame((sf) => {
            if (!iconN.isValid || !sf) return;
            sp.spriteFrame = sf;
        });
    }
    return {
        root,
        setAmount: (n, o) => {
            if (!lab) return;
            const sign = o?.sign ?? '';
            lab.string = `x ${sign}${Math.max(0, Math.floor(n))}`;
            lab.color = color;
        },
        setVisible: (on) => {
            root.active = on;
        },
    };
}

/**
 * Inline purse chip: [G icon] x N  (optionally +/− before the count).
 * Matches top-right info-bar coin + quantity language game-wide.
 * Prefer bindGoldAmount when a prefab already owns layout.
 */
export function mountGoldAmount(
    parent: Node,
    opts?: {
        name?: string;
        x?: number;
        y?: number;
        iconSize?: number;
        fontSize?: number;
        color?: Color;
        align?: 'left' | 'center' | 'right';
        amount?: number;
        sign?: '+' | '-' | '';
    },
): GoldAmountHandle {
    const iconSize = opts?.iconSize ?? 32;
    const fontSize = opts?.fontSize ?? 26;
    const color = opts?.color ?? UI_PRICE;
    const align = opts?.align ?? 'center';
    const gap = 6;
    const labW = Math.max(72, fontSize * 5);
    const totalW = iconSize + gap + labW;

    const root = new Node(opts?.name ?? 'GoldAmount');
    root.layer = parent.layer;
    root.setParent(parent);
    root.setPosition(opts?.x ?? 0, opts?.y ?? 0, 0);
    root.addComponent(UITransform).setContentSize(totalW, Math.max(iconSize, fontSize + 8));

    const iconN = new Node('Icon');
    iconN.layer = root.layer;
    iconN.setParent(root);
    iconN.addComponent(UITransform).setContentSize(iconSize, iconSize);
    const sp = iconN.addComponent(Sprite);
    sp.sizeMode = Sprite.SizeMode.CUSTOM;
    sp.trim = false;
    loadGoldFrame((sf) => {
        if (!iconN.isValid || !sf) return;
        sp.spriteFrame = sf;
    });

    const labN = new Node('Amount');
    labN.layer = root.layer;
    labN.setParent(root);
    labN.addComponent(UITransform).setContentSize(labW, fontSize + 10);
    const lab = labN.addComponent(Label);
    lab.horizontalAlign = Label.HorizontalAlign.LEFT;
    lab.verticalAlign = Label.VerticalAlign.CENTER;
    lab.overflow = Label.Overflow.NONE;
    styleUiLabel(lab, { size: fontSize, color, outline: false });

    const layout = (amount: number, sign: '+' | '-' | '' = '') => {
        const text = `x ${sign}${Math.max(0, Math.floor(amount))}`;
        lab.string = text;
        // Approximate glyph width so icon+label stay snug as a unit.
        const approx = Math.ceil(fontSize * 0.62 * text.length) + 8;
        const useLabW = Math.max(48, approx);
        labN.getComponent(UITransform)?.setContentSize(useLabW, fontSize + 10);
        const w = iconSize + gap + useLabW;
        root.getComponent(UITransform)?.setContentSize(w, Math.max(iconSize, fontSize + 8));
        let left = -w * 0.5;
        if (align === 'left') left = 0;
        else if (align === 'right') left = -w;
        iconN.setPosition(left + iconSize * 0.5, 0, 0);
        labN.setPosition(left + iconSize + gap + useLabW * 0.5, 0, 0);
    };

    layout(opts?.amount ?? 0, opts?.sign ?? '');

    return {
        root,
        setAmount: (n, o) => layout(n, o?.sign ?? ''),
        setVisible: (on) => {
            root.active = on;
        },
    };
}
