import { _decorator, assetManager, Component, Sprite, SpriteFrame } from 'cc';
import { InputBridge } from './InputBridge';

const { ccclass, property } = _decorator;

export type AnimDir = 'down' | 'left' | 'right' | 'up';
export type ActionAnim = 'hoe' | 'chop' | 'pick';

type Catalog = {
    farmer: Record<AnimDir, string[]>;
    actions?: Partial<Record<ActionAnim, Record<AnimDir, string[]>>>;
};

@ccclass('PlayerAnimator')
export class PlayerAnimator extends Component {
    @property
    fps = 10;

    @property
    actionFps = 8;

    private _sprite: Sprite | null = null;
    private _walk: Record<AnimDir, SpriteFrame[]> = {
        down: [],
        left: [],
        right: [],
        up: [],
    };
    private _actions: Record<ActionAnim, Record<AnimDir, SpriteFrame[]>> = {
        hoe: { down: [], left: [], right: [], up: [] },
        chop: { down: [], left: [], right: [], up: [] },
        pick: { down: [], left: [], right: [], up: [] },
    };
    private _dir: AnimDir = 'down';
    private _time = 0;
    private _frame = 0;
    private _ready = false;
    /** Pending facing change — only commit after hold, avoids diagonal flicker. */
    private _pendingDir: AnimDir | null = null;
    private _pendingDirTime = 0;

    private _action: ActionAnim | null = null;
    private _actionDone: (() => void) | null = null;

    onLoad() {
        this._sprite = this.getComponent(Sprite);
    }

    get busy(): boolean {
        return this._action !== null;
    }

    /** Load walk + action frames. `catalog` from tools/ui/farmer-frames.json */
    loadCatalog(catalog: Catalog) {
        const dirs: AnimDir[] = ['down', 'left', 'right', 'up'];
        let pending = 0;
        let done = 0;
        const finish = () => {
            done++;
            if (done >= pending) {
                this._ready = true;
                this.applyWalkFrame(true);
            }
        };

        dirs.forEach((d) => {
            const list = catalog.farmer[d] || [];
            this._walk[d] = new Array(list.length);
            list.forEach((uuid, i) => {
                pending++;
                assetManager.loadAny({ uuid }, (err, asset) => {
                    if (!err && asset) this._walk[d][i] = asset as SpriteFrame;
                    finish();
                });
            });
        });

        const acts: ActionAnim[] = ['hoe', 'chop', 'pick'];
        acts.forEach((act) => {
            const block = catalog.actions?.[act];
            if (!block) return;
            dirs.forEach((d) => {
                const list = block[d] || [];
                this._actions[act][d] = new Array(list.length);
                list.forEach((uuid, i) => {
                    pending++;
                    assetManager.loadAny({ uuid }, (err, asset) => {
                        if (!err && asset) this._actions[act][d][i] = asset as SpriteFrame;
                        finish();
                    });
                });
            });
        });

        if (pending === 0) this._ready = false;
    }

    /**
     * Face a world point (sets InputBridge facing + animator dir).
     */
    faceToward(wx: number, wy: number) {
        const p = this.node.position;
        const dx = wx - p.x;
        const dy = wy - p.y;
        if (dx * dx + dy * dy < 1) return;
        if (Math.abs(dx) >= Math.abs(dy)) {
            this._dir = dx >= 0 ? 'right' : 'left';
            InputBridge.facingX = dx >= 0 ? 1 : -1;
            InputBridge.facingY = 0;
        } else {
            this._dir = dy >= 0 ? 'up' : 'down';
            InputBridge.facingX = 0;
            InputBridge.facingY = dy >= 0 ? 1 : -1;
        }
    }

