/**
 * Lightweight grid A* for farm walk-to.
 * World units; default cell size 32.
 *
 * Goals may sit inside solids (tree trunks) or behind sealed decor.
 * Search succeeds on any free cell within goalRadius, otherwise returns
 * the best reachable approach cell instead of failing empty.
 */

export type PathSolid = { x: number; y: number; hw: number; hh: number };

/**
 * Foot collider for a named world prop (feet-anchored sprites).
 * Soft weeds / grass are never solids — only trunks, rocks, buildings, water.
 * Tree canopy must NOT block: use a tight trunk so grass under oaks stays walkable.
 */
export function footSolidFor(
    name: string,
    contentW: number,
    contentH: number,
    footX: number,
    footY: number,
): PathSolid | null {
    // Timber mouth is a visual arch — walk through into the cavern.
    if (name === 'bld_mine_mouth') {
        return null;
    }
    // Interior room seal — tile-wide so players can't slip between panels.
    if (name.startsWith('wall_solid_')) {
        const hw = Math.max(30, contentW * 0.45);
        const hh = Math.max(20, Math.min(36, contentH * 0.22));
        return { x: footX, y: footY + hh * 0.7, hw, hh };
    }
    if (
        name.startsWith('water_') ||
        name.startsWith('cliff_') ||
        name.startsWith('pond_cliff_') ||
        name.startsWith('pond_water_')
    ) {
        // Southern river bridge gap (visual prop only).
        if (name.startsWith('water_') && Math.abs(footX) < 48 && footY < -300) {
            return null;
        }
        // Mine seal faces are foot-anchored tall rocks — box must cover the tile,
        // not sit as a tiny toe collider (players were slipping between pillars).
        if (name.startsWith('cliff_seal_')) {
            const hw = Math.max(28, contentW * 0.42);
            const hh = Math.max(22, Math.min(40, contentH * 0.28));
            return { x: footX, y: footY + hh * 0.85, hw, hh };
        }
        return {
            x: footX,
            y: footY,
            hw: contentW * 0.48,
            hh: contentH * 0.48,
        };
    }

    // Pine / oak / legacy tree_* — trunk only (canopy is draw-only).
    if (
        name.startsWith('tree_') ||
        name.includes('_pine_') ||
        name.includes('_oak_') ||
        /decor_(pine|oak)_solid/.test(name)
    ) {
        const hw = 11;
        const hh = 9;
        return { x: footX, y: footY + hh, hw, hh };
    }

    // Stumps / rocks / logs / fences / props — modest foot box.
    const hw = Math.max(12, Math.min(28, contentW * 0.22));
    const hh = Math.max(8, Math.min(16, contentH * 0.1));
    return { x: footX, y: footY + hh, hw, hh };
}

const NEIGHBORS: [number, number, number][] = [
    [1, 0, 1],
    [-1, 0, 1],
    [0, 1, 1],
    [0, -1, 1],
    [1, 1, Math.SQRT2],
    [1, -1, Math.SQRT2],
    [-1, 1, Math.SQRT2],
    [-1, -1, Math.SQRT2],
];

function key(cx: number, cy: number): string {
    return `${cx},${cy}`;
}

function heuristic(ax: number, ay: number, bx: number, by: number): number {
    const dx = Math.abs(ax - bx);
    const dy = Math.abs(ay - by);
    return dx + dy + (Math.SQRT2 - 2) * Math.min(dx, dy);
}

export function pointBlocked(
    x: number,
    y: number,
    bodyHw: number,
    bodyHh: number,
    solids: PathSolid[],
): boolean {
    const cy = y + bodyHh;
    for (let i = 0; i < solids.length; i++) {
        const s = solids[i];
        if (Math.abs(x - s.x) < bodyHw + s.hw && Math.abs(cy - s.y) < bodyHh + s.hh) {
            return true;
        }
    }
    return false;
}

