import {
    _decorator,
    Camera,
    Canvas,
    Color,
    Component,
    Graphics,
    Layers,
    Node,
    Prefab,
    Sprite,
    UITransform,
    Vec3,
    Widget,
    assetManager,
    instantiate,
    view,
} from 'cc';
import { CameraFollow } from './CameraFollow';
import { loadConfigTables } from './ConfigService';
import { applyCraftTables } from './CraftRecipes';
import { FARMER_FRAMES } from './FarmerFrames';
import { NpcAnimator } from './NpcAnimator';
import { FarmHUD } from './FarmHUD';
import { FarmInfoBoard } from './FarmInfoBoard';
import { FarmSystem } from './FarmSystem';
import { FarmWorldLayout } from './FarmWorldLayout';
import { FirstQuest } from './FirstQuest';
import { GmPanel } from './GmPanel';
import { INFO_BOARD_PREFAB_UUID } from './InfoBoardFrames';
import { PlayerAnimator } from './PlayerAnimator';
import { PlayerController } from './PlayerController';
import {
    DESIGN_H,
    DESIGN_W,
    LETTERBOX_CLEAR,
    applyDesignResolution,
    applyPortraitCameraRect,
    portraitVisibleSize,
} from './PortraitFit';
import { ensureNightWash } from './NightWash';
import { GameState } from './GameState';
import { QuestPanel } from './QuestPanel';
import { QuestSystem } from './QuestSystem';
import { warmupCriticalAssets } from './AssetWarmup';
import { DialoguePanel } from './DialoguePanel';
import { InputBridge } from './InputBridge';
import { LoadingScreen } from './LoadingScreen';
import { RewardPopup } from './RewardPopup';
import { StoryDialogue } from './StoryDialogue';
import { StoryIntroPanel } from './StoryIntroPanel';
import { StoryWorldHooks } from './StoryWorldHooks';
import { TutorialGuide } from './TutorialGuide';
import { MayorHouseWorldLayout } from './MayorHouseWorldLayout';
import { MineWorldLayout } from './MineWorldLayout';
import { TownShopPanel } from './TownShopPanel';
import { TownWorldLayout } from './TownWorldLayout';
import { TouchJoystick } from './TouchJoystick';
import { ensureUiAudio } from './UiAudio';
import { loadUiFont } from './UiFont';
import { WorldYSort } from './WorldYSort';
import { canTravel, travelTo } from './MapTravel';
import type { Tables } from '../cfg/schema';

const { ccclass } = _decorator;

/** Clear inside the 1080 portrait frame (under grass fill). */
const STAGE_CLEAR = new Color(58, 118, 52, 255);

@ccclass('GameBootstrap')
export class GameBootstrap extends Component {
    private _uiCam: Camera | null = null;
    private _letterboxCam: Camera | null = null;
    private _applyingFrame = false;

