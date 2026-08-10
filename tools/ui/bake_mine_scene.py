#!/usr/bin/env python3
"""Bake shallow underground mine into assets/scenes/Mine.scene.

Pure cave — no outdoor grass, no street lamps, no pines.

Layout (south → north):

            solid cliff / void rock
     NW copper pocket     NE crystal vein
            \\               /
             [main cavern]
            /      |        \\
     SW shaft    hub     SE cart bay
                   |
            [timber mouth / exit]
                   |
              sign_town (ladder-out)

    py -3.10 tools/ui/bake_mine_scene.py
"""

from __future__ import annotations

import json
import math
import re
import uuid
from pathlib import Path
from typing import Dict, List, Optional, Set, Tuple

ROOT = Path(__file__).resolve().parents[2]
SHELL_SCENE = ROOT / "assets/scenes/Main.scene"
OUT_SCENE = ROOT / "assets/scenes/Mine.scene"
OUT_META = ROOT / "assets/scenes/Mine.scene.meta"
UUID_MAP = Path(__file__).resolve().parent / "uuid-map.json"

TILE = 64
X0, X1 = -10, 10
Y0, Y1 = -8, 10

# Wide plaza: town sign → mouth → main cavern.
# Mouth sprite is ~4.5 tiles wide — need |x|<=3 floor so sides are walkable.
MOUTH_LANE = {
    (dx, iy)
    for iy in range(-7, 3)  # -7 .. +2
    for dx in range(-4, 5)  # -4 .. +4  (9 tiles — side aisles past the arch)
}
# Keep aliases used by seal / scatter helpers
DOOR_GATE = {(dx, iy) for dx, iy in MOUTH_LANE if iy <= -5}
THROAT = {(dx, iy) for dx, iy in MOUTH_LANE if iy >= -4}

# Timber frame feet (tile). Sprite is tall (~112px) — keep clear under the whole post+beam.
TIMBER_SITES = [
    (-5, -3), (5, -3), (-5, -1), (5, -0.5), (-5, 1.5), (5, 1.5),
    (-3.5, 3.5), (3.5, 3), (-4.5, 5), (1.5, 5.5), (4, 6), (-1, 4),
]


def under_structure(ix: float, iy: float) -> bool:
    """True if a floor prop would clip onto mouth / timber beams."""
    if abs(ix) <= 5 and -7 <= iy <= 0:
        return True  # mouth plaza + approach
    for tx, ty in TIMBER_SITES:
        if abs(tx) <= 4.2 and -7 <= ty <= 2:
            continue  # not placed
        # Foot + neighbors + ~3 tiles north (tall post+crossbeam silhouette)
        if abs(ix - tx) <= 1.85 and -0.6 <= (iy - ty) <= 2.9:
            return True
    return False

PROPS = {
    "mouth": ("bld-mine-mouth", 288, 224),
    "cart": ("prop-minecart", 96, 64),
    "ladder": ("prop-ladder", 64, 96),
    "torch": ("prop-torch", 48, 80),
    "timber": ("prop-timber", 96, 112),
    "sign": ("prop-sign", 64, 80),
    "craft": ("prop-craftbench", 96, 80),
    "crystalVein": ("nat-ore-crystal", 56, 64),
    "crate": ("prop-crate", 56, 56),
    "barrel": ("prop-barrel", 48, 56),
    "rails": ("prop-rails", 96, 48),
}

ORE = {
    "copper": ("nat-ore-copper", 48, 40),
    "iron": ("nat-ore-iron", 72, 56),
    "crystal": ("nat-ore-crystal", 56, 64),
}

DECOR = {
    "mushroom": ("nat-mushroom", 40, 40, "soft"),
    "rubble": ("nat-rubble", 56, 40, "soft"),
    "stalagmite": ("nat-stalagmite", 40, 64, "solid"),
    "wallCrystal": ("nat-wall-crystal", 56, 64, "solid"),
    "wallOre": ("nat-wall-ore", 56, 56, "solid"),
    "caveWall": ("nat-cave-wall", 96, 128, "solid"),
    "caveWallB": ("nat-cave-wall-b", 112, 96, "solid"),
    "pebble": ("nat-pebble", 24, 18, "soft"),
    "rock": ("nat-rock", 48, 40, "solid"),
    "rockBig": ("nat-rock-big", 72, 56, "solid"),
    "rockWet": ("nat-rock-wet", 40, 28, "solid"),
    "twig": ("nat-twig", 32, 20, "soft"),
    "oreCrystal": ("nat-ore-crystal", 56, 64, "solid"),
}

NATURE_SIZE = {
    "rock": (48, 40),
    "rockBig": (72, 56),
    "stump": (56, 48),
    "pebble": (24, 18),
    "twig": (32, 20),
}


def noise(ix: float, iy: float) -> float:
    n = math.sin(ix * 12.9898 + iy * 78.233) * 43758.5453
    return n - math.floor(n) - 0.5


def noise01(ix: float, iy: float, salt: float = 0) -> float:
    return noise(ix + salt * 17, iy - salt * 9) + 0.5


def load_uuid_map() -> Dict[str, str]:
    raw = json.loads(UUID_MAP.read_text(encoding="utf-8"))
    out: Dict[str, str] = {}
    for k, v in raw.items():
        if isinstance(v, dict) and "spriteFrame" in v:
            out[k] = v["spriteFrame"]
    return out


def load_nature() -> Dict[str, str]:
    text = (ROOT / "assets/scripts/game/NatureFrames.ts").read_text(encoding="utf-8")
    return dict(re.findall(r'"(\w+)":\s*"([^"]+)"', text))


def load_terrain() -> Dict[str, str]:
    text = (ROOT / "assets/scripts/game/TerrainFrames.ts").read_text(encoding="utf-8")
    return dict(re.findall(r'"(\w+)":\s*"([^"]+)"', text))


