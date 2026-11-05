#!/usr/bin/env python3
"""從 3DGS 房間切出指定物品：2D 偵測 + 分割 -> 投回 3D 投票。

流程:
  1. 每張影格用 Grounding DINO 以文字找物品框（同時給干擾詞，避免冰箱被當成清淨機）
  2. SAM 2 把框切成精確遮罩
  3. 每顆高斯投影到每張影格：看得到（深度緩衝）的影格中，落在遮罩內的比例夠高就算該物品
  4. 只留最大的一團（DBSCAN），輸出物品 .ply / .splat 與 objects.json（位置、大小）

用法:
  python pipeline/segment_objects.py rooms/room2/scene.ply --frames rooms/room2/frames \\
      --object backpack="a backpack" --object purifier="an air purifier"
產出 <ply 所在資料夾>/objects/：<名稱>.ply、<名稱>.splat、objects.json、debug/*.jpg
"""
import argparse
import json
import sys
import time
from pathlib import Path

import numpy as np

from plan_objects import load_plan
from train_3dgs import read_gaussian_ply, ply_to_splat

# 一起放進提示詞的干擾詞：沒列出的東西容易被硬套成目標（例如腳踏車被當成清淨機）
DISTRACTORS = ["a bicycle", "a television", "a refrigerator", "an electric fan", "a chair", "a bed",
               "a laptop", "a cabinet", "a clothes rack", "a cardboard box", "clothes"]


def load_models(dev):
    from transformers import AutoProcessor, AutoModelForZeroShotObjectDetection, Sam2Model, Sam2Processor
    dp = AutoProcessor.from_pretrained("IDEA-Research/grounding-dino-tiny")
    dm = AutoModelForZeroShotObjectDetection.from_pretrained("IDEA-Research/grounding-dino-tiny").to(dev).eval()
    sp = Sam2Processor.from_pretrained("facebook/sam2.1-hiera-small")
    sm = Sam2Model.from_pretrained("facebook/sam2.1-hiera-small").to(dev).eval()
    return dp, dm, sp, sm


def detect(img, phrases, dp, dm, dev, thr):
    """回傳 [(phrase_index, score, box)]；DINO 會把每個框指派給最像的詞。"""
    import torch
    text = ". ".join(phrases) + "."
    inp = dp(images=img, text=text, return_tensors="pt").to(dev)
    with torch.no_grad():
        out = dm(**inp)
    r = dp.post_process_grounded_object_detection(
        out, inp.input_ids, threshold=thr, text_threshold=thr, target_sizes=[img.size[::-1]])[0]
    hits = []
    for lab, s, b in zip(r["text_labels"], r["scores"].tolist(), r["boxes"].tolist()):
        # 標籤是提示詞的片段（例如 "a black air purifier" 或只有 "pu"），取共用字最多的詞
        words = set(lab.split()) - {"a", "an", "the"}
        overlap = [len(words & set(p.split())) for p in phrases]
        if words and max(overlap) > 0:
            hits.append((int(np.argmax(overlap)), s, b))
    return hits


def segment(img, boxes, sp, sm, dev):
    import torch
    si = sp(images=img, input_boxes=[boxes], return_tensors="pt").to(dev)
    with torch.no_grad():
        so = sm(**si, multimask_output=False)
    return sp.post_process_masks(so.pred_masks.cpu(), si["original_sizes"])[0][:, 0].numpy()


def write_ply(path: Path, v: dict, keep: np.ndarray):
    names = list(v.keys())
    data = np.stack([v[k][keep] for k in names], 1).astype("<f4")
    with open(path, "wb") as f:
        f.write(f"ply\nformat binary_little_endian 1.0\nelement vertex {len(data)}\n".encode())
        for k in names:
            f.write(f"property float {k}\n".encode())
        f.write(b"end_header\n")
        f.write(data.tobytes())


