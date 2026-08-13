#!/usr/bin/env python3
"""Generate TownShopPanel.prefab + TownShopRow.prefab — layout source of truth.

  /usr/local/bin/python3 tools/ui/generate_town_shop_prefab.py
"""
from __future__ import annotations

import json
import uuid
from pathlib import Path

from cocos_prefab_lib import CLOSE_SF, PrefabBuilder, load_gold_sf

ROOT = Path(__file__).resolve().parents[2]
OUT_PANEL = ROOT / "assets/prefabs/ui/TownShopPanel.prefab"
OUT_ROW = ROOT / "assets/prefabs/ui/TownShopRow.prefab"
OUT_TS = ROOT / "assets/scripts/game/TownShopFrames.ts"

# --- Layout (panel-local, center origin) — mirrored in TownShopFrames.ts ---
PANEL_W, PANEL_H = 720, 980
PANEL_Y = 40
ROW_H = 92
ROW_W = PANEL_W - 80
TITLE_Y = PANEL_H * 0.5 - 64
GOLD_Y = PANEL_H * 0.5 - 118
TAB_Y = PANEL_H * 0.5 - 178
TAB_H = 48
TAB_W = 180
LIST_TOP = PANEL_H * 0.5 - 248
LIST_H = 520
LIST_Y = LIST_TOP - LIST_H * 0.5
ROW_GAP = 8
HINT_Y = -PANEL_H * 0.5 + 168
ACTION_Y = -PANEL_H * 0.5 + 88
ACTION_W, ACTION_H = 320, 72
QTY_BTN = 56
QTY_Y = ACTION_Y
MINUS_X, PLUS_X, QTY_LAB_X = -250, -90, -170
CONFIRM_X, CONFIRM_W = 160, 300
CLOSE_BTN, CLOSE_PAD = 84, 33
CLOSE_HIT = int(CLOSE_BTN * 1.85)
CLOSE_X = PANEL_W * 0.5 - CLOSE_PAD - CLOSE_BTN * 0.5
CLOSE_Y = PANEL_H * 0.5 - CLOSE_PAD - CLOSE_BTN * 0.5
BODY_W, BODY_H = PANEL_W - 100, 420
INK = (62, 40, 22, 255)
INK_MUTE = (110, 88, 64, 255)
PRICE = (180, 120, 40, 255)


