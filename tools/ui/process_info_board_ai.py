#!/usr/bin/env python3
"""Process AI info-board refs into assets/textures/ui (keep .meta UUIDs)."""

from __future__ import annotations

import json
import uuid
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageOps

ROOT = Path(__file__).resolve().parents[2]
SRC = Path(__file__).resolve().parent / "ai-source"
OUT = ROOT / "assets/textures/ui"
UUID_MAP = Path(__file__).resolve().parent / "uuid-map.json"
CATALOG = Path(__file__).resolve().parent / "catalog.json"
FRAMES_JSON = Path(__file__).resolve().parent / "info-board-frames.json"
FRAMES_TS = ROOT / "assets/scripts/game/InfoBoardFrames.ts"
TEX_SUFFIX = "6c48a"
SF_SUFFIX = "f9941"
SCALE = 3

# Display sizes (1080 design). Sources: info-*-v3 / v2 ai-ref.png
# Gold keeps natural ~3.6:1 aspect so the G coin stays circular (no stretch).
TARGETS = {
    "ui-info-panel": (520, 216),
    "ui-info-gold": (320, 88),
    "ui-info-btn-minus": (72, 72),
    "ui-info-btn-plus": (72, 72),
    "ui-info-btn-quest": (72, 72),
    "ui-info-weather-sun": (64, 64),
    "ui-info-season-spring": (64, 64),
    "ui-info-needle": (36, 90),
}

REFS = {
    "panel": "info-panel-v3-ai-ref.png",
    "gold": "info-gold-v3-ai-ref.png",
    "btns": "info-btns-v2-ai-ref.png",
    "icons": "info-icons-v2-ai-ref.png",
    "needle": "info-needle-v2-ai-ref.png",
}

PREFAB_UUID = "220473b9-25ed-460c-b9ef-c7bb009504cf"


def key_out(name: str) -> str:
    return name.replace("ui-info-", "").replace("-", "_")


def bbox_opaque(im: Image.Image, alpha_min: int = 8):
    a = im.split()[-1]
    return a.point(lambda p: 255 if p >= alpha_min else 0).getbbox()


def trim(im: Image.Image, pad: int = 0) -> Image.Image:
    bb = bbox_opaque(im)
    if not bb:
        return im
    x0, y0, x1, y1 = bb
    x0 = max(0, x0 - pad)
    y0 = max(0, y0 - pad)
    x1 = min(im.width, x1 + pad)
    y1 = min(im.height, y1 + pad)
    return im.crop((x0, y0, x1, y1))


def knock_near_white(im: Image.Image, thr: int = 236) -> Image.Image:
    """Drop near-white / checker leftovers to alpha."""
    px = im.load()
    w, h = im.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a == 0:
                continue
            if r >= thr and g >= thr and b >= thr:
                px[x, y] = (0, 0, 0, 0)
            elif abs(r - g) < 8 and abs(g - b) < 8 and r > 210:
                # soft gray checker
                px[x, y] = (0, 0, 0, 0)
    return im


def knock_magenta(im: Image.Image, thr: int = 40) -> Image.Image:
    """Chroma-key solid magenta / hot-pink AI backgrounds."""
    im = im.convert("RGBA")
    px = im.load()
    w, h = im.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a == 0:
                continue
            # pure / near magenta key
            if r > 200 and b > 200 and g < 120:
                px[x, y] = (0, 0, 0, 0)
                continue
            # hot pink / fuchsia variants
            if r > 180 and b > 140 and g < 100 and (r - g) > thr and (b - g) > 20:
                px[x, y] = (0, 0, 0, 0)
    return im


def load_ref(name: str) -> Image.Image:
    path = SRC / REFS[name]
    if not path.exists():
        raise FileNotFoundError(path)
    im = Image.open(path).convert("RGBA")
    im = knock_magenta(im)
    im = flood_transparent(im, tol=36)
    im = knock_near_white(im, thr=242)
    return im


