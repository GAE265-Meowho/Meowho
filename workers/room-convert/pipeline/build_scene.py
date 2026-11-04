#!/usr/bin/env python3
"""把 layout / objects / cut 合成一份 scene.json，檢視器和貓只讀這份。

  python pipeline/build_scene.py rooms/room2/scene.ply

box 用地板座標（公尺）：x 沿 e1、y 朝上、z 沿 e2，frame 記錄怎麼換回 splat 的世界座標。
"""
import argparse
import json
import re
from pathlib import Path

import numpy as np
import open3d as o3d

from catalog import AFFORDANCES, CATALOG, dynamic, fixed
from plan_objects import load_plan
from train_3dgs import read_gaussian_ply

NOTHING = {"jump_on": False, "hide_under": False, "push": False, "play": False}


# 互動屬性和物理都在 catalog.py 的物品目錄調，不呼叫 AI。目錄沒有的標籤用 objects_plan.json 估的值，再沒有才當成固定物。
ALIASES = {"shoes": "shoe"}
# 模型庫：size 是對齊外框用的基準尺寸（床取到床墊頂面，貓才站得剛好），hide 是實物沒有的零件
# 床面積大才烘貼圖，杯子、垃圾桶這類小物只用單色
MESHES = {
    "bed": {"file": "assets/furniture/bed_single_nora_v01/bed_single_nora_v01.glb", "size": [1.0, 0.43, 2.0], "hide": ["Headboard"]},
    "cup": {"file": "assets/furniture/cup_plain_nora_v01/cup_plain_nora_v01.glb", "size": [0.08, 0.11, 0.08], "hide": [], "round": True},
    "trash_can": {"file": "assets/furniture/trash_can_round_nora_v01/trash_can_round_nora_v01.glb", "size": [0.25, 0.30, 0.25], "hide": [], "round": True},
}


def label_of(name):
    """shoes_2 → shoe"""
    base = re.sub(r"_\d+$", "", name)
    return ALIASES.get(base, base)


def affordance_of(label, plan):
    """對照表的數值是調過的，優先用；新標籤用 plan_objects.py 估的材質、重量和互動。"""
    if label in AFFORDANCES:
        return AFFORDANCES[label]
    for o in (plan or {}).get("objects", []):
        if label_of(o["name"]) == label:
            if o["kind"] == "movable":
                return {"push": True}, dynamic(o["mass_kg"], o["material"])
            return {"jump_on": o["jump_on"], "hide_under": o["hide_under"]}, fixed(o["material"])
    for s in (plan or {}).get("surfaces", []):
        if label_of(s["name"]) == label:
            return {"jump_on": True, "hide_under": s["hide_under"]}, fixed(s["material"])
    return {}, fixed("plastic")


def name_zh(label, plan):
    """目錄的中文名稱，沒有就用 AI 補充物品給的；都沒有時檢視器會顯示英文標籤。"""
    if label in CATALOG:
        return CATALOG[label]["zh"]
    return next((o.get("name_zh") for o in (plan or {}).get("objects", []) if label_of(o["name"]) == label), None)


def hull_points(ply, layout, center, max_points=48):
    """物品高斯點的凸包頂點（相對 box 中心，公尺），物理的碰撞形狀。雜點先用百分位濾掉。"""
    v = read_gaussian_ply(ply)
    axes = np.array([layout["e1"], layout["up"], layout["e2"]])
    xyz = np.stack([v["x"], v["y"], v["z"]], 1).astype(np.float64)
    q = (xyz - np.asarray(layout["origin"])) @ axes.T / layout["units_per_meter"] - np.asarray(center)
    lo, hi = np.percentile(q, 2, 0), np.percentile(q, 98, 0)
    q = q[np.all((q >= lo) & (q <= hi), 1)]
    if len(q) < 8:
        return None
    pcd = o3d.geometry.PointCloud(o3d.utility.Vector3dVector(q))
    hull, _ = pcd.compute_convex_hull()
    pts = np.asarray(hull.vertices)
    if len(pts) > max_points:
        pts = pts[np.linspace(0, len(pts) - 1, max_points).astype(int)]
    return np.round(pts, 4).tolist()


def to_object(o, splats, meshes, objects_dir, layout, plan):
    label = label_of(o["name"])
    aff, physics = affordance_of(label, plan)
    x, y, z = o["floor_pos_m"]
    w, h, d = o["size_m"]
    item = {
        "id": o["name"],
        "label": label,
        "name_zh": name_zh(label, plan),
        "box": {"center": [x, round(y + h / 2, 4), z], "size": [w, h, d], "yaw": o.get("yaw", 0)},
        "affordance": {**NOTHING, **aff},
        "physics": physics,
    }
    if "surface_y" in o:
        item["surfaces"] = [{"kind": "top", "top_y": o["surface_y"]}]
    if o.get("parts"):  # 分層家具：每塊各是一個碰撞方塊和一個可以站的面，第一塊是底座
        yaw = o.get("yaw", 0)
        item["physics"] = {**physics, "boxes": [
            {"center": [p["center"][0], round(p["top"] / 2, 4), p["center"][1]], "size": [p["size"][0], p["top"], p["size"][1]], "yaw": yaw}
            for p in o["parts"]]}
        item["surfaces"] = [{"kind": "top", "top_y": p["top"], "center": p["center"], "size": p["size"], "yaw": yaw} for p in o["parts"]]
    if o["name"] in splats:
        item["splat"] = splats[o["name"]]
        hull = hull_points(objects_dir / f"{o['name']}.ply", layout, item["box"]["center"])
        if hull:
            item["physics"] = {**physics, "hull": hull}
    if o["name"] in meshes:
        lib = MESHES[label]
        if lib.get("round"):  # 切出來的外框常一邊窄一邊寬，圓的物品取平均才不會壓扁
            w = d = (w + d) / 2
        item["mesh"] = {"file": lib["file"], "scale": [round(a / b, 4) for a, b in zip((w, h, d), lib["size"])],
                        "color": meshes[o["name"]]["color"], "hide": lib["hide"]}
        if "texture" in meshes[o["name"]]:
            item["mesh"]["texture"] = meshes[o["name"]]["texture"]
    return item


