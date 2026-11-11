"""
三視角投影：把 AI 三視角（左側、正面、背部）直接投影到「拉直後的成貓母體」，烘焙進這隻貓的 UV 貼圖

為什麼：Hunyuan 上色只看一張照片，看不到的地方（另一側、脖子、背）是它猜的，紋路常常不像。
拉直後的母體是站姿，跟 AI 三視角的姿勢幾乎一樣，可以直接對齊投影，花紋就是照片本身。

  左側照 → 左半身（+X）；同一張左右翻轉 → 右半身（真貓兩側花紋本來就相近）
  正面照 → 臉、脖子、胸前（項鍊紋）
  背部照 → 背脊、屁股
  三張都看不到的地方（肚子、腋下、腳內側）保留原本的貼圖（Hunyuan + 補花紋）

執行（Hunyuan3D-2 的 venv 有 numpy／PIL／trimesh；去背用 rembg 或 hy3dgen 的 BackgroundRemover）:
  C:\\AI\\Hunyuan3D-2\\venv\\Scripts\\python.exe cat_studio\\project_views.py adoption_cats\\<貓咪ID>
輸入：<貓咪ID>/ai_left.png、ai_front.png、ai_back.png、paint_albedo.png（原本的貼圖，當底）
      cat_base/work/base_rig.glb（拉直後的母體，靜止姿勢；沒有時用 repo 的 public/hq-cat-models/base/base_clips.glb）
輸出：<貓咪ID>/paint_albedo.png（新的；舊的另存 paint_albedo_hunyuan.png）、project_debug.jpg（對齊檢查圖）
"""
import argparse
import shutil
import sys
from pathlib import Path

import numpy as np
import trimesh
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
# 拉直後的成貓母體（靜止姿勢）：Tina 電腦 Meow/cat_base/work/base_rig.glb；repo 裡用 public 的 base_clips.glb（同一份網格與 UV）
MESH = next((p for p in (ROOT / "cat_base" / "work" / "base_rig.glb",
                         ROOT.parent.parent / "public" / "hq-cat-models" / "base" / "base_clips.glb") if p.exists()),
            ROOT / "cat_base" / "work" / "base_rig.glb")

# glTF 座標：Y 朝上、貓臉朝 +Z、+X 是貓的左邊
# (檔名, 相機方向（從貓指向相機）, 畫面右方, 權重)
VIEWS = [
    ("ai_left", np.array([1.0, 0, 0]), np.array([0, 0, -1.0]), 1.0),   # 頭朝左的側面照：看到貓的左邊
    ("ai_front", np.array([0, 0, 1.0]), np.array([1.0, 0, 0]), 1.0),   # 正面：貓的左邊在畫面右邊
    ("ai_back", np.array([0, 0, -1.0]), np.array([-1.0, 0, 0]), 0.9),
]
UP = np.array([0, 1.0, 0])
TEX = 2048


# ───────── 網格 → 每個貼圖像素的 3D 位置、法線 ─────────

def load_body(path):
    scene = trimesh.load(path, force="scene", process=False)
    g = scene.geometry["cat_base"]
    eyes = {n: np.asarray(scene.graph[n][0])[:3, 3] for n in ("eye_L", "eye_R")}
    return np.asarray(g.vertices, float), np.asarray(g.faces), np.asarray(g.visual.uv, float), \
        np.asarray(g.vertex_normals, float), eyes


