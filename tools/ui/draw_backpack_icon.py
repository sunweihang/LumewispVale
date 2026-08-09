#!/usr/bin/env python3
"""LEGACY procedural backpack icon — prefer AI pipeline:

  python3 tools/ui/process_bag_ai.py

Source: tools/ui/ai-source/ic-backpack-ai-ref.png → assets/textures/ui/ic-backpack.png
"""

import json
import uuid
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "assets/textures/ui/ic-backpack.png"
UUID_MAP = Path(__file__).resolve().parent / "uuid-map.json"
TF = Path(__file__).resolve().parent / "tool-frames.json"
TEX_SUFFIX = "6c48a"
SF_SUFFIX = "f9941"


def draw_icon() -> Image.Image:
    """32×32 logical → NEAREST×3. Square body, hard corners (方方正正)."""
    s = 32
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    p = img.load()

    o = (36, 26, 16, 255)
    l0 = (108, 66, 34, 255)
    l1 = (158, 100, 52, 255)
    l2 = (198, 140, 80, 255)
    s0 = (86, 54, 28, 255)
    s1 = (130, 86, 48, 255)
    b0 = (168, 132, 48, 255)
    b1 = (230, 200, 96, 255)
    st = (72, 46, 24, 255)

    def put(x, y, c):
        if 0 <= x < s and 0 <= y < s:
            p[x, y] = c

    def fill_rect(x0, y0, x1, y1, c):
        for y in range(y0, y1 + 1):
            for x in range(x0, x1 + 1):
                put(x, y, c)

    # Square pack body — fills most of the cell, no taper / rounded feet.
    fill_rect(6, 8, 25, 27, l1)
    fill_rect(6, 8, 7, 27, l0)
    fill_rect(24, 8, 25, 27, l0)
    fill_rect(6, 26, 25, 27, l0)
    fill_rect(8, 9, 23, 10, l2)

    # Top flap — same width as body (square silhouette)
    fill_rect(6, 5, 25, 12, l1)
    fill_rect(7, 5, 24, 6, l2)
    fill_rect(6, 11, 25, 12, l0)

    # Flat top handle bar
    fill_rect(11, 2, 20, 4, s1)
    fill_rect(11, 2, 11, 4, s0)
    fill_rect(20, 2, 20, 4, s0)
    fill_rect(12, 1, 19, 1, s1)

    # Side strap blocks (square nubs, not tapered)
    fill_rect(4, 9, 5, 14, s1)
    fill_rect(4, 9, 4, 14, s0)
    fill_rect(26, 9, 27, 14, s1)
    fill_rect(27, 9, 27, 14, s0)
    fill_rect(5, 6, 5, 8, s0)
    fill_rect(26, 6, 26, 8, s0)

    # Gold clasp — diamond kept but centered on square flap
    put(15, 8, b1)
    put(16, 8, b1)
    put(14, 9, b1)
    put(15, 9, b0)
    put(16, 9, b0)
    put(17, 9, b1)
    put(15, 10, b1)
    put(16, 10, b1)

    # Front pocket — rectangular
    fill_rect(10, 16, 21, 24, l0)
    fill_rect(11, 17, 20, 23, l1)
    fill_rect(11, 17, 20, 17, l2)
    put(15, 20, st)
    put(16, 20, st)

    # Stitch dots across mid
    for x in range(9, 23, 2):
        put(x, 14, st)

    # Thick dark outline (2px) so the bare icon reads over foliage without a plate.
    for _ in range(2):
        opaque = [(x, y) for y in range(s) for x in range(s) if p[x, y][3] > 0]
        border = set()
        for x, y in opaque:
            for dx, dy in ((-1, 0), (1, 0), (0, -1), (0, 1)):
                nx, ny = x + dx, y + dy
                if not (0 <= nx < s and 0 <= ny < s) or p[nx, ny][3] == 0:
                    border.add((nx, ny))
        for x, y in border:
            if 0 <= x < s and 0 <= y < s and p[x, y][3] == 0:
                put(x, y, o)

    return img.resize((96, 96), Image.NEAREST)


def write_meta(png: Path, image_uuid: str, w: int, h: int) -> str:
    meta_path = Path(str(png) + ".meta")
    hw, hh = w / 2.0, h / 2.0
    if meta_path.exists():
        meta = json.loads(meta_path.read_text(encoding="utf-8"))
        image_uuid = meta.get("uuid", image_uuid)
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
                "displayName": "ic-backpack",
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
                "displayName": "ic-backpack",
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
    meta_path.write_text(json.dumps(meta, indent=2) + "\n", encoding="utf-8")
    return image_uuid


def main() -> None:
    OUT.parent.mkdir(parents=True, exist_ok=True)
    draw_icon().save(OUT)

    umap: dict = {}
    if UUID_MAP.exists():
        umap = json.loads(UUID_MAP.read_text(encoding="utf-8"))
    image_uuid = write_meta(OUT, umap.get("ic-backpack", {}).get("texture") or str(uuid.uuid4()), 96, 96)
    sf = "{}@{}".format(image_uuid, SF_SUFFIX)
    umap["ic-backpack"] = {"texture": image_uuid, "prefab": "", "spriteFrame": sf}
    UUID_MAP.write_text(json.dumps(umap, indent=2) + "\n", encoding="utf-8")

    tools = {}
    if TF.exists():
        tools = json.loads(TF.read_text(encoding="utf-8"))
    tools["backpack"] = sf
    # Keep bagTab entry if present (unused by HUD now) — do not wipe other keys.
    TF.write_text(json.dumps(tools, indent=2) + "\n", encoding="utf-8")
    (ROOT / "assets/scripts/game/ToolFrames.ts").write_text(
        "/** Auto-synced from tools/ui/tool-frames.json */\n"
        "export const TOOL_FRAMES = {}\n".format(json.dumps(tools, indent=4)),
        encoding="utf-8",
    )
    print("OK", OUT.relative_to(ROOT), sf)


if __name__ == "__main__":
    main()