def rotate(p, yaw):
    """地板座標 (N,2) 的 (x, z) 轉到房間方向：第一軸是 (cos, sin)，和家具外框的 yaw 同一種定義。"""
    c, s = np.cos(yaw), np.sin(yaw)
    return np.stack([p[:, 0] * c + p[:, 1] * s, -p[:, 0] * s + p[:, 1] * c], 1)


def room_yaw(p):
    """牆的方向（弧度，-45°~45°）。從上往下看，轉到和牆平行時牆上的點會擠成很尖的峰，
    取兩個軸 5 公分直方圖平方和最大的角度。座標軸是重建時隨便定的，牆可能歪十幾度。"""
    def score(yaw):
        r = rotate(p, yaw)
        return sum((np.histogram(a, bins=np.arange(a.min(), a.max() + 0.05, 0.05))[0].astype(float) ** 2).sum() for a in r.T)
    yaws = np.radians(np.arange(-45, 45, 0.5))
    return float(yaws[np.argmax([score(y) for y in yaws])])


def room_bounds(ply, layout):
    """沿著牆方向的房間範圍，物理引擎在四邊放看不見的牆。取百分位，窗外的雜點不算。
    回傳的 min / max 是轉到房間方向後的座標（公尺），yaw 是那個方向。"""
    v = read_gaussian_ply(ply)
    xyz = np.stack([v["x"], v["y"], v["z"]], 1).astype(np.float64)
    alpha = 1 / (1 + np.exp(-v["opacity"].astype(np.float64)))
    origin = np.asarray(layout["origin"])
    with np.errstate(all="ignore"):
        q = (xyz - origin) @ np.array([layout["e1"], layout["up"], layout["e2"]]).T / layout["units_per_meter"]
    ok = np.isfinite(q).all(1)
    q, alpha = q[ok], alpha[ok]
    wall = (alpha > 0.3) & (q[:, 1] > 0.3) & (q[:, 1] < 1.8)  # 牆的高度，避開地板和天花板
    yaw = room_yaw(q[wall][:, [0, 2]])
    r = rotate(q[:, [0, 2]], yaw)
    print(f"[scene] 牆和座標軸差 {np.degrees(yaw):.1f}°")
    return {"min": np.round(np.percentile(r, 1, 0), 3).tolist(), "max": np.round(np.percentile(r, 99, 0), 3).tolist(),
            "yaw": round(yaw, 4)}


def main():
    ap = argparse.ArgumentParser(description="合成 scene.json")
    ap.add_argument("ply", type=Path, help="房間 scene.ply")
    args = ap.parse_args()

    root = args.ply.parent
    layout = json.loads(args.ply.with_suffix(".layout.json").read_text())
    objects = json.loads((root / "objects" / "objects.json").read_text())
    plan = load_plan(args.ply)
    cut_path = root / "objects" / "cut.json"
    cut = json.loads(cut_path.read_text()) if cut_path.exists() else {"objects": []}
    splats = {c["name"]: {"file": f"objects/{c['file']}", "pivot": c["pivot"]} for c in cut["objects"]}
    meshes = {m["name"]: m for m in cut.get("meshes", [])}

    assets = {"room": args.ply.with_suffix(".splat").name}
    if "room" in cut:
        assets["room_cut"] = f"objects/{cut['room']}"
    scene = {
        "source": "splat",
        "units": "meter",
        "frame": {k: layout[k] for k in ("origin", "e1", "up", "e2", "units_per_meter")},
        "floor": {"y": 0.0, "surface": "wood"},
        "room": room_bounds(args.ply, layout),
        "assets": assets,
        "objects": [to_object(o, splats, meshes, root / "objects", layout, plan) for o in objects if o.get("floor_pos_m") and o.get("size_m")],
    }
    out = args.ply.with_suffix(".json")
    out.write_text(json.dumps(scene, indent=2, ensure_ascii=False))
    print(f"[scene] {out}: {len(scene['objects'])} 個物品")
    planned = {label_of(o["name"]) for o in (plan or {}).get("objects", []) + (plan or {}).get("surfaces", [])}
    unknown = sorted({o["label"] for o in scene["objects"]} - AFFORDANCES.keys() - planned)
    if unknown:
        print(f"[scene] 對照表和 objects_plan.json 都沒有這些標籤，當成固定物：{', '.join(unknown)}")


if __name__ == "__main__":
    main()
