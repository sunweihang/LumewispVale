#!/usr/bin/env python3
"""Draw Stardew-like crop-boost pouch icon → assets/textures/ui/ic-boost.png."""

import json
import uuid
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
UI = ROOT / "assets/textures/ui"
UUID_MAP = Path(__file__).resolve().parent / "uuid-map.json"
TF = Path(__file__).resolve().parent / "tool-frames.json"
CATALOG = Path(__file__).resolve().parent / "catalog.json"
OUT_TS = ROOT / "assets/scripts/game/ToolFrames.ts"
TEX_SUFFIX = "6c48a"
SF_SUFFIX = "f9941"
OUTLINE = (40, 28, 18, 255)


def put(p, s, x, y, c):
    if 0 <= x < s and 0 <= y < s:
        p[x, y] = c


def fill_rect(p, s, x0, y0, x1, y1, c):
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            put(p, s, x, y, c)


def fill_ellipse(p, s, cx, cy, rx, ry, c):
    for y in range(cy - ry, cy + ry + 1):
        for x in range(cx - rx, cx + rx + 1):
            nx = (x - cx) / max(1, rx)
            ny = (y - cy) / max(1, ry)
            if nx * nx + ny * ny <= 1.05:
                put(p, s, x, y, c)


def outline_opaque(p, s, color=OUTLINE):
    opaque = [(x, y) for y in range(s) for x in range(s) if p[x, y][3] > 0]
    border = set()
    for x, y in opaque:
        for dx, dy in ((-1, 0), (1, 0), (0, -1), (0, 1)):
            nx, ny = x + dx, y + dy
            if not (0 <= nx < s and 0 <= ny < s) or p[nx, ny][3] == 0:
                border.add((nx, ny))
    for x, y in border:
        if 0 <= x < s and 0 <= y < s and p[x, y][3] == 0:
            put(p, s, x, y, color)


def draw_boost() -> Image.Image:
    """Cloth pouch of sparkle dust — readable at hotbar size."""
    s = 32
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    p = img.load()

    cloth = (168, 92, 58, 255)
    cloth_hi = (214, 140, 78, 255)
    cloth_dk = (118, 58, 34, 255)
    twine = (214, 188, 96, 255)
    twine_dk = (150, 118, 48, 255)
    dust = (255, 220, 96, 255)
    dust_hi = (255, 248, 190, 255)
    glow = (255, 170, 64, 255)

    # Pouch body
    fill_ellipse(p, s, 16, 19, 9, 8, cloth)
    fill_ellipse(p, s, 15, 17, 7, 6, cloth_hi)
    fill_rect(p, s, 10, 20, 22, 25, cloth_dk)
    fill_ellipse(p, s, 16, 24, 8, 3, cloth_dk)

    # Cinched neck
    fill_rect(p, s, 12, 11, 20, 14, cloth)
    fill_rect(p, s, 11, 12, 21, 13, twine)
    put(p, s, 11, 12, twine_dk)
    put(p, s, 21, 13, twine_dk)

    # Open top + dust puff
    fill_ellipse(p, s, 16, 10, 4, 2, cloth_hi)
    fill_ellipse(p, s, 16, 8, 3, 2, dust)
    put(p, s, 14, 7, dust_hi)
    put(p, s, 18, 6, dust)
    put(p, s, 16, 5, glow)
    put(p, s, 12, 8, dust_hi)
    put(p, s, 20, 9, dust)

    # Sparkle ticks
    for x, y in ((7, 10), (24, 8), (9, 16), (23, 15), (16, 3)):
        put(p, s, x, y, dust_hi)
        put(p, s, x + 1, y, glow)

    outline_opaque(p, s)
    return img.resize((96, 96), Image.NEAREST)


def write_meta(path: Path, image_uuid: str, display: str, w: int, h: int) -> str:
    meta_path = Path(str(path) + ".meta")
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
                "displayName": display,
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
                "displayName": display,
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


def main() -> None:
    UI.mkdir(parents=True, exist_ok=True)
    umap: dict = {}
    if UUID_MAP.exists():
        umap = json.loads(UUID_MAP.read_text(encoding="utf-8"))

    out = UI / "ic-boost.png"
    draw_boost().save(out)
    image_uuid = write_meta(
        out,
        umap.get("ic-boost", {}).get("texture") or str(uuid.uuid4()),
        "ic-boost",
        96,
        96,
    )
    sf = "{}@{}".format(image_uuid, SF_SUFFIX)
    umap["ic-boost"] = {"texture": image_uuid, "prefab": "", "spriteFrame": sf}
    UUID_MAP.write_text(json.dumps(umap, indent=2) + "\n", encoding="utf-8")

    tools = {}
    if TF.exists():
        tools = json.loads(TF.read_text(encoding="utf-8"))
    # Keep tool order: insert boost after rod.
    ordered = {}
    for k in ("hand", "hoe", "seeds", "can", "axe", "rod", "boost"):
        if k == "boost":
            ordered[k] = sf
        elif k in tools:
            ordered[k] = tools[k]
    for k, v in tools.items():
        if k not in ordered:
            ordered[k] = v
    TF.write_text(json.dumps(ordered, indent=2) + "\n", encoding="utf-8")
    OUT_TS.write_text(
        "/** Auto-synced from tools/ui/tool-frames.json */\n"
        "export const TOOL_FRAMES = {}\n".format(json.dumps(ordered, indent=4)),
        encoding="utf-8",
    )

    if CATALOG.exists():
        cat = json.loads(CATALOG.read_text(encoding="utf-8"))
        entries = cat.get("entries") or cat.get("items") or []
        if isinstance(entries, list):
            by_id = {e.get("id"): e for e in entries if isinstance(e, dict)}
            eid = "ic-boost"
            path = "assets/textures/ui/ic-boost.png"
            if eid in by_id:
                by_id[eid]["path"] = path
                by_id[eid]["spriteFrame"] = sf
            else:
                entries.append(
                    {
                        "id": eid,
                        "kind": "icon",
                        "group": "tool",
                        "path": path,
                        "spriteFrame": sf,
                        "size": [96, 96],
                        "tags": ["tool", "boost"],
                    }
                )
            CATALOG.write_text(json.dumps(cat, indent=2) + "\n", encoding="utf-8")

    print("OK", out.relative_to(ROOT), sf)


if __name__ == "__main__":
    main()
