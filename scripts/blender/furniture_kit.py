"""
平面圖轉換的家具模型庫（#138，Tina 2026-11-03）：每種家具產出一個 glb，網頁依 AI 讀到的尺寸縮放後擺進 3D 娃娃屋。
材質與建模做法沿用 Meow/meowho_3d_room/scripts/generate_room.py（橡木地板、木皮、石材、布料、藤編，numpy 產生可平鋪貼圖）。

執行（擇一）：
  blender -b --factory-startup --python scripts/blender/furniture_kit.py
  python3 scripts/blender/furniture_kit.py            # 已安裝 bpy 模組（pip install bpy）

輸出：public/hq-floorplan/furniture/<kind>.glb、kit.json；public/hq-floorplan/textures/floor_oak*.jpg
座標：Blender 公尺、Z 向上；家具正面朝 -Y、背面貼 +Y；底部中心在原點。
glTF 匯出後 Y 向上、正面朝 +Z（gltf = (x, z, -y)）。
kit.json 的 w／d／ref_h：網頁縮放用。ref_h 是「AI 讀到的高度」對應的模型高度（例如床是床墊高，不含床頭板）。
"""
import json
import math
from pathlib import Path

import bpy  # 要先載入 bpy，bmesh 才找得到（pip 版 bpy）
import bmesh
import numpy as np
from mathutils import Matrix

ROOT = Path(__file__).resolve().parent.parent.parent
OUT = ROOT / "public" / "hq-floorplan" / "furniture"
OUT_TEX = ROOT / "public" / "hq-floorplan" / "textures"
TEX_RES = 512
SEED = 265


# ---------------------------------------------------------------------------
# 貼圖（與 meowho_3d_room 相同的程序貼圖）
# ---------------------------------------------------------------------------
def srgb(c):
    def f(v):
        return v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4
    return (f(c[0]), f(c[1]), f(c[2]), 1.0)


def _noise(rng, res, su, sv):
    w = rng.standard_normal((res, res))
    fv = np.fft.fftfreq(res)[:, None]
    fu = np.fft.fftfreq(res)[None, :]
    g = np.exp(-2.0 * np.pi ** 2 * ((fu * su) ** 2 + (fv * sv) ** 2))
    n = np.real(np.fft.ifft2(np.fft.fft2(w) * g))
    n -= n.min()
    return n / max(n.max(), 1e-8)


def _uv(res):
    t = np.arange(res) / res
    return np.meshgrid(t, t)


def tex_floor(res, rng):
    planks = 6
    U, V = _uv(res)
    col = np.minimum((U * planks).astype(int), planks - 1)
    lu = U * planks - col
    tint = rng.uniform(-0.045, 0.045, planks)
    grain = _noise(rng, res, 1.5 * res / 1024, 90 * res / 1024)
    warp = _noise(rng, res, 50 * res / 1024, 160 * res / 1024)
    stripes = np.sin(2 * np.pi * (U * planks * 9 + warp * 2.5))
    lum = 1 + tint[col] + 0.07 * (grain - 0.5) + 0.025 * stripes
    joint_v = rng.uniform(0, 1, planks)
    d = np.abs(((V - joint_v[col]) + 0.5) % 1.0 - 0.5) * res
    seam = (lu * res / planks < 1.2) | (d < 1.0)
    lum[seam] *= 0.62
    h = 0.6 + 0.08 * (grain - 0.5)
    h[seam] = 0.0
    return np.array([0.74, 0.71, 0.66])[None, None, :] * lum[..., None], h


def tex_veneer(res, rng):
    U, V = _uv(res)
    grain = _noise(rng, res, 1.2 * res / 1024, 120 * res / 1024)
    warp = _noise(rng, res, 40 * res / 1024, 250 * res / 1024)
    stripes = np.sin(2 * np.pi * (U * 45 + warp * 3.0))
    lum = 1 + 0.05 * (grain - 0.5) + 0.018 * stripes
    return np.array([0.87, 0.80, 0.70])[None, None, :] * lum[..., None], 0.5 + 0.4 * (grain - 0.5) + 0.15 * stripes


