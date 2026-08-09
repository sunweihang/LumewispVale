#!/usr/bin/env python3
"""Slice AI farmer walk sheet -> crisp 48x64 frames (nearest), foot-aligned."""

from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
SRC = Path(__file__).resolve().parent / "ai-source" / "farmer-walk-ai-ref.png"
ALT = Path(
    "/Users/sunix/.cursor/projects/Users-Custom-LumewispVale/assets/farmer-walk-ai-ref.png"
)
OUT = ROOT / "assets/textures/chars/farmer"
PREVIEW = Path(__file__).resolve().parent / "ai-source"
DIRS = ("down", "left", "right", "up")
DW, DH = 48, 64


def is_bg(c):
    r, g, b, a = c
    if a < 10:
        return True
    if abs(r - g) < 18 and abs(g - b) < 18 and 110 <= r <= 160:
        return True
    return False


def cluster(idxs, min_gap=6):
    if not idxs:
        return []
    groups = [[idxs[0]]]
    for i in idxs[1:]:
        if i - groups[-1][-1] <= 2:
            groups[-1].append(i)
        else:
            groups.append([i])
    centers = []
    for g in groups:
        if len(g) >= min_gap:
            centers.append(sum(g) // len(g))
    return centers


def quantize_cell(cell):
    cp = cell.load()
    cw, ch = cell.size
    for y in range(ch):
        for x in range(cw):
            r, g, b, a = cp[x, y]
            if is_bg((r, g, b, a)) or a < 128:
                cp[x, y] = (0, 0, 0, 0)
            else:
                r = (r // 16) * 16 + 8
                g = (g // 16) * 16 + 8
                b = (b // 16) * 16 + 8
                cp[x, y] = (r, g, b, 255)
    return cell


def to_frame(cell):
    cell = quantize_cell(cell)
    bb = cell.getbbox()
    if not bb:
        return Image.new("RGBA", (DW, DH), (0, 0, 0, 0))
    char = cell.crop(bb)
    # Author at ~16x32 then nearest*2 -> 32x64, pad to 48x64
    cw, ch = char.size
    mid_h = 32
    mid_w = max(12, int(round(cw * (mid_h / float(ch)))))
    mid = char.resize((mid_w, mid_h), Image.BOX)
    mp = mid.load()
    for y in range(mid_h):
        for x in range(mid_w):
            r, g, b, a = mp[x, y]
            if a < 128 or is_bg((r, g, b, 255)):
                mp[x, y] = (0, 0, 0, 0)
            else:
                r = (r // 16) * 16 + 8
                g = (g // 16) * 16 + 8
                b = (b // 16) * 16 + 8
                mp[x, y] = (r, g, b, 255)
    big = mid.resize((mid_w * 2, mid_h * 2), Image.NEAREST)
    bw, bh = big.size
    if bh != DH:
        big = big.resize((max(8, int(round(bw * DH / float(bh)))), DH), Image.NEAREST)
        bw, bh = big.size
    if bw > DW:
        big = big.resize((DW, DH), Image.NEAREST)
        bw, bh = big.size
    out = Image.new("RGBA", (DW, DH), (0, 0, 0, 0))
    out.paste(big, ((DW - bw) // 2, DH - bh), big)
    return out


def main():
    src = SRC if SRC.exists() else ALT
    if not src.exists():
        raise SystemExit("missing farmer-walk-ai-ref.png")
    im = Image.open(src).convert("RGBA")
    PREVIEW.mkdir(parents=True, exist_ok=True)
    if src != SRC:
        im.save(SRC)

    px = im.load()
    w, h = im.size
    col = [0] * w
    row = [0] * h
    for y in range(h):
        for x in range(w):
            if not is_bg(px[x, y]):
                col[x] += 1
                row[y] += 1
    xs = [i for i, v in enumerate(col) if v > 0]
    ys = [i for i, v in enumerate(row) if v > 0]
    x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)
    thr = max(col) * 0.05
    gaps_x = [i for i in range(x0, x1) if col[i] < thr]
    gaps_y = [i for i in range(y0, y1) if row[i] < thr]
    sx, sy = cluster(gaps_x), cluster(gaps_y)
    if len(sx) >= 3 and len(sy) >= 3:
        xspl = [x0] + sx[:3] + [x1 + 1]
        yspl = [y0] + sy[:3] + [y1 + 1]
    else:
        cw = (x1 - x0 + 1) / 4.0
        ch = (y1 - y0 + 1) / 4.0
        xspl = [int(round(x0 + i * cw)) for i in range(5)]
        yspl = [int(round(y0 + i * ch)) for i in range(5)]
        xspl[-1], yspl[-1] = x1 + 1, y1 + 1

    OUT.mkdir(parents=True, exist_ok=True)
    frames = []
    for yi, d in enumerate(DIRS):
        for xi in range(4):
            cell = im.crop((xspl[xi], yspl[yi], xspl[xi + 1], yspl[yi + 1]))
            fr = to_frame(cell)
            path = OUT / ("farmer-%s-%d.png" % (d, xi))
            fr.save(path)
            frames.append(fr)
            print("wrote", path.name, fr.getbbox())

    sheet = Image.new("RGBA", (DW * 4, DH * 4), (40, 40, 44, 255))
    i = 0
    for yi in range(4):
        for xi in range(4):
            sheet.paste(frames[i], (xi * DW, yi * DH), frames[i])
            i += 1
    sheet.save(PREVIEW / "farmer-walk-sheet.png")
    print("preview", PREVIEW / "farmer-walk-sheet.png")


if __name__ == "__main__":
    main()
