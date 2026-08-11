#!/usr/bin/env python3
"""Bake community hall interior → assets/scenes/Community.scene

Story props:
  prop_spring_desk — 1022 spring_pack
  prop_spring_lamp — 1027 spring_light

    python tools/ui/bake_community_scene.py
"""

from __future__ import annotations

from indoor_room_bake import TILE, IndoorRoomBake, ROOT, write_indoor_scene

OUT_SCENE = ROOT / "assets/scenes/Community.scene"
OUT_META = ROOT / "assets/scenes/Community.scene.meta"


def place_furniture(room: IndoorRoomBake) -> None:
    room._prop("rug", 0.0, 0.3 * TILE, "prop_rug_hall")
    # Spring pack desk (center-north) — required interact name
    room._prop("desk", 0.0, 1.5 * TILE, "prop_spring_desk")
    room._prop("chair", 0.0, 0.85 * TILE, "prop_chair_desk")
    # Spring lamp NE corner — required interact name
    room._prop("lamp", 2.8 * TILE, 1.8 * TILE, "prop_spring_lamp")
    # Hall clutter
    room._prop("shelf", -3.2 * TILE, 2.0 * TILE, "prop_bookshelf_hall")
    room._prop("bench", -2.0 * TILE, -0.4 * TILE, "prop_bench_w")
    room._prop("bench", 2.0 * TILE, -0.4 * TILE, "prop_bench_e")
    if room.sf("prop-crate"):
        room._prop("crate", 3.4 * TILE, 0.6 * TILE, "prop_crate_scaffold")
        room._prop("crate", -3.4 * TILE, 0.5 * TILE, "prop_crate_tools")
    if room.sf("prop-barrel"):
        room._prop("barrel", 3.5 * TILE, -0.4 * TILE, "prop_barrel_hall")


def main() -> None:
    write_indoor_scene(
        scene_name="Community",
        out_scene=OUT_SCENE,
        out_meta=OUT_META,
        marker="__community_baked",
        place_furniture=place_furniture,
        id_prefix="Community",
    )


if __name__ == "__main__":
    main()