    onLoad() {
        loadUiFont();
        applyDesignResolution();
        this._ensureCanvas();
        this._ensureLetterboxCam();
        this._applyPortraitFrame();
        view.on('canvas-resize', this._applyPortraitFrame, this);

        const canvas = this.node;
        ensureUiAudio(canvas);
        const world = canvas.getChildByName('World');
        if (!world) {
            console.error('[GameBootstrap] World missing');
            return;
        }

        // Full-screen gate FIRST — before teardown so the farm never flashes bare.
        const loading = LoadingScreen.mount(canvas);
        loading.setProgress(0.02, '正在唤醒溪谷…');
        InputBridge.uiBlocking = true;
        InputBridge.moveLocked = true;
        InputBridge.clear();

        const title = canvas.getChildByName('Title');
        if (title) title.active = false;

        for (const name of [
            'Joystick',
            'TouchControls',
            'StickVisual',
            'MoveHint',
            'QuestBanner',
            'QuestHint',
            'FarmHint',
            'FarmStats',
            'FarmActionHint',
            'FarmActionBtn',
            'FarmHotbar',
            'FarmUseBtn',
            'FarmBagDimmer',
            'FarmBagPanel',
            'FarmChestDimmer',
            'FarmChestPanel',
            'FarmDragGhost',
            'FarmToolTip',
            'FarmInfoBoard',
            'FishingMinigame',
            'GmChip',
            'GmPanel',
            'QuestTracker',
            'QuestPanel',
            'ScreenFill',
            'NightOverlay',
            'DialogueDimmer',
            'DialogueBox',
            'StoryIntro',
            'TownShopDimmer',
            'TownShopPanel',
            'RewardDimmer',
            'RewardPopup',
            // Keep LoadingScreen — already mounted as the boot gate.
        ]) {
            const n = canvas.getChildByName(name);
            if (n) this._destroyNodeNow(n);
        }
        const oldPlayer = world.getChildByName('Player');
        if (oldPlayer) this._destroyNodeNow(oldPlayer);
        const oldMarker = world.getChildByName('QuestMarker');
        if (oldMarker) this._destroyNodeNow(oldMarker);
        for (const child of [...world.children]) {
            if (child.name === 'Crop' || child.name.startsWith('Crop')) this._destroyNodeNow(child);
        }

        // Drop story quest leftover from earlier builds.
        const oldQuest = canvas.getComponent(FirstQuest);
        if (oldQuest) canvas.removeComponent(oldQuest);
        this._compactComponents(canvas);

        this.fixPropAnchors(world);
        const isTown = TownWorldLayout.isBaked(world);
        const isMine = MineWorldLayout.isBaked(world);
        const isMayorHouse = MayorHouseWorldLayout.isBaked(world);
        const isFarmBaked = FarmWorldLayout.isBaked(world);
        const authored = isTown || isMine || isMayorHouse || isFarmBaked;
        // Match reference: map fills 1080 width; ground covers the portrait frame.
        // Authored scenes already have full terrain — don't expand/repaint tiles.
        const frame = this.fitWorldToDesign(canvas, world, authored);

        if (!world.getComponent(WorldYSort)) {
            world.addComponent(WorldYSort);
        }

        const bootMap = isTown
            ? 'town'
            : isMine
              ? 'mine'
              : isMayorHouse
                ? 'mayorHouse'
                : 'farm';
        const player = this.spawnPlayer(world, bootMap);
        if (isTown) TownWorldLayout.spawnNpcs(world);
        else if (isMayorHouse) MayorHouseWorldLayout.spawnNpcs(world);
        else if (!isMine) FarmWorldLayout.spawnNpcs(world);
        const stick = this.spawnTouchControls(canvas);

        let follow = canvas.getComponent(CameraFollow);
        if (!follow) follow = canvas.addComponent(CameraFollow);
        follow.target = player;
        follow.world = world;

        if (authored) {
            // Scene already contains the full world — only bind bounds / solids.
            const ctrl = player.getComponent(PlayerController);
            this.applyMapBounds(player, follow, this.measureMapBounds(world));
            ctrl?.rebuildSolids();
            follow.snap();
        } else {
            FarmWorldLayout.apply(world, frame.localW, frame.localH, () => {
                const ctrl = player.getComponent(PlayerController);
                ctrl?.rebuildSolids();
                // Pond + pinned river define the final ground AABB.
                this.applyMapBounds(player, follow, this.measureMapBounds(world));
                ctrl?.rebuildSolids();
                follow.snap();
            });
            this.pinRiverToBottom(world, frame.localH);
            FarmWorldLayout.placeBridge(world);
            this.applyMapBounds(player, follow, this.measureMapBounds(world));
        }

        const oldGm = canvas.getComponent(GmPanel);
        if (oldGm) canvas.removeComponent(oldGm);
        let gm = canvas.addComponent(GmPanel);

        StoryWorldHooks.applyPendingSpawn(player, bootMap);

        let farm = canvas.getComponent(FarmSystem);
        if (!farm) farm = canvas.addComponent(FarmSystem);
        farm.player = player;
        farm.world = world;
        GameState.applyInventory(farm);

        const oldQuestSys = canvas.getComponent(QuestSystem);
        if (oldQuestSys) canvas.removeComponent(oldQuestSys);
        const oldQuestUi = canvas.getComponent(QuestPanel);
        if (oldQuestUi) canvas.removeComponent(oldQuestUi);
        const oldStory = canvas.getComponent(StoryWorldHooks);
        if (oldStory) canvas.removeComponent(oldStory);
        const oldDialogue = canvas.getComponent(DialoguePanel);
        if (oldDialogue) canvas.removeComponent(oldDialogue);
        const oldIntro = canvas.getComponent(StoryIntroPanel);
        if (oldIntro) canvas.removeComponent(oldIntro);
        const oldStoryDlg = canvas.getComponent(StoryDialogue);
        if (oldStoryDlg) canvas.removeComponent(oldStoryDlg);
        const oldGuide = canvas.getComponent(TutorialGuide);
        if (oldGuide) canvas.removeComponent(oldGuide);
        const oldReward = canvas.getComponent(RewardPopup);
        if (oldReward) canvas.removeComponent(oldReward);

        const quests = canvas.addComponent(QuestSystem);
        const questPanel = canvas.addComponent(QuestPanel);
        const story = canvas.addComponent(StoryWorldHooks);
        const dialogue = canvas.addComponent(DialoguePanel);
        const storyIntro = canvas.addComponent(StoryIntroPanel);
        const storyDlg = canvas.addComponent(StoryDialogue);
        const guide = canvas.addComponent(TutorialGuide);
        const rewardPopup = canvas.addComponent(RewardPopup);
        quests.farm = farm;
        guide.farm = farm;
        guide.quests = quests;
        guide.bindFarmHint();
        questPanel.bind(quests);
        questPanel.ensureMounted();
        rewardPopup.bind(quests);
        const mapId = bootMap;
        storyIntro.syncMapBgm(mapId === 'mayorHouse' ? 'town' : mapId);
        storyDlg.bind({
            dialogue,
            intro: storyIntro,
            quests,
            map: mapId === 'mayorHouse' ? 'mayorHouse' : mapId,
            guide: isTown || isMine || isMayorHouse ? null : guide,
        });

        const oldInfoComp = canvas.getComponent(FarmInfoBoard);
        if (oldInfoComp) canvas.removeComponent(oldInfoComp);
        let infoBoard: FarmInfoBoard | null = null;

        if (isMayorHouse) {
            let hud = canvas.getComponent(FarmHUD);
            if (!hud) hud = canvas.addComponent(FarmHUD);
            hud.farm = farm;
            quests.hud = hud;
            hud.bindQuests(quests);

            story.bind({
                world,
                player,
                quests,
                farm,
                infoBoard: null,
                storyDialogue: storyDlg,
                isTown: false,
            });

            const oldShop = canvas.getComponent(TownShopPanel);
            if (oldShop) canvas.removeComponent(oldShop);
            const shopPanel = canvas.addComponent(TownShopPanel);
            shopPanel.farm = farm;
            shopPanel.quests = quests;

            MayorHouseWorldLayout.mountExitFx(world);
            let mayorExitArmed = true;
            this.schedule(() => {
                if (!mayorExitArmed || !player?.isValid) return;
                const p = player.position;
                if (!MayorHouseWorldLayout.inExitZone(p.x, p.y)) return;
                if (!canTravel('town')) return;
                mayorExitArmed = false;
                travelTo('town', {
                    farm,
                    quests,
                    spawnX: MayorHouseWorldLayout.TOWN_RETURN.x,
                    spawnY: MayorHouseWorldLayout.TOWN_RETURN.y,
                });
            }, 0.08);

            stick.onTap = (x, y) => {
                guide.noteActivity();
                if (storyIntro.handleTap(x, y)) return;
                if (dialogue.handleTap(x, y)) return;
                if (rewardPopup.handleTap(x, y)) return;
                if (gm.handleTap(x, y)) return;
                if (questPanel.handleTap(x, y)) return;
                if (shopPanel.handleTap(x, y)) return;
                if (infoBoard?.handleTap(x, y)) return;
                const worldPt = this.screenToWorld(follow, world, x, y);
                if (worldPt) {
                    const npcHit = TownWorldLayout.findNpc(world, worldPt.x, worldPt.y);
                    if (npcHit?.id === 'mayor') {
                        // Walk into talk range first — far taps must not open dialogue.
                        story.approachNpcThen(npcHit.node, () => {
                            if (!npcHit.node.isValid || !player.isValid) return;
                            npcHit.node.getComponent(NpcAnimator)?.faceToward(
                                player.position.x,
                                player.position.y,
                            );
                            if (storyDlg.tryBuilding('mayor')) return;
                            const chat = TownWorldLayout.npcInfo('mayor');
                            if (chat) {
                                if (chat.storyFlag) quests.noteFlag(chat.storyFlag);
                                shopPanel.openInfo(chat.title, chat.body);
                            }
                        });
                        return;
                    }
                    const hit = MayorHouseWorldLayout.findInteract(world, worldPt.x, worldPt.y);
                    if (hit?.kind === 'info') {
                        shopPanel.openInfo(hit.title, hit.body);
                        return;
                    }
                }
                hud!.handleTap(x, y);
            };
            stick.onDragStart = () => {
                guide.noteActivity();
                farm!.cancelPending();
                player.getComponent(PlayerController)?.onManualMoveStart();
            };

            const infoReady = this.mountInfoBoard(canvas, farm, (info) => {
                infoBoard = info;
                gm.setInfoBoard(info);
                quests.infoBoard = info;
                story.infoBoard = info;
            });

            void this.finishBoot({
                canvas,
                loading,
                storyDlg,
                quests,
                questPanel,
                player,
                hud,
                infoReady,
                afterTables: () => {
                    hud.reloadCraftRecipes();
                },
            });
        } else if (isMine) {
            let hud = canvas.getComponent(FarmHUD);
            if (!hud) hud = canvas.addComponent(FarmHUD);
            hud.farm = farm;
            quests.hud = hud;
            hud.bindQuests(quests);
            farm.onQuestStat((kind, param, n) => {
                const count = n ?? 1;
                if (kind === 'gather' && param) quests.noteGather(param, count);
            });

            story.bind({
                world,
                player,
                quests,
                farm,
                infoBoard: null,
                storyDialogue: storyDlg,
                isTown: false,
            });

            const oldShop = canvas.getComponent(TownShopPanel);
            if (oldShop) canvas.removeComponent(oldShop);
            const shopPanel = canvas.addComponent(TownShopPanel);
            shopPanel.farm = farm;
            shopPanel.quests = quests;

            stick.onTap = (x, y) => {
                guide.noteActivity();
                if (storyIntro.handleTap(x, y)) return;
                if (dialogue.handleTap(x, y)) return;
                if (rewardPopup.handleTap(x, y)) return;
                if (gm.handleTap(x, y)) return;
                if (questPanel.handleTap(x, y)) return;
                if (shopPanel.handleTap(x, y)) return;
                if (infoBoard?.handleTap(x, y)) return;
                const worldPt = this.screenToWorld(follow, world, x, y);
                if (worldPt) {
                    const hit = MineWorldLayout.findInteract(world, worldPt.x, worldPt.y);
                    if (hit?.kind === 'travel') {
                        if (!canTravel('town')) return;
                        travelTo('town', {
                            farm,
                            quests,
                            spawnX: MineWorldLayout.TOWN_RETURN.x,
                            spawnY: MineWorldLayout.TOWN_RETURN.y,
                        });
                        return;
                    }
                    if (hit?.kind === 'info') {
                        if (hit.storyFlag) quests.noteFlag(hit.storyFlag);
                        shopPanel.openInfo(hit.title, hit.body);
                        return;
                    }
                }
                hud!.handleTap(x, y);
            };
            stick.onDragStart = () => {
                guide.noteActivity();
                farm!.cancelPending();
                player.getComponent(PlayerController)?.onManualMoveStart();
            };

            const infoReady = this.mountInfoBoard(canvas, farm, (info) => {
                infoBoard = info;
                gm.setInfoBoard(info);
                quests.infoBoard = info;
                story.infoBoard = info;
            });

            void this.finishBoot({
                canvas,
                loading,
                storyDlg,
                quests,
                questPanel,
                player,
                hud,
                infoReady,
                afterTables: () => {
                    hud.reloadCraftRecipes();
                    quests.noteFlag('enter_mine');
                    GameState.unlock('mine');
                },
            });
        } else if (isTown) {
            let hud = canvas.getComponent(FarmHUD);
            if (!hud) hud = canvas.addComponent(FarmHUD);
            hud.farm = farm;
            quests.hud = hud;
            hud.bindQuests(quests);

            const oldShop = canvas.getComponent(TownShopPanel);
            if (oldShop) canvas.removeComponent(oldShop);
            const shopPanel = canvas.addComponent(TownShopPanel);
            shopPanel.farm = farm;
            shopPanel.quests = quests;

            story.bind({
                world,
                player,
                quests,
                farm,
                infoBoard: null,
                storyDialogue: storyDlg,
                isTown: true,
            });

            stick.onTap = (x, y) => {
                guide.noteActivity();
                if (storyIntro.handleTap(x, y)) return;
                if (dialogue.handleTap(x, y)) return;
                if (rewardPopup.handleTap(x, y)) return;
                if (gm.handleTap(x, y)) return;
                if (questPanel.handleTap(x, y)) return;
                if (shopPanel.handleTap(x, y)) return;
                if (infoBoard?.handleTap(x, y)) return;
                const worldPt = this.screenToWorld(follow, world, x, y);
                if (worldPt) {
                    // Prefer npc_* actors when the tap lands near them.
                    const npcHit = TownWorldLayout.findNpc(world, worldPt.x, worldPt.y);
                    if (npcHit) {
                        story.approachNpcThen(npcHit.node, () => {
                            if (!npcHit.node.isValid || !player.isValid) return;
                            npcHit.node.getComponent(NpcAnimator)?.faceToward(
                                player.position.x,
                                player.position.y,
                            );
                            if (npcHit.id === 'mayor' || npcHit.id === 'carpenter') {
                                if (storyDlg.tryBuilding(npcHit.key)) return;
                            }
                            const chat = TownWorldLayout.npcInfo(npcHit.id);
                            if (chat) {
                                if (chat.storyFlag) quests.noteFlag(chat.storyFlag);
                                shopPanel.openInfo(chat.title, chat.body);
                            }
                        });
                        return;
                    }
                    const hit = TownWorldLayout.findInteract(world, worldPt.x, worldPt.y);
                    if (hit) {
                        if (hit.kind === 'travel') {
                            if (hit.dest === 'mine') {
                                if (!canTravel('mine')) {
                                    shopPanel.openInfo(
                                        '矿洞路牌',
                                        '矿脉商会尚未放行。先去矿石店打听打听浅层矿洞的事。',
                                    );
                                    return;
                                }
                                shopPanel.openInfo('前往浅层矿洞', '路牌指向北山矿洞…');
                                travelTo('mine', {
                                    farm,
                                    quests,
                                    spawnX: MineWorldLayout.PLAYER_SPAWN.x,
                                    spawnY: MineWorldLayout.PLAYER_SPAWN.y,
                                });
                                return;
                            }
                            if (hit.dest === 'mayorHouse') {
                                travelTo('mayorHouse', {
                                    farm,
                                    quests,
                                    spawnX: MayorHouseWorldLayout.PLAYER_SPAWN.x,
                                    spawnY: MayorHouseWorldLayout.PLAYER_SPAWN.y,
                                });
                                return;
                            }
                            story.tryTownFarmSignTap();
                            return;
                        }
                        if (hit.kind === 'shop') {
                            shopPanel.openShop(hit.shopId);
                            // 矿脉商会放行浅层矿洞（Ch.2 钩子）
                            if (hit.shopId === 'ore') {
                                quests.noteFlag('visit_oreshop');
                                GameState.unlock('mine');
                            }
                        } else if (hit.kind === 'board') shopPanel.openBoard(hit.board);
                        else if (storyDlg.tryBuilding(hit.key)) {
                            // Story dialogue owns carpenter / community / clinic beats.
                        } else {
                            if (hit.storyFlag) quests.noteFlag(hit.storyFlag);
                            shopPanel.openInfo(hit.title, hit.body);
                        }
                        return;
                    }
                }
                hud!.handleTap(x, y);
            };
            stick.onDragStart = () => {
                guide.noteActivity();
                player.getComponent(PlayerController)?.onManualMoveStart();
            };

            const infoReady = this.mountInfoBoard(canvas, farm, (info) => {
                infoBoard = info;
                gm.setInfoBoard(info);
                quests.infoBoard = info;
                story.infoBoard = info;
            });

            void this.finishBoot({
                canvas,
                loading,
                storyDlg,
                quests,
                questPanel,
                player,
                hud,
                infoReady,
                afterTables: () => {
                    hud.reloadCraftRecipes();
                    // Arriving in town completes 1009 (idempotent via Flag ≥1).
                    quests.noteFlag('enter_town');
                    if (infoBoard) {
                        quests.infoBoard = infoBoard;
                        story.infoBoard = infoBoard;
                    }
                },
            });
        } else {
            let hud = canvas.getComponent(FarmHUD);
            if (!hud) hud = canvas.addComponent(FarmHUD);
            hud.farm = farm;
            quests.hud = hud;
            hud.bindQuests(quests);
            farm.onQuestStat((kind, param, n) => {
                const count = n ?? 1;
                switch (kind) {
                    case 'gather':
                        if (param) quests.noteGather(param, count);
                        break;
                    case 'till':
                        quests.noteTill(count);
                        break;
                    case 'plant':
                        quests.notePlant(count);
                        break;
                    case 'water':
                        quests.noteWater(count);
                        break;
                    case 'harvest':
                        quests.noteHarvest(count);
                        break;
                    case 'fish':
                        quests.noteFish(count);
                        break;
                    case 'craft':
                        if (param) quests.noteCraft(param, count);
                        break;
                }
            });

            story.bind({
                world,
                player,
                quests,
                farm,
                infoBoard: null,
                storyDialogue: storyDlg,
                isTown: false,
            });

            stick.onTap = (x, y) => {
                guide.noteActivity();
                if (storyIntro.handleTap(x, y)) return;
                if (dialogue.handleTap(x, y)) return;
                if (rewardPopup.handleTap(x, y)) return;
                if (guide.handleTap(x, y)) return;
                if (gm.handleTap(x, y)) return;
                if (questPanel.handleTap(x, y)) return;
                if (infoBoard?.handleTap(x, y)) return;
                const worldPt = this.screenToWorld(follow, world, x, y);
                if (worldPt) {
                    const npcHit = FarmWorldLayout.findNpc(world, worldPt.x, worldPt.y);
                    if (npcHit) {
                        story.approachNpcThen(npcHit.node, () => {
                            if (!npcHit.node.isValid || !player.isValid) return;
                            const anim = npcHit.node.getComponent(NpcAnimator);
                            // StoryDialogue holds/releases for the full chat; face now.
                            anim?.holdPatrol();
                            anim?.faceToward(player.position.x, player.position.y);
                            if (storyDlg.tryFarmNpc(npcHit.key)) return;
                            const chat = FarmWorldLayout.npcInfo(npcHit.id);
                            if (chat) {
                                dialogue.play([{ speaker: chat.title, text: chat.body }]);
                            }
                        });
                        return;
                    }
                    if (story.tryFarmPortalTap(worldPt.x, worldPt.y)) return;
                }
                hud!.handleTap(x, y);
            };
            const infoReady = this.mountInfoBoard(canvas, farm, (info) => {
                infoBoard = info;
                gm.setInfoBoard(info);
                quests.infoBoard = info;
                story.infoBoard = info;
            });
            stick.onDragStart = () => {
                guide.noteActivity();
                farm!.cancelPending();
                player.getComponent(PlayerController)?.onManualMoveStart();
            };

            void this.finishBoot({
                canvas,
                loading,
                storyDlg,
                quests,
                questPanel,
                player,
                hud,
                infoReady,
                afterTables: () => {
                    hud.reloadCraftRecipes();
                },
            });
        }

        follow.snap();
        // Keep loading overlay above everything mounted this frame.
        loading.setProgress(loading.progress, undefined);
    }

