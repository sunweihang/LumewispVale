import { Node } from 'cc';
import { DialoguePanel } from './DialoguePanel';
import {
    STAMINA_MAX,
    STAMINA_PASSOUT,
    advancePlotsOvernight,
    rollCalendar,
} from './DayRules';
import { FarmInfoBoard } from './FarmInfoBoard';
import { FarmSystem } from './FarmSystem';
import { FarmWorldLayout } from './FarmWorldLayout';
import { GameState, StoryMapId } from './GameState';
import { InputBridge } from './InputBridge';
import { travelTo } from './MapTravel';
import { PlayerController } from './PlayerController';
import { QuestSystem } from './QuestSystem';
import { StoryIntroPanel } from './StoryIntroPanel';
import { StoryWorldHooks } from './StoryWorldHooks';
import { TownShopPanel } from './TownShopPanel';
import { QuestPanel } from './QuestPanel';

export type DayCycleHost = {
    map: StoryMapId;
    farm: FarmSystem;
    player: Node;
    infoBoard: FarmInfoBoard;
    quests: QuestSystem;
    dialogue: DialoguePanel;
    storyIntro: StoryIntroPanel;
    shopPanel: TownShopPanel | null;
};

let _host: DayCycleHost | null = null;
let _rolling = false;

export function bindDayCycle(host: DayCycleHost | null) {
    _host = host;
}

export function dayCycleHost(): DayCycleHost | null {
    return _host;
}

export function isDayRolling(): boolean {
    return _rolling;
}

/** True while dialogue / shop / intro / exclusive UI should freeze the clock. */
export function clockHeldByUi(board: FarmInfoBoard): boolean {
    if (board.paused) return true;
    if (InputBridge.uiBlocking || InputBridge.moveLocked) return true;
    const canvas = board.node.parent;
    if (!canvas?.isValid) return false;
    if (canvas.getComponent(DialoguePanel)?.isOpen) return true;
    if (canvas.getComponent(StoryIntroPanel)?.isOpen) return true;
    if (canvas.getComponent(TownShopPanel)?.isOpen) return true;
    if (canvas.getComponent(QuestPanel)?.isOpen) return true;
    return _rolling;
}

function toast(msg: string) {
    _host?.infoBoard.showToast(msg);
}

function standAtCottage(player: Node, world: Node | null) {
    if (!world?.isValid || !player.isValid) return;
    const house = FarmWorldLayout.sleepDoorNode(world);
    if (!house?.isValid) return;
    const stand = StoryWorldHooks.standForInteract(house);
    player.setPosition(stand.x, stand.y, player.position.z);
    player.getComponent(PlayerController)?.cancelWalk(false);
}

function applyWakeStamina(passOut: boolean) {
    GameState.stamina = passOut ? STAMINA_PASSOUT : STAMINA_MAX;
    _host?.infoBoard.refreshStamina();
}

function rollClockToMorning() {
    const host = _host;
    if (!host) return;
    const next = rollCalendar(GameState.ensureClock());
    GameState.captureClock(next);
    host.infoBoard.applyClockState(next);
}

/**
 * Sleep until 06:00. Crops advance one night. Stamina full unless pass-out.
 * Off-farm pass-out travels home first; farm boot calls `finishPendingPassOut`.
 */
export function sleep(opts: { passOut: boolean }) {
    const host = _host;
    if (!host || _rolling) return;
    _rolling = true;
    const passOut = !!opts.passOut;
    GameState.passOutWake = passOut;

    if (host.farm.hasPlots) {
        host.farm.advancePlotsOnSleep();
        host.farm.capturePlots();
    } else if (GameState.plots) {
        GameState.plots = advancePlotsOvernight(GameState.plots);
    }

    host.quests.noteFlag('sleep_first');
    rollClockToMorning();
    applyWakeStamina(passOut);
    GameState.passOutWake = false;

    if (host.map !== 'farm') {
        GameState.pendingPassOut = true;
        const door = FarmWorldLayout.COTTAGE_STAND;
        travelTo('farm', {
            farm: host.farm,
            quests: host.quests,
            spawnX: door.x,
            spawnY: door.y,
        });
        _rolling = false;
        return;
    }

    standAtCottage(host.player, host.farm.world);
    toast(passOut ? '你熬夜晕倒了，清晨才醒来… 体力只恢复了七成' : '新的一天，精神满满');
    _rolling = false;
}

/** 02:00 — forced sleep. */
export function passOut() {
    sleep({ passOut: true });
}

/** After travelling home from a pass-out, snap to the cottage and toast. */
export function finishPendingPassOut() {
    if (!GameState.pendingPassOut) return;
    GameState.pendingPassOut = false;
    const host = _host;
    if (!host) return;
    standAtCottage(host.player, host.farm.world);
    toast('你熬夜晕倒了，清晨才醒来… 体力只恢复了七成');
}

/** Confirm panel: one dialogue tap sleeps. */
export function promptSleep() {
    const host = _host;
    if (!host) return;
    if (host.dialogue.isOpen || host.storyIntro.isOpen) return;
    host.dialogue.play(
        [{ speaker: '露穗', text: '要睡到明天吗？点这里确认。浇过水的田会在夜里长大。' }],
        () => sleep({ passOut: false }),
    );
}
