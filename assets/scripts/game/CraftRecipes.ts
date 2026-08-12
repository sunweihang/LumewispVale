import { CCraftRecipe, Tables } from '../cfg/schema';
import { FarmMaterial, FarmTool } from './FarmSystem';

/** Items that can appear in craft costs / outputs (tools included). */
export type CraftItemId = FarmMaterial | 'seeds' | 'parsnip' | Exclude<FarmTool, 'hand' | 'seeds' | 'boost'>;

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
let _tables: Tables | null = null;

/** Apply Luban craft tables (call once after config load). */
export function applyCraftTables(tables: Tables) {
    _tables = tables;
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

/** Quest gates that earn a recipe scroll (before the player learns it). */
export type CraftEarnQuery = {
    isCompleted: (questId: number) => boolean;
    isActive: (questId: number) => boolean;
};

/**
 * Workbench listing: learned (or already crafted) recipes only.
 * Unlock rules for earning scrolls: `TCraftRecipe.unlock_quest` / `unlock_mode`.
 */
export type CraftUnlockQuery = CraftEarnQuery & {
    craftCount: (recipeId: string) => number;
    isLearned: (recipeId: string) => boolean;
};

/** True when the recipe uses a quest gate (scroll → learn). unlock_quest=0 skips scrolls. */
export function craftRecipeUsesScroll(recipeId: string): boolean {
    const row = _tables?.TCraftRecipe.get(recipeId);
    return !!row?.unlockQuest;
}

/**
 * Quest gate only — player receives a bag scroll when this flips true.
 * - unlock_quest=0 → always earned (no scroll; auto-learned)
 * - mode `reached` → active or completed
 * - mode `completed` → claimed/completed only
 */
export function isCraftRecipeEarned(recipeId: string, q: CraftEarnQuery): boolean {
    const row = _tables?.TCraftRecipe.get(recipeId);
    if (!row) return false;
    if (!row.unlockQuest) return true;
    if (row.unlockMode === 'completed') return q.isCompleted(row.unlockQuest);
    return q.isCompleted(row.unlockQuest) || q.isActive(row.unlockQuest);
}

/**
 * Appears on the workbench after the player learns the scroll (or has crafted it).
 */
export function isCraftRecipeUnlocked(recipeId: string, q: CraftUnlockQuery): boolean {
    if (q.craftCount(recipeId) > 0) return true;
    return q.isLearned(recipeId);
}

export function getUnlockedCraftRecipes(q: CraftUnlockQuery): CraftRecipe[] {
    return _recipes.filter((r) => isCraftRecipeUnlocked(r.id, q));
}
