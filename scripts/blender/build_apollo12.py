import bpy
import json
import math
import numpy as np
from pathlib import Path
from mathutils import Vector

root = Path(r"C:\Users\suhas\Documents\Codex\2026-11-14\https-drive-google-com-drive-u")
work = root / "work" / "blender"
outputs = root / "outputs"
outputs.mkdir(exist_ok=True)
data = np.load(work / "apollo12-dem-window.npz")
heights = data["heights_m"].astype(np.float64)
lat = data["lat"]
lon = data["lon"]
valid = data["valid"]

site_lat = -3.01280
site_lon = -23.42190
radius = 1737400.0
radius_m = 10000.0
site_lat_r = math.radians(site_lat)
site_lon_r = math.radians(site_lon)
anchor = np.array([
    radius * math.cos(site_lat_r) * math.cos(site_lon_r),
    radius * math.cos(site_lat_r) * math.sin(site_lon_r),
    radius * math.sin(site_lat_r),
])
east = np.array([-math.sin(site_lon_r), math.cos(site_lon_r), 0.0])
north = np.array([
    -math.sin(site_lat_r) * math.cos(site_lon_r),
    -math.sin(site_lat_r) * math.sin(site_lon_r),
    math.cos(site_lat_r),
])
up = np.array([
    math.cos(site_lat_r) * math.cos(site_lon_r),
    math.cos(site_lat_r) * math.sin(site_lon_r),
    math.sin(site_lat_r),
])

lat_grid, lon_grid = np.meshgrid(lat, lon, indexing="ij")
phi = np.radians(lat_grid)
lam = np.radians(lon_grid)
rho = radius + heights
px = rho * np.cos(phi) * np.cos(lam)
py = rho * np.cos(phi) * np.sin(lam)
pz = rho * np.sin(phi)
dx, dy, dz = px - anchor[0], py - anchor[1], pz - anchor[2]
x = dx * east[0] + dy * east[1] + dz * east[2]
y = dx * north[0] + dy * north[1] + dz * north[2]
z = dx * up[0] + dy * up[1] + dz * up[2]
inside = valid & (x * x + y * y <= radius_m * radius_m)

row_count, col_count = heights.shape
index = np.full((row_count, col_count), -1, dtype=np.int32)
index[inside] = np.arange(int(inside.sum()), dtype=np.int32)
vertices = np.column_stack((x[inside], y[inside], z[inside])).tolist()
faces = []
for row in range(row_count - 1):
    for col in range(col_count - 1):
        ids = (index[row, col], index[row + 1, col], index[row + 1, col + 1], index[row, col + 1])
        if min(ids) >= 0:
            faces.append(ids)

bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)
for collection in list(bpy.data.collections):
    if collection.users == 0:
        bpy.data.collections.remove(collection)
scene = bpy.context.scene
scene.name = "Apollo 12 - Measured terrain"
scene.unit_settings.system = "METRIC"
scene.unit_settings.scale_length = 1.0
scene["region_id"] = "REGION-APOLLO-12"
scene["grid_id"] = "MOON-R0282-C0474-r1-c5"
scene["coordinate_frame"] = "ME/DE421"
scene["production_ready"] = False

terrain_collection = bpy.data.collections.new("MEASURED TERRAIN - Apollo 12 10 km radius")
scene.collection.children.link(terrain_collection)
mesh = bpy.data.meshes.new("MOON-R0282-C0474-r1-c5 | SLDEM2015 59 m source pixels")
mesh.from_pydata(vertices, [], faces)
mesh.update(calc_edges=True)
terrain = bpy.data.objects.new("MOON-R0282-C0474-r1-c5", mesh)
terrain_collection.objects.link(terrain)
terrain["grid_id"] = "MOON-R0282-C0474-r1-c5"
terrain["region_id"] = "REGION-APOLLO-12"
terrain["site_latitude_planetocentric_deg"] = site_lat
terrain["site_longitude_east_deg"] = site_lon
terrain["coordinate_frame"] = "ME/DE421"
terrain["source_id"] = "sldem2015_512_30s_00s_315_360_float"
terrain["dataset_release_commit"] = "a6b2c53f65661fbd5165eae5a83449aeb35abcd8"
terrain["source_uri"] = "https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/sldem2015/tiles/float_img/sldem2015_512_30s_00s_315_360_float.lbl"
terrain["source_cloud_cog"] = "cogs/sldem2015_512_30s_00s_315_360_float.tif"
terrain["source_pixels_preserved"] = True
terrain["source_native_units"] = "km above 1737.4 km reference sphere"
terrain["mesh_vertex_units"] = "metres"
terrain["vertical_reference_radius_m"] = radius
terrain["sample_spacing_north_south_m"] = 59.225293797166955
terrain["sample_spacing_east_west_m_at_anchor_m"] = 59.14343934189621
terrain["local_frame"] = "Tangent frame at anchor: X east, Y north, Z up; positions derived from ME/DE421 Moon-fixed spherical coordinates"
terrain["vertical_exaggeration"] = 1.0
terrain["cosmetic_geometry_present"] = False
terrain["production_ready"] = False
terrain["production_limit"] = "Viewer/Moon-fixed-to-world placement transform and visual integration are not yet validated."
terrain["candidate_glb_axis"] = "Z-up; preserve this asset axis setting when loading."
terrain["source_center_pixel_height_m"] = float(heights[np.argmin(abs(lat-site_lat)), np.argmin(abs(lon-site_lon))])

