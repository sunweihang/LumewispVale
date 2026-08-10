import { AudioClip, Prefab, SpriteFrame, assetManager, resources } from 'cc';
import { loadConfigTables } from './ConfigService';
import { FARMER_FRAMES } from './FarmerFrames';
import { FARM_FRAMES } from './FarmFrames';
import { INFO_BOARD_FRAMES, INFO_BOARD_PREFAB_UUID } from './InfoBoardFrames';
import { MATERIAL_FRAMES } from './MaterialFrames';
import { DIALOGUE_PORTRAIT_FRAMES } from './DialoguePortraitFrames';
import { NPC_FRAMES } from './NpcFrames';
import { QUEST_FRAMES, QUEST_PANEL_PREFAB_UUID } from './QuestFrames';
import { STORY_INTRO_FRAMES } from './StoryIntroFrames';
import { TOOL_FRAMES } from './ToolFrames';
import { loadUiFont } from './UiFont';

const STORY_AUDIO_PATHS = [
    'audio/story/storyThemeAlert',
    'audio/story/storyThemeCalm',
    'audio/story/townTheme',
    'audio/story/story-thunder-boom',
];

const UI_AUDIO_PATHS = [
    'audio/ui/ui-click',
    'audio/ui/farm-tool',
    'audio/ui/farm-gather',
    'audio/ui/ui-gold',
];

const STORY_UUIDS = [
    /** Meteor prefab */
    'e51a5553-5169-4993-a867-03e35beb87e2',
    /** Town / farm road sign frame */
    '6bf7ecb9-7750-4efd-9f82-84534ceaef25@f9941',
    /** Boot splash 1080×2200 */
    '5a4ebb12-2f98-4075-a870-b9286e9ac348@f9941',
    ...STORY_INTRO_FRAMES.panels.map((p) => p.uuid),
];

export type WarmupProgress = (progress01: number, tip: string) => void;

function flattenUuids(value: unknown, out: Set<string>) {
    if (typeof value === 'string' && value.length > 8) {
        out.add(value);
        return;
    }
    if (Array.isArray(value)) {
        for (const v of value) flattenUuids(v, out);
        return;
    }
    if (value && typeof value === 'object') {
        for (const v of Object.values(value as Record<string, unknown>)) {
            flattenUuids(v, out);
        }
    }
}

function collectSpriteUuids(): string[] {
    const set = new Set<string>();
    flattenUuids(FARMER_FRAMES, set);
    flattenUuids(NPC_FRAMES, set);
    flattenUuids(DIALOGUE_PORTRAIT_FRAMES, set);
    flattenUuids(TOOL_FRAMES, set);
    flattenUuids(MATERIAL_FRAMES, set);
    flattenUuids(FARM_FRAMES, set);
    flattenUuids(QUEST_FRAMES, set);
    flattenUuids(INFO_BOARD_FRAMES, set);
    for (const u of STORY_UUIDS) set.add(u);
    return [...set];
}

function loadUuid(uuid: string): Promise<void> {
    return new Promise((resolve) => {
        assetManager.loadAny({ uuid }, (_err, _asset) => resolve());
    });
}

function loadPrefab(uuid: string): Promise<void> {
    return new Promise((resolve) => {
        assetManager.loadAny({ uuid }, (_err, asset) => {
            // Touch the type so the engine keeps the Prefab / SpriteFrame warm.
            void (asset as Prefab | SpriteFrame | null);
            resolve();
        });
    });
}

/**
 * Preload config + font + HUD/player/quest chrome into the asset cache
 * so runtime systems resolve instantly without pop-in.
 */
export async function warmupCriticalAssets(onProgress?: WarmupProgress): Promise<void> {
    const report = onProgress ?? (() => undefined);
    report(0.02, '读取旅途配置…');
    await loadConfigTables().catch((err) => {
        console.warn('[AssetWarmup] config failed', err);
    });

    report(0.12, '装载字体…');
    await loadUiFont();

    report(0.15, '装载开场音效…');
    await Promise.all(
        [...STORY_AUDIO_PATHS, ...UI_AUDIO_PATHS].map(
            (path) =>
                new Promise<void>((resolve) => {
                    resources.load(path, AudioClip, (_err, _clip) => resolve());
                }),
        ),
    );

    report(0.18, '准备界面预制体…');
    await Promise.all([
        loadPrefab(INFO_BOARD_PREFAB_UUID),
        loadPrefab(QUEST_PANEL_PREFAB_UUID),
    ]);

    const uuids = collectSpriteUuids();
    const total = Math.max(1, uuids.length);
    report(0.22, `加载贴图 0/${total}`);
    let done = 0;
    const batch = 8;
    for (let i = 0; i < uuids.length; i += batch) {
        const slice = uuids.slice(i, i + batch);
        await Promise.all(slice.map((u) => loadUuid(u)));
        done = Math.min(total, i + slice.length);
        const t = 0.22 + 0.75 * (done / total);
        report(t, `加载贴图 ${done}/${total}`);
    }
    report(1, '就绪');
}
