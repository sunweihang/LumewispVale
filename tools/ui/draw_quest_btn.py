#!/usr/bin/env python3
"""Pixel quest HUD badge — same 96×96 language as ui-bag-btn (wood plate + glyph).

  C:/Users/elex/scoop/apps/python310/current/python.exe tools/ui/draw_quest_btn.py

Writes assets/textures/ui/ui-quest-btn.png and registers QUEST_FRAMES.questBtn.
"""
from __future__ import print_function

import json
import uuid
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "assets/textures/ui/ui-quest-btn.png"
UUID_MAP = Path(__file__).resolve().parent / "uuid-map.json"
QUEST_FRAMES = Path(__file__).resolve().parent / "quest-frames.json"
CATALOG = Path(__file__).resolve().parent / "catalog.json"
OUT_TS = ROOT / "assets/scripts/game/QuestFrames.ts"
TEX_SUFFIX = "6c48a"
SF_SUFFIX = "f9941"

LW = 32
SCALE = 3
OW = LW * SCALE
OH = LW * SCALE

try:
    RESAMPLE = Image.Resampling.NEAREST
except AttributeError:
    RESAMPLE = Image.NEAREST


def draw_badge():
    """Warm wood plate (bag-btn palette) + rolled scroll glyph."""
    img = Image.new("RGBA", (LW, LW), (0, 0, 0, 0))
    p = img.load()

    o = (28, 20, 14, 255)
    wood = (217, 155, 62, 255)
    wood_hi = (230, 171, 72, 255)
    wood_dk = (166, 80, 20, 255)
    wood_deep = (116, 71, 20, 255)
    ink = (56, 25, 6, 255)
    parch = (245, 228, 186, 255)
    parch_dk = (210, 178, 120, 255)
    ribbon = (120, 62, 28, 255)
    leaf = (90, 150, 60, 255)
    leaf_hi = (140, 190, 80, 255)

    def put(x, y, c):
        if 0 <= x < LW and 0 <= y < LW:
            p[x, y] = c

    def in_soft_square(x, y, x0, y0, x1, y1, r):
        if x < x0 or x > x1 or y < y0 or y > y1:
            return False
        corners = (
            (x0 + r, y0 + r, x <= x0 + r and y <= y0 + r),
            (x1 - r, y0 + r, x >= x1 - r and y <= y0 + r),
            (x0 + r, y1 - r, x <= x0 + r and y >= y1 - r),
            (x1 - r, y1 - r, x >= x1 - r and y >= y1 - r),
        )
        for cx, cy, active in corners:
            if active:
                return (x - cx) * (x - cx) + (y - cy) * (y - cy) <= r * r + 1
        return True

    outer_r = 8
    for y in range(LW):
        for x in range(LW):
            if in_soft_square(x, y, 1, 1, 30, 30, outer_r):
                put(x, y, wood)

    # Bevel
    for y in range(LW):
        for x in range(LW):
            if p[x, y][3] == 0:
                continue
            edge_t = not in_soft_square(x, y - 1, 1, 1, 30, 30, outer_r)
            edge_l = not in_soft_square(x - 1, y, 1, 1, 30, 30, outer_r)
            edge_b = not in_soft_square(x, y + 1, 1, 1, 30, 30, outer_r)
            edge_r = not in_soft_square(x + 1, y, 1, 1, 30, 30, outer_r)
            if edge_t or edge_l:
                put(x, y, wood_hi)
            elif edge_b or edge_r:
                put(x, y, wood_dk)

    # Inner recess (matches bag felt well, but warm wood)
    for y in range(LW):
        for x in range(LW):
            if in_soft_square(x, y, 6, 6, 25, 25, 6):
                if y <= 9 or x <= 8:
                    put(x, y, wood_deep)
                elif y >= 22 or x >= 23:
                    put(x, y, wood_dk)
                else:
                    put(x, y, (190, 120, 48, 255))

    # --- Scroll glyph (center) ---
    # Roll body
    for y in range(9, 24):
        for x in range(11, 21):
            put(x, y, parch if (x + y) % 5 else parch_dk)
    # Dark outline of scroll
    for y in range(8, 25):
        put(10, y, ink)
        put(21, y, ink)
    for x in range(10, 22):
        put(x, 8, ink)
        put(x, 24, ink)
    # Roll cylinders top/bottom
    for x in range(9, 23):
        put(x, 7, parch_dk)
        put(x, 6, ink)
        put(x, 25, parch_dk)
        put(x, 26, ink)
    put(9, 7, ink)
    put(22, 7, ink)
    put(9, 25, ink)
    put(22, 25, ink)
    # Ribbon
    for x in range(12, 20):
        put(x, 15, ribbon)
        put(x, 16, ribbon)
    put(15, 14, ribbon)
    put(16, 14, ribbon)
    put(15, 17, ribbon)
    put(16, 17, ribbon)
    # Green leaf tuck (bag-language accent)
    put(20, 12, leaf)
    put(21, 11, leaf_hi)
    put(21, 12, leaf)
    put(22, 12, leaf)
    put(21, 13, leaf)

    # Corner rivets (same language as bag badge)
    for cx, cy in ((4, 4), (26, 4), (4, 26), (26, 26)):
        put(cx, cy, ink)
        put(cx + 1, cy, wood_hi)
        put(cx, cy + 1, wood_hi)
        put(cx + 1, cy + 1, (210, 170, 80, 255))

    # Outer outline on transparent neighbors
    opaque = [(x, y) for y in range(LW) for x in range(LW) if p[x, y][3] > 0]
    border = set()
    for x, y in opaque:
        for dx, dy in ((-1, 0), (1, 0), (0, -1), (0, 1)):
            nx, ny = x + dx, y + dy
            if not (0 <= nx < LW and 0 <= ny < LW) or p[nx, ny][3] == 0:
                border.add((nx, ny))
    for x, y in border:
        if 0 <= x < LW and 0 <= y < LW and p[x, y][3] == 0:
            put(x, y, o)

    return img.resize((OW, OH), RESAMPLE)


