import { _decorator, Component } from 'cc';
import {
    ConditionOperatorType,
    ConditionType,
    CQuest,
    GotoAction,
    Tables,
} from '../cfg/schema';
import { FarmHUD } from './FarmHUD';
import { FarmInfoBoard } from './FarmInfoBoard';
import { FarmMaterial, FarmSystem } from './FarmSystem';
import { BoardCommissionSnapshot, GameState, StoryMapId } from './GameState';
import { townBoardQuestById, type TownBoardQuest } from './TownCatalog';
import {
    craftRecipeUsesScroll,
    getCraftRecipes,
    isCraftRecipeEarned,
} from './CraftRecipes';
import { formatGoldAmount } from './UiGoldAmount';

/** Chapter order for GM jumps — matches `CQuest.chapter` values in TQuest. */
const CHAPTER_ORDER = ['farm', 'town', 'market', 'spring'] as const;
type QuestChapter = (typeof CHAPTER_ORDER)[number];

function isStoryMapId(id: string): id is StoryMapId {
    return (
        id === 'farm' ||
        id === 'town' ||
        id === 'mine' ||
        id === 'mayorHouse' ||
        id === 'clinic' ||
        id === 'community' ||
        id === 'carpenterShop' ||
        id === 'beach' ||
        id === 'forest' ||
        id === 'deepMine'
    );
}

const { ccclass } = _decorator;

export type QuestProgress = {
    current: number;
    target: number;
    passed: boolean;
    desc: string;
};

/** Max concurrent police / post board jobs. */
const MAX_BOARD_COMMISSIONS = 5;

/**
 * Mainline quest runner — conditions / goto mirror SLG ConditionSystem patterns,
 * data from Luban `TQuest` + `TCondition` + `TGoto`.
 */
@ccclass('QuestSystem')
export class QuestSystem extends Component {
    farm: FarmSystem | null = null;
    hud: FarmHUD | null = null;
    infoBoard: FarmInfoBoard | null = null;

    private _tables: Tables | null = null;
    private _activeId = 0;
    private _completed = new Set<number>();
    /** Active objective met — stay on this quest until player claims. */
    private _awaitingClaim = false;
    private _gather = new Map<string, number>();
    private _craft = new Map<string, number>();
    private _till = 0;
    private _plant = 0;
    private _water = 0;
    private _harvest = 0;
    private _fish = 0;
    private _flags = new Map<string, number>();
    private _boards: BoardCommissionSnapshot[] = [];
    private _onChange: Array<() => void> = [];
    /** Last progress toasted — avoid spam on restore / re-check. */
    private _progressToastQuestId = 0;
    private _progressToastCurrent = 0;
    /** Learned recipe scrolls — appear on the workbench. */
    private _learnedRecipes = new Set<string>();
    /** Earned but unlearned — bag scrolls waiting for tap-to-learn. */
    private _pendingRecipes = new Set<string>();
    /** After baseline seed, newly earned recipes fly into the bag. */
    private _craftUnlockReady = false;
    /** Old saves without learned/pending — auto-learn currently earned recipes. */
    private _legacyRecipeKnowledge = false;

    bindTables(tables: Tables) {
        this._tables = tables;
        this.restoreFromGameState();
        if (!this._activeId) {
            const first = tables.TQuest.getDataList()
                .slice()
                .sort((a, b) => a.sort - b.sort)[0];
            this._activeId = first?.id ?? 0;
        }
        this.syncMapUnlocks();
        this.checkProgress();
        this.seedCraftRecipeKnowledge();
        this.persistToGameState();
        this.emitChange();
    }

    persistToGameState() {
        const gather: Record<string, number> = {};
        this._gather.forEach((v, k) => {
            gather[k] = v;
        });
        const craft: Record<string, number> = {};
        this._craft.forEach((v, k) => {
            craft[k] = v;
        });
        const flags: Record<string, number> = {};
        this._flags.forEach((v, k) => {
            flags[k] = v;
        });
        GameState.captureQuest({
            activeId: this._activeId,
            completed: [...this._completed],
            awaitingClaim: this._awaitingClaim,
            gather,
            craft,
            flags,
            till: this._till,
            plant: this._plant,
            water: this._water,
            harvest: this._harvest,
            fish: this._fish,
            learnedRecipes: [...this._learnedRecipes],
            pendingRecipes: [...this._pendingRecipes],
        });
        GameState.captureCommissions(this._boards);
        this.syncMapUnlocks();
    }

