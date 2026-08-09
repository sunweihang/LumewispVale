#!/usr/bin/env python3
"""Ingest AI tilled/wet tiles + tool icons; refresh FarmFrames / ToolFrames."""

import json
import shutil
import uuid
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
TOOLS = Path(__file__).resolve().parent
AI_DIR = TOOLS / "ai-source" / "farm-tools"
CURSOR = Path("/Users/sunix/.cursor/projects/Users-Custom-LumewispVale/assets")
UUID_MAP = TOOLS / "uuid-map.json"
TEX_SUFFIX = "6c48a"
SF_SUFFIX = "f9941"

JOBS = [
    # stem, dest, w, h, mode, catalog_id
    ("ai-tilled", "assets/textures/farm/tile-tilled.png", 64, 64, "tile", "tile-tilled"),
    ("ai-wet", "assets/textures/farm/tile-wet.png", 64, 64, "tile", "tile-wet"),
    ("ai-hoe", "assets/textures/ui/ic-hoe.png", 96, 96, "sprite", "ic-hoe"),
    ("ai-can", "assets/textures/ui/ic-can.png", 96, 96, "sprite", "ic-can"),
    ("ai-seeds", "assets/textures/ui/ic-seeds.png", 96, 96, "sprite", "ic-seeds"),
    ("ai-slot", "assets/textures/ui/ui-slot.png", 96, 96, "sprite", "ui-slot"),
]


def uid():
    return str(uuid.uuid4())


def collect():
    AI_DIR.mkdir(parents=True, exist_ok=True)
    for stem, _, _, _, _, _ in JOBS:
        src = CURSOR / "{}.png".format(stem)
        dst = AI_DIR / "{}.png".format(stem)
        if src.exists():
            shutil.copy2(src, dst)


def is_gray_bg(r, g, b, a):
    if a < 20:
        return True
    if abs(r - g) < 22 and abs(g - b) < 22 and 70 <= r <= 200:
        return True
    if r > 210 and g > 210 and b > 210:
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


def fit_tile(im, tw, th):
    im = im.convert("RGBA")
    w, h = im.size
    side = min(w, h)
    left = (w - side) // 2
    top = (h - side) // 2
    im = im.crop((left, top, left + side, top + side))
    if side > tw * 2:
        im = im.resize((max(tw, side // 8), max(th, side // 8)), Image.BOX)
    im = im.resize((tw, th), Image.NEAREST)
    return quantize(im)


def fit_sprite(im, tw, th):
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
        return Image.new("RGBA", (tw, th), (0, 0, 0, 0))
    cut = im.crop(bbox)
    cw, ch = cut.size
    if max(cw, ch) > 128:
        cut = cut.resize((max(1, cw // 4), max(1, ch // 4)), Image.BOX)
        cw, ch = cut.size
    scale = min((tw - 8) / float(max(1, cw)), (th - 8) / float(max(1, ch)))
    nw = max(1, int(round(cw * scale)))
    nh = max(1, int(round(ch * scale)))
    cut = quantize(cut.resize((nw, nh), Image.NEAREST))
    out = Image.new("RGBA", (tw, th), (0, 0, 0, 0))
    out.paste(cut, ((tw - nw) // 2, (th - nh) // 2), cut)
    return out


def write_meta(png_path, image_uuid, w, h, name, pivot_y):
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
                ud["pivotX"] = 0.5
                ud["pivotY"] = pivot_y
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
                    "pivotY": pivot_y,
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


def main():
    collect()
    uuid_map = {}
    if UUID_MAP.exists():
        uuid_map = json.loads(UUID_MAP.read_text(encoding="utf-8"))

    farm = {}
    tools = {}
    for stem, rel, w, h, mode, cid in JOBS:
        src = AI_DIR / "{}.png".format(stem)
        if not src.exists():
            print("missing", stem)
            continue
        im = Image.open(src)
        out = fit_tile(im, w, h) if mode == "tile" else fit_sprite(im, w, h)
        dest = ROOT / rel
        dest.parent.mkdir(parents=True, exist_ok=True)
        out.save(dest)
        prev = uuid_map.get(cid, {}).get("texture")
        image_uuid = write_meta(dest, prev or uid(), w, h, cid, 0.5)
        sf = "{}@{}".format(image_uuid, SF_SUFFIX)
        uuid_map[cid] = {
            "texture": image_uuid,
            "prefab": uuid_map.get(cid, {}).get("prefab", ""),
            "spriteFrame": sf,
        }
        if cid.startswith("tile-"):
            farm[cid.replace("tile-", "")] = sf
        else:
            tools[cid] = sf
        print("OK", rel)

    UUID_MAP.write_text(json.dumps(uuid_map, indent=2) + "\n", encoding="utf-8")

    # Keep crop stages from previous FarmFrames if present
    old_farm = {}
    ff = TOOLS / "farm-frames.json"
    if ff.exists():
        old_farm = json.loads(ff.read_text(encoding="utf-8"))
    farm_out = {
        "tilled": farm.get("tilled") or old_farm.get("tilled"),
        "wet": farm.get("wet") or old_farm.get("wet"),
        "crop": old_farm.get("crop", []),
    }
    ff.write_text(json.dumps(farm_out, indent=2) + "\n", encoding="utf-8")
    (ROOT / "assets/scripts/game/FarmFrames.ts").write_text(
        "/** Auto-synced from tools/ui/farm-frames.json */\n"
        "export const FARM_FRAMES = {}\n".format(json.dumps(farm_out, indent=4)),
        encoding="utf-8",
    )

    old_tools = {}
    tf = TOOLS / "tool-frames.json"
    if tf.exists():
        old_tools = json.loads(tf.read_text(encoding="utf-8"))
    tool_out = {
        "hoe": tools.get("ic-hoe") or old_tools.get("hoe", ""),
        "seeds": tools.get("ic-seeds") or old_tools.get("seeds", ""),
        "can": tools.get("ic-can") or old_tools.get("can", ""),
        "axe": tools.get("ic-axe") or old_tools.get("axe", ""),
        "slot": tools.get("ui-slot") or old_tools.get("slot", ""),
    }
    (TOOLS / "tool-frames.json").write_text(
        json.dumps(tool_out, indent=2) + "\n", encoding="utf-8"
    )
    (ROOT / "assets/scripts/game/ToolFrames.ts").write_text(
        "/** Auto-synced from tools/ui/tool-frames.json */\n"
        "export const TOOL_FRAMES = {}\n".format(json.dumps(tool_out, indent=4)),
        encoding="utf-8",
    )
    print("FarmFrames + ToolFrames updated")


if __name__ == "__main__":
    main()
