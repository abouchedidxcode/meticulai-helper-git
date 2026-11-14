# Bakes each room's light (direct and bounced, without surface colour) into bake/<room>.exr
# (tools/pack-lightmaps.mjs then packs those for the demo).
#   blender -b --factory-startup --python tools/bake.py -- [--rooms a,b] [--samples 1024]
# Reads public/level.json (tools/build-level.mjs). Three.js axes (x, y up, z) become Blender's (x, -z, y).
import bpy
import json
import math
import os
import sys
import time
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []


def arg(name, default):
    return argv[argv.index('--' + name) + 1] if '--' + name in argv else default


ONLY = [r for r in arg('rooms', '').split(',') if r]
SAMPLES = int(arg('samples', '1024'))
SUN_DIR = Vector((0.35, -1.0, 0.45)).normalized()  # three.js axes, the way the light travels
SUN = (9.0, (1.0, 0.93, 0.82))
SKY = (2.6, (0.6, 0.76, 1.0))

with open(os.path.join(ROOT, 'public', 'level.json'), encoding='utf-8') as f:
    level = json.load(f)


def b(p):
    return (p[0], -p[2], p[1])


bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.render.engine = 'CYCLES'
prefs = bpy.context.preferences.addons['cycles'].preferences
for kind in ('OPTIX', 'CUDA'):
    try:
        prefs.compute_device_type = kind
        prefs.get_devices()
        for d in prefs.devices:
            d.use = d.type != 'CPU'
        break
    except Exception as e:  # noqa: BLE001
        print('device', kind, e)
scene.cycles.device = 'GPU'
scene.cycles.samples = SAMPLES
scene.cycles.max_bounces = 8
scene.cycles.diffuse_bounces = 8
scene.cycles.glossy_bounces = 0
scene.cycles.transmission_bounces = 0
scene.cycles.caustics_reflective = False
scene.cycles.caustics_refractive = False
scene.cycles.sample_clamp_indirect = 8.0
scene.cycles.use_adaptive_sampling = False
try:
    scene.cycles.use_denoising = True
    scene.cycles.denoiser = 'OPENIMAGEDENOISE'
except Exception as e:  # noqa: BLE001
    print('denoise', e)

world = bpy.data.worlds.new('world')
scene.world = world
try:
    world.use_nodes = True
except Exception:  # noqa: BLE001
    pass
bg = world.node_tree.nodes.get('Background') or world.node_tree.nodes.new('ShaderNodeBackground')
bg.inputs[0].default_value = (*SKY[1], 1)
bg.inputs[1].default_value = SKY[0]
if not world.node_tree.nodes.get('World Output'):
    out = world.node_tree.nodes.new('ShaderNodeOutputWorld')
    world.node_tree.links.new(bg.outputs[0], out.inputs[0])

sun_data = bpy.data.lights.new('sun', 'SUN')
sun_data.energy = SUN[0]
sun_data.color = SUN[1]
sun_data.angle = math.radians(2.5)
sun = bpy.data.objects.new('sun', sun_data)
scene.collection.objects.link(sun)
sun.rotation_euler = Vector(b(SUN_DIR)).to_track_quat('-Z', 'Y').to_euler()

materials = {}


def material(room, name, image=None, emit=None):
    key = (room, name, tuple(emit) if emit else None)
    if key in materials:
        return materials[key]
    m = bpy.data.materials.new(f'{room}:{name}')
    try:
        m.use_nodes = True
    except Exception:  # noqa: BLE001
        pass
    nt = m.node_tree
    nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    if emit:
        e = nt.nodes.new('ShaderNodeEmission')
        strength = max(emit)
        e.inputs[0].default_value = (emit[0] / strength, emit[1] / strength, emit[2] / strength, 1)
        e.inputs[1].default_value = strength
        nt.links.new(e.outputs[0], out.inputs[0])
    else:
        d = nt.nodes.new('ShaderNodeBsdfDiffuse')
        c = level['materials'][name]['color']
        d.inputs[0].default_value = (c[0], c[1], c[2], 1)
        nt.links.new(d.outputs[0], out.inputs[0])
        if image:
            t = nt.nodes.new('ShaderNodeTexImage')
            t.image = image
            nt.nodes.active = t
            t.select = True
    materials[key] = m
    return m