    /**
     * Warm assets under the loading gate, then bind quests and boot story.
     * Input stays locked until the overlay closes.
     */
    private async finishBoot(opts: {
        canvas: Node;
        loading: LoadingScreen;
        storyDlg: StoryDialogue;
        quests: QuestSystem;
        questPanel: QuestPanel;
        player: Node;
        hud?: FarmHUD | null;
        infoReady: Promise<FarmInfoBoard | null>;
        afterTables?: (tables: Tables) => void;
    }) {
        const { canvas, loading, storyDlg, quests, questPanel, player } = opts;
        try {
            await warmupCriticalAssets((p, tip) => {
                if (canvas.isValid) loading.setProgress(0.05 + p * 0.7, tip);
            });

            if (!canvas.isValid) return;
            loading.setProgress(0.78, '布置界面…');
            await new Promise<void>((resolve) => {
                questPanel.ensureMounted(() => resolve());
            });
            await opts.infoReady;

            loading.setProgress(0.9, '同步旅途…');
            const tables = await loadConfigTables();
            if (!canvas.isValid) return;
            applyCraftTables(tables);
            // Restore quest snapshot before afterTables flags (enter_town / enter_mine).
            quests.bindTables(tables);
            opts.afterTables?.(tables);
            await loadUiFont();

            const anim = player.getComponent(PlayerAnimator);
            if (anim) {
                await Promise.race([
                    anim.whenReady(),
                    new Promise<void>((r) => setTimeout(r, 4000)),
                ]);
            }

            loading.setProgress(1, '准备就绪');
            if (canvas.isValid) await loading.waitForStart();
        } catch (err) {
            console.warn('[GameBootstrap] loading pipeline failed', err);
            if (canvas.isValid) await loading.waitForStart();
        }

        if (!canvas.isValid) {
            loading.close();
            return;
        }

        // Re-kick farm companion patrol after boot — covers hot-reload / late component init.
        const world = canvas.getChildByName('World');
        const girl = world?.getChildByName('npc_girl');
        const girlAnim = girl?.getComponent(NpcAnimator);
        const patrol = FarmWorldLayout.NPC_SPAWNS.find((s) => s.id === 'girl')?.patrol;
        if (girlAnim && patrol && patrol.length >= 2) {
            girlAnim.setPatrol(patrol, { speed: 80, idleMin: 0.5, idleMax: 1.4 });
        }

        // Start story UNDER the splash, wait until it fully covers, then lift the gate.
        // Avoids: splash fade → bare farm flash → story fade-in.
        loading.releaseSuppressedChrome();
        storyDlg.boot();
        const intro = canvas.getComponent(StoryIntroPanel);
        const dialogue = canvas.getComponent(DialoguePanel);
        let covered = false;
        if (intro?.isOpen) {
            await intro.ensureCovered();
            covered = intro.isOpen;
        } else if (dialogue?.isOpen) {
            await dialogue.ensureCovered();
            covered = dialogue.isOpen;
        }

        await new Promise<void>((resolve) => {
            loading.close(() => resolve(), {
                fadeMs: covered ? 0 : 280,
                restoreChrome: !covered,
            });
        });

        if (covered) {
            // Intro / dialogue own input locks; just clear stale stick state.
            InputBridge.clear();
        } else {
            InputBridge.uiBlocking = false;
            InputBridge.moveLocked = false;
            InputBridge.clear();
        }
    }

