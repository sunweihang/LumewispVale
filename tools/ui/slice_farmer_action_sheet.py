#!/usr/bin/env python3
"""Slice AI farmer ACTION sheets → 48×64 frames matched to walk body scale.

Pipeline:
  1) Equal 4×4 cell split
  2) Quantize (gray key → transparent)
  3) Cell-uniform BOX → NEAREST×2
  4) Detect character BODY (shirt green + hair brown), ignore tool/dirt sparks
  5) Scale so median standing body height == walk body height
  6) Foot-align (boots on bottom; ignore 1–2px sparks)

Usage:
  /usr/local/bin/python3 tools/ui/slice_farmer_action_sheet.py all
"""

from __future__ import print_function

import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
AI = Path(__file__).resolve().parent / "ai-source"
OUT = ROOT / "assets/textures/chars/farmer"
WALK_REF = OUT / "farmer-down-0.png"
# Default row order expected from prompts. Some AI sheets swap left/right.
DIRS = ("down", "left", "right", "up")
# action → row remap if AI drew right on row1 / left on row2
ROW_DIR_OVERRIDE = {
    # These AI sheets drew RIGHT on row1 / LEFT on row2 (prompt asked left then right).
    "hoe": ("down", "right", "left", "up"),
    "pick": ("down", "right", "left", "up"),
    # chop sheet followed the prompt order.
}
ACTIONS = ("hoe", "chop", "pick")
DW, DH = 48, 64
MID_H = 32


def is_bg(c):
    r, g, b, a = c
    if a < 10:
        return True
    if abs(r - g) < 18 and abs(g - b) < 18 and 95 <= r <= 170:
        return True
    if abs(r - g) < 14 and abs(g - b) < 14 and r >= 165:
        return True
    return False


def is_body_pixel(r, g, b, a):
    """Hair brown / shirt green / skin — not wood tool, not metal, not dirt sparks."""
    if a < 200:
        return False
    # Shirt green
    if g > r + 15 and g > b + 10 and 50 <= g <= 200:
        return True
    # Hair / pants brown
    if r > 60 and r > g + 8 and r > b + 15 and g > 30 and b < 120:
        return True
    # Skin
    if r > 180 and g > 130 and b > 90 and r > b + 20 and abs(r - g) < 80:
        return True
    return False


