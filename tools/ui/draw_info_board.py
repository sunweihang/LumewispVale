#!/usr/bin/env python3
"""Draw Stardew-like top-right info board chrome + icons for Lumewisp Vale."""

import json
import math
import uuid
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
OUT_DIR = ROOT / "assets/textures/ui"
UUID_MAP = Path(__file__).resolve().parent / "uuid-map.json"
CATALOG = Path(__file__).resolve().parent / "catalog.json"
FRAMES_JSON = Path(__file__).resolve().parent / "info-board-frames.json"
FRAMES_TS = ROOT / "assets/scripts/game/InfoBoardFrames.ts"
TEX_SUFFIX = "6c48a"
SF_SUFFIX = "f9941"
SCALE = 3  # logical px → display px (nearest)

# Stardew wood HUD palette
C = {
    "outline": (54, 30, 14, 255),
    "wood_dk": (122, 62, 22, 255),
    "wood": (186, 110, 36, 255),
    "wood_hi": (230, 150, 58, 255),
    "wood_hi2": (245, 190, 110, 255),
    "bevel_dk": (96, 48, 18, 255),
    "inset": (232, 198, 140, 255),
    "inset_hi": (247, 220, 170, 255),
    "inset_dk": (200, 162, 108, 255),
    "slot": (214, 176, 118, 255),
    "slot_in": (168, 132, 84, 255),
    "text_ghost": (180, 150, 110, 255),
    "g_bg": (92, 54, 28, 255),
    "g_fg": (48, 28, 14, 255),
    "sky_day": (150, 210, 245, 255),
    "sky_day2": (100, 170, 230, 255),
    "sky_eve": (70, 110, 180, 255),
    "sky_night": (28, 42, 92, 255),
    "sky_night2": (18, 28, 68, 255),
    "star": (240, 245, 255, 255),
    "sun": (255, 220, 70, 255),
    "sun_dk": (230, 170, 40, 255),
    "moon": (235, 240, 250, 255),
    "moon_dk": (190, 200, 220, 255),
    "needle": (230, 180, 70, 255),
    "needle_dk": (170, 120, 40, 255),
    "weather_bg": (150, 200, 230, 255),
    "season_pink": (230, 140, 170, 255),
    "season_leaf": (90, 170, 80, 255),
    "btn_face": (120, 70, 32, 255),
    "btn_hi": (180, 120, 55, 255),
    "btn_mark": (245, 210, 90, 255),
}


def put(p, w, h, x, y, c):
    if 0 <= x < w and 0 <= y < h:
        p[x, y] = c


def fill_rect(p, w, h, x0, y0, x1, y1, c):
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            put(p, w, h, x, y, c)


def outline_opaque(img, color):
    w, h = img.size
    p = img.load()
    opaque = [(x, y) for y in range(h) for x in range(w) if p[x, y][3] > 0]
    border = set()
    for x, y in opaque:
        for dx, dy in ((-1, 0), (1, 0), (0, -1), (0, 1)):
            nx, ny = x + dx, y + dy
            if not (0 <= nx < w and 0 <= ny < h) or p[nx, ny][3] == 0:
                border.add((nx, ny))
    for x, y in border:
        if 0 <= x < w and 0 <= y < h and p[x, y][3] == 0:
            p[x, y] = color


def wood_frame(p, w, h, x0, y0, x1, y1, r=4):
    """Filled wood panel with bevel + dark outline zone (caller may outline)."""
    # Outer wood fill with soft round corners
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            # corner cut
            cx = x0 + r if x < x0 + r else (x1 - r if x > x1 - r else x)
            cy = y0 + r if y < y0 + r else (y1 - r if y > y1 - r else y)
            if x < x0 + r and y < y0 + r:
                if (x - (x0 + r)) ** 2 + (y - (y0 + r)) ** 2 > r * r + r:
                    continue
            elif x > x1 - r and y < y0 + r:
                if (x - (x1 - r)) ** 2 + (y - (y0 + r)) ** 2 > r * r + r:
                    continue
            elif x < x0 + r and y > y1 - r:
                if (x - (x0 + r)) ** 2 + (y - (y1 - r)) ** 2 > r * r + r:
                    continue
            elif x > x1 - r and y > y1 - r:
                if (x - (x1 - r)) ** 2 + (y - (y1 - r)) ** 2 > r * r + r:
                    continue
            # bevel shading
            edge_l = x - x0 <= 1
            edge_t = y - y0 <= 1
            edge_r = x1 - x <= 1
            edge_b = y1 - y <= 1
            if edge_l or edge_t:
                c = C["wood_hi"]
            elif edge_r or edge_b:
                c = C["wood_dk"]
            else:
                c = C["wood"]
            put(p, w, h, x, y, c)
    # inner highlight ring
    fill_rect(p, w, h, x0 + 2, y0 + 2, x1 - 2, y0 + 2, C["wood_hi2"])
    fill_rect(p, w, h, x0 + 2, y0 + 2, x0 + 2, y1 - 2, C["wood_hi"])


