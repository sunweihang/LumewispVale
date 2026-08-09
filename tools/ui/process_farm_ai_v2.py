#!/usr/bin/env python3
"""Ingest AI farm sprites → assets/textures (keep .meta UUIDs), refresh NatureFrames."""

import json
import shutil
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
TOOLS = Path(__file__).resolve().parent
AI_DIR = TOOLS / "ai-source" / "farm-v2"
CURSOR_ASSETS = Path("/Users/sunix/.cursor/projects/Users-Custom-LumewispVale/assets")
UUID_MAP = TOOLS / "uuid-map.json"

# (source stem in cursor assets / ai-dir, dest relative path, w, h, mode)
# mode: tile = full-bleed quantize; sprite = gray-key + foot pad
JOBS = [
    ("ai-grass", "assets/textures/terrain/tile-grass.png", 64, 64, "tile"),
    ("ai-dirt", "assets/textures/terrain/tile-dirt.png", 64, 64, "tile"),
    ("ai-water", "assets/textures/terrain/tile-water.png", 64, 64, "tile"),
    ("ai-cliff", "assets/textures/terrain/tile-cliff.png", 64, 64, "tile"),
    ("ai-farmhouse", "assets/textures/buildings/bld-cottage-red.png", 192, 224, "sprite"),
    ("ai-shed", "assets/textures/buildings/bld-shed.png", 128, 128, "sprite"),
    ("ai-oak", "assets/textures/nature/nat-tree-oak.png", 128, 160, "sprite"),
    ("ai-pine", "assets/textures/nature/nat-tree-pine.png", 96, 144, "sprite"),
    ("ai-bush", "assets/textures/nature/nat-bush.png", 64, 64, "sprite"),
    # Rocks: process_rock_ai.py | stump + soft clutter: process_clutter_ai.py
    ("ai-log", "assets/textures/nature/nat-log.png", 80, 32, "sprite"),
    ("ai-weed", "assets/textures/nature/nat-weed.png", 40, 36, "sprite"),
    ("ai-weed", "assets/textures/nature/nat-weed-bloom.png", 40, 36, "sprite"),
    ("ai-fence", "assets/textures/props/prop-fence.png", 64, 64, "sprite"),
    ("ai-mailbox", "assets/textures/props/prop-mailbox.png", 48, 64, "sprite"),
    ("ai-shipping", "assets/textures/props/prop-shipping.png", 96, 80, "sprite"),
]


def collect_sources():
    AI_DIR.mkdir(parents=True, exist_ok=True)
    for stem, _, _, _, _ in JOBS:
        src = CURSOR_ASSETS / "{}.png".format(stem)
        dst = AI_DIR / "{}.png".format(stem)
        if src.exists():
            shutil.copy2(src, dst)
        elif not dst.exists():
            print("MISSING", stem)


def is_gray_bg(r, g, b, a):
    if a < 20:
        return True
    # Mid-gray AI studio only — do NOT eat stone greys (~#6A6E76).
    # Matches pixel-art-draw reference: |R-G|<18 && |G-B|<18 && 110≤R≤160
    if abs(r - g) < 18 and abs(g - b) < 18 and 110 <= r <= 160:
        return True
    # near-white / light gray studio
    if r > 210 and g > 210 and b > 210:
        return True
    return False


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


def key_sprite(im):
    im = im.convert("RGBA")
    px = im.load()
    w, h = im.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if is_gray_bg(r, g, b, a):
                px[x, y] = (0, 0, 0, 0)
    bbox = im.getbbox()
    if not bbox:
        return Image.new("RGBA", (8, 8), (0, 0, 0, 0))
    return im.crop(bbox)


def fit_tile(im, tw, th):
    im = im.convert("RGBA")
    # center-crop square then nearest
    w, h = im.size
    side = min(w, h)
    left = (w - side) // 2
    top = (h - side) // 2
    im = im.crop((left, top, left + side, top + side))
    # downscale with BOX for crisp pixels then NEAREST to exact
    small = max(tw, side // 8)
    if side > tw * 2:
        im = im.resize((small, small), Image.BOX)
    im = im.resize((tw, th), Image.NEAREST)
    return quantize(im)


def fit_sprite(im, tw, th):
    cut = key_sprite(im)
    # shrink to fit inside target with margin
    cw, ch = cut.size
    scale = min((tw - 4) / float(max(1, cw)), (th - 4) / float(max(1, ch)))
    nw = max(1, int(round(cw * scale)))
    nh = max(1, int(round(ch * scale)))
    # author-res intermediate for crispness
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
    y = th - nh  # foot on bottom
    out.paste(cut, (x, y), cut)
    return out


def patch_meta_nearest(meta_path, w, h, pivot_y):
    if not meta_path.exists():
        return
    meta = json.loads(meta_path.read_text(encoding="utf-8"))
    subs = meta.get("subMetas", {})
    for sid, sub in subs.items():
        ud = sub.get("userData", {})
        if sub.get("importer") == "texture":
            ud["minfilter"] = "nearest"
            ud["magfilter"] = "nearest"
            ud["mipfilter"] = "none"
        if sub.get("importer") == "sprite-frame":
            ud["width"] = w
            ud["height"] = h
            ud["rawWidth"] = w
            ud["rawHeight"] = h
            ud["trimX"] = 0
            ud["trimY"] = 0
            ud["offsetX"] = 0
            ud["offsetY"] = 0
            ud["pivotX"] = 0.5
            ud["pivotY"] = pivot_y
            ud["trimType"] = "custom"
        sub["userData"] = ud
    meta_path.write_text(json.dumps(meta, indent=2) + "\n", encoding="utf-8")


def write_nature_frames():
    uuid_map = json.loads(UUID_MAP.read_text(encoding="utf-8"))

    def sf(key):
        return uuid_map[key]["spriteFrame"]

    nature = {
        "rock": sf("nat-rock"),
        "rockBig": sf("nat-rock-big"),
        "stump": sf("nat-stump"),
        "log": sf("nat-log"),
        "weed": sf("nat-weed"),
        "weedBloom": sf("nat-weed-bloom"),
        "pine": sf("nat-tree-pine"),
        "oak": sf("nat-tree-oak"),
        "bush": sf("nat-bush"),
        "mailbox": sf("prop-mailbox"),
        "shipping": sf("prop-shipping"),
        "fence": sf("prop-fence"),
    }
    (TOOLS / "nature-frames.json").write_text(
        json.dumps(nature, indent=2) + "\n", encoding="utf-8"
    )
    ts = (
        "/** Auto-synced from tools/ui/nature-frames.json */\n"
        "export const NATURE_FRAMES = {}\n".format(json.dumps(nature, indent=4))
    )
    (ROOT / "assets/scripts/game/NatureFrames.ts").write_text(ts, encoding="utf-8")


def main():
    collect_sources()
    for stem, rel, w, h, mode in JOBS:
        src = AI_DIR / "{}.png".format(stem)
        if not src.exists():
            print("skip missing", stem)
            continue
        im = Image.open(src)
        out = fit_tile(im, w, h) if mode == "tile" else fit_sprite(im, w, h)
        dest = ROOT / rel
        dest.parent.mkdir(parents=True, exist_ok=True)
        out.save(dest)
        pivot = 0.5 if mode == "tile" else 0.0
        patch_meta_nearest(Path(str(dest) + ".meta"), w, h, pivot)
        print("OK", rel, "{}x{}".format(w, h))

    # Ensure uuid-map has nature keys (already from earlier scripts)
    write_nature_frames()
    print("Done. NatureFrames refreshed.")


if __name__ == "__main__":
    main()
