#!/usr/bin/env python3
"""Bake mayor house interior into assets/scenes/MayorHouse.scene.

Compact indoor room — wood floor, sealed wall rim (N/E/S/W), furniture,
exit door on south (walk gap + door_exit prop).

Layout (south → north):

         [continuous N wall + windows]
     bookshelf   desk   clutter
            tea table / rug
                 |
            open floor
                 |
      [S wall] door_exit [S wall]

Wall actors are named wall_solid_* so PlayerController blocks walk-out.

    python tools/ui/bake_mayor_house_scene.py
"""

from __future__ import annotations

import json
import math
import uuid
from pathlib import Path
from typing import Dict, List, Optional, Set, Tuple

ROOT = Path(__file__).resolve().parents[2]
SHELL_SCENE = ROOT / "assets/scenes/Main.scene"
OUT_SCENE = ROOT / "assets/scenes/MayorHouse.scene"
OUT_META = ROOT / "assets/scenes/MayorHouse.scene.meta"
UUID_MAP = Path(__file__).resolve().parent / "uuid-map.json"

TILE = 64
# Room tile AABB (inclusive)
X0, X1 = -5, 5
Y0, Y1 = -4, 4

PROPS = {
    "desk": ("prop-desk-mayor", 112, 80),
    "tea": ("prop-tea-table", 80, 64),
    "shelf": ("prop-bookshelf", 80, 112),
    "chair": ("prop-chair", 48, 56),
    "rug": ("prop-rug-mayor", 128, 80),
    "exitFloorGlow": ("prop-exit-floor-glow", 112, 64),
    "wall": ("prop-wall-mayor", 128, 96),  # window — use sparingly
    "wallPlain": ("prop-wall-plain", 128, 96),
    "wallDecor": ("prop-wall-decor", 128, 96),
    "wallSide": ("prop-wall-side", 48, 112),
    "wallSideTall": ("prop-wall-side-tall", 40, 672),
    "wallSideTallR": ("prop-wall-side-tall-r", 40, 672),
    "crate": ("prop-crate", 56, 56),
    "barrel": ("prop-barrel", 48, 56),
    "bench": ("prop-bench", 96, 48),
}

# Flush wall geometry (1 world unit = 1 px). Panels are 128×96, step = 128.
PANEL_W, PANEL_H = 128, 96
SIDE_W, SIDE_H = 40, 672
ROOM_LEFT = X0 * TILE - TILE // 2  # -352
ROOM_RIGHT = X1 * TILE + TILE // 2  # 352
ROOM_BOTTOM = Y0 * TILE - TILE // 2  # -288
ROOM_TOP = Y1 * TILE + TILE // 2  # 288

# South door walk gap (tile x inclusive) — solids leave this open.
DOOR_GAP = {-1, 0, 1}


def noise01(ix: float, iy: float, salt: float = 0) -> float:
    n = math.sin((ix + salt * 17) * 12.9898 + (iy - salt * 9) * 78.233) * 43758.5453
    return n - math.floor(n)


def load_uuid_map() -> Dict[str, str]:
    raw = json.loads(UUID_MAP.read_text(encoding="utf-8"))
    out: Dict[str, str] = {}
    for k, v in raw.items():
        if isinstance(v, dict) and "spriteFrame" in v:
            out[k] = v["spriteFrame"]
    return out


