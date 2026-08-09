#!/usr/bin/env python3
"""
Stardew-like grass→dirt fringe overlays (transparent 64×64).

Placed on dirt cells that neighbor grass so the boundary becomes jagged
with a dark sod lip, instead of a hard square grid cut.
"""

import json
import math
import uuid
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
TOOLS = Path(__file__).resolve().parent
UUID_MAP = TOOLS / "uuid-map.json"
CATALOG = TOOLS / "catalog.json"
TERRAIN_DIR = ROOT / "assets/textures/terrain"
TERRAIN_FRAMES = TOOLS / "terrain-frames.json"
TEX_SUFFIX = "6c48a"
SF_SUFFIX = "f9941"

GRASS = (58, 122, 58)
GRASS_DARK = (42, 90, 42)
GRASS_MID = (70, 140, 70)
GRASS_LIGHT = (96, 168, 88)
GRASS_DEEP = (32, 72, 36)
LIP = (92, 58, 28)  # sod shadow under grass edge
LIP_DEEP = (70, 42, 20)


def uid() -> str:
    return str(uuid.uuid4())


def _hash01(x: int, y: int, seed: int) -> float:
    v = (x * 374761393 + y * 668265263 + seed * 982451653) & 0x7FFFFFFF
    v = (v ^ (v >> 13)) * 1274126177
    return ((v ^ (v >> 16)) & 0xFFFF) / 65536.0


def write_image_meta(png_path: Path, image_uuid: str, w: int, h: int, name: str):
    hw, hh = w / 2.0, h / 2.0
    meta = {
        "ver": "1.0.27",
        "importer": "image",
        "imported": True,
        "uuid": image_uuid,
        "files": [".json", ".png"],
        "subMetas": {
            TEX_SUFFIX: {
                "importer": "texture",
                "uuid": "{}@{}".format(image_uuid, TEX_SUFFIX),
                "displayName": name,
                "id": TEX_SUFFIX,
                "name": "texture",
                "userData": {
                    "wrapModeS": "clamp-to-edge",
                    "wrapModeT": "clamp-to-edge",
                    "minfilter": "nearest",
                    "magfilter": "nearest",
                    "mipfilter": "none",
                    "anisotropy": 0,
                    "isUuid": True,
                    "imageUuidOrDatabaseUri": image_uuid,
                    "visible": False,
                },
                "ver": "1.0.22",
                "imported": True,
                "files": [".json"],
                "subMetas": {},
            },
            SF_SUFFIX: {
                "importer": "sprite-frame",
                "uuid": "{}@{}".format(image_uuid, SF_SUFFIX),
                "displayName": name,
                "id": SF_SUFFIX,
                "name": "spriteFrame",
                "userData": {
                    "trimThreshold": 1,
                    "rotated": False,
                    "offsetX": 0,
                    "offsetY": 0,
                    "trimX": 0,
                    "trimY": 0,
                    "width": w,
                    "height": h,
                    "rawWidth": w,
                    "rawHeight": h,
                    "borderTop": 0,
                    "borderBottom": 0,
                    "borderLeft": 0,
                    "borderRight": 0,
                    "packable": True,
                    "pixelsToUnit": 100,
                    "pivotX": 0.5,
                    "pivotY": 0.5,
                    "meshType": 0,
                    "vertices": {
                        "rawPosition": [-hw, -hh, 0, hw, -hh, 0, -hw, hh, 0, hw, hh, 0],
                        "indexes": [0, 1, 2, 2, 1, 3],
                        "uv": [0, h, w, h, 0, 0, w, 0],
                        "nuv": [0, 0, 1, 0, 0, 1, 1, 1],
                        "minPos": [-hw, -hh, 0],
                        "maxPos": [hw, hh, 0],
                    },
                    "isUuid": True,
                    "imageUuidOrDatabaseUri": "{}@{}".format(image_uuid, TEX_SUFFIX),
                    "atlasUuid": "",
                    "trimType": "custom",
                },
                "ver": "1.0.12",
                "imported": True,
                "files": [".json"],
                "subMetas": {},
            },
        },
        "userData": {
            "type": "sprite-frame",
            "fixAlphaTransparencyArtifacts": False,
            "hasAlpha": True,
            "redirect": "{}@{}".format(image_uuid, TEX_SUFFIX),
        },
    }
    png_path.with_suffix(".png.meta").write_text(
        json.dumps(meta, indent=2) + "\n", encoding="utf-8"
    )


def grass_px(x: int, y: int, seed: int):
    r = _hash01(x, y, seed)
    if r < 0.14:
        return GRASS_DARK + (255,)
    if r < 0.22:
        return GRASS_DEEP + (255,)
    if r > 0.9:
        return GRASS_LIGHT + (255,)
    if r > 0.78:
        return GRASS_MID + (255,)
    return GRASS + (255,)


