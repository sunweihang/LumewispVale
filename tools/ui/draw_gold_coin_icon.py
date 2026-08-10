#!/usr/bin/env python3
"""DEPRECATED — do not regenerate the procedural G-coin.

Ship gold via AI wheat-sheaf source + process pipeline:

  tools/ui/ai-source/ic-gold-ai-ref.png
  C:/Users/elex/scoop/apps/python310/current/python.exe tools/ui/process_reward_icons_ai.py

This script exits without writing so it cannot clobber the shipped icon.
"""

from __future__ import annotations

from pathlib import Path

from PIL import Image

try:
    RESAMPLE_NEAREST = Image.Resampling.NEAREST
except AttributeError:
    RESAMPLE_NEAREST = Image.NEAREST

ROOT = Path(__file__).resolve().parents[2]
SRC = Path(__file__).resolve().parent / "ai-source"
OUT_REF = SRC / "ic-gold-ai-ref.png"
OUT_PNG = ROOT / "assets/textures/ui/ic-gold.png"

LOGICAL = 32
OUT_SIZE = 96

OUTLINE = (40, 28, 18, 255)
RIM_DARK = (150, 90, 28, 255)
BODY = (232, 178, 48, 255)
BODY_MID = (210, 150, 40, 255)
HIGH = (255, 230, 120, 255)
SHADE = (180, 110, 30, 255)
G_FILL = (120, 70, 22, 255)


def set_px(px, x: int, y: int, c, w: int, h: int):
    if 0 <= x < w and 0 <= y < h:
        px[x, y] = c


def fill_circle(px, cx: float, cy: float, r: float, c, w: int, h: int):
    r2 = r * r
    for y in range(h):
        for x in range(w):
            if (x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= r2:
                px[x, y] = c


def ring(px, cx: float, cy: float, r_out: float, r_in: float, c, w: int, h: int):
    ro2, ri2 = r_out * r_out, r_in * r_in
    for y in range(h):
        for x in range(w):
            d2 = (x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2
            if ri2 < d2 <= ro2:
                px[x, y] = c


def draw_g(px, ox: int, oy: int, w: int, h: int):
    """Chunky capital G — readable at 32px."""
    rows = [
        " ##### ",
        "#     #",
        "#      ",
        "#   ###",
        "#     #",
        "#     #",
        " ##### ",
    ]
    for dy, row in enumerate(rows):
        for dx, ch in enumerate(row):
            if ch == "#":
                set_px(px, ox + dx, oy + dy, G_FILL, w, h)


def build_logical() -> Image.Image:
    im = Image.new("RGBA", (LOGICAL, LOGICAL), (0, 0, 0, 0))
    px = im.load()
    cx = cy = (LOGICAL - 1) / 2.0

    fill_circle(px, cx, cy, 14.2, OUTLINE, LOGICAL, LOGICAL)
    fill_circle(px, cx, cy, 12.6, RIM_DARK, LOGICAL, LOGICAL)
    fill_circle(px, cx, cy, 11.2, BODY_MID, LOGICAL, LOGICAL)
    fill_circle(px, cx, cy, 10.0, BODY, LOGICAL, LOGICAL)

    for y in range(LOGICAL):
        for x in range(LOGICAL):
            dx = x + 0.5 - cx
            dy = y + 0.5 - cy
            d2 = dx * dx + dy * dy
            if d2 > 100.0 or d2 < 12.25:
                continue
            if px[x, y][3] == 0:
                continue
            if dx + dy < -3.5:
                px[x, y] = HIGH
            elif dx + dy > 5.5:
                px[x, y] = SHADE

    ring(px, cx, cy, 9.2, 8.2, RIM_DARK, LOGICAL, LOGICAL)
    # Center the 7×7 G glyph.
    draw_g(px, 12, 12, LOGICAL, LOGICAL)
    return im


def main():
    raise SystemExit(
        "draw_gold_coin_icon.py is deprecated. "
        "Use tools/ui/process_reward_icons_ai.py with ic-gold-ai-ref.png instead."
    )

if __name__ == "__main__":
    main()
