"""
吃喝拉撒動作（eat／drink／toilet）：成貓 cat_base、幼貓 cat_base_kitten 的 stepC_clips.py 共用（Meowho #297，2026-11-09）。

兩隻骨架的骨頭名稱相同、比例不同；長度乘 k（= root 骨長 / 成貓 0.274 m），方向一律用世界方向（-Y＝往前、+Z＝往上）。
做法：整隻往下蹲 → 前半身往前下傾 → 脖子、頭用 aim 擺方向 → 四隻腳用兩節 IK 把 top1 尾端拉回站姿位置（腳掌不離地、不滑）。
每個動作開頭清掉 Poser 快取，並把所有骨頭先打上站姿關鍵影格（沒打的骨頭匯出 NLA 時會沿用前一個動作的姿勢）。
"""
from math import cos, pi, radians, sin

import bpy
from mathutils import Vector

FPS = 30
SIDES = (("left", 1), ("right", -1))

# 吃飯時鼻尖最低到離地多高（成貓公尺，幼貓乘 √k）：太低會穿過地板；幼貓頭比例大，會自動少蹲一點、脖子少伸一點
NOSE_MIN = 0.045
EAT_DROP = 0.06                    # 整隻往下蹲多少（成貓公尺）
EAT_FRONT_DROP = 0.07              # 胸口再多壓低多少（成貓公尺）
EAT_NECK = [(0.0, -0.55, -0.83), (0.0, -0.35, -0.94)]
EAT_HEAD = (0.0, -0.25, -0.97)     # 頭朝下（鼻尖朝碗）
FLAT_NECK = [(0.0, -0.9, -0.44), (0.0, -0.85, -0.53)]   # 脖子少伸時往這個方向收
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

    # 從完整幅度往下試：先少蹲、再少伸脖子，挑鼻尖不低於 NOSE_MIN 的最大幅度
    tries = [(m, 1.0) for m in (1.0, 0.85, 0.7, 0.55, 0.4, 0.25, 0.1, 0.0)] + [(0.0, r) for r in (0.8, 0.6, 0.4, 0.2, 0.0)]
    for m, r in tries:
        p.cache.clear()
        if _nose_z(p, lambda f: pose(f, m, r)) >= NOSE_MIN * k ** 0.5:
            break
    p.cache.clear()
    print(f"  蹲低 {m:.2f}、脖子 {r:.2f}")
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


NEED_CLIPS = {"eat": clip_eat, "drink": clip_drink, "toilet": clip_toilet}