def tex_stone(res, rng):
    clouds = _noise(rng, res, 70 * res / 1024, 70 * res / 1024)
    fine = _noise(rng, res, 2, 2)
    lum = 1 + 0.035 * (clouds - 0.5) + 0.02 * (fine - 0.5)
    return np.array([0.90, 0.885, 0.86])[None, None, :] * lum[..., None], 0.5 + 0.2 * (fine - 0.5)


def tex_rattan(res, rng):
    n = 8
    U, V = _uv(res)
    cu, cv = (U * n) % 1.0, (V * n) % 1.0
    strand = ((np.abs(cu - 0.5) < 0.10) | (np.abs(cv - 0.5) < 0.10)
              | (np.abs(cu - cv) < 0.075) | (np.abs(cu + cv - 1) < 0.075))
    fib = _noise(rng, res, 1.0, 1.0)
    cane = np.array([0.80, 0.65, 0.43])[None, None, :] * (0.9 + 0.2 * fib)[..., None]
    hole = np.array([0.07, 0.06, 0.05])[None, None, :] * np.ones_like(cane)
    return np.where(strand[..., None], cane, hole), np.where(strand, 0.7 + 0.3 * fib, 0.0)


def tex_fabric(res, rng):
    U, V = _uv(res)
    weave = np.sin(2 * np.pi * U * 60) * np.sin(2 * np.pi * V * 60)
    slub = _noise(rng, res, 1.5, 6)
    return 0.5 + 0.25 * weave + 0.35 * (slub - 0.5)


def normal_from_height(h, strength):
    dx = (np.roll(h, -1, axis=1) - np.roll(h, 1, axis=1)) * 0.5 * strength
    dy = (np.roll(h, -1, axis=0) - np.roll(h, 1, axis=0)) * 0.5 * strength
    n = np.stack([-dx, -dy, np.ones_like(h)], axis=-1)
    n /= np.linalg.norm(n, axis=-1, keepdims=True)
    return n * 0.5 + 0.5


TMP = Path(bpy.app.tempdir or "/tmp") / "furniture_kit_tex"


def image(name, rgb, non_color=False):
    res = rgb.shape[0]
    rgba = np.concatenate([np.clip(rgb, 0, 1), np.ones((res, res, 1))], axis=2).astype(np.float32)
    img = bpy.data.images.new(name, res, res, alpha=False)
    if non_color:
        img.colorspace_settings.name = "Non-Color"
    img.pixels.foreach_set(rgba.ravel())
    TMP.mkdir(parents=True, exist_ok=True)
    img.filepath_raw = str(TMP / f"{name}.png")
    img.file_format = "PNG"
    img.save()
    img.pack()
    return img


def save_jpg(img, path):
    """把貼圖另存成網頁用的 JPG（地板）"""
    path.parent.mkdir(parents=True, exist_ok=True)
    scn = bpy.context.scene
    scn.render.image_settings.file_format = "JPEG"
    scn.render.image_settings.quality = 85
    img.save_render(str(path), scene=scn)


# ---------------------------------------------------------------------------
# 材質
# ---------------------------------------------------------------------------
def _set(node, names, value):
    for n in names:
        if n in node.inputs:
            node.inputs[n].default_value = value
            return


def mat(name, color=(0.8, 0.8, 0.8), rough=0.5, metal=0.0, tex=None, tile=1.0, normal=None, strength=1.0):
    m = bpy.data.materials.new(name)
    if m.node_tree is None:
        m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    _set(bsdf, ["Base Color"], srgb(color))
    _set(bsdf, ["Roughness"], rough)
    _set(bsdf, ["Metallic"], metal)
    if tex is not None:
        t = nt.nodes.new("ShaderNodeTexImage")
        t.image = tex
        nt.links.new(t.outputs["Color"], bsdf.inputs["Base Color"])
    if normal is not None:
        tn = nt.nodes.new("ShaderNodeTexImage")
        tn.image = normal
        nm = nt.nodes.new("ShaderNodeNormalMap")
        nm.inputs["Strength"].default_value = strength
        nt.links.new(tn.outputs["Color"], nm.inputs["Color"])
        nt.links.new(nm.outputs["Normal"], bsdf.inputs["Normal"])
    m["tile_m"] = tile
    return m


