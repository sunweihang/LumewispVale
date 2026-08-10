#!/usr/bin/env python3
"""Draw Stardew-proportion fishing minigame chrome (NOT AI).

Panel is intentionally narrow: rod | water track | progress groove,
with water + progress sharing the same top/bottom.

  /usr/local/bin/python3 tools/ui/draw_fishing_ui.py

Outputs (preserve UUID via existing .meta):
  assets/textures/ui/ui-fishing-panel.png
  assets/textures/ui/ui-fishing-bar.png

Prints layout constants for FishingMinigame.ts (logical 1x, display = ×SCALE).
"""

import json
import uuid
from pathlib import Path
from typing import Dict, Tuple

from PIL import Image

try:
    RESAMPLE_NEAREST = Image.Resampling.NEAREST
except AttributeError:
    RESAMPLE_NEAREST = Image.NEAREST

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "assets/textures/ui"
SRC = Path(__file__).resolve().parent / "ai-source"
UUID_MAP = Path(__file__).resolve().parent / "uuid-map.json"
FF = Path(__file__).resolve().parent / "fishing-frames.json"
MF = Path(__file__).resolve().parent / "material-frames.json"
CATALOG = Path(__file__).resolve().parent / "catalog.json"
OUT_TS = ROOT / "assets/scripts/game/FishingFrames.ts"
TEX_SUFFIX = "6c48a"
SF_SUFFIX = "f9941"

# Logical (1x) → display via nearest ×SCALE
# Stardew-like: skinny board, narrow water (~1/3 width), thin meter.
SCALE = 2
PANEL_W, PANEL_H = 80, 292
BAR_W, BAR_H = 24, 52

# Exact regions in logical panel space (y down). Shared vertical span.
PAD = 4
TRACK_X0, TRACK_X1 = 22, 49  # inclusive → w=28 (~35% of panel)
TRACK_Y0, TRACK_Y1 = 12, 279  # inclusive → h=268
PROG_X0, PROG_X1 = 56, 65  # inclusive → w=10; same y as track
# Rod lives in wood strip left of track

C = {
    "outline": (40, 24, 12, 255),
    "wood_dk": (110, 58, 22, 255),
    "wood": (176, 104, 36, 255),
    "wood_mid": (196, 120, 42, 255),
    "wood_hi": (228, 152, 62, 255),
    "wood_hi2": (242, 186, 104, 255),
    "screw": (72, 44, 22, 255),
    "screw_hi": (160, 110, 60, 255),
    "water": (168, 210, 236, 255),
    "water_edge": (120, 170, 210, 255),
    "water_hi": (198, 228, 246, 255),
    "rim": (72, 42, 18, 255),
    "prog_empty": (48, 30, 18, 255),
    "prog_edge": (28, 16, 10, 255),
    "rod": (118, 72, 32, 255),
    "rod_dk": (78, 46, 20, 255),
    "rod_hi": (168, 112, 52, 255),
    "reel": (90, 96, 110, 255),
    "reel_hi": (150, 156, 170, 255),
    "line": (210, 200, 170, 255),
    # Match Stardew catch bar: solid opaque bright green block (not mint/translucent).
    "bar_outline": (24, 72, 16, 255),
    "bar_hi": (120, 230, 80, 255),
    "bar_mid": (74, 206, 58, 255),
    "bar_dk": (48, 160, 40, 255),
    "bar_deep": (36, 120, 28, 255),
}


def put(p, w, h, x, y, c):
    if 0 <= x < w and 0 <= y < h:
        p[x, y] = c


def fill_rect(p, w, h, x0, y0, x1, y1, c):
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            put(p, w, h, x, y, c)


def in_round_rect(x, y, x0, y0, x1, y1, r) -> bool:
    if x < x0 or x > x1 or y < y0 or y > y1:
        return False
    # corner tests
    corners = (
        (x0 + r, y0 + r, x <= x0 + r and y <= y0 + r),
        (x1 - r, y0 + r, x >= x1 - r and y <= y0 + r),
        (x0 + r, y1 - r, x <= x0 + r and y >= y1 - r),
        (x1 - r, y1 - r, x >= x1 - r and y >= y1 - r),
    )
    for cx, cy, active in corners:
        if active and (x - cx) * (x - cx) + (y - cy) * (y - cy) > r * r:
            return False
    return True


