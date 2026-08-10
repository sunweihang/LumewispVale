#!/usr/bin/env python3
"""Draw shallow-mine props / ore nodes / cave floor for Lumewisp Vale.

Stardew-like 3/4 pixel, transparent bg, nearest. Run:

    python tools/ui/draw_mine_props.py
"""

from __future__ import annotations

import json
import uuid
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
TOOLS = Path(__file__).resolve().parent
UUID_MAP = TOOLS / "uuid-map.json"
TEX_BUILDINGS = ROOT / "assets/textures/buildings"
TEX_PROPS = ROOT / "assets/textures/props"
TEX_NATURE = ROOT / "assets/textures/nature"
TEX_TERRAIN = ROOT / "assets/textures/terrain"
TEX_SUFFIX = "6c48a"
SF_SUFFIX = "f9941"

# Shared stone palette (matches farm rocks)
STONE = (118, 120, 128, 255)
STONE_LIGHT = (168, 170, 178, 255)
STONE_HI = (200, 202, 210, 255)
STONE_MID = (90, 92, 100, 255)
STONE_DARK = (58, 60, 68, 255)
STONE_LINE = (28, 30, 36, 255)
SHADOW = (40, 34, 28, 200)

COPPER = (196, 118, 72, 255)
COPPER_HI = (224, 158, 96, 255)
COPPER_DARK = (140, 78, 48, 255)
IRON = (150, 156, 168, 255)
IRON_HI = (198, 204, 214, 255)
IRON_DARK = (88, 92, 104, 255)
CRYSTAL = (168, 120, 220, 255)
CRYSTAL_HI = (220, 190, 255, 255)
CRYSTAL_DARK = (96, 64, 150, 255)
WOOD = (140, 96, 58, 255)
WOOD_DARK = (92, 60, 36, 255)
WOOD_HI = (176, 128, 78, 255)
METAL = (110, 116, 124, 255)
METAL_HI = (170, 176, 184, 255)
CAVE = (72, 68, 88, 255)
CAVE_MID = (96, 90, 114, 255)
CAVE_DARK = (48, 44, 62, 255)
CAVE_HI = (128, 122, 148, 255)


def uid() -> str:
    return str(uuid.uuid4())


def write_image_meta(png_path: Path, image_uuid: str, w: int, h: int, name: str, pivot_y: float = 0.0):
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
                    "imageUuidOrDatabaseUri": f"{image_uuid}@{TEX_SUFFIX}",
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
            "redirect": f"{image_uuid}@{TEX_SUFFIX}",
        },
    }
    png_path.with_suffix(".png.meta").write_text(json.dumps(meta, indent=2) + "\n", encoding="utf-8")


def put(img: Image.Image, x: int, y: int, c):
    if 0 <= x < img.width and 0 <= y < img.height:
        img.putpixel((x, y), c)


def fill_rect(img: Image.Image, x0, y0, x1, y1, c):
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            put(img, x, y, c)


def outline(img: Image.Image, line=STONE_LINE):
    px = img.load()
    w, h = img.size
    edge = []
    for y in range(h):
        for x in range(w):
            if px[x, y][3] == 0:
                continue
            for dy, dx in ((-1, 0), (1, 0), (0, -1), (0, 1)):
                xx, yy = x + dx, y + dy
                if xx < 0 or yy < 0 or xx >= w or yy >= h or px[xx, yy][3] == 0:
                    edge.append((x, y))
                    break
    for x, y in edge:
        px[x, y] = line


def draw_cave_tile(w=64, h=64) -> Image.Image:
    """Darker purple-grey cave floor (tileable-ish noise)."""
    img = Image.new("RGBA", (w, h), CAVE)
    px = img.load()
    for y in range(h):
        for x in range(w):
            n = (x * 17 + y * 31) % 7
            if n == 0:
                px[x, y] = CAVE_MID
            elif n == 1 and (x + y) % 5 == 0:
                px[x, y] = CAVE_DARK
            elif n == 2 and (x * y) % 11 == 0:
                px[x, y] = CAVE_HI
    # subtle cracks
    for x, y in ((8, 20), (9, 21), (10, 22), (40, 12), (41, 13), (22, 48), (50, 40)):
        put(img, x, y, CAVE_DARK)
    return img


