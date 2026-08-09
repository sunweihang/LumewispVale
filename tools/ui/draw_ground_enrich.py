#!/usr/bin/env python3
"""Enrich Stardew-like farm ground: noisy grass/dirt variants + soft clutter."""

import json
import random
import uuid
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[2]
TOOLS = Path(__file__).resolve().parent
UUID_MAP = TOOLS / "uuid-map.json"
CATALOG = TOOLS / "catalog.json"
NATURE_FRAMES = TOOLS / "nature-frames.json"
TERRAIN_DIR = ROOT / "assets/textures/terrain"
NATURE_DIR = ROOT / "assets/textures/nature"
TEX_SUFFIX = "6c48a"
SF_SUFFIX = "f9941"

GRASS = (58, 122, 58)
GRASS_DARK = (42, 90, 42)
GRASS_MID = (70, 140, 70)
GRASS_LIGHT = (96, 168, 88)
GRASS_DEEP = (32, 72, 36)
# Farm soil palette (world.dirt #D29E2A). Prefer AI tiles via process_dirt_ai.py.
DIRT = (210, 158, 42)
DIRT_SOFT = (196, 144, 36)
DIRT_SOFT2 = (180, 128, 32)
DIRT_MID = (220, 168, 48)
DIRT_LIGHT = (230, 180, 64)
DIRT_PEBBLE = (196, 160, 88)


def uid():
    return str(uuid.uuid4())


def write_image_meta(png_path, image_uuid, w, h, name, pivot_y=0.5):
    hw, hh = w / 2.0, h / 2.0
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
    png_path.with_suffix(".png.meta").write_text(
        json.dumps(meta, indent=2) + "\n", encoding="utf-8"
    )


def _hash01(x, y, seed):
    """Cheap non-grid hash in [0, 1)."""
    v = (x * 374761393 + y * 668265263 + seed * 982451653) & 0x7FFFFFFF
    v = (v ^ (v >> 13)) * 1274126177
    return ((v ^ (v >> 16)) & 0xFFFF) / 65536.0


def draw_grass(w=64, h=64, seed=1, tone=0):
    random.seed(seed)
    base = tuple(max(0, min(255, c + tone)) for c in GRASS)
    img = Image.new("RGBA", (w, h), base + (255,))
    px = img.load()
    for y in range(h):
        for x in range(w):
            r = _hash01(x, y, seed)
            r2 = _hash01(x + 3, y + 7, seed + 11)
            if r < 0.12:
                px[x, y] = GRASS_DARK + (255,)
            elif r < 0.22:
                px[x, y] = GRASS_DEEP + (255,)
            elif r2 > 0.86:
                px[x, y] = GRASS_MID + (255,)
    d = ImageDraw.Draw(img)
    # short blade tufts (clustered, not a lattice)
    for _ in range(34):
        x = random.randint(1, w - 2)
        y = random.randint(2, h - 2)
        col = random.choice([GRASS_LIGHT, GRASS_MID, GRASS_DARK])
        d.point((x, y), fill=col + (255,))
        if random.random() < 0.6:
            d.point((x, y - 1), fill=col + (255,))
        if random.random() < 0.3:
            d.point((x + random.choice([-1, 1]), y - 1), fill=GRASS_LIGHT + (255,))
        if random.random() < 0.2:
            d.point((x + random.choice([-1, 0, 1]), y), fill=GRASS_DARK + (255,))
    for _ in range(5):
        x, y = random.randint(3, w - 4), random.randint(3, h - 4)
        if random.random() < 0.55:
            d.point((x, y), fill=(210, 170, 90, 255))
        else:
            d.point((x, y), fill=(200, 120, 150, 255))
    return img


def _tone(rgb, tone):
    return tuple(max(0, min(255, c + tone)) for c in rgb)


