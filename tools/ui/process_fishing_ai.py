#!/usr/bin/env python3
"""DEPRECATED for fishing chrome — proportions from AI refs were wrong.

Use the hand-pixel drawer instead:

  /usr/bin/python3 tools/ui/draw_fishing_ui.py

This script is kept only to re-ingest experimental AI refs if needed.
Preferred pipeline writes ui-fishing-panel / ui-fishing-bar via draw_fishing_ui.py.
"""

import json
import uuid
from pathlib import Path
from typing import Callable, Dict, Tuple

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
FF = Path(__file__).resolve().parent / "fishing-frames.json"
MF = Path(__file__).resolve().parent / "material-frames.json"
CATALOG = Path(__file__).resolve().parent / "catalog.json"
OUT_TS = ROOT / "assets/scripts/game/FishingFrames.ts"
TEX_SUFFIX = "6c48a"
SF_SUFFIX = "f9941"
OUTLINE = (40, 28, 18, 255)

WATER = (168, 210, 236, 255)
PROG_EMPTY = (56, 44, 32, 255)

PANEL_W, PANEL_H = 140, 360
BAR_W, BAR_H = 48, 104


def knock_gray_bg(im: Image.Image) -> Image.Image:
    im = im.convert("RGBA")
    px = im.load()
    w, h = im.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a == 0:
                continue
            mx, mn = max(r, g, b), min(r, g, b)
            chroma = mx - mn
            bright = (r + g + b) / 3
            if chroma < 24 and 85 <= bright <= 185:
                px[x, y] = (0, 0, 0, 0)
                continue
            if bright >= 232 and chroma < 30:
                px[x, y] = (0, 0, 0, 0)
    return im


def flood_corners(im: Image.Image, tol: int = 26) -> Image.Image:
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
        # Keep warm wood / saturated panel pixels.
        if chroma > 35 and bright < 210 and not (b > r + 10 and b > g):
            continue
        if bright < 70:
            continue
        if chroma > 22 and bright < 215 and not (chroma < 40 and 85 <= bright <= 195):
            continue
        px[x, y] = (0, 0, 0, 0)
        for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
            if 0 <= nx < w and 0 <= ny < h and (nx, ny) not in seen:
                nr, ng, nb, na = px[nx, ny]
                if na and abs(nr - r) <= tol and abs(ng - g) <= tol and abs(nb - b) <= tol:
                    stack.append((nx, ny))
    return im


def opaque_bbox(im: Image.Image) -> Tuple[int, int, int, int]:
    px = im.load()
    w, h = im.size
    min_x, min_y, max_x, max_y = w, h, -1, -1
    for y in range(h):
        for x in range(w):
            if px[x, y][3] > 20:
                min_x = min(min_x, x)
                min_y = min(min_y, y)
                max_x = max(max_x, x)
                max_y = max(max_y, y)
    if max_x < 0:
        return 0, 0, w - 1, h - 1
    return min_x, min_y, max_x, max_y


def clear_track_and_progress(im: Image.Image) -> Image.Image:
    """Wipe baked fish / green bar / progress fill so the panel is empty chrome."""
    im = im.convert("RGBA")
    px = im.load()
    w, h = im.size
    x0, y0, x1, y1 = opaque_bbox(im)
    bw = max(1, x1 - x0 + 1)
    bh = max(1, y1 - y0 + 1)

    # Approximate Stardew layout fractions inside the wood panel.
    track_l = x0 + int(bw * 0.22)
    track_r = x0 + int(bw * 0.72)
    track_t = y0 + int(bh * 0.08)
    track_b = y0 + int(bh * 0.92)
    prog_l = x0 + int(bw * 0.76)
    prog_r = x0 + int(bw * 0.92)
    prog_t = track_t
    prog_b = track_b

    for y in range(track_t, track_b + 1):
        for x in range(track_l, track_r + 1):
            r, g, b, a = px[x, y]
            if a < 8:
                continue
            # Keep dark wood rim pixels near edges.
            edge = (
                x <= track_l + 2
                or x >= track_r - 2
                or y <= track_t + 2
                or y >= track_b - 2
            )
            woodish = r > 90 and g > 50 and b < 90 and r > b + 20
            if edge and woodish:
                continue
            px[x, y] = WATER

    for y in range(prog_t, prog_b + 1):
        for x in range(prog_l, prog_r + 1):
            r, g, b, a = px[x, y]
            if a < 8:
                continue
            # Keep outer dark frame; clear green/orange fill + light contents.
            bright = (r + g + b) / 3
            if bright > 55 or g > r + 15 or (r > 140 and g > 80 and b < 90):
                px[x, y] = PROG_EMPTY
    return im


