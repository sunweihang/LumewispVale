import { _decorator, assetManager, Component, Node, Sprite, SpriteFrame, UITransform } from 'cc';
import { DOOR_PORTAL_FRAMES } from './DoorPortalFrames';

const { ccclass, property } = _decorator;

/**
 * Loops doorway portal VFX frames (ground ring + upright light).
 * Attach on baked `door_portal_*` / `door_portal_beam` sprites.
 */
@ccclass('DoorPortalAnimator')
export class DoorPortalAnimator extends Component {
    @property
    fps = DOOR_PORTAL_FRAMES.fps;

    private _sprite: Sprite | null = null;
    private _frames: SpriteFrame[] = [];
    private _ready = false;
    private _time = 0;
    private _index = 0;

    /** Attach + play on every portal sprite under `world` (idempotent). */
    static mountAll(world: Node): void {
        for (const child of world.children) {
            const n = child.name;
            if (n.includes('ring')) continue;
            if (!n.startsWith('door_portal_') && n !== 'door_portal_beam' && !n.startsWith('door_light_')) {
                continue;
            }
            let anim = child.getComponent(DoorPortalAnimator);
            if (!anim) anim = child.addComponent(DoorPortalAnimator);
            anim.play();
        }
    }

    onLoad() {
        this._sprite = this.getComponent(Sprite);
        this.loadFrames();
    }

    /** Idempotent — safe to call again from mountDoorFx. */
    play() {
        if (!this._sprite) this._sprite = this.getComponent(Sprite);
        if (!this._ready) this.loadFrames();
        this.enabled = true;
    }

    private loadFrames() {
        const list = DOOR_PORTAL_FRAMES.frames;
        if (!list.length) return;
        this._frames = new Array(list.length);
        let pending = list.length;
        const finish = () => {
            pending--;
            if (pending > 0) return;
            this._ready = this._frames.some((f) => !!f);
            if (this._ready) this.apply(0, true);
        };
        list.forEach((uuid, i) => {
            assetManager.loadAny({ uuid }, (err, asset) => {
                if (!err && asset) this._frames[i] = asset as SpriteFrame;
                finish();
            });
        });
    }

    update(dt: number) {
        if (!this._ready || !this._sprite || this._frames.length < 2) return;
        const fps = Math.max(1, this.fps);
        this._time += dt;
        const step = 1 / fps;
        if (this._time < step) return;
        const advance = Math.floor(this._time / step);
        this._time -= advance * step;
        this.apply((this._index + advance) % this._frames.length, false);
    }

    private apply(index: number, force: boolean) {
        if (!this._sprite) return;
        const frame = this._frames[index];
        if (!frame) return;
        if (!force && index === this._index && this._sprite.spriteFrame === frame) return;
        this._index = index;
        this._sprite.spriteFrame = frame;
        this._sprite.sizeMode = Sprite.SizeMode.CUSTOM;
        this._sprite.trim = false;
        const ui = this.node.getComponent(UITransform);
        if (ui) {
            const [w, h] = DOOR_PORTAL_FRAMES.cellSize;
            if (ui.contentSize.width !== w || ui.contentSize.height !== h) {
                ui.setContentSize(w, h);
            }
        }
    }
}