def _edge_depth(t: float, seed: int, axis: int, base: float = 11.0, amp: float = 7.0) -> float:
    """Irregular fringe depth along an edge (in pixels)."""
    # layered sines + hash so it never reads as a ruler
    wiggle = (
        math.sin(t * math.pi * 2 * 1.7 + seed * 0.37) * 0.45
        + math.sin(t * math.pi * 2 * 3.3 + seed * 1.1) * 0.28
        + math.sin(t * math.pi * 2 * 0.7 + seed * 2.4) * 0.35
        + (_hash01(int(t * 64), axis, seed) - 0.5) * 0.55
    )
    # occasional deeper bites / protrusions like Stardew sod
    bite = 0.0
    if _hash01(int(t * 16), axis + 3, seed + 9) > 0.78:
        bite = 3.0 + _hash01(int(t * 16), axis + 5, seed + 2) * 4.0
    if _hash01(int(t * 16), axis + 7, seed + 11) > 0.85:
        bite -= 2.0 + _hash01(int(t * 16), axis + 8, seed) * 3.0
    return max(4.0, base + amp * wiggle + bite)


def _paint_grass_body(px, x: int, y: int, seed: int):
    px[x, y] = grass_px(x, y, seed)


def _paint_lip(px, x: int, y: int, seed: int):
    # Continuous sod shadow (Stardew lip), with slight tone jitter only
    px[x, y] = (LIP_DEEP if _hash01(x, y, seed) < 0.35 else LIP) + (255,)


def _scatter_tufts(px, w: int, h: int, cx: int, cy: int, seed: int, count: int = 3):
    """Small grass pixels just outside the sod lip (into dirt)."""
    for i in range(count):
        dx = int((_hash01(cx + i, cy, seed) - 0.5) * 5)
        dy = int((_hash01(cx, cy + i, seed + 3) - 0.5) * 5)
        x, y = cx + dx, cy + dy
        if 0 <= x < w and 0 <= y < h and px[x, y][3] == 0:
            col = GRASS_LIGHT if _hash01(x, y, seed + 1) > 0.5 else GRASS_MID
            px[x, y] = col + (255,)
            if _hash01(x, y, seed + 2) > 0.55 and 0 <= y - 1 < h and px[x, y - 1][3] == 0:
                px[x, y - 1] = GRASS_DARK + (255,)


def draw_edge(side: str, seed: int = 1, w: int = 64, h: int = 64) -> Image.Image:
    """
    Grass encroaches from `side` onto this dirt cell.
    Image coords: y=0 top (north), x=0 left (west) — matches PIL; Cocos Y-up
    is handled by placing the same overlay on the cell (sprite not flipped).
    World +Y is north in FarmWorldLayout, but tile sprites use standard UV
    (top of PNG = +Y visually when pivot center). In Cocos UI, +Y is up, and
    sprite frames map texture top → visual top. So PNG top = north = +Y. Good.
    """
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    px = img.load()

    if side == "n":
        for x in range(w):
            depth = int(round(_edge_depth(x / (w - 1), seed, 0)))
            for y in range(depth):
                _paint_grass_body(px, x, y, seed)
            if depth < h:
                _paint_lip(px, x, depth, seed)
            if depth + 1 < h:
                _paint_lip(px, x, depth + 1, seed + 1)
            if _hash01(x, depth, seed + 6) > 0.4:
                _scatter_tufts(px, w, h, x, min(h - 1, depth + 3), seed + x, count=4)
    elif side == "s":
        for x in range(w):
            depth = int(round(_edge_depth(x / (w - 1), seed + 17, 1)))
            for y in range(h - depth, h):
                _paint_grass_body(px, x, y, seed + 17)
            lip_y = h - depth - 1
            if lip_y >= 0:
                _paint_lip(px, x, lip_y, seed)
            if lip_y - 1 >= 0:
                _paint_lip(px, x, lip_y - 1, seed + 1)
            if _hash01(x, lip_y, seed + 6) > 0.4:
                _scatter_tufts(px, w, h, x, max(0, lip_y - 3), seed + x, count=4)
    elif side == "w":
        for y in range(h):
            depth = int(round(_edge_depth(y / (h - 1), seed + 31, 2)))
            for x in range(depth):
                _paint_grass_body(px, x, y, seed + 31)
            if depth < w:
                _paint_lip(px, depth, y, seed)
            if depth + 1 < w:
                _paint_lip(px, depth + 1, y, seed + 1)
            if _hash01(depth, y, seed + 6) > 0.4:
                _scatter_tufts(px, w, h, min(w - 1, depth + 3), y, seed + y, count=4)
    elif side == "e":
        for y in range(h):
            depth = int(round(_edge_depth(y / (h - 1), seed + 47, 3)))
            for x in range(w - depth, w):
                _paint_grass_body(px, x, y, seed + 47)
            lip_x = w - depth - 1
            if lip_x >= 0:
                _paint_lip(px, lip_x, y, seed)
            if lip_x - 1 >= 0:
                _paint_lip(px, lip_x - 1, y, seed + 1)
            if _hash01(lip_x, y, seed + 6) > 0.4:
                _scatter_tufts(px, w, h, max(0, lip_x - 3), y, seed + y, count=4)
    else:
        raise ValueError(side)

    return img


