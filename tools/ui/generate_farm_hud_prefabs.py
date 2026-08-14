#!/usr/bin/env python3
"""Generate FarmHUD panel shells + FarmHudFrames.ts — layout source of truth.

  /opt/homebrew/bin/python3.12 tools/ui/generate_farm_hud_prefabs.py
"""
from __future__ import annotations

import json
import uuid
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from cocos_prefab_lib import CLOSE_SF, PrefabBuilder

ROOT = Path(__file__).resolve().parents[2]
OUT_DIR = ROOT / "assets/prefabs/ui"
OUT_TS = ROOT / "assets/scripts/game/FarmHudFrames.ts"

# Sprite frames (TOOL_FRAMES / QUEST_FRAMES)
BAG_BTN_SF = "89728dad-dce4-4748-9b4d-d688cec61b94@f9941"
QUEST_BTN_SF = "e639ab24-7c1a-46ba-93a4-688ca1c1ab08@f9941"
CRAFT_BTN_SF = "3eba857b-a5fc-480e-8219-0119c732d737@f9941"
AD_VIDEO_SF = "a375b4ec-204f-4af5-a64f-8608d7a8e195@f9941"
SLOT_SF = "0287b05b-8840-4983-ace0-3bbfbc28f9a8@f9941"

# --- Layout (matches FarmHUD.ts UI_SCALE=1.5) ---
UI_SCALE = 1.5
SLOT = round(100 * UI_SCALE)  # 150
PLATE = round(88 * UI_SCALE)  # 132
ICON = round(64 * UI_SCALE)  # 96
SLOT_COUNT = 7
GAP = 4
BAR_INNER_PAD = 3
BAR_BG_W = SLOT_COUNT * SLOT + (SLOT_COUNT - 1) * GAP + BAR_INNER_PAD * 2  # 1080
BAR_PAD_Y = round(20 * UI_SCALE)  # 30
BAR_H = SLOT + BAR_PAD_Y  # 180
BAR_Y = -860
BAG_BTN = round(120 * UI_SCALE)  # 180
CLOSE_BTN = round(56 * UI_SCALE)  # 84
CLOSE_PAD = 33
CLOSE_HIT = round(CLOSE_BTN * 1.85)  # 155

INV_COLS = 7
INV_STORAGE_ROWS = 3
INV_SLOT = SLOT
INV_GAP = GAP
INV_PAD = round(22 * UI_SCALE)  # 33
INV_TITLE_H = round(48 * UI_SCALE)  # 72
INV_DOCK_GAP = round(12 * UI_SCALE)  # 18

BAG_GRID_W = INV_COLS * INV_SLOT + (INV_COLS - 1) * INV_GAP  # 1074
BAG_GRID_H = INV_STORAGE_ROWS * INV_SLOT + (INV_STORAGE_ROWS - 1) * INV_GAP  # 458
BAG_PANEL_W = max(BAG_GRID_W + INV_PAD * 2, BAR_BG_W + round(16 * UI_SCALE))  # 1140
BAG_UPPER_H = INV_PAD + INV_TITLE_H + BAG_GRID_H + INV_DOCK_GAP
BAG_PANEL_H = BAG_UPPER_H + BAR_H  # 761
BAG_PANEL_BOTTOM = BAR_Y - BAR_H * 0.5
BAG_PANEL_Y = BAG_PANEL_BOTTOM + BAG_PANEL_H * 0.5  # -569.5
BAG_TITLE_Y = BAG_PANEL_H * 0.5 - INV_PAD - INV_TITLE_H * 0.42
BAG_GRID_Y = -BAG_PANEL_H * 0.5 + BAR_H + INV_DOCK_GAP + BAG_GRID_H * 0.5

