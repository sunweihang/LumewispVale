#!/usr/bin/env python3
"""Process AI town building refs → orthogonal pixel sprites in assets/textures/buildings.

DEPRECATED for production cutout: gray chroma eats roofs / leaves grass halos.
Prefer portal RMBG instead:

    python tools/ui/portal_rmbg_buildings.py

This script remains as a local fallback (Prefer *-ortho-ref.png when present.
Chroma gray/checker → transparent, NEAREST scale, preserve .meta UUID, foot-align).
"""

from __future__ import print_function

import json
import uuid
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
AI = Path(__file__).resolve().parent / "ai-source"
BLD = ROOT / "assets/textures/buildings"
UUID_MAP = Path(__file__).resolve().parent / "uuid-map.json"
TEX_SUFFIX = "6c48a"
SF_SUFFIX = "f9941"

# out_name -> (preferred ref stems in order, target w, h)
# v3 = Stardew-referenced unique silhouettes with props / lean-tos
SPECS = [
    ("bld-seedshop", ["ai-bld-seedshop-v3"], 288, 240),
    ("bld-oreshop", ["ai-bld-oreshop-v3"], 288, 240),
    ("bld-general", ["ai-bld-general-v3"], 288, 240),
    ("bld-police", ["ai-bld-police-v3"], 256, 224),
    ("bld-post", ["ai-bld-post-v3"], 256, 224),
    ("bld-clinic", ["ai-bld-clinic-v3"], 288, 224),
    ("bld-school", ["ai-bld-school-v3"], 288, 256),
    ("bld-mayor", ["ai-bld-mayor-v3"], 320, 272),
    ("bld-community", ["ai-bld-community-v3"], 320, 256),
    ("bld-saloon", ["ai-bld-saloon-v3"], 288, 240),
    ("bld-fishshop", ["ai-bld-fishshop-v3"], 288, 240),
    ("bld-library", ["ai-bld-library-v3"], 256, 256),
    ("bld-museum", ["ai-bld-museum-v3"], 288, 256),
    ("bld-carpenter", ["ai-bld-carpenter-v3"], 320, 240),
    ("bld-home-green", ["ai-bld-home-green-v3"], 224, 224),
    ("bld-home-yellow", ["ai-bld-home-yellow-v3"], 256, 224),
    ("bld-home-purple", ["ai-bld-home-purple-v3"], 224, 224),
    ("bld-cottage-blue", ["ai-bld-cottage-blue-v3"], 256, 224),
    ("bld-cottage-red", ["ai-bld-cottage-red-v3"], 288, 224),
]


def uid():
    return str(uuid.uuid4())


def is_bg(r, g, b, a):
    if a < 8:
        return True
    # mid gray / AI paper
    if abs(r - g) < 22 and abs(g - b) < 22 and 95 <= r <= 175:
        return True
    # near white paper
    if r > 230 and g > 230 and b > 230:
        return True
    # checker light/dark gray
    if abs(r - g) < 12 and abs(g - b) < 12 and (r < 70 or r > 200):
        return True
    return False


def chroma(img):
    img = img.convert("RGBA")
    px = img.load()
    w, h = img.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if is_bg(r, g, b, a):
                px[x, y] = (0, 0, 0, 0)
    return img


def quantize(img):
    px = img.load()
    w, h = img.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a < 40:
                px[x, y] = (0, 0, 0, 0)
                continue
            r = (r // 16) * 16 + 8
            g = (g // 16) * 16 + 8
            b = (b // 16) * 16 + 8
            px[x, y] = (r, g, b, 255)
    return img


def fit_foot(img, tw, th):
    """Scale content into tw×th with foot at bottom, horizontally centered."""
    bbox = img.getbbox()
    if not bbox:
        return Image.new("RGBA", (tw, th), (0, 0, 0, 0))
    cropped = img.crop(bbox)
    cw, ch = cropped.size
    # leave small padding
    pad = 4
    scale = min((tw - pad * 2) / float(cw), (th - pad * 2) / float(ch))
    nw = max(1, int(round(cw * scale)))
    nh = max(1, int(round(ch * scale)))
    # prefer integer-ish NEAREST: first BOX down if huge
    work = cropped
    if cw > tw * 2 or ch > th * 2:
        work = cropped.resize((nw, nh), Image.BOX)
        work = work.resize((nw, nh), Image.NEAREST)
    else:
        work = cropped.resize((nw, nh), Image.NEAREST)
    work = quantize(work)
    out = Image.new("RGBA", (tw, th), (0, 0, 0, 0))
    x = (tw - nw) // 2
    y = th - nh - 2  # foot near bottom
    if y < 0:
        y = 0
    out.paste(work, (x, y), work)
    return out


def write_meta(png_path, image_uuid, w, h, name):
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
                    "trimType": "custom",
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
                    "packable": True,
                    "pixelsToUnit": 100,
                    "pivotX": 0.5,
                    "pivotY": 0.0,
                    "meshType": 0,
                },
                "ver": "1.0.22",
                "imported": True,
                "files": [".json"],
                "subMetas": {},
            },
        },
        "userData": {"type": "sprite-frame", "hasAlpha": True},
    }
    png_path.with_suffix(".png.meta").write_text(json.dumps(meta, indent=2) + "\n")


def find_ref(stems):
    for s in stems:
        p = AI / (s + ".png")
        if p.exists():
            return p
    return None


def main():
    umap = json.loads(UUID_MAP.read_text(encoding="utf-8"))
    for name, stems, tw, th in SPECS:
        ref = find_ref(stems)
        if not ref:
            print("SKIP missing", name, stems)
            continue
        img = chroma(Image.open(ref))
        out = fit_foot(img, tw, th)
        path = BLD / (name + ".png")
        meta_path = path.with_suffix(".png.meta")
        if meta_path.exists():
            try:
                image_uuid = json.loads(meta_path.read_text())["uuid"]
            except Exception:
                image_uuid = uid()
        else:
            image_uuid = uid()
        out.save(path)
        write_meta(path, image_uuid, tw, th, name)
        sf = "{}@{}".format(image_uuid, SF_SUFFIX)
        umap[name] = {
            "texture": image_uuid,
            "spriteFrame": sf,
            "prefab": umap.get(name, {}).get("prefab", ""),
        }
        print("OK", name, "<-", ref.name, tw, th)
    UUID_MAP.write_text(json.dumps(umap, indent=2) + "\n")


if __name__ == "__main__":
    main()
