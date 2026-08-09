#!/usr/bin/env python3
"""Draw farmer action frames: hoe / chop / pick × 4 dir × 4 frames.

Reuses body/palette from draw_farmer_pixels.py. Output:
  assets/textures/chars/farmer/farmer-{hoe|chop|pick}-{dir}-{0..3}.png
"""

from __future__ import print_function

import importlib.util
import uuid
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("dfp", ROOT / "draw_farmer_pixels.py")
dfp = importlib.util.module_from_spec(spec)
spec.loader.exec_module(dfp)

OUT = dfp.OUT
O, SK, SKD, S, SD, SH, P, B, Z = dfp.O, dfp.SK, dfp.SKD, dfp.S, dfp.SD, dfp.SH, dfp.P, dfp.B, dfp.Z
WD = (139, 90, 43, 255)   # wood
WDD = (96, 58, 28, 255)   # wood dark
MT = (138, 144, 152, 255) # metal
MTD = (90, 96, 104, 255)  # metal dark
MTB = (210, 214, 220, 255)  # metal bright
AX = (70, 76, 84, 255)    # axe blade
AXH = (120, 128, 136, 255)


def torso_front_no_arms(img, bob=0):
    y = 12 + bob
    dfp.rect(img, 5, y, 10, y + 8, S)
    dfp.rect(img, 6, y + 1, 9, y + 3, SH)
    dfp.rect(img, 5, y + 6, 10, y + 8, SD)
    dfp.hline(img, 5, 10, y + 9, dfp.BT)
    dfp.vline(img, 5, y, y + 8, O)
    dfp.vline(img, 10, y, y + 8, O)
    dfp.hline(img, 5, 10, y, O)
    dfp.hline(img, 5, 10, y + 8, O)


def torso_back_no_arms(img, bob=0):
    y = 12 + bob
    dfp.rect(img, 5, y, 10, y + 8, S)
    dfp.rect(img, 6, y + 1, 8, y + 4, SH)
    dfp.rect(img, 5, y + 6, 10, y + 8, SD)
    dfp.hline(img, 5, 10, y + 9, dfp.BT)
    dfp.vline(img, 5, y, y + 8, O)
    dfp.vline(img, 10, y, y + 8, O)
    dfp.hline(img, 5, 10, y, O)
    dfp.hline(img, 5, 10, y + 8, O)


def torso_side_no_arms(img, bob=0):
    y = 12 + bob
    dfp.rect(img, 5, y, 10, y + 8, S)
    dfp.rect(img, 6, y + 1, 8, y + 3, SH)
    dfp.rect(img, 5, y + 6, 10, y + 8, SD)
    dfp.hline(img, 5, 10, y + 9, dfp.BT)
    dfp.vline(img, 5, y, y + 8, O)
    dfp.vline(img, 10, y, y + 8, O)
    dfp.hline(img, 5, 10, y, O)
    dfp.hline(img, 5, 10, y + 8, O)


def arm_front(img, side, ax, ay, length=6):
    """side: -1 left, +1 right. Draws sleeve + hand from shoulder."""
    sx = 3 if side < 0 else 11
    for i in range(length):
        x = sx + (0 if side < 0 else 0)
        y = ay + i
        col = S if i < length - 2 else SK
        dfp.rect(img, x, y, x + 1, y, col)
    # thicker arm block toward target
    dfp.rect(img, sx, ay, sx + 1, ay + length - 3, S)
    dfp.rect(img, sx, ay + length - 2, sx + 1, ay + length - 1, SK)
    dfp.vline(img, sx, ay, ay + length - 1, O)
    dfp.vline(img, sx + 1, ay, ay + length - 1, O)
    dfp.hline(img, sx, sx + 1, ay, O)
    dfp.hline(img, sx, sx + 1, ay + length - 1, O)
    # optional offset toward ax (reach)
    if ax != sx:
        reach = 1 if ax > sx else -1
        dfp.P_(img, sx + reach, ay + length - 1, SK)


