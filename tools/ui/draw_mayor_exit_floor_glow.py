#!/usr/bin/env python3
"""Subtle doorway floor sheen for MayorHouse (no rings / arrows / doorframe).

Writes assets/textures/props/prop-exit-floor-glow.png

    python tools/ui/draw_mayor_exit_floor_glow.py
"""

from __future__ import annotations

import json
import math
from pathlib import Path

from PIL import Image

from portal_rmbg_buildings import SF_SUFFIX, UUID_MAP
from portal_rmbg_mayor_house import resolve_uuid, write_meta

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "assets/textures/props/prop-exit-floor-glow.png"
NAME = "prop-exit-floor-glow"
TW, TH = 112, 64


def draw_sheen() -> Image.Image:
    """Soft warm oval on transparent — reads as sunlight on wood, not a VFX stamp."""
    im = Image.new("RGBA", (TW, TH), (0, 0, 0, 0))
    px = im.load()
    cx, cy = (TW - 1) * 0.5, (TH - 1) * 0.52
    rx, ry = TW * 0.46, TH * 0.40
    for y in range(TH):
        for x in range(TW):
            nx = (x - cx) / rx
            ny = (y - cy) / ry
            d = math.sqrt(nx * nx + ny * ny)
            if d > 1.0:
                continue
            # Smooth falloff; pale highlight so wood still reads underneath.
            t = (1.0 - d) ** 1.45
            a = int(22 + 96 * t)  # ~22–118
            # Soft sunlit cream (lighter than floor planks)
            r = int(255 * (0.82 + 0.18 * t))
            g = int(236 * (0.78 + 0.20 * t))
            b = int(180 * (0.55 + 0.30 * t))
            r = (r // 16) * 16 + 8
            g = (g // 16) * 16 + 8
            b = (b // 16) * 16 + 8
            px[x, y] = (r, g, b, a)
    return im


def main() -> None:
    umap = json.loads(UUID_MAP.read_text(encoding="utf-8")) if UUID_MAP.exists() else {}
    out = draw_sheen()
    OUT.parent.mkdir(parents=True, exist_ok=True)
    image_uuid = resolve_uuid(OUT)
    out.save(OUT)
    write_meta(OUT, image_uuid, TW, TH, NAME, 0.5)
    umap[NAME] = {
        "texture": image_uuid,
        "spriteFrame": f"{image_uuid}@{SF_SUFFIX}",
        "prefab": umap.get(NAME, {}).get("prefab", ""),
    }
    UUID_MAP.write_text(json.dumps(umap, indent=2) + "\n", encoding="utf-8")
    print(f"OK {NAME} {TW}x{TH} -> {OUT}")


if __name__ == "__main__":
    main()
