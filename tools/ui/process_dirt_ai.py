#!/usr/bin/env python3
"""Ingest AI dirt tiles → 64×64 terrain (keep .meta UUIDs), lock to world.dirt #D29E2A."""

import json
import shutil
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
TOOLS = Path(__file__).resolve().parent
AI_DIR = TOOLS / "ai-source"
CURSOR_ASSETS = Path("/Users/sunix/.cursor/projects/Users-Custom-LumewispVale/assets")
TARGET = (0xD2, 0x9E, 0x2A)  # world.dirt

JOBS = [
    # Prefer v3 AI drafts when present (richer grit than flat procedural).
    # (stem, dest, contrast boost — only used by legacy lock_to_dirt)
    ("ai-dirt-v3", ROOT / "assets/textures/terrain/tile-dirt.png", 1.0),
    ("ai-dirt-b-v3", ROOT / "assets/textures/terrain/tile-dirt-b.png", 2.2),
    # Fallbacks if v3 missing
    ("ai-dirt", ROOT / "assets/textures/terrain/tile-dirt.png", 1.0),
    ("ai-dirt-b", ROOT / "assets/textures/terrain/tile-dirt-b.png", 2.2),
]


def quantize(img):
    px = img.load()
    w, h = img.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a < 40:
                px[x, y] = (0, 0, 0, 0)
            else:
                px[x, y] = (r // 16 * 16 + 8, g // 16 * 16 + 8, b // 16 * 16 + 8, 255)
    return img


def fit_tile(im, tw=64, th=64):
    im = im.convert("RGBA")
    w, h = im.size
    side = min(w, h)
    left = (w - side) // 2
    top = (h - side) // 2
    im = im.crop((left, top, left + side, top + side))
    if side > tw * 2:
        small = max(tw, side // 8)
        im = im.resize((small, small), Image.BOX)
    im = im.resize((tw, th), Image.NEAREST)
    return im


def mean_rgb(im):
    px = list(im.convert("RGB").getdata())
    n = max(1, len(px))
    return tuple(sum(c[i] for c in px) // n for i in range(3))


def lock_to_dirt(im, target=TARGET, boost=1.0):
    """
    Keep AI accent placement, snap quiet areas to world.dirt.
    Accent colors stay near-value ochres (Stardew soft grit, not muddy noise).
    """
    soft = (196, 144, 36)
    soft2 = (180, 128, 32)
    light = (230, 180, 64)
    mid = (220, 168, 48)

    im = im.convert("RGBA")
    mr, mg, mb = mean_rgb(im)
    dr, dg, db = target[0] - mr, target[1] - mg, target[2] - mb
    tlum = 0.3 * target[0] + 0.6 * target[1] + 0.1 * target[2]
    px = im.load()
    w, h = im.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a < 40:
                continue
            r = max(0, min(255, r + dr))
            g = max(0, min(255, g + dg))
            b = max(0, min(255, b + db))
            lum = 0.3 * r + 0.6 * g + 0.1 * b
            delta = (lum - tlum) * boost
            if delta < -14:
                px[x, y] = soft2 + (255,)
            elif delta < -6:
                px[x, y] = soft + (255,)
            elif delta > 12:
                px[x, y] = light + (255,)
            elif abs(delta) > 3.5:
                px[x, y] = mid + (255,)
            else:
                px[x, y] = target + (255,)
    return im


def fit_tile_crisp(im, tw=64, th=64, author=48):
    """Downsample via BOX then NEAREST up — keep chunky grit clusters."""
    im = im.convert("RGBA")
    w, h = im.size
    side = min(w, h)
    left = (w - side) // 2
    top = (h - side) // 2
    im = im.crop((left, top, left + side, top + side))
    im = im.resize((author, author), Image.BOX)
    im = im.resize((tw, th), Image.NEAREST)
    return im


def patch_meta(meta_path, w=64, h=64):
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
            ud.update(
                {
                    "width": w,
                    "height": h,
                    "rawWidth": w,
                    "rawHeight": h,
                    "trimX": 0,
                    "trimY": 0,
                    "offsetX": 0,
                    "offsetY": 0,
                    "pivotX": 0.5,
                    "pivotY": 0.5,
                    "trimType": "custom",
                }
            )
        sub["userData"] = ud
    meta_path.write_text(json.dumps(meta, indent=2) + "\n", encoding="utf-8")


def grade_to_dirt(im, target=TARGET, colors=28):
    """Shift mean toward world.dirt while keeping AI grit (no 4-color snap)."""
    im = im.convert("RGBA")
    mr, mg, mb = mean_rgb(im)
    dr, dg, db = target[0] - mr, target[1] - mg, target[2] - mb
    # Pull ~55% toward target so accents survive.
    pull = 0.55
    px = im.load()
    w, h = im.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a < 40:
                continue
            px[x, y] = (
                max(0, min(255, int(r + dr * pull))),
                max(0, min(255, int(g + dg * pull))),
                max(0, min(255, int(b + db * pull))),
                255,
            )
    # Palette reduce on RGB (RGBA median-cut unsupported on some Pillow builds).
    rgb = im.convert("RGB").quantize(colors=colors, method=Image.MEDIANCUT).convert("RGBA")
    return rgb


def main():
    AI_DIR.mkdir(parents=True, exist_ok=True)
    written = set()
    for stem, dest, _boost in JOBS:
        if dest in written:
            continue
        src_cursor = CURSOR_ASSETS / "{}.png".format(stem)
        archived = AI_DIR / "{}.png".format(stem)
        if src_cursor.exists():
            shutil.copy2(src_cursor, archived)
        if not archived.exists():
            print("MISSING", stem)
            continue
        im = Image.open(archived)
        # Preserve AI detail — hard lock_to_dirt crushed tiles to ~4 colors.
        out = grade_to_dirt(fit_tile_crisp(im, 64, 64, author=48))
        dest.parent.mkdir(parents=True, exist_ok=True)
        out.save(dest)
        patch_meta(Path(str(dest) + ".meta"))
        written.add(dest)
        m = mean_rgb(out)
        print(
            "OK",
            dest.relative_to(ROOT),
            "from",
            stem,
            "mean",
            m,
            "unique",
            len(set(out.convert("RGB").getdata())),
            "→",
            TARGET,
        )


if __name__ == "__main__":
    main()
