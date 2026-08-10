#!/usr/bin/env python3
"""Cut out mine AI refs via CreativeCenter portal RMBG, then fit into assets.

    py -3.10 tools/ui/portal_rmbg_mine_props.py
    py -3.10 tools/ui/portal_rmbg_mine_props.py --only torch,minecart
"""

from __future__ import annotations

import argparse
import json
import shutil
import sys
import uuid
from pathlib import Path

from PIL import Image

# Reuse portal helpers from town buildings script
sys.path.insert(0, str(Path(__file__).resolve().parent))
from portal_rmbg_buildings import (  # noqa: E402
    AI,
    CUTOUT_DIR,
    SF_SUFFIX,
    UUID_MAP,
    Portal,
    alpha_pct,
    fit_foot,
    quantize,
    write_meta,
)


def local_gray_cutout(src: Path) -> Image.Image:
    """Fallback when portal RMBG times out — AI refs use flat ~#808080 bg."""
    img = Image.open(src).convert("RGBA")
    px = img.load()
    w, h = img.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            # near medium-gray, low chroma
            mx = max(r, g, b)
            mn = min(r, g, b)
            if abs(r - 128) < 38 and abs(g - 128) < 38 and abs(b - 128) < 38 and (mx - mn) < 22:
                px[x, y] = (0, 0, 0, 0)
            elif abs(r - g) < 12 and abs(g - b) < 12 and 90 < r < 170 and (mx - mn) < 18:
                px[x, y] = (0, 0, 0, 0)
    return img


def cutout_with_fallback(portal, src: Path, timeout_s: int = 120) -> Image.Image:
    if portal is None:
        print("  local gray cutout (no portal)")
        return local_gray_cutout(src)
    try:
        # temporarily bump wait via monkey patch of wait timeout
        name = portal.upload(src)
        pid = portal.queue_rmbg(name)
        hist = portal.wait(pid, timeout_s=timeout_s)
        images = []
        for nid, out in hist.get("outputs", {}).items():
            for img in out.get("images", []):
                images.append({**img, "node_id": str(nid)})
        if not images:
            raise RuntimeError("no output")
        meta = next((i for i in images if i.get("node_id") == "16"), images[0])
        from io import BytesIO

        return Image.open(BytesIO(portal.download_image(meta))).convert("RGBA")
    except Exception as e:
        print(f"  portal failed ({e}); local gray cutout")
        return local_gray_cutout(src)

ROOT = Path(__file__).resolve().parents[2]

# name -> (ref stems, tw, th, out_dir relative to assets/textures, pivot_y)
SPECS = [
    ("bld-mine-mouth", ["ai-bld-mine-mouth-ref"], 288, 224, "buildings", 0.0),
    ("prop-torch", ["ai-prop-torch-ref"], 48, 80, "props", 0.0),
    ("prop-minecart", ["ai-prop-minecart-ref"], 96, 64, "props", 0.0),
    ("prop-ladder", ["ai-prop-ladder-ref"], 64, 96, "props", 0.0),
    ("prop-timber", ["ai-prop-timber-ref"], 96, 112, "props", 0.0),
    ("prop-crate", ["ai-prop-crate-ref"], 56, 56, "props", 0.0),
    ("prop-barrel", ["ai-prop-barrel-ref"], 48, 56, "props", 0.0),
    ("prop-rails", ["ai-prop-rails-ref"], 96, 48, "props", 0.0),
    ("nat-ore-copper", ["ai-nat-ore-copper-ref"], 48, 40, "nature", 0.0),
    ("nat-ore-iron", ["ai-nat-ore-iron-ref"], 72, 56, "nature", 0.0),
    ("nat-ore-crystal", ["ai-nat-ore-crystal-ref"], 56, 64, "nature", 0.0),
    ("nat-mushroom", ["ai-nat-mushroom-ref"], 40, 40, "nature", 0.0),
    ("nat-rubble", ["ai-nat-rubble-ref"], 56, 40, "nature", 0.0),
    ("nat-stalagmite", ["ai-nat-stalagmite-ref"], 40, 64, "nature", 0.0),
    ("nat-wall-crystal", ["ai-nat-wall-crystal-ref"], 56, 64, "nature", 0.0),
    ("nat-wall-ore", ["ai-nat-wall-ore-ref"], 56, 56, "nature", 0.0),
    ("nat-cave-wall", ["ai-nat-cave-wall-ref"], 96, 128, "nature", 0.0),
    ("nat-cave-wall-b", ["ai-nat-cave-wall-b-ref"], 112, 96, "nature", 0.0),
]


def fit_tile(img: Image.Image, tw: int = 64, th: int = 64) -> Image.Image:
    """Center-crop / nearest-fit for cave floor tile (no foot alignment)."""
    bbox = img.getbbox()
    if not bbox:
        return Image.new("RGBA", (tw, th), (0, 0, 0, 0))
    cropped = img.crop(bbox)
    work = cropped.resize((tw, th), Image.NEAREST)
    work = quantize(work)
    # Force opaque tile (floor)
    px = work.load()
    for y in range(th):
        for x in range(tw):
            r, g, b, a = px[x, y]
            if a < 80:
                # fill holes with nearby dark stone
                px[x, y] = (56, 52, 72, 255)
            else:
                px[x, y] = (r, g, b, 255)
    return work


