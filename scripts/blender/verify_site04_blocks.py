import bpy,hashlib,json,numpy as np
from pathlib import Path
root=Path(r'C:\Users\suhas\Documents\Codex\2026-11-14\https-drive-google-com-drive-u')
source=root/'work'/'blender'/'Moon Model.blend'
out=root/'outputs'
def geom_hash(mesh):
 v=np.empty(len(mesh.vertices)*3,dtype=np.float32); mesh.vertices.foreach_get('co',v)
 l=np.empty(len(mesh.loops),dtype=np.int32); mesh.loops.foreach_get('vertex_index',l)
 p=np.empty(len(mesh.polygons),dtype=np.int32); mesh.polygons.foreach_get('loop_total',p)
 return hashlib.sha256(v.tobytes()+l.tobytes()+p.tobytes()).hexdigest()
bpy.ops.wm.open_mainfile(filepath=str(source))
expected={o.get('grid_id'):geom_hash(o.data) for o in bpy.data.scenes['Site04 - All 256 grids'].objects if o.type=='MESH' and o.get('grid_id','').startswith('SITE04-')}
if len(expected)!=256: raise RuntimeError(f'Expected 256 Site04 source grids, found {len(expected)}')
verified=[]
for block in 'ABCD':
 path=out/f'Site04 - Grid block {block}.blend'
 bpy.ops.wm.open_mainfile(filepath=str(path))
 s=bpy.data.scenes[f'Site04 - Grid block {block}']
 for o in (x for x in s.objects if x.type=='MESH'):
  grid=o.get('grid_id')
  if expected.get(grid)!=geom_hash(o.data): raise RuntimeError(f'Grid source geometry mismatch: {grid}')
  verified.append(grid)
if set(verified)!=set(expected) or len(verified)!=256: raise RuntimeError('Block coverage does not match source grid inventory')
manifest=json.loads((out/'Site04 regional block manifest.json').read_text(encoding='utf-8'))
manifest['source_grid_geometry_match_verified']=True
manifest['verified_grid_count']=len(verified)
manifest['source_site04_grid_set_sha256']=hashlib.sha256(''.join(f'{k}:{expected[k]}' for k in sorted(expected)).encode()).hexdigest()
(out/'Site04 regional block manifest.json').write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf-8')
(out/'Site04 grid block verification.json').write_text(json.dumps({'source_master_scene':'Site04 - All 256 grids','grid_meshes_verified':len(verified),'geometry_and_topology_match':True,'source_grid_set_sha256':manifest['source_site04_grid_set_sha256']},indent=2)+'\n',encoding='utf-8')
print(json.dumps({'verified_grid_meshes':len(verified),'exact_geometry_and_topology_match':True,'manifest':str(out/'Site04 regional block manifest.json')}))
