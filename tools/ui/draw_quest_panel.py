#!/usr/bin/env python3
"""Hand-pixel quest journal panel — FarmHUD / info-board wood language (no AI jagged edges).

  C:/Users/elex/scoop/apps/python310/current/python.exe tools/ui/draw_quest_panel.py

Draws logical chrome → nearest ×SCALE → assets/textures/ui/ui-quest-panel.png
Keeps existing .meta UUID; patches 9-slice borders + quest-frames / prefab layout hints.
"""
from __future__ import print_function

import json
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "assets/textures/ui/ui-quest-panel.png"
UUID_MAP = Path(__file__).resolve().parent / "uuid-map.json"
QUEST_FRAMES = Path(__file__).resolve().parent / "quest-frames.json"
LIB_SF = ROOT / "library/a2/a2ff1daa-0b00-47a1-8b82-1fee6b0c2ea6@f9941.json"
TEX_SUFFIX = "6c48a"
SF_SUFFIX = "f9941"

# Logical → display (nearest). Display must match generate_quest_panel_prefab PANEL_*
SCALE = 2
LW, LH = 350, 590
OW, OH = LW * SCALE, LH * SCALE  # 700×1180

# Logical frame insets (wood + title / footer bands). Symmetric, clean.
FRAME_L = FRAME_R = 22
FRAME_T = 40
FRAME_B = 34

C = {
    "outline": (54, 30, 14, 255),
    "wood_deep": (96, 48, 18, 255),
    "wood_dk": (132, 68, 28, 255),
    "wood": (196, 118, 42, 255),
    "wood_hi": (228, 152, 62, 255),
    "wood_hi2": (245, 188, 108, 255),
    "title": (178, 102, 36, 255),
    "title_hi": (220, 140, 56, 255),
    "parch": (246, 228, 186, 255),
    "parch_hi": (252, 240, 210, 255),
    "parch_dk": (220, 188, 136, 255),
    "parch_grain": (236, 212, 164, 255),
    "gold": (255, 214, 72, 255),
    "gold_dk": (210, 150, 40, 255),
    "gold_hi": (255, 240, 160, 255),
}

try:
    RESAMPLE = Image.Resampling.NEAREST
except AttributeError:
    RESAMPLE = Image.NEAREST


def put(px, w, h, x, y, c):
    if 0 <= x < w and 0 <= y < h:
        px[x, y] = c


def in_round_rect(x, y, x0, y0, x1, y1, r):
    if x < x0 or x > x1 or y < y0 or y > y1:
        return False
    corners = (
        (x0 + r, y0 + r, x <= x0 + r and y <= y0 + r),
        (x1 - r, y0 + r, x >= x1 - r and y <= y0 + r),
        (x0 + r, y1 - r, x <= x0 + r and y >= y1 - r),
        (x1 - r, y1 - r, x >= x1 - r and y >= y1 - r),
    )
    for cx, cy, active in corners:
        if active and (x - cx) * (x - cx) + (y - cy) * (y - cy) > r * r + 1:
            return False
    return True


def fill_round_rect(px, w, h, x0, y0, x1, y1, r, color_fn):
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            if in_round_rect(x, y, x0, y0, x1, y1, r):
                put(px, w, h, x, y, color_fn(x, y))


def outline_opaque(img, color):
    w, h = img.size
    px = img.load()
    border = set()
    for y in range(h):
        for x in range(w):
            if px[x, y][3] == 0:
                continue
            for dx, dy in ((-1, 0), (1, 0), (0, -1), (0, 1)):
                nx, ny = x + dx, y + dy
                if not (0 <= nx < w and 0 <= ny < h) or px[nx, ny][3] == 0:
                    border.add((nx, ny))
    for x, y in border:
        if 0 <= x < w and 0 <= y < h and px[x, y][3] == 0:
            px[x, y] = color


