"""
月面观星：信号接收锅 + 电视机。

用法（命令行调用本机 Blender，不开界面）：
  D:\\Blender\\blender-5.2.3-windows-x64\\blender.exe -b -P tools/blender/signal_tv.py

输出：
  tools/blender/signal_tv.blend           可以用 Blender 打开继续改
  public/models/lunar-signal-tv.glb       月面场景运行时加载
  tools/blender/signal_tv_preview.png     预览图

对象命名是和前端约好的接口，改名要同步改 scene-runtime/web/lunarSignalTv.ts：
  SignalDish（整个接收锅，原点在底座中心、贴地）
    DishHead（锅头，可绕竖轴转动对星）
      SignalLED（锅头上的指示灯，材质 Signal LED）
    CablePort（线缆接口位置）
  SignalTV（整台电视，原点在底部中心、贴地，屏幕朝 -Y，即 glTF 的 +Z）
    TVScreen（屏幕，材质 TV Screen，运行时换成动态画面）
    CablePort.TV（线缆接口位置）
单位：米。
"""
import math
import os

import bmesh
import bpy
from mathutils import Vector

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT_BLEND = os.path.join(ROOT, "tools", "blender", "signal_tv.blend")
OUT_GLB = os.path.join(ROOT, "public", "models", "lunar-signal-tv.glb")
OUT_PNG = os.path.join(ROOT, "tools", "blender", "signal_tv_preview.png")


# ---------- 基础工具 ----------

def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.unit_settings.system = "METRIC"
    scene.unit_settings.scale_length = 1.0


def material(name, color, metallic=0.0, roughness=0.5, emission=None, strength=0.0):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*color, 1.0)
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = roughness
    if emission is not None:
        bsdf.inputs["Emission Color"].default_value = (*emission, 1.0)
        bsdf.inputs["Emission Strength"].default_value = strength
    return mat


def assign(obj, mat):
    obj.data.materials.clear()
    obj.data.materials.append(mat)
    return obj


def shade_smooth(obj, angle=35):
    for poly in obj.data.polygons:
        poly.use_smooth = True
    try:
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.shade_auto_smooth(angle=math.radians(angle))
    except Exception:
        pass


def empty(name, location=(0, 0, 0), parent=None):
    obj = bpy.data.objects.new(name, None)
    obj.empty_display_size = 0.1
    obj.location = location
    bpy.context.collection.objects.link(obj)
    if parent:
        obj.parent = parent
    return obj


def parent_keep(child, parent):
    world = child.matrix_world.copy()
    child.parent = parent
    child.matrix_world = world


def cylinder(name, radius, depth, location, rotation=(0, 0, 0), vertices=24, mat=None):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=location, rotation=rotation)
    obj = bpy.context.active_object
    obj.name = name
    if mat:
        assign(obj, mat)
    return obj


def box(name, size, location, mat=None, bevel=0.0):
    bpy.ops.mesh.primitive_cube_add(size=1, location=location)
    obj = bpy.context.active_object
    obj.name = name
    obj.scale = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel > 0:
        mod = obj.modifiers.new("Bevel", "BEVEL")
        mod.width = bevel
        mod.segments = 3
        mod.limit_method = "ANGLE"
    if mat:
        assign(obj, mat)
    return obj


def rod(name, start, end, radius, mat, vertices=12):
    """两点之间的圆杆。"""
    start, end = Vector(start), Vector(end)
    mid = (start + end) / 2
    direction = end - start
    obj = cylinder(name, radius, direction.length, mid, vertices=vertices, mat=mat)
    obj.rotation_mode = "QUATERNION"
    obj.rotation_quaternion = direction.to_track_quat("Z", "Y")
    return obj


def sphere(name, radius, location, mat, segments=24):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=segments // 2, radius=radius, location=location)
    obj = bpy.context.active_object
    obj.name = name
    assign(obj, mat)
    shade_smooth(obj, 80)
    return obj


def apply_modifiers(obj):
    bpy.context.view_layer.objects.active = obj
    for mod in list(obj.modifiers):
        bpy.ops.object.modifier_apply(modifier=mod.name)


# ---------- 材质 ----------