def flood_transparent(im: Image.Image, seeds=None, tol: int = 28) -> Image.Image:
    """Flood-fill from corners / seeds, making similar bg transparent."""
    im = im.convert("RGBA")
    w, h = im.size
    px = im.load()
    if seeds is None:
        seeds = [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1), (w // 2, 0), (w // 2, h - 1)]
    seen = set()
    stack = []
    for s in seeds:
        if 0 <= s[0] < w and 0 <= s[1] < h:
            stack.append(s)
    while stack:
        x, y = stack.pop()
        if (x, y) in seen:
            continue
        seen.add((x, y))
        r, g, b, a = px[x, y]
        if a == 0:
            continue
        # Drop pale / paper / soft gray backgrounds
        bright = (r + g + b) / 3
        chroma = max(r, g, b) - min(r, g, b)
        if bright < 200 and chroma > 40:
            continue
        if bright < 170:
            continue
        px[x, y] = (r, g, b, 0)
        for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
            if 0 <= nx < w and 0 <= ny < h and (nx, ny) not in seen:
                nr, ng, nb, na = px[nx, ny]
                if na and abs(nr - r) <= tol and abs(ng - g) <= tol and abs(nb - b) <= tol:
                    stack.append((nx, ny))
    return im


def quantize_nearest(
    im: Image.Image, tw: int, th: int, colors: int = 48, mode: str = "contain"
) -> Image.Image:
    """mode=contain letterboxes; cover crops; stretch fills exact size."""
    im = trim(im)
    src = im
    sw, sh = src.size
    if mode == "stretch":
        nw, nh = tw, th
    elif mode == "cover":
        scale = max(tw / sw, th / sh)
        nw = max(1, int(round(sw * scale)))
        nh = max(1, int(round(sh * scale)))
    else:
        scale = min(tw / sw, th / sh)
        nw = max(1, int(round(sw * scale)))
        nh = max(1, int(round(sh * scale)))
    mid_w = max(nw, min(sw, nw * 2))
    mid_h = max(nh, min(sh, nh * 2))
    mid = src.resize((mid_w, mid_h), Image.Resampling.BOX)
    small = mid.resize((nw, nh), Image.Resampling.NEAREST)
    q = small.convert("RGBA")
    flat = Image.new("RGBA", q.size, (0, 0, 0, 0))
    flat.paste(q, (0, 0), q)
    rgb = Image.new("RGB", flat.size, (255, 0, 255))
    rgb.paste(flat, mask=flat.split()[-1])
    pal = rgb.quantize(colors=colors, method=Image.Quantize.MEDIANCUT).convert("RGBA")
    out_small = Image.new("RGBA", flat.size, (0, 0, 0, 0))
    sp, fp, op = pal.load(), flat.load(), out_small.load()
    for y in range(flat.height):
        for x in range(flat.width):
            if fp[x, y][3] < 20:
                continue
            r, g, b, _ = sp[x, y]
            if r > 240 and g < 20 and b > 240:
                continue
            op[x, y] = (r, g, b, 255)
    if mode == "stretch":
        return out_small
    canvas = Image.new("RGBA", (tw, th), (0, 0, 0, 0))
    ox = (tw - out_small.width) // 2
    oy = (th - out_small.height) // 2
    canvas.paste(out_small, (ox, oy), out_small)
    return canvas


def extract_components_horizontal(im: Image.Image, expect: int) -> list[Image.Image]:
    """Split a sheet of horizontally spaced opaque blobs."""
    im = knock_magenta(im)
    im = flood_transparent(im)
    im = knock_near_white(im)
    a = im.split()[-1]
    mask = a.point(lambda p: 255 if p > 12 else 0)
    # find columns with content
    w, h = im.size
    cols = [any(mask.getpixel((x, y)) for y in range(h)) for x in range(w)]
    ranges = []
    in_run = False
    start = 0
    for x, on in enumerate(cols):
        if on and not in_run:
            in_run = True
            start = x
        elif not on and in_run:
            in_run = False
            ranges.append((start, x))
    if in_run:
        ranges.append((start, w))
    # merge tiny gaps
    merged = []
    for r in ranges:
        if not merged:
            merged.append(list(r))
            continue
        if r[0] - merged[-1][1] < max(8, w // 80):
            merged[-1][1] = r[1]
        else:
            merged.append(list(r))
    # if too many tiny pieces, keep largest N by width
    merged.sort(key=lambda t: t[1] - t[0], reverse=True)
    merged = sorted(merged[:expect], key=lambda t: t[0])
    out = []
    for x0, x1 in merged:
        crop = im.crop((x0, 0, x1, h))
        out.append(trim(crop, pad=2))
    return out


def process_panel() -> Image.Image:
    im = load_ref("panel")
    im = trim(im, pad=2)
    return quantize_nearest(im, *TARGETS["ui-info-panel"], colors=64)


def process_gold() -> Image.Image:
    im = load_ref("gold")
    im = trim(im, pad=2)
    # wipe any accidental dark digits in the inset (keep wood + G)
    px = im.load()
    w, h = im.size
    for y in range(h):
        for x in range(int(w * 0.28), w):
            r, g, b, a = px[x, y]
            if a < 10:
                continue
            if r < 90 and g < 70 and b < 110 and (r + g + b) < 220:
                px[x, y] = (236, 214, 170, 255)
            elif r < 120 and b > r + 20 and g < 100:
                px[x, y] = (236, 214, 170, 255)
    # Contain into natural-aspect slot — never stretch (keeps G coin round).
    out = quantize_nearest(im, *TARGETS["ui-info-gold"], colors=48, mode="contain")
    return seal_wood_rim(out)


def seal_wood_rim(im: Image.Image, rim: int = 3) -> Image.Image:
    """Kill pale halo + force wood on outer rim so cream never meets transparent."""
    im = im.convert("RGBA")
    px = im.load()
    w, h = im.size
    wood = (118, 62, 28, 255)
    wood_dk = (54, 28, 12, 255)
    wood_hi = (168, 96, 42, 255)

    def cream(r, g, b, a):
        return a > 20 and r > 200 and g > 170 and b > 120 and (r + g) > b + 80

    def pale(r, g, b, a):
        if a < 8:
            return False
        bright = (r + g + b) / 3
        chroma = max(r, g, b) - min(r, g, b)
        if bright > 200 and chroma < 40:
            return True
        if r > 210 and g > 200 and b > 190 and chroma < 50:
            return True
        if r > 220 and b > 180 and g > 160 and bright > 190:
            return True
        return False

    def near_empty(x, y):
        for nx, ny in (
            (x - 1, y),
            (x + 1, y),
            (x, y - 1),
            (x, y + 1),
            (x - 1, y - 1),
            (x + 1, y - 1),
            (x - 1, y + 1),
            (x + 1, y + 1),
        ):
            if not (0 <= nx < w and 0 <= ny < h) or px[nx, ny][3] < 8:
                return True
        return False

    # Drop pale / magenta fringe on silhouette
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a < 8:
                continue
            if r > 190 and b > 150 and g < 120:
                px[x, y] = (0, 0, 0, 0)
                continue
            if (near_empty(x, y) or x < 2 or y < 2 or x >= w - 2 or y >= h - 2) and pale(r, g, b, a):
                px[x, y] = (0, 0, 0, 0)

    xs, ys = [], []
    for y in range(h):
        for x in range(w):
            if px[x, y][3] > 20:
                xs.append(x)
                ys.append(y)
    if not xs:
        return im
    x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)

    # Cream must not sit on the outer rim — paint wood frame
    for y in range(y0, min(y0 + rim, y1 + 1)):
        for x in range(x0, x1 + 1):
            r, g, b, a = px[x, y]
            if a > 20 and (cream(r, g, b, a) or (r > 210 and g > 200 and b > 180)):
                px[x, y] = wood_hi if y == y0 else wood
    for y in range(max(y0, y1 - rim + 1), y1 + 1):
        for x in range(x0, x1 + 1):
            r, g, b, a = px[x, y]
            if a > 20 and (cream(r, g, b, a) or (r > 210 and g > 200 and b > 180)):
                px[x, y] = wood_dk if y == y1 else wood
    for x in range(max(x0, x1 - 1), x1 + 1):
        for y in range(y0, y1 + 1):
            r, g, b, a = px[x, y]
            if a > 20 and cream(r, g, b, a):
                px[x, y] = wood_dk

    # Any remaining bright edge halo → dark wood outline (keep gold coin yellow)
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a < 8 or not near_empty(x, y):
                continue
            bright = (r + g + b) / 3
            if r > 200 and g > 140 and b < 100:
                continue  # coin metal
            # cream leaking to silhouette → wood; pale halo → dark outline
            if cream(r, g, b, a) or bright > 140:
                px[x, y] = wood_dk
    return im


def process_btns() -> dict[str, Image.Image]:
    im = load_ref("btns")
    parts = extract_components_horizontal(im, 3)
    if len(parts) < 3:
        raise RuntimeError("expected 3 buttons in {}, got {}".format(REFS["btns"], len(parts)))
    names = ["ui-info-btn-minus", "ui-info-btn-plus", "ui-info-btn-quest"]
    out = {}
    for name, part in zip(names, parts):
        out[name] = quantize_nearest(part, *TARGETS[name], colors=36)
    return out


def process_icons() -> dict[str, Image.Image]:
    im = load_ref("icons")
    parts = extract_components_horizontal(im, 2)
    if len(parts) < 2:
        raise RuntimeError("expected 2 icons in {}, got {}".format(REFS["icons"], len(parts)))
    weather = quantize_nearest(parts[0], *TARGETS["ui-info-weather-sun"], colors=32)
    season = quantize_nearest(parts[1], *TARGETS["ui-info-season-spring"], colors=32)

    needle_src = load_ref("needle")
    needle_src = trim(needle_src, pad=1)
    needle = quantize_nearest(needle_src, *TARGETS["ui-info-needle"], colors=20)
    return {
        "ui-info-weather-sun": weather,
        "ui-info-season-spring": season,
        "ui-info-needle": needle,
    }


def write_meta(png: Path, image_uuid: str, w: int, h: int, name: str) -> str:
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


def upsert_catalog(items):
    data = json.loads(CATALOG.read_text(encoding="utf-8"))
    by_id = {it["id"]: i for i, it in enumerate(data["items"])}
    for it in items:
        if it["id"] in by_id:
            data["items"][by_id[it["id"]]] = it
        else:
            data["items"].append(it)
    CATALOG.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    umap = json.loads(UUID_MAP.read_text(encoding="utf-8")) if UUID_MAP.exists() else {}

    assets: dict[str, Image.Image] = {}
    assets["ui-info-panel"] = process_panel()
    assets["ui-info-gold"] = process_gold()
    assets.update(process_btns())
    assets.update(process_icons())

    frames = {}
    catalog_items = []
    for name, img in assets.items():
        tw, th = TARGETS[name]
        if img.size != (tw, th):
            # safety pad
            canvas = Image.new("RGBA", (tw, th), (0, 0, 0, 0))
            ox = (tw - img.width) // 2
            oy = (th - img.height) // 2
            canvas.paste(img, (ox, oy), img)
            img = canvas
        png = OUT / f"{name}.png"
        img.save(png)
        image_uuid = write_meta(
            png,
            umap.get(name, {}).get("texture") or str(uuid.uuid4()),
            tw,
            th,
            name,
        )
        sf = f"{image_uuid}@{SF_SUFFIX}"
        umap[name] = {"texture": image_uuid, "prefab": "", "spriteFrame": sf}
        frames[key_out(name)] = sf
        catalog_items.append(
            {
                "id": name,
                "kind": "icon",
                "spriteType": "simple",
                "designSize": [tw, th],
                "path": f"assets/textures/ui/{name}.png",
                "prefab": "",
                "layer": "UI",
            }
        )
        print("OK", png.relative_to(ROOT), f"{tw}x{th}")

    UUID_MAP.write_text(json.dumps(umap, indent=2) + "\n", encoding="utf-8")
    FRAMES_JSON.write_text(json.dumps(frames, indent=2) + "\n", encoding="utf-8")
    prefab_uuid = (
        umap.get("FarmInfoBoard", {}).get("prefab")
        or PREFAB_UUID
    )
    FRAMES_TS.write_text(
        "/** Auto-synced from tools/ui/info-board-frames.json */\n"
        "export const INFO_BOARD_FRAMES = {}\n\n"
        "/** Prefab asset uuid — layout source of truth. */\n"
        "export const INFO_BOARD_PREFAB_UUID = '{}';\n".format(
            json.dumps(frames, indent=4), prefab_uuid
        ),
        encoding="utf-8",
    )
    upsert_catalog(catalog_items)
    # preview strip
    prev = Image.new("RGBA", (320, 220), (40, 70, 50, 255))
    y = 8
    for name in (
        "ui-info-panel",
        "ui-info-gold",
        "ui-info-btn-minus",
        "ui-info-btn-plus",
        "ui-info-btn-quest",
        "ui-info-weather-sun",
        "ui-info-season-spring",
        "ui-info-needle",
    ):
        im = assets[name]
        prev.paste(im, (8, y), im)
        y += im.height + 6
    prev_path = SRC / "info-board-ai-processed-preview.png"
    prev.save(prev_path)
    print("preview", prev_path.relative_to(ROOT))


if __name__ == "__main__":
    main()