def outline_opaque(im: Image.Image, color=OUTLINE) -> Image.Image:
    im = im.convert("RGBA")
    px = im.load()
    w, h = im.size
    opaque = [(x, y) for y in range(h) for x in range(w) if px[x, y][3] > 0]
    border = set()
    for x, y in opaque:
        for dx, dy in ((-1, 0), (1, 0), (0, -1), (0, 1)):
            nx, ny = x + dx, y + dy
            if not (0 <= nx < w and 0 <= ny < h) or px[nx, ny][3] == 0:
                border.add((nx, ny))
    for x, y in border:
        if 0 <= x < w and 0 <= y < h and px[x, y][3] == 0:
            px[x, y] = color
    return im


def pixelize(im: Image.Image, logical: Tuple[int, int], out: Tuple[int, int], colors: int) -> Image.Image:
    lw, lh = logical
    ow, oh = out
    small = im.resize((lw, lh), RESAMPLE_BOX)
    # Quantize RGB then restore alpha.
    rgb = small.convert("RGB").quantize(colors=colors, method=QUANTIZE_MEDIANCUT).convert("RGBA")
    a = small.split()[-1]
    rgb.putalpha(a)
    # Re-knock near-transparent crumbs
    px = rgb.load()
    for y in range(lh):
        for x in range(lw):
            r, g, b, aa = px[x, y]
            if aa < 40:
                px[x, y] = (0, 0, 0, 0)
    rgb = outline_opaque(rgb)
    return rgb.resize((ow, oh), RESAMPLE_NEAREST)


def crop_content(im: Image.Image, pad: int = 4) -> Image.Image:
    x0, y0, x1, y1 = opaque_bbox(im)
    x0 = max(0, x0 - pad)
    y0 = max(0, y0 - pad)
    x1 = min(im.size[0] - 1, x1 + pad)
    y1 = min(im.size[1] - 1, y1 + pad)
    return im.crop((x0, y0, x1 + 1, y1 + 1))


def write_meta(
    png: Path,
    image_uuid: str,
    w: int,
    h: int,
    display: str,
    borders: Tuple[int, int, int, int] = (0, 0, 0, 0),
) -> str:
    meta_path = Path(str(png) + ".meta")
    hw, hh = w / 2.0, h / 2.0
    bt, bb, bl, br = borders
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
                    "borderTop": bt,
                    "borderBottom": bb,
                    "borderLeft": bl,
                    "borderRight": br,
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


def sync_catalog(frames: Dict[str, str]) -> None:
    if not CATALOG.exists():
        return
    cat = json.loads(CATALOG.read_text(encoding="utf-8"))
    key = "entries" if "entries" in cat else ("items" if "items" in cat else None)
    if key is None:
        return
    by_id = {e.get("id"): i for i, e in enumerate(cat[key]) if isinstance(e, dict)}
    specs = {
        "panel": ("ui-fishing-panel", "assets/textures/ui/ui-fishing-panel.png", [PANEL_W, PANEL_H]),
        "bar": ("ui-fishing-bar", "assets/textures/ui/ui-fishing-bar.png", [BAR_W, BAR_H]),
    }
    for k, sf in frames.items():
        if k not in specs:
            continue
        eid, path, size = specs[k]
        entry = {
            "id": eid,
            "kind": "chrome",
            "group": "fishing",
            "path": path,
            "spriteFrame": sf,
            "size": size,
            "tags": ["fishing", k],
        }
        if eid in by_id:
            cat[key][by_id[eid]] = {**cat[key][by_id[eid]], **entry}
        else:
            cat[key].append(entry)
    CATALOG.write_text(json.dumps(cat, indent=2) + "\n", encoding="utf-8")


def process_panel() -> Image.Image:
    src = SRC / "fishing-panel-empty-ai-ref.png"
    if not src.exists():
        src = SRC / "fishing-panel-ai-ref.png"
    if not src.exists():
        raise SystemExit("missing fishing panel AI ref")
    im = Image.open(src).convert("RGBA")
    im = knock_gray_bg(im)
    im = flood_corners(im)
    im = clear_track_and_progress(im)
    im = crop_content(im, pad=6)
    return pixelize(im, (70, 180), (PANEL_W, PANEL_H), 36)