    private mountInfoBoard(
        canvas: Node,
        farm: FarmSystem,
        ready: (info: FarmInfoBoard) => void,
    ): Promise<FarmInfoBoard | null> {
        return new Promise((resolve) => {
            assetManager.loadAny({ uuid: INFO_BOARD_PREFAB_UUID }, (err, asset) => {
                if (err || !asset) {
                    console.warn('[GameBootstrap] FarmInfoBoard prefab missing', err);
                    resolve(null);
                    return;
                }
                if (!canvas.isValid) {
                    resolve(null);
                    return;
                }
                // Drop null component slots before setParent — engine getComponent
                // crashes on `comp.constructor` when a slot is null (e.g. script
                // UUID failed to resolve during prefab deserialize).
                this._compactComponents(canvas);
                const node = instantiate(asset as Prefab);
                node.name = 'FarmInfoBoard';
                node.layer = canvas.layer;
                this._compactComponentTree(node);
                node.setParent(canvas);
                node.setSiblingIndex(canvas.children.length - 1);
                let info = node.getComponent(FarmInfoBoard);
                if (!info) info = node.addComponent(FarmInfoBoard);
                info.farm = farm;
                ready(info);
                resolve(info);
            });
        });
    }

    /** Detach immediately so hierarchy walks won't touch half-destroyed nodes. */
    private _destroyNodeNow(n: Node) {
        if (!n.isValid) return;
        n.removeFromParent();
        n.destroy();
    }