def rasterize_uv(v, f, uv, vn, size):
    """每個貼圖像素：在哪個三角形、3D 位置、法線（沒有三角形的像素 mask=False）"""
    pos = np.zeros((size, size, 3), np.float32)
    nrm = np.zeros((size, size, 3), np.float32)
    mask = np.zeros((size, size), bool)
    px = np.stack([uv[:, 0] * size - 0.5, (1 - uv[:, 1]) * size - 0.5], 1)   # trimesh 的 uv 原點在左下
    for tri in f:
        a, b, c = px[tri]
        x0, x1 = int(np.floor(min(a[0], b[0], c[0]))), int(np.ceil(max(a[0], b[0], c[0])))
        y0, y1 = int(np.floor(min(a[1], b[1], c[1]))), int(np.ceil(max(a[1], b[1], c[1])))
        x0, y0, x1, y1 = max(x0, 0), max(y0, 0), min(x1, size - 1), min(y1, size - 1)
        if x1 < x0 or y1 < y0:
            continue
        xs, ys = np.meshgrid(np.arange(x0, x1 + 1), np.arange(y0, y1 + 1))
        d = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1])
        if abs(d) < 1e-12:
            continue
        w0 = ((b[1] - c[1]) * (xs - c[0]) + (c[0] - b[0]) * (ys - c[1])) / d
        w1 = ((c[1] - a[1]) * (xs - c[0]) + (a[0] - c[0]) * (ys - c[1])) / d
        w2 = 1 - w0 - w1
        inside = (w0 >= -0.02) & (w1 >= -0.02) & (w2 >= -0.02)
        if not inside.any():
            continue
        yy, xx = ys[inside], xs[inside]
        bw = np.stack([w0[inside], w1[inside], w2[inside]], 1)
        pos[yy, xx] = bw @ v[tri]
        nrm[yy, xx] = bw @ vn[tri]
        mask[yy, xx] = True
    nrm /= np.maximum(np.linalg.norm(nrm, axis=2, keepdims=True), 1e-8)
    return pos, nrm, mask


# ───────── 相機：正交投影，縮放＋平移從輪廓對齊找 ─────────

def project(p, cam_dir, right, s, tx, ty, ax=1.0):
    """s：每公尺幾 px；ax：左右方向額外的伸縮（AI 圖的身長比例跟母體不完全一樣）"""
    return np.stack([(p @ right) * s * ax + tx, -(p @ UP) * s + ty], -1)


def silhouette(v, f, cam_dir, right, s, tx, ty, shape, ax=1.0):
    img = Image.new("L", (shape[1], shape[0]), 0)
    d = ImageDraw.Draw(img)
    q = project(v, cam_dir, right, s, tx, ty, ax)
    for tri in f:
        d.polygon([tuple(q[i]) for i in tri], fill=255)
    return np.asarray(img) > 0


def zbuffer(v, f, cam_dir, right, s, tx, ty, shape, ax=1.0):
    """每個畫面像素最靠近相機的深度（越大越近）"""
    zb = np.full(shape, -np.inf, np.float32)
    q = project(v, cam_dir, right, s, tx, ty, ax)
    depth = v @ cam_dir
    for tri in f:
        a, b, c = q[tri]
        x0, x1 = int(max(np.floor(min(a[0], b[0], c[0])), 0)), int(min(np.ceil(max(a[0], b[0], c[0])), shape[1] - 1))
        y0, y1 = int(max(np.floor(min(a[1], b[1], c[1])), 0)), int(min(np.ceil(max(a[1], b[1], c[1])), shape[0] - 1))
        if x1 < x0 or y1 < y0:
            continue
        xs, ys = np.meshgrid(np.arange(x0, x1 + 1), np.arange(y0, y1 + 1))
        dd = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1])
        if abs(dd) < 1e-12:
            continue
        w0 = ((b[1] - c[1]) * (xs - c[0]) + (c[0] - b[0]) * (ys - c[1])) / dd
        w1 = ((c[1] - a[1]) * (xs - c[0]) + (a[0] - c[0]) * (ys - c[1])) / dd
        w2 = 1 - w0 - w1
        inside = (w0 >= 0) & (w1 >= 0) & (w2 >= 0)
        if not inside.any():
            continue
        z = w0 * depth[tri[0]] + w1 * depth[tri[1]] + w2 * depth[tri[2]]
        yy, xx = ys[inside], xs[inside]
        zb[yy, xx] = np.maximum(zb[yy, xx], z[inside])
    return zb


