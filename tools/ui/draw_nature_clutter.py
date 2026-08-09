#!/usr/bin/env python3
"""Draw Stardew-like farm clutter: rocks, stump, weeds, log, pine, mailbox, bin."""

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
TEX_DIR = ROOT / "assets/textures/nature"
TEX_SUFFIX = "6c48a"
SF_SUFFIX = "f9941"


def uid():
    return str(uuid.uuid4())


def hex_to_rgb(h):
    h = h.lstrip("#")
    return int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)


def write_image_meta(png_path, image_uuid, w, h, name, pivot_y=0.0):
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


# Stardew-like stone: warm-neutral greys, top-left light, planted on dirt
STONE = (124, 126, 132)
STONE_LIGHT = (176, 178, 184)
STONE_HI = (210, 212, 216)
STONE_MID = (98, 100, 106)
STONE_DARK = (68, 70, 76)
STONE_LINE = (30, 32, 36)
STONE_SHADOW = (48, 40, 30)


def _paint_rows(img, rows, color, y0=0, x0=0):
    """rows: list of (x_start, x_end_inclusive) per scanline, or None to skip."""
    px = img.load()
    w, h = img.size
    for i, span in enumerate(rows):
        if not span:
            continue
        y = y0 + i
        if y < 0 or y >= h:
            continue
        if isinstance(span[0], tuple):
            spans = span
        else:
            spans = (span,)
        for x1, x2 in spans:
            for x in range(x0 + x1, x0 + x2 + 1):
                if 0 <= x < w:
                    px[x, y] = color


def _shade_if(img, pred, color):
    w, h = img.size
    px = img.load()
    for y in range(h):
        for x in range(w):
            if px[x, y][3] and pred(x, y, px[x, y]):
                px[x, y] = color


def _outline_body(img, line=STONE_LINE):
    w, h = img.size
    px = img.load()
    edge = []
    for y in range(h):
        for x in range(w):
            if px[x, y][3] == 0:
                continue
            for dy, dx in ((-1, 0), (1, 0), (0, -1), (0, 1)):
                xx, yy = x + dx, y + dy
                if xx < 0 or yy < 0 or xx >= w or yy >= h or px[xx, yy][3] == 0:
                    edge.append((x, y))
                    break
    for x, y in edge:
        px[x, y] = line + (255,)


def _put(img, points, color):
    px = img.load()
    w, h = img.size
    for x, y in points:
        if 0 <= x < w and 0 <= y < h and px[x, y][3]:
            px[x, y] = color


def _plant_shadow_rows(img, rows, y0):
    """Tuck opaque contact shadow under rock; never covers body."""
    px = img.load()
    w, h = img.size
    for i, span in enumerate(rows):
        if not span:
            continue
        y = y0 + i
        if y < 0 or y >= h:
            continue
        spans = span if isinstance(span[0], tuple) else (span,)
        for x1, x2 in spans:
            for x in range(x1, x2 + 1):
                if 0 <= x < w and px[x, y][3] == 0:
                    px[x, y] = STONE_SHADOW + (255,)


def draw_rock(w=48, h=40):
    """Small farm rock — flat potato boulder, wide feet, flush shadow."""
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    # Wide planted silhouette (wider than tall; no tip/teardrop).
    body = [
        None,
        None,
        None,
        None,
        None,
        None,
        None,
        None,
        None,
        (14, 32),
        (11, 35),
        (9, 37),
        (8, 38),
        (7, 39),
        (7, 40),
        (6, 40),
        (6, 41),
        (6, 41),
        (6, 41),
        (7, 41),
        (7, 40),
        (8, 40),
        (8, 39),
        (9, 38),
        (10, 37),
        (11, 36),
        (12, 35),
        (13, 34),
        (15, 32),
    ]
    _paint_rows(img, body, STONE + (255,))

    _shade_if(
        img,
        lambda x, y, c: 10 <= y <= 18 and x <= 30 and not (y >= 16 and x >= 28),
        STONE_LIGHT + (255,),
    )
    _put(img, [(17, 13), (18, 12), (19, 13)], STONE_HI + (255,))

    _shade_if(img, lambda x, y, c: x >= 33 and 14 <= y <= 28, STONE_MID + (255,))
    _shade_if(img, lambda x, y, c: y >= 25, STONE_DARK + (255,))

    # single ridge only — no salt-pepper grit
    _put(img, [(14, 19), (16, 20), (19, 20), (23, 19)], STONE_MID + (255,))

    _outline_body(img)
    # shadow hugs wide foot (body ends ~y=28)
    _plant_shadow_rows(
        img,
        [
            (12, 35),
            (10, 37),
            (12, 35),
            (14, 33),
        ],
        y0=27,
    )
    return img


