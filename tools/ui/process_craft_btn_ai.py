#!/usr/bin/env python3
"""
Ingest AI craft button chrome → ui-craft-btn.png (nearest).
Blank wood plate (no baked text) for Label overlay in FarmHUD.
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
OUT = ROOT / "assets/textures/ui/ui-craft-btn.png"
UUID_MAP = TOOLS / "uuid-map.json"
CATALOG = TOOLS / "catalog.json"
TOOL_FRAMES = TOOLS / "tool-frames.json"
TOOL_TS = ROOT / "assets/scripts/game/ToolFrames.ts"

SOURCES = ("ai-craft-btn-ref.png",)
# Runtime craft btn ~180×66 (UI_SCALE 1.5 × 120×44)
OW, OH = 180, 66
TEX_SUFFIX = "6c48a"
SF_SUFFIX = "f9941"
MAP_KEY = "ui-craft-btn"
FRAME_KEY = "craftBtn"


def is_gray_bg(r, g, b, a):
    if a < 20:
        return True
    if abs(r - g) < 18 and abs(g - b) < 18 and 110 <= r <= 160:
        return True
    if r > 210 and g > 210 and b > 210:
        return True
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


def fit_button(im, tw, th):
    cut = key_sprite(im)
    cw, ch = cut.size
    if max(cw, ch) > 160:
        cut = cut.resize((max(1, cw // 3), max(1, ch // 3)), Image.BOX)
        cw, ch = cut.size
    scale = min(tw / float(max(1, cw)), th / float(max(1, ch)))
    nw = max(1, int(round(cw * scale)))
    nh = max(1, int(round(ch * scale)))
    cut = quantize(cut.resize((nw, nh), Image.NEAREST))
    out = Image.new("RGBA", (tw, th), (0, 0, 0, 0))
    out.paste(cut, ((tw - nw) // 2, (th - nh) // 2), cut)
    return out


def write_meta(png_path, image_uuid, w, h, name):
    meta_path = Path(str(png_path) + ".meta")
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


def upsert_catalog():
    if not CATALOG.exists():
        return
    data = json.loads(CATALOG.read_text(encoding="utf-8"))
    items = data.get("items") or data.get("assets") or []
    if isinstance(data, list):
        items = data
    entry = {
        "id": MAP_KEY,
        "kind": "ui",
        "spriteType": "simple",
        "designSize": [OW, OH],
        "path": "assets/textures/ui/ui-craft-btn.png",
        "prefab": "",
        "note": "Craftbench row button chrome (blank wood; Label overlays 制作)",
        "tags": ["craft", "button"],
    }
    found = False
    for i, it in enumerate(items):
        if it.get("id") == MAP_KEY:
            items[i] = dict(it, **entry)
            found = True
            break
    if not found:
        items.append(entry)
    if isinstance(data, list):
        CATALOG.write_text(json.dumps(items, indent=2) + "\n", encoding="utf-8")
    else:
        key = "items" if "items" in data else "assets"
        data[key] = items
        CATALOG.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")


def upsert_frames(image_uuid):
    um = json.loads(UUID_MAP.read_text(encoding="utf-8")) if UUID_MAP.exists() else {}
    sf = "{}@{}".format(image_uuid, SF_SUFFIX)
    um[MAP_KEY] = {"texture": image_uuid, "prefab": "", "spriteFrame": sf}
    UUID_MAP.write_text(json.dumps(um, indent=2) + "\n", encoding="utf-8")

    frames = json.loads(TOOL_FRAMES.read_text(encoding="utf-8")) if TOOL_FRAMES.exists() else {}
    frames[FRAME_KEY] = sf
    TOOL_FRAMES.write_text(json.dumps(frames, indent=2) + "\n", encoding="utf-8")
    ts = (
        "/** Auto-synced from tools/ui/tool-frames.json */\n"
        "export const TOOL_FRAMES = {}\n".format(json.dumps(frames, indent=4))
    )
    TOOL_TS.write_text(ts, encoding="utf-8")


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
    raise FileNotFoundError("Missing AI craft button source")


def main():
    src = resolve_source()
    print("Source:", src)
    out = fit_button(Image.open(src), OW, OH)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    out.save(OUT)
    print("Wrote", OUT.relative_to(ROOT), "{}x{}".format(OW, OH))

    um = json.loads(UUID_MAP.read_text(encoding="utf-8")) if UUID_MAP.exists() else {}
    image_uuid = um.get(MAP_KEY, {}).get("texture") or str(uuid.uuid4())
    image_uuid = write_meta(OUT, image_uuid, OW, OH, MAP_KEY)
    upsert_catalog()
    upsert_frames(image_uuid)
    print("UUID:", image_uuid, "frame:", FRAME_KEY)


if __name__ == "__main__":
    main()
