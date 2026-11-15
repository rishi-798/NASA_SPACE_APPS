import bpy,json
p=r'C:\Users\suhas\Documents\Codex\2026-11-14\https-drive-google-com-drive-u\work\blender\Moon Model.blend'
bpy.ops.wm.open_mainfile(filepath=p)
s=bpy.data.scenes['Site04 - All 256 grids']
print(json.dumps([{'name':o.name,'grid_id':o.get('grid_id',''),'vertices':len(o.data.vertices) if o.type=='MESH' else 0,'type':o.type} for o in s.objects if o.type=='MESH' and not o.get('grid_id')],indent=2))
