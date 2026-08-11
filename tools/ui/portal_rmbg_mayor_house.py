#!/usr/bin/env python3
"""Cut out mayor-house interior AI refs via CreativeCenter portal RMBG, then fit into assets.

Props → assets/textures/props/  (foot pivot)
Wood floor tile → assets/textures/terrain/ (center pivot, no RMBG)

    python tools/ui/portal_rmbg_mayor_house.py
    python tools/ui/portal_rmbg_mayor_house.py --only desk,tea-table
    python tools/ui/portal_rmbg_mayor_house.py --floor-only
"""

from __future__ import annotations

import argparse
import json
import uuid
from pathlib import Path

from PIL import Image

from portal_rmbg_buildings import (
    AI,
    CUTOUT_DIR,
    SF_SUFFIX,
    TEX_SUFFIX,
    UUID_MAP,
    Portal,
    alpha_pct,
    fit_foot,
    quantize,
)
from process_bag_ai import flood_corners, knock_gray_bg

ROOT = Path(__file__).resolve().parents[2]
PROPS = ROOT / "assets/textures/props"
TERRAIN = ROOT / "assets/textures/terrain"

# name -> (ref stem, tw, th, kind)
# kind: prop (foot) | tile (center fill)
SPECS = [
    ("prop-desk-mayor", "prop-desk-mayor-ai-ref", 112, 80, "prop"),
    ("prop-tea-table", "prop-tea-table-ai-ref", 80, 64, "prop"),
    ("prop-bookshelf", "prop-bookshelf-ai-ref", 80, 112, "prop"),
    ("prop-chair", "prop-chair-ai-ref", 48, 56, "prop"),
    ("prop-rug-mayor", "prop-rug-mayor-ai-ref", 128, 80, "prop"),
    ("prop-door-exit", "prop-door-exit-ai-ref", 96, 112, "prop"),
    ("prop-wall-mayor", "prop-wall-mayor-ai-ref", 128, 96, "prop"),
    ("prop-wall-plain", "prop-wall-plain-ai-ref", 128, 96, "prop"),
    ("prop-wall-decor", "prop-wall-decor-ai-ref", 128, 96, "prop"),
    ("prop-wall-side", "prop-wall-side-plain-ai-ref", 48, 112, "prop"),
]

FLOOR_SRC = AI / "tile-wood-floor-ai-ref.png"
FLOOR_KEY = "tile-wood-floor"
FLOOR_KEY_B = "tile-wood-floor-b"
WALL_TILE_SRC = AI / "tile-wall-interior-ai-ref.png"
WALL_TILE_KEY = "tile-wall-interior"


def write_meta(png_path: Path, image_uuid: str, w: int, h: int, name: str, pivot_y: float) -> None:
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
                    "pivotY": pivot_y,
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


def resolve_uuid(path: Path) -> str:
    meta_path = path.with_suffix(".png.meta")
    if meta_path.exists():
        try:
            return json.loads(meta_path.read_text(encoding="utf-8"))["uuid"]
        except Exception:
            pass
    return str(uuid.uuid4())