def inset_box(p, w, h, x0, y0, x1, y1):
    fill_rect(p, w, h, x0, y0, x1, y1, C["inset"])
    fill_rect(p, w, h, x0, y0, x1, y0, C["inset_dk"])
    fill_rect(p, w, h, x0, y0, x0, y1, C["inset_dk"])
    fill_rect(p, w, h, x0, y1, x1, y1, C["inset_hi"])
    fill_rect(p, w, h, x1, y0, x1, y1, C["inset_hi"])


def draw_panel():
    """Clock dial + date/weather/time chrome (no baked text). Logical 100×46."""
    lw, lh = 100, 46
    img = Image.new("RGBA", (lw, lh), (0, 0, 0, 0))
    p = img.load()

    # Right info box
    bx0, by0, bx1, by1 = 34, 2, 97, 43
    wood_frame(p, lw, lh, bx0, by0, bx1, by1, r=5)
    # Date row
    inset_box(p, lw, lh, 38, 5, 93, 15)
    # Weather slots row
    slots = [(38, 18, 52, 32), (54, 18, 68, 32), (70, 18, 84, 32)]
    for sx0, sy0, sx1, sy1 in slots:
        fill_rect(p, lw, lh, sx0, sy0, sx1, sy1, C["slot"])
        fill_rect(p, lw, lh, sx0, sy0, sx1, sy0, C["slot_in"])
        fill_rect(p, lw, lh, sx0, sy0, sx0, sy1, C["slot_in"])
        fill_rect(p, lw, lh, sx0, sy1, sx1, sy1, C["inset_hi"])
        fill_rect(p, lw, lh, sx1, sy0, sx1, sy1, C["inset_hi"])
    # Tiny center jewel
    fill_rect(p, lw, lh, 59, 23, 63, 27, C["wood_hi"])
    put(p, lw, lh, 60, 24, C["sun"])
    put(p, lw, lh, 61, 24, C["sun"])
    put(p, lw, lh, 60, 25, C["sun"])
    put(p, lw, lh, 61, 25, C["sun_dk"])
    # Time row
    inset_box(p, lw, lh, 38, 34, 93, 41)

    # Dial circle (left)
    cx, cy, rad = 22, 23, 19
    for y in range(cy - rad - 1, cy + rad + 2):
        for x in range(cx - rad - 1, cx + rad + 2):
            d2 = (x - cx) ** 2 + (y - cy) ** 2
            if d2 > (rad + 1) ** 2:
                continue
            if d2 > rad * rad:
                put(p, lw, lh, x, y, C["outline"])
                continue
            # sky gradient: night top → day bottom
            t = (y - (cy - rad)) / max(1, rad * 2)
            if t < 0.35:
                c = C["sky_night2"] if (x + y) % 7 == 0 else C["sky_night"]
            elif t < 0.55:
                c = C["sky_eve"]
            elif t < 0.75:
                c = C["sky_day2"]
            else:
                c = C["sky_day"]
            put(p, lw, lh, x, y, c)

    # wood ring around dial (partial, where it meets panel)
    for a in range(0, 360, 2):
        rad_o = rad + 0.2
        x = int(round(cx + math.cos(math.radians(a)) * rad_o))
        y = int(round(cy + math.sin(math.radians(a)) * rad_o))
        if p[x, y][3] == 0:
            put(p, lw, lh, x, y, C["wood_dk"])

    # stars
    for sx, sy in ((14, 10), (20, 8), (27, 12), (12, 16), (30, 15)):
        put(p, lw, lh, sx, sy, C["star"])

    # sun (bottom-left of dial)
    for dy in range(-3, 4):
        for dx in range(-3, 4):
            if dx * dx + dy * dy <= 8:
                put(p, lw, lh, 14 + dx, 32 + dy, C["sun"] if dx * dx + dy * dy <= 4 else C["sun_dk"])

    # moon (top-left)
    for dy in range(-3, 4):
        for dx in range(-3, 4):
            if dx * dx + dy * dy <= 7:
                put(p, lw, lh, 16 + dx, 12 + dy, C["moon"])
    for dy in range(-2, 3):
        for dx in range(-1, 4):
            if dx * dx + dy * dy <= 5:
                put(p, lw, lh, 18 + dx, 11 + dy, C["sky_night"])  # crescent cut

    # pivot hub (needle drawn at runtime)
    fill_rect(p, lw, lh, cx - 2, cy - 2, cx + 2, cy + 2, C["needle_dk"])
    put(p, lw, lh, cx, cy, C["needle"])
    put(p, lw, lh, cx - 1, cy - 1, C["needle"])

    # connector stubs under panel (for gold bar posts)
    fill_rect(p, lw, lh, 48, 44, 50, 45, C["wood_dk"])
    fill_rect(p, lw, lh, 80, 44, 82, 45, C["wood_dk"])

    outline_opaque(img, C["outline"])
    return img.resize((lw * SCALE, lh * SCALE), Image.NEAREST)


