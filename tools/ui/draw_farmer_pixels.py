#!/usr/bin/env python3
"""Draw crisp Stardew-like farmer walk frames (4 dir x 4) — chunky 16x32 style upscaled."""

from pathlib import Path

from PIL import Image

OUT = Path(__file__).resolve().parents[2] / "assets/textures/chars/farmer"
SRC_W, SRC_H = 16, 32  # authoring grid (Stardew-like)
SCALE = 3               # -> 48x96 then crop/pad to 48x64 display? 
# Keep display 48x64: draw at 16x32, scale x3 = 48x96 is too tall.
# Better: draw 16x32, scale x2 = 32x64, center in 48x64.
OUT_W, OUT_H = 48, 64
SCALE = 2

# Palette
O = (28, 22, 18, 255)       # outline
SK = (241, 194, 156, 255)   # skin
SKD = (214, 156, 118, 255)  # skin shadow
H = (122, 72, 42, 255)      # hair
HH = (168, 108, 62, 255)    # hair hi
HD = (78, 44, 26, 255)      # hair dark
S = (74, 148, 78, 255)      # shirt
SD = (48, 108, 58, 255)     # shirt dark
SH = (110, 178, 98, 255)    # shirt hi
P = (92, 62, 42, 255)       # pants
PD = (62, 40, 28, 255)      # pants dark
B = (48, 34, 28, 255)       # boot
E = (36, 48, 40, 255)       # eye
EW = (245, 245, 230, 255)   # eye white
BT = (180, 140, 70, 255)    # belt
Z = (0, 0, 0, 0)


def canvas():
    return Image.new("RGBA", (SRC_W, SRC_H), Z)


def P_(img, x, y, c):
    if 0 <= x < SRC_W and 0 <= y < SRC_H:
        img.putpixel((x, y), c)


def rect(img, x0, y0, x1, y1, c):
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            P_(img, x, y, c)


def hline(img, x0, x1, y, c):
    for x in range(x0, x1 + 1):
        P_(img, x, y, c)


def vline(img, x, y0, y1, c):
    for y in range(y0, y1 + 1):
        P_(img, x, y, c)


def ovalish_head_front(img, bob=0):
    y = 2 + bob
    # hair mass
    rect(img, 4, y, 11, y + 5, H)
    rect(img, 5, y - 1, 10, y + 1, H)
    P_(img, 3, y + 2, H)
    P_(img, 12, y + 2, H)
    P_(img, 4, y - 1, H)
    P_(img, 11, y - 1, H)
    P_(img, 6, y - 1, HH)
    P_(img, 7, y, HH)
    P_(img, 10, y + 3, HD)
    # face
    rect(img, 5, y + 4, 10, y + 9, SK)
    rect(img, 6, y + 8, 9, y + 9, SKD)
    # eyes
    P_(img, 6, y + 6, EW)
    P_(img, 7, y + 6, E)
    P_(img, 9, y + 6, EW)
    P_(img, 8, y + 6, E)
    # nose / mouth
    P_(img, 7, y + 7, SKD)
    P_(img, 8, y + 7, SKD)
    hline(img, 7, 8, y + 8, SKD)
    # outline
    hline(img, 5, 10, y - 1, O)
    P_(img, 4, y, O)
    P_(img, 11, y, O)
    vline(img, 4, y + 1, y + 5, O)
    vline(img, 11, y + 1, y + 5, O)
    vline(img, 5, y + 4, y + 9, O)
    vline(img, 10, y + 4, y + 9, O)
    hline(img, 5, 10, y + 9, O)
    # bangs over forehead
    rect(img, 5, y + 3, 10, y + 4, H)
    P_(img, 6, y + 4, HH)


