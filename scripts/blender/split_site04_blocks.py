import bpy, json, re
from pathlib import Path
ROOT=Path(r'C:\Users\suhas\Documents\Codex\2026-11-14\https-drive-google-com-drive-u')
SRC=ROOT/'work'/'blender'/'Moon Model.blend'
OUT=ROOT/'outputs'
blocks=[('A',range(0,8),range(1,9)),('B',range(0,8),range(9,17)),('C',range(8,16),range(1,9)),('D',range(8,16),range(9,17))]
rows=[]
for block,row_ids,col_ids in blocks:
    bpy.ops.wm.open_mainfile(filepath=str(SRC))
    source=bpy.data.scenes['Site04 - All 256 grids']
    labels={chr(ord('A')+i) for i in row_ids}
    cols=set(col_ids)
    items=[]
    for obj in source.objects:
        if obj.type!='MESH': continue
        m=re.fullmatch(r'SITE04-([A-P])(\d+)',obj.get('grid_id',''))
        if m and m.group(1) in labels and int(m.group(2)) in cols: items.append(obj)
    if len(items)!=64: raise RuntimeError(f'Block {block} has {len(items)} grids, expected 64')
    scene=bpy.data.scenes.new(f'Site04 - Grid block {block}')
    scene.unit_settings.system=source.unit_settings.system
    scene.unit_settings.scale_length=source.unit_settings.scale_length
    scene['block_id']=block
    scene['grid_scheme']='site04-polar-stereo-v1'
    scene['source_scene']='Site04 - All 256 grids'
    scene['coverage']='Original measured Site04 grid meshes for the named 8x8 block. No geometry or terrain pixels were rebuilt or baked. Imported Earth/Sun presentation meshes and star-map imagery are excluded.'
    scene.world=None
    coll=bpy.data.collections.new(f'SITE04 GRID BLOCK {block} - MEASURED TERRAIN')
    scene.collection.children.link(coll)
    for obj in items:
        dup=obj.copy()
        for user_collection in list(dup.users_collection): user_collection.objects.unlink(dup)
        coll.objects.link(dup)
    keep=set(scene.objects)
    bpy.context.window.scene=scene
    for other in list(bpy.data.scenes):
        if other!=scene: bpy.data.scenes.remove(other,do_unlink=True)
    for obj in list(bpy.data.objects):
        if obj not in keep: bpy.data.objects.remove(obj,do_unlink=True)
    for collection in list(bpy.data.collections):
        if collection!=scene.collection and collection.users==0: bpy.data.collections.remove(collection)
    bpy.data.orphans_purge(do_recursive=True)
    bpy.ops.file.pack_all()
    filename=f'Site04 - Grid block {block}.blend'
    path=OUT/filename
    bpy.ops.wm.save_as_mainfile(filepath=str(path))
    row={'block_id':block,'scene':scene.name,'filename':filename,'grid_count':len(items),'grid_ids':sorted(obj.get('grid_id','') for obj in scene.objects if obj.type=='MESH'),'vertex_count':sum(len(obj.data.vertices) for obj in scene.objects if obj.type=='MESH'),'polygon_count':sum(len(obj.data.polygons) for obj in scene.objects if obj.type=='MESH')}
    bpy.ops.wm.open_mainfile(filepath=str(path))
    reopened=bpy.data.scenes[row['scene']]
    got=sorted(obj.get('grid_id','') for obj in reopened.objects if obj.type=='MESH')
    if got!=row['grid_ids'] or len(bpy.data.scenes)!=1 or len(bpy.data.objects)!=64:
        raise RuntimeError(f'Block {block} standalone verification failed: {len(bpy.data.scenes)} scenes, {len(bpy.data.objects)} objects')
    row['reopen_verified']=True
    row['file_bytes']=path.stat().st_size
    rows.append(row)
manifest={'source_master':'Moon Model.blend','source_scene':'Site04 - All 256 grids','source_scene_geometry_sha256':'3a992951ef1f038659c5f0e352466733d2cac3c93d370dcfdd5b0dfcf607eebe','block_coverage':'Each block contains 64 measured terrain grid objects. Presentation Earth/Sun meshes and star-map imagery are excluded. All grid IDs are retained.', 'blocks':rows,'whole_grid_count':sum(r['grid_count'] for r in rows),'whole_vertex_count':sum(r['vertex_count'] for r in rows),'whole_polygon_count':sum(r['polygon_count'] for r in rows)}
(OUT/'Site04 regional block manifest.json').write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf-8')
print(json.dumps({'blocks':[{k:r[k] for k in ['block_id','filename','grid_count','vertex_count','polygon_count','file_bytes','reopen_verified']} for r in rows],'total_grids':manifest['whole_grid_count'],'total_vertices':manifest['whole_vertex_count'],'total_polygons':manifest['whole_polygon_count']}))
