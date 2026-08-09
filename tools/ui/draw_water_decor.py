#!/usr/bin/env python3
"""
Stardew-like lake decorations: lily pads, flower lilies, reeds, wet rocks, sunk log.
"""

import json
import math
import uuid
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[2]
TOOLS = Path(__file__).resolve().parent
UUID_MAP = TOOLS / "uuid-map.json"
CATALOG = TOOLS / "catalog.json"
NATURE_FRAMES = TOOLS / "nature-frames.json"
TEX_DIR = ROOT / "assets/textures/nature"
TEX_SUFFIX = "6c48a"
SF_SUFFIX = "f9941"

PAD = (48, 140, 55, 255)
PAD_D = (28, 100, 40, 255)
PAD_L = (70, 170, 70, 255)
FLOWER = (230, 120, 160, 255)
FLOWER_C = (245, 200, 210, 255)
REED = (60, 150, 55, 255)
REED_D = (35, 110, 40, 255)
REED_TIP = (90, 180, 70, 255)
ROCK = (70, 85, 95, 255)
ROCK_D = (45, 55, 65, 255)
ROCK_WET = (55, 90, 110, 255)
WOOD = (110, 75, 40, 255)
WOOD_D = (70, 45, 22, 255)
WOOD_WET = (80, 70, 50, 255)


def uid():
    return str(uuid.uuid4())


def _h(x, y, seed):
    v = (x * 374761393 + y * 668265263 + seed * 982451653) & 0x7FFFFFFF
    v = (v ^ (v >> 13)) * 1274126177
    return ((v ^ (v >> 16)) & 0xFFFF) / 65536.0


def write_image_meta(png_path, image_uuid, w, h, name, pivot_y=0.5):
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


def save_asset(item_id, img, uuid_map, pivot_y=0.5):
    w, h = img.size
    png = TEX_DIR / "{}.png".format(item_id)
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


def upsert_catalog(item_id, path):
    catalog = json.loads(CATALOG.read_text(encoding="utf-8"))
    existing = {i["id"]: i for i in catalog["items"]}
    entry = {
        "id": item_id,
        "kind": "nature",
        "spriteType": "simple",
        "designSize": list(Image.open(ROOT / path).size) if (ROOT / path).exists() else [32, 32],
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


def draw_lily(bloom=False, w=28, h=24):
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    cx, cy = w // 2, h // 2 + 1
    # pad ellipse with notch
    d.ellipse([2, 4, w - 3, h - 3], fill=PAD_D)
    d.ellipse([3, 5, w - 4, h - 4], fill=PAD)
    # radial veins
    for a in range(0, 360, 45):
        rad = math.radians(a)
        x1 = cx + int(math.cos(rad) * 2)
        y1 = cy + int(math.sin(rad) * 2)
        x2 = cx + int(math.cos(rad) * 9)
        y2 = cy + int(math.sin(rad) * 7)
        d.line([(x1, y1), (x2, y2)], fill=PAD_D)
    # notch cut (classic lily) — clear a wedge on the right
    px = img.load()
    for y in range(h):
        for x in range(cx + 2, w):
            # wedge from center toward right edge
            if abs(y - cy) <= (x - cx) // 2 + 1:
                px[x, y] = (0, 0, 0, 0)
    # highlight speck
    if 0 <= cx - 3 < w and 0 <= cy - 2 < h:
        px[cx - 3, cy - 2] = PAD_L
    if bloom:
        d.ellipse([cx - 3, cy - 5, cx + 3, cy + 1], fill=FLOWER)
        d.point((cx, cy - 2), fill=FLOWER_C)
        d.point((cx - 1, cy - 3), fill=FLOWER_C)
    return img


def draw_reed(w=40, h=44):
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    px = img.load()
    # denser cluster of blades rising from the waterline
    bases = [8, 12, 17, 22, 27, 32]
    for i, bx in enumerate(bases):
        height = 20 + (i % 4) * 5 + int(_h(bx, i, 2) * 8)
        lean = -1 if i % 2 == 0 else 1
        for t in range(height):
            y = h - 3 - t
            x = bx + (t * lean) // 9
            if 0 <= x < w and 0 <= y < h:
                col = REED_D if t < 5 else REED
                if t > height - 5:
                    col = REED_TIP
                px[x, y] = col
                if 0 <= x + 1 < w:
                    px[x + 1, y] = REED if t % 2 == 0 else col
                if t < 6 and 0 <= x - 1 < w:
                    px[x - 1, y] = REED_D
    return img


def draw_rock_wet(w=40, h=28):
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.ellipse([4, 8, w - 4, h - 2], fill=ROCK_D)
    d.ellipse([6, 6, w - 6, h - 4], fill=ROCK_WET)
    d.ellipse([10, 8, w - 14, h - 10], fill=ROCK)
    # wet sheen
    d.point((12, 12), fill=(140, 180, 200, 200))
    d.point((14, 11), fill=(140, 180, 200, 160))
    return img


def draw_log_sunk(w=88, h=36):
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    # hollow log lying in water
    d.ellipse([4, 10, w - 4, h - 4], fill=WOOD_D)
    d.ellipse([6, 8, w - 6, h - 6], fill=WOOD_WET)
    d.ellipse([8, 10, w - 8, h - 8], fill=WOOD)
    # hollow opening left
    d.ellipse([6, 12, 22, h - 8], fill=(30, 40, 50, 255))
    d.ellipse([8, 14, 18, h - 10], fill=(20, 30, 40, 255))
    # rings / wet patches
    for x in range(24, w - 10, 10):
        d.line([(x, 12), (x, h - 8)], fill=WOOD_D)
    d.point((40, 14), fill=(100, 140, 160, 180))
    d.point((55, 16), fill=(100, 140, 160, 140))
    return img


def main():
    TEX_DIR.mkdir(parents=True, exist_ok=True)
    uuid_map = {}
    if UUID_MAP.exists():
        uuid_map = json.loads(UUID_MAP.read_text(encoding="utf-8"))
    frames = {}
    if NATURE_FRAMES.exists():
        frames = json.loads(NATURE_FRAMES.read_text(encoding="utf-8"))

    specs = [
        ("nat-lily", "lily", draw_lily(False), 0.5),
        ("nat-lily-bloom", "lilyBloom", draw_lily(True), 0.5),
        ("nat-reed", "reed", draw_reed(), 0.0),
        ("nat-rock-wet", "rockWet", draw_rock_wet(), 0.15),
        ("nat-log-sunk", "logSunk", draw_log_sunk(), 0.15),
    ]
    for item_id, key, img, pivot in specs:
        sf = save_asset(item_id, img, uuid_map, pivot_y=pivot)
        frames[key] = sf
        upsert_catalog(item_id, "assets/textures/nature/{}.png".format(item_id))

    UUID_MAP.write_text(json.dumps(uuid_map, indent=2) + "\n", encoding="utf-8")
    NATURE_FRAMES.write_text(json.dumps(frames, indent=2) + "\n", encoding="utf-8")
    ts = (
        "/** Auto-synced from tools/ui/nature-frames.json */\n"
        "export const NATURE_FRAMES = {}\n".format(json.dumps(frames, indent=4))
    )
    (ROOT / "assets/scripts/game/NatureFrames.ts").write_text(ts, encoding="utf-8")
    print("Wrote lake water decorations")


if __name__ == "__main__":
    main()
