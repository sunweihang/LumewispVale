#!/usr/bin/env python3
"""Slice AI parsnip growth sheet → crop-parsnip-{0,1,2}.png (keep .meta UUIDs)."""

from __future__ import print_function

import json
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
TOOLS = Path(__file__).resolve().parent
AI_SRC = TOOLS / "ai-source" / "crop-parsnip-stages-ai-ref.png"
OUT_DIR = ROOT / "assets/textures/farm"
STAGES = ("crop-parsnip-0", "crop-parsnip-1", "crop-parsnip-2")
TW, TH = 48, 64


def is_bg(r, g, b, a):
    if a < 24:
        return True
    # mid-gray / light panel backdrop + divider
    if abs(r - g) < 28 and abs(g - b) < 28 and 70 <= r <= 210:
        return True
    if r > 215 and g > 215 and b > 215:
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


def key_and_crop(im):
    im = im.convert("RGBA")
    px = im.load()
    w, h = im.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if is_bg(r, g, b, a):
                px[x, y] = (0, 0, 0, 0)
    bbox = im.getbbox()
    if not bbox:
        return Image.new("RGBA", (8, 8), (0, 0, 0, 0))
    return im.crop(bbox)


def fit_foot(cut, tw, th, fill=0.85):
    """Pack sprite into frame; fill<1 leaves margin so plant reads centered on a 64 tile."""
    cw, ch = cut.size
    # author-res intermediate for chunky pixels
    if max(cw, ch) > 96:
        cut = cut.resize((max(1, cw // 4), max(1, ch // 4)), Image.BOX)
        cw, ch = cut.size
    max_w = max(8, int(tw * fill))
    max_h = max(8, int(th * fill))
    scale = min(max_w / float(max(1, cw)), max_h / float(max(1, ch)))
    nw = max(1, int(round(cw * scale)))
    nh = max(1, int(round(ch * scale)))
    cut = cut.resize((nw, nh), Image.NEAREST)
    cut = quantize(cut)
    # Center on the stem/foot column (bottom opaque pixels), not leafy alpha-mass —
    # mass centering pulled sprouts off the furrow midline.
    px = cut.load()
    foot_xs = []
    foot_rows = max(2, min(8, nh // 3))
    for y in range(nh - foot_rows, nh):
        for x in range(nw):
            if px[x, y][3] >= 40:
                foot_xs.append(x)
    if foot_xs:
        stem_cx = (min(foot_xs) + max(foot_xs)) * 0.5
        x = int(round(tw * 0.5 - stem_cx))
    else:
        x = (tw - nw) // 2
    x = max(0, min(tw - nw, x))
    y = th - nh  # foot on bottom
    out = Image.new("RGBA", (tw, th), (0, 0, 0, 0))
    out.paste(cut, (x, y), cut)
    return out


def patch_meta(meta_path, w, h):
    if not meta_path.exists():
        print("WARN missing meta", meta_path)
        return
    meta = json.loads(meta_path.read_text(encoding="utf-8"))
    for sid, sub in meta.get("subMetas", {}).items():
        ud = sub.get("userData", {})
        if sub.get("importer") == "texture":
            ud["minfilter"] = "nearest"
            ud["magfilter"] = "nearest"
            ud["mipfilter"] = "none"
        if sub.get("importer") == "sprite-frame":
            ud["trimType"] = "custom"
            ud["trimThreshold"] = 1
            ud["trimX"] = 0
            ud["trimY"] = 0
            ud["width"] = w
            ud["height"] = h
            ud["rawWidth"] = w
            ud["rawHeight"] = h
            ud["offsetX"] = 0
            ud["offsetY"] = 0
            ud["pivotX"] = 0.5
            ud["pivotY"] = 0.0
            # Keep crops out of the dynamic atlas — packing + trim=false shifted plants off-tile.
            ud["packable"] = False
            ud.pop("vertices", None)
        sub["userData"] = ud
    meta_path.write_text(json.dumps(meta, indent=2) + "\n", encoding="utf-8")


def split_panels(sheet):
    sheet = sheet.convert("RGBA")
    w, h = sheet.size
    # drop thin outer margins if AI left a border
    margin_x = max(2, w // 80)
    margin_y = max(2, h // 40)
    inner = sheet.crop((margin_x, margin_y, w - margin_x, h - margin_y))
    iw, ih = inner.size
    panel_w = iw // 3
    panels = []
    for i in range(3):
        x0 = i * panel_w
        x1 = (i + 1) * panel_w if i < 2 else iw
        # inset a few px to avoid divider bleed
        inset = max(2, panel_w // 40)
        panels.append(inner.crop((x0 + inset, 0, x1 - inset, ih)))
    return panels


def main():
    if not AI_SRC.exists():
        raise SystemExit("missing AI source: {}".format(AI_SRC))

    sheet = Image.open(AI_SRC)
    panels = split_panels(sheet)
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    # Stage fills: tiny sprout → mid leaves → near-full ripe (keep margins for tile center)
    fills = (0.42, 0.68, 0.88)
    for name, panel, fill in zip(STAGES, panels, fills):
        cut = key_and_crop(panel)
        out = fit_foot(cut, TW, TH, fill=fill)
        dest = OUT_DIR / "{}.png".format(name)
        out.save(dest)
        patch_meta(Path(str(dest) + ".meta"), TW, TH)
        print("OK", name, "{}x{}".format(TW, TH), "content", cut.size, "fill", fill)

    # contact sheet for visual QA
    contact = Image.new("RGBA", (TW * 3 + 8, TH + 4), (40, 40, 44, 255))
    for i, name in enumerate(STAGES):
        im = Image.open(OUT_DIR / "{}.png".format(name))
        contact.paste(im, (4 + i * TW, 2), im)
    contact_path = TOOLS / "ai-source" / "crop-parsnip-stages-contact.png"
    contact.save(contact_path)
    print("contact", contact_path)


if __name__ == "__main__":
    main()
