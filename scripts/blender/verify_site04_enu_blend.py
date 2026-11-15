"""Verify every vertex and triangle in Site04 ENU Blender copies vs source GLBs."""
import json,struct,sys
from pathlib import Path
import bpy
import numpy as np

out,block,blend= sys.argv[sys.argv.index('--')+1:]
out=Path(out).resolve();blend=Path(blend).resolve()
meta=json.loads((out/f'Site04 block {block} measured terrain metadata.json').read_text(encoding='utf-8'));path=out/meta['glb']
with path.open('rb') as f:
 magic,version,total=struct.unpack('<4sII',f.read(12));n,kind=struct.unpack('<I4s',f.read(8));doc=json.loads(f.read(n));bn,bkind=struct.unpack('<I4s',f.read(8));offset=f.tell()
assert magic==b'glTF' and version==2 and total==path.stat().st_size and bkind==b'BIN\0'
vertices=np.memmap(path,mode='r',dtype='<f4',offset=offset+doc['bufferViews'][0].get('byteOffset',0),shape=(meta['vertex_count'],3))
indices=np.memmap(path,mode='r',dtype='<u4',offset=offset+doc['bufferViews'][1]['byteOffset'],shape=(meta['triangle_count'],3))
bpy.ops.wm.open_mainfile(filepath=str(blend));scene=bpy.context.scene
obj=scene.objects[f'SITE04-BLOCK-{block} - measured terrain ENU'];mesh=obj.data
assert len(mesh.vertices)==len(vertices) and len(mesh.polygons)==len(indices)
actual=np.empty((len(vertices),3),dtype=np.float32);mesh.vertices.foreach_get('co',actual.ravel())
error=float(np.max(np.abs(actual-vertices)));assert error==0,error
tri=np.empty(len(mesh.loops),dtype=np.int32);mesh.loops.foreach_get('vertex_index',tri)
assert tri.size==indices.size and np.array_equal(tri.reshape(-1,3),indices)
assert not obj.modifiers and not any(f.use_smooth for f in mesh.polygons) and scene.unit_settings.scale_length==1.0
assert json.loads(scene['local_to_moon_fixed_matrix_row_major'])==meta['local_to_moon_fixed_matrix_row_major']
report={'block':block,'vertices_checked':len(vertices),'triangles_checked':len(indices),'max_position_error_m':error,'triangle_indices_and_winding_identical':True,'unit_scale_m':1.0,'modifiers':0,'smooth_faces':0,'frame_matrix_matches_metadata':True,'scope':'Compares Blender mesh to already verified GLB; does not validate lighting or independent registration.'}
(blend.parent/f'Site04 block {block} ENU Blender verification.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report),flush=True)