    private restoreFromGameState() {
        const boards = GameState.commissions;
        if (boards) {
            this._boards = boards.map((c) => this.normalizeBoard(c));
        }
        const snap = GameState.quest;
        if (!snap) return;
        this._activeId = snap.activeId;
        this._completed = new Set(snap.completed);
        this._awaitingClaim = !!snap.awaitingClaim;
        this._gather = new Map(Object.entries(snap.gather));
        this._craft = new Map(Object.entries(snap.craft));
        this._flags = new Map(Object.entries(snap.flags));
        this._till = snap.till;
        this._plant = snap.plant;
        this._water = snap.water;
        this._harvest = snap.harvest;
        this._fish = snap.fish;
        // Recipe knowledge restored in seedCraftRecipeKnowledge (needs tables).
        this._learnedRecipes = new Set(snap.learnedRecipes ?? []);
        this._pendingRecipes = new Set(snap.pendingRecipes ?? []);
        this._legacyRecipeKnowledge = snap.learnedRecipes === undefined && snap.pendingRecipes === undefined;
        // Retired meteor step (1008) → send players straight to the town gate.
        if (this._activeId === 1008) {
            this._completed.add(1008);
            this._activeId = 1009;
            this._awaitingClaim = false;
        }
        // Retired Ch.1 end id 1014 → community is now 1013; resume into market chapter.
        if (this._activeId === 1014) {
            this._completed.add(1014);
            if (this.flagOf('visit_community') >= 1) this._completed.add(1013);
            this._activeId = this._completed.has(1013) ? 1020 : 1013;
            this._awaitingClaim = false;
        }
        if (this._completed.has(1014) && !this._completed.has(1013)) {
            if (this.flagOf('visit_community') >= 1) this._completed.add(1013);
        }
        // Ch.1 used to end with activeId=0. Resume into market (buy/sell) chapter.
        if (
            this._activeId === 0 &&
            (this._completed.has(1013) || this._completed.has(1014)) &&
            !this._completed.has(1020) &&
            !this._completed.has(1027)
        ) {
            this._activeId = 1020;
            this._awaitingClaim = false;
        }
    }

    /**
     * Map gates from `TQuest.unlock_map` (active/completed) and
     * `TFlag.unlock_map` (flag noted). Add new maps only via those columns.
     */
    private syncMapUnlocks() {
        if (!this._tables) return;
        for (const q of this._tables.TQuest.getDataList()) {
            if (!q.unlockMap || !isStoryMapId(q.unlockMap)) continue;
            if (this._completed.has(q.id) || this._activeId === q.id) {
                GameState.unlock(q.unlockMap);
            }
        }
        for (const f of this._tables.TFlag.getDataList()) {
            if (!f.unlockMap || !isStoryMapId(f.unlockMap)) continue;
            if ((this._flags.get(f.id) ?? 0) >= 1) {
                GameState.unlock(f.unlockMap);
            }
        }
    }

    onChange(cb: () => void) {
        this._onChange.push(cb);
    }

    private emitChange() {
        if (this._craftUnlockReady) this.syncCraftRecipeUnlocks(true);
        for (const cb of this._onChange) cb();
    }

    /** True if the player has learned this recipe scroll. */
    isCraftRecipeLearned(recipeId: string): boolean {
        return this._learnedRecipes.has(recipeId);
    }

    /** Earned scrolls still waiting in the bag (open panel → learn). */
    pendingCraftRecipeIds(): string[] {
        return [...this._pendingRecipes];
    }

    /**
     * Consume a bag scroll and unlock the workbench row (from learn panel).
     * Returns false if the recipe was not pending.
     */
    learnCraftRecipe(recipeId: string): boolean {
        if (!recipeId || !this._pendingRecipes.has(recipeId)) return false;
        this._pendingRecipes.delete(recipeId);
        this._learnedRecipes.add(recipeId);
        const name = getCraftRecipes().find((r) => r.id === recipeId)?.name ?? recipeId;
        this.infoBoard?.showToast(`已学会「${name}」`);
        this.persistToGameState();
        this.hud?.reloadCraftRecipes();
        // Skip syncCraftRecipeUnlocks — knowledge already updated.
        for (const cb of this._onChange) cb();
        return true;
    }