def make_wood_tile(src: Path, out_path: Path, map_key: str, umap: dict, tint: float = 0.0) -> None:
    """Center-crop AI floor ref → 64×64 opaque wood tile (center pivot)."""
    im = Image.open(src).convert("RGBA")
    w, h = im.size
    side = min(w, h)
    # Prefer a clean mid-plank patch (avoid vignette / text crumbs).
    cx, cy = w // 2, int(h * 0.42)
    x0 = max(0, cx - side // 2)
    y0 = max(0, cy - side // 2)
    crop = im.crop((x0, y0, x0 + side, y0 + side))
    mid = crop.resize((128, 128), Image.BOX)
    tile = mid.resize((64, 64), Image.NEAREST)
    # Flatten any residual alpha to solid wood.
    bg = Image.new("RGBA", tile.size, (140, 96, 58, 255))
    bg.paste(tile, (0, 0), tile)
    px = bg.load()
    for y in range(64):
        for x in range(64):
            r, g, b, _ = px[x, y]
            if tint:
                r = max(0, min(255, int(r * (1 + tint))))
                g = max(0, min(255, int(g * (1 + tint * 0.6))))
                b = max(0, min(255, int(b * (1 - tint * 0.3))))
            r = (r // 16) * 16 + 8
            g = (g // 16) * 16 + 8
            b = (b // 16) * 16 + 8
            px[x, y] = (r, g, b, 255)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    image_uuid = resolve_uuid(out_path)
    bg.save(out_path)
    write_meta(out_path, image_uuid, 64, 64, map_key, 0.5)
    sf = f"{image_uuid}@{SF_SUFFIX}"
    umap[map_key] = {"texture": image_uuid, "spriteFrame": sf, "prefab": ""}
    print(f"  OK {map_key} 64x64 opaque")


def save_prop(cut: Image.Image, name: str, tw: int, th: int, umap: dict) -> None:
    out = fit_foot(cut, tw, th)
    path = PROPS / f"{name}.png"
    path.parent.mkdir(parents=True, exist_ok=True)
    image_uuid = resolve_uuid(path)
    out.save(path)
    write_meta(path, image_uuid, tw, th, name, 0.0)
    sf = f"{image_uuid}@{SF_SUFFIX}"
    umap[name] = {
        "texture": image_uuid,
        "spriteFrame": sf,
        "prefab": umap.get(name, {}).get("prefab", ""),
    }
    print(f"  OK {name} {tw}x{th} alpha={alpha_pct(out):.1f}%")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", default="", help="comma short names, e.g. desk,tea-table,bookshelf")
    ap.add_argument("--floor-only", action="store_true")
    ap.add_argument("--skip-portal", action="store_true", help="reuse rmbg-cutout/*.png if present")
    args = ap.parse_args()
    only = {x.strip() for x in args.only.split(",") if x.strip()}

    umap = json.loads(UUID_MAP.read_text(encoding="utf-8")) if UUID_MAP.exists() else {}
    CUTOUT_DIR.mkdir(parents=True, exist_ok=True)

    if not args.only or "floor" in only or "wood" in only or args.floor_only:
        if not FLOOR_SRC.exists():
            raise SystemExit(f"missing {FLOOR_SRC}")
        print(f"\n=== {FLOOR_KEY} <- {FLOOR_SRC.name} ===")
        make_wood_tile(FLOOR_SRC, TERRAIN / f"{FLOOR_KEY}.png", FLOOR_KEY, umap, 0.0)
        make_wood_tile(FLOOR_SRC, TERRAIN / f"{FLOOR_KEY_B}.png", FLOOR_KEY_B, umap, -0.08)

    if not args.only or "wall" in only or "wall-tile" in only or args.floor_only:
        if WALL_TILE_SRC.exists():
            print(f"\n=== {WALL_TILE_KEY} <- {WALL_TILE_SRC.name} ===")
            make_wood_tile(
                WALL_TILE_SRC, TERRAIN / f"{WALL_TILE_KEY}.png", WALL_TILE_KEY, umap, 0.0
            )
        else:
            print(f"WARN missing {WALL_TILE_SRC}")

    if args.floor_only:
        UUID_MAP.write_text(json.dumps(umap, indent=2) + "\n", encoding="utf-8")
        print("\ndone (floor only).")
        return

    portal = None
    if not args.skip_portal:
        try:
            portal = Portal()
            portal.login()
        except Exception as e:
            print(f"WARN portal unreachable ({e}); falling back to local gray-key cutout")
            portal = None

    for name, stem, tw, th, kind in SPECS:
        short = name.replace("prop-", "")
        if only and short not in only and name not in only:
            continue
        ref = AI / f"{stem}.png"
        if not ref.exists():
            print("SKIP missing", name)
            continue
        print(f"\n=== {name} <- {ref.name} ===")
        cut_path = CUTOUT_DIR / f"{name}-rmbg.png"
        if args.skip_portal and cut_path.exists():
            cut = Image.open(cut_path).convert("RGBA")
            print(f"  reuse cutout {cut_path.name}")
        elif portal is not None:
            cut = portal.cutout(ref)
            cut = quantize(cut)
            cut.save(cut_path)
            print(f"  cutout alpha={alpha_pct(cut):.1f}% -> {cut_path.name}")
        else:
            # Indoor props on mid-gray: local key is OK when portal is offline.
            cut = knock_gray_bg(Image.open(ref).convert("RGBA"))
            cut = flood_corners(cut)
            cut = quantize(cut)
            cut.save(cut_path)
            print(f"  local cutout alpha={alpha_pct(cut):.1f}% -> {cut_path.name}")
        if kind == "prop":
            save_prop(cut, name, tw, th, umap)

    UUID_MAP.write_text(json.dumps(umap, indent=2) + "\n", encoding="utf-8")
    print("\ndone. Bake: python tools/ui/bake_mayor_house_scene.py")


if __name__ == "__main__":
    main()
