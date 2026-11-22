"""
月面观星：宇航员小人的整套动作（待机、随机小动作、聊天状态、遨游、被戳反应）。

用法（命令行调用本机 Blender）：
  D:\\Blender\\blender-5.2.3-windows-x64\\blender.exe -b -P tools/blender/astronaut_actions.py
  加 -- --preview  会再渲染每段动作的检查图到 tools/blender/astronaut_preview/
  加 -- --reel     会渲染一段把所有动作连起来的预览视频

输入：public/models/lunar-astronaut-supplied.glb（原模型，只带一段挥手）
输出：public/models/lunar-astronaut-actions.glb（同一个模型 + 全部动作）
      tools/blender/astronaut_actions.blend

做法：在原骨骼（Mixamo 标准骨骼）上逐帧算姿势再打关键帧。
每个旋转都写成“骨架坐标系里的旋转”，再换算到骨骼本地：
  骨架坐标：+X 是小人的左手边，-Y 是小人面朝的前方，+Z 向上。
  右手定则：低头 / 弯腰 = 绕 X 正转；向左转头 = 绕 Z 正转；头歪向左肩 = 绕 Y 正转；
           膝盖弯曲 = 小腿绕 X 正转；大腿前抬 = 绕 X 负转。
  手臂用 arms()/elbows() 写成“抬臂、前摆、弯肘”，弯肘绕的是由上臂方向算出的铰链轴。
子骨骼的旋转跟着父骨骼走（正常的 FK），所以“弯肘”在手臂抬起后依然是弯肘。

动作名是和前端约好的接口（scene-runtime/web/astronautBrain.ts）：
  Idle, Idle_LookEarth, Idle_CheckWrist, Idle_Stretch, Idle_PatHelmet, Idle_KickDust,
  Listen, Think, Talk, Float_JumpOff, Float_Loop, Float_Land,
  Poke_Head, Poke_Body, Poke_HighFive, Poke_Spin, Poke_Pout, Wave
"""
import math
import os
import sys

import bpy
from mathutils import Euler, Matrix, Quaternion, Vector

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SRC = os.path.join(ROOT, "public", "models", "lunar-astronaut-supplied.glb")
OUT_GLB = os.path.join(ROOT, "public", "models", "lunar-astronaut-actions.glb")
OUT_BLEND = os.path.join(ROOT, "tools", "blender", "astronaut_actions.blend")
PREVIEW_DIR = os.path.join(ROOT, "tools", "blender", "astronaut_preview")
FACE_BAKE = os.path.join(ROOT, "tools", "blender", "astronaut_face_original.png")

# 脸部贴片（表情层）覆盖的范围：骨架坐标 x 左右、z 上下（米），在头盔面罩开口里面。
# 场景里用画布在这块贴片上画表情（scene-runtime/web/astronautFace.ts），两边的数字要一致。
FACE_X = (-0.165, 0.165)
FACE_Z = (0.600, 0.815)
FACE_GRID = (40, 28)
ARGS = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
FPS = 24
STEP = 2  # 每隔几帧采样一次姿势，其余交给曲线插值

P = "mixamorig:"


# ---------------- 曲线小工具 ----------------

def smooth(t):
    t = max(0.0, min(1.0, t))
    return t * t * (3 - 2 * t)


def lerp(a, b, t):
    if isinstance(a, (tuple, list)):
        return tuple(x + (y - x) * t for x, y in zip(a, b))
    return a + (b - a) * t


def keys(t, points):
    """points: [(时间秒, 值), ...]，相邻两点之间用平滑曲线过渡。"""
    if t <= points[0][0]:
        return points[0][1]
    for (t0, v0), (t1, v1) in zip(points, points[1:]):
        if t <= t1:
            return lerp(v0, v1, smooth((t - t0) / max(1e-6, t1 - t0)))
    return points[-1][1]


def osc(t, period, amp, phase=0.0):
    return amp * math.sin(2 * math.pi * (t / period + phase))


def add(*poses):
    """把几层姿势叠起来：同一骨骼的角度相加。"""
    out = {}
    for pose in poses:
        for bone, value in pose.items():
            if bone in out:
                out[bone] = tuple(a + b for a, b in zip(out[bone], value))
            else:
                out[bone] = tuple(value)
    return out


