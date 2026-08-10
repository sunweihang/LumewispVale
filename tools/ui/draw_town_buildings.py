#!/usr/bin/env python3
"""Draw / derive town institution buildings and register them in uuid-map + catalog.

Commercial facades are derived from bld-shop (same art style) with recolored
awnings + painted sign icons. Civic / homes use cottage / community bases.
"""

from __future__ import print_function

import json
import uuid
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[2]
BLD = ROOT / "assets/textures/buildings"
UUID_MAP = Path(__file__).resolve().parent / "uuid-map.json"
CATALOG = Path(__file__).resolve().parent / "catalog.json"
TEX_SUFFIX = "6c48a"
SF_SUFFIX = "f9941"


def uid():
    return str(uuid.uuid4())


def write_meta(png_path, image_uuid, w, h, name, pivot_y=0.0):
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
                    "trimType": "custom",
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
                },
                "ver": "1.0.22",
                "imported": True,
                "files": [".json"],
                "subMetas": {},
            },
        },
        "userData": {"type": "sprite-frame", "hasAlpha": True},
    }
    png_path.with_suffix(".png.meta").write_text(
        json.dumps(meta, indent=2) + "\n", encoding="utf-8"
    )


def shift_rgb(px, dr, dg, db, strength=0.55):
    r, g, b, a = px
    if a < 8:
        return px
    return (
        max(0, min(255, int(r + dr * strength))),
        max(0, min(255, int(g + dg * strength))),
        max(0, min(255, int(b + db * strength))),
        a,
    )


def recolor_awning(img, target_rgb):
    """Recolor green-ish awning stripes toward target (keeps white stripes)."""
    px = img.load()
    w, h = img.size
    tr, tg, tb = target_rgb
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a < 10:
                continue
            # green awning family
            if g > r + 15 and g > b + 10 and 40 < g < 200:
                # preserve lightness
                lum = (r + g + b) / 3.0 / 255.0
                px[x, y] = (
                    int(tr * lum + tr * 0.35),
                    int(tg * lum + tg * 0.35),
                    int(tb * lum + tb * 0.35),
                    a,
                )
    return img