def draw_hoe(img, x0, y0, x1, y1):
    """Hoe: thick wood handle + L-shaped metal blade (reads at 48×64)."""
    steps = max(abs(x1 - x0), abs(y1 - y0), 1)
    for i in range(steps + 1):
        t = i / float(steps)
        x = int(round(x0 + (x1 - x0) * t))
        y = int(round(y0 + (y1 - y0) * t))
        dfp.P_(img, x, y, WD)
        dfp.P_(img, x + 1, y, WD)
        dfp.P_(img, x, y + 1, WDD)
    bx, by = x1, y1
    # blade plate
    dfp.rect(img, bx - 3, by - 1, bx + 3, by + 1, MT)
    dfp.rect(img, bx - 3, by, bx + 3, by, MTB)
    dfp.rect(img, bx - 3, by + 1, bx + 3, by + 1, MTD)
    # edge outline only
    dfp.hline(img, bx - 3, bx + 3, by - 1, O)
    dfp.hline(img, bx - 3, bx + 3, by + 1, O)
    dfp.P_(img, bx - 3, by, O)
    dfp.P_(img, bx + 3, by, O)


def draw_axe(img, x0, y0, x1, y1, face_right=True):
    """Axe: wood haft + chunky blade head."""
    steps = max(abs(x1 - x0), abs(y1 - y0), 1)
    for i in range(steps + 1):
        t = i / float(steps)
        x = int(round(x0 + (x1 - x0) * t))
        y = int(round(y0 + (y1 - y0) * t))
        dfp.P_(img, x, y, WD)
        dfp.P_(img, x + 1, y, WD)
        dfp.P_(img, x, y + 1, WDD)
    if face_right:
        dfp.rect(img, x1, y1 - 3, x1 + 4, y1 + 2, AX)
        dfp.rect(img, x1 + 1, y1 - 2, x1 + 3, y1 + 1, AXH)
        dfp.rect(img, x1 + 3, y1 - 1, x1 + 4, y1, MTB)
        dfp.vline(img, x1, y1 - 3, y1 + 2, O)
        dfp.vline(img, x1 + 4, y1 - 3, y1 + 2, O)
        dfp.hline(img, x1, x1 + 4, y1 - 3, O)
        dfp.hline(img, x1, x1 + 4, y1 + 2, O)
    else:
        dfp.rect(img, x1 - 4, y1 - 3, x1, y1 + 2, AX)
        dfp.rect(img, x1 - 3, y1 - 2, x1 - 1, y1 + 1, AXH)
        dfp.rect(img, x1 - 4, y1 - 1, x1 - 3, y1, MTB)
        dfp.vline(img, x1, y1 - 3, y1 + 2, O)
        dfp.vline(img, x1 - 4, y1 - 3, y1 + 2, O)
        dfp.hline(img, x1 - 4, x1, y1 - 3, O)
        dfp.hline(img, x1 - 4, x1, y1 + 2, O)


def pose_params(action, frame):
    """Return bend, arm_raise (-2..4), tool_phase 0..3."""
    # Shared timing: wind-up → peak → strike → recover
    if action == "pick":
        if frame == 0:
            return 0, 0, 0
        if frame == 1:
            return 1, 1, 1
        if frame == 2:
            return 2, 2, 2
        return 1, 0, 3
    if frame == 0:
        return 0, 1, 0
    if frame == 1:
        return 0, 3, 1
    if frame == 2:
        return 0, -1, 2
    return 0, 0, 3