    /** Drop null slots left by failed deserialize / deferred Component.destroy. */
    private _compactComponents(node: Node) {
        const comps = (node as unknown as { _components?: Array<Component | null> })._components;
        if (!comps?.length) return;
        for (let i = comps.length - 1; i >= 0; i--) {
            if (!comps[i]) comps.splice(i, 1);
        }
    }

    private _compactComponentTree(root: Node) {
        const stack: Node[] = [root];
        while (stack.length) {
            const n = stack.pop()!;
            this._compactComponents(n);
            for (const c of n.children) stack.push(c);
        }
    }

    /** Grass / water tile edges → camera clamp + player soft bounds. */
    private measureMapBounds(world: Node): {
        minX: number;
        maxX: number;
        minY: number;
        maxY: number;
    } {
        const TILE = 64;
        const half = TILE * 0.5;
        let minX = Infinity;
        let maxX = -Infinity;
        let minY = Infinity;
        let maxY = -Infinity;
        for (const child of world.children) {
            const n = child.name;
            if (
                !n.startsWith('tile-grass') &&
                !n.startsWith('tile-dirt') &&
                !n.startsWith('tile-stone') &&
                !n.startsWith('tile-wood') &&
                !n.startsWith('tile-cave') &&
                !n.startsWith('water_') &&
                !n.startsWith('pond_')
            ) {
                continue;
            }
            const p = child.position;
            minX = Math.min(minX, p.x - half);
            maxX = Math.max(maxX, p.x + half);
            minY = Math.min(minY, p.y - half);
            maxY = Math.max(maxY, p.y + half);
        }
        if (!Number.isFinite(minX)) {
            return { minX: -480, maxX: 480, minY: -544, maxY: 544 };
        }
        return { minX, maxX, minY, maxY };
    }