CHEST_PAD = round(18 * UI_SCALE)  # 27
CHEST_TITLE_H = round(40 * UI_SCALE)  # 60
CHEST_SECTION_GAP = round(36 * UI_SCALE)  # 54
CHEST_BTN_H = round(40 * UI_SCALE)  # 60
CHEST_DOCK_GAP = INV_DOCK_GAP
CHEST_ROWS = 3
CHEST_COLS = 7
CHEST_SLOT = SLOT
CHEST_GAP = GAP
CHEST_GRID_W = SLOT_COUNT * SLOT + (SLOT_COUNT - 1) * GAP  # 1074
CHEST_GRID_H = CHEST_ROWS * CHEST_SLOT + (CHEST_ROWS - 1) * CHEST_GAP  # 458
CHEST_BAG_H = INV_STORAGE_ROWS * CHEST_SLOT + (INV_STORAGE_ROWS - 1) * CHEST_GAP  # 458
CHEST_PANEL_W = max(CHEST_GRID_W + CHEST_PAD * 2, BAR_BG_W + round(16 * UI_SCALE))  # 1128
CHEST_UPPER_H = (
    CHEST_PAD
    + CHEST_TITLE_H
    + round(22 * UI_SCALE)
    + CHEST_GRID_H
    + CHEST_SECTION_GAP
    + CHEST_BAG_H
    + CHEST_DOCK_GAP
)
CHEST_PANEL_H = CHEST_UPPER_H + BAR_H  # 1288
CHEST_PANEL_Y = BAG_PANEL_BOTTOM + CHEST_PANEL_H * 0.5
CHEST_TITLE_Y = CHEST_PANEL_H * 0.5 - CHEST_PAD - CHEST_TITLE_H * 0.42
CHEST_HINT_Y = CHEST_TITLE_Y - CHEST_TITLE_H * 0.55
CHEST_GRID_Y = CHEST_TITLE_Y - CHEST_TITLE_H * 0.75 - round(8 * UI_SCALE) - CHEST_GRID_H * 0.5
CHEST_BOTTOM = CHEST_GRID_Y - CHEST_GRID_H * 0.5
CHEST_BAG_GRID_Y = CHEST_BOTTOM - CHEST_SECTION_GAP - CHEST_BAG_H * 0.5
CHEST_SEC_Y = (CHEST_BOTTOM + (CHEST_BAG_GRID_Y + CHEST_BAG_H * 0.5)) * 0.5
TAKE_ALL_W = round(220 * UI_SCALE)  # 330
TAKE_ALL_H = max(CHEST_BTN_H, round(44 * UI_SCALE))  # 66
TAKE_ALL_PAD = round(18 * UI_SCALE)  # 27
TAKE_ALL_X = -CHEST_PANEL_W * 0.5 + TAKE_ALL_PAD + TAKE_ALL_W * 0.5

CRAFT_PAD = round(18 * UI_SCALE)  # 27
CRAFT_HEADER_H = round(72 * UI_SCALE)  # 108
CRAFT_TITLE_H = round(40 * UI_SCALE)  # 60
CRAFT_ROW_H = round(88 * UI_SCALE)  # 132
CRAFT_ROW_GAP = round(10 * UI_SCALE)  # 15
CRAFT_BTN_W = 180
CRAFT_BTN_H = 66
CRAFT_OUT_SZ = round(64 * UI_SCALE)  # 96
CRAFT_NAME_COL_W = round(128 * UI_SCALE)  # 192
CRAFT_COST_ICON = round(36 * UI_SCALE)  # 54
CRAFT_COST_CELL_W = round(100 * UI_SCALE)  # 150
CRAFT_COST_SLOTS = 2
CRAFT_COL_GAP = round(14 * UI_SCALE)  # 21
CRAFT_AD_SZ = round(52 * UI_SCALE)  # 78
CRAFT_BAR_H = round(40 * UI_SCALE)  # 60
CRAFT_MID_W = CRAFT_NAME_COL_W + CRAFT_COL_GAP + CRAFT_COST_SLOTS * CRAFT_COST_CELL_W
CRAFT_PANEL_W = max(
    BAR_BG_W + round(48 * UI_SCALE),
    CRAFT_PAD * 2 + CRAFT_OUT_SZ + CRAFT_COL_GAP + CRAFT_MID_W + CRAFT_COL_GAP + CRAFT_BTN_W,
)  # 1152
CRAFT_ROW_W = CRAFT_PANEL_W - CRAFT_PAD * 2  # 1098
# Default shell height for 1 recipe (runtime resizes ListHost / panel for N).
CRAFT_LIST_H_1 = CRAFT_ROW_H
CRAFT_PANEL_H_1 = CRAFT_PAD + CRAFT_HEADER_H + round(8 * UI_SCALE) + CRAFT_LIST_H_1 + CRAFT_PAD