def draw_action(direction, action, frame):
    img = dfp.canvas()
    bend, raise_, phase = pose_params(action, frame)
    bob = bend  # slight crouch on strike/pick

    # Legs: idle stance (phase 0) or slight crouch
    leg_phase = 0
    if direction == "down":
        torso_front_no_arms(img, bob)
        dfp.legs_front(img, leg_phase, bob)
    elif direction == "up":
        torso_back_no_arms(img, bob)
        dfp.legs_back(img, leg_phase, bob)
    elif direction == "left":
        torso_side_no_arms(img, bob)
        dfp.legs_side(img, False, leg_phase, bob)
    else:
        torso_side_no_arms(img, bob)
        dfp.legs_side(img, True, leg_phase, bob)

    # Arms + tool by facing
    sy = 13 + bob + raise_

    if direction == "down":
        # Both arms forward/down for tool work
        if action == "pick":
            # Reach down with both hands
            ly = 14 + bob + (2 if phase >= 2 else raise_)
            ry = ly
            dfp.rect(img, 3, ly, 4, ly + 5, S)
            dfp.rect(img, 3, ly + 4, 4, ly + 6, SK)
            dfp.rect(img, 11, ry, 12, ry + 5, S)
            dfp.rect(img, 11, ry + 4, 12, ry + 6, SK)
            for sx in (3, 11):
                dfp.vline(img, sx, ly, ly + 6, O)
                dfp.vline(img, sx + 1, ly, ly + 6, O)
            if phase >= 2:
                # small green sprout / crop in hands
                dfp.P_(img, 7, ly + 6, (74, 148, 78, 255))
                dfp.P_(img, 8, ly + 5, (110, 178, 98, 255))
        elif action == "hoe":
            # Right arm holds hoe; swing arc
            hx0, hy0 = 11, 14 + bob
            if phase == 0:
                hx1, hy1 = 13, 8
            elif phase == 1:
                hx1, hy1 = 12, 4
            elif phase == 2:
                hx1, hy1 = 10, 22
            else:
                hx1, hy1 = 12, 12
            dfp.rect(img, 11, hy0, 12, hy0 + 4, S)
            dfp.rect(img, 11, hy0 + 3, 12, hy0 + 5, SK)
            dfp.rect(img, 3, 14 + bob, 4, 20 + bob, S)
            dfp.rect(img, 3, 19 + bob, 4, 21 + bob, SK)
            draw_hoe(img, hx0, hy0, hx1, hy1)
        else:  # chop
            hx0, hy0 = 11, 13 + bob
            if phase == 0:
                hx1, hy1 = 13, 7
            elif phase == 1:
                hx1, hy1 = 12, 3
            elif phase == 2:
                hx1, hy1 = 9, 18
            else:
                hx1, hy1 = 12, 10
            dfp.rect(img, 11, hy0, 12, hy0 + 4, S)
            dfp.rect(img, 11, hy0 + 3, 12, hy0 + 5, SK)
            dfp.rect(img, 3, 14 + bob, 4, 20 + bob, S)
            draw_axe(img, hx0, hy0, hx1, hy1, True)

    elif direction == "up":
        # Tool mostly behind / above
        if action == "pick":
            ly = 14 + bob + raise_
            dfp.rect(img, 3, ly, 4, ly + 5, S)
            dfp.rect(img, 11, ly, 12, ly + 5, S)
        elif action == "hoe":
            if phase <= 1:
                draw_hoe(img, 8, 12 + bob, 8, 4 + bob)
            elif phase == 2:
                draw_hoe(img, 8, 14 + bob, 8, 22)
            else:
                draw_hoe(img, 8, 13 + bob, 9, 10)
            dfp.rect(img, 3, 13 + bob, 4, 18 + bob, S)
            dfp.rect(img, 11, 13 + bob, 12, 18 + bob, S)
        else:
            if phase <= 1:
                draw_axe(img, 8, 12 + bob, 8, 3 + bob, True)
            elif phase == 2:
                draw_axe(img, 8, 13 + bob, 8, 19, True)
            else:
                draw_axe(img, 8, 12 + bob, 9, 9, True)
            dfp.rect(img, 3, 13 + bob, 4, 18 + bob, S)
            dfp.rect(img, 11, 13 + bob, 12, 18 + bob, S)

    elif direction == "right":
        ay = 13 + bob
        if action == "pick":
            ax = 10
            if phase >= 2:
                ay = 16 + bob
            dfp.rect(img, ax, ay, ax + 2, ay + 5, S)
            dfp.rect(img, ax + 1, ay + 4, ax + 2, ay + 6, SK)
            if phase >= 2:
                dfp.P_(img, ax + 2, ay + 6, (74, 148, 78, 255))
        elif action == "hoe":
            hx0, hy0 = 10, 14 + bob
            if phase == 0:
                hx1, hy1 = 14, 8
            elif phase == 1:
                hx1, hy1 = 14, 4
            elif phase == 2:
                hx1, hy1 = 14, 22
            else:
                hx1, hy1 = 13, 12
            dfp.rect(img, 9, hy0, 11, hy0 + 4, S)
            dfp.rect(img, 10, hy0 + 3, 11, hy0 + 5, SK)
            draw_hoe(img, hx0, hy0, hx1, hy1)
        else:
            hx0, hy0 = 10, 13 + bob
            if phase == 0:
                hx1, hy1 = 14, 7
            elif phase == 1:
                hx1, hy1 = 14, 3
            elif phase == 2:
                hx1, hy1 = 14, 18
            else:
                hx1, hy1 = 13, 10
            dfp.rect(img, 9, hy0, 11, hy0 + 4, S)
            dfp.rect(img, 10, hy0 + 3, 11, hy0 + 5, SK)
            draw_axe(img, hx0, hy0, hx1, hy1, True)

    else:  # left
        ay = 13 + bob
        if action == "pick":
            ax = 3
            if phase >= 2:
                ay = 16 + bob
            dfp.rect(img, ax, ay, ax + 2, ay + 5, S)
            dfp.rect(img, ax, ay + 4, ax + 1, ay + 6, SK)
            if phase >= 2:
                dfp.P_(img, ax, ay + 6, (74, 148, 78, 255))
        elif action == "hoe":
            hx0, hy0 = 5, 14 + bob
            if phase == 0:
                hx1, hy1 = 1, 8
            elif phase == 1:
                hx1, hy1 = 1, 4
            elif phase == 2:
                hx1, hy1 = 1, 22
            else:
                hx1, hy1 = 2, 12
            dfp.rect(img, 4, hy0, 6, hy0 + 4, S)
            dfp.rect(img, 4, hy0 + 3, 5, hy0 + 5, SK)
            draw_hoe(img, hx0, hy0, hx1, hy1)
        else:
            hx0, hy0 = 5, 13 + bob
            if phase == 0:
                hx1, hy1 = 1, 7
            elif phase == 1:
                hx1, hy1 = 1, 3
            elif phase == 2:
                hx1, hy1 = 1, 18
            else:
                hx1, hy1 = 2, 10
            dfp.rect(img, 4, hy0, 6, hy0 + 4, S)
            dfp.rect(img, 4, hy0 + 3, 5, hy0 + 5, SK)
            draw_axe(img, hx0, hy0, hx1, hy1, False)

    # Head last (on top for front/side)
    if direction == "down":
        dfp.ovalish_head_front(img, bob)
    elif direction == "up":
        dfp.head_back(img, bob)
    elif direction == "left":
        dfp.head_side(img, False, bob)
    else:
        dfp.head_side(img, True, bob)

    return img