def fit_camera(v, f, cam_dir, right, photo_mask, keep, init=None):
    """縮放＋平移：先對齊上下高度和頭的位置，再小範圍搜尋讓輪廓重疊（IoU）最大。
    keep：拿來對齊的頂點（去掉尾巴，AI 圖的尾巴姿勢跟模型不同）"""
    H, W = photo_mask.shape
    k = 256 / max(H, W)                                    # 縮小算比較快
    small = np.asarray(Image.fromarray(photo_mask.astype(np.uint8) * 255).resize((int(W * k), int(H * k)))) > 127
    ys, xs = np.nonzero(small)
    a, b = v[keep] @ right, v[keep] @ UP
    s0 = (ys.max() - ys.min()) / (b.max() - b.min())
    tx0 = (xs.min() + xs.max()) / 2 - (a.min() + a.max()) / 2 * s0
    ty0 = ys.max() + b.min() * s0
    fk = f[np.all(keep[f], axis=1)]

    def iou(s, tx, ty, ax):
        m = silhouette(v, fk, cam_dir, right, s, tx, ty, small.shape, ax)
        return (m & small).sum() / max((m | small).sum(), 1)

    if init is not None:                                      # 頭：從身體的結果開始，只看頭附近的視窗
        s0, tx0, ty0, ax0 = init[0] * k, init[1] * k, init[2] * k, init[3]
        q = project(v[keep], cam_dir, right, s0, tx0, ty0, ax0)
        lo, hi = q.min(0), q.max(0)
        pad = (hi - lo) * 0.35
        x0, y0 = np.maximum((lo - pad).astype(int), 0)
        x1, y1 = np.minimum((hi + pad).astype(int), [small.shape[1] - 1, small.shape[0] - 1])
        win = np.zeros_like(small)
        win[y0:y1 + 1, x0:x1 + 1] = True
        small = small & win
        best = (0.0, s0, tx0, ty0, ax0)
        best = (iou(*best[1:]), *best[1:])
        step = [0.03 * s0, 4.0, 4.0, 0.04]
    else:
        best = (iou(s0, tx0, ty0, 1.0), s0, tx0, ty0, 1.0)
        step = None
    for s_try in (np.linspace(0.7, 1.3, 13) * s0 if init is None else []):              # 先粗掃縮放，避免卡在局部最佳
        for ax_try in (0.85, 1.0, 1.15):
            tx_try = (xs.min() + xs.max()) / 2 - (a.min() + a.max()) / 2 * s_try * ax_try
            ty_try = ys.max() + b.min() * s_try
            sc = iou(s_try, tx_try, ty_try, ax_try)
            if sc > best[0]:
                best = (sc, s_try, tx_try, ty_try, ax_try)
    step = step or [0.04 * s0, 6.0, 6.0, 0.05]
    for _ in range(24):
        improved = False
        for i in range(4):
            for sign in (1, -1):
                cand = list(best[1:])
                cand[i] += sign * step[i]
                if init is not None and not (abs(cand[0] / s0 - 1) < 0.12 and abs(cand[1] - tx0) < 0.03 * small.shape[1]
                                             and abs(cand[2] - ty0) < 0.03 * small.shape[0] and abs(cand[3] / ax0 - 1) < 0.12):
                    continue                                   # 頭只能在身體結果附近微調
                sc = iou(*cand)
                if sc > best[0]:
                    best, improved = (sc, *cand), True
        if not improved:
            step = [x * 0.5 for x in step]
    sc, s, tx, ty, ax = best
    return sc, s / k, tx / k, ty / k, ax


# ───────── 主流程 ─────────

def photo_and_mask(cat_dir, name):
    img = Image.open(cat_dir / f"{name}.png").convert("RGB")
    nobg = cat_dir / f"{name}_nobg.png"
    if not nobg.exists():
        try:
            from rembg import remove
            remove(img).save(nobg)
        except ImportError:
            for cand in (Path(r"C:\AI\Hunyuan3D-2"), ROOT / "Hunyuan3D-2"):
                if (cand / "hy3dgen").is_dir():
                    sys.path.insert(0, str(cand))
            from hy3dgen.rembg import BackgroundRemover
            BackgroundRemover()(img).save(nobg)
    alpha = np.asarray(Image.open(nobg).convert("RGBA"))[:, :, 3] > 128
    return np.asarray(img, np.float32), alpha


