import {
    _decorator,
    assetManager,
    Color,
    Component,
    Graphics,
    Node,
    Sprite,
    SpriteFrame,
    Tween,
    UIOpacity,
    UITransform,
    Vec3,
    tween,
} from 'cc';
import { FISHING_FRAMES } from './FishingFrames';
import { InputBridge } from './InputBridge';
import { PlayerController } from './PlayerController';
import { QUEST_FRAMES } from './QuestFrames';

const { ccclass } = _decorator;

type FarmCancel = { cancelPending: () => void };

/** Arrow tip (bottom anchor) above the ripple center — matches TutorialGuide place aims. */
const ARROW_TIP_Y = 16;
const ARROW_BOB = 14;

/**
 * Click-to-move walk helper. Arrow + ripple chrome is NOT for player taps —
 * TutorialGuide owns those place-aim cues. `show` stays for rare guided walks.
 */
@ccclass('ClickMoveMarker')
export class ClickMoveMarker extends Component {
    private _root: Node | null = null;
    private _ripple: Node | null = null;
    private _rippleOp: UIOpacity | null = null;
    private _arrow: Node | null = null;
    private _arrowFallback: Graphics | null = null;
    private _world: Node | null = null;
    private _wx = 0;
    private _wy = 0;
    private _active = false;
    private _ripplePulsing = false;
    private _arrowBobbing = false;
    private _walkGen = 0;

    static mount(canvas: Node): ClickMoveMarker {
        let m = canvas.getComponent(ClickMoveMarker);
        if (!m) m = canvas.addComponent(ClickMoveMarker);
        m.ensureRoot();
        return m;
    }

    /** True while the destination ripple / arrow is visible. */
    get isActive(): boolean {
        return this._active;
    }

    /** Cancel auto-walk chrome (stick drag / modal). */
    cancel() {
        this._walkGen += 1;
        this.hide();
    }

    /**
     * Pathfind to a world point. No destination arrow/ripple — player taps
     * only walk; place-aim chrome is TutorialGuide's job.
     * Returns false when the tap was ignored (locked / already there / no path).
     */
    go(player: Node | null, world: Node | null, farm: FarmCancel | null, wx: number, wy: number): boolean {
        if (!player?.isValid || !world?.isValid) return false;
        if (InputBridge.uiBlocking || InputBridge.moveLocked) return false;
        const ctrl = player.getComponent(PlayerController);
        if (!ctrl || ctrl.locked) return false;

        farm?.cancelPending();
        // Drop any leftover guided chrome so a tap never leaves a stale ring.
        this.hide();
        const gen = (this._walkGen += 1);
        ctrl.walkTo(
            wx,
            wy,
            () => {
                if (gen !== this._walkGen) return;
                this.hide();
            },
            () => {
                if (gen !== this._walkGen) return;
                this.hide();
            },
        );
        return ctrl.isAutoWalking;
    }

    show(world: Node, wx: number, wy: number) {
        this.ensureRoot();
        const root = this._root;
        if (!root?.isValid) return;
        this._world = world;
        this._wx = wx;
        this._wy = wy;
        this._active = true;
        root.active = true;
        this.syncCanvasPos();
        this.pulseRipple();
        this.bobArrow();
    }

    hide() {
        this._active = false;
        this._world = null;
        this._ripplePulsing = false;
        this._arrowBobbing = false;
        const root = this._root;
        if (!root?.isValid) return;
        if (this._rippleOp) Tween.stopAllByTarget(this._rippleOp);
        if (this._ripple) {
            Tween.stopAllByTarget(this._ripple);
            this._ripple.setScale(1, 1, 1);
        }
        if (this._arrow) {
            Tween.stopAllByTarget(this._arrow);
            this._arrow.setPosition(0, ARROW_TIP_Y, 0);
        }
        if (this._rippleOp) this._rippleOp.opacity = 0;
        root.active = false;
    }

    lateUpdate() {
        if (!this._active) return;
        this.syncCanvasPos();
        // Stay above World, below full-screen modals / guide.
        const root = this._root;
        const world = this.node.getChildByName('World');
        if (root?.isValid && world?.isValid) {
            const want = Math.min(world.getSiblingIndex() + 1, this.node.children.length - 1);
            if (root.getSiblingIndex() !== want) root.setSiblingIndex(want);
        }
    }