    private craftEarnQuery() {
        return {
            isCompleted: (id: number) => this.isCompleted(id),
            isActive: (id: number) => this.isActive(id),
        };
    }

    /**
     * First bind after config load: migrate old saves, place pending scrolls
     * quietly (no fly), then allow live unlocks to announce.
     */
    private seedCraftRecipeKnowledge() {
        const q = this.craftEarnQuery();
        if (this._legacyRecipeKnowledge) {
            // Pre-scroll saves already had workbench rows — don't re-grant scrolls.
            for (const r of getCraftRecipes()) {
                if (isCraftRecipeEarned(r.id, q) || this.craftCount(r.id) > 0) {
                    this._learnedRecipes.add(r.id);
                }
            }
            this._pendingRecipes.clear();
            this._legacyRecipeKnowledge = false;
        } else {
            // Crafted recipes stay learned even if the scroll was never tapped.
            for (const r of getCraftRecipes()) {
                if (this.craftCount(r.id) > 0) this._learnedRecipes.add(r.id);
            }
            // Drop stale pending that are already learned / no longer earned /
            // removed from config (e.g. retired seed_mix).
            for (const id of [...this._pendingRecipes]) {
                const gone = !getCraftRecipes().some((r) => r.id === id);
                if (gone || this._learnedRecipes.has(id) || !isCraftRecipeEarned(id, q)) {
                    this._pendingRecipes.delete(id);
                    if (gone) {
                        this._learnedRecipes.delete(id);
                        this.hud?.revokeRecipeScroll(id);
                    }
                }
            }
        }
        this.syncCraftRecipeUnlocks(false);
        this.hud?.purgeUnknownRecipeScrolls();
        this._craftUnlockReady = true;
    }

    /** Diff earned recipes → pending bag scrolls (+ optional fly FX). */
    private syncCraftRecipeUnlocks(announce: boolean) {
        const q = this.craftEarnQuery();
        for (const r of getCraftRecipes()) {
            if (this._learnedRecipes.has(r.id)) continue;
            if (!isCraftRecipeEarned(r.id, q)) continue;
            // Always-available recipes skip the scroll / learn step.
            if (!craftRecipeUsesScroll(r.id)) {
                this._learnedRecipes.add(r.id);
                continue;
            }
            if (this._pendingRecipes.has(r.id)) {
                // Travel / rebuild: ensure the bag cell exists.
                this.hud?.grantRecipeScroll(r.id, { fly: false });
                continue;
            }
            this._pendingRecipes.add(r.id);
            this.hud?.grantRecipeScroll(r.id, { fly: announce });
        }
        if (this._pendingRecipes.size || this._learnedRecipes.size) {
            this.persistToGameState();
        }
    }

    get activeQuest(): CQuest | null {
        if (!this._tables || !this._activeId) return null;
        return this._tables.TQuest.get(this._activeId) ?? null;
    }

    get isFinished(): boolean {
        return !!this._tables && this._activeId === 0;
    }

    /** Objective done — waiting for player to tap the quest HUD / claim. */
    get isAwaitingClaim(): boolean {
        return this._awaitingClaim;
    }

    /** Active quest's GotoAction (for idle hint arrows). */
    activeGotoAction(): GotoAction {
        const q = this.activeQuest;
        if (!q || !this._tables) return GotoAction.None;
        return this._tables.TGoto.get(q.gotoId)?.action ?? GotoAction.None;
    }

    allQuests(): CQuest[] {
        if (!this._tables) return [];
        return this._tables.TQuest.getDataList().slice().sort((a, b) => a.sort - b.sort);
    }

    /**
     * Quest journal + backpack badges stay hidden until the first 露穗 talk
     * (wake_farm → guide_wake_yard unlock + center→HUD fly FX).
     */
    isQuestHudUnlocked(): boolean {
        if (this._activeId === 1001 && !GameState.hasSeenDialogue('guide_wake_yard')) {
            return false;
        }
        return true;
    }

