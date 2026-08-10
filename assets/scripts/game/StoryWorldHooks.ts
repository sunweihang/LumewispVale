import {
    _decorator,
    Color,
    Component,
    Label,
    Node,
    Sprite,
    SpriteFrame,
    UITransform,
    assetManager,
} from 'cc';
import { FarmInfoBoard } from './FarmInfoBoard';
import { FarmSystem } from './FarmSystem';
import { GameState, StoryMapId } from './GameState';
import { canTravel, travelTo } from './MapTravel';
import { QuestSystem } from './QuestSystem';
import { StoryDialogue } from './StoryDialogue';
import { TownWorldLayout } from './TownWorldLayout';

const { ccclass } = _decorator;

const SIGN_FRAME_UUID = '6bf7ecb9-7750-4efd-9f82-84534ceaef25@f9941';

/** East road toward town (yard → right-edge gate). Keep in sync with bake_farm_scene.TOWN_GATE. */
const FARM_TOWN_PORTAL = { x: 13 * 64, y: 4 * 64 + 36 };
const PORTAL_RADIUS = 90;

/**
 * Story props + proximity / portal hooks for the mainline.
 * Farm: town road sign. Town: farm road sign travel.
 */
@ccclass('StoryWorldHooks')
export class StoryWorldHooks extends Component {
    world: Node | null = null;
    player: Node | null = null;
    quests: QuestSystem | null = null;
    farm: FarmSystem | null = null;
    infoBoard: FarmInfoBoard | null = null;
    storyDialogue: StoryDialogue | null = null;
    isTown = false;

    bind(opts: {
        world: Node;
        player: Node;
        quests: QuestSystem;
        farm: FarmSystem;
        infoBoard?: FarmInfoBoard | null;
        storyDialogue?: StoryDialogue | null;
        isTown: boolean;
    }) {
        this.world = opts.world;
        this.player = opts.player;
        this.quests = opts.quests;
        this.farm = opts.farm;
        this.infoBoard = opts.infoBoard ?? null;
        this.storyDialogue = opts.storyDialogue ?? null;
        this.isTown = opts.isTown;

        // Town opens after the farm tutorial (fishing) — no meteor gate.
        if (this.townUnlockedFromQuest(opts.quests)) {
            GameState.unlock('town');
        }
        if (opts.isTown) {
            return;
        }
        this.ensureTownPortal();
        // Drop any leftover meteor node from older builds / baked layout.
        const leftover = this.world?.getChildByName('meteor');
        if (leftover) leftover.destroy();
    }

    update() {
        // Portal travel is tap-driven; nothing to poll each frame.
    }

    /** Farm: tap near town portal sign. */
    tryFarmPortalTap(wx: number, wy: number): boolean {
        if (this.isTown || !this.world) return false;
        const sign = this.world.getChildByName('portal_town');
        if (!sign) return false;
        const p = sign.position;
        const dx = wx - p.x;
        const dy = wy - p.y;
        if (dx * dx + dy * dy > PORTAL_RADIUS * PORTAL_RADIUS) return false;
        this.useTownPortal();
        return true;
    }

    /** Town: tap farm road sign. */
    tryTownFarmSignTap(): boolean {
        if (!this.isTown) return false;
        this.useFarmPortal();
        return true;
    }

    portalHint(px: number, py: number): string {
        if (this.isTown || !this.world) return '';
        const sign = this.world.getChildByName('portal_town');
        if (!sign) return '';
        const p = sign.position;
        const dx = px - p.x;
        const dy = py - p.y;
        if (dx * dx + dy * dy > PORTAL_RADIUS * PORTAL_RADIUS) return '';
        if (!canTravel('town')) return '通往小镇的路牌（先完成农场教程）';
        return '点击路牌前往微光溪谷镇';
    }

    private townUnlockedFromQuest(quests: QuestSystem): boolean {
        const snap = GameState.quest;
        if ((quests.flagOf('enter_town') ?? 0) >= 1) return true;
        if ((snap?.flags?.enter_town ?? 0) >= 1) return true;
        if (quests.isCompleted(1007) || quests.isCompleted(1008) || quests.isCompleted(1009)) return true;
        if (snap?.completed?.includes(1007) || snap?.completed?.includes(1008) || snap?.completed?.includes(1009)) {
            return true;
        }
        const active = quests.activeQuest?.id ?? snap?.activeId ?? 0;
        return active === 1009 || active >= 1010;
    }

    private useTownPortal() {
        if (!canTravel('town')) {
            this.infoBoard?.showToast('先把农场这边安顿好，再进镇');
            return;
        }
        this.infoBoard?.showToast('前往微光溪谷镇…');
        travelTo('town', {
            farm: this.farm,
            quests: this.quests,
            spawnX: TownWorldLayout.PLAYER_SPAWN.x,
            spawnY: TownWorldLayout.PLAYER_SPAWN.y,
        });
    }

    private useFarmPortal() {
        // Returning home is always allowed once town was reached.
        travelTo('farm', {
            farm: this.farm,
            quests: this.quests,
            spawnX: FARM_TOWN_PORTAL.x - 48,
            spawnY: FARM_TOWN_PORTAL.y,
        });
    }

    private ensureTownPortal() {
        if (!this.world) return;
        let node = this.world.getChildByName('portal_town');
        if (!node) {
            node = new Node('portal_town');
            node.layer = this.world.layer;
            node.setParent(this.world);
            const ui = node.addComponent(UITransform);
            ui.setContentSize(64, 80);
            ui.setAnchorPoint(0.5, 0);
            const sp = node.addComponent(Sprite);
            sp.sizeMode = Sprite.SizeMode.CUSTOM;
            assetManager.loadAny({ uuid: SIGN_FRAME_UUID }, (err, asset) => {
                if (!err && asset && sp.isValid) sp.spriteFrame = asset as SpriteFrame;
            });
        }
        node.setPosition(FARM_TOWN_PORTAL.x, FARM_TOWN_PORTAL.y, 0);
        if (node.getChildByName('PortalLabel')) return;

        const labNode = new Node('PortalLabel');
        labNode.layer = this.world.layer;
        labNode.setParent(node);
        labNode.setPosition(0, 96, 0);
        labNode.addComponent(UITransform).setContentSize(200, 28);
        const lab = labNode.addComponent(Label);
        lab.string = '通往小镇';
        lab.fontSize = 22;
        lab.lineHeight = 26;
        lab.color = new Color(255, 236, 170, 230);
        lab.horizontalAlign = Label.HorizontalAlign.CENTER;
    }

    /** Apply pending spawn after scene load. */
    static applyPendingSpawn(player: Node, map: Extract<StoryMapId, 'farm' | 'town' | 'mine'>) {
        const pending = GameState.pendingSpawn;
        if (!pending) return;
        if (pending.map !== map) return;
        player.setPosition(pending.x, pending.y, 0);
        GameState.pendingSpawn = null;
    }

    static farmPortalPos() {
        return { ...FARM_TOWN_PORTAL };
    }
}
