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

    def mark_path_h(self, target, y, x0, x1, width=2) -> None:
        half = width // 2
        for iy in range(y - half, y - half + width):
            for ix in range(min(x0, x1), max(x0, x1) + 1):
                target.add(f"{ix},{iy}")

    def mark_path_v(self, target, x, y0, y1, width=2) -> None:
        half = width // 2
        for ix in range(x - half, x - half + width):
            for iy in range(min(y0, y1), max(y0, y1) + 1):
                target.add(f"{ix},{iy}")

    def yard(self, cx: int, cy: int, rx: int = 2, ry: int = 2, cobble=False) -> None:
        """Lot apron around a building foot (tile coords)."""
        self.mark_rect(self.clear, cx - rx, cx + rx, cy - ry, cy + ry)
        lot = self.stone if cobble else self.dirt
        self.mark_rect(lot, cx - 1, cx + 1, cy - 1, cy)

    def build_paths(self) -> None:
        """
        Pelican Town–like plan:
        - Compact plaza hub (fountain) with shops facing it
        - Short cobble radials — no strip-mall highways
        - Residential pocket NW, civic N, beach SE, river S
        """
        # —— Town square (heart) ——
        self.mark_rect(self.stone, -4, 4, -3, 3)

        # Short radials out of the square (1–4 tiles, not continents)
        self.mark_path_v(self.stone, 0, 3, 8, width=2)        # north → community
        self.mark_path_v(self.stone, 0, -6, -3, width=2)      # south → saloon / beach
        self.mark_path_h(self.stone, 0, -7, -4, width=2)      # west → police/post
        self.mark_path_h(self.stone, 0, 4, 8, width=2)        # east → shops / forge
        self.mark_path_h(self.dirt, 4, -6, -2, width=2)       # NW homes lane
        self.mark_path_h(self.dirt, 5, 4, 8, width=2)         # NE clinic–general row
        self.mark_path_v(self.dirt, 7, -6, -1, width=2)       # SE forge spur
        self.mark_path_v(self.dirt, -6, -6, -1, width=2)      # SW museum spur
        self.mark_path_h(self.dirt, -7, -2, 4, width=2)       # south beach lane
        self.mark_path_v(self.dirt, 2, -10, -6, width=2)      # to fish pier

        # Farm road (west exit) — short stub like bus-stop entrance
        self.mark_path_h(self.dirt, 1, -11, -7, width=2)

        # Building lots (compact — facing plaza / along short lanes)
        lots = [
            # plaza ring
            (0, -5, 2, 2, True),     # saloon S
            (-5, 4, 2, 2, True),     # clinic NW
            (5, 4, 2, 2, True),      # general NE
            (8, 4, 2, 2, True),      # seed E of general
            (-7, 1, 2, 2, True),     # police W
            (-7, -2, 2, 2, True),    # post SW of police
            (7, -3, 2, 2, True),     # ore / blacksmith SE
            (9, -5, 2, 2, False),    # carpenter further SE
            # civic / culture
            (0, 8, 3, 2, True),      # community N
            (6, 7, 2, 2, False),     # mayor NE
            (-8, 6, 2, 2, False),    # school NW
            (-7, -5, 2, 2, False),   # museum SW
            (-4, -6, 2, 2, False),   # library by museum
            # residential pocket (NW, like Pelican homes)
            (-5, 6, 2, 2, False),
            (-8, 4, 2, 2, False),
            (-9, 2, 2, 2, False),
            (-4, 7, 2, 2, False),
            (4, 7, 2, 2, False),
            # beach / pier
            (3, -9, 2, 2, False),    # fish
            (6, -8, 2, 2, False),    # shed
        ]
        for cx, cy, rx, ry, cobble in lots:
            self.yard(cx, cy, rx, ry, cobble=cobble)

        # Soft dirt nibbles around plaza rim (organic edge)
        for iy in range(-4, 5):
            for ix in range(-5, 6):
                key = f"{ix},{iy}"
                if key in self.stone:
                    continue
                if abs(ix) >= 4 or abs(iy) >= 3:
                    if noise01(ix, iy, 3) > 0.4:
                        self.dirt.add(key)

        # Southern river / pier water (natural town edge like Pelican→Beach)
        for iy in range(-13, -9):
            for ix in range(-4, 10):
                # leave pier corridor at x=2..4
                if 1 <= ix <= 4 and iy >= -11:
                    continue
                if noise01(ix, iy, 21) > 0.18:
                    self.water.add(f"{ix},{iy}")
        # pier boards over water approach
        for iy in range(-11, -8):
            for ix in (2, 3):
                self.stone.add(f"{ix},{iy}")
                self.water.discard(f"{ix},{iy}")
                self.clear.add(f"{ix},{iy}")

    def is_clearing(self, ix: int, iy: int) -> bool:
        key = f"{ix},{iy}"
        if key in self.water:
            return True
        return key in self.stone or key in self.dirt or key in self.clear

    def paint_terrain(self) -> None:
        stone_sf = self.sf("tile-stone")
        water_sf = self.sf("water") or self.sf("tile-water")
        # Compact town AABB — Pelican-scale, not continental sprawl
        for iy in range(-14, 12):
            for ix in range(-13, 13):
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
        self.paint_stone_fringe()
        self.paint_water_fringe()

    def paint_water_fringe(self) -> None:
        if not self.water:
            return

        def is_land(ix, iy):
            return f"{ix},{iy}" not in self.water

        for key in self.water:
            ix, iy = map(int, key.split(","))
            n, e, s, w = is_land(ix, iy + 1), is_land(ix + 1, iy), is_land(ix, iy - 1), is_land(ix - 1, iy)
            if not (n or e or s or w):
                continue
            cn = ce = cs = cw = False

            def place(suffix, frame):
                sf = self.sf(frame)
                if sf:
                    self.add_ground(f"fringe_water_{suffix}_{ix}_{iy}", sf, ix, iy)

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

    def paint_stone_fringe(self) -> None:
        def soft(ix, iy):
            return f"{ix},{iy}" not in self.stone

        for key in self.stone:
            ix, iy = map(int, key.split(","))
            n, e, s, w = soft(ix, iy + 1), soft(ix + 1, iy), soft(ix, iy - 1), soft(ix - 1, iy)
            ne, nw = soft(ix + 1, iy + 1), soft(ix - 1, iy + 1)
            se, sw = soft(ix + 1, iy - 1), soft(ix - 1, iy - 1)
            cn = ce = cs = cw = False

            def place(suffix, frame):
                sf = self.sf(frame)
                if sf:
                    self.add_ground(f"fringe_{suffix}_{ix}_{iy}", sf, ix, iy)

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

    def _bld(self, kind: str, x: float, y: float, name: Optional[str] = None) -> None:
        key, w, h = BUILDINGS[kind]
        sf = self.sf(key)
        if not sf:
            print("missing sprite", key)
            return
        self.add_actor(name or f"bld_{kind}", sf, x, y, w, h, 0.0)

    def place_buildings(self) -> None:
        """
        Pelican Town composition (compact, plaza-centric):
              Community
           School  Mayor
          Homes  Clinic–General–Seed
        Police     [Fountain]     Ore
          Post   Saloon   Carpenter
         Museum/Library     Fish pier → river
        """
        foot = 36  # sit slightly above tile center so lots read under feet

        # Plaza heart
        self._bld("fountain", 0, -8)

        # Face the square (short walk from fountain)
        self._bld("saloon", 0, -5 * TILE + foot)
        self._bld("clinic", -5 * TILE, 4 * TILE + foot)
        self._bld("general", 5 * TILE, 4 * TILE + foot)
        self._bld("seedshop", 8 * TILE, 4 * TILE + foot)
        self._bld("police", -7 * TILE, 1 * TILE + foot)
        self._bld("post", -7 * TILE, -2 * TILE + foot)
        self._bld("oreshop", 7 * TILE, -3 * TILE + foot)
        self._bld("carpenter", 9 * TILE, -5 * TILE + foot)

        # Civic / culture — one short path north / corners
        self._bld("community", 0, 8 * TILE + foot)
        self._bld("mayor", 6 * TILE, 7 * TILE + foot)
        self._bld("school", -8 * TILE, 6 * TILE + foot)
        self._bld("museum", -7 * TILE, -5 * TILE + foot)
        self._bld("library", -4 * TILE, -6 * TILE + foot)

        # Residential pocket (NW) — yards touch dirt lanes, not a row of clones
        self._bld("cottage_blue", -5 * TILE, 6 * TILE + foot, "home_npc_a")
        self._bld("cottage_red", -8 * TILE, 4 * TILE + foot, "home_npc_b")
        self._bld("home_green", -9 * TILE, 2 * TILE + foot, "home_npc_c")
        self._bld("home_yellow", -4 * TILE, 7 * TILE + foot, "home_npc_d")
        self._bld("home_purple", 4 * TILE, 7 * TILE + foot, "home_npc_e")

        # Beach / pier (S)
        self._bld("fishshop", 3 * TILE, -9 * TILE + foot)
        self._bld("shed", 6 * TILE, -8 * TILE + foot)

        # Plaza furniture — Stardew square density
        lamps = [
            (-180, 120), (180, 120), (-180, -120), (180, -120),
            (0, 200), (-280, 20), (280, 20),
            (-5 * TILE, 2 * TILE), (5 * TILE, 2 * TILE),
            (0, 5 * TILE), (2 * TILE, -7 * TILE),
        ]
        for i, (x, y) in enumerate(lamps):
            self._bld("lamp", x, y, f"lamp_{i}")

        benches = [
            (-100, -40), (100, -40), (-140, 80), (140, 80),
            (0, -140), (-220, -20), (220, -20),
        ]
        for i, (x, y) in enumerate(benches):
            self._bld("bench", x, y, f"bench_{i}")

        # Wayfinding only at real forks
        signs = [
            (-9 * TILE, 40, "sign_farm"),       # west exit → farm
            (0, -6 * TILE, "sign_beach"),       # south → pier
            (0, 5 * TILE, "sign_civic"),        # north → community
        ]
        for x, y, name in signs:
            self._bld("sign", x, y, name)

        # Home / school yard fences (short runs, not walls)
        for i, (x, y) in enumerate([
            (-6 * TILE, 5 * TILE), (-5.4 * TILE, 5 * TILE),
            (-9 * TILE, 5.5 * TILE), (5 * TILE, 6 * TILE),
        ]):
            self._bld("fence", x, y, f"fence_{i}")

    def place_trees(self) -> None:
        n = 0
        for iy in range(-14, 12):
            for ix in range(-13, 13):
                if self.is_clearing(ix, iy):
                    continue
                # Keep plaza + lot interiors open; trees frame the town edge & fill gaps
                if abs(ix) <= 4 and abs(iy) <= 3:
                    continue
                edge = ix <= -11 or ix >= 11 or iy <= -12 or iy >= 10
                mid = (not edge) and (abs(ix) >= 7 or abs(iy) >= 6)
                chance = 0.32 if edge else 0.14 if mid else 0.05
                if noise01(ix, iy, 41) > chance:
                    continue
                roll = noise01(ix, iy, 43)
                if edge and noise01(ix, iy, 45) > 0.65 and self.sf("nat-tree-blossom"):
                    sf = self.sf("nat-tree-blossom")
                    self.add_actor(
                        f"decor_blossom_soft_t{n}",
                        sf,
                        ix * TILE + noise(ix, iy) * 16,
                        iy * TILE + noise(iy, ix) * 12,
                        128,
                        160,
                    )
                    n += 1
                    continue
                if roll < 0.45:
                    kind, sf = "oak", self.nature.get("oak") or self.sf("nat-tree-oak")
                elif roll < 0.72:
                    kind, sf = "pine", self.nature.get("pine")
                else:
                    kind, sf = "bush", self.nature.get("bush") or self.sf("nat-bush")
                if not sf:
                    continue
                w, h = NATURE_SIZE.get(kind, (64, 64))
                tag = "soft" if kind == "bush" else "solid"
                self.add_actor(
                    f"decor_{kind}_{tag}_t{n}",
                    sf,
                    ix * TILE + noise(ix, iy + 2) * 18,
                    iy * TILE + noise(ix + 2, iy) * 14,
                    w,
                    h,
                )
                n += 1

    def place_soft(self) -> None:
        kinds = [k for k in ("weed", "weedBloom", "tuft", "pebble", "weedPink", "weedTall") if k in self.nature]
        if not kinds:
            return
        n = 0
        for iy in range(-14, 12):
            for ix in range(-13, 13):
                key = f"{ix},{iy}"
                if key in self.stone or key in self.water:
                    continue
                dens = 0.2 if key in self.dirt else 0.1
                if self.is_clearing(ix, iy) and key not in self.dirt:
                    dens *= 0.25
                if noise01(ix, iy, 12) > dens:
                    continue
                kind = kinds[int(noise01(ix, iy, 13) * len(kinds)) % len(kinds)]
                w, h = NATURE_SIZE.get(kind, (32, 32))
                self.add_actor(
                    f"decor_soft_{kind}_{n}",
                    self.nature[kind],
                    ix * TILE + noise(ix, iy) * 22,
                    iy * TILE + noise(iy, ix) * 18 - 8,
                    w,
                    h,
                )
                n += 1

    def build(self) -> List[Tuple]:
        self.build_paths()
        self.paint_terrain()
        self.place_buildings()
        self.place_trees()
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
