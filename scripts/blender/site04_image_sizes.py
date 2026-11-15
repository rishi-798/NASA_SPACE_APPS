import bpy,json,os
p=r'C:\Users\suhas\Documents\Codex\2026-11-14\https-drive-google-com-drive-u\work\blender\Moon Model.blend'
bpy.ops.wm.open_mainfile(filepath=p)
s=bpy.data.scenes['Site04 - All 256 grids']
used={m for o in s.objects if o.type=='MESH' for m in o.data.materials if m}
rows=[]
for m in used:
 imgs=[]
 if m.use_nodes and m.node_tree:
  for n in m.node_tree.nodes:
   if n.type=='TEX_IMAGE' and n.image: imgs.append({'name':n.image.name,'size':list(n.image.size),'packed':bool(n.image.packed_file),'bytes':n.image.packed_file.size if n.image.packed_file else None})
 rows.append({'material':m.name,'image_textures':imgs})
print(json.dumps({'materials':rows,'images':[{ 'name':i.name,'size':list(i.size),'packed':bool(i.packed_file),'bytes':i.packed_file.size if i.packed_file else None} for i in bpy.data.images]},indent=2))
