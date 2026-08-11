import { _decorator, assetManager, Component, Sprite, SpriteFrame, Vec3 } from 'cc';

const { ccclass, property } = _decorator;

export type NpcDir = 'down' | 'left' | 'right' | 'up';

type WalkCatalog = Record<NpcDir, readonly string[]>;
type Waypoint = { x: number; y: number };

/**
 * Idle / walk frame player for NPCs, with optional yard patrol.
 */
@ccclass('NpcAnimator')
export class NpcAnimator extends Component {
    @property
    fps = 8;

    /** World units per second while patrolling. */
    @property
    patrolSpeed = 80;

    private _sprite: Sprite | null = null;
    private _walk: Record<NpcDir, SpriteFrame[]> = {
        down: [],
        left: [],
        right: [],
        up: [],
    };
    private _dir: NpcDir = 'down';
    private _time = 0;
    private _frame = 0;
    private _ready = false;
    private _moving = false;

    private _patrol: Waypoint[] = [];
    private _patrolOn = false;
    private _patrolIdx = 0;
    private _patrolIdle = 0;
    private _patrolPauseUntil = 0;
    /** Hard stop (dialogue) — ignores timed pause expiry until released. */
    private _patrolHeld = false;
    private readonly _pos = new Vec3();

    get isReady() {
        return this._ready;
    }

    get dir(): NpcDir {
        return this._dir;
    }

    onLoad() {
        this._sprite = this.getComponent(Sprite);
    }

    /** Load 4-dir walk frames from `NPC_FRAMES.<id>`. */
    loadWalk(catalog: WalkCatalog) {
        const dirs: NpcDir[] = ['down', 'left', 'right', 'up'];
        let pending = 0;
        let done = 0;
        const finish = () => {
            done++;
            if (done >= pending) {
                this._ready = true;
                this.applyFrame(true);
            }
        };
        dirs.forEach((d) => {
            const list = catalog[d] || [];
            this._walk[d] = new Array(list.length);
            list.forEach((uuid, i) => {
                pending++;
                assetManager.loadAny({ uuid }, (err, asset) => {
                    if (!err && asset) this._walk[d][i] = asset as SpriteFrame;
                    finish();
                });
            });
        });
        if (pending === 0) this._ready = false;
    }

    setDir(dir: NpcDir) {
        if (this._dir === dir) return;
        this._dir = dir;
        this._frame = 0;
        this._time = 0;
        this.applyFrame(true);
    }

    /** Face a world point (cardinal). */
    faceToward(wx: number, wy: number) {
        const p = this.node.position;
        const dx = wx - p.x;
        const dy = wy - p.y;
        if (dx * dx + dy * dy < 1) return;
        if (Math.abs(dx) >= Math.abs(dy)) {
            this.setDir(dx >= 0 ? 'right' : 'left');
        } else {
            this.setDir(dy >= 0 ? 'up' : 'down');
        }
    }

    /** Optional: drive a short walk cycle (e.g. plaza stroll). */
    setMoving(moving: boolean) {
        this._moving = moving;
        if (!moving) {
            this._frame = 0;
            this._time = 0;
            this.applyFrame(true);
        }
    }

    /**
     * Loop through world feet waypoints with short idle pauses.
     * Starts after a brief delay so spawn / dialogue can settle.
     */
    setPatrol(points: readonly Waypoint[], opts?: { speed?: number; idleMin?: number; idleMax?: number }) {
        this._patrol = points.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
        this._patrolOn = this._patrol.length >= 2;
        this._patrolIdx = 0;
        this._patrolIdle = 0.35;
        this._patrolPauseUntil = 0;
        this._patrolHeld = false;
        if (opts?.speed != null) this.patrolSpeed = opts.speed;
        this._idleMin = opts?.idleMin ?? 0.6;
        this._idleMax = opts?.idleMax ?? 1.6;
        this._moving = false;
        this.enabled = true;
        // Scheduler tick — same path UI buttons use; doesn't rely only on update().
        this.unschedule(this._schedPatrol);
        if (this._patrolOn) {
            this.schedule(this._schedPatrol, 0);
        }
    }

    private _schedPatrol = (dt: number) => {
        this.tickPatrol(dt);
    };

    /** Hold still while chatting / facing the player. */
    pausePatrol(sec: number) {
        const until = Date.now() / 1000 + Math.max(0, sec);
        if (until > this._patrolPauseUntil) this._patrolPauseUntil = until;
        this.setMoving(false);
    }

    /** Freeze patrol until `releasePatrol` (full dialogue, not a timed pause). */
    holdPatrol() {
        this._patrolHeld = true;
        this.setMoving(false);
    }

    releasePatrol() {
        this._patrolHeld = false;
    }

    private _idleMin = 0.6;
    private _idleMax = 1.6;

    update(dt: number) {
        // Patrol is scheduled; update only advances walk frames.
        if (!this._ready || !this._sprite || !this._moving) return;
        this._time += dt;
        const step = 1 / Math.max(1, this.fps);
        if (this._time >= step) {
            this._time -= step;
            const n = this._walk[this._dir].length || 1;
            this._frame = (this._frame + 1) % n;
            this.applyFrame(false);
        }
    }

    private tickPatrol(dt: number) {
        if (!this._patrolOn || this._patrol.length < 2) return;
        if (this._patrolHeld) {
            this.setMoving(false);
            return;
        }
        if (Date.now() / 1000 < this._patrolPauseUntil) {
            this.setMoving(false);
            return;
        }
        if (this._patrolIdle > 0) {
            this._patrolIdle -= dt;
            this.setMoving(false);
            return;
        }

        const target = this._patrol[this._patrolIdx]!;
        const p = this.node.position;
        const dx = target.x - p.x;
        const dy = target.y - p.y;
        const dist = Math.hypot(dx, dy);
        if (dist < 6) {
            this.node.setPosition(target.x, target.y, p.z);
            this.setMoving(false);
            this._patrolIdx = (this._patrolIdx + 1) % this._patrol.length;
            this._patrolIdle =
                this._idleMin + Math.random() * Math.max(0, this._idleMax - this._idleMin);
            return;
        }

        const step = Math.min(dist, this.patrolSpeed * Math.max(0, dt));
        this._pos.set(p.x + (dx / dist) * step, p.y + (dy / dist) * step, p.z);
        this.node.setPosition(this._pos);

        if (Math.abs(dx) >= Math.abs(dy)) this.setDir(dx >= 0 ? 'right' : 'left');
        else this.setDir(dy >= 0 ? 'up' : 'down');
        this.setMoving(true);
    }

    private applyFrame(force: boolean) {
        if (!this._sprite) this._sprite = this.getComponent(Sprite);
        if (!this._sprite) return;
        const frames = this._walk[this._dir];
        if (!frames?.length) return;
        const sf = frames[this._frame] || frames[0];
        if (sf && (force || this._sprite.spriteFrame !== sf)) {
            this._sprite.spriteFrame = sf;
        }
    }
}
