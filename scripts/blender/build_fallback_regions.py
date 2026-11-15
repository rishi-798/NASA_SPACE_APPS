import bpy
import json
import math
import numpy as np
from pathlib import Path
from mathutils import Vector

ROOT = Path(r"C:\Users\suhas\Documents\Codex\2026-11-14\https-drive-google-com-drive-u")
WORK = ROOT / "work" / "blender"
OUTPUTS = ROOT / "outputs"
OUTPUTS.mkdir(exist_ok=True)
SOURCE_BLEND = WORK / "snapshot_extract" / "Blender-Suhas-Dip-2026-11-14" / "Moon Model.blend"
sites = json.loads((WORK / "next_fallback_sites.json").read_text(encoding="utf-8"))

def aim(obj, target):
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat("-Z", "Y").to_euler()

for site in sites:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    lat0, lon0 = site["center"]
    lat0_r = math.radians(lat0)
    lon0_r = math.radians(lon0)
    radius = float(site["vertical_reference_radius_m"])
    radius_m = 10000.0

    data = np.load(site["npz_path"])
    heights = data["heights_m"].astype(np.float64)
    lat = data["lat"]
    lon = data["lon"]
    valid = data["valid"]
    anchor = np.array([
        radius * math.cos(lat0_r) * math.cos(lon0_r),
        radius * math.cos(lat0_r) * math.sin(lon0_r),
        radius * math.sin(lat0_r),
    ])
    east = np.array([-math.sin(lon0_r), math.cos(lon0_r), 0.0])
    north = np.array([
        -math.sin(lat0_r) * math.cos(lon0_r),
        -math.sin(lat0_r) * math.sin(lon0_r),
        math.cos(lat0_r),
    ])
    up = np.array([
        math.cos(lat0_r) * math.cos(lon0_r),
        math.cos(lat0_r) * math.sin(lon0_r),
        math.sin(lat0_r),
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

    scene = bpy.context.scene
    scene.name = f"{site['name']} - Measured terrain"
    scene.unit_settings.system = "METRIC"
    scene.unit_settings.scale_length = 1.0
    scene["region_id"] = site["region_id"]
    scene["grid_id"] = site["grid_id"]
    scene["coordinate_frame"] = site["coordinate_frame"]
    scene["production_ready"] = False
    terrain_collection = bpy.data.collections.new(f"MEASURED TERRAIN - {site['name']} 10 km radius")
    scene.collection.children.link(terrain_collection)
    mesh = bpy.data.meshes.new(f"{site['grid_id']} | {site['source_id']} native source pixels")
    mesh.from_pydata(vertices, [], faces)
    mesh.update(calc_edges=True)
    terrain = bpy.data.objects.new(site["grid_id"], mesh)
    terrain_collection.objects.link(terrain)
    terrain["grid_id"] = site["grid_id"]
    terrain["lookup_grid_id"] = site["lookup_grid_id"]
    terrain["region_id"] = site["region_id"]
    terrain["site_latitude_planetocentric_deg"] = lat0
    terrain["site_longitude_east_deg"] = lon0
    terrain["coordinate_frame"] = site["coordinate_frame"]
    terrain["source_id"] = site["source_id"]
    terrain["api_center_selected_source_id"] = site["api_center_selected_source_id"]
    terrain["api_center_uses_different_source"] = site["api_center_uses_different_source"]
    terrain["source_cloud_cog"] = site["source_cloud_cog"]
    terrain["dataset_release_commit"] = site["dataset_release_commit"]
    terrain["source_native_units"] = "km above 1737.4 km reference sphere"
    terrain["mesh_vertex_units"] = "metres"
    terrain["vertical_reference_radius_m"] = radius
    terrain["sample_spacing_north_south_m"] = site["sample_spacing_y_m"]
    terrain["sample_spacing_east_west_m_at_anchor_m"] = site["sample_spacing_x_m"]
    terrain["local_frame"] = "Tangent frame at anchor: X east, Y north, Z up; positions derived from ME/DE421 Moon-fixed spherical coordinates"
    terrain["vertical_exaggeration"] = 1.0
    terrain["cosmetic_geometry_present"] = False
    terrain["api_control_points_checked"] = len(site["control_samples"])
    terrain["production_ready"] = False
    terrain["production_limit"] = "Viewer/Moon-fixed-to-world placement transform and visual integration are not yet validated."
    terrain["candidate_glb_axis"] = "Z-up; preserve this asset axis setting when loading."
    terrain["source_center_pixel_height_m"] = site["anchor_sample_height_m"]

    with bpy.data.libraries.load(str(SOURCE_BLEND), link=False) as (source, destination):
        destination.materials = ["Historical scientific terrain - neutral, no cosmetic bump"]
    material = destination.materials[0]
    if material is None:
        raise RuntimeError("Source project scientific terrain material is unavailable")
    mesh.materials.append(material)

    marker_collection = bpy.data.collections.new("SITE MARKERS - metadata-only empties")
    scene.collection.children.link(marker_collection)
    for marker in site["markers"]:
        marker_lat_r = math.radians(marker["latitude"])
        marker_lon_r = math.radians(marker["longitude"])
        marker_radius = radius + marker["height_m"]
        marker_xyz = np.array([
            marker_radius * math.cos(marker_lat_r) * math.cos(marker_lon_r),
            marker_radius * math.cos(marker_lat_r) * math.sin(marker_lon_r),
            marker_radius * math.sin(marker_lat_r),
        ])
        offset = marker_xyz - anchor
        local_position = (
            float(np.dot(offset, east)),
            float(np.dot(offset, north)),
            float(np.dot(offset, up)),
        )
        marker_object = bpy.data.objects.new(marker["id"], None)
        marker_object.empty_display_type = "SPHERE"
        marker_object.empty_display_size = 45.0
        marker_object.location = local_position
        marker_object["marker_id"] = marker["id"]
        marker_object["grid_id"] = marker["grid_id"]
        marker_object["lookup_grid_id"] = marker["lookup_grid_id"]
        marker_object["latitude_planetocentric_deg"] = marker["latitude"]
        marker_object["longitude_east_deg"] = marker["longitude"]
        marker_object["source_height_m"] = marker["height_m"]
        marker_object["source_id"] = marker["source_id"]
        marker_collection.objects.link(marker_object)

    presentation = bpy.data.collections.new("PRESENTATION ONLY - camera and illustrative light")
    scene.collection.children.link(presentation)
    target_z = float(np.nanmedian(z[inside]))
    camera_data = bpy.data.cameras.new(f"{site['name']} overview camera")
    camera = bpy.data.objects.new(f"{site['name']} overview camera", camera_data)
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
    scene.world = bpy.data.worlds.new("Black space review world")
    scene.world.color = (0.0, 0.0, 0.0)
    scene.render.engine = "CYCLES"
    scene.cycles.samples = 24
    scene.render.resolution_x = 1280
    scene.render.resolution_y = 960
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.view_settings.view_transform = "AgX"
    stem = site["name"]
    blend_path = OUTPUTS / f"{stem} - Measured terrain.blend"
    glb_path = OUTPUTS / f"{stem} - Measured terrain candidate.glb"
    preview_path = OUTPUTS / f"{stem} measured terrain preview.png"
    scene.render.filepath = str(preview_path)
    for obj in bpy.context.selected_objects:
        obj.select_set(False)
    terrain.select_set(True)
    bpy.context.view_layer.objects.active = terrain
    for screen in bpy.data.screens:
        for area in screen.areas:
            if area.type == "VIEW_3D":
                area.spaces.active.region_3d.view_perspective = "CAMERA"

    matrix = [
        [float(east[0]), float(north[0]), float(up[0]), float(anchor[0])],
        [float(east[1]), float(north[1]), float(up[1]), float(anchor[1])],
        [float(east[2]), float(north[2]), float(up[2]), float(anchor[2])],
        [0.0, 0.0, 0.0, 1.0],
    ]
    same_source_deltas = [abs(c["difference_m"]) for c in site["control_samples"] if c["source_matches_region_mesh"]]
    if not site["api_center_uses_different_source"]:
        same_source_deltas.append(abs(site["api_center_sample_delta_m"]))
    metadata = {
        "region_id": site["region_id"],
        "scene": scene.name,
        "object_name": terrain.name,
        "grid_id": site["grid_id"],
        "lookup_grid_id": site["lookup_grid_id"],
        "grid_parent_id": site["parent_grid_id"],
        "locations_covered": site["markers"],
        "source_provenance_note": "The region mesh uses the listed global SLDEM tile. Any center or marker whose selected API source differs is recorded separately; exact point-height parity does not mean that higher-priority source pixels were overlaid across their footprint." if site["api_center_uses_different_source"] or any(not marker["source_matches_region_mesh"] for marker in site["markers"]) else "All listed markers use the same selected elevation source as the region mesh.",
        "footprint": {"kind": "geodesic_circle", "radius_m": radius_m, "diameter_m": 20000.0},
        "anchor": {"latitude_planetocentric_deg": lat0, "longitude_east_deg": lon0},
        "coordinate_frame": site["coordinate_frame"],
        "vertical_reference_radius_m": radius,
        "source_id": site["source_id"],
        "api_center_selected_source_id": site["api_center_selected_source_id"],
        "api_center_uses_different_source": site["api_center_uses_different_source"],
        "dataset_release_commit": site["dataset_release_commit"],
        "source_pds_url": site["source_pds_url"],
        "source_cloud_cog": site["source_cloud_cog"],
        "source_units": "km above 1737.4 km reference sphere",
        "mesh_units": "m",
        "source_pixel_spacing_m": {"north_south": site["sample_spacing_y_m"], "east_west_at_anchor": site["sample_spacing_x_m"]},
        "source_pixels_used": int(inside.sum()),
        "mesh_faces": len(faces),
        "height_range_m": [float(np.nanmin(heights[inside])), float(np.nanmax(heights[inside]))],
        "anchor_sample_height_m": site["anchor_sample_height_m"],
        "api_center_sample_height_m": site["api_center_sample_height_m"],
        "api_center_sample_delta_m": site["api_center_sample_delta_m"],
        "terrain_api_control_check": {"endpoint": "https://brahmos-lunar-browser.onrender.com/api/terrain/lookup", "controls": site["control_samples"], "max_abs_same_source_difference_m": max(same_source_deltas, default=None), "controls_using_same_source_count": sum(1 for c in site["control_samples"] if c["source_matches_region_mesh"]), "controls_using_other_sources_count": sum(1 for c in site["control_samples"] if not c["source_matches_region_mesh"])},
        "local_axes": {"x": "east", "y": "north", "z": "up"},
        "local_frame_definition": "Moon-fixed ME/DE421 position vectors at original source pixel centers, with the 1737400 m reference-sphere anchor subtracted and projected onto anchor east/north/up basis vectors.",
        "local_to_moon_fixed_matrix_row_major": matrix,
        "vertical_exaggeration": 1.0,
        "cosmetic_geometry": False,
        "illustrative_lighting_only": True,
        "candidate_glb": {"filename": glb_path.name, "axis_convention": "Z-up; configure receiving loader as Z-up.", "vertex_count": len(vertices), "face_count": len(faces), "production_ready": False},
        "production_ready": False,
        "not_yet_validated": ["viewer/Moon-fixed-to-world placement", "browser glTF/GLB integration and performance", "Sun/Earth ephemeris lighting"],
    }
    (OUTPUTS / f"{stem} measured terrain metadata.json").write_text(json.dumps(metadata, indent=2) + "\n", encoding="utf-8")
    bpy.ops.wm.save_as_mainfile(filepath=str(blend_path))
    bpy.ops.export_scene.gltf(filepath=str(glb_path), export_format="GLB", use_selection=True, export_yup=False, export_extras=True, export_lights=False, export_cameras=False, export_animations=False)
    bpy.ops.render.render(write_still=True)
    print("SITE_BUILD " + json.dumps({"region_id": site["region_id"], "grid_id": terrain["grid_id"], "blend": str(blend_path), "glb": str(glb_path), "vertices": len(vertices), "faces": len(faces), "api_control_count": len(site["control_samples"])}))
