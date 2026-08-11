#!/usr/bin/env python3
"""Rebuild mayor-house wall sprites for flush tiling.

- Refit N/S panels (plain/decor/window) to fill 128×96 edge-to-edge
- Draw continuous tall E/W side strips (no stacked horizontal bands)
- Refresh tile-wall-interior to match sage + walnut palette

    python tools/ui/draw_mayor_walls.py
"""

from __future__ import annotations

import json
import uuid
from pathlib import Path

from PIL import Image, ImageDraw

from portal_rmbg_buildings import SF_SUFFIX, TEX_SUFFIX, UUID_MAP
from portal_rmbg_mayor_house import resolve_uuid, write_meta

ROOT = Path(__file__).resolve().parents[2]
PROPS = ROOT / "assets/textures/props"
TERRAIN = ROOT / "assets/textures/terrain"
CUTOUT = ROOT / "tools/ui/ai-source/rmbg-cutout"

# Room side strip spans south rim foot → north panel top (see bake_mayor_house_scene).
SIDE_W = 40
SIDE_H = 672

# Palette (sage parlor)
WOOD = (92, 52, 32, 255)
WOOD_HI = (120, 72, 44, 255)
WOOD_LO = (64, 36, 22, 255)
OUTLINE = (28, 22, 18, 255)
SAGE = (120, 132, 88, 255)
SAGE_LT = (148, 160, 112, 255)
SAGE_DK = (96, 108, 72, 255)


