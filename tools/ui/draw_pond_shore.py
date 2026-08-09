#!/usr/bin/env python3
"""
Rounded pond shore tiles (transparent land side) for Lumewisp Vale.

Cuts smooth curved / quarter-ellipse edges from tile-water so pond
perimeters read as rounded instead of square grid stairs.
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
WATER_SRC = TERRAIN_DIR / "tile-water.png"
TEX_SUFFIX = "6c48a"
SF_SUFFIX = "f9941"

SAND = (196, 164, 106, 255)
SAND_DARK = (140, 108, 62, 255)
FOAM = (140, 190, 220, 230)
LIP = (90, 58, 36, 255)


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
                        "uv": [0, h, w, h, 0, 0, w, h, 0, 0, w, 0],
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
    # Fix uv to match fringe script convention
    meta["subMetas"][SF_SUFFIX]["userData"]["uv"] = [0, h, w, h, 0, 0, w, 0]
    png_path.with_suffix(".png.meta").write_text(
        json.dumps(meta, indent=2) + "\n", encoding="utf-8"
    )


def water_mask(kind, x, y, w, h, seed):
    """
    Signed coverage: >0 water, <0 land. Soft band near 0 for sand lip.
    Image y=0 is top.
    """
    fx = (x + 0.5) / w
    fy = (y + 0.5) / h
    jitter = (_hash01(x, y, seed) - 0.5) * 0.04

    if kind == "full":
        return 1.0

    if kind == "n":
        # Land north — water bulges upward in the middle
        edge = 0.34 - 0.22 * math.cos(math.pi * (fx - 0.5))
        return fy - edge + jitter
    if kind == "s":
        edge = 0.66 + 0.22 * math.cos(math.pi * (fx - 0.5))
        return edge - fy + jitter
    if kind == "w":
        edge = 0.34 - 0.22 * math.cos(math.pi * (fy - 0.5))
        return fx - edge + jitter
    if kind == "e":
        edge = 0.66 + 0.22 * math.cos(math.pi * (fy - 0.5))
        return edge - fx + jitter

    # Outer corners: land on two sides, water in opposite quarter-ellipse
    # Center of ellipse at the water-side corner of the tile.
    if kind == "ne":
        cx, cy = 0.08, 0.92  # SW water pocket
        rx, ry = 0.92, 0.92
        d = ((fx - cx) / rx) ** 2 + ((fy - cy) / ry) ** 2
        return 1.05 - d + jitter
    if kind == "nw":
        cx, cy = 0.92, 0.92
        rx, ry = 0.92, 0.92
        d = ((fx - cx) / rx) ** 2 + ((fy - cy) / ry) ** 2
        return 1.05 - d + jitter
    if kind == "se":
        cx, cy = 0.08, 0.08
        rx, ry = 0.92, 0.92
        d = ((fx - cx) / rx) ** 2 + ((fy - cy) / ry) ** 2
        return 1.05 - d + jitter
    if kind == "sw":
        cx, cy = 0.92, 0.08
        rx, ry = 0.92, 0.92
        d = ((fx - cx) / rx) ** 2 + ((fy - cy) / ry) ** 2
        return 1.05 - d + jitter

    return 1.0


def cut_shore(water: Image.Image, kind: str, seed: int) -> Image.Image:
    w, h = water.size
    src = water.convert("RGBA")
    out = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    px = src.load()
    dest = out.load()

    for y in range(h):
        for x in range(w):
            cov = water_mask(kind, x, y, w, h, seed)
            if cov >= 0.08:
                dest[x, y] = px[x, y]
            elif cov >= -0.02:
                # Foam line
                dest[x, y] = FOAM
            elif cov >= -0.10:
                # Sand beach rim
                r = _hash01(x, y, seed + 7)
                dest[x, y] = SAND if r > 0.35 else SAND_DARK
            elif cov >= -0.16:
                dest[x, y] = LIP
            # else transparent — grass shows through
    return out


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
    if not WATER_SRC.exists():
        raise SystemExit("missing {}".format(WATER_SRC))

    TERRAIN_DIR.mkdir(parents=True, exist_ok=True)
    uuid_map = {}
    if UUID_MAP.exists():
        uuid_map = json.loads(UUID_MAP.read_text(encoding="utf-8"))

    frames = {}
    if TERRAIN_FRAMES.exists():
        frames = json.loads(TERRAIN_FRAMES.read_text(encoding="utf-8"))

    water = Image.open(WATER_SRC).convert("RGBA")
    # Keep a full water key for pond interiors (same visual as river tile).
    frames["water"] = "{}@{}".format(
        uuid_map.get("tile-water", {}).get("texture", "8e3e98e6-ae45-420a-b7a6-d5e95b4fbc59"),
        SF_SUFFIX,
    )

    specs = [
        ("tile-pond-shore-n", "n", "pondShoreN", 501),
        ("tile-pond-shore-e", "e", "pondShoreE", 503),
        ("tile-pond-shore-s", "s", "pondShoreS", 507),
        ("tile-pond-shore-w", "w", "pondShoreW", 509),
        ("tile-pond-shore-ne", "ne", "pondShoreNE", 511),
        ("tile-pond-shore-nw", "nw", "pondShoreNW", 513),
        ("tile-pond-shore-se", "se", "pondShoreSE", 517),
        ("tile-pond-shore-sw", "sw", "pondShoreSW", 519),
    ]
    for item_id, kind, key, seed in specs:
        sf = save_asset(item_id, cut_shore(water, kind, seed), uuid_map)
        frames[key] = sf
        upsert_catalog(item_id, "assets/textures/terrain/{}.png".format(item_id))

    UUID_MAP.write_text(json.dumps(uuid_map, indent=2) + "\n", encoding="utf-8")
    TERRAIN_FRAMES.write_text(json.dumps(frames, indent=2) + "\n", encoding="utf-8")
    ts = (
        "/** Auto-synced from tools/ui/terrain-frames.json */\n"
        "export const TERRAIN_FRAMES = {}\n".format(json.dumps(frames, indent=4))
    )
    (ROOT / "assets/scripts/game/TerrainFrames.ts").write_text(ts, encoding="utf-8")
    print("Wrote pond shore frames")


if __name__ == "__main__":
    main()
