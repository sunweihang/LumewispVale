#!/usr/bin/env python3
"""Ingest AI farm tool icons → assets/textures/ui/ic-*.png (keep .meta UUIDs).

Sources (gray #808080 canvas):
  tools/ui/ai-source/ic-{hand,hoe,seeds,can,axe}-ai-ref.png

Logical 32 → NEAREST×3 → 96×96. Syncs tool-frames.json + ToolFrames.ts.

  /usr/bin/python3 tools/ui/process_tool_icons_ai.py
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
SRC = Path(__file__).resolve().parent / "ai-source"
OUT = ROOT / "assets/textures/ui"
UUID_MAP = Path(__file__).resolve().parent / "uuid-map.json"
TF = Path(__file__).resolve().parent / "tool-frames.json"
CATALOG = Path(__file__).resolve().parent / "catalog.json"
OUT_TS = ROOT / "assets/scripts/game/ToolFrames.ts"
TEX_SUFFIX = "6c48a"
SF_SUFFIX = "f9941"
OUTLINE = (40, 28, 18, 255)

LOGICAL = 32
OUT_SIZE = 96

# Metal tools: never eat mid-gray (blade fill is gray).
JOBS = (
    {"key": "hand", "src": "ic-hand-ai-ref.png", "colors": 28, "eat_mid_gray": True},
    {"key": "hoe", "src": "ic-hoe-ai-ref.png", "colors": 26, "eat_mid_gray": False},
    {"key": "seeds", "src": "ic-seeds-ai-ref.png", "colors": 28, "eat_mid_gray": True},
    {"key": "can", "src": "ic-can-ai-ref.png", "colors": 28, "eat_mid_gray": True},
    {"key": "axe", "src": "ic-axe-ai-ref.png", "colors": 26, "eat_mid_gray": False},
)

TOOL_ORDER = ("hand", "hoe", "seeds", "can", "axe")


def knock_bg(im, eat_mid_gray=True):
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
            if g >= 200 and r < 120 and b < 120:
                px[x, y] = (0, 0, 0, 0)
                continue
            mx, mn = max(r, g, b), min(r, g, b)
            chroma = mx - mn
            bright = (r + g + b) / 3
            if eat_mid_gray and chroma < 24 and 85 <= bright <= 185:
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
        bright = (r + g + b) / 3
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


def bbox_opaque(im, alpha_min=12):
    a = im.split()[-1]
    return a.point(lambda p: 255 if p >= alpha_min else 0).getbbox()


def trim(im, pad=2):
    bb = bbox_opaque(im)
    if not bb:
        return im
    x0, y0, x1, y1 = bb
    x0 = max(0, x0 - pad)
    y0 = max(0, y0 - pad)
    x1 = min(im.width, x1 + pad)
    y1 = min(im.height, y1 + pad)
    return im.crop((x0, y0, x1, y1))


def kill_canvas_gray_ring(im):
    """For metal icons: flood only near-uniform #808080 from edges, keep blade gray."""
    im = im.convert("RGBA")
    w, h = im.size
    px = im.load()
    seeds = [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)]
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
        # Mid gray canvas only (tight band around #808080)
        if abs(r - 128) < 28 and abs(g - 128) < 28 and abs(b - 128) < 28 and abs(r - g) < 12 and abs(g - b) < 12:
            px[x, y] = (0, 0, 0, 0)
            for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
                if (nx, ny) not in seen:
                    stack.append((nx, ny))
    return im


def pixelize(im, logical, out_size, colors, eat_mid_gray=True):
    im = trim(im)
    sw, sh = im.size
    scale = min(logical / float(sw), logical / float(sh)) * 0.90
    nw = max(1, int(round(sw * scale)))
    nh = max(1, int(round(sh * scale)))
    mid = im.resize((max(nw, nw * 2), max(nh, nh * 2)), RESAMPLE_BOX)
    small = mid.resize((nw, nh), RESAMPLE_NEAREST)

    flat = Image.new("RGBA", small.size, (0, 0, 0, 0))
    flat.paste(small, (0, 0), small)
    rgb = Image.new("RGB", flat.size, (0, 0, 0))
    rgb.paste(flat, mask=flat.split()[-1])
    pal = rgb.quantize(colors=colors, method=QUANTIZE_MEDIANCUT).convert("RGBA")
    out_small = Image.new("RGBA", flat.size, (0, 0, 0, 0))
    sp, fp, op = pal.load(), flat.load(), out_small.load()
    for y in range(flat.height):
        for x in range(flat.width):
            if fp[x, y][3] < 24:
                continue
            r, g, b, _ = sp[x, y]
            if r > 160 and b > 160 and g < 140:
                continue
            if (
                eat_mid_gray
                and abs(r - g) < 14
                and abs(g - b) < 14
                and 90 <= (r + g + b) / 3 <= 175
            ):
                continue
            # Residual pure canvas gray after metal-safe flood
            if (
                not eat_mid_gray
                and abs(r - 128) < 18
                and abs(g - 128) < 18
                and abs(b - 128) < 18
                and abs(r - g) < 8
            ):
                continue
            if g > r + 40 and g > b + 40 and g > 140:
                continue
            if r + g + b < 18 and fp[x, y][3] < 200:
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

    logical_canvas = Image.new("RGBA", (logical, logical), (0, 0, 0, 0))
    ox = (logical - out_small.width) // 2
    oy = (logical - out_small.height) // 2
    logical_canvas.paste(out_small, (ox, oy), out_small)
    return logical_canvas.resize((out_size, out_size), RESAMPLE_NEAREST)


