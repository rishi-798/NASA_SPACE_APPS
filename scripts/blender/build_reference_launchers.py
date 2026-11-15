"""Build simplified launcher reference models with Blender.

Run: blender -b --factory-startup --python scripts/blender/build_reference_launchers.py
Dimensions follow ISRO and JAXA published vehicle summaries; fine details and
surface markings are illustrative, not engineering drawings or flight hardware.
"""
import bpy
import math
from mathutils import Vector
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PUBLIC = ROOT / 'frontend' / 'public'
OUTPUTS = ROOT / 'outputs'
PUBLIC.mkdir(parents=True, exist_ok=True)
OUTPUTS.mkdir(parents=True, exist_ok=True)


def material(name, colour, metallic=0.0, roughness=.6):
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*colour, 1)
    m.use_nodes = True
    p = m.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value = (*colour, 1)
    p.inputs['Metallic'].default_value = metallic
    p.inputs['Roughness'].default_value = roughness
    return m


def cylinder(name, radius, bottom, top, mat, x=0, y=0, vertices=64):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=top-bottom, location=(x, y, (bottom+top)/2))
    o=bpy.context.object; o.name=name; o.data.materials.append(mat)
    for face in o.data.polygons: face.use_smooth=len(face.vertices)==4
    bevel=o.modifiers.new('Soft machined edges','BEVEL');bevel.width=.055;bevel.segments=2
    o.modifiers.new('Weighted surface normals','WEIGHTED_NORMAL')
    return o


def lathe(name, profile, mat, x=0, y=0, segments=64):
    verts=[]; faces=[]
    for z,r in profile:
        verts.extend((x+r*math.cos(2*math.pi*i/segments),y+r*math.sin(2*math.pi*i/segments),z) for i in range(segments))
    for row in range(len(profile)-1):
        for i in range(segments):
            j=(i+1)%segments;a=row*segments+i;b=row*segments+j
            faces.append((a,b,b+segments,a+segments))
    mesh=bpy.data.meshes.new(name);mesh.from_pydata(verts,[],faces);mesh.update()
    o=bpy.data.objects.new(name,mesh);bpy.context.collection.objects.link(o);o.data.materials.append(mat)
    for face in mesh.polygons: face.use_smooth=True
    return o


def annulus(name,z,r,mat,x=0,y=0,thickness=.07):
    return cylinder(name,r,z,z+thickness,mat,x,y)


def rod_between(name,a,b,r,mat):
    direction=Vector(b)-Vector(a);mid=(Vector(a)+Vector(b))/2
    bpy.ops.mesh.primitive_cylinder_add(vertices=16, radius=r, depth=direction.length, location=mid)
    o=bpy.context.object;o.name=name;o.rotation_euler=direction.to_track_quat('Z','Y').to_euler();o.data.materials.append(mat)
    for face in o.data.polygons: face.use_smooth=len(face.vertices)==4
    return o


def bell(name,z,x,y,mat,scale=1):
    return lathe(name,[(z,.16*scale),(z-.22*scale,.27*scale),(z-.7*scale,.43*scale),(z-1.0*scale,.62*scale),(z-1.04*scale,.62*scale)],mat,x,y,48)


def label(name,text,z,front,scale,mat):
    curve=bpy.data.curves.new(name,'FONT');curve.body=text;curve.align_x='CENTER';curve.align_y='CENTER';curve.size=scale;curve.extrude=.004
    o=bpy.data.objects.new(name,curve);bpy.context.collection.objects.link(o);o.location=(0,front,z);o.rotation_euler=(math.pi/2,0,0);o.data.materials.append(mat)
    bpy.ops.object.select_all(action='DESELECT');o.select_set(True);bpy.context.view_layer.objects.active=o;bpy.ops.object.convert(target='MESH')


