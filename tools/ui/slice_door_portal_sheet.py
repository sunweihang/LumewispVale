#!/usr/bin/env python3
"""Slice AI door-portal sheet → 4 looping frames + frames catalog.

Source: tools/ui/ai-source/prop-door-portal-sheet-ai-ref.png
Out:
  assets/textures/props/prop-door-portal-{0..3}.png
  assets/textures/props/prop-door-portal.png  (frame 0, bake default)
  tools/ui/door-portal-frames.json
  assets/scripts/game/DoorPortalFrames.ts

    python tools/ui/slice_door_portal_sheet.py
"""

from __future__ import annotations

import json
import uuid
from pathlib import Path

from PIL import Image

from portal_rmbg_buildings import SF_SUFFIX, UUID_MAP
from portal_rmbg_mayor_house import resolve_uuid, write_meta
from process_bag_ai import flood_corners, knock_gray_bg

ROOT = Path(__file__).resolve().parents[2]
AI = Path(__file__).resolve().parent / "ai-source"
SRC = AI / "prop-door-portal-sheet-ai-ref.png"
PROPS = ROOT / "assets/textures/props"
FRAMES_JSON = Path(__file__).resolve().parent / "door-portal-frames.json"
FRAMES_TS = ROOT / "assets/scripts/game/DoorPortalFrames.ts"

TW, TH = 80, 144
N_FRAMES = 4


def boost(im: Image.Image) -> Image.Image:
    px = im.load()
    w, h = im.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a < 14:
                px[x, y] = (0, 0, 0, 0)
                continue
            r = min(255, int(r * 1.12 + 16))
            g = min(255, int(g * 1.08 + 10))
            b = min(255, int(b * 0.92 + 6))
            a = min(255, int(a * 1.2 + 20))
            r = (r // 8) * 8
            g = (g // 8) * 8
            b = (b // 8) * 8
            px[x, y] = (r, g, b, a)
    return im


def fit_foot(im: Image.Image) -> Image.Image:
    bbox = im.getbbox()
    if not bbox:
        return Image.new("RGBA", (TW, TH), (0, 0, 0, 0))
    cropped = im.crop(bbox)
    cw, ch = cropped.size
    pad = 2
    scale = min((TW - pad * 2) / float(cw), (TH - pad * 2) / float(ch))
    nw = max(1, int(round(cw * scale)))
    nh = max(1, int(round(ch * scale)))
    work = cropped
    if cw > TW * 2 or ch > TH * 2:
        work = cropped.resize((nw, nh), Image.BOX)
    work = work.resize((nw, nh), Image.NEAREST)
    work = boost(work)
    out = Image.new("RGBA", (TW, TH), (0, 0, 0, 0))
    x = (TW - nw) // 2
    y = max(0, TH - nh - 1)
    out.paste(work, (x, y), work)
    return out


def split_row(sheet: Image.Image, n: int) -> list[Image.Image]:
    w, h = sheet.size
    cw = w // n
    cells = []
    for i in range(n):
        cells.append(sheet.crop((i * cw, 0, (i + 1) * cw, h)))
    return cells


def write_ts(uuids: list[str]) -> None:
    lines = [
        "/** Auto-synced from tools/ui/door-portal-frames.json */",
        "export const DOOR_PORTAL_FRAMES = {",
        f'    cellSize: [{TW}, {TH}] as const,',
        f"    fps: 8,",
        "    frames: [",
    ]
    for u in uuids:
        lines.append(f'        "{u}",')
    lines.append("    ] as const,")
    lines.append("};")
    lines.append("")
    FRAMES_TS.write_text("\n".join(lines), encoding="utf-8")


def ensure_ts_meta() -> None:
    meta = FRAMES_TS.with_suffix(".ts.meta")
    if meta.exists():
        return
    meta.write_text(
        json.dumps(
            {
                "ver": "4.0.24",
                "importer": "typescript",
                "imported": True,
                "uuid": str(uuid.uuid4()),
                "files": [],
                "subMetas": {},
                "userData": {},
            },
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )


def main() -> None:
    if not SRC.exists():
        raise SystemExit(f"missing sheet: {SRC}")

    umap = json.loads(UUID_MAP.read_text(encoding="utf-8")) if UUID_MAP.exists() else {}
    PROPS.mkdir(parents=True, exist_ok=True)

    sheet = knock_gray_bg(Image.open(SRC).convert("RGBA"))
    sheet = flood_corners(sheet)
    cells = split_row(sheet, N_FRAMES)
    print(f"sheet {sheet.size} -> {N_FRAMES} cells")

    frame_uuids: list[str] = []
    for i, cell in enumerate(cells):
        out = fit_foot(cell)
        name = f"prop-door-portal-{i}"
        path = PROPS / f"{name}.png"
        image_uuid = resolve_uuid(path)
        out.save(path)
        write_meta(path, image_uuid, TW, TH, name, 0.0)
        sf = f"{image_uuid}@{SF_SUFFIX}"
        frame_uuids.append(sf)
        umap[name] = {"texture": image_uuid, "spriteFrame": sf, "prefab": ""}
        a = out.split()[3]
        nz = [v for v in a.getdata() if v > 0]
        print(f"  {name} maxA={max(a.getdata())} meanA={sum(nz)/len(nz):.0f}")

        if i == 0:
            # Bake / static default shares frame 0 pixels but keeps its own UUID.
            base = PROPS / "prop-door-portal.png"
            base_uuid = resolve_uuid(base)
            out.save(base)
            write_meta(base, base_uuid, TW, TH, "prop-door-portal", 0.0)
            umap["prop-door-portal"] = {
                "texture": base_uuid,
                "spriteFrame": f"{base_uuid}@{SF_SUFFIX}",
                "prefab": umap.get("prop-door-portal", {}).get("prefab", ""),
            }

    FRAMES_JSON.write_text(
        json.dumps(
            {"cellSize": [TW, TH], "fps": 8, "frames": frame_uuids},
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    write_ts(frame_uuids)
    ensure_ts_meta()
    UUID_MAP.write_text(json.dumps(umap, indent=2) + "\n", encoding="utf-8")

    # Contact strip preview
    preview = Image.new("RGBA", (TW * N_FRAMES, TH), (40, 40, 40, 255))
    for i in range(N_FRAMES):
        fr = Image.open(PROPS / f"prop-door-portal-{i}.png").convert("RGBA")
        preview.paste(fr, (i * TW, 0), fr)
    prev_path = AI / "prop-door-portal-frames-preview.png"
    preview.save(prev_path)
    print(f"OK frames -> {FRAMES_TS}")
    print(f"preview {prev_path}")


if __name__ == "__main__":
    main()
