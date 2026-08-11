#!/usr/bin/env python3
"""Cut out town building AI refs via CreativeCenter portal RMBG-v2, then fit into assets.

Portal: http://10.1.4.130:8080  (workflow rmbg-v2 / ComfyUI RMBG-2.0)
Do NOT use gray chroma key for grass/stone buildings — it eats roofs and leaves dirt halos.

    python tools/ui/portal_rmbg_buildings.py
    python tools/ui/portal_rmbg_buildings.py --only oreshop,home-purple
"""

from __future__ import annotations

import argparse
import json
import mimetypes
import time
import uuid
from http.cookiejar import CookieJar
from io import BytesIO
from pathlib import Path
from urllib.error import HTTPError
from urllib.parse import urlencode
from urllib.request import HTTPCookieProcessor, Request, build_opener

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
AI = Path(__file__).resolve().parent / "ai-source"
BLD = ROOT / "assets/textures/buildings"
UUID_MAP = Path(__file__).resolve().parent / "uuid-map.json"
CUTOUT_DIR = AI / "rmbg-cutout"

PORTAL = "http://10.1.4.130:8080"
USER = "admin"
PASS = "admin123"
TEX_SUFFIX = "6c48a"
SF_SUFFIX = "f9941"

# name -> (ref stems preferred first, tw, th)
SPECS = [
    ("bld-seedshop", ["ai-bld-seedshop-v3", "ai-bld-seedshop-ortho-ref", "ai-bld-seedshop-ref"], 288, 240),
    ("bld-oreshop", ["ai-bld-oreshop-v3", "ai-bld-oreshop-ortho-ref", "ai-bld-oreshop-ref"], 288, 240),
    ("bld-general", ["ai-bld-general-v3", "ai-bld-general-ortho-ref", "ai-bld-general-ref"], 288, 240),
    ("bld-police", ["ai-bld-police-v3", "ai-bld-police-ortho-ref", "ai-bld-police-ref"], 256, 224),
    ("bld-post", ["ai-bld-post-v3", "ai-bld-post-ortho-ref", "ai-bld-post-ref"], 256, 224),
    ("bld-clinic", ["ai-bld-clinic-v3", "ai-bld-clinic-ortho-ref", "ai-bld-clinic-ref"], 288, 224),
    ("bld-school", ["ai-bld-school-v3", "ai-bld-school-ortho-ref", "ai-bld-school-ref"], 288, 256),
    ("bld-mayor", ["ai-bld-mayor-v3", "ai-bld-mayor-ortho-ref", "ai-bld-mayor-ref"], 320, 272),
    ("bld-community", ["ai-bld-community-v3", "ai-bld-community-ortho-ref", "ai-bld-community-ref"], 320, 256),
    ("bld-saloon", ["ai-bld-saloon-v3", "ai-bld-saloon-ortho-ref", "ai-bld-saloon-ref"], 288, 240),
    ("bld-fishshop", ["ai-bld-fishshop-v3", "ai-bld-fishshop-ortho-ref", "ai-bld-fishshop-ref"], 288, 240),
    ("bld-library", ["ai-bld-library-v3", "ai-bld-library-ortho-ref", "ai-bld-library-ref"], 256, 256),
    ("bld-museum", ["ai-bld-museum-v3", "ai-bld-museum-ref"], 288, 256),
    ("bld-carpenter", ["ai-bld-carpenter-v3", "ai-bld-carpenter-ref"], 320, 240),
    ("bld-home-green", ["ai-bld-home-green-v3", "ai-bld-home-green-ref"], 224, 224),
    ("bld-home-yellow", ["ai-bld-home-yellow-v3", "ai-bld-home-yellow-ref"], 256, 224),
    ("bld-home-purple", ["ai-bld-home-purple-v3", "ai-bld-home-purple-ref"], 224, 224),
    ("bld-cottage-blue", ["ai-bld-cottage-blue-v3", "ai-bld-cottage-blue-ortho-ref"], 256, 224),
    # Hero farmhouse — larger cozy home (farm + town cottage_red)
    ("bld-cottage-red", ["ai-bld-cottage-red-hero-ref", "ai-bld-cottage-red-hero-v2", "ai-bld-cottage-red-v3"], 288, 272),
    # North meadow district (civic terrace → orchard / chapel / mill)
    ("bld-chapel", ["ai-bld-chapel-v3"], 256, 288),
    ("bld-windmill", ["ai-bld-windmill-v3"], 256, 320),
    ("bld-greenhouse", ["ai-bld-greenhouse-v3"], 288, 240),
]