    /** Same gate as the quest journal — unlocked together after first 露穗 talk. */
    isBagHudUnlocked(): boolean {
        return this.isQuestHudUnlocked();
    }

    /**
     * Journal list: current quest only (completed steps are hidden).
     * Future steps stay hidden until the previous quest unlocks them via next_id.
     * Empty before the first 露穗 talk on quest 1001.
     */
    visibleQuests(): CQuest[] {
        if (!this.isQuestHudUnlocked()) return [];
        return this.allQuests().filter((q) => q.id === this._activeId);
    }

    isCompleted(id: number): boolean {
        return this._completed.has(id);
    }

    /** True if this quest is the live objective (or awaiting claim). */
    isActive(id: number): boolean {
        return id === this._activeId;
    }

    /** Grant reward + advance. Returns false if nothing to claim. */
    claimActive(): boolean {
        if (!this._awaitingClaim || !this.activeQuest || !this._tables) return false;
        this.completeActive();
        return true;
    }

    progressOf(quest: CQuest): QuestProgress {
        const cur = this.readValue(quest);
        const target = Math.max(1, quest.num);
        const passed = this.compare(cur, quest.num, this.conditionMode(quest));
        return {
            current: Math.min(cur, target),
            target,
            passed,
            desc: this.formatDesc(quest, cur),
        };
    }

    noteGather(id: string, n = 1) {
        if (n <= 0) return;
        this._gather.set(id, (this._gather.get(id) ?? 0) + n);
        this.checkProgress(true);
    }

    noteCraft(recipeId: string, n = 1) {
        if (n <= 0) return;
        this._craft.set(recipeId, (this._craft.get(recipeId) ?? 0) + n);
        this.checkProgress(true);
    }

    /** Lifetime craft count for a recipe id (workbench unlock / progress). */
    craftCount(recipeId: string): number {
        return this._craft.get(recipeId) ?? 0;
    }

    noteTill(n = 1) {
        this._till += n;
        this.checkProgress(true);
    }

    notePlant(n = 1) {
        this._plant += n;
        this.checkProgress(true);
    }

    noteWater(n = 1) {
        this._water += n;
        this.checkProgress(true);
    }

    noteHarvest(n = 1) {
        this._harvest += n;
        this.checkProgress(true);
    }

    noteFish(n = 1) {
        this._fish += n;
        this.checkProgress(true);
    }

    noteFlag(id: string, n = 1) {
        if (!id || n <= 0) return;
        this._flags.set(id, (this._flags.get(id) ?? 0) + n);
        this.syncMapUnlocks();
        this.checkProgress(true);
        this.persistToGameState();
    }

    /** Active police / post board commissions (journal「委托」tab). */
    activeBoardQuests(): BoardCommissionSnapshot[] {
        return this._boards.slice();
    }

    hasBoardQuest(id: string): boolean {
        return this._boards.some((c) => c.id === id);
    }

    boardQuestCount(): number {
        return this._boards.length;
    }

    /**
     * Accept a board job into the journal. Gold pays only after the player
     * walks to `deliverKey` and interacts (see tryDeliverBoardAt).
     */
    acceptBoardQuest(q: TownBoardQuest): boolean {
        if (!q?.id) return false;
        if (this.hasBoardQuest(q.id)) return false;
        if (this._boards.length >= MAX_BOARD_COMMISSIONS) return false;
        this._boards.push(this.normalizeBoard({
            id: q.id,
            title: q.title,
            desc: q.desc,
            rewardGold: q.rewardGold,
            source: q.source,
            deliverKey: q.deliverKey,
            deliverHint: q.deliverHint,
        }));
        this.persistToGameState();
        this.emitChange();
        return true;
    }

    /**
     * World interact at a town building/sign — completes matching commission(s).
     * Returns true if at least one job was delivered.
     */
    tryDeliverBoardAt(key: string): boolean {
        if (!key) return false;
        const matches = this._boards.filter((c) => (c.deliverKey || '') === key);
        if (matches.length <= 0) return false;
        let any = false;
        for (const q of matches) {
            if (this.completeBoardQuest(q.id)) any = true;
        }
        return any;
    }