def scale(pose, k):
    return {bone: tuple(v * k for v in value) for bone, value in pose.items()}


# ---------------- 常用姿势片段（角度：度；"hips" 是位移，米） ----------------
# 这个小人静止时两臂向外斜下约 30°（不是贴身下垂），所以手臂用三个直观量来写：
#   抬臂 raise：向上抬的角度；前摆 fwd：在水平方向往身前摆的角度；弯肘 bend：小臂往身前弯。

def arms(left=None, right=None):
    """left / right = (抬臂, 前摆) 或 (抬臂, 前摆, 扭转)。"""
    out = {}
    if left is not None:
        raise_, fwd, *tw = left
        out["LeftArm"] = (tw[0] if tw else 0, -raise_, -fwd)
    if right is not None:
        raise_, fwd, *tw = right
        out["RightArm"] = (tw[0] if tw else 0, raise_, fwd)
    return out


def elbows(left=None, right=None):
    out = {}
    if left is not None:
        out["elbowL"] = (left, 0, 0)
    if right is not None:
        out["elbowR"] = (right, 0, 0)
    return out


def breathe(t, amount=1.0):
    """低重力下的呼吸漂浮：身体轻轻起伏、手臂微微飘开。"""
    b = osc(t, 3.0, 1.0)
    return scale(add({
        "hips": (0, 0, 0.006 * b),
        "Spine1": (osc(t, 3.0, 1.2, .1), 0, 0),
        "Spine2": (osc(t, 3.0, 1.5, .15), 0, 0),
        "Head": (osc(t, 3.0, 1.5, .3), 0, 0),
    }, arms((4 + 3 * b, 4), (4 + 3 * b, 4)), elbows(10, 10)), amount)


def crossed_arms():
    """双手抱在胸前（这个小人手臂短，叉腰会显得手放在肚子前，抱臂更像“哼”）。"""
    return add(arms((-5, 55), (0, 62)), elbows(110, 116))


def blend_into(pose, target, k):
    """把 pose 里 target 涉及的骨骼按比例 k 换成 target。"""
    out = dict(pose)
    for bone, value in target.items():
        out[bone] = lerp(pose.get(bone, (0, 0, 0)), value, k)
    return out


# ---------------- 各段动作：函数(t 秒) -> 姿势 ----------------

def idle(t):
    look = osc(t, 6.0, 9)  # 偶尔左右看看
    return add(breathe(t), {"Head": (0, osc(t, 6.0, 2, .25), look), "Neck": (0, 0, look * .4)})


def look_earth(t):
    up = keys(t, [(0, 0), (.8, 1), (3.2, 1), (4, 0)])
    hand = keys(t, [(0, 0), (1.0, 1), (2.9, 1), (3.6, 0)])
    pose = add(breathe(t, 1 - .5 * up), {
        "Head": (-30 * up, 0, 18 * up), "Neck": (-8 * up, 0, 6 * up),
        "Spine2": (-8 * up, 0, 0), "Spine1": (-4 * up, 0, 0),
    })
    # 右手搭在额前遮光
    return blend_into(pose, add(arms(right=(20, 30, -60)), elbows(right=80), {"RightHand": (-20, 0, 0)}), hand)


def check_wrist(t):
    lift = keys(t, [(0, 0), (.7, 1), (2.8, 1), (3.5, 0)])
    tap_on = keys(t, [(0, 0), (1.2, 0), (1.4, 1), (2.4, 1), (2.6, 0)])
    tap = max(0.0, osc(t, .5, 1))
    pose = add(breathe(t, 1 - .6 * lift), {"Head": (26 * lift, 0, 18 * lift), "Neck": (6 * lift, 0, 5 * lift)})
    pose = blend_into(pose, add(arms(left=(25, 75, -30)), elbows(left=105), {"LeftHand": (0, 0, 0)}), lift)
    return blend_into(pose, add(arms(right=(15, 55)), elbows(right=75 + 12 * tap)), tap_on)


