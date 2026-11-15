import bpy, json, os
p=bpy.data.filepath
print('FILE',p)
print('SCENES',json.dumps([s.name for s in bpy.data.scenes]))
print('OBJECTS',len(bpy.data.objects),'MESHES',len([o for o in bpy.data.objects if o.type=='MESH']))
print('ACTIVE',bpy.context.scene.name)
print('COLLECTIONS',json.dumps([c.name for c in bpy.data.collections]))
