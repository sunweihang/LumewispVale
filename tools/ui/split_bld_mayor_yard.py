#!/usr/bin/env python3
"""Split bld-mayor into house + yard-ground + yard-occluders for Y-sort.

Why three layers:
  - One combined yard sprite with foot at the front hedge draws *after*
    anyone standing in the garden — so flowers/path paint over the player.
  - Ground (grass / path / low flowers) stays underfoot (WorldYSort litter).
  - Occluders (hedge / fountain / side trees) keep a south foot for tuck-behind.

    python tools/ui/split_bld_mayor_yard.py
    python tools/ui/split_bld_mayor_yard.py --preview-only

Outputs:
  assets/textures/buildings/bld-mayor.png              (house, UUID kept)
  assets/textures/buildings/bld-mayor-yard.png         (hedge/fountain/trees)
  assets/textures/buildings/bld-mayor-yard-ground.png  (underfoot lot)
"""

from __future__ import annotations

import argparse
import json
import shutil
import uuid
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
AI = Path(__file__).resolve().parent / "ai-source"
BLD = ROOT / "assets/textures/buildings"
SRC = BLD / "bld-mayor.png"
BACKUP = AI / "bld-mayor-pre-split.png"
UUID_MAP = Path(__file__).resolve().parent / "uuid-map.json"

TEX_SUFFIX = "6c48a"
SF_SUFFIX = "f9941"

ORIG_W, ORIG_H = 320, 272

FOUNDATION_Y = 198
DOOR_X0, DOOR_X1 = 198, 288
DOOR_KEEP_Y1 = 228
TREE_BAND_L = (4, 56)
TREE_BAND_R = (262, 316)
TREE_Y0 = 118
TREE_Y1 = FOUNDATION_Y + 8

# Front hedge band + thin side-hedge walls (image Y/X).
FRONT_HEDGE_Y0 = 248
SIDE_HEDGE_L = 22
SIDE_HEDGE_R = 298
# Fountain bowl (approx) — stone/water only, not surrounding flower beds.
FOUNTAIN = (70, 155, 195, 245)  # x0, x1, y0, y1


def is_roof(r: int, g: int, b: int) -> bool:
    return r > g + 35 and r > b + 40 and r > 130 and g < 120 and b < 100


def is_veg(r: int, g: int, b: int) -> bool:
    return g > r + 14 and g > b + 10 and g > 60 and not is_roof(r, g, b)


def is_trunk(r: int, g: int, b: int) -> bool:
    return 45 < r < 130 and 25 < g < 95 and b < 70 and r >= g >= b and (r - b) > 18 and g < r - 5


def is_water(r: int, g: int, b: int) -> bool:
    return b > r + 18 and b > g + 5 and b > 90


def is_path_stone(r: int, g: int, b: int) -> bool:
    if is_roof(r, g, b) or is_veg(r, g, b):
        return False
    return (
        abs(r - g) < 28
        and abs(g - b) < 28
        and 70 <= r <= 185
        and max(r, g, b) - min(r, g, b) < 38
    )


def is_flower(r: int, g: int, b: int) -> bool:
    if is_veg(r, g, b) or is_roof(r, g, b):
        return False
    if r > g + 30 and r > b + 15 and r > 130:
        return True
    if b > r + 20 and b > g + 5 and b > 110:
        return True
    if r > 145 and b > 110 and g < min(r, b) + 30:
        return True
    return False


def is_facade_wood(r: int, g: int, b: int) -> bool:
    if is_veg(r, g, b) or is_roof(r, g, b) or is_water(r, g, b):
        return False
    return r > b + 18 and g > b + 5 and 55 < r < 210 and g < 175


def is_wood_post(r: int, g: int, b: int) -> bool:
    return r > g >= b and 55 < r < 160 and g < 110 and (r - b) > 22 and not is_veg(r, g, b)


def in_side_tree_band(x: int, y: int) -> bool:
    if not (TREE_Y0 <= y < TREE_Y1):
        return False
    return TREE_BAND_L[0] <= x < TREE_BAND_L[1] or TREE_BAND_R[0] <= x < TREE_BAND_R[1]


def in_fountain(x: int, y: int) -> bool:
    x0, x1, y0, y1 = FOUNTAIN
    return x0 <= x < x1 and y0 <= y < y1


