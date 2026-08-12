import { Prefab, SpriteFrame, assetManager } from 'cc';
import { loadConfigTables } from './ConfigService';
import { FARMER_FRAMES } from './FarmerFrames';
import { FARM_FRAMES } from './FarmFrames';
import { FISHING_FRAMES } from './FishingFrames';
import { INFO_BOARD_FRAMES, INFO_BOARD_PREFAB_UUID } from './InfoBoardFrames';
import { JOYSTICK_FRAMES } from './JoystickFrames';
import { MATERIAL_FRAMES } from './MaterialFrames';
import { DIALOGUE_PORTRAIT_FRAMES } from './DialoguePortraitFrames';
import { NPC_FRAMES } from './NpcFrames';
import { QUEST_FRAMES, QUEST_PANEL_PREFAB_UUID } from './QuestFrames';
import { STORY_INTRO_FRAMES } from './StoryIntroFrames';
import { TOOL_FRAMES } from './ToolFrames';
import { loadUiFont } from './UiFont';

const STORY_UUIDS = [
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

/** First-screen + prologue + farm HUD — keep the boot gate short on web-mobile. */
function collectCriticalSpriteUuids(): string[] {
    const set = new Set<string>();
    flattenUuids(FARMER_FRAMES.farmer, set);
    if (typeof FARMER_FRAMES.questMarker === 'string') set.add(FARMER_FRAMES.questMarker);
    flattenUuids(NPC_FRAMES.girl, set);
    flattenUuids(DIALOGUE_PORTRAIT_FRAMES, set);
    flattenUuids(TOOL_FRAMES, set);
    flattenUuids(MATERIAL_FRAMES, set);
    flattenUuids(FARM_FRAMES, set);
    flattenUuids(QUEST_FRAMES, set);
    flattenUuids(INFO_BOARD_FRAMES, set);
    flattenUuids(JOYSTICK_FRAMES, set);
    for (const u of STORY_UUIDS) set.add(u);
    // Array.from — web-mobile downlevel turns [...set] into [].concat(set).
    return Array.from(set);
}

/** Tools / town NPCs / fishing — warm after the gate so first paint stays light. */
function collectDeferredSpriteUuids(): string[] {
    const set = new Set<string>();
    flattenUuids(FARMER_FRAMES.actions, set);
    flattenUuids(NPC_FRAMES.mayor, set);
    flattenUuids(NPC_FRAMES.carpenter, set);
    flattenUuids(NPC_FRAMES.passerby, set);
    flattenUuids(NPC_FRAMES.doctor, set);
    flattenUuids(NPC_FRAMES.caretaker, set);
    flattenUuids(FISHING_FRAMES, set);
    const critical = new Set(collectCriticalSpriteUuids());
    return Array.from(set).filter((u) => !critical.has(u));
}

function loadUuid(uuid: string): Promise<void> {
    return new Promise((resolve) => {
        assetManager.loadAny({ uuid }, (_err, _asset) => resolve());
    });
}

function loadPrefab(uuid: string): Promise<void> {
    return new Promise((resolve) => {
        assetManager.loadAny({ uuid }, (_err, asset) => {
            void (asset as Prefab | SpriteFrame | null);
            resolve();
        });
    });
}

async function loadUuidBatch(
    uuids: string[],
    onBatch?: (done: number, total: number) => void,
    batch = 8,
): Promise<void> {
    const total = Math.max(1, uuids.length);
    for (let i = 0; i < uuids.length; i += batch) {
        const slice = uuids.slice(i, i + batch);
        await Promise.all(slice.map((u) => loadUuid(u)));
        onBatch?.(Math.min(total, i + slice.length), total);
    }
}

let _deferredStarted = false;

/**
 * Preload config + font + HUD/player/quest chrome into the asset cache
 * so runtime systems resolve instantly without pop-in.
 * Audio is owned by UiAudio / StoryIntroAudio (avoid double-fetch).
 */
export async function warmupCriticalAssets(onProgress?: WarmupProgress): Promise<void> {
    const report = onProgress ?? (() => undefined);
    report(0.02, '读取旅途配置…');
    await loadConfigTables().catch((err) => {
        console.warn('[AssetWarmup] config failed', err);
    });

    report(0.12, '装载字体…');
    await loadUiFont();

    report(0.18, '准备界面预制体…');
    await Promise.all([
        loadPrefab(INFO_BOARD_PREFAB_UUID),
        loadPrefab(QUEST_PANEL_PREFAB_UUID),
    ]);

    const uuids = collectCriticalSpriteUuids();
    const total = Math.max(1, uuids.length);
    report(0.22, `加载贴图 0/${total}`);
    await loadUuidBatch(uuids, (done, t) => {
        const p = 0.22 + 0.75 * (done / t);
        report(p, `加载贴图 ${done}/${t}`);
    });
    report(1, '就绪');
}

/**
 * Background-warm action / town / fishing frames after the boot gate.
 * Safe to call multiple times; only the first run does work.
 */
export function warmupDeferredAssets(): void {
    if (_deferredStarted) return;
    _deferredStarted = true;
    const uuids = collectDeferredSpriteUuids();
    if (uuids.length === 0) return;
    void loadUuidBatch(uuids, undefined, 4).catch((err) => {
        console.warn('[AssetWarmup] deferred failed', err);
    });
}
