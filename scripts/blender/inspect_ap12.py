import bpy, json
s=bpy.context.scene
o=bpy.data.objects.get('MOON-R0282-C0474-r1-c5')
print('OBJ',o, 'mesh verts',len(o.data.vertices),'faces',len(o.data.polygons), 'bbox',json.dumps([list(c) for c in o.bound_box]))
print('camera',list(s.camera.location),list(s.camera.rotation_euler),s.camera.data.type)
print('light',[(x.name,list(x.location), x.data.type, getattr(x.data,'energy',None)) for x in bpy.data.objects if x.type=='LIGHT'])
print('face normal',list(o.data.polygons[0].normal) if len(o.data.polygons) else 'no faces')