    /** Journal hint for where to walk (empty if unknown). */
    boardDeliverHint(id: string): string {
        const q = this._boards.find((c) => c.id === id);
        if (!q) return '';
        if (q.deliverHint) return q.deliverHint;
        return townBoardQuestById(id)?.deliverHint ?? '';
    }

    /** Deliver / complete a board commission and grant gold. */
    completeBoardQuest(id: string): boolean {
        const idx = this._boards.findIndex((c) => c.id === id);
        if (idx < 0) return false;
        const q = this._boards[idx]!;
        this._boards.splice(idx, 1);
        if (q.rewardGold > 0) this.farm?.addGold(q.rewardGold);
        this.infoBoard?.showToast(
            q.rewardGold > 0
                ? `完成「${q.title}」 ${formatGoldAmount(q.rewardGold, { sign: '+' })}`
                : `完成「${q.title}」`,
        );
        this.persistToGameState();
        this.emitChange();
        return true;
    }

    /** Backfill deliver fields for old saves / partial snapshots. */
    private normalizeBoard(c: BoardCommissionSnapshot): BoardCommissionSnapshot {
        const meta = townBoardQuestById(c.id);
        return {
            id: c.id,
            title: c.title || meta?.title || '委托',
            desc: c.desc || meta?.desc || '',
            rewardGold: c.rewardGold || meta?.rewardGold || 0,
            source: c.source || meta?.source || 'post',
            deliverKey: c.deliverKey || meta?.deliverKey || '',
            deliverHint: c.deliverHint || meta?.deliverHint || '',
        };
    }

    private questsInChapter(chapter: QuestChapter): CQuest[] {
        if (!this._tables) return [];
        return this._tables.TQuest.getDataList()
            .filter((q) => q.chapter === chapter)
            .slice()
            .sort((a, b) => a.sort - b.sort);
    }

    private questIdsInChapter(chapter: QuestChapter): number[] {
        return this.questsInChapter(chapter).map((q) => q.id);
    }

    private firstQuestIdInChapter(chapter: QuestChapter): number {
        return this.questsInChapter(chapter)[0]?.id ?? 0;
    }

    private isOnFarmTutorial(): boolean {
        if (!this._activeId || !this._tables) return false;
        return this._tables.TQuest.get(this._activeId)?.chapter === 'farm';
    }

    /**
     * GM: finish farm tutorial, grant remaining rewards, unlock town,
     * and park on the first town-chapter quest. Returns false if already past farm.
     */
    skipFarmTutorial(): boolean {
        if (!this._tables) return false;
        const inFarmTutorial = this.isOnFarmTutorial();
        const farmIds = this.questIdsInChapter('farm');
        const granted = this.completeQuestIds(farmIds);
        this.syncCountersFromQuests(farmIds);
        this.grantToolsFromCraftTables();
        this._awaitingClaim = false;
        const townStart = this.firstQuestIdInChapter('town');
        // Only advance while still on the farm tutorial band — never rewind later quests.
        if ((inFarmTutorial || granted) && townStart) {
            const activeChapter = this._tables.TQuest.get(this._activeId)?.chapter ?? '';
            if (inFarmTutorial || activeChapter === 'farm' || !activeChapter) {
                this._activeId = townStart;
            }
        }
        this.persistToGameState();
        this.emitChange();
        return inFarmTutorial || granted;
    }

    /**
     * GM: jump to the start of a mainline chapter.
     * Completes every prior chapter (with rewards/flags), parks on first quest of `line`.
     */
    jumpToQuestLine(
        line: 'town' | 'market' | 'spring',
    ): { activeId: number; label: string } | null {
        if (!this._tables) return null;
        const targetIdx = CHAPTER_ORDER.indexOf(line);
        if (targetIdx < 0) return null;

        for (let i = 0; i < targetIdx; i++) {
            const chapter = CHAPTER_ORDER[i]!;
            const ids = this.questIdsInChapter(chapter);
            this.completeQuestIds(ids);
            this.syncCountersFromQuests(ids);
            this.applyFlagsFromQuests(ids);
        }
        this.grantToolsFromCraftTables();

        // Town jump lands on mayor tea (second town quest) after road-sign flag.
        let parkId = this.firstQuestIdInChapter(line);
        if (line === 'town') {
            const townQuests = this.questsInChapter('town');
            const afterGate = townQuests.find((q) => q.param !== 'enter_town') ?? townQuests[0];
            if (afterGate) {
                const gate = townQuests.find((q) => q.param === 'enter_town');
                if (gate) {
                    this.completeQuestIds([gate.id]);
                    this.applyFlagsFromQuests([gate.id]);
                }
                parkId = afterGate.id;
            }
        }

        const labels: Record<typeof line, string> = {
            town: '第一章·城镇',
            market: '第二章·市集',
            spring: '第二章·春厅',
        };
        this._awaitingClaim = false;
        this._activeId = parkId;
        this.persistToGameState();
        this.emitChange();
        return parkId ? { activeId: parkId, label: labels[line] } : null;
    }

