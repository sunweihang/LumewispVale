#!/usr/bin/env python3
"""Shared indoor room bake helpers (mayor-house shell: floor, walls, south exit)."""

from __future__ import annotations

import json
import math
import uuid
from pathlib import Path
from typing import Callable, Dict, List, Optional, Set, Tuple

ROOT = Path(__file__).resolve().parents[2]
SHELL_SCENE = ROOT / "assets/scenes/Main.scene"
UUID_MAP = Path(__file__).resolve().parent / "uuid-map.json"

TILE = 64
X0, X1 = -5, 5
Y0, Y1 = -4, 4
PANEL_W, PANEL_H = 128, 96
SIDE_W, SIDE_H = 40, 672
ROOM_LEFT = X0 * TILE - TILE // 2
ROOM_RIGHT = X1 * TILE + TILE // 2
ROOM_BOTTOM = Y0 * TILE - TILE // 2
ROOM_TOP = Y1 * TILE + TILE // 2
DOOR_GAP = {-1, 0, 1}

PROPS = {
    "desk": ("prop-desk-mayor", 112, 80),
    "tea": ("prop-tea-table", 80, 64),
    "shelf": ("prop-bookshelf", 80, 112),
    "chair": ("prop-chair", 48, 56),
    "rug": ("prop-rug-mayor", 128, 80),
    "exitFloorGlow": ("prop-exit-floor-glow", 112, 64),
    "doorPortalRing": ("prop-door-portal-ring", 96, 56),
    "doorPortalBeam": ("prop-door-portal-beam", 56, 128),
    "crate": ("prop-crate", 56, 56),
    "barrel": ("prop-barrel", 48, 56),
    "bench": ("prop-bench", 96, 48),
    "lamp": ("prop-lamp", 48, 80),
}

NodeSpec = Tuple  # name, sf, x, y, w, h, ax, ay, is_ground


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


class IndoorRoomBake:
    def __init__(self, uuids: Dict[str, str], marker: str):
        self.uuids = uuids
        self.marker = marker
        self.floor: Set[str] = set()
        self.wall: Set[str] = set()
        self.nodes: List[NodeSpec] = []

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
        for ix in DOOR_GAP:
            self.floor.add(f"{ix},{Y0 - 1}")

        sf_a = self.sf("tile-wood-floor")
        sf_b = self.sf("tile-wood-floor-b") or sf_a
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
        for iy in range(Y0 - 1, Y1 + 2):
            for ix in range(X0 - 1, X1 + 2):
                key = f"{ix},{iy}"
                if key in self.floor:
                    continue
                on_rim = (
                    ix == X0 - 1
                    or ix == X1 + 1
                    or iy == Y0 - 1
                    or iy == Y1 + 1
                )
                if on_rim:
                    self.wall.add(key)

    def _wall_sf(self, kind: str) -> Optional[str]:
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
        self.build_wall_rim()
        sf_plain = self._wall_sf("plain")
        sf_decor = self._wall_sf("decor")
        sf_window = self._wall_sf("window")
        sf_tall_l = self.sf("prop-wall-side-tall") or self._wall_sf("side")
        sf_tall_r = self.sf("prop-wall-side-tall-r") or sf_tall_l

        def panel_sf(kind: str) -> Optional[str]:
            if kind == "window":
                return sf_window or sf_decor or sf_plain
            if kind == "decor":
                return sf_decor or sf_plain
            return sf_plain

        north_kinds = ["plain", "window", "plain", "decor", "plain", "plain"]
        n_y = ROOM_TOP
        for i, kind in enumerate(north_kinds):
            sf = panel_sf(kind)
            if not sf:
                continue
            x = -320 + i * PANEL_W
            self.add_actor(f"wall_face_n_{i}", sf, x, n_y, PANEL_W, PANEL_H, 0.0)

        s_y = ROOM_BOTTOM
        for i, x in enumerate((-288, -160)):
            if sf_plain:
                self.add_actor(f"wall_face_s_w_{i}", sf_plain, x, s_y, PANEL_W, PANEL_H, 0.0)
        for i, x in enumerate((160, 288)):
            if sf_plain:
                self.add_actor(f"wall_face_s_e_{i}", sf_plain, x, s_y, PANEL_W, PANEL_H, 0.0)

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

        for key in sorted(self.wall):
            ix, iy = map(int, key.split(","))
            self.add_actor(
                f"wall_solid_{ix}_{iy}",
                None,
                ix * TILE,
                iy * TILE,
                56,
                40,
                0.0,
            )

    def place_exit(self) -> None:
        exit_y = ROOM_BOTTOM + 8
        # Portal marker (ground ring + upright light) — replaces old floor sheen.
        portal_sf = self.sf("prop-door-portal") or self.sf("prop-door-portal-beam")
        if portal_sf:
            self.add_actor("door_portal_beam", portal_sf, 0.0, exit_y + 2, 80, 144, 0.0)
        elif self.sf("prop-exit-floor-glow"):
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

    def finish(self, place_furniture: Callable[["IndoorRoomBake"], None]) -> List[NodeSpec]:
        self.build_floor()
        self.place_walls()
        place_furniture(self)
        self.place_exit()
        baked = self.marker
        spawn = self.marker.replace("_baked", "_spawn")
        self.nodes.insert(0, (baked, None, 0, 0, 1, 1, 0.5, 0.5, True))
        self.nodes.append((spawn, None, 0, -2.2 * TILE, 1, 1, 0.5, 0.5, True))
        return self.nodes


def make_sprite_node(data, world_id, name, sf, x, y, w, h, ax, ay, id_prefix: str) -> int:
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
            "_id": f"n{id_prefix}_{node_id}",
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
            "_id": f"u{id_prefix}_{ui_id}",
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
                "_id": f"s{id_prefix}_{sp_id}",
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


def write_indoor_scene(
    *,
    scene_name: str,
    out_scene: Path,
    out_meta: Path,
    marker: str,
    place_furniture: Callable[[IndoorRoomBake], None],
    id_prefix: str,
) -> None:
    uuids = load_uuid_map()
    bake = IndoorRoomBake(uuids, marker)
    baked = bake.finish(place_furniture)

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
            obj["_name"] = scene_name

    world = new_data[new_world_id]
    spawn = marker.replace("_baked", "_spawn")
    ground = [n for n in baked if n[0] in (marker, spawn) or n[8]]
    actors = [n for n in baked if n[0] not in (marker, spawn) and not n[8]]
    ordered = ground + actors

    child_refs = []
    for name, sf, x, y, w, h, ax, ay, _g in ordered:
        nid = make_sprite_node(
            new_data, new_world_id, name, sf, x, y, w, h, ax, ay, id_prefix
        )
        child_refs.append({"__id__": nid})
    world["_children"] = child_refs

    scene_uuid = str(uuid.uuid4())
    if out_meta.exists():
        try:
            scene_uuid = json.loads(out_meta.read_text(encoding="utf-8")).get(
                "uuid", scene_uuid
            )
        except Exception:
            pass
    for obj in new_data:
        if isinstance(obj, dict) and obj.get("__type__") == "cc.Scene":
            obj["_id"] = scene_uuid

    out_scene.parent.mkdir(parents=True, exist_ok=True)
    out_scene.write_text(
        json.dumps(new_data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    out_meta.write_text(
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
    print(f"Wrote {out_scene} ({len(ordered)} world nodes) uuid={scene_uuid}")