def stretch(t):
    up = keys(t, [(0, 0), (1.1, 1), (2.6, 1), (3.6, 0)])
    lean = osc(t, 2.4, 1) * keys(t, [(0, 0), (1.1, 0), (1.4, 1), (2.4, 1), (2.6, 0)])
    pose = add(breathe(t, 1 - up), {
        "hips": (0, 0, .012 * up),
        "Spine2": (-8 * up, 6 * lean, 0), "Spine1": (-5 * up, 4 * lean, 0),
        "Head": (-14 * up, 0, 0),
    })
    return blend_into(pose, add(arms((150, 15), (150, 15)), elbows(10, 10)), up)


def pat_helmet(t):
    reach = keys(t, [(0, 0), (.6, 1), (2.3, 1), (3, 0)])
    pat = max(0.0, osc(t, .45, 1)) * keys(t, [(0, 0), (.7, 0), (.8, 1), (2.1, 1), (2.2, 0)])
    pose = add(breathe(t, 1 - reach), {"Head": (6 * pat, -6 * reach, 0)})
    # 头盔很大（约 0.54 米宽），手够不到顶上，就拍拍头盔侧面
    return blend_into(pose, add(arms(right=(30 + 12 * pat, -60, -90)), elbows(right=30)), reach)


def kick_dust(t):
    kick = keys(t, [(0, 0), (.7, -.25), (1.0, 1), (1.4, .2), (2.2, 0)])
    look = keys(t, [(0, 0), (.5, 1), (2.3, 1), (3, 0)])
    return add(breathe(t, .5), arms((8 * abs(kick), 0), (8 * abs(kick), 0)), {
        "RightUpLeg": (-45 * kick, 0, 0), "RightLeg": (100 * max(0, -kick) + 10 * max(0, kick), 0, 0),
        "Head": (26 * look, 0, 0), "Spine2": (8 * look, 0, 0),
    })


def listen(t):
    nod = max(0.0, osc(t, 2.0, 1)) ** 2
    return add(breathe(t), {"Head": (6 + 8 * nod, 13, 4), "Neck": (2, 4, 0), "Spine2": (4, 0, 0)})


def think(t):
    tap = osc(t, 1.4, 1)
    pose = add(breathe(t, .5), {"Head": (-6 + 2 * tap, -8, -6), "Neck": (-2, -3, -2), "Spine2": (2, 0, -3)})
    # 右手托下巴，左手横在肚子前托着右肘
    return blend_into(pose, add(arms((-10, 40), (60, 60)), elbows(100, 100 + 4 * tap), {"RightHand": (-20, 0, 0)}), 1)


def talk(t):
    a, b = osc(t, 1.5, 1), osc(t, 1.5, 1, .35)
    pose = add(breathe(t, .6), {"Head": (osc(t, .75, 3), 0, osc(t, 3, 6)), "Spine2": (0, 0, osc(t, 3, 3))})
    return blend_into(pose, add(arms((8 + 6 * a, 45 + 10 * a), (8 + 6 * b, 45 + 10 * b)), elbows(75 + 18 * a, 75 + 18 * b),
                                {"LeftHand": (0, 0, 15 * a), "RightHand": (0, 0, -15 * b)}), 1)


def jump_off(t):
    crouch = keys(t, [(0, 0), (.35, 1), (.6, -.4), (1.0, -.3)])
    arm_up = keys(t, [(0, 0), (.35, -.3), (.7, 1), (1.0, 1)])
    c = max(0.0, crouch)
    return add({
        "hips": (0, 0, -.045 * c),
        "LeftUpLeg": (-45 * c, 0, 0), "RightUpLeg": (-45 * c, 0, 0),
        "LeftLeg": (85 * c, 0, 0), "RightLeg": (85 * c, 0, 0),
        "LeftFoot": (-35 * c + 25 * max(0, -crouch), 0, 0), "RightFoot": (-35 * c + 25 * max(0, -crouch), 0, 0),
        "Spine1": (14 * c, 0, 0), "Spine2": (8 * c, 0, 0),
        "Head": (-10 * max(0, arm_up), 0, 0),
    }, arms((90 * arm_up, -10 * c), (90 * arm_up, -10 * c)), elbows(15, 15))