def build_materials():
    rng = np.random.default_rng(SEED)
    T, N = {}, {}
    for key, fn, strength in (("floor", tex_floor, 2.0), ("veneer", tex_veneer, 1.5),
                              ("stone", tex_stone, 1.5), ("rattan", tex_rattan, 8.0)):
        rgb, h = fn(TEX_RES, rng)
        T[key] = image(f"T_{key}", rgb)
        N[key] = image(f"T_{key}_n", normal_from_height(h, strength), non_color=True)
    N["fabric"] = image("T_fabric_n", normal_from_height(tex_fabric(256, rng), 4.0), non_color=True)
    save_jpg(T["floor"], OUT_TEX / "floor_oak.jpg")
    save_jpg(N["floor"], OUT_TEX / "floor_oak_normal.jpg")
    return dict(
        veneer=mat("M_Wood_Veneer", rough=0.5, tex=T["veneer"], tile=1.0, normal=N["veneer"], strength=0.6),
        stone=mat("M_Stone", rough=0.25, tex=T["stone"], tile=1.0, normal=N["stone"], strength=0.4),
        rattan=mat("M_Rattan", rough=0.6, tex=T["rattan"], tile=0.12, normal=N["rattan"]),
        greige=mat("M_Lacquer_Greige", (0.86, 0.82, 0.76), 0.45),
        white=mat("M_Lacquer_White", (0.93, 0.92, 0.90), 0.4),
        black=mat("M_Wood_Black", (0.035, 0.033, 0.03), 0.4),
        walnut=mat("M_Wood_Walnut", (0.42, 0.28, 0.17), 0.5),
        fabric=mat("M_Fabric_Grey", (0.60, 0.60, 0.58), 0.95, tile=0.25, normal=N["fabric"], strength=0.8),
        linen=mat("M_Fabric_Linen", (0.93, 0.91, 0.87), 0.95, tile=0.25, normal=N["fabric"], strength=0.6),
        duvet=mat("M_Fabric_Duvet", (0.78, 0.74, 0.68), 0.95, tile=0.25, normal=N["fabric"], strength=0.8),
        ceramic=mat("M_Ceramic", (0.95, 0.95, 0.94), 0.15),
        brass=mat("M_Brass", (0.75, 0.58, 0.33), 0.3, metal=1.0),
        alu=mat("M_Aluminium", (0.40, 0.40, 0.40), 0.35, metal=1.0),
    )


