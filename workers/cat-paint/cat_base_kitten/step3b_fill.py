"""
母體貓重建 A-3b：照片看不到的背部、側腹、後頸，用程序化花紋補上（目前只有虎斑）

    C:\\AI\\Hunyuan3D-2\\venv\\Scripts\\python.exe cat_base_kitten\\step3b_fill.py [--debug]
輸入: cat_base_kitten/work/base_textured.glb（網格 + UV）、cat_base_kitten/albedo_default.png（A-3 的 AI 貼圖）、
      cat_base_kitten/eyes.json（眼皮深色邊的位置，跟 A-4 挖眼窩用同一份）
輸出: cat_base_kitten/albedo_filled.png、cat_base_kitten/work/filled_textured.glb
      --debug：把要補的範圍塗紅，輸出 work/fill_debug.png、work/fill_debug.glb

花紋在 3D 座標上計算再烘焙進 UV，所以跨 UV 區塊也是連續的。
做法是「在 AI 貼圖上壓暗出條紋」，保留 AI 原本的底色深淺和毛的細節。
"""
import argparse
import json
from pathlib import Path

import numpy as np
import trimesh
from PIL import Image
from scipy.ndimage import distance_transform_edt
from scipy.sparse import coo_matrix
from scipy.sparse.csgraph import connected_components
from scipy.spatial import cKDTree

ROOT = Path(__file__).resolve().parent.parent
BASE = ROOT / "cat_base_kitten"
WORK = BASE / "work"

DEFAULTS = {
    "stripes": 8.0,        # 後腳到前腳之間的條紋數
    "stripe_tilt": 0.35,   # 條紋往下時往後彎的程度
    "stripe_width": 0.30,  # 條紋佔一個週期的比例
    "warp": 1.3,           # 條紋扭曲（雜訊強度）
    "breakup": 0.45,       # 條紋斷開的程度（0＝完整連續）
    "strength": 0.35,      # 有三視圖真實花紋時少補
    "feather": (0.04, 0.30),  # 從「照片看得到」到「完全補上」的過渡距離（模型單位，身長約 2）
    "seen_nz": 0.25,       # 法線朝照片方向超過這個值才算照片看得到
    "liner_width": 0.2,    # 眼皮深色邊寬度（眼睛開口橢圓半徑的倍數）
}
LINER_RGB = np.array([0.05, 0.04, 0.035])


def smoothstep(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)


def raster(pts, faces, H, W, eps=0.02):
    """把三角形畫到 H×W 格子上，逐一回傳 (三角形編號, ys, xs, 重心座標)。pts 是以像素中心為整數的座標"""
    tri = pts[faces]
    lo = np.clip(np.floor(tri.min(1)).astype(int), 0, [W - 1, H - 1])
    hi = np.clip(np.ceil(tri.max(1)).astype(int), 0, [W - 1, H - 1])
    for fi in range(len(faces)):
        xs, ys = np.meshgrid(np.arange(lo[fi, 0], hi[fi, 0] + 1), np.arange(lo[fi, 1], hi[fi, 1] + 1))
        xs, ys = xs.ravel(), ys.ravel()
        a, b, c = tri[fi]
        den = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1])
        if abs(den) < 1e-12:
            continue
        l0 = ((b[1] - c[1]) * (xs - c[0]) + (c[0] - b[0]) * (ys - c[1])) / den
        l1 = ((c[1] - a[1]) * (xs - c[0]) + (a[0] - c[0]) * (ys - c[1])) / den
        l2 = 1.0 - l0 - l1
        ok = (l0 >= -eps) & (l1 >= -eps) & (l2 >= -eps)
        if ok.any():
            bary = np.clip(np.stack([l0, l1, l2], 1)[ok], 0.0, None)
            yield fi, ys[ok], xs[ok], bary / bary.sum(1, keepdims=True)


def value_noise(p):
    i = np.floor(p).astype(np.int64)
    f = p - i
    f = f * f * (3.0 - 2.0 * f)

    def h(dx, dy, dz):
        n = (i[:, 0] + dx) * 73856093 ^ (i[:, 1] + dy) * 19349663 ^ (i[:, 2] + dz) * 83492791
        n = (n ^ (n >> 13)) * 1274126177
        return ((n ^ (n >> 16)) & 0xFFFF) / 65535.0

    x0 = h(0, 0, 0) * (1 - f[:, 0]) + h(1, 0, 0) * f[:, 0]
    x1 = h(0, 1, 0) * (1 - f[:, 0]) + h(1, 1, 0) * f[:, 0]
    x2 = h(0, 0, 1) * (1 - f[:, 0]) + h(1, 0, 1) * f[:, 0]
    x3 = h(0, 1, 1) * (1 - f[:, 0]) + h(1, 1, 1) * f[:, 0]
    y0 = x0 * (1 - f[:, 1]) + x1 * f[:, 1]
    y1 = x2 * (1 - f[:, 1]) + x3 * f[:, 1]
    return y0 * (1 - f[:, 2]) + y1 * f[:, 2]