def outline_opaque(img: Image.Image, color) -> None:
    w, h = img.size
    p = img.load()
    opaque = [(x, y) for y in range(h) for x in range(w) if p[x, y][3] > 0]
    border = set()
    for x, y in opaque:
        for dx, dy in ((-1, 0), (1, 0), (0, -1), (0, 1)):
            nx, ny = x + dx, y + dy
            if not (0 <= nx < w and 0 <= ny < h) or p[nx, ny][3] == 0:
                border.add((nx, ny))
    for x, y in border:
        if 0 <= x < w and 0 <= y < h and p[x, y][3] == 0:
            p[x, y] = color


def draw_panel_logical() -> Image.Image:
    w, h = PANEL_W, PANEL_H
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    p = img.load()
    x0, y0, x1, y1 = 1, 1, w - 2, h - 2
    r = 5

    # Wood body
    for y in range(h):
        for x in range(w):
            if not in_round_rect(x, y, x0, y0, x1, y1, r):
                continue
            # subtle vertical grain
            grain = ((x * 17 + y * 3) % 11) - 5
            base = C["wood"]
            if x <= x0 + 1 or y <= y0 + 1:
                base = C["wood_hi"]
            elif x >= x1 - 1 or y >= y1 - 1:
                base = C["wood_dk"]
            elif (x + y) % 9 == 0:
                base = C["wood_mid"]
            c = (
                max(0, min(255, base[0] + grain)),
                max(0, min(255, base[1] + grain // 2)),
                max(0, min(255, base[2])),
                255,
            )
            p[x, y] = c

    # Inner highlight ring
    fill_rect(p, w, h, x0 + 2, y0 + 2, x1 - 2, y0 + 2, C["wood_hi2"])
    fill_rect(p, w, h, x0 + 2, y0 + 2, x0 + 2, y1 - 2, C["wood_hi"])

    # Corner screws
    for sx, sy in ((6, 6), (w - 7, 6), (6, h - 7), (w - 7, h - 7)):
        put(p, w, h, sx, sy, C["screw"])
        put(p, w, h, sx + 1, sy, C["screw_hi"])

    # --- Water track (narrow) ---
    fill_rect(p, w, h, TRACK_X0 - 1, TRACK_Y0 - 1, TRACK_X1 + 1, TRACK_Y1 + 1, C["rim"])
    fill_rect(p, w, h, TRACK_X0, TRACK_Y0, TRACK_X1, TRACK_Y1, C["water"])
    # left highlight / right shade inside water
    fill_rect(p, w, h, TRACK_X0, TRACK_Y0, TRACK_X0, TRACK_Y1, C["water_hi"])
    fill_rect(p, w, h, TRACK_X1, TRACK_Y0, TRACK_X1, TRACK_Y1, C["water_edge"])
    fill_rect(p, w, h, TRACK_X0, TRACK_Y0, TRACK_X1, TRACK_Y0, C["water_hi"])
    fill_rect(p, w, h, TRACK_X0, TRACK_Y1, TRACK_X1, TRACK_Y1, C["water_edge"])

    # --- Progress groove: SAME top/bottom as water ---
    fill_rect(p, w, h, PROG_X0 - 1, TRACK_Y0 - 1, PROG_X1 + 1, TRACK_Y1 + 1, C["prog_edge"])
    fill_rect(p, w, h, PROG_X0, TRACK_Y0, PROG_X1, TRACK_Y1, C["prog_empty"])
    # inner hollow bevel
    fill_rect(p, w, h, PROG_X0, TRACK_Y0, PROG_X0, TRACK_Y1, C["prog_edge"])
    fill_rect(p, w, h, PROG_X1, TRACK_Y0, PROG_X1, TRACK_Y1, C["rim"])

    # --- Fishing rod in left wood strip (reads as rod, not a slider) ---
    rod_x = 11
    # pole shaft
    fill_rect(p, w, h, rod_x, TRACK_Y0 + 6, rod_x + 1, TRACK_Y1 - 22, C["rod"])
    fill_rect(p, w, h, rod_x, TRACK_Y0 + 6, rod_x, TRACK_Y1 - 22, C["rod_hi"])
    # tapered tip + line
    put(p, w, h, rod_x, TRACK_Y0 + 3, C["rod_dk"])
    put(p, w, h, rod_x + 1, TRACK_Y0 + 4, C["rod"])
    put(p, w, h, rod_x + 2, TRACK_Y0 + 5, C["line"])
    # line guides (rings)
    for gy in (TRACK_Y0 + 36, TRACK_Y0 + 80, TRACK_Y0 + 140, TRACK_Y0 + 200):
        put(p, w, h, rod_x - 1, gy, C["reel"])
        put(p, w, h, rod_x + 2, gy, C["reel"])
        put(p, w, h, rod_x + 3, gy, C["line"])
    # spinning reel body (side view)
    ry = (TRACK_Y0 + TRACK_Y1) // 2 - 4
    fill_rect(p, w, h, rod_x - 4, ry, rod_x + 3, ry + 9, C["reel"])
    fill_rect(p, w, h, rod_x - 3, ry + 1, rod_x + 2, ry + 7, C["reel_hi"])
    put(p, w, h, rod_x - 1, ry + 4, C["rod_dk"])
    put(p, w, h, rod_x + 3, ry + 2, C["reel"])  # bail arm
    put(p, w, h, rod_x + 4, ry + 3, C["reel_hi"])
    # cork handle
    fill_rect(p, w, h, rod_x - 1, TRACK_Y1 - 20, rod_x + 2, TRACK_Y1 - 10, C["rod_dk"])
    fill_rect(p, w, h, rod_x, TRACK_Y1 - 18, rod_x + 1, TRACK_Y1 - 12, C["rod_hi"])
    put(p, w, h, rod_x + 1, TRACK_Y1 - 9, C["outline"])

    outline_opaque(img, C["outline"])
    return img


def draw_bar_logical() -> Image.Image:
    """Stardew catch bar — solid opaque bright green block, 9-slice friendly."""
    w, h = BAR_W, BAR_H
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    p = img.load()
    # Slightly rounded rect (Stardew is blocky, not a soft mint capsule).
    r = 3
    x0, y0, x1, y1 = 1, 1, w - 2, h - 2
    for y in range(h):
        for x in range(w):
            if not in_round_rect(x, y, x0, y0, x1, y1, r):
                continue
            t = (x - x0) / max(1.0, float(x1 - x0))
            ny = (y - y0) / max(1.0, float(y1 - y0))
            # Solid body + subtle left highlight / right shadow (Stardew paddle).
            if t < 0.18:
                c = C["bar_hi"]
            elif t > 0.82:
                c = C["bar_dk"]
            elif ny < 0.1:
                c = C["bar_hi"]
            elif ny > 0.9:
                c = C["bar_deep"]
            else:
                c = C["bar_mid"]
            # Soft horizontal bands so the stretch reads as a solid paddle.
            if int(ny * 14) % 2 == 0 and 0.2 < t < 0.8:
                c = (
                    min(255, c[0] + 8),
                    min(255, c[1] + 10),
                    min(255, c[2] + 6),
                    255,
                )
            p[x, y] = c
    opaque = [(x, y) for y in range(h) for x in range(w) if p[x, y][3] > 0]
    for x, y in opaque:
        for dx, dy in ((-1, 0), (1, 0), (0, -1), (0, 1)):
            nx, ny = x + dx, y + dy
            if not (0 <= nx < w and 0 <= ny < h) or p[nx, ny][3] == 0:
                p[x, y] = C["bar_outline"]
                break
    # Inner top lip highlight
    fill_rect(p, w, h, x0 + 2, y0 + 1, x1 - 2, y0 + 2, C["bar_hi"])
    return img


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
        "panel": ("ui-fishing-panel", "assets/textures/ui/ui-fishing-panel.png", [PANEL_W * SCALE, PANEL_H * SCALE]),
        "bar": ("ui-fishing-bar", "assets/textures/ui/ui-fishing-bar.png", [BAR_W * SCALE, BAR_H * SCALE]),
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
            "tags": ["fishing", k, "hand-pixel"],
        }
        if eid in by_id:
            cat[key][by_id[eid]] = {**cat[key][by_id[eid]], **entry}
        else:
            cat[key].append(entry)
    CATALOG.write_text(json.dumps(cat, indent=2) + "\n", encoding="utf-8")


def layout_constants() -> dict:
    """Cocos local coords (y-up), display pixels (= logical × SCALE)."""
    s = SCALE
    cx = PANEL_W / 2.0
    cy = PANEL_H / 2.0
    track_cx = (TRACK_X0 + TRACK_X1) / 2.0
    track_cy = (TRACK_Y0 + TRACK_Y1) / 2.0
    prog_cx = (PROG_X0 + PROG_X1) / 2.0
    track_w = TRACK_X1 - TRACK_X0 + 1
    track_h = TRACK_Y1 - TRACK_Y0 + 1
    prog_w = PROG_X1 - PROG_X0 + 1
    # image y-down → cocos y-up: localY = cy - imageY
    return {
        "PANEL_W": PANEL_W * s,
        "PANEL_H": PANEL_H * s,
        "TRACK_W": track_w * s,
        "TRACK_H": track_h * s,
        "TRACK_X": (track_cx - cx) * s,
        "TRACK_Y": (cy - track_cy) * s,
        "PROG_W": max(4, (prog_w - 2) * s),  # fill inset 1px each side
        "PROG_X": (prog_cx - cx) * s,
        "PROG_INSET": 0,  # groove already matches track height
        "BAR_INSET_X": 3 * s,
    }


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    SRC.mkdir(parents=True, exist_ok=True)
    umap: dict = {}
    if UUID_MAP.exists():
        umap = json.loads(UUID_MAP.read_text(encoding="utf-8"))

    panel_l = draw_panel_logical()
    bar_l = draw_bar_logical()
    panel = panel_l.resize((PANEL_W * SCALE, PANEL_H * SCALE), RESAMPLE_NEAREST)
    bar = bar_l.resize((BAR_W * SCALE, BAR_H * SCALE), RESAMPLE_NEAREST)

    jobs = (
        ("panel", "ui-fishing-panel.png", panel, (0, 0, 0, 0)),
        # 9-slice caps (scaled)
        ("bar", "ui-fishing-bar.png", bar, (12, 12, 8, 8)),
    )
    frames: Dict[str, str] = {}
    for key, fname, im, borders in jobs:
        out = OUT / fname
        im.save(out)
        map_key = fname.replace(".png", "")
        image_uuid = write_meta(
            out,
            umap.get(map_key, {}).get("texture") or str(uuid.uuid4()),
            im.size[0],
            im.size[1],
            map_key,
            borders=borders,
        )
        sf = "{}@{}".format(image_uuid, SF_SUFFIX)
        umap[map_key] = {"texture": image_uuid, "prefab": "", "spriteFrame": sf}
        frames[key] = sf
        print("OK", out.relative_to(ROOT), im.size, sf)

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

    consts = layout_constants()
    print("\n// FishingMinigame layout (display px)")
    for k, v in consts.items():
        print("  {} = {}".format(k, v))

    # Preview
    prev = Image.new("RGBA", (panel.size[0] + bar.size[0] + 48, panel.size[1] + 24), (36, 52, 48, 255))
    prev.paste(panel, (12, 12), panel)
    prev.paste(bar, (panel.size[0] + 28, panel.size[1] // 2 - bar.size[1] // 2), bar)
    # mark track/prog on preview
    from PIL import ImageDraw

    d = ImageDraw.Draw(prev)
    s = SCALE
    d.rectangle(
        [
            12 + TRACK_X0 * s,
            12 + TRACK_Y0 * s,
            12 + TRACK_X1 * s,
            12 + TRACK_Y1 * s,
        ],
        outline=(255, 80, 80, 180),
    )
    d.rectangle(
        [
            12 + PROG_X0 * s,
            12 + TRACK_Y0 * s,
            12 + PROG_X1 * s,
            12 + TRACK_Y1 * s,
        ],
        outline=(80, 255, 120, 180),
    )
    prev_path = SRC / "fishing-hand-pixel-preview.png"
    prev.save(prev_path)
    print("preview", prev_path.relative_to(ROOT))


if __name__ == "__main__":
    main()
