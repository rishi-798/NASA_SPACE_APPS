import bpy,json
p=r'C:\Users\suhas\Documents\Codex\2026-11-14\https-drive-google-com-drive-u\outputs\Site04 - Grid block A.blend'
bpy.ops.wm.open_mainfile(filepath=p)
s=bpy.data.scenes['Site04 - Grid block A']
obj=next(o for o in s.objects if o.get('grid_id')=='SITE04-A1')
print(json.dumps({'block_count':len(s.objects),'collections':[c.name for c in obj.users_collection],'scene_refs':[(sc.name,sc.objects.get(obj.name) is not None) for sc in bpy.data.scenes],'source_colllections':[c.name for c in bpy.data.objects.get('SITE04-A1').users_collection]},indent=2))
