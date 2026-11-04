#!/usr/bin/env python3
"""把切好的物品從房間 splat 拿掉，另存成能單獨移動的 splat。

  python pipeline/extract_objects.py rooms/room2/scene.ply --names cup
  python pipeline/extract_objects.py rooms/room3_c/scene.ply --names cup --mesh bed

--mesh 名稱  換成模型庫網格的家具：挖掉外框內的高斯，不另存 splat

輸出在 <模型資料夾>/objects/：
  room_cut.splat      房間（已拿掉物品）
  <名稱>.movable.splat 以物品底部中心為原點的物品，檢視器才能繞它旋轉
  cut.json            build_scene.py 讀取，合進 scene.json
"""
import argparse
import json
from pathlib import Path

import numpy as np

from build_scene import AFFORDANCES, label_of
from segment_objects import write_ply
from train_3dgs import read_gaussian_ply, ply_to_splat

REC = [("p", "<f4", 3), ("s", "<f4", 3), ("c", "u1", 4), ("r", "u1", 4)]


def near(xyz, pts, r):
    """xyz 裡距離 pts 任一點小於 r 的布林遮罩（先用外框縮小範圍，物品點數少可直接算）。"""
    mask = np.zeros(len(xyz), bool)
    idx = np.flatnonzero(np.all((xyz > pts.min(0) - r) & (xyz < pts.max(0) + r), axis=1))
    if len(idx):
        d = np.linalg.norm(xyz[idx, None] - pts[None], axis=2).min(1)
        mask[idx[d < r]] = True
    return mask


def in_box(xyz, o, layout, side, top):
    """xyz 裡落在物品外框內的布林遮罩，外框四周放寬 side、頂端放寬 top（公尺），地板留著。"""
    axes = np.array([layout["e1"], layout["up"], layout["e2"]])
    with np.errstate(all="ignore"):  # scene.ply 可能有 NaN 的高斯，比較結果為 False
        q = (xyz - np.asarray(layout["origin"])) @ axes.T / layout["units_per_meter"]
        x, z = q[:, 0] - o["floor_pos_m"][0], q[:, 2] - o["floor_pos_m"][2]
        yaw = o.get("yaw", 0)
        u, v = x * np.cos(yaw) + z * np.sin(yaw), -x * np.sin(yaw) + z * np.cos(yaw)
        w, h, d = o["size_m"]
        base = o["floor_pos_m"][1]
        return (abs(u) < w / 2 + side) & (abs(v) < d / 2 + side) & (q[:, 1] > base + 0.02) & (q[:, 1] < base + h + top)


def median_color(ply):
    """物品高斯的中位顏色，讓網格的主色接近實物。切割混到背景時會失準，改用 --color 指定。"""
    v = read_gaussian_ply(ply)
    rgb = np.clip(0.5 + 0.28209 * np.stack([v[f"f_dc_{i}"] for i in range(3)], 1), 0, 1)
    return "#" + "".join(f"{round(c * 255):02x}" for c in np.nanmedian(rgb, 0))


def main():
    ap = argparse.ArgumentParser(description="從房間拿掉物品，另存成可移動的 splat")
    ap.add_argument("ply", type=Path, help="房間 scene.ply")
    ap.add_argument("--names", nargs="+", help="objects.json 裡的物品名稱")
    ap.add_argument("--auto", action="store_true", help="自動挑對照表裡會動的物品（杯子、鞋子）")
    ap.add_argument("--max-size", type=float, default=0.4, help="--auto 時略過超過這個長度的（公尺），通常是幾個黏在一起")
    ap.add_argument("--radius", type=float, default=0.015, help="物品周圍一併拿掉的範圍（公尺）")
    ap.add_argument("--mesh", nargs="+", default=[], help="換成網格的家具名稱")
    ap.add_argument("--color", action="append", default=[], metavar="名稱=#RRGGBB", help="指定網格的固定顏色，不用自動取色")
    ap.add_argument("--mesh-side", type=float, default=0.04, help="--mesh 外框四周多挖的範圍（公尺）")
    ap.add_argument("--mesh-top", type=float, default=0.08, help="--mesh 外框頂端多挖的範圍（公尺）")
    args = ap.parse_args()

    root = args.ply.parent
    out = root / "objects"
    layout = json.loads(args.ply.with_suffix(".layout.json").read_text())
    upm = layout["units_per_meter"]
    e1, up, e2, origin = (np.array(layout[k]) for k in ("e1", "up", "e2", "origin"))
    objects = {o["name"]: o for o in json.loads((out / "objects.json").read_text())}
    if args.auto:
        args.names = [n for n, o in objects.items() if label_of(n) in ("cup", "shoe")
                      and AFFORDANCES[label_of(n)][1]["body"] == "dynamic" and max(o["size_m"]) <= args.max_size]
        print(f"[extract] 自動挑選: {args.names}")
    if not args.names and not args.mesh:
        (out / "cut.json").write_text(json.dumps({"objects": []}))
        print("[extract] 沒有可拆的物品")
        return

    v = read_gaussian_ply(args.ply)
    xyz = np.stack([v["x"], v["y"], v["z"]], 1)
    remove = np.zeros(len(xyz), bool)
    entries = []
    for name in args.names or []:
        o = objects[name]
        pts = (lambda c: np.stack([c["x"], c["y"], c["z"]], 1))(read_gaussian_ply(out / f"{name}.ply"))
        hit = near(xyz, pts, args.radius * upm)
        # 底部以下是桌面或地板，留著
        base = o["floor_pos_m"][1] * upm
        with np.errstate(all="ignore"):  # scene.ply 可能有 NaN 的高斯，比較結果為 False，轉 splat 時會濾掉
            hit &= (xyz - origin) @ up > base + 0.005 * upm
        remove |= hit
        print(f"[extract] {name}: 物品 {len(pts)} 顆，從房間拿掉 {hit.sum()} 顆")

        x, y, z = (a * upm for a in o["floor_pos_m"])
        pivot = origin + e1 * x + up * y + e2 * z
        ply_to_splat(out / f"{name}.ply", out / f"{name}.movable.splat")
        rec = np.fromfile(out / f"{name}.movable.splat", dtype=REC)
        rec["p"] -= pivot.astype("<f4")
        rec.tofile(out / f"{name}.movable.splat")
        entries.append({"name": name, "file": f"{name}.movable.splat", "pivot": pivot.tolist()})

    meshes = []
    colors = dict(s.split("=") for s in args.color)
    for name in args.mesh:
        hit = in_box(xyz, objects[name], layout, args.mesh_side, args.mesh_top)
        remove |= hit
        print(f"[extract] {name}: 換成網格，從房間拿掉 {hit.sum()} 顆")
        meshes.append({"name": name, "color": colors.get(name) or median_color(out / f"{name}.ply")})

    write_ply(out / "room_cut.ply", v, ~remove)
    ply_to_splat(out / "room_cut.ply", out / "room_cut.splat")
    (out / "room_cut.ply").unlink()
    (out / "cut.json").write_text(json.dumps({"room": "room_cut.splat", "objects": entries, "meshes": meshes}, indent=2))


if __name__ == "__main__":
    main()