def draw_dirt(w=64, h=64, seed=2, tone=0):
    """Light Stardew farm dirt: flat ochre + sparse near-value grit, no heavy ruts."""
    random.seed(seed)
    base = _tone(DIRT, tone)
    soft = _tone(DIRT_SOFT, tone)
    soft2 = _tone(DIRT_SOFT2, tone)
    mid = _tone(DIRT_MID, tone)
    light = _tone(DIRT_LIGHT, tone)
    pebble = _tone(DIRT_PEBBLE, tone)

    img = Image.new("RGBA", (w, h), base + (255,))
    px = img.load()

    # 1) sparse near-value grit — leave ~93%+ as flat base (Stardew breathing room)
    for y in range(h):
        for x in range(w):
            r = _hash01(x, y, seed)
            if r < 0.028:
                px[x, y] = soft + (255,)
            elif r < 0.042:
                px[x, y] = mid + (255,)
            elif r > 0.982:
                px[x, y] = light + (255,)

    # 2) a few soft 2px dents (not plow / crack networks)
    for i in range(3):
        cx = 4 + int(_hash01(i, 2, seed + 40) * (w - 8))
        cy = 4 + int(_hash01(i, 5, seed + 41) * (h - 8))
        for dx, dy in [(-1, 0), (0, -1), (1, 0)]:
            x, y = cx + dx, cy + dy
            if 0 <= x < w and 0 <= y < h:
                px[x, y] = soft + (255,)
        px[cx, cy] = soft2 + (255,)

    # 3) short grain ticks — 3–4 only, 2–3px
    for i in range(4):
        x = int(_hash01(i, 11, seed + 60) * (w - 3))
        y = int(_hash01(i, 14, seed + 61) * (h - 1))
        length = 2 + int(_hash01(i, 16, seed + 62) * 2)
        for k in range(length):
            xx, yy = x + k, y
            if 0 <= xx < w and 0 <= yy < h:
                px[xx, yy] = soft + (255,)

    # 4) one warm fleck max (rocks are separate props)
    if _hash01(seed, 3, 99) > 0.35:
        x, y = random.randint(2, w - 3), random.randint(2, h - 3)
        px[x, y] = pebble + (255,)

    return img


def draw_pebble(w=24, h=18):
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.ellipse([2, 4, w - 2, h - 1], fill=(130, 132, 138, 255), outline=(50, 52, 58, 255))
    d.ellipse([5, 6, 11, 11], fill=(168, 170, 176, 220))
    d.point((w - 7, h - 5), fill=(90, 92, 98, 255))
    return img