    private applyMapBounds(
        player: Node,
        follow: CameraFollow | null,
        bounds: { minX: number; maxX: number; minY: number; maxY: number },
    ) {
        const margin = 20;
        follow?.setMapBounds(bounds.minX, bounds.maxX, bounds.minY, bounds.maxY);
        player.getComponent(PlayerController)?.setMapBounds(
            bounds.minX + margin,
            bounds.maxX - margin,
            bounds.minY + margin,
            bounds.maxY - margin,
        );
    }

    onDestroy() {
        view.off('canvas-resize', this._applyPortraitFrame, this);
    }

    private _ensureCanvas(): void {
        let canvas = this.node.getComponent(Canvas);
        if (!canvas) canvas = this.node.addComponent(Canvas);

        let ut = this.node.getComponent(UITransform);
        if (!ut) ut = this.node.addComponent(UITransform);
        ut.setContentSize(DESIGN_W, DESIGN_H);

        // Full-bleed Widget forces landscape canvas on desktop — keep off.
        // removeComponent() only schedules destroy(); splice out immediately.
        const stretch = this.node.getComponent(Widget);
        if (stretch) {
            stretch.enabled = false;
            (this.node as unknown as { _removeComponent: (c: Component) => void })._removeComponent(stretch);
        }
        this._compactComponents(this.node);

        let camNode = this.node.getChildByName('Camera');
        if (!camNode) {
            camNode = new Node('Camera');
            this.node.addChild(camNode);
            camNode.setPosition(0, 0, 1000);
        }
        let cam = camNode.getComponent(Camera);
        if (!cam) cam = camNode.addComponent(Camera);
        cam.projection = Camera.ProjectionType.ORTHO;
        cam.orthoHeight = DESIGN_H * 0.5;
        cam.clearColor = STAGE_CLEAR;
        cam.clearFlags = Camera.ClearFlag.DEPTH_ONLY;
        cam.visibility = Layers.Enum.UI_2D;
        cam.priority = 10;
        canvas.cameraComponent = cam;
        canvas.alignCanvasWithScreen = false;
        this._uiCam = cam;
    }

    /** Black bars outside the 1080 portrait phone frame on wide desktop. */
    private _ensureLetterboxCam(): void {
        const scene = this.node.scene;
        if (!scene) return;

        let node = scene.getChildByName('LetterboxCam');
        if (!node) {
            node = new Node('LetterboxCam');
            scene.addChild(node);
            node.setPosition(0, 0, 0);
        }
        let cam = node.getComponent(Camera);
        if (!cam) cam = node.addComponent(Camera);
        cam.projection = Camera.ProjectionType.ORTHO;
        cam.orthoHeight = 10;
        cam.priority = -100;
        cam.visibility = 0;
        cam.clearFlags = Camera.ClearFlag.SOLID_COLOR;
        cam.clearColor = LETTERBOX_CLEAR;
        cam.rect.set(0, 0, 1, 1);
        this._letterboxCam = cam;
    }

