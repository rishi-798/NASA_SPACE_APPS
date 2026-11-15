"""Reopen crater assets and verify GLB geometry against the saved Blender meshes."""
import json
from pathlib import Path

import bpy
import numpy as np

ROOT = Path(r"C:\Users\suhas\Documents\Codex\2026-11-14\https-drive-google-com-drive-u")
OUT = ROOT / "outputs"
ROWS = json.loads((ROOT / "work" / "blender" / "crater_overviews_prepared.json").read_text(encoding="utf-8"))
results = []


def sorted_positions(mesh):
    values = np.empty((len(mesh.vertices), 3), dtype=np.float32)
    mesh.vertices.foreach_get("co", values.ravel())
    order = np.lexsort((values[:, 2], values[:, 1], values[:, 0]))
    return values[order]


for site in ROWS:
    name = site["name"]
    blend_path = OUT / f"{name} - Overview terrain.blend"
    glb_path = OUT / f"{name} - Overview terrain candidate.glb"
    metadata_path = OUT / f"{name} overview terrain metadata.json"
    metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
    if metadata["production_ready"] is not False:
        raise RuntimeError(f"{name} is incorrectly marked production-ready")

    bpy.ops.wm.open_mainfile(filepath=str(blend_path))
    if len(bpy.data.scenes) != 1:
        raise RuntimeError(f"{name} standalone file contains {len(bpy.data.scenes)} scenes")
    terrain = next(obj for obj in bpy.context.scene.objects if obj.type == "MESH")
    source_positions = sorted_positions(terrain.data)
    if len(terrain.data.vertices) != metadata["mesh"]["vertex_count"]:
        raise RuntimeError(f"{name} Blender vertex count does not match metadata")
    if len(terrain.data.polygons) != metadata["mesh"]["quad_count"]:
        raise RuntimeError(f"{name} Blender face count does not match metadata")
    normals = np.empty((len(terrain.data.polygons), 3), dtype=np.float32)
    terrain.data.polygons.foreach_get("normal", normals.ravel())
    mean_up_normal = float(normals[:, 2].mean())
    if mean_up_normal < 0.95:
        raise RuntimeError(f"{name} mesh normals are not outward ({mean_up_normal})")

    before = {obj.as_pointer() for obj in bpy.context.scene.objects}
    bpy.ops.import_scene.gltf(filepath=str(glb_path))
    imported = [obj for obj in bpy.context.scene.objects if obj.type == "MESH" and obj.as_pointer() not in before]
    if len(imported) != 1:
        raise RuntimeError(f"{name} GLB imported {len(imported)} terrain objects, expected one")
    glb_terrain = imported[0]
    glb_positions = sorted_positions(glb_terrain.data)
    # Blender import maps glTF (x,y,z) to Blender (x,-z,y); undo that mapping here.
    glb_positions = glb_positions[:, [0, 2, 1]]
    glb_positions[:, 2] *= -1
    glb_positions = np.unique(glb_positions, axis=0)
    if len(glb_positions) != len(source_positions):
        raise RuntimeError(f"{name} GLB unique position count {len(glb_positions)} != source {len(source_positions)}")
    delta = float(np.max(np.abs(glb_positions - source_positions)))
    if delta > 0.02:
        raise RuntimeError(f"{name} GLB/source vertex mismatch {delta} m")
    triangle_count = sum(len(poly.vertices) == 3 for poly in glb_terrain.data.polygons)
    if triangle_count != metadata["mesh"]["triangle_count_in_glb"]:
        raise RuntimeError(f"{name} GLB triangle count {triangle_count} != metadata")

    results.append({
        "region_id": site["region_id"],
        "blend_reopened": True,
        "glb_reopened": True,
        "source_vertex_count": len(source_positions),
        "unique_glb_vertex_count": len(glb_positions),
        "blender_quad_count": len(terrain.data.polygons),
        "glb_triangle_count": triangle_count,
        "max_abs_glb_position_delta_m": delta,
        "glb_axis_conversion_checked": "undo Blender import Y-up to Z-up mapping before comparison",
        "mean_up_normal_component": mean_up_normal,
        "production_ready": False,
        "blend_bytes": blend_path.stat().st_size,
        "glb_bytes": glb_path.stat().st_size,
    })

verification = {"verified_crater_overviews": results, "all_glbs_match_saved_blender_vertices": True, "all_blender_normals_outward": True}
(OUT / "Crater overview verification.json").write_text(json.dumps(verification, indent=2) + "\n", encoding="utf-8")
print(json.dumps(verification))
