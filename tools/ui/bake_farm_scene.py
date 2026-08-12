#!/usr/bin/env python3.12
"""Bake FarmWorldLayout into assets/scenes/Main.scene (in-place).

Runtime GameBootstrap skips FarmWorldLayout.apply when World has `__farm_baked`.
Re-run after layout/art changes:

    python3.12 tools/ui/bake_farm_scene.py
"""

from __future__ import annotations

import json
import math
import re
from pathlib import Path
from typing import Dict, List, Optional, Set, Tuple

ROOT = Path(__file__).resolve().parents[2]
SCENE = ROOT / "assets/scenes/Main.scene"
SCENE_META = ROOT / "assets/scenes/Main.scene.meta"
NATURE_JSON = Path(__file__).resolve().parent / "nature-frames.json"
TERRAIN_JSON = Path(__file__).resolve().parent / "terrain-frames.json"

TILE = 64
BRIDGE_W = 256
BRIDGE_H = 88
BRIDGE_RAIL_H = 40
BRIDGE_UUID = "7aa6cfc8-27bf-4b43-b089-e517d86b64a2@f9941"
BRIDGE_RAIL_S_UUID = "42966d38-2c6d-44fb-b938-bf882cb6890f@f9941"
SIGN_UUID = "6bf7ecb9-7750-4efd-9f82-84534ceaef25@f9941"
# Door portal VFX — keep in sync with tools/ui/uuid-map.json prop-door-portal
DOOR_PORTAL_UUID = "646bfc2e-e2a7-49b4-a483-28910cd64d3c@f9941"
# East town gate — keep in sync with StoryWorldHooks.FARM_TOWN_PORTAL
TOWN_GATE = (13 * TILE, 4 * TILE + 36)
# Hero cottage feet — skip soft clutter inside the building body
COTTAGE_FOOT = (220, 400, 288, 272)

HIDE_PROPS = {
    "meteor",
    "shop",
    "community",
    "cottage_blue",
    "fountain",
    "lamp1",
    "lamp2",
    "bench",
    "tree_blossom",
    "sign",
    "tree_oak1",
    "tree_oak2",
    "bush1",
    "bush2",
    "bridge",
    "fence1",
    "fence2",
}

TILLABLE = [
    (-3, 1), (-2, 1), (-1, 1), (0, 1),
    (-3, 0), (-2, 0), (-1, 0), (0, 0),
    (-3, -1), (-2, -1), (-1, -1), (0, -1),
    (-2, 2), (-1, 2), (0, 2),
]

DECOR = [
    ("rockBig", -240, 220, True),
    ("stump", -200, 140, True),
    ("rockBig", 200, -60, True),
    ("log", -120, -260, True),
    ("stump", 120, -140, True),
    ("rock", 280, -200, True),
    ("stump", -40, -280, True),
    ("rock", -260, 80, True),
]

SOFT_KINDS = [
    "weed",
    "weedBloom",
    "weedTall",
    "weedPink",
    "weedYellow",
    "weedBlue",
    "tuft",
    "pebble",
    "twig",
    "fiber",
]

LAKE_PIER = [(-2, -2), (-3, -2), (-4, -2), (-5, -2), (-6, -2), (-7, -2)]
LAKE_PIER_DIRT = [(-2, -2), (-3, -2)]
LAKE_PIER_WOOD = [(-4, -2), (-5, -2), (-6, -2), (-7, -2)]

SIZE = {
    "rock": (48, 40),
    "rockBig": (72, 56),
    "stump": (56, 48),
    "log": (80, 32),
    "weed": (40, 36),
    "weedBloom": (40, 36),
    "weedTall": (36, 40),
    "weedPink": (36, 40),
    "weedYellow": (36, 40),
    "weedBlue": (36, 40),
    "tuft": (28, 24),
    "pebble": (24, 18),
    "twig": (32, 20),
    "fiber": (20, 16),
    "pine": (96, 144),
    "oak": (128, 160),
    "blossom": (128, 160),
    "bush": (64, 64),
    "mailbox": (48, 64),
    "shipping": (96, 80),
    "craftbench": (96, 80),
    "fence": (64, 64),
    "lily": (28, 24),
    "lilyBloom": (28, 24),
    "reed": (40, 44),
    "rockWet": (40, 28),
    "logSunk": (88, 36),
}

# Building sprites from Main.scene / uuid-map
PROP_SPRITES = {
    "cottage_red": ("a5b87678-ab64-4173-9a6b-7d409ec746e2@f9941", 288, 272),
    "shed": ("d29fe7a0-beb9-42e2-8140-b88c45147ac8@f9941", 128, 128),
}


def noise(ix: float, iy: float) -> float:
    n = math.sin(ix * 12.9898 + iy * 78.233) * 43758.5453
    return n - math.floor(n) - 0.5


def noise01(ix: float, iy: float, salt: float = 0) -> float:
    return noise(ix + salt * 17, iy - salt * 9) + 0.5


def load_frames(path: Path) -> Dict[str, str]:
    raw = json.loads(path.read_text(encoding="utf-8"))
    # nature-frames / terrain-frames are {key: uuid} or nested
    out: Dict[str, str] = {}
    for k, v in raw.items():
        if isinstance(v, str):
            out[k] = v
        elif isinstance(v, dict) and "spriteFrame" in v:
            out[k] = v["spriteFrame"]
    return out


