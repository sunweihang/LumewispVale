import { _decorator, Component, director } from 'cc';
import { DialoguePanel } from './DialoguePanel';
import { getConfigTables } from './ConfigService';
import { FarmHUD } from './FarmHUD';
import { GameState } from './GameState';
import { NpcAnimator } from './NpcAnimator';
import { PlayerController } from './PlayerController';
import { QuestSystem } from './QuestSystem';
import { StoryIntroPanel } from './StoryIntroPanel';
import { TutorialGuide } from './TutorialGuide';
import {
    dialogueScriptHasGirl,
    getDialogueScriptByScriptId,
    getIntroPages,
    GIRL,
    isScriptId,
    ScriptId,
    storyIdForScript,
} from '../story/DialogueScripts';
import { IStoryChatHost, StoryChatBridge, StoryChatRequest } from '../story/StoryChatHost';
import { StoryRuntime } from '../story/StoryRuntime';

const { ccclass } = _decorator;

type QueueItem = { id: ScriptId; onDone?: () => void; force?: boolean };

/** Quest intro / outro script ids live on `TQuest.intro_script` / `outro_script`. */
function questIntroScript(questId: number): ScriptId | undefined {
    const id = getConfigTables()?.TQuest.get(questId)?.introScript;
    if (!id || !isScriptId(id)) return undefined;
    return id;
}

function questOutroScript(questId: number): ScriptId | undefined {
    const id = getConfigTables()?.TQuest.get(questId)?.outroScript;
    if (!id || !isScriptId(id)) return undefined;
    return id;
}

const BUILDING_STORY: Record<string, ScriptId> = {
    mayor: 'mayor_tea',
    carpenter: 'carpenter_nails',
    community: 'community_bell',
    clinic: 'clinic_advice',
    oreshop: 'oreshop_pass',
};

const BUILDING_FLAG: Record<string, string> = {
    mayor: 'visit_mayor',
    carpenter: 'visit_carpenter',
    community: 'visit_community',
    clinic: 'visit_clinic',
    oreshop: 'visit_oreshop',
};

/**
 * Mainline dialogue orchestration.
 * Playback goes through story-graphs (StoryRuntime → TsStory → StartChat → DialoguePanel).
 */
@ccclass('StoryDialogue')
export class StoryDialogue extends Component implements IStoryChatHost {
    dialogue: DialoguePanel | null = null;
    intro: StoryIntroPanel | null = null;
    quests: QuestSystem | null = null;
    guide: TutorialGuide | null = null;

    private _lastActiveId = -1;
    private _map:
        | 'farm'
        | 'town'
        | 'mine'
        | 'mayorHouse'
        | 'clinic'
        | 'community'
        | 'carpenterShop'
        | 'other' = 'other';
    private _queue: QueueItem[] = [];
    private _playing = false;
    private _booted = false;
    /** Resolves an in-flight playChat when force-closed / interrupted. */
    private _chatResolve: (() => void) | null = null;

    bind(opts: {
        dialogue: DialoguePanel;
        quests: QuestSystem;
        map:
            | 'farm'
            | 'town'
            | 'mine'
            | 'mayorHouse'
            | 'clinic'
            | 'community'
            | 'carpenterShop'
            | 'other';
        guide?: TutorialGuide | null;
        intro?: StoryIntroPanel | null;
    }) {
        this.dialogue = opts.dialogue;
        this.intro = opts.intro ?? null;
        this.quests = opts.quests;
        this.guide = opts.guide ?? null;
        this._map = opts.map;
        this._lastActiveId = opts.quests.activeQuest?.id ?? 0;
        opts.quests.onChange(() => this.onQuestChange());

        const player =
            director.getScene()?.getComponentInChildren(PlayerController) ?? null;
        StoryRuntime.Inst.bindHost(this, { player });
        StoryChatBridge.bind(this);
    }

    onDestroy() {
        if (StoryChatBridge.host === this) StoryChatBridge.bind(null);
        if (StoryRuntime.Inst.isHost(this)) {
            StoryRuntime.Inst.clear();
        }
    }

    update(dt: number) {
        StoryRuntime.Inst.tick(dt);
    }

