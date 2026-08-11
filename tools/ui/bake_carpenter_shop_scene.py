#!/usr/bin/env python3
"""Bake carpenter workshop interior → assets/scenes/CarpenterShop.scene

    python tools/ui/bake_carpenter_shop_scene.py
"""

from __future__ import annotations

from indoor_room_bake import TILE, IndoorRoomBake, ROOT, write_indoor_scene

OUT_SCENE = ROOT / "assets/scenes/CarpenterShop.scene"
OUT_META = ROOT / "assets/scenes/CarpenterShop.scene.meta"


def place_furniture(room: IndoorRoomBake) -> None:
    room._prop("rug", 0.3 * TILE, 0.0, "prop_rug_shop")
    # Workbench / desk NE — carpenter stands nearby
    room._prop("desk", 1.7 * TILE, 1.55 * TILE, "prop_workbench")
    room._prop("chair", 1.7 * TILE, 0.9 * TILE, "prop_chair_bench")
    room._prop("shelf", -3.1 * TILE, 2.0 * TILE, "prop_shelf_tools")
    room._prop("tea", -1.0 * TILE, 0.35 * TILE, "prop_tea_shop")
    room._prop("bench", -2.2 * TILE, -0.5 * TILE, "prop_wood_bench")
    if room.sf("prop-crate"):
        room._prop("crate", 3.3 * TILE, 1.3 * TILE, "prop_crate_nails")
        room._prop("crate", 3.4 * TILE, 0.4 * TILE, "prop_crate_planks")
    if room.sf("prop-barrel"):
        room._prop("barrel", -3.4 * TILE, 0.3 * TILE, "prop_barrel_sawdust")


def main() -> None:
    write_indoor_scene(
        scene_name="CarpenterShop",
        out_scene=OUT_SCENE,
        out_meta=OUT_META,
        marker="__carpenter_shop_baked",
        place_furniture=place_furniture,
        id_prefix="CarpShop",
    )


if __name__ == "__main__":
    main()