LEARN_PANEL_W = round(520 * UI_SCALE)  # 780
LEARN_PANEL_H = round(360 * UI_SCALE)  # 540
LEARN_ICON = round(72 * UI_SCALE)  # 108
LEARN_BTN_W = round(220 * UI_SCALE)  # 330
LEARN_BTN_H = round(72 * UI_SCALE)  # 108
LEARN_PANEL_Y = round(80 * UI_SCALE)  # 120
LEARN_TITLE_Y = LEARN_PANEL_H * 0.5 - round(56 * UI_SCALE)
LEARN_ICON_ROW_Y = round(48 * UI_SCALE)
# Name / desc / button must stack — a 108px centered desc box sat on the learn button.
LEARN_NAME_Y = round(-16 * UI_SCALE)  # -24
LEARN_NAME_H = round(36 * UI_SCALE)  # 54
LEARN_DESC_Y = round(-59 * UI_SCALE)  # -88
LEARN_DESC_H = round(44 * UI_SCALE)  # 66
LEARN_BTN_Y = -LEARN_PANEL_H * 0.5 + LEARN_BTN_H * 0.5 + round(12 * UI_SCALE)  # -198

TIP_W = round(280 * UI_SCALE)  # 420
TIP_H = round(110 * UI_SCALE)  # 165
TIP_TITLE_Y = round(26 * UI_SCALE)
TIP_DESC_Y = round(-18 * UI_SCALE)

EDGE_PAD = round(6 * UI_SCALE)  # 9
BAG_BTN_X = BAR_BG_W * 0.5 - BAG_BTN * 0.5 - EDGE_PAD  # 441
BAG_BTN_Y = SLOT * 0.5 + BAG_BTN * 0.5  # 165
QUEST_GAP = round(10 * UI_SCALE)  # 15
QUEST_BTN_X = BAG_BTN_X - BAG_BTN - QUEST_GAP
QUEST_BTN_Y = BAG_BTN_Y

CREAM = (255, 244, 214, 255)
INK = (62, 40, 22, 255)
INK_MUTE = (110, 88, 64, 255)
HINT = (210, 190, 150, 255)
TIP_TITLE_C = (40, 36, 30, 255)
TIP_DESC_C = (70, 64, 54, 255)


def close_xy(panel_w: float, panel_h: float) -> Tuple[float, float]:
    return (
        panel_w * 0.5 - CLOSE_PAD - CLOSE_BTN * 0.5,
        panel_h * 0.5 - CLOSE_PAD - CLOSE_BTN * 0.5,
    )


def add_close(b: PrefabBuilder, panel_id: int, panel_w: float, panel_h: float) -> int:
    cx, cy = close_xy(panel_w, panel_h)
    close = b.node("CloseBtn", panel_id, cx, cy, CLOSE_HIT, CLOSE_HIT)
    icon = b.node("Icon", close, 0, 0, CLOSE_BTN, CLOSE_BTN, sprite=CLOSE_SF)
    b.set_children(close, [icon])
    return close


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