def process_bar() -> Image.Image:
    """AI catch bar → solid opaque Stardew paddle (prefer stardew-ref)."""
    src = SRC / "fishing-bar-stardew-ai-ref.png"
    if not src.exists():
        src = SRC / "fishing-bar-ai-ref.png"
    if not src.exists():
        raise SystemExit("missing fishing bar AI ref")
    im = Image.open(src).convert("RGBA")
    im = knock_gray_bg(im)
    im = flood_corners(im)
    im = crop_content(im, pad=3)

    cw, ch = im.size
    scale = min((BAR_W - 4) / float(cw), (BAR_H - 4) / float(ch))
    nw = max(1, int(round(cw * scale)))
    nh = max(1, int(round(ch * scale)))
    tmp = im.resize((max(nw // 2, 8), max(nh // 2, 16)), RESAMPLE_BOX)
    scaled = tmp.resize((nw, nh), RESAMPLE_NEAREST)
    canvas = Image.new("RGBA", (BAR_W, BAR_H), (0, 0, 0, 0))
    canvas.paste(scaled, ((BAR_W - nw) // 2, (BAR_H - nh) // 2), scaled)

    px = canvas.load()
    for y in range(BAR_H):
        for x in range(BAR_W):
            r, g, b, a = px[x, y]
            if a < 30:
                px[x, y] = (0, 0, 0, 0)
                continue
            # Stardew paddle is fully opaque.
            if g > r and g > b:
                g = min(255, int(g * 1.04 + 6))
            px[x, y] = (r, g, b, 255)
    return outline_opaque(canvas)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    umap: dict = {}
    if UUID_MAP.exists():
        umap = json.loads(UUID_MAP.read_text(encoding="utf-8"))

    jobs = (
        # bar uses 9-slice so height stretch keeps round caps
        ("panel", "ui-fishing-panel.png", PANEL_W, PANEL_H, process_panel, (0, 0, 0, 0)),
        ("bar", "ui-fishing-bar.png", BAR_W, BAR_H, process_bar, (14, 14, 8, 8)),
    )
    frames = {}  # type: Dict[str, str]
    for key, fname, w, h, fn, borders in jobs:
        out = OUT / fname
        fn().save(out)
        map_key = fname.replace(".png", "")
        image_uuid = write_meta(
            out,
            umap.get(map_key, {}).get("texture") or str(uuid.uuid4()),
            w,
            h,
            map_key,
            borders=borders,
        )
        sf = "{}@{}".format(image_uuid, SF_SUFFIX)
        umap[map_key] = {"texture": image_uuid, "prefab": "", "spriteFrame": sf}
        frames[key] = sf
        print("OK", out.relative_to(ROOT), sf)

    # Point fish sprite at inventory fish icon if available.
    if MF.exists():
        mats = json.loads(MF.read_text(encoding="utf-8"))
        if mats.get("fish"):
            frames["fish"] = mats["fish"]

    UUID_MAP.write_text(json.dumps(umap, indent=2) + "\n", encoding="utf-8")
    FF.write_text(json.dumps(frames, indent=2) + "\n", encoding="utf-8")
    OUT_TS.write_text(
        "/** Auto-synced from tools/ui/fishing-frames.json */\n"
        "export const FISHING_FRAMES = {}\n".format(json.dumps(frames, indent=4)),
        encoding="utf-8",
    )
    sync_catalog(frames)

    # Preview strip
    prev = Image.new("RGBA", (PANEL_W + BAR_W + 40, PANEL_H + 20), (36, 48, 40, 255))
    panel = Image.open(OUT / "ui-fishing-panel.png").convert("RGBA")
    bar = Image.open(OUT / "ui-fishing-bar.png").convert("RGBA")
    prev.paste(panel, (10, 10), panel)
    prev.paste(bar, (PANEL_W + 20, PANEL_H // 2 - BAR_H // 2), bar)
    prev_path = SRC / "fishing-ai-preview.png"
    prev.save(prev_path)
    print("preview", prev_path.relative_to(ROOT))


if __name__ == "__main__":
    main()
