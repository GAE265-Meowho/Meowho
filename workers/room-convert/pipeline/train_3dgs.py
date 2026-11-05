#!/usr/bin/env python3
"""Step 3: 呼叫 OpenSplat 或 Brush 訓練 3DGS，輸出 .splat / .ply 到 rooms/room2/。

用法:
  python train_3dgs.py colmap_ws/project -n 2000 -o rooms/room2/scene.splat
  python train_3dgs.py colmap_ws/project -n 7000 --engine brush     # Mac GPU (WebGPU/Metal)
"""
import argparse
import json
import os
import shutil
import struct
import subprocess
import sys
import time
from pathlib import Path

import numpy as np

SH_C0 = 0.28209479177387814


def find_opensplat(user_path: str) -> str:
    candidates = [user_path, os.environ.get("OPENSPLAT_BIN", ""), "./opensplat",
                  "./OpenSplat/build/opensplat", shutil.which("opensplat") or ""]
    for c in candidates:
        if c and Path(c).is_file() and os.access(c, os.X_OK):
            return str(Path(c).resolve())
    raise FileNotFoundError("找不到 opensplat 執行檔，請用 --opensplat 或環境變數 OPENSPLAT_BIN 指定")


def find_brush(user_path: str) -> str:
    candidates = [user_path, os.environ.get("BRUSH_BIN", ""), "./tools/brush_app", shutil.which("brush_app") or ""]
    for c in candidates:
        if c and Path(c).is_file() and os.access(c, os.X_OK):
            return str(Path(c).resolve())
    raise FileNotFoundError("找不到 brush_app，請放到 tools/ 或用 --brush / BRUSH_BIN 指定")


# ---------- COLMAP 相機 -> cameras.json（Brush 不輸出相機檔，格式比照 OpenSplat） ----------

CAMERA_NUM_PARAMS = {0: 3, 1: 4, 2: 4, 3: 5, 4: 8, 5: 8, 6: 12, 7: 5, 8: 4, 9: 5, 10: 12}


def read_colmap_cameras(path: Path) -> dict:
    cams = {}
    with open(path, "rb") as f:
        for _ in range(struct.unpack("<Q", f.read(8))[0]):
            cid, model, w, h = struct.unpack("<iiQQ", f.read(24))
            params = struct.unpack(f"<{CAMERA_NUM_PARAMS[model]}d", f.read(8 * CAMERA_NUM_PARAMS[model]))
            fx = params[0]
            fy = params[0] if model in (0, 2, 3, 8, 9) else params[1]  # SIMPLE_* 只有一個焦距
            cams[cid] = (w, h, fx, fy)
    return cams


def quat_to_rot(qw, qx, qy, qz):
    return np.array([
        [1 - 2 * (qy * qy + qz * qz), 2 * (qx * qy - qw * qz), 2 * (qx * qz + qw * qy)],
        [2 * (qx * qy + qw * qz), 1 - 2 * (qx * qx + qz * qz), 2 * (qy * qz - qw * qx)],
        [2 * (qx * qz - qw * qy), 2 * (qy * qz + qw * qx), 1 - 2 * (qx * qx + qy * qy)]])


def colmap_cameras_json(sparse: Path, out: Path):
    """images.bin 存 world->cam；轉成 cam->world 的位置與旋轉 (OpenCV 慣例：x 右、y 下、z 前)。"""
    intr = read_colmap_cameras(sparse / "cameras.bin")
    result = []
    with open(sparse / "images.bin", "rb") as f:
        for _ in range(struct.unpack("<Q", f.read(8))[0]):
            iid, qw, qx, qy, qz, tx, ty, tz, cid = struct.unpack("<i7di", f.read(64))
            name = b""
            while (c := f.read(1)) != b"\0":
                name += c
            f.seek(24 * struct.unpack("<Q", f.read(8))[0], os.SEEK_CUR)  # 略過 2D 特徵點
            R = quat_to_rot(qw, qx, qy, qz)
            w, h, fx, fy = intr[cid]
            result.append({"id": iid, "img_name": name.decode(), "width": w, "height": h, "fx": fx, "fy": fy,
                           "position": (-R.T @ np.array([tx, ty, tz])).tolist(), "rotation": R.T.tolist()})
    out.write_text(json.dumps(result))
    print(f"[cameras] {len(result)} 個拍攝點 -> {out.name}")


def run_streaming(cmd: list, cwd: Path):
    """邊印 OpenSplat 輸出邊記下已知錯誤。回傳 (exit code, 是否缺 GPU, 是否數值爆掉)。"""
    print("[opensplat] " + " ".join(cmd), flush=True)
    no_gpu = nan = False
    with subprocess.Popen(cmd, cwd=cwd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                          text=True, bufsize=1) as p:
        for line in p.stdout:
            print(line, end="", flush=True)
            no_gpu |= "GPU support not built" in line
            nan |= "contains either `inf`, `nan`" in line
    return p.returncode, no_gpu, nan


