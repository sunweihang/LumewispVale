#!/usr/bin/env python3
"""
Draw Stardew-like storage chest — orthographic 3/4 (cabinet projection).

No vanishing-point / trapezoid lid. Front = rectangle; top = foreshortened
rectangle with parallel left/right edges. Overwrites prop-shipping.png,
keeps UUID from uuid-map.json.
"""

import json
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
TOOLS = Path(__file__).resolve().parent
OUT = ROOT / "assets/textures/props/prop-shipping.png"
UUID_MAP = TOOLS / "uuid-map.json"
CATALOG = TOOLS / "catalog.json"

# Logical px → NEAREST ×2 → 96×80 (matches existing SIZE.shipping)
LW, LH = 48, 40
SCALE = 2
OW, OH = LW * SCALE, LH * SCALE

C = {
    "outline": (36, 22, 12, 255),
    "post": (92, 54, 28, 255),
    "post_hi": (120, 74, 40, 255),
    "post_lo": (68, 40, 20, 255),
    "front": (150, 92, 42, 255),
    "front_hi": (176, 112, 52, 255),
    "front_lo": (118, 70, 32, 255),
    "seam": (70, 40, 20, 255),
    "top": (196, 130, 62, 255),
    "top_hi": (220, 158, 78, 255),
    "top_lo": (168, 108, 50, 255),
    "top_seam": (110, 66, 32, 255),
    "lip": (130, 78, 36, 255),
    "metal": (88, 92, 98, 255),
    "metal_hi": (150, 154, 160, 255),
    "metal_lo": (52, 54, 58, 255),
    "latch": (210, 170, 70, 255),
    "latch_dk": (150, 110, 40, 255),
    "shadow": (40, 24, 12, 90),
}


def put(p, w, h, x, y, c):
    if 0 <= x < w and 0 <= y < h:
        p[x, y] = c


def fill_rect(p, w, h, x0, y0, x1, y1, c):
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            put(p, w, h, x, y, c)


def hline(p, w, h, x0, x1, y, c):
    for x in range(x0, x1 + 1):
        put(p, w, h, x, y, c)


def vline(p, w, h, x, y0, y1, c):
    for y in range(y0, y1 + 1):
        put(p, w, h, x, y, c)


def outline_opaque(img, color):
    w, h = img.size
    p = img.load()
    opaque = [(x, y) for y in range(h) for x in range(w) if p[x, y][3] > 200]
    border = set()
    for x, y in opaque:
        for dx, dy in ((-1, 0), (1, 0), (0, -1), (0, 1)):
            nx, ny = x + dx, y + dy
            if not (0 <= nx < w and 0 <= ny < h) or p[nx, ny][3] < 200:
                border.add((nx, ny))
    for x, y in border:
        if 0 <= x < w and 0 <= y < h and p[x, y][3] < 200:
            p[x, y] = color