def fbm(p, octaves=4):
    s, a = 0.0, 0.5
    for _ in range(octaves):
        s = s + a * value_noise(p)
        p, a = p * 2.03 + 17.0, a * 0.5
    return s


def body_frame(v, faces):
    """從四隻腳推出身體座標：u＝後腳→前腳（0~1）、h＝高度（0~1）、side＝左右。
    坐姿幼貓可能找不滿四隻腳 → 改用水平 PCA 當前後軸。"""
    ymin, ymax = v[:, 1].min(), v[:, 1].max()
    # 貼地的頂點依網格相連分成區塊，最大的四塊就是四隻腳
    low = v[:, 1] < ymin + 0.08 * (ymax - ymin)
    edges = trimesh.Trimesh(v, faces, process=False).edges_unique
    edges = edges[low[edges[:, 0]] & low[edges[:, 1]]]
    graph = coo_matrix((np.ones(len(edges)), (edges[:, 0], edges[:, 1])), shape=(len(v), len(v)))
    _, label = connected_components(graph, directed=False)
    ids, counts = np.unique(label[low], return_counts=True) if low.any() else (np.array([]), np.array([]))
    if len(ids) >= 4:
        feet = ids[np.argsort(counts)[-4:]]
        centers = np.array([v[label == i][:, [0, 2]].mean(0) for i in feet])
        pca_axis = np.linalg.eigh(np.cov((v[:, [0, 2]] - v[:, [0, 2]].mean(0)).T))[1][:, -1]
        order = np.argsort(centers @ pca_axis)
        rear, front = centers[order[:2]].mean(0), centers[order[2:]].mean(0)
    else:
        # 坐姿／腳黏在一起：用水平面主軸當前後
        pca_axis = np.linalg.eigh(np.cov((v[:, [0, 2]] - v[:, [0, 2]].mean(0)).T))[1][:, -1]
        proj = v[:, [0, 2]] @ pca_axis
        rear = v[proj.argmin(), [0, 2]]
        front = v[proj.argmax(), [0, 2]]
        print(f"警告：只找到 {len(ids)} 個貼地區塊，改用 PCA 前後軸")
    # 頭（最高點）那一側是前面
    top = v[v[:, 1].argmax(), [0, 2]]
    if np.dot(top - rear, front - rear) < 0:
        rear, front = front, rear
    axis2 = (front - rear) / max(np.linalg.norm(front - rear), 1e-6)
    length = max(float(np.linalg.norm(front - rear)), 1e-6)
    axis = np.array([axis2[0], 0.0, axis2[1]])
    side = np.cross(axis, [0.0, 1.0, 0.0])
    origin = np.array([rear[0], ymin, rear[1]])
    return dict(origin=origin, axis=axis, side=side, length=length, height=ymax - ymin)


def frame_coords(p, fr):
    d = p - fr["origin"]
    return d @ fr["axis"] / fr["length"], d[:, 1] / fr["height"], d @ fr["side"] / fr["length"]


def add_eyeliner(out, pos, covered, eyes, width):
    """A-4 會把眼睛開口邊緣貼在 eyes.json 的橢圓上；把橢圓往外一圈畫成貓的深色眼皮邊。
    eyes.json 是 Blender 座標（x, z），對應這裡（glTF）的 x, y；臉朝 +z"""
    p = pos[covered]
    k = np.zeros(len(p), np.float32)
    for e in eyes.values():
        ev = np.sqrt(((p[:, 0] - e["x"]) / e["rx"]) ** 2 + ((p[:, 1] - e["z"]) / e["rz"]) ** 2)
        inside = ev < 1.0
        if not inside.any():
            continue
        front = p[:, 2] > p[inside, 2].max() - 0.12   # 只畫臉的這一面，不要畫到後腦
        k = np.maximum(k, smoothstep(1.0 + width, 1.0, ev) * front)
    out[covered] = out[covered] * (1.0 - 0.9 * k[:, None]) + LINER_RGB * 0.9 * k[:, None]