def help_text(binary: str) -> str:
    r = subprocess.run([binary, "--help"], capture_output=True, text=True)
    return r.stdout + r.stderr


# ---------- PLY -> .splat 轉換 ----------

def read_gaussian_ply(path: Path) -> dict:
    with open(path, "rb") as f:
        if f.readline().strip() != b"ply":
            raise ValueError("不是 PLY 檔")
        props, n = [], 0
        while True:
            line = f.readline().decode("ascii").strip()
            if line.startswith("format") and "binary_little_endian" not in line:
                raise ValueError("只支援 binary_little_endian PLY")
            if line.startswith("element vertex"):
                n = int(line.split()[-1])
            elif line.startswith("property"):
                _, typ, name = line.split()
                if typ not in ("float", "float32"):
                    raise ValueError(f"不支援的屬性型別: {typ}")
                props.append(name)
            elif line == "end_header":
                break
        data = np.frombuffer(f.read(n * 4 * len(props)), dtype="<f4").reshape(n, len(props))
    return {name: data[:, i] for i, name in enumerate(props)}


def ply_to_splat(ply: Path, out: Path):
    """antimatter15 .splat 格式：每顆 32 bytes = xyz(3f) scale(3f) rgba(4B) rot(4B)。"""
    v = read_gaussian_ply(ply)
    finite = np.all([np.isfinite(a) for a in v.values()], axis=0)
    if not finite.all():
        print(f"[convert] 警告：略過 {(~finite).sum()} 顆數值異常 (NaN/inf) 的高斯")
        v = {k: a[finite] for k, a in v.items()}
    xyz =np.stack([v["x"], v["y"], v["z"]], 1)
    scale = np.exp(np.stack([v["scale_0"], v["scale_1"], v["scale_2"]], 1))
    alpha = 1 / (1 + np.exp(-v["opacity"]))
    rgb = 0.5 + SH_C0 * np.stack([v["f_dc_0"], v["f_dc_1"], v["f_dc_2"]], 1)
    rot = np.stack([v["rot_0"], v["rot_1"], v["rot_2"], v["rot_3"]], 1)
    rot /= np.linalg.norm(rot, axis=1, keepdims=True) + 1e-12

    order = np.argsort(-scale.prod(1) * alpha)  # 大且不透明的在前，漸進載入較好看
    rec = np.zeros(len(xyz), dtype=[("p", "<f4", 3), ("s", "<f4", 3), ("c", "u1", 4), ("r", "u1", 4)])
    rec["p"] = xyz[order]
    rec["s"] = scale[order]
    rgba = np.concatenate([rgb[order], alpha[order, None]], 1)
    rec["c"] = np.clip(rgba * 255, 0, 255).astype(np.uint8)
    rec["r"] = np.clip(rot[order] * 128 + 128, 0, 255).astype(np.uint8)
    rec.tofile(out)
    print(f"[convert] {ply.name} -> {out.name}: {len(rec)} splats, {out.stat().st_size / 1e6:.1f} MB")


