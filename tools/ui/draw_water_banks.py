#!/usr/bin/env python3
"""
Stardew-like water bank / shore / pier tiles for Lumewisp Vale.

Pixel-level banks: elevated dirt lip, dark cliff face, foam line, jagged edge.
Overwrites tile-cliff; writes shore autotiles + wooden pier plank.
"""

from __future__ import print_function

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
PROPS_DIR = ROOT / "assets/textures/props"
TERRAIN_FRAMES = TOOLS / "terrain-frames.json"
WATER_SRC = TERRAIN_DIR / "tile-water.png"
TEX_SUFFIX = "6c48a"
SF_SUFFIX = "f9941"

# Stardew-ish bank palette (from reference read)
DIRT = (150, 95, 43, 255)
DIRT_LIGHT = (180, 130, 70, 255)
DIRT_DARK = (98, 60, 30, 255)
CLIFF = (122, 78, 40, 255)
CLIFF_DARK = (78, 48, 24, 255)
CLIFF_MID = (110, 70, 36, 255)
FOAM = (210, 230, 245, 255)
FOAM_DIM = (150, 190, 220, 255)
GRASS = (70, 150, 50, 255)
GRASS_D = (45, 110, 35, 255)
WOOD = (140, 90, 45, 255)
WOOD_DARK = (90, 55, 28, 255)
WOOD_LIGHT = (170, 120, 65, 255)
WOOD_LINE = (55, 35, 18, 255)


def uid():
    return str(uuid.uuid4())


def _h(x, y, seed):
    v = (x * 374761393 + y * 668265263 + seed * 982451653) & 0x7FFFFFFF
    v = (v ^ (v >> 13)) * 1274126177
    return ((v ^ (v >> 16)) & 0xFFFF) / 65536.0


def write_image_meta(png_path, image_uuid, w, h, name, pivot_y=0.5):
    hw, hh = w / 2.0, h / 2.0
    # foot pivot for props
    if pivot_y < 0.1:
        ox, oy = 0.0, -hh
    else:
        ox, oy = 0.0, 0.0
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
                    "pivotY": pivot_y,
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


def save_asset(item_id, img, uuid_map, folder, pivot_y=0.5):
    w, h = img.size
    png = folder / "{}.png".format(item_id)
    prev = uuid_map.get(item_id, {}).get("texture")
    image_uuid = prev or uid()
    img.save(png)
    write_image_meta(png, image_uuid, w, h, item_id, pivot_y=pivot_y)
    sf = "{}@{}".format(image_uuid, SF_SUFFIX)
    uuid_map[item_id] = {
        "texture": image_uuid,
        "prefab": uuid_map.get(item_id, {}).get("prefab", ""),
        "spriteFrame": sf,
    }
    print("OK", item_id, "{}x{}".format(w, h))
    return sf


