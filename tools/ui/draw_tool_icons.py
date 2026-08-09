#!/usr/bin/env python3
"""LEGACY procedural fallback for farm tool icons.

Production path (AI):
  1) GenerateImage → tools/ui/ai-source/ic-*-ai-ref.png
  2) /usr/bin/python3 tools/ui/process_tool_icons_ai.py
"""

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

# Shared wood / metal palette (warm farm tools)
WD = (138, 86, 42, 255)
WD_HI = (186, 128, 64, 255)
WD_DK = (96, 56, 28, 255)
MT = (148, 154, 164, 255)
MT_HI = (196, 202, 210, 255)
MT_DK = (96, 102, 112, 255)
MT_EDGE = (72, 76, 84, 255)

TOOLS = ("hand", "hoe", "seeds", "can", "axe")


def put(p, s, x, y, c):
    if 0 <= x < s and 0 <= y < s:
        p[x, y] = c


def fill_rect(p, s, x0, y0, x1, y1, c):
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            put(p, s, x, y, c)


def fill_ellipse(p, s, cx, cy, rx, ry, c):
    for y in range(cy - ry, cy + ry + 1):
        for x in range(cx - rx, cx + rx + 1):
            nx = (x - cx) / max(1, rx)
            ny = (y - cy) / max(1, ry)
            if nx * nx + ny * ny <= 1.05:
                put(p, s, x, y, c)


def line(p, s, x0, y0, x1, y1, c, thick=2):
    steps = max(abs(x1 - x0), abs(y1 - y0), 1)
    for i in range(steps + 1):
        t = i / float(steps)
        x = int(round(x0 + (x1 - x0) * t))
        y = int(round(y0 + (y1 - y0) * t))
        for dy in range(thick):
            for dx in range(thick):
                put(p, s, x + dx, y + dy, c)


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


def draw_hand() -> Image.Image:
    """Work glove — mitten silhouette + thumb (hotbar hand tool)."""
    s = 32
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    p = img.load()

    glove = (232, 186, 142, 255)
    glove_hi = (248, 214, 176, 255)
    glove_dk = (196, 148, 108, 255)
    cuff = (180, 128, 88, 255)
    stitch = (160, 110, 74, 255)

    # Mitten body (reads clearer than separated fingers at 32px)
    fill_ellipse(p, s, 17, 15, 8, 10, glove)
    fill_rect(p, s, 10, 12, 24, 24, glove)
    fill_ellipse(p, s, 16, 12, 7, 6, glove_hi)
    fill_rect(p, s, 11, 13, 16, 20, glove_hi)
    fill_rect(p, s, 20, 18, 23, 24, glove_dk)

    # Soft finger tips (notched top)
    for x0 in (11, 14, 17, 20):
        put(p, s, x0, 7, glove_hi)
        put(p, s, x0 + 1, 7, glove)
        put(p, s, x0, 8, glove)
        put(p, s, x0 + 1, 8, glove)
        put(p, s, x0 + 1, 9, glove_dk)
    # knuckle stitches
    for x in (13, 16, 19):
        put(p, s, x, 14, stitch)

    # Thumb left
    fill_ellipse(p, s, 8, 16, 3, 4, glove)
    fill_ellipse(p, s, 7, 15, 2, 2, glove_hi)
    put(p, s, 6, 14, glove_hi)

    # Cuff
    fill_rect(p, s, 11, 24, 23, 27, cuff)
    fill_rect(p, s, 12, 24, 16, 24, glove_hi)
    put(p, s, 18, 25, stitch)

    outline_opaque(p, s)
    return img.resize((96, 96), Image.NEAREST)


def draw_hoe() -> Image.Image:
    """Garden hoe — long haft + clear L-blade (not an axe)."""
    s = 32
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    p = img.load()

    # Handle bottom-left → upper-center
    line(p, s, 7, 26, 16, 12, WD, thick=3)
    steps = 16
    for i in range(steps + 1):
        t = i / float(steps)
        x = int(round(7 + (16 - 7) * t))
        y = int(round(26 + (12 - 26) * t))
        put(p, s, x, y, WD_HI)
        put(p, s, x + 2, y + 1, WD_DK)

    # Ferrule
    fill_rect(p, s, 14, 10, 18, 13, WD_DK)
    put(p, s, 15, 10, WD_HI)

    # Blade: wide horizontal bar + deep downturn (classic hoe)
    fill_rect(p, s, 12, 6, 26, 9, MT)
    fill_rect(p, s, 13, 6, 25, 6, MT_HI)
    fill_rect(p, s, 13, 9, 25, 9, MT_DK)
    # neck up from haft
    fill_rect(p, s, 15, 8, 18, 11, MT)
    put(p, s, 16, 8, MT_HI)
    # downturned cutting face (right)
    fill_rect(p, s, 24, 9, 27, 16, MT)
    fill_rect(p, s, 25, 10, 27, 15, MT_DK)
    put(p, s, 24, 10, MT_HI)
    put(p, s, 26, 16, MT_EDGE)

    outline_opaque(p, s)
    return img.resize((96, 96), Image.NEAREST)


