#!/usr/bin/env python3
"""Cave floor variants + cave-dirt + rock-colored fringe (no green grass).

Breaks square seams underground the same way farm grass fringe softens dirt.

    py -3.10 tools/ui/draw_cave_terrain.py
"""

from __future__ import annotations

import json
import math
import uuid
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
TOOLS = Path(__file__).resolve().parent
UUID_MAP = TOOLS / "uuid-map.json"
TERRAIN_FRAMES = TOOLS / "terrain-frames.json"
TERRAIN_DIR = ROOT / "assets/textures/terrain"
TEX_SUFFIX = "6c48a"
SF_SUFFIX = "f9941"

# Underground palette (cool purple-grey, no grass green)
CAVE = (72, 68, 92)
CAVE_MID = (92, 86, 114)
CAVE_DARK = (48, 44, 64)
CAVE_DEEP = (36, 32, 48)
CAVE_HI = (118, 112, 140)
CAVE_CRACK = (40, 36, 54)

DIRT = (110, 88, 62)
DIRT_MID = (128, 102, 72)
DIRT_DARK = (78, 60, 42)
DIRT_LIGHT = (148, 120, 84)
DIRT_PEBBLE = (96, 78, 58)

LIP = (58, 48, 68)
LIP_DEEP = (40, 34, 52)


def uid() -> str:
    return str(uuid.uuid4())


def _hash01(x: int, y: int, seed: int) -> float:
    v = (x * 374761393 + y * 668265263 + seed * 982451653) & 0x7FFFFFFF
    v = (v ^ (v >> 13)) * 1274126177
    return ((v ^ (v >> 16)) & 0xFFFF) / 65536.0


def write_image_meta(png_path: Path, image_uuid: str, w: int, h: int, name: str):
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


def save_asset(item_id: str, img: Image.Image, uuid_map: dict, frames: dict) -> str:
    w, h = img.size
    png = TERRAIN_DIR / f"{item_id}.png"
    prev = uuid_map.get(item_id, {})
    image_uuid = prev.get("texture") if isinstance(prev, dict) else None
    if not image_uuid and png.with_suffix(".png.meta").exists():
        try:
            image_uuid = json.loads(png.with_suffix(".png.meta").read_text(encoding="utf-8"))["uuid"]
        except Exception:
            image_uuid = None
    image_uuid = image_uuid or uid()
    img.save(png)
    write_image_meta(png, image_uuid, w, h, item_id)
    sf = f"{image_uuid}@{SF_SUFFIX}"
    uuid_map[item_id] = {
        "texture": image_uuid,
        "prefab": uuid_map.get(item_id, {}).get("prefab", "") if isinstance(uuid_map.get(item_id), dict) else "",
        "spriteFrame": sf,
    }
    # terrain-frames keys without tile- prefix style used by bake load_terrain
    key = item_id.replace("tile-", "")
    # camelCase for fringe: caveFringeN
    if key.startswith("cave-fringe-"):
        parts = key.split("-")
        # cave-fringe-n -> caveFringeN ; cave-fringe-out-ne -> caveFringeOutNE
        rest = "".join(p.capitalize() if i else p for i, p in enumerate(parts[2:]))
        # fix: parts[2:] for n/e/s/w or out/in + corner
        if len(parts) == 3:
            frame_key = "caveFringe" + parts[2].upper()
        else:
            # cave-fringe-out-ne -> caveFringeOutNE
            frame_key = "caveFringe" + "".join(p.upper() if len(p) <= 2 else p.capitalize() for p in parts[2:])
            # normalize Out/In
            frame_key = frame_key.replace("Out", "Out").replace("In", "In")
            if "out" in parts:
                corner = parts[-1].upper()
                frame_key = f"caveFringeOut{corner}"
            elif "in" in parts:
                corner = parts[-1].upper()
                frame_key = f"caveFringeIn{corner}"
    elif key == "cave":
        frame_key = "cave"
    elif key == "cave-b":
        frame_key = "caveB"
    elif key == "cave-c":
        frame_key = "caveC"
    elif key == "cave-dirt":
        frame_key = "caveDirt"
    elif key == "cave-dirt-b":
        frame_key = "caveDirtB"
    elif key == "cave-wall":
        frame_key = "caveWall"
    elif key == "cave-wall-b":
        frame_key = "caveWallB"
    elif key == "cave-wall-c":
        frame_key = "caveWallC"
    else:
        frame_key = key
    frames[frame_key] = sf
    print("OK", item_id, f"{w}x{h}", "->", frame_key)
    return sf