def paint_sign_icon(img, kind):
    """Paint a small icon on the blank wood signboard (upper-center of shop)."""
    d = ImageDraw.Draw(img)
    w, h = img.size
    # Approximate signboard center on bld-shop
    cx, cy = w // 2, int(h * 0.38)
    ink = (40, 28, 18, 255)
    accent = (220, 70, 60, 255)
    if kind == "seed":
        # sprout
        d.ellipse([cx - 10, cy - 2, cx + 10, cy + 12], fill=(60, 140, 60, 255), outline=ink)
        d.rectangle([cx - 2, cy + 6, cx + 2, cy + 16], fill=(90, 60, 30, 255))
        d.ellipse([cx - 14, cy - 10, cx - 2, cy + 2], fill=(70, 160, 70, 255), outline=ink)
        d.ellipse([cx + 2, cy - 10, cx + 14, cy + 2], fill=(70, 160, 70, 255), outline=ink)
    elif kind == "ore":
        # crystal / ore chunk
        d.polygon(
            [(cx, cy - 14), (cx + 12, cy - 2), (cx + 6, cy + 12), (cx - 6, cy + 12), (cx - 12, cy - 2)],
            fill=(120, 140, 170, 255),
            outline=ink,
        )
        d.polygon([(cx, cy - 10), (cx + 6, cy), (cx, cy + 6), (cx - 4, cy)], fill=(180, 200, 230, 255))
    elif kind == "general":
        # basket
        d.ellipse([cx - 12, cy - 4, cx + 12, cy + 14], fill=(180, 120, 60, 255), outline=ink)
        d.arc([cx - 10, cy - 14, cx + 10, cy + 2], 200, 340, fill=ink)
    elif kind == "police":
        # star badge
        d.ellipse([cx - 12, cy - 12, cx + 12, cy + 12], fill=(70, 100, 180, 255), outline=ink)
        d.polygon(
            [
                (cx, cy - 10),
                (cx + 3, cy - 2),
                (cx + 11, cy - 2),
                (cx + 5, cy + 3),
                (cx + 7, cy + 11),
                (cx, cy + 6),
                (cx - 7, cy + 11),
                (cx - 5, cy + 3),
                (cx - 11, cy - 2),
                (cx - 3, cy - 2),
            ],
            fill=(240, 220, 80, 255),
            outline=ink,
        )
    elif kind == "post":
        # envelope
        d.rectangle([cx - 14, cy - 8, cx + 14, cy + 10], fill=(245, 240, 220, 255), outline=ink)
        d.polygon([(cx - 14, cy - 8), (cx, cy + 2), (cx + 14, cy - 8)], outline=ink)
    elif kind == "clinic":
        # red cross
        d.rectangle([cx - 12, cy - 12, cx + 12, cy + 12], fill=(245, 245, 245, 255), outline=ink)
        d.rectangle([cx - 3, cy - 10, cx + 3, cy + 10], fill=accent)
        d.rectangle([cx - 10, cy - 3, cx + 10, cy + 3], fill=accent)
    elif kind == "saloon":
        # mug
        d.rectangle([cx - 8, cy - 6, cx + 6, cy + 12], fill=(200, 160, 80, 255), outline=ink)
        d.arc([cx + 4, cy - 2, cx + 14, cy + 10], 270, 90, fill=ink)
        d.ellipse([cx - 8, cy - 10, cx + 6, cy - 2], fill=(240, 220, 140, 255), outline=ink)
    elif kind == "fish":
        d.ellipse([cx - 12, cy - 6, cx + 8, cy + 8], fill=(80, 140, 200, 255), outline=ink)
        d.polygon([(cx + 8, cy), (cx + 16, cy - 8), (cx + 16, cy + 8)], fill=(60, 110, 170, 255), outline=ink)
        d.point((cx - 6, cy - 1), fill=ink)
    elif kind == "library":
        d.rectangle([cx - 12, cy - 10, cx + 12, cy + 12], fill=(140, 90, 50, 255), outline=ink)
        for i in range(-8, 10, 5):
            d.line([(cx + i, cy - 8), (cx + i, cy + 10)], fill=(220, 200, 160, 255))
    elif kind == "museum":
        d.polygon([(cx - 14, cy + 10), (cx, cy - 12), (cx + 14, cy + 10)], fill=(200, 190, 160, 255), outline=ink)
        d.rectangle([cx - 10, cy + 2, cx + 10, cy + 12], fill=(170, 160, 130, 255), outline=ink)
    elif kind == "carpenter":
        # hammer
        d.rectangle([cx - 2, cy - 4, cx + 2, cy + 14], fill=(120, 80, 40, 255), outline=ink)
        d.rectangle([cx - 12, cy - 10, cx + 12, cy - 2], fill=(90, 90, 95, 255), outline=ink)
    return img


def tint_walls(img, dr, dg, db):
    px = img.load()
    w, h = img.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a < 10:
                continue
            # plaster / cream walls (not roof browns, not green awning, not stone)
            if r > 140 and g > 120 and b > 90 and abs(r - g) < 50 and r > b:
                px[x, y] = shift_rgb((r, g, b, a), dr, dg, db, 0.4)
    return img


def derive_shop(base, out_name, awning_rgb, sign_kind, wall_shift=(0, 0, 0)):
    img = base.copy()
    if wall_shift != (0, 0, 0):
        tint_walls(img, *wall_shift)
    recolor_awning(img, awning_rgb)
    paint_sign_icon(img, sign_kind)
    path = BLD / (out_name + ".png")
    img.save(path)
    return path, img.size


