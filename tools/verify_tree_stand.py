"""
Offline check: clicking the oak near shipping must stand SOUTH of the trunk
(from spawn / craft / N/E/W), with a reachable path. Mirrors GridPath preferFront.
"""
from __future__ import annotations

import heapq
import json
import math
import sys
from pathlib import Path

CELL = 32
BHW, BHH = 12, 8
MINX, MAXX, MINY, MAXY = -480, 480, -900, 900


def size_for(name: str):
    if "oak" in name:
        return 128, 160
    if "pine" in name:
        return 96, 144
    if "shipping" in name:
        return 96, 80
    if "craft" in name:
        return 96, 80
    if "mailbox" in name:
        return 48, 64
    if name.startswith("fence"):
        return 64, 64
    if "rockBig" in name:
        return 72, 56
    if "rock" in name:
        return 48, 40
    if "stump" in name:
        return 56, 48
    if "log" in name:
        return 80, 32
    return 64, 64


def foot_solid(name, w, h, fx, fy):
    if name.startswith(("water_", "cliff_", "pond_cliff_", "pond_water_")):
        if name.startswith("water_") and abs(fx) < 48 and fy < -300:
            return None
        return {"x": fx, "y": fy, "hw": w * 0.48, "hh": h * 0.48}
    if (
        name.startswith("tree_")
        or "_pine_" in name
        or "_oak_" in name
        or "decor_pine_solid" in name
        or "decor_oak_solid" in name
    ):
        return {"x": fx, "y": fy + 9, "hw": 11.0, "hh": 9.0, "footY": fy}
    hw = max(12, min(28, w * 0.22))
    hh = max(8, min(16, h * 0.1))
    return {"x": fx, "y": fy + hh, "hw": hw, "hh": hh}


def is_solid_name(name: str) -> bool:
    if name == "bld_mine_mouth":
        return False
    return (
        name.startswith(
            (
                "cottage_",
                "home_",
                "bld_",
                "shed",
                "fence",
                "tree_",
                "prop_shipping",
                "prop_mailbox",
                "prop_craftbench",
                "water_",
                "cliff_",
                "pond_",
            )
        )
        or name in ("shop", "community", "fountain")
        or (name.startswith("decor_") and "_solid_" in name)
    )


def load():
    data = json.loads(Path("assets/scenes/Main.scene").read_text(encoding="utf-8"))
    solids, trees = [], []
    for o in data:
        if not isinstance(o, dict) or o.get("__type__") != "cc.Node":
            continue
        name = o.get("_name", "")
        pos = o.get("_lpos")
        if not isinstance(pos, dict):
            continue
        x, y = float(pos.get("x", 0)), float(pos.get("y", 0))
        if name.startswith("decor_") and ("_oak_solid" in name or "_pine_solid" in name):
            trees.append((name, x, y))
        if not is_solid_name(name):
            continue
        box = foot_solid(name, *size_for(name), x, y)
        if box:
            solids.append(box)
    return solids, trees


def blocked(wx, wy, solids):
    if wx < MINX or wx > MAXX or wy < MINY or wy > MAXY:
        return True
    cy = wy + BHH
    for s in solids:
        if abs(wx - s["x"]) < BHW + s["hw"] and abs(cy - s["y"]) < BHH + s["hh"]:
            return True
    return False


def list_stands_front(solid, from_x, from_y, solids):
    margin = 10
    gap_x = BHW + solid["hw"] + margin
    gap_y = BHH + solid["hh"] + margin
    south_y = solid["y"] - BHH - gap_y
    mid_y = solid["y"] - BHH
    dirs = [
        (solid["x"], south_y),
        (solid["x"] - gap_x, south_y),
        (solid["x"] + gap_x, south_y),
        (solid["x"] - gap_x, mid_y),
        (solid["x"] + gap_x, mid_y),
    ]
    ranked = []
    for i, (px, py) in enumerate(dirs):
        if blocked(px, py, solids):
            continue
        if py > mid_y + 2:
            continue
        d = (px - from_x) ** 2 + (py - from_y) ** 2
        front_bonus = 0 if py <= south_y + 6 else 80
        ranked.append((d + front_bonus + i * 2, px, py))
    ranked.sort()
    return [(px, py) for _, px, py in ranked]