def head_back(img, bob=0):
    y = 2 + bob
    rect(img, 4, y, 11, y + 9, H)
    rect(img, 5, y - 1, 10, y + 1, H)
    P_(img, 3, y + 2, H)
    P_(img, 12, y + 2, H)
    rect(img, 5, y + 1, 8, y + 3, HH)
    rect(img, 9, y + 5, 11, y + 8, HD)
    hline(img, 5, 10, y - 1, O)
    vline(img, 4, y, y + 9, O)
    vline(img, 11, y, y + 9, O)
    hline(img, 4, 11, y + 9, O)
    P_(img, 3, y + 2, O)
    P_(img, 12, y + 2, O)


def head_side(img, right=True, bob=0):
    y = 2 + bob
    # hair
    if right:
        rect(img, 4, y, 11, y + 8, H)
        rect(img, 5, y - 1, 9, y + 1, H)
        rect(img, 6, y, 8, y + 2, HH)
        rect(img, 4, y + 5, 5, y + 8, HD)
        # face
        rect(img, 8, y + 4, 12, y + 9, SK)
        rect(img, 9, y + 8, 12, y + 9, SKD)
        P_(img, 11, y + 6, EW)
        P_(img, 12, y + 6, E)
        P_(img, 12, y + 7, SKD)  # nose
        # outline
        hline(img, 5, 10, y - 1, O)
        vline(img, 4, y, y + 8, O)
        vline(img, 12, y + 4, y + 9, O)
        hline(img, 8, 12, y + 9, O)
        hline(img, 8, 11, y + 3, O)
    else:
        rect(img, 4, y, 11, y + 8, H)
        rect(img, 6, y - 1, 10, y + 1, H)
        rect(img, 7, y, 9, y + 2, HH)
        rect(img, 10, y + 5, 11, y + 8, HD)
        rect(img, 3, y + 4, 7, y + 9, SK)
        rect(img, 3, y + 8, 6, y + 9, SKD)
        P_(img, 4, y + 6, E)
        P_(img, 5, y + 6, EW)
        P_(img, 3, y + 7, SKD)
        hline(img, 5, 10, y - 1, O)
        vline(img, 11, y, y + 8, O)
        vline(img, 3, y + 4, y + 9, O)
        hline(img, 3, 7, y + 9, O)
        hline(img, 4, 7, y + 3, O)


def torso_front(img, arm_phase, bob=0):
    y = 12 + bob
    rect(img, 5, y, 10, y + 8, S)
    rect(img, 6, y + 1, 9, y + 3, SH)
    rect(img, 5, y + 6, 10, y + 8, SD)
    hline(img, 5, 10, y + 9, BT)
    # outline body
    vline(img, 5, y, y + 8, O)
    vline(img, 10, y, y + 8, O)
    hline(img, 5, 10, y, O)
    hline(img, 5, 10, y + 8, O)
    # arms
    ly = y + 1 + (-1 if arm_phase < 0 else (1 if arm_phase > 0 else 0))
    ry = y + 1 + (1 if arm_phase < 0 else (-1 if arm_phase > 0 else 0))
    rect(img, 3, ly, 4, ly + 6, S)
    rect(img, 3, ly + 5, 4, ly + 7, SK)
    vline(img, 3, ly, ly + 7, O)
    vline(img, 4, ly, ly + 7, O)
    hline(img, 3, 4, ly, O)
    hline(img, 3, 4, ly + 7, O)
    rect(img, 11, ry, 12, ry + 6, S)
    rect(img, 11, ry + 5, 12, ry + 7, SK)
    vline(img, 11, ry, ry + 7, O)
    vline(img, 12, ry, ry + 7, O)
    hline(img, 11, 12, ry, O)
    hline(img, 11, 12, ry + 7, O)


