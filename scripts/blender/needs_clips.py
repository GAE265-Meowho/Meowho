"""
吃喝拉撒動作（eat／drink／toilet）：成貓 cat_base、幼貓 cat_base_kitten 的 stepC_clips.py 共用（Meowho #297，2026-11-09）。
※ 成貓、幼貓的 eat、drink 已改用 scripts/clips/eat_drink.mjs 直接以各自骨架烘焙（#330，2026-11-10）：
  這裡的版本成貓整隻趴低、脖子折出摺痕、頭塞進胸口；幼貓胸口塌陷。glb 重新匯出後要再跑那支腳本。

兩隻骨架的骨頭名稱相同、比例不同；長度乘 k（= root 骨長 / 成貓 0.274 m），方向一律用世界方向（-Y＝往前、+Z＝往上）。
做法：整隻往下蹲 → 前半身往前下傾 → 脖子、頭用 aim 擺方向 → 四隻腳用兩節 IK 把 top1 尾端拉回站姿位置（腳掌不離地、不滑）。
每個動作開頭清掉 Poser 快取，並把所有骨頭先打上站姿關鍵影格（沒打的骨頭匯出 NLA 時會沿用前一個動作的姿勢）。
"""
from math import cos, pi, radians, sin

import bpy
from mathutils import Vector

FPS = 30
SIDES = (("left", 1), ("right", -1))

# 吃飯時鼻尖要到的位置（骨架公尺，成貓幼貓相同：網頁上碗的大小不分體型）：
# 前腳掌再往前 NOSE_AHEAD（腳掌踩在碗外、鼻子伸進碗裡）、離地 NOSE_HEIGHT（碗裡飼料／水面）。#304 Tina：貓不要踩進碗
NOSE_AHEAD = 0.07
NOSE_HEIGHT = 0.045
EAT_DROP = 0.06                    # 整隻往下蹲多少（成貓公尺）
EAT_FRONT_DROP = 0.07              # 胸口再多壓低多少（成貓公尺）
EAT_NECK = [(0.0, -0.55, -0.83), (0.0, -0.35, -0.94)]
EAT_HEAD = (0.0, -0.25, -0.97)     # 頭朝下（鼻尖朝碗）
FLAT_NECK = [(0.0, -1.0, -0.05), (0.0, -0.97, -0.25)]  # 脖子往前平伸（鼻子伸遠）
FLAT_HEAD = (0.0, -0.6, -0.8)
EAT_CHEW_DEG, EAT_CHEW_SEC = 6, 0.8        # 吃飯：每 0.8 秒咀嚼點頭一次
DRINK_CHEW_DEG, DRINK_CHEW_SEC = 3, 0.35   # 喝水：快速小幅度舔水
# 上廁所：後半身往後下壓、前半身不動，尾巴往後上抬微抖，頭平視
TOILET_DROP = 0.03                 # 整隻再往下多少（成貓公尺）
TOILET_BOT = (0.0, 0.75, -0.66)
TOILET_PELVIS = (0.0, 0.3, -0.95)
TOILET_HEAD = (0.0, -1.0, 0.0)
TOILET_TAIL = [(0.0, 0.75, 0.66), (0.0, 0.85, 0.52), (0.0, 0.92, 0.38), (0.0, 0.96, 0.26),
               (0.0, 0.97, 0.22), (0.0, 0.95, 0.3), (0.0, 0.9, 0.42)]


def _begin(p, n):
    """動作開頭：清快取、所有骨頭在第 0 格與最後一格打上站姿；回傳 k 與站姿時各腳要固定的點"""
    p.cache.clear()
    for pb in p.rig.pose.bones:
        for f in (0, n):
            pb.rotation_euler = (0.0, 0.0, 0.0)
            pb.keyframe_insert("rotation_euler", frame=f)
            if pb.name == "root":
                pb.location = (0.0, 0.0, 0.0)
                pb.keyframe_insert("location", frame=f)
    W = p.rig.matrix_world
    rest = {(fh, lr): W @ p.rig.data.bones[f"leg_{fh}_{lr}_top1"].tail_local for fh in ("front", "hind") for lr, _ in SIDES}
    return p.rig.data.bones["root"].length / 0.274, rest


def _rest_dir(p, bone):
    b = p.rig.data.bones[bone]
    return tuple((b.tail_local - b.head_local).normalized())


def _plant_legs(p, f, rest):
    """兩節 IK（top0、top1）把每隻腳拉回站姿的位置；下面幾節維持站姿方向（腳掌貼地）"""
    for fh in ("front", "hind"):
        for lr, out in SIDES:
            k = f"leg_{fh}_{lr}"
            pole = (0.3 * out, 1.0, 0.0) if fh == "front" else (0.3 * out, -1.0, 0.2)   # 前腳手肘往後、後腳膝蓋往前
            p.reach(f"{k}_top0", f"{k}_top1", f, rest[(fh, lr)], pole)
            p.aim(f"{k}_bot0", f, _rest_dir(p, f"{k}_bot0"), level="rest")
            p.set(f"{k}_ankle", f)
            p.set(f"{k}_toe", f)