def emit(b: PrefabBuilder, out: Path, name: str, prefab_uuid: str) -> str:
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(b.items, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return write_meta(out, name, prefab_uuid)


def build_hotbar() -> PrefabBuilder:
    b = PrefabBuilder("FarmHotbar")
    root = b.node("FarmHotbar", None, 0, BAR_Y, BAR_BG_W, BAR_H)
    assert root == 1

    bg = b.node("BarBg", root, 0, 0, BAR_BG_W, BAR_H, with_graphics=True)

    total_w = SLOT_COUNT * SLOT + (SLOT_COUNT - 1) * GAP
    start_x = -total_w * 0.5 + SLOT * 0.5
    slots: List[int] = []
    for i in range(SLOT_COUNT):
        x = start_x + i * (SLOT + GAP)
        slot = b.node(f"Slot_{i}", root, x, 0, SLOT, SLOT)
        glow = b.node("Glow", slot, 0, 0, SLOT, SLOT, with_graphics=True)
        b.set_children(slot, [glow])
        slots.append(slot)

    bag = b.node("BagBtn", root, BAG_BTN_X, BAG_BTN_Y, BAG_BTN, BAG_BTN)
    bag_glow = b.node("Glow", bag, 0, 0, BAG_BTN, BAG_BTN, with_graphics=True)
    bag_face = b.node("Face", bag, 0, 0, BAG_BTN, BAG_BTN, sprite=BAG_BTN_SF)
    b.set_children(bag, [bag_glow, bag_face])

    quest = b.node("QuestBtn", root, QUEST_BTN_X, QUEST_BTN_Y, BAG_BTN, BAG_BTN)
    quest_face = b.node("Face", quest, 0, 0, BAG_BTN, BAG_BTN, sprite=QUEST_BTN_SF)
    b.set_children(quest, [quest_face])

    b.set_children(root, [bg, *slots, bag, quest])
    return b


def build_bag_panel() -> PrefabBuilder:
    b = PrefabBuilder("FarmBagPanel")
    root = b.node("FarmBagPanel", None, 0, 0, 1080, 1920, active=False)
    assert root == 1

    dim = b.node("Dimmer", root, 0, 0, 2200, 4000, with_graphics=True)
    panel = b.node("Panel", root, 0, BAG_PANEL_Y, BAG_PANEL_W, BAG_PANEL_H)
    chrome = b.node("Chrome", panel, 0, 0, BAG_PANEL_W, BAG_PANEL_H, with_graphics=True)
    title = b.node(
        "Title",
        panel,
        0,
        BAG_TITLE_Y,
        BAG_PANEL_W,
        INV_TITLE_H,
        label={"text": "背包", "size": round(28 * UI_SCALE), "color": CREAM, "h_align": 1, "outline": True},
    )
    close = add_close(b, panel, BAG_PANEL_W, BAG_PANEL_H)
    grid = b.node("Grid", panel, 0, BAG_GRID_Y, BAG_GRID_W, BAG_GRID_H)
    b.set_children(panel, [chrome, title, close, grid])
    b.set_children(root, [dim, panel])
    return b


def build_chest_panel() -> PrefabBuilder:
    b = PrefabBuilder("FarmChestPanel")
    root = b.node("FarmChestPanel", None, 0, 0, 1080, 1920, active=False)
    assert root == 1

    dim = b.node("Dimmer", root, 0, 0, 2200, 4000, with_graphics=True)
    panel = b.node("Panel", root, 0, CHEST_PANEL_Y, CHEST_PANEL_W, CHEST_PANEL_H)
    chrome = b.node("Chrome", panel, 0, 0, CHEST_PANEL_W, CHEST_PANEL_H, with_graphics=True)
    title = b.node(
        "Title",
        panel,
        0,
        CHEST_TITLE_Y,
        CHEST_PANEL_W,
        CHEST_TITLE_H,
        label={"text": "储藏箱", "size": round(28 * UI_SCALE), "color": CREAM, "h_align": 1, "outline": True},
    )
    hint = b.node(
        "Hint",
        panel,
        0,
        CHEST_HINT_Y,
        CHEST_PANEL_W,
        round(22 * UI_SCALE),
        label={
            "text": "拖拽：箱 ↔ 背包 · 背包拖到底栏设快捷键",
            "size": round(15 * UI_SCALE),
            "color": HINT,
            "h_align": 1,
        },
    )
    take = b.node("TakeAll", panel, TAKE_ALL_X, CHEST_TITLE_Y, TAKE_ALL_W, TAKE_ALL_H, with_graphics=True)
    take_lab = b.node(
        "Label",
        take,
        0,
        0,
        TAKE_ALL_W,
        TAKE_ALL_H,
        label={"text": "全部取出", "size": round(28 * UI_SCALE), "color": CREAM, "h_align": 1, "outline": True},
    )
    b.set_children(take, [take_lab])
    close = add_close(b, panel, CHEST_PANEL_W, CHEST_PANEL_H)
    chest_grid = b.node("ChestGrid", panel, 0, CHEST_GRID_Y, CHEST_GRID_W, CHEST_GRID_H)
    sec = b.node(
        "BagLabel",
        panel,
        0,
        CHEST_SEC_Y,
        CHEST_PANEL_W,
        round(26 * UI_SCALE),
        label={"text": "我的背包", "size": round(28 * UI_SCALE), "color": CREAM, "h_align": 1, "outline": True},
    )
    bag_grid = b.node("BagGrid", panel, 0, CHEST_BAG_GRID_Y, CHEST_GRID_W, CHEST_BAG_H)
    b.set_children(panel, [chrome, title, hint, take, close, chest_grid, sec, bag_grid])
    b.set_children(root, [dim, panel])
    return b


def build_craft_panel() -> PrefabBuilder:
    b = PrefabBuilder("FarmCraftPanel")
    root = b.node("FarmCraftPanel", None, 0, 0, 1080, 1920, active=False)
    assert root == 1

    dim = b.node("Dimmer", root, 0, 0, 2200, 4000, with_graphics=True)
    # Default Y for 1-row shell; runtime may nudge for tall lists.
    panel_bottom = BAR_Y + BAR_H * 0.5 + round(18 * UI_SCALE)
    panel_y = panel_bottom + CRAFT_PANEL_H_1 * 0.5
    panel = b.node("Panel", root, 0, panel_y, CRAFT_PANEL_W, CRAFT_PANEL_H_1)
    chrome = b.node("Chrome", panel, 0, 0, CRAFT_PANEL_W, CRAFT_PANEL_H_1, with_graphics=True)
    header_top = CRAFT_PANEL_H_1 * 0.5 - CRAFT_PAD
    title_y = header_top - CRAFT_HEADER_H * 0.5
    title_w = CRAFT_PANEL_W - round(CLOSE_BTN * 2.8)
    title = b.node(
        "Title",
        panel,
        0,
        title_y,
        title_w,
        CRAFT_TITLE_H,
        label={"text": "制作台", "size": round(28 * UI_SCALE), "color": CREAM, "h_align": 1, "outline": True},
    )
    close = add_close(b, panel, CRAFT_PANEL_W, CRAFT_PANEL_H_1)
    list_top = header_top - CRAFT_HEADER_H - round(6 * UI_SCALE)
    list_y = list_top - CRAFT_LIST_H_1 * 0.5
    list_host = b.node("ListHost", panel, 0, list_y, CRAFT_ROW_W, CRAFT_LIST_H_1)
    b.set_children(panel, [chrome, title, close, list_host])
    b.set_children(root, [dim, panel])
    return b


def build_craft_row() -> PrefabBuilder:
    b = PrefabBuilder("FarmCraftRow")
    root = b.node("FarmCraftRow", None, 0, 0, CRAFT_ROW_W, CRAFT_ROW_H, with_graphics=True)
    assert root == 1

    left = -CRAFT_ROW_W * 0.5 + round(12 * UI_SCALE)
    right = CRAFT_ROW_W * 0.5 - round(12 * UI_SCALE)
    out_x = left + CRAFT_OUT_SZ * 0.5
    action_left = right - CRAFT_BTN_W
    btn_x = action_left + CRAFT_BTN_W * 0.5
    name_left = out_x + CRAFT_OUT_SZ * 0.5 + CRAFT_COL_GAP
    cost_origin = name_left + CRAFT_NAME_COL_W + CRAFT_COL_GAP
    ad_x = right - CRAFT_AD_SZ * 0.5

    out = b.node("Out", root, out_x, 0, CRAFT_OUT_SZ, CRAFT_OUT_SZ)
    # Plate/Icon/Count filled at bind (needs runtime frames).

    name = b.node(
        "Name",
        root,
        name_left + CRAFT_NAME_COL_W * 0.5,
        0,
        CRAFT_NAME_COL_W,
        round(32 * UI_SCALE),
        label={"text": "", "size": round(22 * UI_SCALE), "color": INK, "h_align": 0, "overflow": 1},
    )

    costs: List[int] = []
    for i in range(CRAFT_COST_SLOTS):
        cell_x = cost_origin + i * CRAFT_COST_CELL_W + CRAFT_COST_CELL_W * 0.5
        cell = b.node(f"Cost_{i}", root, cell_x, 0, CRAFT_COST_CELL_W, CRAFT_COST_ICON + 4)
        icon = b.node(
            "IconHost",
            cell,
            -CRAFT_COST_CELL_W * 0.5 + CRAFT_COST_ICON * 0.5 + 2,
            0,
            CRAFT_COST_ICON,
            CRAFT_COST_ICON,
        )
        lab_w = CRAFT_COST_CELL_W - CRAFT_COST_ICON - 8
        need = b.node(
            "Need",
            cell,
            CRAFT_COST_CELL_W * 0.5 - lab_w * 0.5 - 2,
            0,
            lab_w,
            CRAFT_COST_ICON,
            label={"text": "0/0", "size": round(18 * UI_SCALE), "color": (70, 48, 28, 255), "h_align": 0},
        )
        b.set_children(cell, [icon, need])
        costs.append(cell)

    btn = b.node("CraftBtn", root, btn_x, 0, CRAFT_BTN_W, CRAFT_BTN_H, sprite=CRAFT_BTN_SF)
    btn_lab = b.node(
        "Label",
        btn,
        0,
        0,
        CRAFT_BTN_W,
        CRAFT_BTN_H,
        label={"text": "制作", "size": round(24 * UI_SCALE), "color": CREAM, "h_align": 1, "outline": True},
    )
    b.set_children(btn, [btn_lab])

    progress = b.node("Progress", root, btn_x, 0, CRAFT_BTN_W, CRAFT_BAR_H, with_graphics=True, active=False)
    bar_lab = b.node(
        "BarLabel",
        progress,
        0,
        0,
        CRAFT_BTN_W,
        CRAFT_BAR_H,
        label={"text": "", "size": round(18 * UI_SCALE), "color": CREAM, "h_align": 1, "outline": True},
    )
    b.set_children(progress, [bar_lab])

    ad = b.node("AdBtn", root, ad_x, 0, CRAFT_AD_SZ, CRAFT_AD_SZ, sprite=AD_VIDEO_SF, active=False)

    b.set_children(root, [out, name, *costs, btn, progress, ad])
    return b


def build_learn_panel() -> PrefabBuilder:
    b = PrefabBuilder("FarmLearnPanel")
    root = b.node("FarmLearnPanel", None, 0, 0, 1080, 1920, active=False)
    assert root == 1

    dim = b.node("Dimmer", root, 0, 0, 2200, 4000, with_graphics=True)
    panel = b.node("Panel", root, 0, LEARN_PANEL_Y, LEARN_PANEL_W, LEARN_PANEL_H)
    chrome = b.node("Chrome", panel, 0, 0, LEARN_PANEL_W, LEARN_PANEL_H, with_graphics=True)
    title = b.node(
        "Title",
        panel,
        0,
        LEARN_TITLE_Y,
        LEARN_PANEL_W - CLOSE_BTN * 2.4,
        round(40 * UI_SCALE),
        label={"text": "学习配方", "size": round(28 * UI_SCALE), "color": CREAM, "h_align": 1, "outline": True},
    )
    close = add_close(b, panel, LEARN_PANEL_W, LEARN_PANEL_H)
    scroll = b.node("ScrollIcon", panel, -round(90 * UI_SCALE), LEARN_ICON_ROW_Y, LEARN_ICON, LEARN_ICON)
    arrow = b.node(
        "Arrow",
        panel,
        0,
        LEARN_ICON_ROW_Y,
        round(48 * UI_SCALE),
        round(36 * UI_SCALE),
        label={"text": "→", "size": round(32 * UI_SCALE), "color": INK, "h_align": 1},
    )
    out = b.node("OutIcon", panel, round(90 * UI_SCALE), LEARN_ICON_ROW_Y, LEARN_ICON, LEARN_ICON)
    name = b.node(
        "Name",
        panel,
        0,
        LEARN_NAME_Y,
        LEARN_PANEL_W - round(64 * UI_SCALE),
        LEARN_NAME_H,
        label={"text": "", "size": round(26 * UI_SCALE), "color": INK, "h_align": 1, "overflow": 1},
    )
    desc = b.node(
        "Desc",
        panel,
        0,
        LEARN_DESC_Y,
        LEARN_PANEL_W - round(80 * UI_SCALE),
        LEARN_DESC_H,
        label={
            "text": "",
            "size": round(20 * UI_SCALE),
            "color": INK_MUTE,
            "h_align": 1,
            "overflow": 1,
            "wrap": True,
        },
    )
    btn = b.node("LearnBtn", panel, 0, LEARN_BTN_Y, LEARN_BTN_W, LEARN_BTN_H, with_graphics=True)
    btn_lab = b.node(
        "Label",
        btn,
        0,
        0,
        LEARN_BTN_W,
        LEARN_BTN_H,
        label={"text": "学习", "size": round(28 * UI_SCALE), "color": CREAM, "h_align": 1, "outline": True},
    )
    b.set_children(btn, [btn_lab])
    b.set_children(panel, [chrome, title, close, scroll, arrow, out, name, desc, btn])
    b.set_children(root, [dim, panel])
    return b


def build_tooltip() -> PrefabBuilder:
    b = PrefabBuilder("FarmToolTip")
    root = b.node("FarmToolTip", None, 0, 0, TIP_W, TIP_H, active=False)
    assert root == 1
    bubble = b.node("Bubble", root, 0, 0, TIP_W, TIP_H, with_graphics=True)
    title = b.node(
        "Title",
        root,
        0,
        TIP_TITLE_Y,
        round(240 * UI_SCALE),
        round(40 * UI_SCALE),
        label={"text": "", "size": round(28 * UI_SCALE), "color": TIP_TITLE_C, "h_align": 1},
    )
    desc = b.node(
        "Desc",
        root,
        0,
        TIP_DESC_Y,
        round(260 * UI_SCALE),
        round(56 * UI_SCALE),
        label={
            "text": "",
            "size": round(22 * UI_SCALE),
            "color": TIP_DESC_C,
            "h_align": 1,
            "overflow": 3,
        },
    )
    b.set_children(root, [bubble, title, desc])
    return b


def main() -> None:
    specs: List[Tuple[str, Path, Any]] = [
        ("FarmHotbar", OUT_DIR / "FarmHotbar.prefab", build_hotbar),
        ("FarmBagPanel", OUT_DIR / "FarmBagPanel.prefab", build_bag_panel),
        ("FarmChestPanel", OUT_DIR / "FarmChestPanel.prefab", build_chest_panel),
        ("FarmCraftPanel", OUT_DIR / "FarmCraftPanel.prefab", build_craft_panel),
        ("FarmCraftRow", OUT_DIR / "FarmCraftRow.prefab", build_craft_row),
        ("FarmLearnPanel", OUT_DIR / "FarmLearnPanel.prefab", build_learn_panel),
        ("FarmToolTip", OUT_DIR / "FarmToolTip.prefab", build_tooltip),
    ]

    uuids: Dict[str, str] = {}
    for name, path, builder in specs:
        uid = str(uuid.uuid4())
        meta = Path(str(path) + ".meta")
        if meta.exists():
            uid = json.loads(meta.read_text(encoding="utf-8")).get("uuid", uid)
        pb = builder()
        uuids[name] = emit(pb, path, name, uid)
        print("wrote", path, uuids[name])

    values = {
        "slot": SLOT,
        "plate": PLATE,
        "icon": ICON,
        "slotCount": SLOT_COUNT,
        "gap": GAP,
        "barBgW": BAR_BG_W,
        "barH": BAR_H,
        "barY": BAR_Y,
        "bagBtn": BAG_BTN,
        "bagBtnX": BAG_BTN_X,
        "bagBtnY": BAG_BTN_Y,
        "questBtnX": QUEST_BTN_X,
        "questBtnY": QUEST_BTN_Y,
        "closeBtn": CLOSE_BTN,
        "closePad": CLOSE_PAD,
        "closeHit": CLOSE_HIT,
        "invCols": INV_COLS,
        "invRows": INV_STORAGE_ROWS,
        "invPad": INV_PAD,
        "invTitleH": INV_TITLE_H,
        "invDockGap": INV_DOCK_GAP,
        "bagPanelW": BAG_PANEL_W,
        "bagPanelH": BAG_PANEL_H,
        "bagPanelY": BAG_PANEL_Y,
        "bagTitleY": BAG_TITLE_Y,
        "bagGridW": BAG_GRID_W,
        "bagGridH": BAG_GRID_H,
        "bagGridY": BAG_GRID_Y,
        "chestPanelW": CHEST_PANEL_W,
        "chestPanelH": CHEST_PANEL_H,
        "chestPanelY": CHEST_PANEL_Y,
        "chestTitleY": CHEST_TITLE_Y,
        "chestHintY": CHEST_HINT_Y,
        "chestGridW": CHEST_GRID_W,
        "chestGridH": CHEST_GRID_H,
        "chestGridY": CHEST_GRID_Y,
        "chestBagH": CHEST_BAG_H,
        "chestBagGridY": CHEST_BAG_GRID_Y,
        "chestSecY": CHEST_SEC_Y,
        "chestRows": CHEST_ROWS,
        "chestCols": CHEST_COLS,
        "takeAllW": TAKE_ALL_W,
        "takeAllH": TAKE_ALL_H,
        "takeAllX": TAKE_ALL_X,
        "craftPad": CRAFT_PAD,
        "craftHeaderH": CRAFT_HEADER_H,
        "craftTitleH": CRAFT_TITLE_H,
        "craftRowH": CRAFT_ROW_H,
        "craftRowGap": CRAFT_ROW_GAP,
        "craftBtnW": CRAFT_BTN_W,
        "craftBtnH": CRAFT_BTN_H,
        "craftOutSz": CRAFT_OUT_SZ,
        "craftNameColW": CRAFT_NAME_COL_W,
        "craftCostIcon": CRAFT_COST_ICON,
        "craftCostCellW": CRAFT_COST_CELL_W,
        "craftCostSlots": CRAFT_COST_SLOTS,
        "craftColGap": CRAFT_COL_GAP,
        "craftAdSz": CRAFT_AD_SZ,
        "craftBarH": CRAFT_BAR_H,
        "craftPanelW": CRAFT_PANEL_W,
        "craftRowW": CRAFT_ROW_W,
        "craftPanelH1": CRAFT_PANEL_H_1,
        "learnPanelW": LEARN_PANEL_W,
        "learnPanelH": LEARN_PANEL_H,
        "learnPanelY": LEARN_PANEL_Y,
        "learnIcon": LEARN_ICON,
        "learnBtnW": LEARN_BTN_W,
        "learnBtnH": LEARN_BTN_H,
        "learnTitleY": LEARN_TITLE_Y,
        "learnIconRowY": LEARN_ICON_ROW_Y,
        "learnNameY": LEARN_NAME_Y,
        "learnDescY": LEARN_DESC_Y,
        "learnBtnY": LEARN_BTN_Y,
        "tipW": TIP_W,
        "tipH": TIP_H,
        "dockH": BAR_H,
    }

    lines = [
        "/** Auto-generated by tools/ui/generate_farm_hud_prefabs.py — do not edit by hand. */",
        f"export const FARM_HOTBAR_PREFAB_UUID = '{uuids['FarmHotbar']}';",
        f"export const FARM_BAG_PANEL_PREFAB_UUID = '{uuids['FarmBagPanel']}';",
        f"export const FARM_CHEST_PANEL_PREFAB_UUID = '{uuids['FarmChestPanel']}';",
        f"export const FARM_CRAFT_PANEL_PREFAB_UUID = '{uuids['FarmCraftPanel']}';",
        f"export const FARM_CRAFT_ROW_PREFAB_UUID = '{uuids['FarmCraftRow']}';",
        f"export const FARM_LEARN_PANEL_PREFAB_UUID = '{uuids['FarmLearnPanel']}';",
        f"export const FARM_TOOL_TIP_PREFAB_UUID = '{uuids['FarmToolTip']}';",
        "",
        "/** Prefab layout (design px, UI_SCALE=1.5). */",
        "export const FARM_HUD_LAYOUT = {",
    ]
    for k, v in values.items():
        if isinstance(v, float):
            lines.append(f"    {k}: {round(v, 1)},")
        else:
            lines.append(f"    {k}: {v},")
    lines.append("} as const;")
    lines.append("")
    OUT_TS.write_text("\n".join(lines), encoding="utf-8")
    print("patched", OUT_TS)


if __name__ == "__main__":
    main()
