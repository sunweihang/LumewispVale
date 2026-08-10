#!/usr/bin/env python3
"""Ingest AI quest-reward icons → assets/textures/ui/ic-*.png (keep .meta UUIDs).

Sources live in tools/ui/ai-source/. Add new JOBS entries for more reward kinds
(gold / seeds / gift / …). Syncs reward-frames.json + RewardFrames.ts and merges
`gold` into material-frames.json when present.
"""

from __future__ import annotations

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
REWARD_JSON = Path(__file__).resolve().parent / "reward-frames.json"
MAT_JSON = Path(__file__).resolve().parent / "material-frames.json"
OUT_TS = ROOT / "assets/scripts/game/RewardFrames.ts"
MAT_TS = ROOT / "assets/scripts/game/MaterialFrames.ts"
CATALOG = Path(__file__).resolve().parent / "catalog.json"
TEX_SUFFIX = "6c48a"
SF_SUFFIX = "f9941"
OUTLINE = (40, 28, 18, 255)

# Extend this tuple when new reward icon kinds are AI'd.
JOBS = (
    {
        "key": "gold",
        "src": "ic-gold-ai-ref.png",
        # Wheat-sheaf coin needs more logical res so the stamp stays readable.
        "colors": 36,
        "logical": 48,
        # v2 source is already a bare coin on transparent / gray — don't inset-crop.
        "strip_frame": False,
        "eat_mid_gray": True,
    },
)

LOGICAL = 32
OUT_SIZE = 96


def knock_bg(im: Image.Image, eat_mid_gray: bool = True) -> Image.Image:
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


def flood_corners(im: Image.Image, tol: int = 28) -> Image.Image:
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


def strip_slot_frame(im: Image.Image) -> Image.Image:
    """Drop wood inventory chrome; keep the centered coin/body."""
    im = im.convert("RGBA")
    bb = bbox_opaque(im)
    if not bb:
        return im
    x0, y0, x1, y1 = bb
    bw, bh = x1 - x0, y1 - y0
    inset = max(8, int(round(min(bw, bh) * 0.2)))
    cropped = im.crop((x0 + inset, y0 + inset, x1 - inset, y1 - inset)).convert("RGBA")
    px = cropped.load()
    cw, ch = cropped.size
    for y in range(ch):
        for x in range(cw):
            r, g, b, a = px[x, y]
            if a == 0:
                continue
            bright = (r + g + b) / 3.0
            chroma = max(r, g, b) - min(r, g, b)
            # Wood / parchment frame leftovers (not gold metal).
            if bright > 150 and chroma < 55 and r < 210:
                px[x, y] = (0, 0, 0, 0)
                continue
            if 90 <= bright <= 170 and chroma < 40 and g < r and b < r:
                # Mid brown plank
                if r < 190 or g > 140:
                    px[x, y] = (0, 0, 0, 0)
    return cropped


def bbox_opaque(im: Image.Image, alpha_min: int = 12):
    a = im.split()[-1]
    return a.point(lambda p: 255 if p >= alpha_min else 0).getbbox()


def trim(im: Image.Image, pad: int = 2) -> Image.Image:
    bb = bbox_opaque(im)
    if not bb:
        return im
    x0, y0, x1, y1 = bb
    x0 = max(0, x0 - pad)
    y0 = max(0, y0 - pad)
    x1 = min(im.width, x1 + pad)
    y1 = min(im.height, y1 + pad)
    return im.crop((x0, y0, x1, y1))


def pixelize(im: Image.Image, logical: int, out_size: int, colors: int) -> Image.Image:
    im = trim(im)
    sw, sh = im.size
    scale = min(logical / sw, logical / sh) * 0.9
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
            if abs(r - g) < 14 and abs(g - b) < 14 and 90 <= (r + g + b) / 3 <= 175:
                continue
            if g > r + 40 and g > b + 40 and g > 140:
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


def write_meta(png: Path, image_uuid: str, w: int, h: int, display: str) -> str:
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


def sync_catalog(frames: dict) -> None:
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
                    "group": "reward",
                    "path": path,
                    "spriteFrame": sf,
                    "size": [OUT_SIZE, OUT_SIZE],
                    "tags": ["reward", key, "ai"],
                }
            )
    CATALOG.write_text(json.dumps(cat, indent=2) + "\n", encoding="utf-8")


def process_one(job: dict) -> Image.Image:
    src = SRC / job["src"]
    if not src.exists():
        raise SystemExit("missing AI source: {}".format(src))
    im = Image.open(src).convert("RGBA")
    im = knock_bg(im, eat_mid_gray=job.get("eat_mid_gray", True))
    if job.get("eat_mid_gray", True):
        im = flood_corners(im)
    if job.get("strip_frame"):
        im = strip_slot_frame(im)
    logical = int(job.get("logical", LOGICAL))
    return pixelize(im, logical, OUT_SIZE, job["colors"])


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    umap: dict = {}
    if UUID_MAP.exists():
        umap = json.loads(UUID_MAP.read_text(encoding="utf-8"))

    frames = {}
    contact = Image.new(
        "RGBA",
        (OUT_SIZE * max(1, len(JOBS)) + 24 + max(0, len(JOBS) - 1) * 6, OUT_SIZE + 24),
        (48, 42, 36, 255),
    )
    for i, job in enumerate(JOBS):
        out_img = process_one(job)
        out_path = OUT / "ic-{}.png".format(job["key"])
        out_img.save(out_path)
        map_key = "ic-{}".format(job["key"])
        image_uuid = write_meta(
            out_path,
            umap.get(map_key, {}).get("texture") or str(uuid.uuid4()),
            OUT_SIZE,
            OUT_SIZE,
            map_key,
        )
        sf = "{}@{}".format(image_uuid, SF_SUFFIX)
        umap[map_key] = {"texture": image_uuid, "prefab": "", "spriteFrame": sf}
        frames[job["key"]] = sf
        contact.paste(out_img, (12 + i * (OUT_SIZE + 6), 12), out_img)
        print("OK", out_path.relative_to(ROOT), sf)

    UUID_MAP.write_text(json.dumps(umap, indent=2) + "\n", encoding="utf-8")
    REWARD_JSON.write_text(json.dumps(frames, indent=2) + "\n", encoding="utf-8")
    OUT_TS.write_text(
        "/** Auto-synced from tools/ui/reward-frames.json — multi-kind quest rewards. */\n"
        "export const REWARD_FRAMES = {}\n".format(json.dumps(frames, indent=4)),
        encoding="utf-8",
    )

    # Keep MaterialFrames.gold in sync when we ship a coin.
    if "gold" in frames and MAT_JSON.exists():
        mat = json.loads(MAT_JSON.read_text(encoding="utf-8"))
        mat["gold"] = frames["gold"]
        MAT_JSON.write_text(json.dumps(mat, indent=2) + "\n", encoding="utf-8")
        MAT_TS.write_text(
            "/** Auto-synced from tools/ui/material-frames.json */\n"
            "export const MATERIAL_FRAMES = {}\n".format(json.dumps(mat, indent=4)),
            encoding="utf-8",
        )

    sync_catalog(frames)
    prev = SRC / "reward-icons-ai-preview.png"
    contact.save(prev)
    print("preview", prev.relative_to(ROOT))


if __name__ == "__main__":
    main()
