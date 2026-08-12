#!/usr/bin/env python3
"""Bright doorway light pillar for outdoor/indoor enterable doors.

Rewrites assets/textures/props/prop-door-light-beam.png (keeps .meta UUID).
Uses AI ref if present, then boosts core brightness + alpha so it reads on
daytime facades; falls back to a procedural pillar.

    python tools/ui/draw_door_light_beam.py
"""

from __future__ import annotations

import json
import math
from pathlib import Path

from PIL import Image

from portal_rmbg_buildings import SF_SUFFIX, UUID_MAP
from portal_rmbg_mayor_house import resolve_uuid, write_meta
from process_bag_ai import flood_corners, knock_gray_bg

ROOT = Path(__file__).resolve().parents[2]
AI = Path(__file__).resolve().parent / "ai-source"
PROPS = ROOT / "assets/textures/props"

NAME = "prop-door-light-beam"
SRC = AI / "prop-door-light-beam-ai-ref.png"
OUT = PROPS / f"{NAME}.png"
TW, TH = 56, 128


def procedural() -> Image.Image:
    im = Image.new("RGBA", (TW, TH), (0, 0, 0, 0))
    px = im.load()
    cx = (TW - 1) * 0.5
    for y in range(TH):
        # Taper: wider near foot, softer tip
        t = y / max(TH - 1, 1)
        half = 6.5 + 10.0 * (1.0 - t) ** 0.55
        for x in range(TW):
            dx = abs(x - cx) / half
            if dx > 1.35:
                continue
            # Core brighter; outer glow softer
            core = max(0.0, 1.0 - dx)
            glow = max(0.0, 1.0 - dx / 1.35)
            # Vertical falloff — keep base readable
            vert = 0.55 + 0.45 * math.sin(math.pi * min(1.0, t * 1.05))
            vert *= 0.75 + 0.25 * (1.0 - t)
            a = int(min(255, (40 + 215 * (core ** 1.1) + 90 * (glow ** 2)) * vert))
            if a < 12:
                continue
            # Warm white-gold (reads on tan wood)
            r = int(255)
            g = int(236 + 19 * core)
            b = int(140 + 70 * core)
            r = min(255, (r // 8) * 8)
            g = min(255, (g // 8) * 8)
            b = min(255, (b // 8) * 8)
            px[x, y] = (r, g, b, a)
    # Sparkles
    sparks = (
        (TW // 2, int(TH * 0.22)),
        (TW // 2 - 4, int(TH * 0.38)),
        (TW // 2 + 5, int(TH * 0.48)),
        (TW // 2 - 2, int(TH * 0.62)),
        (TW // 2 + 3, int(TH * 0.74)),
        (TW // 2, int(TH * 0.88)),
    )
    for sx, sy in sparks:
        for ox, oy in ((0, 0), (1, 0), (-1, 0), (0, 1), (0, -1)):
            x, y = sx + ox, sy + oy
            if 0 <= x < TW and 0 <= y < TH:
                a = 255 if ox == 0 and oy == 0 else 200
                px[x, y] = (255, 255, 220, a)
    return im


def from_ai() -> Image.Image | None:
    if not SRC.exists():
        return None
    cut = knock_gray_bg(Image.open(SRC).convert("RGBA"))
    cut = flood_corners(cut)
    bbox = cut.getbbox()
    if not bbox:
        return None
    cropped = cut.crop(bbox)
    cw, ch = cropped.size
    pad = 2
    scale = min((TW - pad * 2) / float(cw), (TH - pad * 2) / float(ch))
    nw = max(1, int(round(cw * scale)))
    nh = max(1, int(round(ch * scale)))
    work = cropped
    if cw > TW * 2 or ch > TH * 2:
        work = cropped.resize((nw, nh), Image.BOX)
    work = work.resize((nw, nh), Image.NEAREST)
    # Boost: lift luminance + alpha so daytime facades don't wash it out
    px = work.load()
    for y in range(nh):
        for x in range(nw):
            r, g, b, a = px[x, y]
            if a < 16:
                px[x, y] = (0, 0, 0, 0)
                continue
            # Push toward warm white-gold
            r = min(255, int(r * 1.15 + 40))
            g = min(255, int(g * 1.10 + 28))
            b = min(255, int(b * 0.85 + 10))
            a = min(255, int(a * 1.35 + 40))
            r = (r // 8) * 8
            g = (g // 8) * 8
            b = (b // 8) * 8
            px[x, y] = (r, g, b, a)
    out = Image.new("RGBA", (TW, TH), (0, 0, 0, 0))
    x = (TW - nw) // 2
    y = max(0, TH - nh - 1)
    out.paste(work, (x, y), work)
    # Composite a brighter procedural core so the pillar always pops
    core = procedural()
    return Image.alpha_composite(out, core)


def main() -> None:
    umap = json.loads(UUID_MAP.read_text(encoding="utf-8")) if UUID_MAP.exists() else {}
    PROPS.mkdir(parents=True, exist_ok=True)
    out = from_ai()
    if out is None:
        print("AI ref missing/empty — procedural only")
        out = procedural()
    else:
        print(f"AI+boost <- {SRC.name}")

    image_uuid = resolve_uuid(OUT)
    out.save(OUT)
    write_meta(OUT, image_uuid, TW, TH, NAME, 0.0)
    umap[NAME] = {
        "texture": image_uuid,
        "spriteFrame": f"{image_uuid}@{SF_SUFFIX}",
        "prefab": umap.get(NAME, {}).get("prefab", ""),
    }
    UUID_MAP.write_text(json.dumps(umap, indent=2) + "\n", encoding="utf-8")
    a = out.split()[3]
    nz = [v for v in a.getdata() if v > 0]
    print(
        f"OK {TW}x{TH} maxA={max(a.getdata())} meanA_nz={sum(nz)/len(nz):.0f} -> {OUT}"
    )


if __name__ == "__main__":
    main()