# ---------------------------------------------------------------------------
# 建模（MeshBuilder 沿用 meowho_3d_room）
# ---------------------------------------------------------------------------
class MeshBuilder:
    def __init__(self, name):
        self.name = name
        self.bm = bmesh.new()
        self.mats = []

    def mi(self, m):
        if m not in self.mats:
            self.mats.append(m)
        return self.mats.index(m)

    def _tag(self, verts, m):
        idx = self.mi(m)
        for f in {f for v in verts for f in v.link_faces}:
            f.material_index = idx

    def box(self, mn, mx, m, bevel=0.0, segs=1):
        s = [b - a for a, b in zip(mn, mx)]
        c = [(a + b) / 2 for a, b in zip(mn, mx)]
        M = Matrix.Translation(c) @ Matrix.Diagonal((s[0], s[1], s[2], 1.0))
        verts = bmesh.ops.create_cube(self.bm, size=1.0, matrix=M)["verts"]
        self._tag(verts, m)
        if bevel > 0:
            b = min(bevel, min(s) * 0.45)
            edges = list({e for v in verts for e in v.link_edges})
            bmesh.ops.bevel(self.bm, geom=edges, offset=b, segments=segs, profile=0.5, affect="EDGES", clamp_overlap=True)
        return self

    def prism(self, pts, axis, w0, w1, m):
        def P(u, v, w):
            return {"x": (w, u, v), "y": (u, w, v), "z": (u, v, w)}[axis]
        n = len(pts)
        a = [self.bm.verts.new(P(u, v, w0)) for u, v in pts]
        b = [self.bm.verts.new(P(u, v, w1)) for u, v in pts]
        idx = self.mi(m)
        faces = [self.bm.faces.new(a), self.bm.faces.new(b)]
        for i in range(n):
            j = (i + 1) % n
            faces.append(self.bm.faces.new((a[i], a[j], b[j], b[i])))
        for f in faces:
            f.material_index = idx
        bmesh.ops.recalc_face_normals(self.bm, faces=faces)
        return self

    def cyl(self, center, r, depth, m, segs=24):
        M = Matrix.Translation(center)
        verts = bmesh.ops.create_cone(self.bm, cap_ends=True, cap_tris=False, segments=segs,
                                      radius1=r, radius2=r, depth=depth, matrix=M)["verts"]
        self._tag(verts, m)
        return self

    def ellipsoid(self, center, radii, m):
        M = Matrix.Translation(center) @ Matrix.Diagonal((*radii, 1.0))
        verts = bmesh.ops.create_uvsphere(self.bm, u_segments=20, v_segments=12, radius=1.0, matrix=M)["verts"]
        self._tag(verts, m)
        return self

    def build(self):
        bm = self.bm
        ngons = [f for f in bm.faces if len(f.verts) > 4]
        if ngons:
            bmesh.ops.triangulate(bm, faces=ngons, quad_method="BEAUTY", ngon_method="BEAUTY")
        bm.normal_update()
        for f in bm.faces:
            f.smooth = True
        for e in bm.edges:
            if len(e.link_faces) != 2 or e.calc_face_angle(0.0) > math.radians(35):
                e.smooth = False
        me = bpy.data.meshes.new(self.name)
        bm.to_mesh(me)
        bm.free()
        for m in self.mats:
            me.materials.append(m)
        obj = bpy.data.objects.new(self.name, me)
        bpy.context.scene.collection.objects.link(obj)
        box_uv(obj)
        return obj


def box_uv(obj):
    """依材質的 tile 尺寸做盒狀投影 UV（公尺），貼圖比例才會正確"""
    me = obj.data
    tiles = [(s.material.get("tile_m", 1.0) if s.material else 1.0) for s in obj.material_slots] or [1.0]
    bm = bmesh.new()
    bm.from_mesh(me)
    uvl = bm.loops.layers.uv.verify()
    for f in bm.faces:
        n = f.normal
        ax = max(range(3), key=lambda i: abs(n[i]))
        t = tiles[f.material_index] if f.material_index < len(tiles) else 1.0
        for lp in f.loops:
            p = lp.vert.co
            u, v = ((p.y, p.z), (p.x, p.z), (p.x, p.y))[ax]
            lp[uvl].uv = (u / t, v / t)
    bm.to_mesh(me)
    bm.free()


# ---------------------------------------------------------------------------
# 各種家具：正面朝 -Y，背面 +Y；寬 w（x）、深 d（y），底部 z=0
# ---------------------------------------------------------------------------
def legs(b, w, d, h, m, inset=0.04, size=0.04):
    for sx in (-1, 1):
        for sy in (-1, 1):
            x, y = sx * (w / 2 - inset), sy * (d / 2 - inset)
            b.box((x - size / 2, y - size / 2, 0), (x + size / 2, y + size / 2, h), m, bevel=0.004)


def sofa(M):
    w, d = 2.1, 0.9
    x0, x1, y0, y1 = -w / 2, w / 2, -d / 2, d / 2
    aw = 0.15
    b = MeshBuilder("sofa")
    b.box((x0 + aw, y0, 0.06), (x1 - aw, y1 - 0.18, 0.32), M["fabric"], bevel=0.02, segs=2)
    b.box((x0 + aw, y1 - 0.20, 0.06), (x1 - aw, y1, 0.80), M["fabric"], bevel=0.04, segs=3)
    for xa, xb in ((x0, x0 + aw), (x1 - aw, x1)):
        b.box((xa, y0, 0.06), (xb, y1, 0.62), M["fabric"], bevel=0.05, segs=3)
    for xa, xb in ((x0 + aw, 0), (0, x1 - aw)):
        b.box((xa + 0.005, y0 + 0.01, 0.32), (xb - 0.005, y1 - 0.20, 0.46), M["fabric"], bevel=0.04, segs=3)
        b.box((xa + 0.01, y1 - 0.40, 0.46), (xb - 0.01, y1 - 0.18, 0.76), M["fabric"], bevel=0.06, segs=3)
    for xx in (x0 + 0.06, x1 - 0.10):
        for yy in (y0 + 0.06, y1 - 0.10):
            b.box((xx, yy, 0), (xx + 0.04, yy + 0.04, 0.06), M["black"])
    return b, (w, d, 0.8)


