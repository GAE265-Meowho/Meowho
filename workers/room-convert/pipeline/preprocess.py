#!/usr/bin/env python3
"""Step 1: 影片/照片預處理 —— 抽影格、Laplacian 模糊篩選、統一縮放。

用法:
  python pipeline/preprocess.py input.mp4 -o input_frames --fps 2
  python pipeline/preprocess.py photos_dir/ -o input_frames --blur-threshold 80
"""
import argparse
import shutil
import sys
from pathlib import Path

import cv2
import numpy as np

VIDEO_EXT = {".mp4", ".mov", ".m4v", ".avi", ".mkv"}
IMAGE_EXT = {".jpg", ".jpeg", ".png", ".bmp", ".tif", ".tiff", ".webp"}


def sharpness(img: np.ndarray) -> float:
    """Laplacian 方差：越大越銳利。先縮到固定寬度，讓不同解析度的分數可比較。"""
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY) if img.ndim == 3 else img
    scale = 640 / max(gray.shape[:2])
    if scale < 1:
        gray = cv2.resize(gray, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA)
    return float(cv2.Laplacian(gray, cv2.CV_64F).var())


def resize_long_edge(img: np.ndarray, max_edge: int) -> np.ndarray:
    h, w = img.shape[:2]
    scale = max_edge / max(h, w)
    if scale >= 1:
        return img
    return cv2.resize(img, (round(w * scale), round(h * scale)), interpolation=cv2.INTER_AREA)


def frames_from_video(path: Path, fps: float, min_motion: float):
    """每 1/fps 秒為一個時間窗，窗內挑最銳利的一張（比固定取第 N 幀更不易拿到糊圖）。
    min_motion > 0 時，與上一張已選影格差異過小（相機幾乎沒動）就跳過，避免冗餘。"""
    cap = cv2.VideoCapture(str(path))
    if not cap.isOpened():
        raise RuntimeError(f"無法開啟影片: {path}")
    src_fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    window = max(1, round(src_fps / fps))
    print(f"[video] {path.name}: {src_fps:.1f} fps, 每 {window} 幀取 1 張")

    best, best_score, idx = None, -1.0, 0
    last_thumb = None
    while True:
        ok, frame = cap.read()
        if not ok:
            break
        s = sharpness(frame)
        if s > best_score:
            best, best_score = frame, s
        idx += 1
        if idx % window == 0:
            thumb = cv2.cvtColor(cv2.resize(best, (160, 90)), cv2.COLOR_BGR2GRAY).astype(np.float32)
            moved = last_thumb is None or np.mean(np.abs(thumb - last_thumb)) >= min_motion
            if moved:
                last_thumb = thumb
                yield f"frame_{idx:06d}", best, best_score
            best, best_score = None, -1.0
    if best is not None:
        yield f"frame_{idx:06d}", best, best_score
    cap.release()


def frames_from_folder(path: Path):
    files = sorted(p for p in path.iterdir() if p.suffix.lower() in IMAGE_EXT)
    if not files:
        raise RuntimeError(f"資料夾內沒有圖片: {path}")
    for f in files:
        img = cv2.imread(str(f), cv2.IMREAD_COLOR)
        if img is None:
            print(f"[warn] 無法讀取，略過: {f.name}")
            continue
        yield f.stem, img, sharpness(img)


def main():
    ap = argparse.ArgumentParser(description="影片/照片預處理：抽影格 + 模糊篩選 + 縮放")
    ap.add_argument("input", type=Path, help="影片檔 (.mp4/.mov) 或照片資料夾")
    ap.add_argument("-o", "--output", type=Path, default=Path("input_frames"))
    ap.add_argument("--fps", type=float, default=2.0, help="影片抽影格頻率 (預設 2)")
    ap.add_argument("--blur-threshold", type=float, default=100.0,
                    help="Laplacian 方差絕對門檻，低於此值視為模糊 (預設 100)")
    ap.add_argument("--relative", type=float, default=0.4,
                    help="相對門檻：低於全體中位數 × 此比例也剔除，0 為關閉 (預設 0.4)")
    ap.add_argument("--min-motion", type=float, default=0.0,
                    help="影片：與上一張的平均灰階差 < 此值則略過 (例如 3)，0 為關閉")
    ap.add_argument("--max-edge", type=int, default=1920, help="長邊最大像素 (預設 1920)")
    ap.add_argument("--min-frames", type=int, default=20, help="合格張數低於此值時報錯")
    args = ap.parse_args()

    try:
        src = args.input
        if not src.exists():
            raise FileNotFoundError(f"找不到輸入檔案: {src.resolve()}")
        if src.is_dir():
            gen = frames_from_folder(src)
        elif src.suffix.lower() in VIDEO_EXT:
            gen = frames_from_video(src, args.fps, args.min_motion)
        else:
            raise ValueError(f"不支援的輸入格式: {src.suffix}")

        # 先收集候選（已縮放，控制記憶體），再一次套用絕對 + 相對門檻
        candidates = [(name, resize_long_edge(img, args.max_edge), s) for name, img, s in gen]
        if not candidates:
            raise RuntimeError("沒有取得任何影格")
        scores = np.array([c[2] for c in candidates])
        thr = args.blur_threshold
        if args.relative > 0:
            thr = max(thr, float(np.median(scores)) * args.relative)

        if args.output.exists():
            shutil.rmtree(args.output)
        args.output.mkdir(parents=True)

        kept = 0
        for name, img, s in candidates:
            if s < thr:
                continue
            cv2.imwrite(str(args.output / f"{name}.jpg"), img, [cv2.IMWRITE_JPEG_QUALITY, 95])
            kept += 1

        print(f"[done] 候選 {len(candidates)} 張，門檻 {thr:.1f}，保留 {kept} 張 -> {args.output}/")
        print(f"       銳利度 min/median/max = {scores.min():.0f}/{np.median(scores):.0f}/{scores.max():.0f}")
        if kept < args.min_frames:
            raise RuntimeError(f"合格影像只有 {kept} 張 (< {args.min_frames})，"
                               "請降低 --blur-threshold / --relative 或提高 --fps")
    except Exception as e:
        print(f"[error] {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