function dist2(ax: number, ay: number, bx: number, by: number): number {
    const dx = ax - bx;
    const dy = ay - by;
    return dx * dx + dy * dy;
}

/**
 * Nearest free cell to (gx, gy), searching rings outward.
 * When fromX/fromY are set AND the continuous goal is blocked (tree trunk /
 * rock center), lightly prefer the caller's side so we don't snap behind the
 * solid. Never apply that bias when (gx,gy) itself is free — the grid cell
 * center can sit inside a trunk while the stand beside it is walkable, and
 * from-bias then falsely targets the player's side of the tree.
 */
function snapFreeNear(
    gx: number,
    gy: number,
    cell: number,
    blocked: (wx: number, wy: number) => boolean,
    maxRing: number,
    fromX?: number,
    fromY?: number,
): { cx: number; cy: number } | null {
    let goalCx = Math.round(gx / cell);
    let goalCy = Math.round(gy / cell);
    if (!blocked(goalCx * cell, goalCy * cell)) {
        return { cx: goalCx, cy: goalCy };
    }
    let bestCx = goalCx;
    let bestCy = goalCy;
    let bestScore = Infinity;
    // Only bias toward the caller when the true goal is inside a solid.
    const hasFrom =
        fromX !== undefined && fromY !== undefined && blocked(gx, gy);
    for (let r = 1; r <= maxRing; r++) {
        for (let oy = -r; oy <= r; oy++) {
            for (let ox = -r; ox <= r; ox++) {
                if (Math.abs(ox) !== r && Math.abs(oy) !== r) continue;
                const cx = goalCx + ox;
                const cy = goalCy + oy;
                const wx = cx * cell;
                const wy = cy * cell;
                if (blocked(wx, wy)) continue;
                // Prefer cells closest to the true goal; optional from-side for solid goals.
                let score = dist2(wx, wy, gx, gy);
                if (hasFrom) score += dist2(wx, wy, fromX!, fromY!) * 0.35;
                if (score < bestScore) {
                    bestScore = score;
                    bestCx = cx;
                    bestCy = cy;
                }
            }
        }
        if (bestScore < Infinity) return { cx: bestCx, cy: bestCy };
    }
    return null;
}

/** Candidate stand points just outside a solid AABB (cardinals first, then diagonals). */
export function listApproachStands(
    solid: PathSolid,
    fromX: number,
    fromY: number,
    bodyHw: number,
    bodyHh: number,
    solids: PathSolid[],
    opts?: {
        margin?: number;
        minX?: number;
        maxX?: number;
        minY?: number;
        maxY?: number;
        /**
         * Trees: never stand north of the trunk (under / behind the canopy).
         * South + east/west only — caller-side bias must not pull us behind.
         */
        preferFront?: boolean;
    },
): { x: number; y: number }[] {
    const margin = opts?.margin ?? 6;
    const minX = opts?.minX ?? -520;
    const maxX = opts?.maxX ?? 520;
    const minY = opts?.minY ?? -900;
    const maxY = opts?.maxY ?? 900;
    const preferFront = !!opts?.preferFront;
    const gapX = bodyHw + solid.hw + margin;
    const gapY = bodyHh + solid.hh + margin;
    // Feet Y such that body center clears the solid vertically.
    const southY = solid.y - bodyHh - gapY;
    const northY = solid.y - bodyHh + gapY;
    const midY = solid.y - bodyHh;
    const dirs: { x: number; y: number }[] = preferFront
        ? [
              // Front first — never offer north/behind-canopy stands for trees.
              { x: solid.x, y: southY },
              { x: solid.x - gapX, y: southY },
              { x: solid.x + gapX, y: southY },
              { x: solid.x - gapX, y: midY },
              { x: solid.x + gapX, y: midY },
          ]
        : [
              { x: solid.x, y: southY },
              { x: solid.x - gapX, y: midY },
              { x: solid.x + gapX, y: midY },
              { x: solid.x, y: northY },
              { x: solid.x - gapX, y: southY },
              { x: solid.x + gapX, y: southY },
              { x: solid.x - gapX, y: northY },
              { x: solid.x + gapX, y: northY },
          ];

    // Solid center in foot-space (same Y basis as stand points).
    const cx = solid.x;
    const cy = midY;
    const fromDx = fromX - cx;
    const fromDy = fromY - cy;

    type Ranked = { x: number; y: number; score: number };
    const ranked: Ranked[] = [];
    for (let i = 0; i < dirs.length; i++) {
        const p = dirs[i]!;
        if (p.x < minX || p.x > maxX || p.y < minY || p.y > maxY) continue;
        if (pointBlocked(p.x, p.y, bodyHw, bodyHh, solids)) continue;
        // Hard reject anything north of mid for front-facing props (trees).
        if (preferFront && p.y > midY + 2) continue;
        const sx = p.x - cx;
        const sy = p.y - cy;
        const d = dist2(p.x, p.y, fromX, fromY);
        if (preferFront) {
            // Stay in front; among front stands, prefer nearer to the caller.
            const frontBonus = p.y <= southY + 6 ? 0 : 80;
            ranked.push({ x: p.x, y: p.y, score: d + frontBonus + i * 2 });
        } else {
            // Same half-plane as the caller — avoid the far rock pocket.
            const sameSide = fromDx * sx + fromDy * sy >= -4;
            ranked.push({
                x: p.x,
                y: p.y,
                score: d + (sameSide ? 0 : 1e7) + i * 2,
            });
        }
    }
    ranked.sort((a, b) => a.score - b.score);
    if (ranked.length) return ranked.map((r) => ({ x: r.x, y: r.y }));
    return [{ x: solid.x, y: southY }];
}

