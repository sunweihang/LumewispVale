#!/usr/bin/env python3
"""AI-only fishing catch bar → assets/textures/ui/ui-fishing-bar.png

Sources (first hit wins):
  tools/ui/ai-source/fishing-bar-stardew-ai-ref.png
  tools/ui/ai-source/fishing-bar-wide-ai-ref.png
  tools/ui/ai-source/fishing-bar-ai-ref.png

No procedural drawing — only knock bg / crop / nearest scale.
Forces the paddle to fill the cell so 9-slice cannot collapse to a hairline.

  /usr/local/bin/python3 tools/ui/ingest_fishing_bar_ai.py
"""

import json
from collections import deque
from pathlib import Path

from PIL import Image

try:
    RESAMPLE_BOX = Image.Resampling.BOX
    RESAMPLE_NEAREST = Image.Resampling.NEAREST
except AttributeError:
    RESAMPLE_BOX = Image.BOX
    RESAMPLE_NEAREST = Image.NEAREST

ROOT = Path(__file__).resolve().parents[2]
SRC = Path(__file__).resolve().parent / "ai-source"
OUT = ROOT / "assets/textures/ui" / "ui-fishing-bar.png"
W, H = 48, 104
OUTLINE = (18, 68, 12, 255)

CANDIDATES = (
    "fishing-bar-stardew-ai-ref.png",
    "fishing-bar-wide-ai-ref.png",
    "fishing-bar-ai-ref.png",
)


def knock_bg(im: Image.Image) -> Image.Image:
    im = im.convert("RGBA")
    px = im.load()
    w, h = im.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a == 0:
                continue
            chroma = max(r, g, b) - min(r, g, b)
            bright = (r + g + b) / 3.0
            if chroma < 28 and 75 <= bright <= 195:
                px[x, y] = (0, 0, 0, 0)
            elif bright >= 230 and chroma < 35:
                px[x, y] = (0, 0, 0, 0)
    return im


def flood_corners(im: Image.Image, tol: int = 30) -> Image.Image:
    im = im.convert("RGBA")
    w, h = im.size
    px = im.load()
    seeds = [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1), (w // 2, 0), (w // 2, h - 1)]
    seen = set()
    stack = list(seeds)
    while stack:
        x, y = stack.pop()
        if (x, y) in seen or not (0 <= x < w and 0 <= y < h):
            continue
        seen.add((x, y))
        r, g, b, a = px[x, y]
        if a == 0:
            continue
        bright = (r + g + b) / 3.0
        chroma = max(r, g, b) - min(r, g, b)
        # Keep green paddle body.
        if g > r + 12 and g > b + 8 and bright > 50:
            continue
        if chroma > 38 and bright < 205:
            continue
        if bright < 50:
            continue
        px[x, y] = (0, 0, 0, 0)
        for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
            if 0 <= nx < w and 0 <= ny < h and (nx, ny) not in seen:
                nr, ng, nb, na = px[nx, ny]
                if na and abs(nr - r) <= tol and abs(ng - g) <= tol and abs(nb - b) <= tol:
                    stack.append((nx, ny))
    return im


def crop_opaque(im: Image.Image) -> Image.Image:
    px = im.load()
    w, h = im.size
    xs = [x for y in range(h) for x in range(w) if px[x, y][3] > 20]
    ys = [y for y in range(h) for x in range(w) if px[x, y][3] > 20]
    if not xs:
        raise SystemExit("no opaque pixels in AI bar")
    return im.crop((min(xs), min(ys), max(xs) + 1, max(ys) + 1))


def outline(im: Image.Image) -> Image.Image:
    px = im.load()
    w, h = im.size
    opaque = [(x, y) for y in range(h) for x in range(w) if px[x, y][3] > 0]
    for x, y in opaque:
        for dx, dy in ((-1, 0), (1, 0), (0, -1), (0, 1)):
            nx, ny = x + dx, y + dy
            if not (0 <= nx < w and 0 <= ny < h) or px[nx, ny][3] == 0:
                px[x, y] = OUTLINE
                break
    return im


def update_meta(png: Path) -> None:
    meta_path = Path(str(png) + ".meta")
    if not meta_path.exists():
        return
    meta = json.loads(meta_path.read_text(encoding="utf-8"))
    sf = meta["subMetas"]["f9941"]["userData"]
    sf["width"] = W
    sf["height"] = H
    sf["rawWidth"] = W
    sf["rawHeight"] = H
    # Vertical slice only — never left/right (prevents hairline collapse).
    sf["borderTop"] = 18
    sf["borderBottom"] = 18
    sf["borderLeft"] = 0
    sf["borderRight"] = 0
    hw, hh = W / 2.0, H / 2.0
    sf["vertices"] = {
        "rawPosition": [-hw, -hh, 0, hw, -hh, 0, -hw, hh, 0, hw, hh, 0],
        "indexes": [0, 1, 2, 2, 1, 3],
        "uv": [0, H, W, H, 0, 0, W, 0],
        "nuv": [0, 0, 1, 0, 0, 1, 1, 1],
        "minPos": [-hw, -hh, 0],
        "maxPos": [hw, hh, 0],
    }
    meta_path.write_text(json.dumps(meta, indent=2) + "\n", encoding="utf-8")


def main() -> None:
    src = None
    for name in CANDIDATES:
        p = SRC / name
        if p.exists():
            src = p
            break
    if src is None:
        raise SystemExit("missing AI bar ref in {}".format(SRC))

    im = Image.open(src).convert("RGBA")
    im = knock_bg(im)
    im = flood_corners(im)
    crop = crop_opaque(im)
    print("src", src.name, "crop", crop.size)

    tw, th = W - 2, H - 2
    tmp = crop.resize((max(12, tw // 2), max(24, th // 2)), RESAMPLE_BOX)
    scaled = tmp.resize((tw, th), RESAMPLE_NEAREST)
    canvas = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    canvas.paste(scaled, (1, 1), scaled)
    px = canvas.load()
    for y in range(H):
        for x in range(W):
            r, g, b, a = px[x, y]
            px[x, y] = (0, 0, 0, 0) if a < 20 else (r, g, b, 255)
    canvas = outline(canvas)

    xs = [x for y in range(H) for x in range(W) if px[x, y][3] > 20]
    print("content width", max(xs) - min(xs) + 1)

    OUT.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(OUT)
    update_meta(OUT)
    print("OK", OUT.relative_to(ROOT))


if __name__ == "__main__":
    main()
