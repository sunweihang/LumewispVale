#!/usr/bin/env python3
"""Process AI splash key art → assets/textures/ui/ui-splash.png @ 1080×2200.

Uses cover-crop only (scale + center crop). Never stretches sky/ground bands.
Keeps companion .meta UUID intact (overwrite PNG only).
Compatible with system Python 3.6 + Pillow.
"""
from __future__ import print_function

import argparse
import shutil
from pathlib import Path

from PIL import Image, ImageEnhance

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "assets" / "textures" / "ui" / "ui-splash.png"
AI_DIR = ROOT / "tools" / "ui" / "ai-source"

W, H = 1080, 2200


def cover_to_size(im, tw, th):
    """Scale with LANCZOS so both axes cover target, then center-crop. No smear pads."""
    im = im.convert("RGB")
    sw, sh = im.size
    scale = max(float(tw) / float(sw), float(th) / float(sh))
    nw = max(tw, int(round(sw * scale)))
    nh = max(th, int(round(sh * scale)))
    im = im.resize((nw, nh), Image.LANCZOS)
    x0 = max(0, (nw - tw) // 2)
    y0 = max(0, (nh - th) // 2)
    return im.crop((x0, y0, x0 + tw, y0 + th))


def darken_bottom(im, band_ratio=0.14, strength=0.72):
    """Gentle bottom dim for Start button — keeps real pixels, no stretch."""
    out = im.copy()
    h = out.height
    band = int(h * band_ratio)
    y0 = h - band
    region = ImageEnhance.Brightness(out.crop((0, y0, out.width, h))).enhance(strength)
    fade = Image.new("L", (out.width, band), 0)
    px = fade.load()
    for y in range(band):
        t = float(y) / max(1, band - 1)
        a = int(220 * (t * t))
        for x in range(out.width):
            px[x, y] = a
    out.paste(Image.composite(region, out.crop((0, y0, out.width, h)), fade), (0, y0))
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("src", type=Path, help="AI source PNG")
    ap.add_argument("--archive-name", default="splash-lumewisp-vale-ref.png")
    ap.add_argument("--no-darken", action="store_true")
    args = ap.parse_args()

    src = args.src.resolve()
    if not src.is_file():
        raise SystemExit("missing source: {}".format(src))

    AI_DIR.mkdir(parents=True, exist_ok=True)
    archive = AI_DIR / args.archive_name
    shutil.copy2(str(src), str(archive))

    im = cover_to_size(Image.open(str(src)), W, H)
    if not args.no_darken:
        im = darken_bottom(im)

    OUT.parent.mkdir(parents=True, exist_ok=True)
    im.save(str(OUT), "PNG", optimize=True)
    print("source", src, Image.open(str(src)).size)
    print("archived", archive)
    print("wrote", OUT, im.size)


if __name__ == "__main__":
    main()
