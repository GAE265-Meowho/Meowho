#!/usr/bin/env python3
"""從 3DGS 模型 + 相機姿態推算房間的地板與可行走區域，給檢視器裡的貓咪用。

輸出 <model>.layout.json：
  up / e1 / e2      上方向與地板平面的兩個軸（模型座標）
  origin            網格 (0,0) 角落在地板上的 3D 位置
  cell, nx, ny      網格大小（模型單位）
  walkable          長度 nx*ny 的 "0/1" 字串，row-major (j*nx + i)
  units_per_meter   公尺換算：假設手持拍攝高度約 1.4 m

用法:
  python pipeline/room_layout.py rooms/room2/scene.ply
"""
import argparse
import json
import sys
from collections import deque
from pathlib import Path

import numpy as np

from train_3dgs import read_gaussian_ply

CAMERA_HEIGHT_M = 1.4   # 手持拍攝時相機離地的典型高度
CELL_M = 0.1            # 網格解析度
CAT_HEIGHT_M = (0.05, 0.45)  # 這個高度區間內有東西就算障礙物
COVER_HEIGHT_M = (0.45, 1.3)  # 這個高度有東西（桌面）＝貓走得過去，但從站姿看不到


def load_cameras(path: Path):
    cams = json.loads(path.read_text())
    pos = np.array([c["position"] for c in cams], np.float64)
    rot = np.array([c["rotation"] for c in cams], np.float64)
    up = -rot[:, :, 1].mean(0)   # OpenCV 慣例 y 朝下，取反再平均 ≈ 重力反方向
    return pos, up / np.linalg.norm(up)


def plane_axes(up):
    a = np.array([1.0, 0, 0]) if abs(up[0]) < 0.9 else np.array([0, 0, 1.0])
    e1 = np.cross(up, a)
    e1 /= np.linalg.norm(e1)
    e2 = np.cross(e1, up)  # (e1, up, e2) 右手系，對應 three.js 的 (x, y, z)
    return e1, e2


def fit_plane(pts):
    c = pts.mean(0)
    n = np.linalg.svd(pts - c, full_matrices=False)[2][2]
    return n / np.linalg.norm(n), c


def find_floor(xyz, w, cam_pos, up_prior, min_ratio=0.08, seed=0):
    """RANSAC 找相機下方的水平面，取「夠大的面」中最低的那個當地板，並用它的法向量當真正的上方向。
    - 不能直接取最大的面：辦公室裡桌面常常比露出來的地板還多。
    - 不能只看平均相機的上方向：拍攝時習慣往下俯拍，只朝一個方向拍時偏差不會抵消，地板會是斜的。"""
    h = (xyz * up_prior).sum(1)
    cam_h = (cam_pos * up_prior).sum(1)
    below = h < cam_h.min()
    if below.sum() < 50:
        raise RuntimeError("相機下方幾乎沒有點，可能沒拍到地板")
    pts, wts = xyz[below], w[below]
    lo, hi = np.percentile((pts * up_prior).sum(1), [5, 95])
    tol = 0.015 * (hi - lo)
    rng = np.random.default_rng(seed)

    planes, remaining = [], np.ones(len(pts), bool)
    for _ in range(8):
        idx = np.nonzero(remaining)[0]
        if len(idx) < 50:
            break
        best, best_score = None, 0.0
        for _ in range(2000):
            a, b, c = pts[rng.choice(idx, 3, replace=False)]
            n = np.cross(b - a, c - a)
            if np.linalg.norm(n) < 1e-12:
                continue
            n /= np.linalg.norm(n)
            if n @ up_prior < 0:
                n = -n
            if n @ up_prior < np.cos(np.radians(30)):  # 只要接近水平的面，排除牆
                continue
            inl = np.abs(((pts[idx] - a) * n).sum(1)) < tol
            score = wts[idx][inl].sum()
            if score > best_score:
                best, best_score = (n, a), score
        if best is None:
            break
        n, c = best
        for _ in range(3):  # 用內點重新擬合幾次，讓法向量穩定下來
            inl = idx[np.abs(((pts[idx] - c) * n).sum(1)) < tol]
            n, c = fit_plane(pts[inl])
            if n @ up_prior < 0:
                n = -n
        planes.append((n, float(n @ c), best_score))
        remaining[inl] = False

    if not planes:
        raise RuntimeError("找不到水平面")
    top = max(p[2] for p in planes)
    strong = [p for p in planes if p[2] >= min_ratio * top]
    depth = lambda p: np.median((cam_pos * p[0]).sum(1)) - p[1]  # 面在相機下方多深
    floor = max(strong, key=depth)
    if len(strong) > 1:
        print("[layout] 水平面候選（離相機深度比例，1.00=地板）: " +
              ", ".join(f"{depth(p) / depth(floor):.2f}" for p in sorted(strong, key=depth, reverse=True)))
    tilt = np.degrees(np.arccos(np.clip(floor[0] @ up_prior, -1, 1)))
    print(f"[layout] 地板相對相機平均上方向傾斜 {tilt:.1f}°，已修正")
    return floor[0], floor[1]


