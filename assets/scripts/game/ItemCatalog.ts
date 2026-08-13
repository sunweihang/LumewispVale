import { CDisplay, CItem, ItemType } from '../cfg/schema';
import { getConfigTables } from './ConfigService';

/** Matches `display_template.xlsx` ids (SLG templates + Vale overlays). */
export const DisplayTemplateId = {
    StackCount: 1,
    TimeLimit: 2,
    Vip: 3,
    QualityFrame: 4,
    QualityGlow: 5,
    NewTag: 6,
    BindIcon: 7,
    Discount: 8,
    LevelReq: 9,
    ClassTag: 10,
    /** param JSON `{ icon, kind }` */
    Icon: 11,
    /** param JSON `{ price, currency }` — absent = not sellable */
    SellPrice: 12,
} as const;

/** Legacy / shorthand ids → canonical `TItem.id`. */
const ALIASES: Record<string, string> = {
    coin: 'gold',
    money: 'gold',
    seed: 'seeds',
    crops: 'parsnip',
    boosts: 'boost',
    goldore: 'goldOre',
    gold_ore: 'goldOre',
    木材: 'wood',
};

type IconParam = { icon?: string; kind?: string };
export type SellParam = { price: number; currency: string };

/**
 * Runtime item lookup — GameClient pattern:
 * `TItem` (base) + `TDisplay` rows linked by `display_id` / `link_id`.
 */
export function resolveItemId(id: string): string {
    const raw = (id || '').trim();
    if (!raw) return '';
    if (ALIASES[raw]) return ALIASES[raw]!;
    const lower = raw.toLowerCase().replace(/[\s-]+/g, '_');
    if (ALIASES[lower]) return ALIASES[lower]!;
    return raw;
}

export function getItem(id: string): CItem | null {
    const key = resolveItemId(id);
    if (!key) return null;
    return getConfigTables()?.TItem.get(key) ?? null;
}

export function allItems(): CItem[] {
    const list = getConfigTables()?.TItem.getDataList() ?? [];
    return list.slice().sort((a, b) => a.sort - b.sort);
}

/** All display overlays for an item (`TItem.display_id` → `TDisplay.link_id`). */
export function itemDisplays(id: string): CDisplay[] {
    const item = getItem(id);
    const tables = getConfigTables();
    if (!item || !tables || !item.displayId) return [];
    return tables.TDisplay.getDataList().filter((d) => d.linkId === item.displayId);
}

export function itemDisplayOf(id: string, templateId: number): CDisplay | null {
    return itemDisplays(id).find((d) => d.displayTemplateId === templateId) ?? null;
}

function parseJsonParam<T extends object>(raw: string): T | null {
    if (!raw) return null;
    try {
        const v = JSON.parse(raw) as T;
        return v && typeof v === 'object' ? v : null;
    } catch {
        return null;
    }
}

function iconParamOf(id: string): IconParam {
    const row = itemDisplayOf(id, DisplayTemplateId.Icon);
    return (row && parseJsonParam<IconParam>(row.param)) || {};
}

/** Sell overlay — `null` when the item has no 售价 display row. */
export function itemSell(id: string): SellParam | null {
    const row = itemDisplayOf(id, DisplayTemplateId.SellPrice);
    if (!row) return null;
    const p = parseJsonParam<Partial<SellParam>>(row.param);
    const price = Math.max(0, Number(p?.price ?? row.num) || 0);
    if (price <= 0) return null;
    const currency = resolveItemId(p?.currency || 'gold') || 'gold';
    return { price, currency };
}

/** Items the GM panel may grant (`gm_grant`). */
export function gmGrantItems(): CItem[] {
    return allItems().filter((i) => i.gmGrant && i.gmAmount > 0);
}

export function itemName(id: string, fallback = ''): string {
    return getItem(id)?.name ?? (fallback || id);
}

/** Category label from display Icon overlay (`kind`). */
export function itemKind(id: string, fallback = ''): string {
    return iconParamOf(id).kind || fallback;
}

export function itemDesc(id: string, fallback = ''): string {
    return getItem(id)?.desc ?? fallback;
}

/** Icon SpriteFrame UUID from display Icon overlay. */
export function itemIcon(id: string): string {
    return iconParamOf(id).icon || '';
}

export function itemMaxStack(id: string, fallback = 999): number {
    const item = getItem(id);
    if (!item) return fallback;
    const stack = itemDisplayOf(id, DisplayTemplateId.StackCount);
    if (stack && stack.num > 0) return stack.num;
    return item.maxStack || fallback;
}

/** Gold-equivalent sell amount; 0 if not sellable or currency ≠ gold. */
export function itemSellPrice(id: string, fallback = 0): number {
    const sell = itemSell(id);
    if (!sell) return fallback;
    if (sell.currency !== 'gold') return fallback;
    return sell.price;
}

export function itemType(id: string): ItemType | null {
    return getItem(id)?.type ?? null;
}

export function isItemType(id: string, type: ItemType): boolean {
    return itemType(id) === type;
}

/** Tip block used by bag / hotbar bubbles. */
export function itemTip(id: string): { title: string; kind: string; desc: string } | null {
    const row = getItem(id);
    if (!row) return null;
    return {
        title: row.name,
        kind: itemKind(id, ''),
        desc: row.desc,
    };
}

/** All item icon UUIDs from display overlays (for asset warmup). */
export function allItemIconUuids(): string[] {
    const out: string[] = [];
    const tables = getConfigTables();
    if (!tables) return out;
    for (const d of tables.TDisplay.getDataList()) {
        if (d.displayTemplateId !== DisplayTemplateId.Icon) continue;
        const icon = parseJsonParam<IconParam>(d.param)?.icon;
        if (icon) out.push(icon);
    }
    return out;
}