def torso_back(img, arm_phase, bob=0):
    y = 12 + bob
    rect(img, 5, y, 10, y + 8, S)
    rect(img, 6, y + 1, 8, y + 4, SH)
    rect(img, 5, y + 6, 10, y + 8, SD)
    hline(img, 5, 10, y + 9, BT)
    vline(img, 5, y, y + 8, O)
    vline(img, 10, y, y + 8, O)
    hline(img, 5, 10, y, O)
    hline(img, 5, 10, y + 8, O)
    ly = y + 1 + (-1 if arm_phase < 0 else (1 if arm_phase > 0 else 0))
    ry = y + 1 + (1 if arm_phase < 0 else (-1 if arm_phase > 0 else 0))
    rect(img, 3, ly, 4, ly + 6, S)
    vline(img, 3, ly, ly + 6, O)
    vline(img, 4, ly, ly + 6, O)
    rect(img, 11, ry, 12, ry + 6, S)
    vline(img, 11, ry, ry + 6, O)
    vline(img, 12, ry, ry + 6, O)


def torso_side(img, right, arm_phase, bob=0):
    y = 12 + bob
    rect(img, 5, y, 10, y + 8, S)
    rect(img, 6, y + 1, 8, y + 3, SH)
    rect(img, 5, y + 6, 10, y + 8, SD)
    hline(img, 5, 10, y + 9, BT)
    vline(img, 5, y, y + 8, O)
    vline(img, 10, y, y + 8, O)
    hline(img, 5, 10, y, O)
    hline(img, 5, 10, y + 8, O)
    ay = y + 1 + arm_phase
    if right:
        rect(img, 9, ay, 11, ay + 6, S)
        rect(img, 10, ay + 5, 11, ay + 7, SK)
        vline(img, 9, ay, ay + 7, O)
        vline(img, 11, ay, ay + 7, O)
        hline(img, 9, 11, ay, O)
        hline(img, 9, 11, ay + 7, O)
    else:
        rect(img, 4, ay, 6, ay + 6, S)
        rect(img, 4, ay + 5, 5, ay + 7, SK)
        vline(img, 4, ay, ay + 7, O)
        vline(img, 6, ay, ay + 7, O)
        hline(img, 4, 6, ay, O)
        hline(img, 4, 6, ay + 7, O)


def legs_front(img, phase, bob=0):
    y = 22 + bob
    rect(img, 5, y, 10, y + 1, P)
    # boots always touch bottom y=30
    if phase == 0:
        rect(img, 5, y + 2, 7, y + 7, P)
        rect(img, 8, y + 2, 10, y + 7, P)
        rect(img, 5, y + 6, 7, y + 8, B)
        rect(img, 8, y + 6, 10, y + 8, B)
        vline(img, 5, y + 2, y + 8, O)
        vline(img, 7, y + 2, y + 8, O)
        vline(img, 8, y + 2, y + 8, O)
        vline(img, 10, y + 2, y + 8, O)
        hline(img, 5, 7, y + 8, O)
        hline(img, 8, 10, y + 8, O)
    elif phase == 1:
        # L down-forward, R up
        rect(img, 4, y + 3, 6, y + 8, P)
        rect(img, 4, y + 7, 6, y + 8, B)
        rect(img, 9, y + 1, 11, y + 6, P)
        rect(img, 9, y + 5, 11, y + 6, B)
        vline(img, 4, y + 3, y + 8, O)
        vline(img, 6, y + 3, y + 8, O)
        hline(img, 4, 6, y + 8, O)
        vline(img, 9, y + 1, y + 6, O)
        vline(img, 11, y + 1, y + 6, O)
        hline(img, 9, 11, y + 6, O)
    elif phase == 2:
        rect(img, 6, y + 2, 7, y + 7, P)
        rect(img, 8, y + 2, 9, y + 7, P)
        rect(img, 6, y + 6, 7, y + 8, B)
        rect(img, 8, y + 6, 9, y + 8, B)
        vline(img, 6, y + 2, y + 8, O)
        vline(img, 7, y + 2, y + 8, O)
        vline(img, 8, y + 2, y + 8, O)
        vline(img, 9, y + 2, y + 8, O)
        hline(img, 6, 7, y + 8, O)
        hline(img, 8, 9, y + 8, O)
    else:
        rect(img, 9, y + 3, 11, y + 8, P)
        rect(img, 9, y + 7, 11, y + 8, B)
        rect(img, 4, y + 1, 6, y + 6, P)
        rect(img, 4, y + 5, 6, y + 6, B)
        vline(img, 9, y + 3, y + 8, O)
        vline(img, 11, y + 3, y + 8, O)
        hline(img, 9, 11, y + 8, O)
        vline(img, 4, y + 1, y + 6, O)
        vline(img, 6, y + 1, y + 6, O)
        hline(img, 4, 6, y + 6, O)