    /**
     * GM: park on a single quest for testing.
     * Completes every earlier quest (by sort), clears target + later completions,
     * grants craft tools, unlocks maps.
     */
    jumpToQuest(questId: number): {
        activeId: number;
        name: string;
        chapter: string;
        unlockMap: string;
    } | null {
        if (!this._tables || !questId) return null;
        const target = this._tables.TQuest.get(questId);
        if (!target) return null;

        const all = this.allQuests();
        const priorIds = all.filter((q) => q.sort < target.sort).map((q) => q.id);
        for (const q of all) {
            if (q.sort >= target.sort) this._completed.delete(q.id);
        }
        this.completeQuestIds(priorIds);
        this.syncCountersFromQuests(priorIds);
        this.applyFlagsFromQuests(priorIds);
        this.grantToolsFromCraftTables();

        this._awaitingClaim = false;
        this._activeId = questId;
        this._progressToastQuestId = 0;
        this._progressToastCurrent = 0;
        this.persistToGameState();
        this.emitChange();
        // Don't auto-claim if counters already satisfy the objective.
        this.checkProgress(false);
        return {
            activeId: questId,
            name: target.name,
            chapter: target.chapter,
            unlockMap: target.unlockMap ?? '',
        };
    }

    /** Grant + mark complete for each id not yet finished. */
    private completeQuestIds(ids: number[]): boolean {
        if (!this._tables) return false;
        let granted = false;
        for (const id of ids) {
            if (this._completed.has(id)) continue;
            const quest = this._tables.TQuest.get(id);
            if (!quest) continue;
            this._completed.add(id);
            if (quest.rewardGold > 0) this.farm?.addGold(quest.rewardGold);
            if (quest.rewardItem && quest.rewardCount > 0) {
                this.grantReward(quest.rewardItem, quest.rewardCount);
            }
            granted = true;
        }
        return granted;
    }

    /** Raise progress counters so completed quest conditions stay satisfied. */
    private syncCountersFromQuests(ids: number[]) {
        if (!this._tables) return;
        for (const id of ids) {
            const quest = this._tables.TQuest.get(id);
            if (!quest) continue;
            const type = this.conditionType(quest);
            const n = Math.max(1, quest.num);
            switch (type) {
                case ConditionType.GatherCount:
                    this._gather.set(quest.param, Math.max(this._gather.get(quest.param) ?? 0, n));
                    break;
                case ConditionType.CraftCount:
                    this._craft.set(quest.param, Math.max(this._craft.get(quest.param) ?? 0, n));
                    break;
                case ConditionType.TillCount:
                    this._till = Math.max(this._till, n);
                    break;
                case ConditionType.PlantCount:
                    this._plant = Math.max(this._plant, n);
                    break;
                case ConditionType.WaterCount:
                    this._water = Math.max(this._water, n);
                    break;
                case ConditionType.HarvestCount:
                    this._harvest = Math.max(this._harvest, n);
                    break;
                case ConditionType.FishCount:
                    this._fish = Math.max(this._fish, n);
                    break;
                default:
                    break;
            }
        }
    }

    private applyFlagsFromQuests(ids: number[]) {
        if (!this._tables) return;
        for (const id of ids) {
            const quest = this._tables.TQuest.get(id);
            if (!quest) continue;
            if (this.conditionType(quest) === ConditionType.Flag && quest.param) {
                this.ensureFlag(quest.param);
            }
        }
    }

