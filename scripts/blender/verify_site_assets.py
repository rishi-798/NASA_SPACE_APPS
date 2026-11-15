import bpy
import json
import numpy as np
from pathlib import Path

root = Path(r"C:\Users\suhas\Documents\Codex\2026-11-14\https-drive-google-com-drive-u")
work = root / "work" / "blender"
results = []
for stem in ["Apollo 16", "Apollo 17", "Surveyor 1", "Surveyor 5", "Surveyor 6", "Surveyor 7", "Lunokhod 1 region", "Luna 21"]:
    meta_path = root / "outputs" / f"{stem} measured terrain metadata.json"
    metadata = json.loads(meta_path.read_text(encoding="utf-8"))
    blend_path = root / "outputs" / f"{stem} - Measured terrain.blend"
    bpy.ops.wm.open_mainfile(filepath=str(blend_path))
    mesh_obj = bpy.data.objects.get(metadata["grid_id"])
    assert mesh_obj is not None and mesh_obj.type == "MESH"
    verts = np.asarray([v.co[:] for v in mesh_obj.data.vertices])
    radial = np.sqrt(verts[:, 0] ** 2 + verts[:, 1] ** 2)
    assert len(verts) == metadata["source_pixels_used"]
    assert len(mesh_obj.data.polygons) == metadata["mesh_faces"]
    assert float(radial.max()) <= 10000.05
    assert mesh_obj.data.materials[0].name == "Historical scientific terrain - neutral, no cosmetic bump"
    assert mesh_obj["source_id"] == metadata["source_id"]
    assert mesh_obj["cosmetic_geometry_present"] is False
    assert mesh_obj["production_ready"] is False
    max_api_delta = metadata["terrain_api_control_check"]["max_abs_difference_m"]
    assert max_api_delta < 0.001
    marker_names = {obj.name for obj in bpy.context.scene.objects if obj.type == "EMPTY"}
    assert {marker["id"] for marker in metadata["locations_covered"]}.issubset(marker_names)
    np.save(work / f"{stem.lower().replace(' ', '-')}-source-vertices.npy", verts)
    preview_path = root / "outputs" / f"{stem} measured terrain preview.png"
    results.append({
        "name": stem,
        "reopened": True,
        "grid_id": metadata["grid_id"],
        "vertices": len(verts),
        "faces": len(mesh_obj.data.polygons),
        "max_radius_m": float(radial.max()),
        "max_api_control_delta_m": max_api_delta,
        "glb_bytes": (root / "outputs" / f"{stem} - Measured terrain candidate.glb").stat().st_size,
        "preview_bytes": preview_path.stat().st_size,
    })
print(json.dumps(results, indent=2))