def draw_seeds() -> Image.Image:
    """Seed packet — paper pouch + sprout label."""
    s = 32
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    p = img.load()

    bag = (214, 176, 128, 255)
    bag_hi = (236, 206, 160, 255)
    bag_dk = (176, 132, 88, 255)
    label = (244, 228, 190, 255)
    soil = (120, 78, 40, 255)
    leaf = (86, 160, 64, 255)
    leaf_hi = (130, 196, 90, 255)
    leaf_dk = (54, 112, 42, 255)
    fold = (196, 150, 104, 255)

    # Packet body
    fill_rect(p, s, 8, 6, 23, 26, bag)
    fill_rect(p, s, 9, 7, 12, 24, bag_hi)
    fill_rect(p, s, 20, 10, 22, 25, bag_dk)
    fill_rect(p, s, 10, 24, 21, 25, bag_dk)

    # Folded top
    fill_rect(p, s, 8, 6, 23, 10, bag_hi)
    fill_rect(p, s, 9, 9, 22, 10, fold)
    # crinkle notches
    put(p, s, 10, 6, fold)
    put(p, s, 14, 5, bag_hi)
    put(p, s, 18, 6, fold)
    put(p, s, 21, 5, bag)

    # Label inset
    fill_rect(p, s, 11, 13, 20, 22, label)
    fill_rect(p, s, 12, 14, 13, 21, bag_dk)  # inset shade L
    fill_rect(p, s, 12, 14, 19, 14, bag_dk)

    # Soil mound + sprout
    fill_ellipse(p, s, 15, 20, 4, 2, soil)
    put(p, s, 15, 18, leaf_dk)
    put(p, s, 15, 17, leaf)
    put(p, s, 15, 16, leaf_hi)
    # left leaf
    put(p, s, 13, 16, leaf)
    put(p, s, 12, 15, leaf_hi)
    put(p, s, 13, 15, leaf_hi)
    put(p, s, 14, 16, leaf_dk)
    # right leaf
    put(p, s, 17, 16, leaf)
    put(p, s, 18, 15, leaf_hi)
    put(p, s, 17, 15, leaf_hi)
    put(p, s, 16, 16, leaf_dk)

    outline_opaque(p, s)
    return img.resize((96, 96), Image.NEAREST)


def draw_can() -> Image.Image:
    """Watering can — blue body, wood top handle, rose spout."""
    s = 32
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    p = img.load()

    body = (74, 138, 186, 255)
    body_hi = (130, 186, 220, 255)
    body_dk = (48, 96, 138, 255)
    rose = (196, 168, 110, 255)
    rose_dk = (148, 118, 70, 255)
    hole = (80, 60, 40, 255)

    # Body drum
    fill_ellipse(p, s, 17, 18, 7, 7, body)
    fill_rect(p, s, 10, 14, 24, 22, body)
    fill_rect(p, s, 11, 15, 15, 19, body_hi)
    fill_rect(p, s, 20, 18, 23, 22, body_dk)
    fill_ellipse(p, s, 17, 22, 7, 3, body_dk)
    # rim
    fill_rect(p, s, 11, 13, 23, 14, body_hi)
    put(p, s, 12, 13, (210, 230, 240, 255))

    # Top wood handle arch
    for x, y in (
        (12, 10),
        (13, 8),
        (14, 7),
        (15, 6),
        (16, 6),
        (17, 6),
        (18, 6),
        (19, 7),
        (20, 8),
        (21, 10),
    ):
        put(p, s, x, y, WD)
        put(p, s, x, y + 1, WD_DK)
    put(p, s, 15, 6, WD_HI)
    put(p, s, 16, 6, WD_HI)
    # mounts
    put(p, s, 12, 12, MT_DK)
    put(p, s, 21, 12, MT_DK)

    # Side grip
    fill_rect(p, s, 24, 15, 26, 20, body)
    put(p, s, 26, 16, body_hi)
    put(p, s, 26, 19, body_dk)
    put(p, s, 25, 15, body_hi)

    # Spout → rose (left-up)
    line(p, s, 10, 17, 5, 12, body_dk, thick=2)
    put(p, s, 9, 16, body_hi)
    put(p, s, 7, 14, body)
    # Rose head
    fill_ellipse(p, s, 5, 11, 3, 3, rose)
    fill_ellipse(p, s, 5, 10, 2, 2, rose_dk)
    for hx, hy in ((4, 10), (5, 11), (6, 10), (5, 9)):
        put(p, s, hx, hy, hole)

    outline_opaque(p, s)
    return img.resize((96, 96), Image.NEAREST)


