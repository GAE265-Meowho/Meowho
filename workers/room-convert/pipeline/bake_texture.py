#!/usr/bin/env python3
"""把影片投影到家具頂面，烘成網格用的貼圖。在 extract_objects.py --mesh 之後、build_scene.py 之前跑。

  python pipeline/bake_texture.py rooms/room3_c/scene.ply --video videos/房間2.mp4 --names bed

頂面每個點投影回看得到它的影格取色，只用視角最正的幾張取中位數，走過的椅子和人會被濾掉。
貼圖的欄沿物品寬度、列沿物品深度，寫進 cut.json，輸出 objects/<名稱>.top.jpg。
"""
import argparse
import json
from pathlib import Path

import cv2
import numpy as np

from preprocess import frames_from_video


def top_points(o, layout, cols, rows):
    """物品頂面的格點（世界座標），形狀 (rows, cols, 3)。"""
    w, h, d = o["size_m"]
    cx, base, cz = o["floor_pos_m"]
    yaw = o.get("yaw", 0)
    u, v = np.meshgrid((np.arange(cols) + 0.5) / cols - 0.5, (np.arange(rows) + 0.5) / rows - 0.5)
    u, v = u * w, v * d
    x = cx + u * np.cos(yaw) - v * np.sin(yaw)
    z = cz + u * np.sin(yaw) + v * np.cos(yaw)
    y = o.get("surface_y", base + h)
    e1, up, e2, origin = (np.array(layout[k]) for k in ("e1", "up", "e2", "origin"))
    return origin + (x[..., None] * e1 + y * up + z[..., None] * e2) * layout["units_per_meter"]


def project(pts, cam, up, shape, min_cos):
    """把格點投影到一張影格，回傳取樣座標、可用遮罩和視角分數（越大越正）。"""
    R, C = np.array(cam["rotation"]), np.array(cam["position"])
    d = pts - C
    pc = d @ R  # 世界 → 相機
    z = pc[..., 2]
    h, w = shape
    with np.errstate(all="ignore"):
        mx = cam["fx"] * pc[..., 0] / z + cam["width"] / 2 + (w - cam["width"]) / 2
        my = cam["fy"] * pc[..., 1] / z + cam["height"] / 2 + (h - cam["height"]) / 2
    score = -(d @ up) / np.linalg.norm(d, axis=2)
    ok = (z > 0) & (mx >= 1) & (mx < w - 1) & (my >= 1) & (my < h - 1) & (score > min_cos)
    return mx.astype(np.float32), my.astype(np.float32), ok, score


def bake(pts, cams, frames, up, keep, min_cos):
    """每個貼圖點取視角最正的 keep 張的中位色。"""
    colors, scores = [], []
    for stem, img in frames:
        cam = cams.get(f"{stem}.jpg")
        if cam is None:
            continue
        mx, my, ok, score = project(pts, cam, up, img.shape[:2], min_cos)
        if ok.mean() < 0.02:
            continue
        colors.append(cv2.remap(img, mx, my, cv2.INTER_LINEAR))
        scores.append(np.where(ok, score, -1))
    colors, scores = np.stack(colors).astype(np.float32), np.stack(scores)
    print(f"[bake] 用了 {len(colors)} 張影格")
    order = np.argsort(-scores, axis=0)[:keep]
    picked = np.take_along_axis(colors, order[..., None], 0)
    valid = np.take_along_axis(scores, order, 0) > 0
    picked[~valid] = np.nan
    return np.nan_to_num(np.nanmedian(picked, 0)).astype(np.uint8), valid.any(0).mean()


def main():
    ap = argparse.ArgumentParser(description="把影片投影成家具頂面貼圖")
    ap.add_argument("ply", type=Path, help="房間 scene.ply")
    ap.add_argument("--video", type=Path, required=True, help="拍這個房間的影片")
    ap.add_argument("--names", nargs="+", required=True, help="要烘貼圖的家具")
    ap.add_argument("--fps", type=float, default=3, help="重建時的抽影格頻率，影格編號才對得上相機")
    ap.add_argument("--keep", type=int, default=12, help="每個點用視角最正的幾張")
    ap.add_argument("--min-cos", type=float, default=0.3, help="視線和頂面法向量的最小 cos，太斜的不用")
    ap.add_argument("--texels-per-meter", type=float, default=380)
    args = ap.parse_args()

    root = args.ply.parent
    out = root / "objects"
    layout = json.loads(args.ply.with_suffix(".layout.json").read_text())
    cams = {c["img_name"]: c for c in json.loads(args.ply.with_suffix(".cameras.json").read_text())}
    objects = {o["name"]: o for o in json.loads((out / "objects.json").read_text())}
    cut = json.loads((out / "cut.json").read_text())
    up = np.array(layout["up"])

    frames = [(stem, img) for stem, img, _ in frames_from_video(args.video, args.fps, 0.0) if f"{stem}.jpg" in cams]
    for m in cut.get("meshes", []):
        name = m["name"]
        if name not in args.names:
            continue
        o = objects[name]
        cols, rows = (round(o["size_m"][i] * args.texels_per_meter) for i in (0, 2))
        tex, cover = bake(top_points(o, layout, cols, rows), cams, frames, up, args.keep, args.min_cos)
        cv2.imwrite(str(out / f"{name}.top.jpg"), tex, [cv2.IMWRITE_JPEG_QUALITY, 88])
        m["texture"] = f"objects/{name}.top.jpg"
        print(f"[bake] {name}: {cols}×{rows}，覆蓋 {cover:.0%}")
    (out / "cut.json").write_text(json.dumps(cut, indent=2))


if __name__ == "__main__":
    main()