def vote(args, cams, xyz, alpha, objs, phrases, out, dev):
    """每張影格偵測 + 分割，累計每顆高斯「看得到」與「落在遮罩內」的次數。"""
    from PIL import Image, ImageDraw
    dp, dm, sp, sm = load_models(dev)
    n = len(xyz)
    vis = np.zeros(n, np.int32)
    hit = np.zeros((len(objs), n), np.int32)
    solid = alpha > 0.5
    debug = out / "debug" / "_".join(o[0] for o in objs)
    debug.mkdir(parents=True, exist_ok=True)
    t0 = time.time()
    for fi, c in enumerate(cams):
        path = args.frames / c["img_name"]
        if not path.exists():
            continue
        raw = Image.open(path).convert("RGB")
        w, h = c["width"], c["height"]
        ox, oy = (raw.width - w) // 2, (raw.height - h) // 2  # 去畸變後影像略小，取中央
        img = raw.crop((ox, oy, ox + w, oy + h))

        # 投影：rotation 是 camToWorld（OpenCV：x 右、y 下、z 前）
        R = np.asarray(c["rotation"]); C = np.asarray(c["position"])
        pc = (xyz - C) @ R
        z = pc[:, 2]
        front = z > 1e-3
        u = np.full(n, -1.0); vv = np.full(n, -1.0)
        u[front] = c["fx"] * pc[front, 0] / z[front] + w / 2
        vv[front] = c["fy"] * pc[front, 1] / z[front] + h / 2
        inside = front & (u >= 0) & (u < w) & (vv >= 0) & (vv < h)

        # 低解析度深度緩衝：只有最前面那層（不透明高斯）算看得到
        s = 8
        gw, gh = w // s + 1, h // s + 1
        cell = np.full(n, -1)
        cell[inside] = (vv[inside] // s).astype(int) * gw + (u[inside] // s).astype(int)
        zbuf = np.full(gw * gh, np.inf)
        m = inside & solid
        np.minimum.at(zbuf, cell[m], z[m])
        seen = inside & (z <= zbuf[np.maximum(cell, 0)] * 1.05 + 1e-6)
        vis += seen

        # 單一物品：和干擾詞一起偵測，只留分數最高的框
        # --multi 的物品（鞋子等）：單獨用自己的描述偵測並保留全部的框；混在長提示裡只會框到一兩個
        best, dets = {}, []
        for d in detect(img, phrases, dp, dm, dev, args.det_thr):
            if d[0] < len(objs) and objs[d[0]][0] not in args.multi and d[1] > best.get(d[0], (0, 0))[1]:
                best[d[0]] = d
        dets += best.values()
        for k, (name, desc) in enumerate(objs):
            if name in args.multi:
                dets += [(k, s, b) for _, s, b in detect(img, [desc], dp, dm, dev, args.det_thr)]
        if dets:
            masks = segment(img, [d[2] for d in dets], sp, sm, dev)
            ui, vi = u[seen].astype(int), vv[seen].astype(int)
            for k in {d[0] for d in dets}:  # 同一物品多個框取聯集，每張影格最多算一票
                union = np.any([mk for d, mk in zip(dets, masks) if d[0] == k], 0)
                hit[k, seen] += union[vi, ui]

        if fi % 15 == 0:  # 偵錯圖：遮罩與框
            ov = np.asarray(img).astype(float)
            if dets:
                for (k, sc, b), mk in zip(dets, masks):
                    col = np.array([(230, 60, 60), (60, 200, 90), (70, 110, 240), (240, 190, 40), (220, 70, 220)][k % 5])
                    ov[mk] = ov[mk] * .45 + col * .55
            im = Image.fromarray(ov.astype(np.uint8)); d = ImageDraw.Draw(im)
            for k, sc, b in dets:
                d.rectangle(b, outline="white", width=3); d.text((b[0] + 4, b[1] + 4), f"{objs[k][0]} {sc:.2f}", fill="white")
            im.resize((w // 2, h // 2)).save(debug / c["img_name"])
        if fi % 10 == 0:
            el = time.time() - t0
            print(f"[seg] {fi + 1}/{len(cams)} 張，{el:.0f}s，剩約 {el / (fi + 1) * (len(cams) - fi - 1) / 60:.1f} 分", flush=True)
    return vis, hit


def main():
    ap = argparse.ArgumentParser(description="從 3DGS 房間切出物品")
    ap.add_argument("ply", type=Path, help="訓練輸出的 scene.ply")
    ap.add_argument("--frames", type=Path, required=True, help="訓練用的原始影格資料夾")
    ap.add_argument("--cameras", type=Path, help="預設為 <ply>.cameras.json")
    ap.add_argument("--object", action="append", default=[], metavar='名稱="英文描述"',
                    help='要切的物品，可重複，例如 --object backpack="a backpack"；沒給時讀 objects_plan.json')
    ap.add_argument("--multi", action="append", default=[], metavar="名稱",
                    help="這個物品有好幾個（例如鞋子），每一團各自輸出成 名稱_1、名稱_2…")
    ap.add_argument("--min-cluster", type=int, default=80, help="--multi 時一團至少幾顆高斯")
    ap.add_argument("--every", type=int, default=2, help="每幾張影格取一張 (預設 2)")
    ap.add_argument("--det-thr", type=float, default=0.35, help="偵測分數門檻")
    ap.add_argument("--vote", type=float, default=0.5, help="看得到的影格中落在遮罩內的比例門檻")
    ap.add_argument("--vote-for", action="append", default=[], metavar="名稱=門檻",
                    help="個別物品的門檻。床這類大型家具常只入鏡一部分，AI 認不出的影格多，要放寬")
    ap.add_argument("--min-views", type=int, default=4, help="至少要在幾張影格被看到")
    ap.add_argument("--eps", type=float, default=0.08, help="分群距離（公尺），物品被切成好幾塊時調大")
    ap.add_argument("--reuse", action="store_true", help="沿用上次的 votes.npz，只重調門檻與分群（幾秒完成）")
    ap.add_argument("--out", type=Path, help="預設為 <ply 所在資料夾>/objects")
    args = ap.parse_args()
    if not args.object:
        plan = load_plan(args.ply)
        if not plan:
            ap.error("要給 --object，或先跑 plan_objects.py 產生 objects_plan.json")
        args.object = [f"{o['name']}={o['prompt']}" for o in plan["objects"]]
        args.multi += [o["name"] for o in plan["objects"] if o["multiple"]]
        # 大型家具常只入鏡一部分，和原本床、沙發一樣放寬門檻
        args.vote_for += [f"{o['name']}=0.3" for o in plan["objects"] if o["kind"] == "solid"]

    try:
        import torch
        dev = "mps" if torch.backends.mps.is_available() else "cpu"
        objs = []
        for o in args.object:
            name, _, desc = o.partition("=")
            objs.append((name.strip(), (desc or name).strip().strip('"')))
        phrases = [d for _, d in objs]
        phrases += [d for d in DISTRACTORS if d not in phrases]  # 目標本身就是干擾詞（如床）時不重複
        cams_path = args.cameras or args.ply.with_suffix(".cameras.json")
        out = args.out or args.ply.parent / "objects"
        out.mkdir(parents=True, exist_ok=True)

        v = read_gaussian_ply(args.ply)
        xyz = np.stack([v["x"], v["y"], v["z"]], 1).astype(np.float64)
        alpha = 1 / (1 + np.exp(-v["opacity"]))
        n = len(xyz)
        cams = sorted(json.load(open(cams_path)), key=lambda c: c["img_name"])[:: args.every]
        print(f"[seg] {n} 顆高斯，{len(cams)} 張影格，物品: {[o[0] for o in objs]}，裝置 {dev}")

        names = [o[0] for o in objs]
        votes_path = out / f"votes_{'_'.join(names)}.npz"
        t0 = time.time()
        if args.reuse and votes_path.exists() and list(np.load(votes_path)["names"]) == names:
            z = np.load(votes_path)
            vis, hit = z["vis"], z["hit"]
            print("[seg] 沿用上次的投票結果，只重做分群")
        else:
            vis, hit = vote(args, cams, xyz, alpha, objs, phrases, out, dev)
            np.savez_compressed(votes_path, vis=vis, hit=hit, names=np.array(names))

        import open3d as o3d
        layout_path = args.ply.with_suffix(".layout.json")
        L = json.load(open(layout_path)) if layout_path.exists() else None
        upm = L["units_per_meter"] if L else 1.0
        def save(name, desc, idx):
            keep = np.zeros(n, bool); keep[idx] = True
            write_ply(out / f"{name}.ply", v, keep)
            ply_to_splat(out / f"{name}.ply", out / f"{name}.splat")
            p = xyz[idx]
            lo, hi = np.percentile(p, 2, 0), np.percentile(p, 98, 0)
            info = {"name": name, "prompt": desc, "count": int(len(idx)),
                    "center": ((lo + hi) / 2).tolist(), "bbox_min": lo.tolist(), "bbox_max": hi.tolist()}
            if L:  # 地板座標系下的尺寸（公尺）：寬(e1)、高(up)、深(e2)
                axes = np.array([L["e1"], L["up"], L["e2"]])
                q = (p - np.asarray(L["origin"])) @ axes.T / upm
                ql, qh = np.percentile(q, 2, 0), np.percentile(q, 98, 0)
                info["size_m"] = np.round(qh - ql, 3).tolist()
                info["floor_pos_m"] = np.round([(ql[0] + qh[0]) / 2, ql[1], (ql[2] + qh[2]) / 2], 3).tolist()
            print(f"[seg] {name}: {len(idx)} 顆高斯，尺寸(寬,高,深) {info.get('size_m')} m，"
                  f"離地 {info.get('floor_pos_m', [0, 0])[1]} m")
            return info

        # 這次切的物品會取代舊結果（含 名稱_1… 這類多個的），其他物品保留
        mine = lambda nm: any(nm == a or (a in args.multi and nm.startswith(a + "_")) for a in names)
        old = json.load(open(out / "objects.json")) if (out / "objects.json").exists() else []
        result = [o for o in old if not mine(o["name"])]
        for f in out.glob("*.ply"):
            if mine(f.stem):
                f.unlink(); f.with_suffix(".splat").unlink(missing_ok=True)

        vote_for = {n: float(t) for n, t in (s.split("=") for s in args.vote_for)}
        for k, (name, desc) in enumerate(objs):
            ratio = hit[k] / np.maximum(vis, 1)
            sel = (vis >= args.min_views) & (ratio >= vote_for.get(name, args.vote))
            idx = np.nonzero(sel)[0]
            if len(idx) < 50:
                print(f"[seg] {name}: 只找到 {len(idx)} 顆，略過（偵測不到或門檻太高）")
                continue
            pcd = o3d.geometry.PointCloud(o3d.utility.Vector3dVector(xyz[idx]))
            lab = np.asarray(pcd.cluster_dbscan(eps=args.eps * upm, min_points=10))
            if not (lab >= 0).any():
                print(f"[seg] {name}: 投票通過 {len(idx)} 顆但太分散，略過")
                continue
            sizes = np.bincount(lab[lab >= 0])
            print(f"[seg] {name}: 投票通過 {len(idx)} 顆，分成 {len(sizes)} 群，最大幾群 {sorted(sizes.tolist())[::-1][:6]}")
            if name in args.multi:
                order = [g for g in np.argsort(-sizes) if sizes[g] >= args.min_cluster][:12]
                for i, g in enumerate(order, 1):
                    result.append(save(f"{name}_{i}", desc, idx[lab == g]))
            else:
                result.append(save(name, desc, idx[lab == sizes.argmax()]))
        json.dump(result, open(out / "objects.json", "w"), ensure_ascii=False, indent=1)
        print(f"[done] {out}（共 {time.time() - t0:.0f}s）")
    except Exception as e:
        print(f"[error] {e}", file=sys.stderr)
        raise


if __name__ == "__main__":
    main()