def draw_gold():
    """Capsule gold bar. Logical 90×18."""
    lw, lh = 90, 18
    img = Image.new("RGBA", (lw, lh), (0, 0, 0, 0))
    p = img.load()
    wood_frame(p, lw, lh, 1, 1, 88, 16, r=8)
    # G circle
    cx, cy, rad = 12, 9, 6
    for y in range(cy - rad, cy + rad + 1):
        for x in range(cx - rad, cx + rad + 1):
            if (x - cx) ** 2 + (y - cy) ** 2 <= rad * rad:
                put(p, lw, lh, x, y, C["g_bg"])
    for y in range(cy - rad + 1, cy + rad):
        for x in range(cx - rad + 1, cx + rad):
            if (x - cx) ** 2 + (y - cy) ** 2 <= (rad - 1) ** 2:
                put(p, lw, lh, x, y, C["bevel_dk"])
    # pixel G
    g = [
        " ### ",
        "#   #",
        "#    ",
        "# ## ",
        "#   #",
        " ### ",
    ]
    for gy, row in enumerate(g):
        for gx, ch in enumerate(row):
            if ch == "#":
                put(p, lw, lh, 10 + gx, 6 + gy, C["btn_mark"])

    # segmented value inset
    inset_box(p, lw, lh, 22, 4, 84, 13)
    for x in range(30, 84, 8):
        fill_rect(p, lw, lh, x, 5, x, 12, C["inset_dk"])

    # posts up
    fill_rect(p, lw, lh, 28, 0, 30, 1, C["wood_dk"])
    fill_rect(p, lw, lh, 60, 0, 62, 1, C["wood_dk"])

    outline_opaque(img, C["outline"])
    return img.resize((lw * SCALE, lh * SCALE), Image.NEAREST)


def draw_btn(kind):
    """Square zoom btn or round quest btn. Logical 16×16."""
    lw = lh = 16
    img = Image.new("RGBA", (lw, lh), (0, 0, 0, 0))
    p = img.load()
    if kind == "quest":
        cx, cy, rad = 8, 8, 7
        for y in range(lh):
            for x in range(lw):
                d2 = (x - cx) ** 2 + (y - cy) ** 2
                if d2 > rad * rad:
                    continue
                if d2 > (rad - 1) ** 2:
                    put(p, lw, lh, x, y, C["outline"])
                elif x <= cx - 2 or y <= cy - 2:
                    put(p, lw, lh, x, y, C["wood_hi"])
                elif x >= cx + 2 or y >= cy + 2:
                    put(p, lw, lh, x, y, C["wood_dk"])
                else:
                    put(p, lw, lh, x, y, C["wood"])
        # !
        fill_rect(p, lw, lh, 7, 3, 8, 9, C["btn_mark"])
        fill_rect(p, lw, lh, 7, 11, 8, 12, C["btn_mark"])
    else:
        wood_frame(p, lw, lh, 1, 1, 14, 14, r=2)
        fill_rect(p, lw, lh, 3, 3, 12, 12, C["btn_face"])
        fill_rect(p, lw, lh, 3, 3, 12, 3, C["btn_hi"])
        if kind == "minus":
            fill_rect(p, lw, lh, 4, 7, 11, 8, C["btn_mark"])
        else:
            fill_rect(p, lw, lh, 4, 7, 11, 8, C["btn_mark"])
            fill_rect(p, lw, lh, 7, 4, 8, 11, C["btn_mark"])
    outline_opaque(img, C["outline"])
    return img.resize((lw * SCALE, lh * SCALE), Image.NEAREST)


def draw_weather_sun():
    lw = lh = 14
    img = Image.new("RGBA", (lw, lh), (0, 0, 0, 0))
    p = img.load()
    fill_rect(p, lw, lh, 0, 0, 13, 13, C["weather_bg"])
    cx, cy = 7, 7
    for y in range(lh):
        for x in range(lw):
            if (x - cx) ** 2 + (y - cy) ** 2 <= 9:
                put(p, lw, lh, x, y, C["sun"])
    for a in range(0, 360, 45):
        x = int(round(cx + math.cos(math.radians(a)) * 5.5))
        y = int(round(cy + math.sin(math.radians(a)) * 5.5))
        put(p, lw, lh, x, y, C["sun_dk"])
    outline_opaque(img, C["outline"])
    return img.resize((lw * SCALE, lh * SCALE), Image.NEAREST)


