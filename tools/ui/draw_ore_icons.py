#!/usr/bin/env python3
"""Tiny ore icons for town miner shop (32→64 UI)."""

from __future__ import print_function

import json
import uuid
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "assets/textures/ui"
UUID_MAP = Path(__file__).resolve().parent / "uuid-map.json"
MAT_JSON = Path(__file__).resolve().parent / "material-frames.json"
TEX_SUFFIX = "6c48a"
SF_SUFFIX = "f9941"


def uid():
    return str(uuid.uuid4())


def write_meta(png_path, image_uuid, w, h, name):
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
                    "trimType": "custom",
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
                    "packable": True,
                    "pixelsToUnit": 100,
                    "pivotX": 0.5,
                    "pivotY": 0.5,
                    "meshType": 0,
                },
                "ver": "1.0.22",
                "imported": True,
                "files": [".json"],
                "subMetas": {},
            },
        },
        "userData": {"type": "sprite-frame", "hasAlpha": True},
    }
    png_path.with_suffix(".png.meta").write_text(json.dumps(meta, indent=2) + "\n")


def draw_ore(color, highlight, name):
    img = Image.new("RGBA", (64, 64), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    ink = (30, 24, 20, 255)
    d.polygon([(32, 10), (52, 26), (46, 50), (18, 50), (12, 26)], fill=color, outline=ink)
    d.polygon([(32, 16), (42, 28), (32, 36), (24, 28)], fill=highlight)
    path = OUT / (name + ".png")
    img.save(path)
    return path


def main():
    ores = [
        ("ic-copper", (180, 110, 60, 255), (230, 170, 100, 255)),
        ("ic-iron", (140, 145, 155, 255), (200, 205, 215, 255)),
        ("ic-goldore", (210, 170, 50, 255), (250, 220, 100, 255)),
    ]
    umap = json.loads(UUID_MAP.read_text(encoding="utf-8"))
    mats = json.loads(MAT_JSON.read_text(encoding="utf-8"))
    for name, col, hi in ores:
        path = draw_ore(col, hi, name)
        meta_path = path.with_suffix(".png.meta")
        if meta_path.exists():
            try:
                image_uuid = json.loads(meta_path.read_text())["uuid"]
            except Exception:
                image_uuid = uid()
        else:
            image_uuid = uid()
        write_meta(path, image_uuid, 64, 64, name)
        sf = "{}@{}".format(image_uuid, SF_SUFFIX)
        umap[name] = {"texture": image_uuid, "spriteFrame": sf}
        key = name.replace("ic-", "").replace("goldore", "goldOre")
        if key == "copper":
            mats["copper"] = sf
        elif key == "iron":
            mats["iron"] = sf
        elif key == "goldOre":
            mats["goldOre"] = sf
        print("wrote", name)
    UUID_MAP.write_text(json.dumps(umap, indent=2) + "\n")
    MAT_JSON.write_text(json.dumps(mats, indent=2) + "\n")
    # sync TS
    lines = ['/** Auto-synced from tools/ui/material-frames.json */', 'export const MATERIAL_FRAMES = {']
    for k, v in mats.items():
        lines.append('    "{}": "{}",'.format(k, v))
    lines[-1] = lines[-1].rstrip(",")
    lines.append("}")
    (ROOT / "assets/scripts/game/MaterialFrames.ts").write_text("\n".join(lines) + "\n")


if __name__ == "__main__":
    main()