def draw_chest(w=LW, h=LH) -> Image.Image:
    """
    Cabinet projection:
      - top lid: flat rectangle (parallel sides), foreshortened
      - front: rectangle with vertical planks + corner posts
      - thin right side strip for depth (parallel, not converging)
    """
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    p = img.load()

    # Geometry (Y grows downward in PIL).
    # Orthographic 3/4: short foreshortened top + tall front; all edges parallel.
    left, right = 3, w - 4
    top_y0, top_y1 = 5, 11  # ~6px depth — lid, not a tall trapezoid wall
    front_y0, front_y1 = 12, h - 3
    post_w = 4
    side_w = 3  # thin right face (depth cue)

    # Contact shadow
    for x in range(left + 2, right - 1):
        put(p, w, h, x, h - 2, C["shadow"])
        put(p, w, h, x, h - 1, C["shadow"])

    body_r = right - side_w
    # --- TOP lid (rectangle, parallel L/R) ---
    fill_rect(p, w, h, left, top_y0, body_r, top_y1, C["top"])
    hline(p, w, h, left, body_r, top_y0, C["top_lo"])  # far edge
    hline(p, w, h, left + 1, body_r - 1, top_y0 + 1, C["top_hi"])
    hline(p, w, h, left + 1, body_r - 1, top_y0 + 3, C["top_seam"])
    hline(p, w, h, left + 1, body_r - 1, top_y0 + 5, C["top_seam"])
    # Front lip of lid (bevel onto front face)
    hline(p, w, h, left, body_r, top_y1, C["lip"])
    hline(p, w, h, left + 1, body_r - 1, top_y1 - 1, C["front_hi"])

    # --- RIGHT side strip (axis-aligned) ---
    fill_rect(p, w, h, body_r + 1, top_y0, right, front_y1, C["post_lo"])
    fill_rect(p, w, h, body_r + 1, top_y0, right, top_y1, C["top_lo"])
    vline(p, w, h, body_r + 1, top_y0, front_y1, C["post"])

    # --- FRONT ---
    body_l = left + post_w
    panel_r = body_r - post_w
    fill_rect(p, w, h, body_l, front_y0, panel_r, front_y1, C["front"])
    for x in (body_l + 6, body_l + 12, body_l + 18, body_l + 24):
        if body_l < x < panel_r:
            vline(p, w, h, x, front_y0 + 1, front_y1 - 2, C["seam"])
    # Upper front soft light (solid band — no dither zigzag)
    fill_rect(p, w, h, body_l + 1, front_y0 + 1, panel_r - 1, front_y0 + 3, C["front_hi"])
    fill_rect(p, w, h, body_l, front_y1 - 2, panel_r, front_y1, C["front_lo"])

    # Corner posts (parallel vertical)
    fill_rect(p, w, h, left, front_y0 - 1, left + post_w - 1, front_y1, C["post"])
    fill_rect(p, w, h, panel_r + 1, front_y0 - 1, body_r, front_y1, C["post"])
    vline(p, w, h, left + 1, front_y0, front_y1 - 1, C["post_hi"])
    vline(p, w, h, panel_r + 2, front_y0, front_y1 - 1, C["post_hi"])
    # Posts cap above lip
    fill_rect(p, w, h, left, top_y1 - 1, left + post_w - 1, top_y1 + 1, C["post_hi"])
    fill_rect(p, w, h, panel_r + 1, top_y1 - 1, body_r, top_y1 + 1, C["post_hi"])

    # Iron band + latch
    band_y = front_y0 + 7
    fill_rect(p, w, h, body_l + 1, band_y, panel_r - 1, band_y + 2, C["metal"])
    hline(p, w, h, body_l + 1, panel_r - 1, band_y, C["metal_hi"])
    hline(p, w, h, body_l + 1, panel_r - 1, band_y + 2, C["metal_lo"])
    cx = (body_l + panel_r) // 2
    fill_rect(p, w, h, cx - 3, band_y - 1, cx + 3, band_y + 5, C["metal_lo"])
    fill_rect(p, w, h, cx - 2, band_y, cx + 2, band_y + 4, C["metal"])
    put(p, w, h, cx, band_y + 2, C["latch"])
    put(p, w, h, cx - 1, band_y + 2, C["latch_dk"])
    put(p, w, h, cx + 1, band_y + 2, C["latch_dk"])

    # Item slot under band
    slot_y = band_y + 7
    fill_rect(p, w, h, cx - 7, slot_y, cx + 7, slot_y + 1, C["seam"])
    hline(p, w, h, cx - 6, cx + 6, slot_y, C["outline"])

    # Hinge dots on lid front edge
    for hx in (left + 8, cx, body_r - 8):
        put(p, w, h, hx, top_y1, C["metal_lo"])
        put(p, w, h, hx, top_y1 - 1, C["metal"])

    outline_opaque(img, C["outline"])
    return img


def upsert_catalog():
    if not CATALOG.exists():
        return
    data = json.loads(CATALOG.read_text(encoding="utf-8"))
    items = data.get("items") or data.get("assets") or []
    if isinstance(data, list):
        items = data
    found = False
    for it in items:
        if it.get("id") == "prop-shipping":
            it["note"] = "Storage chest (orthographic 3/4); world interact prop"
            it["tags"] = list(dict.fromkeys((it.get("tags") or []) + ["chest", "storage"]))
            found = True
            break
    if found:
        CATALOG.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")


def main():
    logical = draw_chest()
    out = logical.resize((OW, OH), Image.NEAREST)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    out.save(OUT)
    print(f"Wrote {OUT.relative_to(ROOT)} ({OW}x{OH})")
    # UUID / meta already exist — do not rewrite .meta
    if UUID_MAP.exists():
        um = json.loads(UUID_MAP.read_text(encoding="utf-8"))
        entry = um.get("prop-shipping", {})
        print(f"UUID kept: {entry.get('texture', '?')}")
    upsert_catalog()


if __name__ == "__main__":
    main()
