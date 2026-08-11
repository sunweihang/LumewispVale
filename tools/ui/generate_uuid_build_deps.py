#!/usr/bin/env python3
"""Generate resources/prefabs/UuidBuildDeps.prefab — build-time UUID anchor.

Cocos web-mobile only packs assets reachable from scenes / resources.
Runtime loadAny({ uuid }) strings in *Frames.ts are invisible to the
dependency walker, so those textures 404 on CDN. This prefab lives under
resources/ and references every Frames UUID so they ship in the bundle.

  python tools/ui/generate_uuid_build_deps.py
"""
from __future__ import annotations

import json
import random
import re
import string
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SCRIPTS = ROOT / "assets" / "scripts" / "game"
OUT_PREFAB = ROOT / "assets" / "resources" / "prefabs" / "UuidBuildDeps.prefab"
SCRIPT_META = ROOT / "assets" / "scripts" / "game" / "UuidBuildDeps.ts.meta"
SCRIPT_UUID = "b7e2a91c-4d5f-4a8e-9c1b-2f6d8e0a3b45"

BASE64_KEYS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/="
UUID_RE = re.compile(
    r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?:@[0-9a-f]+)?"
)

# Prefab assets loaded by UUID (not sprite frames).
EXTRA_PREFABS = [
    "80815e00-313f-4257-93fa-95aa89a25f45",  # QuestPanel
    "220473b9-25ed-460c-b9ef-c7bb009504cf",  # FarmInfoBoard
    "e51a5553-5169-4993-a867-03e35beb87e2",  # spc-meteor
]


def file_id() -> str:
    return "".join(random.choice(string.ascii_lowercase + string.digits) for _ in range(22))


def compress_uuid(u: str, min_form: bool = False) -> str:
    """Cocos Editor UuidUtils.compressUuid."""
    raw = u.split("@")[0].replace("-", "")
    if len(raw) != 32:
        return u
    reserved = 2 if min_form else 5
    head = raw[:reserved]
    out: list[str] = []
    i = reserved
    while i < 32:
        a = int(raw[i], 16)
        b = int(raw[i + 1], 16)
        c = int(raw[i + 2], 16)
        out.append(BASE64_KEYS[(a << 2) | (b >> 2)])
        out.append(BASE64_KEYS[((b & 3) << 4) | c])
        i += 3
    return head + "".join(out)


def collect_uuids() -> tuple[list[str], list[str]]:
    sprites: set[str] = set()
    prefabs: set[str] = set(EXTRA_PREFABS)
    for path in sorted(SCRIPTS.glob("*Frames.ts")):
        text = path.read_text(encoding="utf-8")
        for m in UUID_RE.findall(text):
            if "@" in m:
                sprites.add(m)
            else:
                # bare uuid in Frames — treat as prefab if named *_PREFAB*
                if "PREFAB" in text[max(0, text.find(m) - 40) : text.find(m)]:
                    prefabs.add(m.split("@")[0])
                else:
                    # texture root — prefer @f9941 spriteFrame if present later
                    sprites.add(m)
    warmup = SCRIPTS / "AssetWarmup.ts"
    if warmup.exists():
        for m in UUID_RE.findall(warmup.read_text(encoding="utf-8")):
            if "@" in m:
                sprites.add(m)
            else:
                prefabs.add(m)

    # Prefer spriteFrame sub-assets; drop bare texture uuids that have @f9941
    bases_with_sf = {s.split("@")[0] for s in sprites if "@" in s}
    sprites = {s for s in sprites if "@" in s or s not in bases_with_sf}
    # Bare texture uuids without sub-id still need a spriteFrame — use @f9941
    normalized: set[str] = set()
    for s in sprites:
        if "@" in s:
            normalized.add(s)
        else:
            normalized.add(f"{s}@f9941")
    return sorted(normalized), sorted(prefabs)


def write_meta(prefab_uuid: str) -> None:
    meta = {
        "ver": "1.1.50",
        "importer": "prefab",
        "imported": True,
        "uuid": prefab_uuid,
        "files": [".json"],
        "subMetas": {},
        "userData": {"syncNodeName": "UuidBuildDeps"},
    }
    OUT_PREFAB.with_suffix(".prefab.meta").write_text(
        json.dumps(meta, indent=2) + "\n", encoding="utf-8"
    )


