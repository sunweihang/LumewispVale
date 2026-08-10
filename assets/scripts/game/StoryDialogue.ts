import { _decorator, Component } from 'cc';
import { DialogueLine, DialoguePanel } from './DialoguePanel';
import { GameState } from './GameState';
import { QuestSystem } from './QuestSystem';
import { TutorialGuide } from './TutorialGuide';

const { ccclass } = _decorator;

type ScriptId =
    | 'wake_farm'
    | 'quest_1002'
    | 'quest_1003'
    | 'quest_1004'
    | 'quest_1005'
    | 'quest_1006'
    | 'quest_1007'
    | 'quest_1008'
    | 'meteor_inspect'
    | 'quest_1009'
    | 'arrive_town'
    | 'mayor_tea'
    | 'quest_1011'
    | 'quest_1012'
    | 'quest_1013'
    | 'carpenter_nails'
    | 'quest_1014'
    | 'community_bell'
    | 'ch1_done';

type QueueItem = { id: ScriptId; onDone?: () => void; force?: boolean };

const SCRIPTS: Record<ScriptId, DialogueLine[]> = {
    wake_farm: [
        { text: '晨光透过窗缝。你在溪谷边缘的旧农庄里醒来——这片地，如今归你了。' },
        {
            text: '院子里荒草疯长，工具七零八落。北边林缘还隐约闪着不寻常的紫光……不过眼下，得先把家安顿好。',
        },
        {
            speaker: '你',
            text: '先把院子收拾出来吧。用手拔掉杂草，收集一些草料。',
        },
    ],
    quest_1002: [
        {
            speaker: '你',
            text: '草料有了。该翻几块地——选中锄头，把荒地开垦成可播种的田。',
        },
    ],
    quest_1003: [
        {
            speaker: '你',
            text: '田翻好了。走到工作台，用草料搓出种子——没有种子，再肥的土也空着。',
        },
    ],
    quest_1004: [
        {
            speaker: '你',
            text: '种子到手。选中种子，点在翻好的田上，把希望埋进土里。',
        },
    ],
    quest_1005: [
        {
            speaker: '你',
            text: '芽还嫩。选中水壶，给刚种下的作物浇一遍水。',
        },
    ],
    quest_1006: [
        {
            speaker: '你',
            text: '地里有了生气……等作物成熟，空手点地块就能收获。',
        },
    ],
    quest_1007: [
        {
            speaker: '你',
            text: '桌上该有些鲜味。选中鱼竿，到湖边或码头试着钓一条。',
        },
    ],
    quest_1008: [
        { text: '湖面平静下来。可北边那抹紫光，一整天都没散。' },
        {
            speaker: '你',
            text: '去林缘看看那块紫晶陨石——得亲眼确认异象。',
        },
    ],
    meteor_inspect: [
        {
            text: '紫晶嵌在翻起的土里，边缘还烫着微光。脉动一下，又一下，像大地在低声应答。',
        },
        {
            speaker: '你',
            text: '这事得告诉镇上的人。北侧路牌通往微光溪谷镇——该去向镇长报到了。',
        },
    ],
    quest_1009: [
        {
            speaker: '你',
            text: '走到北侧「通往小镇」的路牌，点一下就能进镇。镇长府在镇北。',
        },
    ],
    arrive_town: [
        {
            text: '石板路、木瓦屋顶，还有广场上未修好的钟楼影子——微光溪谷镇欢迎迟到的继承人。',
        },
        {
            speaker: '路人',
            text: '新来的农夫？先去镇长府报个到吧，艾岚镇长这会儿多半在喝茶。',
        },
        {
            speaker: '你',
            text: '去北区的镇长府打个招呼。若任务可领奖，先点一下领取。',
        },
    ],
    mayor_tea: [
        {
            speaker: '镇长·艾岚',
            text: '啊，农庄的新主人。来，先喝口热茶——路上风硬。',
        },
        {
            speaker: '镇长·艾岚',
            text: '农庄归你了，定居许可我也批过。溪谷不赶人，但也不养闲人。',
        },
        {
            speaker: '镇长·艾岚',
            text: '北边紫光你们农场也看见了吧？先别慌。眼下要紧的是：熟悉市集、听听镇上的委托，再去木工坊认认石楠。',
        },
        {
            speaker: '镇长·艾岚',
            text: '社区中心那座钟楼……等你把镇子摸熟了，再去看看。我们总要把它重新点亮。',
        },
        {
            speaker: '你',
            text: '我明白了。先去商店买点日用，再看看警察局或邮局的公告板。',
        },
    ],
    quest_1011: [
        {
            speaker: '镇长·艾岚',
            text: '对了——任意一家店买一件东西就好，熟个手。种子店、杂货铺都行。',
        },
    ],
    quest_1012: [
        {
            speaker: '你',
            text: '补给齐了。去警察局或邮局的公告板接一单委托，听听镇上在忙什么。',
        },
    ],
    quest_1013: [
        {
            speaker: '镇长·艾岚',
            text: '木工坊在东市。工匠石楠管修路、扩建——钉子和木料的事，问他就对了。',
        },
    ],
    carpenter_nails: [
        {
            speaker: '工匠·石楠',
            text: '新邻居？锤子搁这儿……扩建农舍、修南路，材料齐了随时来。',
        },
        {
            speaker: '工匠·石楠',
            text: '社区中心那堆烂梁我也看过。镇长若立项，我跟进。你先去钟楼转一圈吧。',
        },
        {
            speaker: '你',
            text: '好，我去社区中心看看。',
        },
    ],
    quest_1014: [
        {
            speaker: '你',
            text: '前往社区中心——那座破旧钟楼。看看修复工程还缺什么。',
        },
    ],
    community_bell: [
        {
            text: '厅堂空置，钟楼积灰。墙角堆着未拆的脚手架，像被人忽然叫停的工程。',
        },
        {
            speaker: '你',
            text: '先记下这里。等材料与人手齐了，春厅会重新亮起来——那是后话。',
        },
        {
            text: '第一章的线索接到了。领取任务奖励后，可以继续熟悉镇子，或回农场照看田地。',
        },
    ],
    ch1_done: [
        {
            speaker: '镇长·艾岚',
            text: '（信件）站稳了就好。社区收集包的事，我会再派人知会你。溪谷慢慢来。',
        },
    ],
};

