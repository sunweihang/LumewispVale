#!/usr/bin/env python3
"""Shared Cocos 3.8 prefab JSON helpers for Lumewisp UI generators."""
from __future__ import annotations

import json
import random
import string
import uuid
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence, Tuple

UI_LAYER = 33554432  # UI_2D
CLOSE_SF = "8a6550b2-1626-45d4-89ec-3cd35c8215fd@f9941"
GOLD_SF = "6c48a5e0-0000-0000-0000-000000000000@f9941"  # overwritten by reward gold if known


def file_id() -> str:
    return "".join(random.choice(string.ascii_lowercase + string.digits) for _ in range(22))


def prefab_info(root_id: int, asset_id: int, fid: str) -> Dict[str, Any]:
    return {
        "__type__": "cc.PrefabInfo",
        "root": {"__id__": root_id},
        "asset": {"__id__": asset_id},
        "fileId": fid,
        "instance": None,
        "targetOverrides": None,
        "nestedPrefabInstanceRoots": None,
    }


def node_obj(
    name: str,
    parent_id: Optional[int],
    children_ids: Sequence[int],
    comp_ids: Sequence[int],
    prefab_info_id: int,
    x: float,
    y: float,
    ax: float = 0.5,
    ay: float = 0.5,
    active: bool = True,
) -> Dict[str, Any]:
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


def uit_obj(
    node_id: int, prefab_info_id: int, w: float, h: float, ax: float = 0.5, ay: float = 0.5
) -> Dict[str, Any]:
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


def sprite_obj(node_id: int, prefab_info_id: int, sf_uuid: Optional[str]) -> Dict[str, Any]:
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
        "_spriteFrame": (
            {"__uuid__": sf_uuid, "__expectedType__": "cc.SpriteFrame"} if sf_uuid else None
        ),
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


def label_obj(
    node_id: int,
    prefab_info_id: int,
    text: str,
    size: int,
    color: Tuple[int, int, int, int],
    h_align: int = 1,
    outline: bool = False,
    overflow: int = 0,
    wrap: bool = False,
    bold: bool = False,
) -> Dict[str, Any]:
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
        "_color": {
            "__type__": "cc.Color",
            "r": color[0],
            "g": color[1],
            "b": color[2],
            "a": color[3],
        },
        "_string": text,
        "_horizontalAlign": h_align,
        "_verticalAlign": 1,
        "_actualFontSize": size,
        "_fontSize": size,
        "_fontFamily": "Arial",
        "_lineHeight": size + 6,
        "_overflow": overflow,
        "_enableWrapText": wrap,
        "_font": None,
        "_isSystemFontUsed": True,
        "_spacingX": 0,
        "_isItalic": False,
        "_isBold": bold,
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


def graphics_obj(node_id: int, prefab_info_id: int) -> Dict[str, Any]:
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


