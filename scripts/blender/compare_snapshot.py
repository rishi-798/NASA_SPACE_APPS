import bpy,json,hashlib
from pathlib import Path
ROOT=Path(r'C:\Users\suhas\Documents\Codex\2026-11-14\https-drive-google-com-drive-u')
files={'original':ROOT/'work'/'blender'/'Moon Model.blend','snapshot':ROOT/'work'/'blender'/'snapshot_extract'/'Blender-Suhas-Dip-2026-11-14'/'Moon Model.blend'}
def plain(v):
 if hasattr(v,'items'):return {str(k):plain(x) for k,x in v.items()}
 if isinstance(v,(tuple,list)):return [plain(x) for x in v]
 if isinstance(v,(str,int,float,bool)) or v is None:return v
 return str(v)
result={}
for label,path in files.items():
 bpy.ops.wm.open_mainfile(filepath=str(path))
 scenes={}
 for s in bpy.data.scenes:
  objs=[]
  for o in sorted(s.objects,key=lambda x:x.name):
   rec={'name':o.name,'type':o.type,'grid_id':o.get('grid_id'),'location':[round(v,9) for v in o.location],'rotation':[round(v,9) for v in o.rotation_euler],'scale':[round(v,9) for v in o.scale]}
   if o.type=='MESH':rec.update({'mesh':o.data.name,'vertices':len(o.data.vertices),'edges':len(o.data.edges),'polygons':len(o.data.polygons),'materials':[m.name if m else None for m in o.data.materials]})
   rec['props']={k:plain(o[k]) for k in o.keys()}
   objs.append(rec)
  scenes[s.name]={'objects':objs,'props':{k:plain(s[k]) for k in s.keys()},'world':s.world.name if s.world else None}
 result[label]={'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'size':path.stat().st_size,'scenes':scenes,'image_names':sorted(i.name for i in bpy.data.images),'material_names':sorted(m.name for m in bpy.data.materials)}
Path(ROOT/'work'/'blender'/'master_compare.json').write_text(json.dumps(result,indent=2),'utf-8')
