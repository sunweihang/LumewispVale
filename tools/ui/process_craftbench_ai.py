#!/usr/bin/env python3
"""
Ingest AI craftbench → prop-craftbench.png (nearest, foot pivot).
Archives source under tools/ui/ai-source/, refreshes catalog / uuid-map / NatureFrames.
"""

import json
import shutil
import uuid
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
TOOLS = Path(__file__).resolve().parent
AI_DIR = TOOLS / "ai-source"
CURSOR_ASSETS = Path("/Users/sunix/.cursor/projects/Users-Custom-LumewispVale/assets")
OUT = ROOT / "assets/textures/props/prop-craftbench.png"
UUID_MAP = TOOLS / "uuid-map.json"
CATALOG = TOOLS / "catalog.json"
NATURE_JSON = TOOLS / "nature-frames.json"
NATURE_TS = ROOT / "assets/scripts/game/NatureFrames.ts"

# Prefer v2 (farm-clean); fall back to earlier ref.
SOURCES = ("ai-craftbench-v2.png", "ai-craftbench-ref.png")
OW, OH = 96, 80
TEX_SUFFIX = "6c48a"
SF_SUFFIX = "f9941"
MAP_KEY = "prop-craftbench"
FRAME_KEY = "craftbench"


def is_gray_bg(r, g, b, a):
    if a < 20:
        return True
    if abs(r - g) < 18 and abs(g - b) < 18 and 110 <= r <= 160:
        return True
    if r > 210 and g > 210 and b > 210:
        return True
    # near-black studio leftover
    if r < 18 and g < 18 and b < 18:
        return True
    return False


