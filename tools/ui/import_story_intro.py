#!/usr/bin/env python3
"""Import origin-story panels into assets/textures/story + StoryIntroFrames.ts."""

from __future__ import print_function

import json
import uuid
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
TOOLS = Path(__file__).resolve().parent
SRC = TOOLS / "ai-source"
OUT = ROOT / "assets" / "textures" / "story"
UUID_MAP = TOOLS / "uuid-map.json"
FRAMES_JSON = TOOLS / "story-intro-frames.json"
FRAMES_TS = ROOT / "assets" / "scripts" / "game" / "StoryIntroFrames.ts"

# Display-friendly portrait panels (keep 2:3).
OUT_W, OUT_H = 720, 1080

PANELS = [
    ("story-01", "story-01-battle-wound.png"),
    ("story-02", "story-02-memory-loss.png"),
    ("story-03", "story-03-cosmic-storm.png"),
    ("story-04", "story-04-vale-arrival.png"),
    ("story-05", "story-05-healing-life.png"),
]

TEX_SUFFIX = "6c48a"
SF_SUFFIX = "f9941"


def load_uuid_map():
    if UUID_MAP.exists():
        return json.loads(UUID_MAP.read_text(encoding="utf-8"))
    return {}


def save_uuid_map(umap):
    UUID_MAP.write_text(json.dumps(umap, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def write_dir_meta(path: Path):
    meta_path = path.with_suffix(path.suffix + ".meta") if path.suffix else Path(str(path) + ".meta")
    # directory: assets/textures/story.meta
    meta_path = Path(str(path) + ".meta")
    if meta_path.exists():
        return
    meta_path.write_text(
        json.dumps(
            {
                "ver": "1.2.0",
                "importer": "directory",
                "imported": True,
                "uuid": str(uuid.uuid4()),
                "files": [],
                "subMetas": {},
                "userData": {},
            },
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )


def write_meta(png: Path, image_uuid: str, display: str, w: int, h: int) -> str:
    meta_path = Path(str(png) + ".meta")
    hw, hh = w / 2.0, h / 2.0
    if meta_path.exists():
        old = json.loads(meta_path.read_text(encoding="utf-8"))
        image_uuid = old.get("uuid", image_uuid)
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
                "displayName": display,
                "id": TEX_SUFFIX,
                "name": "texture",
                "userData": {
                    "wrapModeS": "clamp-to-edge",
                    "wrapModeT": "clamp-to-edge",
                    "minfilter": "linear",
                    "magfilter": "linear",
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
                "displayName": display,
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
                    "packable": False,
                    "pixelsToUnit": 100,
                    "pivotX": 0.5,
                    "pivotY": 0.5,
                    "meshType": 0,
                    "isUuid": True,
                    "imageUuidOrDatabaseUri": "{}@{}".format(image_uuid, TEX_SUFFIX),
                    "atlasUuid": "",
                    "trimType": "custom",
                    "vertices": {
                        "rawPosition": [-hw, -hh, 0, hw, -hh, 0, -hw, hh, 0, hw, hh, 0],
                        "indexes": [0, 1, 2, 2, 1, 3],
                        "uv": [0, h, w, h, 0, 0, w, 0],
                        "nuv": [0, 0, 1, 0, 0, 1, 1, 1],
                        "minPos": [-hw, -hh, 0],
                        "maxPos": [hw, hh, 0],
                    },
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
    meta_path.write_text(json.dumps(meta, indent=2) + "\n", encoding="utf-8")
    return image_uuid


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    write_dir_meta(OUT)
    umap = load_uuid_map()
    frames = []

    for key, src_name in PANELS:
        src = SRC / src_name
        if not src.exists():
            raise SystemExit("missing source: {}".format(src))
        im = Image.open(src).convert("RGBA")
        resample = getattr(Image, "Resampling", Image).LANCZOS
        im = im.resize((OUT_W, OUT_H), resample)
        out_png = OUT / "{}.png".format(key)
        im.save(out_png, format="PNG", optimize=True)

        entry = umap.get(key, {})
        image_uuid = entry.get("texture") or str(uuid.uuid4())
        image_uuid = write_meta(out_png, image_uuid, key, OUT_W, OUT_H)
        sf = "{}@{}".format(image_uuid, SF_SUFFIX)
        umap[key] = {
            "texture": image_uuid,
            "spriteFrame": sf,
        }
        frames.append({"id": key, "spriteFrame": sf, "w": OUT_W, "h": OUT_H})
        print("wrote", out_png.name, image_uuid)

    save_uuid_map(umap)
    FRAMES_JSON.write_text(json.dumps({"panels": frames}, indent=2) + "\n", encoding="utf-8")

    lines = [
        "/** Auto-synced from tools/ui/story-intro-frames.json */",
        "export const STORY_INTRO_FRAMES = {",
        "  panels: [",
    ]
    for f in frames:
        lines.append('    {{ id: "{}", uuid: "{}", size: [{}, {}] as [number, number] }},'.format(
            f["id"], f["spriteFrame"], f["w"], f["h"]
        ))
    lines += [
        "  ],",
        "} as const;",
        "",
    ]
    FRAMES_TS.write_text("\n".join(lines), encoding="utf-8")
    print("updated", FRAMES_TS.relative_to(ROOT))


if __name__ == "__main__":
    main()