    /**
     * Called by AbsStory.startChat — plays DialoguePanel / StoryIntroPanel.
     */
    playChat(req: StoryChatRequest): Promise<void> {
        this.finishPendingChat();

        if (req.kind === 'intro') {
            return new Promise<void>((resolve) => {
                const intro = this.intro;
                const pages = getIntroPages(req.scriptId);
                if (!intro || !pages.length) {
                    resolve();
                    return;
                }
                this._chatResolve = resolve;
                intro.play(pages, () => this.finishPendingChat());
            });
        }

        const def = getDialogueScriptByScriptId(req.scriptId as ScriptId);
        const lines = def?.lines;
        const panel = this.dialogue;
        if (!panel || !lines?.length) {
            return Promise.resolve();
        }

        const useCompanion =
            this._map === 'farm' &&
            (req.usesCompanion ||
                req.scriptId === 'wake_farm' ||
                req.scriptId === 'girl_chat');

        return new Promise<void>((resolve) => {
            this._chatResolve = resolve;
            if (useCompanion) this.engageCompanion();
            panel.play(lines, () => {
                if (useCompanion) this.releaseCompanion();
                this.finishPendingChat();
            });
        });
    }

    private finishPendingChat() {
        const r = this._chatResolve;
        this._chatResolve = null;
        r?.();
    }

    /**
     * GM: mark farm tutorial scripts seen, clear the play queue, and close
     * any open intro / dialogue without running their onDone callbacks.
     */
    skipNewbieGuide() {
        this.markScriptsSeen([
            'origin_story',
            'wake_farm',
            'quest_1002',
            'quest_1030',
            'quest_1031',
            'quest_1003',
            'quest_1004',
            'quest_1005',
            'quest_1006',
            'quest_1032',
            'quest_1033',
            'quest_1034',
            'quest_1007',
            'quest_1009',
        ]);
        GameState.markDialogueSeen('guide_wake_yard');
        this.clearPlayQueue();
    }

    /**
     * GM: silence story beats before a chapter jump.
     * Town jump keeps `arrive_town` so the first Town boot can still play it.
     */
    prepareQuestLineJump(line: 'town' | 'market' | 'spring') {
        this.skipNewbieGuide();
        if (line === 'market' || line === 'spring') {
            this.markScriptsSeen([
                'arrive_town',
                'mayor_tea',
                'quest_1011',
                'quest_1012',
                'quest_1013',
                'carpenter_nails',
                'community_bell',
                'ch1_done',
            ]);
        }
        if (line === 'spring') {
            this.markScriptsSeen(['quest_1020', 'quest_1021']);
        }
        this.clearPlayQueue();
        this._lastActiveId = this.quests?.activeQuest?.id ?? this._lastActiveId;
    }

    /**
     * GM: silence prior quest intros before parking on a single test quest.
     * Target intro stays unseen so `onQuestChange` can still play it.
     */
    prepareQuestJump(questId: number) {
        const tables = getConfigTables();
        const target = tables?.TQuest.get(questId);
        if (!target) {
            this.clearPlayQueue();
            this._lastActiveId = this.quests?.activeQuest?.id ?? this._lastActiveId;
            return;
        }

        // Unlock HUD / skip farm wake once we're past the first yard clear.
        if (target.sort > 10 || questId !== 1001) {
            this.markScriptsSeen(['origin_story', 'wake_farm']);
            GameState.markDialogueSeen('guide_wake_yard');
        }

        for (const q of tables!.TQuest.getDataList()) {
            if (q.sort >= target.sort) continue;
            if (q.introScript && isScriptId(q.introScript)) {
                GameState.markDialogueSeen(q.introScript);
            }
            if (q.outroScript && isScriptId(q.outroScript)) {
                GameState.markDialogueSeen(q.outroScript);
            }
        }
        // Building chats that gate town progression.
        if (target.chapter !== 'farm') {
            this.markScriptsSeen(['arrive_town', 'mayor_tea', 'carpenter_nails', 'community_bell']);
        }

        this.clearPlayQueue();
        this._lastActiveId = this.quests?.activeQuest?.id ?? this._lastActiveId;
    }

    private markScriptsSeen(ids: ScriptId[]) {
        for (const id of ids) GameState.markDialogueSeen(id);
    }

