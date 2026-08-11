import { _decorator, Component, Node, UITransform, Vec3 } from 'cc';
import {
    findPath,
    footSolidFor,
    isTreeSolidName,
    lineClear,
    listApproachStands,
    pointBlocked,
    PathSolid,
} from './GridPath';
import { InputBridge } from './InputBridge';

const { ccclass, property } = _decorator;

@ccclass('PlayerController')
export class PlayerController extends Component {
    @property
    speed = 300;

    @property
    bodyWidth = 24;

    @property
    bodyHeight = 16;

    @property
    enableCollision = true;

    /** Skip intermediate waypoints when this close. */
    @property
    arriveRadius = 22;

    /** How quickly steering turns toward the lookahead (higher = snappier). */
    @property
    turnRate = 7;

    @property(Node)
    world: Node | null = null;

    private readonly _tmp = new Vec3();
    private _solids: PathSolid[] = [];
    private _hasBounds = false;
    private _minX = -520;
    private _maxX = 520;
    private _minY = -900;
    private _maxY = 900;

    private _goalX = 0;
    private _goalY = 0;
    private _arriveDist = 20;
    private _waypoints: { x: number; y: number }[] = [];
    private _wpIndex = 0;
    private _walkingTo = false;
    private _onArrive: (() => void) | null = null;
    private _onAbort: (() => void) | null = null;
    private _manualOverride = false;
    private _locked = false;
    private _stuckTime = 0;
    private _repathCooldown = 0;
    private _noProgressTime = 0;
    private _bestGoalDist = Infinity;
    /** World node whose solid is ignored while auto-walking (chop target trunk). */
    private _ignoreSolidNode: Node | null = null;
    /** Optional interact focus — stuck near this still counts as arrived (tree foot). */
    private _actX = 0;
    private _actY = 0;
    private _actDist = 0;
    private _hasActFocus = false;
    /** Interact walks: no repath loops — arrive/abort on no progress. */
    private _interactWalk = false;
    /** Soft cap on stuck-repaths so we never orbit a trunk forever. */
    private _repathCount = 0;

    /** Smoothed unit steering — avoids snapping left/right every grid corner. */
    private _steerX = 0;
    private _steerY = -1;

    setMapBounds(minX: number, maxX: number, minY: number, maxY: number) {
        this._minX = minX;
        this._maxX = maxX;
        this._minY = minY;
        this._maxY = maxY;
        this._hasBounds = maxX > minX && maxY > minY;
    }

    start() {
        this.rebuildSolids();
    }

    get isAutoWalking(): boolean {
        return this._walkingTo;
    }

    get locked(): boolean {
        return this._locked;
    }

    setLocked(locked: boolean) {
        this._locked = locked;
        if (locked) {
            this.cancelWalk(false);
            InputBridge.clear();
        }
    }

