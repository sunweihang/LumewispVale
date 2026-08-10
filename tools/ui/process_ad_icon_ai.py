#!/usr/bin/env python3
"""Ingest AI ad-video icon → assets/textures/ui/ic-ad-video.png (keep .meta UUID).

Source (gray #808080 canvas):
  tools/ui/ai-source/ic-ad-video-ai-ref.png

Gentler pixelize than tool icons (logical 48, more colors) to keep AI shading.

  /usr/bin/python3 tools/ui/process_ad_icon_ai.py
"""

import json
import uuid
from pathlib import Path

from PIL import Image

try:
    RESAMPLE_BOX = Image.Resampling.BOX
    RESAMPLE_NEAREST = Image.Resampling.NEAREST
except AttributeError:
    RESAMPLE_BOX = Image.BOX
    RESAMPLE_NEAREST = Image.NEAREST

try:
    QUANTIZE_MEDIANCUT = Image.Quantize.MEDIANCUT
except AttributeError:
    QUANTIZE_MEDIANCUT = Image.MEDIANCUT

ROOT = Path(__file__).resolve().parents[2]
SRC = Path(__file__).resolve().parent / "ai-source" / "ic-ad-video-ai-ref.png"
OUT = ROOT / "assets/textures/ui/ic-ad-video.png"
UUID_MAP = Path(__file__).resolve().parent / "uuid-map.json"
TF = Path(__file__).resolve().parent / "tool-frames.json"
CATALOG = Path(__file__).resolve().parent / "catalog.json"
OUT_TS = ROOT / "assets/scripts/game/ToolFrames.ts"
TEX_SUFFIX = "6c48a"
SF_SUFFIX = "f9941"
OUTLINE = (40, 28, 18, 255)

LOGICAL = 48
OUT_SIZE = 96
COLORS = 48


def knock_bg(im):
    im = im.convert("RGBA")
    px = im.load()
    w, h = im.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a == 0:
                continue
            if g >= 140 and g > r + 35 and g > b + 35:
                px[x, y] = (0, 0, 0, 0)
                continue
            mx, mn = max(r, g, b), min(r, g, b)
            chroma = mx - mn
            bright = (r + g + b) / 3.0
            if chroma < 24 and 85 <= bright <= 185:
                px[x, y] = (0, 0, 0, 0)
                continue
            if bright >= 235 and chroma < 30:
                px[x, y] = (0, 0, 0, 0)
    return im