class MineBake:
    def __init__(self, uuids: Dict[str, str], nature: Dict[str, str], terrain: Dict[str, str]):
        self.uuids = uuids
        self.nature = nature
        self.terrain = terrain
        self.floor: Set[str] = set()
        self.dirt: Set[str] = set()
        self.clear: Set[str] = set()
        self.water: Set[str] = set()
        self.wall: Set[str] = set()
        self.nodes: List[Tuple] = []

    def sf(self, key: str) -> Optional[str]:
        return self.uuids.get(key) or self.terrain.get(key) or self.nature.get(key)

    def add_ground(self, name: str, sf: str, ix: int, iy: int) -> None:
        self.nodes.append((name, sf, ix * TILE, iy * TILE, TILE, TILE, 0.5, 0.5, True))

    def add_actor(self, name, sf, x, y, w, h, ay=0.0) -> None:
        self.nodes.append((name, sf, x, y, w, h, 0.5, ay, False))

    def mark_blob(self, target, cx, cy, rx, ry, salt=0, core=0.5) -> None:
        x0, x1 = int(math.floor(cx - rx - 2)), int(math.ceil(cx + rx + 2))
        y0, y1 = int(math.floor(cy - ry - 2)), int(math.ceil(cy + ry + 2))
        for iy in range(y0, y1 + 1):
            for ix in range(x0, x1 + 1):
                dx = (ix - cx) / max(rx, 0.35)
                dy = (iy - cy) / max(ry, 0.35)
                d = dx * dx + dy * dy
                wobble = noise01(ix, iy, salt) * 0.5 + math.sin(ix * 0.7 + iy * 0.45 + salt) * 0.08
                if d < core + wobble * 0.35:
                    target.add(f"{ix},{iy}")
                elif d < 1.05 + wobble * 0.55 and noise01(ix, iy, salt + 11) > 0.38:
                    target.add(f"{ix},{iy}")

    def mark_path_h(self, target, y, x0, x1, width=2) -> None:
        half = width // 2
        for ix in range(min(x0, x1), max(x0, x1) + 1):
            for iy in range(y - half, y - half + width):
                target.add(f"{ix},{iy}")
            if noise01(ix, y, 61) > 0.55:
                side = 1 if noise01(ix, y, 62) > 0.5 else -1
                target.add(f"{ix},{y - half + (width if side > 0 else -1)}")

    def mark_path_v(self, target, x, y0, y1, width=2) -> None:
        half = width // 2
        for iy in range(min(y0, y1), max(y0, y1) + 1):
            for ix in range(x - half, x - half + width):
                target.add(f"{ix},{iy}")
            if noise01(x, iy, 63) > 0.55:
                side = 1 if noise01(x, iy, 64) > 0.5 else -1
                target.add(f"{x - half + (width if side > 0 else -1)},{iy}")

    def soften_mask(self, target: Set[str], locked: Set[str], salt: float, rounds: int = 1) -> None:
        for r in range(rounds):
            add: Set[str] = set()
            drop: Set[str] = set()
            for key in list(target):
                if key in locked:
                    continue
                ix, iy = map(int, key.split(","))
                ortho = sum(
                    1 for dx, dy in ((0, 1), (0, -1), (1, 0), (-1, 0)) if f"{ix + dx},{iy + dy}" in target
                )
                if ortho <= 1 and noise01(ix, iy, salt + r) > 0.4:
                    drop.add(key)
                elif ortho == 2 and noise01(ix, iy, salt + r + 3) > 0.78:
                    drop.add(key)
                if ortho >= 2:
                    for dx, dy in ((0, 1), (0, -1), (1, 0), (-1, 0)):
                        nk = f"{ix + dx},{iy + dy}"
                        if nk in target or nk in locked:
                            continue
                        if noise01(ix + dx, iy + dy, salt + r + 9) < 0.22:
                            add.add(nk)
            target.difference_update(drop)
            target.update(add)

    def mark_tunnel(self, target: Set[str], x0: float, y0: float, x1: float, y1: float, radius=1.35, salt=0) -> None:
        """Organic corridor: chain of blobs along a segment (not a hard rect path)."""
        steps = max(3, int(math.hypot(x1 - x0, y1 - y0) * 2.2))
        for i in range(steps + 1):
            t = i / steps
            cx = x0 + (x1 - x0) * t + noise(i + salt, salt) * 0.55
            cy = y0 + (y1 - y0) * t + noise(salt, i + 3) * 0.55
            r = radius * (0.75 + noise01(i, salt, 3) * 0.55)
            self.mark_blob(target, cx, cy, r, r * 0.85, salt=salt + i * 0.37, core=0.32)

    def jitter_floor_rim(self) -> None:
        """Farm shoreline-style nibble / grow so chambers aren't tile-squares."""
        # Erode protruding corners
        for key in list(self.floor):
            ix, iy = map(int, key.split(","))
            ortho = sum(
                1 for dx, dy in ((0, 1), (0, -1), (1, 0), (-1, 0)) if f"{ix + dx},{iy + dy}" in self.floor
            )
            if ortho <= 1 and noise01(ix, iy, 70) > 0.42:
                self.floor.discard(key)
            elif ortho == 2 and noise01(ix, iy, 71) > 0.72:
                self.floor.discard(key)
        # Grow ragged hair on edges
        add: Set[str] = set()
        for key in list(self.floor):
            ix, iy = map(int, key.split(","))
            for dx, dy in ((0, 1), (0, -1), (1, 0), (-1, 0), (1, 1), (-1, 1), (1, -1), (-1, -1)):
                nk = f"{ix + dx},{iy + dy}"
                if nk in self.floor:
                    continue
                if noise01(ix + dx, iy + dy, 72) < 0.28:
                    add.add(nk)
        self.floor.update(add)

    def build_wall_rim(self) -> Set[str]:
        """Fully sealed rock shell — every floor edge blocked; no walk-out gaps.

        1) Mandatory 8-neighbor ring around floor (never removed)
        2) Thicken outward 2 cells
        3) Fill padded AABB so exterior is solid rock (collision seal)
        """
        floor = self.floor
        wall: Set[str] = set()

        # 1) Seal ring — ortho + diagonal (blocks corner slips)
        for key in floor:
            ix, iy = map(int, key.split(","))
            for dy in (-1, 0, 1):
                for dx in (-1, 0, 1):
                    if dx == 0 and dy == 0:
                        continue
                    nk = f"{ix + dx},{iy + dy}"
                    if nk not in floor:
                        wall.add(nk)

        # 2) Thicken shell outward (keep ring intact)
        for _ in range(2):
            add: Set[str] = set()
            for key in wall:
                ix, iy = map(int, key.split(","))
                for dx, dy in ((0, 1), (0, -1), (1, 0), (-1, 0)):
                    nk = f"{ix + dx},{iy + dy}"
                    if nk not in floor:
                        add.add(nk)
            wall.update(add)

        # 3) Fill padded AABB — anything not floor is solid wall
        xs = [int(k.split(",")[0]) for k in floor]
        ys = [int(k.split(",")[1]) for k in floor]
        pad = 3
        x0, x1 = min(xs) - pad, max(xs) + pad
        y0, y1 = min(ys) - pad, max(ys) + pad
        for iy in range(y0, y1 + 1):
            for ix in range(x0, x1 + 1):
                nk = f"{ix},{iy}"
                if nk not in floor:
                    wall.add(nk)

        # Safety: re-add ring
        for key in floor:
            ix, iy = map(int, key.split(","))
            for dy in (-1, 0, 1):
                for dx in (-1, 0, 1):
                    if dx == 0 and dy == 0:
                        continue
                    nk = f"{ix + dx},{iy + dy}"
                    if nk not in floor:
                        wall.add(nk)

        # Cut wide mouth plaza (floor) — no ±2 buttresses (those pinched the sides)
        for ix, iy in MOUTH_LANE:
            nk = f"{ix},{iy}"
            wall.discard(nk)
            floor.add(nk)
        # Outer walls farther out — plaza shoulders |x|<=4 stay floor
        for iy in range(-7, 3):
            for dx in range(-4, 5):
                nk = f"{dx},{iy}"
                wall.discard(nk)
                floor.add(nk)
            for dx in (-6, -5, 5, 6):
                bk = f"{dx},{iy}"
                if bk not in floor:
                    wall.add(bk)
        # Outer rock south of the sign stays sealed (no walk-out)
        for ix in range(-6, 7):
            for iy in (-8, -9, -10):
                nk = f"{ix},{iy}"
                if (ix, iy) not in MOUTH_LANE:
                    wall.add(nk)
                    floor.discard(nk)

        return wall

    def assert_sealed(self) -> int:
        """Return count of floor edge gaps (must be 0)."""
        gaps = 0
        for key in self.floor:
            ix, iy = map(int, key.split(","))
            for dy in (-1, 0, 1):
                for dx in (-1, 0, 1):
                    if dx == 0 and dy == 0:
                        continue
                    nk = f"{ix + dx},{iy + dy}"
                    if nk not in self.floor and nk not in self.wall:
                        gaps += 1
        return gaps

    def build_layout(self) -> None:
        """Organic underground chambers — blob rooms + blob tunnels, ragged rim."""
        # Chambers (elliptical blobs, not rects)
        self.mark_blob(self.floor, 0, -6.2, 4.4, 2.2, salt=1, core=0.42)   # wide exit vestibule
        self.mark_blob(self.floor, 0, -3.4, 4.8, 2.6, salt=2, core=0.42)   # wide mouth plaza
        self.mark_blob(self.floor, 0, 2.2, 5.0, 3.8, salt=3, core=0.42)    # main cavern
        self.mark_blob(self.floor, -6.2, 5.2, 2.9, 2.3, salt=4, core=0.38)  # NW copper
        self.mark_blob(self.floor, 5.2, 7.0, 2.7, 2.1, salt=5, core=0.38)   # NE crystal
        self.mark_blob(self.floor, 6.2, 1.0, 2.5, 2.0, salt=6, core=0.38)   # SE cart
        self.mark_blob(self.floor, -5.2, 0.2, 2.3, 1.8, salt=7, core=0.38)  # SW shaft

        # Organic tunnels (no hard mark_path corridors)
        self.mark_tunnel(self.floor, 0, -6.5, 0, -3.5, radius=2.4, salt=20)
        # Wide throat mouth → main cavern (room to pass either side of the arch)
        self.mark_tunnel(self.floor, 0, -4.0, 0, 2.0, radius=2.8, salt=21)
        self.mark_tunnel(self.floor, 0, 2, -5.5, 4.5, radius=1.2, salt=22)
        self.mark_tunnel(self.floor, 0, 3, 4.8, 6.2, radius=1.15, salt=23)
        self.mark_tunnel(self.floor, 1, 1.2, 5.5, 1.0, radius=1.2, salt=24)
        self.mark_tunnel(self.floor, -1, 0.5, -4.8, 0.2, radius=1.15, salt=25)
        # SE cart bay shoulder (prevents orphan floor pockets at x=8)
        self.mark_blob(self.floor, 7.5, 0.2, 1.6, 1.4, salt=26, core=0.35)

        # Ore dirt veins — soft blobs, then soften
        self.mark_blob(self.dirt, -6, 5.2, 2.0, 1.6, salt=8, core=0.3)
        self.mark_blob(self.dirt, 6, 0.6, 1.6, 1.2, salt=9, core=0.28)
        self.mark_blob(self.dirt, -2.2, 2.2, 1.4, 1.1, salt=10, core=0.26)
        self.mark_blob(self.dirt, 2.8, 3.2, 1.3, 1.0, salt=11, core=0.25)
        self.mark_blob(self.dirt, 0.5, -2.5, 1.1, 0.8, salt=14, core=0.24)

        # Drip pools — organic blobs (shore jittered below; keep off dirt cores)
        self.mark_blob(self.water, 2.2, 4.6, 1.9, 1.4, salt=12, core=0.32)
        self.mark_blob(self.water, -3.6, 3.4, 1.7, 1.3, salt=13, core=0.3)

        for cx, cy, rx, ry in (
            (0, -4, 4.0, 2.2),
            (0, -6.5, 3.6, 1.6),
            (-5, 0, 1.8, 1.6),
            (6, 1, 1.8, 1.6),
            (5, 7, 1.8, 1.6),
        ):
            self.mark_blob(self.clear, cx, cy, rx, ry, salt=cx * 3 + cy, core=0.35)

        # Lock the full mouth plaza so soften/jitter cannot pinch side aisles
        spine: Set[str] = {f"{ix},{iy}" for ix, iy in MOUTH_LANE}
        for iy in range(-6, 5):
            for dx in (-2, -1, 0, 1, 2):
                spine.add(f"{dx},{iy}")
        self.soften_mask(self.floor, locked=spine, salt=40, rounds=3)
        self.jitter_floor_rim()
        self.soften_mask(self.floor, locked=spine, salt=44, rounds=1)

        # Dirt only on floor; soften dirt rims
        self.dirt &= self.floor
        self.soften_mask(self.dirt, locked=set(), salt=50, rounds=2)
        self.dirt &= self.floor
        self.water &= self.floor
        self.water -= self.dirt
        self.soften_water_shore()
        # wet dirt rim around pools (breaks hard water / cave floor cut)
        for key in list(self.water):
            ix, iy = map(int, key.split(","))
            for dx, dy in ((0, 1), (0, -1), (1, 0), (-1, 0), (1, 1), (-1, 1), (1, -1), (-1, -1)):
                nk = f"{ix + dx},{iy + dy}"
                if nk in self.floor and nk not in self.water and noise01(ix + dx, iy + dy, 77) > 0.35:
                    self.dirt.add(nk)
        self.dirt -= self.water
        # water must sit on floor
        for key in list(self.water):
            self.floor.add(key)

        # Drop orphan floor pockets (not reachable from spawn spine)
        self.cull_orphan_floor(seed="0,-3")

        self.wall = self.build_wall_rim()
        # Mouth plaza must remain floor (wide side aisles around the arch)
        for ix, iy in MOUTH_LANE:
            self.floor.add(f"{ix},{iy}")
            self.wall.discard(f"{ix},{iy}")
            self.clear.add(f"{ix},{iy}")
        gaps = self.assert_sealed()
        # Gate south tip may touch padded void outside AABB pad — ignore those
        gate_keys = {f"{ix},{iy}" for ix, iy in MOUTH_LANE if iy <= -5}
        if gaps:
            # Recount excluding intentional open edge at gate mouth (south of gate)
            real = 0
            for key in self.floor:
                if key in gate_keys:
                    continue
                ix, iy = map(int, key.split(","))
                for dy in (-1, 0, 1):
                    for dx in (-1, 0, 1):
                        if dx == 0 and dy == 0:
                            continue
                        nk = f"{ix + dx},{iy + dy}"
                        if nk not in self.floor and nk not in self.wall:
                            real += 1
            if real:
                print(f"WARN floor edge gaps: {real}")
            else:
                print(f"OK sealed (doorway open, non-gate gaps=0; raw={gaps})")

    def paint_terrain(self) -> None:
        water_sf = self.sf("water") or self.sf("tile-water")
        cave_vars = [k for k in ("cave", "caveB", "caveC", "tile-cave") if self.sf(k)]
        wall_vars = [k for k in ("caveWall", "caveWallB", "caveWallC") if self.sf(k)]
        dirt_vars = [k for k in ("caveDirt", "caveDirtB") if self.sf(k)]
        if not dirt_vars:
            dirt_vars = [k for k in ("dirt", "dirtB") if self.sf(k)]
        # Never use outdoor brown tile-cliff for mine walls
        wall_fallback = self.sf("cave") or self.sf("tile-cave")

        painted = self.floor | self.dirt | self.water | self.wall

        for key in sorted(painted, key=lambda k: (int(k.split(",")[1]), int(k.split(",")[0]))):
            ix, iy = map(int, key.split(","))
            if key in self.water and water_sf:
                self.add_ground(f"pond_water_{ix}_{iy}", water_sf, ix, iy)
                continue
            if key in self.dirt:
                pick = dirt_vars[abs(int(noise(ix, iy) * 1000)) % len(dirt_vars)] if dirt_vars else None
                sf = self.sf(pick) if pick else None
                if sf:
                    self.add_ground(f"tile-cave_dirt_{ix}_{iy}", sf, ix, iy)
                continue
            if key in self.floor:
                pick = cave_vars[abs(int(noise(ix * 1.7, iy * 1.3) * 1000)) % len(cave_vars)] if cave_vars else None
                sf = self.sf(pick) if pick else None
                if sf:
                    self.add_ground(f"tile-cave_{ix}_{iy}", sf, ix, iy)
                continue
            # Solid cave rock mass (keep cliff_ name for collision / YSort ground)
            if wall_vars:
                pick = wall_vars[abs(int(noise(ix * 2.1, iy * 1.9) * 1000)) % len(wall_vars)]
                sf = self.sf(pick)
            else:
                sf = wall_fallback
            if sf:
                self.add_ground(f"cliff_{ix}_{iy}", sf, ix, iy)

        self.paint_dirt_fringe()
        self.paint_water_fringe()
        self.paint_floor_wall_fringe()
        # Fringe on wall cells facing floor — rock lip into the chamber
        self.paint_wall_inner_fringe()

    def paint_dirt_fringe(self) -> None:
        """Cave-rock fringe onto dirt veins — breaks square dirt patches."""

        def soft(ix, iy):
            key = f"{ix},{iy}"
            return key in self.floor and key not in self.dirt and key not in self.water

        for key in self.dirt:
            ix, iy = map(int, key.split(","))
            self._fringe_cell(ix, iy, soft, "fringe_dirt_", cave=True)

    def paint_floor_wall_fringe(self) -> None:
        """Cave floor cells touching wall get rock fringe (breaks floor/wall square cut)."""

        def is_wall(ix, iy):
            return f"{ix},{iy}" in self.wall

        for key in self.floor:
            if key in self.dirt or key in self.water:
                continue
            ix, iy = map(int, key.split(","))
            if not any(is_wall(ix + dx, iy + dy) for dx, dy in ((0, 1), (0, -1), (1, 0), (-1, 0))):
                continue
            self._fringe_cell(ix, iy, is_wall, "fringe_wall_", cave=True)

    def paint_wall_inner_fringe(self) -> None:
        """Wall cells that face floor get cave fringe — reads as rock lip, not brown ledge."""

        def is_floor(ix, iy):
            key = f"{ix},{iy}"
            return key in self.floor or key in self.dirt or key in self.water

        for key in self.wall:
            ix, iy = map(int, key.split(","))
            if not any(is_floor(ix + dx, iy + dy) for dx, dy in ((0, 1), (0, -1), (1, 0), (-1, 0))):
                continue
            self._fringe_cell(ix, iy, is_floor, "fringe_wallface_", cave=True)

    def cull_orphan_floor(self, seed: str = "0,-3") -> None:
        """Keep only the floor component connected to seed (spawn area)."""
        if seed not in self.floor:
            # fallback: largest component
            seed = next(iter(self.floor), seed)
        seen: Set[str] = set()
        stack = [seed]
        while stack:
            key = stack.pop()
            if key in seen or key not in self.floor:
                continue
            seen.add(key)
            ix, iy = map(int, key.split(","))
            for dx, dy in ((0, 1), (0, -1), (1, 0), (-1, 0)):
                stack.append(f"{ix + dx},{iy + dy}")
        removed = self.floor - seen
        if removed:
            self.floor = seen
            self.dirt &= self.floor
            self.water &= self.floor
            self.clear &= self.floor
            print(f"culled orphan floor cells: {len(removed)}")

    def soften_water_shore(self) -> None:
        """Gentle shoreline jitter — keep pools intact, avoid square rims."""
        if not self.water:
            return
        # Prefer growing soft bays; only nibble obvious 1-neighbor spikes
        rim_add: Set[str] = set()
        rim_del: Set[str] = set()
        for key in list(self.water):
            ix, iy = map(int, key.split(","))
            ortho = sum(
                1
                for dx, dy in ((0, 1), (0, -1), (1, 0), (-1, 0))
                if f"{ix + dx},{iy + dy}" in self.water
            )
            if ortho == 0:
                rim_del.add(key)
                continue
            # Grow irregular shoreline onto neighboring floor
            if noise01(ix, iy, 73) < 0.4:
                for dx, dy in ((0, 1), (0, -1), (1, 0), (-1, 0), (1, 1), (-1, 1), (1, -1), (-1, -1)):
                    nk = f"{ix + dx},{iy + dy}"
                    if (
                        nk in self.floor
                        and nk not in self.water
                        and nk not in self.dirt
                        and noise01(ix + dx, iy + dy, 74) < 0.5
                    ):
                        rim_add.add(nk)
            # Light nibble on exposed tips only
            if ortho == 1 and noise01(ix, iy, 71) > 0.55:
                rim_del.add(key)
        # Never shrink a pool below 4 cells
        tentative = (self.water | rim_add) - rim_del
        tentative &= self.floor
        if len(tentative) >= 4:
            self.water = tentative
        else:
            self.water |= rim_add
            self.water &= self.floor
        # Drop only true orphans (no ortho neighbor)
        for key in list(self.water):
            ix, iy = map(int, key.split(","))
            if not any(
                f"{ix + dx},{iy + dy}" in self.water
                for dx, dy in ((0, 1), (0, -1), (1, 0), (-1, 0))
            ):
                self.water.discard(key)

    def paint_water_fringe(self) -> None:
        if not self.water:
            return

        def land(ix, iy):
            return f"{ix},{iy}" not in self.water

        # Cave rock fringe (NOT outdoor grass) — soft purple lip over drip pools
        for key in self.water:
            ix, iy = map(int, key.split(","))
            self._fringe_cell(ix, iy, land, "fringe_water_", cave=True)

    def _fringe_cell(self, ix, iy, is_soft_side, prefix, cave: bool = False) -> None:
        n = is_soft_side(ix, iy + 1)
        e = is_soft_side(ix + 1, iy)
        s = is_soft_side(ix, iy - 1)
        w = is_soft_side(ix - 1, iy)
        ne = is_soft_side(ix + 1, iy + 1)
        nw = is_soft_side(ix - 1, iy + 1)
        se = is_soft_side(ix + 1, iy - 1)
        sw = is_soft_side(ix - 1, iy - 1)
        if not (n or e or s or w or ne or nw or se or sw):
            return
        cn = ce = cs = cw = False

        def frame(name: str) -> str:
            # fringeOutNE -> caveFringeOutNE when cave=True
            if not cave:
                return name
            return "cave" + name[0].upper() + name[1:] if name.startswith("fringe") else name

        def place(suffix, fname):
            sf = self.sf(frame(fname)) or self.sf(fname)
            if sf:
                self.add_ground(f"{prefix}{suffix}_{ix}_{iy}", sf, ix, iy)

        if n and e:
            place("out_ne", "fringeOutNE"); cn = ce = True
        if n and w:
            place("out_nw", "fringeOutNW"); cn = cw = True
        if s and e:
            place("out_se", "fringeOutSE"); cs = ce = True
        if s and w:
            place("out_sw", "fringeOutSW"); cs = cw = True
        if n and not cn:
            place("n", "fringeN")
        if e and not ce:
            place("e", "fringeE")
        if s and not cs:
            place("s", "fringeS")
        if w and not cw:
            place("w", "fringeW")
        if (not n) and (not e) and ne:
            place("in_ne", "fringeInNE")
        if (not n) and (not w) and nw:
            place("in_nw", "fringeInNW")
        if (not s) and (not e) and se:
            place("in_se", "fringeInSE")
        if (not s) and (not w) and sw:
            place("in_sw", "fringeInSW")

    def _prop(self, kind, x, y, name=None) -> None:
        key, w, h = PROPS[kind]
        sf = self.sf(key)
        if not sf:
            print("missing sprite", key)
            return
        self.add_actor(name or f"prop_{kind}", sf, x, y, w, h, 0.0)

    def place_actors(self) -> None:
        foot = 28

        def at(tx, ty):
            return tx * TILE, ty * TILE + foot

        # Landmark props — mouth sits on south lip; throat north of it stays open
        self._prop("mouth", *at(0, -5), "bld_mine_mouth")
        self._prop("sign", *at(0, -7), "sign_town")
        self._prop("ladder", *at(-5, 0), "bld_elevator")
        self._prop("cart", *at(6, 1), "prop_minecart")
        self._prop("craft", *at(7, 0), "bld_sorting")
        self._prop("crystalVein", *at(5, 7), "spc_crystal_vein")

        # Rails only north of mouth sprite top (mouth foot y=-292, h=224 → top≈-68)
        for i, (tx, ty) in enumerate([(0, 0.8), (0, 1.6), (2, 1.2), (4, 1.3), (5.5, 1.4)]):
            self._prop("rails", tx * TILE, ty * TILE + foot - 8, f"prop_rails_{i}")

        # Timber frames — keep mouth plaza clear
        for i, (tx, ty) in enumerate(TIMBER_SITES):
            if abs(tx) <= 4.2 and -7 <= ty <= 2:
                continue
            self._prop("timber", *at(int(round(tx)), int(round(ty))), f"prop_timber_{i}")

        # Staging clutter — against outer walls only, never on timber / mouth
        for i, (kind, tx, ty) in enumerate([
            ("crate", -6.5, -4.5), ("crate", 6.5, -4.5),
            ("barrel", -6.2, -2.5), ("barrel", 6.2, -2.5),
            ("crate", 7, 0), ("barrel", 7.5, 1.5),
            ("crate", -7, 1), ("barrel", -7.5, 0.5), ("crate", 3, 7),
            ("barrel", 6, 8), ("crate", -3, 6),
        ]):
            if under_structure(tx, ty):
                continue
            jx = noise(tx, ty) * 10
            jy = noise(ty, tx) * 8
            self._prop(kind, tx * TILE + jx, ty * TILE + foot + jy, f"prop_{kind}_{i}")

        # Torches — flanks / walls, never on timber footprints
        for i, (tx, ty) in enumerate([
            (-6, -4), (6, -4), (-6, -2), (6, -1), (-6, 1), (6, 1),
            (-6, 3), (6, 3), (-6, 5), (6, 5), (2, 8), (-2, 7),
            (0, 6), (5, 4), (-3, 7),
        ]):
            if under_structure(tx, ty):
                continue
            self._prop("torch", *at(tx, ty), f"prop_torch_{i}")

    def place_ore_nodes(self) -> None:
        # Away from mouth / timber beams / landmarks
        placements = [
            ("copper", -7, 5, "rock"), ("copper", -6, 7, "rock"), ("copper", -7, 6, "rock"),
            ("copper", -8, 4, "rock"), ("copper", -4, 7, "rock"), ("copper", -6, 3, "rock"),
            ("copper", -5, 8, "rock"), ("copper", -3, 7, "rock"),
            ("copper", -2, 6, "rock"), ("copper", 1, 6, "rock"),
            ("copper", 2, 5, "rock"), ("copper", -8, 6, "rock"),
            ("iron", 8, 2, "rockBig"), ("iron", 8, 3, "rockBig"), ("iron", 7, 3, "rock"),
            ("iron", 9, 1, "rock"), ("iron", 8, 0, "rock"), ("iron", 7, 4, "rockBig"),
            ("crystal", 4, 8, "rock"), ("crystal", 6, 9, "rock"), ("crystal", 3, 8, "rock"),
            ("crystal", 3.5, 9, "rock"), ("crystal", 7, 8, "rock"),
        ]
        keepout = [
            (0, -5, 3.5),   # mouth plaza
            (6, 1, 2.0),    # cart
            (7, 0, 1.6),    # sorting
            (5, 7, 1.8),    # crystal vein
            (-5, 0, 1.5),   # elevator
        ]
        for i, (kind, tx, ty, size) in enumerate(placements):
            if under_structure(tx, ty):
                continue
            if any((tx - kx) ** 2 + (ty - ky) ** 2 < kr * kr for kx, ky, kr in keepout):
                continue
            key, w, h = ORE[kind]
            sf = self.sf(key)
            if not sf:
                sf = self.sf("nat-rock" if size == "rock" else "nat-rock-big")
                w, h = NATURE_SIZE.get(size, (48, 40))
            if not sf:
                continue
            jx = noise(tx, ty) * 8
            jy = noise(ty, tx) * 6
            rock_tag = "rockBig" if size == "rockBig" else "rock"
            self.add_actor(
                f"decor_{rock_tag}_solid_ore_{kind}_{i}",
                sf,
                tx * TILE + jx,
                ty * TILE + 22 + jy,
                w,
                h,
                0.0,
            )

    def _decor(self, kind: str, x: float, y: float, n: int) -> bool:
        spec = DECOR.get(kind)
        if not spec:
            return False
        key, w, h, tag = spec
        sf = self.sf(key) or self.nature.get(kind)
        if not sf:
            return False
        self.add_actor(f"decor_{kind}_{tag}_d{n}", sf, x, y, w, h, 0.0)
        return True

    def place_scatter(self) -> None:
        """Dense cave floor clutter — mushrooms, rubble, rocks, crates leftovers."""
        n = 0
        for iy in range(Y0, Y1 + 1):
            for ix in range(X0, X1 + 1):
                key = f"{ix},{iy}"
                # Nothing on mouth / under timber beams (clips onto crossbars)
                if under_structure(ix, iy):
                    continue
                if key in self.clear and key not in self.dirt:
                    dens = 0.12
                elif key in self.water:
                    dens = 0.35  # wet rocks / mushrooms by pools
                elif key not in self.floor:
                    continue
                elif key in self.dirt:
                    dens = 0.42
                else:
                    dens = 0.28
                if noise01(ix, iy, 51) > dens:
                    continue
                roll = noise01(ix, iy, 52)
                shore = key in self.water or any(
                    f"{ix + dx},{iy + dy}" in self.water
                    for dx, dy in ((0, 1), (0, -1), (1, 0), (-1, 0))
                )
                if shore:
                    kind = "rockWet" if roll < 0.35 else "mushroom" if roll < 0.7 else "rubble"
                elif key in self.dirt:
                    if roll < 0.22:
                        kind = "rubble"
                    elif roll < 0.4:
                        kind = "pebble"
                    elif roll < 0.55:
                        kind = "mushroom"
                    elif roll < 0.7:
                        kind = "rock"
                    elif roll < 0.82:
                        kind = "twig"
                    else:
                        kind = "stalagmite"
                else:
                    if roll < 0.18:
                        kind = "mushroom"
                    elif roll < 0.34:
                        kind = "rubble"
                    elif roll < 0.48:
                        kind = "pebble"
                    elif roll < 0.62:
                        kind = "rock"
                    elif roll < 0.72:
                        kind = "stalagmite"
                    elif roll < 0.8:
                        kind = "oreCrystal"
                    elif roll < 0.9:
                        kind = "rockBig"
                    else:
                        kind = "twig"
                x = ix * TILE + noise(ix, iy) * 18
                y = iy * TILE + noise(iy, ix) * 14
                if self._decor(kind, x, y, n):
                    n += 1
                    # occasional second soft clutter same cell
                    if noise01(ix, iy, 54) > 0.62 and kind in ("rubble", "mushroom", "rock"):
                        if self._decor("pebble" if kind != "mushroom" else "mushroom", x + 12, y - 6, n):
                            n += 1

    def place_wall_decor(self) -> None:
        """Seal EVERY floor-adjacent wall cell with stone wall props — no gaps."""
        sf_a = self.sf("nat-cave-wall")
        sf_b = self.sf("nat-cave-wall-b")
        if not sf_a and not sf_b:
            print("missing nat-cave-wall sprites — cannot seal with stone faces")
            return

        # Rings: cells that touch floor (ring0) and one cell farther (ring1)
        ring0: List[Tuple[int, int]] = []
        ring1: List[Tuple[int, int]] = []
        for key in self.wall:
            ix, iy = map(int, key.split(","))
            touch0 = any(
                f"{ix + dx},{iy + dy}" in self.floor
                for dx, dy in ((0, 1), (0, -1), (1, 0), (-1, 0), (1, 1), (-1, 1), (1, -1), (-1, -1))
            )
            if touch0:
                ring0.append((ix, iy))
            else:
                touch1 = any(
                    f"{ix + dx},{iy + dy}" in self.wall
                    and any(
                        f"{ix + dx + ox},{iy + dy + oy}" in self.floor
                        for ox, oy in ((0, 1), (0, -1), (1, 0), (-1, 0))
                    )
                    for dx, dy in ((0, 1), (0, -1), (1, 0), (-1, 0))
                )
                if touch1:
                    ring1.append((ix, iy))

        n = 0
        def in_walk_lane(ix: int, iy: int) -> bool:
            """No seal rocks on plaza / shoulders; seals only on outer rim |x|>=5."""
            if (ix, iy) in MOUTH_LANE:
                return True
            if abs(ix) <= 4 and -7 <= iy <= 2:
                return True
            return False

        # Dense seal on ring0 — skip door + north throat
        for ix, iy in ring0:
            if in_walk_lane(ix, iy):
                continue
            if (ix + iy) & 1 and sf_b:
                sf = sf_b
            elif sf_a:
                sf = sf_a
            else:
                sf = sf_b
            w, h = (96, 128) if sf == sf_a else (112, 96)
            x = ix * TILE + noise(ix, iy) * 6
            y = iy * TILE + 10
            self.add_actor(f"cliff_seal_{ix}_{iy}", sf, x, y, w, h, 0.0)
            n += 1
            if ((ix + iy) & 1) == 0 and not in_walk_lane(ix, iy):
                sf2 = sf_b or sf_a
                w2, h2 = (112, 96) if sf2 == sf_b else (96, 128)
                self.add_actor(
                    f"cliff_seal_x_{ix}_{iy}",
                    sf2,
                    x + 22,
                    y - 4,
                    w2,
                    h2,
                    0.0,
                )
                n += 1

        for ix, iy in ring1:
            if in_walk_lane(ix, iy):
                continue
            if noise01(ix, iy, 89) > 0.35:
                continue
            sf = sf_b or sf_a
            w, h = (112, 96) if sf == sf_b else (96, 128)
            self.add_actor(
                f"cliff_seal_r1_{ix}_{iy}",
                sf,
                ix * TILE,
                iy * TILE + 8,
                w,
                h,
                0.0,
            )
            n += 1

        for ix, iy in ring0:
            if in_walk_lane(ix, iy):
                continue
            if under_structure(ix, iy):
                continue
            x = ix * TILE
            y = iy * TILE + 16
            if noise01(ix, iy, 91) < 0.35:
                accent = "wallCrystal" if noise01(ix, iy, 92) > 0.5 else "wallOre"
                self._decor(accent, x + 10, y + 20, n)
                n += 1
            if noise01(ix, iy, 93) > 0.7 and self.sf("prop-torch"):
                self._prop("torch", x + 8, y + 28, f"prop_torch_wall_{n}")
                n += 1

        print(f"wall seal faces: ring0={len(ring0)} placed≈{n} (door+throat open)")

    def build(self) -> List[Tuple]:
        self.build_layout()
        self.paint_terrain()
        self.place_actors()
        self.place_ore_nodes()
        self.place_scatter()
        self.place_wall_decor()
        self.nodes.insert(0, ("__mine_baked", None, 0, 0, 1, 1, 0.5, 0.5, True))
        self.nodes.append(("__mine_spawn", None, 0, -3 * TILE, 1, 1, 0.5, 0.5, True))
        return self.nodes