class PrefabBuilder:
    def __init__(self, name: str):
        self.name = name
        self.items: List[Any] = []
        self.add(
            {
                "__type__": "cc.Prefab",
                "_name": name,
                "_objFlags": 0,
                "__editorExtras__": {},
                "_native": "",
                "data": {"__id__": 1},
                "optimizationPolicy": 0,
                "persistent": False,
            }
        )

    def add(self, o: Any) -> int:
        self.items.append(o)
        return len(self.items) - 1

    def add_pi(self, root_id: int = 1, asset_id: int = 0) -> int:
        return self.add(prefab_info(root_id, asset_id, file_id()))

    def node(
        self,
        name: str,
        parent_id: Optional[int],
        x: float,
        y: float,
        w: float,
        h: float,
        *,
        active: bool = True,
        with_graphics: bool = False,
        sprite: Optional[str] = None,
        label: Optional[Dict[str, Any]] = None,
    ) -> int:
        """Create node + UITransform (+ optional Graphics/Sprite/Label). Returns node id.

        Prefab.data points at __id__ 1 — the first node() call must be the root
        ( Cocos requires root == 1 ).
        """
        # Root: reserve id 1 before PrefabInfo / components.
        if len(self.items) == 1:
            nid = self.add(None)
            assert nid == 1
            pi = self.add_pi()
        else:
            pi = self.add_pi()
            nid = self.add(None)
        uit = self.add(uit_obj(nid, pi, w, h))
        comps = [uit]
        if with_graphics:
            comps.append(self.add(graphics_obj(nid, pi)))
        if sprite is not None:
            comps.append(self.add(sprite_obj(nid, pi, sprite)))
        if label is not None:
            comps.append(
                self.add(
                    label_obj(
                        nid,
                        pi,
                        label.get("text", ""),
                        label.get("size", 28),
                        label.get("color", (62, 40, 22, 255)),
                        label.get("h_align", 1),
                        label.get("outline", False),
                        label.get("overflow", 0),
                        label.get("wrap", False),
                        label.get("bold", False),
                    )
                )
            )
        self.items[nid] = node_obj(name, parent_id, [], comps, pi, x, y, active=active)
        return nid

    def set_children(self, node_id: int, children: Sequence[int]) -> None:
        self.items[node_id]["_children"] = [{"__id__": i} for i in children]

    def write(self, out_prefab: Path, layout_ts: Optional[Path] = None, layout: Optional[Dict] = None) -> str:
        out_prefab.parent.mkdir(parents=True, exist_ok=True)
        meta_path = Path(str(out_prefab) + ".meta")
        prefab_uuid = str(uuid.uuid4())
        if meta_path.exists():
            prefab_uuid = json.loads(meta_path.read_text(encoding="utf-8")).get("uuid", prefab_uuid)

        out_prefab.write_text(
            json.dumps(self.items, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
        )
        meta = {
            "ver": "1.1.50",
            "importer": "prefab",
            "imported": True,
            "uuid": prefab_uuid,
            "files": [".json"],
            "subMetas": {},
            "userData": {"syncNodeName": self.name},
        }
        meta_path.write_text(json.dumps(meta, indent=2) + "\n", encoding="utf-8")

        if layout_ts is not None and layout is not None:
            lines = [
                "/** Auto-generated by tools/ui — do not edit by hand. */",
                f"export const {layout['const_prefab']} = '{prefab_uuid}';",
                "",
            ]
            if layout.get("row_prefab"):
                lines.append(
                    f"export const {layout['const_row_prefab']} = '{layout['row_prefab']}';"
                )
                lines.append("")
            lines.append(f"/** Prefab layout (panel-local px). */")
            lines.append(f"export const {layout['const_layout']} = {{")
            for k, v in layout["values"].items():
                if isinstance(v, float):
                    lines.append(f"    {k}: {round(v, 1)},")
                else:
                    lines.append(f"    {k}: {v},")
            lines.append("} as const;")
            lines.append("")
            layout_ts.write_text("\n".join(lines), encoding="utf-8")
            print("patched", layout_ts)

        print("wrote", out_prefab, prefab_uuid)
        return prefab_uuid


def load_gold_sf() -> str:
    """Prefer reward gold frame from reward-frames / RewardFrames."""
    root = Path(__file__).resolve().parents[2]
    for p in (
        root / "assets/scripts/game/RewardFrames.ts",
        Path(__file__).resolve().parent / "reward-frames.json",
    ):
        if not p.exists():
            continue
        text = p.read_text(encoding="utf-8")
        # gold: 'uuid@f9941'
        import re

        m = re.search(r"gold:\s*'([^']+)'", text)
        if m:
            return m.group(1)
        try:
            data = json.loads(text)
            if isinstance(data, dict) and "gold" in data:
                v = data["gold"]
                return v["spriteFrame"] if isinstance(v, dict) else v
        except Exception:
            pass
    return "6f6c303c-496d-4ac5-9afb-ac4842fdb889@f9941"  # fallback unused
