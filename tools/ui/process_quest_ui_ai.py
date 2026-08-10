#!/usr/bin/env python3
"""Ingest AI quest UI chrome → assets/textures/ui + QuestFrames.ts."""
from __future__ import print_function

import json
import uuid
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[2]
TOOLS = Path(__file__).resolve().parent
AI = TOOLS / "ai-source"
OUT_DIR = ROOT / "assets/textures/ui"
UUID_MAP = TOOLS / "uuid-map.json"
CATALOG = TOOLS / "catalog.json"
FRAMES_JSON = TOOLS / "quest-frames.json"
OUT_TS = ROOT / "assets/scripts/game/QuestFrames.ts"
TEX_SUFFIX = "6c48a"
SF_SUFFIX = "f9941"

# Logical display sizes (1x pixel art upscaled nearest).
SIZES = {
    "ui-quest-panel": (400, 540),
    "ui-quest-tracker": (320, 60),
    "ui-quest-row-active": (320, 56),
    "ui-quest-row": (320, 48),
    "ui-quest-row-done": (320, 48),
    "ui-quest-btn-secondary": (132, 48),
    "ui-quest-btn-primary": (152, 48),
}

try:
    RESAMPLE = Image.Resampling.NEAREST
except AttributeError:
    RESAMPLE = Image.NEAREST


def is_empty(r, g, b, a):
    if a < 24:
        return True
    # light gray / white studio bg
    if r > 220 and g > 220 and b > 220:
        return True
    if abs(r - g) < 12 and abs(g - b) < 12 and r > 180:
        return True
    return False


def key_bg(im):
    im = im.convert("RGBA")
    px = im.load()
    w, h = im.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if is_empty(r, g, b, a):
                px[x, y] = (0, 0, 0, 0)
    return im


