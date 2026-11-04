"""
母體貓重建 A-3：用 Hunyuan3D-Paint 依照片在「固定 UV」上畫預設貼圖（約 8~11 分鐘）

    C:\\AI\\Hunyuan3D-2\\venv\\Scripts\\python.exe cat_base\\step3_paint.py
輸入: cat_base/work/base_uv.glb、cat_base/work/photo_nobg.png
輸出: cat_base/albedo_default.png      預設花色（LINE_A7_1 虎斑）
      cat_base/work/base_textured.glb  上好貼圖的靜態模型（給你檢查外觀，還沒有骨架）
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
from PIL import Image

import hy3dgen.texgen.pipelines as texgen_pipelines
from hy3dgen.texgen import Hunyuan3DPaintPipeline

ROOT = Path(__file__).resolve().parent.parent
BASE = ROOT / "cat_base"
WORK = BASE / "work"


def keep_original_uv(mesh):
    """不讓 Paint 用 xatlas 重攤 UV，貼圖才會對得上 A-2 的固定 UV"""
    if isinstance(mesh, trimesh.Scene):
        mesh = mesh.dump(concatenate=True)
    return mesh


texgen_pipelines.mesh_uv_wrap = keep_original_uv


def load_with_uv(path):
    """A-2 的 GLB 沒有材質，trimesh 讀檔時會把 UV 丟掉，這裡直接從 GLB 讀回 TEXCOORD_0"""
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
    uv[:, 1] = 1.0 - uv[:, 1]  # glTF 的 V 朝下，trimesh 朝上
    assert len(uv) == len(mesh.vertices), "UV 數量和頂點數對不上"
    mesh.visual = trimesh.visual.TextureVisuals(uv=uv)
    return mesh


def main():
    start = time.time()
    mesh = load_with_uv(WORK / "base_uv.glb")
    image = Image.open(WORK / "photo_nobg.png").convert("RGBA")
    print("載入 Hunyuan3D-Paint（第一次約 1~3 分鐘）…")
    paint = Hunyuan3DPaintPipeline.from_pretrained("tencent/Hunyuan3D-2")
    paint.enable_model_cpu_offload()
    mesh = paint(mesh, image=image)
    mesh.visual.material.image.convert("RGB").save(BASE / "albedo_default.png")
    mesh.export(WORK / "base_textured.glb")
    torch.cuda.empty_cache()
    print(f"完成：{BASE / 'albedo_default.png'}（{time.time() - start:.0f} 秒）")


if __name__ == "__main__":
    main()
