#!/usr/bin/env python3
"""Generate pixel-art textures + Cocos Creator 3.8 prefabs for Lumewisp Vale world props."""


import json
import random
import string
import uuid
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[2]
CATALOG = Path(__file__).resolve().parent / "catalog.json"
TOKENS = Path(__file__).resolve().parent / "tokens.json"

# Cocos sprite-frame / texture sub-meta suffixes
TEX_SUFFIX = "6c48a"
SF_SUFFIX = "f9941"


def uid() :
    return str(uuid.uuid4())


def file_id(n: int = 22) :
    alphabet = string.ascii_letters + string.digits + "+/"
    return "".join(random.choice(alphabet) for _ in range(n))


def hex_to_rgb(h):
    h = h.lstrip("#")
    return int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)


def load_tokens():
    return json.loads(TOKENS.read_text(encoding="utf-8"))


def write_image_meta(png_path, image_uuid, w, h, name):
    """Pixel-art friendly nearest-neighbor sprite-frame meta."""
    hw, hh = w / 2, h / 2
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
                    "imageUuidOrDatabaseUri": f"{image_uuid}@{TEX_SUFFIX}",
                    "atlasUuid": "",
                    "trimType": "auto",
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
    png_path.with_suffix(".png.meta").write_text(
        json.dumps(meta, indent=2) + "\n", encoding="utf-8"
    )


def write_prefab_meta(prefab_path, prefab_uuid):
    meta = {
        "ver": "1.1.50",
        "importer": "prefab",
        "imported": True,
        "uuid": prefab_uuid,
        "files": [],
        "subMetas": {},
        "userData": {"syncNodeName": True},
    }
    prefab_path.with_suffix(".prefab.meta").write_text(
        json.dumps(meta, indent=2) + "\n", encoding="utf-8"
    )


def write_sprite_prefab(
    prefab_path,
    name,
    sprite_uuid,
    w,
    h,
    layer=1,
    anchor_y=0.0,
):
    """Create a single-node Sprite prefab. Returns prefab uuid."""
    prefab_uuid = uid()
    root_fid = file_id()
    uit_fid = file_id()
    spr_fid = file_id()
    sf = f"{sprite_uuid}@{SF_SUFFIX}"

    prefab = [
        {
            "__type__": "cc.Prefab",
            "_name": name,
            "_objFlags": 0,
            "__editorExtras__": {},
            "_native": "",
            "data": {"__id__": 1},
            "optimizationPolicy": 0,
            "persistent": False,
        },
        {
            "__type__": "cc.Node",
            "_name": name,
            "_objFlags": 0,
            "__editorExtras__": {},
            "_parent": None,
            "_children": [],
            "_active": True,
            "_components": [{"__id__": 2}, {"__id__": 3}],
            "_prefab": {"__id__": 4},
            "_lpos": {"__type__": "cc.Vec3", "x": 0, "y": 0, "z": 0},
            "_lrot": {"__type__": "cc.Quat", "x": 0, "y": 0, "z": 0, "w": 1},
            "_lscale": {"__type__": "cc.Vec3", "x": 1, "y": 1, "z": 1},
            "_mobility": 0,
            "_layer": layer,
            "_euler": {"__type__": "cc.Vec3", "x": 0, "y": 0, "z": 0},
            "_id": "",
        },
        {
            "__type__": "cc.UITransform",
            "_name": "",
            "_objFlags": 0,
            "__editorExtras__": {},
            "node": {"__id__": 1},
            "_enabled": True,
            "__prefab": {"__id__": 5},
            "_contentSize": {"__type__": "cc.Size", "width": w, "height": h},
            "_anchorPoint": {"__type__": "cc.Vec2", "x": 0.5, "y": anchor_y},
            "_id": "",
        },
        {
            "__type__": "cc.Sprite",
            "_name": "",
            "_objFlags": 0,
            "__editorExtras__": {},
            "node": {"__id__": 1},
            "_enabled": True,
            "__prefab": {"__id__": 6},
            "_customMaterial": None,
            "_srcBlendFactor": 2,
            "_dstBlendFactor": 4,
            "_color": {"__type__": "cc.Color", "r": 255, "g": 255, "b": 255, "a": 255},
            "_spriteFrame": {
                "__uuid__": sf,
                "__expectedType__": "cc.SpriteFrame",
            },
            "_type": 0,
            "_fillType": 0,
            "_sizeMode": 0,
            "_fillCenter": {"__type__": "cc.Vec2", "x": 0, "y": 0},
            "_fillStart": 0,
            "_fillRange": 0,
            "_isTrimmedMode": True,
            "_useGrayscale": False,
            "_atlas": None,
            "_id": "",
        },
        {
            "__type__": "cc.PrefabInfo",
            "root": {"__id__": 1},
            "asset": {"__id__": 0},
            "fileId": root_fid,
            "instance": None,
            "targetOverrides": None,
            "nestedPrefabInstanceRoots": None,
        },
        {"__type__": "cc.CompPrefabInfo", "fileId": uit_fid},
        {"__type__": "cc.CompPrefabInfo", "fileId": spr_fid},
    ]

    prefab_path.parent.mkdir(parents=True, exist_ok=True)
    prefab_path.write_text(json.dumps(prefab, indent=2) + "\n", encoding="utf-8")
    write_prefab_meta(prefab_path, prefab_uuid)
    return prefab_uuid


