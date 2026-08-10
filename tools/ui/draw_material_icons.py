#!/usr/bin/env python3
"""LEGACY procedural material icons — prefer AI pipeline:

  /usr/local/bin/python3 tools/ui/process_material_icons_ai.py

Sources: tools/ui/ai-source/ic-{wood,grass,dirt,stone}-ai-ref.png
"""

import json
import uuid
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
UI = ROOT / "assets/textures/ui"
UUID_MAP = Path(__file__).resolve().parent / "uuid-map.json"
MF = Path(__file__).resolve().parent / "material-frames.json"
CATALOG = Path(__file__).resolve().parent / "catalog.json"
OUT_TS = ROOT / "assets/scripts/game/MaterialFrames.ts"
TEX_SUFFIX = "6c48a"
SF_SUFFIX = "f9941"

OUTLINE = (40, 28, 18, 255)

MATERIALS = ("wood", "grass", "dirt", "stone", "fish")


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


def draw_wood() -> Image.Image:
    """Three short cut logs stacked — readable wood pile, not a fallen branch log."""
    s = 32
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    p = img.load()

    bark = (122, 72, 34, 255)
    bark_dk = (86, 48, 22, 255)
    bark_hi = (168, 108, 52, 255)
    end = (214, 176, 104, 255)
    end_hi = (236, 206, 140, 255)
    ring = (150, 108, 58, 255)

    def log(x0, y0, w, h, end_left: bool):
        fill_rect(p, s, x0, y0, x0 + w, y0 + h, bark)
        fill_rect(p, s, x0, y0, x0 + w, y0, bark_hi)
        fill_rect(p, s, x0, y0 + h, x0 + w, y0 + h, bark_dk)
        # bark grooves
        for gx in range(x0 + 2, x0 + w - 1, 3):
            put(p, s, gx, y0 + 1, bark_dk)
            put(p, s, gx + 1, y0 + h - 1, bark_hi)
        # cut face
        if end_left:
            fill_ellipse(p, s, x0 + 1, y0 + h // 2, 2, max(2, h // 2), end)
            put(p, s, x0 + 1, y0 + h // 2, ring)
            put(p, s, x0, y0 + h // 2, end_hi)
        else:
            fill_ellipse(p, s, x0 + w - 1, y0 + h // 2, 2, max(2, h // 2), end)
            put(p, s, x0 + w - 1, y0 + h // 2, ring)
            put(p, s, x0 + w, y0 + h // 2, end_hi)

    log(5, 18, 18, 6, True)
    log(8, 12, 17, 6, False)
    log(6, 6, 16, 6, True)

    outline_opaque(p, s)
    return img.resize((96, 96), Image.NEAREST)


def draw_grass() -> Image.Image:
    """Fiber / forage tuft — green blades tied, Stardew fiber vibe."""
    s = 32
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    p = img.load()

    leaf = (74, 148, 58, 255)
    leaf_hi = (122, 196, 86, 255)
    leaf_dk = (42, 96, 36, 255)
    tip = (168, 214, 96, 255)
    twine = (170, 118, 48, 255)
    twine_dk = (120, 78, 30, 255)

    # Blades rising from a small base
    blades = [
        (12, 24, 10, 6, leaf_dk),
        (14, 23, 8, 5, leaf),
        (16, 24, 7, 4, leaf_hi),
        (18, 23, 9, 6, leaf),
        (20, 24, 8, 5, leaf_dk),
        (15, 22, 6, 3, tip),
        (19, 21, 5, 4, tip),
    ]
    for x0, y0, h, bend, c in blades:
        for i in range(h):
            x = x0 + (1 if i > h // 2 else 0) * (1 if bend % 2 == 0 else -1)
            put(p, s, x, y0 - i, c)
            put(p, s, x + 1, y0 - i, c)

    # Extra soft blades
    for x, y in ((11, 18), (13, 15), (17, 14), (21, 16), (23, 19)):
        put(p, s, x, y, leaf_hi)
        put(p, s, x, y - 1, tip)

    # Twine wrap mid-bundle
    fill_rect(p, s, 13, 20, 21, 21, twine)
    put(p, s, 13, 20, twine_dk)
    put(p, s, 21, 21, twine_dk)

    outline_opaque(p, s)
    return img.resize((96, 96), Image.NEAREST)


def draw_dirt() -> Image.Image:
    """Clump of tilled soil — golden ochre mound, not a flat tile square."""
    s = 32
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    p = img.load()

    soil = (186, 132, 48, 255)
    soil_hi = (220, 168, 72, 255)
    soil_dk = (138, 92, 34, 255)
    soil_deep = (104, 68, 28, 255)
    speck = (160, 110, 40, 255)
    pebble = (120, 112, 96, 255)
    pebble_hi = (168, 160, 140, 255)

    # Irregular mound (stacked ellipses)
    fill_ellipse(p, s, 16, 20, 11, 7, soil_dk)
    fill_ellipse(p, s, 16, 17, 10, 7, soil)
    fill_ellipse(p, s, 15, 14, 8, 5, soil_hi)
    # Clods
    fill_ellipse(p, s, 10, 18, 3, 2, soil_deep)
    fill_ellipse(p, s, 22, 19, 3, 2, soil_dk)
    fill_ellipse(p, s, 18, 12, 3, 2, soil_hi)
    # Speckle texture
    for x, y in (
        (12, 15),
        (14, 18),
        (17, 16),
        (19, 20),
        (21, 15),
        (9, 20),
        (15, 21),
        (13, 12),
        (20, 17),
    ):
        put(p, s, x, y, speck)
    # Tiny pebbles in the clump
    put(p, s, 11, 16, pebble)
    put(p, s, 12, 16, pebble_hi)
    put(p, s, 20, 14, pebble)

    outline_opaque(p, s)
    return img.resize((96, 96), Image.NEAREST)


def draw_stone() -> Image.Image:
    """Small grey rock — chunky, readable at icon size."""
    s = 32
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    p = img.load()

    rock = (118, 122, 128, 255)
    rock_hi = (168, 172, 178, 255)
    rock_dk = (78, 82, 88, 255)
    rock_deep = (56, 58, 64, 255)
    lichen = (96, 122, 72, 255)

    # Main boulder shape (pixel silhouette)
    body = [
        "......######......",
        "....##########....",
        "...############...",
        "..##############..",
        "..##############..",
        ".################.",
        ".################.",
        "..##############..",
        "...############...",
        "....##########....",
    ]
    ox, oy = 7, 10
    for dy, row in enumerate(body):
        for dx, ch in enumerate(row):
            if ch != "#":
                continue
            x, y = ox + dx, oy + dy
            # shade by position
            if dy <= 2 or dx <= 2:
                c = rock_hi
            elif dy >= len(body) - 2 or dx >= len(row) - 3:
                c = rock_dk
            else:
                c = rock
            put(p, s, x, y, c)

    # Crack + lichen accent
    for x, y in ((14, 15), (15, 16), (16, 17), (15, 18)):
        put(p, s, x, y, rock_deep)
    put(p, s, 12, 14, lichen)
    put(p, s, 20, 16, lichen)

    outline_opaque(p, s)
    return img.resize((96, 96), Image.NEAREST)


def draw_fish() -> Image.Image:
    """Small blue pond fish — backpack loot icon."""
    s = 32
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    p = img.load()

    body = (78, 148, 214, 255)
    body_hi = (132, 196, 236, 255)
    body_dk = (48, 104, 168, 255)
    belly = (196, 226, 244, 255)
    fin = (56, 120, 186, 255)
    eye = (36, 40, 48, 255)
    eye_hi = (248, 248, 252, 255)

    # Body
    fill_ellipse(p, s, 15, 16, 9, 5, body)
    fill_ellipse(p, s, 14, 15, 7, 3, body_hi)
    fill_ellipse(p, s, 16, 18, 6, 2, belly)
    # Head taper
    fill_ellipse(p, s, 23, 16, 3, 3, body)
    put(p, s, 24, 15, body_hi)
    # Tail
    fill_rect(p, s, 4, 13, 7, 19, fin)
    put(p, s, 5, 14, body_hi)
    put(p, s, 5, 18, body_dk)
    put(p, s, 3, 12, fin)
    put(p, s, 3, 20, fin)
    put(p, s, 2, 16, body_dk)
    # Dorsal / belly fins
    put(p, s, 14, 11, fin)
    put(p, s, 15, 10, fin)
    put(p, s, 16, 11, fin)
    put(p, s, 15, 21, fin)
    # Eye
    put(p, s, 22, 15, eye_hi)
    put(p, s, 23, 15, eye)

    outline_opaque(p, s)
    return img.resize((96, 96), Image.NEAREST)


DRAWERS = {
    "wood": draw_wood,
    "grass": draw_grass,
    "dirt": draw_dirt,
    "stone": draw_stone,
    "fish": draw_fish,
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


def sync_catalog(frames):
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
                    "group": "material",
                    "path": path,
                    "spriteFrame": sf,
                    "size": [96, 96],
                    "tags": ["material", key],
                }
            )
    CATALOG.write_text(json.dumps(cat, indent=2) + "\n", encoding="utf-8")


def main() -> None:
    UI.mkdir(parents=True, exist_ok=True)
    umap: dict = {}
    if UUID_MAP.exists():
        umap = json.loads(UUID_MAP.read_text(encoding="utf-8"))

    frames = {}
    for key in MATERIALS:
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
    MF.write_text(json.dumps(frames, indent=2) + "\n", encoding="utf-8")
    OUT_TS.write_text(
        "/** Auto-synced from tools/ui/material-frames.json */\n"
        "export const MATERIAL_FRAMES = {}\n".format(json.dumps(frames, indent=4)),
        encoding="utf-8",
    )
    sync_catalog(frames)


if __name__ == "__main__":
    main()