def draw_inner_corner(corner: str, seed: int = 1, w: int = 64, h: int = 64) -> Image.Image:
    """
    Concave grass bite: only the diagonal neighbor is grass.
    corner: ne|nw|se|sw — which corner of THIS dirt cell gets grass.
    """
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    px = img.load()
    # quarter-circle-ish blob with noisy radius
    for y in range(h):
        for x in range(w):
            if corner == "nw":
                lx, ly = x, y
            elif corner == "ne":
                lx, ly = (w - 1 - x), y
            elif corner == "sw":
                lx, ly = x, (h - 1 - y)
            else:  # se
                lx, ly = (w - 1 - x), (h - 1 - y)

            # distance from outer corner (0,0) in local space
            # we want grass near (0,0) local — i.e. the corner
            # Actually for inner corner: grass comes from the diagonal OUTSIDE,
            # filling a rounded wedge near that corner of the dirt cell.
            r_base = 18.0 + 4.0 * math.sin(math.atan2(ly + 0.5, lx + 0.5) * 3 + seed)
            r_base += (_hash01(lx, ly, seed) - 0.5) * 6.0
            dist = math.hypot(lx + 0.5, ly + 0.5)
            # Only the corner wedge (both lx and ly small-ish)
            if lx > 28 or ly > 28:
                continue
            if dist < r_base - 2.2:
                _paint_grass_body(px, x, y, seed)
            elif dist < r_base:
                _paint_lip(px, x, y, seed)
            elif dist < r_base + 2.5 and _hash01(x, y, seed + 8) > 0.55:
                col = GRASS_MID if _hash01(x, y, seed + 1) > 0.4 else GRASS_LIGHT
                px[x, y] = col + (255,)
    return img


def draw_outer_corner(corner: str, seed: int = 1, w: int = 64, h: int = 64) -> Image.Image:
    """
    Full corner tile used when two adjacent cardinals are grass.
    Grass from both sides with a rounded dirt pocket (no hard 90° stair).
    Local corner NW: grass along top+left, dirt rounded in SE.
    """
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    px = img.load()
    for y in range(h):
        for x in range(w):
            if corner == "nw":
                lx, ly = x, y
                t_h, t_v = x / (w - 1), y / (h - 1)
            elif corner == "ne":
                lx, ly = (w - 1 - x), y
                t_h, t_v = (w - 1 - x) / (w - 1), y / (h - 1)
            elif corner == "sw":
                lx, ly = x, (h - 1 - y)
                t_h, t_v = x / (w - 1), (h - 1 - y) / (h - 1)
            else:
                lx, ly = (w - 1 - x), (h - 1 - y)
                t_h, t_v = (w - 1 - x) / (w - 1), (h - 1 - y) / (h - 1)

            depth_n = _edge_depth(t_h, seed, 10, base=12.0, amp=6.0)
            depth_w = _edge_depth(t_v, seed + 5, 11, base=12.0, amp=6.0)
            # Superellipse frontier: dirt when far from both grass sides
            # nx=lx/Rn, ny=ly/Rw; grass when nx^2.2 + ny^2.2 is small? 
            # We want grass NEAR the axes: if lx < depth_w OR ly < depth_n, plus fillet.
            in_edge = lx <= depth_w or ly <= depth_n
            fillet_r = 11.0 + (_hash01(x, y, seed) - 0.5) * 3.5
            in_fillet = (lx > depth_w and ly > depth_n and
                         math.hypot(lx - depth_w, ly - depth_n) <= fillet_r)
            if not (in_edge or in_fillet):
                continue
            # Lip along the frontier facing dirt
            near_front = False
            if in_edge and not in_fillet:
                if abs(lx - depth_w) <= 1.2 and ly > depth_n * 0.25:
                    near_front = True
                if abs(ly - depth_n) <= 1.2 and lx > depth_w * 0.25:
                    near_front = True
            if in_fillet:
                dfil = math.hypot(lx - depth_w, ly - depth_n)
                if dfil >= fillet_r - 1.6:
                    near_front = True
            if near_front:
                _paint_lip(px, x, y, seed)
            else:
                _paint_grass_body(px, x, y, seed)
            # tufts into dirt just past lip
            if near_front and _hash01(x, y, seed + 6) > 0.72:
                # step one pixel toward tile center (dirt)
                sx = x + (1 if corner in ("nw", "sw") else -1)
                sy = y + (1 if corner in ("nw", "ne") else -1)
                if 0 <= sx < w and 0 <= sy < h and px[sx, sy][3] == 0:
                    px[sx, sy] = (GRASS_MID if _hash01(sx, sy, seed) > 0.5 else GRASS_LIGHT) + (255,)
    return img


