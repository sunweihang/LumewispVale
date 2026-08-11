import { director } from 'cc';
import { FarmSystem } from './FarmSystem';
import { GameState, StoryMapId } from './GameState';
import { QuestSystem } from './QuestSystem';

const SCENE_FOR: Partial<Record<StoryMapId, string>> = {
    farm: 'Main',
    town: 'Town',
    mine: 'Mine',
    mayorHouse: 'MayorHouse',
    clinic: 'Clinic',
    community: 'Community',
    carpenterShop: 'CarpenterShop',
};

export type TravelMapId = 'farm' | 'town' | 'mine' | 'mayorHouse' | 'clinic' | 'community' | 'carpenterShop';

/**
 * Persist bag + load destination scene.
 * Call only after unlock checks.
 */
export function travelTo(
    map: TravelMapId,
    opts: {
        farm?: FarmSystem | null;
        quests?: QuestSystem | null;
        spawnX: number;
        spawnY: number;
    },
) {
    if (opts.farm) GameState.captureInventory(opts.farm);
    if (opts.quests) opts.quests.persistToGameState();
    GameState.pendingSpawn = { map, x: opts.spawnX, y: opts.spawnY };
    const scene = SCENE_FOR[map];
    if (!scene) {
        console.warn('[MapTravel] no scene for', map);
        return;
    }
    director.loadScene(scene);
}

export function canTravel(map: StoryMapId): boolean {
    return GameState.isUnlocked(map);
}