def float_pose(t):
    """漂浮：身体前倾像在游，四肢慢慢划动。"""
    paddle, kick = osc(t, 2.0, 1), osc(t, 2.0, 1, .25)
    return add({
        "hips": (0, 0, .01 * osc(t, 4.0, 1)),
        "Hips": (14, 0, osc(t, 4.0, 3)),
        "Spine1": (4, osc(t, 4.0, 2), 0), "Spine2": (4, 0, 0),
        "Head": (-16, 0, osc(t, 4.0, 5)),
        "LeftUpLeg": (-25 + 14 * kick, -6, 0), "RightUpLeg": (-25 - 14 * kick, 6, 0),
        "LeftLeg": (40 - 10 * kick, 0, 0), "RightLeg": (40 + 10 * kick, 0, 0),
        "LeftFoot": (25, 0, 0), "RightFoot": (25, 0, 0),
    }, arms((32 + 12 * paddle, 15 - 12 * paddle), (32 - 12 * paddle, 15 + 12 * paddle)), elbows(25 + 10 * paddle, 25 - 10 * paddle))


def float_loop(t):
    return float_pose(t)


def float_land(t):
    k = keys(t, [(0, 0), (.35, 1)])          # 从漂浮姿势收回
    out = keys(t, [(0, 0), (.25, 0), (.55, 1), (1.2, 0)])  # 落地缓冲
    land = add({
        "hips": (0, 0, -.04 * out),
        "LeftUpLeg": (-40 * out, 0, 0), "RightUpLeg": (-40 * out, 0, 0),
        "LeftLeg": (75 * out, 0, 0), "RightLeg": (75 * out, 0, 0),
        "LeftFoot": (-32 * out, 0, 0), "RightFoot": (-32 * out, 0, 0),
        "Spine1": (12 * out, 0, 0),
    }, arms((4 + 40 * out, 4 + 20 * out), (4 + 40 * out, 4 + 20 * out)), elbows(10 + 15 * out, 10 + 15 * out))
    floating = float_pose(0)
    return {bone: lerp(floating.get(bone, (0, 0, 0)), land.get(bone, (0, 0, 0)), k) for bone in set(floating) | set(land)}


def poke_head(t):
    cover = keys(t, [(0, 0), (.25, 1), (1.7, 1), (2.0, 0)])
    wobble = osc(t, .32, 1) * keys(t, [(0, 0), (.2, 1), (1.5, 1), (1.8, 0)])
    shoo = keys(t, [(0, 0), (1.8, 0), (2.1, 1), (2.9, 1), (3.2, 0)])
    wave = osc(t, .4, 1) * shoo
    pose = add(breathe(t, .4), {
        "Head": (10 * cover, 9 * wobble, 0), "Spine2": (10 * cover, 0, 0), "Spine1": (6 * cover, 0, 0),
        "hips": (0, 0, -.012 * cover),
    })
    pose = blend_into(pose, add(arms((30, -60, -90), (30, -60, -90)), elbows(30, 30)), cover)  # 双手捂住头盔两侧
    # 捂完头，右手在身前摆一摆：“别闹”
    return blend_into(pose, add(arms(right=(20, 70)), elbows(right=95), {"RightHand": (0, 0, 35 * wave)}), shoo)


def poke_body(t):
    flinch = keys(t, [(0, 0), (.15, 1), (.7, .8), (1.3, 0)])
    wiggle = osc(t, .35, 1) * keys(t, [(0, 0), (.2, 1), (1.1, 1), (1.4, 0)])
    pose = add(breathe(t, .4), {
        "hips": (0, .02 * flinch, -.01 * flinch),
        "Hips": (0, 0, 10 * wiggle),
        "Spine1": (18 * flinch, 0, 8 * wiggle), "Spine2": (12 * flinch, 0, 6 * wiggle),
        "Head": (-10 * flinch, 0, -12 * wiggle),
    })
    return blend_into(pose, add(arms((0, 65), (0, 65)), elbows(95, 95)), flinch)