def write_meta(png, image_uuid, w, h):
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
                "displayName": "ui-quest-btn",
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
                "displayName": "ui-quest-btn",
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


def patch_quest_frames(sf):
    data = {}
    if QUEST_FRAMES.exists():
        data = json.loads(QUEST_FRAMES.read_text(encoding="utf-8"))
    data["questBtn"] = {"spriteFrame": sf, "w": OW, "h": OH, "file": "ui-quest-btn"}
    QUEST_FRAMES.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")

    # Keep QUEST_LAYOUT / prefab uuid from existing TS if present.
    layout_block = ""
    prefab_uuid = "80815e00-313f-4257-93fa-95aa89a25f45"
    if OUT_TS.exists():
        text = OUT_TS.read_text(encoding="utf-8")
        if "QUEST_LAYOUT" in text:
            layout_block = text.split("/** Prefab layout")[1] if "/** Prefab layout" in text else ""
            # re-read full layout export
            idx = text.find("export const QUEST_LAYOUT")
            if idx >= 0:
                layout_block = text[idx:]
        if "QUEST_PANEL_PREFAB_UUID" in text:
            for line in text.splitlines():
                if "QUEST_PANEL_PREFAB_UUID" in line and "'" in line:
                    prefab_uuid = line.split("'")[1]
                    break

    lines = [
        "/** Auto-generated by tools/ui — do not edit by hand. */",
        "export const QUEST_FRAMES = {",
    ]
    for k, v in data.items():
        sfv = v["spriteFrame"] if isinstance(v, dict) else v
        lines.append("    {}: '{}',".format(k, sfv))
    lines.append("} as const;")
    lines.append("")
    lines.append("/** Prefab asset uuid — layout source of truth. */")
    lines.append("export const QUEST_PANEL_PREFAB_UUID = '{}';".format(prefab_uuid))
    lines.append("")
    if layout_block:
        if not layout_block.startswith("export"):
            lines.append("/** Prefab layout (panel-local px). Keep in sync with generate_quest_panel_prefab.py */")
        lines.append(layout_block.rstrip())
        lines.append("")
    OUT_TS.write_text("\n".join(lines), encoding="utf-8")


def main():
    OUT.parent.mkdir(parents=True, exist_ok=True)
    draw_badge().save(OUT)

    umap = {}
    if UUID_MAP.exists():
        umap = json.loads(UUID_MAP.read_text(encoding="utf-8"))
    image_uuid = write_meta(
        OUT, umap.get("ui-quest-btn", {}).get("texture") or str(uuid.uuid4()), OW, OH
    )
    sf = "{}@{}".format(image_uuid, SF_SUFFIX)
    umap["ui-quest-btn"] = {"texture": image_uuid, "spriteFrame": sf}
    UUID_MAP.write_text(json.dumps(umap, indent=2) + "\n", encoding="utf-8")
    patch_quest_frames(sf)
    print("OK", OUT.relative_to(ROOT), "{}x{}".format(OW, OH), sf)


if __name__ == "__main__":
    main()