def build_panel(gold_sf: str) -> PrefabBuilder:
    b = PrefabBuilder("TownShopPanel")
    root = b.node("TownShopPanel", None, 0, 0, 1080, 1920, active=False)
    assert root == 1

    dim = b.node("Dimmer", root, 0, 0, 2200, 4000, with_graphics=True)
    panel = b.node("Panel", root, 0, PANEL_Y, PANEL_W, PANEL_H)
    chrome = b.node("Chrome", panel, 0, 0, PANEL_W, PANEL_H, with_graphics=True)
    title = b.node(
        "Title",
        panel,
        0,
        TITLE_Y,
        600,
        48,
        label={"text": "商店", "size": 36, "color": INK, "h_align": 1},
    )

    gold = b.node("Gold", panel, 0, GOLD_Y, 200, 40)
    gold_icon = b.node("Icon", gold, -60, 0, 36, 36, sprite=gold_sf)
    gold_amt = b.node(
        "Amount",
        gold,
        20,
        0,
        140,
        36,
        label={"text": "x 0", "size": 28, "color": PRICE, "h_align": 0, "overflow": 2},
    )
    b.set_children(gold, [gold_icon, gold_amt])

    buy = b.node("BuyTab", panel, -120, TAB_Y, TAB_W, TAB_H, with_graphics=True)
    buy_lab = b.node(
        "Label",
        buy,
        0,
        0,
        160,
        40,
        label={"text": "购买", "size": 26, "color": INK, "h_align": 1},
    )
    b.set_children(buy, [buy_lab])

    sell = b.node("SellTab", panel, 120, TAB_Y, TAB_W, TAB_H, with_graphics=True)
    sell_lab = b.node(
        "Label",
        sell,
        0,
        0,
        160,
        40,
        label={"text": "出售", "size": 26, "color": INK, "h_align": 1},
    )
    b.set_children(sell, [sell_lab])

    list_host = b.node("ListHost", panel, 0, LIST_Y, ROW_W, LIST_H)

    body_card = b.node("BodyCard", panel, 0, 40, BODY_W, BODY_H, with_graphics=True, active=False)
    body = b.node(
        "Body",
        body_card,
        0,
        0,
        PANEL_W - 140,
        380,
        label={
            "text": "",
            "size": 28,
            "color": INK,
            "h_align": 1,
            "overflow": 3,  # RESIZE_HEIGHT
            "wrap": True,
        },
    )
    b.set_children(body_card, [body])

    hint = b.node(
        "Hint",
        panel,
        0,
        HINT_Y,
        640,
        48,
        label={"text": "", "size": 22, "color": INK_MUTE, "h_align": 1, "overflow": 1, "wrap": True},
    )

    minus = b.node("QtyMinus", panel, MINUS_X, QTY_Y, QTY_BTN, QTY_BTN, with_graphics=True, active=False)
    minus_lab = b.node(
        "Label",
        minus,
        0,
        0,
        QTY_BTN - 8,
        QTY_BTN - 8,
        label={"text": "−", "size": 34, "color": INK, "h_align": 1},
    )
    b.set_children(minus, [minus_lab])

    plus = b.node("QtyPlus", panel, PLUS_X, QTY_Y, QTY_BTN, QTY_BTN, with_graphics=True, active=False)
    plus_lab = b.node(
        "Label",
        plus,
        0,
        0,
        QTY_BTN - 8,
        QTY_BTN - 8,
        label={"text": "+", "size": 34, "color": INK, "h_align": 1},
    )
    b.set_children(plus, [plus_lab])

    qty = b.node(
        "QtyValue",
        panel,
        QTY_LAB_X,
        QTY_Y,
        80,
        48,
        active=False,
        label={"text": "1", "size": 32, "color": INK, "h_align": 1},
    )

    # Trade confirm — fixed slots (verb left, gold right); no runtime reposition.
    confirm = b.node(
        "ConfirmBtn", panel, CONFIRM_X, QTY_Y, CONFIRM_W, ACTION_H, with_graphics=True, active=False
    )
    plain = b.node(
        "PlainLab",
        confirm,
        0,
        0,
        CONFIRM_W - 24,
        ACTION_H - 8,
        active=False,
        label={"text": "接受委托", "size": 28, "color": INK, "h_align": 1, "overflow": 2},
    )
    verb = b.node(
        "TradeVerb",
        confirm,
        -78,
        0,
        88,
        ACTION_H - 8,
        active=False,
        label={"text": "出售", "size": 28, "color": INK, "h_align": 1, "overflow": 2},
    )
    trade_gold = b.node("TradeGold", confirm, 52, 0, 160, 40, active=False)
    tg_icon = b.node("Icon", trade_gold, -52, 0, 32, 32, sprite=gold_sf)
    tg_amt = b.node(
        "Amount",
        trade_gold,
        24,
        0,
        110,
        34,
        label={"text": "x 0", "size": 26, "color": INK, "h_align": 0, "overflow": 2},
    )
    b.set_children(trade_gold, [tg_icon, tg_amt])
    b.set_children(confirm, [plain, verb, trade_gold])

    # Board / info accept — centered.
    accept = b.node(
        "AcceptBtn", panel, 0, ACTION_Y, ACTION_W, ACTION_H, with_graphics=True, active=False
    )
    accept_lab = b.node(
        "Label",
        accept,
        0,
        0,
        ACTION_W - 20,
        ACTION_H - 8,
        label={"text": "知道了", "size": 28, "color": INK, "h_align": 1, "overflow": 2},
    )
    b.set_children(accept, [accept_lab])

    close = b.node("Close", panel, CLOSE_X, CLOSE_Y, CLOSE_HIT, CLOSE_HIT)
    close_icon = b.node("Icon", close, 0, 0, CLOSE_BTN, CLOSE_BTN, sprite=CLOSE_SF)
    b.set_children(close, [close_icon])

    b.set_children(
        panel,
        [
            chrome,
            title,
            gold,
            buy,
            sell,
            list_host,
            body_card,
            hint,
            minus,
            plus,
            qty,
            confirm,
            accept,
            close,
        ],
    )
    b.set_children(root, [dim, panel])
    return b


