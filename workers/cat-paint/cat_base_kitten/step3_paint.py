"""
母體貓重建 A-3：用 Hunyuan3D-Paint 在固定 UV 上畫預設貼圖

花紋：三視圖＋站姿主照（好奇虎斑小貓站在木地板上）。

    C:\\AI\\Hunyuan3D-2\\venv\\Scripts\\python.exe cat_base_kitten\\step3_paint.py
"""
import json
import struct
import sys
import time
from pathlib import Path

import numpy as np

HUNYUAN_DIR = Path(r"C:\AI\Hunyuan3D-2")
sys.path.insert(0, str(HUNYUAN_DIR))

import torch
import trimesh
from PIL import Image, ImageOps

import hy3dgen.texgen.pipelines as texgen_pipelines
from hy3dgen.rembg import BackgroundRemover
from hy3dgen.texgen import Hunyuan3DPaintPipeline

ROOT = Path(__file__).resolve().parent.parent
BASE = ROOT / "cat_base_kitten"
WORK = BASE / "work"
VIEWS = ROOT / "cat_pictures" / "kitten_tabby_views.png"
STAND_NOBG = WORK / "photo_nobg.png"


def keep_original_uv(mesh):
    if isinstance(mesh, trimesh.Scene):
        mesh = mesh.dump(concatenate=True)
    return mesh


texgen_pipelines.mesh_uv_wrap = keep_original_uv


def load_with_uv(path):
    mesh = trimesh.load(path, force="mesh", process=False)
    if getattr(mesh.visual, "uv", None) is not None:
        return mesh
    data = Path(path).read_bytes()
    json_len = struct.unpack("<I", data[12:16])[0]
    gltf = json.loads(data[20:20 + json_len])
    bin_start = 20 + json_len + 8
    accessor = gltf["accessors"][gltf["meshes"][0]["primitives"][0]["attributes"]["TEXCOORD_0"]]
    view = gltf["bufferViews"][accessor["bufferView"]]
    offset = bin_start + view.get("byteOffset", 0) + accessor.get("byteOffset", 0)
    uv = np.frombuffer(data, dtype=np.float32, count=accessor["count"] * 2, offset=offset).reshape(-1, 2).copy()
    uv[:, 1] = 1.0 - uv[:, 1]
    assert len(uv) == len(mesh.vertices), "UV 數量和頂點數對不上"
    mesh.visual = trimesh.visual.TextureVisuals(uv=uv)
    return mesh


def crop_pad_rgba(image):
    bbox = image.getchannel("A").point(lambda a: 255 if a > 128 else 0).getbbox()
    if not bbox:
        return image
    x0, y0, x1, y1 = bbox
    pad = int(max(x1 - x0, y1 - y0) * 0.1)
    return image.crop((max(x0 - pad, 0), max(y0 - pad, 0), min(x1 + pad, image.width), min(y1 + pad, image.height)))


def split_three_views(path, rembg, out_dir):
    out_dir.mkdir(parents=True, exist_ok=True)
    sheet = ImageOps.exif_transpose(Image.open(path)).convert("RGB")
    w, h = sheet.size
    refs = []
    names = ("view_top", "view_back", "view_rear3q")
    for i, name in enumerate(names):
        x0 = int(w * i / 3)
        x1 = int(w * (i + 1) / 3)
        inset = max(2, int((x1 - x0) * 0.01))
        panel = sheet.crop((x0 + inset, 0, x1 - inset, h))
        panel.thumbnail((1024, 1024))
        rgba = crop_pad_rgba(rembg(panel))
        dest = out_dir / f"{name}.png"
        rgba.save(dest)
        refs.append(rgba)
        print(f"  參考 {name}: {dest.name} {rgba.size}")
    return refs


def main():
    start = time.time()
    mesh = load_with_uv(WORK / "base_uv.glb")
    # 預設只用主照（step1 產的 photo_nobg）；Paint 把每張參考都當正面，三視圖只會把背面弄糊
    images = [Image.open(STAND_NOBG).convert("RGBA")]
    print(f"主照：{STAND_NOBG.name}")
    if "--views" in sys.argv:
        if not VIEWS.is_file():
            raise FileNotFoundError(f"找不到三視圖：{VIEWS}")
        print("拆三視圖並去背…")
        images += split_three_views(VIEWS, BackgroundRemover(), WORK / "paint_refs")
    print(f"載入 Hunyuan3D-Paint（{len(images)} 張參考）…")
    paint = Hunyuan3DPaintPipeline.from_pretrained("tencent/Hunyuan3D-2")
    paint.enable_model_cpu_offload()
    mesh = paint(mesh, image=images)
    mesh.visual.material.image.convert("RGB").save(BASE / "albedo_default.png")
    mesh.export(WORK / "base_textured.glb")
    torch.cuda.empty_cache()
    print(f"完成：{BASE / 'albedo_default.png'}（{time.time() - start:.0f} 秒）")


if __name__ == "__main__":
    main()