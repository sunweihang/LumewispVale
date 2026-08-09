#!/usr/bin/env python3
"""Draw Stardew-like wood-frame close (X) icon and sync ToolFrames."""

import json
import uuid
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "assets/textures/ui/ic-close.png"
UUID_MAP = Path(__file__).resolve().parent / "uuid-map.json"
TF = Path(__file__).resolve().parent / "tool-frames.json"
CATALOG = Path(__file__).resolve().parent / "catalog.json"
TEX_SUFFIX = "6c48a"
SF_SUFFIX = "f9941"


def draw_icon() -> Image.Image:
    s = 32
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    p = img.load()

    o = (54, 30, 14, 255)
    wood_dk = (122, 62, 22, 255)
    wood = (186, 110, 36, 255)
    wood_hi = (230, 150, 58, 255)
    wood_hi2 = (245, 190, 110, 255)
    inset = (232, 198, 140, 255)
    inset_dk = (200, 162, 108, 255)
    mark = (72, 42, 22, 255)
    mark_hi = (96, 54, 28, 255)

    def put(x, y, c):
        if 0 <= x < s and 0 <= y < s:
            p[x, y] = c

    def fill_rect(x0, y0, x1, y1, c):
        for y in range(y0, y1 + 1):
            for x in range(x0, x1 + 1):
                put(x, y, c)

    # Wood plate with soft corner cuts
    for y in range(3, 29):
        for x in range(3, 29):
            corner = (
                (x < 5 and y < 5)
                or (x > 26 and y < 5)
                or (x < 5 and y > 26)
                or (x > 26 and y > 26)
            )
            if corner and ((x in (3, 28) and y in (3, 28)) or (x in (3, 28) and y in (4, 27)) or (x in (4, 27) and y in (3, 28))):
                continue
            edge_l = x <= 4
            edge_t = y <= 4
            edge_r = x >= 27
            edge_b = y >= 27
            if edge_l or edge_t:
                c = wood_hi
            elif edge_r or edge_b:
                c = wood_dk
            else:
                c = wood
            put(x, y, c)

    fill_rect(5, 5, 26, 5, wood_hi2)
    fill_rect(5, 5, 5, 26, wood_hi)
    fill_rect(7, 7, 24, 24, inset)
    fill_rect(8, 8, 23, 8, wood_hi2)
    fill_rect(8, 23, 23, 23, inset_dk)
    fill_rect(8, 8, 8, 23, wood_hi)
    fill_rect(23, 8, 23, 23, inset_dk)

    # Chunkier X
    for i in range(9, 23):
        for t in (-1, 0, 1):
            put(i, i + t, mark if t == 0 else mark_hi)
            put(i, (31 - i) + t, mark if t == 0 else mark_hi)

    opaque = [(x, y) for y in range(s) for x in range(s) if p[x, y][3] > 0]
    border = set()
    for x, y in opaque:
        for dx, dy in ((-1, 0), (1, 0), (0, -1), (0, 1)):
            nx, ny = x + dx, y + dy
            if not (0 <= nx < s and 0 <= ny < s) or p[nx, ny][3] == 0:
                border.add((nx, ny))
    for x, y in border:
        if 0 <= x < s and 0 <= y < s and p[x, y][3] == 0:
            put(x, y, o)

    return img.resize((96, 96), Image.NEAREST)


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
                "displayName": "ic-close",
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
                "displayName": "ic-close",
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


def sync_catalog(sf: str) -> None:
    if not CATALOG.exists():
        return
    cat = json.loads(CATALOG.read_text(encoding="utf-8"))
    entries = cat.get("entries") or cat.get("items") or []
    if not isinstance(entries, list):
        return
    found = False
    for e in entries:
        if e.get("id") == "ic-close":
            e["path"] = "assets/textures/ui/ic-close.png"
            e["spriteFrame"] = sf
            found = True
            break
    if not found:
        # Mirror backpack entry shape if present
        bp = next((e for e in entries if e.get("id") == "ic-backpack"), None)
        entry = {
            "id": "ic-close",
            "kind": (bp or {}).get("kind", "icon"),
            "path": "assets/textures/ui/ic-close.png",
            "spriteFrame": sf,
        }
        if bp:
            for k in ("group", "size", "tags"):
                if k in bp:
                    entry[k] = bp[k]
        entries.append(entry)
    CATALOG.write_text(json.dumps(cat, indent=2) + "\n", encoding="utf-8")


def main() -> None:
    OUT.parent.mkdir(parents=True, exist_ok=True)
    draw_icon().save(OUT)

    umap: dict = {}
    if UUID_MAP.exists():
        umap = json.loads(UUID_MAP.read_text(encoding="utf-8"))
    image_uuid = write_meta(OUT, umap.get("ic-close", {}).get("texture") or str(uuid.uuid4()), 96, 96)
    sf = "{}@{}".format(image_uuid, SF_SUFFIX)
    umap["ic-close"] = {"texture": image_uuid, "prefab": "", "spriteFrame": sf}
    UUID_MAP.write_text(json.dumps(umap, indent=2) + "\n", encoding="utf-8")

    tools = {}
    if TF.exists():
        tools = json.loads(TF.read_text(encoding="utf-8"))
    tools["close"] = sf
    TF.write_text(json.dumps(tools, indent=2) + "\n", encoding="utf-8")
    (ROOT / "assets/scripts/game/ToolFrames.ts").write_text(
        "/** Auto-synced from tools/ui/tool-frames.json */\n"
        "export const TOOL_FRAMES = {}\n".format(json.dumps(tools, indent=4)),
        encoding="utf-8",
    )
    sync_catalog(sf)
    print("OK", OUT.relative_to(ROOT), sf)


if __name__ == "__main__":
    main()
