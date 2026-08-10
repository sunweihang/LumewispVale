#!/usr/bin/env python3
"""Generate QuestPanel.prefab — layout source of truth (aligned journal).

  /usr/local/bin/python3 tools/ui/generate_quest_panel_prefab.py

Layout (panel-local, center origin). Must stay in sync with QuestPanel.ts LAYOUT.
"""
from __future__ import print_function

import json
import random
import string
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT_PREFAB = ROOT / "assets/prefabs/ui/QuestPanel.prefab"
QUEST_FRAMES_JSON = Path(__file__).resolve().parent / "quest-frames.json"
OUT_TS = ROOT / "assets/scripts/game/QuestFrames.ts"
UI_LAYER = 33554432  # UI_2D
# Script stays on Canvas (QuestPanel.ts); prefab is layout-only chrome.

# --- Layout table (display px) — mirrored in QuestPanel.ts ---
# Match FarmHUD bag/craft chrome (Graphics wood + parchment), not the AI journal frame.
PANEL_W, PANEL_H = 700, 1120
CHROME_INSET = 14  # parchment starts here (same as FarmHUD.drawCraftChrome)
INNER_PAD = 20
CONTENT_W = PANEL_W - CHROME_INSET * 2 - INNER_PAD * 2
CLOSE_BTN = 84  # FarmHUD CLOSE_BTN (56 * UI_SCALE 1.5)
CLOSE_PAD = 33  # FarmHUD placePanelCloseButton pad (22 * UI_SCALE)
# Header must clear the full close plate (pad + btn) — was 72 and X sat on the hero card.
HEADER_H = CLOSE_PAD + CLOSE_BTN + 28  # 145 — clears close icon + hit plate above hero
TITLE_Y = PANEL_H * 0.5 - INNER_PAD - HEADER_H * 0.42
CLOSE_X = PANEL_W * 0.5 - CLOSE_PAD - CLOSE_BTN * 0.5
CLOSE_Y = PANEL_H * 0.5 - CLOSE_PAD - CLOSE_BTN * 0.5
# No hero / section label — journal is just the quest list.
ROW_W, ROW_H, ROW_GAP = CONTENT_W, 152, 14
# No footer primary — 前往/领奖 lives on the active quest row.
FOOTER_CLEAR = -PANEL_H * 0.5 + CHROME_INSET + INNER_PAD
LIST_TOP = PANEL_H * 0.5 - HEADER_H - 12
BAND_H = max(ROW_H, LIST_TOP - FOOTER_CLEAR)
VISIBLE_ROWS = max(5, int((BAND_H + ROW_GAP) // (ROW_H + ROW_GAP)))
LIST_H = VISIBLE_ROWS * ROW_H + (VISIBLE_ROWS - 1) * ROW_GAP
LIST_Y = LIST_TOP - LIST_H * 0.5
LIST_BOTTOM = LIST_Y - LIST_H * 0.5
if LIST_BOTTOM < FOOTER_CLEAR:
    LIST_Y = FOOTER_CLEAR + LIST_H * 0.5
LIST_COUNT = VISIBLE_ROWS
ICON = 44
# ic-close from tool-frames.json
CLOSE_SF = "8a6550b2-1626-45d4-89ec-3cd35c8215fd@f9941"


def file_id():
    return "".join(random.choice(string.ascii_lowercase + string.digits) for _ in range(22))


def prefab_info(root_id, asset_id, fid):
    return {
        "__type__": "cc.PrefabInfo",
        "root": {"__id__": root_id},
        "asset": {"__id__": asset_id},
        "fileId": fid,
        "instance": None,
        "targetOverrides": None,
        "nestedPrefabInstanceRoots": None,
    }


def node_obj(name, parent_id, children_ids, comp_ids, prefab_info_id, x, y, ax=0.5, ay=0.5, active=True):
    return {
        "__type__": "cc.Node",
        "_name": name,
        "_objFlags": 0,
        "__editorExtras__": {},
        "_parent": None if parent_id is None else {"__id__": parent_id},
        "_children": [{"__id__": i} for i in children_ids],
        "_active": active,
        "_components": [{"__id__": i} for i in comp_ids],
        "_prefab": {"__id__": prefab_info_id},
        "_lpos": {"__type__": "cc.Vec3", "x": x, "y": y, "z": 0},
        "_lrot": {"__type__": "cc.Quat", "x": 0, "y": 0, "z": 0, "w": 1},
        "_lscale": {"__type__": "cc.Vec3", "x": 1, "y": 1, "z": 1},
        "_mobility": 0,
        "_layer": UI_LAYER,
        "_euler": {"__type__": "cc.Vec3", "x": 0, "y": 0, "z": 0},
        "_id": "",
    }


def uit_obj(node_id, prefab_info_id, w, h, ax=0.5, ay=0.5):
    return {
        "__type__": "cc.UITransform",
        "_name": "",
        "_objFlags": 0,
        "__editorExtras__": {},
        "node": {"__id__": node_id},
        "_enabled": True,
        "__prefab": {"__id__": prefab_info_id},
        "_contentSize": {"__type__": "cc.Size", "width": w, "height": h},
        "_anchorPoint": {"__type__": "cc.Vec2", "x": ax, "y": ay},
        "_id": "",
    }


def sprite_obj(node_id, prefab_info_id, sf_uuid):
    return {
        "__type__": "cc.Sprite",
        "_name": "",
        "_objFlags": 0,
        "__editorExtras__": {},
        "node": {"__id__": node_id},
        "_enabled": True,
        "__prefab": {"__id__": prefab_info_id},
        "_customMaterial": None,
        "_srcBlendFactor": 2,
        "_dstBlendFactor": 4,
        "_color": {"__type__": "cc.Color", "r": 255, "g": 255, "b": 255, "a": 255},
        "_spriteFrame": {"__uuid__": sf_uuid, "__expectedType__": "cc.SpriteFrame"} if sf_uuid else None,
        # SIMPLE when panel art matches display size (integer NEAREST scale).
        "_type": 0,
        "_fillType": 0,
        "_sizeMode": 0,
        "_fillCenter": {"__type__": "cc.Vec2", "x": 0, "y": 0},
        "_fillStart": 0,
        "_fillRange": 0,
        "_isTrimmedMode": False,
        "_useGrayscale": False,
        "_atlas": None,
        "_id": "",
    }


def label_obj(node_id, prefab_info_id, text, size, color, h_align=1, outline=True):
    return {
        "__type__": "cc.Label",
        "_name": "",
        "_objFlags": 0,
        "__editorExtras__": {},
        "node": {"__id__": node_id},
        "_enabled": True,
        "__prefab": {"__id__": prefab_info_id},
        "_customMaterial": None,
        "_srcBlendFactor": 2,
        "_dstBlendFactor": 4,
        "_color": {"__type__": "cc.Color", "r": color[0], "g": color[1], "b": color[2], "a": color[3]},
        "_string": text,
        "_horizontalAlign": h_align,
        "_verticalAlign": 1,
        "_actualFontSize": size,
        "_fontSize": size,
        "_fontFamily": "Arial",
        "_lineHeight": size + 6,
        "_overflow": 2,
        "_enableWrapText": False,
        "_font": None,
        "_isSystemFontUsed": True,
        "_spacingX": 0,
        "_isItalic": False,
        "_isBold": True,
        "_isUnderline": False,
        "_underlineHeight": 2,
        "_cacheMode": 0,
        "_enableOutline": outline,
        "_outlineColor": {"__type__": "cc.Color", "r": 62, "g": 34, "b": 16, "a": 230},
        "_outlineWidth": 3 if outline else 0,
        "_enableShadow": False,
        "_shadowColor": {"__type__": "cc.Color", "r": 0, "g": 0, "b": 0, "a": 0},
        "_shadowOffset": {"__type__": "cc.Vec2", "x": 0, "y": 0},
        "_shadowBlur": 0,
        "_id": "",
    }


def graphics_obj(node_id, prefab_info_id):
    return {
        "__type__": "cc.Graphics",
        "_name": "",
        "_objFlags": 0,
        "__editorExtras__": {},
        "node": {"__id__": node_id},
        "_enabled": True,
        "__prefab": {"__id__": prefab_info_id},
        "_customMaterial": None,
        "_lineWidth": 1,
        "_strokeColor": {"__type__": "cc.Color", "r": 0, "g": 0, "b": 0, "a": 255},
        "_lineJoin": 2,
        "_lineCap": 0,
        "_fillColor": {"__type__": "cc.Color", "r": 255, "g": 255, "b": 255, "a": 255},
        "_miterLimit": 10,
        "_id": "",
    }


def load_frames():
    data = json.loads(QUEST_FRAMES_JSON.read_text(encoding="utf-8"))
    # process_quest_ui_ai writes { panel: {spriteFrame, w, h}, ... }
    out = {}
    for k, v in data.items():
        if isinstance(v, dict):
            out[k] = v.get("spriteFrame", "")
        else:
            out[k] = v
    return out


def build(frames, prefab_uuid):
    class B(object):
        def __init__(self):
            self.items = []

        def add(self, o):
            self.items.append(o)
            return len(self.items) - 1

    b = B()
    b.add(
        {
            "__type__": "cc.Prefab",
            "_name": "QuestPanel",
            "_objFlags": 0,
            "__editorExtras__": {},
            "_native": "",
            "data": {"__id__": 1},
            "optimizationPolicy": 0,
            "persistent": False,
        }
    )
    root_id = b.add(None)
    assert root_id == 1

    root_pi = b.add(prefab_info(1, 0, file_id()))
    root_uit = b.add(uit_obj(1, root_pi, 1080, 1920))

    # Dim
    dim_pi = b.add(prefab_info(1, 0, file_id()))
    dim_id = b.add(None)
    dim_uit = b.add(uit_obj(dim_id, dim_pi, 2200, 4000))
    dim_g = b.add(graphics_obj(dim_id, dim_pi))

    # Panel
    panel_pi = b.add(prefab_info(1, 0, file_id()))
    panel_id = b.add(None)
    panel_uit = b.add(uit_obj(panel_id, panel_pi, PANEL_W, PANEL_H))
    panel_spr = b.add(sprite_obj(panel_id, panel_pi, frames.get("panel")))

    # Title
    title_pi = b.add(prefab_info(1, 0, file_id()))
    title_id = b.add(None)
    title_uit = b.add(uit_obj(title_id, title_pi, 360, 48))
    title_lab = b.add(label_obj(title_id, title_pi, "旅途日志", 36, (255, 236, 190, 255), 1, True))

    # List host
    list_pi = b.add(prefab_info(1, 0, file_id()))
    list_id = b.add(None)
    list_uit = b.add(uit_obj(list_id, list_pi, ROW_W, LIST_H))

    # Close = top-right X (same ic-close as bag/craft). Row actions are runtime-built.
    close_pi = b.add(prefab_info(1, 0, file_id()))
    close_id = b.add(None)
    close_uit = b.add(uit_obj(close_id, close_pi, int(CLOSE_BTN * 1.35), int(CLOSE_BTN * 1.35)))
    close_icon_pi = b.add(prefab_info(1, 0, file_id()))
    close_icon_id = b.add(None)
    close_icon_uit = b.add(uit_obj(close_icon_id, close_icon_pi, CLOSE_BTN, CLOSE_BTN))
    close_icon_spr = b.add(sprite_obj(close_icon_id, close_icon_pi, CLOSE_SF))

    # Fill nodes
    b.items[root_id] = node_obj(
        "QuestPanel",
        None,
        [dim_id, panel_id],
        [root_uit],
        root_pi,
        0,
        0,
        active=False,
    )
    b.items[root_uit]["node"] = {"__id__": 1}

    b.items[dim_id] = node_obj("Dim", 1, [], [dim_uit, dim_g], dim_pi, 0, 0)
    b.items[dim_uit]["node"] = {"__id__": dim_id}
    b.items[dim_g]["node"] = {"__id__": dim_id}

    b.items[panel_id] = node_obj(
        "Panel",
        1,
        [title_id, list_id, close_id],
        [panel_uit, panel_spr],
        panel_pi,
        0,
        10,
    )
    b.items[panel_uit]["node"] = {"__id__": panel_id}
    b.items[panel_spr]["node"] = {"__id__": panel_id}

    b.items[title_id] = node_obj("Title", panel_id, [], [title_uit, title_lab], title_pi, 0, TITLE_Y)
    b.items[title_uit]["node"] = {"__id__": title_id}
    b.items[title_lab]["node"] = {"__id__": title_id}

    b.items[list_id] = node_obj("List", panel_id, [], [list_uit], list_pi, 0, LIST_Y)
    b.items[list_uit]["node"] = {"__id__": list_id}

    b.items[close_id] = node_obj(
        "BtnClose", panel_id, [close_icon_id], [close_uit], close_pi, CLOSE_X, CLOSE_Y
    )
    b.items[close_uit]["node"] = {"__id__": close_id}
    b.items[close_icon_id] = node_obj(
        "Icon", close_id, [], [close_icon_uit, close_icon_spr], close_icon_pi, 0, 0
    )
    b.items[close_icon_uit]["node"] = {"__id__": close_icon_id}
    b.items[close_icon_spr]["node"] = {"__id__": close_icon_id}

    return b.items


def write_meta(prefab_uuid):
    meta_path = Path(str(OUT_PREFAB) + ".meta")
    if meta_path.exists():
        old = json.loads(meta_path.read_text(encoding="utf-8"))
        prefab_uuid = old.get("uuid", prefab_uuid)
    meta = {
        "ver": "1.1.50",
        "importer": "prefab",
        "imported": True,
        "uuid": prefab_uuid,
        "files": [".json"],
        "subMetas": {},
        "userData": {"syncNodeName": "QuestPanel"},
    }
    meta_path.write_text(json.dumps(meta, indent=2) + "\n", encoding="utf-8")
    return prefab_uuid


def patch_frames_ts(prefab_uuid):
    frames = json.loads(QUEST_FRAMES_JSON.read_text(encoding="utf-8"))
    lines = [
        "/** Auto-generated by tools/ui — do not edit by hand. */",
        "export const QUEST_FRAMES = {",
    ]
    for k, v in frames.items():
        sf = v["spriteFrame"] if isinstance(v, dict) else v
        lines.append("    {}: '{}',".format(k, sf))
    lines.append("} as const;")
    lines.append("")
    lines.append("/** Prefab asset uuid — layout source of truth. */")
    lines.append("export const QUEST_PANEL_PREFAB_UUID = '{}';".format(prefab_uuid))
    lines.append("")
    # layout constants for TS sync comment
    lines.append("/** Prefab layout (panel-local px). Keep in sync with generate_quest_panel_prefab.py */")
    lines.append("export const QUEST_LAYOUT = {")
    for name, val in [
        ("panelW", PANEL_W),
        ("panelH", PANEL_H),
        ("contentW", CONTENT_W),
        ("rowW", ROW_W),
        ("rowH", ROW_H),
        ("rowGap", ROW_GAP),
        ("listY", LIST_Y),
        ("listH", LIST_H),
        ("titleY", TITLE_Y),
        ("closeX", CLOSE_X),
        ("closeY", CLOSE_Y),
        ("closeBtn", CLOSE_BTN),
        ("icon", ICON),
    ]:
        lines.append("    {}: {},".format(name, val if not isinstance(val, float) else round(val, 1)))
    lines.append("} as const;")
    lines.append("")
    OUT_TS.write_text("\n".join(lines), encoding="utf-8")
    print("patched", OUT_TS)


def main():
    frames = load_frames()
    meta_path = Path(str(OUT_PREFAB) + ".meta")
    prefab_uuid = str(uuid.uuid4())
    if meta_path.exists():
        prefab_uuid = json.loads(meta_path.read_text(encoding="utf-8")).get("uuid", prefab_uuid)

    objs = build(frames, prefab_uuid)
    OUT_PREFAB.parent.mkdir(parents=True, exist_ok=True)
    OUT_PREFAB.write_text(json.dumps(objs, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    prefab_uuid = write_meta(prefab_uuid)
    patch_frames_ts(prefab_uuid)
    print("wrote", OUT_PREFAB, prefab_uuid)


if __name__ == "__main__":
    main()
