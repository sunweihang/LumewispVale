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
    private _gather = new Map<string, number>();
    private _craft = new Map<string, number>();
    private _till = 0;
    private _plant = 0;
    private _water = 0;
    private _harvest = 0;
    private _fish = 0;
    private _onChange: (() => void) | null = null;

    bindTables(tables: Tables) {
        this._tables = tables;
        if (!this._activeId) {
            const first = tables.TQuest.getDataList()
                .slice()
                .sort((a, b) => a.sort - b.sort)[0];
            this._activeId = first?.id ?? 0;
        }
        this.checkProgress();
        this._onChange?.();
    }

    onChange(cb: () => void) {
        this._onChange = cb;
    }

    get activeQuest(): CQuest | null {
        if (!this._tables || !this._activeId) return null;
        return this._tables.TQuest.get(this._activeId) ?? null;
    }

    get isFinished(): boolean {
        return !!this._tables && this._activeId === 0;
    }

    allQuests(): CQuest[] {
        if (!this._tables) return [];
        return this._tables.TQuest.getDataList().slice().sort((a, b) => a.sort - b.sort);
    }

    isCompleted(id: number): boolean {
        return this._completed.has(id);
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
            default:
                break;
        }
    }

    private checkProgress() {
        const quest = this.activeQuest;
        if (!quest || !this._tables) {
            this._onChange?.();
            return;
        }
        const prog = this.progressOf(quest);
        if (!prog.passed) {
            this._onChange?.();
            return;
        }
        this.completeActive();
    }

    private completeActive() {
        const quest = this.activeQuest;
        if (!quest || !this._tables) return;
        this._completed.add(quest.id);
        if (quest.rewardGold > 0) this.farm?.addGold(quest.rewardGold);
        if (quest.rewardItem && quest.rewardCount > 0) {
            this.grantReward(quest.rewardItem, quest.rewardCount);
        }
        this.infoBoard?.showToast(`任务完成：${quest.name}`);
        this._activeId = quest.nextId > 0 ? quest.nextId : 0;
        if (this._activeId === 0) {
            this.infoBoard?.showToast('主线指引已完成，自由探索吧！');
        }
        this._onChange?.();
        // Chain-complete if already satisfied (e.g. GM / surplus).
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
            default:
                return 0;
        }
    }

    private itemCount(id: string): number {
        if (!this.farm) return 0;
        if (id === 'seeds') return this.farm.seeds;
        if (id === 'parsnip') return this.farm.crops;
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
        };
        return names[param] ?? param;
    }
}
