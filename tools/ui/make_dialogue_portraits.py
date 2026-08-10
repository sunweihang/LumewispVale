#!/usr/bin/env python3
"""Crop headshots from NPC/farmer idle frames → dialogue portrait sprites."""

import json
import uuid
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
CHARS = ROOT / "assets/textures/chars"
UI = ROOT / "assets/textures/ui"
UUID_MAP = Path(__file__).resolve().parent / "uuid-map.json"
FRAMES_JSON = Path(__file__).resolve().parent / "dialogue-portrait-frames.json"
OUT_TS = ROOT / "assets/scripts/game/DialoguePortraitFrames.ts"
TEX_SUFFIX = "6c48a"
SF_SUFFIX = "f9941"

# (folder, idle file stem) → portrait key
SOURCES = {
    "girl": ("girl", "girl-down-0"),
    "mayor": ("mayor", "mayor-down-0"),
    "carpenter": ("carpenter", "carpenter-down-0"),
    "passerby": ("passerby", "passerby-down-0"),
    "farmer": ("farmer", "farmer-down-0"),
}

OUT_SIZE = 96
# Head band from top of the 48×64 cell (includes hair + face + a hint of shoulders).
HEAD_H = 32


def write_meta(path: Path, image_uuid: str, display: str, w: int, h: int) -> str:
    meta_path = Path(str(path) + ".meta")
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
                    "packable": True,
                    "pixelsToUnit": 100,
                    "pivotX": 0.5,
                    "pivotY": 0.5,
                    "meshType": 0,
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
    meta_path.write_text(json.dumps(meta, indent=2) + "\n", encoding="utf-8")
    return image_uuid


def make_portrait(src: Path) -> Image.Image:
    im = Image.open(src).convert("RGBA")
    head = im.crop((0, 0, im.width, min(HEAD_H, im.height)))
    bbox = head.getbbox()
    if not bbox:
        raise RuntimeError("empty head crop: {}".format(src))
    head = head.crop(bbox)
    side = max(head.size[0], head.size[1])
    # Odd sides make centering awkward for pixel art — bump to even.
    if side % 2:
        side += 1
    sq = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    sq.paste(head, ((side - head.size[0]) // 2, (side - head.size[1]) // 2), head)
    k = max(1, OUT_SIZE // side)
    scaled = sq.resize((side * k, side * k), Image.NEAREST)
    canvas = Image.new("RGBA", (OUT_SIZE, OUT_SIZE), (0, 0, 0, 0))
    ox = (OUT_SIZE - scaled.size[0]) // 2
    oy = (OUT_SIZE - scaled.size[1]) // 2
    canvas.paste(scaled, (ox, oy), scaled)
    return canvas


def main() -> None:
    UI.mkdir(parents=True, exist_ok=True)
    umap: dict = {}
    if UUID_MAP.exists():
        umap = json.loads(UUID_MAP.read_text(encoding="utf-8"))

    frames = {}
    for key, (folder, stem) in SOURCES.items():
        src = CHARS / folder / "{}.png".format(stem)
        if not src.exists():
            raise SystemExit("missing {}".format(src))
        out = UI / "portrait-{}.png".format(key)
        make_portrait(src).save(out)
        map_key = "portrait-{}".format(key)
        image_uuid = umap.get(map_key, {}).get("texture") or str(uuid.uuid4())
        write_meta(out, image_uuid, map_key, OUT_SIZE, OUT_SIZE)
        sf = "{}@{}".format(image_uuid, SF_SUFFIX)
        umap[map_key] = {"texture": image_uuid, "prefab": "", "spriteFrame": sf}
        frames[key] = sf
        print("wrote", out.name, sf)

    UUID_MAP.write_text(json.dumps(umap, indent=2) + "\n", encoding="utf-8")
    FRAMES_JSON.write_text(json.dumps(frames, indent=2) + "\n", encoding="utf-8")
    OUT_TS.write_text(
        "/** Auto-synced from tools/ui/dialogue-portrait-frames.json */\n"
        "export const DIALOGUE_PORTRAIT_FRAMES = {} as const;\n".format(
            json.dumps(frames, indent=2)
        ),
        encoding="utf-8",
    )
    print("synced", OUT_TS.relative_to(ROOT))


if __name__ == "__main__":
    main()
