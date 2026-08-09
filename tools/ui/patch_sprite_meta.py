#!/usr/bin/env python3
"""Batch-patch Cocos image .meta: nearest filter + stable custom trim/pivot."""

from __future__ import print_function

import argparse
import json
import sys
from pathlib import Path


def patch_one(meta_path, width, height, pivot_x, pivot_y):
    data = json.loads(meta_path.read_text())
    for sid, sub in data.get("subMetas", {}).items():
        ud = sub.get("userData", {})
        name = sub.get("name") or ""
        if name == "texture" or sid == "6c48a":
            ud["minfilter"] = "nearest"
            ud["magfilter"] = "nearest"
            ud["mipfilter"] = "none"
        if name == "spriteFrame" or sid == "f9941":
            ud["trimType"] = "custom"
            ud["trimThreshold"] = 1
            ud["trimX"] = 0
            ud["trimY"] = 0
            ud["width"] = width
            ud["height"] = height
            ud["rawWidth"] = width
            ud["rawHeight"] = height
            ud["offsetX"] = 0
            ud["offsetY"] = 0
            ud["pivotX"] = pivot_x
            ud["pivotY"] = pivot_y
            ud.pop("vertices", None)
        sub["userData"] = ud
    ud_root = data.setdefault("userData", {})
    ud_root["type"] = "sprite-frame"
    ud_root["hasAlpha"] = True
    meta_path.write_text(json.dumps(data, indent=2) + "\n")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("dir", help="directory containing *.png.meta")
    ap.add_argument("--w", type=int, default=48)
    ap.add_argument("--h", type=int, default=64)
    ap.add_argument("--pivot-x", type=float, default=0.5)
    ap.add_argument("--pivot-y", type=float, default=0.0)
    ap.add_argument("--glob", default="*.png.meta")
    args = ap.parse_args()

    root = Path(args.dir)
    if not root.is_dir():
        sys.stderr.write("not a directory: %s\n" % root)
        sys.exit(1)

    paths = sorted(root.glob(args.glob))
    if not paths:
        sys.stderr.write("no metas matched %s in %s\n" % (args.glob, root))
        sys.exit(1)

    for p in paths:
        patch_one(p, args.w, args.h, args.pivot_x, args.pivot_y)
        print("patched", p.name)


if __name__ == "__main__":
    main()
