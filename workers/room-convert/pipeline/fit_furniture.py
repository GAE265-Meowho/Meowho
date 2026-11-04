#!/usr/bin/env python3
"""把大型家具的外框修成貼地、帶旋轉角度和表面高度，寫回 objects.json。

  python pipeline/fit_furniture.py rooms/room2/scene.ply --solid bed --surface desk:cup

--solid 名稱       用切好的 <名稱>.ply 算外框，再依高度圖拆成底座和凸起的幾塊（parts），
                    底座高度是貓跳上去的表面
--surface 名稱:物品 桌面常被雜物蓋住、切不完整，改從「放在上面的物品」的底部高度
                    找房間裡平躺的高斯，取最大的一片當桌面
"""
import argparse
import json
from pathlib import Path

import cv2
import numpy as np
import open3d as o3d

from train_3dgs import read_gaussian_ply


def rotations(v):
    """每顆高斯最扁那一軸的方向（平躺的高斯這軸朝上）。"""
    w, x, y, z = (v[f"rot_{i}"].astype(np.float64) for i in range(4))
    norm = np.sqrt(w * w + x * x + y * y + z * z) + 1e-12
    w, x, y, z = w / norm, x / norm, y / norm, z / norm
    cols = np.stack([
        np.stack([1 - 2 * (y * y + z * z), 2 * (x * y + w * z), 2 * (x * z - w * y)], 1),
        np.stack([2 * (x * y - w * z), 1 - 2 * (x * x + z * z), 2 * (y * z + w * x)], 1),
        np.stack([2 * (x * z + w * y), 2 * (y * z - w * x), 1 - 2 * (x * x + y * y)], 1),
    ], 1)
    thin = np.stack([v["scale_0"], v["scale_1"], v["scale_2"]], 1).argmin(1)
    return cols[np.arange(len(thin)), thin]


def to_floor(v, layout):
    axes = np.array([layout["e1"], layout["up"], layout["e2"]])
    xyz = np.stack([v["x"], v["y"], v["z"]], 1).astype(np.float64)
    with np.errstate(all="ignore"):
        return (xyz - np.asarray(layout["origin"])) @ axes.T / layout["units_per_meter"], axes


def fit_rect(q):
    """地板座標 (N,3) 的最小外接矩形：中心 x,z、寬、深、yaw（弧度，-45°~45°，寬的方向是 (cos,sin)）。"""
    (cx, cz), (w, d), deg = cv2.minAreaRect(q[:, [0, 2]].astype(np.float32))
    while deg > 45:
        deg -= 90; w, d = d, w
    while deg <= -45:
        deg += 90; w, d = d, w
    return cx, cz, w, d, np.radians(deg)


def trim_sparse(q, cell=0.05, keep=0.15):
    """切掉邊緣點很稀疏的部分：相連的層板只有零星幾顆點，桌面每格有幾十顆。"""
    _, _, _, _, yaw = fit_rect(q)
    p = q[:, [0, 2]]
    uv = np.stack([p @ [np.cos(yaw), np.sin(yaw)], p @ [-np.sin(yaw), np.cos(yaw)]], 1)
    ok = np.ones(len(q), bool)
    for a in uv.T:
        bins = ((a - a.min()) / cell).astype(int)
        count = np.bincount(bins)
        dense = np.nonzero(count >= np.median(count[count > 0]) * keep)[0]
        ok &= (bins >= dense[0]) & (bins <= dense[-1])
    return q[ok]


def largest_rect(mask):
    """布林格子裡全是 True 的最大矩形 (i0, i1, j0, j1)，含頭不含尾；格子很小，直接用前綴和窮舉。"""
    s = np.pad(mask.astype(int), ((1, 0), (1, 0))).cumsum(0).cumsum(1)
    best, area = None, 0
    n, m = mask.shape
    for i0 in range(n):
        for i1 in range(i0 + 1, n + 1):
            for j0 in range(m):
                for j1 in range(j0 + 1, m + 1):
                    a = (i1 - i0) * (j1 - j0)
                    if a > area and s[i1, j1] - s[i0, j1] - s[i1, j0] + s[i0, j0] == a:
                        best, area = (i0, i1, j0, j1), a
    return best, area


