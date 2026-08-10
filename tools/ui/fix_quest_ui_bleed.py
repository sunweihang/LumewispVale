#!/usr/bin/env python3
"""Expand quest UI chrome to full-bleed canvases (fix letterboxed plaques).

AI ingest left row/tracker/btn art as small plaques centered in large transparent
pads. When Cocos stretches them to layout width the wood plate stays ~half-wide
and text/icons sit outside the frame.

  C:/Users/elex/scoop/apps/python310/current/python.exe tools/ui/fix_quest_ui_bleed.py
"""
from __future__ import print_function

from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
OUT_DIR = ROOT / "assets/textures/ui"

# Keep existing canvas sizes so .meta sprite-frame rects stay valid.
TARGETS = {
    "ui-quest-row.png": (320, 48),
    "ui-quest-row-active.png": (320, 56),
    "ui-quest-row-done.png": (320, 48),
    "ui-quest-tracker.png": (320, 60),
    "ui-quest-btn-secondary.png": (132, 48),
    "ui-quest-btn-primary.png": (152, 48),
    "ui-quest-panel.png": (400, 540),
}

try:
    RESAMPLE = Image.Resampling.NEAREST
except AttributeError:
    RESAMPLE = Image.NEAREST


def opaque_bbox(im, a_min=16, pad=1):
    px = im.load()
    w, h = im.size
    minx, miny, maxx, maxy = w, h, -1, -1
    for y in range(h):
        for x in range(w):
            if px[x, y][3] >= a_min:
                if x < minx:
                    minx = x
                if y < miny:
                    miny = y
                if x > maxx:
                    maxx = x
                if y > maxy:
                    maxy = y
    if maxx < 0:
        return None
    minx = max(0, minx - pad)
    miny = max(0, miny - pad)
    maxx = min(w - 1, maxx + pad)
    maxy = min(h - 1, maxy + pad)
    return (minx, miny, maxx + 1, maxy + 1)


def fill_bleed(im, tw, th, edge=2):
    """Crop opaque art and nearest-stretch to nearly fill the canvas."""
    im = im.convert("RGBA")
    box = opaque_bbox(im)
    if not box:
        return Image.new("RGBA", (tw, th), (0, 0, 0, 0))
    cut = im.crop(box)
    # Stretch to fill — rows/buttons must be full-width plates, not letterboxed.
    inner_w = max(1, tw - edge * 2)
    inner_h = max(1, th - edge * 2)
    stretched = cut.resize((inner_w, inner_h), RESAMPLE)
    out = Image.new("RGBA", (tw, th), (0, 0, 0, 0))
    out.paste(stretched, (edge, edge), stretched)
    return out


def main():
    for name, (tw, th) in TARGETS.items():
        path = OUT_DIR / name
        if not path.exists():
            print("skip missing", name)
            continue
        src = Image.open(path).convert("RGBA")
        before = opaque_bbox(src)
        out = fill_bleed(src, tw, th)
        after = opaque_bbox(out)
        out.save(path)
        bw = (before[2] - before[0]) if before else 0
        aw = (after[2] - after[0]) if after else 0
        print(
            "%s: content %d→%d / %d (%.0f%%→%.0f%%)"
            % (name, bw, aw, tw, 100.0 * bw / tw if tw else 0, 100.0 * aw / tw if tw else 0)
        )


if __name__ == "__main__":
    main()
