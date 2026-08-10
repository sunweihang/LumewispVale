#!/usr/bin/env python3
"""Ingest AI grass→dirt fringe drafts → transparent 64×64 overlays (keep .meta UUIDs).

AI draws edges AND corners; this script only chroma-keys + installs.
Does not invent silhouettes or compose L-shaped corners from edges.
"""

import json
import shutil
from pathlib import Path
from typing import Dict

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
TOOLS = Path(__file__).resolve().parent
AI_DIR = TOOLS / "ai-source"
CURSOR_ASSETS = Path("/Users/sunix/.cursor/projects/Users-Custom-LumewispVale/assets")
TERRAIN = ROOT / "assets/textures/terrain"

# Cursor GenerateImage outputs → installed stems
SRC = {
    "n": "ai-fringe-n.png",
    "e": "ai-fringe-e.png",
    "s": "ai-fringe-s.png",
    "w": "ai-fringe-w.png",
    "out-ne": "ai-fringe-out-ne.png",
    "out-nw": "ai-fringe-out-nw.png",
    "out-se": "ai-fringe-out-se.png",
    "out-sw": "ai-fringe-out-sw.png",
    "in-ne": "ai-fringe-in-ne.png",
    "in-nw": "ai-fringe-in-nw.png",
    "in-se": "ai-fringe-in-se.png",
    "in-sw": "ai-fringe-in-sw.png",
}

DEST = {k: f"tile-fringe-{k}.png" for k in SRC}

# Expected grass mass side for edge tiles (corners skip auto-rotate)
EDGE_SIDE = {"n": "n", "e": "e", "s": "s", "w": "w"}


def find_src(name: str) -> Path:
    for base in (CURSOR_ASSETS, AI_DIR):
        p = base / name
        if p.exists():
            return p
    raise FileNotFoundError(name)


def is_magenta(r: int, g: int, b: int) -> bool:
    return r > 170 and b > 170 and g < 140


def is_dirt_yellow(r: int, g: int, b: int) -> bool:
    return r > 140 and g > 90 and b < 120 and r >= g - 10 and (r - b) > 40


def is_grassish(r: int, g: int, b: int) -> bool:
    return g > 40 and g >= r - 8 and g >= b - 8 and g > r - 25


def is_lip_brown(r: int, g: int, b: int) -> bool:
    return (
        r > g
        and g >= b
        and 40 <= r <= 140
        and g <= 95
        and b <= 70
        and (r - b) > 18
        and (r - g) >= 6
    )


def fit64(im: Image.Image) -> Image.Image:
    """Center-crop square, soft downsample to 64 (keep AI silhouette)."""
    im = im.convert("RGBA")
    w, h = im.size
    side = min(w, h)
    left = (w - side) // 2
    top = (h - side) // 2
    im = im.crop((left, top, left + side, top + side))
    # One soft downsample — avoid 48→NEAREST which square-pixelates the lip
    return im.resize((64, 64), getattr(Image, "Resampling", Image).BOX if hasattr(Image, "Resampling") else Image.BOX)


def extract_overlay(im: Image.Image) -> Image.Image:
    """Keep AI grass + sod lip colors; drop dirt / magenta."""
    im = fit64(im)
    px = im.load()
    out = Image.new("RGBA", (64, 64), (0, 0, 0, 0))
    opx = out.load()
    for y in range(64):
        for x in range(64):
            r, g, b, a = px[x, y]
            if a < 20 or is_magenta(r, g, b) or is_dirt_yellow(r, g, b):
                continue
            if r > 210 and g > 210 and b > 210:
                continue
            if is_lip_brown(r, g, b):
                # Keep lip close to AI (slightly deepen)
                opx[x, y] = (max(50, r - 8), max(28, g - 10), max(16, b - 8), 255)
            elif is_grassish(r, g, b):
                opx[x, y] = (r, g, b, 255)
    return out


def coverage_scores(im: Image.Image) -> Dict[str, float]:
    px = im.load()

    def depth_n():
        total = 0
        for x in range(64):
            d = 0
            for y in range(64):
                if px[x, y][3] > 0:
                    d = y + 1
                else:
                    break
            total += d
        return total / 64

    def depth_s():
        total = 0
        for x in range(64):
            d = 0
            for y in range(63, -1, -1):
                if px[x, y][3] > 0:
                    d = 64 - y
                else:
                    break
            total += d
        return total / 64

    def depth_w():
        total = 0
        for y in range(64):
            d = 0
            for x in range(64):
                if px[x, y][3] > 0:
                    d = x + 1
                else:
                    break
            total += d
        return total / 64

    def depth_e():
        total = 0
        for y in range(64):
            d = 0
            for x in range(63, -1, -1):
                if px[x, y][3] > 0:
                    d = 64 - x
                else:
                    break
            total += d
        return total / 64

    return {"n": depth_n(), "s": depth_s(), "w": depth_w(), "e": depth_e()}