def mesh_object(name, quads, mats, uvs=None):
    verts = []
    faces = []
    for q in quads:
        base = len(verts)
        for i in range(4):
            verts.append(b(q['p'][3 * i:3 * i + 3]))
        faces.append((base, base + 1, base + 2, base + 3))
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], faces)
    slots = []
    for m in mats:
        if m not in slots:
            slots.append(m)
            me.materials.append(m)
    for poly, m in zip(me.polygons, mats):
        poly.material_index = slots.index(m)
    if uvs:
        layer = me.uv_layers.new(name='lm')
        for poly, uv in zip(me.polygons, uvs):
            for k, li in enumerate(poly.loop_indices):
                layer.data[li].uv = (uv[2 * k], uv[2 * k + 1])
    me.update()
    ob = bpy.data.objects.new(name, me)
    scene.collection.objects.link(ob)
    return ob


rooms = {r['id']: r for r in level['rooms']}
targets = {}
for room in level['rooms']:
    if room.get('instanceOf'):
        continue
    rid = room['id']
    size = room['atlas']
    image = bpy.data.images.new(f'lm_{rid}', size, size, alpha=False, float_buffer=True)
    image.colorspace_settings.name = 'Non-Color'
    quads = [q for q in level['quads'] if q['room'] == rid]
    baked = [q for q in quads if q.get('uv1')]
    lights = [q for q in quads if q.get('emit') and not q.get('appOnly')]
    ob = mesh_object(f'room_{rid}', baked, [material(rid, q['mat'], image) for q in baked], [q['uv1'] for q in baked])
    targets[rid] = (ob, image)
    if lights:
        mesh_object(f'lights_{rid}', lights, [material(rid, 'light', emit=q['emit']) for q in lights])
    # what a portal lets in: a soft light the colour of the other side
    plugs = []
    for p in level['portals']:
        if p['room'] != rid or not p.get('plug', True):
            continue
        c, r, u, n = (Vector(p[k]) for k in ('pos', 'right', 'up', 'normal'))
        c = c - n * 0.002
        hw, hh = p['w'] / 2, p['h'] / 2
        pts = [c - r * hw - u * hh, c + r * hw - u * hh, c + r * hw + u * hh, c - r * hw + u * hh]
        plugs.append(({'p': [v for pt in pts for v in pt]}, material(rid, 'light', emit=p['glow'])))
    if plugs:
        mesh_object(f'plugs_{rid}', [q for q, _ in plugs], [m for _, m in plugs])
    # the same room again, further along (a stair that repeats)
    for k, g in enumerate(room.get('ghosts') or []):
        for src in (f'room_{rid}', f'lights_{rid}'):
            o = bpy.data.objects.get(src)
            if o:
                copy = bpy.data.objects.new(f'{src}_ghost{k}', o.data)
                copy.location = Vector(b(g))
                scene.collection.objects.link(copy)

scene.render.bake.use_pass_direct = True
scene.render.bake.use_pass_indirect = True
scene.render.bake.use_pass_color = False
scene.render.bake.margin = 2
try:
    scene.render.bake.margin_type = 'EXTEND'
except Exception as e:  # noqa: BLE001
    print('margin', e)
scene.render.image_settings.file_format = 'OPEN_EXR'
scene.render.image_settings.color_depth = '16'
scene.render.image_settings.exr_codec = 'ZIP'
try:
    scene.view_settings.view_transform = 'Standard'
except Exception as e:  # noqa: BLE001
    print('view', e)

os.makedirs(os.path.join(ROOT, 'bake'), exist_ok=True)
for rid, (ob, image) in targets.items():
    if ONLY and rid not in ONLY:
        continue
    t0 = time.time()
    for o in scene.objects:
        o.select_set(False)
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.bake(type='DIFFUSE')
    path = os.path.join(ROOT, 'bake', f'{rid}.exr')
    image.save_render(path, scene=scene)
    print(f'BAKED {rid} {image.size[0]} in {time.time() - t0:.1f}s -> {path}')