const QUEST_INTRO: Partial<Record<number, ScriptId>> = {
    1002: 'quest_1002',
    1003: 'quest_1003',
    1004: 'quest_1004',
    1005: 'quest_1005',
    1006: 'quest_1006',
    1007: 'quest_1007',
    1008: 'quest_1008',
    1009: 'quest_1009',
    1011: 'quest_1011',
    1012: 'quest_1012',
    1013: 'quest_1013',
    1014: 'quest_1014',
};

const BUILDING_STORY: Record<string, ScriptId> = {
    mayor: 'mayor_tea',
    carpenter: 'carpenter_nails',
    community: 'community_bell',
};

const BUILDING_FLAG: Record<string, string> = {
    mayor: 'visit_mayor',
    carpenter: 'visit_carpenter',
    community: 'visit_community',
};

/**
 * Plays mainline dialogue once per script id (persisted in GameState).
 */
@ccclass('StoryDialogue')
export class StoryDialogue extends Component {
    dialogue: DialoguePanel | null = null;
    quests: QuestSystem | null = null;
    guide: TutorialGuide | null = null;

    private _lastActiveId = -1;
    private _map: 'farm' | 'town' | 'mine' | 'other' = 'other';
    private _queue: QueueItem[] = [];
    private _playing = false;
    private _booted = false;

    bind(opts: {
        dialogue: DialoguePanel;
        quests: QuestSystem;
        map: 'farm' | 'town' | 'mine' | 'other';
        guide?: TutorialGuide | null;
    }) {
        this.dialogue = opts.dialogue;
        this.quests = opts.quests;
        this.guide = opts.guide ?? null;
        this._map = opts.map;
        this._lastActiveId = opts.quests.activeQuest?.id ?? 0;
        opts.quests.onChange(() => this.onQuestChange());
    }

    /** Call after config tables bound. */
    boot() {
        if (this._booted) return;
        this._booted = true;
        this._lastActiveId = this.quests?.activeQuest?.id ?? 0;

        if (this._map === 'farm') {
            const active = this.quests?.activeQuest?.id ?? 0;
            if (!this.quests?.isCompleted(1001) && active === 1001) {
                if (!GameState.hasSeenDialogue('wake_farm')) {
                    this.enqueue('wake_farm', () => this.guide?.startWakeYardGuide());
                } else {
                    // Dialogue already done this session — still offer the hollow guide once.
                    this.guide?.startWakeYardGuide();
                }
            } else if (active) {
                const intro = QUEST_INTRO[active];
                if (intro) this.enqueue(intro);
            }
            this.drain();
            return;
        }

        if (this._map === 'town') {
            const returning = GameState.hasSeenDialogue('arrive_town');
            this.enqueue('arrive_town');
            // First arrival: arrive_town points at the mayor. On return, remind the live step.
            if (returning) {
                const active = this.quests?.activeQuest?.id ?? 0;
                if (active && active !== 1010) {
                    const intro = QUEST_INTRO[active];
                    if (intro) this.enqueue(intro);
                }
            }
            this.drain();
        }
    }

    playMeteorInspect(onDone?: () => void) {
        this.enqueue('meteor_inspect', onDone, true);
        this.drain();
    }

    /**
     * Town building tap. Returns true if story dialogue consumed the interaction.
     */
    tryBuilding(key: string): boolean {
        const id = BUILDING_STORY[key];
        if (!id) return false;
        const unseen = !GameState.hasSeenDialogue(id);
        const active = this.quests?.activeQuest?.id ?? 0;
        const relevant =
            (key === 'mayor' && (active === 1010 || unseen)) ||
            (key === 'carpenter' && (active === 1013 || unseen)) ||
            (key === 'community' && (active === 1014 || unseen));
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

    private onQuestChange() {
        if (!this._booted) return;
        const id = this.quests?.activeQuest?.id ?? 0;
        if (id === this._lastActiveId) return;
        const prev = this._lastActiveId;
        this._lastActiveId = id;
        if (!id) {
            if (prev === 1014 || this.quests?.isCompleted(1014)) {
                this.enqueue('ch1_done');
                this.drain();
            }
            return;
        }
        if (id === 1010) return;
        const intro = QUEST_INTRO[id];
        if (intro) this.enqueue(intro);
        this.drain();
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
        this.playItem(next);
    }

    private playItem(item: QueueItem) {
        const panel = this.dialogue;
        const lines = SCRIPTS[item.id];
        if (!panel || !lines?.length) {
            item.onDone?.();
            this.drain();
            return;
        }
        if (!item.force && GameState.hasSeenDialogue(item.id)) {
            item.onDone?.();
            this.drain();
            return;
        }
        this._playing = true;
        GameState.markDialogueSeen(item.id);
        panel.play(lines, () => {
            this._playing = false;
            item.onDone?.();
            this.drain();
        });
    }
}
