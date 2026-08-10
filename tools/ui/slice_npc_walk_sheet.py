#!/usr/bin/env python3
"""Slice AI NPC walk sheets -> crisp 48x64 frames (nearest), foot-aligned.

Usage:
  /usr/local/bin/python3 tools/ui/slice_npc_walk_sheet.py mayor
  /usr/local/bin/python3 tools/ui/slice_npc_walk_sheet.py carpenter --swap-lr
  /usr/local/bin/python3 tools/ui/slice_npc_walk_sheet.py passerby
  /usr/local/bin/python3 tools/ui/slice_npc_walk_sheet.py girl
  # girl sheet is already down/left/right/up — do not pass --swap-lr
"""

from __future__ import print_function

import argparse
import json
import uuid
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
AI = Path(__file__).resolve().parent / "ai-source"
CHARS = ROOT / "assets/textures/chars"
UUID_MAP = Path(__file__).resolve().parent / "uuid-map.json"
FRAMES_JSON = Path(__file__).resolve().parent / "npc-frames.json"
FRAMES_TS = ROOT / "assets/scripts/game/NpcFrames.ts"

DIRS = ("down", "left", "right", "up")
DW, DH = 48, 64
TEX_SUFFIX = "6c48a"
SF_SUFFIX = "f9941"


def is_flat_gray(c, lo=70, hi=165):
    r, g, b, a = c[:4] if len(c) > 3 else (c[0], c[1], c[2], 255)
    if a < 10:
        return True
    # Flat studio gray / light gray / near-white backdrop (flood-fill from edges).
    # Keep hi up to 255 so pale AI sheets clear; flood-from-edge avoids eating blouse.
    return abs(r - g) < 22 and abs(g - b) < 22 and lo <= r <= hi