    /** GM skip: unlock tools that appear as craft outputs in the tables. */
    private grantToolsFromCraftTables() {
        if (!this.farm) return;
        this.farm.ownedTools.hoe = true;
        for (const r of getCraftRecipes()) {
            const out = r.out.id;
            if (out === 'can') this.farm.ownedTools.can = true;
            if (out === 'axe') this.farm.ownedTools.axe = true;
            if (out === 'rod') this.farm.ownedTools.rod = true;
        }
        this.farm.notifyInventoryChanged();
    }

    private ensureFlag(id: string) {
        if (!id) return;
        this._flags.set(id, Math.max(this._flags.get(id) ?? 0, 1));
    }

    flagOf(id: string): number {
        return this._flags.get(id) ?? 0;
    }

    /** SLG-style Goto — select tool / open panel / toast hint. */
    runGoto(gotoId?: number) {
        const quest = this.activeQuest;
        const id = gotoId ?? quest?.gotoId ?? 0;
        if (!this._tables || !id) return;
        const row = this._tables.TGoto.get(id);
        if (!row) return;
        if (row.hint) this.infoBoard?.showToast(row.hint);
        switch (row.action) {
            case GotoAction.SelectHoe:
            case GotoAction.SelectSeeds:
            case GotoAction.SelectCan:
            case GotoAction.SelectRod:
            case GotoAction.SelectAxe:
                // Don't auto-equip — TutorialGuide teaches bag → hotbar first.
                break;
            case GotoAction.SelectHand:
                this.farm?.setTool('hand');
                break;
            case GotoAction.OpenCraft:
                this.hud?.openCraftPanel();
                break;
            case GotoAction.OpenBag:
                this.hud?.openBagPanel();
                break;
            case GotoAction.HintMeteor:
            case GotoAction.HintTownGate:
            case GotoAction.HintMayor:
            default:
                break;
        }
    }

    private checkProgress(announce = false) {
        const quest = this.activeQuest;
        if (!quest || !this._tables) {
            this.emitChange();
            return;
        }
        // Stay on claimable state until the player taps.
        if (this._awaitingClaim) {
            this.emitChange();
            return;
        }
        const prog = this.progressOf(quest);
        this.toastProgressIfAdvanced(quest, prog, announce);
        if (!prog.passed) {
            this.emitChange();
            return;
        }
        this._awaitingClaim = true;
        this.infoBoard?.showToast(`可领奖：${quest.name}`);
        this.persistToGameState();
        this.emitChange();
    }

    /** Center toast each time active-quest current count ticks up. */
    private toastProgressIfAdvanced(quest: CQuest, prog: QuestProgress, announce: boolean) {
        if (quest.id !== this._progressToastQuestId) {
            this._progressToastQuestId = quest.id;
            this._progressToastCurrent = prog.current;
            return;
        }
        if (!announce || prog.current <= this._progressToastCurrent) {
            this._progressToastCurrent = Math.max(this._progressToastCurrent, prog.current);
            return;
        }
        this._progressToastCurrent = prog.current;
        // Completing step uses the claim toast below — skip duplicate  N/N flash.
        if (prog.passed) return;
        const obj = this.objectiveLabel(quest);
        const msg = obj
            ? `${obj}  ${prog.current}/${prog.target}`
            : `${prog.current}/${prog.target}`;
        this.infoBoard?.showToast(msg);
    }

    private completeActive() {
        const quest = this.activeQuest;
        if (!quest || !this._tables) return;
        this._completed.add(quest.id);
        if (quest.rewardGold > 0) this.farm?.addGold(quest.rewardGold);
        if (quest.rewardItem && quest.rewardCount > 0) {
            this.grantReward(quest.rewardItem, quest.rewardCount);
        }
        this._awaitingClaim = false;
        this._activeId = quest.nextId > 0 ? quest.nextId : 0;
        if (this._activeId === 0) {
            this.infoBoard?.showToast('本章主线告一段落，自由探索溪谷吧！');
        }
        this.persistToGameState();
        this.emitChange();
        // Next quest may already be satisfied — park on claim, never auto-skip.
        if (this._activeId) this.checkProgress();
    }