class Portal:
    def __init__(self):
        self.cj = CookieJar()
        self.opener = build_opener(HTTPCookieProcessor(self.cj))
        self.token = None

    def req(self, method, path, data=None, headers=None, timeout=180):
        headers = dict(headers or {})
        body = None
        if data is not None and not isinstance(data, (bytes, bytearray)):
            body = json.dumps(data).encode("utf-8")
            headers.setdefault("Content-Type", "application/json")
        else:
            body = data
        if self.token:
            headers.setdefault("Authorization", f"Bearer {self.token}")
        r = Request(PORTAL + path, data=body, headers=headers, method=method)
        with self.opener.open(r, timeout=timeout) as resp:
            return resp.read(), resp.headers.get("Content-Type", ""), resp.status

    def login(self):
        raw, _, _ = self.req("POST", "/api/auth/login", {"username": USER, "password": PASS})
        data = json.loads(raw)
        self.token = data.get("sessionToken") or data.get("token")
        if not self.token:
            raise RuntimeError(f"login failed: {data}")
        print("portal login ok", data.get("user", {}).get("username"))

    def upload(self, path: Path) -> str:
        boundary = f"----WebKitFormBoundary{uuid.uuid4().hex}"
        mime = mimetypes.guess_type(path.name)[0] or "image/png"
        chunks = [
            f"--{boundary}\r\n".encode(),
            b'Content-Disposition: form-data; name="overwrite"\r\n\r\n',
            b"true\r\n",
            f"--{boundary}\r\n".encode(),
            f'Content-Disposition: form-data; name="image"; filename="{path.name}"\r\n'.encode(),
            f"Content-Type: {mime}\r\n\r\n".encode(),
            path.read_bytes(),
            f"\r\n--{boundary}--\r\n".encode(),
        ]
        body = b"".join(chunks)
        headers = {"Content-Type": f"multipart/form-data; boundary={boundary}"}
        raw, _, _ = self.req("POST", "/api/comfyui/upload/image", data=body, headers=headers)
        data = json.loads(raw)
        name = data.get("name") or (data.get("image") or {}).get("name")
        if not name:
            raise RuntimeError(f"upload bad response: {data}")
        print("  upload", path.name, "->", name)
        return name

    def queue_rmbg(self, image_name: str) -> str:
        prompt = {
            "2": {"class_type": "LoadImage", "inputs": {"image": image_name}},
            "13": {
                "class_type": "RMBG",
                "inputs": {
                    "image": ["2", 0],
                    "model": "RMBG-2.0",
                    "sensitivity": 1.0,
                    "process_res": 1024,
                    "mask_blur": 0,
                    "mask_offset": 0,
                    "invert_output": False,
                    "refine_foreground": True,
                    "background": "Alpha",
                    "background_color": "#222222",
                },
            },
            "16": {
                "class_type": "SaveImage",
                "inputs": {"images": ["13", 0], "filename_prefix": "rmbg_town"},
            },
        }
        client_id = str(uuid.uuid4())
        raw, _, _ = self.req(
            "POST",
            "/api/comfyui/prompt",
            {"prompt": prompt, "client_id": client_id},
            timeout=60,
        )
        data = json.loads(raw)
        if data.get("error") or data.get("node_errors"):
            raise RuntimeError(f"prompt error: {data}")
        pid = data["prompt_id"]
        print("  queued", pid)
        return pid

    def wait(self, prompt_id: str, timeout_s=300) -> dict:
        deadline = time.time() + timeout_s
        while time.time() < deadline:
            try:
                raw, _, _ = self.req("GET", f"/api/comfyui/history/{prompt_id}", timeout=30)
                payload = json.loads(raw)
                if prompt_id in payload and payload[prompt_id].get("outputs"):
                    return payload[prompt_id]
            except HTTPError as e:
                print("  hist", e.code)
            time.sleep(0.8)
        raise TimeoutError(prompt_id)

    def download_image(self, meta: dict) -> bytes:
        q = urlencode(
            {
                "filename": meta["filename"],
                "type": meta.get("type", "output"),
                "subfolder": meta.get("subfolder", ""),
            }
        )
        raw, _, _ = self.req("GET", f"/api/comfyui/view?{q}", timeout=60)
        return raw

    def cutout(self, src: Path) -> Image.Image:
        name = self.upload(src)
        pid = self.queue_rmbg(name)
        hist = self.wait(pid)
        images = []
        for nid, out in hist.get("outputs", {}).items():
            for img in out.get("images", []):
                images.append({**img, "node_id": str(nid)})
        if not images:
            raise RuntimeError(f"no output for {src.name}: {list(hist.keys())}")
        meta = next((i for i in images if i.get("node_id") == "16"), images[0])
        return Image.open(BytesIO(self.download_image(meta))).convert("RGBA")


