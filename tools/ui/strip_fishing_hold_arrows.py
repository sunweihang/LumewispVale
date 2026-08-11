#!/usr/bin/env python3
"""Strip center chevrons from fishing hold pads (keep rim, blank face)."""

from __future__ import print_function

from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
UI = ROOT / "assets/textures/ui"


def erase_center_icon(path, fill_rgb, face_r=52):
    """Paint a flat face disc so any center chevron / icon is gone."""
    im = Image.open(path).convert("RGBA")
    px = im.load()
    w, h = im.size
    cx, cy = w // 2, h // 2
    print(path.name, "fill", fill_rgb, "center was", px[cx, cy])

    changed = 0
    for y in range(h):
        for x in range(w):
            if (x - cx) ** 2 + (y - cy) ** 2 > face_r * face_r:
                continue
            if px[x, y][3] < 200:
                continue
            px[x, y] = (fill_rgb[0], fill_rgb[1], fill_rgb[2], 255)
            changed += 1

    im.save(path)
    print("  filled", changed, "pixels; new center", px[cx, cy])


def finger_tip_offset():
    im = Image.open(UI / "ui-fishing-finger.png").convert("RGBA")
    px = im.load()
    w, h = im.size
    tip = None
    for y in range(h - 1, -1, -1):
        xs = [x for x in range(w) if px[x, y][3] > 200]
        if not xs:
            continue
        # Prefer dark outline pixels on this row (true tip edge).
        dark = [x for x in xs if sum(px[x, y][:3]) < 140]
        use = dark if dark else xs
        tip = (sum(use) / len(use), float(y))
        break
    print("finger tip", tip, "offset from 48,48", (tip[0] - 48, tip[1] - 48) if tip else None)


def main():
    # Match the solid face colors already used by the pads.
    erase_center_icon(UI / "ui-fishing-hold.png", (113, 144, 47))
    erase_center_icon(UI / "ui-fishing-hold-release.png", (185, 107, 17))
    finger_tip_offset()


if __name__ == "__main__":
    main()