def bed(M):
    w, d, top = 1.5, 2.0, 0.5
    x0, x1, y0, y1 = -w / 2, w / 2, -d / 2, d / 2
    b = MeshBuilder("bed")
    b.box((x0, y0, 0.08), (x1, y1 - 0.05, 0.28), M["veneer"], bevel=0.01)                      # 床架
    legs(b, w, d - 0.05, 0.08, M["veneer"], inset=0.06, size=0.05)
    b.box((x0 + 0.03, y0 + 0.03, 0.28), (x1 - 0.03, y1 - 0.08, 0.44), M["linen"], bevel=0.04, segs=3)  # 床墊
    b.box((x0 + 0.01, y0 + 0.01, 0.40), (x1 - 0.01, y1 - 0.65, top), M["duvet"], bevel=0.05, segs=3)   # 棉被
    for xa, xb in ((x0 + 0.08, -0.03), (0.03, x1 - 0.08)):
        b.box((xa, y1 - 0.58, 0.44), (xb, y1 - 0.18, 0.58), M["linen"], bevel=0.06, segs=3)          # 枕頭
    b.box((x0 - 0.02, y1 - 0.06, 0.08), (x1 + 0.02, y1, 1.0), M["veneer"], bevel=0.015, segs=2)      # 床頭板
    return b, (w + 0.04, d, top)


def table(M):
    w, d, h = 1.2, 0.8, 0.75
    b = MeshBuilder("table")
    b.box((-w / 2, -d / 2, h - 0.03), (w / 2, d / 2, h), M["stone"], bevel=0.006, segs=2)
    b.box((-w / 2 + 0.06, -d / 2 + 0.06, h - 0.1), (w / 2 - 0.06, d / 2 - 0.06, h - 0.03), M["veneer"])
    legs(b, w, d, h - 0.03, M["veneer"], inset=0.08, size=0.045)
    return b, (w, d, h)


def chair(M):
    sh, bh = 0.47, 0.9
    w, dp, lg = 0.44, 0.46, 0.032
    b = MeshBuilder("chair")
    for sx in (-1, 1):
        x = sx * (w / 2 - lg / 2)
        b.box((x - lg / 2, -dp / 2, 0), (x + lg / 2, -dp / 2 + lg, sh - 0.03), M["black"], bevel=0.003)   # 前腳
        b.box((x - lg / 2, dp / 2 - lg, 0), (x + lg / 2, dp / 2, bh), M["black"], bevel=0.003)            # 後腳＋椅背柱
        b.box((x - 0.01, -dp / 2, 0.15), (x + 0.01, dp / 2, 0.17), M["black"])
    b.box((-w / 2, -dp / 2, sh - 0.035), (w / 2, dp / 2, sh), M["black"], bevel=0.008, segs=2)
    b.box((-w / 2 + lg, dp / 2 - lg, bh - 0.04), (w / 2 - lg, dp / 2, bh), M["black"], bevel=0.004)
    pw, z0, z1, rr = w / 2 - lg, sh + 0.08, bh - 0.04, 0.06
    prof = [(-pw, z0), (pw, z0)]
    prof += [(pw - rr + rr * math.cos(a), z1 - rr + rr * math.sin(a)) for a in np.linspace(0, math.pi / 2, 5)]
    prof += [(-pw + rr + rr * math.cos(a), z1 - rr + rr * math.sin(a)) for a in np.linspace(math.pi / 2, math.pi, 5)]
    b.prism(prof, "y", dp / 2 - 0.022, dp / 2 - 0.008, M["rattan"])
    return b, (w, dp, bh)


