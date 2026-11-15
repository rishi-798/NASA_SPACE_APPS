import bpy
op=bpy.ops.export_scene.gltf.get_rna_type()
print([(p.identifier,getattr(p,'default',None)) for p in op.properties])
