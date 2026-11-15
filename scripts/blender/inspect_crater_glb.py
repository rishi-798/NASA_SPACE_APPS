import bpy,numpy as np
from pathlib import Path
r=Path(r'C:\Users\suhas\Documents\Codex\2026-11-14\https-drive-google-com-drive-u\outputs')
bpy.ops.wm.open_mainfile(filepath=str(r/'Tycho - Overview terrain.blend'))
s=next(o for o in bpy.context.scene.objects if o.type=='MESH')
before={o.as_pointer() for o in bpy.context.scene.objects};bpy.ops.import_scene.gltf(filepath=str(r/'Tycho - Overview terrain candidate.glb'))
g=next(o for o in bpy.context.scene.objects if o.type=='MESH' and o.as_pointer() not in before)
for o in [s,g]:
 v=np.empty((len(o.data.vertices),3),np.float32);o.data.vertices.foreach_get('co',v.ravel());print(o.name, v[:6], 'bounds', v.min(0),v.max(0))