def build_masks(rgba: np.ndarray) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Return (house, yard_ground, yard_occlude) boolean masks."""
    h, w, _ = rgba.shape
    alpha = rgba[:, :, 3] >= 10
    yard = np.zeros((h, w), dtype=bool)

    for y in range(h):
        for x in range(w):
            if not alpha[y, x]:
                continue
            r, g, b = map(int, rgba[y, x, :3])

            if y < FOUNDATION_Y and is_roof(r, g, b):
                continue
            if y < FOUNDATION_Y and is_facade_wood(r, g, b) and not in_side_tree_band(x, y):
                continue

            if in_side_tree_band(x, y) and (is_veg(r, g, b) or is_trunk(r, g, b)):
                yard[y, x] = True
                continue

            if FOUNDATION_Y - 12 <= y < FOUNDATION_Y and 55 <= x <= 165:
                if is_water(r, g, b) or is_path_stone(r, g, b) or is_veg(r, g, b):
                    yard[y, x] = True
                    continue

            if y < FOUNDATION_Y:
                continue

            in_door = DOOR_X0 <= x <= DOOR_X1
            if in_door and y <= DOOR_KEEP_Y1:
                if is_veg(r, g, b) or is_flower(r, g, b):
                    yard[y, x] = True
                continue

            yard[y, x] = True

    # Window-box flora stays on the house facade.
    for y in range(FOUNDATION_Y - 24, FOUNDATION_Y):
        for x in range(60, 250):
            if not yard[y, x] or in_side_tree_band(x, y):
                continue
            r, g, b = map(int, rgba[y, x, :3])
            if is_flower(r, g, b) or is_veg(r, g, b):
                yard[y, x] = False

    house = alpha & ~yard
    for y in range(DOOR_KEEP_Y1 + 1, h):
        for x in range(w):
            if house[y, x]:
                yard[y, x] = True
                house[y, x] = False

    yard &= alpha
    house = alpha & ~yard

    # Split yard → underfoot ground vs tall occluders.
    # Flowers / path / open lawn MUST stay on ground (never Y-sort over the player).
    occlude = np.zeros((h, w), dtype=bool)
    for y in range(h):
        for x in range(w):
            if not yard[y, x]:
                continue
            r, g, b = map(int, rgba[y, x, :3])

            # Hard underfoot — never occlude.
            if is_flower(r, g, b):
                continue
            if is_path_stone(r, g, b) and not in_fountain(x, y):
                continue

            # Side trees
            if in_side_tree_band(x, y) and (is_veg(r, g, b) or is_trunk(r, g, b)):
                occlude[y, x] = True
                continue

            # Fountain bowl (stone + water only)
            if in_fountain(x, y) and (is_water(r, g, b) or is_path_stone(r, g, b)):
                occlude[y, x] = True
                continue

            # Front hedge + gate posts (skip the cobble gap)
            if y >= FRONT_HEDGE_Y0 and (
                is_veg(r, g, b) or is_wood_post(r, g, b) or is_trunk(r, g, b)
            ):
                occlude[y, x] = True
                continue

            # Thin side-hedge walls
            if (x < SIDE_HEDGE_L or x >= SIDE_HEDGE_R) and (
                is_veg(r, g, b) or is_wood_post(r, g, b) or is_trunk(r, g, b)
            ):
                occlude[y, x] = True

    ground = yard & ~occlude
    return house, ground, occlude


def crop_content(rgba: np.ndarray, mask: np.ndarray) -> tuple[Image.Image, dict]:
    ys, xs = np.where(mask)
    if len(xs) == 0:
        raise RuntimeError("empty mask")
    x0, x1 = int(xs.min()), int(xs.max()) + 1
    y0, y1 = int(ys.min()), int(ys.max()) + 1
    layer = np.zeros_like(rgba)
    layer[mask] = rgba[mask]
    img = Image.fromarray(layer[y0:y1, x0:x1], "RGBA")
    orig_cx = ORIG_W * 0.5
    crop_cx = (x0 + x1) * 0.5
    return img, {
        "x0": x0,
        "y0": y0,
        "x1": x1,
        "y1": y1,
        "w": img.width,
        "h": img.height,
        "foot_from_bottom": ORIG_H - y1,
        "cx_delta": crop_cx - orig_cx,
    }


def write_meta(png_path: Path, image_uuid: str, w: int, h: int) -> str:
    name = png_path.stem
    meta = {
        "ver": "1.0.27",
        "importer": "image",
        "imported": True,
        "uuid": image_uuid,
        "files": [".json", ".png"],
        "subMetas": {
            TEX_SUFFIX: {
                "importer": "texture",
                "uuid": f"{image_uuid}@{TEX_SUFFIX}",
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
                "uuid": f"{image_uuid}@{SF_SUFFIX}",
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
    png_path.with_suffix(".png.meta").write_text(json.dumps(meta, indent=2) + "\n", encoding="utf-8")
    return f"{image_uuid}@{SF_SUFFIX}"


def make_preview(
    layers: list[tuple[str, Image.Image, dict]],
) -> Image.Image:
    n = len(layers)
    canvas = Image.new("RGBA", (ORIG_W * n + 8 * (n + 1), ORIG_H + 48), (40, 44, 52, 255))
    for i, (_name, src, info) in enumerate(layers):
        layer = Image.new("RGBA", (ORIG_W, ORIG_H), (0, 0, 0, 0))
        layer.paste(src, (info["x0"], info["y0"]), src)
        canvas.paste(layer, (8 + i * (ORIG_W + 8), 28), layer)
    return canvas


def _umap_entry(tex: str, sf: str, info: dict) -> dict:
    return {
        "texture": tex,
        "spriteFrame": sf,
        "prefab": "",
        "w": info["w"],
        "h": info["h"],
        "foot_from_bottom": info["foot_from_bottom"],
        "cx_delta": info["cx_delta"],
    }


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--preview-only", action="store_true")
    args = ap.parse_args()

    AI.mkdir(parents=True, exist_ok=True)
    src_path = BACKUP if BACKUP.exists() else SRC
    if not BACKUP.exists() and SRC.exists() and not args.preview_only:
        # Only backup if SRC still looks like the combined original.
        im = Image.open(SRC)
        if im.size == (ORIG_W, ORIG_H):
            shutil.copy2(SRC, BACKUP)
            print("backed up", BACKUP.name)
            src_path = BACKUP

    rgba = np.array(Image.open(src_path).convert("RGBA"))
    assert rgba.shape[0] == ORIG_H and rgba.shape[1] == ORIG_W, rgba.shape

    house_m, ground_m, occlude_m = build_masks(rgba)
    house_img, hi = crop_content(rgba, house_m)
    ground_img, gi = crop_content(rgba, ground_m)
    occlude_img, oi = crop_content(rgba, occlude_m)

    preview = make_preview(
        [
            ("house", house_img, hi),
            ("ground", ground_img, gi),
            ("occlude", occlude_img, oi),
        ]
    )
    prev_path = AI / "preview-mayor-house-yard.png"
    preview.save(prev_path)
    print("preview", prev_path)
    print("house  ", hi)
    print("ground ", gi)
    print("occlude", oi)
    print(
        "counts house/ground/occlude",
        int(house_m.sum()),
        int(ground_m.sum()),
        int(occlude_m.sum()),
    )

    place = {"old": {"w": ORIG_W, "h": ORIG_H}, "house": hi, "ground": gi, "occlude": oi}
    (AI / "mayor-house-yard-place.json").write_text(json.dumps(place, indent=2) + "\n", encoding="utf-8")

    if args.preview_only:
        return

    umap = json.loads(UUID_MAP.read_text(encoding="utf-8")) if UUID_MAP.exists() else {}
    mayor_tex = (umap.get("bld-mayor") or {}).get("texture") or "0fbd2c56-2698-4894-8479-85885ae07b03"
    yard_tex = (umap.get("bld-mayor-yard") or {}).get("texture") or str(uuid.uuid4())
    ground_tex = (umap.get("bld-mayor-yard-ground") or {}).get("texture") or str(uuid.uuid4())

    house_out = BLD / "bld-mayor.png"
    yard_out = BLD / "bld-mayor-yard.png"
    ground_out = BLD / "bld-mayor-yard-ground.png"
    house_img.save(house_out)
    occlude_img.save(yard_out)
    ground_img.save(ground_out)

    house_sf = write_meta(house_out, mayor_tex, house_img.width, house_img.height)
    yard_sf = write_meta(yard_out, yard_tex, occlude_img.width, occlude_img.height)
    ground_sf = write_meta(ground_out, ground_tex, ground_img.width, ground_img.height)

    umap["bld-mayor"] = _umap_entry(mayor_tex, house_sf, hi)
    umap["bld-mayor-yard"] = _umap_entry(yard_tex, yard_sf, oi)
    umap["bld-mayor-yard-ground"] = _umap_entry(ground_tex, ground_sf, gi)
    UUID_MAP.write_text(json.dumps(umap, indent=2) + "\n", encoding="utf-8")

    print("wrote", house_out.relative_to(ROOT), f"{house_img.width}x{house_img.height}")
    print("wrote", yard_out.relative_to(ROOT), f"{occlude_img.width}x{occlude_img.height}")
    print("wrote", ground_out.relative_to(ROOT), f"{ground_img.width}x{ground_img.height}")
    print(
        "place offsets: house+",
        hi["foot_from_bottom"],
        "occlude+",
        oi["foot_from_bottom"],
        "ground+",
        gi["foot_from_bottom"],
    )


if __name__ == "__main__":
    main()
