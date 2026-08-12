#!/usr/bin/env python3
"""Draw Stardew-like recipe scroll icon → assets/textures/ui/ic-recipe.png.

Transparent item glyph (no wood plate) for bag / fly FX — same language as ic-boost.
Registers TOOL_FRAMES.recipeScroll.
"""

from __future__ import print_function

import json
import uuid
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
UI = ROOT / "assets/textures/ui"
UUID_MAP = Path(__file__).resolve().parent / "uuid-map.json"
TF = Path(__file__).resolve().parent / "tool-frames.json"
CATALOG = Path(__file__).resolve().parent / "catalog.json"
OUT_TS = ROOT / "assets/scripts/game/ToolFrames.ts"
TEX_SUFFIX = "6c48a"
SF_SUFFIX = "f9941"
OUTLINE = (40, 28, 18, 255)


def put(p, s, x, y, c):
    if 0 <= x < s and 0 <= y < s:
        p[x, y] = c


def fill_rect(p, s, x0, y0, x1, y1, c):
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            put(p, s, x, y, c)


def outline_opaque(p, s, color=OUTLINE):
    opaque = [(x, y) for y in range(s) for x in range(s) if p[x, y][3] > 0]
    border = set()
    for x, y in opaque:
        for dx, dy in ((-1, 0), (1, 0), (0, -1), (0, 1)):
            nx, ny = x + dx, y + dy
            if not (0 <= nx < s and 0 <= ny < s) or p[nx, ny][3] == 0:
                border.add((nx, ny))
    for x, y in border:
        if 0 <= x < s and 0 <= y < s and p[x, y][3] == 0:
            put(p, s, x, y, color)


def draw_recipe() -> Image.Image:
    """Rolled parchment scroll with ribbon — readable at bag cell size."""
    s = 32
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    p = img.load()

    parch = (245, 228, 186, 255)
    parch_hi = (252, 242, 210, 255)
    parch_dk = (210, 178, 120, 255)
    parch_deep = (180, 148, 96, 255)
    ribbon = (140, 68, 36, 255)
    ribbon_hi = (180, 96, 48, 255)
    seal = (210, 160, 56, 255)
    seal_hi = (240, 200, 90, 255)
    ink = (70, 42, 22, 255)
    leaf = (90, 150, 60, 255)
    leaf_hi = (140, 190, 80, 255)

    # Scroll body (vertical roll)
    fill_rect(p, s, 10, 7, 21, 24, parch)
    for y in range(8, 24):
        for x in range(11, 21):
            if (x + y) % 6 == 0:
                put(p, s, x, y, parch_dk)
    # Highlight strip
    fill_rect(p, s, 11, 8, 13, 23, parch_hi)
    # Shadow strip
    fill_rect(p, s, 19, 8, 20, 23, parch_dk)

    # Top / bottom cylinders
    fill_rect(p, s, 8, 5, 23, 7, parch_dk)
    fill_rect(p, s, 9, 4, 22, 5, parch)
    fill_rect(p, s, 9, 6, 22, 6, parch_hi)
    fill_rect(p, s, 8, 24, 23, 26, parch_dk)
    fill_rect(p, s, 9, 25, 22, 26, parch_deep)
    fill_rect(p, s, 9, 24, 22, 24, parch)

    # Cylinder end caps
    for x, y in ((8, 5), (23, 5), (8, 25), (23, 25)):
        put(p, s, x, y, ink)

    # Recipe lines (tiny ink marks)
    fill_rect(p, s, 13, 10, 18, 10, ink)
    fill_rect(p, s, 13, 12, 17, 12, ink)
    fill_rect(p, s, 13, 14, 18, 14, ink)

    # Ribbon band
    fill_rect(p, s, 11, 16, 20, 18, ribbon)
    fill_rect(p, s, 12, 16, 19, 16, ribbon_hi)
    put(p, s, 15, 17, seal)
    put(p, s, 16, 17, seal_hi)

    # Leaf tuck
    put(p, s, 20, 13, leaf)
    put(p, s, 21, 12, leaf_hi)
    put(p, s, 21, 13, leaf)
    put(p, s, 22, 13, leaf)

    outline_opaque(p, s)
    return img.resize((96, 96), Image.NEAREST)


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


def main() -> None:
    UI.mkdir(parents=True, exist_ok=True)
    umap = {}
    if UUID_MAP.exists():
        umap = json.loads(UUID_MAP.read_text(encoding="utf-8"))

    out = UI / "ic-recipe.png"
    draw_recipe().save(out)
    image_uuid = write_meta(
        out,
        umap.get("ic-recipe", {}).get("texture") or str(uuid.uuid4()),
        "ic-recipe",
        96,
        96,
    )
    sf = "{}@{}".format(image_uuid, SF_SUFFIX)
    umap["ic-recipe"] = {"texture": image_uuid, "prefab": "", "spriteFrame": sf}
    UUID_MAP.write_text(json.dumps(umap, indent=2) + "\n", encoding="utf-8")

    tools = {}
    if TF.exists():
        tools = json.loads(TF.read_text(encoding="utf-8"))
    tools["recipeScroll"] = sf
    # Stable key order for readable diffs
    preferred = (
        "hand",
        "hoe",
        "seeds",
        "can",
        "axe",
        "rod",
        "boost",
        "recipeScroll",
        "slot",
        "backpack",
        "bagTab",
        "close",
        "bagBtn",
        "adVideo",
        "craftBtn",
    )
    ordered = {}
    for k in preferred:
        if k in tools:
            ordered[k] = tools[k]
    for k, v in tools.items():
        if k not in ordered:
            ordered[k] = v
    TF.write_text(json.dumps(ordered, indent=2) + "\n", encoding="utf-8")
    OUT_TS.write_text(
        "/** Auto-synced from tools/ui/tool-frames.json */\n"
        "export const TOOL_FRAMES = {}\n".format(json.dumps(ordered, indent=4)),
        encoding="utf-8",
    )

    if CATALOG.exists():
        cat = json.loads(CATALOG.read_text(encoding="utf-8"))
        entries = cat.get("entries") or cat.get("items") or []
        if isinstance(entries, list):
            by_id = {e.get("id"): e for e in entries if isinstance(e, dict)}
            eid = "ic-recipe"
            path = "assets/textures/ui/ic-recipe.png"
            if eid in by_id:
                by_id[eid]["path"] = path
                by_id[eid]["spriteFrame"] = sf
            else:
                entries.append(
                    {
                        "id": eid,
                        "kind": "icon",
                        "group": "tool",
                        "path": path,
                        "spriteFrame": sf,
                        "size": [96, 96],
                        "tags": ["recipe", "scroll"],
                    }
                )
            CATALOG.write_text(json.dumps(cat, indent=2) + "\n", encoding="utf-8")

    print("OK", out.relative_to(ROOT), sf)


if __name__ == "__main__":
    main()