def cluster(idxs, min_gap=6):
    if not idxs:
        return []
    groups = [[idxs[0]]]
    for i in idxs[1:]:
        if i - groups[-1][-1] <= 2:
            groups[-1].append(i)
        else:
            groups.append([i])
    centers = []
    for g in groups:
        if len(g) >= min_gap:
            centers.append(sum(g) // len(g))
    return centers


def flood_clear_bg(im, tol=28):
    """Clear connected studio backdrop from image edges (keeps gray hair)."""
    im = im.copy()
    w, h = im.size
    px = im.load()
    seeds = [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1), (w // 2, 0), (0, h // 2)]
    seen = set()
    stack = []
    for sx, sy in seeds:
        if 0 <= sx < w and 0 <= sy < h and is_flat_gray(px[sx, sy], lo=55, hi=255):
            stack.append((sx, sy))
    while stack:
        x, y = stack.pop()
        if (x, y) in seen or x < 0 or y < 0 or x >= w or y >= h:
            continue
        r, g, b, a = px[x, y]
        if a < 10 or not is_flat_gray((r, g, b, a), lo=55, hi=255):
            # Soft edge: near-seed gray / pale within tol of seed tone
            if a >= 10 and abs(r - g) < 28 and abs(g - b) < 28 and 55 <= r <= 255:
                pass
            else:
                continue
        seen.add((x, y))
        px[x, y] = (0, 0, 0, 0)
        stack.extend(((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)))
    # Second pass: kill leftover mid-gray fringe only (not pale blouse whites)
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a < 10:
                continue
            if not (abs(r - g) < 18 and abs(g - b) < 18 and 75 <= r <= 175):
                continue
            # Only clear if majority of 4-neighbors are empty or same gray
            empty = 0
            for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                if nx < 0 or ny < 0 or nx >= w or ny >= h:
                    empty += 1
                    continue
                rr, gg, bb, aa = px[nx, ny]
                if aa < 10 or (abs(rr - gg) < 18 and abs(gg - bb) < 18 and 75 <= rr <= 175):
                    empty += 1
            if empty >= 3:
                px[x, y] = (0, 0, 0, 0)
    return im


def quantize_cell(cell):
    cell = flood_clear_bg(cell)
    cp = cell.load()
    cw, ch = cell.size
    for y in range(ch):
        for x in range(cw):
            r, g, b, a = cp[x, y]
            if a < 128:
                cp[x, y] = (0, 0, 0, 0)
            else:
                r = (r // 16) * 16 + 8
                g = (g // 16) * 16 + 8
                b = (b // 16) * 16 + 8
                cp[x, y] = (r, g, b, 255)
    return cell


def to_frame(cell):
    cell = quantize_cell(cell)
    bb = cell.getbbox()
    if not bb:
        return Image.new("RGBA", (DW, DH), (0, 0, 0, 0))
    char = cell.crop(bb)
    cw, ch = char.size
    mid_h = 32
    mid_w = max(12, int(round(cw * (mid_h / float(ch)))))
    mid = char.resize((mid_w, mid_h), Image.BOX)
    mp = mid.load()
    for y in range(mid_h):
        for x in range(mid_w):
            r, g, b, a = mp[x, y]
            if a < 128:
                mp[x, y] = (0, 0, 0, 0)
            else:
                r = (r // 16) * 16 + 8
                g = (g // 16) * 16 + 8
                b = (b // 16) * 16 + 8
                mp[x, y] = (r, g, b, 255)
    big = mid.resize((mid_w * 2, mid_h * 2), Image.NEAREST)
    bw, bh = big.size
    if bh != DH:
        big = big.resize((max(8, int(round(bw * DH / float(bh)))), DH), Image.NEAREST)
        bw, bh = big.size
    if bw > DW:
        big = big.resize((DW, DH), Image.NEAREST)
        bw, bh = big.size
    out = Image.new("RGBA", (DW, DH), (0, 0, 0, 0))
    out.paste(big, ((DW - bw) // 2, DH - bh), big)
    return out


def write_meta(path, image_uuid, display):
    meta_path = Path(str(path) + ".meta")
    if meta_path.exists():
        try:
            old = json.loads(meta_path.read_text(encoding="utf-8"))
            image_uuid = old.get("uuid") or image_uuid
        except Exception:
            pass
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
                    "width": DW,
                    "height": DH,
                    "rawWidth": DW,
                    "rawHeight": DH,
                    "borderTop": 0,
                    "borderBottom": 0,
                    "borderLeft": 0,
                    "borderRight": 0,
                    "packable": True,
                    "pixelsToUnit": 100,
                    "pivotX": 0.5,
                    "pivotY": 0.0,
                    "meshType": 0,
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


def slice_sheet(name, src, swap_lr=False):
    im = Image.open(src).convert("RGBA")
    px = im.load()
    w, h = im.size
    col = [0] * w
    row = [0] * h
    for y in range(h):
        for x in range(w):
            if not is_flat_gray(px[x, y], lo=60, hi=175):
                col[x] += 1
                row[y] += 1
    xs = [i for i, v in enumerate(col) if v > 0]
    ys = [i for i, v in enumerate(row) if v > 0]
    x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)
    thr = max(col) * 0.05
    gaps_x = [i for i in range(x0, x1) if col[i] < thr]
    gaps_y = [i for i in range(y0, y1) if row[i] < thr]
    sx, sy = cluster(gaps_x), cluster(gaps_y)
    if len(sx) >= 3 and len(sy) >= 3:
        xspl = [x0] + sx[:3] + [x1 + 1]
        yspl = [y0] + sy[:3] + [y1 + 1]
    else:
        cw = (x1 - x0 + 1) / 4.0
        ch = (y1 - y0 + 1) / 4.0
        xspl = [int(round(x0 + i * cw)) for i in range(5)]
        yspl = [int(round(y0 + i * ch)) for i in range(5)]
        xspl[-1], yspl[-1] = x1 + 1, y1 + 1

    out_dir = CHARS / name
    out_dir.mkdir(parents=True, exist_ok=True)
    umap = {}
    if UUID_MAP.exists():
        umap = json.loads(UUID_MAP.read_text(encoding="utf-8"))

    dir_order = list(DIRS)
    if swap_lr:
        dir_order = ["down", "right", "left", "up"]

    frames = []
    catalog = {d: [] for d in DIRS}
    for yi, d in enumerate(dir_order):
        for xi in range(4):
            cell = im.crop((xspl[xi], yspl[yi], xspl[xi + 1], yspl[yi + 1]))
            fr = to_frame(cell)
            fname = "%s-%s-%d.png" % (name, d, xi)
            path = out_dir / fname
            fr.save(path)
            key = "%s-%s-%d" % (name, d, xi)
            image_uuid = umap.get(key, {}).get("texture") or str(uuid.uuid4())
            image_uuid = write_meta(path, image_uuid, key)
            sf = "{}@{}".format(image_uuid, SF_SUFFIX)
            umap[key] = {"texture": image_uuid, "prefab": "", "spriteFrame": sf}
            catalog[d].append(sf)
            frames.append(fr)
            print("wrote", path.relative_to(ROOT), fr.getbbox())

    sheet = Image.new("RGBA", (DW * 4, DH * 4), (40, 40, 44, 255))
    # Rebuild preview in canonical dir order (down/left/right/up)
    preview_frames = []
    for d in DIRS:
        for xi in range(4):
            preview_frames.append(Image.open(out_dir / ("%s-%s-%d.png" % (name, d, xi))))
    i = 0
    for yi in range(4):
        for xi in range(4):
            sheet.paste(preview_frames[i], (xi * DW, yi * DH), preview_frames[i])
            i += 1
    preview = AI / ("%s-walk-sheet.png" % name)
    sheet.save(preview)
    print("preview", preview)

    UUID_MAP.write_text(json.dumps(umap, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    all_frames = {}
    if FRAMES_JSON.exists():
        all_frames = json.loads(FRAMES_JSON.read_text(encoding="utf-8"))
    all_frames[name] = catalog
    all_frames["cellSize"] = [DW, DH]
    FRAMES_JSON.write_text(
        json.dumps(all_frames, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    print("updated", FRAMES_JSON.name)

    # Sync NpcFrames.ts for runtime UUID catalogs
    lines = [
        "/** Auto-synced from tools/ui/npc-frames.json */",
        "export const NPC_FRAMES = {",
    ]
    npc_keys = [k for k in ("mayor", "carpenter", "passerby", "girl") if k in all_frames]
    # Also include any extra NPC catalogs already in the JSON.
    for k in sorted(all_frames.keys()):
        if k in ("cellSize",) or k in npc_keys:
            continue
        if isinstance(all_frames.get(k), dict) and all(d in all_frames[k] for d in DIRS):
            npc_keys.append(k)
    for key in npc_keys:
        cat = all_frames[key]
        lines.append("  %s: {" % key)
        for d in DIRS:
            arr = ", ".join("'%s'" % u for u in cat[d])
            lines.append("    %s: [%s]," % (d, arr))
        lines.append("  },")
    lines.append("  cellSize: [%d, %d] as [number, number]," % (DW, DH))
    lines.append("} as const;")
    lines.append("")
    FRAMES_TS.write_text("\n".join(lines), encoding="utf-8")
    print("updated", FRAMES_TS.relative_to(ROOT))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("name", help="npc slug: mayor / carpenter / passerby / girl")
    ap.add_argument(
        "--src",
        default="",
        help="optional AI ref path (default: tools/ui/ai-source/<name>-walk-ai-ref.png)",
    )
    ap.add_argument(
        "--swap-lr",
        action="store_true",
        help="sheet rows are down/right/left/up instead of down/left/right/up",
    )
    args = ap.parse_args()
    src = Path(args.src) if args.src else AI / ("%s-walk-ai-ref.png" % args.name)
    if not src.exists():
        raise SystemExit("missing source sheet: %s" % src)
    # Keep archived copy under ai-source if sourced elsewhere
    archived = AI / ("%s-walk-ai-ref.png" % args.name)
    if src.resolve() != archived.resolve():
        Image.open(src).convert("RGBA").save(archived)
    slice_sheet(args.name, archived if archived.exists() else src, swap_lr=args.swap_lr)


if __name__ == "__main__":
    main()