def poke_highfive(t):
    up = keys(t, [(0, 0), (.4, 1), (1.3, 1), (1.8, 0)])
    hit = keys(t, [(0, 0), (.55, 0), (.65, 1), (.85, 0)])
    bounce = keys(t, [(0, 0), (.6, 0), (.75, 1), (1.1, 0)])
    pose = add(breathe(t, 1 - up), {"Spine2": (-6 * up + 6 * hit, 0, 0), "Head": (-12 * up, 0, 0), "hips": (0, 0, .015 * bounce)})
    return blend_into(pose, add(arms(right=(100 - 8 * hit, 40 + 8 * hit, 0)), elbows(right=20), {"RightHand": (-25, 0, 0)}), up)


def poke_spin(t):
    """漂浮中被戳：手脚缩起来（整个人的转圈由场景程序控制）。"""
    tuck = keys(t, [(0, 0), (.3, 1), (2.0, 1), (2.5, 0)])
    flail = osc(t, .5, 1) * keys(t, [(0, 0), (.2, 1), (.6, 0)])
    tucked = add({
        "LeftUpLeg": (-55, 0, 0), "RightUpLeg": (-55, 0, 0), "LeftLeg": (90, 0, 0), "RightLeg": (90, 0, 0),
        "Spine1": (20, 0, 0), "Head": (10, 0, 0),
    }, arms((10 + 20 * flail, 50), (10 - 20 * flail, 50)), elbows(100, 100))
    return blend_into(float_pose(t), tucked, tuck)


def poke_pout(t):
    hips_on = keys(t, [(0, 0), (.4, 1), (3.6, 1), (4.0, 0)])
    turn = keys(t, [(0, 0), (.9, 0), (1.5, 1), (3.1, 1), (3.6, 0)])
    stomp = keys(t, [(0, 0), (.4, 0), (.6, 1), (.8, 0)])
    wave_on = keys(t, [(0, 0), (3.7, 0), (4.0, 1), (5.0, 1), (5.3, 0)])
    wave = osc(t, .5, 1) * wave_on
    pose = add(breathe(t, .5), {
        "Hips": (0, 0, 150 * turn),
        "Head": (-8 * hips_on * (1 - turn), 0, 25 * turn),
        "RightUpLeg": (-25 * stomp, 0, 0), "RightLeg": (30 * stomp, 0, 0),
        "Spine2": (-6 * hips_on, 0, 0),
    })
    pose = blend_into(pose, crossed_arms(), hips_on)
    # 和好：右手举起挥一挥
    return blend_into(pose, add(arms(right=(120, 25)), elbows(right=35 + 25 * wave)), wave_on)


CLIPS = [
    # 名字, 秒数, 函数, 是否循环
    ("Idle", 6.0, idle, True),
    ("Idle_LookEarth", 4.0, look_earth, False),
    ("Idle_CheckWrist", 3.5, check_wrist, False),
    ("Idle_Stretch", 3.6, stretch, False),
    ("Idle_PatHelmet", 3.0, pat_helmet, False),
    ("Idle_KickDust", 3.0, kick_dust, False),
    ("Listen", 4.0, listen, True),
    ("Think", 4.2, think, True),
    ("Talk", 3.0, talk, True),
    ("Float_JumpOff", 1.0, jump_off, False),
    ("Float_Loop", 4.0, float_loop, True),
    ("Float_Land", 1.2, float_land, False),
    ("Poke_Head", 3.2, poke_head, False),
    ("Poke_Body", 1.6, poke_body, False),
    ("Poke_HighFive", 1.9, poke_highfive, False),
    ("Poke_Spin", 2.5, poke_spin, False),
    ("Poke_Pout", 5.4, poke_pout, False),
]


# ---------------- 写进 Blender ----------------

def load():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.scene.render.fps = FPS
    bpy.ops.import_scene.gltf(filepath=SRC)
    arm = next(o for o in bpy.data.objects if o.type == "ARMATURE")
    # 导入器给骨骼显示生成的小球，不属于模型
    for o in list(bpy.data.objects):
        if o.type == "MESH" and o.parent is None:
            bpy.data.objects.remove(o)
    return arm


