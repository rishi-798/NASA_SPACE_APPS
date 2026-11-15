import bpy,json
p=r'C:\Users\suhas\Documents\Codex\2026-11-14\https-drive-google-com-drive-u\work\blender\Moon Model.blend'
with bpy.data.libraries.load(p,link=False) as (src,dst): dst.materials=['Historical scientific terrain - neutral, no cosmetic bump','G7 - neutral terrain inspection']
for m in bpy.data.materials:
 print(m.name,'nodes',m.use_nodes,[(n.type,n.label,n.name) for n in m.node_tree.nodes] if m.use_nodes else None)
