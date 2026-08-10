import type { FarmMaterial, FarmTool } from './FarmSystem';

/** Maps that can be gated by mainline progress. */
export type StoryMapId = 'farm' | 'town' | 'mine' | 'beach' | 'forest' | 'deepMine';

export type InventorySnapshot = {
    seeds: number;
    crops: number;
    boosts: number;
    wood: number;
    grass: number;
    dirt: number;
    stone: number;
    fish: number;
    copper: number;
    iron: number;
    goldOre: number;
    gold: number;
    seedPacks: Record<string, number>;
    tool: FarmTool;
};

export type QuestSnapshot = {
    activeId: number;
    completed: number[];
    /** Objective met — waiting for player tap to claim reward. */
    awaitingClaim?: boolean;
    gather: Record<string, number>;
    craft: Record<string, number>;
    flags: Record<string, number>;
    till: number;
    plant: number;
    water: number;
    harvest: number;
    fish: number;
};

/**
 * Cross-scene bag. Module state survives `director.loadScene`.
 * See docs/story-mainline.md.
 */
class GameStateStore {
    unlocked: Record<StoryMapId, boolean> = {
        farm: true,
        town: false,
        mine: false,
        beach: false,
        forest: false,
        deepMine: false,
    };

    inventory: InventorySnapshot | null = null;
    quest: QuestSnapshot | null = null;

    /** One-shot story dialogue ids already played this save session. */
    seenDialogue: Record<string, boolean> = {};

    /** Spawn hint after travel (e.g. near town farm sign). */
    pendingSpawn: { map: StoryMapId; x: number; y: number } | null = null;

    hasSeenDialogue(id: string): boolean {
        return !!this.seenDialogue[id];
    }

    markDialogueSeen(id: string) {
        if (!id) return;
        this.seenDialogue[id] = true;
    }

    isUnlocked(map: StoryMapId): boolean {
        return !!this.unlocked[map];
    }

    unlock(map: StoryMapId) {
        this.unlocked[map] = true;
    }

    captureInventory(src: {
        seeds: number;
        crops: number;
        boosts: number;
        wood: number;
        grass: number;
        dirt: number;
        stone: number;
        fish: number;
        copper: number;
        iron: number;
        goldOre: number;
        gold: number;
        seedPacks: Record<string, number>;
        tool: FarmTool;
    }) {
        this.inventory = {
            seeds: src.seeds,
            crops: src.crops,
            boosts: src.boosts,
            wood: src.wood,
            grass: src.grass,
            dirt: src.dirt,
            stone: src.stone,
            fish: src.fish,
            copper: src.copper,
            iron: src.iron,
            goldOre: src.goldOre,
            gold: src.gold,
            seedPacks: { ...src.seedPacks },
            tool: src.tool,
        };
    }

    applyInventory(dst: {
        seeds: number;
        crops: number;
        boosts: number;
        wood: number;
        grass: number;
        dirt: number;
        stone: number;
        fish: number;
        copper: number;
        iron: number;
        goldOre: number;
        gold: number;
        seedPacks: Record<string, number>;
        tool: FarmTool;
        notifyInventoryChanged: () => void;
    }) {
        const inv = this.inventory;
        if (!inv) return;
        dst.seeds = inv.seeds;
        dst.crops = inv.crops;
        dst.boosts = inv.boosts ?? 0;
        dst.wood = inv.wood;
        dst.grass = inv.grass;
        dst.dirt = inv.dirt;
        dst.stone = inv.stone;
        dst.fish = inv.fish;
        dst.copper = inv.copper;
        dst.iron = inv.iron;
        dst.goldOre = inv.goldOre;
        dst.gold = inv.gold;
        dst.seedPacks = { ...inv.seedPacks };
        dst.tool = inv.tool;
        dst.notifyInventoryChanged();
    }

    captureQuest(src: QuestSnapshot) {
        this.quest = {
            activeId: src.activeId,
            completed: [...src.completed],
            awaitingClaim: !!src.awaitingClaim,
            gather: { ...src.gather },
            craft: { ...src.craft },
            flags: { ...src.flags },
            till: src.till,
            plant: src.plant,
            water: src.water,
            harvest: src.harvest,
            fish: src.fish,
        };
    }
}

export const GameState = new GameStateStore();

/** Material ids used when granting quest rewards / labels. */
export const STORY_MAT_LABELS: Record<string, string> = {
    grass: '草料',
    wood: '木料',
    dirt: '泥土',
    stone: '石料',
    fish: '鱼',
    seeds: '种子',
    boost: '催熟剂',
    parsnip: '防风草',
    copper: '铜矿石',
    iron: '铁矿石',
    goldOre: '金矿石',
};

export type { FarmMaterial };
