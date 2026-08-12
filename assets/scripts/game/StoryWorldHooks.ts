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
import { DoorPortalAnimator } from './DoorPortalAnimator';
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
const DOOR_PORTAL_UUID = '646bfc2e-e2a7-49b4-a483-28910cd64d3c@f9941';

/** East road toward town (yard → right-edge gate). Keep in sync with bake_farm_scene.TOWN_GATE. */
const FARM_TOWN_PORTAL = { x: 13 * 64, y: 4 * 64 + 36 };
/** Tap hit on the sign sprite (screen can see it before the player arrives). */
const PORTAL_TAP_RADIUS = 90;
/** Player must be this close before travel / POI act fires — farther taps walk over first. */
const INTERACT_USE_RANGE = 80;
/** Player must be this close before NPC dialogue fires — farther taps walk over first. */
const NPC_TALK_RANGE = 72;

/**
 * Story props + proximity / portal hooks for the mainline.
 *
 * **Walk-then-interact law:** every world tap that opens dialogue, shop, board,
 * info, or travel MUST go through `approachNpcThen` / `approachInteractThen`
 * (or a thin wrapper). Far taps walk first; never fire the act instantly.
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
    /** Bumps when a new approach walk starts so stale arrive callbacks no-op. */
    private _walkGen = 0;

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
            opts.quests.onChange(() => {
                if (this.world?.isValid) TownWorldLayout.syncTravelPortalFx(this.world);
            });
            return;
        }
        this.ensureTownPortal();
        this.syncTownPortalFx();
        opts.quests.onChange(() => this.syncTownPortalFx());
        // Drop any leftover meteor node from older builds / baked layout.
        const leftover = this.world?.getChildByName('meteor');
        if (leftover) leftover.destroy();
    }

    /**
     * Farm → town: hide sign + portal light until town is unlocked.
     * Call after unlock changes (quest claim / flag).
     */
    syncTownPortalFx() {
        if (!this.world?.isValid || this.isTown) return;
        const unlocked = canTravel('town');
        const sign = this.world.getChildByName('portal_town');
        if (sign) sign.active = unlocked;
        const fx = this.world.getChildByName('door_portal_town');
        if (fx) fx.active = unlocked;
    }

    update() {
        // Portal travel is tap-driven; nothing to poll each frame.
    }

    /**
     * Tap NPC: walk into talk range, then run `act`.
     * Far taps must not open dialogue instantly.
     */
    approachNpcThen(npc: Node, act: () => void): boolean {
        if (!npc?.isValid) return false;
        if (!this.player?.isValid) {
            act();
            return true;
        }
        const pp = this.player.position;
        const np = npc.position;
        if (Math.hypot(pp.x - np.x, pp.y - np.y) <= NPC_TALK_RANGE) {
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
        return this.walkToThen(stand.x, stand.y, np.x, np.y, NPC_TALK_RANGE, act, npc);
    }

    /**
     * Tap building / sign / prop / portal: walk to door/feet, then run `act`.
     * **Required choke point** for all non-NPC world interacts (every map).
     */
    approachInteractThen(target: Node, act: () => void): boolean {
        if (!target?.isValid) {
            act();
            return true;
        }
        if (!this.player?.isValid) {
            act();
            return true;
        }
        const stand = StoryWorldHooks.standForInteract(target);
        const pp = this.player.position;
        if (Math.hypot(pp.x - stand.x, pp.y - stand.y) <= INTERACT_USE_RANGE) {
            act();
            return true;
        }
        return this.walkToThen(
            stand.x,
            stand.y,
            stand.x,
            stand.y,
            INTERACT_USE_RANGE,
            act,
            target,
        );
    }

    /** @deprecated Use `approachInteractThen` — kept as alias for call-site clarity. */
    approachTownInteractThen(target: Node, act: () => void): boolean {
        return this.approachInteractThen(target, act);
    }

    /** Farm: tap town portal sign — walk up first, then travel. */
    tryFarmPortalTap(wx: number, wy: number): boolean {
        if (this.isTown || !this.world || !this.player?.isValid) return false;
        if (!canTravel('town')) return false;
        const sign = this.world.getChildByName('portal_town');
        if (!sign?.active) return false;
        const p = sign.position;
        const dx = wx - p.x;
        const dy = wy - p.y;
        if (dx * dx + dy * dy > PORTAL_TAP_RADIUS * PORTAL_TAP_RADIUS) return false;
        return this.approachInteractThen(sign, () => this.useTownPortal());
    }

    /** Town: tap farm road sign (caller must already have walked via approachInteractThen). */
    tryTownFarmSignTap(): boolean {
        if (!this.isTown) return false;
        this.useFarmPortal();
        return true;
    }

    /**
     * Town: enter mayor house — walk to the door first.
     * Prefer `approachInteractThen(hit.node, …)` when the tap already resolved a node.
     */
    approachMayorHouseThen(onArrive: () => void): boolean {
        if (!this.isTown || !this.world) {
            onArrive();
            return true;
        }
        const door =
            this.world.getChildByName('bld_mayor') ?? this.world.getChildByName('bld_mayor_yard');
        if (!door?.isValid) {
            onArrive();
            return true;
        }
        return this.approachInteractThen(door, onArrive);
    }

    /**
     * Door / board / portal stand feet.
     * Keep in sync with TutorialGuide town outdoor aims.
     */
    static standForInteract(target: Node): { x: number; y: number } {
        const p = target.position;
        if (target.name === 'portal_town' || target.name === 'door_portal_town') {
            return { x: p.x - 40, y: p.y };
        }
        // Map travel gates — approach from the plaza side.
        if (target.name === 'sign_mine' || target.name === 'door_portal_mine') {
            return { x: p.x - 40, y: p.y };
        }
        if (target.name === 'sign_farm' || target.name === 'door_portal_farm') {
            // South farm gate — stand north of the sign (toward plaza / saloon).
            return { x: p.x, y: p.y + 40 };
        }
        // Mine exit sign — approach from the cavern (north of the south lip).
        if (target.name === 'sign_town') {
            return { x: p.x, y: p.y + 48 };
        }
        // Indoor / mine south door — stand just inside (north of threshold) before leave.
        if (
            target.name === 'door_exit' ||
            target.name === 'exit_floor_glow' ||
            target.name === 'door_light_beam' ||
            target.name === 'door_portal_ring' ||
            target.name === 'door_portal_beam'
        ) {
            return { x: p.x, y: p.y + 36 };
        }
        // Outdoor buildings: stand south of the door (foot solid covers facade).
        // Door X offsets match bake_town_scene.place_enter_door_beams.
        const doorX: Record<string, number> = {
            bld_mayor: 22,
            bld_carpenter: 48,
            bld_police: -40,
        };
        if (
            target.name.startsWith('bld_') ||
            target.name.startsWith('cottage_') ||
            target.name.startsWith('home_') ||
            target.name.startsWith('shed') ||
            target.name === 'community' ||
            target.name === 'shop' ||
            target.name === 'fountain'
        ) {
            const dx = doorX[target.name] ?? 0;
            return { x: p.x + dx, y: p.y - 28 };
        }
        return { x: p.x, y: p.y + 20 };
    }

    portalHint(_px: number, _py: number): string {
        return '';
    }

    /**
     * Shared walk → act. Cancels click marker; bumps walk gen so stale arrives no-op.
     */
    private walkToThen(
        standX: number,
        standY: number,
        focusX: number,
        focusY: number,
        useRange: number,
        act: () => void,
        target: Node | null,
    ): boolean {
        this.farm?.cancelPending();
        const ctrl = this.player?.getComponent(PlayerController);
        if (!ctrl) {
            act();
            return true;
        }
        const gen = (this._walkGen += 1);
        const targetRef = target;
        this.node.getComponent(ClickMoveMarker)?.hide();
        ctrl.walkTo(
            standX,
            standY,
            () => {
                if (!this.isValid || gen !== this._walkGen) return;
                if (targetRef && !targetRef.isValid) return;
                act();
            },
            () => {
                /* stick drag / cancel — stay quiet */
            },
            18,
            null,
            { x: focusX, y: focusY, dist: useRange },
        );
        return true;
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
        this.ensureTownPortalFx();
        if (!node.getChildByName('PortalLabel')) {
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
        // Animate baked / runtime portal light (idempotent).
        TownWorldLayout.mountDoorFx(this.world);
        this.syncTownPortalFx();
    }

    /** Runtime fallback if bake missed door_portal_town. */
    private ensureTownPortalFx() {
        if (!this.world) return;
        let fx = this.world.getChildByName('door_portal_town');
        if (!fx) {
            fx = new Node('door_portal_town');
            fx.layer = this.world.layer;
            fx.setParent(this.world);
            const ui = fx.addComponent(UITransform);
            ui.setContentSize(80, 144);
            ui.setAnchorPoint(0.5, 0);
            const sp = fx.addComponent(Sprite);
            sp.sizeMode = Sprite.SizeMode.CUSTOM;
            assetManager.loadAny({ uuid: DOOR_PORTAL_UUID }, (err, asset) => {
                if (!err && asset && sp.isValid) sp.spriteFrame = asset as SpriteFrame;
            });
            DoorPortalAnimator.mountAll(this.world);
        }
        fx.setPosition(FARM_TOWN_PORTAL.x, FARM_TOWN_PORTAL.y - 4, 0);
    }

    /** Apply pending spawn after scene load. */
    static applyPendingSpawn(
        player: Node,
        map: Extract<
            StoryMapId,
            'farm' | 'town' | 'mine' | 'mayorHouse' | 'clinic' | 'community' | 'carpenterShop'
        >,
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
