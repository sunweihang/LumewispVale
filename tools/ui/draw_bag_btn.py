#!/usr/bin/env python3
"""LEGACY procedural plate — prefer AI pipeline:

  python3 tools/ui/process_bag_ai.py

Sources: tools/ui/ai-source/bag-btn-ai-ref.png → assets/textures/ui/ui-bag-btn.png
Kept only as a fallback regenerator if AI refs are missing.
"""

import json
import uuid
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "assets/textures/ui/ui-bag-btn.png"
UUID_MAP = Path(__file__).resolve().parent / "uuid-map.json"
TF = Path(__file__).resolve().parent / "tool-frames.json"
CATALOG = Path(__file__).resolve().parent / "catalog.json"
TEX_SUFFIX = "6c48a"
SF_SUFFIX = "f9941"

# Logical pixels → NEAREST ×3 (matches other 96×96 UI chrome).
LW = 32
SCALE = 3
OW = LW * SCALE
OH = LW * SCALE


def draw_plate() -> Image.Image:
    img = Image.new("RGBA", (LW, LW), (0, 0, 0, 0))
    p = img.load()

    # Outline / metal / felt — Stardew-warm, but hue-shifted from tan slots.
    o = (40, 28, 14, 255)
    brass_dk = (118, 78, 28, 255)
    brass = (176, 128, 48, 255)
    brass_hi = (230, 190, 96, 255)
    brass_hi2 = (245, 220, 140, 255)
    rivet = (92, 60, 24, 255)
    rivet_hi = (210, 170, 80, 255)
    # Dusk-ink velvet — clean recess; contrasts brass, brown pack, green world.
    felt_dk = (36, 44, 56, 255)
    felt = (52, 64, 82, 255)
    felt_hi = (72, 88, 110, 255)
    felt_mid = (60, 74, 94, 255)

    def put(x, y, c):
        if 0 <= x < LW and 0 <= y < LW:
            p[x, y] = c

    def in_soft_square(x, y, x0, y0, x1, y1, r):
        """Axis-aligned rounded rect (soft corners cut by radius r)."""
        if x < x0 or x > x1 or y < y0 or y > y1:
            return False
        # Corner disks
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

    # Soft-rounded silhouette (more circular than inventory slots).
    outer_r = 8
    for y in range(LW):
        for x in range(LW):
            if in_soft_square(x, y, 1, 1, 30, 30, outer_r):
                put(x, y, brass)

    # Raised brass bevel (top/left light, bottom/right dark).
    for y in range(LW):
        for x in range(LW):
            if p[x, y][3] == 0:
                continue
            edge_t = not in_soft_square(x, y - 1, 1, 1, 30, 30, outer_r)
            edge_l = not in_soft_square(x - 1, y, 1, 1, 30, 30, outer_r)
            edge_b = not in_soft_square(x, y + 1, 1, 1, 30, 30, outer_r)
            edge_r = not in_soft_square(x + 1, y, 1, 1, 30, 30, outer_r)
            if edge_t or edge_l:
                put(x, y, brass_hi)
            elif edge_b or edge_r:
                put(x, y, brass_dk)

    # Inner brass ring before soft felt well.
    for y in range(LW):
        for x in range(LW):
            if not in_soft_square(x, y, 4, 4, 27, 27, 7):
                continue
            if in_soft_square(x, y, 7, 7, 24, 24, 6):
                continue
            if y <= 6 or x <= 6:
                put(x, y, brass_hi2 if y == 4 or x == 4 else brass_hi)
            elif y >= 25 or x >= 25:
                put(x, y, brass_dk)
            else:
                put(x, y, brass)

    # Velvet face — smooth vertical falloff, no mottled noise.
    for y in range(LW):
        for x in range(LW):
            if in_soft_square(x, y, 7, 7, 24, 24, 6):
                if y <= 9:
                    c = felt_hi
                elif y <= 12:
                    c = felt_mid
                elif y >= 22:
                    c = felt_dk
                elif y >= 19:
                    c = felt
                else:
                    c = felt_mid
                put(x, y, c)

    # Soft inner rim (recessed well — dark top/left, soft lift bottom/right).
    for y in range(LW):
        for x in range(LW):
            if not in_soft_square(x, y, 7, 7, 24, 24, 6):
                continue
            on_edge = not in_soft_square(x, y, 8, 8, 23, 23, 5)
            if not on_edge:
                continue
            if y <= 9 or x <= 9:
                put(x, y, felt_dk)
            else:
                put(x, y, felt_hi)

    # Brass corner rivets (chunkier — badge language, not iron nails).
    for cx, cy in ((4, 4), (26, 4), (4, 26), (26, 26)):
        put(cx, cy, rivet)
        put(cx + 1, cy, rivet_hi)
        put(cx, cy + 1, rivet_hi)
        put(cx + 1, cy + 1, brass_hi)
        put(cx + 2, cy, brass_dk)
        put(cx, cy + 2, brass_dk)

    # Dark outline on transparent neighbors.
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

    return img.resize((OW, OH), Image.NEAREST)


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
                "displayName": "ui-bag-btn",
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
                "displayName": "ui-bag-btn",
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


def upsert_catalog(sf: str) -> None:
    if not CATALOG.exists():
        return
    cat = json.loads(CATALOG.read_text(encoding="utf-8"))
    entries = cat.get("entries") or cat.get("items") or []
    key = "entries" if "entries" in cat else ("items" if "items" in cat else None)
    entry = {
        "id": "ui-bag-btn",
        "kind": "chrome",
        "spriteType": "simple",
        "designSize": [OW, OH],
        "path": "assets/textures/ui/ui-bag-btn.png",
        "prefab": "",
        "layer": "UI",
        "spriteFrame": sf,
    }
    if key is None:
        return
    found = False
    for i, e in enumerate(cat[key]):
        if e.get("id") == "ui-bag-btn":
            cat[key][i] = {**e, **entry}
            found = True
            break
    if not found:
        cat[key].append(entry)
    CATALOG.write_text(json.dumps(cat, indent=2) + "\n", encoding="utf-8")


def main() -> None:
    OUT.parent.mkdir(parents=True, exist_ok=True)
    draw_plate().save(OUT)

    umap: dict = {}
    if UUID_MAP.exists():
        umap = json.loads(UUID_MAP.read_text(encoding="utf-8"))
    image_uuid = write_meta(OUT, umap.get("ui-bag-btn", {}).get("texture") or str(uuid.uuid4()), OW, OH)
    sf = "{}@{}".format(image_uuid, SF_SUFFIX)
    umap["ui-bag-btn"] = {"texture": image_uuid, "prefab": "", "spriteFrame": sf}
    UUID_MAP.write_text(json.dumps(umap, indent=2) + "\n", encoding="utf-8")

    tools = {}
    if TF.exists():
        tools = json.loads(TF.read_text(encoding="utf-8"))
    tools["bagBtn"] = sf
    TF.write_text(json.dumps(tools, indent=2) + "\n", encoding="utf-8")
    (ROOT / "assets/scripts/game/ToolFrames.ts").write_text(
        "/** Auto-synced from tools/ui/tool-frames.json */\n"
        "export const TOOL_FRAMES = {}\n".format(json.dumps(tools, indent=4)),
        encoding="utf-8",
    )
    upsert_catalog(sf)
    print("OK", OUT.relative_to(ROOT), "{}x{}".format(OW, OH), sf)


if __name__ == "__main__":
    main()