def capture_base(arm):
    """原挥手动画第 1 帧就是自然站姿，所有动作都叠在它上面。"""
    bpy.context.scene.frame_set(1)
    base = {}
    for pb in arm.pose.bones:
        base[pb.name] = (pb.rotation_quaternion.copy(), pb.location.copy())
    return base


HINGES = {}


def elbow_axis(arm, side):
    """弯肘铰链轴：上臂方向 × 正前方，绕它正转时小臂往身前弯。"""
    if side not in HINGES:
        upper = arm.data.bones[P + side + "Arm"]
        fore = arm.data.bones[P + side + "ForeArm"]
        direction = (fore.head_local - upper.head_local).normalized()
        HINGES[side] = direction.cross(Vector((0, -1, 0))).normalized()
    return HINGES[side]


def apply_pose(arm, base, pose):
    for pb in arm.pose.bones:
        q0, l0 = base[pb.name]
        short = pb.name[len(P):] if pb.name.startswith(P) else pb.name
        rot = pose.get(short)
        hinge = None
        if short in ("LeftForeArm", "RightForeArm"):
            bend = pose.get("elbowL" if short.startswith("Left") else "elbowR")
            if bend:
                hinge = Matrix.Rotation(math.radians(bend[0]), 3, elbow_axis(arm, short[:-7]))
        if rot or hinge:
            # 骨架坐标系里的旋转 → 骨骼本地：R_local = M⁻¹ · R · M
            m = pb.bone.matrix_local.to_3x3()
            r = Euler(tuple(math.radians(v) for v in (rot or (0, 0, 0))), "XYZ").to_matrix()
            if hinge:
                r = r @ hinge
            local = (m.inverted() @ r @ m).to_quaternion()
            pb.rotation_quaternion = local @ q0
        else:
            pb.rotation_quaternion = q0
        if short == "Hips" and "hips" in pose:
            m = pb.bone.matrix_local.to_3x3()
            pb.location = l0 + m.inverted() @ Vector(pose["hips"])
        else:
            pb.location = l0


def bake(arm, base, name, seconds, fn, loop):
    action = bpy.data.actions.new(name)
    arm.animation_data.action = action
    frames = max(2, round(seconds * FPS))
    sample = list(range(0, frames + 1, STEP))
    if sample[-1] != frames:
        sample.append(frames)
    for f in sample:
        # 循环动作最后一帧回到开头的姿势，接缝处不跳
        t = 0.0 if (loop and f == frames) else f / FPS
        pose = fn(t)
        apply_pose(arm, base, pose)
        for pb in arm.pose.bones:
            pb.keyframe_insert("rotation_quaternion", frame=f + 1)
            if pb.name == P + "Hips":
                pb.keyframe_insert("location", frame=f + 1)
    action.use_fake_user = True
    return action