def _spine_front_down(p, f, front_drop):
    """前半身往前下傾，讓肩膀低 front_drop；0＝維持站姿"""
    if front_drop <= 0:
        p.set("body_top0", f)
        p.set("body_top1", f)
        return
    s = min(front_drop / max(p.rig.data.bones["body_top0"].length + p.rig.data.bones["body_top1"].length, 1e-4), 0.95)
    p.aim("body_top0", f, (0.0, -round((1 - s * s) ** 0.5, 2), -round(s, 2)), level="rest")
    p.aim("body_top1", f, (0.0, -1.0, -round(s * 0.3, 2)), level="rest")


def _mix(a, b, w):
    v = Vector(a).lerp(Vector(b), w).normalized()
    return (0.0, round(v.y, 2), round(v.z, 2))


def _head_down(p, f, nod_deg, reach):
    """reach：脖子往下伸的程度（1＝EAT_NECK／EAT_HEAD；0＝FLAT_*）；nod_deg：頭再往下點幾度"""
    a = radians(nod_deg)
    p.aim("neck0", f, _mix(FLAT_NECK[0], EAT_NECK[0], reach), level="rest")
    p.aim("neck1", f, _mix(FLAT_NECK[1], EAT_NECK[1], reach), level="rest")
    hy, hz = _mix(FLAT_HEAD, EAT_HEAD, reach)[1:]
    p.aim("head0", f, (0.0, round(hy * cos(a) + hz * sin(a), 2), round(hz * cos(a) - hy * sin(a), 2)), level="rest")


def _nose_z(p, pose_fn):
    """擺第 0 格的姿勢、量鼻尖（head0 尾端）離地高度；之後重擺會覆蓋同一格的關鍵影格"""
    pose_fn(0)
    bpy.context.scene.frame_set(0)
    bpy.context.view_layer.update()
    return (p.rig.matrix_world @ p.rig.pose.bones["head0"].tail).z


def _eat_like(p, body, blink_keys, chew_deg, chew_sec):
    n = 4 * FPS
    k, rest = _begin(p, n)

    def pose(f, m, r, nod=0):
        p.move_root(f, dz=-EAT_DROP * k * m)
        _spine_front_down(p, f, EAT_FRONT_DROP * k * m)
        _head_down(p, f, nod, r)
        _plant_legs(p, f, rest)

    # 試不同蹲低幅度 m 與脖子方向 r（0＝往前平伸、1＝往下），挑鼻尖最接近目標、前腳掌沒離地的組合
    toe = p.rig.matrix_world @ p.rig.data.bones["leg_front_left_toe"].tail_local
    goal_y, goal_z = toe.y - NOSE_AHEAD, NOSE_HEIGHT
    best = None
    for m in (0.0, 0.25, 0.5, 0.75, 1.0, 1.25, 1.5):
        for r in (0.0, 0.25, 0.5, 0.75, 1.0):
            p.cache.clear()
            pose(0, m, r)
            bpy.context.scene.frame_set(0)
            bpy.context.view_layer.update()
            W = p.rig.matrix_world
            nose = W @ p.rig.pose.bones["head0"].tail
            paw = W @ p.rig.pose.bones["leg_front_left_toe"].tail
            err = abs(nose.y - goal_y) + abs(nose.z - goal_z) + max(0.0, paw.z - toe.z - 0.004) * 10
            if best is None or err < best[0]:
                best = (err, m, r, nose.y - toe.y, nose.z)
    _, m, r, ahead, height = best
    p.cache.clear()
    print(f"  蹲低 {m:.2f}、脖子 {r:.2f}：鼻尖在前腳掌前 {-ahead * 100:.1f} cm、離地 {height * 100:.1f} cm")
    for f in range(0, n + 1, 2):
        t = f / FPS
        nod = round(chew_deg * max(0.0, sin(2 * pi * t / chew_sec)))   # 角度取整數，Poser 快取才不會每格都重算
        pose(f, m, r, nod)
        for i in range(7):                                             # 尾巴放低、慢慢擺
            p.set(f"tail{i}", f, side=round((3 + i) * sin(2 * pi * t / 4 - i * 0.4), 1), up=-4 if i < 2 else 0)
    blink_keys(body, [(0, 0.35), (60, 0.35), (63, 1), (67, 0.35), (n, 0.35)])   # 吃東西時眼睛半瞇
    return n


def clip_eat(p, body, blink_keys):
    """吃飯：前半身壓低、脖子往前下伸，頭朝碗，規律咀嚼點頭；腳掌固定不滑。4 秒循環"""
    return _eat_like(p, body, blink_keys, EAT_CHEW_DEG, EAT_CHEW_SEC)


