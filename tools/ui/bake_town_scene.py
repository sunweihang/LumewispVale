#!/usr/bin/env python3.12
"""Bake a full Stardew-like town into assets/scenes/Town.scene.

Institutions: seed/ore/general shops, police, post, clinic, school, mayor,
community, saloon, fish shop, library, museum, carpenter, NPC homes.

    python3.12 tools/ui/bake_town_scene.py
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
OUT_SCENE = ROOT / "assets/scenes/Town.scene"
OUT_META = ROOT / "assets/scenes/Town.scene.meta"
UUID_MAP = Path(__file__).resolve().parent / "uuid-map.json"

TILE = 64

# name -> (uuid-map key, w, h)
BUILDINGS = {
    "community": ("bld-community", 320, 256),
    "seedshop": ("bld-seedshop", 288, 240),
    "oreshop": ("bld-oreshop", 288, 240),
    "general": ("bld-general", 288, 240),
    "police": ("bld-police", 256, 224),
    "post": ("bld-post", 256, 224),
    "clinic": ("bld-clinic", 288, 224),
    "school": ("bld-school", 288, 256),
    "mayor": ("bld-mayor", 320, 272),
    "saloon": ("bld-saloon", 288, 240),
    "fishshop": ("bld-fishshop", 288, 240),
    "library": ("bld-library", 256, 256),
    "museum": ("bld-museum", 288, 256),
    "carpenter": ("bld-carpenter", 320, 240),
    "cottage_blue": ("bld-cottage-blue", 256, 224),
    "cottage_red": ("bld-cottage-red", 288, 224),
    "home_green": ("bld-home-green", 224, 224),
    "home_yellow": ("bld-home-yellow", 256, 224),
    "home_purple": ("bld-home-purple", 224, 224),
    "shed": ("bld-shed", 128, 128),
    "fountain": ("prop-fountain", 128, 128),
    "lamp": ("prop-lamp", 64, 128),
    "bench": ("prop-bench", 96, 48),
    "sign": ("prop-sign", 64, 80),
    "fence": ("prop-fence", 64, 64),
}

NATURE_SIZE = {
    "oak": (128, 160),
    "pine": (96, 144),
    "bush": (64, 64),
    "weed": (40, 36),
    "weedBloom": (40, 36),
    "tuft": (28, 24),
    "pebble": (24, 18),
    "weedPink": (36, 40),
    "weedTall": (36, 40),
    "twig": (32, 20),
    "fiber": (20, 16),
    "rock": (48, 40),
    "rockBig": (72, 56),
    "stump": (56, 48),
    "log": (80, 32),
    "reed": (40, 44),
    "lily": (28, 24),
    "lilyBloom": (28, 24),
    "rockWet": (40, 28),
}

SOFT_KINDS = (
    "weed", "weedBloom", "weedTall", "weedPink", "tuft", "pebble", "twig", "fiber",
)


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


class TownBake:
    def __init__(self, uuids: Dict[str, str], nature: Dict[str, str], terrain: Dict[str, str]):
        self.uuids = uuids
        self.nature = nature
        self.terrain = terrain
        self.stone: Set[str] = set()
        self.dirt: Set[str] = set()
        self.clear: Set[str] = set()  # building yards
        self.water: Set[str] = set()
        self.nodes: List[Tuple] = []

    def sf(self, key: str) -> Optional[str]:
        return self.uuids.get(key) or self.terrain.get(key) or self.nature.get(key)

    def add_ground(self, name: str, sf: str, ix: int, iy: int) -> None:
        self.nodes.append((name, sf, ix * TILE, iy * TILE, TILE, TILE, 0.5, 0.5, True))

    def add_actor(self, name, sf, x, y, w, h, ay=0.0) -> None:
        self.nodes.append((name, sf, x, y, w, h, 0.5, ay, False))

    def mark_rect(self, target: Set[str], x0, x1, y0, y1) -> None:
        for iy in range(y0, y1 + 1):
            for ix in range(x0, x1 + 1):
                target.add(f"{ix},{iy}")

    def mark_blob(
        self,
        target: Set[str],
        cx: float,
        cy: float,
        rx: float,
        ry: float,
        salt: float = 0,
        core: float = 0.5,
    ) -> None:
        """Farm-style elliptical patch with noisy rim (not a hard rectangle)."""
        x0, x1 = int(math.floor(cx - rx - 2)), int(math.ceil(cx + rx + 2))
        y0, y1 = int(math.floor(cy - ry - 2)), int(math.ceil(cy + ry + 2))
        for iy in range(y0, y1 + 1):
            for ix in range(x0, x1 + 1):
                dx = (ix - cx) / max(rx, 0.35)
                dy = (iy - cy) / max(ry, 0.35)
                d = dx * dx + dy * dy
                wobble = noise01(ix, iy, salt) * 0.5
                wobble += math.sin(ix * 0.7 + iy * 0.45 + salt) * 0.08
                if d < core + wobble * 0.35:
                    target.add(f"{ix},{iy}")
                elif d < 1.05 + wobble * 0.55:
                    if noise01(ix, iy, salt + 11) > 0.38:
                        target.add(f"{ix},{iy}")

    def mark_path_h(self, target, y, x0, x1, width=2) -> None:
        """Horizontal path — solid core, optional noisy shoulder (farm dirt lanes)."""
        half = width // 2
        for ix in range(min(x0, x1), max(x0, x1) + 1):
            for iy in range(y - half, y - half + width):
                target.add(f"{ix},{iy}")
            # Ragged shoulder
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

    def yard(self, cx: int, cy: int, rx: int = 2, ry: int = 2, cobble=False) -> None:
        """Lot apron — clear keeps trees out; surface is a soft blob, not a square pad."""
        self.mark_blob(self.clear, cx, cy, rx + 0.4, ry + 0.3, salt=cx * 3 + cy, core=0.45)
        lot = self.stone if cobble else self.dirt
        self.mark_blob(lot, cx, cy - 0.2, 1.35, 1.1, salt=20 + cx + cy * 2, core=0.4)

    def soften_mask(self, target: Set[str], locked: Set[str], salt: float, rounds: int = 1) -> None:
        """Nibble sharp corners / grow ragged edges (farm shoreline jitter style)."""
        for r in range(rounds):
            add: Set[str] = set()
            drop: Set[str] = set()
            for key in list(target):
                if key in locked:
                    continue
                ix, iy = map(int, key.split(","))
                ortho = 0
                for dx, dy in ((0, 1), (0, -1), (1, 0), (-1, 0)):
                    if f"{ix + dx},{iy + dy}" in target:
                        ortho += 1
                # Erode lonely / corner tiles
                if ortho <= 1 and noise01(ix, iy, salt + r) > 0.4:
                    drop.add(key)
                elif ortho == 2 and noise01(ix, iy, salt + r + 3) > 0.78:
                    drop.add(key)
                # Grow into grass along soft edges
                if ortho >= 2:
                    for dx, dy in ((0, 1), (0, -1), (1, 0), (-1, 0)):
                        nk = f"{ix + dx},{iy + dy}"
                        if nk in target or nk in locked or nk in self.water or nk in self.stone:
                            continue
                        if noise01(ix + dx, iy + dy, salt + r + 9) < 0.22:
                            add.add(nk)
            target.difference_update(drop)
            target.update(add)

    def build_paths(self) -> None:
        """
        Districted Pelican-scale town (read left→right, south→north):

           Yellow  School  Community  Mayor
             Red Blue              Clinic
          Green Purple    [Plaza]  General → Seed
          Police           Saloon   Ore → Carpenter
          Post
         Museum     Library   pier → river / fish

        Rules: clear district gaps, no strip-mall shop row, homes only in NW.
        """
        # Intimate plaza — blob, not a stone continent
        self.mark_blob(self.stone, 0, 0, 3.2, 2.4, salt=1, core=0.42)
        # Keep a walkable core under the fountain
        self.mark_blob(self.stone, 0, 0, 1.4, 1.2, salt=2, core=0.2)

        # Cobble radials — short, then dirt takes over
        self.mark_path_v(self.stone, 0, 2, 5, width=2)       # N out of plaza
        self.mark_path_v(self.stone, 0, -5, -2, width=2)     # S → saloon
        self.mark_path_h(self.stone, 0, -6, -3, width=2)     # W → police
        self.mark_path_h(self.stone, 1, 3, 6, width=2)       # E → general

        # Dirt continuations — one spine per district (avoid spaghetti)
        self.mark_path_v(self.dirt, 0, 5, 11, width=2)       # → community
        self.mark_path_h(self.dirt, 11, -7, 7, width=2)      # civic terrace
        self.mark_path_v(self.dirt, 6, 2, 7, width=2)        # market alley → clinic
        self.mark_path_h(self.dirt, 4, 6, 11, width=2)       # → seed
        self.mark_path_v(self.dirt, 8, -6, 1, width=2)       # SE → ore / carpenter bend
        self.mark_path_h(self.dirt, -6, 8, 13, width=2)      # → carpenter
        self.mark_path_v(self.dirt, -7, -3, 1, width=2)      # services spine
        self.mark_path_h(self.dirt, -6, -12, -4, width=2)    # → museum
        self.mark_path_v(self.dirt, -4, -9, -6, width=2)     # → library
        # Residential pocket (NW) — one loop, not a maze
        self.mark_path_h(self.dirt, 5, -14, -7, width=2)
        self.mark_path_v(self.dirt, -9, 1, 8, width=2)
        self.mark_path_h(self.dirt, 8, -13, -9, width=2)
        # South waterfront + farm exit
        self.mark_path_h(self.dirt, -7, -4, 5, width=2)
        self.mark_path_v(self.dirt, 4, -11, -6, width=2)
        self.mark_path_h(self.dirt, 1, -14, -7, width=2)

        # Building lots — apron only under feet, matching place_buildings()
        lots = [
            (0, -5, 2, 2, True),       # saloon
            (6, 2, 2, 2, True),        # general
            (6, 7, 2, 2, False),       # clinic
            (11, 4, 2, 2, False),      # seed
            (-7, 1, 2, 2, True),       # police
            (-7, -3, 2, 2, False),     # post
            (8, -2, 2, 2, False),      # ore
            (13, -6, 2, 2, False),     # carpenter
            (0, 11, 3, 2, True),       # community
            (-7, 11, 2, 2, False),     # school
            (7, 11, 2, 2, False),      # mayor
            (-12, -6, 2, 2, False),    # museum
            (-4, -9, 2, 2, False),     # library
            (-9, 7, 2, 2, False),      # blue home
            (-14, 5, 2, 2, False),     # red home
            (-11, 1, 2, 2, False),     # green home
            (-13, 10, 2, 2, False),    # yellow home
            (-5, 5, 2, 2, False),      # purple home
            (4, -11, 2, 2, False),     # fish
            (8, -10, 2, 2, False),     # shed
        ]
        for cx, cy, rx, ry, cobble in lots:
            self.yard(cx, cy, rx, ry, cobble=cobble)

        # Dirt collar around plaza (farm porch-rim style)
        for iy in range(-4, 5):
            for ix in range(-5, 6):
                key = f"{ix},{iy}"
                if key in self.stone or key in self.water:
                    continue
                dx, dy = ix / 4.2, iy / 3.2
                d = dx * dx + dy * dy
                if 0.55 < d < 1.35 and noise01(ix, iy, 3) > 0.32:
                    self.dirt.add(key)

        # Organicize hard path/plaza edges before river.
        # Lock path spines so corridors stay walkable; only rims nibble.
        plaza_core = {f"{ix},{iy}" for iy in range(-1, 2) for ix in range(-1, 2)}
        stone_spine = set(plaza_core)
        for iy in range(-5, 6):
            stone_spine.add(f"0,{iy}")
            stone_spine.add(f"-1,{iy}")
        for ix in range(-6, 7):
            stone_spine.add(f"{ix},0")
            stone_spine.add(f"{ix},1")
        self.soften_mask(self.stone, locked=stone_spine, salt=40, rounds=1)
        self.dirt -= self.stone

        dirt_spine: Set[str] = set()
        for ix, iy0, iy1 in (
            (0, 5, 11), (6, 2, 7), (8, -6, 1), (-7, -3, 1), (-9, 1, 8), (4, -11, -6),
        ):
            for iy in range(min(iy0, iy1), max(iy0, iy1) + 1):
                dirt_spine.add(f"{ix},{iy}")
                dirt_spine.add(f"{ix - 1},{iy}")
        for iy, x0, x1 in (
            (11, -7, 7), (4, 6, 11), (-6, 8, 13), (5, -14, -7), (8, -13, -9),
            (-7, -4, 5), (1, -14, -7), (-6, -12, -4),
        ):
            for ix in range(min(x0, x1), max(x0, x1) + 1):
                dirt_spine.add(f"{ix},{iy}")
                dirt_spine.add(f"{ix},{iy - 1}")
        self.soften_mask(self.dirt, locked=self.stone | dirt_spine, salt=50, rounds=2)
        self.dirt -= self.stone

        self.build_river()

    def build_river(self) -> None:
        """Southern river as a wavy band (farm lake ellipse + shoreline jitter)."""
        for iy in range(-15, -8):
            for ix in range(-10, 15):
                # Pier corridor kept as land
                if 3 <= ix <= 5 and iy >= -12:
                    continue
                # Centerline drifts south-east
                cy = -12.2 + math.sin(ix * 0.35) * 0.9 + noise(ix, 21) * 0.5
                cx_bend = ix * 0.02
                dy = (iy - cy) / 2.6
                dx = (ix - 2.0 - cx_bend) / 14.0
                d = dy * dy + dx * dx * 0.15
                wobble = noise01(ix, iy, 21) * 0.35
                if d < 0.55 + wobble * 0.25:
                    self.water.add(f"{ix},{iy}")
                elif d < 0.95 + wobble:
                    if noise01(ix, iy, 22) > 0.28:
                        self.water.add(f"{ix},{iy}")

        # Shoreline jitter (borrowed from farm)
        for key in list(self.water):
            ix, iy = map(int, key.split(","))
            n = f"{ix},{iy + 1}" in self.water
            s = f"{ix},{iy - 1}" in self.water
            e = f"{ix + 1},{iy}" in self.water
            w = f"{ix - 1},{iy}" in self.water
            land = (0 if n else 1) + (0 if s else 1) + (0 if e else 1) + (0 if w else 1)
            if land >= 2 and noise01(ix, iy, 70) > 0.58:
                self.water.discard(key)

        for key in list(self.water):
            ix, iy = map(int, key.split(","))
            for dx, dy in ((0, 1), (0, -1), (1, 0), (-1, 0)):
                nx, ny = ix + dx, iy + dy
                if 3 <= nx <= 5 and ny >= -12:
                    continue
                nk = f"{nx},{ny}"
                if nk in self.water or nk in self.stone:
                    continue
                if noise01(nx, ny, 71) < 0.16:
                    self.water.add(nk)

        self.water -= self.stone
        self.dirt -= self.water

        # Pier boards toward fish shop
        for iy in range(-12, -9):
            for ix in (3, 4):
                self.stone.add(f"{ix},{iy}")
                self.water.discard(f"{ix},{iy}")
                self.clear.add(f"{ix},{iy}")
                self.dirt.discard(f"{ix},{iy}")

    def is_clearing(self, ix: int, iy: int) -> bool:
        key = f"{ix},{iy}"
        if key in self.water:
            return True
        return key in self.stone or key in self.dirt or key in self.clear

    def is_shore(self, ix: int, iy: int) -> bool:
        if f"{ix},{iy}" in self.water:
            return False
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                if dx == 0 and dy == 0:
                    continue
                if f"{ix + dx},{iy + dy}" in self.water:
                    return True
        return False

    def paint_terrain(self) -> None:
        stone_sf = self.sf("tile-stone")
        water_sf = self.sf("water") or self.sf("tile-water")
        # Room for NW homes + SE workshop — still compact, not continental
        for iy in range(-15, 14):
            for ix in range(-17, 16):
                key = f"{ix},{iy}"
                if key in self.water and water_sf:
                    self.add_ground(f"pond_water_{ix}_{iy}", water_sf, ix, iy)
                    continue
                if key in self.stone and stone_sf:
                    self.add_ground(f"tile-stone_{ix}_{iy}", stone_sf, ix, iy)
                    continue
                if key in self.dirt:
                    variants = [k for k in ("dirt", "dirtB") if self.sf(k)]
                    pick = variants[abs(int(noise(ix, iy) * 1000)) % len(variants)]
                    self.add_ground(f"tile-dirt_{ix}_{iy}", self.sf(pick), ix, iy)
                    continue
                variants = [k for k in ("grass", "grassB", "grassC") if self.sf(k)]
                pick = variants[abs(int(noise(ix, iy) * 1000)) % len(variants)]
                self.add_ground(f"tile-grass_{ix}_{iy}", self.sf(pick), ix, iy)
        # Order matters: dirt↔grass fringe first, then stone, then water
        self.paint_dirt_fringe()
        self.paint_stone_fringe()
        self.paint_water_fringe()

    def paint_dirt_fringe(self) -> None:
        """Farm trick: grass fringe overlays on dirt cells that touch grass."""

        def is_grass_side(ix: int, iy: int) -> bool:
            key = f"{ix},{iy}"
            if key in self.stone or key in self.water or key in self.dirt:
                return False
            return True

        for key in self.dirt:
            if key in self.stone or key in self.water:
                continue
            ix, iy = map(int, key.split(","))
            self._fringe_cell(ix, iy, is_grass_side, "fringe_dirt_")

    def _fringe_cell(self, ix: int, iy: int, is_soft_side, prefix: str) -> None:
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

        def place(suffix: str, frame: str) -> None:
            sf = self.sf(frame)
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

    def paint_water_fringe(self) -> None:
        if not self.water:
            return

        def is_land(ix, iy):
            return f"{ix},{iy}" not in self.water

        for key in self.water:
            ix, iy = map(int, key.split(","))
            self._fringe_cell(ix, iy, is_land, "fringe_water_")

    def paint_stone_fringe(self) -> None:
        def soft(ix, iy):
            return f"{ix},{iy}" not in self.stone

        for key in self.stone:
            ix, iy = map(int, key.split(","))
            self._fringe_cell(ix, iy, soft, "fringe_")

    def _bld(self, kind: str, x: float, y: float, name: Optional[str] = None) -> None:
        key, w, h = BUILDINGS[kind]
        sf = self.sf(key)
        if not sf:
            print("missing sprite", key)
            return
        self.add_actor(name or f"bld_{kind}", sf, x, y, w, h, 0.0)

    def place_buildings(self) -> None:
        """
        Districted composition — feet at tile centers (+foot nudge).
        Must stay in sync with build_paths() lots.
        """
        foot = 36  # sit slightly above tile center so lots read under feet

        def at(tx: int, ty: int) -> Tuple[float, float]:
            return tx * TILE, ty * TILE + foot

        # Plaza heart
        self._bld("fountain", 0, 4)

        # South — saloon owns the plaza edge
        self._bld("saloon", *at(0, -5))

        # East market — staggered depth (not one strip-mall Y)
        self._bld("general", *at(6, 2))
        self._bld("clinic", *at(6, 7))
        self._bld("seedshop", *at(11, 4))
        self._bld("oreshop", *at(8, -2))
        self._bld("carpenter", *at(13, -6))

        # West services
        self._bld("police", *at(-7, 1))
        self._bld("post", *at(-7, -3))

        # North civic terrace
        self._bld("community", *at(0, 11))
        self._bld("school", *at(-7, 11))
        self._bld("mayor", *at(7, 11))

        # SW culture pair
        self._bld("museum", *at(-12, -6))
        self._bld("library", *at(-4, -9))

        # NW residential pocket only
        self._bld("cottage_blue", *at(-9, 7), "home_npc_a")
        self._bld("cottage_red", *at(-14, 5), "home_npc_b")
        self._bld("home_green", *at(-11, 1), "home_npc_c")
        self._bld("home_yellow", *at(-13, 10), "home_npc_d")
        self._bld("home_purple", *at(-5, 5), "home_npc_e")

        # Waterfront
        self._bld("fishshop", *at(4, -11))
        self._bld("shed", *at(8, -10))

        # Plaza furniture — corners + market mouth, not cluttered
        lamps = [
            (-160, 100), (160, 100), (-160, -90), (160, -90),
            (0, 180), (-6 * TILE, 20), (6 * TILE, 40),
            (0, 8 * TILE), (4 * TILE, -7 * TILE),
        ]
        for i, (x, y) in enumerate(lamps):
            self._bld("lamp", x, y, f"lamp_{i}")

        benches = [
            (-96, -36), (96, -36), (-120, 72), (120, 72), (0, -120),
        ]
        for i, (x, y) in enumerate(benches):
            self._bld("bench", x, y, f"bench_{i}")

        signs = [
            (-12 * TILE, 40, "sign_farm"),
            (0, -6 * TILE, "sign_beach"),
            (0, 7 * TILE, "sign_civic"),
            # North of oreshop — shallow mine road
            (8 * TILE, 1 * TILE + 36, "sign_mine"),
        ]
        for x, y, name in signs:
            self._bld("sign", x, y, name)

        # Short fence runs framing home yards / school lot
        for i, (x, y) in enumerate([
            (-10 * TILE, 5.5 * TILE), (-9.4 * TILE, 5.5 * TILE),
            (-13 * TILE, 4 * TILE), (-6.2 * TILE, 9.5 * TILE),
            (-5.6 * TILE, 9.5 * TILE),
        ]):
            self._bld("fence", x, y, f"fence_{i}")

    def place_trees(self) -> None:
        n = 0
        for iy in range(-15, 14):
            for ix in range(-17, 16):
                if self.is_clearing(ix, iy):
                    continue
                if abs(ix) <= 3 and abs(iy) <= 2:
                    continue
                shore = self.is_shore(ix, iy)
                edge = shore or ix <= -15 or ix >= 14 or iy <= -13 or iy >= 12
                mid = (not edge) and (abs(ix) >= 9 or abs(iy) >= 8)
                chance = 0.4 if shore else 0.36 if edge else 0.18 if mid else 0.05
                if f"{ix},{iy}" in self.dirt:
                    chance *= 0.4
                if noise01(ix, iy, 41) > chance:
                    continue
                roll = noise01(ix, iy, 43)
                jx = noise(ix, iy + 2) * 22
                jy = noise(ix + 2, iy) * 18
                if edge and noise01(ix, iy, 45) > 0.62 and self.sf("nat-tree-blossom"):
                    sf = self.sf("nat-tree-blossom")
                    self.add_actor(f"decor_blossom_soft_t{n}", sf, ix * TILE + jx, iy * TILE + jy, 128, 160)
                    n += 1
                    continue
                if shore:
                    kind = "bush" if roll < 0.55 else "pine" if roll < 0.8 else "oak"
                elif roll < 0.4:
                    kind = "oak"
                elif roll < 0.68:
                    kind = "pine"
                else:
                    kind = "bush"
                sf = self.nature.get(kind) or self.sf(f"nat-tree-{kind}") or self.sf(f"nat-{kind}")
                if not sf:
                    continue
                w, h = NATURE_SIZE.get(kind, (64, 64))
                tag = "soft" if kind == "bush" else "solid"
                self.add_actor(f"decor_{kind}_{tag}_t{n}", sf, ix * TILE + jx, iy * TILE + jy, w, h)
                n += 1
                # Farm understory: bush tucked under tree canopy
                if kind != "bush" and "bush" in self.nature and noise01(ix, iy, 35) > 0.45:
                    self.add_actor(
                        f"decor_bush_soft_u{n}",
                        self.nature["bush"],
                        ix * TILE + jx + 16,
                        iy * TILE + jy - 12,
                        *NATURE_SIZE["bush"],
                    )
                    n += 1

    def place_scatter_props(self) -> None:
        """Rocks / stumps / logs in district gaps — farm DECOR density."""
        hard = [k for k in ("rock", "rockBig", "stump", "log") if k in self.nature]
        if not hard:
            return
        n = 0
        for iy in range(-14, 13):
            for ix in range(-16, 15):
                key = f"{ix},{iy}"
                if key in self.stone or key in self.water:
                    continue
                if abs(ix) <= 3 and abs(iy) <= 2:
                    continue
                # Prefer grass pockets and path shoulders, not building clear cores
                if key in self.clear and key not in self.dirt:
                    continue
                shore = self.is_shore(ix, iy)
                dens = 0.09 if shore else 0.055 if key in self.dirt else 0.04
                if noise01(ix, iy, 51) > dens:
                    continue
                kind = hard[int(noise01(ix, iy, 52) * len(hard)) % len(hard)]
                if shore and "rock" in self.nature and noise01(ix, iy, 53) > 0.45:
                    kind = "rock"
                w, h = NATURE_SIZE.get(kind, (48, 40))
                self.add_actor(
                    f"decor_{kind}_solid_s{n}",
                    self.nature[kind],
                    ix * TILE + noise(ix, iy) * 20,
                    iy * TILE + noise(iy, ix) * 16,
                    w,
                    h,
                )
                n += 1

    def place_shore_flora(self) -> None:
        n = 0
        for iy in range(-15, 14):
            for ix in range(-17, 16):
                if not self.is_shore(ix, iy):
                    continue
                if f"{ix},{iy}" in self.stone:
                    continue
                if noise01(ix, iy, 81) > 0.55:
                    roll = noise01(ix, iy, 82)
                    if roll < 0.35 and "reed" in self.nature:
                        kind = "reed"
                    elif roll < 0.55 and "lily" in self.nature:
                        kind = "lily"
                    elif roll < 0.75:
                        kind = "weedBloom" if "weedBloom" in self.nature else "weed"
                    else:
                        kind = "tuft" if "tuft" in self.nature else "weed"
                    sf = self.nature.get(kind)
                    if sf:
                        w, h = NATURE_SIZE.get(kind, (32, 32))
                        self.add_actor(
                            f"decor_soft_shore_{kind}_{n}",
                            sf,
                            ix * TILE + noise(ix, iy) * 26,
                            iy * TILE + noise(iy, ix) * 20 - 6,
                            w,
                            h,
                        )
                        n += 1
                if "rockWet" in self.nature and noise01(ix, iy, 90) > 0.86:
                    w, h = NATURE_SIZE["rockWet"]
                    self.add_actor(
                        f"decor_rockWet_solid_shore_{n}",
                        self.nature["rockWet"],
                        ix * TILE + noise(ix, 3) * 12,
                        iy * TILE + noise(3, iy) * 10,
                        w,
                        h,
                    )
                    n += 1

    def place_soft(self) -> None:
        """Farm soft-clutter density — weeds/pebbles/twigs break flat grass tiles."""
        available = [k for k in SOFT_KINDS if k in self.nature]
        if not available:
            return
        n = 0
        for iy in range(-15, 14):
            for ix in range(-17, 16):
                key = f"{ix},{iy}"
                if key in self.stone or key in self.water:
                    continue
                # Keep plaza open
                if abs(ix) <= 2 and abs(iy) <= 1:
                    continue
                dirt = key in self.dirt
                shore = self.is_shore(ix, iy)
                dens = 0.4 if shore else 0.34 if dirt else 0.26
                if key in self.clear and not dirt:
                    dens *= 0.35
                if noise01(ix, iy, 1) > dens:
                    continue
                count = 2 if noise01(ix, iy, 2) > 0.7 else 1
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
                    w, h = NATURE_SIZE.get(kind, (32, 32))
                    self.add_actor(
                        f"decor_soft_{kind}_{n}",
                        self.nature[kind],
                        ix * TILE + noise(ix + k, iy) * 24,
                        iy * TILE + noise(ix, iy + k) * 20 - 8,
                        w,
                        h,
                    )
                    n += 1

    def build(self) -> List[Tuple]:
        self.build_paths()
        self.paint_terrain()
        self.place_buildings()
        self.place_trees()
        self.place_scatter_props()
        self.place_shore_flora()
        self.place_soft()
        self.nodes.insert(0, ("__town_baked", None, 0, 0, 1, 1, 0.5, 0.5, True))
        self.nodes.append(("__town_spawn", None, 0, -96, 1, 1, 0.5, 0.5, True))
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
            "_id": f"nTown_{node_id}",
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
            "_id": f"uTown_{ui_id}",
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
                "_id": f"sTown_{sp_id}",
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

    baked = TownBake(uuids, nature, terrain).build()

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
            obj["_name"] = "Town"

    world = new_data[new_world_id]
    ground = [n for n in baked if n[0] in ("__town_baked", "__town_spawn") or n[8]]
    actors = [n for n in baked if n[0] not in ("__town_baked", "__town_spawn") and not n[8]]
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


if __name__ == "__main__":
    main()