    /**
     * Play a one-shot action clip. Ignores walk input until finished.
     * Calls `onDone` once (even if frames missing — falls back to short delay).
     */
    playAction(action: ActionAnim, onDone?: () => void) {
        if (!this._ready) {
            onDone?.();
            return;
        }
        // Replace any in-flight action without firing its callback (job was cancelled).
        this._action = action;
        this._actionDone = onDone ?? null;
        this._frame = 0;
        this._time = 0;
        this.applyActionFrame(true);
        const frames = this._actions[action][this._dir];
        if (!frames?.length || !frames[0]) {
            // No art yet — still wait a beat so gameplay feels intentional.
            this.scheduleOnce(() => this.finishAction(), 0.35);
        }
    }

    cancelAction() {
        this._action = null;
        this._actionDone = null;
        this._frame = 0;
        this._time = 0;
        this.unscheduleAllCallbacks();
        this.applyWalkFrame(true);
    }

    update(dt: number) {
        if (!this._ready || !this._sprite) return;

        if (this._action) {
            this._time += dt;
            const step = 1 / Math.max(1, this.actionFps);
            const frames = this._actions[this._action][this._dir];
            const n = frames?.length || 0;
            if (n <= 0) return;
            if (this._time >= step) {
                this._time -= step;
                this._frame += 1;
                if (this._frame >= n) {
                    this.finishAction();
                    return;
                }
                this.applyActionFrame(false);
            }
            return;
        }

        const move = InputBridge.move;
        const moving = move.lengthSqr() > 0.01;
        if (moving) {
            this.updateFacing(move.x, move.y, dt);
            this._time += dt;
            const step = 1 / Math.max(1, this.fps);
            if (this._time >= step) {
                this._time -= step;
                const n = this._walk[this._dir].length || 1;
                this._frame = (this._frame + 1) % n;
                this.applyWalkFrame(false);
            }
        } else {
            this._frame = 0;
            this._time = 0;
            this._pendingDir = null;
            this._pendingDirTime = 0;
            this.applyWalkFrame(false);
        }
    }

    /**
     * Cardinal facing with hysteresis: need a clearly dominant axis and a short
     * hold before switching, so diagonal / path corners don't flip every frame.
     */
    private updateFacing(mx: number, my: number, dt: number) {
        const ax = Math.abs(mx);
        const ay = Math.abs(my);
        // Stay on current axis unless the other is clearly stronger.
        const bias = 1.35;
        let next: AnimDir;
        if (this._dir === 'left' || this._dir === 'right') {
            next = ay > ax * bias ? (my >= 0 ? 'up' : 'down') : mx >= 0 ? 'right' : 'left';
        } else {
            next = ax > ay * bias ? (mx >= 0 ? 'right' : 'left') : my >= 0 ? 'up' : 'down';
        }
        if (next === this._dir) {
            this._pendingDir = null;
            this._pendingDirTime = 0;
            return;
        }
        if (this._pendingDir !== next) {
            this._pendingDir = next;
            this._pendingDirTime = 0;
        }
        this._pendingDirTime += dt;
        if (this._pendingDirTime >= 0.09) {
            this._dir = next;
            this._pendingDir = null;
            this._pendingDirTime = 0;
            this._frame = 0;
        }
    }

    private finishAction() {
        const cb = this._actionDone;
        this._action = null;
        this._actionDone = null;
        this._frame = 0;
        this._time = 0;
        // Callback may chain another action (continuous chop) — skip walk flash.
        cb?.();
        if (!this._action) this.applyWalkFrame(true);
    }

    private applyWalkFrame(force: boolean) {
        if (!this._sprite) return;
        const frames = this._walk[this._dir];
        if (!frames?.length) return;
        const sf = frames[this._frame] || frames[0];
        if (sf && (force || this._sprite.spriteFrame !== sf)) {
            this._sprite.spriteFrame = sf;
        }
    }

    private applyActionFrame(force: boolean) {
        if (!this._sprite || !this._action) return;
        const frames = this._actions[this._action][this._dir];
        if (!frames?.length) return;
        const sf = frames[this._frame] || frames[0];
        if (sf && (force || this._sprite.spriteFrame !== sf)) {
            this._sprite.spriteFrame = sf;
        }
    }
}