def quantize(img: Image.Image) -> Image.Image:
    px = img.load()
    w, h = img.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a < 40:
                px[x, y] = (0, 0, 0, 0)
                continue
            # Soft fringe: keep low-alpha edge pixels but snap RGB
            r = (r // 16) * 16 + 8
            g = (g // 16) * 16 + 8
            b = (b // 16) * 16 + 8
            px[x, y] = (r, g, b, 255 if a > 128 else a)
    return img


def fit_foot(img: Image.Image, tw: int, th: int) -> Image.Image:
    bbox = img.getbbox()
    if not bbox:
        return Image.new("RGBA", (tw, th), (0, 0, 0, 0))
    cropped = img.crop(bbox)
    cw, ch = cropped.size
    pad = 4
    scale = min((tw - pad * 2) / float(cw), (th - pad * 2) / float(ch))
    nw = max(1, int(round(cw * scale)))
    nh = max(1, int(round(ch * scale)))
    work = cropped
    if cw > tw * 2 or ch > th * 2:
        work = cropped.resize((nw, nh), Image.BOX)
    work = work.resize((nw, nh), Image.NEAREST)
    work = quantize(work)
    out = Image.new("RGBA", (tw, th), (0, 0, 0, 0))
    x = (tw - nw) // 2
    y = max(0, th - nh - 2)
    out.paste(work, (x, y), work)
    return out


def write_meta(png_path: Path, image_uuid: str, w: int, h: int, name: str) -> None:
    meta = {
        "ver": "1.0.27",
        "importer": "image",
        "imported": True,
        "uuid": image_uuid,
        "files": [".json", ".png"],
        "subMetas": {
            TEX_SUFFIX: {
                "importer": "texture",
                "uuid": f"{image_uuid}@{TEX_SUFFIX}",
                "displayName": name,
                "id": TEX_SUFFIX,
                "name": "texture",
                "userData": {
                    "wrapModeS": "clamp-to-edge",
                    "wrapModeT": "clamp-to-edge",
                    "minfilter": "nearest",
                    "magfilter": "nearest",
                    "mipfilter": "none",
                    "anisotropy": 0,
                    "isUuid": True,
                    "imageUuidOrDatabaseUri": image_uuid,
                    "visible": False,
                },
                "ver": "1.0.22",
                "imported": True,
                "files": [".json"],
                "subMetas": {},
            },
            SF_SUFFIX: {
                "importer": "sprite-frame",
                "uuid": f"{image_uuid}@{SF_SUFFIX}",
                "displayName": name,
                "id": SF_SUFFIX,
                "name": "spriteFrame",
                "userData": {
                    "trimType": "custom",
                    "trimThreshold": 1,
                    "rotated": False,
                    "offsetX": 0,
                    "offsetY": 0,
                    "trimX": 0,
                    "trimY": 0,
                    "width": w,
                    "height": h,
                    "rawWidth": w,
                    "rawHeight": h,
                    "packable": True,
                    "pixelsToUnit": 100,
                    "pivotX": 0.5,
                    "pivotY": 0.0,
                    "meshType": 0,
                },
                "ver": "1.0.22",
                "imported": True,
                "files": [".json"],
                "subMetas": {},
            },
        },
        "userData": {"type": "sprite-frame", "hasAlpha": True},
    }
    png_path.with_suffix(".png.meta").write_text(json.dumps(meta, indent=2) + "\n", encoding="utf-8")


def find_ref(stems):
    for s in stems:
        p = AI / f"{s}.png"
        if p.exists():
            return p
    return None


def alpha_pct(im: Image.Image) -> float:
    a = im.split()[3]
    zeros = sum(1 for px in a.getdata() if px < 10)
    return 100.0 * zeros / (im.width * im.height)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", default="", help="comma names without bld- prefix, e.g. oreshop,home-purple")
    ap.add_argument(
        "--local",
        action="store_true",
        help="skip portal; mid-gray AI canvas key (only when refs are solid gray, not outdoor grass)",
    )
    args = ap.parse_args()
    only = {x.strip() for x in args.only.split(",") if x.strip()}

    CUTOUT_DIR.mkdir(parents=True, exist_ok=True)
    portal = None
    use_local = args.local
    if not use_local:
        try:
            portal = Portal()
            portal.login()
        except Exception as e:
            print(f"WARN portal unreachable ({e}); falling back to local gray-key cutout")
            use_local = True
            portal = None

    umap = json.loads(UUID_MAP.read_text(encoding="utf-8")) if UUID_MAP.exists() else {}

    for name, stems, tw, th in SPECS:
        short = name.replace("bld-", "")
        if only and short not in only and name not in only:
            continue
        ref = find_ref(stems)
        if not ref:
            print("SKIP missing", name)
            continue
        print(f"\n=== {name} <- {ref.name} ===")
        cut_path = CUTOUT_DIR / f"{name}-rmbg.png"
        if portal is not None:
            cut = portal.cutout(ref)
        else:
            # Solid mid-gray AI canvas only — not for outdoor-grass refs.
            from process_bag_ai import flood_corners, knock_gray_bg

            cut = knock_gray_bg(Image.open(ref).convert("RGBA"))
            cut = flood_corners(cut)
            cut = quantize(cut)
        cut.save(cut_path)
        print(f"  cutout alpha={alpha_pct(cut):.1f}% -> {cut_path.name}")

        out = fit_foot(cut, tw, th)
        path = BLD / f"{name}.png"
        meta_path = path.with_suffix(".png.meta")
        if meta_path.exists():
            try:
                image_uuid = json.loads(meta_path.read_text(encoding="utf-8"))["uuid"]
            except Exception:
                image_uuid = str(uuid.uuid4())
        else:
            image_uuid = str(uuid.uuid4())
        out.save(path)
        write_meta(path, image_uuid, tw, th, name)
        sf = f"{image_uuid}@{SF_SUFFIX}"
        umap[name] = {
            "texture": image_uuid,
            "spriteFrame": sf,
            "prefab": umap.get(name, {}).get("prefab", ""),
        }
        print(f"  OK {name} {tw}x{th} alpha={alpha_pct(out):.1f}%")

    UUID_MAP.write_text(json.dumps(umap, indent=2) + "\n", encoding="utf-8")
    print("\ndone. Re-bake town if needed: python tools/ui/bake_town_scene.py")


if __name__ == "__main__":
    main()
