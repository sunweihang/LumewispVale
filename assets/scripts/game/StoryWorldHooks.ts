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
    instantiate,
    Prefab,
} from 'cc';
import { FarmInfoBoard } from './FarmInfoBoard';
import { FarmSystem } from './FarmSystem';
import { GameState, StoryMapId } from './GameState';
import { canTravel, travelTo } from './MapTravel';
import { QuestSystem } from './QuestSystem';
import { StoryDialogue } from './StoryDialogue';
import { TownWorldLayout } from './TownWorldLayout';

const { ccclass } = _decorator;

const METEOR_PREFAB_UUID = 'e51a5553-5169-4993-a867-03e35beb87e2';
const SIGN_FRAME_UUID = '6bf7ecb9-7750-4efd-9f82-84534ceaef25@f9941';

/** Forest fringe north-west of the tillable clearing. */
const METEOR_POS = { x: -220, y: 300 };
/** North path toward town (farm is south of the vale). */
const FARM_TOWN_PORTAL = { x: 160, y: 460 };
const METEOR_RADIUS = 110;
const PORTAL_RADIUS = 90;

/**
 * Story props + proximity / portal hooks for the mainline.
 * Farm: meteor + town road sign. Town: farm road sign travel.
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

    private _meteorDone = false;

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

        const flagged =
            (opts.quests.flagOf('inspect_meteor') ?? 0) >= 1 ||
            (GameState.quest?.flags?.inspect_meteor ?? 0) >= 1 ||
            !!GameState.quest?.completed?.includes(1008);
        this._meteorDone = flagged;
        if (flagged) GameState.unlock('town');
        if (opts.isTown) {
            // Town-side travel uses sign_farm tap via TownWorldLayout / bootstrap.
            return;
        }
        this.ensureMeteor();
        this.ensureTownPortal();
    }

    update() {
        if (this.isTown || !this.player || !this.world || !this.quests) return;
        if (!this._meteorDone) this.tryInspectMeteor();
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
        if (!canTravel('town')) return '通往小镇的路牌（尚需查看陨石异象）';
        return '点击路牌前往微光溪谷镇';
    }

    private useTownPortal() {
        if (!canTravel('town')) {
            this.infoBoard?.showToast('紫晶陨石仍在脉动…先去查看异象吧');
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
            spawnX: FARM_TOWN_PORTAL.x,
            spawnY: FARM_TOWN_PORTAL.y - 40,
        });
    }

    private tryInspectMeteor() {
        const meteor = this.world?.getChildByName('meteor');
        if (!meteor || !this.player) return;
        const p = this.player.position;
        const m = meteor.position;
        const dx = p.x - m.x;
        const dy = p.y - m.y;
        if (dx * dx + dy * dy > METEOR_RADIUS * METEOR_RADIUS) return;
        this._meteorDone = true;
        this.quests?.noteFlag('inspect_meteor');
        GameState.unlock('town');
        if (this.storyDialogue) {
            this.storyDialogue.playMeteorInspect(() => {
                this.infoBoard?.showToast('小镇的路已可通行 — 点击北侧路牌');
            });
        } else {
            this.infoBoard?.showToast('紫晶仍在脉动…小镇的路已可通行');
        }
    }

    private ensureMeteor() {
        if (!this.world) return;
        let node = this.world.getChildByName('meteor');
        if (node) return;
        assetManager.loadAny({ uuid: METEOR_PREFAB_UUID }, (err, asset) => {
            if (err || !asset || !this.world?.isValid) {
                console.warn('[StoryWorldHooks] meteor prefab missing', err);
                this.spawnMeteorFallback();
                return;
            }
            node = instantiate(asset as Prefab);
            node.name = 'meteor';
            node.layer = this.world.layer;
            node.setParent(this.world);
            node.setPosition(METEOR_POS.x, METEOR_POS.y, 0);
        });
    }

    private spawnMeteorFallback() {
        if (!this.world?.isValid || this.world.getChildByName('meteor')) return;
        const node = new Node('meteor');
        node.layer = this.world.layer;
        node.setParent(this.world);
        node.setPosition(METEOR_POS.x, METEOR_POS.y, 0);
        const ui = node.addComponent(UITransform);
        ui.setContentSize(96, 96);
        ui.setAnchorPoint(0.5, 0);
        const sp = node.addComponent(Sprite);
        sp.sizeMode = Sprite.SizeMode.CUSTOM;
        assetManager.loadAny(
            { uuid: 'e80f5369-d150-4b80-aa7c-636daa221af1@f9941' },
            (err, asset) => {
                if (!err && asset && sp.isValid) sp.spriteFrame = asset as SpriteFrame;
            },
        );
    }

    private ensureTownPortal() {
        if (!this.world || this.world.getChildByName('portal_town')) return;
        const node = new Node('portal_town');
        node.layer = this.world.layer;
        node.setParent(this.world);
        node.setPosition(FARM_TOWN_PORTAL.x, FARM_TOWN_PORTAL.y, 0);
        const ui = node.addComponent(UITransform);
        ui.setContentSize(64, 80);
        ui.setAnchorPoint(0.5, 0);
        const sp = node.addComponent(Sprite);
        sp.sizeMode = Sprite.SizeMode.CUSTOM;
        assetManager.loadAny({ uuid: SIGN_FRAME_UUID }, (err, asset) => {
            if (!err && asset && sp.isValid) sp.spriteFrame = asset as SpriteFrame;
        });

        // Small floating label
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

    static meteorPos() {
        return { ...METEOR_POS };
    }
}
