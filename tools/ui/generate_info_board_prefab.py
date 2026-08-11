#!/usr/bin/env python3
"""
Info-board chrome + Cocos 3.8 FarmInfoBoard.prefab.

Prefer AI textures:
  /usr/bin/python3 tools/ui/process_info_board_ai.py
  /usr/bin/python3 tools/ui/generate_info_board_prefab.py --prefab-only

Without --prefab-only this script falls back to PIL pixel draws (legacy).
Layout constants are the source of truth for prefab child positions.
"""

from __future__ import annotations

import json
import math
import random
import string
import uuid
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[2]
OUT_TEX = ROOT / "assets/textures/ui"
OUT_PREFAB = ROOT / "assets/prefabs/ui/FarmInfoBoard.prefab"
UUID_MAP = Path(__file__).resolve().parent / "uuid-map.json"
FRAMES_JSON = Path(__file__).resolve().parent / "info-board-frames.json"
FRAMES_TS = ROOT / "assets/scripts/game/InfoBoardFrames.ts"
CATALOG = Path(__file__).resolve().parent / "catalog.json"
LAYOUT_JSON = Path(__file__).resolve().parent / "info-board-layout.json"

TEX_SUFFIX = "6c48a"
SF_SUFFIX = "f9941"
SCRIPT_UUID = "9bec3781-fb7c-4055-9747-89fa0bb1e2b1"
# Prefab/scene __type__ must be the Cocos compressed form (5-hex head + base64),
# matching scene refs like GameBootstrap — full UUID → Missing class at build.
_BASE64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/="


def compress_uuid(uuid_str: str) -> str:
    clean = uuid_str.replace("-", "")
    head, rem = clean[:5], clean[5:]
    while len(rem) % 3:
        rem += "0"
    out = [head]
    for i in range(0, len(rem), 3):
        a, b, c = (int(rem[i], 16), int(rem[i + 1], 16), int(rem[i + 2], 16))
        out.append(_BASE64[(a << 2) | (b >> 2)])
        out.append(_BASE64[((b & 3) << 4) | c])
    return "".join(out)


SCRIPT_TYPE = compress_uuid(SCRIPT_UUID)  # 9bec3eB+3xAVZdHifoLseKx
UI_LAYER = 33554432  # UI_2D

# ---- layout (display px, 1080 design) ----
PANEL_W, PANEL_H = 520, 216
GOLD_W, GOLD_H = 320, 88  # natural ~3.6:1 — keeps G coin round
BTN = 72
ICON = 64  # AI-processed weather/season
EDGE = 20
STACK_GAP = 16
BTN_GAP = 14
NEEDLE_W, NEEDLE_H = 36, 90  # AI-processed needle

# Panel image coords (origin top-left) — matched to AI ui-info-panel v3
DIAL_CX, DIAL_CY, DIAL_R = 174, 73, 78
DATE = dict(x=276, y=18, w=152, h=39)  # cream slot
WEATHER = dict(x=286, y=74, w=62, h=61)
SEASON = dict(x=367, y=74, w=61, h=61)
TIME = dict(x=276, y=153, w=152, h=43)

# Fonts sized to fit cream slots (not larger than the box).
DATE_FONT = 28
TIME_FONT = 30
GOLD_FONT = 30

# GoldVal in cream field (right of round G ~x0–105). Gold local center=(0,0).
GOLD_VAL_W, GOLD_VAL_H = 180, 52
GOLD_VAL_X, GOLD_VAL_Y = 48, 0

# Root stack (anchor top-right = 1,1): panel + gold only (zoom/quest buttons removed)
TOTAL_H = PANEL_H + STACK_GAP + GOLD_H

C = {
    "outline": (54, 30, 14, 255),
    "wood_dk": (118, 58, 22, 255),
    "wood": (186, 108, 36, 255),
    "wood_hi": (228, 148, 58, 255),
    "wood_hi2": (245, 188, 108, 255),
    "inset": (242, 220, 176, 255),
    "inset_hi": (252, 236, 200, 255),
    "inset_dk": (210, 176, 122, 255),
    "slot": (236, 210, 164, 255),
    "sky_night": (26, 40, 96, 255),
    "sky_night2": (18, 28, 72, 255),
    "sky_eve": (70, 110, 180, 255),
    "sky_day": (150, 210, 245, 255),
    "sky_day2": (110, 180, 235, 255),
    "star": (240, 245, 255, 255),
    "sun": (255, 220, 70, 255),
    "sun_dk": (230, 170, 40, 255),
    "moon": (235, 240, 250, 255),
    "g_bg": (72, 42, 22, 255),
    "g_mark": (255, 214, 72, 255),
    "btn_face": (120, 70, 32, 255),
    "btn_hi": (180, 120, 55, 255),
    "btn_mark": (245, 210, 90, 255),
    "weather_bg": (150, 200, 230, 255),
    "season_bg": (245, 210, 220, 255),
    "season_pink": (230, 140, 170, 255),
    "season_leaf": (90, 170, 80, 255),
    "needle": (230, 180, 70, 255),
    "needle_dk": (170, 120, 40, 255),
}