def desk(M):
    w, d, h = 1.2, 0.6, 0.75
    b = MeshBuilder("desk")
    b.box((-w / 2, -d / 2, h - 0.03), (w / 2, d / 2, h), M["veneer"], bevel=0.004)
    b.box((-w / 2, -d / 2 + 0.02, 0), (-w / 2 + 0.03, d / 2, h - 0.03), M["veneer"])                 # 左側板
    b.box((w / 2 - 0.42, -d / 2 + 0.02, 0), (w / 2, d / 2, h - 0.03), M["white"], bevel=0.003)       # 右側抽屜櫃
    for i in range(3):
        z0 = 0.04 + i * 0.22
        b.box((w / 2 - 0.41, -d / 2, z0), (w / 2 - 0.01, -d / 2 + 0.02, z0 + 0.2), M["white"], bevel=0.003)
        b.box((w / 2 - 0.26, -d / 2 - 0.015, z0 + 0.15), (w / 2 - 0.16, -d / 2, z0 + 0.165), M["brass"])
    b.box((-w / 2 + 0.03, d / 2 - 0.03, 0.3), (w / 2 - 0.42, d / 2, h - 0.03), M["veneer"])          # 背板
    return b, (w, d, h)


def wardrobe(M):
    w, d, h = 1.0, 0.6, 2.0
    b = MeshBuilder("wardrobe")
    b.box((-w / 2, -d / 2 + 0.02, 0.06), (w / 2, d / 2, h), M["greige"], bevel=0.004)
    b.box((-w / 2 + 0.03, -d / 2 + 0.05, 0), (w / 2 - 0.03, d / 2, 0.06), M["greige"])
    for xa, xb in ((-w / 2, 0), (0, w / 2)):
        b.box((xa + 0.003, -d / 2, 0.063), (xb - 0.003, -d / 2 + 0.02, h - 0.003), M["greige"], bevel=0.003)
    for x in (-0.03, 0.02):
        b.box((x, -d / 2 - 0.02, 0.9), (x + 0.012, -d / 2, 1.3), M["brass"])
    return b, (w, d, h)


def cabinet(M):
    w, d, h = 0.9, 0.45, 0.9
    b = MeshBuilder("cabinet")
    b.box((-w / 2, -d / 2 + 0.02, 0.1), (w / 2, d / 2, h), M["veneer"], bevel=0.004)
    legs(b, w, d, 0.1, M["black"], inset=0.05, size=0.03)
    for i in range(3):
        z0 = 0.11 + i * (h - 0.11) / 3
        z1 = z0 + (h - 0.11) / 3
        b.box((-w / 2 + 0.01, -d / 2, z0 + 0.003), (w / 2 - 0.01, -d / 2 + 0.02, z1 - 0.003), M["white"], bevel=0.003)
        b.box((-0.08, -d / 2 - 0.012, z1 - 0.06), (0.08, -d / 2, z1 - 0.05), M["brass"])
    return b, (w, d, h)


def tv_stand(M):
    w, d, z0, z1 = 1.6, 0.42, 0.12, 0.5
    t = 0.02
    b = MeshBuilder("tv_stand")
    b.box((-w / 2, -d / 2, z1 - t), (w / 2, d / 2, z1), M["veneer"], bevel=0.002)
    b.box((-w / 2, -d / 2, z0), (w / 2, d / 2, z0 + t), M["veneer"], bevel=0.002)
    for x in (-w / 2, w / 2 - t):
        b.box((x, -d / 2, z0), (x + t, d / 2, z1), M["veneer"], bevel=0.002)
    b.box((-w / 2, d / 2 - 0.02, z0), (w / 2, d / 2, z1), M["veneer"])
    for x in (-w / 2 + w / 3, -w / 2 + 2 * w / 3):
        b.box((x - 0.009, -d / 2, z0), (x + 0.009, d / 2, z1), M["veneer"])
    third = w / 3
    for i in (1, 2):
        xa = -w / 2 + i * third
        b.box((xa + 0.004, -d / 2, z0 + t + 0.002), (xa + third - 0.004, -d / 2 + 0.02, z1 - t - 0.002), M["white"], bevel=0.002)
    legs(b, w, d, z0, M["black"], inset=0.06, size=0.03)
    return b, (w, d, z1)


