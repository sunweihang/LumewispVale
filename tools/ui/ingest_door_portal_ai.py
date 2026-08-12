#!/usr/bin/env python3
"""Ingest AI doorway portal VFX → ring + upright beam props.

Sources in tools/ui/ai-source/:
  prop-door-portal-ring-ai-ref.png  → prop-door-portal-ring.png  (ground oval)
  prop-door-portal-beam-ai-ref.png  → prop-door-portal-beam.png  (vertical light)
  prop-door-portal-ai-ref.png       → prop-door-portal.png       (combined fallback)

    python tools/ui/ingest_door_portal_ai.py
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
    # name, src stem, tw, th, pivot_y
    ("prop-door-portal-ring", "prop-door-portal-ring-ai-ref", 96, 56, 0.5),
    ("prop-door-portal-beam", "prop-door-portal-beam-ai-ref", 56, 128, 0.0),
    ("prop-door-portal", "prop-door-portal-ai-ref", 80, 144, 0.0),
)


def boost(im: Image.Image, lift: float = 1.2, a_boost: float = 1.25) -> Image.Image:
    px = im.load()
    w, h = im.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a < 14:
                px[x, y] = (0, 0, 0, 0)
                continue
            r = min(255, int(r * lift + 20))
            g = min(255, int(g * lift + 12))
            b = min(255, int(b * 0.9 + 8))
            a = min(255, int(a * a_boost + 24))
            r = (r // 8) * 8
            g = (g // 8) * 8
            b = (b // 8) * 8
            px[x, y] = (r, g, b, a)
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
    work = boost(work)
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
        nz = [v for v in a.getdata() if v > 0]
        print(
            f"  OK {tw}x{th} maxA={max(a.getdata())} "
            f"meanA_nz={sum(nz)/len(nz):.0f} pivotY={pivot_y}"
        )

    UUID_MAP.write_text(json.dumps(umap, indent=2) + "\n", encoding="utf-8")
    print("\ndone. Rebake town + indoor scenes.")


if __name__ == "__main__":
    main()
