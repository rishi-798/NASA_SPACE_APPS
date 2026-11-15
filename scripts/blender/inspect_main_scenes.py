import bpy,json
from mathutils import Vector
p=r'C:\Users\suhas\Documents\Codex\2026-11-14\https-drive-google-com-drive-u\work\blender\Moon Model.blend'
bpy.ops.wm.open_mainfile(filepath=p)
keys=['Site04 - All 256 grids','G7 - Terrain only','Apollo 11 - Measured terrain','Apollo 14 - Measured terrain','Apollo 15 - Measured terrain','Lunokhod 1 - Measured terrain','Lunokhod 2 - Measured terrain']
rows=[]
for s in bpy.data.scenes:
 if s.name in keys:
  objs=list(s.objects)
  meshes=[o for o in objs if o.type=='MESH']
  rows.append({'scene':s.name,'objects':len(objs),'meshes':len(meshes),'mesh_vertices':sum(len(o.data.vertices) for o in meshes),'cameras':sum(o.type=='CAMERA' for o in objs),'mesh_objects':[{ 'name':o.name,'vertices':len(o.data.vertices),'grid_id':o.get('grid_id','')} for o in meshes[:5]]})
print(json.dumps(rows,indent=2))