def detect_eyes(img, alpha):
    """照片裡的眼睛（黃綠色虹膜）：頭部範圍內的黃綠色區塊，依左右分兩群，回傳每群的中心 (x, y)"""
    try:
        from scipy import ndimage
    except ImportError:                                       # 沒有 scipy：不用眼睛對齊，只用輪廓
        return []
    hsv = np.asarray(Image.fromarray(img.astype(np.uint8)).convert("HSV"), np.float32)
    h, sat, val = hsv[..., 0] * 360 / 255, hsv[..., 1] / 255, hsv[..., 2] / 255
    ys, xs = np.nonzero(alpha)
    top, height = ys.min(), ys.max() - ys.min()
    m = (h > 45) & (h < 110) & (sat > 0.25) & (val > 0.35) & alpha
    m[top + int(0.35 * height):] = False
    lab, n = ndimage.label(m)
    if n == 0:
        return []
    sizes = ndimage.sum(m, lab, range(1, n + 1))
    blobs = [(sizes[i], np.array(ndimage.center_of_mass(m, lab, i + 1))[::-1]) for i in range(n) if sizes[i] >= 15]
    if not blobs:
        return []
    big = max(b[0] for b in blobs)
    pts = [(w, c) for w, c in blobs if w > 0.1 * big]
    xs_ = np.array([c[0] for _, c in pts])
    if xs_.max() - xs_.min() < 0.02 * img.shape[1]:          # 只有一隻眼（側面）
        w = np.array([w for w, _ in pts])
        return [sum(w_ * c for w_, c in pts) / w.sum()]
    cut = (xs_.max() + xs_.min()) / 2
    out = []
    for side in (xs_ < cut, xs_ >= cut):
        sel = [p for p, k in zip(pts, side) if k]
        w = np.array([w for w, _ in sel])
        out.append(sum(w_ * c for w_, c in sel) / w.sum())
    return sorted(out, key=lambda c: c[0])


def sample(img, q):
    """雙線性取色；q 是 (N, 2) 畫面座標"""
    H, W, _ = img.shape
    x = np.clip(q[:, 0], 0, W - 1.001)
    y = np.clip(q[:, 1], 0, H - 1.001)
    x0, y0 = np.floor(x).astype(int), np.floor(y).astype(int)
    fx, fy = (x - x0)[:, None], (y - y0)[:, None]
    return (img[y0, x0] * (1 - fx) * (1 - fy) + img[y0, x0 + 1] * fx * (1 - fy)
            + img[y0 + 1, x0] * (1 - fx) * fy + img[y0 + 1, x0 + 1] * fx * fy)