def file_id(n=22):
    alphabet = string.ascii_letters + string.digits + "+/"
    return "".join(random.choice(alphabet) for _ in range(n))


def put(px, w, h, x, y, c):
    if 0 <= x < w and 0 <= y < h:
        px[x, y] = c


def fill_rect(px, w, h, x0, y0, x1, y1, c):
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            put(px, w, h, x, y, c)


def outline_opaque(img, color):
    w, h = img.size
    px = img.load()
    opaque = [(x, y) for y in range(h) for x in range(w) if px[x, y][3] > 0]
    border = set()
    for x, y in opaque:
        for dx, dy in ((-1, 0), (1, 0), (0, -1), (0, 1)):
            nx, ny = x + dx, y + dy
            if not (0 <= nx < w and 0 <= ny < h) or px[nx, ny][3] == 0:
                border.add((nx, ny))
    for x, y in border:
        if 0 <= x < w and 0 <= y < h and px[x, y][3] == 0:
            px[x, y] = color


def wood_round_rect(px, w, h, x0, y0, x1, y1, r=8):
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            corners = (
                (x0 + r, y0 + r, x <= x0 + r and y <= y0 + r),
                (x1 - r, y0 + r, x >= x1 - r and y <= y0 + r),
                (x0 + r, y1 - r, x <= x0 + r and y >= y1 - r),
                (x1 - r, y1 - r, x >= x1 - r and y >= y1 - r),
            )
            skip = False
            for cx, cy, active in corners:
                if active and (x - cx) ** 2 + (y - cy) ** 2 > r * r + r:
                    skip = True
                    break
            if skip:
                continue
            edge_l = x - x0 <= 2
            edge_t = y - y0 <= 2
            edge_r = x1 - x <= 2
            edge_b = y1 - y <= 2
            if edge_l or edge_t:
                c = C["wood_hi"]
            elif edge_r or edge_b:
                c = C["wood_dk"]
            else:
                # subtle grain
                c = C["wood_hi2"] if (x + y * 3) % 17 == 0 else C["wood"]
            put(px, w, h, x, y, c)
    fill_rect(px, w, h, x0 + 3, y0 + 3, x1 - 3, y0 + 3, C["wood_hi2"])
    fill_rect(px, w, h, x0 + 3, y0 + 3, x0 + 3, y1 - 3, C["wood_hi"])


def inset_box(px, w, h, x0, y0, x1, y1):
    fill_rect(px, w, h, x0, y0, x1, y1, C["inset"])
    fill_rect(px, w, h, x0, y0, x1, y0, C["inset_dk"])
    fill_rect(px, w, h, x0, y0, x0, y1, C["inset_dk"])
    fill_rect(px, w, h, x0, y1, x1, y1, C["inset_hi"])
    fill_rect(px, w, h, x1, y0, x1, y1, C["inset_hi"])


def slot_box(px, w, h, x0, y0, x1, y1):
    fill_rect(px, w, h, x0, y0, x1, y1, C["slot"])
    fill_rect(px, w, h, x0, y0, x1, y0, C["inset_dk"])
    fill_rect(px, w, h, x0, y0, x0, y1, C["inset_dk"])
    fill_rect(px, w, h, x0, y1, x1, y1, C["inset_hi"])
    fill_rect(px, w, h, x1, y0, x1, y1, C["inset_hi"])