def find_path(solids, sx, sy, gx, gy, goal_radius=14):
    def blk(wx, wy):
        return blocked(wx, wy, solids)

    gcx, gcy = round(gx / CELL), round(gy / CELL)
    if blk(gcx * CELL, gcy * CELL):
        best, bs = None, 1e18
        for r in range(1, 9):
            for oy in range(-r, r + 1):
                for ox in range(-r, r + 1):
                    if abs(ox) != r and abs(oy) != r:
                        continue
                    cx, cy = gcx + ox, gcy + oy
                    wx, wy = cx * CELL, cy * CELL
                    if blk(wx, wy):
                        continue
                    sc = (wx - gx) ** 2 + (wy - gy) ** 2
                    if sc < bs:
                        bs, best = sc, (cx, cy)
            if best:
                gcx, gcy = best
                break
    snap_near = (gcx * CELL - gx) ** 2 + (gcy * CELL - gy) ** 2 <= max(
        goal_radius**2, CELL * CELL
    )
    scx, scy = round(sx / CELL), round(sy / CELL)
    if blk(scx * CELL, scy * CELL):
        for r in range(1, 5):
            done = False
            for oy in range(-r, r + 1):
                for ox in range(-r, r + 1):
                    if not blk((scx + ox) * CELL, (scy + oy) * CELL):
                        scx, scy = scx + ox, scy + oy
                        done = True
                        break
                if done:
                    break
            if done:
                break

    goal_r2 = goal_radius**2

    def h(ax, ay):
        dx, dy = abs(ax - gcx), abs(ay - gcy)
        return dx + dy + (math.sqrt(2) - 2) * min(dx, dy)

    openq = [(h(scx, scy), 0, scx, scy)]
    info = {(scx, scy): (0, scx, scy)}
    closed = set()
    neigh = [
        (1, 0, 1),
        (-1, 0, 1),
        (0, 1, 1),
        (0, -1, 1),
        (1, 1, 1.4),
        (1, -1, 1.4),
        (-1, 1, 1.4),
        (-1, -1, 1.4),
    ]
    expanded = 0
    while openq and expanded < 5000:
        _f, g, cx, cy = heapq.heappop(openq)
        if (cx, cy) in closed:
            continue
        closed.add((cx, cy))
        expanded += 1
        wx, wy = cx * CELL, cy * CELL
        d = (wx - gx) ** 2 + (wy - gy) ** 2
        if (snap_near and cx == gcx and cy == gcy) or d <= goal_r2:
            path = []
            x, y = cx, cy
            while True:
                path.append((x * CELL, y * CELL))
                _g, px, py = info[(x, y)]
                if (x, y) == (scx, scy):
                    break
                if (px, py) == (x, y):
                    break
                x, y = px, py
            path.reverse()
            return path
        for ox, oy, cost in neigh:
            nx, ny = cx + ox, cy + oy
            if (nx, ny) in closed or blk(nx * CELL, ny * CELL):
                continue
            if ox and oy:
                if blk((cx + ox) * CELL, cy * CELL) or blk(cx * CELL, (cy + oy) * CELL):
                    continue
            ng = g + cost
            prev = info.get((nx, ny))
            if prev and ng >= prev[0]:
                continue
            info[(nx, ny)] = (ng, cx, cy)
            heapq.heappush(openq, (ng + h(nx, ny), ng, nx, ny))
    return []


def approach_stand(solid, foot_y, from_x, from_y, solids):
    front = (solid["x"], solid["y"] - BHH - (BHH + solid["hh"] + 10))
    ring = list_stands_front(solid, from_x, from_y, solids)
    stands = [front, *ring]
    for s in stands:
        if blocked(*s, solids):
            continue
        if s[1] > foot_y + 2:
            continue
        path = find_path(solids, from_x, from_y, s[0], s[1], 14)
        if not path:
            continue
        end = path[-1]
        if math.hypot(end[0] - s[0], end[1] - s[1]) <= 22:
            return s, path, end
    if not blocked(*front, solids):
        return front, find_path(solids, from_x, from_y, *front, 14), front
    return None, [], None


def main():
    solids, trees = load()
    oak = next((t for t in trees if abs(t[1] - 249) < 5 and abs(t[2] - 195) < 5), None)
    if not oak:
        oak = min(trees, key=lambda t: (t[1] - 340) ** 2 + (t[2] - 310) ** 2)
    name, fx, fy = oak
    box = foot_solid(name, *size_for(name), fx, fy)
    print(f"TREE {name} foot=({fx:.1f},{fy:.1f})")

    players = [
        ("spawn", 160, 280),
        ("craft", 55, 300),
        ("south", 250, 140),
        ("west", 180, 200),
        ("east", 320, 200),
        ("north_pocket", 250, 240),
    ]
    fails = 0
    for label, px, py in players:
        stand, path, end = approach_stand(box, fy, px, py, solids)
        if not stand or not end:
            print(f"FAIL {label}: no stand/path")
            fails += 1
            continue
        behind = stand[1] > fy + 2 or end[1] > fy + 2
        if behind or not path:
            print(f"FAIL {label}: stand={stand} end={end} behind={behind}")
            fails += 1
        else:
            print(f"OK   {label}: stand=({stand[0]:.0f},{stand[1]:.0f}) end=({end[0]},{end[1]}) n={len(path)}")
    if fails:
        print(f"{fails} FAILURES")
        sys.exit(1)
    print("ALL PASSED — tree stands stay in front of trunk")


if __name__ == "__main__":
    main()
