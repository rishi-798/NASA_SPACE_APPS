import bpy,json
p=r'C:\Users\suhas\Documents\Codex\2026-11-14\https-drive-google-com-drive-u\work\blender\Moon Model.blend'
with bpy.data.libraries.load(p,link=False) as (src,dst):
 print(json.dumps({'materials':src.materials,'node_groups':src.node_groups}))
