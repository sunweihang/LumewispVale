#!/usr/bin/env python3
"""Crop the G-coin from ui-info-gold.png → assets/textures/ui/ic-gold.png.

Keeps existing .meta UUID so RewardFrames / MaterialFrames stay valid.
Matches the top-right info board currency icon.
"""
from __future__ import annotations

from pathlib import Path

from PIL import Image

try:
    RESAMPLE_NEAREST = Image.Resampling.NEAREST
except AttributeError:
    RESAMPLE_NEAREST = Image.NEAREST

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "assets/textures/ui/ui-info-gold.png"
OUT = ROOT / "assets/textures/ui/ic-gold.png"
OUT_SIZE = 96


def main():
    im = Image.open(SRC).convert("RGBA")
    w, h = im.size
    # Coin sits in the left circular well (~square of the bar height).
    side = h
    crop = im.crop((0, 0, side, side))

    # Knock wood / cream frame → transparent; keep gold coin + dark rim.
    px = crop.load()
    for y in range(side):
        for x in range(side):
            r, g, b, a = px[x, y]
            if a == 0:
                continue
            # Cream digit field / pale inset
            if r > 200 and g > 180 and b > 140 and (r + g + b) > 540:
                px[x, y] = (0, 0, 0, 0)
                continue
            # Wood grain (warm brown, not metallic gold)
            bright = (r + g + b) / 3
            if r < 160 and g < 110 and b < 70 and bright < 120:
                # Keep near-black coin outline / G stem if very dark and circular center
                cx, cy = (side - 1) / 2.0, (side - 1) / 2.0
                d = ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2) ** 0.5
                coin_r = side * 0.38
                if d > coin_r + 1:
                    px[x, y] = (0, 0, 0, 0)
                continue
            # Soft wood mid-tones outside coin
            cx, cy = (side - 1) / 2.0, (side - 1) / 2.0
            d = ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2) ** 0.5
            coin_r = side * 0.40
            if d > coin_r + 2:
                px[x, y] = (0, 0, 0, 0)

    # Trim to opaque bbox, pad square, nearest upscale.
    bbox = crop.getbbox()
    if not bbox:
        raise SystemExit("empty crop")
    coin = crop.crop(bbox)
    cw, ch = coin.size
    pad = max(cw, ch) + 4
    square = Image.new("RGBA", (pad, pad), (0, 0, 0, 0))
    square.paste(coin, ((pad - cw) // 2, (pad - ch) // 2), coin)
    out = square.resize((OUT_SIZE, OUT_SIZE), RESAMPLE_NEAREST)
    out.save(OUT)
    print("wrote", OUT, out.size)


if __name__ == "__main__":
    main()
