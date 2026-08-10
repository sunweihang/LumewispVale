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
PANEL_W, PANEL_H = 620, 900
CONTENT_W = 540
TITLE_Y = PANEL_H * 0.5 - 50
HERO_W, HERO_H = CONTENT_W, 128
HERO_Y = PANEL_H * 0.5 - 158
SECTION_Y = HERO_Y - HERO_H * 0.5 - 30
ROW_W, ROW_H, ROW_GAP = CONTENT_W, 60, 6
LIST_COUNT = 7
LIST_H = LIST_COUNT * ROW_H + (LIST_COUNT - 1) * ROW_GAP
LIST_TOP = SECTION_Y - 26
LIST_Y = LIST_TOP - LIST_H * 0.5
BTN_W_SEC, BTN_W_PRI, BTN_H = 150, 176, 56
BTN_Y = -PANEL_H * 0.5 + 58
ICON = 40


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
        "_type": 1,  # SLICED — respect sprite-frame border*
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
    title_uit = b.add(uit_obj(title_id, title_pi, 320, 40))
    title_lab = b.add(label_obj(title_id, title_pi, "旅途日志", 30, (255, 236, 190, 255), 1, True))

    # Hero
    hero_pi = b.add(prefab_info(1, 0, file_id()))
    hero_id = b.add(None)
    hero_uit = b.add(uit_obj(hero_id, hero_pi, HERO_W, HERO_H))
    hero_g = b.add(graphics_obj(hero_id, hero_pi))

    hero_icon_pi = b.add(prefab_info(1, 0, file_id()))
    hero_icon_id = b.add(None)
    hero_icon_uit = b.add(uit_obj(hero_icon_id, hero_icon_pi, ICON, ICON))
    hero_icon_spr = b.add(sprite_obj(hero_icon_id, hero_icon_pi, None))

    hero_title_pi = b.add(prefab_info(1, 0, file_id()))
    hero_title_id = b.add(None)
    hero_title_uit = b.add(uit_obj(hero_title_id, hero_title_pi, HERO_W - 100, 30, 0, 0.5))
    hero_title_lab = b.add(label_obj(hero_title_id, hero_title_pi, "", 24, (68, 40, 18, 255), 0, False))

    hero_desc_pi = b.add(prefab_info(1, 0, file_id()))
    hero_desc_id = b.add(None)
    hero_desc_uit = b.add(uit_obj(hero_desc_id, hero_desc_pi, HERO_W - 100, 40, 0, 0.5))
    hero_desc_lab = b.add(label_obj(hero_desc_id, hero_desc_pi, "", 16, (102, 72, 40, 255), 0, False))

    hero_prog_pi = b.add(prefab_info(1, 0, file_id()))
    hero_prog_id = b.add(None)
    hero_prog_uit = b.add(uit_obj(hero_prog_id, hero_prog_pi, 80, 22, 1, 0.5))
    hero_prog_lab = b.add(label_obj(hero_prog_id, hero_prog_pi, "", 16, (80, 52, 24, 255), 2, False))

    hero_bar_pi = b.add(prefab_info(1, 0, file_id()))
    hero_bar_id = b.add(None)
    hero_bar_uit = b.add(uit_obj(hero_bar_id, hero_bar_pi, HERO_W - 48, 14))
    hero_bar_g = b.add(graphics_obj(hero_bar_id, hero_bar_pi))

    # Section
    sec_pi = b.add(prefab_info(1, 0, file_id()))
    sec_id = b.add(None)
    sec_uit = b.add(uit_obj(sec_id, sec_pi, CONTENT_W, 24, 0, 0.5))
    sec_lab = b.add(label_obj(sec_id, sec_pi, "旅途步骤", 18, (120, 78, 40, 255), 0, False))

    # List host
    list_pi = b.add(prefab_info(1, 0, file_id()))
    list_id = b.add(None)
    list_uit = b.add(uit_obj(list_id, list_pi, ROW_W, LIST_H))

    # Buttons
    def mk_btn(name, w, sf, label, color):
        pi = b.add(prefab_info(1, 0, file_id()))
        nid = b.add(None)
        uit = b.add(uit_obj(nid, pi, w, BTN_H))
        spr = b.add(sprite_obj(nid, pi, sf))
        lpi = b.add(prefab_info(1, 0, file_id()))
        lid = b.add(None)
        luit = b.add(uit_obj(lid, lpi, w, BTN_H))
        llab = b.add(label_obj(lid, lpi, label, 24, color, 1, True))
        return nid, uit, spr, lid, luit, llab, pi, lpi

    close = mk_btn("BtnClose", BTN_W_SEC, frames.get("btnSecondary"), "关闭", (255, 236, 200, 255))
    goto = mk_btn("BtnGoto", BTN_W_PRI, frames.get("btnPrimary"), "去完成", (255, 252, 230, 255))

    # Fill nodes
    text_left = -HERO_W * 0.5 + 72
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
        [title_id, hero_id, sec_id, list_id, close[0], goto[0]],
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

    b.items[hero_id] = node_obj(
        "Hero",
        panel_id,
        [hero_icon_id, hero_title_id, hero_desc_id, hero_prog_id, hero_bar_id],
        [hero_uit, hero_g],
        hero_pi,
        0,
        HERO_Y,
    )
    b.items[hero_uit]["node"] = {"__id__": hero_id}
    b.items[hero_g]["node"] = {"__id__": hero_id}

    b.items[hero_icon_id] = node_obj(
        "HeroIcon", hero_id, [], [hero_icon_uit, hero_icon_spr], hero_icon_pi, -HERO_W * 0.5 + 36, 10
    )
    b.items[hero_icon_uit]["node"] = {"__id__": hero_icon_id}
    b.items[hero_icon_spr]["node"] = {"__id__": hero_icon_id}

    b.items[hero_title_id] = node_obj(
        "HeroTitle", hero_id, [], [hero_title_uit, hero_title_lab], hero_title_pi, text_left, 28
    )
    b.items[hero_title_uit]["node"] = {"__id__": hero_title_id}
    b.items[hero_title_lab]["node"] = {"__id__": hero_title_id}

    b.items[hero_desc_id] = node_obj(
        "HeroDesc", hero_id, [], [hero_desc_uit, hero_desc_lab], hero_desc_pi, text_left, 0
    )
    b.items[hero_desc_uit]["node"] = {"__id__": hero_desc_id}
    b.items[hero_desc_lab]["node"] = {"__id__": hero_desc_id}

    b.items[hero_prog_id] = node_obj(
        "HeroProg",
        hero_id,
        [],
        [hero_prog_uit, hero_prog_lab],
        hero_prog_pi,
        HERO_W * 0.5 - 16,
        -40,
    )
    b.items[hero_prog_uit]["node"] = {"__id__": hero_prog_id}
    b.items[hero_prog_lab]["node"] = {"__id__": hero_prog_id}

    b.items[hero_bar_id] = node_obj(
        "HeroBar", hero_id, [], [hero_bar_uit, hero_bar_g], hero_bar_pi, 0, -40
    )
    b.items[hero_bar_uit]["node"] = {"__id__": hero_bar_id}
    b.items[hero_bar_g]["node"] = {"__id__": hero_bar_id}

    b.items[sec_id] = node_obj(
        "Section", panel_id, [], [sec_uit, sec_lab], sec_pi, -CONTENT_W * 0.5, SECTION_Y
    )
    b.items[sec_uit]["node"] = {"__id__": sec_id}
    b.items[sec_lab]["node"] = {"__id__": sec_id}

    b.items[list_id] = node_obj("List", panel_id, [], [list_uit], list_pi, 0, LIST_Y)
    b.items[list_uit]["node"] = {"__id__": list_id}

    for pack, x in ((close, -110), (goto, 120)):
        nid, uit, spr, lid, luit, llab, pi, lpi = pack
        b.items[nid] = node_obj(
            "BtnClose" if pack is close else "BtnGoto",
            panel_id,
            [lid],
            [uit, spr],
            pi,
            x,
            BTN_Y,
        )
        b.items[uit]["node"] = {"__id__": nid}
        b.items[spr]["node"] = {"__id__": nid}
        b.items[lid] = node_obj("Label", nid, [], [luit, llab], lpi, 0, 0)
        b.items[luit]["node"] = {"__id__": lid}
        b.items[llab]["node"] = {"__id__": lid}

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
        ("heroW", HERO_W),
        ("heroH", HERO_H),
        ("heroY", HERO_Y),
        ("sectionY", SECTION_Y),
        ("rowW", ROW_W),
        ("rowH", ROW_H),
        ("rowGap", ROW_GAP),
        ("listY", LIST_Y),
        ("listH", LIST_H),
        ("btnY", BTN_Y),
        ("icon", ICON),
    ]:
        lines.append("    {}: {},".format(name, val if not isinstance(val, float) else round(val, 2)))
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
