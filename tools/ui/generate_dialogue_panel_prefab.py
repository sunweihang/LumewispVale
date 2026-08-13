#!/usr/bin/env python3
"""Generate DialoguePanel.prefab + DialoguePanelFrames.ts — layout source of truth.

  /opt/homebrew/bin/python3.12 tools/ui/generate_dialogue_panel_prefab.py
"""
from __future__ import annotations

import json
import uuid
from pathlib import Path

from cocos_prefab_lib import PrefabBuilder

ROOT = Path(__file__).resolve().parents[2]
OUT_PREFAB = ROOT / "assets/prefabs/ui/DialoguePanel.prefab"
OUT_TS = ROOT / "assets/scripts/game/DialoguePanelFrames.ts"

# --- Layout (box-local, center origin) — mirrored in DialoguePanelFrames.ts ---
BOX_W, BOX_H = 1000, 260
BOX_Y = -780
AVATAR = 96
AVATAR_FRAME = 108
NAME_PLATE_W, NAME_PLATE_H = 220, 48
NAME_STACK_X = -BOX_W * 0.5 + 130
NAME_Y = BOX_H * 0.5 + 2
PORTRAIT_Y = NAME_Y + NAME_PLATE_H * 0.5 + 8 + AVATAR_FRAME * 0.5
BODY_Y_SPEAKER = 78
BODY_Y_NARRATION = 96
BODY_W = BOX_W - 100
HINT_X = -BOX_W * 0.5 + BOX_W - 118  # x0 + BOX_W - 118
HINT_Y = -BOX_H * 0.5 + 70
ARROW_Y = 16
CREAM = (255, 246, 220, 255)
HINT_GOLD = (255, 230, 150, 255)


def build() -> PrefabBuilder:
    b = PrefabBuilder("DialoguePanel")
    # Root keeps legacy canvas name so HUD chrome hide lists still find it.
    root = b.node("DialogueBox", None, 0, BOX_Y, BOX_W, BOX_H, active=False)
    assert root == 1

    chrome = b.node("Chrome", root, 0, 0, BOX_W, BOX_H, with_graphics=True)

    portrait = b.node("Portrait", root, NAME_STACK_X, PORTRAIT_Y, AVATAR_FRAME, AVATAR_FRAME, with_graphics=True, active=False)
    face = b.node("Face", portrait, 0, 0, AVATAR, AVATAR, sprite="")
    # Empty sprite uuid → clear spriteFrame in JSON
    for item in b.items:
        if isinstance(item, dict) and item.get("__type__") == "cc.Sprite" and item.get("node", {}).get("__id__") == face:
            item["_spriteFrame"] = None
    b.set_children(portrait, [face])

    name_plate = b.node(
        "NamePlate", root, NAME_STACK_X, NAME_Y, NAME_PLATE_W, NAME_PLATE_H, with_graphics=True, active=False
    )
    name = b.node(
        "Name",
        name_plate,
        0,
        0,
        200,
        36,
        label={
            "text": " ",
            "size": 28,
            "color": (255, 252, 230, 255),
            "h_align": 1,
            "outline": True,
            "overflow": 1,  # CLAMP
        },
    )
    b.set_children(name_plate, [name])

    body = b.node(
        "Body",
        root,
        0,
        BODY_Y_NARRATION,
        BODY_W,
        150,
        label={
            "text": "",
            "size": 34,
            "color": CREAM,
            "h_align": 0,
            "outline": True,
            "overflow": 3,  # RESIZE_HEIGHT
            "wrap": True,
        },
    )
    # Top-anchored body (runtime also sets ay=1).
    for item in b.items:
        if isinstance(item, dict) and item.get("__type__") == "cc.UITransform" and item.get("node", {}).get("__id__") == body:
            item["_anchorPoint"] = {"__type__": "cc.Vec2", "x": 0.5, "y": 1}

    hint = b.node("Hint", root, HINT_X, HINT_Y, 200, 64)
    arrow = b.node("HintArrow", hint, 0, ARROW_Y, 36, 24, with_graphics=True)
    hint_lab = b.node(
        "HintLab",
        hint,
        0,
        -14,
        200,
        32,
        label={
            "text": "点击继续",
            "size": 24,
            "color": HINT_GOLD,
            "h_align": 1,
            "outline": True,
            "overflow": 1,
        },
    )
    b.set_children(hint, [arrow, hint_lab])

    b.set_children(root, [chrome, portrait, name_plate, body, hint])
    return b


def write_meta(path: Path, name: str, prefab_uuid: str) -> str:
    meta_path = Path(str(path) + ".meta")
    if meta_path.exists():
        prefab_uuid = json.loads(meta_path.read_text(encoding="utf-8")).get("uuid", prefab_uuid)
    meta = {
        "ver": "1.1.50",
        "importer": "prefab",
        "imported": True,
        "uuid": prefab_uuid,
        "files": [".json"],
        "subMetas": {},
        "userData": {"syncNodeName": name},
    }
    meta_path.write_text(json.dumps(meta, indent=2) + "\n", encoding="utf-8")
    return prefab_uuid


def main():
    prefab_uuid = str(uuid.uuid4())
    meta_path = Path(str(OUT_PREFAB) + ".meta")
    if meta_path.exists():
        prefab_uuid = json.loads(meta_path.read_text(encoding="utf-8")).get("uuid", prefab_uuid)

    pb = build()
    OUT_PREFAB.parent.mkdir(parents=True, exist_ok=True)
    OUT_PREFAB.write_text(json.dumps(pb.items, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    # syncNodeName must match root node (DialogueBox) so Cocos import doesn't rename.
    prefab_uuid = write_meta(OUT_PREFAB, "DialogueBox", prefab_uuid)

    values = {
        "boxW": BOX_W,
        "boxH": BOX_H,
        "boxY": BOX_Y,
        "avatar": AVATAR,
        "avatarFrame": AVATAR_FRAME,
        "namePlateW": NAME_PLATE_W,
        "namePlateH": NAME_PLATE_H,
        "nameStackX": NAME_STACK_X,
        "nameY": NAME_Y,
        "portraitY": PORTRAIT_Y,
        "bodyYSpeaker": BODY_Y_SPEAKER,
        "bodyYNarration": BODY_Y_NARRATION,
        "bodyW": BODY_W,
        "hintX": HINT_X,
        "hintY": HINT_Y,
        "arrowY": ARROW_Y,
    }
    lines = [
        "/** Auto-generated by tools/ui/generate_dialogue_panel_prefab.py — do not edit by hand. */",
        f"export const DIALOGUE_PANEL_PREFAB_UUID = '{prefab_uuid}';",
        "",
        "/** Prefab layout (box-local px). */",
        "export const DIALOGUE_PANEL_LAYOUT = {",
    ]
    for k, v in values.items():
        if isinstance(v, float):
            lines.append(f"    {k}: {round(v, 1)},")
        else:
            lines.append(f"    {k}: {v},")
    lines.append("} as const;")
    lines.append("")
    OUT_TS.write_text("\n".join(lines), encoding="utf-8")
    print("wrote", OUT_PREFAB, prefab_uuid)
    print("patched", OUT_TS)


if __name__ == "__main__":
    main()