class FarmBake:
    def __init__(self, nature: Dict[str, str], terrain: Dict[str, str]):
        self.nature = nature
        self.terrain = terrain
        self.farm_plots = {f"{x},{y}" for x, y in TILLABLE}
        self.pier = {f"{x},{y}" for x, y in LAKE_PIER}
        self.pier_dirt = {f"{x},{y}" for x, y in LAKE_PIER_DIRT}
        self.pier_wood = {f"{x},{y}" for x, y in LAKE_PIER_WOOD}
        self.water: Set[str] = set()
        self.wanted: Dict[str, str] = {}
        # Tall canopy feet — soft litter must stay clear or it paints over leaves.
        self.tree_feet: List[Tuple[float, float]] = []
        # list of (name, sf, x, y, w, h, ax, ay, ground)
        self.nodes: List[Tuple] = []

    def near_tree_canopy(self, x: float, y: float, rad: float = 88.0) -> bool:
        r2 = rad * rad
        for tx, ty in self.tree_feet:
            dx = x - tx
            dy = y - ty
            if dx * dx + dy * dy < r2:
                return True
        return False

    def is_lake_cell(self, ix: int, iy: int) -> bool:
        key = f"{ix},{iy}"
        if key in self.farm_plots or key in self.pier:
            return False
        if -8 <= ix <= -4 and 2 <= iy <= 5:
            return False
        if ix >= -2:
            return False
        cx, cy = -12.2, -3.2
        dx = (ix - cx) / 12.4
        dy = (iy - cy) / 10.2
        dx += math.sin(iy * 0.45) * 0.12 + noise(ix, iy + 3) * 0.14
        dy += math.sin(ix * 0.4 + 1.1) * 0.1 + noise(ix + 2, iy) * 0.12
        d = dx * dx + dy * dy
        d += math.sin(ix * 0.55 - iy * 0.35) * 0.06
        d += math.sin(iy * 0.7 + ix * 0.2) * 0.05
        wobble = noise01(ix, iy, 4) * 0.28
        if d < 0.78 + wobble * 0.2:
            return True
        if d < 0.98 + wobble:
            return noise01(ix, iy, 19) > 0.18
        if d < 1.12 + wobble * 0.35:
            return noise01(ix, iy, 29) > 0.45
        return False

    def jitter_shoreline(self, water: Set[str]) -> None:
        def can_expand(ix: int, iy: int) -> bool:
            key = f"{ix},{iy}"
            if key in self.farm_plots or key in self.pier:
                return False
            if -8 <= ix <= -4 and 2 <= iy <= 5:
                return False
            if ix >= -2:
                return False
            return True

        cols: Dict[int, int] = {}
        for key in water:
            ix, iy = map(int, key.split(","))
            cols[ix] = max(cols.get(ix, -999), iy)
        for ix, max_y in list(cols.items()):
            roll = noise01(ix, max_y, 91)
            if roll > 0.72:
                water.discard(f"{ix},{max_y}")
            elif roll < 0.22 and can_expand(ix, max_y + 1):
                water.add(f"{ix},{max_y + 1}")
            left, right = cols.get(ix - 1), cols.get(ix + 1)
            if left == max_y and right == max_y and noise01(ix, 3, 93) > 0.55:
                water.discard(f"{ix},{max_y}")

        cols_s: Dict[int, int] = {}
        for key in water:
            ix, iy = map(int, key.split(","))
            cols_s[ix] = min(cols_s.get(ix, 999), iy)
        for ix, min_y in list(cols_s.items()):
            roll = noise01(ix, min_y, 97)
            if roll > 0.74:
                water.discard(f"{ix},{min_y}")
            elif roll < 0.2 and can_expand(ix, min_y - 1):
                water.add(f"{ix},{min_y - 1}")

        rows: Dict[int, int] = {}
        for key in water:
            ix, iy = map(int, key.split(","))
            rows[iy] = min(rows.get(iy, 999), ix)
        for iy, min_x in list(rows.items()):
            roll = noise01(min_x, iy, 95)
            if roll > 0.74:
                water.discard(f"{min_x},{iy}")
            elif roll < 0.2 and can_expand(min_x - 1, iy):
                water.add(f"{min_x - 1},{iy}")
            up, down = rows.get(iy + 1), rows.get(iy - 1)
            if up == min_x and down == min_x and noise01(5, iy, 96) > 0.55:
                water.discard(f"{min_x},{iy}")

        rows_e: Dict[int, int] = {}
        for key in water:
            ix, iy = map(int, key.split(","))
            rows_e[iy] = max(rows_e.get(iy, -999), ix)
        for iy, max_x in list(rows_e.items()):
            roll = noise01(max_x, iy, 98)
            if roll > 0.78:
                water.discard(f"{max_x},{iy}")
            elif roll < 0.18 and can_expand(max_x + 1, iy):
                water.add(f"{max_x + 1},{iy}")

    def build_pond_water(self) -> Set[str]:
        water: Set[str] = set()
        for iy in range(-18, 10):
            for ix in range(-24, -1):
                if self.is_lake_cell(ix, iy):
                    water.add(f"{ix},{iy}")

        for key in list(water):
            ix, iy = map(int, key.split(","))
            n = (f"{ix},{iy + 1}" in water)
            s = (f"{ix},{iy - 1}" in water)
            e = (f"{ix + 1},{iy}" in water)
            w = (f"{ix - 1},{iy}" in water)
            land_ortho = (0 if n else 1) + (0 if s else 1) + (0 if e else 1) + (0 if w else 1)
            if land_ortho >= 2 and noise01(ix, iy, 70) > 0.62:
                water.discard(key)

        self.jitter_shoreline(water)

        for key in list(water):
            ix, iy = map(int, key.split(","))
            cnt = 0
            if f"{ix},{iy + 1}" in water:
                cnt += 1
            if f"{ix},{iy - 1}" in water:
                cnt += 1
            if f"{ix + 1},{iy}" in water:
                cnt += 1
            if f"{ix - 1},{iy}" in water:
                cnt += 1
            if cnt < 2:
                water.discard(key)

        for key in self.pier:
            water.discard(key)
        for ix, iy in LAKE_PIER_WOOD:
            for dy in (1, -1):
                n_key = f"{ix},{iy + dy}"
                if n_key in self.pier or n_key in self.farm_plots:
                    continue
                water.add(n_key)
        return water

    def is_dirt_cell(self, ix: int, iy: int) -> bool:
        key = f"{ix},{iy}"
        if any(x == ix and y == iy for x, y in LAKE_PIER_DIRT):
            return True
        if key in self.pier or key in self.water or key in self.farm_plots:
            return False

        on_porch_core = (
            (ix == 1 and 1 <= iy <= 4)
            or (ix == 0 and 2 <= iy <= 3)
            or (ix == 2 and 2 <= iy <= 4)
        )
        on_porch_rim = (
            (ix == 0 and iy == 1)
            or (ix == 0 and iy == 4)
            or (ix == 3 and iy == 3)
            or (ix == 2 and iy == 1)
            or (ix == 3 and iy == 4)
            or (ix == -1 and 2 <= iy <= 3)
        )
        if on_porch_core:
            return True
        if on_porch_rim:
            return noise01(ix, iy, 2) > 0.35

        # East town road — yard level → right-edge gate (solid to map rim)
        on_town_road_core = (3 <= iy <= 4 and 3 <= ix <= 14) or (
            iy == 5 and 4 <= ix <= 8
        )
        on_town_road_rim = ((iy == 2 or iy == 5) and 4 <= ix <= 14) or (
            iy == 6 and 4 <= ix <= 8
        )
        if on_town_road_core:
            return True
        if on_town_road_rim:
            return noise01(ix, iy, 16) > 0.32

        # Soft garden soil pockets (organic blobs — not a dirt rectangle)
        # Front-left bed
        if -1 <= ix <= 2 and 2 <= iy <= 3:
            dx, dy = (ix - 0.4) / 1.8, (iy - 2.4) / 1.1
            if dx * dx + dy * dy < 0.85 + noise01(ix, iy, 41) * 0.35:
                return True
        # Front-right bed
        if 4 <= ix <= 7 and 2 <= iy <= 4:
            dx, dy = (ix - 5.2) / 1.9, (iy - 2.8) / 1.2
            if dx * dx + dy * dy < 0.8 + noise01(ix, iy, 42) * 0.4:
                return True
        # West drift by mailbox
        if -2 <= ix <= 0 and 3 <= iy <= 5:
            dx, dy = (ix + 0.6) / 1.4, (iy - 4.0) / 1.3
            if dx * dx + dy * dy < 0.7 + noise01(ix, iy, 43) * 0.35:
                return True

        if 0 <= ix <= 5 and 3 <= iy <= 7:
            cx, cy = 2.6, 5.1
            dx, dy = (ix - cx) / 2.8, (iy - cy) / 1.9
            d = dx * dx + dy * dy
            wobble = noise01(ix, iy, 4) * 0.45
            if d < 0.55 + wobble:
                return True
            if d < 1.05 + wobble * 0.5:
                return noise01(ix, iy, 14) > 0.42

        if -7 <= ix <= -1 and -1 <= iy <= 5:
            dx, dy = (ix + 3.8) / 3.2, (iy - 2.0) / 2.8
            if dx * dx + dy * dy < 0.7 + noise01(ix, iy, 3) * 0.55:
                return True
        if 1 <= ix <= 7 and -4 <= iy <= 3:
            dx, dy = (ix - 3.8) / 3.4, (iy + 0.2) / 3.0
            if dx * dx + dy * dy < 0.65 + noise01(ix, iy, 5) * 0.5:
                return True
        if -4 <= ix <= 3 and -6 <= iy <= -1:
            dx, dy = (ix + 0.2) / 3.6, (iy + 3.2) / 2.4
            if dx * dx + dy * dy < 0.55 + noise01(ix, iy, 7) * 0.5:
                return True
        if -6 <= ix <= 0 and -3 <= iy <= 1:
            dx, dy = (ix + 2.8) / 2.6, (iy + 0.8) / 2.0
            if dx * dx + dy * dy < 0.5 + noise01(ix, iy, 8) * 0.45:
                return True
        return False

    def is_pond_shore(self, ix: int, iy: int) -> bool:
        if f"{ix},{iy}" in self.water:
            return False
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                if dx == 0 and dy == 0:
                    continue
                if f"{ix + dx},{iy + dy}" in self.water:
                    return True
        return False

    def is_clearing_cell(self, ix: int, iy: int) -> bool:
        key = f"{ix},{iy}"
        if key in self.pier or key in self.water or key in self.farm_plots:
            return True
        if -10 <= ix <= -2 and -4 <= iy <= -1:
            return True
        # Cottage garden + porch (no wild pine/oak through the flower grounds)
        if -3 <= ix <= 9 and 1 <= iy <= 12:
            return True
        if -3 <= ix <= -1 and -3 <= iy <= -1:
            return True
        if ix == -3 and -6 <= iy <= 3:
            return True
        if ix == 3 and -10 <= iy <= 3:
            return True
        # East corridor to the town gate (spine + shoulders; north fringe stays wild)
        if 3 <= ix <= 14 and 0 <= iy <= 6:
            return True
        return False

    def add_ground(self, name: str, sf: str, ix: int, iy: int) -> None:
        self.nodes.append((name, sf, ix * TILE, iy * TILE, TILE, TILE, 0.5, 0.5, True))

    def add_actor(
        self,
        name: str,
        sf: str,
        x: float,
        y: float,
        kind: str,
        anchor_y: float = 0.0,
    ) -> None:
        w, h = SIZE.get(kind, (64, 64))
        self.nodes.append((name, sf, x, y, w, h, 0.5, anchor_y, False))

    def pick_variant(self, kind: str, ix: int, iy: int) -> str:
        if kind == "dirt":
            variants = [k for k in ("dirt", "dirtB") if k in self.terrain]
        else:
            variants = [k for k in ("grass", "grassB", "grassC") if k in self.terrain]
        if not variants:
            return self.terrain["grass" if kind == "grass" else "dirt"]
        pick = variants[abs(int(math.floor(noise(ix, iy) * 1000))) % len(variants)]
        return self.terrain[pick]

    def paint_terrain(self) -> None:
        # Match wild-cover / lake AABB so trees & shore never sit on void.
        # Water + pier wood are painted later; skip those cells here.
        for iy in range(-20, 16):
            for ix in range(-26, 16):
                key = f"{ix},{iy}"
                # Pier approach/wood come from place_pier_and_bridge
                if key in self.water or key in self.pier:
                    continue
                kind = "dirt" if self.is_dirt_cell(ix, iy) else "grass"
                self.wanted[key] = kind
        for key in self.farm_plots:
            self.wanted[key] = "grass"

        for key, kind in self.wanted.items():
            ix, iy = map(int, key.split(","))
            sf = self.pick_variant(kind, ix, iy)
            self.add_ground(f"tile-{kind}_{ix}_{iy}", sf, ix, iy)

        # Grass fringe runs after place_pond — pier approach dirt is stamped there.

    def cell_is_grass(self, ix: int, iy: int) -> bool:
        key = f"{ix},{iy}"
        # Same rule as other dirt edges: water / pier wood are not sod sides
        if key in self.water or key in self.pier_wood:
            return False
        return self.wanted.get(key) != "dirt"

    def paint_grass_fringe(self) -> None:
        for key, kind in self.wanted.items():
            if kind != "dirt":
                continue
            ix, iy = map(int, key.split(","))
            self._place_fringe_for_cell(ix, iy, self.cell_is_grass, "fringe_")

    def paint_water_fringe(self) -> None:
        def is_land(ix: int, iy: int) -> bool:
            key = f"{ix},{iy}"
            if key in self.water or key in self.pier:
                return False
            return True

        for key in self.water:
            ix, iy = map(int, key.split(","))
            self._place_fringe_for_cell(ix, iy, is_land, "fringe_water_")

    def _place_fringe_for_cell(self, ix: int, iy: int, is_grass_side, prefix: str) -> None:
        n = is_grass_side(ix, iy + 1)
        e = is_grass_side(ix + 1, iy)
        s = is_grass_side(ix, iy - 1)
        w = is_grass_side(ix - 1, iy)
        ne = is_grass_side(ix + 1, iy + 1)
        nw = is_grass_side(ix - 1, iy + 1)
        se = is_grass_side(ix + 1, iy - 1)
        sw = is_grass_side(ix - 1, iy - 1)
        cover_n = cover_e = cover_s = cover_w = False

        def place(suffix: str, frame_key: str) -> None:
            sf = self.terrain.get(frame_key)
            if not sf:
                return
            self.add_ground(f"{prefix}{suffix}_{ix}_{iy}", sf, ix, iy)

        if n and e:
            place("out_ne", "fringeOutNE")
            cover_n = cover_e = True
        if n and w:
            place("out_nw", "fringeOutNW")
            cover_n = cover_w = True
        if s and e:
            place("out_se", "fringeOutSE")
            cover_s = cover_e = True
        if s and w:
            place("out_sw", "fringeOutSW")
            cover_s = cover_w = True
        if n and not cover_n:
            place("n", "fringeN")
        if e and not cover_e:
            place("e", "fringeE")
        if s and not cover_s:
            place("s", "fringeS")
        if w and not cover_w:
            place("w", "fringeW")
        if (not n) and (not e) and ne:
            place("in_ne", "fringeInNE")
        if (not n) and (not w) and nw:
            place("in_nw", "fringeInNW")
        if (not s) and (not e) and se:
            place("in_se", "fringeInSE")
        if (not s) and (not w) and sw:
            place("in_sw", "fringeInSW")

    def place_pond(self) -> None:
        water_sf = self.terrain.get("water")
        if not water_sf:
            return
        for key in sorted(self.water):
            ix, iy = map(int, key.split(","))
            self.add_ground(f"pond_water_{ix}_{iy}", water_sf, ix, iy)
        self.paint_water_fringe()
        self.ensure_lake_shore_grass()
        self.place_pier_and_bridge()

    def ensure_lake_shore_grass(self) -> None:
        grass_sf = self.terrain.get("grass") or self.terrain.get("grassB")
        if not grass_sf:
            return
        occupied = set(self.wanted.keys()) | set(self.water) | set(self.pier)
        for iy in range(-20, 12):
            for ix in range(-26, 0):
                key = f"{ix},{iy}"
                if key in occupied or key in self.farm_plots:
                    continue
                near = False
                for dy in range(-2, 3):
                    for dx in range(-2, 3):
                        if f"{ix + dx},{iy + dy}" in self.water:
                            near = True
                            break
                    if near:
                        break
                if not near and ix > -18:
                    continue
                if not near and ix <= -18 and (iy < -16 or iy > 8):
                    continue
                sf = self.pick_variant("grass", ix, iy)
                self.add_ground(f"tile-grass_{ix}_{iy}", sf, ix, iy)
                occupied.add(key)
                self.wanted[key] = "grass"

    def place_pier_and_bridge(self) -> None:
        dirt_sf = self.terrain.get("dirt") or self.terrain.get("dirtB")
        pier_sf = self.terrain.get("pier")
        for ix, iy in LAKE_PIER:
            key = f"{ix},{iy}"
            if key in self.pier_dirt and dirt_sf:
                self.add_ground(f"tile-dirt_{ix}_{iy}", dirt_sf, ix, iy)
                self.wanted[key] = "dirt"
            if key in self.pier_wood and pier_sf:
                self.add_ground(f"pond_pier_{ix}_{iy}", pier_sf, ix, iy)

        bridge_x = -5.5 * TILE
        bridge_foot_y = -2 * TILE - 44
        self.nodes.append(
            ("lake_bridge", BRIDGE_UUID, bridge_x, bridge_foot_y, BRIDGE_W, BRIDGE_H, 0.5, 0.0, False)
        )
        self.nodes.append(
            (
                "lake_bridge_rail_s",
                BRIDGE_RAIL_S_UUID,
                bridge_x,
                -2 * TILE - 20,
                BRIDGE_W,
                BRIDGE_RAIL_H,
                0.5,
                0.0,
                False,
            )
        )

    # Left-yard craftbench — keep clear of blossom / flower beds
    CRAFTBENCH_POS = (110, 295)

    def place_yard(self) -> None:
        if "mailbox" in self.nature:
            self.add_actor("prop_mailbox", self.nature["mailbox"], 55, 330, "mailbox")
        if "shipping" in self.nature:
            self.add_actor("prop_shipping", self.nature["shipping"], 420, 360, "shipping")
        # craftbench placed after garden so it is never buried under foliage
        fence_sf = self.nature.get("fence")
        # Broken romantic fence — only short north fragment, never a box
        spots = [
            (120, 700), (184, 706), (248, 698), (312, 704),
        ]
        if fence_sf:
            for i, (x, y) in enumerate(spots):
                self.add_actor(f"fence_auto_{i}", fence_sf, x, y, "fence")
        gx, gy = TOWN_GATE
        self.nodes.append(
            ("portal_town", SIGN_UUID, gx, gy, 64, 80, 0.5, 0.0, False)
        )
        # Town-gate portal light — runtime hides until town unlock
        self.nodes.append(
            ("door_portal_town", DOOR_PORTAL_UUID, gx, gy - 4, 80, 144, 0.5, 0.0, False)
        )

    def place_craftbench(self) -> None:
        if "craftbench" not in self.nature:
            return
        x, y = self.CRAFTBENCH_POS
        self.add_actor("prop_craftbench", self.nature["craftbench"], x, y, "craftbench")

    def place_cottage_garden(self) -> None:
        """Organic girl's garden — beds & drifts, never a hedge box through the roof."""
        n = 0
        # Cottage visual slab — no tall props inside (prevents roof clipping)
        hx, hy, hw, hh = COTTAGE_FOOT
        x0, x1 = hx - hw * 0.52, hx + hw * 0.52
        y0, y1 = hy - 20, hy + hh + 8

        def in_house(x: float, y: float, pad: float = 8) -> bool:
            return (x0 - pad) <= x <= (x1 + pad) and (y0 - pad) <= y <= (y1 + pad)

        cbx, cby = self.CRAFTBENCH_POS

        def near_craft(x: float, y: float) -> bool:
            return abs(x - cbx) < 70 and abs(y - cby) < 55

        def soft(kind: str, x: float, y: float) -> None:
            nonlocal n
            if in_house(x, y) or near_craft(x, y):
                return
            sf = self.nature.get(kind)
            if not sf:
                return
            self.add_actor(f"decor_garden_{kind}_soft_{n}", sf, x, y, kind)
            n += 1

        def flower(x: float, y: float) -> None:
            roll = noise01(x * 0.031, y * 0.029, 77)
            kind = (
                "weedPink"
                if roll < 0.26
                else "weedYellow"
                if roll < 0.46
                else "weedBlue"
                if roll < 0.62
                else "weedBloom"
                if roll < 0.8
                else "lilyBloom"
                if roll < 0.9 and "lilyBloom" in self.nature
                else "weedTall"
            )
            soft(kind, x, y)

        def bush(x: float, y: float) -> None:
            soft("bush", x, y)

        def blob_flowers(cx: float, cy: float, rx: float, ry: float, count: int, bushes: int = 0) -> None:
            """Scatter flowers in an ellipse; optional accent bushes at rim."""
            for i in range(count):
                a = (i / max(1, count)) * math.pi * 2 + noise(i, 17) * 0.7
                t = 0.35 + noise01(i, 19, 70) * 0.65
                x = cx + math.cos(a) * rx * t + noise(i, 21) * 10
                y = cy + math.sin(a) * ry * t + noise(21, i) * 8
                flower(x, y)
            for j in range(bushes):
                a = (j / max(1, bushes)) * math.pi * 2 + 0.4
                bush(
                    cx + math.cos(a) * rx * 0.85 + noise(j, 23) * 12,
                    cy + math.sin(a) * ry * 0.85 + noise(23, j) * 10,
                )

        # Asymmetric blossom trees — keep clear of craftbench apron
        blossom_sf = self.nature.get("blossom")
        if blossom_sf:
            for i, (x, y) in enumerate(
                [
                    (-90, 520),   # west mid — behind craft, not on it
                    (480, 640),   # far NE
                    (-40, 160),   # SW meadow, south of craft apron
                ]
            ):
                if not in_house(x, y, pad=40) and not near_craft(x, y):
                    self.add_actor(f"decor_blossom_soft_g{i}", blossom_sf, x, y, "blossom")
                    self.tree_feet.append((float(x), float(y)))

        # Three soft flower beds (leave craftbench apron open)
        blob_flowers(55, 220, 50, 36, 14, bushes=2)    # front-left, south of craft
        blob_flowers(340, 270, 64, 44, 18, bushes=2)   # front-right bed
        blob_flowers(10, 460, 48, 55, 14, bushes=2)    # west drift north of craft

        # Loose meadow drift south of porch (keep door lane ~x=200–240 clear)
        for i in range(28):
            x = 80 + (i % 7) * 40 + noise(i, 31) * 18
            y = 200 + (i // 7) * 28 + noise(31, i) * 14
            if 190 <= x <= 250 and y > 250:
                continue
            if noise01(i, 5, 72) > 0.55:
                flower(x, y)
            elif noise01(i, 6, 73) > 0.7:
                soft("tuft", x, y)

        # A few lone bushes as accents (never mid-house / craft apron)
        for x, y in (
            (380, 320),
            (100, 500),
            (400, 520),
            (160, 690),
            (300, 695),
        ):
            bush(x, y)

        # Tiny pebble / fiber accents on bed edges
        for i, (x, y) in enumerate(
            [
                (70, 250), (120, 255), (310, 245), (360, 260),
                (50, 380), (15, 450), (390, 400),
            ]
        ):
            soft("pebble" if i % 2 == 0 else "fiber", x + noise(i, 2) * 6, y)

    def place_decor_list(self) -> None:
        for i, (kind, x, y, solid) in enumerate(DECOR):
            sf = self.nature.get(kind)
            if not sf:
                continue
            tag = "solid" if solid else "soft"
            self.add_actor(f"decor_{kind}_{tag}_{i}", sf, x, y, kind)

    def place_wild_cover(self) -> None:
        tree_kinds = [k for k in ("pine", "oak", "bush") if k in self.nature]
        if not tree_kinds:
            return
        n = 0
        for iy in range(-20, 16):
            for ix in range(-26, 16):
                if f"{ix},{iy}" in self.water:
                    continue
                if self.is_clearing_cell(ix, iy):
                    continue
                if -7 <= ix <= -4 and 2 <= iy <= 4:
                    continue
                if 1 <= ix <= 5 and 5 <= iy <= 7:
                    continue
                # Keep town-road spine open (not the whole north fringe)
                if 3 <= ix <= 14 and 2 <= iy <= 6:
                    continue
                shore = self.is_pond_shore(ix, iy)
                edge = (
                    shore
                    or ix <= -18
                    or ix >= 13
                    or iy <= -12
                    or iy >= 12
                    or (ix <= -4 and iy >= 4)
                    or (ix >= 4 and iy <= -1 and not (0 <= iy <= 3))
                )
                mid_wild = (not edge) and (ix <= -3 or ix >= 3 or iy <= -3 or iy >= 5)
                # Slightly denser mid-field so grass doesn't read as empty lawn
                chance = 0.4 if shore else 0.48 if edge else 0.34 if mid_wild else 0.2
                if self.is_dirt_cell(ix, iy):
                    chance *= 0.45
                if noise01(ix, iy, 31) > chance:
                    continue
                roll = noise01(ix, iy, 33)
                if shore:
                    kind = "bush" if roll < 0.55 else "pine" if roll < 0.8 else "oak"
                elif "blossom" in self.nature and noise01(ix, iy, 37) > 0.82:
                    # Occasional pink blossom trees break up the green canopy
                    kind = "blossom"
                else:
                    kind = "pine" if roll < 0.34 else "oak" if roll < 0.68 else "bush"
                if kind not in self.nature:
                    kind = tree_kinds[int(roll * len(tree_kinds)) % len(tree_kinds)]
                sf = self.nature[kind]
                jx = noise(ix, iy + 2) * 22
                jy = noise(ix + 2, iy) * 18
                solid = kind != "bush"
                tag = "solid" if solid else "soft"
                px = ix * TILE + jx
                py = iy * TILE + jy
                # Bushes south of a trunk paint over the whole crown — keep clear.
                if kind == "bush" and self.near_tree_canopy(px, py, 110):
                    continue
                self.add_actor(
                    f"decor_{kind}_{tag}_w{n}",
                    sf,
                    px,
                    py,
                    kind,
                )
                n += 1
                # Track canopy trunks only — never stack understory south of the foot.
                if kind in ("pine", "oak", "blossom"):
                    self.tree_feet.append((px, py))

    def prune_under_canopy(self) -> None:
        """Remove litter/bushes whose feet sit under a tree crown (wrong occlusion)."""
        self.tree_feet = [
            (node[2], node[3])
            for node in self.nodes
            if node[0].startswith("decor_pine_")
            or node[0].startswith("decor_oak_")
            or node[0].startswith("decor_blossom_")
        ]

        def bury(name: str, x: float, y: float) -> bool:
            if name.startswith("decor_soft_"):
                return self.near_tree_canopy(x, y, 96)
            if name.startswith("decor_bush_") or (
                name.startswith("decor_garden_") and "_bush_" in name
            ):
                return self.near_tree_canopy(x, y, 110)
            if name.startswith("decor_rock_solid") and "rockBig" not in name:
                return self.near_tree_canopy(x, y, 90)
            if name.startswith("decor_garden_") and "_bush_" not in name:
                return self.near_tree_canopy(x, y, 96)
            return False

        self.nodes = [n for n in self.nodes if not bury(n[0], n[2], n[3])]

    def prune_gather_overlap(self) -> None:
        """Keep grass / stone / tree feet from stacking so gather tutorials stay clickable."""
        rock_re = re.compile(
            r"^decor_soft_(?:shore_)?(?:rock_|pebble_)|^decor_rock(?:Big)?_solid_"
        )
        grass_re = re.compile(
            r"^decor_soft_(?:shore_)?(weed|weedBloom|weedTall|weedPink|weedYellow|weedBlue|tuft|fiber|twig)_"
            r"|^decor_bush_(soft|solid)_|^decor_garden_"
        )
        tree_re = re.compile(r"^decor_(pine|oak)_solid_")

        rocks = [(n[2], n[3]) for n in self.nodes if rock_re.match(n[0])]
        trees = [(n[2], n[3]) for n in self.nodes if tree_re.match(n[0])]

        def near(x: float, y: float, feet: list, rad: float) -> bool:
            r2 = rad * rad
            for fx, fy in feet:
                dx = x - fx
                dy = y - fy
                if dx * dx + dy * dy <= r2:
                    return True
            return False

        kept = []
        grass_feet: list = []
        for name, sf, x, y, *rest in self.nodes:
            node = (name, sf, x, y, *rest)
            if rock_re.match(name):
                # Rocks keep; drop later weeds that sit on them.
                kept.append(node)
                continue
            if tree_re.match(name):
                kept.append(node)
                continue
            if grass_re.match(name):
                # Weeds must clear rocks and tree feet (tutorial dig/chop aim).
                if near(x, y, rocks, 48) or near(x, y, trees, 88):
                    continue
                # Soft weeds also stay clear of each other enough to tap.
                if near(x, y, grass_feet, 28):
                    continue
                grass_feet.append((x, y))
                kept.append(node)
                continue
            kept.append(node)
        self.nodes = kept

    def place_lake_shore_flora(self) -> None:
        n = 0
        for iy in range(-20, 12):
            for ix in range(-26, 0):
                key = f"{ix},{iy}"
                if key in self.water or key in self.pier or key in self.farm_plots:
                    continue
                if self.is_clearing_cell(ix, iy):
                    continue
                if not self.is_pond_shore(ix, iy) and ix > -18:
                    continue
                soft_roll = noise01(ix, iy, 81)
                if soft_roll > 0.38:
                    count = 2 if soft_roll > 0.72 else 1
                    for k in range(count):
                        roll = noise01(ix, iy, 82 + k)
                        if roll < 0.1:
                            kind = "tuft"
                        elif roll < 0.28:
                            kind = "weedPink"
                        elif roll < 0.44:
                            kind = "weedYellow"
                        elif roll < 0.58:
                            kind = "weedBlue"
                        elif roll < 0.72:
                            kind = "weedBloom"
                        elif roll < 0.82:
                            kind = "weed"
                        elif roll < 0.9:
                            kind = "weedTall"
                        elif roll < 0.96:
                            kind = "fiber"
                        else:
                            kind = "pebble"
                        sf = self.nature.get(kind)
                        if not sf:
                            continue
                        sx = ix * TILE + noise(ix + k, iy) * 28
                        sy = iy * TILE + noise(ix, iy + k) * 24 - 8
                        if self.near_tree_canopy(sx, sy, 96):
                            continue
                        self.add_actor(
                            f"decor_soft_shore_{kind}_{n}",
                            sf,
                            sx,
                            sy,
                            kind,
                        )
                        n += 1
                if "bush" in self.nature and noise01(ix, iy, 88) > 0.72:
                    bx = ix * TILE + noise(ix, iy) * 16
                    by = iy * TILE + noise(iy, ix) * 14
                    if not self.near_tree_canopy(bx, by, 100):
                        self.add_actor(
                            f"decor_bush_soft_shore_{n}",
                            self.nature["bush"],
                            bx,
                            by,
                            "bush",
                        )
                        n += 1
                if "rock" in self.nature and noise01(ix, iy, 90) > 0.88:
                    rx = ix * TILE + noise(ix, 3) * 12
                    ry = iy * TILE + noise(3, iy) * 10
                    if not self.near_tree_canopy(rx, ry, 90):
                        self.add_actor(
                            f"decor_rock_solid_shore_{n}",
                            self.nature["rock"],
                            rx,
                            ry,
                            "rock",
                        )
                        n += 1

    def place_soft_clutter(self) -> None:
        available = [k for k in SOFT_KINDS if k in self.nature]
        if not available:
            return
        n = 0
        for iy in range(-20, 16):
            for ix in range(-26, 16):
                key = f"{ix},{iy}"
                if key in self.water or key in self.farm_plots or key in self.pier:
                    continue
                if -10 <= ix <= -2 and -4 <= iy <= -1:
                    continue
                if 0 <= ix <= 3 and 1 <= iy <= 4 and noise01(ix, iy, 11) < 0.9:
                    continue
                if 1 <= ix <= 4 and 5 <= iy <= 6 and noise01(ix, iy, 12) < 0.92:
                    continue
                # Thin litter on town-road spine so the path stays readable
                if 3 <= iy <= 4 and 3 <= ix <= 14 and noise01(ix, iy, 13) < 0.75:
                    continue
                # Never plant through the hero cottage body
                cx, cy, cw, ch = COTTAGE_FOOT
                wx, wy = ix * TILE, iy * TILE
                if abs(wx - cx) <= cw * 0.62 and cy - 24 <= wy <= cy + ch + 48:
                    continue
                dirt = self.is_dirt_cell(ix, iy)
                shore = self.is_pond_shore(ix, iy)
                # Higher grass litter — open lawn was reading empty
                density = 0.5 if shore else 0.46 if dirt else 0.58
                if noise01(ix, iy, 1) > density:
                    continue
                count = 2 if noise01(ix, iy, 2) > 0.72 else 1
                if (not dirt) and noise01(ix, iy, 3) > 0.78:
                    count = 3
                for k in range(count):
                    roll = noise01(ix, iy, 20 + k)
                    if dirt:
                        if roll < 0.1:
                            kind = "pebble"
                        elif roll < 0.18:
                            kind = "twig"
                        elif roll < 0.26:
                            kind = "fiber"
                        elif roll < 0.36:
                            kind = "tuft"
                        elif roll < 0.5:
                            kind = "weed"
                        elif roll < 0.6:
                            kind = "weedTall"
                        elif roll < 0.74:
                            kind = "weedPink"
                        elif roll < 0.86:
                            kind = "weedYellow"
                        else:
                            kind = "weedBloom"
                    else:
                        # Open grass: favor bright flowers over green weeds
                        if roll < 0.08:
                            kind = "tuft"
                        elif roll < 0.12:
                            kind = "fiber"
                        elif roll < 0.2:
                            kind = "weed"
                        elif roll < 0.28:
                            kind = "weedTall"
                        elif roll < 0.46:
                            kind = "weedPink"
                        elif roll < 0.62:
                            kind = "weedYellow"
                        elif roll < 0.76:
                            kind = "weedBlue"
                        elif roll < 0.9:
                            kind = "weedBloom"
                        else:
                            kind = "pebble"
                    if kind not in self.nature:
                        kind = available[int(roll * len(available)) % len(available)]
                    sf = self.nature.get(kind)
                    if not sf:
                        continue
                    jx = noise(ix + k * 3, iy) * 30
                    jy = noise(ix, iy + k * 5) * 26
                    px = ix * TILE + jx
                    py = iy * TILE + jy - TILE * 0.15
                    # Keep clear of tree crowns — litter with lower footY paints over leaves.
                    if self.near_tree_canopy(px, py, 96):
                        continue
                    self.add_actor(
                        f"decor_soft_{kind}_{n}",
                        sf,
                        px,
                        py,
                        kind,
                    )
                    n += 1
                if dirt and noise01(ix, iy, 9) > 0.88 and "rock" in self.nature:
                    rx = ix * TILE + noise(ix, iy) * 20
                    ry = iy * TILE + noise(iy, ix) * 16
                    if self.near_tree_canopy(rx, ry, 90):
                        continue
                    self.add_actor(
                        f"decor_soft_rock_{n}",
                        self.nature["rock"],
                        rx,
                        ry,
                        "rock",
                    )
                    n += 1

    def place_lake_water_decor(self) -> None:
        if not self.water:
            return

        def is_shore(ix: int, iy: int) -> bool:
            for dx, dy in ((0, 1), (0, -1), (1, 0), (-1, 0)):
                k = f"{ix + dx},{iy + dy}"
                if k not in self.water and k not in self.pier:
                    return True
            return False

        n = 0

        def place(kind: str, x: float, y: float, ay: float = 0.5) -> None:
            nonlocal n
            sf = self.nature.get(kind)
            if not sf:
                return
            self.add_actor(f"pond_deco_{kind}_{n}", sf, x, y, kind, ay)
            n += 1

        if "logSunk" in self.nature:
            place("logSunk", -720, -80, 0.15)
            place("logSunk", -880, -360, 0.15)
            place("logSunk", -560, -520, 0.15)
            place("logSunk", -1000, -200, 0.15)

        for key in self.water:
            ix, iy = map(int, key.split(","))
            if (
                f"{ix},{iy}" in self.pier
                or f"{ix},{iy + 1}" in self.pier
                or f"{ix},{iy - 1}" in self.pier
            ):
                if abs(iy - (-2)) <= 1 and -9 <= ix <= -3:
                    continue
            jx = noise(ix, iy + 7) * 22
            jy = noise(ix + 5, iy) * 18
            x = ix * TILE + jx
            y = iy * TILE + jy
            shore = is_shore(ix, iy)
            r = noise01(ix, iy, 51)
            if shore:
                if "reed" in self.nature and r > 0.42:
                    place("reed", x + 4, y - 6, 0)
                if "rockWet" in self.nature and noise01(ix, iy, 53) > 0.62:
                    place("rockWet", x - 8, y + 4, 0.15)
                if "lily" in self.nature and noise01(ix, iy, 55) > 0.55:
                    place("lily", x, y, 0.5)
            else:
                if r > 0.38 and "lily" in self.nature:
                    if noise01(ix, iy, 57) > 0.78 and "lilyBloom" in self.nature:
                        place("lilyBloom", x, y, 0.5)
                    else:
                        place("lily", x, y, 0.5)
                    if noise01(ix, iy, 59) > 0.7:
                        place("lily", x + noise(ix, iy) * 16, y + noise(iy, ix) * 14, 0.5)
                if "rockWet" in self.nature and noise01(ix, iy, 61) > 0.88:
                    place("rockWet", x, y, 0.15)

    def place_buildings(self) -> None:
        sf, w, h = PROP_SPRITES["cottage_red"]
        self.nodes.append(("cottage_red", sf, 220, 400, w, h, 0.5, 0.0, False))
        sf, w, h = PROP_SPRITES["shed"]
        self.nodes.append(("shed", sf, -380, 180, w, h, 0.5, 0.0, False))

    def build(self) -> List[Tuple]:
        self.water = self.build_pond_water()
        self.paint_terrain()
        self.place_pond()
        # Pier dirt is in wanted now — reuse the same fringe tiles as the rest of the farm
        self.paint_grass_fringe()
        # Garden before cottage so editor draw-order never paints hedges on the roof
        self.place_yard()
        self.place_cottage_garden()
        self.place_craftbench()
        self.place_buildings()
        self.place_decor_list()
        self.place_wild_cover()
        self.place_lake_shore_flora()
        self.place_soft_clutter()
        self.place_lake_water_decor()
        self.prune_under_canopy()
        self.prune_gather_overlap()
        # marker first among actors so lookup is easy; keep ground order natural
        self.nodes.insert(0, ("__farm_baked", None, 0, 0, 1, 1, 0.5, 0.5, True))
        return self.nodes


def make_sprite_node(
    data: list,
    world_id: int,
    name: str,
    sf: Optional[str],
    x: float,
    y: float,
    w: float,
    h: float,
    ax: float,
    ay: float,
) -> int:
    node_id = len(data)
    ui_id = node_id + 1
    if sf:
        sp_id = node_id + 2
        comps = [{"__id__": ui_id}, {"__id__": sp_id}]
    else:
        comps = [{"__id__": ui_id}]

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
            "_id": f"nFarm_{node_id}",
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
            "_id": f"uFarm_{ui_id}",
        }
    )
    if sf:
        data.append(
            {
                "__type__": "cc.Sprite",
                "_name": "",
                "_objFlags": 0,
                "node": {"__id__": node_id},
                "_enabled": True,
                "__prefab": None,
                "_customMaterial": null_safe(),
                "_srcBlendFactor": 2,
                "_dstBlendFactor": 4,
                "_color": {"__type__": "cc.Color", "r": 255, "g": 255, "b": 255, "a": 255},
                "_spriteFrame": {
                    "__uuid__": sf,
                    "__expectedType__": "cc.SpriteFrame",
                },
                "_type": 0,
                "_fillType": 0,
                "_sizeMode": 0,
                "_fillCenter": {"__type__": "cc.Vec2", "x": 0, "y": 0},
                "_fillStart": 0,
                "_fillRange": 0,
                "_isTrimmedMode": False,
                "_useGrayscale": False,
                "_atlas": None,
                "_id": f"sFarm_{sp_id}",
            }
        )
    return node_id


