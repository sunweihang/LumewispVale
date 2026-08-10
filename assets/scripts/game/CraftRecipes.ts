import { CCraftRecipe, Tables } from '../cfg/schema';
import { FarmMaterial } from './FarmSystem';

/** Items that can appear in craft costs / outputs (no tools). */
export type CraftItemId = FarmMaterial | 'seeds' | 'parsnip';

export interface CraftStack {
    id: CraftItemId;
    count: number;
}

export interface CraftRecipe {
    id: string;
    name: string;
    desc: string;
    out: CraftStack;
    cost: CraftStack[];
    /** Seconds from starting craft until output is granted. */
    craftSeconds: number;
}

function asItemId(id: string): CraftItemId {
    return id as CraftItemId;
}

function fromRow(row: CCraftRecipe, costs: CraftStack[]): CraftRecipe {
    return {
        id: row.id,
        name: row.name,
        desc: row.desc,
        out: { id: asItemId(row.outItem), count: row.outCount },
        cost: costs,
        craftSeconds: row.craftSeconds,
    };
}

/** Built from Luban `TCraftRecipe` + `TCraftCost`. */
let _recipes: CraftRecipe[] = [];

/** Apply Luban craft tables (call once after config load). */
export function applyCraftTables(tables: Tables) {
    const byRecipe = new Map<string, CraftStack[]>();
    for (const c of tables.TCraftCost.getDataList()) {
        const list = byRecipe.get(c.recipeId) ?? [];
        list.push({ id: asItemId(c.itemId), count: c.count });
        byRecipe.set(c.recipeId, list);
    }
    _recipes = tables.TCraftRecipe.getDataList()
        .slice()
        .sort((a, b) => a.sort - b.sort)
        .map((r) => fromRow(r, byRecipe.get(r.id) ?? []));
}

export function getCraftRecipes(): CraftRecipe[] {
    return _recipes;
}