    private _applyPortraitFrame = (): void => {
        if (this._applyingFrame) return;
        this._applyingFrame = true;
        try {
            applyDesignResolution();
            const vis = portraitVisibleSize();
            const ut = this.node.getComponent(UITransform);
            if (ut) ut.setContentSize(vis.width, vis.height);
            if (this._uiCam?.isValid) {
                this._uiCam.orthoHeight = vis.height * 0.5;
                this._uiCam.clearFlags = Camera.ClearFlag.DEPTH_ONLY;
                this._uiCam.clearColor = STAGE_CLEAR;
                applyPortraitCameraRect(this._uiCam);
            }
            if (this._letterboxCam?.isValid) {
                this._letterboxCam.clearColor = LETTERBOX_CLEAR;
                this._letterboxCam.rect.set(0, 0, 1, 1);
                this._letterboxCam.enabled = true;
            }
            this._resizeScreenFill(vis.width, vis.height);
            this._resizeNightOverlay(vis.width, vis.height);
        } finally {
            this._applyingFrame = false;
        }
    };

    /**
     * Portrait framing:
     * - scale so the authored grass strip fills design width 1080
     * - then multiply by WORLD_ZOOM so sprites read larger on phone
     * - expand grass to cover the visible portrait frame
     * Layout / decor are applied by the caller after the player exists.
     */
    private fitWorldToDesign(
        canvas: Node,
        world: Node,
        baked = false,
    ): { localW: number; localH: number } {
        // 等比放大 0.5 倍 → 1.5×（试手感；UI 在 Canvas 上不缩放）
        const WORLD_ZOOM = 1.5;
        const TILE = 64;
        const grass: Node[] = [];
        let minX = Infinity;
        let maxX = -Infinity;
        let minY = Infinity;
        let maxY = -Infinity;
        for (const child of world.children) {
            if (!child.name.startsWith('tile-grass')) continue;
            const p = child.position;
            // Baked map includes western lake-shore grass — zoom from the
            // farm core strip only (same band used before runtime expand).
            if (baked && (p.x < -448 || p.x > 448)) continue;
            grass.push(child);
            minX = Math.min(minX, p.x);
            maxX = Math.max(maxX, p.x);
            minY = Math.min(minY, p.y);
            maxY = Math.max(maxY, p.y);
        }
        if (!grass.length || !Number.isFinite(minX)) {
            minX = -448;
            maxX = 448;
            minY = -384;
            maxY = 256;
        }

        const grassW = maxX - minX + TILE;
        // Full-bleed width like the reference phone screenshot — never shrink to fit height.
        const s = (DESIGN_W / Math.max(1, grassW)) * WORLD_ZOOM;

        // Cover the whole portrait in world-local units after this scale.
        const localW = DESIGN_W / s;
        const localH = DESIGN_H / s;
        if (!baked) {
            this.expandGrassTiles(world, grass, TILE, localW, localH);
        }

        world.setScale(s, s, 1);
        world.setPosition(0, 0, 0);

        this.spawnScreenFill(canvas, world);
        world.setSiblingIndex(1);
        ensureNightWash(canvas, world, DESIGN_W, DESIGN_H);
        return { localW, localH };
    }

    private pinRiverToBottom(world: Node, localH: number) {
        let minWaterY = Infinity;
        for (const child of world.children) {
            if (!child.name.startsWith('water_') && !child.name.startsWith('cliff_')) continue;
            minWaterY = Math.min(minWaterY, child.position.y);
        }
        if (!Number.isFinite(minWaterY)) return;
        const targetY = -localH * 0.42;
        const dy = targetY - minWaterY;
        if (Math.abs(dy) < 1) return;
        for (const child of world.children) {
            if (
                child.name.startsWith('water_') ||
                child.name.startsWith('cliff_') ||
                child.name === 'bridge'
            ) {
                child.setPosition(child.position.x, child.position.y + dy, 0);
            }
        }
    }

    private expandGrassTiles(
        world: Node,
        grass: Node[],
        tile: number,
        localW: number,
        localH: number,
    ) {
        const template = grass[0];
        const templateSp = template?.getComponent(Sprite);
        const sf = templateSp?.spriteFrame ?? null;
        const occupied = new Set<string>();
        for (const g of grass) {
            const ix = Math.round(g.position.x / tile);
            const iy = Math.round(g.position.y / tile);
            occupied.add(`${ix},${iy}`);
        }

        const col0 = Math.ceil((-localW * 0.5) / tile);
        const col1 = Math.floor((localW * 0.5) / tile);
        const row0 = Math.ceil((-localH * 0.5) / tile);
        const row1 = Math.floor((localH * 0.5) / tile);

        for (let iy = row0; iy <= row1; iy++) {
            for (let ix = col0; ix <= col1; ix++) {
                const key = `${ix},${iy}`;
                if (occupied.has(key)) continue;
                occupied.add(key);
                const node = new Node(`tile-grass_${ix}_${iy}`);
                node.layer = world.layer;
                node.setParent(world);
                node.setSiblingIndex(0);
                node.setPosition(ix * tile, iy * tile, 0);
                const ui = node.addComponent(UITransform);
                ui.setContentSize(tile, tile);
                ui.setAnchorPoint(0.5, 0.5);
                const sp = node.addComponent(Sprite);
                sp.sizeMode = Sprite.SizeMode.CUSTOM;
                if (sf) sp.spriteFrame = sf;
            }
        }
    }

