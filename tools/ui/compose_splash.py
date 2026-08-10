#!/usr/bin/env python3
"""Compose boot splash from in-game pixel textures (style-locked).

Output: assets/textures/ui/ui-splash.png @ 1080×2200
"""
from __future__ import annotations

import random
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[2]
TEX = ROOT / "assets" / "textures"
OUT = ROOT / "assets" / "textures" / "ui" / "ui-splash.png"
AI_DIR = ROOT / "tools" / "ui" / "ai-source"

W, H = 1080, 2200
TILE = 64


def load(rel: str) -> Image.Image:
    im = Image.open(TEX / rel).convert("RGBA")
    return im


def paste(dst: Image.Image, src: Image.Image, cx: int, foot_y: int):
    """Paste with bottom-center at (cx, foot_y)."""
    x = int(cx - src.width * 0.5)
    y = int(foot_y - src.height)
    dst.alpha_composite(src, (x, y))


def fill_tiles(dst: Image.Image, tile: Image.Image, y0: int, y1: int, variants: list[Image.Image] | None = None):
    rnd = random.Random(42)
    variants = variants or [tile]
    for y in range(y0, y1, TILE):
        for x in range(0, W, TILE):
            t = variants[rnd.randrange(len(variants))]
            dst.paste(t, (x, y), t)


def dither_sky(dst: Image.Image, y0: int, y1: int):
    """Chunky dawn sky — no smooth gradients."""
    cols = [
        (110, 160, 210, 255),
        (140, 185, 220, 255),
        (180, 200, 170, 255),
        (210, 195, 140, 255),
        (160, 175, 120, 255),
    ]
    band = max(1, (y1 - y0) // len(cols))
    px = dst.load()
    for i, c in enumerate(cols):
        ya = y0 + i * band
        yb = y1 if i == len(cols) - 1 else y0 + (i + 1) * band
        for y in range(ya, yb):
            for x in range(W):
                # 4px dither blocks
                bx, by = x // 4, y // 4
                if (bx + by) % 5 == 0 and i + 1 < len(cols):
                    px[x, y] = cols[min(i + 1, len(cols) - 1)]
                else:
                    px[x, y] = c


def main():
    random.seed(7)
    grass = load("terrain/tile-grass.png")
    grass_b = load("terrain/tile-grass-b.png") if (TEX / "terrain/tile-grass-b.png").exists() else grass
    grass_c = load("terrain/tile-grass-c.png") if (TEX / "terrain/tile-grass-c.png").exists() else grass
    dirt = load("terrain/tile-dirt.png")
    dirt_b = load("terrain/tile-dirt-b.png") if (TEX / "terrain/tile-dirt-b.png").exists() else dirt
    water = load("terrain/tile-water.png")
    home = load("buildings/bld-home-green.png")
    cottage = load("buildings/bld-cottage-red.png")
    oak = load("nature/nat-tree-oak.png")
    pine = load("nature/nat-tree-pine.png")
    blossom = load("nature/nat-tree-blossom.png")
    meteor = load("special/spc-meteor.png")
    crate = load("props/prop-crate.png")
    barrel = load("props/prop-barrel.png")

    # Scale oversized props into splash density (buildings are large already).
    def scale_h(im: Image.Image, h: int) -> Image.Image:
        if im.height == h:
            return im
        w = max(1, int(im.width * (h / im.height)))
        return im.resize((w, h), Image.Resampling.NEAREST)

    home = scale_h(home, 280)
    cottage = scale_h(cottage, 240)
    oak = scale_h(oak, 180)
    pine = scale_h(pine, 200)
    blossom = scale_h(blossom, 170)
    meteor = scale_h(meteor, 160)
    crate = scale_h(crate, 56)
    barrel = scale_h(barrel, 56)

    canvas = Image.new("RGBA", (W, H), (40, 80, 50, 255))

    # Top title band (sky) — keep relatively clear.
    dither_sky(canvas, 0, 420)

    # Soft grass transition under sky
    fill_tiles(canvas, grass, 380, H - 360, [grass, grass_b, grass_c])

    # Dirt path winding through mid → bottom loading band
    path_cols = [
        (dirt, dirt_b),
    ]
    for y in range(520, H, TILE):
        # path center drifts
        t = (y - 520) / max(1, H - 520)
        cx = int(540 + 120 * (0.5 - abs(t - 0.45)))
        half = 3 if y < H - 400 else 5
        for dx in range(-half, half + 1):
            x = cx + dx * TILE
            if 0 <= x < W:
                tile = dirt if ((x // TILE) + (y // TILE)) % 3 else dirt_b
                canvas.paste(tile, (x, y), tile)

    # Small water pocket mid-left
    for y in range(980, 980 + TILE * 3, TILE):
        for x in range(120, 120 + TILE * 4, TILE):
            canvas.paste(water, (x, y), water)

    # Props / buildings (foot Y)
    paste(canvas, home, 720, 1180)
    paste(canvas, cottage, 300, 1320)
    paste(canvas, crate, 560, 1200)
    paste(canvas, barrel, 620, 1210)
    paste(canvas, meteor, 820, 780)

    # Tree fringe
    for cx, fy, kind in [
        (100, 900, pine),
        (200, 960, oak),
        (960, 920, pine),
        (880, 1000, blossom),
        (60, 1400, oak),
        (160, 1500, pine),
        (980, 1480, oak),
        (90, 1750, pine),
        (990, 1780, blossom),
        (240, 1680, oak),
        (840, 1700, pine),
    ]:
        paste(canvas, kind, cx, fy)

    # Bottom loading dock — darker dirt strip
    dark = Image.new("RGBA", (TILE, TILE), (0, 0, 0, 0))
    dpx = dirt.copy()
    # multiply darken
    from PIL import ImageEnhance

    dpx = ImageEnhance.Brightness(dpx).enhance(0.55)
    for y in range(H - 340, H, TILE):
        for x in range(0, W, TILE):
            canvas.paste(dpx, (x, y), dpx)

    # Thin wood plank bar hint (pixel UI band)
    draw = ImageDraw.Draw(canvas)
    for i, c in enumerate([(90, 58, 32), (120, 78, 42), (70, 44, 24)]):
        draw.rectangle([40, H - 300 + i, W - 40, H - 298 + i], fill=c + (255,))

    rgb = canvas.convert("RGB")
    OUT.parent.mkdir(parents=True, exist_ok=True)
    rgb.save(OUT, "PNG")
    AI_DIR.mkdir(parents=True, exist_ok=True)
    rgb.save(AI_DIR / "splash-composed-from-game-assets.png", "PNG")
    print("wrote", OUT, rgb.size)


if __name__ == "__main__":
    main()
