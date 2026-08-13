#!/usr/bin/env python3
"""Slice AI UI chrome sheets → assets/textures/ui + UiChromeFrames.ts.

  /opt/homebrew/bin/python3.12 tools/ui/process_ui_chrome_ai.py

Sources (tools/ui/ai-source/):
  ui-chrome-btns-rows-ai-ref.png
  ui-chrome-dialogue-tip-ai-ref.png
  ui-chrome-panel-hotbar-slot-ai-ref.png

Also aliases existing quest AI chrome (panel / primary btn / row) into UiChromeFrames.
"""
from __future__ import annotations

import json
import uuid
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
AI = Path(__file__).resolve().parent / "ai-source"
OUT = ROOT / "assets/textures/ui"
UUID_MAP = Path(__file__).resolve().parent / "uuid-map.json"
FRAMES_JSON = Path(__file__).resolve().parent / "ui-chrome-frames.json"
FRAMES_TS = ROOT / "assets/scripts/game/UiChromeFrames.ts"
TEX_SUFFIX = "6c48a"
SF_SUFFIX = "f9941"

try:
    RESAMPLE = Image.Resampling.NEAREST
except AttributeError:
    RESAMPLE = Image.NEAREST

# Logical display sizes (design px)
SIZES = {
    "ui-wood-panel": (720, 980),
    "ui-wood-btn-primary": (320, 72),
    "ui-wood-btn-muted": (320, 72),
    "ui-wood-btn-on": (180, 48),
    "ui-wood-btn-off": (180, 48),
    "ui-parchment-row": (640, 92),
    "ui-dialogue-box": (1000, 280),
    "ui-tip-bubble": (420, 165),
    "ui-hotbar-bg": (1080, 180),
    "ui-slot-plate": (150, 150),
}

# Nine-slice borders (px at texture size = SIZES)
BORDERS = {
    "ui-wood-panel": (48, 48, 48, 48),
    "ui-wood-btn-primary": (16, 16, 20, 20),
    "ui-wood-btn-muted": (16, 16, 20, 20),
    "ui-wood-btn-on": (12, 12, 16, 16),
    "ui-wood-btn-off": (12, 12, 16, 16),
    "ui-parchment-row": (14, 14, 18, 18),
    "ui-dialogue-box": (28, 28, 36, 36),
    "ui-tip-bubble": (24, 36, 28, 28),  # thicker bottom for tail
    "ui-hotbar-bg": (20, 20, 40, 40),
    "ui-slot-plate": (24, 24, 24, 24),
}


def load_uuid_map() -> dict:
    if UUID_MAP.exists():
        return json.loads(UUID_MAP.read_text(encoding="utf-8"))
    return {}