def quantize(im):
    im = im.convert("RGBA")
    px = im.load()
    w, h = im.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if is_bg((r, g, b, a)) or a < 128:
                px[x, y] = (0, 0, 0, 0)
            else:
                px[x, y] = ((r // 16) * 16 + 8, (g // 16) * 16 + 8, (b // 16) * 16 + 8, 255)
    return im


def content_bounds_full(im):
    px = im.load()
    w, h = im.size
    x0, y0, x1, y1 = w, h, -1, -1
    for y in range(h):
        for x in range(w):
            if not is_bg(px[x, y]) and px[x, y][3] > 0:
                x0 = min(x0, x)
                y0 = min(y0, y)
                x1 = max(x1, x)
                y1 = max(y1, y)
    if x1 < 0:
        raise SystemExit("no opaque content")
    return x0, y0, x1 + 1, y1 + 1


def split_grid(im):
    x0, y0, x1, y1 = content_bounds_full(im)
    w, h = im.size
    if (x1 - x0) >= w * 0.75 and (y1 - y0) >= h * 0.75:
        x0, y0, x1, y1 = 0, 0, w, h
    cw = (x1 - x0) / 4.0
    ch = (y1 - y0) / 4.0
    xspl = [int(round(x0 + i * cw)) for i in range(5)]
    yspl = [int(round(y0 + i * ch)) for i in range(5)]
    xspl[-1], yspl[-1] = x1, y1
    return xspl, yspl


def is_shirt_pixel(r, g, b, a):
    if a < 200:
        return False
    return g > r + 15 and g > b + 10 and 50 <= g <= 200


def is_hair_pixel(r, g, b, a):
    if a < 200:
        return False
    return r > 70 and r > g + 10 and r > b + 18 and 40 < g < 140 and b < 110


def body_bbox(im):
    """
    Character bbox: hair + shirt + pants/boots under the shirt column.
    Excludes wood tool / dirt sparks that stick out sideways or below.
    """
    px = im.load()
    w, h = im.size
    x0, y0, x1, y1 = w, h, -1, -1
    shirt_x0, shirt_x1, shirt_bot = w, -1, -1
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            keep = False
            if is_shirt_pixel(r, g, b, a):
                keep = True
                shirt_x0 = min(shirt_x0, x)
                shirt_x1 = max(shirt_x1, x)
                shirt_bot = max(shirt_bot, y)
            elif is_hair_pixel(r, g, b, a):
                keep = True
            elif a >= 200 and r > 180 and g > 130 and b > 90 and r > b + 20 and abs(r - g) < 80:
                keep = True
            if keep:
                x0 = min(x0, x)
                y0 = min(y0, y)
                x1 = max(x1, x)
                y1 = max(y1, y)
    if x1 < 0:
        return im.getbbox()
    # pants / boots under shirt only
    if shirt_bot >= 0 and shirt_x1 >= 0:
        lx = max(0, shirt_x0 - 3)
        rx = min(w, shirt_x1 + 4)
        for y in range(shirt_bot + 1, h):
            hit = False
            for x in range(lx, rx):
                r, g, b, a = px[x, y]
                if a < 200:
                    continue
                brown = r > 50 and r > g + 4 and r > b + 10 and g < 120 and b < 95
                dark = r < 95 and g < 75 and b < 65 and max(r, g, b) > 20
                if brown or dark or is_shirt_pixel(r, g, b, a):
                    x0 = min(x0, x)
                    x1 = max(x1, x)
                    y1 = max(y1, y)
                    hit = True
            if not hit and y > shirt_bot + 2:
                break
    return (x0, y0, x1 + 1, y1 + 1)


def shirt_center_x(im):
    px = im.load()
    w, h = im.size
    xs = []
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if is_shirt_pixel(r, g, b, a):
                xs.append(x)
    if xs:
        return sum(xs) / float(len(xs))
    return None


def feet_center_x(im):
    """Boots under the shirt column only (ignore hoe tip / dirt to the side)."""
    px = im.load()
    w, h = im.size
    sx0, sx1 = w, -1
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if is_shirt_pixel(r, g, b, a):
                sx0 = min(sx0, x)
                sx1 = max(sx1, x)
    if sx1 < 0:
        return None
    x0 = max(0, sx0 - 2)
    x1 = min(w, sx1 + 3)
    foot = solid_foot_y(im)
    y0 = max(0, foot - 6)
    xs = []
    for y in range(y0, min(h, foot + 1)):
        for x in range(x0, x1):
            r, g, b, a = px[x, y]
            if a < 200:
                continue
            brown = r > 50 and r > g + 4 and r > b + 10 and g < 120 and b < 95
            dark = r < 95 and g < 75 and b < 65 and max(r, g, b) > 20
            if brown or dark:
                xs.append(x)
    if len(xs) >= 4:
        return sum(xs) / float(len(xs))
    return None


def face_center_x(im):
    """Skin + eye pixels in the head band — what the eye tracks between frames."""
    px = im.load()
    w, h = im.size
    xs = []
    for y in range(min(28, h)):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a < 200:
                continue
            skin = r > 180 and g > 130 and b > 90 and r > b + 20 and abs(r - g) < 80
            eye = r < 60 and g < 60 and b < 60
            if skin or eye:
                xs.append(x)
    if len(xs) >= 6:
        return sum(xs) / float(len(xs))
    return None


def body_center_x(im):
    """Face-first anchor blended with shirt; fall back to feet/body bbox."""
    face = face_center_x(im)
    sx = shirt_center_x(im)
    fx = feet_center_x(im)
    if face is not None and sx is not None:
        return 0.8 * face + 0.2 * sx
    if face is not None:
        return face
    if sx is not None and fx is not None:
        return 0.55 * fx + 0.45 * sx
    if sx is not None:
        return sx
    if fx is not None:
        return fx
    bb = body_bbox(im)
    if not bb:
        return im.size[0] / 2.0
    return (bb[0] + bb[2]) / 2.0


def strip_orphan_pixels(im, max_gap=3):
    """
    Remove small disconnected clumps below the main body (dirt sparks / slice junk)
    that otherwise steal the foot baseline.
    """
    out = im.copy()
    px = out.load()
    w, h = out.size
    bb = body_bbox(out)
    if not bb:
        return out
    body_bot = bb[3] - 1
    cx0, cx1 = bb[0], bb[2]
    # Any opaque pixel more than max_gap below body, or far from body x-range, drop if tiny island
    for y in range(body_bot + max_gap, h):
        for x in range(w):
            if px[x, y][3] < 200:
                continue
            # keep if near body column (tool tip / dirt under hoe near feet ok within band)
            if cx0 - 6 <= x < cx1 + 6 and y <= body_bot + max_gap + 2:
                continue
            # drop sparse bottom junk
            px[x, y] = (0, 0, 0, 0)
    # Also drop rows below body that have very few pixels (stray sparks)
    for y in range(body_bot + 1, h):
        cols = [x for x in range(w) if px[x, y][3] >= 200]
        if 0 < len(cols) <= 4:
            # keep only if contiguous under body
            if min(cols) > cx1 + 4 or max(cols) < cx0 - 4:
                for x in cols:
                    px[x, y] = (0, 0, 0, 0)
    return out


def solid_foot_y(im):
    """
    Foot line from shirt bottom → pants/boots under the torso column.
    Wood hoe / dirt sparks outside the torso band are ignored.
    """
    px = im.load()
    w, h = im.size
    # Shirt column is the most reliable torso anchor
    sx0, sx1, shirt_bot = w, -1, -1
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if is_shirt_pixel(r, g, b, a):
                sx0 = min(sx0, x)
                sx1 = max(sx1, x)
                shirt_bot = max(shirt_bot, y)
    if shirt_bot < 0:
        bb = body_bbox(im)
        return (bb[3] - 1) if bb else h - 1

    x0 = max(0, sx0 - 2)
    x1 = min(w, sx1 + 3)
    foot = shirt_bot
    # Walk down through pants / boots under shirt
    for y in range(shirt_bot + 1, h):
        n = 0
        for x in range(x0, x1):
            r, g, b, a = px[x, y]
            if a < 200:
                continue
            # pants brown or dark boots (not bright dirt / metal)
            brown = r > 50 and r > g + 4 and r > b + 10 and g < 120 and b < 95
            dark = r < 95 and g < 75 and b < 65 and max(r, g, b) > 20
            green = is_shirt_pixel(r, g, b, a)
            if brown or dark or green:
                n += 1
        if n >= 3:
            foot = y
        else:
            # allow one sparse row (leg gap) then stop
            if y > foot + 1:
                break
    return foot


def paste_foot_aligned(src):
    """Foot on bottom (body/boots, not dirt sparks); body centered horizontally."""
    if not src.getbbox():
        return Image.new("RGBA", (DW, DH), (0, 0, 0, 0))

    cleaned = strip_orphan_pixels(src)
    foot = solid_foot_y(cleaned)
    cp = cleaned.load()
    cw, ch = cleaned.size
    for y in range(foot + 1, ch):
        for x in range(cw):
            cp[x, y] = (0, 0, 0, 0)

    pad = max(DW, DH)
    stage = Image.new("RGBA", (cw + pad * 2, ch + pad * 2), (0, 0, 0, 0))
    stage.paste(cleaned, (pad, pad), cleaned)
    foot_s = foot + pad
    body_cx = body_center_x(cleaned) + pad

    left = int(round(body_cx - DW / 2.0))
    top = foot_s - (DH - 1)
    left = max(0, min(left, stage.size[0] - DW))
    top = max(0, min(top, stage.size[1] - DH))
    return stage.crop((left, top, left + DW, top + DH))


def cell_to_raw(cell, scale):
    """Cell → quantized scaled image (not yet foot-aligned to final)."""
    cell = quantize(cell)
    cw, ch = cell.size
    mid_w = max(8, int(round(cw * scale)))
    mid_h = max(8, int(round(ch * scale)))
    mid = cell.resize((mid_w, mid_h), Image.BOX)
    mp = mid.load()
    for y in range(mid_h):
        for x in range(mid_w):
            r, g, b, a = mp[x, y]
            if a < 140 or is_bg((r, g, b, 255)):
                mp[x, y] = (0, 0, 0, 0)
            else:
                mp[x, y] = ((r // 16) * 16 + 8, (g // 16) * 16 + 8, (b // 16) * 16 + 8, 255)
    big = mid.resize((mid_w * 2, mid_h * 2), Image.NEAREST)
    return big


def head_width(im, top_rows=16):
    """Opaque span across the top of the sprite (hair/head)."""
    px = im.load()
    w, h = im.size
    xs = []
    lim = min(top_rows, h)
    for y in range(lim):
        for x in range(w):
            if px[x, y][3] > 200:
                xs.append(x)
    if not xs:
        return 0
    return max(xs) - min(xs) + 1


def walk_targets():
    if not WALK_REF.exists():
        return 56, 32
    im = Image.open(WALK_REF).convert("RGBA")
    bb = body_bbox(im)
    bh = (bb[3] - bb[1]) if bb else 56
    hw = head_width(im) or 32
    return bh, hw


def normalize_body_scale(frames, target_body_h, target_head_w):
    """
    Scale every frame so standing size ≈ walk.
    Prefer head-width match (most visible), clamp with body height.
    Body-colored pixels so raised tools don't shrink the farmer.
    """
    stand_body = []
    stand_head = []
    body_hs = []
    for i, fr in enumerate(frames):
        bb = body_bbox(fr)
        h = (bb[3] - bb[1]) if bb else 0
        body_hs.append(h)
        hw = head_width(fr)
        if (i % 4) in (0, 3) and h > 8:
            stand_body.append(h)
            if hw > 4:
                stand_head.append(hw)
    if not stand_body:
        stand_body = [h for h in body_hs if h > 8]
    if not stand_body:
        return [paste_foot_aligned(fr) for fr in frames]

    stand_body.sort()
    med_b = stand_body[len(stand_body) // 2]
    med_h = 0
    if stand_head:
        stand_head.sort()
        med_h = stand_head[len(stand_head) // 2]

    boost_b = target_body_h / float(med_b)
    boost_h = (target_head_w / float(med_h)) if med_h > 4 else boost_b
    # Head drives visual size; don't undershoot body too far
    boost = max(boost_b, boost_h)
    boost = max(0.90, min(boost, 2.4))
    print(
        "normalize: stand body=%d→%d head=%d→%d  boost=%.3f (body=%.3f head=%.3f)"
        % (med_b, target_body_h, med_h, target_head_w, boost, boost_b, boost_h)
    )

    out = []
    for i, fr in enumerate(frames):
        # Uniform boost for the whole sheet. Do NOT per-frame head boost:
        # crouch frames move the head below the top rows and falsely read as "tiny".
        bb = body_bbox(fr)
        h = (bb[3] - bb[1]) if bb else med_b
        local = boost
        # Only rescue clearly undersized standing/recover frames (not strike/crouch).
        if (i % 4) in (0, 3) and h > 8 and h < med_b * 0.82:
            local = boost * (med_b / float(h))
            local = min(local, 2.4)
            print("  frame %d extra body boost (h=%d)" % (i, h))
        nw = max(8, int(round(fr.size[0] * local)))
        nh = max(8, int(round(fr.size[1] * local)))
        big = fr.resize((nw, nh), Image.NEAREST)
        out.append(paste_foot_aligned(big))
    return out


def equalize_row_positions(frames):
    """Nudge each frame so the face (fallback: torso) matches stand frames."""
    out = []
    for yi in range(4):
        row = frames[yi * 4 : yi * 4 + 4]
        faces = [face_center_x(fr) for fr in row]
        # Stand frames define the target face X
        stand_faces = [faces[0], faces[3]]
        if all(f is not None for f in stand_faces):
            target = (stand_faces[0] + stand_faces[1]) / 2.0
            refs = [f if f is not None else body_center_x(fr) for f, fr in zip(faces, row)]
        else:
            refs = [body_center_x(fr) for fr in row]
            target = (refs[0] + refs[3]) / 2.0
        for fr, cx in zip(row, refs):
            dx = int(round(target - cx))
            if dx == 0:
                out.append(fr)
                continue
            shifted = Image.new("RGBA", (DW, DH), (0, 0, 0, 0))
            shifted.paste(fr, (dx, 0), fr)
            out.append(shifted)
            print("  equalize dx=%+d (cx %.1f → %.1f)" % (dx, cx, target))
    return out


def slice_action(action):
    src = AI / ("farmer-%s-ai-ref.png" % action)
    if not src.exists():
        raise SystemExit("missing %s" % src)
    im = Image.open(src).convert("RGBA")
    xspl, yspl = split_grid(im)
    cell_h = yspl[1] - yspl[0]
    cell_w = xspl[1] - xspl[0]
    scale = MID_H / float(cell_h)
    target_b, target_h = walk_targets()
    print(
        "=== %s === cell=%dx%d scale=%.4f walk_body=%d walk_head=%d"
        % (action, cell_w, cell_h, scale, target_b, target_h)
    )

    raws = []
    for yi in range(4):
        for xi in range(4):
            cell = im.crop((xspl[xi], yspl[yi], xspl[xi + 1], yspl[yi + 1]))
            raws.append(cell_to_raw(cell, scale))

    frames = normalize_body_scale(raws, target_body_h=target_b, target_head_w=target_h)
    # Per-row micro nudge so feet/torso don't jitter between the 4 frames
    frames = equalize_row_positions(frames)

    OUT.mkdir(parents=True, exist_ok=True)
    row_dirs = ROW_DIR_OVERRIDE.get(action, DIRS)
    for yi, d in enumerate(row_dirs):
        for xi in range(4):
            fr = frames[yi * 4 + xi]
            path = OUT / ("farmer-%s-%s-%d.png" % (action, d, xi))
            fr.save(path)
            bb = body_bbox(fr)
            bh = (bb[3] - bb[1]) if bb else 0
            print(
                "wrote",
                path.name,
                "full",
                fr.getbbox(),
                "bodyH",
                bh,
                "headW",
                head_width(fr),
            )

    sheet = Image.new("RGBA", (DW * 4, DH * 4), (40, 40, 44, 255))
    for i, fr in enumerate(frames):
        sheet.paste(fr, ((i % 4) * DW, (i // 4) * DH), fr)
    preview = AI / ("farmer-%s-sheet.png" % action)
    sheet.save(preview)
    print("preview", preview)


def main():
    arg = (sys.argv[1] if len(sys.argv) > 1 else "all").strip().lower()
    acts = ACTIONS if arg == "all" else (arg,)
    for a in acts:
        if a not in ACTIONS:
            raise SystemExit("use hoe|chop|pick|all")
        slice_action(a)


if __name__ == "__main__":
    main()
