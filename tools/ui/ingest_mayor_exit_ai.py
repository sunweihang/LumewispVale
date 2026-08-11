#!/usr/bin/env python3
"""Ingest mayor-house exit FX AI refs → props (glow / ripple / arrow).

Sources in tools/ui/ai-source/:
  prop-exit-glow-ai-ref.png
  prop-exit-ripple-ai-ref.png
  prop-exit-arrow-ai-ref.png

    python tools/ui/ingest_mayor_exit_ai.py
"""

from __future__ import annotations

import json
from pathlib import Path

from PIL import Image

from portal_rmbg_buildings import SF_SUFFIX, UUID_MAP
from portal_rmbg_mayor_house import resolve_uuid, write_meta
from process_bag_ai import flood_corners, knock_gray_bg

ROOT = Path(__file__).resolve().parents[2]
AI = Path(__file__).resolve().parent / "ai-source"
PROPS = ROOT / "assets/textures/props"

JOBS = (
    # name, src stem, tw, th, pivot_y (0 foot, 0.5 center)
    ("prop-exit-glow", "prop-exit-glow-ai-ref", 128, 96, 0.0),
    ("prop-exit-ripple", "prop-exit-ripple-ai-ref", 96, 96, 0.5),
    ("prop-exit-arrow", "prop-exit-arrow-ai-ref", 48, 48, 0.5),
)


def quantize(im: Image.Image) -> Image.Image:
    px = im.load()
    w, h = im.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a < 40:
                px[x, y] = (0, 0, 0, 0)
                continue
            r = (r // 16) * 16 + 8
            g = (g // 16) * 16 + 8
            b = (b // 16) * 16 + 8
            px[x, y] = (r, g, b, 255 if a > 128 else a)
    return im


def fit(im: Image.Image, tw: int, th: int, pivot_y: float) -> Image.Image:
    bbox = im.getbbox()
    if not bbox:
        return Image.new("RGBA", (tw, th), (0, 0, 0, 0))
    cropped = im.crop(bbox)
    cw, ch = cropped.size
    pad = 2
    scale = min((tw - pad * 2) / float(cw), (th - pad * 2) / float(ch))
    nw = max(1, int(round(cw * scale)))
    nh = max(1, int(round(ch * scale)))
    work = cropped
    if cw > tw * 2 or ch > th * 2:
        work = cropped.resize((nw, nh), Image.BOX)
    work = work.resize((nw, nh), Image.NEAREST)
    work = quantize(work)
    out = Image.new("RGBA", (tw, th), (0, 0, 0, 0))
    x = (tw - nw) // 2
    if pivot_y < 0.25:
        y = max(0, th - nh - 1)
    else:
        y = (th - nh) // 2
    out.paste(work, (x, y), work)
    return out


def main() -> None:
    umap = json.loads(UUID_MAP.read_text(encoding="utf-8")) if UUID_MAP.exists() else {}
    PROPS.mkdir(parents=True, exist_ok=True)

    for name, stem, tw, th, pivot_y in JOBS:
        src = AI / f"{stem}.png"
        if not src.exists():
            print("SKIP missing", src)
            continue
        print(f"=== {name} <- {src.name} ===")
        cut = knock_gray_bg(Image.open(src).convert("RGBA"))
        cut = flood_corners(cut)
        out = fit(cut, tw, th, pivot_y)
        path = PROPS / f"{name}.png"
        image_uuid = resolve_uuid(path)
        out.save(path)
        write_meta(path, image_uuid, tw, th, name, pivot_y)
        umap[name] = {
            "texture": image_uuid,
            "spriteFrame": f"{image_uuid}@{SF_SUFFIX}",
            "prefab": umap.get(name, {}).get("prefab", ""),
        }
        a = out.split()[3]
        zeros = sum(1 for p in a.getdata() if p < 10)
        print(f"  OK {tw}x{th} transparent={100.0 * zeros / (tw * th):.1f}%")

    UUID_MAP.write_text(json.dumps(umap, indent=2) + "\n", encoding="utf-8")
    print("\ndone. Bake: python tools/ui/bake_mayor_house_scene.py")


if __name__ == "__main__":
    main()