def draw_axe() -> Image.Image:
    """Chopping axe — diagonal haft + flared cutting blade."""
    s = 32
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    p = img.load()

    # Haft
    line(p, s, 7, 25, 17, 13, WD, thick=3)
    steps = 14
    for i in range(steps + 1):
        t = i / float(steps)
        x = int(round(7 + (17 - 7) * t))
        y = int(round(25 + (13 - 25) * t))
        put(p, s, x, y, WD_HI)
        put(p, s, x + 2, y + 1, WD_DK)
        if i in (3, 7, 11):
            put(p, s, x + 1, y + 1, WD_DK)

    # Socket + wood tip through head
    fill_rect(p, s, 15, 10, 19, 14, MT_DK)
    put(p, s, 16, 11, MT)
    put(p, s, 17, 9, WD)
    put(p, s, 18, 9, WD_HI)

    # Flared axe head (wide cutting face on the right)
    # poll (back)
    fill_rect(p, s, 14, 8, 17, 15, MT_DK)
    put(p, s, 15, 9, MT)
    # cheeks → edge
    fill_rect(p, s, 17, 7, 22, 16, MT)
    fill_rect(p, s, 18, 7, 21, 8, MT_HI)
    fill_rect(p, s, 18, 15, 21, 16, MT_DK)
    # flared bit
    fill_rect(p, s, 22, 6, 27, 17, MT)
    fill_rect(p, s, 23, 6, 26, 7, MT_HI)
    fill_rect(p, s, 23, 16, 26, 17, MT_DK)
    fill_rect(p, s, 26, 8, 28, 15, MT_EDGE)
    put(p, s, 27, 10, MT_HI)
    put(p, s, 28, 11, MT_HI)
    put(p, s, 28, 12, MT)

    outline_opaque(p, s)
    return img.resize((96, 96), Image.NEAREST)


DRAWERS = {
    "hand": draw_hand,
    "hoe": draw_hoe,
    "seeds": draw_seeds,
    "can": draw_can,
    "axe": draw_axe,
}


def write_meta(png: Path, image_uuid: str, display: str, w: int, h: int) -> str:
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


def sync_catalog(frames: dict) -> None:
    if not CATALOG.exists():
        return
    cat = json.loads(CATALOG.read_text(encoding="utf-8"))
    entries = cat.get("entries") or cat.get("items") or []
    if not isinstance(entries, list):
        return
    by_id = {e.get("id"): e for e in entries if isinstance(e, dict)}
    for key, sf in frames.items():
        eid = "ic-{}".format(key)
        path = "assets/textures/ui/{}.png".format(eid)
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
                    "tags": ["tool", key],
                }
            )
    CATALOG.write_text(json.dumps(cat, indent=2) + "\n", encoding="utf-8")


def main() -> None:
    UI.mkdir(parents=True, exist_ok=True)
    umap: dict = {}
    if UUID_MAP.exists():
        umap = json.loads(UUID_MAP.read_text(encoding="utf-8"))

    frames = {}
    for key in TOOLS:
        out = UI / "ic-{}.png".format(key)
        DRAWERS[key]().save(out)
        image_uuid = write_meta(
            out,
            umap.get("ic-{}".format(key), {}).get("texture") or str(uuid.uuid4()),
            "ic-{}".format(key),
            96,
            96,
        )
        sf = "{}@{}".format(image_uuid, SF_SUFFIX)
        umap["ic-{}".format(key)] = {"texture": image_uuid, "prefab": "", "spriteFrame": sf}
        frames[key] = sf
        print("OK", out.relative_to(ROOT), sf)

    UUID_MAP.write_text(json.dumps(umap, indent=2) + "\n", encoding="utf-8")

    # Merge into tool-frames (preserve slot/backpack/etc.)
    tools = {}
    if TF.exists():
        tools = json.loads(TF.read_text(encoding="utf-8"))
    ordered = {}
    for k in TOOLS:
        ordered[k] = frames[k]
    for k, v in tools.items():
        if k not in ordered:
            ordered[k] = v
    TF.write_text(json.dumps(ordered, indent=2) + "\n", encoding="utf-8")
    OUT_TS.write_text(
        "/** Auto-synced from tools/ui/tool-frames.json */\n"
        "export const TOOL_FRAMES = {}\n".format(json.dumps(ordered, indent=4)),
        encoding="utf-8",
    )
    sync_catalog(frames)


if __name__ == "__main__":
    main()