def rivet(px, w, h, cx, cy):
    for dy in range(-3, 4):
        for dx in range(-3, 4):
            d2 = dx * dx + dy * dy
            if d2 > 10:
                continue
            if d2 >= 8:
                c = C["outline"]
            elif dy <= -1 and dx <= 0:
                c = C["gold_hi"]
            elif dy >= 1 or dx >= 1:
                c = C["gold_dk"]
            else:
                c = C["gold"]
            put(px, w, h, cx + dx, cy + dy, c)


def draw_panel():
    w, h = LW, LH
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    px = img.load()

    x0, y0, x1, y1 = 2, 2, w - 3, h - 3
    outer_r = 18
    ix0 = x0 + FRAME_L
    iy0 = y0 + FRAME_T
    ix1 = x1 - FRAME_R
    iy1 = y1 - FRAME_B
    inner_r = 10

    def wood_color(x, y):
        # Title band — flat plaque, almost solid (title text sits here)
        if y0 + 5 <= y <= FRAME_T - 3 and x0 + FRAME_L - 2 <= x <= x1 - FRAME_R + 2:
            if y <= y0 + 7:
                return C["title_hi"]
            if y >= FRAME_T - 5:
                return C["wood_deep"]
            return C["title"]
        # Footer band — solid plate for buttons
        if y >= y1 - FRAME_B + 1:
            if y <= y1 - FRAME_B + 3:
                return C["wood_deep"]
            if y >= y1 - 3:
                return C["wood_dk"]
            return C["wood"]
        # Outer bevel
        if y <= y0 + 2 or x <= x0 + 2:
            return C["wood_hi"]
        if y >= y1 - 2 or x >= x1 - 2:
            return C["wood_dk"]
        # Sparse flecks only — solid rails like info-board, not plank stripes
        if (x * 7 + y * 11) % 37 == 0:
            return C["wood_hi2"]
        if (x * 5 + y * 3) % 43 == 0:
            return C["wood_dk"]
        return C["wood"]

    fill_round_rect(px, w, h, x0, y0, x1, y1, outer_r, wood_color)

    # Inner lip (dark recess) then clean parchment — straight edges, soft corners.

    # Dark lip around parchment
    fill_round_rect(
        px,
        w,
        h,
        ix0 - 2,
        iy0 - 2,
        ix1 + 2,
        iy1 + 2,
        inner_r + 2,
        lambda x, y: C["wood_deep"],
    )

    def parch_color(x, y):
        # Inset bevel: top/left darker, bottom/right lighter (recessed paper)
        if y <= iy0 + 1 or x <= ix0 + 1:
            return C["parch_dk"]
        if y >= iy1 - 1 or x >= ix1 - 1:
            return C["parch_hi"]
        # Barely-there paper flecks
        if (x * 13 + y * 17) % 53 == 0:
            return C["parch_grain"]
        return C["parch"]

    fill_round_rect(px, w, h, ix0, iy0, ix1, iy1, inner_r, parch_color)

    # Corner plates + rivets (small, tidy — not chunky AI blocks)
    for cx, cy in (
        (x0 + 12, y0 + 12),
        (x1 - 12, y0 + 12),
        (x0 + 12, y1 - 12),
        (x1 - 12, y1 - 12),
    ):
        for dy in range(-5, 6):
            for dx in range(-5, 6):
                if max(abs(dx), abs(dy)) <= 5:
                    base = C["wood_hi"] if dy < 0 or dx < 0 else C["wood_dk"]
                    if abs(dx) == 5 or abs(dy) == 5:
                        base = C["outline"]
                    put(px, w, h, cx + dx, cy + dy, base)
        rivet(px, w, h, cx, cy)

    # Thin highlight line under title band (separates header from paper)
    for x in range(ix0, ix1 + 1):
        put(px, w, h, x, iy0 - 3, C["wood_hi2"])
        put(px, w, h, x, iy0 - 2, C["wood_deep"])

    outline_opaque(img, C["outline"])
    return img