def build_face_decal(arm):
    """在脸上贴一层很薄的曲面：沿着脸的弧度投影上去，绑在头骨上，UV 铺满 0~1。
    原来画在贴图上的五官先烘焙到这层上，作为参照和兜底；场景里再换成能动的表情画布。"""
    import bmesh
    body = next(o for o in arm.children if o.type == "MESH")
    mesh = bpy.data.meshes.new("Astronaut_Face")
    bm = bmesh.new()
    nx, nz = FACE_GRID
    verts = [[bm.verts.new((FACE_X[0] + (FACE_X[1] - FACE_X[0]) * i / nx, -0.6, FACE_Z[0] + (FACE_Z[1] - FACE_Z[0]) * j / nz))
              for i in range(nx + 1)] for j in range(nz + 1)]
    uv_layer = bm.loops.layers.uv.new("UVMap")
    for j in range(nz):
        for i in range(nx):
            face = bm.faces.new((verts[j][i], verts[j][i + 1], verts[j + 1][i + 1], verts[j + 1][i]))
            for loop in face.loops:
                co = loop.vert.co
                loop[uv_layer].uv = ((co.x - FACE_X[0]) / (FACE_X[1] - FACE_X[0]), (co.z - FACE_Z[0]) / (FACE_Z[1] - FACE_Z[0]))
    bm.to_mesh(mesh); bm.free()
    face_obj = bpy.data.objects.new("Astronaut_Face", mesh)
    bpy.context.collection.objects.link(face_obj)
    # 沿 +Y（朝脸）投影到身体上，再往外抬 2 毫米，避免和原来的脸打架
    sw = face_obj.modifiers.new("Project", "SHRINKWRAP")
    sw.target = body
    sw.wrap_method = "PROJECT"
    sw.use_project_y = True
    sw.use_negative_direction = False
    sw.use_positive_direction = True
    sw.offset = 0.0
    bpy.context.view_layer.objects.active = face_obj
    bpy.ops.object.modifier_apply(modifier=sw.name)
    for v in mesh.vertices:
        v.co.y -= 0.0022
    for poly in mesh.polygons:
        poly.use_smooth = True
    # 绑到头骨
    group = face_obj.vertex_groups.new(name=P + "Head")
    group.add(list(range(len(mesh.vertices))), 1.0, "REPLACE")
    face_obj.parent = arm
    mod = face_obj.modifiers.new("Armature", "ARMATURE")
    mod.object = arm
    # 材质：原贴图的五官烘焙进来
    mat = bpy.data.materials.new("Astronaut Face")
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    bsdf = nodes.get("Principled BSDF")
    bsdf.inputs["Roughness"].default_value = 0.55
    image = bpy.data.images.new("astronaut_face_original", 512, 336, alpha=True)
    tex = nodes.new("ShaderNodeTexImage"); tex.image = image
    mat.node_tree.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    mesh.materials.append(mat)
    nodes.active = tex
    bake_face(body, face_obj, image)
    image.filepath_raw = FACE_BAKE
    image.file_format = "PNG"
    image.save()
    return face_obj


def bake_face(body, face_obj, image):
    """把身体贴图上的五官颜色烘焙到脸部贴片上（Cycles 选中到活动）。"""
    scene = bpy.context.scene
    old_engine = scene.render.engine
    scene.render.engine = "CYCLES"
    scene.cycles.samples = 4
    scene.render.bake.use_selected_to_active = True
    scene.render.bake.cage_extrusion = 0.01
    scene.render.bake.max_ray_distance = 0.03
    scene.render.bake.use_pass_direct = False
    scene.render.bake.use_pass_indirect = False
    scene.render.bake.use_pass_color = True
    bpy.ops.object.select_all(action="DESELECT")
    body.select_set(True)
    face_obj.select_set(True)
    bpy.context.view_layer.objects.active = face_obj
    bpy.ops.object.bake(type="DIFFUSE")
    scene.render.engine = old_engine


def main():
    arm = load()
    build_face_decal(arm)
    wave = arm.animation_data.action
    base = capture_base(arm)
    wave.name = "Wave"
    wave.use_fake_user = True
    made = [wave]
    for name, seconds, fn, loop in CLIPS:
        made.append(bake(arm, base, name, seconds, fn, loop))
    # 导出：每个动作单独成一段 glTF 动画。导入时自带的轨道（原挥手的副本）先清掉
    for track in list(arm.animation_data.nla_tracks):
        arm.animation_data.nla_tracks.remove(track)
    arm.animation_data.action = made[1]
    for action in made:
        track = arm.animation_data.nla_tracks.new()
        track.name = action.name
        track.strips.new(action.name, 1, action)
        track.mute = True
    arm.animation_data.action = None
    bpy.ops.wm.save_as_mainfile(filepath=OUT_BLEND)
    bpy.ops.object.select_all(action="DESELECT")
    arm.select_set(True)
    for child in arm.children:
        child.select_set(True)
    bpy.ops.export_scene.gltf(
        filepath=OUT_GLB, export_format="GLB", use_selection=True,
        export_animations=True, export_animation_mode="NLA_TRACKS",
        export_force_sampling=True, export_frame_step=1,
        export_optimize_animation_size=True,
    )
    print("ASTRONAUT_DONE", OUT_GLB, [a.name for a in made])
    if "--preview" in ARGS:
        preview(arm, made)
    if "--reel" in ARGS:
        reel(arm, made)