    walkTo(
        x: number,
        y: number,
        onArrive?: () => void,
        onAbort?: () => void,
        arriveDist = this.arriveRadius,
        ignoreSolidNode: Node | null = null,
        actFocus: { x: number; y: number; dist: number } | null = null,
    ) {
        if (this._locked) {
            onArrive?.();
            return;
        }
        this._manualOverride = false;
        this._stuckTime = 0;
        this._repathCooldown = 0;
        this._repathCount = 0;
        this._noProgressTime = 0;
        this._bestGoalDist = Infinity;
        this._onArrive = onArrive ?? null;
        this._onAbort = onAbort ?? null;
        this._ignoreSolidNode = ignoreSolidNode;
        this._hasActFocus = !!actFocus;
        this._actX = actFocus?.x ?? 0;
        this._actY = actFocus?.y ?? 0;
        this._actDist = actFocus?.dist ?? 0;
        this._interactWalk = !!actFocus;
        this._walkingTo = true;

        const p = this.node.position;
        // Never path into a solid foot — soft weeds often sit inside a trunk AABB.
        const safe = this.ensureFreeGoal(x, y, p.x, p.y);
        this._goalX = safe.x;
        this._goalY = safe.y;
        this._arriveDist = Math.max(12, Math.min(18, arriveDist));

        const dx = this._goalX - p.x;
        const dy = this._goalY - p.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist <= this._arriveDist || this.withinActFocus(p.x, p.y)) {
            this.finishWalk();
            return;
        }
        // Seed steer toward goal so the first frames don't face a random leftover dir.
        if (dist > 1) {
            this._steerX = dx / dist;
            this._steerY = dy / dist;
        }
        // If feet are wedged inside a trunk/rock, nudge out before A* — otherwise
        // the path starts on a free cell but step() cannot leave the overlap.
        this.unstickIfNeeded();
        this.buildPath();
        if (!this._waypoints.length) {
            // No reachable approach — don't charge the goal through solids.
            this.abortWalk();
        }
    }

    /** Snap a walk goal out of solids, preferring open ground south of the target. */
    private ensureFreeGoal(x: number, y: number, fromX: number, fromY: number): { x: number; y: number } {
        const solids = this.activeSolids();
        const hw = this.bodyWidth * 0.5;
        const hh = this.bodyHeight * 0.5;
        if (!pointBlocked(x, y, hw, hh, solids)) return { x, y };
        return this.freeStandNear(x, y, fromX, fromY, 56);
    }

    /** Push feet to the nearest free point when overlapping a solid. */
    private unstickIfNeeded() {
        const hw = this.bodyWidth * 0.5;
        const hh = this.bodyHeight * 0.5;
        const p = this.node.position;
        if (!pointBlocked(p.x, p.y, hw, hh, this._solids)) return;
        const cell = 8;
        for (let r = 1; r <= 6; r++) {
            let best: { x: number; y: number; score: number } | null = null;
            for (let oy = -r; oy <= r; oy++) {
                for (let ox = -r; ox <= r; ox++) {
                    if (Math.abs(ox) !== r && Math.abs(oy) !== r) continue;
                    const x = p.x + ox * cell;
                    const y = p.y + oy * cell;
                    if (x < this._minX || x > this._maxX || y < this._minY || y > this._maxY) {
                        continue;
                    }
                    if (pointBlocked(x, y, hw, hh, this._solids)) continue;
                    const score = ox * ox + oy * oy;
                    if (!best || score < best.score) best = { x, y, score };
                }
            }
            if (best) {
                this._tmp.set(best.x, best.y, 0);
                this.node.setPosition(this._tmp);
                return;
            }
        }
    }

    cancelWalk(fireCallback = false) {
        const cb = fireCallback ? this._onArrive : null;
        this._walkingTo = false;
        this._waypoints.length = 0;
        this._onArrive = null;
        this._onAbort = null;
        this._ignoreSolidNode = null;
        this._hasActFocus = false;
        this._interactWalk = false;
        this._noProgressTime = 0;
        if (!this._locked && !this._manualOverride) InputBridge.clear();
        cb?.();
    }

    rebuildSolids() {
        this._solids.length = 0;
        if (!this.world) return;
        for (const child of this.world.children) {
            if (child === this.node) continue;
            if (!this.isSolidName(child.name)) continue;
            const ui = child.getComponent(UITransform);
            if (!ui) continue;
            const pos = child.position;
            const box = footSolidFor(
                child.name,
                ui.contentSize.width,
                ui.contentSize.height,
                pos.x,
                pos.y,
            );
            if (box) this._solids.push(box);
        }
    }

    /**
     * Stand beside a solid for chop/dig/chest.
     * Trees: always the front (south of trunk) — never under/behind the canopy.
     * Other solids: prefer the caller's side, then cardinal fallbacks.
     */
    approachStandFor(target: Node, fromX: number, fromY: number): { x: number; y: number } | null {
        if (!target?.isValid) return null;
        const ui = target.getComponent(UITransform);
        if (!ui) return null;
        const footX = target.position.x;
        const footY = target.position.y;
        const box = footSolidFor(
            target.name,
            ui.contentSize.width,
            ui.contentSize.height,
            footX,
            footY,
        );
        if (!box) return null;
        const hw = this.bodyWidth * 0.5;
        const hh = this.bodyHeight * 0.5;
        const isTree = isTreeSolidName(target.name);
        const standDist = Math.max(box.hw, box.hh) + Math.max(hw, hh) + 10;

        const dx = fromX - footX;
        const dy = fromY - footY;
        const len = Math.sqrt(dx * dx + dy * dy) || 1;
        const radial = {
            x: footX + (dx / len) * standDist,
            y: footY + (dy / len) * standDist,
        };
        // Tree front stand (south of trunk AABB) — default when radial is behind canopy.
        const front = {
            x: box.x,
            y: box.y - hh - (hh + box.hh + 10),
        };

        const bounds = {
            margin: 10,
            minX: this._minX,
            maxX: this._maxX,
            minY: this._minY,
            maxY: this._maxY,
            preferFront: isTree,
        };
        const ring = listApproachStands(box, fromX, fromY, hw, hh, this._solids, bounds);
        // Trees: front first. Never lead with a north radial (that is "behind the tree").
        const stands = isTree
            ? [front, ...ring, ...(radial.y <= footY + 2 ? [radial] : [])]
            : [radial, ...ring];

        for (let i = 0; i < stands.length; i++) {
            const s = stands[i]!;
            if (s.x < this._minX || s.x > this._maxX || s.y < this._minY || s.y > this._maxY) {
                continue;
            }
            if (pointBlocked(s.x, s.y, hw, hh, this._solids)) continue;
            // Trees: refuse any stand north of the foot (occluded / pocket).
            if (isTree && s.y > footY + 2) continue;
            if (
                lineClear(
                    fromX,
                    fromY,
                    s.x,
                    s.y,
                    this._solids,
                    hw,
                    hh,
                    this._minX,
                    this._maxX,
                    this._minY,
                    this._maxY,
                )
            ) {
                return s;
            }
            const path = findPath(fromX, fromY, s.x, s.y, this._solids, {
                cell: 32,
                bodyHw: hw,
                bodyHh: hh,
                minX: this._minX,
                maxX: this._maxX,
                minY: this._minY,
                maxY: this._maxY,
                maxNodes: 2500,
                goalRadius: 14,
            });
            if (!path.length) continue;
            const end = path[path.length - 1]!;
            const endD = Math.sqrt((end.x - s.x) * (end.x - s.x) + (end.y - s.y) * (end.y - s.y));
            if (endD <= 22) return s;
        }
        if (isTree) {
            if (!pointBlocked(front.x, front.y, hw, hh, this._solids)) return front;
            return null;
        }
        if (!pointBlocked(radial.x, radial.y, hw, hh, this._solids)) return radial;
        return null;
    }

    /**
     * Soft weeds / bushes don't collide, but their feet often sit inside a
     * nearby pine/rock AABB. Pick a free stand WITH clearance that stays
     * within maxDist of the weed foot (act range). Never return a far tree
     * approach ring just because it faces the player.
     */
    freeStandNear(
        tx: number,
        ty: number,
        fromX: number,
        fromY: number,
        maxDist = 48,
    ): { x: number; y: number } {
        const hw = this.bodyWidth * 0.5;
        const hh = this.bodyHeight * 0.5;
        const solids = this._solids;
        // Inflated body: reject knife-edge gaps that look free but trap on arrive.
        const mHw = hw + 4;
        const mHh = hh + 3;
        const maxD2 = maxDist * maxDist;
        const inBounds = (x: number, y: number) =>
            x >= this._minX && x <= this._maxX && y >= this._minY && y <= this._maxY;
        const d2Weed = (x: number, y: number) => (x - tx) * (x - tx) + (y - ty) * (y - ty);

        if (!pointBlocked(tx, ty, mHw, mHh, solids) && inBounds(tx, ty)) {
            return { x: tx, y: ty };
        }

        let best: { x: number; y: number; score: number } | null = null;
        const consider = (x: number, y: number, score: number) => {
            if (!inBounds(x, y)) return;
            if (pointBlocked(x, y, mHw, mHh, solids)) return;
            const d2 = d2Weed(x, y);
            if (d2 > maxD2) return;
            if (!best || score < best.score) best = { x, y, score };
        };

        // Among stands still inside act range of the weed, pick the one nearest the
        // caller — avoids forcing a full south orbit when a west/east pocket works.
        const host = this.solidAt(tx, ty, hw, hh, solids);
        const preferFront = !!host && host.hw <= 14 && host.hh <= 12;
        if (host) {
            const stands = listApproachStands(host, fromX, fromY, hw, hh, solids, {
                margin: 10,
                minX: this._minX,
                maxX: this._maxX,
                minY: this._minY,
                maxY: this._maxY,
                preferFront,
            });
            for (let i = 0; i < stands.length; i++) {
                const s = stands[i]!;
                // Soft penalty behind canopy; hard reject only deep north of the host.
                const midY = host.y - hh;
                if (preferFront && s.y > midY + 2) continue;
                const dFrom = (s.x - fromX) * (s.x - fromX) + (s.y - fromY) * (s.y - fromY);
                consider(s.x, s.y, dFrom + d2Weed(s.x, s.y) * 0.1);
            }
        }

        // Fine grid around the weed foot — still capped by maxDist.
        const cell = 8;
        const maxRing = Math.max(1, Math.ceil(maxDist / cell));
        for (let r = 1; r <= maxRing; r++) {
            for (let oy = -r; oy <= r; oy++) {
                for (let ox = -r; ox <= r; ox++) {
                    if (Math.abs(ox) !== r && Math.abs(oy) !== r) continue;
                    const x = tx + ox * cell;
                    const y = ty + oy * cell;
                    if (preferFront && host && y > host.y - hh + 2) continue;
                    const dFrom = (x - fromX) * (x - fromX) + (y - fromY) * (y - fromY);
                    consider(x, y, dFrom + d2Weed(x, y) * 0.1 + r);
                }
            }
        }
        if (best) return { x: best.x, y: best.y };

        // Last resort: step south of the foot (still near the weed).
        const fallback = { x: tx, y: ty - Math.min(maxDist, 24) };
        if (!pointBlocked(fallback.x, fallback.y, hw, hh, solids) && inBounds(fallback.x, fallback.y)) {
            return fallback;
        }
        return { x: tx, y: ty };
    }

    private solidAt(
        x: number,
        y: number,
        bodyHw: number,
        bodyHh: number,
        solids: PathSolid[],
    ): PathSolid | null {
        const cy = y + bodyHh;
        for (let i = 0; i < solids.length; i++) {
            const s = solids[i]!;
            if (Math.abs(x - s.x) < bodyHw + s.hw && Math.abs(cy - s.y) < bodyHh + s.hh) {
                return s;
            }
        }
        return null;
    }

    /** Solids used for path / collision, optionally skipping the walk target. */
    private activeSolids(): PathSolid[] {
        const ignore = this._ignoreSolidNode;
        if (!ignore?.isValid || !this.world) return this._solids;
        const ui = ignore.getComponent(UITransform);
        if (!ui) return this._solids;
        const box = footSolidFor(
            ignore.name,
            ui.contentSize.width,
            ui.contentSize.height,
            ignore.position.x,
            ignore.position.y,
        );
        if (!box) return this._solids;
        // Filter the matching footprint (same center / size) so we can stand on the trunk cell.
        return this._solids.filter(
            (s) =>
                Math.abs(s.x - box.x) > 0.5 ||
                Math.abs(s.y - box.y) > 0.5 ||
                Math.abs(s.hw - box.hw) > 0.5 ||
                Math.abs(s.hh - box.hh) > 0.5,
        );
    }

    update(dt: number) {
        if (this._locked) return;
        const frameDt = Math.min(dt, 1 / 30);

        if (this._repathCooldown > 0) this._repathCooldown -= frameDt;

        // Overlap a solid (pond rim / trunk) → nudge out so stick isn't dead.
        this.unstickIfNeeded();

        if (this._walkingTo) {
            this.tickWalk(frameDt);
            return;
        }

        const stick = InputBridge.move;
        if (stick.lengthSqr() < 0.01) return;
        // Manual stick: move directly (animator facing already has hysteresis).
        this._steerX = stick.x;
        this._steerY = stick.y;
        this.step(stick.x, stick.y, frameDt);
    }

    onManualMoveStart() {
        if (this._walkingTo) {
            this._walkingTo = false;
            this._waypoints.length = 0;
            this._onArrive = null;
            this._onAbort = null;
            this._ignoreSolidNode = null;
            this._hasActFocus = false;
            this._interactWalk = false;
            this._noProgressTime = 0;
        }
        this._manualOverride = true;
    }

    onManualMoveEnd() {
        this._manualOverride = false;
    }

    private withinActFocus(x: number, y: number): boolean {
        if (!this._hasActFocus || this._actDist <= 0) return false;
        const dx = this._actX - x;
        const dy = this._actY - y;
        return dx * dx + dy * dy <= this._actDist * this._actDist;
    }

    private resolveNoProgress(remain: number, x: number, y: number) {
        // Only "arrive" when truly beside the walk goal / act focus.
        // A loose remain check used to finish mid-approach → FarmSystem then
        // refused to act (too far from the weed) and the farmer just stopped.
        if (this.withinActFocus(x, y) || remain <= this._arriveDist * 1.2) {
            this.finishWalk();
        } else {
            this.abortWalk();
        }
    }

    private tickWalk(dt: number) {
        const p = this.node.position;
        const gdx = this._goalX - p.x;
        const gdy = this._goalY - p.y;
        const goalDist = Math.sqrt(gdx * gdx + gdy * gdy);
        if (goalDist <= this._arriveDist || this.withinActFocus(p.x, p.y)) {
            this.finishWalk();
            return;
        }

        // Closing on the goal is progress — but detours around trunks often move
        // AWAY from the goal first. Never abort just because goalDist rose.
        if (goalDist < this._bestGoalDist - 2) {
            this._bestGoalDist = goalDist;
        }

        const wpBefore = this._wpIndex;
        this.advanceWaypoints(p.x, p.y);
        if (this._wpIndex > wpBefore) {
            this._stuckTime = 0;
            this._noProgressTime = 0;
        }

        if (this._wpIndex >= this._waypoints.length) {
            if (goalDist <= this._arriveDist * 1.6 || this.withinActFocus(p.x, p.y)) {
                this.finishWalk();
            } else if (this._repathCount < 1 && this._repathCooldown <= 0) {
                // Path exhausted short of goal — one rebuild, then settle.
                this.buildPath();
                this._repathCount++;
                this._repathCooldown = 0.55;
                if (!this._waypoints.length) this.resolveNoProgress(goalDist, p.x, p.y);
            } else {
                this.resolveNoProgress(goalDist, p.x, p.y);
            }
            return;
        }

        const aim = this.lookaheadTarget(p.x, p.y);
        const adx = aim.x - p.x;
        const ady = aim.y - p.y;
        const alen = Math.sqrt(adx * adx + ady * ady) || 1;
        // Snap steer onto the path heading — smooth turning fights grid corners and
        // feeds trunk-orbit slides when the goal sits on the far side of a tree.
        this._steerX = adx / alen;
        this._steerY = ady / alen;

        const beforeX = p.x;
        const beforeY = p.y;
        this.step(this._steerX, this._steerY, dt);

        const p2 = this.node.position;
        const moved = Math.abs(p2.x - beforeX) + Math.abs(p2.y - beforeY);
        // Only drive walk anim when we actually moved — stops in-place stepping on walls.
        if (moved >= 0.25) {
            InputBridge.setMove(this._steerX, this._steerY);
            this._stuckTime = 0;
            this._noProgressTime = 0;
        } else {
            InputBridge.clear();
            this._stuckTime += dt;
            this._noProgressTime += dt;
            const remain = Math.sqrt(
                (this._goalX - p2.x) * (this._goalX - p2.x) +
                    (this._goalY - p2.y) * (this._goalY - p2.y),
            );
            if (remain <= this._arriveDist * 1.35 || this.withinActFocus(p2.x, p2.y)) {
                this.finishWalk();
                return;
            }
            // Only give up when immobilized against a solid — not during open detours.
            if (this._stuckTime > 0.35) {
                if (this._repathCount < 1 && this._repathCooldown <= 0) {
                    this.buildPath();
                    this._repathCount++;
                    this._repathCooldown = 0.7;
                    this._stuckTime = 0;
                    if (!this._waypoints.length) {
                        this.resolveNoProgress(remain, p2.x, p2.y);
                    }
                } else {
                    this.resolveNoProgress(remain, p2.x, p2.y);
                }
            }
        }
    }

    /** Blend current steer toward desired unit direction. */
    private smoothSteer(tx: number, ty: number, dt: number) {
        const tlen = Math.sqrt(tx * tx + ty * ty);
        if (tlen < 1e-6) return;
        tx /= tlen;
        ty /= tlen;
        const k = 1 - Math.exp(-this.turnRate * dt);
        this._steerX += (tx - this._steerX) * k;
        this._steerY += (ty - this._steerY) * k;
        const sl = Math.sqrt(this._steerX * this._steerX + this._steerY * this._steerY) || 1;
        this._steerX /= sl;
        this._steerY /= sl;
    }

    /**
     * String-pull along waypoints. Do NOT skip ahead to the final goal while
     * intermediate waypoints remain — grazing lineClear past a trunk makes the
     * farmer slide around the canopy in circles.
     */
    private lookaheadTarget(px: number, py: number): { x: number; y: number } {
        const hw = this.bodyWidth * 0.5;
        const hh = this.bodyHeight * 0.5;
        const solids = this.activeSolids();
        const clear = (x: number, y: number) =>
            lineClear(px, py, x, y, solids, hw, hh, this._minX, this._maxX, this._minY, this._maxY);

        const last = this._waypoints.length - 1;
        // On the final leg (or no path), aim at the goal when the segment is open.
        if (this._wpIndex >= last) {
            if (clear(this._goalX, this._goalY)) {
                return { x: this._goalX, y: this._goalY };
            }
        }
        for (let i = last; i >= this._wpIndex; i--) {
            const wp = this._waypoints[i];
            if (wp && clear(wp.x, wp.y)) return wp;
        }
        return this._waypoints[this._wpIndex] ?? { x: this._goalX, y: this._goalY };
    }

    private advanceWaypoints(px: number, py: number) {
        while (this._wpIndex < this._waypoints.length) {
            const wp = this._waypoints[this._wpIndex];
            const dx = wp.x - px;
            const dy = wp.y - py;
            const isLast = this._wpIndex >= this._waypoints.length - 1;
            const need = isLast ? this._arriveDist : this.arriveRadius;
            if (dx * dx + dy * dy <= need * need) {
                this._wpIndex++;
                continue;
            }
            // Passed the waypoint (overshoot) — don't turn back for it.
            if (!isLast && this._steerX * dx + this._steerY * dy < 0 && dx * dx + dy * dy < need * need * 4) {
                this._wpIndex++;
                continue;
            }
            break;
        }
    }

    private buildPath() {
        const p = this.node.position;
        const hw = this.bodyWidth * 0.5;
        const hh = this.bodyHeight * 0.5;
        const solids = this.activeSolids();
        // Straight shot when open — no grid zigzags.
        if (
            lineClear(
                p.x,
                p.y,
                this._goalX,
                this._goalY,
                solids,
                hw,
                hh,
                this._minX,
                this._maxX,
                this._minY,
                this._maxY,
            )
        ) {
            this._waypoints = [{ x: this._goalX, y: this._goalY }];
            this._wpIndex = 0;
            return;
        }
        const path = findPath(p.x, p.y, this._goalX, this._goalY, solids, {
            cell: 32,
            bodyHw: hw,
            bodyHh: hh,
            minX: this._minX,
            maxX: this._maxX,
            minY: this._minY,
            maxY: this._maxY,
            maxNodes: 5000,
            // Accept any free cell within the job's stand ring (tree trunks, etc.).
            goalRadius: this._arriveDist,
        });
        this._waypoints = path;
        this._wpIndex = 0;
    }

    private finishWalk() {
        this._walkingTo = false;
        this._waypoints.length = 0;
        this._hasActFocus = false;
        this._interactWalk = false;
        this._noProgressTime = 0;
        InputBridge.clear();
        this.unstickIfNeeded();
        const cb = this._onArrive;
        this._onArrive = null;
        this._onAbort = null;
        this._ignoreSolidNode = null;
        cb?.();
    }

    private abortWalk() {
        this._walkingTo = false;
        this._waypoints.length = 0;
        this._hasActFocus = false;
        this._interactWalk = false;
        this._noProgressTime = 0;
        InputBridge.clear();
        this.unstickIfNeeded();
        const cb = this._onAbort;
        this._onArrive = null;
        this._onAbort = null;
        this._ignoreSolidNode = null;
        cb?.();
    }

    private step(dx: number, dy: number, dt: number) {
        const len = Math.sqrt(dx * dx + dy * dy);
        if (len < 1e-6 || dt <= 0) return;
        dx /= len;
        dy /= len;

        const dist = this.speed * dt;
        const pos = this.node.position;
        let nx = pos.x + dx * dist;
        let ny = pos.y + dy * dist;

        if (this.enableCollision && this.collides(nx, ny)) {
            const sx = pos.x + (dx > 0 ? dist : dx < 0 ? -dist : 0);
            const sy = pos.y + (dy > 0 ? dist : dy < 0 ? -dist : 0);
            const canX = dx !== 0 && !this.collides(sx, pos.y);
            const canY = dy !== 0 && !this.collides(pos.x, sy);
            if (canX && !canY) {
                nx = sx;
                ny = pos.y;
                // Keep steer aligned with actual slide so anim doesn't fight movement.
                this._steerX = dx > 0 ? 1 : -1;
                this._steerY = 0;
            } else if (canY && !canX) {
                nx = pos.x;
                ny = sy;
                this._steerX = 0;
                this._steerY = dy > 0 ? 1 : -1;
            } else if (canX && canY) {
                if (Math.abs(dx) >= Math.abs(dy)) {
                    nx = sx;
                    ny = pos.y;
                    this._steerX = dx > 0 ? 1 : -1;
                    this._steerY = 0;
                } else {
                    nx = pos.x;
                    ny = sy;
                    this._steerX = 0;
                    this._steerY = dy > 0 ? 1 : -1;
                }
            } else {
                nx = pos.x;
                ny = pos.y;
            }
        }

        if (this._hasBounds) {
            nx = Math.max(this._minX, Math.min(this._maxX, nx));
            ny = Math.max(this._minY, Math.min(this._maxY, ny));
        } else {
            nx = Math.max(-520, Math.min(520, nx));
            ny = Math.max(-900, Math.min(900, ny));
        }
        this._tmp.set(nx, ny, 0);
        this.node.setPosition(this._tmp);
    }

    private collides(x: number, y: number): boolean {
        const hw = this.bodyWidth * 0.5;
        const hh = this.bodyHeight * 0.5;
        const cy = y + hh;
        // Always collide with real solids (including chop target) — only pathfinding
        // ignores the target so A* can route into its stand ring.
        for (let i = 0; i < this._solids.length; i++) {
            const s = this._solids[i];
            if (Math.abs(x - s.x) < hw + s.hw && Math.abs(cy - s.y) < hh + s.hh) {
                return true;
            }
        }
        return false;
    }

    private isSolidName(name: string): boolean {
        // Archway prop — walk through; info prompt still works via MineWorldLayout.
        if (name === 'bld_mine_mouth') return false;
        // Interior exit mat / door — walk through to leave MayorHouse.
        if (name === 'door_exit') return false;
        return (
            name.startsWith('cottage_') ||
            name.startsWith('home_') ||
            name.startsWith('bld_') ||
            name.startsWith('shed') ||
            name === 'shop' ||
            name === 'community' ||
            name === 'fountain' ||
            name.startsWith('lamp_') ||
            name.startsWith('fence') ||
            name.startsWith('tree_') ||
            name.startsWith('wall_solid_') ||
            name.startsWith('prop_desk') ||
            name.startsWith('prop_bookshelf') ||
            name.startsWith('prop_tea_table') ||
            name.startsWith('prop_shipping') ||
            name.startsWith('prop_mailbox') ||
            name.startsWith('prop_craftbench') ||
            name.startsWith('prop_timber') ||
            name.startsWith('prop_minecart') ||
            name.startsWith('prop_crate') ||
            name.startsWith('prop_barrel') ||
            name.startsWith('pond_water_') ||
            name.startsWith('pond_cliff_') ||
            name.startsWith('water_') ||
            name.startsWith('cliff_') ||
            (name.startsWith('decor_') && name.includes('_solid_'))
        );
    }
}
