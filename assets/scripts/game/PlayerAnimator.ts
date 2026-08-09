import { _decorator, assetManager, Component, Sprite, SpriteFrame } from 'cc';
import { InputBridge } from './InputBridge';

const { ccclass, property } = _decorator;

type Dir = 'down' | 'left' | 'right' | 'up';

@ccclass('PlayerAnimator')
export class PlayerAnimator extends Component {
    @property
    fps = 10;

    private _sprite: Sprite | null = null;
    private _frames: Record<Dir, SpriteFrame[]> = {
        down: [],
        left: [],
        right: [],
        up: [],
    };
    private _dir: Dir = 'down';
    private _time = 0;
    private _frame = 0;
    private _ready = false;

    onLoad() {
        this._sprite = this.getComponent(Sprite);
    }

    /** Load sliced walk frames. `catalog` from tools/ui/farmer-frames.json */
    loadCatalog(catalog: { farmer: Record<Dir, string[]> }) {
        const dirs: Dir[] = ['down', 'left', 'right', 'up'];
        let pending = 0;
        let done = 0;
        dirs.forEach((d) => {
            const list = catalog.farmer[d] || [];
            this._frames[d] = new Array(list.length);
            list.forEach((uuid, i) => {
                pending++;
                assetManager.loadAny({ uuid }, (err, asset) => {
                    done++;
                    if (!err && asset) {
                        this._frames[d][i] = asset as SpriteFrame;
                    }
                    if (done >= pending) {
                        this._ready = true;
                        this.applyFrame(true);
                    }
                });
            });
        });
        if (pending === 0) this._ready = false;
    }

    update(dt: number) {
        if (!this._ready || !this._sprite) return;
        const move = InputBridge.move;
        const moving = move.lengthSqr() > 0.01;
        if (moving) {
            if (Math.abs(move.x) > Math.abs(move.y)) {
                this._dir = move.x >= 0 ? 'right' : 'left';
            } else {
                this._dir = move.y >= 0 ? 'up' : 'down';
            }
            this._time += dt;
            const step = 1 / Math.max(1, this.fps);
            if (this._time >= step) {
                this._time -= step;
                const n = this._frames[this._dir].length || 1;
                this._frame = (this._frame + 1) % n;
                this.applyFrame(false);
            }
        } else {
            this._frame = 0;
            this._time = 0;
            this.applyFrame(false);
        }
    }

    private applyFrame(force: boolean) {
        if (!this._sprite) return;
        const frames = this._frames[this._dir];
        if (!frames || !frames.length) return;
        const sf = frames[this._frame] || frames[0];
        if (sf && (force || this._sprite.spriteFrame !== sf)) {
            this._sprite.spriteFrame = sf;
        }
    }
}