def clip_drink(p, body, blink_keys):
    """喝水：姿勢同吃飯，快速小幅度舔水。4 秒循環"""
    return _eat_like(p, body, blink_keys, DRINK_CHEW_DEG, DRINK_CHEW_SEC)


def clip_toilet(p, body, blink_keys):
    """上廁所：後半身往後下蹲、屁股壓低，前腳撐著，尾巴往後上抬微抖，頭平視前方。4 秒循環"""
    n = 4 * FPS
    k, rest = _begin(p, n)
    for f in range(0, n + 1, 4):
        t = f / FPS
        p.move_root(f, dz=-TOILET_DROP * k)
        p.aim("body_bot", f, TOILET_BOT, level="rest")
        p.aim("pelvis", f, TOILET_PELVIS, level="rest")
        p.aim("head0", f, TOILET_HEAD, level="rest")
        _plant_legs(p, f, rest)
        shake = round(0.04 * sin(2 * pi * t * 1.5), 2)
        for i, d in enumerate(TOILET_TAIL):
            p.aim(f"tail{i}", f, (round(shake * (i + 1), 2), d[1], d[2]))
    blink_keys(body, [(0, 0), (50, 0), (53, 1), (57, 0), (n, 0)])
    return n


# ---------- 撒嬌、休息、理毛（2026-11-09 補齊動作庫規劃中的動作）----------
# 休息：母雞蹲（香盒坐）／人面獅身：肚子貼地、頭抬著，前腳往前平放，後腳收在身體兩側，尾巴貼地繞到右側，眼睛半瞇
REST_FRONT = [(0.0, 0.25, -0.97), (0.0, -1.0, -0.05), (0.0, -1.0, 0.0)]              # 上臂往下、前臂與掌往前平放
REST_HIND = [(0.5, -0.7, -0.5), (0.12, 0.8, -0.6), (0.0, -1.0, -0.04), (0.0, -0.3, 0.95), (0.0, -1.0, -0.35)]   # 同幼貓坐姿的後腳
REST_NECK = [(0.0, -0.55, 0.83), (0.0, -0.9, 0.42)]
REST_HEAD = (0.0, -1.0, 0.0)
REST_TAIL = [(-0.2, 0.95, -0.25), (-0.5, 0.85, -0.1), (-0.8, 0.55, 0.0), (-0.97, 0.1, 0.0),
             (-0.85, -0.5, 0.0), (-0.55, -0.83, 0.0), (-0.25, -0.97, 0.0)]
# 理毛：休息姿勢，左前腳抬到嘴邊，頭往下偏向腳掌舔
GROOM_HEAD = (0.25, -0.55, -0.8)
GROOM_NECK = [(0.1, -0.6, 0.79), (0.2, -0.85, 0.1)]
GROOM_LICK_SEC = 0.45
# 撒嬌：站著，尾巴豎直、尾尖往前勾，頭左右歪著蹭、身體前後輕晃，慢慢眨眼
CUDDLE_TAIL = [(0.0, 0.3, 0.95), (0.0, 0.1, 1.0), (0.0, 0.0, 1.0), (0.0, 0.0, 1.0),
               (0.0, -0.15, 0.99), (0.0, -0.5, 0.87), (0.0, -0.85, 0.53)]
CUDDLE_ROLL = 18                   # 頭左右歪的角度（度）
CUDDLE_SWAY = 0.012                # 身體前後晃（成貓公尺）


def _ground(p, body, frames, dz0, skip_tail=True):
    """讓第 0 格最低點（不含尾巴）貼地：已經用 move_root(dz=dz0) 打過的格數改成 dz0 + 位移"""
    bpy.context.scene.frame_set(0)
    bpy.context.view_layer.update()
    ev = body.evaluated_get(bpy.context.evaluated_depsgraph_get())
    mesh = ev.to_mesh()
    tail = {g.index for g in body.vertex_groups if g.name.startswith("tail")} if skip_tail else set()
    low = min((body.matrix_world @ mesh.vertices[v.index].co).z for v in body.data.vertices
              if not v.groups or max(v.groups, key=lambda g: g.weight).group not in tail)
    ev.to_mesh_clear()
    for f in frames:
        p.move_root(f, dz=dz0 - low)
    return dz0 - low


def _rest_pose(p, f, k, breath, groom=False):
    p.set("body", f, up=round(1.0 * breath, 1))
    for bone in ("body_top0", "body_top1"):
        p.set(bone, f)
    for lr, out in SIDES:
        leg = f"leg_front_{lr}"
        if not (groom and lr == "left"):
            for part, d in zip(("top0", "top1", "bot0"), REST_FRONT):
                p.aim(f"{leg}_{part}", f, (d[0] * out, d[1], d[2]))
            p.set(f"{leg}_ankle", f)
            p.set(f"{leg}_toe", f)
        for part, d in zip(("top0", "top1", "bot0", "ankle", "toe"), REST_HIND):
            p.aim(f"leg_hind_{lr}_{part}", f, (d[0] * out, d[1], d[2]))
    for i, d in enumerate(REST_TAIL):
        p.aim(f"tail{i}", f, d)