def draw_school(w=256, h=240):
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    ink = (20, 20, 24, 255)
    # body
    d.rectangle([20, 90, w - 20, h - 12], fill=(210, 195, 165, 255), outline=ink)
    # roof
    d.polygon([(16, 96), (w // 2, 28), (w - 16, 96)], fill=(70, 55, 90, 255), outline=ink)
    # bell tower
    d.rectangle([w // 2 - 18, 20, w // 2 + 18, 100], fill=(190, 175, 145, 255), outline=ink)
    d.polygon(
        [(w // 2 - 22, 28), (w // 2, 6), (w // 2 + 22, 28)],
        fill=(60, 45, 80, 255),
        outline=ink,
    )
    d.ellipse([w // 2 - 8, 40, w // 2 + 8, 56], fill=(240, 210, 80, 255), outline=ink)
    # door + windows
    d.rectangle([w // 2 - 20, h - 70, w // 2 + 20, h - 12], fill=(90, 55, 30, 255), outline=ink)
    glow = (248, 224, 144, 255)
    for wx in (40, w - 72):
        d.rectangle([wx, 120, wx + 36, 160], fill=glow, outline=ink)
    # sign
    d.rectangle([w // 2 - 36, 100, w // 2 + 36, 122], fill=(240, 220, 160, 255), outline=ink)
    d.ellipse([w // 2 - 6, 104, w // 2 + 6, 118], fill=(80, 60, 40, 255))  # bell glyph
    return img


def draw_mayor(w=288, h=256):
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    ink = (20, 20, 24, 255)
    # stone base
    d.rectangle([18, h - 40, w - 18, h - 10], fill=(110, 115, 120, 255), outline=ink)
    # body
    d.rectangle([24, 100, w - 24, h - 36], fill=(170, 150, 130, 255), outline=ink)
    # double roof
    d.polygon([(20, 108), (w // 2, 18), (w - 20, 108)], fill=(90, 40, 45, 255), outline=ink)
    d.rectangle([w // 2 - 30, 50, w // 2 + 30, 108], fill=(155, 135, 115, 255), outline=ink)
    d.polygon(
        [(w // 2 - 34, 58), (w // 2, 30), (w // 2 + 34, 58)],
        fill=(100, 45, 50, 255),
        outline=ink,
    )
    glow = (248, 224, 144, 255)
    for wx in (48, w // 2 - 18, w - 84):
        d.rectangle([wx, 130, wx + 36, 168], fill=glow, outline=ink)
    d.rectangle([w // 2 - 22, h - 90, w // 2 + 22, h - 36], fill=(80, 50, 30, 255), outline=ink)
    # crest
    d.ellipse([w // 2 - 12, 112, w // 2 + 12, 136], fill=(220, 180, 60, 255), outline=ink)
    return img


def draw_clinic_wide(w=256, h=224):
    """White clinic — drawn fresh so it reads clearly as hospital."""
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    ink = (20, 20, 24, 255)
    d.rectangle([16, 80, w - 16, h - 12], fill=(235, 235, 230, 255), outline=ink)
    d.polygon([(12, 88), (w // 2, 20), (w - 12, 88)], fill=(90, 100, 120, 255), outline=ink)
    # red cross plaque
    d.rectangle([w // 2 - 28, 92, w // 2 + 28, 124], fill=(250, 250, 250, 255), outline=ink)
    d.rectangle([w // 2 - 5, 96, w // 2 + 5, 120], fill=(210, 50, 50, 255))
    d.rectangle([w // 2 - 16, 104, w // 2 + 16, 112], fill=(210, 50, 50, 255))
    glow = (248, 224, 144, 255)
    for wx in (36, w - 84):
        d.rectangle([wx, 130, wx + 48, 180], fill=glow, outline=ink)
    d.rectangle([w // 2 - 18, h - 64, w // 2 + 18, h - 12], fill=(100, 140, 160, 255), outline=ink)
    # white awning
    d.rectangle([20, 88, w - 20, 108], fill=(230, 80, 80, 255), outline=ink)
    for x in range(24, w - 24, 16):
        d.rectangle([x, 88, x + 8, 108], fill=(250, 250, 250, 255))
    return img


def cottage_variant(base, out_name, wall_shift):
    img = base.copy()
    tint_walls(img, *wall_shift)
    path = BLD / (out_name + ".png")
    img.save(path)
    return path, img.size


BUILDINGS = [
    # id, size hint used in bake, how made
]


def main():
    shop = Image.open(BLD / "bld-shop.png").convert("RGBA")
    cottage = Image.open(BLD / "bld-cottage-blue.png").convert("RGBA")
    cottage_r = Image.open(BLD / "bld-cottage-red.png").convert("RGBA")

    specs = []

    # Commercial / civic from shop base
    derives = [
        ("bld-seedshop", (40, 140, 70), "seed", (10, 20, 0)),
        ("bld-oreshop", (90, 90, 100), "ore", (-20, -20, -10)),
        ("bld-general", (180, 70, 60), "general", (0, 0, 0)),  # keep close to shop
        ("bld-police", (50, 80, 160), "police", (-10, 0, 30)),
        ("bld-post", (190, 60, 60), "post", (20, -5, -5)),
        ("bld-saloon", (160, 90, 40), "saloon", (15, 5, -10)),
        ("bld-fishshop", (40, 100, 160), "fish", (-5, 10, 25)),
        ("bld-library", (120, 80, 50), "library", (10, 5, -5)),
        ("bld-museum", (140, 130, 90), "museum", (5, 5, 0)),
        ("bld-carpenter", (130, 90, 50), "carpenter", (5, 0, -10)),
    ]
    for name, awn, icon, wall in derives:
        path, (w, h) = derive_shop(shop, name, awn, icon, wall)
        specs.append((name, w, h, path))

    # Clinic drawn fresh
    clinic = draw_clinic_wide()
    path = BLD / "bld-clinic.png"
    clinic.save(path)
    specs.append(("bld-clinic", clinic.size[0], clinic.size[1], path))

    school = draw_school()
    path = BLD / "bld-school.png"
    school.save(path)
    specs.append(("bld-school", school.size[0], school.size[1], path))

    mayor = draw_mayor()
    path = BLD / "bld-mayor.png"
    mayor.save(path)
    specs.append(("bld-mayor", mayor.size[0], mayor.size[1], path))

    # NPC homes
    for name, src, shift in [
        ("bld-home-green", cottage, (-30, 40, -20)),
        ("bld-home-yellow", cottage, (40, 30, -30)),
        ("bld-home-purple", cottage_r, (20, -10, 40)),
    ]:
        path, (w, h) = cottage_variant(src, name, shift)
        specs.append((name, w, h, path))

    # uuid-map + metas
    umap = json.loads(UUID_MAP.read_text(encoding="utf-8"))
    catalog = json.loads(CATALOG.read_text(encoding="utf-8"))
    existing_ids = {it["id"] for it in catalog.get("items", [])}

    for name, w, h, path in specs:
        # keep uuid if meta exists
        meta_path = path.with_suffix(".png.meta")
        if meta_path.exists():
            try:
                image_uuid = json.loads(meta_path.read_text(encoding="utf-8"))["uuid"]
            except Exception:
                image_uuid = uid()
        else:
            image_uuid = uid()
        write_meta(path, image_uuid, w, h, name, pivot_y=0.0)
        sf = "{}@{}".format(image_uuid, SF_SUFFIX)
        umap[name] = {
            "texture": image_uuid,
            "spriteFrame": sf,
            "prefab": umap.get(name, {}).get("prefab", ""),
        }
        if name not in existing_ids:
            catalog["items"].append(
                {
                    "id": name,
                    "kind": "building",
                    "spriteType": "simple",
                    "designSize": [w, h],
                    "path": "assets/textures/buildings/{}.png".format(name),
                    "prefab": "",
                    "layer": "Midground",
                }
            )
            existing_ids.add(name)
        print("wrote", name, w, h)

    UUID_MAP.write_text(json.dumps(umap, indent=2) + "\n", encoding="utf-8")
    CATALOG.write_text(json.dumps(catalog, indent=2) + "\n", encoding="utf-8")
    print("registered", len(specs), "town buildings")


if __name__ == "__main__":
    main()