def legs_back(img, phase, bob=0):
    legs_front(img, phase, bob)
    # darken sides
    y = 22 + bob
    for yy in range(y + 2, y + 8):
        if img.getpixel((5, yy))[3]:
            P_(img, 5, yy, PD)
        if img.getpixel((10, yy))[3]:
            P_(img, 10, yy, PD)


def legs_side(img, right, phase, bob=0):
    y = 22 + bob
    rect(img, 6, y, 9, y + 1, P)
    # stride
    if phase in (0, 2):
        fdx, fdy = 0, 2
        bdx, bdy = 0, 2
    elif phase == 1:
        fdx, fdy = (2, 3) if right else (-2, 3)
        bdx, bdy = (-2, 1) if right else (2, 1)
    else:
        fdx, fdy = (-2, 1) if right else (2, 1)
        bdx, bdy = (2, 3) if right else (-2, 3)

    def leg(dx, dy, dark=False):
        col = PD if dark else P
        x0 = 6 + dx
        y0 = y + dy
        rect(img, x0, y0, x0 + 2, y0 + 5, col)
        rect(img, x0, y0 + 4, x0 + 2, y0 + 6, B)
        vline(img, x0, y0, y0 + 6, O)
        vline(img, x0 + 2, y0, y0 + 6, O)
        hline(img, x0, x0 + 2, y0 + 6, O)

    leg(bdx, bdy, True)
    leg(fdx, fdy, False)


def draw(direction, frame):
    img = canvas()
    phase = frame % 4
    arm = {0: 0, 1: -1, 2: 0, 3: 1}[phase]
    bob = 0 if phase in (0, 2) else -1

    if direction == "down":
        torso_front(img, arm, bob)
        legs_front(img, phase, bob)
        ovalish_head_front(img, bob)
    elif direction == "up":
        torso_back(img, arm, bob)
        legs_back(img, phase, bob)
        head_back(img, bob)
    elif direction == "left":
        torso_side(img, False, arm, bob)
        legs_side(img, False, phase, bob)
        head_side(img, False, bob)
    elif direction == "right":
        torso_side(img, True, arm, bob)
        legs_side(img, True, phase, bob)
        head_side(img, True, bob)
    return img


def to_display(src):
    """Nearest scale + pad to 48x64, feet on bottom, centered."""
    big = src.resize((SRC_W * SCALE, SRC_H * SCALE), Image.NEAREST)
    out = Image.new("RGBA", (OUT_W, OUT_H), Z)
    bw, bh = big.size
    dx = (OUT_W - bw) // 2
    dy = OUT_H - bh
    out.paste(big, (dx, dy), big)
    return out


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    for d in ("down", "left", "right", "up"):
        for i in range(4):
            im = to_display(draw(d, i))
            path = OUT / ("farmer-%s-%d.png" % (d, i))
            im.save(path)
            print("wrote", path.name, im.getbbox())

    sheet = Image.new("RGBA", (OUT_W * 4, OUT_H * 4), (36, 36, 40, 255))
    for yi, d in enumerate(("down", "left", "right", "up")):
        for xi in range(4):
            im = Image.open(OUT / ("farmer-%s-%d.png" % (d, xi)))
            sheet.paste(im, (xi * OUT_W, yi * OUT_H), im)
    preview = Path(__file__).resolve().parent / "ai-source" / "farmer-walk-sheet.png"
    preview.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(preview)
    print("preview", preview)


if __name__ == "__main__":
    main()