    private spawnScreenFill(canvas: Node, world: Node) {
        const fill = new Node('ScreenFill');
        fill.layer = canvas.layer;
        fill.setParent(canvas);
        fill.setSiblingIndex(0);
        fill.setPosition(0, 0, 0);
        const ut = fill.addComponent(UITransform);
        ut.setContentSize(DESIGN_W, DESIGN_H);

        const g = fill.addComponent(Graphics);
        this._paintFill(g, DESIGN_W, DESIGN_H);
        world.setSiblingIndex(1);
    }

    private _resizeScreenFill(w: number, h: number) {
        const fill = this.node.getChildByName('ScreenFill');
        if (!fill?.isValid) return;
        const ut = fill.getComponent(UITransform);
        if (ut) ut.setContentSize(w, h);
        const g = fill.getComponent(Graphics);
        if (g) this._paintFill(g, w, h);
    }

    private _resizeNightOverlay(w: number, h: number) {
        const world = this.node.getChildByName('World');
        ensureNightWash(this.node, world, w, h);
    }

    private _paintFill(g: Graphics, w: number, h: number) {
        g.clear();
        // Flat meadow under tiles — no stripe “empty zone” look.
        g.fillColor = new Color(58, 118, 52, 255);
        g.rect(-w * 0.5, -h * 0.5, w, h);
        g.fill();
    }

    /** UI coords (origin bottom-left) → world-local point under CameraFollow. */
    private screenToWorld(
        _follow: CameraFollow | null,
        world: Node,
        uiX: number,
        uiY: number,
    ): { x: number; y: number } | null {
        const canvasUi = this.node.getComponent(UITransform);
        const vis = view.getVisibleSize();
        const hw = (canvasUi?.contentSize.width || vis.width) * 0.5;
        const hh = (canvasUi?.contentSize.height || vis.height) * 0.5;
        const canvasX = uiX - hw;
        const canvasY = uiY - hh;
        const s = Math.max(0.0001, world.scale.x);
        return {
            x: (canvasX - world.position.x) / s,
            y: (canvasY - world.position.y) / s,
        };
    }

    private fixPropAnchors(world: Node) {
        for (const child of world.children) {
            const n = child.name;
            if (
                n === '__farm_baked' ||
                n === '__town_baked' ||
                n === '__town_spawn' ||
                n === '__mine_baked' ||
                n === '__mine_spawn' ||
                n === '__mayor_house_baked' ||
                n === '__mayor_house_spawn' ||
                n.startsWith('tile-') ||
                n.startsWith('water_') ||
                n.startsWith('cliff_') ||
                n.startsWith('pond_') ||
                n.startsWith('fringe_')
            ) {
                continue;
            }
            const ui = child.getComponent(UITransform);
            if (!ui) continue;
            if (ui.anchorY > 0.1) {
                const dy = ui.contentSize.height * (ui.anchorY - 0);
                child.setPosition(child.position.x, child.position.y - dy * 0.5, 0);
                ui.setAnchorPoint(0.5, 0);
            }
        }
    }

    private spawnTouchControls(canvas: Node): TouchJoystick {
        const host = new Node('TouchControls');
        host.layer = canvas.layer;
        host.setParent(canvas);
        host.addComponent(UITransform).setContentSize(10, 10);

        const visual = new Node('StickVisual');
        visual.layer = canvas.layer;
        visual.setParent(canvas);
        visual.addComponent(UITransform).setContentSize(180, 180);

        const base = new Node('Base');
        base.layer = canvas.layer;
        base.setParent(visual);
        base.addComponent(UITransform).setContentSize(160, 160);
        const g = base.addComponent(Graphics);
        g.fillColor = new Color(20, 28, 24, 150);
        g.circle(0, 0, 72);
        g.fill();
        g.strokeColor = new Color(230, 230, 210, 200);
        g.lineWidth = 5;
        g.circle(0, 0, 72);
        g.stroke();

        const knob = new Node('Knob');
        knob.layer = canvas.layer;
        knob.setParent(visual);
        knob.addComponent(UITransform).setContentSize(80, 80);
        const kg = knob.addComponent(Graphics);
        kg.fillColor = new Color(120, 190, 80, 230);
        kg.circle(0, 0, 32);
        kg.fill();

        const touch = host.addComponent(TouchJoystick);
        touch.visualRoot = visual;
        touch.knob = knob;
        touch.radius = 80;
        touch.dragThreshold = 22;
        visual.active = false;
        return touch;
    }

    private spawnPlayer(
        world: Node,
        map: 'farm' | 'town' | 'mine' | 'mayorHouse' = 'farm',
    ): Node {
        const player = new Node('Player');
        player.layer = world.layer;
        player.setParent(world);
        const spawn =
            map === 'town'
                ? TownWorldLayout.PLAYER_SPAWN
                : map === 'mine'
                  ? MineWorldLayout.PLAYER_SPAWN
                  : map === 'mayorHouse'
                    ? MayorHouseWorldLayout.PLAYER_SPAWN
                    : FarmWorldLayout.PLAYER_SPAWN;
        player.setPosition(new Vec3(spawn.x, spawn.y, 0));

        const ui = player.addComponent(UITransform);
        ui.setContentSize(48, 64);
        ui.setAnchorPoint(0.5, 0);

        const sp = player.addComponent(Sprite);
        // Fixed logical size + nearest textures — keeps pixel walk stable.
        sp.sizeMode = Sprite.SizeMode.CUSTOM;
        sp.type = Sprite.Type.SIMPLE;
        sp.trim = false;

        const ctrl = player.addComponent(PlayerController);
        ctrl.world = world;
        ctrl.speed = 300;
        ctrl.enableCollision = true;

        const anim = player.addComponent(PlayerAnimator);
        anim.fps = 9;
        anim.actionFps = 8;
        anim.loadCatalog(FARMER_FRAMES);

        return player;
    }
}