/** Pine / oak / legacy tree_* — stand in front of the trunk, never behind canopy. */
export function isTreeSolidName(name: string): boolean {
    return (
        name.startsWith('tree_') ||
        name.includes('_pine_') ||
        name.includes('_oak_') ||
        /decor_(pine|oak)_solid/.test(name)
    );
}

/**
 * Stand just outside a solid, on the caller's side.
 * Used for chop/dig so we don't path into the trunk (or snap behind the canopy).
 */
export function pickApproachStand(
    solid: PathSolid,
    fromX: number,
    fromY: number,
    bodyHw: number,
    bodyHh: number,
    solids: PathSolid[],
    opts?: {
        margin?: number;
        minX?: number;
        maxX?: number;
        minY?: number;
        maxY?: number;
        preferFront?: boolean;
    },
): { x: number; y: number } {
    return listApproachStands(solid, fromX, fromY, bodyHw, bodyHh, solids, opts)[0]!;
}

export function findPath(
    sx: number,
    sy: number,
    gx: number,
    gy: number,
    solids: PathSolid[],
    opts?: {
        cell?: number;
        bodyHw?: number;
        bodyHh?: number;
        maxNodes?: number;
        minX?: number;
        maxX?: number;
        minY?: number;
        maxY?: number;
        /** Accept any free cell within this world distance of the goal. */
        goalRadius?: number;
    },
): { x: number; y: number }[] {
    const cell = opts?.cell ?? 32;
    const bodyHw = opts?.bodyHw ?? 12;
    const bodyHh = opts?.bodyHh ?? 8;
    const maxNodes = opts?.maxNodes ?? 5000;
    const minX = opts?.minX ?? -520;
    const maxX = opts?.maxX ?? 520;
    const minY = opts?.minY ?? -900;
    const maxY = opts?.maxY ?? 900;
    const goalRadius = Math.max(0, opts?.goalRadius ?? 0);
    const goalR2 = goalRadius * goalRadius;

    const blocked = (wx: number, wy: number) =>
        wx < minX ||
        wx > maxX ||
        wy < minY ||
        wy > maxY ||
        pointBlocked(wx, wy, bodyHw, bodyHh, solids);

    const toWorld = (cx: number, cy: number) => ({ x: cx * cell, y: cy * cell });

    // Heuristic target: free cell nearest the goal. From-side bias only applies
    // inside snapFreeNear when the continuous goal itself is blocked.
    const snapped = snapFreeNear(gx, gy, cell, blocked, 8, sx, sy);
    const goalCx = snapped?.cx ?? Math.round(gx / cell);
    const goalCy = snapped?.cy ?? Math.round(gy / cell);
    // hitExact may only finish when that cell is actually near the true goal —
    // otherwise a wrong-side snap (north of a trunk) would "succeed" in place.
    // One cell (~32) is enough for a free stand whose grid center landed in a trunk.
    const snapNearGoal =
        dist2(goalCx * cell, goalCy * cell, gx, gy) <= Math.max(goalR2, cell * cell);

    let startCx = Math.round(sx / cell);
    let startCy = Math.round(sy / cell);
    // Prefer the player's real feet if that cell center is blocked but the
    // continuous position is free — snap outward only when necessary.
    if (blocked(startCx * cell, startCy * cell)) {
        if (!blocked(sx, sy)) {
            // Stay on the nearest free cell to the real position.
            const near = snapFreeNear(sx, sy, cell, blocked, 4);
            if (near) {
                startCx = near.cx;
                startCy = near.cy;
            }
        } else {
            outer: for (let r = 1; r <= 4; r++) {
                for (let oy = -r; oy <= r; oy++) {
                    for (let ox = -r; ox <= r; ox++) {
                        if (!blocked((startCx + ox) * cell, (startCy + oy) * cell)) {
                            startCx += ox;
                            startCy += oy;
                            break outer;
                        }
                    }
                }
            }
        }
    }

    const startW = toWorld(startCx, startCy);
    const withinGoal = (wx: number, wy: number) => dist2(wx, wy, gx, gy) <= goalR2;

    // Already in range — stay put. Never return the raw goal (may be through a solid).
    if (goalRadius > 0 && (withinGoal(sx, sy) || withinGoal(startW.x, startW.y))) {
        return [{ x: sx, y: sy }];
    }
    // Same snapped cell only counts when that cell is actually near the true goal.
    if (startCx === goalCx && startCy === goalCy && snapNearGoal) {
        return [toWorld(goalCx, goalCy)];
    }

    type Rec = { g: number; f: number; px: number; py: number };
    const open: { cx: number; cy: number }[] = [{ cx: startCx, cy: startCy }];
    const info = new Map<string, Rec>();
    info.set(key(startCx, startCy), {
        g: 0,
        f: heuristic(startCx, startCy, goalCx, goalCy),
        px: startCx,
        py: startCy,
    });
    const closed = new Set<string>();

    // Best reachable approach toward the true goal (not merely the snapped cell).
    let bestCx = startCx;
    let bestCy = startCy;
    let bestGoalD = dist2(startW.x, startW.y, gx, gy);

    const reconstruct = (cx: number, cy: number) => {
        const cells: { cx: number; cy: number }[] = [];
        for (;;) {
            cells.push({ cx, cy });
            const rec = info.get(key(cx, cy))!;
            if (cx === startCx && cy === startCy) break;
            if (rec.px === cx && rec.py === cy) break;
            cx = rec.px;
            cy = rec.py;
        }
        cells.reverse();
        const path = cells.map((c) => toWorld(c.cx, c.cy));
        // End at the true goal when the last cell is already in range and the
        // segment is clear — keeps arrive checks aligned with the job target.
        const last = path[path.length - 1];
        // Only append the true goal when it is free — never walk the last step into a trunk.
        if (
            last &&
            goalRadius > 0 &&
            withinGoal(last.x, last.y) &&
            !blocked(gx, gy) &&
            lineClear(last.x, last.y, gx, gy, solids, bodyHw, bodyHh, minX, maxX, minY, maxY)
        ) {
            path.push({ x: gx, y: gy });
        }
        return simplify(path, solids, bodyHw, bodyHh, minX, maxX, minY, maxY);
    };

    let expanded = 0;
    while (open.length && expanded < maxNodes) {
        let bi = 0;
        for (let i = 1; i < open.length; i++) {
            const a = info.get(key(open[i].cx, open[i].cy))!;
            const b = info.get(key(open[bi].cx, open[bi].cy))!;
            if (a.f < b.f) bi = i;
        }
        const cur = open[bi];
        open[bi] = open[open.length - 1];
        open.pop();
        const ck = key(cur.cx, cur.cy);
        if (closed.has(ck)) continue;
        closed.add(ck);
        expanded++;

        const curW = toWorld(cur.cx, cur.cy);
        const curGoalD = dist2(curW.x, curW.y, gx, gy);
        if (curGoalD < bestGoalD) {
            bestGoalD = curGoalD;
            bestCx = cur.cx;
            bestCy = cur.cy;
        }

        const hitExact =
            snapNearGoal && cur.cx === goalCx && cur.cy === goalCy;
        const hitRadius = goalRadius > 0 && curGoalD <= goalR2;
        if (hitExact || hitRadius) {
            return reconstruct(cur.cx, cur.cy);
        }

        const curG = info.get(ck)!.g;
        for (const [ox, oy, cost] of NEIGHBORS) {
            const nx = cur.cx + ox;
            const ny = cur.cy + oy;
            const nk = key(nx, ny);
            if (closed.has(nk)) continue;
            if (blocked(nx * cell, ny * cell)) continue;
            if (ox !== 0 && oy !== 0) {
                if (blocked((cur.cx + ox) * cell, cur.cy * cell)) continue;
                if (blocked(cur.cx * cell, (cur.cy + oy) * cell)) continue;
            }
            const g = curG + cost;
            const prev = info.get(nk);
            if (prev && g >= prev.g) continue;
            info.set(nk, {
                g,
                f: g + heuristic(nx, ny, goalCx, goalCy),
                px: cur.cx,
                py: cur.cy,
            });
            open.push({ cx: nx, cy: ny });
        }
    }

    // Unreachable exact goal — walk as close as the connected component allows.
    if (bestCx === startCx && bestCy === startCy) return [];
    if (bestGoalD >= dist2(sx, sy, gx, gy) - 1) return [];
    return reconstruct(bestCx, bestCy);
}

