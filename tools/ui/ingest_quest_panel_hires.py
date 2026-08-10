#!/usr/bin/env python3
"""Ingest hi-res AI quest panel → assets/textures/ui/ui-quest-panel.png at display 1:1.

  C:/Users/elex/scoop/apps/python310/current/python.exe tools/ui/ingest_quest_panel_hires.py

Source: tools/ui/ai-source/ai-quest-panel-ref.png
Output: 700×1180 (matches QUEST_LAYOUT panel size — no runtime upscale blur)
Keeps existing .meta UUID; writes 9-slice borders from detected wood frame.
"""
from __future__ import print_function

import json
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
TOOLS = Path(__file__).resolve().parent
AI = TOOLS / "ai-source" / "ai-quest-panel-ref.png"
OUT = ROOT / "assets/textures/ui/ui-quest-panel.png"
LIB_SF = ROOT / "library/a2/a2ff1daa-0b00-47a1-8b82-1fee6b0c2ea6@f9941.json"

# Must match generate_quest_panel_prefab.py PANEL_*
PANEL_W, PANEL_H = 700, 1180
TEX_SUFFIX = "6c48a"
SF_SUFFIX = "f9941"

try:
    RESAMPLE = Image.Resampling.NEAREST
except AttributeError:
    RESAMPLE = Image.NEAREST


def is_studio_gray(r, g, b, a):
    if a < 8:
        return True
    if r > 210 and g > 210 and b > 210:
        return True
    # any near-neutral gray (AI studio plates land ~100–180)
    if abs(r - g) <= 22 and abs(g - b) <= 22 and abs(r - b) <= 22 and 70 <= r <= 210:
        return True
    return False


def key_studio(im):
    im = im.convert("RGBA")
    px = im.load()
    w, h = im.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if is_studio_gray(r, g, b, a):
                px[x, y] = (0, 0, 0, 0)
    return im


def opaque_bbox(im, a_min=40, pad=2):
    px = im.load()
    w, h = im.size
    minx, miny, maxx, maxy = w, h, -1, -1
    for y in range(h):
        for x in range(w):
            if px[x, y][3] >= a_min:
                if x < minx:
                    minx = x
                if y < miny:
                    miny = y
                if x > maxx:
                    maxx = x
                if y > maxy:
                    maxy = y
    if maxx < 0:
        return None
    return (
        max(0, minx - pad),
        max(0, miny - pad),
        min(w, maxx + 1 + pad),
        min(h, maxy + 1 + pad),
    )


def quantize(im, step=10):
    px = im.load()
    w, h = im.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a < 40:
                px[x, y] = (0, 0, 0, 0)
            else:
                px[x, y] = (
                    r // step * step + step // 2,
                    g // step * step + step // 2,
                    b // step * step + step // 2,
                    255,
                )
    return im


def is_parch(r, g, b, a):
    return a > 200 and r >= 200 and g >= 160 and b >= 100 and (r - b) > 40 and g > b