META_TEMPLATE = """{
  "ver": "1.0.27",
  "importer": "image",
  "imported": true,
  "uuid": "%(uuid)s",
  "files": [
    ".json",
    ".png"
  ],
  "subMetas": {
    "6c48a": {
      "importer": "texture",
      "uuid": "%(uuid)s@6c48a",
      "displayName": "%(name)s",
      "id": "6c48a",
      "name": "texture",
      "userData": {
        "wrapModeS": "clamp-to-edge",
        "wrapModeT": "clamp-to-edge",
        "minfilter": "nearest",
        "magfilter": "nearest",
        "mipfilter": "none",
        "anisotropy": 0,
        "isUuid": true,
        "imageUuidOrDatabaseUri": "%(uuid)s",
        "visible": false
      },
      "ver": "1.0.22",
      "imported": true,
      "files": [
        ".json"
      ],
      "subMetas": {}
    },
    "f9941": {
      "importer": "sprite-frame",
      "uuid": "%(uuid)s@f9941",
      "displayName": "%(name)s",
      "id": "f9941",
      "name": "spriteFrame",
      "userData": {
        "trimThreshold": 1,
        "rotated": false,
        "offsetX": 0,
        "offsetY": 0,
        "trimX": 0,
        "trimY": 0,
        "width": 48,
        "height": 64,
        "rawWidth": 48,
        "rawHeight": 64,
        "borderTop": 0,
        "borderBottom": 0,
        "borderLeft": 0,
        "borderRight": 0,
        "packable": true,
        "pixelsToUnit": 100,
        "pivotX": 0.5,
        "pivotY": 0,
        "meshType": 0,
        "isUuid": true,
        "imageUuidOrDatabaseUri": "%(uuid)s@6c48a",
        "atlasUuid": "",
        "trimType": "custom"
      },
      "ver": "1.0.12",
      "imported": true,
      "files": [
        ".json"
      ],
      "subMetas": {}
    }
  },
  "userData": {
    "type": "sprite-frame",
    "fixAlphaTransparencyArtifacts": false,
    "hasAlpha": true,
    "redirect": "%(uuid)s@6c48a"
  }
}
"""