def ensure_side_coverage(im: Image.Image, side: str) -> Image.Image:
    scores = coverage_scores(im)
    best = max(scores, key=scores.get)
    order = ["n", "w", "s", "e"]  # each CCW step
    bi = order.index(best)
    si = order.index(side)
    k = (si - bi) % 4
    if k:
        im = im.rotate(90 * k, expand=False)
    return im


def quadrant_mass(im: Image.Image) -> Dict[str, int]:
    px = im.load()
    q = {"ne": 0, "nw": 0, "se": 0, "sw": 0}
    for y in range(64):
        for x in range(64):
            if px[x, y][3] <= 0:
                continue
            key = ("n" if y < 32 else "s") + ("e" if x >= 32 else "w")
            q[key] += 1
    return q


def ensure_corner_mass(im: Image.Image, corner: str, kind: str) -> Image.Image:
    """Rotate so grass mass sits in the expected quadrant for out/in corners."""
    # outer: grass mass in named corner; inner: dirt pocket opposite, grass elsewhere
    target = corner  # ne/nw/se/sw
    best = im
    best_score = -1
    for k in range(4):
        cand = im.rotate(90 * k, expand=False)
        q = quadrant_mass(cand)
        if kind == "out":
            score = q[target]
        else:
            # inner: want LEAST grass in the dirt pocket (= opposite of corner name?)
            # in-ne → dirt pocket SW → maximize grass in N+E = ne+nw+se roughly, minimize sw
            opp = {"ne": "sw", "nw": "se", "se": "nw", "sw": "ne"}[target]
            score = sum(q.values()) - q[opp] * 2
        if score > best_score:
            best_score = score
            best = cand
    return best


def patch_meta(meta_path: Path):
    if not meta_path.exists():
        return
    meta = json.loads(meta_path.read_text(encoding="utf-8"))
    for sub in meta.get("subMetas", {}).values():
        ud = sub.get("userData", {})
        if sub.get("importer") == "texture":
            ud["minfilter"] = "nearest"
            ud["magfilter"] = "nearest"
            ud["mipfilter"] = "none"
        if sub.get("importer") == "sprite-frame":
            ud["width"] = 64
            ud["height"] = 64
            ud["rawWidth"] = 64
            ud["rawHeight"] = 64
            ud["trimX"] = 0
            ud["trimY"] = 0
            ud["offsetX"] = 0
            ud["offsetY"] = 0
            ud["pivotX"] = 0.5
            ud["pivotY"] = 0.5
    meta_path.write_text(json.dumps(meta, indent=2) + "\n", encoding="utf-8")


def install(img: Image.Image, dest_name: str):
    dest = TERRAIN / dest_name
    img.save(dest)
    patch_meta(Path(str(dest) + ".meta"))
    opaque = sum(1 for p in img.getdata() if p[3] > 0)
    print(f"OK {dest_name} opaque={opaque}")


def main():
    AI_DIR.mkdir(parents=True, exist_ok=True)
    installed: dict[str, Image.Image] = {}

    for key, src_name in SRC.items():
        src = find_src(src_name)
        arch = AI_DIR / src_name
        if src.resolve() != arch.resolve():
            shutil.copy2(src, arch)
        overlay = extract_overlay(Image.open(src))
        if key in EDGE_SIDE:
            overlay = ensure_side_coverage(overlay, EDGE_SIDE[key])
        elif key.startswith("out-"):
            overlay = ensure_corner_mass(overlay, key.split("-")[1], "out")
        elif key.startswith("in-"):
            overlay = ensure_corner_mass(overlay, key.split("-")[1], "in")
        installed[key] = overlay
        install(overlay, DEST[key])

    # Preview strip
    prev = Image.new("RGBA", (64 * 4, 64 * 3), (40, 40, 40, 255))
    order = [
        ["n", "e", "s", "w"],
        ["in-ne", "in-nw", "in-se", "in-sw"],
        ["out-ne", "out-nw", "out-se", "out-sw"],
    ]
    for row, names in enumerate(order):
        for col, stem in enumerate(names):
            im = installed[stem]
            prev.paste(im, (col * 64, row * 64), im)
    prev_path = AI_DIR / "fringe-preview.png"
    nearest = getattr(getattr(Image, "Resampling", Image), "NEAREST", Image.NEAREST)
    prev.resize((prev.width * 2, prev.height * 2), nearest).save(prev_path)
    print(f"Wrote {prev_path}")


if __name__ == "__main__":
    main()
