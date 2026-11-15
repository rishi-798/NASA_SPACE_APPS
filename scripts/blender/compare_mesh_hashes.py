import bpy,json,hashlib
import numpy as np
from pathlib import Path
ROOT=Path(r'C:\Users\suhas\Documents\Codex\2026-11-14\https-drive-google-com-drive-u')
files={'original':ROOT/'work'/'blender'/'Moon Model.blend','snapshot':ROOT/'work'/'blender'/'snapshot_extract'/'Blender-Suhas-Dip-2026-11-14'/'Moon Model.blend'}
result={}
for label,path in files.items():
 bpy.ops.wm.open_mainfile(filepath=str(path))
 rows=[]
 for mesh in sorted(bpy.data.meshes,key=lambda m:m.name):
  vertices=np.empty(len(mesh.vertices)*3,dtype=np.float32)
  mesh.vertices.foreach_get('co',vertices)
  loops=np.empty(len(mesh.loops),dtype=np.int32)
  mesh.loops.foreach_get('vertex_index',loops)
  totals=np.empty(len(mesh.polygons),dtype=np.int32)
  mesh.polygons.foreach_get('loop_total',totals)
  h=hashlib.sha256(vertices.tobytes()+loops.tobytes()+totals.tobytes()).hexdigest()
  rows.append({'name':mesh.name,'vertices':len(mesh.vertices),'loops':len(mesh.loops),'polygons':len(mesh.polygons),'sha256':h})
 result[label]=rows
Path(ROOT/'work'/'blender'/'mesh_hash_compare.json').write_text(json.dumps(result,indent=2),'utf-8')
