import bpy,bmesh,pathlib,math,sys
from mathutils import Vector,Matrix
r=pathlib.Path(__file__).resolve().parents[2]
bpy.ops.wm.read_factory_settings(use_empty=True);bpy.ops.import_scene.gltf(filepath=str(pathlib.Path(sys.argv[sys.argv.index('--')+1]) if '--' in sys.argv else r/'tmp/qa/before/sls-block-1.glb'));o=next(o for o in bpy.context.scene.objects if o.type=='MESH')
# Original printable asset is complete. Bake its imported transform into Z-up.
mat=Matrix.Rotation(-math.pi/2,4,'X')@o.matrix_world
for v in o.data.vertices:v.co=mat@v.co
o.matrix_world=Matrix.Identity(4);o.data.update()
def material(n,c,rough,metal=0):
 m=bpy.data.materials.new(n);m.use_nodes=True;p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*c,1);p.inputs['Roughness'].default_value=rough;p.inputs['Metallic'].default_value=metal;return m
mats=[material('White booster and Orion coating',(.77,.78,.77),.48),material('Orange core and LVSA foam',(.58,.235,.066),.91),material('Dark engine alloy',(.08,.09,.105),.43,.65),material('Satin stage fittings',(.38,.41,.46),.36,.7)]
o.data.materials.clear()
for m in mats:o.data.materials.append(m)
zmin=min(v.co.z for v in o.data.vertices);span=max(v.co.z for v in o.data.vertices)-zmin
for p in o.data.polygons:
 c=p.center;h=(c.z-zmin)/span
 p.material_index=2 if h<.035 else 1 if abs(c.x)<9 and .055<h<.727 else 3 if .035<h<.055 else 0
bm=bmesh.new();bm.from_mesh(o.data);bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.0001);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(o.data);bm.free()
for p in o.data.polygons:p.use_smooth=True
o.data.set_sharp_from_angle(angle=.6)
bpy.ops.object.select_all(action='DESELECT');o.select_set(True);bpy.context.view_layer.objects.active=o
bpy.ops.export_scene.gltf(filepath=str(r/'frontend/public/sls-block-1.glb'),export_format='GLB',use_selection=True,export_draco_mesh_compression_enable=True,export_draco_position_quantization=16,export_draco_normal_quantization=12)
print('COMPLETE SLS',span,flush=True)
