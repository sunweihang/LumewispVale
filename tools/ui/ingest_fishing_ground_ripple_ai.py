#!/usr/bin/env python3
"""AI fishing ground-tap ripple → assets/textures/ui/ui-fishing-ground-ripple.png

Source: tools/ui/ai-source/fishing-ground-ripple-ai-ref.png

  /usr/local/bin/python3 tools/ui/ingest_fishing_ground_ripple_ai.py
"""

from __future__ import print_function

import json
import uuid
from pathlib import Path

from PIL import Image

from process_bag_ai import (
    SF_SUFFIX,
    flood_corners,
    knock_gray_bg,
    pixelize,
    write_meta,
)

ROOT = Path(__file__).resolve().parents[2]
SRC = Path(__file__).resolve().parent / "ai-source" / "fishing-ground-ripple-ai-ref.png"
OUT = ROOT / "assets/textures/ui" / "ui-fishing-ground-ripple.png"
UUID_MAP = Path(__file__).resolve().parent / "uuid-map.json"
FF = Path(__file__).resolve().parent / "fishing-frames.json"
OUT_TS = ROOT / "assets/scripts/game" / "FishingFrames.ts"
CATALOG = Path(__file__).resolve().parent / "catalog.json"

# Display size on canvas (tutorial ground cue).
SIZE = 128
LOGICAL = 64
COLORS = 28
MAP_KEY = "ui-fishing-ground-ripple"


def warm_for_water(im: Image.Image) -> Image.Image:
    """Remap cyan fills → cream so the cue reads on blue pond water."""
    out = im.convert("RGBA")
    px = out.load()
    w, h = out.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a < 8:
                continue
            lum = (r + g + b) / 3.0
            if lum < 70:
                continue
            blueish = b >= r - 8 and b >= g - 20 and b > 90
            if blueish:
                t = min(1.0, max(0.0, (lum - 90) / 140.0))
                px[x, y] = (
                    int(245 + 10 * t),
                    int(228 + 20 * t),
                    int(170 + 40 * t),
                    min(255, int(a * 1.15 + 20)),
                )
            elif 70 <= lum < 150 and abs(r - g) < 40 and abs(g - b) < 40:
                px[x, y] = (
                    min(255, r + 30),
                    min(255, g + 18),
                    max(0, b - 10),
                    min(255, a + 15),
                )
    return out


def sync_frames(sf):
    data = {}
    if FF.exists():
        data = json.loads(FF.read_text(encoding="utf-8"))
    data["groundRipple"] = sf
    FF.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
    OUT_TS.write_text(
        "/** Auto-synced from tools/ui/fishing-frames.json */\n"
        "export const FISHING_FRAMES = {}\n".format(json.dumps(data, indent=4)),
        encoding="utf-8",
    )

    if not CATALOG.exists():
        return
    cat = json.loads(CATALOG.read_text(encoding="utf-8"))
    key = "entries" if "entries" in cat else ("items" if "items" in cat else None)
    if key is None:
        return
    by_id = {e.get("id"): i for i, e in enumerate(cat[key]) if isinstance(e, dict)}
    entry = {
        "id": MAP_KEY,
        "kind": "chrome",
        "group": "fishing",
        "path": "assets/textures/ui/{}.png".format(MAP_KEY),
        "spriteFrame": sf,
        "size": [SIZE, SIZE],
        "tags": ["fishing", "guide", "ripple", "ai"],
    }
    if MAP_KEY in by_id:
        cat[key][by_id[MAP_KEY]] = {**cat[key][by_id[MAP_KEY]], **entry}
    else:
        idx = by_id.get("ui-fishing-bar-miss")
        if idx is not None:
            cat[key].insert(idx + 1, entry)
        else:
            cat[key].append(entry)
    CATALOG.write_text(json.dumps(cat, indent=2) + "\n", encoding="utf-8")


def main():
    if not SRC.exists():
        raise SystemExit("missing {}".format(SRC))
    im = Image.open(SRC).convert("RGBA")
    im = knock_gray_bg(im)
    im = flood_corners(im)

    out = pixelize(im, LOGICAL, SIZE, COLORS)
    # Cool cyan rings vanish on lake tiles — warm cream + keep dark outlines.
    out = warm_for_water(out)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    out.save(OUT)

    umap = {}
    if UUID_MAP.exists():
        umap = json.loads(UUID_MAP.read_text(encoding="utf-8"))
    image_uuid = write_meta(
        OUT,
        umap.get(MAP_KEY, {}).get("texture") or str(uuid.uuid4()),
        SIZE,
        SIZE,
        MAP_KEY,
    )
    sf = "{}@{}".format(image_uuid, SF_SUFFIX)
    umap[MAP_KEY] = {"texture": image_uuid, "prefab": "", "spriteFrame": sf}
    UUID_MAP.write_text(json.dumps(umap, indent=2) + "\n", encoding="utf-8")
    sync_frames(sf)
    print("OK", OUT.relative_to(ROOT), sf, out.size)


if __name__ == "__main__":
    main()
