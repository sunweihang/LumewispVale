#!/usr/bin/env python3.12
"""Bake FarmWorldLayout into assets/scenes/Main.scene (in-place).

Runtime GameBootstrap skips FarmWorldLayout.apply when World has `__farm_baked`.
Re-run after layout/art changes:

    python3.12 tools/ui/bake_farm_scene.py
"""

from __future__ import annotations

import json
import math
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
    "weed", "weedBloom", "weedTall", "weedPink", "tuft", "pebble", "twig", "fiber",
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
    "tuft": (28, 24),
    "pebble": (24, 18),
    "twig": (32, 20),
    "fiber": (20, 16),
    "pine": (96, 144),
    "oak": (128, 160),
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
    "cottage_red": ("a5b87678-ab64-4173-9a6b-7d409ec746e2@f9941", 192, 224),
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
        # list of (name, sf, x, y, w, h, ax, ay, ground)
        self.nodes: List[Tuple] = []

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
        if 0 <= ix <= 3 and 1 <= iy <= 4:
            return True
        if 1 <= ix <= 4 and 4 <= iy <= 6:
            return True
        if -3 <= ix <= -1 and -3 <= iy <= -1:
            return True
        if ix == -3 and -6 <= iy <= 3:
            return True
        if ix == 3 and -10 <= iy <= 3:
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
        for iy in range(-7, 9):
            for ix in range(-8, 8):
                kind = "dirt" if self.is_dirt_cell(ix, iy) else "grass"
                self.wanted[f"{ix},{iy}"] = kind
        for key in self.farm_plots:
            self.wanted[key] = "grass"

        for key, kind in self.wanted.items():
            ix, iy = map(int, key.split(","))
            sf = self.pick_variant(kind, ix, iy)
            self.add_ground(f"tile-{kind}_{ix}_{iy}", sf, ix, iy)

        self.paint_grass_fringe()

    def cell_is_grass(self, ix: int, iy: int) -> bool:
        return self.wanted.get(f"{ix},{iy}") != "dirt"

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

    def place_yard(self) -> None:
        if "mailbox" in self.nature:
            self.add_actor("prop_mailbox", self.nature["mailbox"], 100, 330, "mailbox")
        if "shipping" in self.nature:
            self.add_actor("prop_shipping", self.nature["shipping"], 340, 310, "shipping")
        if "craftbench" in self.nature:
            self.add_actor("prop_craftbench", self.nature["craftbench"], 55, 300, "craftbench")
        fence_sf = self.nature.get("fence")
        spots = [
            (96, 470), (160, 470), (224, 470), (288, 470), (352, 470),
            (352, 406), (352, 342),
        ]
        if fence_sf:
            for i, (x, y) in enumerate(spots):
                self.add_actor(f"fence_auto_{i}", fence_sf, x, y, "fence")

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
        for iy in range(-20, 12):
            for ix in range(-26, 8):
                if f"{ix},{iy}" in self.water:
                    continue
                if self.is_clearing_cell(ix, iy):
                    continue
                if -7 <= ix <= -4 and 2 <= iy <= 4:
                    continue
                if 1 <= ix <= 5 and 5 <= iy <= 7:
                    continue
                shore = self.is_pond_shore(ix, iy)
                edge = (
                    shore
                    or ix <= -18
                    or ix >= 5
                    or iy <= -12
                    or iy >= 8
                    or (ix <= -4 and iy >= 4)
                    or (ix >= 4 and iy <= -1)
                )
                mid_wild = (not edge) and (ix <= -3 or ix >= 3 or iy <= -3 or iy >= 5)
                chance = 0.38 if shore else 0.42 if edge else 0.28 if mid_wild else 0.12
                if self.is_dirt_cell(ix, iy):
                    chance *= 0.45
                if noise01(ix, iy, 31) > chance:
                    continue
                roll = noise01(ix, iy, 33)
                if shore:
                    kind = "bush" if roll < 0.55 else "pine" if roll < 0.8 else "oak"
                else:
                    kind = "pine" if roll < 0.34 else "oak" if roll < 0.68 else "bush"
                if kind not in self.nature:
                    kind = tree_kinds[int(roll * len(tree_kinds)) % len(tree_kinds)]
                sf = self.nature[kind]
                jx = noise(ix, iy + 2) * 22
                jy = noise(ix + 2, iy) * 18
                solid = kind != "bush"
                tag = "solid" if solid else "soft"
                self.add_actor(
                    f"decor_{kind}_{tag}_w{n}",
                    sf,
                    ix * TILE + jx,
                    iy * TILE + jy,
                    kind,
                )
                n += 1
                if kind != "bush" and "bush" in self.nature and noise01(ix, iy, 35) > 0.4:
                    self.add_actor(
                        f"decor_bush_soft_w{n}",
                        self.nature["bush"],
                        ix * TILE + jx + 18,
                        iy * TILE + jy - 10,
                        "bush",
                    )
                    n += 1

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
                if soft_roll > 0.55:
                    count = 2 if soft_roll > 0.85 else 1
                    for k in range(count):
                        roll = noise01(ix, iy, 82 + k)
                        if roll < 0.18:
                            kind = "tuft"
                        elif roll < 0.34:
                            kind = "weedBloom"
                        elif roll < 0.5:
                            kind = "weedPink"
                        elif roll < 0.68:
                            kind = "weed"
                        elif roll < 0.82:
                            kind = "weedTall"
                        elif roll < 0.92:
                            kind = "fiber"
                        else:
                            kind = "pebble"
                        sf = self.nature.get(kind)
                        if not sf:
                            continue
                        self.add_actor(
                            f"decor_soft_shore_{kind}_{n}",
                            sf,
                            ix * TILE + noise(ix + k, iy) * 28,
                            iy * TILE + noise(ix, iy + k) * 24 - 8,
                            kind,
                        )
                        n += 1
                if "bush" in self.nature and noise01(ix, iy, 88) > 0.72:
                    self.add_actor(
                        f"decor_bush_soft_shore_{n}",
                        self.nature["bush"],
                        ix * TILE + noise(ix, iy) * 16,
                        iy * TILE + noise(iy, ix) * 14,
                        "bush",
                    )
                    n += 1
                if "rock" in self.nature and noise01(ix, iy, 90) > 0.88:
                    self.add_actor(
                        f"decor_rock_solid_shore_{n}",
                        self.nature["rock"],
                        ix * TILE + noise(ix, 3) * 12,
                        iy * TILE + noise(3, iy) * 10,
                        "rock",
                    )
                    n += 1

    def place_soft_clutter(self) -> None:
        available = [k for k in SOFT_KINDS if k in self.nature]
        if not available:
            return
        n = 0
        for iy in range(-20, 12):
            for ix in range(-26, 8):
                key = f"{ix},{iy}"
                if key in self.water or key in self.farm_plots or key in self.pier:
                    continue
                if -10 <= ix <= -2 and -4 <= iy <= -1:
                    continue
                if 0 <= ix <= 3 and 1 <= iy <= 4 and noise01(ix, iy, 11) < 0.9:
                    continue
                if 1 <= ix <= 4 and 5 <= iy <= 6 and noise01(ix, iy, 12) < 0.92:
                    continue
                dirt = self.is_dirt_cell(ix, iy)
                shore = self.is_pond_shore(ix, iy)
                density = 0.42 if shore else 0.38 if dirt else 0.32
                if noise01(ix, iy, 1) > density:
                    continue
                count = 2 if noise01(ix, iy, 2) > 0.72 else 1
                for k in range(count):
                    roll = noise01(ix, iy, 20 + k)
                    if dirt:
                        if roll < 0.14:
                            kind = "pebble"
                        elif roll < 0.26:
                            kind = "twig"
                        elif roll < 0.36:
                            kind = "fiber"
                        elif roll < 0.5:
                            kind = "tuft"
                        elif roll < 0.7:
                            kind = "weed"
                        elif roll < 0.84:
                            kind = "weedTall"
                        else:
                            kind = "weedPink"
                    else:
                        if roll < 0.12:
                            kind = "tuft"
                        elif roll < 0.22:
                            kind = "fiber"
                        elif roll < 0.45:
                            kind = "weed"
                        elif roll < 0.62:
                            kind = "weedBloom"
                        elif roll < 0.8:
                            kind = "weedTall"
                        elif roll < 0.9:
                            kind = "weedPink"
                        else:
                            kind = "pebble"
                    if kind not in self.nature:
                        kind = available[int(roll * len(available)) % len(available)]
                    sf = self.nature.get(kind)
                    if not sf:
                        continue
                    jx = noise(ix + k * 3, iy) * 30
                    jy = noise(ix, iy + k * 5) * 26
                    self.add_actor(
                        f"decor_soft_{kind}_{n}",
                        sf,
                        ix * TILE + jx,
                        iy * TILE + jy - TILE * 0.15,
                        kind,
                    )
                    n += 1
                if dirt and noise01(ix, iy, 9) > 0.88 and "rock" in self.nature:
                    self.add_actor(
                        f"decor_soft_rock_{n}",
                        self.nature["rock"],
                        ix * TILE + noise(ix, iy) * 20,
                        iy * TILE + noise(iy, ix) * 16,
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
        self.place_buildings()
        self.place_yard()
        self.place_decor_list()
        self.place_wild_cover()
        self.place_lake_shore_flora()
        self.place_soft_clutter()
        self.place_lake_water_decor()
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

    # Ground nodes first, then actors (matches WorldYSort expectations roughly)
    ground = [n for n in baked_nodes if n[0] == "__farm_baked" or (len(n) > 8 and n[8])]
    actors = [n for n in baked_nodes if n[0] != "__farm_baked" and not n[8]]
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