def draw_ore_rock(w=48, h=40, tint=COPPER, tint_hi=COPPER_HI, tint_dark=COPPER_DARK) -> Image.Image:
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    # Wide boulder silhouette
    # (y, x0, x1) solid spans — denser boulder
    spans = [
        (8, 16, 30), (9, 13, 33), (10, 11, 35), (11, 10, 36), (12, 9, 37),
        (13, 8, 38), (14, 7, 39), (15, 7, 40), (16, 6, 40), (17, 6, 41),
        (18, 6, 41), (19, 6, 41), (20, 6, 41), (21, 7, 41), (22, 7, 40),
        (23, 8, 40), (24, 8, 39), (25, 9, 38), (26, 10, 37), (27, 12, 35),
        (28, 14, 33), (29, 16, 31),
    ]
    for y, x0, x1 in spans:
        for x in range(x0, x1 + 1):
            put(img, x, y, STONE)
    # shade
    for y in range(10, 27):
        for x in range(6, 42):
            p = img.getpixel((x, y))
            if p[3] == 0:
                continue
            if x <= 18 and y <= 18:
                put(img, x, y, STONE_LIGHT)
            elif x >= 34:
                put(img, x, y, STONE_MID)
            elif y >= 22:
                put(img, x, y, STONE_DARK)
    put(img, 17, 13, STONE_HI)
    put(img, 18, 12, STONE_HI)
    # ore flecks
    for x, y in ((16, 16), (17, 17), (20, 15), (22, 18), (24, 16), (19, 20), (26, 19)):
        put(img, x, y, tint)
    for x, y in ((17, 16), (21, 17), (23, 16)):
        put(img, x, y, tint_hi)
    for x, y in ((18, 19), (25, 20)):
        put(img, x, y, tint_dark)
    outline(img)
    # contact shadow
    for x in range(10, 38):
        if img.getpixel((x, 28))[3] == 0:
            put(img, x, 28, SHADOW)
    return img


def draw_ore_big(w=72, h=56, tint=IRON, tint_hi=IRON_HI, tint_dark=IRON_DARK) -> Image.Image:
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    for y in range(14, 50):
        t = (y - 14) / 36
        x0 = int(18 - 10 * (1 - abs(t - 0.45) * 1.6))
        x1 = int(54 + 10 * (1 - abs(t - 0.45) * 1.6))
        x0 = max(8, x0)
        x1 = min(w - 8, x1)
        for x in range(x0, x1 + 1):
            c = STONE
            if x < x0 + 8 and y < 28:
                c = STONE_LIGHT
            elif x > x1 - 8:
                c = STONE_MID
            elif y > 40:
                c = STONE_DARK
            put(img, x, y, c)
    for x, y in ((28, 22), (30, 24), (34, 22), (36, 26), (40, 24), (32, 28), (38, 30), (26, 30)):
        put(img, x, y, tint)
    for x, y in ((29, 23), (35, 23), (37, 27)):
        put(img, x, y, tint_hi)
    for x, y in ((31, 29), (39, 31)):
        put(img, x, y, tint_dark)
    outline(img)
    return img