# Surveyor 3 is within the Apollo 12 region. Keep its location as a named
# point marker so the shared terrain can serve both sites without duplicating
# the measured mesh.
surveyor3_lat = -3.0162
surveyor3_lon = -23.418000000000006
surveyor3_i = int(np.argmin(abs(lat - surveyor3_lat)))
surveyor3_j = int(np.argmin(abs(lon - surveyor3_lon)))
surveyor3_height = float(heights[surveyor3_i, surveyor3_j])
surveyor3_phi = math.radians(float(lat[surveyor3_i]))
surveyor3_lam = math.radians(float(lon[surveyor3_j]))
surveyor3_rho = radius + surveyor3_height
surveyor3_p = np.array([surveyor3_rho * math.cos(surveyor3_phi) * math.cos(surveyor3_lam), surveyor3_rho * math.cos(surveyor3_phi) * math.sin(surveyor3_lam), surveyor3_rho * math.sin(surveyor3_phi)])
surveyor3_d = surveyor3_p - anchor
surveyor3_local = (float(np.dot(surveyor3_d, east)), float(np.dot(surveyor3_d, north)), float(np.dot(surveyor3_d, up)))
surveyor3_marker = bpy.data.objects.new("SITE MARKER - Surveyor 3", None)
surveyor3_marker.empty_display_type = "SPHERE"
surveyor3_marker.empty_display_size = 100.0
surveyor3_marker.location = surveyor3_local
surveyor3_marker["site_id"] = "surveyor-3"
surveyor3_marker["latitude_planetocentric_deg"] = surveyor3_lat
surveyor3_marker["longitude_east_deg"] = surveyor3_lon
surveyor3_marker["source_height_m"] = surveyor3_height
surveyor3_marker["grid_id"] = "MOON-R0282-C0474-r1-c5"
terrain_collection.objects.link(surveyor3_marker)

with bpy.data.libraries.load(str(work / "Moon Model.blend"), link=False) as (source, destination):
    destination.materials = ["Historical scientific terrain - neutral, no cosmetic bump"]
material = destination.materials[0]
if material is None:
    raise RuntimeError("Could not reuse the source project's measured-terrain material")
mesh.materials.append(material)

presentation = bpy.data.collections.new("PRESENTATION ONLY - camera and illustrative light")
scene.collection.children.link(presentation)

def aim(obj, target):
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat("-Z", "Y").to_euler()

target_z = float(np.nanmedian(z[inside]))
camera_data = bpy.data.cameras.new("Apollo 12 overview camera")
camera = bpy.data.objects.new("Apollo 12 overview camera", camera_data)
presentation.objects.link(camera)
camera.location = (17500.0, -22000.0, target_z + 19000.0)
aim(camera, (0.0, 0.0, target_z))
camera_data.lens = 50.0
camera_data.clip_end = 100000.0
scene.camera = camera

light_data = bpy.data.lights.new("Illustrative review sun", type="SUN")
light = bpy.data.objects.new("Illustrative review sun", light_data)
presentation.objects.link(light)
light.location = (-9000.0, -12000.0, target_z + 18000.0)
light_data.energy = 3.5
light_data.angle = math.radians(0.533)
aim(light, (0.0, 0.0, target_z))
scene.world.color = (0.0, 0.0, 0.0)
scene.render.engine = "CYCLES"
scene.cycles.samples = 24
scene.render.resolution_x = 1280
scene.render.resolution_y = 960
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = "PNG"
scene.render.filepath = str(outputs / "Apollo 12 measured terrain preview.png")
scene.view_settings.view_transform = "AgX"

