import bpy,json
bpy.ops.wm.open_mainfile(filepath=r'C:\Users\suhas\Documents\Codex\2026-11-14\https-drive-google-com-drive-u\outputs\Apollo 16 - Measured terrain.blend')
o=bpy.data.objects['MOON-R0300-C0585-r2-c9']; ns=[p.normal.z for p in o.data.polygons]
print(json.dumps({'norm_z_min':min(ns),'count_negative':sum(n<0 for n in ns),'count_below_01':sum(n<.1 for n in ns),'height_range':o['source_center_pixel_height_m']}))