# ---------------- 检查图 / 预览视频 ----------------

def setup_render(width, height):
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_WORKBENCH"
    scene.display.shading.light = "STUDIO"
    scene.display.shading.color_type = "TEXTURE"
    scene.display.shading.show_shadows = True
    scene.render.resolution_x, scene.render.resolution_y = width, height
    scene.render.film_transparent = False
    world = bpy.data.worlds.new("Preview") if not scene.world else scene.world
    scene.world = world
    world.color = (0.05, 0.06, 0.09)
    if "Preview Camera" not in bpy.data.objects:
        cam = bpy.data.objects.new("Preview Camera", bpy.data.cameras.new("Preview Camera"))
        scene.collection.objects.link(cam)
        cam.data.lens = 50
        scene.camera = cam
        bpy.ops.mesh.primitive_plane_add(size=6, location=(0, 0, 0))
        bpy.context.active_object.name = "Preview Floor"
    return scene.camera


def aim(cam, yaw_deg):
    target = Vector((0, 0, .32))
    d = 1.75
    yaw = math.radians(yaw_deg)
    cam.location = target + Vector((math.sin(yaw) * d, -math.cos(yaw) * d, .22))
    cam.rotation_euler = (target - cam.location).to_track_quat("-Z", "Y").to_euler()


def preview(arm, actions):
    """每段动作取 4 个时刻 × 正面/侧面，拼成一张检查图。"""
    import numpy as np
    os.makedirs(PREVIEW_DIR, exist_ok=True)
    cam = setup_render(240, 240)
    scene = bpy.context.scene
    for action in actions:
        arm.animation_data.action = action
        start, end = action.frame_range
        tiles = []
        for yaw in (20, 90):
            row = []
            for k in range(4):
                f = int(start + (end - start) * (k + .5) / 4)
                scene.frame_set(f)
                aim(cam, yaw)
                path = os.path.join(PREVIEW_DIR, "_tile.png")
                scene.render.filepath = path
                bpy.ops.render.render(write_still=True)
                img = bpy.data.images.load(path, check_existing=False)
                px = np.empty(img.size[0] * img.size[1] * 4, dtype=np.float32)
                img.pixels.foreach_get(px)
                row.append(px.reshape(img.size[1], img.size[0], 4))
                bpy.data.images.remove(img)
            tiles.append(np.concatenate(row, axis=1))
        sheet = np.concatenate(tiles[::-1], axis=0)
        h, w = sheet.shape[:2]
        out = bpy.data.images.new(action.name, w, h)
        out.pixels.foreach_set(sheet.ravel())
        out.filepath_raw = os.path.join(PREVIEW_DIR, f"{action.name}.png")
        out.file_format = "PNG"
        out.save()
    try:
        os.remove(os.path.join(PREVIEW_DIR, "_tile.png"))
    except OSError:
        pass
    print("PREVIEW_DONE", PREVIEW_DIR)


def reel(arm, actions):
    """把全部动作连成一段预览视频（每段前面停半秒）。"""
    cam = setup_render(540, 540)
    scene = bpy.context.scene
    aim(cam, 25)
    track_frames = 1
    for action in actions:
        track = arm.animation_data.nla_tracks[action.name]
        track.mute = False
        strip = track.strips[0]
        length = strip.frame_end - strip.frame_start
        strip.frame_start = track_frames
        strip.frame_end = track_frames + length
        track_frames += int(length) + 12
    scene.frame_start, scene.frame_end = 1, track_frames
    if hasattr(scene.render.image_settings, "media_type"):
        scene.render.image_settings.media_type = "VIDEO"  # Blender 5 起视频要先切到“视频”类型
    scene.render.image_settings.file_format = "FFMPEG"
    scene.render.ffmpeg.format = "MPEG4"
    scene.render.ffmpeg.codec = "H264"
    scene.render.filepath = os.path.join(ROOT, "tools", "blender", "astronaut_actions_preview.mp4")
    bpy.ops.render.render(animation=True)
    print("REEL_DONE", scene.render.filepath)


if __name__ == "__main__":
    main()
