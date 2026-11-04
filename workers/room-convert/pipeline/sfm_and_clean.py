#!/usr/bin/env python3
"""Step 2: COLMAP SfM 相機姿態推算 + Open3D 點雲清理。

流程: feature_extractor -> matcher -> mapper -> image_undistorter
      -> 讀 points3D.bin -> 體素下採樣 -> 統計式離群點剔除 -> 寫回 points3D.bin

產出 (OpenSplat 可直接吃的 COLMAP 專案):
  <workspace>/project/images/          去畸變後的影像 (PINHOLE)
  <workspace>/project/sparse/0/*.bin   相機、姿態、清理後點雲
  <workspace>/points_raw.ply / points_clean.ply   方便用 MeshLab/CloudCompare 檢查

用法:
  python pipeline/sfm_and_clean.py input_frames -w colmap_ws --matcher sequential
"""
import argparse
import os
import shutil
import struct
import subprocess
import sys
import time
from pathlib import Path

import numpy as np
import open3d as o3d

import timing


# ---------- COLMAP CLI ----------

def record_part(name: str, seconds: float):
    """把 COLMAP 子指令的耗時記到 timing.json 目前這一步的 parts。"""
    path = os.environ.get("TIMING")
    if path:
        t = timing.load(path)
        t["steps"][-1].setdefault("parts", {})[name] = round(seconds, 1)
        timing.save(path, t)


def run(cmd: list):
    print("[colmap] " + " ".join(map(str, cmd)), flush=True)
    start = time.time()
    try:
        subprocess.run([str(c) for c in cmd], check=True)
    except FileNotFoundError:
        raise RuntimeError("找不到 colmap，請先安裝 (macOS: brew install colmap) 或用 --colmap 指定路徑")
    except subprocess.CalledProcessError as e:
        raise RuntimeError(f"COLMAP 指令失敗 (exit {e.returncode}): {cmd[1]}")
    record_part(str(cmd[1]), time.time() - start)


def option_prefix(colmap: str, sub: str, new: str, old: str) -> str:
    """COLMAP 3.12+ 把 SiftExtraction.* 改名成 FeatureExtraction.* 等，依 --help 自動挑。"""
    try:
        r = subprocess.run([colmap, sub, "-h"], capture_output=True, text=True)
    except FileNotFoundError:
        raise RuntimeError("找不到 colmap，請先安裝 (macOS: brew install colmap) 或用 --colmap 指定路徑")
    out = r.stdout + r.stderr  # COLMAP 4.x 把 help 印到 stderr
    return new if f"--{new}.use_gpu" in out else old


def num_registered_images(model_dir: Path) -> int:
    with open(model_dir / "images.bin", "rb") as f:
        return struct.unpack("<Q", f.read(8))[0]