def dilate(mask, r):
    for _ in range(r):
        m = mask.copy()
        m[1:] |= mask[:-1]; m[:-1] |= mask[1:]
        m[:, 1:] |= mask[:, :-1]; m[:, :-1] |= mask[:, 1:]
        mask = m
    return mask


def erode(mask, r):
    return ~dilate(~mask, r)


def largest_component(mask):
    ny, nx = mask.shape
    label = np.zeros_like(mask, dtype=np.int32)
    best, best_size, cur = 0, 0, 0
    for j0, i0 in zip(*np.nonzero(mask)):
        if label[j0, i0]:
            continue
        cur += 1
        size, q = 0, deque([(j0, i0)])
        label[j0, i0] = cur
        while q:
            j, i = q.popleft()
            size += 1
            for dj, di in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                y, x = j + dj, i + di
                if 0 <= y < ny and 0 <= x < nx and mask[y, x] and not label[y, x]:
                    label[y, x] = cur
                    q.append((y, x))
        if size > best_size:
            best, best_size = cur, size
    return label == best


def build_layout(ply: Path, cams_json: Path) -> dict:
    cam_pos, up = load_cameras(cams_json)

    v = read_gaussian_ply(ply)
    xyz = np.stack([v["x"], v["y"], v["z"]], 1).astype(np.float64)
    alpha = 1 / (1 + np.exp(-v["opacity"].astype(np.float64)))
    ok = np.isfinite(xyz).all(1) & (alpha > 0.3)
    xyz, alpha = xyz[ok], alpha[ok]

    up, floor = find_floor(xyz, alpha, cam_pos, up)
    e1, e2 = plane_axes(up)
    h, u, w = ((xyz * a).sum(1) for a in (up, e1, e2))  # 避開 macOS Accelerate matmul 的假警告
    cam_h = (cam_pos * up).sum(1)
    upm = (np.median(cam_h) - floor) / CAMERA_HEIGHT_M
    if upm <= 0:
        raise RuntimeError("推算出的地板在相機上方，上方向可能錯誤")

    # 網格範圍：地板附近的點 + 相機走過的位置
    near_floor = np.abs(h - floor) < 0.05 * upm
    cu, cw = (cam_pos * e1).sum(1), (cam_pos * e2).sum(1)
    pu = np.concatenate([np.percentile(u[near_floor], [1, 99]), [cu.min(), cu.max()]])
    pw = np.concatenate([np.percentile(w[near_floor], [1, 99]), [cw.min(), cw.max()]])
    cell = CELL_M * upm
    u0, w0 = pu.min() - cell, pw.min() - cell
    nx = int(min(300, np.ceil((pu.max() - u0) / cell) + 2))
    ny = int(min(300, np.ceil((pw.max() - w0) / cell) + 2))

    def to_cell(uu, ww):
        i = np.clip(((uu - u0) / cell).astype(int), 0, nx - 1)
        j = np.clip(((ww - w0) / cell).astype(int), 0, ny - 1)
        return j, i

    support = np.zeros((ny, nx), np.float64)
    np.add.at(support, to_cell(u[near_floor], w[near_floor]), alpha[near_floor])

    lo, hi = (floor + m * upm for m in CAT_HEIGHT_M)
    body = (h > lo) & (h < hi)
    blocked = np.zeros((ny, nx), np.float64)
    np.add.at(blocked, to_cell(u[body], w[body]), alpha[body])

    # 閉運算補洞：地板常有反光、沒紋理或被桌子擋住的區塊
    walk = erode(dilate(support > 0, 2), 1)
    walk[to_cell(cu, cw)] = True          # 人走過的地方一定是空的
    clo, chi = (floor + m * upm for m in COVER_HEIGHT_M)
    above = (h > clo) & (h < chi)
    covered = np.zeros((ny, nx), np.float64)
    np.add.at(covered, to_cell(u[above], w[above]), alpha[above])

    # 每格東西的頂端高度（公分），給檢視器判斷視線會不會被桌子擋住；單一點的噪點不算
    band = (h > lo) & (h < chi)
    j_b, i_b = to_cell(u[band], w[band])
    hm = ((h[band] - floor) / upm * 100).astype(np.int32)
    order = np.lexsort((hm, j_b * nx + i_b))
    top = np.zeros((ny, nx), np.int32)
    cid = (j_b * nx + i_b)[order]
    hs = hm[order]
    second = np.r_[cid[1:] == cid[:-1], False]   # 同一格裡次高的點，排除最高的那個噪點
    np.maximum.at(top.ravel(), cid[:-1][second[:-1]], hs[:-1][second[:-1]])

    obstacle = blocked >= 2.0
    # 孤立的單格障礙多半是貼地的漂浮噪點，真的桌腳/牆會連成一片
    neighbors = np.zeros_like(obstacle, dtype=int)
    for dj, di in ((1, 0), (-1, 0), (0, 1), (0, -1), (1, 1), (1, -1), (-1, 1), (-1, -1)):
        neighbors += np.roll(np.roll(obstacle, dj, 0), di, 1)
    walk &= ~(obstacle & (neighbors > 0))
    walk = largest_component(walk)

    return {
        "up": up.tolist(), "e1": e1.tolist(), "e2": e2.tolist(),
        "origin": (up * floor + e1 * u0 + e2 * w0).tolist(),
        "cell": cell, "nx": nx, "ny": ny,
        "walkable": "".join("1" if b else "0" for b in walk.ravel()),
        "top_cm": top.ravel().tolist(),
        "open": "".join("1" if b else "0" for b in (walk & (covered < 2.0)).ravel()),  # 上方沒有桌子
        "units_per_meter": upm,
    }


def main():
    ap = argparse.ArgumentParser(description="推算房間地板與可行走區域")
    ap.add_argument("ply", type=Path, help="OpenSplat 輸出的 .ply")
    ap.add_argument("--cameras", type=Path, help="預設為同名 .cameras.json")
    ap.add_argument("-o", "--output", type=Path, help="預設為同名 .layout.json")
    args = ap.parse_args()
    try:
        cams = args.cameras or args.ply.with_suffix(".cameras.json")
        out = args.output or args.ply.with_suffix(".layout.json")
        layout = build_layout(args.ply, cams)
        out.write_text(json.dumps(layout))
        n = layout["walkable"].count("1")
        print(f"[layout] 1 m = {layout['units_per_meter']:.3f} 單位，網格 {layout['nx']}x{layout['ny']}，"
              f"可走 {n} 格 ({n * 0.01:.1f} m²) -> {out}")
    except Exception as e:
        print(f"[error] {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