def quantize(im):
    px = im.load()
    w, h = im.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a < 40:
                px[x, y] = (0, 0, 0, 0)
            else:
                px[x, y] = (r // 12 * 12 + 6, g // 12 * 12 + 6, b // 12 * 12 + 6, 255)
    return im


def crop_opaque(im, pad=2):
    bbox = im.getbbox()
    if not bbox:
        return Image.new("RGBA", (8, 8), (0, 0, 0, 0))
    x0, y0, x1, y1 = bbox
    x0 = max(0, x0 - pad)
    y0 = max(0, y0 - pad)
    x1 = min(im.width, x1 + pad)
    y1 = min(im.height, y1 + pad)
    return im.crop((x0, y0, x1, y1))


def fit(im, tw, th):
    cut = crop_opaque(im)
    cw, ch = cut.size
    scale = min(tw / float(max(1, cw)), th / float(max(1, ch))) * 0.98
    nw = max(1, int(round(cw * scale)))
    nh = max(1, int(round(ch * scale)))
    cut = quantize(cut.resize((nw, nh), RESAMPLE))
    out = Image.new("RGBA", (tw, th), (0, 0, 0, 0))
    out.paste(cut, ((tw - nw) // 2, (th - nh) // 2), cut)
    return out


def row_occupancy(im, a_min=30):
    px = im.load()
    w, h = im.size
    occ = []
    for y in range(h):
        n = 0
        for x in range(w):
            if px[x, y][3] >= a_min:
                n += 1
        occ.append(n)
    return occ


def split_bands(im, min_gap=8, min_h=40, min_fill=0.02):
    """Split image into vertical content bands (rows of UI pieces)."""
    occ = row_occupancy(im)
    w, h = im.size
    thresh = max(8, int(w * min_fill))
    bands = []
    y = 0
    while y < h:
        while y < h and occ[y] < thresh:
            y += 1
        if y >= h:
            break
        y0 = y
        while y < h and occ[y] >= thresh:
            y += 1
        y1 = y
        if y1 - y0 >= min_h:
            bands.append((y0, y1))
        y += min_gap
    return bands


def col_occupancy_band(im, y0, y1, a_min=30):
    px = im.load()
    w = im.width
    occ = [0] * w
    for y in range(y0, y1):
        for x in range(w):
            if px[x, y][3] >= a_min:
                occ[x] += 1
    return occ


def split_horizontal(im, y0, y1, min_gap=10, min_w=40):
    occ = col_occupancy_band(im, y0, y1)
    hspan = y1 - y0
    thresh = max(4, int(hspan * 0.08))
    parts = []
    x = 0
    w = im.width
    while x < w:
        while x < w and occ[x] < thresh:
            x += 1
        if x >= w:
            break
        x0 = x
        while x < w and occ[x] >= thresh:
            x += 1
        x1 = x
        if x1 - x0 >= min_w:
            parts.append(im.crop((x0, y0, x1, y1)))
        x += min_gap
    return parts


def write_meta(png_path, image_uuid, w, h, name):
    meta_path = Path(str(png_path) + ".meta")
    hw, hh = w / 2.0, h / 2.0
    if meta_path.exists():
        meta = json.loads(meta_path.read_text(encoding="utf-8"))
        image_uuid = meta.get("uuid", image_uuid)
    meta = {
        "ver": "1.0.27",
        "importer": "image",
        "imported": True,
        "uuid": image_uuid,
        "files": [".json", ".png"],
        "subMetas": {
            TEX_SUFFIX: {
                "importer": "texture",
                "uuid": "{}@{}".format(image_uuid, TEX_SUFFIX),
                "displayName": name,
                "id": TEX_SUFFIX,
                "name": "texture",
                "userData": {
                    "wrapModeS": "clamp-to-edge",
                    "wrapModeT": "clamp-to-edge",
                    "minfilter": "nearest",
                    "magfilter": "nearest",
                    "mipfilter": "none",
                    "anisotropy": 0,
                    "isUuid": True,
                    "imageUuidOrDatabaseUri": image_uuid,
                    "visible": False,
                },
                "ver": "1.0.22",
                "imported": True,
                "files": [".json"],
                "subMetas": {},
            },
            SF_SUFFIX: {
                "importer": "sprite-frame",
                "uuid": "{}@{}".format(image_uuid, SF_SUFFIX),
                "displayName": name,
                "id": SF_SUFFIX,
                "name": "spriteFrame",
                "userData": {
                    "trimThreshold": 1,
                    "rotated": False,
                    "offsetX": 0,
                    "offsetY": 0,
                    "trimX": 0,
                    "trimY": 0,
                    "width": w,
                    "height": h,
                    "rawWidth": w,
                    "rawHeight": h,
                    "borderTop": 0,
                    "borderBottom": 0,
                    "borderLeft": 0,
                    "borderRight": 0,
                    "packable": True,
                    "pixelsToUnit": 100,
                    "pivotX": 0.5,
                    "pivotY": 0.5,
                    "meshType": 0,
                    "vertices": {
                        "rawPosition": [-hw, -hh, 0, hw, -hh, 0, -hw, hh, 0, hw, hh, 0],
                        "indexes": [0, 1, 2, 2, 1, 3],
                        "uv": [0, h, w, h, 0, 0, w, 0],
                        "nuv": [0, 0, 1, 0, 0, 1, 1, 1],
                        "minPos": [-hw, -hh, 0],
                        "maxPos": [hw, hh, 0],
                    },
                    "isUuid": True,
                    "imageUuidOrDatabaseUri": "{}@{}".format(image_uuid, TEX_SUFFIX),
                    "atlasUuid": "",
                    "trimType": "custom",
                },
                "ver": "1.0.12",
                "imported": True,
                "files": [".json"],
                "subMetas": {},
            },
        },
        "userData": {
            "type": "sprite-frame",
            "fixAlphaTransparencyArtifacts": False,
            "hasAlpha": True,
            "redirect": "{}@{}".format(image_uuid, TEX_SUFFIX),
        },
    }
    meta_path.write_text(json.dumps(meta, indent=2) + "\n", encoding="utf-8")
    return image_uuid


def save_asset(name, im):
    tw, th = SIZES[name]
    out = fit(im, tw, th)
    path = OUT_DIR / (name + ".png")
    out.save(path)
    umap = json.loads(UUID_MAP.read_text(encoding="utf-8")) if UUID_MAP.exists() else {}
    entry = umap.get(name) or {}
    image_uuid = entry.get("texture") or str(uuid.uuid4())
    image_uuid = write_meta(path, image_uuid, tw, th, name)
    umap[name] = {
        "texture": image_uuid,
        "spriteFrame": "{}@{}".format(image_uuid, SF_SUFFIX),
    }
    UUID_MAP.write_text(json.dumps(umap, indent=2) + "\n", encoding="utf-8")
    print("wrote", path, tw, th, image_uuid)
    return name, umap[name]["spriteFrame"], tw, th


def upsert_catalog(frames):
    if not CATALOG.exists():
        return
    data = json.loads(CATALOG.read_text(encoding="utf-8"))
    items = data.get("items") or data.get("assets") or []
    if isinstance(data, list):
        items = data
    for name, sf, w, h in frames:
        entry = {
            "id": name,
            "kind": "ui",
            "spriteType": "simple",
            "designSize": [w, h],
            "path": "assets/textures/ui/{}.png".format(name),
            "prefab": "",
            "note": "Quest panel chrome (AI)",
            "tags": ["quest", "ui"],
        }
        found = False
        for i, it in enumerate(items):
            if it.get("id") == name:
                items[i] = dict(it, **entry)
                found = True
                break
        if not found:
            items.append(entry)
    if isinstance(data, list):
        CATALOG.write_text(json.dumps(items, indent=2) + "\n", encoding="utf-8")
    else:
        key = "items" if "items" in data else "assets"
        data[key] = items
        CATALOG.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")


def write_frames_ts(frame_map):
    FRAMES_JSON.write_text(json.dumps(frame_map, indent=2) + "\n", encoding="utf-8")
    lines = [
        "/** Auto-generated by tools/ui/process_quest_ui_ai.py — do not edit. */",
        "export const QUEST_FRAMES = {",
    ]
    for k, v in frame_map.items():
        lines.append("    {}: '{}',".format(k, v["spriteFrame"]))
    lines.append("} as const;")
    lines.append("")
    OUT_TS.write_text("\n".join(lines), encoding="utf-8")
    meta = Path(str(OUT_TS) + ".meta")
    if not meta.exists():
        meta.write_text(
            json.dumps(
                {
                    "ver": "1.0.8",
                    "importer": "typescript",
                    "imported": True,
                    "uuid": str(uuid.uuid4()),
                    "files": [".js", ".ts"],
                    "subMetas": {},
                    "userData": {},
                },
                indent=2,
            )
            + "\n",
            encoding="utf-8",
        )
    print("wrote", OUT_TS)


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    panel = key_bg(Image.open(AI / "ai-quest-panel-ref.png"))
    rows = key_bg(Image.open(AI / "ai-quest-rows-btns-ref.png"))
    tracker = key_bg(Image.open(AI / "ai-quest-tracker-ref.png"))

    bands = split_bands(rows, min_gap=6, min_h=36)
    print("row bands", bands)
    pieces = []
    for y0, y1 in bands:
        parts = split_horizontal(rows, y0, y1, min_gap=8, min_w=60)
        if not parts:
            parts = [rows.crop((0, y0, rows.width, y1))]
        pieces.extend(parts)
    print("pieces", len(pieces), [p.size for p in pieces])

    # Expect: active, idle, done, then two buttons (or buttons in last band)
    active = pieces[0] if len(pieces) > 0 else rows
    idle = pieces[1] if len(pieces) > 1 else active
    done = pieces[2] if len(pieces) > 2 else idle
    btn_sec = pieces[3] if len(pieces) > 3 else idle
    btn_pri = pieces[4] if len(pieces) > 4 else btn_sec
    # If last band split into 2 buttons already handled; if only 4 pieces, split last
    if len(pieces) == 4:
        # last might be both buttons side by side already as one — try split
        last = pieces[3]
        sub = split_horizontal(last, 0, last.height, min_gap=6, min_w=40)
        if len(sub) >= 2:
            btn_sec, btn_pri = sub[0], sub[1]

    saved = []
    for name, im in [
        ("ui-quest-panel", panel),
        ("ui-quest-tracker", tracker),
        ("ui-quest-row-active", active),
        ("ui-quest-row", idle),
        ("ui-quest-row-done", done),
        ("ui-quest-btn-secondary", btn_sec),
        ("ui-quest-btn-primary", btn_pri),
    ]:
        saved.append(save_asset(name, im))

    frame_map = {}
    key_alias = {
        "ui-quest-panel": "panel",
        "ui-quest-tracker": "tracker",
        "ui-quest-row-active": "rowActive",
        "ui-quest-row": "row",
        "ui-quest-row-done": "rowDone",
        "ui-quest-btn-secondary": "btnSecondary",
        "ui-quest-btn-primary": "btnPrimary",
    }
    for name, sf, w, h in saved:
        frame_map[key_alias[name]] = {"spriteFrame": sf, "w": w, "h": h, "file": name}

    upsert_catalog(saved)
    write_frames_ts(frame_map)

    # Contact sheet preview
    prev = Image.new("RGBA", (800, 900), (40, 48, 40, 255))
    d = ImageDraw.Draw(prev)
    y = 10
    for name, _, _, _ in saved:
        im = Image.open(OUT_DIR / (name + ".png")).convert("RGBA")
        prev.paste(im, (20, y), im)
        d.text((20 + im.width + 12, y + 8), name, fill=(240, 230, 200, 255))
        y += im.height + 16
    prev_path = AI / "quest-ui-preview.png"
    prev.save(prev_path)
    print("preview", prev_path)


if __name__ == "__main__":
    main()