def run_colmap(args, frames: Path, ws: Path) -> Path:
    db = ws / "database.db"
    sparse = ws / "sparse"
    if db.exists():
        db.unlink()
    shutil.rmtree(sparse, ignore_errors=True)
    sparse.mkdir(parents=True)

    gpu = "1" if args.gpu else "0"
    ext = option_prefix(args.colmap, "feature_extractor", "FeatureExtraction", "SiftExtraction")
    cmd = [args.colmap, "feature_extractor",
           "--database_path", db, "--image_path", frames,
           "--ImageReader.single_camera", "1" if args.single_camera else "0",
           f"--{ext}.use_gpu", gpu]
    if args.camera_model:
        cmd += ["--ImageReader.camera_model", args.camera_model]
    run(cmd)

    matcher = f"{args.matcher}_matcher"
    mprefix = option_prefix(args.colmap, matcher, "FeatureMatching", "SiftMatching")
    cmd = [args.colmap, matcher, "--database_path", db, f"--{mprefix}.use_gpu", gpu]
    if args.matcher == "sequential":
        cmd += ["--SequentialMatching.overlap", args.overlap]
        if args.loop_detection:
            # 走回起點時把頭尾接起來；首次會自動下載詞彙樹 (約 70 MB，快取在 ~/.cache/colmap)
            cmd += ["--SequentialMatching.loop_detection", "1"]
    run(cmd)

    # glomap = COLMAP 4.x 內建的 global_mapper：一次解全部相機，比逐張加入的 mapper 快數倍
    mapper = "global_mapper" if args.mapper == "glomap" else "mapper"
    run([args.colmap, mapper, "--database_path", db, "--image_path", frames,
         "--output_path", sparse])

    # mapper 可能產生多個不相連的子模型 (0, 1, ...)，取註冊影像最多的
    models = [d for d in sparse.iterdir() if (d / "images.bin").exists()]
    if not models:
        raise RuntimeError(f"COLMAP {mapper} 沒有重建出任何模型：影像重疊不足或紋理太少")
    best = max(models, key=num_registered_images)
    n_total = len([p for p in frames.iterdir() if p.is_file()])
    print(f"[colmap] 選用模型 {best.name}: 註冊 {num_registered_images(best)}/{n_total} 張影像")

    # 去畸變成 PINHOLE，3DGS 光柵化器假設針孔相機
    project = ws / "project"
    shutil.rmtree(project, ignore_errors=True)
    run([args.colmap, "image_undistorter", "--image_path", frames, "--input_path", best,
         "--output_path", project, "--output_type", "COLMAP"])

    # undistorter 輸出在 project/sparse/*.bin，搬到 OpenSplat 預期的 sparse/0/
    s0 = project / "sparse" / "0"
    s0.mkdir(parents=True, exist_ok=True)
    for f in (project / "sparse").glob("*.bin"):
        f.replace(s0 / f.name)
    return s0


# ---------- points3D.bin 讀寫 ----------

POINT_FMT = "<Q3d3BdQ"  # id, xyz, rgb, error, track_length
POINT_SIZE = struct.calcsize(POINT_FMT)


def read_points3d_bin(path: Path):
    xyz, rgb = [], []
    with open(path, "rb") as f:
        n = struct.unpack("<Q", f.read(8))[0]
        for _ in range(n):
            v = struct.unpack(POINT_FMT, f.read(POINT_SIZE))
            xyz.append(v[1:4])
            rgb.append(v[4:7])
            f.seek(8 * v[8], os.SEEK_CUR)  # 跳過 track (image_id int32, point2D_idx int32)
    return np.asarray(xyz, np.float64), np.asarray(rgb, np.uint8)


def write_points3d_bin(path: Path, xyz: np.ndarray, rgb: np.ndarray):
    """track 寫成空的：3DGS 只用 xyz/rgb 做初始化。
    注意：寫回後此模型不適合再丟回 COLMAP GUI 做 BA（images.bin 仍引用舊點 id）。"""
    with open(path, "wb") as f:
        f.write(struct.pack("<Q", len(xyz)))
        for i, (p, c) in enumerate(zip(xyz, rgb), start=1):
            f.write(struct.pack(POINT_FMT, i, *p, *c, 0.0, 0))


# ---------- Open3D 清理 ----------

def clean_points(xyz, rgb, voxel: float, nb: int, std: float):
    pcd = o3d.geometry.PointCloud()
    pcd.points = o3d.utility.Vector3dVector(xyz)
    pcd.colors = o3d.utility.Vector3dVector(rgb.astype(np.float64) / 255.0)

    if voxel <= 0:
        # 自動：以 2~98 百分位包圍盒對角線的 0.2%，避免極端離群點撐大尺度
        lo, hi = np.percentile(xyz, [2, 98], axis=0)
        voxel = float(np.linalg.norm(hi - lo)) * 0.002
    print(f"[clean] 原始 {len(xyz)} 點，voxel={voxel:.5f}")

    pcd = pcd.voxel_down_sample(voxel)
    print(f"[clean] 體素下採樣後 {len(pcd.points)} 點")

    pcd, _ = pcd.remove_statistical_outlier(nb_neighbors=nb, std_ratio=std)
    print(f"[clean] 離群點剔除後 {len(pcd.points)} 點")

    out_xyz = np.asarray(pcd.points)
    out_rgb = np.clip(np.asarray(pcd.colors) * 255.0 + 0.5, 0, 255).astype(np.uint8)
    return pcd, out_xyz, out_rgb