def quantize(img):
    px = img.load()
    w, h = img.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a < 40:
                px[x, y] = (0, 0, 0, 0)
            else:
                px[x, y] = (r // 16 * 16 + 8, g // 16 * 16 + 8, b // 16 * 16 + 8, 255)
    return img


def key_sprite(im):
    im = im.convert("RGBA")
    px = im.load()
    w, h = im.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if is_gray_bg(r, g, b, a):
                px[x, y] = (0, 0, 0, 0)
    bbox = im.getbbox()
    if not bbox:
        return Image.new("RGBA", (8, 8), (0, 0, 0, 0))
    return im.crop(bbox)


def fit_sprite(im, tw, th):
    cut = key_sprite(im)
    cw, ch = cut.size
    # Author-res intermediate for crispness
    if max(cw, ch) > 96:
        cut = cut.resize((max(1, cw // 4), max(1, ch // 4)), Image.BOX)
        cw, ch = cut.size
    scale = min((tw - 4) / float(max(1, cw)), (th - 4) / float(max(1, ch)))
    nw = max(1, int(round(cw * scale)))
    nh = max(1, int(round(ch * scale)))
    cut = quantize(cut.resize((nw, nh), Image.NEAREST))
    out = Image.new("RGBA", (tw, th), (0, 0, 0, 0))
    out.paste(cut, ((tw - nw) // 2, th - nh), cut)
    return out


def write_meta(png_path, image_uuid, w, h, name):
    meta_path = Path(str(png_path) + ".meta")
    hw, hh = w / 2.0, h / 2.0
    if meta_path.exists():
        meta = json.loads(meta_path.read_text(encoding="utf-8"))
        image_uuid = meta.get("uuid", image_uuid)
        for sub in meta.get("subMetas", {}).values():
            ud = sub.get("userData", {})
            if sub.get("importer") == "texture":
                ud["minfilter"] = "nearest"
                ud["magfilter"] = "nearest"
                ud["mipfilter"] = "none"
            if sub.get("importer") == "sprite-frame":
                ud["width"] = w
                ud["height"] = h
                ud["rawWidth"] = w
                ud["rawHeight"] = h
                ud["trimX"] = 0
                ud["trimY"] = 0
                ud["offsetX"] = 0
                ud["offsetY"] = 0
                ud["pivotX"] = 0.5
                ud["pivotY"] = 0.0
                ud["trimType"] = "custom"
            sub["userData"] = ud
        meta_path.write_text(json.dumps(meta, indent=2) + "\n", encoding="utf-8")
        return image_uuid

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
                    "pivotY": 0.0,
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


def upsert_catalog():
    if not CATALOG.exists():
        return
    data = json.loads(CATALOG.read_text(encoding="utf-8"))
    items = data.get("items") or data.get("assets") or []
    if isinstance(data, list):
        items = data
    entry = {
        "id": MAP_KEY,
        "kind": "prop",
        "spriteType": "simple",
        "designSize": [OW, OH],
        "path": "assets/textures/props/prop-craftbench.png",
        "prefab": "",
        "layer": "Midground",
        "note": "Yard crafting workbench (orthographic 3/4); future craft interact",
        "tags": ["craft", "workbench", "craftbench"],
    }
    found = False
    for i, it in enumerate(items):
        if it.get("id") == MAP_KEY:
            items[i] = {**it, **entry}
            found = True
            break
    if not found:
        # Insert after prop-shipping when present
        idx = next((i for i, it in enumerate(items) if it.get("id") == "prop-shipping"), -1)
        if idx >= 0:
            items.insert(idx + 1, entry)
        else:
            items.append(entry)
    if isinstance(data, list):
        CATALOG.write_text(json.dumps(items, indent=2) + "\n", encoding="utf-8")
    else:
        key = "items" if "items" in data else "assets"
        data[key] = items
        CATALOG.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")


def upsert_uuid_map(image_uuid):
    um = json.loads(UUID_MAP.read_text(encoding="utf-8")) if UUID_MAP.exists() else {}
    um[MAP_KEY] = {
        "texture": image_uuid,
        "prefab": "",
        "spriteFrame": "{}@{}".format(image_uuid, SF_SUFFIX),
    }
    UUID_MAP.write_text(json.dumps(um, indent=2) + "\n", encoding="utf-8")
    return um


def patch_nature_frames(um):
    nature = {}
    if NATURE_JSON.exists():
        nature = json.loads(NATURE_JSON.read_text(encoding="utf-8"))
    nature[FRAME_KEY] = um[MAP_KEY]["spriteFrame"]
    NATURE_JSON.write_text(json.dumps(nature, indent=2) + "\n", encoding="utf-8")
    ts = (
        "/** Auto-synced from tools/ui/nature-frames.json */\n"
        "export const NATURE_FRAMES = {}\n".format(json.dumps(nature, indent=4))
    )
    NATURE_TS.write_text(ts, encoding="utf-8")


def resolve_source():
    AI_DIR.mkdir(parents=True, exist_ok=True)
    for name in SOURCES:
        cursor = CURSOR_ASSETS / name
        archived = AI_DIR / name
        if cursor.exists():
            shutil.copy2(cursor, archived)
            return archived
        if archived.exists():
            return archived
    raise FileNotFoundError("No AI craftbench source found in {} or {}".format(CURSOR_ASSETS, AI_DIR))


def main():
    src = resolve_source()
    print("Source:", src)
    im = Image.open(src)
    out = fit_sprite(im, OW, OH)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    out.save(OUT)
    print("Wrote", OUT.relative_to(ROOT), "{}x{}".format(OW, OH))

    um_prev = json.loads(UUID_MAP.read_text(encoding="utf-8")) if UUID_MAP.exists() else {}
    image_uuid = um_prev.get(MAP_KEY, {}).get("texture") or str(uuid.uuid4())
    image_uuid = write_meta(OUT, image_uuid, OW, OH, MAP_KEY)
    um = upsert_uuid_map(image_uuid)
    upsert_catalog()
    patch_nature_frames(um)
    print("UUID:", image_uuid)
    print("NatureFrames key:", FRAME_KEY)


if __name__ == "__main__":
    main()