def make_materials():
    return {
        "dish": material("Dish White Paint", (0.86, 0.87, 0.85), metallic=0.1, roughness=0.42),
        "dish_inner": material("Dish Reflector", (0.78, 0.80, 0.82), metallic=0.55, roughness=0.28),
        "metal": material("Mount Grey Metal", (0.32, 0.34, 0.37), metallic=0.8, roughness=0.38),
        "dark": material("Dark Rubber", (0.05, 0.05, 0.055), roughness=0.7),
        "lnb": material("Feed Horn", (0.92, 0.62, 0.20), metallic=0.3, roughness=0.4),
        "led": material("Signal LED", (0.2, 1.0, 0.45), emission=(0.2, 1.0, 0.45), strength=6.0),
        "tv_body": material("TV Body Retro", (0.80, 0.47, 0.24), roughness=0.45),
        "tv_trim": material("TV Trim Cream", (0.90, 0.84, 0.70), roughness=0.5),
        "tv_bezel": material("TV Bezel", (0.08, 0.08, 0.09), roughness=0.35),
        "screen": material("TV Screen", (0.02, 0.025, 0.03), roughness=0.12, emission=(0.0, 0.0, 0.0), strength=0.0),
        "grille": material("TV Speaker Grille", (0.15, 0.13, 0.12), metallic=0.4, roughness=0.6),
        "knob": material("TV Knob", (0.18, 0.18, 0.19), metallic=0.6, roughness=0.3),
    }


# ---------- 信号接收锅 ----------

def paraboloid(name, radius, depth, rings=18, segments=56):
    """开口朝 +Z 的抛物面锅，z = depth * (r/R)^2。"""
    mesh = bpy.data.meshes.new(name)
    bm = bmesh.new()
    center = bm.verts.new((0, 0, 0))
    previous = None
    for ring in range(1, rings + 1):
        r = radius * ring / rings
        z = depth * (r / radius) ** 2
        current = [bm.verts.new((r * math.cos(2 * math.pi * s / segments), r * math.sin(2 * math.pi * s / segments), z)) for s in range(segments)]
        for s in range(segments):
            a, b = current[s], current[(s + 1) % segments]
            if previous is None:
                bm.faces.new((center, a, b))
            else:
                bm.faces.new((previous[s], previous[(s + 1) % segments], b, a))
        previous = current
    bm.normal_update()
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    return obj


def build_dish(m):
    root = empty("SignalDish")
    radius, depth = 0.72, 0.26
    pole_top = 1.18

    # 三脚底座 + 立柱
    base = cylinder("Dish Base Plate", 0.16, 0.05, (0, 0, 0.025), vertices=32, mat=m["metal"])
    for i in range(3):
        angle = math.radians(90 + 120 * i)
        foot = Vector((math.cos(angle) * 0.62, math.sin(angle) * 0.62, 0.02))
        rod(f"Dish Leg {i + 1}", (0, 0, 0.42), foot, 0.022, m["metal"])
        cylinder(f"Dish Foot {i + 1}", 0.07, 0.03, foot, vertices=20, mat=m["dark"])
    pole = cylinder("Dish Pole", 0.045, pole_top, (0, 0, pole_top / 2), vertices=24, mat=m["metal"])
    box("Dish Control Box", (0.16, 0.10, 0.2), (0, 0.075, 0.55), m["metal"], bevel=0.008)
    port = empty("CablePort", (0, 0.13, 0.5), root)
    for obj in (base, pole):
        shade_smooth(obj)

    # 锅头：可整体绕竖轴旋转。仰角 50°，锅口朝 -Y 方向上方。
    head = empty("DishHead", (0, 0, pole_top), root)
    yoke = box("Dish Yoke", (0.12, 0.12, 0.1), (0, 0, pole_top + 0.03), m["metal"], bevel=0.01)
    hinge = cylinder("Dish Hinge", 0.05, 0.24, (0, 0, pole_top + 0.09), rotation=(0, math.radians(90), 0), vertices=20, mat=m["metal"])

    dish = paraboloid("Dish Reflector", radius, depth)
    solid = dish.modifiers.new("Thickness", "SOLIDIFY")
    solid.thickness = 0.018
    solid.offset = -1
    apply_modifiers(dish)
    dish.data.materials.append(m["dish_inner"])
    dish.data.materials.append(m["dish"])
    # 内表面（法线朝上）用反射材质，外表面和边缘用白漆
    for poly in dish.data.polygons:
        poly.material_index = 0 if poly.normal.z > 0.2 else 1
    shade_smooth(dish, 50)
    bpy.ops.mesh.primitive_torus_add(major_radius=radius, minor_radius=0.016, major_segments=64, minor_segments=10, location=(0, 0, depth))
    rim = bpy.context.active_object
    rim.name = "Dish Rim"
    assign(rim, m["dish"])
    shade_smooth(rim, 80)
    back = cylinder("Dish Back Hub", 0.11, 0.08, (0, 0, -0.04), vertices=28, mat=m["metal"])

    # 馈源：焦点处的喇叭（LNB）+ 三根支撑杆
    focal = radius ** 2 / (4 * depth)
    lnb = cylinder("Feed Horn LNB", 0.05, 0.14, (0, 0, focal), vertices=24, mat=m["lnb"])
    cap = cylinder("Feed Horn Cap", 0.06, 0.03, (0, 0, focal - 0.07), vertices=24, mat=m["dark"])
    struts = []
    for i in range(3):
        angle = math.radians(90 + 120 * i)
        rim_point = (math.cos(angle) * radius * 0.96, math.sin(angle) * radius * 0.96, depth * 0.92)
        struts.append(rod(f"Feed Strut {i + 1}", rim_point, (0, 0, focal + 0.06), 0.011, m["metal"]))
    led = sphere("SignalLED", 0.022, (0, -0.055, focal + 0.02), m["led"], segments=16)

    dish_parts = [dish, rim, back, lnb, cap, led, *struts]
    for obj in (lnb, cap, back):
        shade_smooth(obj)
    # 把锅体整体抬到铰链上方、倾斜 50°（锅口朝 -Y 上方）
    tilt = empty("Dish Tilt", (0, 0, 0.12), head)  # 相对锅头
    for obj in dish_parts:
        obj.parent = tilt  # 直接挂上：锅体坐标就是相对倾斜轴的坐标
    tilt.rotation_euler = (math.radians(40), 0, 0)
    for obj in (yoke, hinge):
        parent_keep(obj, head)

    for obj in [base, pole, *[o for o in bpy.data.objects if o.name.startswith(("Dish Leg", "Dish Foot", "Dish Control"))]]:
        if obj.parent is None:
            parent_keep(obj, root)
    head.parent = root
    return root


