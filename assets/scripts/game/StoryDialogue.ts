import { _decorator, Component } from 'cc';
import { DialogueLine, DialoguePanel } from './DialoguePanel';
import { GameState } from './GameState';
import { NpcAnimator } from './NpcAnimator';
import { QuestSystem } from './QuestSystem';
import { ORIGIN_STORY_PAGES, StoryIntroPanel } from './StoryIntroPanel';
import { TutorialGuide } from './TutorialGuide';

const { ccclass } = _decorator;

/** Farm companion — guides all farm tutorial beats. */
const GIRL = '露穗';

type ScriptId =
    | 'origin_story'
    | 'wake_farm'
    | 'quest_1002'
    | 'quest_1003'
    | 'quest_1004'
    | 'quest_1005'
    | 'quest_1006'
    | 'quest_1007'
    | 'quest_1009'
    | 'arrive_town'
    | 'mayor_tea'
    | 'quest_1011'
    | 'quest_1012'
    | 'quest_1013'
    | 'carpenter_nails'
    | 'community_bell'
    | 'ch1_done'
    | 'quest_1020'
    | 'quest_1021'
    | 'quest_1022'
    | 'spring_pack'
    | 'quest_1023'
    | 'clinic_advice'
    | 'quest_1024'
    | 'quest_1025'
    | 'quest_1026'
    | 'quest_1027'
    | 'spring_light'
    | 'ch2_done'
    | 'girl_chat';

type QueueItem = { id: ScriptId; onDone?: () => void; force?: boolean };

