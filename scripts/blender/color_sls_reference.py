import bpy,bmesh,numpy as np
from pathlib import Path
root=Path(__file__).resolve().parents[2]/'frontend'/'public';bpy.ops.wm.read_factory_settings(use_empty=True);bpy.ops.import_scene.gltf(filepath=str(root/'sls-block-1.glb'));bpy.context.view_layer.update();o=next(o for o in bpy.context.scene.objects if o.type=='MESH');o.data.transform(o.matrix_world);o.matrix_world.identity();
bm=bmesh.new();bm.from_mesh(o.data);bm.faces.ensure_lookup_table();discard=[f for f in bm.faces if f.calc_center_median().y > -5.8];bmesh.ops.delete(bm,geom=discard,context='FACES');bm.to_mesh(o.data);bm.free();o.data.update()
def material(name,color,metal,rough):
 m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);m.use_nodes=True;p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*color,1);p.inputs['Metallic'].default_value=metal;p.inputs['Roughness'].default_value=rough;return m
mats=[material('White insulation',(.80,.82,.82),0,.82),material('Orange core foam',(.58,.20,.055),0,.87),material('Engine metal',(.13,.14,.15),.65,.5),material('Dark markings',(.055,.06,.06),0,.75)];o.data.materials.clear()
for m in mats:o.data.materials.append(m)
for f in o.data.polygons:
 c=f.center;h=-c.y;rad=(c.x*c.x+c.z*c.z)**.5;idx=0
 if 11 < h < 133 and rad < 9.0: idx=1
 if 5.8 < h < 12 and rad < 9.0: idx=2
 if 142 < h < 145 and rad < 8.0: idx=3
 f.material_index=idx
o.name='NASA SLS printable geometry with illustrative colors';o['source']='https://science.nasa.gov/3d-resources/space-launch-system-sls-block-1/';o['note']='NASA printable mesh, base removed and approximate color regions added; not a flight texture.'
bpy.ops.object.select_all(action='DESELECT');o.select_set(True);bpy.context.view_layer.objects.active=o
out=root/'sls-block1-colored.glb';bpy.ops.export_scene.gltf(filepath=str(out),export_format='GLB',use_selection=True,export_yup=True,export_animations=False,export_extras=True,export_draco_mesh_compression_enable=True,export_draco_mesh_compression_level=6);print('OUTPUT',out.stat().st_size,'faces',len(o.data.polygons),flush=True)

