import bpy,json,numpy as np
from pathlib import Path
root=Path(r'C:\Users\suhas\Documents\Codex\2026-11-14\https-drive-google-com-drive-u')
bpy.ops.wm.open_mainfile(filepath=str(root/'outputs'/'Apollo 12 - Measured terrain.blend'))
o=bpy.data.objects['MOON-R0282-C0474-r1-c5']; m=o.data
coords=np.asarray([v.co[:] for v in m.vertices]); radius=np.sqrt(coords[:,0]**2+coords[:,1]**2)
meta=json.loads((root/'outputs'/'Apollo 12 measured terrain metadata.json').read_text())
assert len(m.vertices)==meta['source_pixels_used']==89833
assert len(m.polygons)==meta['mesh_faces']==89159
assert radius.max()<=10000.01
assert meta['terrain_api_control_check']['result'].startswith('5 source pixels matched')
assert max(abs(x['difference_m']) for x in meta['terrain_api_control_check']['controls']) < 5e-5
assert m.materials[0].name=='Historical scientific terrain - neutral, no cosmetic bump'
assert not o['cosmetic_geometry_present'] and not o['production_ready']
print(json.dumps({'reopened':True,'scene':bpy.context.scene.name,'region_id':bpy.context.scene['region_id'],'grid_id':o['grid_id'],'vertices':len(m.vertices),'faces':len(m.polygons),'max_radius_m':float(radius.max()),'max_api_sample_difference_m':max(abs(x['difference_m']) for x in meta['terrain_api_control_check']['controls']),'material':m.materials[0].name,'cosmetic_geometry':o['cosmetic_geometry_present'],'production_ready':o['production_ready']}))