def draw_rock_big(w=72, h=56):
    """Big boulder — lumpy wide mass, shadow flush with feet."""
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    # rear lobe
    rear = [
        None,
        None,
        None,
        None,
        None,
        (28, 50),
        (24, 54),
        (22, 56),
        (21, 58),
        (21, 59),
        (22, 59),
        (24, 58),
        (27, 56),
        (30, 53),
    ]
    _paint_rows(img, rear, STONE_MID + (255,), y0=6)
    # front — wide planted base (potato boulder, not teardrop)
    front = [
        None,
        None,
        None,
        None,
        None,
        None,
        None,
        None,
        None,
        (18, 50),
        (14, 56),
        (11, 60),
        (9, 62),
        (8, 63),
        (7, 64),
        (7, 65),
        (6, 65),
        (6, 65),
        (6, 65),
        (7, 65),
        (7, 64),
        (8, 64),
        (9, 63),
        (10, 62),
        (12, 60),
        (14, 58),
        (14, 58),
        (15, 57),
        (16, 56),
        (18, 54),
        (20, 52),
        (24, 48),
    ]
    _paint_rows(img, front, STONE + (255,), y0=6)

    _shade_if(
        img,
        lambda x, y, c: y <= 24 and x <= 44 and c[0] >= STONE[0] - 2,
        STONE_LIGHT + (255,),
    )
    _shade_if(
        img,
        lambda x, y, c: 12 <= y <= 20 and 32 <= x <= 56 and c[:3] == STONE_MID,
        STONE_LIGHT + (255,),
    )
    _put(img, [(24, 16), (25, 15), (26, 16), (38, 15)], STONE_HI + (255,))

    _shade_if(img, lambda x, y, c: x >= 52 and 18 <= y <= 42, STONE_MID + (255,))
    _shade_if(img, lambda x, y, c: y >= 38, STONE_DARK + (255,))

    # lobe seam + one ridge — deliberate, not noise
    _put(img, [(26, 28), (30, 30), (34, 30), (38, 28)], STONE_DARK + (255,))
    _put(img, [(20, 30), (44, 24)], STONE_MID + (255,))

    _outline_body(img)
    _plant_shadow_rows(
        img,
        [
            (14, 58),  # flush with body foot (~y37)
            (12, 60),
            (13, 59),
            (16, 56),
            (20, 52),
            (26, 46),
        ],
        y0=36,
    )
    return img


def draw_stump(w=56, h=48):
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    wood = (120, 78, 42)
    dark = (70, 44, 24)
    d.ellipse([8, 18, w - 8, h - 2], fill=dark + (255,))
    d.ellipse([10, 8, w - 10, 36], fill=wood + (255,), outline=(40, 24, 12, 255))
    d.ellipse([20, 14, w - 20, 30], fill=(160, 120, 70, 255), outline=dark + (255,))
    d.ellipse([28, 18, w - 28, 26], fill=(90, 56, 30, 255))
    return img


def draw_log(w=80, h=32):
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    wood = (110, 72, 40)
    dark = (60, 38, 20)
    d.ellipse([2, 6, w - 2, h - 2], fill=wood + (255,), outline=dark + (255,))
    d.ellipse([4, 8, 18, h - 4], fill=(150, 110, 70, 255), outline=dark + (255,))
    d.line([(24, 10), (24, h - 8)], fill=dark + (180,))
    d.line([(48, 12), (48, h - 10)], fill=dark + (160,))
    return img


def draw_weed(w=40, h=36, blossom=False):
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    leaf = (70, 140, 60)
    dark = (40, 90, 40)
    cx = w // 2
    for i, (dx, dy) in enumerate([(-8, -2), (8, -4), (0, -12), (-4, -8), (6, -10)]):
        d.ellipse(
            [cx + dx - 6, h + dy - 14, cx + dx + 6, h + dy - 2],
            fill=(leaf if i % 2 == 0 else dark) + (255,),
        )
    if blossom:
        for dx, dy in [(-6, -18), (4, -20), (0, -14)]:
            d.ellipse([cx + dx - 2, h + dy - 2, cx + dx + 2, h + dy + 2], fill=(220, 140, 180, 255))
    return img


