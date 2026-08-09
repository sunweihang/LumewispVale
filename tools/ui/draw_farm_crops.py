#!/usr/bin/env python3
"""Draw tilled/wet soil placeholders. Production tiles: process_farm_tools_ai.py."""

import json
import random
import uuid
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[2]
TOOLS = Path(__file__).resolve().parent
TOKENS = TOOLS / "tokens.json"
UUID_MAP = TOOLS / "uuid-map.json"
CATALOG = TOOLS / "catalog.json"
TEX_DIR = ROOT / "assets/textures/farm"
TEX_SUFFIX = "6c48a"
SF_SUFFIX = "f9941"


def uid():
    return str(uuid.uuid4())


def hex_to_rgb(h):
    h = h.lstrip("#")
    return int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)


def write_image_meta(png_path, image_uuid, w, h, name):
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
                    "pivotY": 0.5 if name.startswith("tile-") else 0.0,
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
                    "trimType": "auto",
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


def draw_tilled(w, h, dirt):
    img = Image.new("RGBA", (w, h), dirt + (255,))
    d = ImageDraw.Draw(img)
    dark = (90, 58, 30)
    ridge = (150, 105, 60)
    for y in range(6, h - 4, 10):
        d.line([(2, y), (w - 3, y)], fill=dark + (255,))
        d.line([(2, y + 2), (w - 3, y + 2)], fill=ridge + (220,))
    d.rectangle([0, 0, w - 1, h - 1], outline=(70, 45, 22, 120))
    return img


def draw_wet(w, h, dirt):
    base = tuple(max(0, c - 35) for c in dirt)
    wet = (base[0], base[1] + 10, min(255, base[2] + 40))
    img = Image.new("RGBA", (w, h), wet + (255,))
    d = ImageDraw.Draw(img)
    dark = (50, 70, 90)
    for y in range(6, h - 4, 10):
        d.line([(2, y), (w - 3, y)], fill=dark + (200,))
    d.ellipse([18, 22, 30, 30], fill=(120, 170, 210, 160))
    d.ellipse([40, 40, 52, 48], fill=(120, 170, 210, 120))
    d.rectangle([0, 0, w - 1, h - 1], outline=(40, 60, 80, 140))
    return img


# Crop sprites: process_crop_parsnip_ai.py — do not clobber from here.
ITEMS = [
    ("tile-tilled", 64, 64, "tile"),
    ("tile-wet", 64, 64, "tile"),
]


def main():
    random.seed(7)
    tokens = json.loads(TOKENS.read_text(encoding="utf-8"))
    dirt = hex_to_rgb(tokens["world"]["dirt"])
    TEX_DIR.mkdir(parents=True, exist_ok=True)

    uuid_map = {}
    if UUID_MAP.exists():
        uuid_map = json.loads(UUID_MAP.read_text(encoding="utf-8"))

    frames = {}
    for item_id, w, h, kind in ITEMS:
        if item_id == "tile-tilled":
            img = draw_tilled(w, h, dirt)
        else:
            img = draw_wet(w, h, dirt)
        img = img.resize((w, h), Image.NEAREST)
        png = ROOT / "assets/textures/farm/{}.png".format(item_id)
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
        frames[item_id] = sf
        print("OK", item_id, "{}x{}".format(w, h), sf)

    UUID_MAP.write_text(json.dumps(uuid_map, indent=2) + "\n", encoding="utf-8")

    old_farm = {}
    ff = TOOLS / "farm-frames.json"
    if ff.exists():
        old_farm = json.loads(ff.read_text(encoding="utf-8"))
    farm_json = {
        "tilled": frames["tile-tilled"],
        "wet": frames["tile-wet"],
        "crop": old_farm.get("crop", []),
    }
    ff.write_text(json.dumps(farm_json, indent=2) + "\n", encoding="utf-8")
    (ROOT / "assets/scripts/game/FarmFrames.ts").write_text(
        "/** Auto-synced from tools/ui/farm-frames.json */\n"
        "export const FARM_FRAMES = {}\n".format(json.dumps(farm_json, indent=4)),
        encoding="utf-8",
    )

    catalog = json.loads(CATALOG.read_text(encoding="utf-8"))
    existing = {i["id"] for i in catalog["items"]}
    for item_id, w, h, kind in ITEMS:
        if item_id in existing:
            continue
        catalog["items"].append(
            {
                "id": item_id,
                "kind": kind,
                "spriteType": "simple",
                "designSize": [w, h],
                "path": "assets/textures/farm/{}.png".format(item_id),
                "prefab": "",
                "layer": "Ground",
            }
        )
    CATALOG.write_text(json.dumps(catalog, indent=2) + "\n", encoding="utf-8")
    print("Wrote farm-frames + FarmFrames.ts")
    print("NOTE: for AI tilled/wet art run: python3 tools/ui/process_farm_tools_ai.py")


if __name__ == "__main__":
    main()
