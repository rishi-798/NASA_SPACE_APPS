import bpy, hashlib, json
from pathlib import Path
ROOT=Path(r'C:\Users\suhas\Documents\Codex\2026-11-14\https-drive-google-com-drive-u')
SOURCE=ROOT/'work'/'blender'/'Moon Model.blend'
OUT=ROOT/'outputs'
MANIFEST=OUT/'Legacy measured terrain scene manifest.json'
scenes=['Apollo 11 - Measured terrain','Apollo 14 - Measured terrain','Apollo 15 - Measured terrain','Lunokhod 1 - Measured terrain','Lunokhod 2 - Measured terrain','G7 - Terrain only','Site04 - All 256 grids']
def sig(scene):
 h=hashlib.sha256(); meshrows=[]
 for obj in sorted((x for x in scene.objects if x.type=='MESH'),key=lambda x:x.name):
  h.update(obj.name.encode()); h.update(b'\0')
  for v in obj.data.vertices:
   for c in v.co: h.update(float(c).hex().encode()+b'|')
   h.update(b'\n')
  for poly in obj.data.polygons:
   h.update(','.join(map(str,poly.vertices)).encode()+b'\n')
  meshrows.append({'object':obj.name,'vertices':len(obj.data.vertices),'polygons':len(obj.data.polygons)})
 return h.hexdigest(),meshrows
bpy.ops.wm.open_mainfile(filepath=str(SOURCE))
source={n:sig(bpy.data.scenes[n]) for n in scenes}
manifest=json.loads(MANIFEST.read_text(encoding='utf-8'))
for row in manifest['scenes']:
 bpy.ops.wm.open_mainfile(filepath=str(OUT/row['filename']))
 got=sig(bpy.data.scenes[row['scene']])
 expected=source[row['scene']]
 if got[0]!=expected[0]: raise RuntimeError('Source geometry mismatch: '+row['scene'])
 row['geometry_vertex_and_polygon_sha256']=got[0]
 row['source_geometry_match_verified']=True
 row['mesh_objects']=got[1]
MANIFEST.write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf-8')
print(json.dumps({'source_geometry_matches':len(manifest['scenes']),'total_mesh_vertices':sum(x['mesh_vertex_count'] for x in manifest['scenes']),'site04_sha256':source['Site04 - All 256 grids'][0]}))