    private clearPlayQueue() {
        this._queue = [];
        this._playing = false;
        this.releaseCompanion();
        this.intro?.forceClose();
        this.dialogue?.forceClose();
        this.finishPendingChat();
        void StoryRuntime.Inst.interrupt();
        this._lastActiveId = this.quests?.activeQuest?.id ?? this._lastActiveId;
    }

    /** Call after config tables bound. */
    boot() {
        if (this._booted) return;
        this._booted = true;
        this._lastActiveId = this.quests?.activeQuest?.id ?? 0;

        if (this._map === 'farm') {
            const active = this.quests?.activeQuest?.id ?? 0;
            if (!this.quests?.isCompleted(1001) && active === 1001) {
                const needOrigin = !GameState.hasSeenDialogue('origin_story');
                if (needOrigin) {
                    this.enqueue('origin_story');
                }
            } else if (active) {
                const intro = questIntroScript(active);
                if (intro) this.enqueueQuestIntro(active, intro);
                else if (active === 1002) this.grantStoryHoe();
            }
            this.drain();
            return;
        }

        if (this._map === 'town') {
            const returning = GameState.hasSeenDialogue('arrive_town');
            this.enqueue('arrive_town');
            if (returning) {
                const active = this.quests?.activeQuest?.id ?? 0;
                if (
                    active === 1020 &&
                    (this.quests?.isCompleted(1013) || this.quests?.isCompleted(1014)) &&
                    !GameState.hasSeenDialogue('ch1_done')
                ) {
                    this.enqueue('ch1_done');
                }
                if (active && active !== 1010) {
                    const intro = questIntroScript(active);
                    if (intro) this.enqueue(intro);
                }
            }
            this.drain();
            return;
        }

        if (this._map === 'mine') {
            const active = this.quests?.activeQuest?.id ?? 0;
            // enter_mine parks 1025 on claim — wait for claim→1026 intro via onQuestChange.
            if (active && !this.quests?.isAwaitingClaim) {
                const intro = questIntroScript(active);
                if (intro) this.enqueueQuestIntro(active, intro);
            }
            this.drain();
        }
    }

    /**
     * Community hall props (indoor only): spring desk / lamp.
     * Caretaker NPC uses tryBuilding('community') for visit_community.
     */
    tryCommunityProp(prop: 'spring_desk' | 'spring_lamp'): boolean {
        const active = this.quests?.activeQuest?.id ?? 0;
        if (prop === 'spring_desk' && active === 1022) {
            this.enqueue(
                'spring_pack',
                () => {
                    if ((this.quests?.flagOf('accept_spring_pack') ?? 0) < 1) {
                        this.quests?.noteFlag('accept_spring_pack');
                    }
                },
                true,
            );
            this.drain();
            return true;
        }
        if (prop === 'spring_lamp' && active === 1027) {
            this.enqueue(
                'spring_light',
                () => {
                    const farm = this.quests?.farm;
                    if (farm && farm.copper > 0) {
                        const use = Math.min(3, farm.copper);
                        farm.copper -= use;
                        farm.notifyInventoryChanged();
                    }
                    if ((this.quests?.flagOf('light_spring_hall') ?? 0) < 1) {
                        this.quests?.noteFlag('light_spring_hall');
                    }
                },
                true,
            );
            this.drain();
            return true;
        }
        return false;
    }

    /**
     * Town NPC / building story tap. Returns true if dialogue consumed the interaction.
     * Outdoor facades for clinic / community / carpenter travel indoors — call this on NPCs.
     */
    tryBuilding(key: string): boolean {
        const active = this.quests?.activeQuest?.id ?? 0;

        const id = BUILDING_STORY[key];
        if (!id) return false;
        const unseen = !GameState.hasSeenDialogue(id);
        const relevant =
            (key === 'mayor' && (active === 1010 || unseen)) ||
            (key === 'carpenter' && (active === 1012 || unseen)) ||
            (key === 'community' && (active === 1013 || unseen)) ||
            (key === 'clinic' && (active === 1023 || unseen)) ||
            (key === 'oreshop' && (active === 1024 || unseen));
        if (!unseen && !relevant) return false;

        const flag = BUILDING_FLAG[key];
        this.enqueue(
            id,
            () => {
                if (flag && (this.quests?.flagOf(flag) ?? 0) < 1) {
                    this.quests?.noteFlag(flag);
                }
            },
            true,
        );
        this.drain();
        return true;
    }