    private grantReward(item: string, count: number) {
        if (!this.farm || count <= 0) return;
        const mats: FarmMaterial[] = ['wood', 'grass', 'dirt', 'stone', 'fish'];
        if ((mats as string[]).includes(item)) {
            this.farm[item as FarmMaterial] += count;
        } else if (item === 'seeds') {
            this.farm.seeds += count;
        } else if (item === 'parsnip') {
            this.farm.crops += count;
        } else if (item === 'boost') {
            this.farm.boosts += count;
        } else {
            return;
        }
        this.farm.notifyInventoryChanged();
    }

    private conditionMode(quest: CQuest): ConditionOperatorType {
        const c = this._tables?.TCondition.get(quest.conditionId);
        return c?.compareMode ?? ConditionOperatorType.GreaterEqual;
    }

    private conditionType(quest: CQuest): ConditionType | null {
        return this._tables?.TCondition.get(quest.conditionId)?.type ?? null;
    }

    private readValue(quest: CQuest): number {
        const type = this.conditionType(quest);
        if (type === null) return 0;
        switch (type) {
            case ConditionType.ItemCount:
                return this.itemCount(quest.param);
            case ConditionType.GatherCount:
                return this._gather.get(quest.param) ?? 0;
            case ConditionType.TillCount:
                return this._till;
            case ConditionType.PlantCount:
                return this._plant;
            case ConditionType.WaterCount:
                return this._water;
            case ConditionType.HarvestCount:
                return this._harvest;
            case ConditionType.CraftCount:
                return this._craft.get(quest.param) ?? 0;
            case ConditionType.FishCount:
                return this._fish;
            case ConditionType.Gold:
                return this.farm?.gold ?? 0;
            case ConditionType.Flag:
                return this._flags.get(quest.param) ?? 0;
            default:
                return 0;
        }
    }

    private itemCount(id: string): number {
        if (!this.farm) return 0;
        if (id === 'seeds') return this.farm.seeds;
        if (id === 'parsnip') return this.farm.crops;
        if (id === 'boost') return this.farm.boosts;
        const mats: FarmMaterial[] = [
            'wood',
            'grass',
            'dirt',
            'stone',
            'fish',
            'copper',
            'iron',
            'goldOre',
        ];
        if ((mats as string[]).includes(id)) return this.farm[id as FarmMaterial];
        return 0;
    }

    private compare(cur: number, num: number, mode: ConditionOperatorType): boolean {
        switch (mode) {
            case ConditionOperatorType.Less:
                return cur < num;
            case ConditionOperatorType.Greater:
                return cur > num;
            case ConditionOperatorType.LessEqual:
                return cur <= num;
            case ConditionOperatorType.GreaterEqual:
                return cur >= num;
            case ConditionOperatorType.Equal:
                return cur === num;
            case ConditionOperatorType.NotEqual:
                return cur !== num;
            default:
                return cur >= num;
        }
    }

    private formatDesc(quest: CQuest, _cur: number): string {
        const tpl =
            this._tables?.TCondition.get(quest.conditionId)?.desc ?? quest.desc;
        const paramLabel = this.paramLabel(quest.param);
        return tpl.replace(/\{0\}/g, String(quest.num)).replace(/\{1\}/g, paramLabel);
    }

    /** Tracker subline — action text only, no leading count (progress shown separately). */
    objectiveLabel(quest: CQuest): string {
        const tpl =
            this._tables?.TCondition.get(quest.conditionId)?.desc ?? quest.desc;
        const paramLabel = this.paramLabel(quest.param);
        return tpl
            .replace(/\s*×\s*\{0\}/g, '')
            .replace(/\s*\{0\}\s*次/g, '')
            .replace(/\s*\{0\}\s*条/g, '')
            .replace(/\{0\}/g, '')
            .replace(/\{1\}/g, paramLabel)
            .replace(/\s+/g, ' ')
            .trim();
    }

    private paramLabel(param: string): string {
        if (!param) return '';
        const recipe = this._tables?.TCraftRecipe.get(param);
        if (recipe) return recipe.name;
        const item = this._tables?.TItem.get(param);
        if (item) return item.name;
        const flag = this._tables?.TFlag.get(param);
        if (flag) return flag.label;
        return param;
    }
}
