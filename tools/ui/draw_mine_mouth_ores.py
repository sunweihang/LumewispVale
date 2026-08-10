#!/usr/bin/env python3
"""Mine mouth (open timber arch) + diggable ore rocks based on nat-rock art.

Ores are nat-rock / nat-rock-big with vein tint — not abstract blobs.

    py -3.10 tools/ui/draw_mine_mouth_ores.py
"""

from __future__ import annotations

import json
import uuid
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
UUID_MAP = Path(__file__).resolve().parent / "uuid-map.json"
NATURE = ROOT / "assets/textures/nature"
BUILDINGS = ROOT / "assets/textures/buildings"
TEX_SUFFIX = "6c48a"
SF_SUFFIX = "f9941"

WOOD = (120, 78, 42)
WOOD_DK = (78, 48, 26)
WOOD_HI = (158, 110, 64)
WOOD_EDGE = (48, 30, 16)
TUNNEL = (18, 14, 28)
TUNNEL_MID = (28, 22, 40)
RAIL = (90, 70, 48)
RAIL_DK = (55, 40, 28)
TORCH = (255, 170, 60)
TORCH_CORE = (255, 230, 120)
ROCK = (70, 66, 82)
ROCK_DK = (42, 38, 52)
ROCK_EDGE = (28, 24, 36)

COPPER = (210, 120, 55)
COPPER_HI = (240, 170, 90)
COPPER_DK = (150, 70, 30)
IRON = (175, 195, 215)
IRON_HI = (230, 240, 250)
IRON_DK = (110, 130, 150)
CRYSTAL = (180, 130, 230)
CRYSTAL_HI = (230, 200, 255)
CRYSTAL_DK = (120, 70, 170)


def uid() -> str:
    return str(uuid.uuid4())


def write_meta(png: Path, image_uuid: str, w: int, h: int, name: str, pivot_y: float = 0.0):
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
                    "packable": True,
                    "pixelsToUnit": 100,
                    "pivotX": 0.5,
                    "pivotY": pivot_y,
                    "meshType": 0,
                    "borderTop": 0,
                    "borderBottom": 0,
                    "borderLeft": 0,
                    "borderRight": 0,
                    "vertices": {
                        "rawPosition": [-hw, -hh, 0, hw, -hh, 0, -hw, hh, 0, hw, hh, 0],
                        "indexes": [0, 1, 2, 1, 3, 2],
                        "uv": [0, 1, 1, 1, 0, 0, 1, 0],
                        "nuv": [0, 0, 1, 0, 0, 1, 1, 1],
                        "minPos": [-hw, -hh, 0],
                        "maxPos": [hw, hh, 0],
                    },
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
    png.with_suffix(".png.meta").write_text(json.dumps(meta, indent=2) + "\n", encoding="utf-8")


def save(path: Path, img: Image.Image, uuid_map: dict, item_id: str, pivot_y: float = 0.0) -> None:
    prev = uuid_map.get(item_id, {})
    image_uuid = prev.get("texture") if isinstance(prev, dict) else None
    if not image_uuid and path.with_suffix(".png.meta").exists():
        try:
            image_uuid = json.loads(path.with_suffix(".png.meta").read_text(encoding="utf-8"))["uuid"]
        except Exception:
            image_uuid = None
    image_uuid = image_uuid or uid()
    img.save(path)
    write_meta(path, image_uuid, img.size[0], img.size[1], item_id, pivot_y)
    sf = f"{image_uuid}@{SF_SUFFIX}"
    uuid_map[item_id] = {
        "texture": image_uuid,
        "prefab": prev.get("prefab", "") if isinstance(prev, dict) else "",
        "spriteFrame": sf,
    }
    print("OK", item_id, f"{img.size[0]}x{img.size[1]}")


def rect(px, x0, y0, x1, y1, c):
    for y in range(y0, y1):
        for x in range(x0, x1):
            px[x, y] = c + (255,)


def hline(px, x0, x1, y, c):
    for x in range(x0, x1):
        px[x, y] = c + (255,)


def vline(px, x, y0, y1, c):
    for y in range(y0, y1):
        px[x, y] = c + (255,)


def draw_mouth(w: int = 288, h: int = 224) -> Image.Image:
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    px = img.load()
    left = 78
    right = w - 78
    post_w = 14
    beam_y0 = 48
    beam_h = 16
    open_l = left + post_w
    open_r = right - post_w
    open_t = beam_y0 + beam_h
    open_b = h - 36

    for y in range(open_t, open_b):
        for x in range(open_l, open_r):
            t = (y - open_t) / max(1, open_b - open_t)
            c = TUNNEL if t < 0.55 else TUNNEL_MID
            if (x + y) % 7 == 0:
                c = ROCK_DK
            px[x, y] = c + (255,)

    for x0 in (left, right - post_w):
        rect(px, x0, beam_y0, x0 + post_w, open_b + 4, WOOD)
        vline(px, x0, beam_y0, open_b + 4, WOOD_EDGE)
        vline(px, x0 + post_w - 1, beam_y0, open_b + 4, WOOD_DK)
        for y in range(beam_y0 + 8, open_b, 10):
            hline(px, x0 + 2, x0 + post_w - 2, y, WOOD_DK)

    rect(px, left - 4, beam_y0, right + 4, beam_y0 + beam_h, WOOD)
    hline(px, left - 4, right + 4, beam_y0, WOOD_EDGE)
    hline(px, left - 4, right + 4, beam_y0 + beam_h - 1, WOOD_DK)
    hline(px, left - 4, right + 4, beam_y0 + 3, WOOD_HI)
    for i in range(12):
        px[left + post_w + i, beam_y0 + beam_h + i] = WOOD_DK + (255,)
        px[right - post_w - 1 - i, beam_y0 + beam_h + i] = WOOD_DK + (255,)

    # Torch on left post only — no baked rails (separate props north of arch)
    tx, ty = left + post_w // 2, beam_y0 + 40
    rect(px, tx - 1, ty, tx + 2, ty + 10, WOOD_DK)
    px[tx, ty - 1] = TORCH_CORE + (255,)
    px[tx, ty - 2] = TORCH + (255,)
    px[tx - 1, ty - 1] = TORCH + (255,)
    px[tx + 1, ty - 1] = TORCH + (255,)
    return img