    private ensureRoot() {
        if (this._root?.isValid) return;
        const root = new Node('ClickMoveMarker');
        root.layer = this.node.layer;
        root.setParent(this.node);
        root.active = false;
        root.addComponent(UITransform).setContentSize(160, 160);

        const ripple = new Node('Ripple');
        ripple.layer = this.node.layer;
        ripple.setParent(root);
        const rUi = ripple.addComponent(UITransform);
        rUi.setContentSize(140, 140);
        rUi.setAnchorPoint(0.5, 0.5);
        const rSp = ripple.addComponent(Sprite);
        rSp.sizeMode = Sprite.SizeMode.CUSTOM;
        rSp.trim = false;
        const rOp = ripple.addComponent(UIOpacity);
        rOp.opacity = 0;
        this.loadFrame(rSp, FISHING_FRAMES.groundRipple, () => this.paintRippleFallback(ripple));

        const arrow = new Node('Arrow');
        arrow.layer = this.node.layer;
        arrow.setParent(root);
        arrow.setPosition(0, ARROW_TIP_Y, 0);
        const aUi = arrow.addComponent(UITransform);
        aUi.setContentSize(72, 88);
        aUi.setAnchorPoint(0.5, 0);
        const aSp = arrow.addComponent(Sprite);
        aSp.sizeMode = Sprite.SizeMode.CUSTOM;
        aSp.trim = false;
        const fallback = arrow.addComponent(Graphics);
        this._arrowFallback = fallback;
        this.paintArrowFallback(fallback);
        this.loadFrame(aSp, QUEST_FRAMES.questArrow, () => {
            /* keep Graphics until sprite lands */
        }, () => {
            if (fallback?.isValid) {
                fallback.clear();
                fallback.enabled = false;
            }
        });

        this._root = root;
        this._ripple = ripple;
        this._rippleOp = rOp;
        this._arrow = arrow;
    }

    private loadFrame(
        sp: Sprite,
        uuid: string,
        onMissing?: () => void,
        onOk?: () => void,
    ) {
        if (!uuid) {
            onMissing?.();
            return;
        }
        assetManager.loadAny({ uuid }, (err, asset) => {
            if (err || !asset || !sp.isValid) {
                onMissing?.();
                return;
            }
            sp.spriteFrame = asset as SpriteFrame;
            onOk?.();
        });
    }

    private syncCanvasPos() {
        const root = this._root;
        const world = this._world;
        if (!root?.isValid || !world?.isValid) return;
        const s = Math.max(0.0001, world.scale.x);
        root.setPosition(world.position.x + this._wx * s, world.position.y + this._wy * s, 0);
    }

    private pulseRipple() {
        const n = this._ripple;
        const op = this._rippleOp;
        if (!n?.isValid || !op?.isValid) return;
        Tween.stopAllByTarget(n);
        Tween.stopAllByTarget(op);
        this._ripplePulsing = true;
        n.setScale(0.7, 0.7, 1);
        op.opacity = 230;
        tween(n)
            .repeatForever(
                tween(n)
                    .to(0.85, { scale: new Vec3(1.35, 1.35, 1) }, { easing: 'sineOut' })
                    .set({ scale: new Vec3(0.7, 0.7, 1) }),
            )
            .start();
        tween(op)
            .repeatForever(
                tween(op)
                    .to(0.85, { opacity: 70 }, { easing: 'sineOut' })
                    .set({ opacity: 230 }),
            )
            .start();
    }

    private bobArrow() {
        const n = this._arrow;
        if (!n?.isValid) return;
        Tween.stopAllByTarget(n);
        this._arrowBobbing = true;
        n.setPosition(0, ARROW_TIP_Y, 0);
        tween(n)
            .repeatForever(
                tween(n)
                    .to(0.35, { position: new Vec3(0, ARROW_TIP_Y + ARROW_BOB, 0) }, { easing: 'sineInOut' })
                    .to(0.35, { position: new Vec3(0, ARROW_TIP_Y, 0) }, { easing: 'sineInOut' }),
            )
            .start();
    }

    private paintRippleFallback(host: Node) {
        let g = host.getComponent(Graphics);
        if (!g) g = host.addComponent(Graphics);
        g.clear();
        const rings = [
            { r: 48, a: 60 },
            { r: 34, a: 110 },
            { r: 20, a: 160 },
            { r: 8, a: 200 },
        ];
        for (let i = 0; i < rings.length; i++) {
            const ring = rings[i]!;
            g.strokeColor = new Color(255, 236, 170, ring.a);
            g.lineWidth = 3;
            g.circle(0, 0, ring.r);
            g.stroke();
        }
    }

    private paintArrowFallback(g: Graphics) {
        g.clear();
        const gold = new Color(255, 220, 90, 255);
        const edge = new Color(70, 42, 16, 255);
        // Tip down (anchor at bottom of shaft).
        g.fillColor = edge;
        g.moveTo(0, 0);
        g.lineTo(-28, 36);
        g.lineTo(-12, 36);
        g.lineTo(-12, 72);
        g.lineTo(12, 72);
        g.lineTo(12, 36);
        g.lineTo(28, 36);
        g.close();
        g.fill();
        g.fillColor = gold;
        g.moveTo(0, 6);
        g.lineTo(-20, 32);
        g.lineTo(-7, 32);
        g.lineTo(-7, 66);
        g.lineTo(7, 66);
        g.lineTo(7, 32);
        g.lineTo(20, 32);
        g.close();
        g.fill();
    }
}