class MayorHouseBake:
    def __init__(self, uuids: Dict[str, str]):
        self.uuids = uuids
        self.floor: Set[str] = set()
        self.wall: Set[str] = set()
        self.nodes: List[Tuple] = []

    def sf(self, key: str) -> Optional[str]:
        return self.uuids.get(key)

    def add_ground(self, name: str, sf: str, ix: int, iy: int) -> None:
        self.nodes.append((name, sf, ix * TILE, iy * TILE, TILE, TILE, 0.5, 0.5, True))

    def add_actor(self, name, sf, x, y, w, h, ay=0.0) -> None:
        self.nodes.append((name, sf, x, y, w, h, 0.5, ay, False))

    def _prop(self, key: str, x: float, y: float, name: Optional[str] = None) -> None:
        catalog, w, h = PROPS[key]
        sf = self.sf(catalog)
        if not sf:
            print(f"WARN missing uuid {catalog}")
            return
        self.add_actor(name or f"prop_{key}", sf, x, y, w, h, 0.0)

    def build_floor(self) -> None:
        for iy in range(Y0, Y1 + 1):
            for ix in range(X0, X1 + 1):
                self.floor.add(f"{ix},{iy}")
        # Vestibule into the south door (keeps soft bounds + walk path to exit)
        for ix in DOOR_GAP:
            self.floor.add(f"{ix},{Y0 - 1}")

        sf_a = self.sf("tile-wood-floor")
        sf_b = self.sf("tile-wood-floor-b") or sf_a
        # Fallback to stone / dirt if wood missing
        if not sf_a:
            sf_a = self.sf("tile-stone") or self.sf("dirt")
            sf_b = self.sf("tile-stone") or sf_a
            print("WARN wood floor missing — fallback terrain")
        if not sf_a:
            raise SystemExit("no floor spriteFrame")

        for key in sorted(self.floor):
            ix, iy = map(int, key.split(","))
            use_b = noise01(ix, iy, 3) > 0.55
            sf = sf_b if use_b else sf_a
            tag = "b" if use_b else "a"
            self.add_ground(f"tile-wood_{tag}_{ix}_{iy}", sf, ix, iy)

    def build_wall_rim(self) -> None:
        """One-cell shell around the room; south door vestibule stays open."""
        for iy in range(Y0 - 1, Y1 + 2):
            for ix in range(X0 - 1, X1 + 2):
                key = f"{ix},{iy}"
                if key in self.floor:
                    continue
                # Only keep the immediate rim (not a filled exterior pad)
                on_rim = (
                    ix == X0 - 1
                    or ix == X1 + 1
                    or iy == Y0 - 1
                    or iy == Y1 + 1
                )
                if on_rim:
                    self.wall.add(key)

    def _wall_sf(self, kind: str) -> Optional[str]:
        """Resolve panel sprite: plain / decor / window / side / tile fallback."""
        keys = {
            "plain": ("prop-wall-plain", "tile-wall-interior", "prop-wall-mayor"),
            "decor": ("prop-wall-decor", "prop-wall-plain", "tile-wall-interior"),
            "window": ("prop-wall-mayor", "prop-wall-decor", "prop-wall-plain"),
            "side": ("prop-wall-side", "prop-wall-plain", "tile-wall-interior"),
        }
        for k in keys.get(kind, ("prop-wall-plain",)):
            sf = self.sf(k)
            if sf:
                return sf
        return None

    def place_walls(self) -> None:
        """Flush room frame: grid N/S panels + one tall E/W strip each side.

        Visual faces use wall_face_* (no collision). Rim seal uses wall_solid_*
        with small footprints so players cannot walk out (see GridPath).
        """
        self.build_wall_rim()
        sf_plain = self._wall_sf("plain")
        sf_decor = self._wall_sf("decor")
        sf_window = self._wall_sf("window")
        sf_tall_l = self.sf("prop-wall-side-tall") or self._wall_sf("side")
        sf_tall_r = self.sf("prop-wall-side-tall-r") or sf_tall_l
        if not sf_plain:
            print("WARN no wall sprites — sealing with invisible solids only")

        def panel_sf(kind: str) -> Optional[str]:
            if kind == "window":
                return sf_window or sf_decor or sf_plain
            if kind == "decor":
                return sf_decor or sf_plain
            return sf_plain

        # --- North: 6×128 panels, centers on tile grid (-320 … 320) ---
        north_kinds = ["plain", "window", "plain", "decor", "plain", "plain"]
        n_y = ROOM_TOP  # feet on north floor edge
        for i, kind in enumerate(north_kinds):
            sf = panel_sf(kind)
            if not sf:
                continue
            x = -320 + i * PANEL_W
            self.add_actor(f"wall_face_n_{i}", sf, x, n_y, PANEL_W, PANEL_H, 0.0)

        # --- South: 2 panels west + 2 east of door (same size / baseline) ---
        s_y = ROOM_BOTTOM
        for i, x in enumerate((-288, -160)):
            if sf_plain:
                self.add_actor(f"wall_face_s_w_{i}", sf_plain, x, s_y, PANEL_W, PANEL_H, 0.0)
        for i, x in enumerate((160, 288)):
            if sf_plain:
                self.add_actor(f"wall_face_s_e_{i}", sf_plain, x, s_y, PANEL_W, PANEL_H, 0.0)

        # --- East / west: ONE continuous tall strip (no stacked bands) ---
        side_y = ROOM_BOTTOM
        if sf_tall_l:
            self.add_actor(
                "wall_face_ew_w",
                sf_tall_l,
                ROOM_LEFT + SIDE_W // 2,
                side_y,
                SIDE_W,
                SIDE_H,
                0.0,
            )
        if sf_tall_r:
            self.add_actor(
                "wall_face_ew_e",
                sf_tall_r,
                ROOM_RIGHT - SIDE_W // 2,
                side_y,
                SIDE_W,
                SIDE_H,
                0.0,
            )

        # --- Collision rim (invisible / no sprite) — one box per rim cell ---
        for key in sorted(self.wall):
            ix, iy = map(int, key.split(","))
            # Leave south door vestibule open (those cells are floor, not wall).
            self.add_actor(
                f"wall_solid_{ix}_{iy}",
                None,
                ix * TILE,
                iy * TILE,
                56,
                40,
                0.0,
            )

        print(
            f"wall rim cells={len(self.wall)} north={north_kinds} "
            f"door_gap={sorted(DOOR_GAP)} "
            f"frame L{ROOM_LEFT} R{ROOM_RIGHT} B{ROOM_BOTTOM} T{ROOM_TOP}"
        )

    def place_furniture(self) -> None:
        # Rug under tea area (soft litter — still actor for Y-sort with feet)
        self._prop("rug", -0.4 * TILE, 0.2 * TILE, "prop_rug_mayor")

        # Tea table center-west
        self._prop("tea", -1.1 * TILE, 0.35 * TILE, "prop_tea_table")
        # Chairs around tea
        self._prop("chair", -1.9 * TILE, -0.15 * TILE, "prop_chair_w")
        self._prop("chair", -0.2 * TILE, -0.1 * TILE, "prop_chair_e")

        # Mayor desk NE
        self._prop("desk", 1.6 * TILE, 1.7 * TILE, "prop_desk_mayor")
        self._prop("chair", 1.6 * TILE, 1.05 * TILE, "prop_chair_desk")

        # Bookshelf NW
        self._prop("shelf", -3.2 * TILE, 2.0 * TILE, "prop_bookshelf")

        # Side clutter
        if self.sf("prop-crate"):
            self._prop("crate", 3.4 * TILE, 1.4 * TILE, "prop_crate_corner")
        if self.sf("prop-barrel"):
            self._prop("barrel", 3.5 * TILE, 0.5 * TILE, "prop_barrel_corner")

        # South exit: subtle floor sheen only (walk-in auto-travel via door_exit).
        exit_y = ROOM_BOTTOM + 8
        if self.sf("prop-exit-floor-glow"):
            self.add_actor(
                "exit_floor_glow",
                self.sf("prop-exit-floor-glow"),
                0.0,
                exit_y + 20,
                112,
                64,
                0.5,
            )
        self.add_actor("door_exit", None, 0.0, exit_y, 120, 56, 0.0)

    def build(self) -> List[Tuple]:
        self.build_floor()
        self.place_walls()
        self.place_furniture()
        # Markers
        self.nodes.insert(0, ("__mayor_house_baked", None, 0, 0, 1, 1, 0.5, 0.5, True))
        # Spawn just inside the door
        self.nodes.append(("__mayor_house_spawn", None, 0, -2.2 * TILE, 1, 1, 0.5, 0.5, True))
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
            "_id": f"nMayor_{node_id}",
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
            "_id": f"uMayor_{ui_id}",
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
                "_id": f"sMayor_{sp_id}",
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
    baked = MayorHouseBake(uuids).build()

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
            obj["_name"] = "MayorHouse"

    world = new_data[new_world_id]
    ground = [n for n in baked if n[0] in ("__mayor_house_baked", "__mayor_house_spawn") or n[8]]
    actors = [n for n in baked if n[0] not in ("__mayor_house_baked", "__mayor_house_spawn") and not n[8]]
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
    print("actors:", [n for n in names if not n.startswith("tile-") and not n.startswith("__")][:20])


if __name__ == "__main__":
    main()