def ensure_meta(png_path):
    meta_path = Path(str(png_path) + ".meta")
    name = png_path.stem
    if meta_path.exists():
        # keep existing UUID
        import json

        data = json.loads(meta_path.read_text())
        uid = data.get("uuid")
        # still refresh pivot/trim via rewrite preserving uuid
        meta_path.write_text(META_TEMPLATE % {"uuid": uid, "name": name})
        return uid
    uid = str(uuid.uuid4())
    meta_path.write_text(META_TEMPLATE % {"uuid": uid, "name": name})
    return uid


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    catalog = {"hoe": {}, "chop": {}, "pick": {}}
    actions = ("hoe", "chop", "pick")
    dirs = ("down", "left", "right", "up")

    for action in actions:
        for d in dirs:
            catalog[action][d] = []
            for i in range(4):
                im = dfp.to_display(draw_action(d, action, i))
                path = OUT / ("farmer-%s-%s-%d.png" % (action, d, i))
                im.save(path)
                uid = ensure_meta(path)
                catalog[action][d].append("%s@f9941" % uid)
                print("wrote", path.name)

    # Contact sheet preview
    sheet = Image.new("RGBA", (dfp.OUT_W * 4, dfp.OUT_H * 12), (36, 36, 40, 255))
    row = 0
    for action in actions:
        for d in dirs:
            for xi in range(4):
                im = Image.open(OUT / ("farmer-%s-%s-%d.png" % (action, d, xi)))
                sheet.paste(im, (xi * dfp.OUT_W, row * dfp.OUT_H), im)
            row += 1
    preview = ROOT / "ai-source" / "farmer-actions-sheet.png"
    preview.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(preview)
    print("preview", preview)

    # Merge into farmer-frames.json
    import json

    frames_path = ROOT / "farmer-frames.json"
    data = json.loads(frames_path.read_text())
    data["actions"] = catalog
    frames_path.write_text(json.dumps(data, indent=2) + "\n")
    print("updated", frames_path)

    # Sync FarmerFrames.ts
    ts_path = ROOT.parents[1] / "assets/scripts/game/FarmerFrames.ts"
    lines = ['/** Auto-synced from tools/ui/farmer-frames.json */', "export const FARMER_FRAMES = {"]
    lines.append("    farmer: {")
    for d in dirs:
        arr = data["farmer"][d]
        lines.append("        %s: [" % d)
        for u in arr:
            lines.append("            '%s'," % u)
        lines.append("        ],")
    lines.append("    },")
    lines.append("    actions: {")
    for action in actions:
        lines.append("        %s: {" % action)
        for d in dirs:
            lines.append("            %s: [" % d)
            for u in catalog[action][d]:
                lines.append("                '%s'," % u)
            lines.append("            ],")
        lines.append("        },")
    lines.append("    },")
    lines.append("    questMarker: '%s'," % data["questMarker"])
    lines.append("};")
    lines.append("")
    ts_path.write_text("\n".join(lines))
    print("updated", ts_path)


if __name__ == "__main__":
    main()
