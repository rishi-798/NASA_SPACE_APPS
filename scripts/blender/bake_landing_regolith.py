"""Author and bake a terrain-only Blender node material; no measured mesh is edited."""
from pathlib import Path
import bpy
root=Path(__file__).resolve().parents[2]
out=root/'frontend/public/terrain';out.mkdir(parents=True,exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.mesh.primitive_plane_add(size=24)
plane=bpy.context.object;plane.name='Regolith material bake surface - not measured terrain'
mat=bpy.data.materials.new('Landing regolith - layered noise and worn crater bump');mat.use_nodes=True
plane.data.materials.append(mat);n=mat.node_tree.nodes;l=mat.node_tree.links;n.clear()
def node(kind,name,x,y):
 a=n.new(kind);a.label=name;a.location=(x,y);return a
tex=node('ShaderNodeTexCoord','Undisplaced surface coordinates',-1000,0)
mapn=node('ShaderNodeMapping','24 metre surface tile',-800,0);l.new(tex.outputs['UV'],mapn.inputs['Vector'])
broad=node('ShaderNodeTexNoise','Broad regolith variation',-600,300);broad.inputs['Scale'].default_value=5;broad.inputs['Detail'].default_value=5;l.new(mapn.outputs['Vector'],broad.inputs['Vector'])
ramp=node('ShaderNodeValToRGB','Dark lunar gray palette',-350,350);ramp.color_ramp.elements[0].color=(.06,.06,.06,1);ramp.color_ramp.elements[1].color=(.22,.22,.22,1);l.new(broad.outputs['Fac'],ramp.inputs['Fac'])
vor=node('ShaderNodeTexVoronoi','Small illustrative crater cells',-600,0);vor.inputs['Scale'].default_value=35;l.new(mapn.outputs['Vector'],vor.inputs['Vector'])
curve=node('ShaderNodeFloatCurve','Worn bowl and raised rim profile',-350,0)
curve.mapping.curves[0].points[0].location=(0,.1);curve.mapping.curves[0].points[-1].location=(1,.5)
for x,y in [(.18,.12),(.32,.65),(.43,.5)]:curve.mapping.curves[0].points.new(x,y)
curve.mapping.update();l.new(vor.outputs['Distance'],curve.inputs['Value'])
fine=node('ShaderNodeTexNoise','Fine settled dust',-600,-300);fine.inputs['Scale'].default_value=420;fine.inputs['Detail'].default_value=3;fine.inputs['Roughness'].default_value=.7;l.new(mapn.outputs['Vector'],fine.inputs['Vector'])
b1=node('ShaderNodeBump','Small crater normal detail only',-80,0);b1.inputs['Strength'].default_value=.35;b1.inputs['Distance'].default_value=.035;l.new(curve.outputs['Value'],b1.inputs['Height'])
b2=node('ShaderNodeBump','Dust normal detail only',130,-100);b2.inputs['Strength'].default_value=.3;b2.inputs['Distance'].default_value=.008;l.new(fine.outputs['Fac'],b2.inputs['Height']);l.new(b1.outputs['Normal'],b2.inputs['Normal'])
bs=node('ShaderNodeBsdfPrincipled','Matte regolith',370,180);bs.inputs['Roughness'].default_value=.97;l.new(ramp.outputs['Color'],bs.inputs['Base Color']);l.new(b2.outputs['Normal'],bs.inputs['Normal'])
output=node('ShaderNodeOutputMaterial','Surface only - no displacement',650,180);l.new(bs.outputs['BSDF'],output.inputs['Surface'])
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=16
scene.render.bake.use_pass_direct=False;scene.render.bake.use_pass_indirect=False;scene.render.bake.use_pass_color=True
for kind,filename in [('DIFFUSE','landing-node-color.png'),('NORMAL','landing-node-normal.png')]:
 image=bpy.data.images.new(filename,width=1024,height=1024);image.colorspace_settings.name='sRGB' if kind=='DIFFUSE' else 'Non-Color'
 target=node('ShaderNodeTexImage','Baked web export '+kind,370,-400);target.image=image;n.active=target
 bpy.ops.object.bake(type=kind);image.filepath_raw=str(out/filename);image.file_format='PNG';image.save()
mat['accuracy']='Illustrative shading only. No terrain displacement. Measured data and collision geometry unchanged.'
(root/'outputs').mkdir(exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=str(root/'outputs/Landing regolith node material.blend'))