def draw_twig(w=32, h=20):
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    wood = (110, 72, 40)
    dark = (60, 38, 20)
    d.line([(4, h - 6), (w - 6, 6)], fill=wood + (255,), width=2)
    d.line([(w // 2 - 2, h // 2), (w // 2 + 6, h // 2 - 6)], fill=dark + (255,))
    d.point((6, h - 7), fill=dark + (255,))
    d.point((w - 8, 8), fill=DIRT_LIGHT + (255,))
    return img


def draw_tuft(w=28, h=24):
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    cx = w // 2
    for dx, tip in [(-6, -10), (-2, -14), (3, -12), (7, -8), (0, -6)]:
        d.line([(cx + dx // 2, h - 2), (cx + dx, h + tip)], fill=GRASS_DARK + (255,))
        d.point((cx + dx, h + tip), fill=GRASS_LIGHT + (255,))
    d.ellipse([cx - 5, h - 6, cx + 5, h - 1], fill=GRASS_DEEP + (200,))
    return img


def draw_weed_tall(w=36, h=40, blossom=False):
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    cx = w // 2
    leaf = (62, 128, 54)
    dark = (36, 84, 38)
    for i, (dx, dy) in enumerate([(-7, -4), (7, -6), (-2, -16), (4, -14), (0, -22), (-5, -12)]):
        d.ellipse(
            [cx + dx - 5, h + dy - 12, cx + dx + 5, h + dy - 1],
            fill=(leaf if i % 2 == 0 else dark) + (255,),
        )
    if blossom:
        for dx, dy in [(-4, -24), (3, -26), (0, -20)]:
            d.ellipse([cx + dx - 2, h + dy - 2, cx + dx + 2, h + dy + 2], fill=(230, 150, 180, 255))
    return img


def draw_fiber(w=20, h=16):
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.line([(3, h - 3), (8, 4)], fill=GRASS_MID + (255,))
    d.line([(10, h - 2), (14, 5)], fill=GRASS_DARK + (255,))
    d.line([(6, h - 4), (16, 7)], fill=GRASS_LIGHT + (255,))
    return img


def save_asset(item_id, img, folder, pivot_y, uuid_map):
    w, h = img.size
    png = folder / "{}.png".format(item_id)
    prev = uuid_map.get(item_id, {}).get("texture")
    image_uuid = prev or uid()
    img.save(png)
    write_image_meta(png, image_uuid, w, h, item_id, pivot_y=pivot_y)
    sf = "{}@{}".format(image_uuid, SF_SUFFIX)
    uuid_map[item_id] = {
        "texture": image_uuid,
        "prefab": uuid_map.get(item_id, {}).get("prefab", ""),
        "spriteFrame": sf,
    }
    print("OK", item_id, "{}x{}".format(w, h))
    return sf


def upsert_catalog(item_id, kind, w, h, path):
    catalog = json.loads(CATALOG.read_text(encoding="utf-8"))
    existing = {i["id"]: i for i in catalog["items"]}
    entry = {
        "id": item_id,
        "kind": kind,
        "spriteType": "simple",
        "designSize": [w, h],
        "path": path,
        "prefab": existing.get(item_id, {}).get("prefab", ""),
        "layer": "Ground" if kind == "terrain" else "Midground",
    }
    if item_id in existing:
        existing[item_id].update(entry)
        catalog["items"] = list(existing.values())
    else:
        catalog["items"].append(entry)
    CATALOG.write_text(json.dumps(catalog, indent=2) + "\n", encoding="utf-8")


def main():
    """Frame/catalog maintenance only.

    Grass/dirt tiles → process_farm_ai_v2.py / process_dirt_ai.py
    Soft clutter (pebble/twig/tuft/weeds/fiber) → process_clutter_ai.py
    Do NOT regenerate PIL placeholders here — they overwrite AI sprites.
    """
    TERRAIN_DIR.mkdir(parents=True, exist_ok=True)
    NATURE_DIR.mkdir(parents=True, exist_ok=True)
    uuid_map = {}
    if UUID_MAP.exists():
        uuid_map = json.loads(UUID_MAP.read_text(encoding="utf-8"))

    terrain_frames = {}
    if (TOOLS / "terrain-frames.json").exists():
        terrain_frames = json.loads((TOOLS / "terrain-frames.json").read_text(encoding="utf-8"))

    # Keep UUID map + catalog entries for existing AI tiles without rewriting PNGs
    tile_ids = [
        ("tile-grass", "grass", 64, 64),
        ("tile-grass-b", "grassB", 64, 64),
        ("tile-grass-c", "grassC", 64, 64),
        ("tile-dirt", "dirt", 64, 64),
        ("tile-dirt-b", "dirtB", 64, 64),
    ]
    for item_id, key, w, h in tile_ids:
        png = TERRAIN_DIR / "{}.png".format(item_id)
        if not png.exists():
            print("MISSING terrain", item_id, "(run AI ingest)")
            continue
        prev = uuid_map.get(item_id, {}).get("texture")
        image_uuid = prev or uid()
        if not prev:
            write_image_meta(png, image_uuid, w, h, item_id, pivot_y=0.5)
        sf = "{}@{}".format(image_uuid, SF_SUFFIX)
        uuid_map[item_id] = {
            "texture": image_uuid,
            "prefab": uuid_map.get(item_id, {}).get("prefab", ""),
            "spriteFrame": sf,
        }
        terrain_frames[key] = sf
        upsert_catalog(
            item_id,
            "terrain",
            w,
            h,
            "assets/textures/terrain/{}.png".format(item_id),
        )
        print("KEEP", item_id)

    clutter_ids = [
        ("nat-pebble", "pebble", 24, 18),
        ("nat-twig", "twig", 32, 20),
        ("nat-tuft", "tuft", 28, 24),
        ("nat-weed-tall", "weedTall", 36, 40),
        ("nat-weed-pink", "weedPink", 36, 40),
        ("nat-fiber", "fiber", 20, 16),
    ]
    clutter_frames = {}
    for item_id, key, w, h in clutter_ids:
        png = NATURE_DIR / "{}.png".format(item_id)
        if not png.exists():
            print("MISSING clutter", item_id, "(run process_clutter_ai.py)")
            continue
        prev = uuid_map.get(item_id, {}).get("texture")
        image_uuid = prev or uid()
        if not prev:
            write_image_meta(png, image_uuid, w, h, item_id, pivot_y=0.0)
        sf = "{}@{}".format(image_uuid, SF_SUFFIX)
        uuid_map[item_id] = {
            "texture": image_uuid,
            "prefab": uuid_map.get(item_id, {}).get("prefab", ""),
            "spriteFrame": sf,
        }
        clutter_frames[key] = sf
        upsert_catalog(
            item_id,
            "nature",
            w,
            h,
            "assets/textures/nature/{}.png".format(item_id),
        )
        print("KEEP", item_id)

    UUID_MAP.write_text(json.dumps(uuid_map, indent=2) + "\n", encoding="utf-8")

    (TOOLS / "terrain-frames.json").write_text(
        json.dumps(terrain_frames, indent=2) + "\n", encoding="utf-8"
    )
    ts_terrain = (
        "/** Auto-synced from tools/ui/terrain-frames.json */\n"
        "export const TERRAIN_FRAMES = {}\n".format(json.dumps(terrain_frames, indent=4))
    )
    (ROOT / "assets/scripts/game/TerrainFrames.ts").write_text(ts_terrain, encoding="utf-8")

    nature = {}
    if NATURE_FRAMES.exists():
        nature = json.loads(NATURE_FRAMES.read_text(encoding="utf-8"))
    nature.update(clutter_frames)
    NATURE_FRAMES.write_text(json.dumps(nature, indent=2) + "\n", encoding="utf-8")
    ts_nature = (
        "/** Auto-synced from tools/ui/nature-frames.json */\n"
        "export const NATURE_FRAMES = {}\n".format(json.dumps(nature, indent=4))
    )
    (ROOT / "assets/scripts/game/NatureFrames.ts").write_text(ts_nature, encoding="utf-8")
    print("Kept AI terrain/clutter UUIDs (no PNG overwrite)")


if __name__ == "__main__":
    main()