def null_safe():
    return None


def collect_subtree_ids(data: list, root_id: int) -> Set[int]:
    """Node + all descendant nodes and their components (not including root)."""
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


def remap_ids(obj, id_map: Dict[int, int]):
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
    import re

    nature = load_frames(NATURE_JSON) if NATURE_JSON.exists() else {}
    terrain = load_frames(TERRAIN_JSON) if TERRAIN_JSON.exists() else {}
    if not nature:
        text = (ROOT / "assets/scripts/game/NatureFrames.ts").read_text(encoding="utf-8")
        nature = dict(re.findall(r'"(\w+)":\s*"([^"]+)"', text))
    if not terrain:
        text = (ROOT / "assets/scripts/game/TerrainFrames.ts").read_text(encoding="utf-8")
        terrain = dict(re.findall(r'"(\w+)":\s*"([^"]+)"', text))

    bake = FarmBake(nature, terrain)
    baked_nodes = bake.build()

    src = json.loads(SCENE.read_text(encoding="utf-8"))
    world_id = next(
        i
        for i, o in enumerate(src)
        if isinstance(o, dict) and o.get("__type__") == "cc.Node" and o.get("_name") == "World"
    )
    drop = collect_subtree_ids(src, world_id)
    # Avoid remapping dead World child refs
    src[world_id]["_children"] = []

    # Keep shell objects (everything not a World child)
    keep_old = [i for i in range(len(src)) if i not in drop]
    id_map = {old: new for new, old in enumerate(keep_old)}
    new_data = [remap_ids(src[old], id_map) for old in keep_old]
    new_world_id = id_map[world_id]

    for obj in new_data:
        if isinstance(obj, dict) and obj.get("__type__") in ("cc.SceneAsset", "cc.Scene"):
            obj["_name"] = "Main"

    world = new_data[new_world_id]
    world["_children"] = []
    child_refs = []

    def foot_y(node: Tuple) -> float:
        # (name, sf, x, y, w, h, ax, ay, ground)
        _n, _sf, _x, y, _w, h, _ax, ay, _g = node
        if abs(float(ay)) < 0.05:
            return float(y)
        return float(y) - float(h) * float(ay)

    def ground_rank(name: str) -> int:
        if name.startswith("decor_soft_") or name.startswith("decor_garden_"):
            return 6
        if name.startswith("decor_rock_solid") and "rockBig" not in name:
            return 6
        if name.startswith("pond_deco_lily"):
            return 6
        if name.startswith("fringe_"):
            return 5
        if name == "lake_bridge" or name.startswith("pond_pier_"):
            return 4
        if name.startswith("cliff_") or name.startswith("pond_cliff_"):
            return 2
        if name.startswith("water_") or name.startswith("pond_water_"):
            return 1
        return 0

    # Ground first (tiles → water → fringe → litter), then actors by footY
    # descending: higher Y = further north = drawn first / behind (editor + runtime).
    ground = [n for n in baked_nodes if n[0] == "__farm_baked" or (len(n) > 8 and n[8])]
    actors = [n for n in baked_nodes if n[0] != "__farm_baked" and not n[8]]
    ground.sort(key=lambda n: (ground_rank(n[0]), -foot_y(n)))
    actors.sort(key=lambda n: -foot_y(n))
    ordered = ground + actors

    for name, sf, x, y, w, h, ax, ay, _ground in ordered:
        nid = make_sprite_node(new_data, new_world_id, name, sf, x, y, w, h, ax, ay)
        child_refs.append({"__id__": nid})
    world["_children"] = child_refs

    scene_uuid = "66de7ec3-f7fe-40f3-9332-c4387e06de8d"
    if SCENE_META.exists():
        try:
            scene_uuid = json.loads(SCENE_META.read_text(encoding="utf-8")).get("uuid", scene_uuid)
        except Exception:
            pass

    for obj in new_data:
        if isinstance(obj, dict) and obj.get("__type__") == "cc.Scene":
            obj["_id"] = scene_uuid

    SCENE.write_text(json.dumps(new_data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    print(f"Wrote {SCENE} ({len(ordered)} world nodes, {len(new_data)} objects)")
    print(f"uuid={scene_uuid}")


if __name__ == "__main__":
    main()
