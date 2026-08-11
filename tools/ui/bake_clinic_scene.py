#!/usr/bin/env python3
"""Bake clinic interior → assets/scenes/Clinic.scene

    python tools/ui/bake_clinic_scene.py
"""

from __future__ import annotations

from pathlib import Path

from indoor_room_bake import TILE, IndoorRoomBake, ROOT, write_indoor_scene

OUT_SCENE = ROOT / "assets/scenes/Clinic.scene"
OUT_META = ROOT / "assets/scenes/Clinic.scene.meta"


def place_furniture(room: IndoorRoomBake) -> None:
    room._prop("rug", 0.2 * TILE, 0.1 * TILE, "prop_rug_clinic")
    # Exam / consult desk NE — doctor stands nearby at runtime
    room._prop("desk", 1.8 * TILE, 1.6 * TILE, "prop_desk_clinic")
    room._prop("chair", 1.8 * TILE, 0.95 * TILE, "prop_chair_desk")
    # Medicine shelf NW
    room._prop("shelf", -3.0 * TILE, 2.0 * TILE, "prop_shelf_meds")
    room._prop("tea", -1.2 * TILE, 0.4 * TILE, "prop_tea_clinic")
    room._prop("chair", -1.9 * TILE, -0.1 * TILE, "prop_chair_wait")
    if room.sf("prop-crate"):
        room._prop("crate", 3.3 * TILE, 1.2 * TILE, "prop_crate_clinic")
    if room.sf("prop-barrel"):
        room._prop("barrel", -3.4 * TILE, 0.4 * TILE, "prop_herb_bin")


def main() -> None:
    write_indoor_scene(
        scene_name="Clinic",
        out_scene=OUT_SCENE,
        out_meta=OUT_META,
        marker="__clinic_baked",
        place_furniture=place_furniture,
        id_prefix="Clinic",
    )


if __name__ == "__main__":
    main()