def draw_season_spring():
    lw = lh = 14
    img = Image.new("RGBA", (lw, lh), (0, 0, 0, 0))
    p = img.load()
    fill_rect(p, lw, lh, 0, 0, 13, 13, (245, 210, 220, 255))
    # flower
    for dx, dy in ((0, -2), (0, 2), (-2, 0), (2, 0), (-1, -1), (1, -1), (-1, 1), (1, 1)):
        put(p, lw, lh, 7 + dx, 6 + dy, C["season_pink"])
        put(p, lw, lh, 7 + dx * 2, 6 + dy * 2, C["season_pink"])
    put(p, lw, lh, 7, 6, C["sun"])
    fill_rect(p, lw, lh, 6, 9, 8, 12, C["season_leaf"])
    outline_opaque(img, C["outline"])
    return img.resize((lw * SCALE, lh * SCALE), Image.NEAREST)


def draw_needle():
    """Clock hand pointing up; runtime rotates around bottom-ish pivot. Logical 8×18."""
    lw, lh = 8, 20
    img = Image.new("RGBA", (lw, lh), (0, 0, 0, 0))
    p = img.load()
    # tip at top, pivot near bottom
    pts = [(3, 1), (4, 1), (5, 2), (4, 2), (4, 3), (3, 3), (3, 14), (4, 14), (2, 15), (5, 15), (3, 16), (4, 16)]
    for x, y in pts:
        put(p, lw, lh, x, y, C["needle"])
    fill_rect(p, lw, lh, 3, 2, 4, 14, C["needle"])
    fill_rect(p, lw, lh, 2, 14, 5, 16, C["needle_dk"])
    put(p, lw, lh, 3, 15, C["needle"])
    put(p, lw, lh, 4, 15, C["needle"])
    outline_opaque(img, C["outline"])
    return img.resize((lw * SCALE, lh * SCALE), Image.NEAREST)


ASSETS = {
    "ui-info-panel": (draw_panel, 100 * SCALE, 46 * SCALE),
    "ui-info-gold": (draw_gold, 90 * SCALE, 18 * SCALE),
    "ui-info-btn-minus": (lambda: draw_btn("minus"), 16 * SCALE, 16 * SCALE),
    "ui-info-btn-plus": (lambda: draw_btn("plus"), 16 * SCALE, 16 * SCALE),
    "ui-info-btn-quest": (lambda: draw_btn("quest"), 16 * SCALE, 16 * SCALE),
    "ui-info-weather-sun": (draw_weather_sun, 14 * SCALE, 14 * SCALE),
    "ui-info-season-spring": (draw_season_spring, 14 * SCALE, 14 * SCALE),
    "ui-info-needle": (draw_needle, 8 * SCALE, 20 * SCALE),
}


def write_meta(png, image_uuid, w, h, name):
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


def upsert_catalog(items):
    data = json.loads(CATALOG.read_text(encoding="utf-8"))
    by_id = {it["id"]: i for i, it in enumerate(data["items"])}
    for it in items:
        if it["id"] in by_id:
            data["items"][by_id[it["id"]]] = it
        else:
            data["items"].append(it)
    CATALOG.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    umap = {}
    if UUID_MAP.exists():
        umap = json.loads(UUID_MAP.read_text(encoding="utf-8"))

    frames = {}
    catalog_items = []
    for name, (drawer, w, h) in ASSETS.items():
        png = OUT_DIR / "{}.png".format(name)
        drawer().save(png)
        image_uuid = write_meta(
            png,
            umap.get(name, {}).get("texture") or str(uuid.uuid4()),
            w,
            h,
            name,
        )
        sf = "{}@{}".format(image_uuid, SF_SUFFIX)
        umap[name] = {"texture": image_uuid, "prefab": "", "spriteFrame": sf}
        key = name.replace("ui-info-", "").replace("-", "_")
        frames[key] = sf
        catalog_items.append(
            {
                "id": name,
                "kind": "icon",
                "spriteType": "simple",
                "designSize": [w, h],
                "path": "assets/textures/ui/{}.png".format(name),
                "prefab": "",
                "layer": "UI",
            }
        )
        print("OK", png.relative_to(ROOT), "{}x{}".format(w, h))

    UUID_MAP.write_text(json.dumps(umap, indent=2) + "\n", encoding="utf-8")
    FRAMES_JSON.write_text(json.dumps(frames, indent=2) + "\n", encoding="utf-8")
    FRAMES_TS.write_text(
        "/** Auto-synced from tools/ui/info-board-frames.json */\n"
        "export const INFO_BOARD_FRAMES = {}\n".format(json.dumps(frames, indent=4)),
        encoding="utf-8",
    )
    upsert_catalog(catalog_items)
    print("frames", FRAMES_TS.relative_to(ROOT))


if __name__ == "__main__":
    main()
