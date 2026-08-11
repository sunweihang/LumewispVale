#!/usr/bin/env python3
"""Compress heavy story audio + RGB splash/story art for web-mobile packs.

Safe to re-run. Keeps Cocos UUIDs (.meta) intact; RGB panels become .jpg.
Requires: ffmpeg on PATH, Pillow.
"""
from __future__ import annotations

import json
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FFMPEG = shutil.which("ffmpeg") or r"C:\Users\elex\scoop\shims\ffmpeg.exe"

AUDIO = [
    # (relpath, ffmpeg args after -i, extra note)
    (
        "assets/resources/audio/story/storyThemeAlert.mp3",
        # Drop the unused 16s drum intro (was ALERT_SKIP_SEC).
        ["-ss", "16", "-vn", "-map_metadata", "-1", "-c:a", "libmp3lame", "-b:a", "96k", "-ac", "2", "-ar", "44100"],
    ),
    (
        "assets/resources/audio/story/storyThemeCalm.mp3",
        ["-vn", "-map_metadata", "-1", "-c:a", "libmp3lame", "-b:a", "96k", "-ac", "2", "-ar", "44100"],
    ),
    (
        "assets/resources/audio/story/story-thunder-boom.mp3",
        ["-vn", "-map_metadata", "-1", "-c:a", "libmp3lame", "-b:a", "96k", "-ac", "1", "-ar", "22050"],
    ),
    (
        "assets/resources/audio/story/townTheme.mp3",
        ["-vn", "-map_metadata", "-1", "-c:a", "libmp3lame", "-b:a", "64k", "-ac", "1", "-ar", "22050"],
    ),
]

# Photographic / painted RGB frames (no alpha) → JPEG.
JPEG_TARGETS = [
    ("assets/textures/ui/ui-splash.png", 82),
    ("assets/textures/story/story-01.png", 82),
    ("assets/textures/story/story-02.png", 82),
    ("assets/textures/story/story-03.png", 82),
    ("assets/textures/story/story-04.png", 82),
    ("assets/textures/story/story-05.png", 82),
]

REFERENCE_SRC = ROOT / "assets" / "textures" / "reference"
REFERENCE_DST = ROOT / "tools" / "reference"


def human(n: int) -> str:
    if n >= 1024 * 1024:
        return f"{n / 1024 / 1024:.2f} MB"
    return f"{n / 1024:.1f} KB"


def compress_audio(rel: str, args: list[str]) -> None:
    src = ROOT / rel
    if not src.exists():
        print(f"  skip missing {rel}")
        return
    before = src.stat().st_size
    tmp = src.with_suffix(".tmp.mp3")
    cmd = [FFMPEG, "-y", "-i", str(src), *args, str(tmp)]
    subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    after = tmp.stat().st_size
    if after >= before * 0.98:
        tmp.unlink(missing_ok=True)
        print(f"  keep {rel} ({human(before)}) — reencode not smaller")
        return
    tmp.replace(src)
    print(f"  {rel}: {human(before)} → {human(after)}")


def png_to_jpeg(rel_png: str, quality: int) -> None:
    from PIL import Image

    src = ROOT / rel_png
    if not src.exists():
        # Already converted?
        jpg = src.with_suffix(".jpg")
        if jpg.exists():
            print(f"  already jpg {jpg.relative_to(ROOT)}")
        else:
            print(f"  skip missing {rel_png}")
        return

    before = src.stat().st_size
    im = Image.open(src)
    if im.mode in ("RGBA", "LA") or (im.mode == "P" and "transparency" in im.info):
        print(f"  skip alpha image {rel_png}")
        return
    rgb = im.convert("RGB")
    dst = src.with_suffix(".jpg")
    rgb.save(dst, format="JPEG", quality=quality, optimize=True, progressive=True)
    after = dst.stat().st_size
    if after >= before * 0.98:
        dst.unlink(missing_ok=True)
        print(f"  keep {rel_png} ({human(before)}) — jpeg not smaller")
        return

    meta_png = Path(str(src) + ".meta")
    meta_jpg = Path(str(dst) + ".meta")
    if meta_png.exists():
        data = json.loads(meta_png.read_text(encoding="utf-8"))
        files = data.get("files")
        if isinstance(files, list):
            data["files"] = [".jpg" if f == ".png" else f for f in files]
        meta_jpg.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        meta_png.unlink()
    src.unlink()
    print(f"  {rel_png} → {dst.name}: {human(before)} → {human(after)}")


def relocate_reference() -> None:
    if not REFERENCE_SRC.exists():
        print("  reference already relocated or missing")
        return
    REFERENCE_DST.mkdir(parents=True, exist_ok=True)
    for p in REFERENCE_SRC.iterdir():
        target = REFERENCE_DST / p.name
        if target.exists():
            if p.is_file():
                p.unlink()
            continue
        shutil.move(str(p), str(target))
    # Remove empty dir + meta
    for leftover in REFERENCE_SRC.glob("*"):
        if leftover.is_file():
            leftover.unlink()
    try:
        REFERENCE_SRC.rmdir()
    except OSError:
        pass
    meta = ROOT / "assets" / "textures" / "reference.meta"
    if meta.exists():
        meta.unlink()
    print(f"  moved editor refs → {REFERENCE_DST.relative_to(ROOT)}")


def move_text_out_of_resources() -> None:
    pairs = [
        (
            ROOT / "assets/resources/audio/story/CREDITS.txt",
            ROOT / "docs/audio-story-CREDITS.txt",
        ),
        (
            ROOT / "assets/resources/audio/story/story-thunder-boom_LICENSE.txt",
            ROOT / "docs/audio-story-thunder-LICENSE.txt",
        ),
    ]
    for src, dst in pairs:
        if not src.exists():
            continue
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.move(str(src), str(dst))
        meta = Path(str(src) + ".meta")
        if meta.exists():
            meta.unlink()
        print(f"  moved {src.name} → {dst.relative_to(ROOT)}")


def main() -> int:
    if not Path(FFMPEG).exists():
        print("ffmpeg not found", file=sys.stderr)
        return 1
    print("== audio ==")
    for rel, args in AUDIO:
        compress_audio(rel, args)
    print("== images ==")
    for rel, q in JPEG_TARGETS:
        png_to_jpeg(rel, q)
    print("== relocate ==")
    relocate_reference()
    move_text_out_of_resources()
    print("done")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