metadata = {
    "region_id": "REGION-APOLLO-12",
    "scene": scene.name,
    "object_name": terrain.name,
    "locations_covered": [{"id": "apollo-12", "name": "Apollo 12", "latitude_planetocentric_deg": site_lat, "longitude_east_deg": site_lon}, {"id": "surveyor-3", "name": "Surveyor 3", "latitude_planetocentric_deg": surveyor3_lat, "longitude_east_deg": surveyor3_lon, "source_height_m": surveyor3_height, "source_pixel_latitude_deg": float(lat[surveyor3_i]), "source_pixel_longitude_east_deg": float(lon[surveyor3_j]), "grid_id": "MOON-R0282-C0474-r1-c5", "height_source_matches_shared_region": True}],
    "grid_id": terrain["grid_id"],
    "grid_parent_id": "MOON-R0282-C0474",
    "anchor": {"latitude_planetocentric_deg": site_lat, "longitude_east_deg": site_lon},
    "coordinate_frame": "ME/DE421",
    "vertical_reference_radius_m": radius,
    "source_id": terrain["source_id"],
    "dataset_release_commit": terrain["dataset_release_commit"],
    "source_pds_url": terrain["source_uri"],
    "source_cloud_cog": terrain["source_cloud_cog"],
    "source_units": "km above 1737.4 km reference sphere",
    "mesh_units": "m",
    "source_pixel_spacing_m": {"north_south": terrain["sample_spacing_north_south_m"], "east_west_at_anchor": terrain["sample_spacing_east_west_m_at_anchor_m"]},
    "source_pixels_used": int(inside.sum()),
    "mesh_faces": len(faces),
    "height_range_m": [float(np.nanmin(heights[inside])), float(np.nanmax(heights[inside]))],
    "anchor_sample_height_m": terrain["source_center_pixel_height_m"],
    "terrain_api_control_check": {
        "endpoint": "https://brahmos-lunar-browser.onrender.com/api/terrain/lookup",
        "result": "5 source pixels matched the live service within 0.00005 m; discrepancies are float conversion only.",
        "controls": [
            {"latitude_deg": -3.01280, "longitude_east_deg": -23.42190, "grid_id": "MOON-R0282-C0474-r1-c5", "source_height_m": -1425.5521240234375, "api_height_m": -1425.5521297454834, "difference_m": -0.0000057220458984375},
            {"latitude_deg": -2.96790, "longitude_east_deg": -23.42190, "grid_id": "MOON-R0282-C0474-r0-c5", "source_height_m": -1412.0361328125, "api_height_m": -1412.0361804962158, "difference_m": -0.0000476837158203125},
            {"latitude_deg": -3.05770, "longitude_east_deg": -23.42190, "grid_id": "MOON-R0282-C0474-r2-c5", "source_height_m": -1465.5352783203125, "api_height_m": -1465.535283088684, "difference_m": -0.00000476837158203125},
            {"latitude_deg": -3.01280, "longitude_east_deg": -23.37690, "grid_id": "MOON-R0282-C0474-r1-c6", "source_height_m": -1417.0994873046875, "api_height_m": -1417.0994758605957, "difference_m": 0.000011444091796875},
            {"latitude_deg": -3.01280, "longitude_east_deg": -23.46690, "grid_id": "MOON-R0282-C0474-r1-c3", "source_height_m": -1431.840087890625, "api_height_m": -1431.8400621414185, "difference_m": 0.00002574920654296875},
        ],
    },
    "local_axes": {"x": "east", "y": "north", "z": "up"},
    "local_frame_definition": "Moon-fixed ME/DE421 position vectors at the original source pixel centers, with a 1737400 m reference-sphere anchor subtracted and projected onto anchor east/north/up basis vectors.",
    "local_to_moon_fixed_matrix_row_major": [
        [float(east[0]), float(north[0]), float(up[0]), float(anchor[0])],
        [float(east[1]), float(north[1]), float(up[1]), float(anchor[1])],
        [float(east[2]), float(north[2]), float(up[2]), float(anchor[2])],
        [0.0, 0.0, 0.0, 1.0],
    ],
    "vertical_exaggeration": 1.0,
    "cosmetic_geometry": False,
    "candidate_glb": {
        "filename": "Apollo 12 - Measured terrain candidate.glb",
        "axis_convention": "Z-up to preserve the mesh local tangent frame directly; configure the receiving loader as Z-up.",
        "vertex_count": len(vertices),
        "face_count": len(faces),
        "production_ready": False,
    },
    "illustrative_lighting_only": True,
    "production_ready": False,
    "not_yet_validated": ["local-to-viewer Moon-fixed-to-world placement", "browser glTF/GLB integration", "sun and Earth ephemeris lighting", "visual review against project reference scenes"],
}
metadata_path = outputs / "Apollo 12 measured terrain metadata.json"
metadata_path.write_text(json.dumps(metadata, indent=2) + "\n", encoding="utf-8")

blend_path = outputs / "Apollo 12 - Measured terrain.blend"
for obj in bpy.context.selected_objects:
    obj.select_set(False)
terrain.select_set(True)
bpy.context.view_layer.objects.active = terrain
for screen in bpy.data.screens:
    for area in screen.areas:
        if area.type == "VIEW_3D":
            area.spaces.active.region_3d.view_perspective = "CAMERA"
bpy.ops.wm.save_as_mainfile(filepath=str(blend_path))
bpy.ops.export_scene.gltf(
    filepath=str(outputs / "Apollo 12 - Measured terrain candidate.glb"),
    export_format="GLB",
    use_selection=True,
    export_yup=False,
    export_extras=True,
    export_lights=False,
    export_cameras=False,
    export_animations=False,
)
bpy.ops.render.render(write_still=True)
print("APOLLO12_BUILD " + json.dumps({"blend": str(blend_path), "object": terrain.name, "vertices": len(vertices), "faces": len(faces), "source_pixels": int(inside.sum()), "preview": scene.render.filepath, "metadata": str(metadata_path)}))