def finish(name, slug, credits):
    scene=bpy.context.scene
    scene['model_description']='Simplified educational display model; small details and markings are illustrative.'
    scene['reference']=credits
    meshes=[o for o in scene.objects if o.type=='MESH']
    for o in meshes: o.select_set(False)
    bpy.ops.object.select_all(action='DESELECT')
    for o in meshes: o.select_set(True)
    bpy.context.view_layer.objects.active=meshes[0]
    scene.unit_settings.system='METRIC'
    scene.world=bpy.data.worlds.new('Dark studio');scene.world.color=(.02,.02,.02)
    height={'lvm3-reference':43.5,'h-iia-202-reference':53,'long-march-3b-reference':54.84,'proton-k-reference':57}[slug]
    center=height/2
    cam=bpy.data.objects.new('Review camera',bpy.data.cameras.new('Review camera'));scene.collection.objects.link(cam);cam.location=(65,-100,center+26);cam.rotation_euler=(Vector((0,0,center))-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.type='ORTHO';cam.data.ortho_scale=height*1.30;scene.camera=cam
    for n,pos,energy,size in [('Key',(-30,-50,75),24000,45),('Fill',(40,-25,38),15000,38),('Rim',(0,40,55),21000,30)]:
        light=bpy.data.objects.new(n,bpy.data.lights.new(n,'AREA'));scene.collection.objects.link(light);light.location=pos;light.rotation_euler=(Vector((0,0,24))-light.location).to_track_quat('-Z','Y').to_euler();light.data.energy=energy;light.data.shape='DISK';light.data.size=size
    scene.render.engine='CYCLES';scene.cycles.samples=24;scene.render.resolution_x=720;scene.render.resolution_y=900;scene.render.resolution_percentage=100;scene.render.image_settings.file_format='PNG';scene.render.film_transparent=False;scene.render.filepath='//'+name+' launcher preview.png'
    bpy.context.preferences.filepaths.save_version=0
    bpy.ops.wm.save_as_mainfile(filepath=str(OUTPUTS/(name+' - Reference launcher.blend')))
    bpy.ops.export_scene.gltf(filepath=str(PUBLIC/(slug+'.glb')),export_format='GLB',use_selection=True,export_yup=True,export_animations=False)
    bpy.ops.render.render(write_still=True)
    print('BUILT',name, len(meshes),flush=True)


def build_lvm3():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    white=material('Warm white ceramic paint',(.72,.73,.71),0,.72);pale=material('Upper fairing paint',(.84,.84,.81),0,.68);dark=material('Charcoal separation band',(.035,.043,.05),.25,.5);steel=material('Engine metal',(.19,.20,.20),.65,.4);trim=material('Small panel details',(.32,.34,.34),.35,.55)
    cylinder('L110 core',2.0,1.3,22.3,white)
    cylinder('Upper stage',2.0,22.3,33.0,white)
    annulus('Lower stage joint',2.0,2.015,trim);annulus('Interstage separator',22.25,2.025,dark,thickness=.30);annulus('Upper equipment ring',32.70,2.04,trim,thickness=.22)
    lathe('Five metre payload fairing',[(32.92,2.0),(33.4,2.5),(39.3,2.5),(40.2,2.42),(41.1,2.18),(42.0,1.8),(42.7,1.25),(43.2,.65),(43.5,.03)],pale)
    for x in [-3.72,3.72]:
        cylinder('S200 solid booster',1.6,1.0,23.0,white,x)
        lathe('S200 nose',[(23,1.6),(23.5,1.56),(24.1,1.25),(24.65,.70),(25,.04)],pale,x)
        annulus('S200 segment seam',8.2,1.615,trim,x,thickness=.10);annulus('S200 segment seam',16.0,1.615,trim,x,thickness=.10)
        bell('S200 nozzle',1.1,x,0,steel,1.1)
        for z in [4.5,20.5]:
            rod_between('Booster attachment',(math.copysign(1.9,x),0,z),(x-math.copysign(1.58,x),0,z),.13,trim)
    for x in [-.72,.72]:bell('Vikas engine nozzle',1.30,x,0,steel,1.1)
    for z in [9.8,18.0,27.4]: annulus('Service ring',z,2.014,trim,thickness=.035)
    for x in [-.85,.85]: rod_between('External feed line',(x,-1.88,3.0),(x,-1.88,19),.045,trim)
    label('Vehicle name','LVM3',28,-2.025,1.0,dark)
    finish('LVM3','lvm3-reference','ISRO https://www.isro.gov.in/GSLVmk3_CON.html')


def build_h2a():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    white=material('Off-white painted insulation',(.76,.77,.74),0,.7);pale=material('White payload fairing',(.86,.87,.84),0,.7);orange=material('Orange insulation',(.55,.25,.10),0,.8);dark=material('Charcoal separator',(.035,.04,.045),.15,.5);steel=material('Engine metal',(.20,.21,.21),.65,.42);trim=material('Mechanical details',(.35,.36,.35),.3,.6)
    cylinder('First stage LH2 tank',2.0,1.5,28.0,orange)
    cylinder('First stage upper section',2.0,28.0,37.2,white)
    cylinder('Second stage',2.0,37.2,43.0,white)
    annulus('First stage lower ring',2.2,2.02,trim,thickness=.10);annulus('Interstage',36.9,2.035,dark,thickness=.30);annulus('Payload interface',42.8,2.04,dark,thickness=.22)
    lathe('Payload fairing',[(43,2.0),(47.5,2.0),(48.5,1.90),(49.6,1.62),(50.7,1.22),(51.8,.78),(52.6,.35),(53,.02)],pale)
    for x in [-3.33,3.33]:
        cylinder('SRB-A solid booster',1.25,1.0,14.5,white,x)
        lathe('SRB-A nose',[(14.5,1.25),(15,1.2),(15.5,.95),(16,.50),(16.1,.02)],pale,x)
        for z in [4.5,10]:annulus('Booster segment',z,1.265,trim,x,thickness=.09)
        bell('SRB-A nozzle',1.05,x,0,steel,.95)
        for z in [4,12.5]: rod_between('Booster attachment',(math.copysign(1.95,x),0,z),(x-math.copysign(1.23,x),0,z),.10,trim)
    bell('LE-7A engine nozzle',1.55,0,0,steel,1.55)
    for z in [9,20,29.5,34]:annulus('Tank ring',z,2.015,trim,thickness=.035)
    rod_between('External conduit',(-.75,-1.89,4),(-.75,-1.89,34),.06,trim)
    label('Vehicle name','H-IIA',40,-2.025,.95,dark)
    finish('H-IIA 202','h-iia-202-reference','JAXA https://global.jaxa.jp/projects/rockets/h2a/index.html')

def build_long_march():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    white=material('White exterior',(.77,.78,.76),0,.72);pale=material('Payload fairing',(.86,.86,.83),0,.7);dark=material('Stage separator',(.035,.04,.045),.15,.5);steel=material('Engine metal',(.19,.2,.2),.65,.42);trim=material('Panel seams',(.36,.37,.36),.3,.6)
    cylinder('First stage',1.675,1.4,27,white);cylinder('Second stage',1.675,27,39,white);cylinder('Third stage',1.5,39,45,white)
    annulus('First stage separation',26.8,1.70,dark,thickness=.28);annulus('Second stage separation',38.8,1.70,dark,thickness=.22)
    lathe('Four metre payload fairing',[(44.9,1.5),(45.5,2.0),(50,2.0),(51,1.85),(52,1.5),(53,1.05),(54,.5),(54.84,.02)],pale)
    for x,y in [(2.83,0),(-2.83,0),(0,2.83),(0,-2.83)]:
        cylinder('Liquid booster',1.125,1,14,white,x,y);lathe('Booster nose',[(14,1.125),(14.6,1.04),(15.2,.7),(15.8,.1)],pale,x,y);bell('Booster nozzle',1.05,x,y,steel,.85)
        for z in [4,11]: rod_between('Booster attachment',(x*.58,y*.58,z),(x*.64,y*.64,z),.10,trim)
        annulus('Booster segment seam',8,1.14,trim,x,y,thickness=.06)
    for x in [-.55,.55]:
        for y in [-.55,.55]:bell('Core engine',1.4,x,y,steel,.8)
    for z in [7,18,32,43]:annulus('Service ring',z,1.69 if z<39 else 1.515,trim,thickness=.04)
    label('Vehicle name','LM-3B',35,-1.70,.9,dark)
    finish('Long March 3B','long-march-3b-reference','CNSA https://www.cnsa.gov.cn/english/n6465715/n6465718/c6476890/content.html')


def build_proton():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    white=material('Pale exterior',(.76,.77,.75),0,.72);pale=material('Payload fairing',(.85,.86,.83),0,.7);dark=material('Stage separator',(.04,.045,.05),.15,.5);steel=material('Engine metal',(.19,.20,.20),.65,.42);trim=material('Panel seams',(.35,.36,.35),.3,.6)
    cylinder('First stage central oxidizer tank',2.05,1.4,21.6,white);cylinder('Second stage',2.05,21.6,37.0,white);cylinder('Third stage',2.05,37,44.3,white)
    annulus('First stage separator',21.4,2.075,dark,thickness=.25);annulus('Second stage separator',36.85,2.075,dark,thickness=.22)
    lathe('Upper stage and fairing',[(44.2,2.05),(47,2.05),(48,2.05),(50,1.95),(52,1.70),(54,1.25),(56,.65),(57,.03)],pale)
    for i in range(6):
        angle=2*math.pi*i/6;x=2.84*math.cos(angle);y=2.84*math.sin(angle)
        cylinder('First stage outboard fuel tank',.83,1.2,19.9,white,x,y);lathe('Outboard tank cap',[(19.9,.83),(20.3,.78),(20.8,.48),(21.0,.02)],pale,x,y);bell('First stage engine',1.25,x,y,steel,.90)
        annulus('Tank segment seam',10,.845,trim,x,y,thickness=.06)
    for z in [8,16,28,34,41,46]:annulus('Service ring',z,2.065,trim,thickness=.035)
    label('Vehicle name','PROTON K',32,-2.075,.8,dark)
    finish('Proton-K D','proton-k-reference','NASA https://sma.nasa.gov/LaunchVehicle/assets/proton-kd.pdf')


build_lvm3()
build_h2a()
build_long_march()
build_proton()
