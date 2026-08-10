#!/usr/bin/env python3
"""Ingest AI farm flower sheet → nature clutter (keep .meta UUIDs).

Source: tools/ui/ai-source/ai-farm-flowers-sheet.png  (1×3)
  col0 → nat-weed-bloom   40×36  (warm yellow/orange)
  col1 → nat-weed-yellow  36×40
  col2 → nat-weed-blue    36×40

    /usr/bin/python3 tools/ui/process_farm_flowers_ai.py
"""

from __future__ import annotations

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
NATURE_TS = ROOT / "assets/scripts/game/NatureFrames.ts"

JOBS = [
    ("weedBloom", "assets/textures/nature/nat-weed-bloom.png", 40, 36, 0),
    ("weedYellow", "assets/textures/nature/nat-weed-yellow.png", 36, 40, 1),
    ("weedBlue", "assets/textures/nature/nat-weed-blue.png", 36, 40, 2),
]

ID_BY_KEY = {
    "weedBloom": "nat-weed-bloom",
    "weedYellow": "nat-weed-yellow",
    "weedBlue": "nat-weed-blue",
}


def collect_source() -> Path:
    AI_DIR.mkdir(parents=True, exist_ok=True)
    dst = AI_DIR / "ai-farm-flowers-sheet.png"
    src = CURSOR_ASSETS / "ai-farm-flowers-sheet.png"
    if src.exists():
        shutil.copy2(src, dst)
    if not dst.exists():
        raise SystemExit("missing tools/ui/ai-source/ai-farm-flowers-sheet.png")
    return dst


def is_gray_bg(r, g, b, a):
    if a < 20:
        return True
    if abs(r - g) < 22 and abs(g - b) < 22 and 90 <= r <= 200:
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
    cut = key_sprite(im)
    cw, ch = cut.size
    if max(cw, ch) > 120:
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


def slice_row(sheet, col, cols=3, pad=0.05):
    w, h = sheet.size
    cw = w / float(cols)
    x0 = int(col * cw + cw * pad)
    x1 = int((col + 1) * cw - cw * pad)
    y0 = int(h * pad)
    y1 = int(h * (1.0 - pad))
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


def write_nature_frames(keys):
    uuid_map = json.loads(UUID_MAP.read_text(encoding="utf-8"))
    nature = json.loads(NATURE_FRAMES.read_text(encoding="utf-8")) if NATURE_FRAMES.exists() else {}
    for key in keys:
        item_id = ID_BY_KEY[key]
        nature[key] = uuid_map[item_id]["spriteFrame"]
    NATURE_FRAMES.write_text(json.dumps(nature, indent=2) + "\n", encoding="utf-8")
    keys_list = list(nature.items())
    lines = ["/** Auto-synced from tools/ui/nature-frames.json */", "export const NATURE_FRAMES = {"]
    for i, (k, v) in enumerate(keys_list):
        comma = "," if i < len(keys_list) - 1 else ""
        lines.append('    "{}": "{}"{}'.format(k, v, comma))
    lines.append("}")
    NATURE_TS.write_text("\n".join(lines) + "\n", encoding="utf-8")


def main():
    sheet_path = collect_source()
    sheet = Image.open(sheet_path).convert("RGBA")
    updated = []
    preview = Image.new("RGBA", (280, 120), (40, 40, 44, 255))

    for i, (key, rel, tw, th, col) in enumerate(JOBS):
        cell = slice_row(sheet, col)
        out = fit_sprite(cell, tw, th)
        dest = ROOT / rel
        dest.parent.mkdir(parents=True, exist_ok=True)
        out.save(dest)
        patch_meta(Path(str(dest) + ".meta"), tw, th, 0.0)
        colors = len({c for c in out.getdata() if c[3]})
        print("OK", rel, "{}x{}".format(tw, th), "colors", colors)
        updated.append(key)
        px = out.resize((tw * 2, th * 2), Image.NEAREST)
        ox = i * 90 + (90 - px.size[0]) // 2
        oy = 120 - px.size[1] - 8
        preview.paste(px, (ox, oy), px)

    preview_path = AI_DIR / "_preview-farm-flowers.png"
    preview.save(preview_path)
    print("preview", preview_path)
    write_nature_frames(updated)
    print("Done:", ", ".join(updated))


if __name__ == "__main__":
    main()