def draw_panel():
    w, h = PANEL_W, PANEL_H
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    px = img.load()
    # right board
    wood_round_rect(px, w, h, 178, 6, 512, 210, r=14)
    inset_box(px, w, h, DATE["x"], DATE["y"], DATE["x"] + DATE["w"] - 1, DATE["y"] + DATE["h"] - 1)
    slot_box(
        px,
        w,
        h,
        WEATHER["x"],
        WEATHER["y"],
        WEATHER["x"] + WEATHER["w"] - 1,
        WEATHER["y"] + WEATHER["h"] - 1,
    )
    slot_box(
        px,
        w,
        h,
        SEASON["x"],
        SEASON["y"],
        SEASON["x"] + SEASON["w"] - 1,
        SEASON["y"] + SEASON["h"] - 1,
    )
    inset_box(px, w, h, TIME["x"], TIME["y"], TIME["x"] + TIME["w"] - 1, TIME["y"] + TIME["h"] - 1)

    # dial
    cx, cy, rad = DIAL_CX, DIAL_CY, DIAL_R
    for y in range(cy - rad - 2, cy + rad + 3):
        for x in range(cx - rad - 2, cx + rad + 3):
            d2 = (x - cx) ** 2 + (y - cy) ** 2
            if d2 > (rad + 1) ** 2:
                continue
            if d2 > rad * rad:
                put(px, w, h, x, y, C["outline"])
                continue
            t = (y - (cy - rad)) / max(1, rad * 2)
            if t < 0.38:
                c = C["sky_night2"] if (x + y) % 9 == 0 else C["sky_night"]
            elif t < 0.55:
                c = C["sky_eve"]
            elif t < 0.72:
                c = C["sky_day2"]
            else:
                c = C["sky_day"]
            put(px, w, h, x, y, c)
    # wood ring
    for a in range(0, 360):
        for rr in (rad + 1, rad + 2, rad + 3):
            x = int(round(cx + math.cos(math.radians(a)) * rr))
            y = int(round(cy + math.sin(math.radians(a)) * rr))
            put(px, w, h, x, y, C["wood_dk"] if rr > rad + 1 else C["wood"])
    for sx, sy in ((70, 48), (95, 40), (120, 52), (78, 70), (130, 68)):
        put(px, w, h, sx, sy, C["star"])
    # sun bottom
    for dy in range(-8, 9):
        for dx in range(-8, 9):
            if dx * dx + dy * dy <= 36:
                put(px, w, h, 78 + dx, 148 + dy, C["sun"] if dx * dx + dy * dy <= 20 else C["sun_dk"])
    # moon
    for dy in range(-7, 8):
        for dx in range(-7, 8):
            if dx * dx + dy * dy <= 36:
                put(px, w, h, 88 + dx, 58 + dy, C["moon"])
    for dy in range(-5, 6):
        for dx in range(-2, 8):
            if dx * dx + dy * dy <= 28:
                put(px, w, h, 94 + dx, 54 + dy, C["sky_night"])
    # hub
    fill_rect(px, w, h, cx - 4, cy - 4, cx + 4, cy + 4, C["needle_dk"])
    fill_rect(px, w, h, cx - 2, cy - 2, cx + 2, cy + 2, C["needle"])
    outline_opaque(img, C["outline"])
    return img


def draw_gold():
    w, h = GOLD_W, GOLD_H
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    px = img.load()
    wood_round_rect(px, w, h, 2, 6, w - 3, h - 7, r=18)
    # G badge fully inside bar
    cx, cy, rad = 40, h // 2, 26
    for y in range(cy - rad, cy + rad + 1):
        for x in range(cx - rad, cx + rad + 1):
            if (x - cx) ** 2 + (y - cy) ** 2 <= rad * rad:
                put(px, w, h, x, y, C["outline"] if (x - cx) ** 2 + (y - cy) ** 2 > (rad - 2) ** 2 else C["g_bg"])
    # Chunkier G glyph inside badge
    g = [
        " ##### ",
        "##   ##",
        "##     ",
        "##  ###",
        "##   ##",
        " ##### ",
    ]
    for gy, row in enumerate(g):
        for gx, ch in enumerate(row):
            if ch == "#":
                ox, oy = 22 + gx * 3, 22 + gy * 5
                fill_rect(px, w, h, ox, oy, ox + 2, oy + 3, C["g_mark"])
    inset_box(px, w, h, 78, 16, w - 16, h - 17)
    for x in range(110, w - 20, 36):
        fill_rect(px, w, h, x, 18, x, h - 19, C["inset_dk"])
    outline_opaque(img, C["outline"])
    return img


def draw_btn(kind):
    s = BTN
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    px = img.load()
    if kind == "quest":
        cx = cy = s // 2
        rad = s // 2 - 2
        for y in range(s):
            for x in range(s):
                d2 = (x - cx) ** 2 + (y - cy) ** 2
                if d2 > rad * rad:
                    continue
                if d2 > (rad - 2) ** 2:
                    put(px, s, s, x, y, C["outline"])
                elif x + y < cx + cy - 6:
                    put(px, s, s, x, y, C["wood_hi"])
                elif x + y > cx + cy + 8:
                    put(px, s, s, x, y, C["wood_dk"])
                else:
                    put(px, s, s, x, y, C["wood"])
        fill_rect(px, s, s, 32, 14, 39, 42, C["btn_mark"])
        fill_rect(px, s, s, 32, 48, 39, 56, C["btn_mark"])
    else:
        wood_round_rect(px, s, s, 2, 2, s - 3, s - 3, r=8)
        fill_rect(px, s, s, 12, 12, s - 13, s - 13, C["btn_face"])
        fill_rect(px, s, s, 12, 12, s - 13, 14, C["btn_hi"])
        fill_rect(px, s, s, 18, 32, s - 19, 39, C["btn_mark"])
        if kind == "plus":
            fill_rect(px, s, s, 32, 18, 39, s - 19, C["btn_mark"])
    outline_opaque(img, C["outline"])
    return img


def draw_weather():
    s = ICON
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    px = img.load()
    fill_rect(px, s, s, 0, 0, s - 1, s - 1, C["weather_bg"])
    cx = cy = s // 2
    for y in range(s):
        for x in range(s):
            if (x - cx) ** 2 + (y - cy) ** 2 <= 100:
                put(px, s, s, x, y, C["sun"])
    for a in range(0, 360, 45):
        x = int(round(cx + math.cos(math.radians(a)) * 18))
        y = int(round(cy + math.sin(math.radians(a)) * 18))
        fill_rect(px, s, s, x - 1, y - 1, x + 1, y + 1, C["sun_dk"])
    outline_opaque(img, C["outline"])
    return img


