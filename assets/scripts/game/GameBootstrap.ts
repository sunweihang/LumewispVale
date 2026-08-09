import {
    _decorator,
    Camera,
    Canvas,
    Color,
    Component,
    Graphics,
    Layers,
    Node,
    Sprite,
    UITransform,
    Vec3,
    Widget,
    view,
} from 'cc';
import { CameraFollow } from './CameraFollow';
import { FARMER_FRAMES } from './FarmerFrames';
import { FarmHUD } from './FarmHUD';
import { FarmSystem } from './FarmSystem';
import { FarmWorldLayout } from './FarmWorldLayout';
import { FirstQuest } from './FirstQuest';
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
import { TouchJoystick } from './TouchJoystick';
import { WorldYSort } from './WorldYSort';

const { ccclass } = _decorator;

/** Clear inside the 1080 portrait frame (under grass fill). */
const STAGE_CLEAR = new Color(58, 118, 52, 255);

@ccclass('GameBootstrap')
export class GameBootstrap extends Component {
    private _uiCam: Camera | null = null;
    private _letterboxCam: Camera | null = null;
    private _applyingFrame = false;

    onLoad() {
        applyDesignResolution();
        this._ensureCanvas();
        this._ensureLetterboxCam();
        this._applyPortraitFrame();
        view.on('canvas-resize', this._applyPortraitFrame, this);

        const canvas = this.node;
        const world = canvas.getChildByName('World');
        if (!world) {
            console.error('[GameBootstrap] World missing');
            return;
        }

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
            'ScreenFill',
        ]) {
            const n = canvas.getChildByName(name);
            if (n) n.destroy();
        }
        const oldPlayer = world.getChildByName('Player');
        if (oldPlayer) oldPlayer.destroy();
        const oldMarker = world.getChildByName('QuestMarker');
        if (oldMarker) oldMarker.destroy();
        for (const child of [...world.children]) {
            if (child.name === 'Crop' || child.name.startsWith('Crop')) child.destroy();
        }

        // Drop story quest leftover from earlier builds.
        const oldQuest = canvas.getComponent(FirstQuest);
        if (oldQuest) canvas.removeComponent(oldQuest);

        this.fixPropAnchors(world);
        // Match reference: map fills 1080 width; ground covers the portrait frame.
        const frame = this.fitWorldToDesign(canvas, world);

        if (!world.getComponent(WorldYSort)) {
            world.addComponent(WorldYSort);
        }

        const player = this.spawnPlayer(world);
        const stick = this.spawnTouchControls(canvas);

        FarmWorldLayout.apply(world, frame.localW, frame.localH, () => {
            player.getComponent(PlayerController)?.rebuildSolids();
        });
        this.pinRiverToBottom(world, frame.localH);
        FarmWorldLayout.placeBridge(world);

        let farm = canvas.getComponent(FarmSystem);
        if (!farm) farm = canvas.addComponent(FarmSystem);
        farm.player = player;
        farm.world = world;

        let hud = canvas.getComponent(FarmHUD);
        if (!hud) hud = canvas.addComponent(FarmHUD);
        hud.farm = farm;
        stick.onTap = (x, y) => hud!.handleTap(x, y);

        let follow = canvas.getComponent(CameraFollow);
        if (!follow) follow = canvas.addComponent(CameraFollow);
        follow.target = player;
        follow.world = world;
        follow.snap();
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
        const stretch = this.node.getComponent(Widget);
        if (stretch) {
            stretch.enabled = false;
            stretch.destroy();
        }

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
    private fitWorldToDesign(canvas: Node, world: Node): { localW: number; localH: number } {
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
            grass.push(child);
            const p = child.position;
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
        this.expandGrassTiles(world, grass, TILE, localW, localH);

        world.setScale(s, s, 1);
        world.setPosition(0, 0, 0);

        this.spawnScreenFill(canvas, world);
        world.setSiblingIndex(1);
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

    private _paintFill(g: Graphics, w: number, h: number) {
        g.clear();
        // Flat meadow under tiles — no stripe “empty zone” look.
        g.fillColor = new Color(58, 118, 52, 255);
        g.rect(-w * 0.5, -h * 0.5, w, h);
        g.fill();
    }

    private fixPropAnchors(world: Node) {
        for (const child of world.children) {
            if (
                child.name.startsWith('tile-') ||
                child.name.startsWith('water_') ||
                child.name.startsWith('cliff_')
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

    private spawnPlayer(world: Node): Node {
        const player = new Node('Player');
        player.layer = world.layer;
        player.setParent(world);
        player.setPosition(
            new Vec3(FarmWorldLayout.PLAYER_SPAWN.x, FarmWorldLayout.PLAYER_SPAWN.y, 0),
        );

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
        anim.loadCatalog(FARMER_FRAMES);

        return player;
    }
}