def build_prefab(sprites: list[str], prefabs: list[str]) -> list[dict]:
    script_type = compress_uuid(SCRIPT_UUID, min_form=False)  # 23-char, matches Main.scene
    root_fid = file_id()
    uit_fid = file_id()
    deps_fid = file_id()

    # ids: 0 Prefab, 1 Node, 2 PrefabInfo, 3 UITransform, 4 CompPrefabInfo(uit),
    #      5 UuidBuildDeps, 6 CompPrefabInfo(deps)
    objects: list[dict] = [
        {
            "__type__": "cc.Prefab",
            "_name": "UuidBuildDeps",
            "_objFlags": 0,
            "__editorExtras__": {},
            "_native": "",
            "data": {"__id__": 1},
            "optimizationPolicy": 0,
            "persistent": False,
        },
        {
            "__type__": "cc.Node",
            "_name": "UuidBuildDeps",
            "_objFlags": 0,
            "__editorExtras__": {},
            "_parent": None,
            "_children": [],
            "_active": False,
            "_components": [{"__id__": 3}, {"__id__": 5}],
            "_prefab": {"__id__": 2},
            "_lpos": {"__type__": "cc.Vec3", "x": 0, "y": 0, "z": 0},
            "_lrot": {"__type__": "cc.Quat", "x": 0, "y": 0, "z": 0, "w": 1},
            "_lscale": {"__type__": "cc.Vec3", "x": 1, "y": 1, "z": 1},
            "_mobility": 0,
            "_layer": 33554432,
            "_euler": {"__type__": "cc.Vec3", "x": 0, "y": 0, "z": 0},
            "_id": "",
        },
        {
            "__type__": "cc.PrefabInfo",
            "root": {"__id__": 1},
            "asset": {"__id__": 0},
            "fileId": root_fid,
            "instance": None,
            "targetOverrides": None,
            "nestedPrefabInstanceRoots": None,
        },
        {
            "__type__": "cc.UITransform",
            "_name": "",
            "_objFlags": 0,
            "__editorExtras__": {},
            "node": {"__id__": 1},
            "_enabled": True,
            "__prefab": {"__id__": 4},
            "_contentSize": {"__type__": "cc.Size", "width": 0, "height": 0},
            "_anchorPoint": {"__type__": "cc.Vec2", "x": 0.5, "y": 0.5},
            "_id": "",
        },
        {"__type__": "cc.CompPrefabInfo", "fileId": uit_fid},
        {
            "__type__": script_type,
            "_name": "",
            "_objFlags": 0,
            "__editorExtras__": {},
            "node": {"__id__": 1},
            "_enabled": True,
            "__prefab": {"__id__": 6},
            "spriteFrames": [
                {"__uuid__": s, "__expectedType__": "cc.SpriteFrame"} for s in sprites
            ],
            "prefabs": [{"__uuid__": p, "__expectedType__": "cc.Prefab"} for p in prefabs],
            "_id": "",
        },
        {"__type__": "cc.CompPrefabInfo", "fileId": deps_fid},
    ]
    return objects


def main() -> None:
    # Keep script meta uuid stable.
    if SCRIPT_META.exists():
        meta = json.loads(SCRIPT_META.read_text(encoding="utf-8"))
        if meta.get("uuid") != SCRIPT_UUID:
            print(f"warn: script meta uuid is {meta.get('uuid')}, expected {SCRIPT_UUID}")

    sprites, prefabs = collect_uuids()
    if OUT_PREFAB.exists():
        old = json.loads(OUT_PREFAB.with_suffix(".prefab.meta").read_text(encoding="utf-8"))
        prefab_uuid = old.get("uuid") or str(uuid.uuid4())
    else:
        prefab_uuid = str(uuid.uuid4())

    OUT_PREFAB.parent.mkdir(parents=True, exist_ok=True)
    data = build_prefab(sprites, prefabs)
    OUT_PREFAB.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
    write_meta(prefab_uuid)
    print(f"wrote {OUT_PREFAB.relative_to(ROOT)}")
    print(f"  spriteFrames: {len(sprites)}")
    print(f"  prefabs:      {len(prefabs)}")
    print(f"  script type:  {compress_uuid(SCRIPT_UUID, min_form=False)}")


if __name__ == "__main__":
    main()