def fill_pattern(mesh, albedo, pattern="tabby", params=None, debug=False, eyes=None, photo_dir=(0.0, 0.0, 1.0)):
    """mesh：有 UV 的 trimesh 網格；albedo：A-3 的 AI 貼圖（PIL）；eyes：eyes.json 的眼睛開口。
    pattern："tabby" 補虎斑條紋，"none" 不補（只畫眼皮邊）。photo_dir：網格座標裡「朝向相機」的方向。
    回傳補好花紋（和眼皮深色邊）的 PIL 貼圖"""
    P = {**DEFAULTS, **(params or {})}
    if pattern not in ("tabby", "none"):
        raise ValueError(f"還沒有做 {pattern} 花紋")
    img = np.asarray(albedo.convert("RGB"), dtype=np.float32) / 255.0
    H, W = img.shape[:2]
    v, faces, uv = np.asarray(mesh.vertices), np.asarray(mesh.faces), np.asarray(mesh.visual.uv)

    # UV 接縫會把同一個點拆成多個頂點，先焊起來，算出來的值才會跨接縫連續
    _, weld, inverse = np.unique(np.round(v * 1e5), axis=0, return_index=True, return_inverse=True)
    inverse = inverse.ravel()
    wv = v[weld]
    wmesh = trimesh.Trimesh(wv, inverse[faces], process=False)
    wn = np.asarray(wmesh.vertex_normals)

    # 照片看得到哪些點：先把網格轉到「相機在 +Z」，再從 +Z 做正交深度圖
    d = np.asarray(photo_dir, dtype=np.float64)
    d /= np.linalg.norm(d)
    side = np.cross([0.0, 1.0, 0.0], d)
    side /= np.linalg.norm(side)
    view = np.stack([side, np.cross(d, side), d])   # 列向量：相機的 x、y、z 軸
    cv, cn = wv @ view.T, wn @ view.T
    Z = 1024
    lo, hi = cv[:, :2].min(0), cv[:, :2].max(0)
    scale = (Z - 1) / (hi - lo).max()
    zpts = (cv[:, :2] - lo) * scale
    zpts[:, 1] = (Z - 1) - zpts[:, 1]
    zbuf = np.full((Z, Z), -np.inf)
    for fi, ys, xs, bary in raster(zpts, wmesh.faces, Z, Z):
        z = bary @ cv[wmesh.faces[fi], 2]
        np.maximum.at(zbuf, (ys, xs), z)
    zi = np.clip(np.round(zpts).astype(int), 0, Z - 1)
    visible = cv[:, 2] >= zbuf[zi[:, 1], zi[:, 0]] - 0.02
    seen = visible & (cn[:, 2] > P["seen_nz"])

    # 補花紋的權重：離「看得到的點」越遠越接近 1；只補身體、後頸、後腦
    dist = cKDTree(wv[seen]).query(wv)[0]
    fill_v = smoothstep(*P["feather"], dist)
    fr = body_frame(wv, wmesh.faces)
    u, h, w = frame_coords(wv, fr)
    mid = (u > 0.3) & (u < 0.6) & (np.abs(w) < 0.12)   # 兩對腳中間、身體中線：量肚子和背的高度
    if mid.any():
        belly_h, back_h = float(h[mid].min()), float(h[mid].max())
    else:
        belly_h, back_h = float(np.percentile(h, 15)), float(np.percentile(h, 85))
        print("警告：中線切片為空，改用高度百分位估肚子／背")
    legs = 1.0 - smoothstep(belly_h - 0.05, belly_h + 0.05, h)
    tail = 1.0 - smoothstep(-0.55, -0.42, u)
    ears = smoothstep(0.86, 0.9, h) * smoothstep(0.9, 1.0, u)
    fill_v = fill_v * (1 - legs) * (1 - tail) * (1 - ears)
    print(f"身體座標：身長 {fr['length']:.3f}，背 {back_h:.2f}，肚子 {belly_h:.2f}；"
          f"照片看得到 {seen.mean():.0%} 的頂點，要補的頂點 {np.mean(fill_v > 0.5):.0%}")

    # 每個貼圖像素的 3D 位置、法線、權重
    upx = np.stack([uv[:, 0] * W - 0.5, (1.0 - uv[:, 1]) * H - 0.5], 1)
    covered = np.zeros((H, W), bool)
    pos = np.zeros((H, W, 3), np.float32)
    nrm = np.zeros((H, W, 3), np.float32)
    wgt = np.zeros((H, W), np.float32)
    seen_px = np.zeros((H, W), np.float32)
    for fi, ys, xs, bary in raster(upx, faces, H, W):
        idx = inverse[faces[fi]]
        covered[ys, xs] = True
        pos[ys, xs] = bary @ wv[idx]
        nrm[ys, xs] = bary @ wn[idx]
        wgt[ys, xs] = bary @ fill_v[idx]
        seen_px[ys, xs] = bary @ seen[idx].astype(np.float32)

    out = img.copy()
    if debug:
        out[covered] = out[covered] * (1 - wgt[covered, None]) + np.array([1.0, 0.0, 0.0]) * wgt[covered, None]
    elif pattern == "tabby":
        # 條紋顏色從照片看得到的肩膀、前腳取：中間亮度當底色，最暗的當條紋色
        tu, th, _ = frame_coords(pos[covered], fr)
        src = covered.copy()
        src[covered] = (seen_px[covered] > 0.9) & (tu > 0.6) & (tu < 1.1) & (th < back_h)
        px = img[src]
        lum = px @ np.array([0.299, 0.587, 0.114])
        q = np.percentile(lum, [8, 45, 65])
        stripe_rgb = np.median(px[lum < q[0]], 0)
        base_rgb = np.median(px[(lum > q[1]) & (lum < q[2])], 0)
        ratio = np.clip(stripe_rgb / np.maximum(base_rgb, 1e-3), 0.05, 1.0)
        print(f"取色：底色 {np.round(base_rgb * 255)}，條紋 {np.round(stripe_rgb * 255)}")

        sel = covered & (wgt > 0.001)
        p = pos[sel]
        pu, ph, _ = frame_coords(p, fr)
        hrel = np.clip((ph - belly_h) / (back_h - belly_h), 0.0, 1.0)
        phase = pu * P["stripes"] + P["stripe_tilt"] * (1.0 - hrel) + P["warp"] * (fbm(p * 2.2) - 0.5)
        wave = 0.5 + 0.5 * np.cos(2 * np.pi * phase)
        width = P["stripe_width"] * (0.7 + 0.6 * fbm(p * 4.0 + 3.0))      # 條紋粗細不一
        stripe = smoothstep(1.0 - width, 1.0 - width + 0.2, wave)
        # 條紋斷開、深淺不一
        stripe *= 1.0 - P["breakup"] * smoothstep(0.45, 0.6, fbm(p * 7.0 + 9.0))
        stripe *= 0.75 + 0.25 * fbm(p * 1.5 + 21.0) * 2.0
        # 往肚子方向條紋斷開變淡；背脊加一條深色背線
        stripe *= smoothstep(0.0, 0.4, hrel + 0.4 * (fbm(p * 6.0 + 5.0) - 0.5))
        ny = nrm[sel][:, 1] / np.maximum(np.linalg.norm(nrm[sel], axis=1), 1e-6)
        stripe = np.maximum(stripe, smoothstep(0.86, 0.95, ny) * smoothstep(0.6, 0.8, hrel))
        k = (stripe * wgt[sel] * P["strength"])[:, None]
        out[sel] = img[sel] * (1.0 - k + k * ratio)

    if eyes:
        add_eyeliner(out, pos, covered, eyes, P["liner_width"])

    # UV 區塊外擴 16 像素，避免取樣時吃到區塊外的舊顏色
    dist_px, (iy, ix) = distance_transform_edt(~covered, return_indices=True)
    pad = (~covered) & (dist_px <= 16)
    out[pad] = out[iy[pad], ix[pad]]
    return Image.fromarray(np.clip(out * 255 + 0.5, 0, 255).astype(np.uint8))


