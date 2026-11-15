"""Check exported reference launcher geometry in Blender (run in background)."""
import bpy
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
SPECS = [
    ('lvm3-reference', 43.5, 'S200 solid booster', 2),
    ('h-iia-202-reference', 53, 'SRB-A solid booster', 2),
    ('long-march-3b-reference', 54.84, 'Liquid booster', 4),
    ('proton-k-reference', 57, 'First stage outboard fuel tank', 6),
]
for slug, height, component, expected in SPECS:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(ROOT / 'frontend' / 'public' / (slug + '.glb')))
    meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
    bpy.context.view_layer.update()
    corners = [o.matrix_world @ Vector(corner) for o in meshes for corner in o.bound_box]
    actual_height = max(v.z for v in corners) - min(v.z for v in corners)
    count = sum(o.name.replace('_', ' ').startswith(component) for o in meshes)
    assert abs(actual_height-height) < 1.5, (slug, actual_height, height)
    assert count == expected, (slug, component, count, expected)
    print(f'VERIFIED {slug}: height={actual_height:.2f}m, {component}={count}', flush=True)