def _lie_down(p, body, n, keys, pose):
    """先在所有格數擺好、再整段往下貼地（不含尾巴）"""
    for f in keys:
        p.move_root(f, dz=0.0)
        pose(f)
    _ground(p, body, keys, 0.0)


def clip_rest(p, body, blink_keys):
    """休息：肚子貼地的母雞蹲，頭抬著平視，前腳往前平放、後腳收在兩側，尾巴繞到身側；呼吸起伏、眼睛半瞇。4 秒循環"""
    n = 4 * FPS
    k, _ = _begin(p, n)
    keys = range(0, n + 1, 10)

    def pose(f):
        breath = sin(f / n * 4 * pi)
        _rest_pose(p, f, k, breath)
        p.aim("neck0", f, REST_NECK[0], level="rest")
        p.aim("neck1", f, REST_NECK[1], level="rest")
        p.aim("head0", f, REST_HEAD, level="rest")

    _lie_down(p, body, n, keys, pose)
    blink_keys(body, [(0, 0.55), (50, 0.55), (56, 1), (66, 0.55), (n, 0.55)])
    return n


def clip_groom(p, body, blink_keys):
    """理毛：趴著（同休息），左前腳抬到嘴邊，頭往下偏向腳掌，規律舔毛；眼睛半閉。4 秒循環"""
    n = 4 * FPS
    k, _ = _begin(p, n)
    keys = range(0, n + 1, 3)

    def pose(f):
        t = f / FPS
        lick = round(10 * max(0.0, sin(2 * pi * t / GROOM_LICK_SEC)))     # 舔一下頭往上帶
        _rest_pose(p, f, k, 0.0, groom=True)
        p.aim("neck0", f, GROOM_NECK[0], level="rest")
        p.aim("neck1", f, GROOM_NECK[1], level="rest")
        a = radians(lick)
        hx, hy, hz = GROOM_HEAD
        p.aim("head0", f, (hx, round(hy * cos(a) - hz * sin(a), 2), round(hz * cos(a) + hy * sin(a), 2)), level="rest")
        # 左前腳：手腕拉到下巴前下方，掌心朝嘴
        bpy.context.view_layer.update()
        W = p.rig.matrix_world
        jaw = W @ p.rig.pose.bones["jaw"].tail
        target = jaw + Vector((0.004 * k, -0.01 * k, -0.045 * k))
        target = Vector((round(target.x, 3), round(target.y, 3), round(target.z, 3)))
        p.reach("leg_front_left_top0", "leg_front_left_top1", f, target, (0.2, 1.0, -0.3))
        p.aim("leg_front_left_bot0", f, (-0.25, -0.35, 0.9))
        p.set("leg_front_left_ankle", f)
        p.set("leg_front_left_toe", f)

    _lie_down(p, body, n, keys, pose)
    blink_keys(body, [(0, 0.75), (n, 0.75)])
    return n


def clip_cuddle(p, body, blink_keys):
    """撒嬌：站著，尾巴豎直、尾尖往前勾，頭左右歪著蹭，身體前後輕晃，耳朵微往後，慢慢眨眼。4 秒循環"""
    n = 4 * FPS
    k, rest = _begin(p, n)
    for f in range(0, n + 1, 4):
        t = f / n * 2 * pi
        p.move_root(f, dz=0.0, forward=round(CUDDLE_SWAY * k * sin(t), 4))
        roll = round(CUDDLE_ROLL * sin(t * 2))
        p.aim("neck0", f, (0.0, -0.45, 0.89), level="rest")
        p.aim("neck1", f, (0.0, -0.85, 0.53), level="rest")
        p.world("head0", f, roll=roll, yaw=round(-8 * sin(t * 2)))
        p.set("ear_left", f, side=-8)
        p.set("ear_right", f, side=8)
        _plant_legs(p, f, rest)
        for i, d in enumerate(CUDDLE_TAIL):
            p.aim(f"tail{i}", f, (round(0.08 * sin(t * 2 - i * 0.4), 2), d[1], d[2]))
    blink_keys(body, [(0, 0), (20, 0), (32, 1), (44, 0), (80, 0), (92, 1), (104, 0), (n, 0)])   # 慢慢眨眼
    return n


NEED_CLIPS = {"eat": clip_eat, "drink": clip_drink, "toilet": clip_toilet,
              "cuddle": clip_cuddle, "rest": clip_rest, "groom": clip_groom}