# ---------- 电视机 ----------

def build_tv(m):
    root = empty("SignalTV")
    w, h, d = 0.86, 0.62, 0.5
    leg_h = 0.28
    body_z = leg_h + h / 2

    body = box("TV Cabinet", (w, d, h), (0, 0, body_z), m["tv_body"], bevel=0.05)
    back = box("TV Back Hood", (w * 0.72, d * 0.5, h * 0.74), (0, d * 0.55, body_z - 0.01), m["tv_body"], bevel=0.06)
    trim = box("TV Trim Band", (w + 0.006, d * 0.18, h + 0.006), (0, -d / 2 + 0.05, body_z), m["tv_trim"], bevel=0.04)

    # 屏幕区：左边大屏，右边旋钮 + 喇叭面板。屏幕朝 -Y
    screen_w, screen_h = 0.56, 0.44
    screen_x = -0.1
    front_y = -d / 2 - 0.012
    bezel = box("TV Bezel", (screen_w + 0.07, 0.03, screen_h + 0.07), (screen_x, front_y, body_z + 0.01), m["tv_bezel"], bevel=0.025)

    bpy.ops.mesh.primitive_plane_add(size=1, location=(screen_x, front_y - 0.017, body_z + 0.01), rotation=(math.radians(90), 0, 0))
    screen = bpy.context.active_object
    screen.name = "TVScreen"
    screen.scale = (screen_w, screen_h, 1)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    # 轻微鼓出的 CRT 屏
    sub = screen.modifiers.new("Subdiv", "SUBSURF")
    sub.levels = 3
    sub.subdivision_type = "SIMPLE"
    apply_modifiers(screen)
    for v in screen.data.vertices:
        nx, nz = v.co.x / (screen_w / 2), v.co.z / (screen_h / 2)
        v.co.y -= 0.018 * (1 - min(1, nx * nx)) * (1 - min(1, nz * nz))
    assign(screen, m["screen"])
    shade_smooth(screen, 80)
    # glTF 运行时要贴整张画面：按屏幕范围展 UV
    uv = screen.data.uv_layers.new(name="UVMap")
    for loop in screen.data.loops:
        co = screen.data.vertices[loop.vertex_index].co
        uv.data[loop.index].uv = (co.x / screen_w + 0.5, co.z / screen_h + 0.5)

    panel_x = w / 2 - 0.12
    panel = box("TV Control Panel", (0.17, 0.02, screen_h + 0.04), (panel_x, front_y + 0.002, body_z + 0.01), m["tv_trim"], bevel=0.012)
    knobs = []
    for i, z in enumerate((0.11, -0.01)):
        knob = cylinder(f"TV Knob {i + 1}", 0.035, 0.04, (panel_x, front_y - 0.025, body_z + z), rotation=(math.radians(90), 0, 0), vertices=24, mat=m["knob"])
        shade_smooth(knob)
        knobs.append(knob)
    grille_parts = []
    for i in range(5):
        grille_parts.append(box(f"TV Grille Slot {i + 1}", (0.11, 0.008, 0.012), (panel_x, front_y - 0.006, body_z - 0.1 - i * 0.025), m["grille"]))
    power = sphere("TV Power Light", 0.011, (panel_x + 0.05, front_y - 0.01, body_z + 0.19), m["led"], segments=12)
    power.name = "TVPowerLight"

    legs = []
    for sx in (-1, 1):
        for sy in (-1, 1):
            top = (sx * (w / 2 - 0.1), sy * (d / 2 - 0.08), leg_h + 0.01)
            foot = (sx * (w / 2 - 0.04), sy * (d / 2 - 0.02), 0.0)
            legs.append(rod(f"TV Leg {len(legs) + 1}", top, foot, 0.018, m["metal"]))
            legs.append(cylinder(f"TV Leg Foot {len(legs)}", 0.03, 0.02, foot, vertices=16, mat=m["dark"]))
    port = empty("CablePort.TV", (0.2, d / 2 + 0.12, leg_h + 0.12), root)

    for obj in [body, back, trim, bezel, screen, panel, power, *knobs, *grille_parts, *legs]:
        parent_keep(obj, root)
    return root


