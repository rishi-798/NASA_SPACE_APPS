"""Build review-ready curved global-LOLA overview meshes for planned craters."""
import json
import math
from pathlib import Path

import bpy
import numpy as np
from mathutils import Vector

ROOT = Path(r"C:\Users\suhas\Documents\Codex\2026-11-14\https-drive-google-com-drive-u")
WORK = ROOT / "work" / "blender"
OUT = ROOT / "outputs"
OUT.mkdir(exist_ok=True)
SITES = json.loads((WORK / "crater_overviews_prepared.json").read_text(encoding="utf-8"))
RIM_AUDIT = json.loads((OUT / "Crater footprint source audit.json").read_text(encoding="utf-8"))["features"]
RADIUS_M = 1_737_400.0


def look_at(obj, target):
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat("-Z", "Y").to_euler()


def build_site(site):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    lat0, lon0 = site["center"]
    lat0r, lon0r = math.radians(lat0), math.radians(lon0)
    npz = np.load(site["npz_path"])
    heights = npz["heights_m"].astype(np.float64)
    valid = npz["valid"]
    latitudes = npz["latitude_deg"].astype(np.float64)
    longitudes = npz["longitude_deg"].astype(np.float64)
    if not bool(valid.all()):
        raise RuntimeError(f"Unexpected missing source pixels in {site['name']} window")

    phi, lam = np.meshgrid(np.radians(latitudes), np.radians(longitudes), indexing="ij")
    rho = RADIUS_M + heights
    px = rho * np.cos(phi) * np.cos(lam)
    py = rho * np.cos(phi) * np.sin(lam)
    pz = rho * np.sin(phi)
    anchor = np.array([
        RADIUS_M * math.cos(lat0r) * math.cos(lon0r),
        RADIUS_M * math.cos(lat0r) * math.sin(lon0r),
        RADIUS_M * math.sin(lat0r),
    ])
    east = np.array([-math.sin(lon0r), math.cos(lon0r), 0.0])
    north = np.array([
        -math.sin(lat0r) * math.cos(lon0r),
        -math.sin(lat0r) * math.sin(lon0r),
        math.cos(lat0r),
    ])
    up = np.array([
        math.cos(lat0r) * math.cos(lon0r),
        math.cos(lat0r) * math.sin(lon0r),
        math.sin(lat0r),
    ])
    dx, dy, dz = px - anchor[0], py - anchor[1], pz - anchor[2]
    x = dx * east[0] + dy * east[1] + dz * east[2]
    y = dx * north[0] + dy * north[1] + dz * north[2]
    z = dx * up[0] + dy * up[1] + dz * up[2]
    coordinates = np.column_stack((x.ravel(), y.ravel(), z.ravel()))
    vertices = [tuple(map(float, row)) for row in coordinates]

    row_count, col_count = heights.shape
    faces = []
    for row in range(row_count - 1):
        base = row * col_count
        next_row = base + col_count
        # Latitude rows descend while columns advance east, so this order gives outward normals.
        faces.extend((base + col, next_row + col, next_row + col + 1, base + col + 1) for col in range(col_count - 1))

    mesh = bpy.data.meshes.new(f"{site['name']} - global LOLA64 overview mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update(calc_edges=True)
    terrain = bpy.data.objects.new(f"{site['region_id']} - measured overview terrain", mesh)
    bpy.context.scene.collection.objects.link(terrain)
    terrain["region_id"] = site["region_id"]
    terrain["terrain_source"] = site["source_id"]
    terrain["coordinate_frame"] = site["coordinate_frame"]
    terrain["vertical_reference_radius_m"] = RADIUS_M
    terrain["overview_resolution_m_north_south"] = 473.80235037733564
    terrain["cosmetic_geometry"] = False
    terrain["footprint_state"] = "conservative geographic envelope from provisional published crater bounds plus a 10 km coordinate buffer"

    center = bpy.data.objects.new(f"{site['name']} crater center (planning anchor)", None)
    bpy.context.scene.collection.objects.link(center)
    center.location = (0.0, 0.0, float(site["anchor_sample_height_m"]))
    center.empty_display_type = "SPHERE"
    center.empty_display_size = 2500.0
    center["latitude_planetocentric_deg"] = lat0
    center["longitude_east_deg"] = lon0
    center["coordinate_alignment_state"] = site["coordinate_alignment_state"]
    center["role"] = "planning anchor; crater frame alignment has not been validated"

    material = bpy.data.materials.new("Neutral measured lunar terrain")
    material.diffuse_color = (0.34, 0.35, 0.37, 1.0)
    material.use_nodes = True
    bsdf = next(node for node in material.node_tree.nodes if node.type == "BSDF_PRINCIPLED")
    bsdf.inputs["Base Color"].default_value = (0.34, 0.35, 0.37, 1.0)
    bsdf.inputs["Roughness"].default_value = 0.94
    terrain.data.materials.append(material)

    scene = bpy.context.scene
    scene.name = f"{site['region_id']} - LOLA64 overview"
    scene.unit_settings.system = "METRIC"
    scene.unit_settings.scale_length = 1.0
    scene.render.engine = "CYCLES"
    scene.cycles.samples = 16
    scene.render.resolution_x = 1280
    scene.render.resolution_y = 960
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.film_transparent = False
    scene.view_settings.view_transform = "AgX"
    scene.world = bpy.data.worlds.new("Black lunar review world")
    scene.world.color = (0.004, 0.005, 0.007)

    minimum = coordinates.min(axis=0)
    maximum = coordinates.max(axis=0)
    width, depth = float(maximum[0] - minimum[0]), float(maximum[1] - minimum[1])
    target = (float((minimum[0] + maximum[0]) / 2), float((minimum[1] + maximum[1]) / 2), float(np.median(z)))
    span = max(width, depth)
    camera_data = bpy.data.cameras.new(f"{site['name']} overview camera")
    camera = bpy.data.objects.new(f"{site['name']} overview camera", camera_data)
    scene.collection.objects.link(camera)
    camera.location = (target[0] + span * 0.42, target[1] - span * 0.92, target[2] + span * 0.84)
    look_at(camera, target)
    camera_data.lens = 52.0
    camera_data.clip_end = span * 4.0
    scene.camera = camera

    light_data = bpy.data.lights.new("Illustrative review sunlight", "SUN")
    light = bpy.data.objects.new("Illustrative review sunlight", light_data)
    scene.collection.objects.link(light)
    light.location = (-span * 0.6, -span * 0.8, span * 1.4)
    light_data.energy = 2.2
    light_data.angle = math.radians(0.533)
    look_at(light, target)

    stem = site["name"]
    blend_path = OUT / f"{stem} - Overview terrain.blend"
    glb_path = OUT / f"{stem} - Overview terrain candidate.glb"
    preview_path = OUT / f"{stem} overview terrain preview.png"
    metadata_path = OUT / f"{stem} overview terrain metadata.json"
    scene.render.filepath = str(preview_path)
    bpy.ops.wm.save_as_mainfile(filepath=str(blend_path))
    bpy.ops.object.select_all(action="DESELECT")
    terrain.select_set(True)
    bpy.context.view_layer.objects.active = terrain
    bpy.ops.export_scene.gltf(
        filepath=str(glb_path),
        export_format="GLB",
        use_selection=True,
        export_yup=False,
        export_extras=True,
        export_lights=False,
        export_cameras=False,
        export_animations=False,
    )
    bpy.ops.render.render(write_still=True)

    matrix = [
        [float(east[0]), float(north[0]), float(up[0]), float(anchor[0])],
        [float(east[1]), float(north[1]), float(up[1]), float(anchor[1])],
        [float(east[2]), float(north[2]), float(up[2]), float(anchor[2])],
        [0.0, 0.0, 0.0, 1.0],
    ]
    metadata = {
        "region_id": site["region_id"],
        "scene": scene.name,
        "object_name": terrain.name,
        "terrain_source": site["source_id"],
        "terrain_source_role": "global low-resolution overview baseline",
        "source_pds_url": site["source_url"],
        "source_cloud_cog": site["source_cloud_cog"],
        "dataset_release_commit": site["dataset_release_commit"],
        "source_units": site["source_units"],
        "coordinate_frame": site["coordinate_frame"],
        "latitude_type": "planetocentric",
        "longitude": "east positive [-180,180)",
        "vertical_reference_radius_m": RADIUS_M,
        "mesh_units": "m",
        "source_resolution_m": site["source_spacing_m"],
        "footprint": {
            "kind": "rectangular geographic overview envelope",
            "bounds": site["coverage_bounds"],
            "published_crater_bounds": site["published_feature_bounds"],
            "buffer_m": site["buffer_m"],
            "buffer_method": site["buffer_method"],
            "registry_rim_polygon_state": site["rim_polygon_state"],
            "coordinate_alignment_state": site["coordinate_alignment_state"],
        },
        "feature": {
            "name": site["name"],
            "latitude_deg": lat0,
            "longitude_east_deg": lon0,
            "published_diameter_km": site["feature_diameter_km"],
            "published_coordinate_source_url": site["feature_coordinate_source_url"],
            "published_coordinate_frame": site["feature_coordinate_source_frame"],
        },
        "boundary_reference": RIM_AUDIT[site["id"]],
        "mesh": {
            "vertex_count": len(vertices),
            "quad_count": len(faces),
            "triangle_count_in_glb": 2 * len(faces),
            "source_pixel_count": int(valid.sum()),
            "height_range_m": site["height_range_m"],
            "sample_height_center_m": site["anchor_sample_height_m"],
            "curvature": "preserved by converting every geographic source pixel center to the 1737400 m reference sphere plus its original LOLA64 height before projection into the local ENU anchor frame",
            "face_normals": "outward from the reference sphere",
        },
        "center_api_controls": site["api_control_samples"],
        "source_selection_note": "The live API selects higher-priority SLDEM/LOLA products at the sampled locations. This overview mesh intentionally uses only LOLA64-SVS for one consistent global baseline and does not merge higher-priority pixels. Control deltas document that distinction; they are not mesh errors against an identical source.",
        "local_frame_definition": "Moon-fixed ME/DE421 position vectors at original LOLA64 sample centers, with the reference-sphere anchor subtracted and projected onto anchor east/north/up basis vectors.",
        "local_to_moon_fixed_matrix_row_major": matrix,
        "local_axes": {"x": "east", "y": "north", "z": "up"},
        "vertical_exaggeration": 1.0,
        "cosmetic_geometry": False,
        "illustrative_lighting_only": True,
        "candidate_glb": {"filename": glb_path.name, "axis_convention": "Z-up; x east, y north, z up", "vertex_count": len(vertices), "face_count": 2 * len(faces), "production_ready": False},
        "production_ready": False,
        "not_yet_validated": [
            "IAU Gazetteer/LROC/Robbins feature-boundary alignment to the viewer's ME/DE421 frame",
            "exact geodesic 10 km buffer and rim containment; this package uses a conservative geographic envelope",
            "higher-resolution source mosaics and seamless detail transitions",
            "Moon-fixed viewer placement, browser loading/performance, and site-specific Sun/Earth ephemeris lighting",
        ],
    }
    metadata_path.write_text(json.dumps(metadata, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"region_id": site["region_id"], "vertices": len(vertices), "quads": len(faces), "blend_bytes": blend_path.stat().st_size, "glb_bytes": glb_path.stat().st_size, "preview": str(preview_path)}))


for row in SITES:
    build_site(row)