# ---------- drawers ----------

def dither_rect(img: Image.Image, box, c1, c2, step=4):
    d = ImageDraw.Draw(img)
    x0, y0, x1, y1 = box
    d.rectangle(box, fill=c1)
    for y in range(y0, y1, step):
        for x in range(x0 + (y // step % 2) * (step // 2), x1, step):
            img.putpixel((min(x, x1 - 1), min(y, y1 - 1)), c2 + (255,))


def draw_tile_grass(w, h, t):
    """Prefer tools/ui/draw_ground_enrich.py for production grass variants."""
    img = Image.new("RGBA", (w, h), (*hex_to_rgb(t["world"]["grass"]), 255))
    d = ImageDraw.Draw(img)
    dark = hex_to_rgb(t["world"]["grassDark"])
    light = (90, 160, 90)
    mid = (70, 140, 70)
    for _ in range(40):
        x, y = random.randint(1, w - 2), random.randint(2, h - 2)
        col = random.choice([dark, light, mid])
        d.point((x, y), fill=col + (255,))
        if random.random() < 0.5:
            d.point((x, y - 1), fill=light + (255,))
    for _ in range(4):
        x, y = random.randint(3, w - 4), random.randint(3, h - 4)
        d.point((x, y), fill=(210, 170, 90, 255) if random.random() < 0.5 else (200, 120, 150, 255))
    return img


def draw_tile_dirt(w, h, t):
    """Prefer tools/ui/draw_ground_enrich.py for production dirt variants."""
    base = hex_to_rgb(t["world"]["dirt"])
    img = Image.new("RGBA", (w, h), base + (255,))
    d = ImageDraw.Draw(img)
    dark = (120, 80, 45)
    light = (196, 152, 98)
    pebble = (180, 170, 150)
    for _ in range(50):
        x, y = random.randint(0, w - 1), random.randint(0, h - 1)
        d.point((x, y), fill=dark + (255,))
    for _ in range(12):
        x, y = random.randint(1, w - 2), random.randint(1, h - 2)
        d.point((x, y), fill=pebble + (255,))
    for _ in range(3):
        x0, y0 = random.randint(4, w - 8), random.randint(4, h - 8)
        d.line(
            [(x0, y0), (x0 + random.randint(-10, 10), y0 + random.randint(-6, 8))],
            fill=dark + (200,),
        )
    for _ in range(8):
        d.point((random.randint(0, w - 1), random.randint(0, h - 1)), fill=light + (255,))
    return img


def draw_tile_stone(w, h, t):
    base = hex_to_rgb(t["world"]["stone"])
    img = Image.new("RGBA", (w, h), base + (255,))
    d = ImageDraw.Draw(img)
    mortar = (50, 52, 58)
    # cobble grid
    for y in range(0, h, 16):
        d.line([(0, y), (w, y)], fill=mortar + (255,))
    for x in range(0, w, 16):
        offset = 8 if (x // 16) % 2 else 0
        for y in range(offset, h, 16):
            d.line([(x, y), (x, min(y + 16, h))], fill=mortar + (255,))
    for _ in range(12):
        x, y = random.randint(1, w - 2), random.randint(1, h - 2)
        d.point((x, y), fill=(90, 94, 100, 255))
    return img


def draw_tile_water(w, h, t):
    base = hex_to_rgb(t["world"]["water"])
    edge = hex_to_rgb(t["world"]["waterEdge"])
    img = Image.new("RGBA", (w, h), base + (255,))
    d = ImageDraw.Draw(img)
    for i in range(3):
        y = 12 + i * 16
        d.arc([8, y, w - 8, y + 10], 0, 180, fill=edge + (180,))
    return img


def draw_tile_cliff(w, h, t):
    base = hex_to_rgb(t["world"]["cliff"])
    img = Image.new("RGBA", (w, h), base + (255,))
    d = ImageDraw.Draw(img)
    dark = (70, 50, 30)
    light = (150, 120, 80)
    for y in range(0, h, 8):
        d.line([(0, y), (w, y)], fill=dark + (200,))
    for x in range(4, w, 12):
        d.line([(x, 0), (x - 2, h)], fill=light + (80,))
    d.rectangle([0, 0, w - 1, 3], fill=hex_to_rgb(t["world"]["grass"]) + (255,))
    return img


def draw_cottage(w, h, t, wall_hex: str, roof_hex: str):
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    wall = hex_to_rgb(wall_hex)
    roof = hex_to_rgb(roof_hex)
    wood = hex_to_rgb(t["world"]["wood"])
    glow = hex_to_rgb(t["world"]["windowGlow"])
    # body
    body = [24, h // 2 - 10, w - 24, h - 16]
    d.rectangle(body, fill=wall + (255,), outline=(20, 20, 24, 255))
    # roof triangle
    peak = (w // 2, 8)
    d.polygon([peak, (12, h // 2 - 8), (w - 12, h // 2 - 8)], fill=roof + (255,), outline=(20, 20, 24, 255))
    # door
    dw, dh = 28, 48
    dx = w // 2 - dw // 2
    dy = h - 16 - dh
    d.rectangle([dx, dy, dx + dw, dy + dh], fill=wood + (255,), outline=(20, 20, 24, 255))
    # windows with glow
    for wx in (40, w - 64):
        d.rectangle([wx, h // 2 + 10, wx + 28, h // 2 + 36], fill=glow + (255,), outline=(20, 20, 24, 255))
        d.line([wx + 14, h // 2 + 10, wx + 14, h // 2 + 36], fill=(20, 20, 24, 255))
        d.line([wx, h // 2 + 23, wx + 28, h // 2 + 23], fill=(20, 20, 24, 255))
    # chimney
    d.rectangle([w - 56, 28, w - 40, h // 2 - 10], fill=(70, 70, 75, 255), outline=(20, 20, 24, 255))
    return img


def draw_shop(w, h, t):
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    wall = hex_to_rgb(t["world"]["wallBlue"])
    roof = hex_to_rgb(t["world"]["roofBrown"])
    wood = hex_to_rgb(t["world"]["wood"])
    glow = hex_to_rgb(t["world"]["windowGlow"])
    d.rectangle([16, h // 3, w - 16, h - 12], fill=wall + (255,), outline=(20, 20, 24, 255))
    d.polygon([(16, h // 3), (w // 2, 10), (w - 16, h // 3)], fill=roof + (255,), outline=(20, 20, 24, 255))
    # awning
    d.rectangle([20, h // 3 + 4, w - 20, h // 3 + 28], fill=(180, 60, 60, 255), outline=(20, 20, 24, 255))
    # storefront windows
    for i, wx in enumerate((36, w // 2 - 30, w - 96)):
        d.rectangle([wx, h // 2 + 8, wx + 56, h - 40], fill=glow + (255,), outline=(20, 20, 24, 255))
    d.rectangle([w // 2 - 18, h - 60, w // 2 + 18, h - 12], fill=wood + (255,), outline=(20, 20, 24, 255))
    # signboard
    d.rectangle([w // 2 - 40, h // 3 + 32, w // 2 + 40, h // 3 + 56], fill=(240, 220, 160, 255), outline=(20, 20, 24, 255))
    return img


def draw_community(w, h, t):
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    wall = (180, 170, 150)
    roof = (90, 50, 50)
    d.rectangle([20, h // 3, w - 20, h - 12], fill=wall + (255,), outline=(20, 20, 24, 255))
    d.polygon([(20, h // 3), (w // 2, 6), (w - 20, h // 3)], fill=roof + (255,), outline=(20, 20, 24, 255))
    # clock
    cx, cy, r = w // 2, h // 2 - 10, 28
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(240, 230, 200, 255), outline=(20, 20, 24, 255))
    d.line([cx, cy, cx, cy - 16], fill=(20, 20, 24, 255), width=2)
    d.line([cx, cy, cx + 12, cy + 4], fill=(20, 20, 24, 255), width=2)
    # doors
    d.rectangle([w // 2 - 36, h - 70, w // 2 + 36, h - 12], fill=hex_to_rgb(t["world"]["wood"]) + (255,), outline=(20, 20, 24, 255))
    d.line([w // 2, h - 70, w // 2, h - 12], fill=(20, 20, 24, 255))
    # pillars
    for x in (40, w - 52):
        d.rectangle([x, h // 3 + 8, x + 16, h - 12], fill=(160, 150, 130, 255), outline=(20, 20, 24, 255))
    return img


def draw_shed(w, h, t):
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    wood = hex_to_rgb(t["world"]["wood"])
    dark = hex_to_rgb(t["world"]["woodDark"])
    d.rectangle([16, h // 3, w - 16, h - 8], fill=wood + (255,), outline=(20, 20, 24, 255))
    d.polygon([(16, h // 3), (w // 2, 10), (w - 16, h // 3)], fill=dark + (255,), outline=(20, 20, 24, 255))
    d.rectangle([w // 2 - 16, h - 48, w // 2 + 16, h - 8], fill=dark + (255,), outline=(20, 20, 24, 255))
    for y in range(h // 3 + 8, h - 12, 8):
        d.line([(20, y), (w - 20, y)], fill=dark + (120,))
    return img


def draw_tree(w, h, t, blossom=False):
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    trunk = hex_to_rgb(t["world"]["woodDark"])
    leaf = hex_to_rgb(t["world"]["blossom"] if blossom else t["world"]["leaf"])
    leaf_d = hex_to_rgb(t["world"]["blossom"] if blossom else t["world"]["leafDark"])
    if blossom:
        leaf_d = (160, 80, 150)
    # trunk
    d.rectangle([w // 2 - 10, h - 70, w // 2 + 10, h - 4], fill=trunk + (255,), outline=(20, 20, 24, 255))
    # canopy clusters
    clusters = [(w // 2, 50), (w // 2 - 28, 70), (w // 2 + 28, 70), (w // 2, 90)]
    for i, (cx, cy) in enumerate(clusters):
        col = leaf_d if i % 2 else leaf
        d.ellipse([cx - 34, cy - 28, cx + 34, cy + 28], fill=col + (255,), outline=(20, 20, 24, 180))
    return img


def draw_bush(w, h, t):
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    leaf = hex_to_rgb(t["world"]["leafDark"])
    light = hex_to_rgb(t["world"]["leaf"])
    d.ellipse([8, 16, w // 2 + 10, h - 4], fill=leaf + (255,), outline=(20, 20, 24, 200))
    d.ellipse([w // 2 - 10, 10, w - 8, h - 4], fill=light + (255,), outline=(20, 20, 24, 200))
    d.ellipse([w // 3, 20, 2 * w // 3 + 8, h - 2], fill=leaf + (255,))
    return img


def draw_fence(w, h, t):
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    wood = hex_to_rgb(t["world"]["wood"])
    # rails
    d.rectangle([4, 22, w - 4, 30], fill=wood + (255,), outline=(20, 20, 24, 255))
    d.rectangle([4, 40, w - 4, 48], fill=wood + (255,), outline=(20, 20, 24, 255))
    # posts
    for x in (8, w // 2 - 4, w - 16):
        d.rectangle([x, 12, x + 8, h - 8], fill=wood + (255,), outline=(20, 20, 24, 255))
        d.polygon([(x - 2, 12), (x + 4, 4), (x + 10, 12)], fill=wood + (255,))
    return img


def draw_lamp(w, h, t):
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    post = (30, 30, 34)
    glow = hex_to_rgb(t["world"]["lampGlow"])
    # glow cookie
    d.ellipse([4, h - 36, w - 4, h - 4], fill=glow + (70,))
    d.rectangle([w // 2 - 3, 36, w // 2 + 3, h - 20], fill=post + (255,))
    d.rectangle([w // 2 - 14, 16, w // 2 + 14, 44], fill=(40, 40, 46, 255), outline=(20, 20, 24, 255))
    d.ellipse([w // 2 - 10, 20, w // 2 + 10, 40], fill=glow + (255,))
    d.rectangle([w // 2 - 16, 12, w // 2 + 16, 18], fill=post + (255,))
    return img


def draw_bench(w, h, t):
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    wood = hex_to_rgb(t["world"]["wood"])
    dark = hex_to_rgb(t["world"]["woodDark"])
    d.rectangle([8, 8, w - 8, 20], fill=wood + (255,), outline=(20, 20, 24, 255))
    d.rectangle([8, 22, w - 8, 30], fill=wood + (255,), outline=(20, 20, 24, 255))
    d.rectangle([12, 30, 20, h - 4], fill=dark + (255,))
    d.rectangle([w - 20, 30, w - 12, h - 4], fill=dark + (255,))
    return img


def draw_fountain(w, h, t):
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    stone = hex_to_rgb(t["world"]["stone"])
    water = hex_to_rgb(t["world"]["waterEdge"])
    d.ellipse([8, 24, w - 8, h - 8], fill=stone + (255,), outline=(20, 20, 24, 255))
    d.ellipse([20, 36, w - 20, h - 20], fill=water + (220,))
    d.rectangle([w // 2 - 8, 16, w // 2 + 8, h // 2 + 10], fill=stone + (255,), outline=(20, 20, 24, 255))
    d.ellipse([w // 2 - 18, 8, w // 2 + 18, 36], fill=stone + (255,), outline=(20, 20, 24, 255))
    d.ellipse([w // 2 - 10, 14, w // 2 + 10, 30], fill=water + (255,))
    return img


def draw_bridge(w, h, t):
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    stone = hex_to_rgb(t["world"]["stone"])
    dark = (70, 72, 78)
    d.polygon([(10, h - 20), (30, 16), (w - 30, 16), (w - 10, h - 20)], fill=stone + (255,), outline=(20, 20, 24, 255))
    for x in range(36, w - 36, 12):
        d.line([(x, 20), (x, h - 28)], fill=dark + (180,))
    d.rectangle([20, 12, w - 20, 22], fill=dark + (255,))
    d.rectangle([20, h - 28, w - 20, h - 18], fill=dark + (255,))
    return img


def draw_sign(w, h, t):
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    wood = hex_to_rgb(t["world"]["wood"])
    dark = hex_to_rgb(t["world"]["woodDark"])
    d.rectangle([w // 2 - 3, 28, w // 2 + 3, h - 4], fill=dark + (255,))
    d.rectangle([8, 8, w - 8, 40], fill=wood + (255,), outline=(20, 20, 24, 255))
    d.line([14, 18, w - 14, 18], fill=dark + (200,))
    d.line([14, 26, w - 20, 26], fill=dark + (200,))
    return img


def draw_meteor(w, h, t):
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    rock = hex_to_rgb(t["world"]["meteor"])
    crystal = hex_to_rgb(t["world"]["crystal"])
    # rock body
    d.ellipse([24, 40, w - 24, h - 16], fill=rock + (255,), outline=(20, 20, 24, 255))
    for _ in range(20):
        x, y = random.randint(40, w - 40), random.randint(60, h - 40)
        d.ellipse([x, y, x + 8, y + 6], fill=(70, 70, 78, 255))
    # crystals
    spikes = [
        [(w // 2, 8), (w // 2 - 18, 70), (w // 2 + 18, 70)],
        [(40, 50), (20, 110), (55, 100)],
        [(w - 40, 46), (w - 20, 110), (w - 55, 96)],
        [(w // 2 + 30, 30), (w // 2 + 10, 90), (w // 2 + 50, 90)],
    ]
    for poly in spikes:
        d.polygon(poly, fill=crystal + (255,), outline=(80, 30, 100, 255))
        # highlight
        d.line([poly[0], ((poly[1][0] + poly[2][0]) // 2, (poly[1][1] + poly[2][1]) // 2)], fill=(240, 180, 255, 200))
    return img


DRAWERS = {
    "tile-grass": draw_tile_grass,
    "tile-dirt": draw_tile_dirt,
    "tile-stone": draw_tile_stone,
    "tile-water": draw_tile_water,
    "tile-cliff": draw_tile_cliff,
    "bld-cottage-blue": lambda w, h, t: draw_cottage(w, h, t, t["world"]["wallBlue"], t["world"]["roofPurple"]),
    "bld-cottage-red": lambda w, h, t: draw_cottage(w, h, t, t["world"]["wallRed"], t["world"]["roofBrown"]),
    "bld-shop": draw_shop,
    "bld-community": draw_community,
    "bld-shed": draw_shed,
    "nat-tree-oak": lambda w, h, t: draw_tree(w, h, t, blossom=False),
    "nat-tree-blossom": lambda w, h, t: draw_tree(w, h, t, blossom=True),
    "nat-bush": draw_bush,
    "prop-fence": draw_fence,
    "prop-lamp": draw_lamp,
    "prop-bench": draw_bench,
    "prop-fountain": draw_fountain,
    "prop-bridge": draw_bridge,
    "prop-sign": draw_sign,
    "spc-meteor": draw_meteor,
}

# Ground tiles: center anchor; world props: bottom center
TILE_PREFIXES = ("tile-",)


def anchor_for(item_id):
    return 0.5 if item_id.startswith(TILE_PREFIXES) else 0.0


def main():
    random.seed(42)
    tokens = load_tokens()
    catalog = json.loads(CATALOG.read_text(encoding="utf-8"))
    uuid_map = {}

    for item in catalog["items"]:
        item_id = item["id"]
        w, h = item["designSize"]
        png_rel = item["path"]
        prefab_rel = item["prefab"]
        png_path = ROOT / png_rel
        prefab_path = ROOT / prefab_rel
        png_path.parent.mkdir(parents=True, exist_ok=True)

        drawer = DRAWERS.get(item_id)
        if not drawer:
            print(f"skip (no drawer): {item_id}")
            continue

        img = drawer(w, h, tokens)
        # pixel-art feel: ensure no accidental smoothing
        img = img.resize((w, h), Image.NEAREST)
        img.save(png_path)

        image_uuid = uid()
        write_image_meta(png_path, image_uuid, w, h, item_id)
        prefab_uuid = write_sprite_prefab(
            prefab_path,
            item_id,
            image_uuid,
            w,
            h,
            layer=1,
            anchor_y=anchor_for(item_id),
        )
        uuid_map[item_id] = {"texture": image_uuid, "prefab": prefab_uuid, "spriteFrame": f"{image_uuid}@{SF_SUFFIX}"}
        print(f"OK {item_id}  {w}x{h}")

    out = Path(__file__).resolve().parent / "uuid-map.json"
    out.write_text(json.dumps(uuid_map, indent=2) + "\n", encoding="utf-8")
    print(f"\nWrote {len(uuid_map)} assets. Map: {out}")


if __name__ == "__main__":
    main()