def write_meta_pivot(png_path: Path, image_uuid: str, w: int, h: int, name: str, pivot_y: float) -> None:
    write_meta(png_path, image_uuid, w, h, name)
    # Patch pivotY for tiles (0.5) vs foot props (0.0)
    meta_path = png_path.with_suffix(".png.meta")
    meta = json.loads(meta_path.read_text(encoding="utf-8"))
    sf = meta["subMetas"][SF_SUFFIX]["userData"]
    sf["pivotY"] = pivot_y
    sf["trimType"] = "custom"
    meta_path.write_text(json.dumps(meta, indent=2) + "\n", encoding="utf-8")


def find_ref(stems):
    for s in stems:
        p = AI / f"{s}.png"
        if p.exists():
            return p
    return None


def preserve_uuid(path: Path, umap: dict, name: str) -> str:
    meta_path = path.with_suffix(".png.meta")
    if meta_path.exists():
        try:
            return json.loads(meta_path.read_text(encoding="utf-8"))["uuid"]
        except Exception:
            pass
    if name in umap and isinstance(umap[name], dict) and umap[name].get("texture"):
        return umap[name]["texture"]
    return str(uuid.uuid4())


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", default="", help="comma short names, e.g. torch,minecart,cave")
    ap.add_argument("--skip-portal", action="store_true", help="reuse existing rmbg cutouts")
    ap.add_argument("--local", action="store_true", help="force local gray-bg cutout (skip portal)")
    args = ap.parse_args()
    only = {x.strip() for x in args.only.split(",") if x.strip()}

    CUTOUT_DIR.mkdir(parents=True, exist_ok=True)
    umap = json.loads(UUID_MAP.read_text(encoding="utf-8")) if UUID_MAP.exists() else {}

    portal = None
    if not args.skip_portal and not args.local:
        try:
            portal = Portal()
            portal.login()
        except Exception as e:
            print("portal login failed, using local cutouts:", e)
            portal = None
    elif args.local:
        print("using local gray cutouts (--local)")

    for name, stems, tw, th, folder, pivot_y in SPECS:
        short = name.split("-", 1)[-1] if "-" in name else name
        aliases = {name, short, name.replace("bld-", "").replace("prop-", "").replace("nat-", "")}
        if only and not (aliases & only):
            continue
        ref = find_ref(stems)
        if not ref:
            print("SKIP missing", name)
            continue
        print(f"\n=== {name} <- {ref.name} ===")
        cut_path = CUTOUT_DIR / f"{name}-rmbg.png"
        if args.skip_portal and cut_path.exists():
            cut = Image.open(cut_path).convert("RGBA")
        else:
            cut = cutout_with_fallback(portal, ref, timeout_s=90)
            cut.save(cut_path)
        print(f"  cutout alpha={alpha_pct(cut):.1f}%")

        out = fit_foot(cut, tw, th)
        out_dir = ROOT / "assets/textures" / folder
        out_dir.mkdir(parents=True, exist_ok=True)
        path = out_dir / f"{name}.png"
        image_uuid = preserve_uuid(path, umap, name)
        out.save(path)
        write_meta_pivot(path, image_uuid, tw, th, name, pivot_y)
        umap[name] = {
            "texture": image_uuid,
            "spriteFrame": f"{image_uuid}@{SF_SUFFIX}",
            "prefab": umap.get(name, {}).get("prefab", ""),
        }
        print(f"  OK {name} {tw}x{th} alpha={alpha_pct(out):.1f}%")

    # Cave tile — special center pivot, opaque
    if not only or "cave" in only or "tile-cave" in only:
        ref = find_ref(["ai-tile-cave-ref"])
        if ref:
            print(f"\n=== tile-cave <- {ref.name} ===")
            # Floor tile: crop center of AI texture (no alpha needed)
            src = Image.open(ref).convert("RGBA")
            out = fit_tile(src, 64, 64)
            path = ROOT / "assets/textures/terrain/tile-cave.png"
            image_uuid = preserve_uuid(path, umap, "tile-cave")
            out.save(path)
            write_meta_pivot(path, image_uuid, 64, 64, "tile-cave", 0.5)
            umap["tile-cave"] = {
                "texture": image_uuid,
                "spriteFrame": f"{image_uuid}@{SF_SUFFIX}",
                "prefab": "",
            }
            print(f"  OK tile-cave 64x64")

    UUID_MAP.write_text(json.dumps(umap, indent=2) + "\n", encoding="utf-8")
    print("\ndone. Re-bake: py -3.10 tools/ui/bake_mine_scene.py")


if __name__ == "__main__":
    main()