def save_asset(item_id: str, img: Image.Image, uuid_map: dict) -> str:
    w, h = img.size
    png = TERRAIN_DIR / "{}.png".format(item_id)
    prev = uuid_map.get(item_id, {}).get("texture")
    image_uuid = prev or uid()
    img.save(png)
    write_image_meta(png, image_uuid, w, h, item_id)
    sf = "{}@{}".format(image_uuid, SF_SUFFIX)
    uuid_map[item_id] = {
        "texture": image_uuid,
        "prefab": uuid_map.get(item_id, {}).get("prefab", ""),
        "spriteFrame": sf,
    }
    print("OK", item_id, "{}x{}".format(w, h))
    return sf


def upsert_catalog(item_id: str, path: str):
    catalog = json.loads(CATALOG.read_text(encoding="utf-8"))
    existing = {i["id"]: i for i in catalog["items"]}
    entry = {
        "id": item_id,
        "kind": "terrain",
        "spriteType": "simple",
        "designSize": [64, 64],
        "path": path,
        "prefab": existing.get(item_id, {}).get("prefab", ""),
        "layer": "Ground",
    }
    if item_id in existing:
        existing[item_id].update(entry)
        catalog["items"] = list(existing.values())
    else:
        catalog["items"].append(entry)
    CATALOG.write_text(json.dumps(catalog, indent=2) + "\n", encoding="utf-8")


def main():
    TERRAIN_DIR.mkdir(parents=True, exist_ok=True)
    uuid_map = {}
    if UUID_MAP.exists():
        uuid_map = json.loads(UUID_MAP.read_text(encoding="utf-8"))

    frames = {}
    if TERRAIN_FRAMES.exists():
        frames = json.loads(TERRAIN_FRAMES.read_text(encoding="utf-8"))

    edges = [
        ("tile-fringe-n", "n", 101),
        ("tile-fringe-e", "e", 103),
        ("tile-fringe-s", "s", 107),
        ("tile-fringe-w", "w", 109),
    ]
    for item_id, side, seed in edges:
        sf = save_asset(item_id, draw_edge(side, seed=seed), uuid_map)
        key = {"n": "fringeN", "e": "fringeE", "s": "fringeS", "w": "fringeW"}[side]
        frames[key] = sf
        upsert_catalog(item_id, "assets/textures/terrain/{}.png".format(item_id))

    inners = [
        ("tile-fringe-in-ne", "ne", 201),
        ("tile-fringe-in-nw", "nw", 203),
        ("tile-fringe-in-se", "se", 207),
        ("tile-fringe-in-sw", "sw", 209),
    ]
    for item_id, corner, seed in inners:
        sf = save_asset(item_id, draw_inner_corner(corner, seed=seed), uuid_map)
        key = {
            "ne": "fringeInNE",
            "nw": "fringeInNW",
            "se": "fringeInSE",
            "sw": "fringeInSW",
        }[corner]
        frames[key] = sf
        upsert_catalog(item_id, "assets/textures/terrain/{}.png".format(item_id))

    outers = [
        ("tile-fringe-out-ne", "ne", 301),
        ("tile-fringe-out-nw", "nw", 303),
        ("tile-fringe-out-se", "se", 307),
        ("tile-fringe-out-sw", "sw", 309),
    ]
    for item_id, corner, seed in outers:
        sf = save_asset(item_id, draw_outer_corner(corner, seed=seed), uuid_map)
        key = {
            "ne": "fringeOutNE",
            "nw": "fringeOutNW",
            "se": "fringeOutSE",
            "sw": "fringeOutSW",
        }[corner]
        frames[key] = sf
        upsert_catalog(item_id, "assets/textures/terrain/{}.png".format(item_id))

    UUID_MAP.write_text(json.dumps(uuid_map, indent=2) + "\n", encoding="utf-8")
    TERRAIN_FRAMES.write_text(json.dumps(frames, indent=2) + "\n", encoding="utf-8")
    ts = (
        "/** Auto-synced from tools/ui/terrain-frames.json */\n"
        "export const TERRAIN_FRAMES = {}\n".format(json.dumps(frames, indent=4))
    )
    (ROOT / "assets/scripts/game/TerrainFrames.ts").write_text(ts, encoding="utf-8")
    print("Wrote terrain fringe frames")


if __name__ == "__main__":
    main()