def draw_pine(w=96, h=144):
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    trunk = (90, 60, 35)
    d.rectangle([w // 2 - 6, h - 36, w // 2 + 6, h - 4], fill=trunk + (255,))
    green = (40, 100, 55)
    dark = (25, 70, 40)
    layers = [(w // 2, 16, 28), (w // 2, 40, 36), (w // 2, 68, 44), (w // 2, 96, 50)]
    for cx, cy, half in layers:
        d.polygon(
            [(cx, cy), (cx - half, cy + 34), (cx + half, cy + 34)],
            fill=green + (255,),
            outline=(20, 40, 24, 255),
        )
        d.line([(cx - half // 2, cy + 20), (cx, cy + 8)], fill=dark + (200,))
    return img


def draw_mailbox(w=48, h=64):
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    post = (100, 70, 40)
    box = (180, 150, 90)
    d.rectangle([w // 2 - 3, 28, w // 2 + 3, h - 2], fill=post + (255,))
    d.rectangle([8, 8, w - 8, 36], fill=box + (255,), outline=(40, 30, 20, 255))
    d.rectangle([12, 14, w - 12, 28], fill=(60, 50, 40, 255))
    d.rectangle([w - 14, 18, w - 10, 30], fill=(200, 80, 60, 255))  # flag
    return img


def draw_shipping(w=96, h=80):
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    wood = (140, 95, 50)
    dark = (70, 45, 25)
    d.rectangle([8, 20, w - 8, h - 6], fill=wood + (255,), outline=(30, 20, 12, 255))
    d.rectangle([14, 8, w - 14, 28], fill=(160, 110, 60, 255), outline=(30, 20, 12, 255))
    for y in (36, 48, 60):
        d.line([(14, y), (w - 14, y)], fill=dark + (200,))
    d.rectangle([w // 2 - 10, 40, w // 2 + 10, 56], fill=dark + (255,))
    return img


# AI ingest (do not regenerate placeholders — they overwrite good sprites):
#   rocks  → process_rock_ai.py
#   stump / soft clutter → process_clutter_ai.py
#   oak/pine/bush/log/weed/fence/mailbox/shipping → process_farm_ai_v2.py
ITEMS = [
    # empty: keep functions above for reference / emergency only
]


def main():
    """UUID / NatureFrames sync only — PNGs come from AI ingest scripts."""
    print(
        "draw_nature_clutter: no PNG writes. "
        "Use process_rock_ai / process_clutter_ai / process_farm_ai_v2."
    )
    if not UUID_MAP.exists():
        return
    uuid_map = json.loads(UUID_MAP.read_text(encoding="utf-8"))
    nature = {}
    if (TOOLS / "nature-frames.json").exists():
        nature = json.loads((TOOLS / "nature-frames.json").read_text(encoding="utf-8"))
    key_to_id = {
        "rock": "nat-rock",
        "rockBig": "nat-rock-big",
        "stump": "nat-stump",
        "log": "nat-log",
        "weed": "nat-weed",
        "weedBloom": "nat-weed-bloom",
        "pine": "nat-tree-pine",
        "oak": "nat-tree-oak",
        "bush": "nat-bush",
        "mailbox": "prop-mailbox",
        "shipping": "prop-shipping",
        "fence": "prop-fence",
        "pebble": "nat-pebble",
        "twig": "nat-twig",
        "tuft": "nat-tuft",
        "weedTall": "nat-weed-tall",
        "weedPink": "nat-weed-pink",
        "fiber": "nat-fiber",
    }
    for key, item_id in key_to_id.items():
        if item_id in uuid_map and uuid_map[item_id].get("spriteFrame"):
            nature[key] = uuid_map[item_id]["spriteFrame"]
    (TOOLS / "nature-frames.json").write_text(
        json.dumps(nature, indent=2) + "\n", encoding="utf-8"
    )
    ts = (
        "/** Auto-synced from tools/ui/nature-frames.json */\n"
        "export const NATURE_FRAMES = {}\n".format(json.dumps(nature, indent=4))
    )
    (ROOT / "assets/scripts/game/NatureFrames.ts").write_text(ts, encoding="utf-8")
    print("Synced NatureFrames from uuid-map ({} keys)".format(len(nature)))


if __name__ == "__main__":
    main()