def main():
    ap = argparse.ArgumentParser(description="3DGS 訓練自動化 (OpenSplat / Brush)")
    ap.add_argument("project", type=Path, help="COLMAP 專案目錄 (含 images/ 與 sparse/0/)")
    ap.add_argument("-o", "--output", type=Path, default=Path("rooms/room2/scene.splat"),
                    help="輸出檔，副檔名決定格式：.splat 或 .ply")
    ap.add_argument("-n", "--iters", type=int, default=2000, help="訓練迭代次數 (預設 2000)")
    ap.add_argument("--engine", choices=["opensplat", "brush"], default="opensplat",
                    help="brush：用 Mac GPU 訓練（WebGPU/Metal），不需要 Xcode")
    ap.add_argument("--opensplat", default="", help="opensplat 執行檔路徑")
    ap.add_argument("--brush", default="", help="brush_app 執行檔路徑 (預設 tools/brush_app)")
    ap.add_argument("--downscale", type=float, default=1.0,
                    help="訓練時影像縮小倍率，記憶體不足時設 2")
    ap.add_argument("--cpu", action="store_true", help="強制 CPU 訓練 (很慢，僅測試)")
    ap.add_argument("--no-center", action="store_true",
                    help="不傳 --center，保留 COLMAP 原始座標")
    # 未知參數原樣轉給訓練程式，例如 opensplat 的 --val 或 brush 的 --sh-degree 2
    args, extra = ap.parse_known_args()

    try:
        project = args.project.resolve()
        if not (project / "sparse" / "0" / "cameras.bin").exists():
            raise FileNotFoundError(f"{project} 不是有效的 COLMAP 專案 (缺 sparse/0/cameras.bin)")

        out = args.output.resolve()
        out.parent.mkdir(parents=True, exist_ok=True)
        fmt = out.suffix.lower()
        if fmt not in (".splat", ".ply"):
            raise ValueError("輸出只支援 .splat / .ply（.spz 可用 niantic spz 工具由 .ply 轉換）")

        # 一律先輸出 .ply（保留完整 SH 係數，可再轉其他格式），需要時再轉 .splat
        train_out = out.with_suffix(".ply")
        cams_out = out.with_suffix(".cameras.json")

        t0 = time.time()
        if args.engine == "brush":
            train_brush(args, extra, project, train_out, cams_out)
        else:
            train_opensplat(args, extra, project, train_out, cams_out)
        print(f"[{args.engine}] 訓練完成，耗時 {(time.time() - t0) / 60:.1f} 分鐘")

        if not train_out.exists():
            raise RuntimeError(f"{args.engine} 結束但找不到輸出檔 {train_out}")
        if fmt == ".splat":
            ply_to_splat(train_out, out)
        if cams_out.exists():
            # 地板與可行走區域，給檢視器的貓咪用；失敗不影響模型本身
            try:
                from room_layout import build_layout
                out.with_suffix(".layout.json").write_text(json.dumps(build_layout(train_out, cams_out)))
                print(f"[layout] 已輸出 {out.with_suffix('.layout.json').name}")
            except Exception as e:
                print(f"[layout] 略過地板推算：{e}")
        print(f"[done] 模型: {out}")
    except subprocess.CalledProcessError as e:
        print(f"[error] {args.engine} 失敗 (exit {e.returncode})，請看上方訊息"
              "（若是 'out of memory' / 被系統 Killed 才是記憶體不足，可加 --downscale 2）",
              file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(f"[error] {e}", file=sys.stderr)
        sys.exit(1)


def train_brush(args, extra, project: Path, train_out: Path, cams_out: Path):
    binary = find_brush(args.brush)
    # Brush 保留 COLMAP 原始座標（不中心化），相機檔直接從 COLMAP 讀
    colmap_cameras_json(project / "sparse" / "0", cams_out)
    cmd = [binary, str(project), "--total-steps", str(args.iters), "--export-every", str(args.iters),
           "--export-path", str(train_out.parent), "--export-name", train_out.name]
    if args.downscale != 1.0:
        cmd += ["--max-resolution", str(int(1920 / args.downscale))]
    cmd += [a for a in extra if a != "--"]
    print("[brush] " + " ".join(cmd), flush=True)
    subprocess.run(cmd, check=True, cwd=train_out.parent)


def train_opensplat(args, extra, project: Path, train_out: Path, cams_out: Path):
    binary = find_opensplat(args.opensplat)
    helps = help_text(binary)
    cmd = [binary, str(project), "-n", str(args.iters), "-o", str(train_out)]
    if args.downscale != 1.0:
        cmd += ["-d", str(args.downscale)]
    if args.cpu:
        cmd += ["--cpu"]
    # 把模型移到原點，網頁檢視器的預設視角才看得到；舊版沒有此旗標就略過
    if not args.no_center and "--center" in helps:
        cmd += ["--center"]
    # 預設 refine 每 500 步、只在前半段，2000 次迭代時幾乎不會加密；短訓練改成更頻繁
    if args.iters < 10000 and "--refine-every" in helps:
        auto = {"--refine-every": 100, "--densify-from": min(500, args.iters // 10),
                "--densify-until": int(args.iters * 0.8)}
        for k, v in auto.items():
            if k not in extra:  # 使用者自己傳的優先
                cmd += [k, str(v)]
    # 相機姿態給網頁檢視器用（房間模式從拍攝點出發）
    if "--output-cameras" in helps:
        cmd += ["--output-cameras", str(cams_out)]
    cmd += [a for a in extra if a != "--"]

    code, no_gpu, nan = run_streaming(cmd, train_out.parent)
    if code != 0 and no_gpu and "--cpu" not in cmd:
        print("[opensplat] 此版本沒有 GPU 支援，自動改用 CPU 重跑", flush=True)
        code, _, nan = run_streaming(cmd + ["--cpu"], train_out.parent)
    if code != 0 and nan:
        raise RuntimeError("OpenSplat 在加密 (densify) 時出現 NaN（不是記憶體不足）。"
                           "請確認 OpenSplat/model.cpp 已套用 3dtest patch 並重新 make")
    if code != 0:
        raise subprocess.CalledProcessError(code, cmd)


if __name__ == "__main__":
    main()