def write_meta(png, image_uuid, w, h, display):
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
                "displayName": display,
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
                "displayName": display,
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


def sync_catalog(frames):
    if not CATALOG.exists():
        return
    cat = json.loads(CATALOG.read_text(encoding="utf-8"))
    entries = cat.get("entries") or cat.get("items") or []
    if not isinstance(entries, list):
        return
    by_id = {e.get("id"): e for e in entries if isinstance(e, dict)}
    for key, sf in frames.items():
        eid = "ic-{}".format(key)
        path = "assets/textures/ui/{}.png".format(eid)
        if eid in by_id:
            by_id[eid]["path"] = path
            by_id[eid]["spriteFrame"] = sf
        else:
            entries.append(
                {
                    "id": eid,
                    "kind": "icon",
                    "group": "tool",
                    "path": path,
                    "spriteFrame": sf,
                    "size": [96, 96],
                    "tags": ["tool", key, "ai"],
                }
            )
    CATALOG.write_text(json.dumps(cat, indent=2) + "\n", encoding="utf-8")


def process_one(job):
    src = SRC / job["src"]
    if not src.exists():
        raise SystemExit("missing AI ref: {}".format(src))
    im = Image.open(src).convert("RGBA")
    if job["eat_mid_gray"]:
        im = knock_bg(im, eat_mid_gray=True)
        im = flood_corners(im)
    else:
        im = knock_bg(im, eat_mid_gray=False)
        im = kill_canvas_gray_ring(im)
        im = flood_corners(im, tol=22)
    return pixelize(
        im,
        LOGICAL,
        OUT_SIZE,
        job["colors"],
        eat_mid_gray=job["eat_mid_gray"],
    )


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    umap = {}
    if UUID_MAP.exists():
        umap = json.loads(UUID_MAP.read_text(encoding="utf-8"))

    frames = {}
    for job in JOBS:
        out = OUT / "ic-{}.png".format(job["key"])
        process_one(job).save(out)
        image_uuid = write_meta(
            out,
            umap.get("ic-{}".format(job["key"]), {}).get("texture") or str(uuid.uuid4()),
            OUT_SIZE,
            OUT_SIZE,
            "ic-{}".format(job["key"]),
        )
        sf = "{}@{}".format(image_uuid, SF_SUFFIX)
        umap["ic-{}".format(job["key"])] = {
            "texture": image_uuid,
            "prefab": "",
            "spriteFrame": sf,
        }
        frames[job["key"]] = sf
        print("OK", out.relative_to(ROOT), sf)

    UUID_MAP.write_text(json.dumps(umap, indent=2) + "\n", encoding="utf-8")

    tools = {}
    if TF.exists():
        tools = json.loads(TF.read_text(encoding="utf-8"))
    ordered = {}
    for k in TOOL_ORDER:
        ordered[k] = frames[k]
    for k, v in tools.items():
        if k not in ordered:
            ordered[k] = v
    TF.write_text(json.dumps(ordered, indent=2) + "\n", encoding="utf-8")
    OUT_TS.write_text(
        "/** Auto-synced from tools/ui/tool-frames.json */\n"
        "export const TOOL_FRAMES = {}\n".format(json.dumps(ordered, indent=4)),
        encoding="utf-8",
    )
    sync_catalog(frames)

    # Contact sheet preview
    pad = 8
    sheet = Image.new(
        "RGBA",
        (len(TOOL_ORDER) * OUT_SIZE + (len(TOOL_ORDER) + 1) * pad, OUT_SIZE + pad * 2),
        (40, 48, 40, 255),
    )
    for i, k in enumerate(TOOL_ORDER):
        im = Image.open(OUT / "ic-{}.png".format(k)).convert("RGBA")
        sheet.paste(im, (pad + i * (OUT_SIZE + pad), pad), im)
    preview = SRC / "tool-icons-ai-preview.png"
    sheet.save(preview)
    print("preview", preview.relative_to(ROOT))


if __name__ == "__main__":
    main()