const SCRIPTS: Record<ScriptId, DialogueLine[]> = {
    /** Illustrated prologue — played by StoryIntroPanel, not DialoguePanel. */
    origin_story: [],
    wake_farm: [
        {
            speaker: GIRL,
            text: '早安……你醒啦。伤还隐隐作痛吧？没关系，溪谷的风很软，会慢慢把你哄好的。',
        },
        {
            speaker: GIRL,
            text: '这里是咱们的小农庄。镇上的事不急——先把家安顿暖一点，好吗？',
        },
        {
            speaker: GIRL,
            text: '看，院子里杂草都爬到脚踝了。用手轻轻拔掉几棵，收集点草料……我在旁边陪你～',
        },
    ],
    quest_1002: [
        {
            speaker: GIRL,
            text: '草料有啦，真棒。接下来选中锄头，把荒地翻成软软的田——想种什么，都从这一锄开始呢。',
        },
    ],
    quest_1003: [
        {
            speaker: GIRL,
            text: '田翻好了～走到工作台，用草料搓出种子。没有种子，再肥的土也会寂寞哦。',
        },
    ],
    quest_1004: [
        {
            speaker: GIRL,
            text: '种子到手啦。选中它们，点在翻好的田上——把一点点希望，轻轻埋进土里。',
        },
    ],
    quest_1005: [
        {
            speaker: GIRL,
            text: '芽还嫩着呢。选中水壶浇一遍水——领奖时会拿到催熟剂，像给作物一个小小的拥抱。',
        },
    ],
    quest_1006: [
        {
            speaker: GIRL,
            text: '把催熟剂拖进快捷栏，点作物催熟，再空手收获。看着它们长大……真开心。',
        },
    ],
    quest_1007: [
        {
            speaker: GIRL,
            text: '桌上该添点鲜味啦。先点下方鱼竿，再跟着箭头走到西边湖边码头，点水面抛竿——我等你带回第一条鱼～',
        },
    ],
    quest_1009: [
        {
            speaker: GIRL,
            text: '湖面都平静下来了。农场这边，总算站稳啦。',
        },
        {
            speaker: GIRL,
            text: '该去镇上露个面了。往右走到东侧「通往小镇」的路牌，走近点一下就能进镇——镇长府在镇北。去吧，我会想你的。',
        },
    ],
    girl_chat: [
        {
            speaker: GIRL,
            text: '嗯？找我呀。慢慢来就好，今天也要过得甜一点～有我在呢。',
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
            text: '往北走到镇长府，点大门进屋，再跟镇长·艾岚打个招呼。若任务可领奖，先点一下领取。',
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
            text: '眼下先认认镇子：听听公告板的委托，再去木工坊认认石楠。买卖的事，摸熟路了再教你。',
        },
        {
            speaker: '镇长·艾岚',
            text: '社区中心那座钟楼……等你把镇子摸熟了，再去看看。我们总要把它重新点亮。',
        },
        {
            speaker: '你',
            text: '我明白了。先去警察局或邮局的公告板看看。',
        },
    ],
    quest_1011: [
        {
            speaker: '你',
            text: '去警察局或邮局的公告板接一单委托，听听镇上在忙什么。',
        },
    ],
    quest_1012: [
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
    quest_1013: [
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
            text: '先记下这里。材料齐了，春厅会重新亮起来。',
        },
        {
            text: '第一章的线索接到了。领取奖励后，镇长会教你在市集买卖。',
        },
    ],
    ch1_done: [
        {
            speaker: '镇长·艾岚',
            text: '（信件）站稳了就好。第二章从市集开始——先买一件日用，再把背包里的收获卖掉一单。熟了手，再谈春厅。',
        },
    ],
    quest_1020: [
        {
            speaker: '镇长·艾岚',
            text: '任意一家店买一件东西就好，熟个手。种子店、杂货铺都行。',
        },
    ],
    quest_1021: [
        {
            speaker: '镇长·艾岚',
            text: '买过就会卖。打开商店点「出售」，把防风草或鱼卖掉一件——金币进袋，才算真正进了市集。',
        },
    ],
    quest_1022: [
        {
            speaker: '你',
            text: '买卖摸熟了。回社区中心，春厅收集包该签字立项了。',
        },
    ],
    spring_pack: [
        {
            text: '木桌上摊着一份「春厅收集包」名册，墨迹未干，旁边压着一枚镇徽章。',
        },
        {
            speaker: '镇长·艾岚',
            text: '（字条）先签你的名字。春厅要亮，得有钉子、药草和铜——诊所与矿脉商会那边，你去打个招呼。',
        },
        {
            speaker: '你',
            text: '签字。下一步：先去微光诊所。',
        },
    ],
    quest_1023: [
        {
            speaker: '你',
            text: '去微光诊所。下矿前，先听听医生的叮嘱。',
        },
    ],
    clinic_advice: [
        {
            speaker: '医生·荷叶',
            text: '新邻居？手伸过来——脉象还稳。矿洞里潮、暗、滑，别逞强。',
        },
        {
            speaker: '医生·荷叶',
            text: '浅层铜脉可以碰。若头晕耳鸣，立刻上来找我。药柜里的伤药，回头再备。',
        },
        {
            speaker: '你',
            text: '明白了。接下来去矿脉商会拿通行证。',
        },
    ],
    quest_1024: [
        {
            speaker: '你',
            text: '走进矿脉商会——就是矿石店。打听浅层矿洞放行的事。',
        },
    ],
    quest_1025: [
        {
            speaker: '你',
            text: '商会放行了。去北山路牌，进入浅层矿洞。',
        },
    ],
    quest_1026: [
        {
            speaker: '你',
            text: '选中锄头，把洞里的铜矿石挖下来——先采三块带回镇上。',
        },
    ],
    quest_1027: [
        {
            speaker: '你',
            text: '铜够了。回社区中心，把第一袋矿交给春厅。',
        },
    ],
    spring_light: [
        {
            text: '你把铜矿搁上木台。钟楼角落一盏旧灯忽然亮起——微弱，却稳。',
        },
        {
            speaker: '镇长·艾岚',
            text: '春厅有光了。后面还有钉子、药草和南路……不急，溪谷会记着你这一袋铜。',
        },
        {
            speaker: '你',
            text: '市集与春厅都站住了。领取奖励后，可以继续熟悉镇子，或回农场。',
        },
    ],
    ch2_done: [
        {
            speaker: '镇长·艾岚',
            text: '（信件）买卖熟了，春厅也亮了。南路与海滩的事，等社区再凑齐一批材料再说。慢慢来。',
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
    1009: 'quest_1009',
    1011: 'quest_1011',
    1012: 'quest_1012',
    1013: 'quest_1013',
    1020: 'quest_1020',
    1021: 'quest_1021',
    1022: 'quest_1022',
    1023: 'quest_1023',
    1024: 'quest_1024',
    1025: 'quest_1025',
    1026: 'quest_1026',
    1027: 'quest_1027',
};

const BUILDING_STORY: Record<string, ScriptId> = {
    mayor: 'mayor_tea',
    carpenter: 'carpenter_nails',
    community: 'community_bell',
    clinic: 'clinic_advice',
};

const BUILDING_FLAG: Record<string, string> = {
    mayor: 'visit_mayor',
    carpenter: 'visit_carpenter',
    community: 'visit_community',
    clinic: 'visit_clinic',
};

/**
 * Plays mainline dialogue once per script id (persisted in GameState).
 */
@ccclass('StoryDialogue')
export class StoryDialogue extends Component {
    dialogue: DialoguePanel | null = null;
    intro: StoryIntroPanel | null = null;
    quests: QuestSystem | null = null;
    guide: TutorialGuide | null = null;

    private _lastActiveId = -1;
    private _map: 'farm' | 'town' | 'mine' | 'mayorHouse' | 'other' = 'other';
    private _queue: QueueItem[] = [];
    private _playing = false;
    private _booted = false;

    bind(opts: {
        dialogue: DialoguePanel;
        quests: QuestSystem;
        map: 'farm' | 'town' | 'mine' | 'mayorHouse' | 'other';
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
            'quest_1003',
            'quest_1004',
            'quest_1005',
            'quest_1006',
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

    private markScriptsSeen(ids: ScriptId[]) {
        for (const id of ids) GameState.markDialogueSeen(id);
    }

    private clearPlayQueue() {
        this._queue = [];
        this._playing = false;
        this.releaseCompanion();
        this.intro?.forceClose();
        this.dialogue?.forceClose();
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
                // Free roam until the player taps 露穗 — never auto-play wake or
                // force the yard spotlight on boot (idle arrow points at her).
                if (needOrigin) {
                    this.enqueue('origin_story');
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
                // Old / new saves finishing Ch.1 — play the bridge letter once.
                if (
                    active === 1020 &&
                    (this.quests?.isCompleted(1013) || this.quests?.isCompleted(1014)) &&
                    !GameState.hasSeenDialogue('ch1_done')
                ) {
                    this.enqueue('ch1_done');
                }
                if (active && active !== 1010) {
                    const intro = QUEST_INTRO[active];
                    if (intro) this.enqueue(intro);
                }
            }
            this.drain();
        }
    }

    /**
     * Town building tap. Returns true if story dialogue consumed the interaction.
     */
    tryBuilding(key: string): boolean {
        const active = this.quests?.activeQuest?.id ?? 0;

        if (key === 'community') {
            if (active === 1022) {
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
            if (active === 1027) {
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
        }

        const id = BUILDING_STORY[key];
        if (!id) return false;
        const unseen = !GameState.hasSeenDialogue(id);
        const relevant =
            (key === 'mayor' && (active === 1010 || unseen)) ||
            (key === 'carpenter' && (active === 1012 || unseen)) ||
            (key === 'community' && (active === 1013 || unseen)) ||
            (key === 'clinic' && (active === 1023 || unseen));
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
        // Yard spotlight starts only after this talk — re-play wake if an older
        // boot path marked wake_farm without opening the guide.
        if (active === 1001 && !GameState.hasSeenDialogue('guide_wake_yard')) {
            this.enqueue('wake_farm', () => this.guide?.startWakeYardGuide(), true);
            this.drain();
            return true;
        }
        const intro = active ? QUEST_INTRO[active] : undefined;
        if (intro && SCRIPTS[intro]?.some((l) => l.speaker === GIRL)) {
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
        if (
            (prev === 1013 || prev === 1014) &&
            (id === 1020 || this.quests?.isCompleted(1013) || this.quests?.isCompleted(1014))
        ) {
            this.enqueue('ch1_done');
        }
        if (!id) {
            if (prev === 1027 || this.quests?.isCompleted(1027)) {
                this.enqueue('ch2_done');
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
        if (!item.force && GameState.hasSeenDialogue(item.id)) {
            item.onDone?.();
            this.drain();
            return;
        }

        if (item.id === 'origin_story') {
            const intro = this.intro;
            if (!intro) {
                item.onDone?.();
                this.drain();
                return;
            }
            this._playing = true;
            GameState.markDialogueSeen(item.id);
            intro.play(ORIGIN_STORY_PAGES, () => {
                this._playing = false;
                item.onDone?.();
                this.drain();
            });
            return;
        }

        const panel = this.dialogue;
        const lines = SCRIPTS[item.id];
        if (!panel || !lines?.length) {
            item.onDone?.();
            this.drain();
            return;
        }
        this._playing = true;
        // Idle chat may replay; don't permanently mark it as "seen" blocking force.
        if (item.id !== 'girl_chat') GameState.markDialogueSeen(item.id);
        if (this.scriptUsesCompanion(item.id, lines)) this.engageCompanion();
        panel.play(lines, () => {
            this.releaseCompanion();
            this._playing = false;
            item.onDone?.();
            this.drain();
        });
    }

    /** Farm companion lines — freeze patrol + face the player for the whole chat. */
    private scriptUsesCompanion(id: ScriptId, lines: DialogueLine[]): boolean {
        if (this._map !== 'farm') return false;
        if (id === 'wake_farm' || id === 'girl_chat') return true;
        return lines.some((l) => l.speaker === GIRL);
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
