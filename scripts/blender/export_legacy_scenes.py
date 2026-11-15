import bpy, json
from pathlib import Path
ROOT = Path(r'C:\Users\suhas\Documents\Codex\2026-11-14\https-drive-google-com-drive-u')
SOURCE = ROOT / 'work' / 'blender' / 'Moon Model.blend'
OUTPUTS = ROOT / 'outputs'
OUTPUTS.mkdir(exist_ok=True)
SCENES = {
    'Apollo 11 - Measured terrain': 'Apollo 11 - Legacy measured terrain.blend',
    'Apollo 14 - Measured terrain': 'Apollo 14 - Legacy measured terrain.blend',
    'Apollo 15 - Measured terrain': 'Apollo 15 - Legacy measured terrain.blend',
    'Lunokhod 1 - Measured terrain': 'Lunokhod 1 - Legacy measured terrain.blend',
    'Lunokhod 2 - Measured terrain': 'Lunokhod 2 - Legacy measured terrain.blend',
    'G7 - Terrain only': 'G7 - Terrain only.blend',
    'Site04 - All 256 grids': 'Site04 - All 256 grids.blend',
}

def plain(value):
    if hasattr(value, "items"):
        return {str(key): plain(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [plain(item) for item in value]
    if hasattr(value, "to_list"):
        return plain(value.to_list())
    if isinstance(value, (str, int, float, bool)) or value is None:
        return value
    return str(value)
bpy.ops.wm.open_mainfile(filepath=str(SOURCE))
bpy.ops.file.pack_all()
manifest = []
for name, filename in SCENES.items():
    scene = bpy.data.scenes.get(name)
    if scene is None:
        raise RuntimeError(f'Missing source scene: {name}')
    objects = list(scene.objects)
    meshes = [o for o in objects if o.type == 'MESH']
    out = OUTPUTS / filename
    bpy.data.libraries.write(str(out), {scene}, fake_user=True, compress=True)
    manifest.append({
        'scene': name,
        'filename': filename,
        'source_master': 'Moon Model.blend',
        'source_object_count': len(objects),
        'mesh_object_count': len(meshes),
        'mesh_vertex_count': sum(len(o.data.vertices) for o in meshes),
        'mesh_polygon_count': sum(len(o.data.polygons) for o in meshes),
        'coverage_note': 'Original scene extracted from the preserved master; its original scene coverage, objects and appearance are retained. No 10 km expansion or terrain baking was performed.',
        'source_scene_custom_properties': {key: plain(scene[key]) for key in scene.keys()},
    })
for row in manifest:
    path = OUTPUTS / row['filename']
    bpy.ops.wm.open_mainfile(filepath=str(path))
    scene = bpy.data.scenes.get(row['scene'])
    if scene is None:
        raise RuntimeError(f'{row["filename"]} is missing its source scene')
    row['reopened_scene_names'] = [s.name for s in bpy.data.scenes]
    row['reopened_object_count'] = len(list(scene.objects))
    row['packed_image_count'] = sum(1 for image in bpy.data.images if image.packed_file)
    row['reopen_verified'] = row['reopened_object_count'] == row['source_object_count']
    if not row['reopen_verified']:
        raise RuntimeError(f'Object count mismatch in {row["filename"]}')
manifest_path = OUTPUTS / 'Legacy measured terrain scene manifest.json'
manifest_path.write_text(json.dumps({'source_master': str(SOURCE), 'blender_version': bpy.app.version_string, 'scenes': manifest}, indent=2) + '\n', encoding='utf-8')
print('SCENE_EXPORT ' + json.dumps({'files': len(manifest), 'manifest': str(manifest_path), 'scenes': manifest}))