def _paint_vein(px, w, h, x, y, cols, size: int = 2):
    lo, mid, hi = cols
    for dy in range(-size, size + 1):
        for dx in range(-size, size + 1):
            nx, ny = x + dx, y + dy
            if not (0 <= nx < w and 0 <= ny < h):
                continue
            if px[nx, ny][3] < 200:
                continue
            d = abs(dx) + abs(dy)
            if d == 0:
                px[nx, ny] = hi + (255,)
            elif d == 1:
                px[nx, ny] = mid + (255,)
            elif d == 2 and size >= 2:
                px[nx, ny] = lo + (255,)


def draw_ore_from_rock(kind: str, w: int, h: int) -> Image.Image:
    """Clone farm rock art, tint cool for cave, stamp bright ore veins."""
    src_name = "nat-rock-big.png" if w >= 64 else "nat-rock.png"
    src = Image.open(NATURE / src_name).convert("RGBA")
    # Fit into target canvas, bottom-aligned
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    sw, sh = src.size
    scale = min(w / sw, h / sh)
    nw, nh = max(1, int(sw * scale)), max(1, int(sh * scale))
    scaled = src.resize((nw, nh), Image.NEAREST)
    ox = (w - nw) // 2
    oy = h - nh  # foot align
    img.paste(scaled, (ox, oy), scaled)
    px = img.load()

    # Cool the grey rock slightly toward cave purple
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a < 200:
                continue
            # skip dirt foot (brownish)
            if r > 90 and g < 80 and b < 70:
                continue
            nr = int(r * 0.85 + 40 * 0.15)
            ng = int(g * 0.82 + 38 * 0.18)
            nb = int(b * 0.75 + 70 * 0.25)
            px[x, y] = (nr, ng, nb, a)

    if kind == "copper":
        cols = (COPPER_DK, COPPER, COPPER_HI)
        spots = [(0.35, 0.4), (0.55, 0.35), (0.45, 0.55), (0.62, 0.5), (0.4, 0.62)]
    elif kind == "iron":
        cols = (IRON_DK, IRON, IRON_HI)
        spots = [(0.32, 0.38), (0.58, 0.42), (0.45, 0.52), (0.65, 0.55), (0.4, 0.6), (0.52, 0.32)]
    else:
        cols = (CRYSTAL_DK, CRYSTAL, CRYSTAL_HI)
        spots = [(0.4, 0.3), (0.55, 0.35), (0.48, 0.48), (0.35, 0.55), (0.6, 0.55)]

    for u, v in spots:
        _paint_vein(px, w, h, ox + int(nw * u), oy + int(nh * v), cols, size=2 if kind != "crystal" else 2)
        # crystal spikes a bit taller
        if kind == "crystal":
            sx, sy = ox + int(nw * u), oy + int(nh * v) - 2
            if 0 <= sx < w and 0 <= sy < h and px[sx, sy][3] > 200:
                px[sx, sy] = CRYSTAL_HI + (255,)
            if 0 <= sx < w and 0 <= sy - 1 < h and px[sx, max(0, sy - 1)][3] > 200:
                px[sx, sy - 1] = CRYSTAL + (255,)
    return img


def restore_mouth_from_ai(uuid_map: dict) -> None:
    """Restore the original AI+RMBG mouth — do NOT replace with the flat arch stub."""
    src_path = Path(__file__).resolve().parent / "ai-source/rmbg-cutout/bld-mine-mouth-rmbg.png"
    if not src_path.exists():
        print("missing", src_path)
        return
    src = Image.open(src_path).convert("RGBA")
    bbox = src.getbbox()
    if bbox:
        src = src.crop(bbox)
    w, h = 288, 224
    cw, ch = src.size
    scale = min(w / cw, h / ch)
    nw, nh = max(1, int(cw * scale)), max(1, int(ch * scale))
    scaled = src.resize((nw, nh), Image.NEAREST)
    out = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    out.paste(scaled, ((w - nw) // 2, h - nh), scaled)
    save(BUILDINGS / "bld-mine-mouth.png", out, uuid_map, "bld-mine-mouth", 0.0)


def main() -> None:
    uuid_map = json.loads(UUID_MAP.read_text(encoding="utf-8")) if UUID_MAP.exists() else {}

    restore_mouth_from_ai(uuid_map)

    for item_id, kind, w, h in (
        ("nat-ore-copper", "copper", 48, 40),
        ("nat-ore-iron", "iron", 72, 56),
        ("nat-ore-crystal", "crystal", 56, 64),
    ):
        save(NATURE / f"{item_id}.png", draw_ore_from_rock(kind, w, h), uuid_map, item_id, 0.0)

    UUID_MAP.write_text(json.dumps(uuid_map, indent=2) + "\n", encoding="utf-8")
    print("updated uuid-map.json")


if __name__ == "__main__":
    main()