def detect_borders(im):
    """Return (top, bottom, left, right) wood frame thickness in px."""
    px = im.load()
    w, h = im.size
    my, mx = h // 2, w // 2
    left = 0
    for x in range(w):
        r, g, b, a = px[x, my]
        if is_parch(r, g, b, a):
            left = x
            break
    right = 0
    for x in range(w - 1, -1, -1):
        r, g, b, a = px[x, my]
        if is_parch(r, g, b, a):
            right = w - 1 - x
            break
    top = 0
    for y in range(h):
        r, g, b, a = px[mx, y]
        if is_parch(r, g, b, a):
            top = y
            break
    bottom = 0
    for y in range(h - 1, -1, -1):
        r, g, b, a = px[mx, y]
        if is_parch(r, g, b, a):
            bottom = h - 1 - y
            break
    # Clamp so 9-slice center remains usable.
    left = max(24, min(left, w // 4))
    right = max(24, min(right, w // 4))
    top = max(48, min(top, h // 3))
    bottom = max(40, min(bottom, h // 4))
    return top, bottom, left, right


def patch_meta(path, w, h, borders):
    top, bottom, left, right = borders
    meta_path = Path(str(path) + ".meta")
    meta = json.loads(meta_path.read_text(encoding="utf-8"))
    sf = meta["subMetas"][SF_SUFFIX]["userData"]
    sf["width"] = w
    sf["height"] = h
    sf["rawWidth"] = w
    sf["rawHeight"] = h
    sf["trimX"] = 0
    sf["trimY"] = 0
    sf["borderTop"] = top
    sf["borderBottom"] = bottom
    sf["borderLeft"] = left
    sf["borderRight"] = right
    sf["packable"] = False
    hw, hh = w * 0.5, h * 0.5
    sf["vertices"] = {
        "rawPosition": [-hw, -hh, 0, hw, -hh, 0, -hw, hh, 0, hw, hh, 0],
        "indexes": [0, 1, 2, 2, 1, 3],
        "uv": [0, h, w, h, 0, 0, w, 0],
        "nuv": [0, 0, 1, 0, 0, 1, 1, 1],
        "minPos": [-hw, -hh, 0],
        "maxPos": [hw, hh, 0],
    }
    tex = meta["subMetas"][TEX_SUFFIX]["userData"]
    tex["minfilter"] = "nearest"
    tex["magfilter"] = "nearest"
    tex["mipfilter"] = "none"
    meta_path.write_text(json.dumps(meta, indent=2) + "\n", encoding="utf-8")
    print("patched meta borders TBLR", top, bottom, left, right)


def patch_library(w, h, borders):
    if not LIB_SF.exists():
        return
    top, bottom, left, right = borders
    data = json.loads(LIB_SF.read_text(encoding="utf-8"))
    c = data["content"]
    c["rect"] = {"x": 0, "y": 0, "width": w, "height": h}
    c["originalSize"] = {"width": w, "height": h}
    c["capInsets"] = [left, top, right, bottom]
    hw, hh = w * 0.5, h * 0.5
    c["vertices"] = {
        "rawPosition": [-hw, -hh, 0, hw, -hh, 0, -hw, hh, 0, hw, hh, 0],
        "indexes": [0, 1, 2, 2, 1, 3],
        "uv": [0, h, w, h, 0, 0, w, 0],
        "nuv": [0, 0, 1, 0, 0, 1, 1, 1],
        "minPos": {"x": -hw, "y": -hh, "z": 0},
        "maxPos": {"x": hw, "y": hh, "z": 0},
    }
    LIB_SF.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
    print("patched library spriteFrame")


def write_layout_hint(borders):
    """Print FRAME_* for generate_quest_panel_prefab.py."""
    top, bottom, left, right = borders
    print(
        "LAYOUT HINT: FRAME_L, FRAME_R, FRAME_T, FRAME_B = {}, {}, {}, {}".format(
            left, right, top, bottom
        )
    )


def fit_fullbleed(im, tw, th):
    """Fill display canvas 1:1. Stronger crunch to match info-board chunky pixels."""
    try:
        hi = Image.Resampling.LANCZOS
    except AttributeError:
        hi = getattr(Image, "LANCZOS", Image.BICUBIC)
    # Down to ~info-board pixel density, then nearest up to display size.
    logical_w = max(240, int(tw * 0.55))
    logical_h = max(400, int(th * 0.55))
    mid = im.resize((logical_w, logical_h), hi)
    mid = quantize(mid, step=12)
    return mid.resize((tw, th), RESAMPLE)


def main():
    if not AI.exists():
        raise SystemExit("missing " + str(AI))
    src = key_studio(Image.open(AI))
    box = opaque_bbox(src)
    if not box:
        raise SystemExit("no opaque content after key")
    cut = src.crop(box)
    # Display 1:1 full-bleed — preserve AI wood detail.
    out = fit_fullbleed(cut, PANEL_W, PANEL_H)
    out = key_studio(out)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    out.save(OUT)
    borders = detect_borders(out)
    patch_meta(OUT, PANEL_W, PANEL_H, borders)
    patch_library(PANEL_W, PANEL_H, borders)
    write_layout_hint(borders)
    preview = TOOLS / "ai-source" / "quest-panel-hires-preview.png"
    out.save(preview)
    print("wrote", OUT, out.size)
    print("preview", preview)


if __name__ == "__main__":
    main()
