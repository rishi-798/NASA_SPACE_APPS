import bpy, math, os
from mathutils import Vector

def aim(obj, target):
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat('-Z', 'Y').to_euler()

# Find terrain mesh
terrain = next((o for o in bpy.data.objects if o.type == 'MESH'), None)
if not terrain:
    print('NO MESH FOUND')
    exit(1)

mat = terrain.active_material

# Pure black space world
world = bpy.context.scene.world
if not world:
    world = bpy.data.worlds.new('World')
    bpy.context.scene.world = world
world.use_nodes = True
for n in world.node_tree.nodes:
    if n.type == 'BACKGROUND':
        n.inputs['Color'].default_value = (0.0, 0.0, 0.0, 1.0)
        n.inputs['Strength'].default_value = 0.0

bbox = [terrain.matrix_world @ Vector(v) for v in terrain.bound_box]
min_x = min(v.x for v in bbox); max_x = max(v.x for v in bbox)
min_y = min(v.y for v in bbox); max_y = max(v.y for v in bbox)
min_z = min(v.z for v in bbox); max_z = max(v.z for v in bbox)
cx = (min_x + max_x) * 0.5
cy = (min_y + max_y) * 0.5
cz = (min_z + max_z) * 0.5
span = max(max_x - min_x, max_y - min_y)

# Setup Raking Sunlight for dramatic relief
sun = bpy.data.objects.get('Illustrative review sun')
if not sun:
    sun_data = bpy.data.lights.new(name='Sun', type='SUN')
    sun = bpy.data.objects.new(name='Illustrative review sun', object_data=sun_data)
    bpy.context.scene.collection.objects.link(sun)
else:
    sun.data.type = 'SUN'

sun.location = Vector((cx - span * 1.5, cy - span * 0.8, max_z + span * 0.45))
aim(sun, (cx, cy, cz))
sun.data.energy = 5.6
sun.data.angle = math.radians(0.533)

# Calibrate material
if mat and mat.node_tree:
    bsdf = next((n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'), None)
    if bsdf:
        bsdf.inputs['Base Color'].default_value = (0.13, 0.135, 0.145, 1.0)
        bsdf.inputs['Roughness'].default_value = 0.94

# Camera: Epic In-Terrain Aerial Reconnaissance
cam = bpy.context.scene.camera
if not cam:
    cam_data = bpy.data.cameras.new('Camera')
    cam = bpy.data.objects.new('Camera', cam_data)
    bpy.context.scene.collection.objects.link(cam)
    bpy.context.scene.camera = cam

cam_alt = max_z + span * 0.08
cam.location = Vector((cx - span * 0.35, cy - span * 0.45, cam_alt))
aim(cam, Vector((cx + span * 0.15, cy + span * 0.25, min_z + (max_z - min_z) * 0.15)))
cam.data.lens = 28.0
cam.data.clip_end = 300000.0

out_path = os.environ.get('RENDER_OUTPUT_PATH')
if not out_path:
    print('ERROR: RENDER_OUTPUT_PATH not set')
    exit(1)

bpy.context.scene.render.engine = 'CYCLES'
bpy.context.scene.cycles.samples = 16
bpy.context.scene.render.resolution_x = 960
bpy.context.scene.render.resolution_y = 600
bpy.context.scene.render.filepath = out_path
bpy.ops.render.render(write_still=True)
print('SUCCESSFULLY RENDERED RECON PREVIEW TO:', out_path)
import sys
sys.exit(0)