def flood_corners(im, tol=28):
    im = im.convert("RGBA")
    w, h = im.size
    px = im.load()
    seeds = [
        (0, 0),
        (w - 1, 0),
        (0, h - 1),
        (w - 1, h - 1),
        (w // 2, 0),
        (w // 2, h - 1),
        (0, h // 2),
        (w - 1, h // 2),
    ]
    seen = set()
    stack = list(seeds)
    while stack:
        x, y = stack.pop()
        if (x, y) in seen or not (0 <= x < w and 0 <= y < h):
            continue
        seen.add((x, y))
        r, g, b, a = px[x, y]
        if a == 0:
            continue
        bright = (r + g + b) / 3.0
        chroma = max(r, g, b) - min(r, g, b)
        if chroma > 40 and bright < 200:
            continue
        if bright < 70:
            continue
        if chroma > 22 and not (chroma < 40 and 85 <= bright <= 195):
            if bright < 215:
                continue
        px[x, y] = (0, 0, 0, 0)
        for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
            if 0 <= nx < w and 0 <= ny < h and (nx, ny) not in seen:
                nr, ng, nb, na = px[nx, ny]
                if na and abs(nr - r) <= tol and abs(ng - g) <= tol and abs(nb - b) <= tol:
                    stack.append((nx, ny))
    return im


def trim(im, pad=4):
    a = im.split()[-1]
    bb = a.point(lambda p: 255 if p >= 12 else 0).getbbox()
    if not bb:
        return im
    x0, y0, x1, y1 = bb
    x0 = max(0, x0 - pad)
    y0 = max(0, y0 - pad)
    x1 = min(im.width, x1 + pad)
    y1 = min(im.height, y1 + pad)
    return im.crop((x0, y0, x1, y1))


def pixelize(im):
    im = trim(im)
    sw, sh = im.size
    scale = min(LOGICAL / float(sw), LOGICAL / float(sh)) * 0.94
    nw = max(1, int(round(sw * scale)))
    nh = max(1, int(round(sh * scale)))
    small = im.resize((nw, nh), RESAMPLE_BOX)

    rgb = Image.new("RGB", small.size, (0, 0, 0))
    rgb.paste(small, mask=small.split()[-1])
    pal = rgb.quantize(colors=COLORS, method=QUANTIZE_MEDIANCUT).convert("RGBA")
    out_small = Image.new("RGBA", small.size, (0, 0, 0, 0))
    sp, fp, op = pal.load(), small.load(), out_small.load()
    for y in range(small.height):
        for x in range(small.width):
            if fp[x, y][3] < 20:
                continue
            r, g, b, _ = sp[x, y]
            if abs(r - g) < 12 and abs(g - b) < 12 and 95 <= (r + g + b) / 3.0 <= 170:
                continue
            op[x, y] = (r, g, b, 255)

    opaque = [
        (x, y)
        for y in range(out_small.height)
        for x in range(out_small.width)
        if op[x, y][3] > 0
    ]
    border = set()
    for x, y in opaque:
        for dx, dy in ((-1, 0), (1, 0), (0, -1), (0, 1)):
            nx, ny = x + dx, y + dy
            if 0 <= nx < out_small.width and 0 <= ny < out_small.height and op[nx, ny][3] == 0:
                border.add((nx, ny))
    for x, y in border:
        op[x, y] = OUTLINE

    canvas = Image.new("RGBA", (LOGICAL, LOGICAL), (0, 0, 0, 0))
    ox = (LOGICAL - out_small.width) // 2
    oy = (LOGICAL - out_small.height) // 2
    canvas.paste(out_small, (ox, oy), out_small)
    return canvas.resize((OUT_SIZE, OUT_SIZE), RESAMPLE_NEAREST)


def write_meta(png, image_uuid, w, h):
    meta_path = Path(str(png) + ".meta")
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
                "displayName": "ic-ad-video",
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
                "displayName": "ic-ad-video",
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


def main():
    if not SRC.exists():
        raise SystemExit("missing AI source: {}".format(SRC))
    out = pixelize(flood_corners(knock_bg(Image.open(SRC))))
    OUT.parent.mkdir(parents=True, exist_ok=True)
    out.save(OUT)

    umap = {}
    if UUID_MAP.exists():
        umap = json.loads(UUID_MAP.read_text(encoding="utf-8"))
    image_uuid = umap.get("ic-ad-video", {}).get("texture") or str(uuid.uuid4())
    image_uuid = write_meta(OUT, image_uuid, OUT_SIZE, OUT_SIZE)
    sf = "{}@{}".format(image_uuid, SF_SUFFIX)
    umap["ic-ad-video"] = {"texture": image_uuid, "prefab": "", "spriteFrame": sf}
    UUID_MAP.write_text(json.dumps(umap, indent=2) + "\n", encoding="utf-8")

    tools = {}
    if TF.exists():
        tools = json.loads(TF.read_text(encoding="utf-8"))
    tools["adVideo"] = sf
    TF.write_text(json.dumps(tools, indent=2) + "\n", encoding="utf-8")
    OUT_TS.write_text(
        "/** Auto-synced from tools/ui/tool-frames.json */\n"
        "export const TOOL_FRAMES = {}\n".format(json.dumps(tools, indent=4)),
        encoding="utf-8",
    )

    if CATALOG.exists():
        cat = json.loads(CATALOG.read_text(encoding="utf-8"))
        entries = cat.get("entries") or cat.get("items") or []
        found = False
        for e in entries:
            if e.get("id") == "ic-ad-video":
                e["path"] = "assets/textures/ui/ic-ad-video.png"
                e["spriteFrame"] = sf
                found = True
                break
        if not found and isinstance(entries, list):
            entries.append(
                {
                    "id": "ic-ad-video",
                    "kind": "icon",
                    "path": "assets/textures/ui/ic-ad-video.png",
                    "spriteFrame": sf,
                }
            )
        CATALOG.write_text(json.dumps(cat, indent=2) + "\n", encoding="utf-8")

    print("OK", OUT.relative_to(ROOT), sf)


if __name__ == "__main__":
    main()
