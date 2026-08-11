#!/usr/bin/env python3
"""AI-only red (miss) fishing catch bar → assets/textures/ui/ui-fishing-bar-miss.png

Sources (first hit wins):
  tools/ui/ai-source/fishing-bar-red-ai-ref.png
  tools/ui/ai-source/fishing-bar-miss-ai-ref.png

Same pipeline as ingest_fishing_bar_ai.py, but keeps red paddle body.
Also syncs fishing-frames.json + FishingFrames.ts + catalog + uuid-map.

  /usr/local/bin/python3 tools/ui/ingest_fishing_bar_miss_ai.py
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

ROOT = Path(__file__).resolve().parents[2]
SRC = Path(__file__).resolve().parent / "ai-source"
OUT = ROOT / "assets/textures/ui" / "ui-fishing-bar-miss.png"
FF = Path(__file__).resolve().parent / "fishing-frames.json"
OUT_TS = ROOT / "assets/scripts/game/FishingFrames.ts"
CATALOG = Path(__file__).resolve().parent / "catalog.json"
UUID_MAP = Path(__file__).resolve().parent / "uuid-map.json"
W, H = 48, 104
OUTLINE = (72, 14, 12, 255)
TEX_SUFFIX = "6c48a"
SF_SUFFIX = "f9941"

CANDIDATES = (
    "fishing-bar-red-ai-ref.png",
    "fishing-bar-miss-ai-ref.png",
)


def knock_bg(im: Image.Image) -> Image.Image:
    im = im.convert("RGBA")
    px = im.load()
    w, h = im.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a == 0:
                continue
            chroma = max(r, g, b) - min(r, g, b)
            bright = (r + g + b) / 3.0
            if chroma < 28 and 75 <= bright <= 195:
                px[x, y] = (0, 0, 0, 0)
            elif bright >= 230 and chroma < 35:
                px[x, y] = (0, 0, 0, 0)
    return im


def flood_corners(im: Image.Image, tol: int = 30) -> Image.Image:
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
        bright = (r + g + b) / 3.0
        chroma = max(r, g, b) - min(r, g, b)
        # Keep red paddle body.
        if r > g + 12 and r > b + 8 and bright > 50:
            continue
        if chroma > 38 and bright < 205:
            continue
        if bright < 50:
            continue
        px[x, y] = (0, 0, 0, 0)
        for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
            if 0 <= nx < w and 0 <= ny < h and (nx, ny) not in seen:
                nr, ng, nb, na = px[nx, ny]
                if na and abs(nr - r) <= tol and abs(ng - g) <= tol and abs(nb - b) <= tol:
                    stack.append((nx, ny))
    return im


def crop_opaque(im: Image.Image) -> Image.Image:
    px = im.load()
    w, h = im.size
    xs = [x for y in range(h) for x in range(w) if px[x, y][3] > 20]
    ys = [y for y in range(h) for x in range(w) if px[x, y][3] > 20]
    if not xs:
        raise SystemExit("no opaque pixels in AI red bar")
    return im.crop((min(xs), min(ys), max(xs) + 1, max(ys) + 1))


def outline(im: Image.Image) -> Image.Image:
    px = im.load()
    w, h = im.size
    opaque = [(x, y) for y in range(h) for x in range(w) if px[x, y][3] > 0]
    for x, y in opaque:
        for dx, dy in ((-1, 0), (1, 0), (0, -1), (0, 1)):
            nx, ny = x + dx, y + dy
            if not (0 <= nx < w and 0 <= ny < h) or px[nx, ny][3] == 0:
                px[x, y] = OUTLINE
                break
    return im


def write_meta(png: Path, image_uuid: str) -> str:
    meta_path = Path(str(png) + ".meta")
    if meta_path.exists():
        meta = json.loads(meta_path.read_text(encoding="utf-8"))
        image_uuid = meta.get("uuid", image_uuid)
    hw, hh = W / 2.0, H / 2.0
    display = "ui-fishing-bar-miss"
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
                    "width": W,
                    "height": H,
                    "rawWidth": W,
                    "rawHeight": H,
                    "borderTop": 18,
                    "borderBottom": 18,
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
                        "uv": [0, H, W, H, 0, 0, W, 0],
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


def sync_frames(sf: str) -> None:
    frames = {}
    if FF.exists():
        frames = json.loads(FF.read_text(encoding="utf-8"))
    frames["barMiss"] = sf
    FF.write_text(json.dumps(frames, indent=2) + "\n", encoding="utf-8")
    OUT_TS.write_text(
        "/** Auto-synced from tools/ui/fishing-frames.json */\n"
        "export const FISHING_FRAMES = {}\n".format(json.dumps(frames, indent=4)),
        encoding="utf-8",
    )

    if CATALOG.exists():
        cat = json.loads(CATALOG.read_text(encoding="utf-8"))
        key = "entries" if "entries" in cat else ("items" if "items" in cat else None)
        if key is not None:
            by_id = {e.get("id"): i for i, e in enumerate(cat[key]) if isinstance(e, dict)}
            entry = {
                "id": "ui-fishing-bar-miss",
                "kind": "chrome",
                "group": "fishing",
                "path": "assets/textures/ui/ui-fishing-bar-miss.png",
                "spriteFrame": sf,
                "size": [W, H],
                "tags": ["fishing", "bar", "miss", "ai"],
            }
            if "ui-fishing-bar-miss" in by_id:
                cat[key][by_id["ui-fishing-bar-miss"]] = {
                    **cat[key][by_id["ui-fishing-bar-miss"]],
                    **entry,
                }
            else:
                # Insert after green bar if present.
                idx = by_id.get("ui-fishing-bar")
                if idx is not None:
                    cat[key].insert(idx + 1, entry)
                else:
                    cat[key].append(entry)
            CATALOG.write_text(json.dumps(cat, indent=2) + "\n", encoding="utf-8")


def main() -> None:
    src = None
    for name in CANDIDATES:
        p = SRC / name
        if p.exists():
            src = p
            break
    if src is None:
        raise SystemExit("missing AI red bar ref in {}".format(SRC))

    im = Image.open(src).convert("RGBA")
    im = knock_bg(im)
    im = flood_corners(im)
    crop = crop_opaque(im)
    print("src", src.name, "crop", crop.size)

    tw, th = W - 2, H - 2
    tmp = crop.resize((max(12, tw // 2), max(24, th // 2)), RESAMPLE_BOX)
    scaled = tmp.resize((tw, th), RESAMPLE_NEAREST)
    canvas = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    canvas.paste(scaled, (1, 1), scaled)
    px = canvas.load()
    for y in range(H):
        for x in range(W):
            r, g, b, a = px[x, y]
            px[x, y] = (0, 0, 0, 0) if a < 20 else (r, g, b, 255)
    canvas = outline(canvas)

    xs = [x for y in range(H) for x in range(W) if px[x, y][3] > 20]
    print("content width", max(xs) - min(xs) + 1)

    OUT.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(OUT)

    umap: dict = {}
    if UUID_MAP.exists():
        umap = json.loads(UUID_MAP.read_text(encoding="utf-8"))
    map_key = "ui-fishing-bar-miss"
    image_uuid = write_meta(OUT, umap.get(map_key, {}).get("texture") or str(uuid.uuid4()))
    sf = "{}@{}".format(image_uuid, SF_SUFFIX)
    umap[map_key] = {"texture": image_uuid, "prefab": "", "spriteFrame": sf}
    UUID_MAP.write_text(json.dumps(umap, indent=2) + "\n", encoding="utf-8")
    sync_frames(sf)
    print("OK", OUT.relative_to(ROOT), sf)


if __name__ == "__main__":
    main()
