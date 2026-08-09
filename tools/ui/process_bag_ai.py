#!/usr/bin/env python3
"""Process AI bag-button / backpack refs → UI textures (keep .meta UUIDs).

Sources:
  tools/ui/ai-source/bag-btn-ai-ref.png      → assets/textures/ui/ui-bag-btn.png
  tools/ui/ai-source/ic-backpack-ai-ref.png  → assets/textures/ui/ic-backpack.png

HUD uses ui-bag-btn as one complete badge (wood plate + pack baked together).
ic-backpack stays available for fly-FX / other icons.
"""

import json
import random
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
TEX_SUFFIX = "6c48a"
SF_SUFFIX = "f9941"

JOBS = (
    {
        "src": "bag-btn-ai-ref.png",
        "out": "ui-bag-btn.png",
        "map_key": "ui-bag-btn",
        "tf_key": "bagBtn",
        "size": 96,
        "colors": 40,
        "logical": 48,
    },
    {
        "src": "ic-backpack-ai-ref.png",
        "out": "ic-backpack.png",
        "map_key": "ic-backpack",
        "tf_key": "backpack",
        "size": 96,
        "colors": 32,
        "logical": 48,
    },
)

OUTLINE = (28, 20, 14, 255)


def knock_gray_bg(im: Image.Image) -> Image.Image:
    """Drop flat mid-gray / near-white / soft foliage fringe to alpha."""
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
            # Mid-gray canvas (#808080-ish)
            if chroma < 22 and 90 <= bright <= 175:
                px[x, y] = (0, 0, 0, 0)
                continue
            # Near-white / soft paper
            if bright >= 232 and chroma < 28:
                px[x, y] = (0, 0, 0, 0)
                continue
            # Green foliage fringe that sometimes leaks into AI badge corners
            if g > r + 18 and g > b + 12 and bright < 160 and chroma > 25:
                # Only kill if near edges (keep any intentional green on pack — none)
                edge = x < w * 0.08 or x > w * 0.92 or y < h * 0.08 or y > h * 0.92
                if edge:
                    px[x, y] = (0, 0, 0, 0)
    return im


