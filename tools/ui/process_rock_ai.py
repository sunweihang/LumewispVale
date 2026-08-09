#!/usr/bin/env python3
"""Ingest chroma-keyed AI rock sprites → nat-rock / nat-rock-big (keep .meta).

Rocks cannot use gray-key (stone fill gets punched out). Generate refs on
lime #00FF00 or magenta #FF00FF, then run this script.
"""

import json
import shutil
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
TOOLS = Path(__file__).resolve().parent
AI_DIR = TOOLS / "ai-source" / "farm-v2"
CURSOR_ASSETS = Path("/Users/sunix/.cursor/projects/Users-Custom-LumewispVale/assets")

JOBS = [
    ("ai-nat-rock-ref", "assets/textures/nature/nat-rock.png", 48, 40),
    ("ai-nat-rock-big-ref", "assets/textures/nature/nat-rock-big.png", 72, 56),
    ("ai-nat-pebble-ref", "assets/textures/nature/nat-pebble.png", 24, 18),
]


def is_chroma_bg(r, g, b, a):
    if a < 20:
        return True
    # lime / green screen
    if g > 150 and g > r + 35 and g > b + 35:
        return True
    if g > 200 and r < 120 and b < 120:
        return True
    # magenta / pink studio + purple fringe
    if r >= 90 and b >= 90 and g < min(r, b) * 0.85 and (r + b) > g * 2.0:
        return True
    if r > 180 and b > 160 and g < 140:
        return True
    return False


def key_chroma(im):
    im = im.convert("RGBA")
    px = im.load()
    w, h = im.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if is_chroma_bg(r, g, b, a):
                px[x, y] = (0, 0, 0, 0)
            elif a > 0 and r > 80 and b > 70 and g < 90 and abs(r - b) < 40:
                px[x, y] = (48, 40, 32, 255)
    dirty = []
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a == 0:
                continue
            if g > r + 25 and g > b + 25 and g > 100:
                for dy, dx in ((-1, 0), (1, 0), (0, -1), (0, 1)):
                    xx, yy = x + dx, y + dy
                    if xx < 0 or yy < 0 or xx >= w or yy >= h or px[xx, yy][3] == 0:
                        dirty.append((x, y))
                        break
    for x, y in dirty:
        px[x, y] = (0, 0, 0, 0)
    bbox = im.getbbox()
    if not bbox:
        return Image.new("RGBA", (8, 8), (0, 0, 0, 0))
    return im.crop(bbox)


def cool_stone(r, g, b):
    """Pull warm brown body toward cool grey; keep deep foot shadow."""
    # deep warm shadow under feet — keep
    if r + g + b < 120 and r >= g and r >= b:
        return (48, 40, 32)
    # brownish / tan midtones → grey
    if r > g + 8 and r > b + 8 and g > 50:
        v = int(0.35 * r + 0.40 * g + 0.25 * b)
        return (v, min(255, v + 2), min(255, v + 4))
    return (r, g, b)


def quantize(img):
    """Same soft step as process_farm_ai_v2 — keep shade bands like bush/stump."""
    px = img.load()
    w, h = img.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a < 40:
                px[x, y] = (0, 0, 0, 0)
            else:
                r, g, b = cool_stone(r, g, b)
                px[x, y] = (r // 16 * 16 + 8, g // 16 * 16 + 8, b // 16 * 16 + 8, 255)
    return img


def fit_sprite(im, tw, th):
    cut = key_chroma(im)
    cw, ch = cut.size
    scale = min((tw - 4) / float(max(1, cw)), (th - 4) / float(max(1, ch)))
    nw = max(1, int(round(cw * scale)))
    nh = max(1, int(round(ch * scale)))
    if max(cw, ch) > 96:
        cut = cut.resize((max(1, cw // 4), max(1, ch // 4)), Image.BOX)
        cw, ch = cut.size
        scale = min((tw - 4) / float(max(1, cw)), (th - 4) / float(max(1, ch)))
        nw = max(1, int(round(cw * scale)))
        nh = max(1, int(round(ch * scale)))
    cut = cut.resize((nw, nh), Image.NEAREST)
    cut = quantize(cut)
    out = Image.new("RGBA", (tw, th), (0, 0, 0, 0))
    x = (tw - nw) // 2
    y = th - nh
    out.paste(cut, (x, y), cut)
    return out


def patch_meta(meta_path, w, h):
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
                    "pivotY": 0.0,
                    "trimType": "custom",
                }
            )
        sub["userData"] = ud
    meta_path.write_text(json.dumps(meta, indent=2) + "\n", encoding="utf-8")


def main():
    AI_DIR.mkdir(parents=True, exist_ok=True)
    for stem, rel, w, h in JOBS:
        src = CURSOR_ASSETS / "{}.png".format(stem)
        archived = AI_DIR / "{}.png".format(stem)
        if src.exists():
            shutil.copy2(src, archived)
        if not archived.exists():
            print("MISSING", stem)
            continue
        out = fit_sprite(Image.open(archived), w, h)
        dest = ROOT / rel
        out.save(dest)
        patch_meta(Path(str(dest) + ".meta"), w, h)
        colors = len({c for c in out.getdata() if c[3]})
        opaque = sum(1 for c in out.getdata() if c[3])
        print("OK", rel, "{}x{}".format(w, h), "colors", colors, "opaque", opaque)


if __name__ == "__main__":
    main()