def dilate(color, valid, n=6):
    """有值的像素往外擴 n 圈（UV 接縫不留色差）"""
    color, valid = color.copy(), valid.copy()
    for _ in range(n):
        acc = np.zeros_like(color)
        cnt = np.zeros(valid.shape, np.float32)
        for dy, dx in ((0, 1), (0, -1), (1, 0), (-1, 0)):
            sv = np.roll(valid, (dy, dx), (0, 1))
            acc += np.roll(color, (dy, dx), (0, 1)) * sv[:, :, None]
            cnt += sv
        grow = (~valid) & (cnt > 0)
        color[grow] = acc[grow] / cnt[grow][:, None]
        valid |= grow
    return color


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("cat_dir")
    ap.add_argument("--mesh", default=str(MESH))
    ap.add_argument("--base", default="paint_albedo_hunyuan.png", help="底圖（三張都看不到的地方用它）")
    ap.add_argument("--mirror", type=float, default=0.85, help="左側照翻到右半身的權重")
    ap.add_argument("--fresh", action="store_true", help="剛跑完 paint_worker：先把新的 paint_albedo.png 存成底圖")
    args = ap.parse_args()
    cat_dir = Path(args.cat_dir)
    if args.fresh or not (cat_dir / args.base).exists():
        shutil.copy2(cat_dir / "paint_albedo.png", cat_dir / args.base)
    base = np.asarray(Image.open(cat_dir / args.base).convert("RGB").resize((TEX, TEX)), np.float32)

    v, f, uv, vn, eyes = load_body(args.mesh)
    print(f"母體：{len(v)} 頂點、{len(f)} 面；身體範圍 {v.min(0).round(3)} ~ {v.max(0).round(3)}")
    pos, nrm, tmask = rasterize_uv(v, f, uv, vn, TEX)
    P, N = pos[tmask], nrm[tmask]
    # 尾巴：屁股以後、高度在腳以上（AI 圖的尾巴姿勢不同，不投影、也不拿來對齊）
    rump_z = np.percentile(v[v[:, 1] < 0.05][:, 2], 2)     # 後腳最後面
    tail_v = v[:, 2] < rump_z - 0.01
    keep = ~tail_v
    tail_t = P[:, 2] < rump_z - 0.01

    # 頭另外對齊：母體的頭（尤其耳朵）比例跟 AI 圖不同，整隻一起對齊時頭會偏掉
    sm = lambda x, e0, e1: np.clip((x - e0) / (e1 - e0), 0, 1) ** 2 * (3 - 2 * np.clip((x - e0) / (e1 - e0), 0, 1))
    eyes_c = np.array([0.012, 0.40, 0.19])                    # 兩眼中點附近（母體固定）
    ear = v[:, 1] > 0.43                                      # 耳朵：母體的耳朵比 AI 圖高，不拿來對齊
    keep = keep & ~ear
    head_v = (np.linalg.norm(v - eyes_c, axis=1) < 0.11) & ~ear
    head_t = 1 - sm(np.linalg.norm(P - eyes_c, axis=1), 0.10, 0.13)

    acc = np.zeros((len(P), 3), np.float32)
    wsum = np.zeros(len(P), np.float32)
    debug = []
    for name, cam_dir, right, wv in VIEWS:
        img, alpha = photo_and_mask(cat_dir, name)
        inner = np.asarray(Image.fromarray(alpha.astype(np.uint8) * 255).filter(ImageFilter.MinFilter(9))) > 127
        col_cache = None
        body_fit = fit_camera(v, f, cam_dir, right, alpha, keep)
        head_fit = fit_camera(v, f, cam_dir, right, alpha, head_v, init=body_fit[1:])
        # 臉：用眼睛位置對齊（輪廓對齊時眼睛常差半個眼睛高，會投影出「第三隻眼」）
        found = detect_eyes(img, alpha) if name != "ai_back" else []
        iou_h, s_h, tx_h, ty_h, ax_h = head_fit
        if name == "ai_front" and len(found) == 2:
            mL, mR = eyes["eye_L"], eyes["eye_R"]               # 貓的左眼在畫面右邊
            ax_h = (found[1][0] - found[0][0]) / max(((mL - mR) @ right) * s_h, 1e-6)
            mid = (mL + mR) / 2
            tx_h = (found[0][0] + found[1][0]) / 2 - (mid @ right) * s_h * ax_h
            ty_h = (found[0][1] + found[1][1]) / 2 + (mid @ UP) * s_h
            print(f"{name}：照片眼睛 {[tuple(c.round()) for c in found]}，以眼睛對齊臉")
        elif name == "ai_left" and len(found) == 1:
            mL = eyes["eye_L"]
            tx_h = found[0][0] - (mL @ right) * s_h * ax_h
            ty_h = found[0][1] + (mL @ UP) * s_h
            print(f"{name}：照片眼睛 {tuple(found[0].round())}，以眼睛對齊臉")
        head_fit = (iou_h, s_h, tx_h, ty_h, ax_h)
        dbg = img.copy()
        for region, (iou, s, tx, ty, ax), rw in (("身體", body_fit, 1 - head_t), ("頭", head_fit, head_t)):
            print(f"{name}／{region}：輪廓重疊 {iou:.2f}，縮放 {s:.0f} px/m，左右伸縮 {ax:.2f}，平移 ({tx:.0f}, {ty:.0f})")
            zb = zbuffer(v, f, cam_dir, right, s, tx, ty, alpha.shape, ax)
            passes = [(P, N, wv)]
            if name == "ai_left":                              # 對稱面：頭用兩眼中點、身體用 x=0
                xc = head_t * (eyes["eye_L"][0] + eyes["eye_R"][0]) / 2
                PM = P.copy()
                PM[:, 0] = 2 * xc - P[:, 0]
                passes.append((PM, N * np.array([-1.0, 1, 1]), wv * args.mirror))
            for k_pass, (PP, NN, w0) in enumerate(passes):
                facing = np.clip(NN @ cam_dir, 0, 1)
                q = project(PP, cam_dir, right, s, tx, ty, ax)
                qi = np.clip(np.round(q).astype(int), 0, [alpha.shape[1] - 1, alpha.shape[0] - 1])
                depth = PP @ cam_dir
                visible = depth >= zb[qi[:, 1], qi[:, 0]] - (0.006 if k_pass == 0 else 0.02)
                ok = visible & inner[qi[:, 1], qi[:, 0]] & ~tail_t & (facing > 0.15)
                w = w0 * facing ** 2 * ok * rw
                if k_pass == 1:                                # 翻轉的只給照片看不到的那一側（貓的右邊）
                    w *= (P[:, 0] < head_t * (eyes["eye_L"][0] + eyes["eye_R"][0]) / 2)
                acc += sample(img, q) * w[:, None]
                wsum += w
            part = keep if region == "身體" else head_v
            sil = silhouette(v, f[np.all(part[f], axis=1)], cam_dir, right, s, tx, ty, alpha.shape, ax)
            edge = sil ^ (np.asarray(Image.fromarray(sil.astype(np.uint8) * 255).filter(ImageFilter.MinFilter(5))) > 127)
            dbg[edge] = [255, 0, 0] if region == "身體" else [0, 90, 255]
        debug.append(Image.fromarray(dbg.astype(np.uint8)).resize((768, int(768 * dbg.shape[0] / dbg.shape[1]))))

    proj = acc / np.maximum(wsum, 1e-6)[:, None]
    # 照片的整體亮度、色調對齊原本貼圖（AI 圖有打光，避免拼接處色差）
    have = wsum > 0.05
    b0 = base[tmask][have]
    proj_adj = (proj - proj[have].mean(0)) * (b0.std(0) / np.maximum(proj[have].std(0), 1)) * 0.5 \
        + (proj - proj[have].mean(0)) * 0.5 + b0.mean(0)
    blend = np.clip(wsum / 0.35, 0, 1)[:, None]
    out = base.copy()
    newc = np.zeros_like(base)
    newc[tmask] = proj_adj
    valid = np.zeros(tmask.shape, bool)
    valid[tmask] = have
    newc = dilate(newc, valid, 6)
    bl = np.zeros(tmask.shape, np.float32)
    bl[tmask] = blend[:, 0]
    bl = np.asarray(Image.fromarray((bl * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(5)), np.float32) / 255
    out = base * (1 - bl[:, :, None]) + newc * bl[:, :, None]
    Image.fromarray(np.clip(out, 0, 255).astype(np.uint8)).save(cat_dir / "paint_albedo.png")
    print(f"完成：{cat_dir / 'paint_albedo.png'}（照片蓋到 {have.mean() * 100:.0f}% 的貼圖像素；原圖留在 {args.base}）")
    w_, h_ = 768, sum(d.height for d in debug)
    sheet = Image.new("RGB", (w_, h_), "white")
    y = 0
    for d in debug:
        sheet.paste(d, (0, y))
        y += d.height
    sheet.save(cat_dir / "project_debug.jpg", quality=85)


if __name__ == "__main__":
    main()
