#!/usr/bin/env python3
"""AI move-stick chrome → assets/textures/ui/

Sources (tools/ui/ai-source/):
  joystick-base-ai-ref.png → ui-joystick-base.png
  joystick-knob-ai-ref.png → ui-joystick-knob.png

  /usr/local/bin/python3 tools/ui/ingest_joystick_ai.py
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
SRC = Path(__file__).resolve().parent / "ai-source"
OUT_DIR = ROOT / "assets/textures/ui"
UUID_MAP = Path(__file__).resolve().parent / "uuid-map.json"
FF = Path(__file__).resolve().parent / "joystick-frames.json"
OUT_TS = ROOT / "assets/scripts/game" / "JoystickFrames.ts"
CATALOG = Path(__file__).resolve().parent / "catalog.json"

JOBS = (
    {
        "src": "joystick-base-ai-ref.png",
        "out": "ui-joystick-base.png",
        "map_key": "ui-joystick-base",
        "ff_key": "base",
        "logical": 96,
        "size": 192,
        "colors": 28,
        "tags": ["joystick", "base", "ai"],
    },
    {
        "src": "joystick-knob-ai-ref.png",
        "out": "ui-joystick-knob.png",
        "map_key": "ui-joystick-knob",
        "ff_key": "knob",
        "logical": 48,
        "size": 96,
        "colors": 24,
        "tags": ["joystick", "knob", "ai"],
    },
)


def sync_frames(updates):
    data = {}
    if FF.exists():
        data = json.loads(FF.read_text(encoding="utf-8"))
    data.update(updates)
    FF.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
    OUT_TS.write_text(
        "/** Auto-synced from tools/ui/joystick-frames.json */\n"
        "export const JOYSTICK_FRAMES = {}\n".format(json.dumps(data, indent=4)),
        encoding="utf-8",
    )

    if not CATALOG.exists():
        return
    cat = json.loads(CATALOG.read_text(encoding="utf-8"))
    key = "entries" if "entries" in cat else ("items" if "items" in cat else None)
    if key is None:
        return
    by_id = {e.get("id"): i for i, e in enumerate(cat[key]) if isinstance(e, dict)}
    for job in JOBS:
        mk = job["map_key"]
        sf = updates.get(job["ff_key"])
        if not sf:
            continue
        entry = {
            "id": mk,
            "kind": "chrome",
            "group": "joystick",
            "path": "assets/textures/ui/{}.png".format(mk),
            "spriteFrame": sf,
            "size": [job["size"], job["size"]],
            "tags": job["tags"],
        }
        if mk in by_id:
            cat[key][by_id[mk]] = {**cat[key][by_id[mk]], **entry}
        else:
            cat[key].append(entry)
            by_id[mk] = len(cat[key]) - 1
    CATALOG.write_text(json.dumps(cat, indent=2) + "\n", encoding="utf-8")


def clear_pale_card(im: Image.Image) -> Image.Image:
    """Drop white/pale paper behind circular pads."""
    im = im.convert("RGBA")
    px = im.load()
    w, h = im.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a == 0:
                continue
            bright = (r + g + b) / 3.0
            chroma = max(r, g, b) - min(r, g, b)
            if bright >= 210 and chroma < 40:
                px[x, y] = (0, 0, 0, 0)
    return im


def main():
    umap = {}
    if UUID_MAP.exists():
        umap = json.loads(UUID_MAP.read_text(encoding="utf-8"))
    updates = {}
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    for job in JOBS:
        src = SRC / job["src"]
        if not src.exists():
            raise SystemExit("missing {}".format(src))
        im = Image.open(src).convert("RGBA")
        im = knock_gray_bg(im)
        im = flood_corners(im)
        im = clear_pale_card(im)

        out = pixelize(im, job["logical"], job["size"], job["colors"])
        out_path = OUT_DIR / job["out"]
        out.save(out_path)

        image_uuid = write_meta(
            out_path,
            umap.get(job["map_key"], {}).get("texture") or str(uuid.uuid4()),
            job["size"],
            job["size"],
            job["map_key"],
        )
        sf = "{}@{}".format(image_uuid, SF_SUFFIX)
        umap[job["map_key"]] = {"texture": image_uuid, "prefab": "", "spriteFrame": sf}
        updates[job["ff_key"]] = sf
        print("OK", out_path.relative_to(ROOT), sf, out.size)

    UUID_MAP.write_text(json.dumps(umap, indent=2) + "\n", encoding="utf-8")
    sync_frames(updates)
    print("synced joystick-frames + JoystickFrames.ts")


if __name__ == "__main__":
    main()
