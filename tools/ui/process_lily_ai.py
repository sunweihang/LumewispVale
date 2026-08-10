#!/usr/bin/env python3
"""Ingest AI lily pad sheet → nat-lily / nat-lily-bloom (keep .meta UUIDs).

Source: tools/ui/ai-source/ai-lily-sheet-ref.png (1×2: plain | bloom)
"""

import json
import shutil
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
TOOLS = Path(__file__).resolve().parent
AI_DIR = TOOLS / "ai-source"
CURSOR_ASSETS = Path("/Users/sunix/.cursor/projects/Users-Custom-LumewispVale/assets")
UUID_MAP = TOOLS / "uuid-map.json"
NATURE_FRAMES = TOOLS / "nature-frames.json"

SHEET = "ai-lily-sheet-ref.png"
JOBS = [
    # key, rel, tw, th, col (1-row sheet)
    ("lily", "assets/textures/nature/nat-lily.png", 28, 24, 0),
    ("lilyBloom", "assets/textures/nature/nat-lily-bloom.png", 28, 24, 1),
]
ID_BY_KEY = {"lily": "nat-lily", "lilyBloom": "nat-lily-bloom"}


def collect_source():
    AI_DIR.mkdir(parents=True, exist_ok=True)
    src = CURSOR_ASSETS / SHEET
    dst = AI_DIR / SHEET
    if src.exists():
        shutil.copy2(src, dst)
    if not dst.exists():
        raise SystemExit("missing {}".format(SHEET))


def is_gray_bg(r, g, b, a):
    if a < 20:
        return True
    if abs(r - g) < 18 and abs(g - b) < 18 and 100 <= r <= 175:
        return True
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


def fit_sprite(im, tw, th):
    """Center lily pad in canvas (floats on water, not foot-planted)."""
    cut = key_sprite(im)
    cw, ch = cut.size
    # crush soft AI detail toward pixel scale
    while max(cw, ch) > 56:
        cut = cut.resize((max(1, cw // 2), max(1, ch // 2)), Image.BOX)
        cw, ch = cut.size
    scale = min((tw - 2) / float(max(1, cw)), (th - 2) / float(max(1, ch)))
    nw = max(1, int(round(cw * scale)))
    nh = max(1, int(round(ch * scale)))
    cut = cut.resize((nw, nh), Image.NEAREST)
    cut = quantize(cut)
    out = Image.new("RGBA", (tw, th), (0, 0, 0, 0))
    x = (tw - nw) // 2
    y = (th - nh) // 2
    out.paste(cut, (x, y), cut)
    return out


def slice_sheet(sheet, col, cols=2, pad=0.03):
    w, h = sheet.size
    cw = w / float(cols)
    x0 = int(col * cw + cw * pad)
    x1 = int((col + 1) * cw - cw * pad)
    y0 = int(h * pad)
    y1 = int(h * (1.0 - pad))
    return sheet.crop((x0, y0, x1, y1))


def patch_meta(meta_path, w, h, pivot_y=0.5):
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
    collect_source()
    sheet = Image.open(AI_DIR / SHEET)
    preview = Image.new("RGBA", (160, 80), (40, 40, 44, 255))
    updated = []

    for key, rel, tw, th, col in JOBS:
        cell = slice_sheet(sheet, col)
        out = fit_sprite(cell, tw, th)
        dest = ROOT / rel
        out.save(dest)
        patch_meta(Path(str(dest) + ".meta"), tw, th, 0.5)
        colors = len({c for c in out.getdata() if c[3]})
        print("OK", rel, "{}x{}".format(tw, th), "colors", colors)
        updated.append(key)
        px = out.resize((tw * 2, th * 2), Image.NEAREST)
        ox = col * 80 + (80 - px.size[0]) // 2
        oy = (80 - px.size[1]) // 2
        preview.paste(px, (ox, oy), px)

    preview_path = AI_DIR / "_preview-lily.png"
    preview.save(preview_path)
    print("preview", preview_path)
    write_nature_frames(updated)
    print("Done:", ", ".join(updated))


if __name__ == "__main__":
    main()