# ---------- 预览 ----------

def render_preview(dish, tv):
    scene = bpy.context.scene
    for engine in ("BLENDER_EEVEE", "BLENDER_EEVEE_NEXT", "BLENDER_WORKBENCH"):
        try:
            scene.render.engine = engine
            break
        except TypeError:
            continue
    scene.render.resolution_x, scene.render.resolution_y = 1280, 800
    scene.render.filepath = OUT_PNG
    world = bpy.data.worlds.new("Preview World")
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.02, 0.025, 0.04, 1)
    scene.world = world
    bpy.ops.mesh.primitive_plane_add(size=12, location=(0, 0, 0))
    ground = bpy.context.active_object
    ground.name = "Preview Ground"
    assign(ground, material("Preview Regolith", (0.42, 0.41, 0.4), roughness=0.95))
    sun = bpy.data.objects.new("Preview Sun", bpy.data.lights.new("Preview Sun", "SUN"))
    sun.data.energy = 4
    sun.rotation_euler = (math.radians(50), 0, math.radians(-35))
    scene.collection.objects.link(sun)
    fill = bpy.data.objects.new("Preview Fill", bpy.data.lights.new("Preview Fill", "AREA"))
    fill.data.energy = 300
    fill.data.size = 4
    fill.location = (0, -5, 3)
    fill.rotation_euler = (math.radians(60), 0, 0)
    scene.collection.objects.link(fill)
    cam = bpy.data.objects.new("Preview Camera", bpy.data.cameras.new("Preview Camera"))
    scene.collection.objects.link(cam)
    cam.location = (0.6, -4.2, 1.6)
    target = Vector((0.35, 0, 0.75))
    cam.rotation_euler = (target - cam.location).to_track_quat("-Z", "Y").to_euler()
    cam.data.lens = 35
    scene.camera = cam
    dish.location = (-0.75, 0.6, 0)
    tv.location = (0.9, -0.2, 0)
    tv.rotation_euler = (0, 0, math.radians(-12))
    bpy.ops.render.render(write_still=True)
    # 预览用的东西不进 .blend / glb
    for obj in (ground, sun, cam, fill):
        bpy.data.objects.remove(obj)
    dish.location = (0, 0, 0)
    tv.location = (0, 0, 0)
    tv.rotation_euler = (0, 0, 0)


def main():
    reset_scene()
    m = make_materials()
    dish = build_dish(m)
    tv = build_tv(m)
    # 导出前把修改器都应用掉
    for obj in bpy.data.objects:
        if obj.type == "MESH" and obj.modifiers:
            apply_modifiers(obj)
    render_preview(dish, tv)
    # .blend 里两件东西错开摆，方便打开查看；glb 里各自在原点，由场景决定位置
    tv.location = (1.6, 0, 0)
    bpy.ops.wm.save_as_mainfile(filepath=OUT_BLEND)
    tv.location = (0, 0, 0)
    bpy.ops.object.select_all(action="DESELECT")
    bpy.ops.export_scene.gltf(
        filepath=OUT_GLB,
        export_format="GLB",
        export_apply=True,
        export_yup=True,
        export_extras=False,
        export_lights=False,
        export_cameras=False,
    )
    print("SIGNAL_TV_DONE", OUT_GLB)


main()