/** True if the segment is free of solids / map bounds (for steering lookahead). */
export function lineClear(
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    solids: PathSolid[],
    bodyHw: number,
    bodyHh: number,
    minX = -520,
    maxX = 520,
    minY = -900,
    maxY = 900,
): boolean {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    const steps = Math.max(2, Math.ceil(dist / 8));
    for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        const x = x0 + dx * t;
        const y = y0 + dy * t;
        if (x < minX || x > maxX || y < minY || y > maxY) return false;
        if (pointBlocked(x, y, bodyHw, bodyHh, solids)) return false;
    }
    return true;
}

function simplify(
    path: { x: number; y: number }[],
    solids: PathSolid[],
    bodyHw: number,
    bodyHh: number,
    minX: number,
    maxX: number,
    minY: number,
    maxY: number,
): { x: number; y: number }[] {
    if (path.length <= 2) return path;
    const out: { x: number; y: number }[] = [path[0]];
    let i = 0;
    while (i < path.length - 1) {
        let best = i + 1;
        for (let j = path.length - 1; j > i + 1; j--) {
            if (
                lineClear(
                    path[i].x,
                    path[i].y,
                    path[j].x,
                    path[j].y,
                    solids,
                    bodyHw,
                    bodyHh,
                    minX,
                    maxX,
                    minY,
                    maxY,
                )
            ) {
                best = j;
                break;
            }
        }
        out.push(path[best]);
        i = best;
    }
    return out;
}