def q(c: tuple[int, int, int, int]) -> tuple[int, int, int, int]:
    r, g, b, a = c
    if a < 40:
        return (0, 0, 0, 0)
    return ((r // 16) * 16 + 8, (g // 16) * 16 + 8, (b // 16) * 16 + 8, 255)


def fit_fill(src: Image.Image, tw: int, th: int) -> Image.Image:
    """Crop opaque bbox and NEAREST-scale to exactly fill tw×th (no foot pad)."""
    im = src.convert("RGBA")
    bbox = im.getbbox()
    if not bbox:
        return Image.new("RGBA", (tw, th), (0, 0, 0, 0))
    cropped = im.crop(bbox)
    # BOX downscale when huge, then NEAREST to final
    cw, ch = cropped.size
    if cw > tw * 3 or ch > th * 3:
        scale = max(tw * 2 / cw, th * 2 / ch)
        cropped = cropped.resize(
            (max(1, int(cw * scale)), max(1, int(ch * scale))), Image.BOX
        )
    out = cropped.resize((tw, th), Image.NEAREST)
    px = out.load()
    for y in range(th):
        for x in range(tw):
            px[x, y] = q(px[x, y])
    return flatten_panel_rails(out)


def flatten_panel_rails(im: Image.Image) -> Image.Image:
    """Force flush top/bottom wood rails so abutting N/S panels share one beam line."""
    w, h = im.size
    px = im.load()
    # Top rail 0..5, bottom rail h-6..h-1
    for y in range(0, 6):
        for x in range(w):
            if y == 0:
                px[x, y] = q(OUTLINE)
            elif y <= 2:
                px[x, y] = q(WOOD_HI)
            else:
                px[x, y] = q(WOOD)
    for y in range(h - 6, h):
        for x in range(w):
            if y == h - 1:
                px[x, y] = q(OUTLINE)
            elif y >= h - 3:
                px[x, y] = q(WOOD_LO)
            else:
                px[x, y] = q(WOOD)
    # Side pillar edges (keep flush vertical outline)
    for y in range(h):
        px[0, y] = q(OUTLINE)
        px[w - 1, y] = q(OUTLINE)
        if 1 <= y < h - 1:
            if px[1, y][3] > 0:
                px[1, y] = q(WOOD_HI if y < 8 or y > h - 10 else WOOD)
            if px[w - 2, y][3] > 0:
                px[w - 2, y] = q(WOOD_HI if y < 8 or y > h - 10 else WOOD)
    return im


def save_prop(name: str, im: Image.Image, tw: int, th: int, umap: dict, pivot_y: float = 0.0) -> None:
    path = PROPS / f"{name}.png"
    image_uuid = resolve_uuid(path)
    im.save(path)
    write_meta(path, image_uuid, tw, th, name, pivot_y)
    umap[name] = {
        "texture": image_uuid,
        "spriteFrame": f"{image_uuid}@{SF_SUFFIX}",
        "prefab": umap.get(name, {}).get("prefab", ""),
    }
    print(f"  OK {name} {tw}x{th}")


def save_tile(name: str, im: Image.Image, umap: dict) -> None:
    path = TERRAIN / f"{name}.png"
    image_uuid = resolve_uuid(path)
    im.save(path)
    write_meta(path, image_uuid, 64, 64, name, 0.5)
    umap[name] = {
        "texture": image_uuid,
        "spriteFrame": f"{image_uuid}@{SF_SUFFIX}",
        "prefab": umap.get(name, {}).get("prefab", ""),
    }
    print(f"  OK {name} 64x64")


def draw_motif(px, x: int, y: int, w: int, h: int) -> None:
    """Tiny fleur / leaf on sage wallpaper."""
    c = q(SAGE_LT)
    for dx, dy in ((0, 0), (0, -1), (-1, 0), (1, 0), (0, 1)):
        xx, yy = x + dx, y + dy
        if 0 <= xx < w and 0 <= yy < h:
            px[xx, yy] = c


def draw_tall_side(mirror: bool = False) -> Image.Image:
    """Continuous E/W strip: outer pillar + flat sage face + baseboard. No band stacking."""
    w, h = SIDE_W, SIDE_H
    im = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    px = im.load()
    pillar = 10
    for y in range(h):
        for x in range(w):
            # Outer pillar (left before mirror)
            if x < pillar:
                if x == 0 or y == 0 or y == h - 1:
                    px[x, y] = q(OUTLINE)
                elif x == 1 or y < 5 or y > h - 6:
                    px[x, y] = q(WOOD_HI)
                else:
                    px[x, y] = q(WOOD if (y // 4) % 3 else WOOD_LO)
                continue
            # Crown (meets north panel top rail)
            if y < 6:
                px[x, y] = q(OUTLINE if y == 0 or x == w - 1 else WOOD_HI)
                continue
            if y < 12:
                px[x, y] = q(WOOD if x < w - 1 else OUTLINE)
                continue
            # Baseboard
            if y >= h - 14:
                if y == h - 1 or x == w - 1:
                    px[x, y] = q(OUTLINE)
                elif y >= h - 3:
                    px[x, y] = q(WOOD_LO)
                else:
                    px[x, y] = q(WOOD if (x % 3) else WOOD_HI)
                continue
            # Flat sage face + sparse motif (no diagonals)
            if x == w - 1:
                px[x, y] = q(OUTLINE)
            else:
                px[x, y] = q(SAGE)
                if (x - pillar) % 8 == 4 and (y - 16) % 12 == 6:
                    draw_motif(px, x, y, w, h)
    if mirror:
        im = im.transpose(Image.FLIP_LEFT_RIGHT)
    return im


def draw_wall_tile() -> Image.Image:
    """64×64 fill: sage top / walnut wainscot bottom — matches panels."""
    im = Image.new("RGBA", (64, 64), (0, 0, 0, 0))
    px = im.load()
    split = 36
    for y in range(64):
        for x in range(64):
            if y < split:
                c = SAGE_DK if ((x + y) % 9 == 0) else SAGE
                px[x, y] = q(c)
                if x % 8 == 2 and y % 10 == 3 and 2 < y < split - 2:
                    draw_motif(px, x, y, 64, 64)
            elif y < split + 3:
                px[x, y] = q(WOOD_HI if y == split else WOOD)
            else:
                # Vertical plank suggestion
                px[x, y] = q(WOOD_LO if x % 4 == 0 else WOOD)
    return im


def load_cut_or_asset(name: str) -> Image.Image:
    cut = CUTOUT / f"{name}-rmbg.png"
    asset = PROPS / f"{name}.png"
    if cut.exists():
        return Image.open(cut).convert("RGBA")
    if asset.exists():
        return Image.open(asset).convert("RGBA")
    raise SystemExit(f"missing source for {name}")


def main() -> None:
    umap = json.loads(UUID_MAP.read_text(encoding="utf-8")) if UUID_MAP.exists() else {}

    print("=== refit N/S panels (fill 128x96) ===")
    for name in ("prop-wall-plain", "prop-wall-decor", "prop-wall-mayor"):
        src = load_cut_or_asset(name)
        save_prop(name, fit_fill(src, 128, 96), 128, 96, umap, 0.0)

    print("=== tall E/W sides ===")
    # Keep prop-wall-side as a short end-cap (48×112) for corners if needed,
    # and add prop-wall-side-tall as the continuous strip.
    short = fit_fill(load_cut_or_asset("prop-wall-side"), 48, 112)
    save_prop("prop-wall-side", short, 48, 112, umap, 0.0)

    tall_l = draw_tall_side(mirror=False)
    tall_r = draw_tall_side(mirror=True)
    save_prop("prop-wall-side-tall", tall_l, SIDE_W, SIDE_H, umap, 0.0)
    # Right variant reuses same key via bake flip — also save mirrored asset for editors.
    save_prop("prop-wall-side-tall-r", tall_r, SIDE_W, SIDE_H, umap, 0.0)

    print("=== wall fill tile ===")
    save_tile("tile-wall-interior", draw_wall_tile(), umap)

    UUID_MAP.write_text(json.dumps(umap, indent=2) + "\n", encoding="utf-8")
    print("\ndone. Bake: python tools/ui/bake_mayor_house_scene.py")


if __name__ == "__main__":
    main()