def draw_season():
    s = ICON
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    px = img.load()
    fill_rect(px, s, s, 0, 0, s - 1, s - 1, C["season_bg"])
    for dx, dy in ((0, -8), (0, 8), (-8, 0), (8, 0), (-6, -6), (6, -6), (-6, 6), (6, 6)):
        fill_rect(px, s, s, 26 + dx, 24 + dy, 30 + dx, 28 + dy, C["season_pink"])
    fill_rect(px, s, s, 26, 24, 30, 28, C["sun"])
    fill_rect(px, s, s, 24, 36, 32, 44, C["season_leaf"])
    outline_opaque(img, C["outline"])
    return img


def draw_needle():
    w, h = NEEDLE_W, NEEDLE_H
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    px = img.load()
    # tip up, pivot near bottom
    mid = w // 2
    for y in range(4, h - 14):
        half = max(1, 3 - y // 28)
        fill_rect(px, w, h, mid - half, y, mid + half - 1, y, C["needle"])
        put(px, w, h, mid - half - 1, y, C["outline"])
        put(px, w, h, mid + half, y, C["outline"])
    fill_rect(px, w, h, mid - 1, 2, mid, 5, C["needle"])
    fill_rect(px, w, h, mid - 5, h - 16, mid + 4, h - 6, C["needle_dk"])
    fill_rect(px, w, h, mid - 2, h - 14, mid + 1, h - 8, C["needle"])
    outline_opaque(img, C["outline"])
    return img


def tl_to_local(rect, parent_w, parent_h):
    """Top-left rect in parent image → center-anchored local pos + size."""
    cx = rect["x"] + rect["w"] * 0.5 - parent_w * 0.5
    cy = parent_h * 0.5 - (rect["y"] + rect["h"] * 0.5)
    return cx, cy, rect["w"], rect["h"]


def write_image_meta(png, image_uuid, w, h, name):
    meta_path = Path(str(png) + ".meta")
    if meta_path.exists():
        old = json.loads(meta_path.read_text(encoding="utf-8"))
        image_uuid = old.get("uuid", image_uuid)
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


class PrefabBuilder:
    def __init__(self):
        self.objs = []
        self.root_fid = file_id()

    def add(self, obj):
        self.objs.append(obj)
        return len(self.objs) - 1  # but prefab data id 0 is Prefab asset; nodes start at 1

    def emit(self):
        return self.objs


def node_obj(name, parent_id, children_ids, comp_ids, prefab_info_id, x, y, ax=0.5, ay=0.5):
    return {
        "__type__": "cc.Node",
        "_name": name,
        "_objFlags": 0,
        "__editorExtras__": {},
        "_parent": None if parent_id is None else {"__id__": parent_id},
        "_children": [{"__id__": i} for i in children_ids],
        "_active": True,
        "_components": [{"__id__": i} for i in comp_ids],
        "_prefab": {"__id__": prefab_info_id},
        "_lpos": {"__type__": "cc.Vec3", "x": x, "y": y, "z": 0},
        "_lrot": {"__type__": "cc.Quat", "x": 0, "y": 0, "z": 0, "w": 1},
        "_lscale": {"__type__": "cc.Vec3", "x": 1, "y": 1, "z": 1},
        "_mobility": 0,
        "_layer": UI_LAYER,
        "_euler": {"__type__": "cc.Vec3", "x": 0, "y": 0, "z": 0},
        "_id": "",
    }


def uit_obj(node_id, prefab_info_id, w, h, ax=0.5, ay=0.5):
    return {
        "__type__": "cc.UITransform",
        "_name": "",
        "_objFlags": 0,
        "__editorExtras__": {},
        "node": {"__id__": node_id},
        "_enabled": True,
        "__prefab": {"__id__": prefab_info_id},
        "_contentSize": {"__type__": "cc.Size", "width": w, "height": h},
        "_anchorPoint": {"__type__": "cc.Vec2", "x": ax, "y": ay},
        "_id": "",
    }


def sprite_obj(node_id, prefab_info_id, sf_uuid):
    return {
        "__type__": "cc.Sprite",
        "_name": "",
        "_objFlags": 0,
        "__editorExtras__": {},
        "node": {"__id__": node_id},
        "_enabled": True,
        "__prefab": {"__id__": prefab_info_id},
        "_customMaterial": None,
        "_srcBlendFactor": 2,
        "_dstBlendFactor": 4,
        "_color": {"__type__": "cc.Color", "r": 255, "g": 255, "b": 255, "a": 255},
        "_spriteFrame": {"__uuid__": sf_uuid, "__expectedType__": "cc.SpriteFrame"},
        "_type": 0,
        "_fillType": 0,
        "_sizeMode": 0,
        "_fillCenter": {"__type__": "cc.Vec2", "x": 0, "y": 0},
        "_fillStart": 0,
        "_fillRange": 0,
        "_isTrimmedMode": False,
        "_useGrayscale": False,
        "_atlas": None,
        "_id": "",
    }


def label_obj(node_id, prefab_info_id, text, size, h_align=1, overflow=2, bold=True):
    return {
        "__type__": "cc.Label",
        "_name": "",
        "_objFlags": 0,
        "__editorExtras__": {},
        "node": {"__id__": node_id},
        "_enabled": True,
        "__prefab": {"__id__": prefab_info_id},
        "_customMaterial": None,
        "_srcBlendFactor": 2,
        "_dstBlendFactor": 4,
        "_color": {"__type__": "cc.Color", "r": 52, "g": 34, "b": 72, "a": 255},
        "_string": text,
        "_horizontalAlign": h_align,
        "_verticalAlign": 1,
        "_actualFontSize": size,
        "_fontSize": size,
        "_fontFamily": "Arial",
        "_lineHeight": size + 10,
        "_overflow": overflow,  # 0 NONE, 2 SHRINK
        "_enableWrapText": False,
        "_font": None,
        "_isSystemFontUsed": True,
        "_spacingX": 0,
        "_isItalic": False,
        "_isBold": bold,
        "_isUnderline": False,
        "_underlineHeight": 2,
        "_cacheMode": 0,
        "_enableOutline": True,
        "_outlineColor": {"__type__": "cc.Color", "r": 255, "g": 240, "b": 210, "a": 220},
        "_outlineWidth": max(3, size // 10),
        "_enableShadow": False,
        "_shadowColor": {"__type__": "cc.Color", "r": 0, "g": 0, "b": 0, "a": 0},
        "_shadowOffset": {"__type__": "cc.Vec2", "x": 0, "y": 0},
        "_shadowBlur": 0,
        "_id": "",
    }


def widget_obj(node_id, prefab_info_id, top, right, ow, oh):
    return {
        "__type__": "cc.Widget",
        "_name": "",
        "_objFlags": 0,
        "__editorExtras__": {},
        "node": {"__id__": node_id},
        "_enabled": True,
        "__prefab": {"__id__": prefab_info_id},
        "_alignFlags": 33,  # TOP | RIGHT
        "_target": None,
        "_left": 0,
        "_right": right,
        "_top": top,
        "_bottom": 0,
        "_horizontalCenter": 0,
        "_verticalCenter": 0,
        "_isAbsLeft": True,
        "_isAbsRight": True,
        "_isAbsTop": True,
        "_isAbsBottom": True,
        "_isAbsHorizontalCenter": True,
        "_isAbsVerticalCenter": True,
        "_originalWidth": ow,
        "_originalHeight": oh,
        "_alignMode": 2,
        "_lockFlags": 0,
        "_id": "",
    }


def prefab_info(root_id, asset_id, fid):
    return {
        "__type__": "cc.PrefabInfo",
        "root": {"__id__": root_id},
        "asset": {"__id__": asset_id},
        "fileId": fid,
        "instance": None,
        "targetOverrides": None,
        "nestedPrefabInstanceRoots": None,
    }


def build_prefab(frames: dict, prefab_uuid: str):
    """
    Build FarmInfoBoard prefab.
    Root anchor (1,1) + Widget top/right. Children laid out downward.
    Object index 0 = Prefab asset, 1 = root node.
    """
    objs = []

    def push(o):
        objs.append(o)
        return len(objs) - 1

    # We build in two passes: first allocate IDs by pushing placeholders... 
    # Simpler: construct list in order with known IDs.

    # IDs plan:
    # 0 Prefab
    # 1 Root node
    # 2 Root UITransform
    # 3 Root Widget
    # 4 Root PrefabInfo (shared style - each node needs own PrefabInfo in CC3)
    # Actually each node has its own PrefabInfo with same root/asset.

    # Use incremental builder with deferred children links
    entries = []  # list of dicts before JSON

    class B:
        def __init__(self):
            self.items = []

        def add(self, o):
            self.items.append(o)
            return len(self.items) - 1

    b = B()
    prefab_asset_id = b.add(
        {
            "__type__": "cc.Prefab",
            "_name": "FarmInfoBoard",
            "_objFlags": 0,
            "__editorExtras__": {},
            "_native": "",
            "data": {"__id__": 1},
            "optimizationPolicy": 0,
            "persistent": False,
        }
    )
    assert prefab_asset_id == 0

    # Root node MUST be __id__ 1 (Prefab.data).
    root_id = b.add(None)
    assert root_id == 1

    # Precompute child local positions (root anchor 1,1 → content in negative x/y)
    panel_x = -PANEL_W * 0.5
    panel_y = -PANEL_H * 0.5
    gold_y = -(PANEL_H + STACK_GAP + GOLD_H * 0.5)
    # gold centered on panel: gold center x = panel center x = -PANEL_W/2
    gold_center_x = -PANEL_W * 0.5

    # Panel-local (center origin) for insets
    date_cx, date_cy, date_w, date_h = tl_to_local(DATE, PANEL_W, PANEL_H)
    time_cx, time_cy, time_w, time_h = tl_to_local(TIME, PANEL_W, PANEL_H)
    w_cx, w_cy, _, _ = tl_to_local(WEATHER, PANEL_W, PANEL_H)
    s_cx, s_cy, _, _ = tl_to_local(SEASON, PANEL_W, PANEL_H)
    dial_cx = DIAL_CX - PANEL_W * 0.5
    dial_cy = PANEL_H * 0.5 - DIAL_CY

    root_pi = b.add(prefab_info(1, 0, file_id()))
    root_uit = b.add(uit_obj(1, root_pi, PANEL_W, TOTAL_H, 1.0, 1.0))
    root_widget = b.add(widget_obj(1, root_pi, EDGE, EDGE, PANEL_W, TOTAL_H))

    # Panel
    panel_pi = b.add(prefab_info(1, 0, file_id()))
    panel_id = b.add(None)
    panel_uit = b.add(uit_obj(panel_id, panel_pi, PANEL_W, PANEL_H))
    panel_spr = b.add(sprite_obj(panel_id, panel_pi, frames["panel"]))

    # Needle
    needle_pi = b.add(prefab_info(1, 0, file_id()))
    needle_id = b.add(None)
    needle_uit = b.add(
        {
            "__type__": "cc.UITransform",
            "_name": "",
            "_objFlags": 0,
            "__editorExtras__": {},
            "node": {"__id__": needle_id},
            "_enabled": True,
            "__prefab": {"__id__": needle_pi},
            "_contentSize": {"__type__": "cc.Size", "width": NEEDLE_W, "height": NEEDLE_H},
            "_anchorPoint": {"__type__": "cc.Vec2", "x": 0.5, "y": 0.16},
            "_id": "",
        }
    )
    needle_spr = b.add(sprite_obj(needle_id, needle_pi, frames["needle"]))

    # Date
    date_pi = b.add(prefab_info(1, 0, file_id()))
    date_id = b.add(None)
    date_uit = b.add(uit_obj(date_id, date_pi, date_w, date_h))
    date_lab = b.add(label_obj(date_id, date_pi, "2日 周二", DATE_FONT))

    # Weather
    weather_pi = b.add(prefab_info(1, 0, file_id()))
    weather_id = b.add(None)
    weather_uit = b.add(uit_obj(weather_id, weather_pi, ICON, ICON))
    weather_spr = b.add(sprite_obj(weather_id, weather_pi, frames["weather_sun"]))

    # Season
    season_pi = b.add(prefab_info(1, 0, file_id()))
    season_id = b.add(None)
    season_uit = b.add(uit_obj(season_id, season_pi, ICON, ICON))
    season_spr = b.add(sprite_obj(season_id, season_pi, frames["season_spring"]))

    # Time
    time_pi = b.add(prefab_info(1, 0, file_id()))
    time_id = b.add(None)
    time_uit = b.add(uit_obj(time_id, time_pi, time_w, time_h))
    time_lab = b.add(label_obj(time_id, time_pi, "06:00", TIME_FONT))

    # Gold
    gold_pi = b.add(prefab_info(1, 0, file_id()))
    gold_id = b.add(None)
    gold_uit = b.add(uit_obj(gold_id, gold_pi, GOLD_W, GOLD_H))
    gold_spr = b.add(sprite_obj(gold_id, gold_pi, frames["gold"]))

    # GoldVal — centered in cream inset (right of round G)
    gold_lab_pi = b.add(prefab_info(1, 0, file_id()))
    gold_lab_id = b.add(None)
    gold_lab_uit = b.add(uit_obj(gold_lab_id, gold_lab_pi, GOLD_VAL_W, GOLD_VAL_H))
    gold_lab = b.add(
        label_obj(
            gold_lab_id, gold_lab_pi, "0", GOLD_FONT, h_align=1, overflow=0, bold=False
        )
    )

    # Toast
    toast_pi = b.add(prefab_info(1, 0, file_id()))
    toast_id = b.add(None)
    toast_uit = b.add(uit_obj(toast_id, toast_pi, PANEL_W, 44))
    toast_lab = b.add(label_obj(toast_id, toast_pi, "", 28))

    # Script on root
    script_pi = root_pi  # reuse
    script_id = b.add(
        {
            "__type__": SCRIPT_TYPE,
            "_name": "",
            "_objFlags": 0,
            "__editorExtras__": {},
            "node": {"__id__": 1},
            "_enabled": True,
            "__prefab": {"__id__": script_pi},
            "farm": None,
            "dateLab": {"__id__": date_lab},
            "timeLab": {"__id__": time_lab},
            "goldLab": {"__id__": gold_lab},
            "toastLab": {"__id__": toast_lab},
            "needle": {"__id__": needle_id},
            "_id": "",
        }
    )

    # Fill node placeholders
    b.items[root_id] = node_obj(
        "FarmInfoBoard",
        None,
        [panel_id, gold_id, toast_id],
        [root_uit, root_widget, script_id],
        root_pi,
        0,
        0,
        1.0,
        1.0,
    )
    # fix root uit/widget/script node refs already point to 1 — ensure root_id==1
    assert root_id == 1

    b.items[panel_id] = node_obj(
        "Panel",
        1,
        [needle_id, date_id, weather_id, season_id, time_id],
        [panel_uit, panel_spr],
        panel_pi,
        panel_x,
        panel_y,
    )
    # Fix component node ids that used placeholder before panel_id known
    b.items[panel_uit]["node"] = {"__id__": panel_id}
    b.items[panel_spr]["node"] = {"__id__": panel_id}

    b.items[needle_id] = node_obj("Needle", panel_id, [], [needle_uit, needle_spr], needle_pi, dial_cx, dial_cy)
    b.items[needle_uit]["node"] = {"__id__": needle_id}
    b.items[needle_spr]["node"] = {"__id__": needle_id}

    b.items[date_id] = node_obj("Date", panel_id, [], [date_uit, date_lab], date_pi, date_cx, date_cy)
    b.items[date_uit]["node"] = {"__id__": date_id}
    b.items[date_lab]["node"] = {"__id__": date_id}

    b.items[weather_id] = node_obj("Weather", panel_id, [], [weather_uit, weather_spr], weather_pi, w_cx, w_cy)
    b.items[weather_uit]["node"] = {"__id__": weather_id}
    b.items[weather_spr]["node"] = {"__id__": weather_id}

    b.items[season_id] = node_obj("Season", panel_id, [], [season_uit, season_spr], season_pi, s_cx, s_cy)
    b.items[season_uit]["node"] = {"__id__": season_id}
    b.items[season_spr]["node"] = {"__id__": season_id}

    b.items[time_id] = node_obj("Time", panel_id, [], [time_uit, time_lab], time_pi, time_cx, time_cy)
    b.items[time_uit]["node"] = {"__id__": time_id}
    b.items[time_lab]["node"] = {"__id__": time_id}

    b.items[gold_id] = node_obj("Gold", 1, [gold_lab_id], [gold_uit, gold_spr], gold_pi, gold_center_x, gold_y)
    b.items[gold_uit]["node"] = {"__id__": gold_id}
    b.items[gold_spr]["node"] = {"__id__": gold_id}

    # Gold label: sit in cream value field (right of G)
    b.items[gold_lab_id] = node_obj(
        "GoldVal",
        gold_id,
        [],
        [gold_lab_uit, gold_lab],
        gold_lab_pi,
        GOLD_VAL_X,
        GOLD_VAL_Y,
    )
    b.items[gold_lab_uit]["node"] = {"__id__": gold_lab_id}
    b.items[gold_lab]["node"] = {"__id__": gold_lab_id}

    b.items[toast_id] = node_obj(
        "Toast",
        1,
        [],
        [toast_uit, toast_lab],
        toast_pi,
        -PANEL_W * 0.5,
        -TOTAL_H - 22,
    )
    b.items[toast_id]["_active"] = False
    b.items[toast_uit]["node"] = {"__id__": toast_id}
    b.items[toast_lab]["node"] = {"__id__": toast_id}

    # CompPrefabInfo stubs — Creator often has separate CompPrefabInfo; world prefabs use them.
    # Append for each component that referenced __prefab pointing to PrefabInfo — already OK.

    # Fix root component node ids
    b.items[root_uit]["node"] = {"__id__": 1}
    b.items[root_widget]["node"] = {"__id__": 1}
    b.items[script_id]["node"] = {"__id__": 1}

    return b.items


def attach_comp_prefab_infos(objs):
    """Point each component.__prefab at a CompPrefabInfo (Creator 3.8 requirement)."""
    comp_types = {
        "cc.UITransform",
        "cc.Sprite",
        "cc.Label",
        "cc.Widget",
        SCRIPT_TYPE,
    }
    out = list(objs)
    for o in list(objs):
        if not o or o.get("__type__") not in comp_types:
            continue
        pref = o.get("__prefab")
        if not pref:
            continue
        target = objs[pref["__id__"]]
        if target.get("__type__") == "cc.CompPrefabInfo":
            continue
        cid = len(out)
        out.append({"__type__": "cc.CompPrefabInfo", "fileId": file_id()})
        o["__prefab"] = {"__id__": cid}
    return out


def main():
    import argparse

    ap = argparse.ArgumentParser(description="Info board textures + FarmInfoBoard prefab")
    ap.add_argument(
        "--prefab-only",
        action="store_true",
        help="Rebuild prefab/layout from existing AI textures; do NOT redraw PIL chrome",
    )
    args = ap.parse_args()

    OUT_TEX.mkdir(parents=True, exist_ok=True)
    OUT_PREFAB.parent.mkdir(parents=True, exist_ok=True)
    umap = json.loads(UUID_MAP.read_text(encoding="utf-8")) if UUID_MAP.exists() else {}

    drawers = {
        "ui-info-panel": (draw_panel, PANEL_W, PANEL_H),
        "ui-info-gold": (draw_gold, GOLD_W, GOLD_H),
        "ui-info-btn-minus": (lambda: draw_btn("minus"), BTN, BTN),
        "ui-info-btn-plus": (lambda: draw_btn("plus"), BTN, BTN),
        "ui-info-btn-quest": (lambda: draw_btn("quest"), BTN, BTN),
        "ui-info-weather-sun": (draw_weather, ICON, ICON),
        "ui-info-season-spring": (draw_season, ICON, ICON),
        "ui-info-needle": (draw_needle, NEEDLE_W, NEEDLE_H),
    }

    frames = {}
    for name, (drawer, w, h) in drawers.items():
        png = OUT_TEX / "{}.png".format(name)
        if args.prefab_only:
            if not png.exists():
                raise SystemExit("missing texture for --prefab-only: {}".format(png))
            with Image.open(png) as im:
                w, h = im.size
            print("reuse", name, "{}x{}".format(w, h))
        else:
            drawer().save(png)
            print("tex", name, "{}x{}".format(w, h))
        image_uuid = write_image_meta(
            png, umap.get(name, {}).get("texture") or str(uuid.uuid4()), w, h, name
        )
        sf = "{}@{}".format(image_uuid, SF_SUFFIX)
        umap[name] = {
            "texture": image_uuid,
            "prefab": umap.get(name, {}).get("prefab", ""),
            "spriteFrame": sf,
        }
        key = name.replace("ui-info-", "").replace("-", "_")
        frames[key] = sf

    prefab_uuid = umap.get("FarmInfoBoard", {}).get("prefab") or str(uuid.uuid4())
    # preserve existing prefab uuid if meta exists
    if OUT_PREFAB.with_suffix(".prefab.meta").exists():
        prefab_uuid = json.loads(OUT_PREFAB.with_suffix(".prefab.meta").read_text()).get(
            "uuid", prefab_uuid
        )

    prefab_objs = build_prefab(frames, prefab_uuid)
    prefab_objs = attach_comp_prefab_infos(prefab_objs)
    OUT_PREFAB.write_text(json.dumps(prefab_objs, indent=2) + "\n", encoding="utf-8")
    OUT_PREFAB.with_suffix(".prefab.meta").write_text(
        json.dumps(
            {
                "ver": "1.1.50",
                "importer": "prefab",
                "imported": True,
                "uuid": prefab_uuid,
                "files": [],
                "subMetas": {},
                "userData": {"syncNodeName": True},
            },
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    umap["FarmInfoBoard"] = {"texture": "", "prefab": prefab_uuid, "spriteFrame": ""}

    UUID_MAP.write_text(json.dumps(umap, indent=2) + "\n", encoding="utf-8")
    FRAMES_JSON.write_text(json.dumps(frames, indent=2) + "\n", encoding="utf-8")
    FRAMES_TS.write_text(
        "/** Auto-synced from tools/ui/info-board-frames.json */\n"
        "export const INFO_BOARD_FRAMES = {}\n\n"
        "/** Prefab asset uuid — layout source of truth. */\n"
        "export const INFO_BOARD_PREFAB_UUID = '{}';\n".format(
            json.dumps(frames, indent=4), prefab_uuid
        ),
        encoding="utf-8",
    )

    layout = {
        "panel": [PANEL_W, PANEL_H],
        "gold": [GOLD_W, GOLD_H],
        "btn": BTN,
        "icon": ICON,
        "edge": EDGE,
        "stackGap": STACK_GAP,
        "date": DATE,
        "weather": WEATHER,
        "season": SEASON,
        "time": TIME,
        "dial": [DIAL_CX, DIAL_CY, DIAL_R],
        "prefab": "assets/prefabs/ui/FarmInfoBoard.prefab",
        "prefabUuid": prefab_uuid,
    }
    LAYOUT_JSON.write_text(json.dumps(layout, indent=2) + "\n", encoding="utf-8")

    # catalog
    if CATALOG.exists():
        data = json.loads(CATALOG.read_text(encoding="utf-8"))
        by_id = {it["id"]: i for i, it in enumerate(data["items"])}
        item = {
            "id": "FarmInfoBoard",
            "kind": "panel",
            "spriteType": "simple",
            "designSize": [PANEL_W, TOTAL_H],
            "path": "assets/prefabs/ui/FarmInfoBoard.prefab",
            "prefab": "assets/prefabs/ui/FarmInfoBoard.prefab",
            "layer": "UI",
        }
        if "FarmInfoBoard" in by_id:
            data["items"][by_id["FarmInfoBoard"]] = item
        else:
            data["items"].append(item)
        CATALOG.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    print("prefab", OUT_PREFAB.relative_to(ROOT), prefab_uuid)


if __name__ == "__main__":
    main()