def flood_corners(im: Image.Image, tol: int = 26) -> Image.Image:
    im = im.convert("RGBA")
    w, h = im.size
    px = im.load()
    seeds = [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1), (w // 2, 0), (w // 2, h - 1)]
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
        # Only eat gray / pale bg — not warm wood / leather
        if chroma > 35 and bright < 200:
            continue
        if bright < 85:
            continue
        if chroma > 18 and not (chroma < 35 and 90 <= bright <= 190):
            # Allow knocking soft pale wood-spill only if very bright
            if bright < 210:
                continue
        px[x, y] = (0, 0, 0, 0)
        for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
            if 0 <= nx < w and 0 <= ny < h and (nx, ny) not in seen:
                nr, ng, nb, na = px[nx, ny]
                if na and abs(nr - r) <= tol and abs(ng - g) <= tol and abs(nb - b) <= tol:
                    stack.append((nx, ny))
    return im


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
    # Fit into logical square with BOX → NEAREST path for crisp pixels
    sw, sh = im.size
    scale = min(logical / sw, logical / sh)
    nw = max(1, int(round(sw * scale)))
    nh = max(1, int(round(sh * scale)))
    mid = im.resize((max(nw, nw * 2), max(nh, nh * 2)), RESAMPLE_BOX)
    small = mid.resize((nw, nh), RESAMPLE_NEAREST)

    # Quantize RGB, keep alpha (black key — avoid magenta fringe)
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
            # Kill chroma-key / pink fringe leftovers
            if r > 160 and b > 160 and g < 140:
                continue
            if r > 200 and b > 180 and g < 160:
                continue
            # Soft alpha cleanup on residual gray
            if abs(r - g) < 14 and abs(g - b) < 14 and 95 <= (r + g + b) / 3 <= 170:
                continue
            # Pure black from key only when source alpha was soft
            if r + g + b < 18 and fp[x, y][3] < 200:
                continue
            op[x, y] = (r, g, b, 255)

    # Reinforce clean dark outline on transparent neighbors (no pink glow).
    opaque = [(x, y) for y in range(out_small.height) for x in range(out_small.width) if op[x, y][3] > 0]
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


def upsert_catalog(entry_id: str, path: str, sf: str, size: int) -> None:
    if not CATALOG.exists():
        return
    cat = json.loads(CATALOG.read_text(encoding="utf-8"))
    key = "entries" if "entries" in cat else ("items" if "items" in cat else None)
    if key is None:
        return
    entry = {
        "id": entry_id,
        "kind": "chrome" if entry_id.startswith("ui-") else "icon",
        "spriteType": "simple",
        "designSize": [size, size],
        "path": path,
        "prefab": "",
        "layer": "UI",
        "spriteFrame": sf,
    }
    for i, e in enumerate(cat[key]):
        if e.get("id") == entry_id:
            cat[key][i] = {**e, **entry}
            CATALOG.write_text(json.dumps(cat, indent=2) + "\n", encoding="utf-8")
            return
    cat[key].append(entry)
    CATALOG.write_text(json.dumps(cat, indent=2) + "\n", encoding="utf-8")


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    umap: dict = {}
    if UUID_MAP.exists():
        umap = json.loads(UUID_MAP.read_text(encoding="utf-8"))
    tools = {}
    if TF.exists():
        tools = json.loads(TF.read_text(encoding="utf-8"))

    for job in JOBS:
        src = SRC / job["src"]
        if not src.exists():
            raise SystemExit("missing AI source: {}".format(src))
        im = Image.open(src).convert("RGBA")
        im = knock_gray_bg(im)
        im = flood_corners(im)
        out_img = pixelize(im, job["logical"], job["size"], job["colors"])
        out_path = OUT / job["out"]
        out_img.save(out_path)

        image_uuid = write_meta(
            out_path,
            umap.get(job["map_key"], {}).get("texture") or str(uuid.uuid4()),
            job["size"],
            job["size"],
            job["out"].replace(".png", ""),
        )
        sf = "{}@{}".format(image_uuid, SF_SUFFIX)
        umap[job["map_key"]] = {"texture": image_uuid, "prefab": "", "spriteFrame": sf}
        tools[job["tf_key"]] = sf
        upsert_catalog(job["map_key"], "assets/textures/ui/{}".format(job["out"]), sf, job["size"])
        print("OK", out_path.relative_to(ROOT), sf)

    UUID_MAP.write_text(json.dumps(umap, indent=2) + "\n", encoding="utf-8")
    TF.write_text(json.dumps(tools, indent=2) + "\n", encoding="utf-8")
    (ROOT / "assets/scripts/game/ToolFrames.ts").write_text(
        "/** Auto-synced from tools/ui/tool-frames.json */\n"
        "export const TOOL_FRAMES = {}\n".format(json.dumps(tools, indent=4)),
        encoding="utf-8",
    )

    # Side-by-side preview on foliage + dock
    btn = Image.open(OUT / "ui-bag-btn.png").convert("RGBA")
    ic = Image.open(OUT / "ic-backpack.png").convert("RGBA")
    prev = Image.new("RGBA", (320, 180), (0, 0, 0, 0))
    rnd = random.Random(5)
    for y in range(120):
        for x in range(320):
            g = 70 + (x * 3 + y * 5) % 40 + rnd.randint(0, 18)
            prev.putpixel((x, y), (40 + g // 3, 90 + g // 2, 45 + g // 4, 255))
    for y in range(120, 180):
        for x in range(320):
            prev.putpixel((x, y), (28, 22, 16, 230))
    b = btn.resize((96, 96), RESAMPLE_NEAREST)
    i = ic.resize((72, 72), RESAMPLE_NEAREST)
    prev.paste(b, (40, 36), b)
    prev.paste(i, (200, 48), i)
    prev_path = SRC / "bag-ai-processed-preview.png"
    prev.save(prev_path)
    print("preview", prev_path.relative_to(ROOT))


if __name__ == "__main__":
    main()