def make_sprite_node(data, world_id, name, sf, x, y, w, h, ax, ay) -> int:
    node_id = len(data)
    ui_id = node_id + 1
    comps = [{"__id__": ui_id}]
    if sf:
        comps.append({"__id__": node_id + 2})
    data.append(
        {
            "__type__": "cc.Node",
            "_name": name,
            "_objFlags": 0,
            "_parent": {"__id__": world_id},
            "_children": [],
            "_active": True,
            "_components": comps,
            "_prefab": None,
            "_lpos": {"__type__": "cc.Vec3", "x": x, "y": y, "z": 0},
            "_lrot": {"__type__": "cc.Quat", "x": 0, "y": 0, "z": 0, "w": 1},
            "_lscale": {"__type__": "cc.Vec3", "x": 1, "y": 1, "z": 1},
            "_layer": 33554432,
            "_euler": {"__type__": "cc.Vec3", "x": 0, "y": 0, "z": 0},
            "_id": f"nMine_{node_id}",
        }
    )
    data.append(
        {
            "__type__": "cc.UITransform",
            "_name": "",
            "_objFlags": 0,
            "node": {"__id__": node_id},
            "_enabled": True,
            "__prefab": None,
            "_contentSize": {"__type__": "cc.Size", "width": w, "height": h},
            "_anchorPoint": {"__type__": "cc.Vec2", "x": ax, "y": ay},
            "_id": f"uMine_{ui_id}",
        }
    )
    if sf:
        sp_id = node_id + 2
        data.append(
            {
                "__type__": "cc.Sprite",
                "_name": "",
                "_objFlags": 0,
                "node": {"__id__": node_id},
                "_enabled": True,
                "__prefab": None,
                "_customMaterial": None,
                "_srcBlendFactor": 2,
                "_dstBlendFactor": 4,
                "_color": {"__type__": "cc.Color", "r": 255, "g": 255, "b": 255, "a": 255},
                "_spriteFrame": {"__uuid__": sf, "__expectedType__": "cc.SpriteFrame"},
                "_type": 0,
                "_fillType": 0,
                "_sizeMode": 0,
                "_fillCenter": {"__type__": "cc.Vec2", "x": 0, "y": 0},
                "_fillStart": 0,
                "_fillRange": 0,
                "_isTrimmedMode": False,
                "_useGrayscale": False,
                "_atlas": None,
                "_id": f"sMine_{sp_id}",
            }
        )
    return node_id