def layers(q, rise=0.12, cell=0.1, min_cells=4, max_parts=4):
    """分層碰撞方塊：依高度圖把家具切成底座和凸起的幾塊（床墊和棉被堆、沙發坐墊和扶手、靠背）。
    每格取 90 百分位當高度，比底座高出 rise 公尺的格子再拆成矩形。
    回傳 [(cx, cz, w, d, top)]，第一塊是底座；都從地板算起，和整體外框同一個 yaw。"""
    cx, cz, w, d, yaw = fit_rect(q)
    c, s = np.cos(yaw), np.sin(yaw)
    p = q[:, [0, 2]] - [cx, cz]
    nu, nv = max(int(np.ceil(w / cell)), 1), max(int(np.ceil(d / cell)), 1)
    iu = np.clip(((p[:, 0] * c + p[:, 1] * s + w / 2) / cell).astype(int), 0, nu - 1)
    iv = np.clip(((p[:, 1] * c - p[:, 0] * s + d / 2) / cell).astype(int), 0, nv - 1)
    flat = iu * nv + iv
    count = np.bincount(flat, minlength=nu * nv)
    enough = count >= max(5, np.median(count[count > 0]) * 0.2)  # 邊緣只有零星雜點的格子不算
    tops = np.full(nu * nv, np.nan)
    order = np.argsort(flat)
    keys, starts = np.unique(flat[order], return_index=True)
    for k, ys in zip(keys, np.split(q[order, 1], starts[1:])):
        if enough[k]:
            tops[k] = np.percentile(ys, 90)
    tops = tops.reshape(nu, nv)
    base = float(np.nanpercentile(tops, 30))
    parts = [(cx, cz, w, d, base)]
    raised = np.nan_to_num(tops, nan=-1) > base + rise
    while len(parts) < max_parts:
        rect, area = largest_rect(raised)
        if area < min_cells:
            break
        i0, i1, j0, j1 = rect
        u, v = (i0 + i1) / 2 * cell - w / 2, (j0 + j1) / 2 * cell - d / 2
        parts.append((cx + u * c - v * s, cz + u * s + v * c, (i1 - i0) * cell, (j1 - j0) * cell,
                      float(np.median(tops[i0:i1, j0:j1]))))
        raised[i0:i1, j0:j1] = False
    return parts, yaw


def update(o, q, top, parts=None):
    cx, cz, w, d, yaw = fit_rect(q)
    if parts:
        top = parts[0][4]
        o["parts"] = [{"center": [round(x, 3), round(z, 3)], "size": [round(pw, 3), round(pd, 3)], "top": round(t, 3)}
                      for x, z, pw, pd, t in parts]
    o["floor_pos_m"] = [round(cx, 3), 0.0, round(cz, 3)]  # 家具貼地，外框算到地板
    # 外框只到底座：還沒讀 parts 的檢視器（Meowho 後台）照舊用外框，不會把棉被堆算成整張床的高度
    o["size_m"] = [round(w, 3), round(top, 3), round(d, 3)]
    o["yaw"] = round(float(yaw), 4)
    o["surface_y"] = round(float(top), 3)
    print(f"[fit] {o['name']}: 中心 ({cx:.2f}, {cz:.2f}) 尺寸 {w:.2f} × {d:.2f} m，表面 {top:.2f} m，"
          f"旋轉 {np.degrees(yaw):.1f}°，{len(q)} 顆高斯")
    for x, z, pw, pd, t in (parts or [])[1:]:
        print(f"[fit]   凸起 ({x:.2f}, {z:.2f}) {pw:.2f} × {pd:.2f} m，高 {t:.2f} m")


def main():
    ap = argparse.ArgumentParser(description="修正大型家具外框")
    ap.add_argument("ply", type=Path, help="房間 scene.ply")
    ap.add_argument("--solid", nargs="*", default=[])
    ap.add_argument("--surface", nargs="*", default=[], help="名稱:放在上面的物品")
    ap.add_argument("--band", type=float, default=0.05, help="表面高度的容許範圍（公尺）")
    ap.add_argument("--reach", type=float, default=1.6, help="從物品往外找多遠（公尺）")
    args = ap.parse_args()

    out = args.ply.parent / "objects"
    layout = json.loads(args.ply.with_suffix(".layout.json").read_text())
    objects = json.loads((out / "objects.json").read_text())
    by_name = {o["name"]: o for o in objects}

    for name in args.solid:
        if name not in by_name:  # 這個房間沒拍到或沒切到，略過
            print(f"[fit] 沒有 {name}，略過")
            continue
        q, _ = to_floor(read_gaussian_ply(out / f"{name}.ply"), layout)
        q = q[np.isfinite(q).all(1)]
        parts, _ = layers(q)
        update(by_name[name], q, float(np.median(q[:, 1])), parts)

    if args.surface:
        v = read_gaussian_ply(args.ply)
        q, axes = to_floor(v, layout)
        flat = np.abs(rotations(v) @ axes[1]) > 0.8
        for spec in args.surface:
            name, on = spec.split(":")
            if on not in by_name:
                print(f"[fit] 沒有 {on}，找不到 {name} 的桌面，略過")
                continue
            anchor = by_name[on]["floor_pos_m"]
            top = anchor[1]
            m = (np.isfinite(q).all(1) & flat & (np.abs(q[:, 1] - top) < args.band)
                 & (np.hypot(q[:, 0] - anchor[0], q[:, 2] - anchor[2]) < args.reach))
            pts = q[m]
            pcd = o3d.geometry.PointCloud(o3d.utility.Vector3dVector(pts * [1, 0, 1]))
            lab = np.asarray(pcd.cluster_dbscan(eps=0.05, min_points=8))
            if not (lab >= 0).any():
                print(f"[fit] {name}: 找不到平面，略過")
                continue
            if name not in by_name:  # 桌面是用平面找的，AI 沒切到桌子也能補上
                by_name[name] = {"name": name, "prompt": f"surface under {on}", "count": 0}
                objects.append(by_name[name])
            update(by_name[name], trim_sparse(pts[lab == np.bincount(lab[lab >= 0]).argmax()]), top)

    (out / "objects.json").write_text(json.dumps(objects, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()
