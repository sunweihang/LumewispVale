#!/usr/bin/env python3
"""Legacy: sync Main.scene World tiles/props (editor preview only).

Authoritative farm world is assets/scenes/Main.scene
(regenerate with tools/ui/bake_farm_scene.py).
"""

import json
import uuid
from pathlib import Path
from typing import Dict, Set, Tuple

ROOT = Path(__file__).resolve().parents[2]
SCENE = ROOT / "assets/scenes/Main.scene"
UUID_MAP = Path(__file__).resolve().parent / "uuid-map.json"

TILE = 64
FRAMES = json.loads(UUID_MAP.read_text(encoding="utf-8"))

PROP_POS = {
    "cottage_blue": (-340, 100),
    "shed": (-420, -40),
    "sign": (-40, -100),
    "bush1": (-300, -120),
    "bush2": (80, 40),
    "tree_oak1": (-420, 220),
    "tree_oak2": (360, -40),
    "bridge": (0, -420),
    "fence1": (-5 * TILE, 3 * TILE),
    "fence2": (-1 * TILE, 3 * TILE),
}

HIDE_PROPS = [
    "shop",
    "community",
    "cottage_red",
    "fountain",
    "lamp1",
    "lamp2",
    "bench",
    "tree_blossom",
]


def farm_keys():
    # type: () -> Set[Tuple[int, int]]
    return {(ix, iy) for iy in range(-1, 3) for ix in range(-5, 0)}


def path_keys():
    # type: () -> Set[Tuple[int, int]]
    keys = {(0, iy) for iy in range(-8, 5)}
    keys |= {(ix, -2) for ix in range(-5, 1)}
    return keys


def wanted_kind(ix, iy):
    # type: (int, int) -> str
    k = (ix, iy)
    if k in farm_keys() or k in path_keys():
        return "dirt"
    return "grass"


def set_lpos(node, x, y):
    node["_lpos"] = {"__type__": "cc.Vec3", "x": x, "y": y, "z": 0}


def main():
    data = json.loads(SCENE.read_text(encoding="utf-8"))

    world_id = None
    for i, obj in enumerate(data):
        if obj.get("__type__") == "cc.Node" and obj.get("_name") == "World":
            world_id = i
            break
    if world_id is None:
        raise SystemExit("World node not found")

    world = data[world_id]
    child_ids = [c["__id__"] for c in world.get("_children", [])]

    tile_nodes = {}  # type: Dict[Tuple[int, int], int]
    prop_nodes = {}  # type: Dict[str, int]

    for cid in child_ids:
        node = data[cid]
        if node.get("__type__") != "cc.Node":
            continue
        name = node.get("_name", "")
        lp = node.get("_lpos", {})
        x, y = float(lp.get("x", 0)), float(lp.get("y", 0))
        if name.startswith("tile-"):
            ix, iy = int(round(x / TILE)), int(round(y / TILE))
            tile_nodes[(ix, iy)] = cid
        else:
            prop_nodes[name] = cid

    def sprite_comp(node_id):
        node = data[node_id]
        for c in node.get("_components", []):
            comp = data[c["__id__"]]
            if comp.get("__type__") == "cc.Sprite":
                return comp
        return None

    keys = set(tile_nodes) | farm_keys() | path_keys()
    grass_sf = FRAMES["tile-grass"]["spriteFrame"]
    dirt_sf = FRAMES["tile-dirt"]["spriteFrame"]
    sf_for = {"grass": grass_sf, "dirt": dirt_sf}

    template_id = next(iter(tile_nodes.values()))
    template = data[template_id]
    template_ui_id = template["_components"][0]["__id__"]
    template_sp_id = template["_components"][1]["__id__"]

    for ix, iy in sorted(keys):
        kind = wanted_kind(ix, iy)
        if (ix, iy) not in tile_nodes and kind == "grass":
            continue
        if (ix, iy) in tile_nodes:
            nid = tile_nodes[(ix, iy)]
            node = data[nid]
            node["_name"] = "tile-{}_{}_{}".format(kind, ix, iy)
            set_lpos(node, ix * TILE, iy * TILE)
            sp = sprite_comp(nid)
            if sp is not None:
                sp["_spriteFrame"] = {
                    "__uuid__": sf_for[kind],
                    "__expectedType__": "cc.SpriteFrame",
                }
        else:
            new_node_id = len(data)
            ui_id = new_node_id + 1
            sp_id = new_node_id + 2
            node = {
                "__type__": "cc.Node",
                "_name": "tile-{}_{}_{}".format(kind, ix, iy),
                "_objFlags": 0,
                "_parent": {"__id__": world_id},
                "_children": [],
                "_active": True,
                "_components": [{"__id__": ui_id}, {"__id__": sp_id}],
                "_prefab": None,
                "_lpos": {
                    "__type__": "cc.Vec3",
                    "x": ix * TILE,
                    "y": iy * TILE,
                    "z": 0,
                },
                "_lrot": {"__type__": "cc.Quat", "x": 0, "y": 0, "z": 0, "w": 1},
                "_lscale": {"__type__": "cc.Vec3", "x": 1, "y": 1, "z": 1},
                "_layer": 33554432,
                "_euler": {"__type__": "cc.Vec3", "x": 0, "y": 0, "z": 0},
                "_id": "nFarm{}_{}_{}".format(ix, iy, uuid.uuid4().hex[:6]),
            }
            ui = json.loads(json.dumps(data[template_ui_id]))
            ui["node"] = {"__id__": new_node_id}
            ui["_id"] = "uFarm{}_{}".format(ix, iy)
            sp = json.loads(json.dumps(data[template_sp_id]))
            sp["node"] = {"__id__": new_node_id}
            sp["_id"] = "sFarm{}_{}".format(ix, iy)
            sp["_spriteFrame"] = {
                "__uuid__": sf_for[kind],
                "__expectedType__": "cc.SpriteFrame",
            }
            data.extend([node, ui, sp])
            world["_children"].append({"__id__": new_node_id})
            tile_nodes[(ix, iy)] = new_node_id

    for name, (x, y) in PROP_POS.items():
        if name not in prop_nodes:
            print("warn: missing prop", name)
            continue
        set_lpos(data[prop_nodes[name]], x, y)
        data[prop_nodes[name]]["_active"] = True

    for name in HIDE_PROPS:
        if name in prop_nodes:
            data[prop_nodes[name]]["_active"] = False

    SCENE.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print("Updated {} — farm-only layout synced.".format(SCENE.relative_to(ROOT)))


if __name__ == "__main__":
    main()