def counter(M):
    w, d, h = 1.8, 0.6, 0.9
    b = MeshBuilder("counter")
    b.box((-w / 2, -d / 2, h - 0.04), (w / 2, d / 2, h), M["stone"], bevel=0.006, segs=2)
    b.box((-w / 2 + 0.02, -d / 2 + 0.03, 0), (w / 2 - 0.02, d / 2, h - 0.04), M["veneer"])
    pitch, sw = 0.03, 0.018
    n = int((w - 0.08) / pitch)
    for i in range(n):
        x = -w / 2 + 0.04 + i * pitch
        b.box((x, -d / 2 + 0.015, 0.02), (x + sw, -d / 2 + 0.03, h - 0.05), M["veneer"])
    return b, (w, d, h)


def toilet(M):
    b = MeshBuilder("toilet")
    b.box((-0.18, 0.12, 0.38), (0.18, 0.32, 0.78), M["ceramic"], bevel=0.03, segs=2)    # 水箱
    b.box((-0.12, -0.05, 0), (0.12, 0.25, 0.38), M["ceramic"], bevel=0.04, segs=2)      # 底座
    b.ellipsoid((0, -0.07, 0.36), (0.18, 0.24, 0.05), M["ceramic"])                      # 馬桶座
    b.box((-0.1, 0.12, 0.78), (0.1, 0.32, 0.8), M["ceramic"], bevel=0.008)
    return b, (0.4, 0.7, 0.4)


def bathtub(M):
    w, d, h, t = 0.75, 1.6, 0.6, 0.07
    b = MeshBuilder("bathtub")
    b.box((-w / 2, -d / 2, 0), (w / 2, d / 2, 0.08), M["ceramic"], bevel=0.02)
    for (mn, mx) in (((-w / 2, -d / 2, 0.08), (-w / 2 + t, d / 2, h)), ((w / 2 - t, -d / 2, 0.08), (w / 2, d / 2, h)),
                     ((-w / 2, -d / 2, 0.08), (w / 2, -d / 2 + t, h)), ((-w / 2, d / 2 - t, 0.08), (w / 2, d / 2, h))):
        b.box(mn, mx, M["ceramic"], bevel=0.025, segs=2)
    b.cyl((0, d / 2 - 0.12, h + 0.05), 0.02, 0.1, M["alu"], segs=12)
    return b, (w, d, h)


def other(M):
    b = MeshBuilder("other")
    b.box((-0.4, -0.25, 0), (0.4, 0.25, 0.8), M["greige"], bevel=0.02, segs=2)
    return b, (0.8, 0.5, 0.8)


KINDS = dict(sofa=sofa, bed=bed, table=table, chair=chair, desk=desk, wardrobe=wardrobe, cabinet=cabinet,
             tv_stand=tv_stand, counter=counter, toilet=toilet, bathtub=bathtub, other=other)


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    OUT.mkdir(parents=True, exist_ok=True)
    M = build_materials()
    kit = {}
    for kind, fn in KINDS.items():
        for o in list(bpy.data.objects):
            bpy.data.objects.remove(o, do_unlink=True)
        b, (w, d, ref_h) = fn(M)
        obj = b.build()
        tris = sum(len(p.vertices) - 2 for p in obj.data.polygons)
        bpy.ops.object.select_all(action="DESELECT")
        obj.select_set(True)
        bpy.context.view_layer.objects.active = obj
        path = OUT / f"{kind}.glb"
        bpy.ops.export_scene.gltf(filepath=str(path), export_format="GLB", use_selection=True, export_apply=True,
                                  export_yup=True, export_image_format="JPEG", export_jpeg_quality=80,
                                  export_cameras=False, export_lights=False)
        kit[kind] = {"w": round(w, 3), "d": round(d, 3), "ref_h": round(ref_h, 3), "tris": tris, "bytes": path.stat().st_size}
        print(f"{kind}: {kit[kind]}")
    (OUT / "kit.json").write_text(json.dumps({"version": 1, "units": "metres", "front": "+z", "kinds": kit}, indent=2) + "\n")


if __name__ == "__main__":
    main()
