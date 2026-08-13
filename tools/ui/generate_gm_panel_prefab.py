#!/usr/bin/env python3
"""Generate GmPanel.prefab + GmChip.prefab + GmPanelFrames.ts — dev panel shell.

  /opt/homebrew/bin/python3.12 tools/ui/generate_gm_panel_prefab.py

Sized for 1080×1920 design frame (matches GmPanel.ts PANEL_EDGE math).
Tab page bodies stay code-built into Pages.
"""
from __future__ import annotations

import json
import uuid
from pathlib import Path

from cocos_prefab_lib import CLOSE_SF, PrefabBuilder

ROOT = Path(__file__).resolve().parents[2]
OUT_PANEL = ROOT / "assets/prefabs/ui/GmPanel.prefab"
OUT_CHIP = ROOT / "assets/prefabs/ui/GmChip.prefab"
OUT_TS = ROOT / "assets/scripts/game/GmPanelFrames.ts"

# Design frame 1080×1920 — same as runtime with PANEL_EDGE=48.
PANEL_EDGE = 48
PANEL_W = min(960, 1080 - PANEL_EDGE * 2)  # 960
PANEL_H = min(1580, 1920 - PANEL_EDGE * 2 - 40)  # 1580
PANEL_Y = 10
CONTENT_W = PANEL_W - 72
# Clear wood rim; close owns the top-right band alone.
CLOSE_BTN, CLOSE_PAD = 84, 56
CLOSE_HIT = int(CLOSE_BTN * 1.85)
CLOSE_X = PANEL_W * 0.5 - CLOSE_PAD - CLOSE_BTN * 0.5
CLOSE_Y = PANEL_H * 0.5 - CLOSE_PAD - CLOSE_BTN * 0.5
TAB_H, TAB_GAP = 56, 10
_close_left = CLOSE_X - CLOSE_HIT * 0.5
# Centered tab row right edge ≤ close hit left − 12.
_max_tab_total = 2 * (_close_left - 12)
TAB_W = max(96, min(118, int((_max_tab_total - TAB_GAP * 4) / 5)))
TABS = ["time", "item", "quest", "qtest", "system"]
TAB_LABELS = {"time": "时间", "item": "道具", "quest": "章节", "qtest": "测任务", "system": "系统"}
TAB_TOTAL = len(TABS) * TAB_W + (len(TABS) - 1) * TAB_GAP
# Drop tabs below close hit — title follows just above tabs (whole block moves down).
TAB_Y = CLOSE_Y - CLOSE_HIT * 0.5 - 18 - TAB_H * 0.5
TITLE_Y = TAB_Y + TAB_H * 0.5 + 40
HEADER_H = int(PANEL_H * 0.5 - (TAB_Y - TAB_H * 0.5) + 28)
FOOTER_H = 60
PAGES_H = PANEL_H - HEADER_H - FOOTER_H
PAGES_Y = -((HEADER_H - FOOTER_H) * 0.5)
PAGES_W = CONTENT_W
HINT_Y = -PANEL_H * 0.5 + 32
# Match QuestPanel / TownShop readable sizes.
FONT_TITLE = 36
FONT_TAB = 28
FONT_HINT = 22

CHIP_W, CHIP_H = 72, 44
CHIP_X, CHIP_Y = -540 + 48, 960 - 56

TITLE_CREAM = (255, 244, 214, 255)
HINT_MUTE = (180, 160, 120, 255)
CHIP_LAB = (255, 236, 180, 255)
INK = (62, 40, 22, 255)