def collect_subtree_ids(data, root_id) -> Set[int]:
    ids: Set[int] = set()
    stack = [c["__id__"] for c in data[root_id].get("_children", [])]
    while stack:
        nid = stack.pop()
        if nid in ids or nid >= len(data):
            continue
        ids.add(nid)
        node = data[nid]
        if not isinstance(node, dict):
            continue
        for c in node.get("_components", []):
            ids.add(c["__id__"])
        for c in node.get("_children", []):
            stack.append(c["__id__"])
    return ids


def remap_ids(obj, id_map):
    if isinstance(obj, dict):
        if set(obj.keys()) == {"__id__"} and isinstance(obj["__id__"], int):
            nid = obj["__id__"]
            if nid not in id_map:
                return None
            return {"__id__": id_map[nid]}
        return {k: remap_ids(v, id_map) for k, v in obj.items()}
    if isinstance(obj, list):
        out = []
        for v in obj:
            rv = remap_ids(v, id_map)
            if rv is None and isinstance(v, dict) and set(v.keys()) == {"__id__"}:
                continue
            out.append(rv)
        return out
    return obj


def main() -> None:
    uuids = load_uuid_map()
    nature = load_nature()
    terrain = load_terrain()
    for k, v in terrain.items():
        uuids.setdefault(k, v)

    baked = MineBake(uuids, nature, terrain).build()

    src = json.loads(SHELL_SCENE.read_text(encoding="utf-8"))
    world_id = next(
        i
        for i, o in enumerate(src)
        if isinstance(o, dict) and o.get("__type__") == "cc.Node" and o.get("_name") == "World"
    )
    drop = collect_subtree_ids(src, world_id)
    src[world_id]["_children"] = []
    keep_old = [i for i in range(len(src)) if i not in drop]
    id_map = {old: new for new, old in enumerate(keep_old)}
    new_data = [remap_ids(src[old], id_map) for old in keep_old]
    new_world_id = id_map[world_id]

    for obj in new_data:
        if isinstance(obj, dict) and obj.get("__type__") in ("cc.SceneAsset", "cc.Scene"):
            obj["_name"] = "Mine"

    world = new_data[new_world_id]
    ground = [n for n in baked if n[0] in ("__mine_baked", "__mine_spawn") or n[8]]
    actors = [n for n in baked if n[0] not in ("__mine_baked", "__mine_spawn") and not n[8]]
    ordered = ground + actors

    child_refs = []
    for name, sf, x, y, w, h, ax, ay, _g in ordered:
        nid = make_sprite_node(new_data, new_world_id, name, sf, x, y, w, h, ax, ay)
        child_refs.append({"__id__": nid})
    world["_children"] = child_refs

    scene_uuid = str(uuid.uuid4())
    if OUT_META.exists():
        try:
            scene_uuid = json.loads(OUT_META.read_text(encoding="utf-8")).get("uuid", scene_uuid)
        except Exception:
            pass
    for obj in new_data:
        if isinstance(obj, dict) and obj.get("__type__") == "cc.Scene":
            obj["_id"] = scene_uuid

    OUT_SCENE.write_text(json.dumps(new_data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    OUT_META.write_text(
        json.dumps(
            {
                "ver": "1.1.50",
                "importer": "scene",
                "imported": True,
                "uuid": scene_uuid,
                "files": [".json"],
                "subMetas": {},
                "userData": {},
            },
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    print(f"Wrote {OUT_SCENE} ({len(ordered)} world nodes)")
    print(f"uuid={scene_uuid}")
    names = [n[0] for n in ordered]
    bad = [n for n in names if n.startswith("lamp_") or n.startswith("tile-grass") or "pine" in n]
    if bad:
        print("WARN outdoor leftovers:", bad[:8])
    else:
        print("OK underground-only (no grass/pine/street-lamp)")

    # Seal verification from baked node names
    floor_cells = set()
    wall_cells = set()
    for n in names:
        if n.startswith("tile-cave_") and "_dirt_" not in n:
            parts = n.rsplit("_", 2)
            if len(parts) >= 3:
                try:
                    floor_cells.add(f"{int(parts[-2])},{int(parts[-1])}")
                except ValueError:
                    pass
        if n.startswith("tile-cave_dirt_"):
            parts = n.rsplit("_", 2)
            try:
                floor_cells.add(f"{int(parts[-2])},{int(parts[-1])}")
            except ValueError:
                pass
        if n.startswith("pond_water_"):
            parts = n.rsplit("_", 2)
            try:
                floor_cells.add(f"{int(parts[-2])},{int(parts[-1])}")
            except ValueError:
                pass
        if n.startswith("cliff_"):
            parts = n.rsplit("_", 2)
            try:
                wall_cells.add(f"{int(parts[-2])},{int(parts[-1])}")
            except ValueError:
                pass
    gaps = 0
    for key in floor_cells:
        ix, iy = map(int, key.split(","))
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                if dx == 0 and dy == 0:
                    continue
                nk = f"{ix + dx},{iy + dy}"
                if nk not in floor_cells and nk not in wall_cells:
                    gaps += 1
    if gaps:
        print(f"FAIL seal: {gaps} open edge neighbors")
    else:
        print(f"OK sealed: floor={len(floor_cells)} wall={len(wall_cells)} gaps=0")


if __name__ == "__main__":
    main()
