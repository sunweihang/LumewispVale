#!/usr/bin/env python3
"""Ingest AI soft clutter + stump → assets/textures/nature (keep .meta UUIDs).

Soft clutter cannot stay as PIL ellipses — they read as programmer art in-farm.
Sources:
  tools/ui/ai-source/farm-v2/ai-soft-clutter-sheet.png  (2×3)
  tools/ui/ai-source/farm-v2/ai-stump-v2.png
"""

import json
import shutil
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
TOOLS = Path(__file__).resolve().parent
AI_DIR = TOOLS / "ai-source" / "farm-v2"
CURSOR_ASSETS = Path("/Users/sunix/.cursor/projects/Users-Custom-LumewispVale/assets")
UUID_MAP = TOOLS / "uuid-map.json"
NATURE_FRAMES = TOOLS / "nature-frames.json"

# sheet cells: row-major 2×3
SHEET_JOBS = [
    ("pebble", "assets/textures/nature/nat-pebble.png", 24, 18, 0, 0),
    ("twig", "assets/textures/nature/nat-twig.png", 32, 20, 0, 1),
    ("tuft", "assets/textures/nature/nat-tuft.png", 28, 24, 0, 2),
    ("weedTall", "assets/textures/nature/nat-weed-tall.png", 36, 40, 1, 0),
    ("weedPink", "assets/textures/nature/nat-weed-pink.png", 36, 40, 1, 1),
    ("fiber", "assets/textures/nature/nat-fiber.png", 20, 16, 1, 2),
]

SINGLE_JOBS = [
    ("ai-stump-v2", "assets/textures/nature/nat-stump.png", 56, 48),
]

ID_BY_KEY = {
    "pebble": "nat-pebble",
    "twig": "nat-twig",
    "tuft": "nat-tuft",
    "weedTall": "nat-weed-tall",
    "weedPink": "nat-weed-pink",
    "fiber": "nat-fiber",
    "stump": "nat-stump",
}


def collect_sources():
    AI_DIR.mkdir(parents=True, exist_ok=True)
    for stem in ("ai-soft-clutter-sheet", "ai-stump-v2"):
        src = CURSOR_ASSETS / "{}.png".format(stem)
        dst = AI_DIR / "{}.png".format(stem)
        if src.exists():
            shutil.copy2(src, dst)
        elif not dst.exists():
            print("MISSING", stem)


def is_gray_bg(r, g, b, a):
    if a < 20:
        return True
    if abs(r - g) < 18 and abs(g - b) < 18 and 110 <= r <= 160:
        return True
    if r > 210 and g > 210 and b > 210:
        return True
    # light studio wash near cell edges
    if abs(r - g) < 22 and abs(g - b) < 22 and 100 <= r <= 175:
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


def fit_sprite(im, tw, th):
    cut = key_sprite(im)
    cw, ch = cut.size
    if max(cw, ch) > 96:
        cut = cut.resize((max(1, cw // 4), max(1, ch // 4)), Image.BOX)
        cw, ch = cut.size
    scale = min((tw - 2) / float(max(1, cw)), (th - 2) / float(max(1, ch)))
    nw = max(1, int(round(cw * scale)))
    nh = max(1, int(round(ch * scale)))
    cut = cut.resize((nw, nh), Image.NEAREST)
    cut = quantize(cut)
    out = Image.new("RGBA", (tw, th), (0, 0, 0, 0))
    x = (tw - nw) // 2
    y = th - nh
    out.paste(cut, (x, y), cut)
    return out


def slice_sheet(sheet, row, col, rows=2, cols=3, pad=0.04):
    w, h = sheet.size
    cw, ch = w / float(cols), h / float(rows)
    x0 = int(col * cw + cw * pad)
    y0 = int(row * ch + ch * pad)
    x1 = int((col + 1) * cw - cw * pad)
    y1 = int((row + 1) * ch - ch * pad)
    return sheet.crop((x0, y0, x1, y1))


def patch_meta(meta_path, w, h, pivot_y=0.0):
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
                    "pivotY": pivot_y,
                    "trimType": "custom",
                }
            )
        sub["userData"] = ud
    meta_path.write_text(json.dumps(meta, indent=2) + "\n", encoding="utf-8")


def write_nature_frames(updated_keys):
    uuid_map = json.loads(UUID_MAP.read_text(encoding="utf-8"))
    nature = {}
    if NATURE_FRAMES.exists():
        nature = json.loads(NATURE_FRAMES.read_text(encoding="utf-8"))
    for key in updated_keys:
        item_id = ID_BY_KEY[key]
        nature[key] = uuid_map[item_id]["spriteFrame"]
    NATURE_FRAMES.write_text(json.dumps(nature, indent=2) + "\n", encoding="utf-8")
    ts = (
        "/** Auto-synced from tools/ui/nature-frames.json */\n"
        "export const NATURE_FRAMES = {}\n".format(json.dumps(nature, indent=4))
    )
    (ROOT / "assets/scripts/game/NatureFrames.ts").write_text(ts, encoding="utf-8")


def main():
    collect_sources()
    sheet_path = AI_DIR / "ai-soft-clutter-sheet.png"
    if not sheet_path.exists():
        raise SystemExit("missing soft clutter sheet")
    sheet = Image.open(sheet_path)

    # contact preview
    preview = Image.new("RGBA", (240, 180), (40, 40, 44, 255))
    updated = []

    for key, rel, tw, th, row, col in SHEET_JOBS:
        cell = slice_sheet(sheet, row, col)
        out = fit_sprite(cell, tw, th)
        dest = ROOT / rel
        out.save(dest)
        patch_meta(Path(str(dest) + ".meta"), tw, th, 0.0)
        colors = len({c for c in out.getdata() if c[3]})
        print("OK", rel, "{}x{}".format(tw, th), "colors", colors)
        updated.append(key)
        # preview cell
        px = out.resize((tw * 2, th * 2), Image.NEAREST)
        ox = col * 80 + (80 - px.size[0]) // 2
        oy = row * 90 + (90 - px.size[1])
        preview.paste(px, (ox, oy), px)

    for stem, rel, tw, th in SINGLE_JOBS:
        src = AI_DIR / "{}.png".format(stem)
        if not src.exists():
            print("skip missing", stem)
            continue
        out = fit_sprite(Image.open(src), tw, th)
        dest = ROOT / rel
        out.save(dest)
        patch_meta(Path(str(dest) + ".meta"), tw, th, 0.0)
        colors = len({c for c in out.getdata() if c[3]})
        print("OK", rel, "{}x{}".format(tw, th), "colors", colors)
        updated.append("stump")

    preview_path = TOOLS / "ai-source" / "_preview-soft-clutter.png"
    preview.save(preview_path)
    print("preview", preview_path)

    write_nature_frames(updated)
    print("Done. NatureFrames refreshed:", ", ".join(updated))


if __name__ == "__main__":
    main()