def export_glb(mesh, texture, path):
    mat = mesh.visual.material
    if hasattr(mat, "baseColorTexture"):
        mat.baseColorTexture = texture
    else:
        mat.image = texture
    mesh.export(path)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--debug", action="store_true", help="把要補的範圍塗紅，用來檢查範圍")
    args = ap.parse_args()
    mesh = trimesh.load(WORK / "base_textured.glb", force="mesh", process=False)
    albedo = Image.open(BASE / "albedo_default.png")
    eyes_path = BASE / "eyes.json"
    if eyes_path.exists():
        eyes = {k: v for k, v in json.loads(eyes_path.read_text(encoding="utf-8")).items() if k.startswith("eye_")}
    else:
        print("警告：尚無 eyes.json，略過眼皮邊（請先跑 estimate_eyes.py）")
        eyes = {}
    tex = fill_pattern(mesh, albedo, debug=args.debug, eyes=eyes)
    if args.debug:
        tex.save(WORK / "fill_debug.png")
        export_glb(mesh, tex, WORK / "fill_debug.glb")
        print(f"完成：{WORK / 'fill_debug.glb'}")
    else:
        tex.save(BASE / "albedo_filled.png")
        export_glb(mesh, tex, WORK / "filled_textured.glb")
        print(f"完成：{BASE / 'albedo_filled.png'}")


if __name__ == "__main__":
    main()