    /**
     * Farm companion tap — replay wake / current quest tip, or a sweet idle line.
     */
    tryFarmNpc(key: string): boolean {
        if (key !== 'girl') return false;
        const active = this.quests?.activeQuest?.id ?? 0;
        if (active === 1001 && !GameState.hasSeenDialogue('guide_wake_yard')) {
            this.enqueue('wake_farm', () => this.guide?.startWakeYardGuide(), true);
            this.drain();
            return true;
        }
        const intro = active ? questIntroScript(active) : undefined;
        if (intro && dialogueScriptHasGirl(intro)) {
            this.enqueue(intro, undefined, true);
            this.drain();
            return true;
        }
        this.enqueue('girl_chat', undefined, true);
        this.drain();
        return true;
    }

    private onQuestChange() {
        if (!this._booted) return;
        const id = this.quests?.activeQuest?.id ?? 0;
        if (id === this._lastActiveId) return;
        const prev = this._lastActiveId;
        this._lastActiveId = id;
        const outro = prev ? questOutroScript(prev) : undefined;
        if (outro) this.enqueue(outro);
        if (!outro && prev === 1014) this.enqueue('ch1_done');
        if (!id) {
            this.drain();
            return;
        }
        if (id === 1010) {
            this.drain();
            return;
        }
        const intro = questIntroScript(id);
        if (intro) this.enqueueQuestIntro(id, intro);
        else if (id === 1002) this.grantStoryHoe();
        this.drain();
    }

    /** Quest intro — after 1002 lines, fly the borrowed hoe into the bag. */
    private enqueueQuestIntro(questId: number, intro: ScriptId) {
        if (questId === 1002) {
            if (GameState.hasSeenDialogue(intro)) {
                this.grantStoryHoe();
                return;
            }
            this.enqueue(intro, () => this.grantStoryHoe());
            return;
        }
        this.enqueue(intro);
    }

    private grantStoryHoe() {
        const hud = this.node.getComponent(FarmHUD);
        hud?.grantStoryHoe({ fly: true });
    }

    private enqueue(id: ScriptId, onDone?: () => void, force = false) {
        if (!force && GameState.hasSeenDialogue(id)) return;
        if (this._queue.some((q) => q.id === id)) return;
        this._queue.push({ id, onDone, force });
    }

    private drain() {
        if (this._playing) return;
        const next = this._queue.shift();
        if (!next) return;
        void this.playItem(next);
    }

    private async playItem(item: QueueItem) {
        if (!item.force && GameState.hasSeenDialogue(item.id)) {
            item.onDone?.();
            this.drain();
            return;
        }

        const storyId = storyIdForScript(item.id);
        if (!storyId) {
            console.warn(`[StoryDialogue] no story graph for script "${item.id}"`);
            item.onDone?.();
            this.drain();
            return;
        }

        this._playing = true;
        // Idle chat may replay; don't permanently mark it as "seen" blocking force.
        if (item.id !== 'girl_chat') GameState.markDialogueSeen(item.id);

        const player =
            director.getScene()?.getComponentInChildren(PlayerController) ?? null;
        StoryRuntime.Inst.bindHost(this, { player });
        StoryChatBridge.bind(this);

        try {
            await StoryRuntime.Inst.play(storyId);
        } catch (e) {
            console.warn(`[StoryDialogue] story ${storyId} failed`, e);
        } finally {
            this.releaseCompanion();
            this._playing = false;
            item.onDone?.();
            this.drain();
        }
    }

    private companionAnim(): NpcAnimator | null {
        const node = this.guide?.farm?.findWorldNode('npc_girl');
        return node?.getComponent(NpcAnimator) ?? null;
    }

    private engageCompanion() {
        const anim = this.companionAnim();
        if (!anim) return;
        anim.holdPatrol();
        const player = this.guide?.farm?.player;
        if (player?.isValid) {
            anim.faceToward(player.position.x, player.position.y);
        }
    }

    private releaseCompanion() {
        this.companionAnim()?.releasePatrol();
    }
}

// Re-export for callers / docs that referenced GIRL from this module.
export { GIRL };
