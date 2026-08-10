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
import { GameState } from './GameState';

const { ccclass } = _decorator;

export type QuestProgress = {
    current: number;
    target: number;
    passed: boolean;
    desc: string;
};

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
    private _onChange: Array<() => void> = [];

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
        });
        this.syncMapUnlocks();
    }

    private restoreFromGameState() {
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
        // Retired meteor step (1008) → send players straight to the town gate.
        if (this._activeId === 1008) {
            this._completed.add(1008);
            this._activeId = 1009;
            this._awaitingClaim = false;
        }
    }

    /** Town unlocks after the farm tutorial (fishing) — go straight to the road sign. */
    private syncMapUnlocks() {
        if (
            this._completed.has(1007) ||
            this._completed.has(1008) ||
            this._completed.has(1009) ||
            this._activeId === 1009 ||
            (this._activeId !== null && this._activeId >= 1010) ||
            (this._flags.get('enter_town') ?? 0) >= 1 ||
            (this._flags.get('inspect_meteor') ?? 0) >= 1
        ) {
            GameState.unlock('town');
        }
    }

    onChange(cb: () => void) {
        this._onChange.push(cb);
    }

    private emitChange() {
        for (const cb of this._onChange) cb();
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
     * Journal list: current quest only (completed steps are hidden).
     * Future steps stay hidden until the previous quest unlocks them via next_id.
     */
    visibleQuests(): CQuest[] {
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
        this.checkProgress();
    }

    noteCraft(recipeId: string, n = 1) {
        if (n <= 0) return;
        this._craft.set(recipeId, (this._craft.get(recipeId) ?? 0) + n);
        this.checkProgress();
    }

    noteTill(n = 1) {
        this._till += n;
        this.checkProgress();
    }

    notePlant(n = 1) {
        this._plant += n;
        this.checkProgress();
    }

    noteWater(n = 1) {
        this._water += n;
        this.checkProgress();
    }

    noteHarvest(n = 1) {
        this._harvest += n;
        this.checkProgress();
    }

    noteFish(n = 1) {
        this._fish += n;
        this.checkProgress();
    }

    noteFlag(id: string, n = 1) {
        if (!id || n <= 0) return;
        this._flags.set(id, (this._flags.get(id) ?? 0) + n);
        this.syncMapUnlocks();
        this.checkProgress();
        this.persistToGameState();
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
                this.farm?.setTool('hoe');
                break;
            case GotoAction.SelectSeeds:
                this.farm?.setTool('seeds');
                break;
            case GotoAction.SelectCan:
                this.farm?.setTool('can');
                break;
            case GotoAction.SelectHand:
                this.farm?.setTool('hand');
                break;
            case GotoAction.SelectRod:
                this.farm?.setTool('rod');
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

    private checkProgress() {
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
        if (!prog.passed) {
            this.emitChange();
            return;
        }
        this._awaitingClaim = true;
        this.infoBoard?.showToast(`可领奖：${quest.name}`);
        this.persistToGameState();
        this.emitChange();
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
        const mats: FarmMaterial[] = ['wood', 'grass', 'dirt', 'stone', 'fish'];
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
        const names: Record<string, string> = {
            grass: '草料',
            wood: '木料',
            dirt: '泥土',
            stone: '石料',
            fish: '鱼',
            seeds: '种子',
            parsnip: '防风草',
            enter_town: '抵达小镇',
            visit_mayor: '拜访镇长府',
            shop_buy: '商店购物',
            accept_board: '接取公告板',
            visit_carpenter: '拜访木工坊',
            visit_community: '探访社区中心',
        };
        return names[param] ?? param;
    }
}
