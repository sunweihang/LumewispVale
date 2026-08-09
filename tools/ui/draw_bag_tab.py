#!/usr/bin/env python3
"""Draw a wide wood inventory Tab plate (sits on hotbar rim) and sync ToolFrames."""

import json
import uuid
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "assets/textures/ui/ui-bag-tab.png"
UUID_MAP = Path(__file__).resolve().parent / "uuid-map.json"
TF = Path(__file__).resolve().parent / "tool-frames.json"
CATALOG = Path(__file__).resolve().parent / "catalog.json"
TEX_SUFFIX = "6c48a"
SF_SUFFIX = "f9941"

# Logical pixels → NEAREST ×3 export (wide folder-style tab).
LW, LH = 64, 30
SCALE = 3
OW, OH = LW * SCALE, LH * SCALE


def draw_tab() -> Image.Image:
    img = Image.new("RGBA", (LW, LH), (0, 0, 0, 0))
    p = img.load()

    o = (36, 26, 16, 255)
    wood = (118, 78, 42, 255)
    wood_hi = (158, 112, 62, 255)
    wood_lo = (86, 54, 28, 255)
    nail = (58, 38, 20, 255)
    fill = (214, 176, 118, 255)
    fill_hi = (230, 198, 140, 255)
    plank = (188, 148, 92, 255)
    seam = (62, 42, 28, 255)
    seam_hi = (78, 54, 36, 255)

    def put(x, y, c):
        if 0 <= x < LW and 0 <= y < LH:
            p[x, y] = c

    # Folder-tab silhouette: rounded top, open bottom into hotbar.
    # y → (x_start, x_end) inclusive
    rows: dict[int, tuple[int, int]] = {
        0: (8, LW - 9),
        1: (5, LW - 6),
        2: (3, LW - 4),
        3: (2, LW - 3),
        4: (1, LW - 2),
    }
    for y in range(5, LH):
        rows[y] = (0, LW - 1)

    for y, (x0, x1) in rows.items():
        for x in range(x0, x1 + 1):
            put(x, y, fill)

    # Top highlight
    for y in (5, 6):
        x0, x1 = rows[y]
        for x in range(x0 + 3, x1 - 2):
            put(x, y, fill_hi)

    # Plank grain
    for y in (12, 18, 24):
        x0, x1 = rows[y]
        for x in range(x0 + 4, x1 - 3):
            put(x, y, plank)

    # Wood rim: top + sides (bottom left open)
    for y, (x0, x1) in rows.items():
        put(x0, y, wood)
        put(x1, y, wood)
        if y <= 4:
            for x in range(x0, x1 + 1):
                put(x, y, wood_hi if y <= 1 else wood)

    # Inner top bevel + side bevels
    for x in range(4, LW - 4):
        put(x, 5, wood_lo)
    for y in range(6, LH - 2):
        put(1, y, wood_hi)
        put(LW - 2, y, wood_lo)
        put(2, y, wood)
        put(LW - 3, y, wood)

    # Corner nails
    for cx, cy in ((4, 7), (LW - 5, 7)):
        put(cx, cy, nail)
        put(cx + 1, cy, wood_lo)
        put(cx, cy + 1, wood_lo)

    # Dock seam into hotbar bar color
    for x in range(LW):
        put(x, LH - 1, seam)
        if 1 <= x <= LW - 2:
            put(x, LH - 2, seam_hi)

    # Outline (skip open bottom)
    opaque = [(x, y) for y in range(LH) for x in range(LW) if p[x, y][3] > 0]
    border = set()
    for x, y in opaque:
        for dx, dy in ((-1, 0), (1, 0), (0, -1), (0, 1)):
            nx, ny = x + dx, y + dy
            if not (0 <= nx < LW and 0 <= ny < LH) or p[nx, ny][3] == 0:
                if ny >= LH - 1:
                    continue
                border.add((nx, ny))
    for x, y in border:
        if 0 <= x < LW and 0 <= y < LH and p[x, y][3] == 0:
            put(x, y, o)

    return img.resize((OW, OH), Image.NEAREST)


def write_meta(png: Path, image_uuid: str, w: int, h: int) -> str:
    meta_path = Path(str(png) + ".meta")
    hw, hh = w / 2.0, h / 2.0
    if meta_path.exists():
        meta = json.loads(meta_path.read_text(encoding="utf-8"))
        image_uuid = meta.get("uuid", image_uuid)
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
                "displayName": "ui-bag-tab",
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
                "displayName": "ui-bag-tab",
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


def upsert_catalog(sf: str) -> None:
    if not CATALOG.exists():
        return
    cat = json.loads(CATALOG.read_text(encoding="utf-8"))
    entries = cat.get("entries") or cat.get("items") or []
    key = "entries" if "entries" in cat else ("items" if "items" in cat else None)
    entry = {
        "id": "ui-bag-tab",
        "kind": "chrome",
        "spriteType": "simple",
        "designSize": [OW, OH],
        "path": "assets/textures/ui/ui-bag-tab.png",
        "prefab": "",
        "layer": "UI",
        "spriteFrame": sf,
    }
    if key is None:
        return
    found = False
    for i, e in enumerate(cat[key]):
        if e.get("id") == "ui-bag-tab":
            cat[key][i] = {**e, **entry}
            found = True
            break
    if not found:
        cat[key].append(entry)
    CATALOG.write_text(json.dumps(cat, indent=2) + "\n", encoding="utf-8")


def main() -> None:
    OUT.parent.mkdir(parents=True, exist_ok=True)
    draw_tab().save(OUT)

    umap: dict = {}
    if UUID_MAP.exists():
        umap = json.loads(UUID_MAP.read_text(encoding="utf-8"))
    image_uuid = write_meta(OUT, umap.get("ui-bag-tab", {}).get("texture") or str(uuid.uuid4()), OW, OH)
    sf = "{}@{}".format(image_uuid, SF_SUFFIX)
    umap["ui-bag-tab"] = {"texture": image_uuid, "prefab": "", "spriteFrame": sf}
    UUID_MAP.write_text(json.dumps(umap, indent=2) + "\n", encoding="utf-8")

    tools = {}
    if TF.exists():
        tools = json.loads(TF.read_text(encoding="utf-8"))
    tools["bagTab"] = sf
    TF.write_text(json.dumps(tools, indent=2) + "\n", encoding="utf-8")
    (ROOT / "assets/scripts/game/ToolFrames.ts").write_text(
        "/** Auto-synced from tools/ui/tool-frames.json */\n"
        "export const TOOL_FRAMES = {}\n".format(json.dumps(tools, indent=4)),
        encoding="utf-8",
    )
    upsert_catalog(sf)
    print("OK", OUT.relative_to(ROOT), "{}x{}".format(OW, OH), sf)


if __name__ == "__main__":
    main()