def main():
    ap = argparse.ArgumentParser(description="COLMAP SfM + Open3D 點雲清理")
    ap.add_argument("frames", type=Path, help="preprocess.py 的輸出資料夾")
    ap.add_argument("-w", "--workspace", type=Path, default=Path("colmap_ws"))
    ap.add_argument("--colmap", default="colmap", help="colmap 執行檔路徑")
    ap.add_argument("--matcher", choices=["exhaustive", "sequential"], default="exhaustive",
                    help="exhaustive 準但 O(n²)；影像 >300 張或影片可用 sequential")
    ap.add_argument("--mapper", choices=["colmap", "glomap"], default="colmap",
                    help="glomap：全域式重建，通常快 3 倍以上 (需 COLMAP 4.x)")
    ap.add_argument("--overlap", type=int, default=10,
                    help="sequential：每張與前後幾張比對 (房間建議 20)")
    ap.add_argument("--loop-detection", action="store_true",
                    help="sequential：啟用迴圈偵測，掃描空間繞一圈時建議開")
    ap.add_argument("--camera-model", default="",
                    help="COLMAP 相機模型，如 OPENCV / SIMPLE_RADIAL (預設由 COLMAP 決定)")
    ap.add_argument("--multi-camera", dest="single_camera", action="store_false",
                    help="照片來自不同相機/變焦時使用（預設所有影像共用一組內參）")
    ap.add_argument("--gpu", action="store_true",
                    help="SIFT 使用 GPU (需 CUDA 版 COLMAP；macOS 請保持關閉)")
    ap.add_argument("--voxel-size", type=float, default=0.0, help="體素大小，0=自動")
    ap.add_argument("--nb-neighbors", type=int, default=20)
    ap.add_argument("--std-ratio", type=float, default=2.0)
    ap.add_argument("--skip-colmap", action="store_true",
                    help="已跑過 COLMAP，只重做點雲清理 (會讀 points_raw 備份)")
    args = ap.parse_args()

    try:
        if not args.frames.is_dir():
            raise FileNotFoundError(f"找不到影像資料夾: {args.frames}")
        ws = args.workspace.resolve()
        ws.mkdir(parents=True, exist_ok=True)
        s0 = ws / "project" / "sparse" / "0"
        raw_bin = ws / "points3D_raw.bin"

        if not args.skip_colmap:
            s0 = run_colmap(args, args.frames.resolve(), ws)
            shutil.copy2(s0 / "points3D.bin", raw_bin)  # 保留原始點雲，方便調參重跑
        elif not raw_bin.exists():
            raise FileNotFoundError(f"--skip-colmap 需要先前的 {raw_bin}")

        xyz, rgb = read_points3d_bin(raw_bin)
        if len(xyz) < 100:
            raise RuntimeError(f"稀疏點雲只有 {len(xyz)} 點，重建品質過差")

        raw = o3d.geometry.PointCloud(o3d.utility.Vector3dVector(xyz))
        raw.colors = o3d.utility.Vector3dVector(rgb / 255.0)
        o3d.io.write_point_cloud(str(ws / "points_raw.ply"), raw)

        pcd, cx, cc = clean_points(xyz, rgb, args.voxel_size, args.nb_neighbors, args.std_ratio)
        o3d.io.write_point_cloud(str(ws / "points_clean.ply"), pcd)
        write_points3d_bin(s0 / "points3D.bin", cx, cc)

        print(f"[done] OpenSplat 專案目錄: {ws / 'project'}")
    except Exception as e:
        print(f"[error] {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