def wrap_noise(x: int, y: int, seed: int, period: int = 64) -> float:
    """Tileable value noise (period wraps)."""
    x0 = x % period
    y0 = y % period
    return _hash01(x0, y0, seed)


def draw_cave_tile(seed: int = 1, w: int = 64, h: int = 64) -> Image.Image:
    """Seamless-ish cave floor — wrap noise, soft grit, no edge-aligned cracks."""
    img = Image.new("RGBA", (w, h), CAVE + (255,))
    px = img.load()
    for y in range(h):
        for x in range(w):
            n = wrap_noise(x, y, seed)
            n2 = wrap_noise(x // 2, y // 2, seed + 3)
            n3 = wrap_noise(x + 17, y + 9, seed + 7)
            v = n * 0.55 + n2 * 0.3 + n3 * 0.15
            if v < 0.22:
                c = CAVE_DARK
            elif v < 0.38:
                c = CAVE_DEEP if n3 < 0.4 else CAVE
            elif v > 0.82:
                c = CAVE_HI
            elif v > 0.68:
                c = CAVE_MID
            else:
                c = CAVE
            # sparse cracks that wrap — never force a tile-edge line
            if wrap_noise(x * 3 + y, y * 2, seed + 11) > 0.965:
                c = CAVE_CRACK
            px[x, y] = c + (255,)
    # soften tile borders by blending with wrapped neighbors (breaks seam)
    out = img.copy()
    opx = out.load()
    for y in range(h):
        for x in range(w):
            if x in (0, w - 1) or y in (0, h - 1):
                samples = []
                for dy in (-1, 0, 1):
                    for dx in (-1, 0, 1):
                        samples.append(px[(x + dx) % w, (y + dy) % h])
                # majority-ish average toward neighbor
                r = sum(s[0] for s in samples) // len(samples)
                g = sum(s[1] for s in samples) // len(samples)
                b = sum(s[2] for s in samples) // len(samples)
                # snap back to palette
                cands = [CAVE, CAVE_MID, CAVE_DARK, CAVE_HI, CAVE_DEEP]
                best = min(cands, key=lambda c: abs(c[0] - r) + abs(c[1] - g) + abs(c[2] - b))
                opx[x, y] = best + (255,)
    return out


# Much darker wall rock — must NOT read as walkable cave floor
WALL = (36, 32, 48)
WALL_MID = (48, 44, 62)
WALL_DARK = (24, 22, 34)
WALL_DEEP = (14, 12, 22)
WALL_HI = (58, 52, 72)
WALL_CRACK = (18, 16, 28)


def draw_cave_wall_tile(seed: int = 1, w: int = 64, h: int = 64) -> Image.Image:
    """Solid underground rock fill — NOT outdoor brown cliff ledge."""
    img = Image.new("RGBA", (w, h), WALL + (255,))
    px = img.load()
    for y in range(h):
        for x in range(w):
            n = wrap_noise(x, y, seed + 40)
            n2 = wrap_noise(x // 3, y // 3, seed + 43)
            v = n * 0.6 + n2 * 0.4
            if v < 0.2:
                c = WALL_DEEP
            elif v < 0.4:
                c = WALL_DARK
            elif v > 0.88:
                c = WALL_HI
            elif v > 0.7:
                c = WALL_MID
            else:
                c = WALL
            if wrap_noise(x * 2 + y, y * 3, seed + 45) > 0.96:
                c = WALL_CRACK
            # occasional ore fleck
            if wrap_noise(x + 11, y + 19, seed + 46) > 0.985:
                c = (140, 90, 50) if seed % 2 == 0 else (120, 90, 160)
            px[x, y] = c + (255,)
    return img


def draw_cave_dirt(seed: int = 1, w: int = 64, h: int = 64) -> Image.Image:
    img = Image.new("RGBA", (w, h), DIRT + (255,))
    px = img.load()
    for y in range(h):
        for x in range(w):
            n = wrap_noise(x, y, seed + 20)
            if n < 0.18:
                c = DIRT_DARK
            elif n > 0.85:
                c = DIRT_LIGHT
            elif n > 0.7:
                c = DIRT_MID
            else:
                c = DIRT
            if wrap_noise(x + 3, y + 5, seed + 21) > 0.93:
                c = DIRT_PEBBLE
            px[x, y] = c + (255,)
    return img


def rock_px(x: int, y: int, seed: int):
    r = _hash01(x, y, seed)
    if r < 0.14:
        return CAVE_DARK + (255,)
    if r < 0.22:
        return CAVE_DEEP + (255,)
    if r > 0.9:
        return CAVE_HI + (255,)
    if r > 0.78:
        return CAVE_MID + (255,)
    return CAVE + (255,)


def _edge_depth(t: float, seed: int, axis: int, base: float = 14.0, amp: float = 11.0) -> float:
    """Softer, more organic shoreline depth (less square cut)."""
    wiggle = (
        math.sin(t * math.pi * 2 * 1.3 + seed * 0.37) * 0.5
        + math.sin(t * math.pi * 2 * 2.6 + seed * 1.1) * 0.32
        + math.sin(t * math.pi * 2 * 0.55 + seed * 2.4) * 0.4
        + math.sin(t * math.pi * 2 * 4.1 + seed * 0.7) * 0.18
        + (_hash01(int(t * 64), axis, seed) - 0.5) * 0.65
    )
    bite = 0.0
    if _hash01(int(t * 16), axis + 3, seed + 9) > 0.72:
        bite = 4.0 + _hash01(int(t * 16), axis + 5, seed + 2) * 5.0
    if _hash01(int(t * 16), axis + 7, seed + 11) > 0.8:
        bite -= 3.0 + _hash01(int(t * 16), axis + 8, seed) * 4.0
    return max(6.0, base + amp * wiggle + bite)


def _paint_body(px, x, y, seed):
    px[x, y] = rock_px(x, y, seed)


def _paint_lip(px, x, y, seed):
    px[x, y] = (LIP_DEEP if _hash01(x, y, seed) < 0.35 else LIP) + (255,)


def _paint_soft_mote(px, x, y, seed, density: float):
    """Dithered rock mote into the transparent side — softens the hard lip."""
    if density <= 0:
        return
    if _hash01(x, y, seed + 19) > density:
        return
    # Wet/dark lip colors bleed into water
    if _hash01(x, y, seed + 21) < 0.45:
        c = LIP_DEEP
    elif _hash01(x, y, seed + 22) < 0.55:
        c = LIP
    else:
        c = CAVE_DARK
    a = 255 if density > 0.55 else (200 if density > 0.3 else 150)
    px[x, y] = c + (a,)


def _scatter(px, w, h, cx, cy, seed, count=3):
    for i in range(count):
        dx = int((_hash01(cx + i, cy, seed) - 0.5) * 7)
        dy = int((_hash01(cx, cy + i, seed + 3) - 0.5) * 7)
        x, y = cx + dx, cy + dy
        if 0 <= x < w and 0 <= y < h and px[x, y][3] == 0:
            col = CAVE_HI if _hash01(x, y, seed + 1) > 0.5 else CAVE_MID
            px[x, y] = col + (220,)


def draw_edge(side: str, seed: int = 1, w: int = 64, h: int = 64) -> Image.Image:
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    px = img.load()
    if side == "n":
        for x in range(w):
            depth = int(round(_edge_depth(x / (w - 1), seed, 0)))
            for y in range(depth):
                _paint_body(px, x, y, seed)
            if depth < h:
                _paint_lip(px, x, depth, seed)
            if depth + 1 < h:
                _paint_lip(px, x, depth + 1, seed + 1)
            # soft fade into water (south of lip)
            for step in range(1, 6):
                yy = depth + 1 + step
                if yy < h:
                    _paint_soft_mote(px, x, yy, seed + x + step, max(0.1, 0.7 - step * 0.12))
            if _hash01(x, depth, seed + 6) > 0.35:
                _scatter(px, w, h, x, min(h - 1, depth + 4), seed + x, 5)
    elif side == "s":
        for x in range(w):
            depth = int(round(_edge_depth(x / (w - 1), seed + 17, 1)))
            for y in range(h - depth, h):
                _paint_body(px, x, y, seed + 17)
            lip_y = h - depth - 1
            if lip_y >= 0:
                _paint_lip(px, x, lip_y, seed)
            if lip_y - 1 >= 0:
                _paint_lip(px, x, lip_y - 1, seed + 1)
            for step in range(1, 6):
                yy = lip_y - 1 - step
                if yy >= 0:
                    _paint_soft_mote(px, x, yy, seed + x + step, max(0.1, 0.7 - step * 0.12))
            if _hash01(x, lip_y, seed + 6) > 0.35:
                _scatter(px, w, h, x, max(0, lip_y - 4), seed + x, 5)
    elif side == "w":
        for y in range(h):
            depth = int(round(_edge_depth(y / (h - 1), seed + 31, 2)))
            for x in range(depth):
                _paint_body(px, x, y, seed + 31)
            if depth < w:
                _paint_lip(px, depth, y, seed)
            if depth + 1 < w:
                _paint_lip(px, depth + 1, y, seed + 1)
            for step in range(1, 6):
                xx = depth + 1 + step
                if xx < w:
                    _paint_soft_mote(px, xx, y, seed + y + step, max(0.1, 0.7 - step * 0.12))
            if _hash01(depth, y, seed + 6) > 0.35:
                _scatter(px, w, h, min(w - 1, depth + 4), y, seed + y, 5)
    elif side == "e":
        for y in range(h):
            depth = int(round(_edge_depth(y / (h - 1), seed + 47, 3)))
            for x in range(w - depth, w):
                _paint_body(px, x, y, seed + 47)
            lip_x = w - depth - 1
            if lip_x >= 0:
                _paint_lip(px, lip_x, y, seed)
            if lip_x - 1 >= 0:
                _paint_lip(px, lip_x - 1, y, seed + 1)
            for step in range(1, 6):
                xx = lip_x - 1 - step
                if xx >= 0:
                    _paint_soft_mote(px, xx, y, seed + y + step, max(0.1, 0.7 - step * 0.12))
            if _hash01(lip_x, y, seed + 6) > 0.35:
                _scatter(px, w, h, max(0, lip_x - 4), y, seed + y, 5)
    return img


def draw_inner_corner(corner: str, seed: int = 1, w: int = 64, h: int = 64) -> Image.Image:
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    px = img.load()
    for y in range(h):
        for x in range(w):
            if corner == "nw":
                lx, ly = x, y
            elif corner == "ne":
                lx, ly = (w - 1 - x), y
            elif corner == "sw":
                lx, ly = x, (h - 1 - y)
            else:
                lx, ly = (w - 1 - x), (h - 1 - y)
            if lx > 32 or ly > 32:
                continue
            r_base = 20.0 + 5.0 * math.sin(math.atan2(ly + 0.5, lx + 0.5) * 3 + seed)
            r_base += (_hash01(lx, ly, seed) - 0.5) * 8.0
            dist = math.hypot(lx + 0.5, ly + 0.5)
            if dist < r_base - 2.8:
                _paint_body(px, x, y, seed)
            elif dist < r_base:
                _paint_lip(px, x, y, seed)
            elif dist < r_base + 5.0:
                dens = max(0.12, 0.75 - (dist - r_base) * 0.14)
                _paint_soft_mote(px, x, y, seed + 8, dens)
    return img


def draw_outer_corner(corner: str, seed: int = 1, w: int = 64, h: int = 64) -> Image.Image:
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    px = img.load()
    for y in range(h):
        for x in range(w):
            if corner == "nw":
                lx, ly = x, y
                t_h, t_v = x / (w - 1), y / (h - 1)
            elif corner == "ne":
                lx, ly = (w - 1 - x), y
                t_h, t_v = (w - 1 - x) / (w - 1), y / (h - 1)
            elif corner == "sw":
                lx, ly = x, (h - 1 - y)
                t_h, t_v = x / (w - 1), (h - 1 - y) / (h - 1)
            else:
                lx, ly = (w - 1 - x), (h - 1 - y)
                t_h, t_v = (w - 1 - x) / (w - 1), (h - 1 - y) / (h - 1)
            depth_n = _edge_depth(t_h, seed, 10, base=13.0, amp=7.0)
            depth_w = _edge_depth(t_v, seed + 5, 11, base=13.0, amp=7.0)
            in_edge = lx <= depth_w or ly <= depth_n
            fillet_r = 12.0 + (_hash01(x, y, seed) - 0.5) * 3.5
            in_fillet = lx > depth_w and ly > depth_n and math.hypot(lx - depth_w, ly - depth_n) <= fillet_r
            if not (in_edge or in_fillet):
                continue
            near_front = False
            if in_edge and not in_fillet:
                if abs(lx - depth_w) <= 1.2 and ly > depth_n * 0.25:
                    near_front = True
                if abs(ly - depth_n) <= 1.2 and lx > depth_w * 0.25:
                    near_front = True
            if in_fillet:
                dfil = math.hypot(lx - depth_w, ly - depth_n)
                if dfil >= fillet_r - 1.6:
                    near_front = True
            if near_front:
                _paint_lip(px, x, y, seed)
            else:
                _paint_body(px, x, y, seed)
    return img


def main():
    TERRAIN_DIR.mkdir(parents=True, exist_ok=True)
    uuid_map = json.loads(UUID_MAP.read_text(encoding="utf-8")) if UUID_MAP.exists() else {}
    frames = json.loads(TERRAIN_FRAMES.read_text(encoding="utf-8")) if TERRAIN_FRAMES.exists() else {}

    # Also keep tile-cave uuid if exists
    save_asset("tile-cave", draw_cave_tile(1), uuid_map, frames)
    save_asset("tile-cave-b", draw_cave_tile(5), uuid_map, frames)
    save_asset("tile-cave-c", draw_cave_tile(9), uuid_map, frames)
    save_asset("tile-cave-dirt", draw_cave_dirt(2), uuid_map, frames)
    save_asset("tile-cave-dirt-b", draw_cave_dirt(6), uuid_map, frames)
    save_asset("tile-cave-wall", draw_cave_wall_tile(1), uuid_map, frames)
    save_asset("tile-cave-wall-b", draw_cave_wall_tile(4), uuid_map, frames)
    save_asset("tile-cave-wall-c", draw_cave_wall_tile(8), uuid_map, frames)

    fringe = {
        "tile-cave-fringe-n": draw_edge("n", 1),
        "tile-cave-fringe-e": draw_edge("e", 2),
        "tile-cave-fringe-s": draw_edge("s", 3),
        "tile-cave-fringe-w": draw_edge("w", 4),
        "tile-cave-fringe-in-ne": draw_inner_corner("ne", 5),
        "tile-cave-fringe-in-nw": draw_inner_corner("nw", 6),
        "tile-cave-fringe-in-se": draw_inner_corner("se", 7),
        "tile-cave-fringe-in-sw": draw_inner_corner("sw", 8),
        "tile-cave-fringe-out-ne": draw_outer_corner("ne", 9),
        "tile-cave-fringe-out-nw": draw_outer_corner("nw", 10),
        "tile-cave-fringe-out-se": draw_outer_corner("se", 11),
        "tile-cave-fringe-out-sw": draw_outer_corner("sw", 12),
    }
    for name, img in fringe.items():
        save_asset(name, img, uuid_map, frames)

    UUID_MAP.write_text(json.dumps(uuid_map, indent=2) + "\n", encoding="utf-8")
    TERRAIN_FRAMES.write_text(json.dumps(frames, indent=2) + "\n", encoding="utf-8")

    # Sync TerrainFrames.ts
    ts = ROOT / "assets/scripts/game/TerrainFrames.ts"
    body = "/** Auto-synced from tools/ui/terrain-frames.json */\nexport const TERRAIN_FRAMES = "
    body += json.dumps(frames, indent=4)
    body += "\n"
    ts.write_text(body, encoding="utf-8")
    print("synced TerrainFrames.ts")


if __name__ == "__main__":
    main()
