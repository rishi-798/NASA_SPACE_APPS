"""Reconstruct a provisional Site04 ENU Blender scene from a verified raw Z-up GLB.

Run Blender with -- OUTPUTS BLOCK OUTPUT_BLEND. Blender's glTF importer assumes
Y-up; rotate its imported coordinates back to the raw ENU axes. No remeshing,
geometry nodes, displacement, or smoothing is performed.
"""
import json
import sys
from pathlib import Path

import bpy
import numpy as np
from mathutils import Matrix

out,block,target=sys.argv[sys.argv.index('--')+1:]
out=Path(out).resolve();target=Path(target).resolve()
if block not in 'ABCD' or len(block)!=1: raise ValueError('Block must be A, B, C or D')
if target.exists(): raise FileExistsError(target)
meta=json.loads((out/f'Site04 block {block} measured terrain metadata.json').read_text(encoding='utf-8'))
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(out/meta['glb']))
scene=bpy.context.scene
meshes=[o for o in scene.objects if o.type=='MESH']
assert len(meshes)==1 and len(scene.objects)==1
obj=meshes[0]
assert all(abs(obj.matrix_world[i][j]-Matrix.Identity(4)[i][j])<1e-6 for i in range(4) for j in range(4))
coords=np.empty((len(obj.data.vertices),3),dtype=np.float32);obj.data.vertices.foreach_get('co',coords.ravel())
coords=coords[:,[0,2,1]].copy();coords[:,2]*=-1
obj.data.vertices.foreach_set('co',coords.ravel());obj.data.update()
assert len(obj.data.vertices)==meta['vertex_count'] and len(obj.data.polygons)==meta['triangle_count']
assert not obj.modifiers and not any(face.use_smooth for face in obj.data.polygons)
obj.name=f'SITE04-BLOCK-{block} - measured terrain ENU'
scene.name=f'SITE04-BLOCK-{block} - measured terrain ENU'
scene.unit_settings.system='METRIC';scene.unit_settings.scale_length=1.0
scene['production_ready']=False
scene['source_glb']=meta['glb']
scene['local_to_moon_fixed_matrix_row_major']=json.dumps(meta['local_to_moon_fixed_matrix_row_major'])
scene['scientific_note']='Raw source-pixel geometry in local ENU, provisional. The source DEM is interpolated; lighting and browser integration are not certified.'
material=bpy.data.materials.new('Measured lunar terrain - neutral');material.diffuse_color=(.3,.3,.3,1);material.roughness=1
obj.data.materials.clear();obj.data.materials.append(material)
scene.render.engine='CYCLES'
target.parent.mkdir(parents=True,exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=str(target))
print(json.dumps({'block':block,'vertices':len(obj.data.vertices),'triangles':len(obj.data.polygons),'output':str(target),'production_ready':False}),flush=True)