def build_row(gold_sf: str) -> PrefabBuilder:
    b = PrefabBuilder("TownShopRow")
    root = b.node("TownShopRow", None, 0, 0, ROW_W, ROW_H, with_graphics=True)
    assert root == 1
    text_left = -ROW_W * 0.5 + 28
    title = b.node(
        "Title",
        root,
        text_left + 200,
        12,
        400,
        36,
        label={"text": "", "size": 28, "color": INK, "h_align": 0, "overflow": 1},
    )
    meta = b.node(
        "Meta",
        root,
        text_left + 200,
        -20,
        400,
        28,
        label={"text": "", "size": 20, "color": INK_MUTE, "h_align": 0, "overflow": 1},
    )
    price = b.node("Price", root, ROW_W * 0.5 - 88, 0, 160, 40)
    p_icon = b.node("Icon", price, 40, 0, 34, 34, sprite=gold_sf)
    p_amt = b.node(
        "Amount",
        price,
        -20,
        0,
        100,
        34,
        label={"text": "x 0", "size": 26, "color": PRICE, "h_align": 2, "overflow": 2},
    )
    b.set_children(price, [p_icon, p_amt])
    b.set_children(root, [title, meta, price])
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
    gold_sf = load_gold_sf()
    panel_uuid = str(uuid.uuid4())
    row_uuid = str(uuid.uuid4())
    panel_meta = Path(str(OUT_PANEL) + ".meta")
    row_meta = Path(str(OUT_ROW) + ".meta")
    if panel_meta.exists():
        panel_uuid = json.loads(panel_meta.read_text(encoding="utf-8")).get("uuid", panel_uuid)
    if row_meta.exists():
        row_uuid = json.loads(row_meta.read_text(encoding="utf-8")).get("uuid", row_uuid)

    pb = build_panel(gold_sf)
    OUT_PANEL.parent.mkdir(parents=True, exist_ok=True)
    OUT_PANEL.write_text(json.dumps(pb.items, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    panel_uuid = write_meta(OUT_PANEL, "TownShopPanel", panel_uuid)

    rb = build_row(gold_sf)
    OUT_ROW.write_text(json.dumps(rb.items, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    row_uuid = write_meta(OUT_ROW, "TownShopRow", row_uuid)

    values = {
        "panelW": PANEL_W,
        "panelH": PANEL_H,
        "panelY": PANEL_Y,
        "rowW": ROW_W,
        "rowH": ROW_H,
        "rowGap": ROW_GAP,
        "listTop": LIST_TOP,
        "listY": LIST_Y,
        "listH": LIST_H,
        "titleY": TITLE_Y,
        "goldY": GOLD_Y,
        "tabY": TAB_Y,
        "tabH": TAB_H,
        "tabW": TAB_W,
        "hintY": HINT_Y,
        "actionY": ACTION_Y,
        "actionW": ACTION_W,
        "actionH": ACTION_H,
        "qtyBtn": QTY_BTN,
        "qtyY": QTY_Y,
        "minusX": MINUS_X,
        "plusX": PLUS_X,
        "qtyLabX": QTY_LAB_X,
        "confirmX": CONFIRM_X,
        "confirmW": CONFIRM_W,
        "closeX": CLOSE_X,
        "closeY": CLOSE_Y,
        "closeBtn": CLOSE_BTN,
        "closePad": CLOSE_PAD,
        "closeHit": CLOSE_HIT,
    }
    lines = [
        "/** Auto-generated by tools/ui/generate_town_shop_prefab.py — do not edit by hand. */",
        f"export const TOWN_SHOP_PREFAB_UUID = '{panel_uuid}';",
        f"export const TOWN_SHOP_ROW_PREFAB_UUID = '{row_uuid}';",
        "",
        "/** Prefab layout (panel-local px). */",
        "export const TOWN_SHOP_LAYOUT = {",
    ]
    for k, v in values.items():
        if isinstance(v, float):
            lines.append(f"    {k}: {round(v, 1)},")
        else:
            lines.append(f"    {k}: {v},")
    lines.append("} as const;")
    lines.append("")
    OUT_TS.write_text("\n".join(lines), encoding="utf-8")
    print("wrote", OUT_PANEL, panel_uuid)
    print("wrote", OUT_ROW, row_uuid)
    print("patched", OUT_TS)


if __name__ == "__main__":
    main()