def save_uuid_map(m: dict) -> None:
    UUID_MAP.write_text(json.dumps(m, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def knock_bg(im: Image.Image) -> Image.Image:
    im = im.convert("RGBA")
    px = im.load()
    w, h = im.size
    # sample corners for bg
    corners = [px[0, 0], px[w - 1, 0], px[0, h - 1], px[w - 1, h - 1]]
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a < 20:
                px[x, y] = (0, 0, 0, 0)
                continue
            # near-white / light gray studio
            if r > 230 and g > 230 and b > 230:
                px[x, y] = (0, 0, 0, 0)
                continue
            if abs(r - g) < 10 and abs(g - b) < 10 and r > 200:
                px[x, y] = (0, 0, 0, 0)
                continue
            # match corner bg loosely
            for cr, cg, cb, ca in corners:
                if ca < 20:
                    continue
                if abs(r - cr) < 18 and abs(g - cg) < 18 and abs(b - cb) < 18:
                    px[x, y] = (0, 0, 0, 0)
                    break
    return im


def opaque_bbox(im: Image.Image, thr: int = 16):
    a = im.split()[-1]
    return a.point(lambda p: 255 if p >= thr else 0).getbbox()


def find_blobs(im: Image.Image, min_area: int = 800):
    """Simple flood-fill blob detection on alpha."""
    im = im.convert("RGBA")
    w, h = im.size
    px = im.load()
    seen = [[False] * w for _ in range(h)]
    blobs = []

    def is_solid(x, y):
        return px[x, y][3] >= 24

    for y in range(h):
        for x in range(w):
            if seen[y][x] or not is_solid(x, y):
                continue
            stack = [(x, y)]
            seen[y][x] = True
            minx = maxx = x
            miny = maxy = y
            area = 0
            while stack:
                cx, cy = stack.pop()
                area += 1
                minx = min(minx, cx)
                maxx = max(maxx, cx)
                miny = min(miny, cy)
                maxy = max(maxy, cy)
                for nx, ny in ((cx - 1, cy), (cx + 1, cy), (cx, cy - 1), (cx, cy + 1)):
                    if 0 <= nx < w and 0 <= ny < h and not seen[ny][nx] and is_solid(nx, ny):
                        seen[ny][nx] = True
                        stack.append((nx, ny))
            if area >= min_area:
                blobs.append((minx, miny, maxx + 1, maxy + 1, area))
    blobs.sort(key=lambda b: (-b[4], b[1], b[0]))
    return blobs


def crop_pad(im: Image.Image, box, pad=2) -> Image.Image:
    x0, y0, x1, y1 = box[:4]
    x0 = max(0, x0 - pad)
    y0 = max(0, y0 - pad)
    x1 = min(im.width, x1 + pad)
    y1 = min(im.height, y1 + pad)
    return im.crop((x0, y0, x1, y1))


def fit_nearest(im: Image.Image, tw: int, th: int) -> Image.Image:
    cut = im
    bb = opaque_bbox(cut)
    if bb:
        cut = cut.crop(bb)
    # leave 1px transparent edge
    nw, nh = max(1, tw - 2), max(1, th - 2)
    cut = cut.resize((nw, nh), RESAMPLE)
    out = Image.new("RGBA", (tw, th), (0, 0, 0, 0))
    out.paste(cut, ((tw - nw) // 2, (th - nh) // 2), cut)
    return out


def write_meta(name: str, tex_uuid: str, w: int, h: int, borders) -> None:
    bt, bb, bl, br = borders
    meta_path = OUT / f"{name}.png.meta"
    if meta_path.exists():
        old = json.loads(meta_path.read_text(encoding="utf-8"))
        tex_uuid = old.get("uuid", tex_uuid)
    meta = {
        "ver": "1.0.27",
        "importer": "image",
        "imported": True,
        "uuid": tex_uuid,
        "files": [".json", ".png"],
        "subMetas": {
            TEX_SUFFIX: {
                "importer": "texture",
                "uuid": f"{tex_uuid}@{TEX_SUFFIX}",
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
                    "imageUuidOrDatabaseUri": tex_uuid,
                    "visible": False,
                },
                "ver": "1.0.22",
                "imported": True,
                "files": [".json"],
                "subMetas": {},
            },
            SF_SUFFIX: {
                "importer": "sprite-frame",
                "uuid": f"{tex_uuid}@{SF_SUFFIX}",
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
                    "borderTop": bt,
                    "borderBottom": bb,
                    "borderLeft": bl,
                    "borderRight": br,
                    "packable": True,
                    "pixelsToUnit": 100,
                    "pivotX": 0.5,
                    "pivotY": 0.5,
                    "meshType": 0,
                    "trimType": "custom",
                },
                "ver": "1.0.12",
                "imported": True,
                "files": [".json"],
                "subMetas": {},
            },
        },
        "userData": {"type": "sprite-frame", "hasAlpha": True, "redirect": f"{tex_uuid}@{SF_SUFFIX}"},
    }
    meta_path.write_text(json.dumps(meta, indent=2) + "\n", encoding="utf-8")


def export_named(name: str, im: Image.Image, uuid_map: dict) -> str:
    tw, th = SIZES[name]
    out = fit_nearest(im, tw, th)
    OUT.mkdir(parents=True, exist_ok=True)
    path = OUT / f"{name}.png"
    tex_uuid = uuid_map.get(name) or str(uuid.uuid4())
    if (path.with_suffix(".png.meta")).exists():
        tex_uuid = json.loads(path.with_suffix(".png.meta").read_text(encoding="utf-8")).get(
            "uuid", tex_uuid
        )
    uuid_map[name] = tex_uuid
    out.save(path)
    write_meta(name, tex_uuid, tw, th, BORDERS[name])
    print("wrote", path, tw, th)
    return f"{tex_uuid}@{SF_SUFFIX}"


def pick_blobs_by_layout(blobs, sheet_w, sheet_h, layout: str):
    """layout: '2x2' | '2v' | '3h' — return ordered blobs."""
    if not blobs:
        return []
    # use centers
    items = []
    for b in blobs:
        x0, y0, x1, y1, area = b
        cx = (x0 + x1) * 0.5
        cy = (y0 + y1) * 0.5
        items.append((cx, cy, b))
    if layout == "2x2":
        items.sort(key=lambda t: (t[1] > sheet_h * 0.5, t[0]))
        # TL, TR, BL, BR by quadrant
        quads = {"tl": None, "tr": None, "bl": None, "br": None}
        for cx, cy, b in items:
            key = ("b" if cy > sheet_h * 0.5 else "t") + ("r" if cx > sheet_w * 0.5 else "l")
            if quads[key] is None or b[4] > quads[key][4]:
                quads[key] = b
        return [quads[k] for k in ("tl", "tr", "bl", "br") if quads[k]]
    if layout == "2v":
        items.sort(key=lambda t: t[1])
        return [t[2] for t in items[:2]]
    if layout == "3h":
        items.sort(key=lambda t: t[0])
        return [t[2] for t in items[:3]]
    return [t[2] for t in items]


def main():
    uuid_map = load_uuid_map()
    frames: dict = {}

    # --- sheet 1: buttons + row ---
    s1 = knock_bg(Image.open(AI / "ui-chrome-btns-rows-ai-ref.png"))
    b1 = find_blobs(s1, min_area=2000)
    ordered = pick_blobs_by_layout(b1, s1.width, s1.height, "2x2")
    names1 = ["ui-wood-btn-muted", "ui-wood-btn-off", "ui-wood-btn-on", "ui-parchment-row"]
    for name, blob in zip(names1, ordered):
        frames[name.replace("ui-", "").replace("-", "_")] = export_named(
            name, crop_pad(s1, blob, 4), uuid_map
        )

    # --- sheet 2: dialogue + tip ---
    s2 = knock_bg(Image.open(AI / "ui-chrome-dialogue-tip-ai-ref.png"))
    b2 = find_blobs(s2, min_area=3000)
    ordered2 = pick_blobs_by_layout(b2, s2.width, s2.height, "2v")
    names2 = ["ui-dialogue-box", "ui-tip-bubble"]
    for name, blob in zip(names2, ordered2):
        frames[name.replace("ui-", "").replace("-", "_")] = export_named(
            name, crop_pad(s2, blob, 4), uuid_map
        )

    # --- sheet 3: panel + hotbar + slot ---
    s3 = knock_bg(Image.open(AI / "ui-chrome-panel-hotbar-slot-ai-ref.png"))
    b3 = find_blobs(s3, min_area=2500)
    ordered3 = pick_blobs_by_layout(b3, s3.width, s3.height, "3h")
    names3 = ["ui-wood-panel", "ui-hotbar-bg", "ui-slot-plate"]
    for name, blob in zip(names3, ordered3):
        frames[name.replace("ui-", "").replace("-", "_")] = export_named(
            name, crop_pad(s3, blob, 4), uuid_map
        )

    # Alias existing quest AI chrome as primary button / fallback panel / row
    quest_frames = Path(__file__).resolve().parent / "quest-frames.json"
    if quest_frames.exists():
        qf = json.loads(quest_frames.read_text(encoding="utf-8"))
        for src_key, dst_key in (
            ("btnPrimary", "wood_btn_primary"),
            ("panel", "wood_panel_alt"),
            ("row", "parchment_row_alt"),
        ):
            v = qf.get(src_key)
            if isinstance(v, dict):
                frames[dst_key] = v.get("spriteFrame", "")
            elif isinstance(v, str):
                frames[dst_key] = v

    # Prefer new wood_panel; if missing, use alt
    if "wood_panel" not in frames and frames.get("wood_panel_alt"):
        frames["wood_panel"] = frames["wood_panel_alt"]
    if "wood_btn_primary" not in frames and frames.get("wood_btn_primary") is None:
        pass
    # Ensure primary from quest
    if frames.get("wood_btn_primary") is None or frames.get("wood_btn_primary") == "":
        # copy quest primary file uuid from existing png meta
        meta = OUT / "ui-quest-btn-primary.png.meta"
        if meta.exists():
            u = json.loads(meta.read_text(encoding="utf-8"))["uuid"]
            frames["wood_btn_primary"] = f"{u}@{SF_SUFFIX}"

    # If primary missing from new sheet, use quest
    if "wood_btn_primary" not in frames:
        meta = OUT / "ui-quest-btn-primary.png.meta"
        if meta.exists():
            u = json.loads(meta.read_text(encoding="utf-8"))["uuid"]
            frames["wood_btn_primary"] = f"{u}@{SF_SUFFIX}"

    save_uuid_map(uuid_map)
    FRAMES_JSON.write_text(json.dumps(frames, indent=2) + "\n", encoding="utf-8")

    lines = [
        "/** Auto-generated by tools/ui/process_ui_chrome_ai.py — AI chrome only. */",
        "export const UI_CHROME_FRAMES = {",
    ]
    for k, v in sorted(frames.items()):
        lines.append(f"    {k}: '{v}',")
    lines.append("} as const;")
    lines.append("")
    FRAMES_TS.write_text("\n".join(lines), encoding="utf-8")
    print("patched", FRAMES_TS)
    print("frames", list(frames.keys()))


if __name__ == "__main__":
    main()