def build_panel() -> PrefabBuilder:
    b = PrefabBuilder("GmPanel")
    root = b.node("GmPanel", None, 0, 0, 1080, 1920, active=False)
    assert root == 1

    dim = b.node("Dim", root, 0, 0, 2200, 4000, with_graphics=True)
    panel = b.node("Panel", root, 0, PANEL_Y, PANEL_W, PANEL_H)
    chrome = b.node("Chrome", panel, 0, 0, PANEL_W, PANEL_H, with_graphics=True)

    title = b.node(
        "Title",
        panel,
        0,
        TITLE_Y,
        PANEL_W - 200,
        48,
        label={
            "text": "GM · 调试",
            "size": FONT_TITLE,
            "color": TITLE_CREAM,
            "h_align": 1,
            "outline": True,
        },
    )

    close = b.node("Close", panel, CLOSE_X, CLOSE_Y, CLOSE_HIT, CLOSE_HIT)
    close_icon = b.node("Icon", close, 0, 0, CLOSE_BTN, CLOSE_BTN, sprite=CLOSE_SF)
    b.set_children(close, [close_icon])

    tab_ids = []
    for i, tid in enumerate(TABS):
        x = -TAB_TOTAL * 0.5 + TAB_W * 0.5 + i * (TAB_W + TAB_GAP)
        tab = b.node(f"Tab_{tid}", panel, x, TAB_Y, TAB_W, TAB_H, with_graphics=True)
        lab = b.node(
            "Label",
            tab,
            0,
            0,
            TAB_W - 8,
            TAB_H,
            label={
                "text": TAB_LABELS[tid],
                "size": FONT_TAB,
                "color": INK,
                "h_align": 1,
                "overflow": 2,
            },
        )
        b.set_children(tab, [lab])
        tab_ids.append(tab)

    pages = b.node("Pages", panel, 0, PAGES_Y, PAGES_W, PAGES_H)

    hint = b.node(
        "Hint",
        panel,
        0,
        HINT_Y,
        PANEL_W - 40,
        32,
        label={
            "text": "F1 / ` 开关 · Esc 关闭",
            "size": FONT_HINT,
            "color": HINT_MUTE,
            "h_align": 1,
        },
    )

    # Close last so it paints above chrome / title and is never covered.
    b.set_children(panel, [chrome, title, *tab_ids, pages, hint, close])
    b.set_children(root, [dim, panel])
    return b


def build_chip() -> PrefabBuilder:
    b = PrefabBuilder("GmChip")
    root = b.node("GmChip", None, CHIP_X, CHIP_Y, CHIP_W, CHIP_H, with_graphics=True)
    assert root == 1
    lab = b.node(
        "Label",
        root,
        0,
        0,
        CHIP_W,
        CHIP_H,
        label={
            "text": "GM",
            "size": 22,
            "color": CHIP_LAB,
            "h_align": 1,
            "outline": True,
        },
    )
    b.set_children(root, [lab])
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


def main() -> None:
    panel_uuid = str(uuid.uuid4())
    chip_uuid = str(uuid.uuid4())
    panel_meta = Path(str(OUT_PANEL) + ".meta")
    chip_meta = Path(str(OUT_CHIP) + ".meta")
    if panel_meta.exists():
        panel_uuid = json.loads(panel_meta.read_text(encoding="utf-8")).get("uuid", panel_uuid)
    if chip_meta.exists():
        chip_uuid = json.loads(chip_meta.read_text(encoding="utf-8")).get("uuid", chip_uuid)

    OUT_PANEL.parent.mkdir(parents=True, exist_ok=True)
    pb = build_panel()
    OUT_PANEL.write_text(json.dumps(pb.items, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    panel_uuid = write_meta(OUT_PANEL, "GmPanel", panel_uuid)

    cb = build_chip()
    OUT_CHIP.write_text(json.dumps(cb.items, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    chip_uuid = write_meta(OUT_CHIP, "GmChip", chip_uuid)

    values = {
        "panelW": PANEL_W,
        "panelH": PANEL_H,
        "panelY": PANEL_Y,
        "contentW": CONTENT_W,
        "titleY": TITLE_Y,
        "tabY": TAB_Y,
        "tabW": TAB_W,
        "tabH": TAB_H,
        "tabGap": TAB_GAP,
        "pagesW": PAGES_W,
        "pagesH": PAGES_H,
        "pagesY": PAGES_Y,
        "hintY": HINT_Y,
        "closeX": CLOSE_X,
        "closeY": CLOSE_Y,
        "closeBtn": CLOSE_BTN,
        "closePad": CLOSE_PAD,
        "closeHit": CLOSE_HIT,
        "chipW": CHIP_W,
        "chipH": CHIP_H,
        "chipX": CHIP_X,
        "chipY": CHIP_Y,
    }
    lines = [
        "/** Auto-generated by tools/ui/generate_gm_panel_prefab.py — do not edit by hand. */",
        f"export const GM_PANEL_PREFAB_UUID = '{panel_uuid}';",
        f"export const GM_CHIP_PREFAB_UUID = '{chip_uuid}';",
        "",
        "/** Prefab layout (panel-local / canvas-local px). */",
        "export const GM_PANEL_LAYOUT = {",
    ]
    for k, v in values.items():
        if isinstance(v, float):
            lines.append(f"    {k}: {round(v, 1)},")
        else:
            lines.append(f"    {k}: {v},")
    lines.append("} as const;")
    lines.append("")
    lines.append("export const GM_TAB_IDS = ['time', 'item', 'quest', 'qtest', 'system'] as const;")
    lines.append("")
    OUT_TS.write_text("\n".join(lines), encoding="utf-8")
    print("wrote", OUT_PANEL, panel_uuid)
    print("wrote", OUT_CHIP, chip_uuid)
    print("patched", OUT_TS)


if __name__ == "__main__":
    main()