def draw_crystal_node(w=48, h=56) -> Image.Image:
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    # rock base
    for y in range(34, 52):
        half = max(6, 14 - abs(y - 42) // 2)
        for x in range(24 - half, 24 + half + 1):
            put(img, x, y, STONE_DARK if y > 46 else STONE)
    # three crystal spikes tapering upward
    spikes = [
        (18, 12, 7, 38),
        (24, 6, 9, 40),
        (30, 14, 7, 38),
    ]
    for cx, tip_y, base_w, base_y in spikes:
        for y in range(tip_y, base_y + 1):
            t = (y - tip_y) / max(1, base_y - tip_y)
            half = max(1, int(1 + (base_w * 0.5 - 1) * t))
            for x in range(cx - half, cx + half + 1):
                c = CRYSTAL
                if y < tip_y + 6:
                    c = CRYSTAL_HI
                elif x >= cx and (x + y) % 2 == 0:
                    c = CRYSTAL_DARK
                put(img, x, y, c)
    outline(img, (48, 32, 80, 255))
    return img


def draw_minecart(w=96, h=64) -> Image.Image:
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    # rails under
    fill_rect(img, 8, 52, 88, 54, METAL)
    fill_rect(img, 8, 56, 88, 57, METAL_HI)
    # wheels
    for cx in (22, 74):
        fill_rect(img, cx - 5, 46, cx + 5, 56, STONE_DARK)
        fill_rect(img, cx - 3, 48, cx + 3, 54, METAL)
    # cart body
    fill_rect(img, 16, 22, 80, 48, WOOD)
    fill_rect(img, 18, 24, 78, 30, WOOD_HI)
    fill_rect(img, 18, 40, 78, 46, WOOD_DARK)
    # metal rim
    fill_rect(img, 14, 20, 82, 22, METAL)
    fill_rect(img, 14, 20, 16, 48, METAL)
    fill_rect(img, 80, 20, 82, 48, METAL)
    # ore pile
    for x, y in ((36, 18), (44, 14), (52, 16), (48, 20), (40, 20), (56, 18)):
        put(img, x, y, COPPER)
        put(img, x + 1, y + 1, COPPER_HI)
    outline(img)
    return img


def draw_ladder(w=48, h=96) -> Image.Image:
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    # hole rim
    fill_rect(img, 6, 8, 42, 28, STONE_DARK)
    fill_rect(img, 10, 12, 38, 24, (20, 18, 28, 255))
    fill_rect(img, 8, 8, 40, 10, STONE_LIGHT)
    # rails
    fill_rect(img, 14, 20, 17, 90, WOOD_DARK)
    fill_rect(img, 30, 20, 33, 90, WOOD_DARK)
    fill_rect(img, 14, 20, 17, 40, WOOD)
    fill_rect(img, 30, 20, 33, 40, WOOD)
    # rungs
    for y in range(28, 88, 10):
        fill_rect(img, 14, y, 33, y + 2, WOOD_HI if y % 20 == 8 else WOOD)
    outline(img)
    return img


def draw_mine_mouth(w=288, h=224) -> Image.Image:
    """Cave mouth set into a rocky hillside — foot at bottom."""
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    # hillside mass
    for y in range(40, 210):
        t = (y - 40) / 170
        half = int(70 + t * 90)
        cx = w // 2
        for x in range(cx - half, cx + half):
            # ragged edge
            jagged = ((x * 13 + y * 7) % 5) - 2
            if abs(x - cx) > half + jagged:
                continue
            c = STONE_MID
            if y < 80:
                c = STONE
            if x < cx - half + 18:
                c = STONE_DARK
            if x > cx + half - 18:
                c = STONE_LIGHT
            if (x + y) % 17 == 0:
                c = STONE_DARK
            put(img, x, y, c)
    # grass tufts on crown
    for x in range(60, 230, 8):
        y = 38 + (x * 3) % 7
        put(img, x, y, (90, 140, 70, 255))
        put(img, x + 1, y - 1, (110, 160, 80, 255))
    # dark arch opening
    for y in range(90, 200):
        t = (y - 90) / 110
        half = int(28 + t * 38)
        cx = w // 2
        for x in range(cx - half, cx + half + 1):
            put(img, x, y, (18, 16, 28, 255))
    # timber frame
    fill_rect(img, 110, 88, 178, 94, WOOD_DARK)
    fill_rect(img, 108, 90, 114, 200, WOOD)
    fill_rect(img, 174, 90, 180, 200, WOOD)
    fill_rect(img, 108, 88, 180, 92, WOOD_HI)
    # lantern
    fill_rect(img, 186, 110, 196, 124, (220, 180, 80, 255))
    fill_rect(img, 188, 108, 194, 110, METAL)
    put(img, 190, 116, (255, 230, 140, 255))
    # track stubs into mouth
    fill_rect(img, 130, 198, 158, 202, METAL)
    fill_rect(img, 128, 204, 160, 206, METAL_HI)
    outline(img)
    return img


def save_asset(name: str, img: Image.Image, folder: Path, pivot_y: float, uuid_map: dict):
    folder.mkdir(parents=True, exist_ok=True)
    path = folder / f"{name}.png"
    existing = uuid_map.get(name, {})
    image_uuid = existing.get("texture") if isinstance(existing, dict) else None
    if not image_uuid:
        # keep .meta uuid if file already exists
        meta_path = path.with_suffix(".png.meta")
        if meta_path.exists():
            try:
                image_uuid = json.loads(meta_path.read_text(encoding="utf-8")).get("uuid")
            except Exception:
                image_uuid = None
    if not image_uuid:
        image_uuid = uid()
    img.save(path)
    write_image_meta(path, image_uuid, img.width, img.height, name, pivot_y=pivot_y)
    uuid_map[name] = {
        "texture": image_uuid,
        "prefab": existing.get("prefab", "") if isinstance(existing, dict) else "",
        "spriteFrame": f"{image_uuid}@{SF_SUFFIX}",
    }
    print(f"  {name} {img.width}x{img.height} → {path.relative_to(ROOT)}")


def main():
    uuid_map = json.loads(UUID_MAP.read_text(encoding="utf-8")) if UUID_MAP.exists() else {}
    print("Drawing mine props…")
    save_asset("tile-cave", draw_cave_tile(), TEX_TERRAIN, 0.5, uuid_map)
    save_asset("nat-ore-copper", draw_ore_rock(tint=COPPER, tint_hi=COPPER_HI, tint_dark=COPPER_DARK), TEX_NATURE, 0.0, uuid_map)
    save_asset("nat-ore-iron", draw_ore_big(tint=IRON, tint_hi=IRON_HI, tint_dark=IRON_DARK), TEX_NATURE, 0.0, uuid_map)
    save_asset(
        "nat-ore-crystal",
        draw_crystal_node(),
        TEX_NATURE,
        0.0,
        uuid_map,
    )
    save_asset("prop-minecart", draw_minecart(), TEX_PROPS, 0.0, uuid_map)
    save_asset("prop-ladder", draw_ladder(), TEX_PROPS, 0.0, uuid_map)
    save_asset("bld-mine-mouth", draw_mine_mouth(), TEX_BUILDINGS, 0.0, uuid_map)
    UUID_MAP.write_text(json.dumps(uuid_map, indent=2) + "\n", encoding="utf-8")
    print("Updated uuid-map.json")


if __name__ == "__main__":
    main()