def patch_meta(w, h, borders):
    top, bottom, left, right = borders
    meta_path = Path(str(OUT) + ".meta")
    meta = json.loads(meta_path.read_text(encoding="utf-8"))
    sf = meta["subMetas"][SF_SUFFIX]["userData"]
    sf["width"] = w
    sf["height"] = h
    sf["rawWidth"] = w
    sf["rawHeight"] = h
    sf["trimX"] = 0
    sf["trimY"] = 0
    sf["borderTop"] = top
    sf["borderBottom"] = bottom
    sf["borderLeft"] = left
    sf["borderRight"] = right
    sf["packable"] = False
    hw, hh = w * 0.5, h * 0.5
    sf["vertices"] = {
        "rawPosition": [-hw, -hh, 0, hw, -hh, 0, -hw, hh, 0, hw, hh, 0],
        "indexes": [0, 1, 2, 2, 1, 3],
        "uv": [0, h, w, h, 0, 0, w, 0],
        "nuv": [0, 0, 1, 0, 0, 1, 1, 1],
        "minPos": [-hw, -hh, 0],
        "maxPos": [hw, hh, 0],
    }
    tex = meta["subMetas"][TEX_SUFFIX]["userData"]
    tex["minfilter"] = "nearest"
    tex["magfilter"] = "nearest"
    tex["mipfilter"] = "none"
    meta_path.write_text(json.dumps(meta, indent=2) + "\n", encoding="utf-8")


def patch_library(w, h, borders):
    if not LIB_SF.exists():
        return
    top, bottom, left, right = borders
    data = json.loads(LIB_SF.read_text(encoding="utf-8"))
    c = data["content"]
    c["rect"] = {"x": 0, "y": 0, "width": w, "height": h}
    c["originalSize"] = {"width": w, "height": h}
    c["capInsets"] = [left, top, right, bottom]
    hw, hh = w * 0.5, h * 0.5
    c["vertices"] = {
        "rawPosition": [-hw, -hh, 0, hw, -hh, 0, -hw, hh, 0, hw, hh, 0],
        "indexes": [0, 1, 2, 2, 1, 3],
        "uv": [0, h, w, h, 0, 0, w, 0],
        "nuv": [0, 0, 1, 0, 0, 1, 1, 1],
        "minPos": {"x": -hw, "y": -hh, "z": 0},
        "maxPos": {"x": hw, "y": hh, "z": 0},
    }
    LIB_SF.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")


def patch_quest_frames(borders):
    top, bottom, left, right = borders
    data = {}
    if QUEST_FRAMES.exists():
        data = json.loads(QUEST_FRAMES.read_text(encoding="utf-8"))
    umap = json.loads(UUID_MAP.read_text(encoding="utf-8")) if UUID_MAP.exists() else {}
    sf = umap.get("ui-quest-panel", {}).get("spriteFrame")
    if not sf:
        sf = "a2ff1daa-0b00-47a1-8b82-1fee6b0c2ea6@f9941"
    data["panel"] = {
        "spriteFrame": sf,
        "w": OW,
        "h": OH,
        "file": "ui-quest-panel",
        "borders": {"top": top, "bottom": bottom, "left": left, "right": right},
    }
    QUEST_FRAMES.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")


def main():
    logical = draw_panel()
    out = logical.resize((OW, OH), RESAMPLE)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    out.save(OUT)

    borders = (
        FRAME_T * SCALE,
        FRAME_B * SCALE,
        FRAME_L * SCALE,
        FRAME_R * SCALE,
    )
    patch_meta(OW, OH, borders)
    patch_library(OW, OH, borders)
    patch_quest_frames(borders)

    preview = Path(__file__).resolve().parent / "ai-source" / "quest-panel-pixel-preview.png"
    preview.parent.mkdir(parents=True, exist_ok=True)
    out.save(preview)

    print("OK", OUT.relative_to(ROOT), "{}x{}".format(OW, OH))
    print("borders TBLR", borders)
    print("LAYOUT HINT: FRAME_L, FRAME_R, FRAME_T, FRAME_B = {}, {}, {}, {}".format(
        borders[2], borders[3], borders[0], borders[1]
    ))
    print("preview", preview)


if __name__ == "__main__":
    main()
