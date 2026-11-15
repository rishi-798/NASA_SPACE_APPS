import bpy,json,numpy as np
from pathlib import Path
root=Path(r'C:\Users\suhas\Documents\Codex\2026-11-14\https-drive-google-com-drive-u')
out=root/'outputs'; work=root/'work'/'blender'
regions=['Apollo 11','Apollo 14','Apollo 15','Lunokhod 2']
results=[]
for stem in regions:
 meta=json.loads((out/f'{stem} measured terrain metadata.json').read_text(encoding='utf-8'))
 bpy.ops.wm.open_mainfile(filepath=str(out/f'{stem} - Measured terrain.blend'))
 scene=bpy.context.scene; obj=bpy.data.objects.get(meta['grid_id'])
 if obj is None or obj.type!='MESH': raise RuntimeError(f'{stem}: missing terrain object')
 verts=np.asarray([v.co[:] for v in obj.data.vertices],dtype=np.float32)
 maxrad=float(np.sqrt(verts[:,0]**2+verts[:,1]**2).max())
 if len(verts)!=meta['source_pixels_used'] or len(obj.data.polygons)!=meta['mesh_faces'] or maxrad>10000.05: raise RuntimeError(f'{stem}: region geometry mismatch')
 if obj.data.materials[0].name!='Historical scientific terrain - neutral, no cosmetic bump' or obj['production_ready'] is not False: raise RuntimeError(f'{stem}: source material/readiness mismatch')
 marker_ids={x['id'] for x in meta['locations_covered']}
 marker_names={o.name for o in scene.objects if o.type=='EMPTY'}
 if not marker_ids.issubset(marker_names): raise RuntimeError(f'{stem}: missing marker objects')
 matched=[abs(c['difference_m']) for c in meta['terrain_api_control_check']['controls'] if c['source_matches_region_mesh']]
 if matched and max(matched)>0.001: raise RuntimeError(f'{stem}: same-source API check failed')
 np.save(work/f'{stem.lower().replace(" ","-")}-fallback-source-vertices.npy',verts)
 results.append({'site':stem,'grid_id':meta['grid_id'],'vertices':len(verts),'quads':len(obj.data.polygons),'max_radius_m':maxrad,'api_center_source':meta['api_center_selected_source_id'],'region_mesh_source':meta['source_id'],'center_source_mismatch_recorded':meta['api_center_uses_different_source'],'same_source_control_max_delta_m':max(matched) if matched else None,'markers':sorted(marker_ids),'production_ready':meta['production_ready']})
print(json.dumps(results,indent=2))
