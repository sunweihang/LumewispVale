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
import { ClickMoveMarker } from './ClickMoveMarker';
import { FarmInfoBoard } from './FarmInfoBoard';
import { FarmSystem } from './FarmSystem';
import { GameState, StoryMapId } from './GameState';
import { canTravel, travelTo } from './MapTravel';
import { PlayerController } from './PlayerController';
import { QuestSystem } from './QuestSystem';
import { StoryDialogue } from './StoryDialogue';
import { TownWorldLayout } from './TownWorldLayout';

const { ccclass } = _decorator;

const SIGN_FRAME_UUID = '6bf7ecb9-7750-4efd-9f82-84534ceaef25@f9941';

/** East road toward town (yard → right-edge gate). Keep in sync with bake_farm_scene.TOWN_GATE. */
const FARM_TOWN_PORTAL = { x: 13 * 64, y: 4 * 64 + 36 };
/** Tap hit on the sign sprite (screen can see it before the player arrives). */
const PORTAL_TAP_RADIUS = 90;
/** Player must be this close before travel fires — farther taps walk over first. */
const PORTAL_USE_RANGE = 72;
/** Player must be this close before NPC dialogue fires — farther taps walk over first. */
const NPC_TALK_RANGE = 72;
/** Town: stand at mayor door feet before entering MayorHouse.scene. */
const MAYOR_DOOR_USE_RANGE = 80;

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
    /** Bumps when a new portal walk starts so stale arrive callbacks no-op. */
    private _portalWalkGen = 0;
    /** Bumps when a new NPC approach walk starts so stale arrive callbacks no-op. */
    private _npcWalkGen = 0;

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

    /**
     * Tap NPC: if already in talk range, run `act` now; otherwise walk beside
     * them (south / free stand) and run `act` on arrive. Far taps must not
     * open dialogue instantly.
     */
    approachNpcThen(npc: Node, act: () => void): boolean {
        if (!npc?.isValid) return false;
        if (!this.player?.isValid) {
            act();
            return true;
        }
        const pp = this.player.position;
        const np = npc.position;
        const dist = Math.hypot(pp.x - np.x, pp.y - np.y);
        if (dist <= NPC_TALK_RANGE) {
            act();
            return true;
        }

        this.farm?.cancelPending();
        const ctrl = this.player.getComponent(PlayerController);
        if (!ctrl) {
            act();
            return true;
        }

        ctrl.rebuildSolids();
        // Prefer standing in front of the NPC (south of feet).
        const prefer = { x: np.x, y: np.y - 36 };
        const stand = ctrl.freeStandNear(prefer.x, prefer.y, pp.x, pp.y, 48);
        const gen = (this._npcWalkGen += 1);
        const npcRef = npc;
        this.node.getComponent(ClickMoveMarker)?.hide();
        ctrl.walkTo(
            stand.x,
            stand.y,
            () => {
                if (!this.isValid || gen !== this._npcWalkGen) return;
                if (!npcRef.isValid) return;
                act();
            },
            () => {
                /* stick drag / cancel — stay quiet */
            },
            16,
            null,
            { x: np.x, y: np.y, dist: NPC_TALK_RANGE },
        );
        return true;
    }

    /** Farm: tap town portal sign — walk up first, then travel. */
    tryFarmPortalTap(wx: number, wy: number): boolean {
        if (this.isTown || !this.world || !this.player?.isValid) return false;
        const sign = this.world.getChildByName('portal_town');
        if (!sign) return false;
        const p = sign.position;
        const dx = wx - p.x;
        const dy = wy - p.y;
        if (dx * dx + dy * dy > PORTAL_TAP_RADIUS * PORTAL_TAP_RADIUS) return false;

        const pp = this.player.position;
        const dist = Math.hypot(pp.x - p.x, pp.y - p.y);
        if (dist <= PORTAL_USE_RANGE) {
            this.useTownPortal();
            return true;
        }

        // Too far to enter — walk beside the sign, then travel on arrive.
        this.farm?.cancelPending();
        const ctrl = this.player.getComponent(PlayerController);
        if (!ctrl) {
            this.useTownPortal();
            return true;
        }
        const standX = p.x - 40;
        const standY = p.y;
        const gen = (this._portalWalkGen += 1);
        this.node.getComponent(ClickMoveMarker)?.hide();
        ctrl.walkTo(
            standX,
            standY,
            () => {
                if (!this.isValid || gen !== this._portalWalkGen) return;
                this.useTownPortal();
            },
            () => {
                /* stick drag / cancel — stay on farm */
            },
            18,
            null,
            { x: p.x, y: p.y, dist: PORTAL_USE_RANGE },
        );
        return true;
    }

    /** Town: tap farm road sign. */
    tryTownFarmSignTap(): boolean {
        if (!this.isTown) return false;
        this.useFarmPortal();
        return true;
    }

    /**
     * Town: enter mayor house — walk to the door first (same as farm portal),
     * never instant-travel from across the square.
     */
    approachMayorHouseThen(onArrive: () => void): boolean {
        if (!this.isTown || !this.world || !this.player?.isValid) {
            onArrive();
            return true;
        }
        const door =
            this.world.getChildByName('bld_mayor') ?? this.world.getChildByName('bld_mayor_yard');
        if (!door?.isValid) {
            onArrive();
            return true;
        }
        // Door feet — keep in sync with TutorialGuide.resolveMayorGuide.
        const standX = door.position.x;
        const standY = door.position.y + 20;
        const pp = this.player.position;
        if (Math.hypot(pp.x - standX, pp.y - standY) <= MAYOR_DOOR_USE_RANGE) {
            onArrive();
            return true;
        }

        this.farm?.cancelPending();
        const ctrl = this.player.getComponent(PlayerController);
        if (!ctrl) {
            onArrive();
            return true;
        }
        const gen = (this._portalWalkGen += 1);
        // Same as farm portal / NPC approach: walk to the door without
        // click-to-move arrow + ripple (those are only for empty-ground taps).
        this.node.getComponent(ClickMoveMarker)?.hide();
        ctrl.walkTo(
            standX,
            standY,
            () => {
                if (!this.isValid || gen !== this._portalWalkGen) return;
                onArrive();
            },
            () => {
                /* stick drag / cancel — stay in town */
            },
            18,
            null,
            { x: standX, y: standY, dist: MAYOR_DOOR_USE_RANGE },
        );
        return true;
    }

    portalHint(_px: number, _py: number): string {
        return '';
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
        if (!canTravel('town')) return;
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
    static applyPendingSpawn(
        player: Node,
        map: Extract<StoryMapId, 'farm' | 'town' | 'mine' | 'mayorHouse'>,
    ) {
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