def upsert_catalog(item_id, path, kind="terrain"):
    catalog = json.loads(CATALOG.read_text(encoding="utf-8"))
    existing = {i["id"]: i for i in catalog["items"]}
    entry = {
        "id": item_id,
        "kind": kind,
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


def stair_edge_px(along, seed, w=64, base=20, span=14):
    """
    Stardew-like coast: mostly flat plateaus with abrupt 2–6px steps
    (not a repeating sine zigzag).
    """
    # Quantize into 6–10px wide ledges
    cell = 6 + int(_h(along // 7, seed, 3) * 5)
    cell = max(5, min(11, cell))
    ledge = along // cell
    d = base
    d += int((_h(ledge, seed, 5) - 0.5) * span)
    d += int((_h(ledge + 3, seed, 9) - 0.5) * 4)
    # Rare deeper bite / jut
    if _h(ledge, seed, 11) > 0.82:
        d += 5 if _h(ledge, seed, 13) > 0.5 else -4
    return max(10, min(34, d))


def sample_water(water, x, y):
    w, h = water.size
    return water.getpixel((x % w, y % h))


def paint_dirt(px, x, y, seed):
    r = _h(x, y, seed)
    if r < 0.18:
        px[x, y] = DIRT_DARK
    elif r > 0.82:
        px[x, y] = DIRT_LIGHT
    else:
        px[x, y] = DIRT
    if r > 0.93 and _h(x, y, seed + 9) > 0.55:
        px[x, y] = GRASS if _h(x, y, seed + 1) > 0.4 else GRASS_D


def paint_cliff_face(px, x, y, seed):
    r = _h(x, y, seed + 11)
    if r < 0.25:
        px[x, y] = CLIFF_DARK
    elif r > 0.75:
        px[x, y] = CLIFF_MID
    else:
        px[x, y] = CLIFF
    if r > 0.92:
        px[x, y] = GRASS_D


def draw_cliff_bank(water, w=64, h=64):
    """
    River north bank overlay only (transparent bottom).
    Soft irregular lip — sparse foam, no sawtooth stripe.
    """
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    px = img.load()
    for x in range(w):
        lip = stair_edge_px(x, 41, w, base=42, span=8)
        face_top = lip - 9
        for y in range(h):
            if y < face_top - 1:
                paint_dirt(px, x, y, 7)
            elif y < lip:
                paint_cliff_face(px, x, y, 13)
            elif y == lip and _h(x, y, 17) > 0.55:
                px[x, y] = FOAM_DIM if _h(x, y, 19) > 0.5 else FOAM
    return img


def cut_shore(water, kind, seed):
    """
    Natural shore tile: dirt bank + thin cliff + sparse foam + water.
    Edge uses stair ledges (Stardew), not a repeating zigzag.
    """
    w, h = water.size
    out = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    px = out.load()
    src = water.load()

    # Precompute edge offset along the shore axis (pixels into the tile)
    edge = [0] * max(w, h)
    if kind in ("n", "s"):
        for x in range(w):
            edge[x] = stair_edge_px(x, seed, w, base=18, span=12)
    elif kind in ("e", "w"):
        for y in range(h):
            edge[y] = stair_edge_px(y, seed + 7, h, base=18, span=12)

    for y in range(h):
        for x in range(w):
            water_here = False
            on_foam = False
            bank_y = 0

            if kind == "n":
                lip = edge[x]
                water_here = y >= lip
                on_foam = y == lip or (y == lip + 1 and _h(x, y, seed) > 0.7)
                bank_y = lip
            elif kind == "s":
                lip = h - 1 - edge[x]
                water_here = y <= lip
                on_foam = y == lip or (y == lip - 1 and _h(x, y, seed) > 0.7)
                bank_y = lip
            elif kind == "w":
                lip = edge[y]
                water_here = x >= lip
                on_foam = x == lip or (x == lip + 1 and _h(x, y, seed) > 0.7)
                bank_y = lip
            elif kind == "e":
                lip = w - 1 - edge[y]
                water_here = x <= lip
                on_foam = x == lip or (x == lip - 1 and _h(x, y, seed) > 0.7)
                bank_y = lip
            elif kind in ("ne", "nw", "se", "sw"):
                # Diagonal step corner — Manhattan/Chebyshev blend, not a circle
                if kind == "ne":
                    lx, ly = w - 1 - x, y
                elif kind == "nw":
                    lx, ly = x, y
                elif kind == "se":
                    lx, ly = w - 1 - x, h - 1 - y
                else:
                    lx, ly = x, h - 1 - y
                # Stair diagonal: land when both lx,ly small with step noise
                thresh = 28 + int((_h(lx // 4, ly // 4, seed) - 0.5) * 10)
                # Octagon-ish / stepped: max(lx,ly) + 0.35*min
                score = max(lx, ly) + int(0.35 * min(lx, ly))
                water_here = score >= thresh
                on_foam = abs(score - thresh) <= 1 and _h(x, y, seed) > 0.4
            else:
                water_here = True

            if water_here:
                if on_foam and _h(x, y, seed + 3) > 0.35:
                    # Sparse foam — broken 1px highlights, not a solid saw
                    px[x, y] = FOAM if _h(x, y, seed + 5) > 0.45 else FOAM_DIM
                else:
                    px[x, y] = src[x, y]
            else:
                # Bank: dirt plateau + short dark cliff just before water
                if kind == "n":
                    if y >= bank_y - 7:
                        paint_cliff_face(px, x, y, seed)
                    else:
                        paint_dirt(px, x, y, seed)
                elif kind == "s":
                    if y <= bank_y + 7:
                        paint_cliff_face(px, x, y, seed)
                    else:
                        paint_dirt(px, x, y, seed)
                elif kind == "w":
                    if x >= bank_y - 7:
                        paint_cliff_face(px, x, y, seed)
                    else:
                        paint_dirt(px, x, y, seed)
                elif kind == "e":
                    if x <= bank_y + 7:
                        paint_cliff_face(px, x, y, seed)
                    else:
                        paint_dirt(px, x, y, seed)
                else:
                    # corner land
                    paint_dirt(px, x, y, seed)
                    if on_foam:
                        paint_cliff_face(px, x, y, seed)
    return out


def _put(px, x, y, c, w, h):
    if 0 <= x < w and 0 <= y < h:
        px[x, y] = c


def _wood_plank_color(x, y, seed):
    r = _h(x, y, seed)
    if r < 0.18:
        return WOOD_DARK
    if r > 0.78:
        return WOOD_LIGHT
    if r > 0.55:
        return WOOD
    return (128, 82, 40, 255)


def draw_pier_tile(w=64, h=64):
    """
    Bridge deck fill (walk E–W): full-cell N–S planks, no dangling tip piling
    (pilings live on the bridge rail prop only).
    """
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    px = img.load()
    y0, y1 = 14, 50
    for y in range(y0, y1):
        for x in range(0, w):
            if x % 8 == 0:
                c = WOOD_LINE
            elif y in (y0, y1 - 1):
                c = WOOD_LINE
            elif y == y0 + 1:
                c = WOOD_LIGHT
            elif y >= y1 - 3:
                c = WOOD_DARK
            else:
                c = _wood_plank_color(x, y, 11)
            px[x, y] = c
    for y in range(y1, min(h, y1 + 3)):
        for x in range(0, w):
            if x % 8 == 0:
                px[x, y] = WOOD_LINE
            else:
                px[x, y] = WOOD_DARK if y > y1 + 1 else (70, 42, 20, 255)
    return img


def draw_wood_bridge(w=256, h=88):
    """
    Stardew footbridge (walk E–W): vertical planks, N/S railings with posts,
    end pillars, south pilings — matches the reference schematic.
    Foot pivot (south edge).
    """
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    px = img.load()

    deck_y0, deck_y1 = 28, 58  # walking surface
    rail_n_y = 18
    rail_s_y = 62
    # Full-width rails (edge posts sit in the end tiles)
    x0, x1 = 4, w - 4

    # --- deck planks (N–S boards → vertical seams) ---
    for y in range(deck_y0, deck_y1):
        for x in range(x0, x1):
            seam = (x - x0) % 7 == 0
            if seam or y in (deck_y0, deck_y1 - 1):
                c = WOOD_LINE
            elif y == deck_y0 + 1:
                c = WOOD_LIGHT
            elif y >= deck_y1 - 3:
                c = WOOD_DARK
            else:
                c = _wood_plank_color(x, y, 17)
            px[x, y] = c

    # deck side lips (slight 2.5D rim)
    for x in range(x0, x1):
        _put(px, x, deck_y0 - 1, WOOD_DARK, w, h)
        _put(px, x, deck_y1, WOOD_LINE, w, h)
        _put(px, x, deck_y1 + 1, (60, 36, 16, 255), w, h)

    def post(cx, y_top, y_bot, wide=3):
        for y in range(y_top, y_bot + 1):
            for dx in range(wide):
                xx = cx + dx
                if dx in (0, wide - 1):
                    _put(px, xx, y, WOOD_LINE, w, h)
                elif y == y_top:
                    _put(px, xx, y, WOOD_LIGHT, w, h)
                else:
                    _put(px, xx, y, WOOD_DARK if (y + dx) % 4 == 0 else WOOD, w, h)

    def rail_beam(y, x_a, x_b):
        for x in range(x_a, x_b):
            _put(px, x, y, WOOD_LINE, w, h)
            _put(px, x, y + 1, WOOD, w, h)
            if _h(x, y, 29) > 0.7:
                _put(px, x, y + 1, WOOD_LIGHT, w, h)

    # --- north railing (full span; south rail is a separate Y-sorted prop) ---
    rail_beam(rail_n_y, x0, x1)
    for cx in range(x0 + 6, x1 - 6, 32):
        post(cx, rail_n_y - 6, deck_y0 + 2, 3)

    # --- tall end pillars (bridge abutments) ---
    post(x0, rail_n_y - 10, deck_y1 + 6, 4)
    post(x1 - 4, rail_n_y - 10, deck_y1 + 6, 4)
    for dx in range(0, 5):
        for dy in range(0, 3):
            _put(px, x0 + dx, rail_n_y - 12 + dy, WOOD_LIGHT if dy == 0 else WOOD, w, h)
            _put(px, x1 - 4 + dx, rail_n_y - 12 + dy, WOOD_LIGHT if dy == 0 else WOOD, w, h)

    # short under-deck shadow (pilings live on south-rail prop)
    for x in range(x0, x1):
        _put(px, x, deck_y1 + 2, (50, 30, 14, 220), w, h)

    # nail dots on deck
    for x in range(x0 + 4, x1 - 4, 14):
        for y in (deck_y0 + 4, deck_y1 - 5):
            _put(px, x, y, WOOD_LINE, w, h)
            _put(px, x + 1, y, (40, 28, 14, 255), w, h)

    return img


def draw_bridge_rail_south(w=256, h=40):
    """South rail only — same width as bridge deck; Y-sorted actor."""
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    px = img.load()
    x0, x1 = 4, w - 4
    rail_y = 8

    for x in range(x0, x1):
        _put(px, x, rail_y, WOOD_LINE, w, h)
        _put(px, x, rail_y + 1, WOOD, w, h)

    def post(cx, y_top, y_bot, wide=3):
        for y in range(y_top, y_bot + 1):
            for dx in range(wide):
                xx = cx + dx
                if dx in (0, wide - 1):
                    _put(px, xx, y, WOOD_LINE, w, h)
                else:
                    _put(px, xx, y, WOOD_DARK if (y + dx) % 4 == 0 else WOOD, w, h)

    # Posts every tile so the rail reads continuous across the full span
    for cx in range(x0 + 6, x1 - 6, 32):
        post(cx, 0, rail_y + 10, 3)
    post(x0, 0, h - 4, 4)
    post(x1 - 4, 0, h - 4, 4)
    for cx in (x0 + 8, w // 2 - 1, x1 - 12):
        for y in range(rail_y + 8, h - 1):
            for dx in range(0, 3):
                _put(px, cx + dx, y, WOOD_LINE if dx in (0, 2) else WOOD_DARK, w, h)
    return img


def main():
    if not WATER_SRC.exists():
        raise SystemExit("missing " + str(WATER_SRC))
    water = Image.open(WATER_SRC).convert("RGBA")

    uuid_map = {}
    if UUID_MAP.exists():
        uuid_map = json.loads(UUID_MAP.read_text(encoding="utf-8"))
    frames = {}
    if TERRAIN_FRAMES.exists():
        frames = json.loads(TERRAIN_FRAMES.read_text(encoding="utf-8"))

    # North bank / cliff (overwrite)
    sf = save_asset("tile-cliff", draw_cliff_bank(water), uuid_map, TERRAIN_DIR)
    frames["cliff"] = sf
    upsert_catalog("tile-cliff", "assets/textures/terrain/tile-cliff.png")

    shores = [
        ("tile-pond-shore-n", "n", "pondShoreN", 501),
        ("tile-pond-shore-n-b", "n", "pondShoreNB", 521),
        ("tile-pond-shore-e", "e", "pondShoreE", 503),
        ("tile-pond-shore-e-b", "e", "pondShoreEB", 523),
        ("tile-pond-shore-s", "s", "pondShoreS", 507),
        ("tile-pond-shore-s-b", "s", "pondShoreSB", 527),
        ("tile-pond-shore-w", "w", "pondShoreW", 509),
        ("tile-pond-shore-w-b", "w", "pondShoreWB", 529),
        ("tile-pond-shore-ne", "ne", "pondShoreNE", 511),
        ("tile-pond-shore-nw", "nw", "pondShoreNW", 513),
        ("tile-pond-shore-se", "se", "pondShoreSE", 517),
        ("tile-pond-shore-sw", "sw", "pondShoreSW", 519),
    ]
    for item_id, kind, key, seed in shores:
        sf = save_asset(item_id, cut_shore(water, kind, seed), uuid_map, TERRAIN_DIR)
        frames[key] = sf
        upsert_catalog(item_id, "assets/textures/terrain/{}.png".format(item_id))

    sf = save_asset("tile-pier", draw_pier_tile(), uuid_map, TERRAIN_DIR)
    frames["pier"] = sf
    upsert_catalog("tile-pier", "assets/textures/terrain/tile-pier.png")

    # Keep water uuid in frames
    frames["water"] = "{}@{}".format(
        uuid_map.get("tile-water", {}).get(
            "texture", "8e3e98e6-ae45-420a-b7a6-d5e95b4fbc59"
        ),
        SF_SUFFIX,
    )
    frames["cliff"] = uuid_map["tile-cliff"]["spriteFrame"]

    PROPS_DIR.mkdir(parents=True, exist_ok=True)
    sf = save_asset(
        "prop-bridge",
        draw_wood_bridge(256, 88),
        uuid_map,
        PROPS_DIR,
        pivot_y=0.0,
    )
    upsert_catalog("prop-bridge", "assets/textures/props/prop-bridge.png", kind="prop")

    save_asset(
        "prop-bridge-rail-s",
        draw_bridge_rail_south(256, 40),
        uuid_map,
        PROPS_DIR,
        pivot_y=0.0,
    )
    upsert_catalog(
        "prop-bridge-rail-s",
        "assets/textures/props/prop-bridge-rail-s.png",
        kind="prop",
    )

    UUID_MAP.write_text(json.dumps(uuid_map, indent=2) + "\n", encoding="utf-8")
    TERRAIN_FRAMES.write_text(json.dumps(frames, indent=2) + "\n", encoding="utf-8")
    ts = (
        "/** Auto-synced from tools/ui/terrain-frames.json */\n"
        "export const TERRAIN_FRAMES = {}\n".format(json.dumps(frames, indent=4))
    )
    (ROOT / "assets/scripts/game/TerrainFrames.ts").write_text(ts, encoding="utf-8")
    print("Wrote water banks + pier + wood bridge + south rail")


if __name__ == "__main__":
    main()
