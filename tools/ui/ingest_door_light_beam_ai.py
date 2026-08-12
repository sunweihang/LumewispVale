#!/usr/bin/env python3
"""Ingest AI doorway light-beam → assets/textures/props/prop-door-light-beam.png

Source: tools/ui/ai-source/prop-door-light-beam-ai-ref.png

    python tools/ui/ingest_door_light_beam_ai.py
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

NAME = "prop-door-light-beam"
SRC = AI / "prop-door-light-beam-ai-ref.png"
OUT = PROPS / f"{NAME}.png"
TW, TH = 48, 112


def quantize_soft(im: Image.Image) -> Image.Image:
    """Snap RGB; keep soft alpha so the beam can breathe over doors."""
    px = im.load()
    w, h = im.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a < 18:
                px[x, y] = (0, 0, 0, 0)
                continue
            r = (r // 16) * 16 + 8
            g = (g // 16) * 16 + 8
            b = (b // 16) * 16 + 8
            # Cap alpha so overlapping facade art still reads
            a = min(a, 210)
            px[x, y] = (r, g, b, a)
    return im


def fit_foot(im: Image.Image, tw: int, th: int) -> Image.Image:
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
    work = quantize_soft(work)
    out = Image.new("RGBA", (tw, th), (0, 0, 0, 0))
    x = (tw - nw) // 2
    y = max(0, th - nh - 1)
    out.paste(work, (x, y), work)
    return out


def main() -> None:
    if not SRC.exists():
        raise SystemExit(f"missing AI ref: {SRC}")

    umap = json.loads(UUID_MAP.read_text(encoding="utf-8")) if UUID_MAP.exists() else {}
    PROPS.mkdir(parents=True, exist_ok=True)

    print(f"=== {NAME} <- {SRC.name} ===")
    cut = knock_gray_bg(Image.open(SRC).convert("RGBA"))
    cut = flood_corners(cut)
    out = fit_foot(cut, TW, TH)

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
    zeros = sum(1 for p in a.getdata() if p < 10)
    print(f"OK {TW}x{TH} transparent={100.0 * zeros / (TW * TH):.1f}% -> {OUT}")


if __name__ == "__main__":
    main()
