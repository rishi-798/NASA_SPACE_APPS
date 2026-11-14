"""Regional 3D Lunar Terrain Models API.

Exposes endpoints to query, stream, and preview 3D measured lunar terrain models
(GLBs and Blender projects) generated from NASA SLDEM2015 and LOLA64 datasets,
as well as dynamic ephemeris lighting vectors computed via NASA JPL NAIF SPICE.
"""
from __future__ import annotations

import json
import logging
import math
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

import numpy as np

from fastapi import APIRouter, HTTPException, Query, Response
from fastapi.responses import FileResponse

from backend.calculations.sun_earth import calculate_visibility, parse_utc_time
from backend.errors import ApiError, api_errors

log = logging.getLogger("backend.terrain_models")
router = APIRouter(prefix="/api/terrain/models", tags=["terrain-models"])

PROJECT_ROOT = Path(__file__).resolve().parents[1]
OUTPUTS_DIR = PROJECT_ROOT / "outputs"


def get_outputs_dir() -> Path:
    configured = os.environ.get("LUNAR_OUTPUTS_DIR")
    if configured:
        p = Path(configured)
        if p.is_dir():
            return p
    return OUTPUTS_DIR


# Slug mappings for friendly URL identifiers
KNOWN_MODELS = [
    {
        "id": "apollo-11",
        "name": "Apollo 11",
        "kind": "landing_site",
        "prefix": "Apollo 11",
        "center_lat": 0.6741,
        "center_lon": 23.4730,
        "radius_km": 10.0,
        "source": "SLDEM2015 / global context",
    },
    {
        "id": "apollo-12",
        "name": "Apollo 12",
        "kind": "landing_site",
        "prefix": "Apollo 12",
        "center_lat": -3.0128,
        "center_lon": -23.4219,
        "radius_km": 10.0,
        "source": "SLDEM2015",
    },
    {
        "id": "apollo-14",
        "name": "Apollo 14",
        "kind": "landing_site",
        "prefix": "Apollo 14",
        "center_lat": -3.6453,
        "center_lon": -17.4714,
        "radius_km": 10.0,
        "source": "SLDEM2015 / global context",
    },
    {
        "id": "apollo-15",
        "name": "Apollo 15",
        "kind": "landing_site",
        "prefix": "Apollo 15",
        "center_lat": 26.1322,
        "center_lon": 3.6339,
        "radius_km": 10.0,
        "source": "SLDEM2015 / global context",
    },
    {
        "id": "apollo-16",
        "name": "Apollo 16",
        "kind": "landing_site",
        "prefix": "Apollo 16",
        "center_lat": -8.9730,
        "center_lon": 15.5002,
        "radius_km": 10.0,
        "source": "SLDEM2015",
    },
    {
        "id": "apollo-17",
        "name": "Apollo 17",
        "kind": "landing_site",
        "prefix": "Apollo 17",
        "center_lat": 20.1908,
        "center_lon": 30.7717,
        "radius_km": 10.0,
        "source": "SLDEM2015",
    },
    {
        "id": "luna-21",
        "name": "Luna 21",
        "kind": "landing_site",
        "prefix": "Luna 21",
        "center_lat": 25.8500,
        "center_lon": 30.4500,
        "radius_km": 10.0,
        "source": "SLDEM2015",
    },
    {
        "id": "lunokhod-1",
        "name": "Lunokhod 1 / Luna 17",
        "kind": "landing_site",
        "prefix": "Lunokhod 1 region",
        "center_lat": 38.2833,
        "center_lon": -35.0000,
        "radius_km": 10.0,
        "source": "SLDEM2015",
    },
    {
        "id": "lunokhod-2",
        "name": "Lunokhod 2",
        "kind": "landing_site",
        "prefix": "Lunokhod 2",
        "center_lat": 25.8500,
        "center_lon": 30.4500,
        "radius_km": 10.0,
        "source": "SLDEM2015 / global context",
    },
    {
        "id": "surveyor-1",
        "name": "Surveyor 1",
        "kind": "landing_site",
        "prefix": "Surveyor 1",
        "center_lat": -2.4745,
        "center_lon": -43.3399,
        "radius_km": 10.0,
        "source": "SLDEM2015",
    },
    {
        "id": "surveyor-5",
        "name": "Surveyor 5",
        "kind": "landing_site",
        "prefix": "Surveyor 5",
        "center_lat": 1.4600,
        "center_lon": 23.1950,
        "radius_km": 10.0,
        "source": "SLDEM2015",
    },
    {
        "id": "surveyor-6",
        "name": "Surveyor 6",
        "kind": "landing_site",
        "prefix": "Surveyor 6",
        "center_lat": 0.4730,
        "center_lon": -1.4800,
        "radius_km": 10.0,
        "source": "SLDEM2015",
    },
    {
        "id": "surveyor-7",
        "name": "Surveyor 7",
        "kind": "landing_site",
        "prefix": "Surveyor 7",
        "center_lat": -40.9700,
        "center_lon": -11.4400,
        "radius_km": 10.0,
        "source": "SLDEM2015",
    },
    {
        "id": "tycho",
        "name": "Tycho Crater",
        "kind": "crater_overview",
        "prefix": "Tycho",
        "center_lat": -43.3000,
        "center_lon": -11.2200,
        "radius_km": 52.6,
        "source": "LOLA64-SVS overview envelope",
    },
    {
        "id": "copernicus",
        "name": "Copernicus Crater",
        "kind": "crater_overview",
        "prefix": "Copernicus",
        "center_lat": 9.6200,
        "center_lon": -20.0800,
        "radius_km": 58.0,
        "source": "LOLA64-SVS overview envelope",
    },
    {
        "id": "clavius",
        "name": "Clavius Crater",
        "kind": "crater_overview",
        "prefix": "Clavius",
        "center_lat": -58.4000,
        "center_lon": -14.4000,
        "radius_km": 120.0,
        "source": "LOLA64-SVS overview envelope",
    },
    {
        "id": "site04-block-a",
        "name": "Site04 - Grid Block A (Grids A1-H8)",
        "kind": "polar_stereographic_block",
        "prefix": "Site04 - Grid block A",
        "center_lat": -89.5,
        "center_lon": 0.0,
        "radius_km": 30.0,
        "source": "Site04 polar stereographic measured master",
    },
    {
        "id": "site04-block-b",
        "name": "Site04 - Grid Block B (Grids A9-H16)",
        "kind": "polar_stereographic_block",
        "prefix": "Site04 - Grid block B",
        "center_lat": -89.5,
        "center_lon": 90.0,
        "radius_km": 30.0,
        "source": "Site04 polar stereographic measured master",
    },
    {
        "id": "site04-block-c",
        "name": "Site04 - Grid Block C (Grids I1-P8)",
        "kind": "polar_stereographic_block",
        "prefix": "Site04 - Grid block C",
        "center_lat": -89.5,
        "center_lon": -90.0,
        "radius_km": 30.0,
        "source": "Site04 polar stereographic measured master",
    },
    {
        "id": "site04-block-d",
        "name": "Site04 - Grid Block D (Grids I9-P16)",
        "kind": "polar_stereographic_block",
        "prefix": "Site04 - Grid block D",
        "center_lat": -89.5,
        "center_lon": 180.0,
        "radius_km": 30.0,
        "source": "Site04 polar stereographic measured master",
    },
]


def _build_model_entry(spec: Dict[str, Any], outputs: Path) -> Dict[str, Any]:
    prefix = spec["prefix"]
    kind = spec["kind"]

    if kind == "polar_stereographic_block":
        blend_name = f"{prefix}.blend"
        blend_path = outputs / blend_name
        metadata_path = outputs / "Site04 regional block manifest.json"
        has_glb = False
        glb_name = None
        glb_size = None
        preview_name = None
    elif kind == "crater_overview":
        blend_name = f"{prefix} - Overview terrain.blend"
        blend_path = outputs / blend_name
        glb_name = f"{prefix} - Overview terrain candidate.glb"
        glb_path = outputs / glb_name
        preview_name = f"{prefix.lower()} overview terrain preview.png"
        # Case fallback for preview
        if not (outputs / preview_name).is_file():
            preview_name = f"{prefix} overview terrain preview.png"
        metadata_name = f"{prefix.lower()} overview terrain metadata.json"
        if not (outputs / metadata_name).is_file():
            metadata_name = f"{prefix} overview terrain metadata.json"
        metadata_path = outputs / metadata_name
        has_glb = glb_path.is_file()
        glb_size = glb_path.stat().st_size if has_glb else None
    else:
        # landing site
        blend_name = f"{prefix} - Measured terrain.blend"
        blend_path = outputs / blend_name
        glb_name = f"{prefix} - Measured terrain candidate.glb"
        glb_path = outputs / glb_name
        preview_name = f"{prefix.lower()} measured terrain preview.png"
        if not (outputs / preview_name).is_file():
            preview_name = f"{prefix} measured terrain preview.png"
        metadata_name = f"{prefix.lower()} measured terrain metadata.json"
        if not (outputs / metadata_name).is_file():
            metadata_name = f"{prefix} measured terrain metadata.json"
        metadata_path = outputs / metadata_name
        has_glb = glb_path.is_file()
        glb_size = glb_path.stat().st_size if has_glb else None

    # Read metadata if present
    parsed_meta = {}
    production_ready = False
    height_range_m = None
    if metadata_path.is_file():
        try:
            parsed_meta = json.loads(metadata_path.read_text(encoding="utf-8"))
            production_ready = parsed_meta.get("production_ready", False)
            height_range_m = parsed_meta.get("height_range_m")
        except Exception:
            pass

    return {
        "id": spec["id"],
        "name": spec["name"],
        "kind": kind,
        "latitude_deg": spec["center_lat"],
        "longitude_deg": spec["center_lon"],
        "radius_km": spec["radius_km"],
        "source": spec["source"],
        "coordinate_frame": "ME/DE421",
        "has_glb": has_glb,
        "glb_url": f"/api/terrain/models/{spec['id']}/glb" if has_glb else None,
        "preview_url": f"/api/terrain/models/{spec['id']}/preview" if preview_name and (outputs / preview_name).is_file() else None,
        "metadata_url": f"/api/terrain/models/{spec['id']}/metadata",
        "blend_file": blend_name if blend_path.is_file() else None,
        "blend_size_bytes": blend_path.stat().st_size if blend_path.is_file() else None,
        "glb_size_bytes": glb_size,
        "height_range_m": height_range_m,
        "production_ready": production_ready,
    }


def get_all_models() -> List[Dict[str, Any]]:
    outputs = get_outputs_dir()
    return [_build_model_entry(spec, outputs) for spec in KNOWN_MODELS]


def find_model(model_id: str) -> Optional[Dict[str, Any]]:
    clean_id = model_id.strip().lower()
    for spec in KNOWN_MODELS:
        if spec["id"] == clean_id:
            return _build_model_entry(spec, get_outputs_dir())
    return None


def find_model_for_coordinates(lat: float, lon: float) -> Optional[Dict[str, Any]]:
    """Find the best matching 3D terrain model for a given lunar latitude and longitude."""
    # Earth-Moon angular distance on a sphere
    for spec in KNOWN_MODELS:
        if spec["kind"] == "polar_stereographic_block":
            continue
        c_lat, c_lon = spec["center_lat"], spec["center_lon"]
        # Approximate great-circle distance on 1737.4 km Moon
        dlat = math.radians(lat - c_lat)
        dlon = math.radians(lon - c_lon)
        a = (math.sin(dlat / 2) ** 2 +
             math.cos(math.radians(c_lat)) * math.cos(math.radians(lat)) * math.sin(dlon / 2) ** 2)
        dist_km = 1737.4 * 2 * math.atan2(math.sqrt(a), math.sqrt(max(0.0, 1 - a)))
        if dist_km <= spec["radius_km"]:
            return _build_model_entry(spec, get_outputs_dir())
    return None


# ------------------------------------------------------------- endpoints ---

@router.get("", summary="List all scientific 3D lunar terrain models")
def list_models():
    """Returns catalog of all 16 regional GLBs, crater models, and Site04 Blender blocks."""
    models = get_all_models()
    return {
        "count": len(models),
        "glb_count": sum(1 for m in models if m["has_glb"]),
        "models": models,
    }


@router.get("/{model_id}", summary="Get model metadata and specifications")
def get_model(model_id: str):
    model = find_model(model_id)
    if not model:
        raise HTTPException(status_code=404, detail=f"Model '{model_id}' not found")
    return model


@router.get("/{model_id}/glb", summary="Stream candidate 3D GLB mesh")
def get_model_glb(model_id: str):
    spec = next((s for s in KNOWN_MODELS if s["id"] == model_id.strip().lower()), None)
    if not spec:
        raise HTTPException(status_code=404, detail=f"Model '{model_id}' not found")

    outputs = get_outputs_dir()
    kind = spec["kind"]
    prefix = spec["prefix"]
    if kind == "crater_overview":
        glb_name = f"{prefix} - Overview terrain candidate.glb"
    else:
        glb_name = f"{prefix} - Measured terrain candidate.glb"

    path = outputs / glb_name
    if not path.is_file():
        raise HTTPException(status_code=404, detail=f"GLB asset for model '{model_id}' not found on server")

    return FileResponse(
        path=str(path),
        media_type="model/gltf-binary",
        filename=glb_name,
        headers={
            "Cache-Control": "public, max-age=86400",
            "Access-Control-Allow-Origin": "*",
        },
    )


@router.get("/{model_id}/preview", summary="Serve rendered terrain preview image")
def get_model_preview(model_id: str):
    spec = next((s for s in KNOWN_MODELS if s["id"] == model_id.strip().lower()), None)
    if not spec:
        raise HTTPException(status_code=404, detail=f"Model '{model_id}' not found")

    outputs = get_outputs_dir()
    prefix = spec["prefix"]
    kind = spec["kind"]

    if kind == "crater_overview":
        candidates = [f"{prefix} overview terrain preview.png", f"{prefix.lower()} overview terrain preview.png"]
    else:
        candidates = [f"{prefix} measured terrain preview.png", f"{prefix.lower()} measured terrain preview.png"]

    found = None
    for c in candidates:
        if (outputs / c).is_file():
            found = outputs / c
            break

    if not found:
        raise HTTPException(status_code=404, detail=f"Preview image for model '{model_id}' not found")

    return FileResponse(
        path=str(found),
        media_type="image/png",
        headers={"Cache-Control": "public, max-age=86400"},
    )


@router.get("/{model_id}/metadata", summary="Serve raw scientific coordinate metadata JSON")
def get_model_metadata(model_id: str):
    spec = next((s for s in KNOWN_MODELS if s["id"] == model_id.strip().lower()), None)
    if not spec:
        raise HTTPException(status_code=404, detail=f"Model '{model_id}' not found")

    outputs = get_outputs_dir()
    prefix = spec["prefix"]
    kind = spec["kind"]

    if kind == "polar_stereographic_block":
        path = outputs / "Site04 regional block manifest.json"
    elif kind == "crater_overview":
        cands = [outputs / f"{prefix} overview terrain metadata.json", outputs / f"{prefix.lower()} overview terrain metadata.json"]
        path = next((p for p in cands if p.is_file()), None)
    else:
        cands = [outputs / f"{prefix} measured terrain metadata.json", outputs / f"{prefix.lower()} measured terrain metadata.json"]
        path = next((p for p in cands if p.is_file()), None)

    if not path or not path.is_file():
        raise HTTPException(status_code=404, detail=f"Metadata JSON for model '{model_id}' not found")

    return Response(
        content=path.read_text(encoding="utf-8"),
        media_type="application/json",
        headers={"Cache-Control": "public, max-age=3600"},
    )


@router.get("/{model_id}/lighting", summary="Compute dynamic SPICE Sun/Earth lighting vectors")
def get_model_lighting(
    model_id: str,
    time: Optional[str] = Query(None, description="ISO UTC timestamp (e.g. 2026-11-15T12:00:00Z). Defaults to current UTC."),
):
    """Computes exact astronomical sub-solar and sub-Earth vectors relative to the 3D model's tangent plane."""
    from backend.local_scenes import scenes
    local_scene = next((item for item in scenes() if item['id'].lower() == model_id.strip().lower()), None)
    spec = next((s for s in KNOWN_MODELS if s["id"] == model_id.strip().lower()), None)
    if local_scene:
        spec = {"id": local_scene['id'], "name": local_scene['name'],
                "center_lat": local_scene['anchor']['latitude'], "center_lon": local_scene['anchor']['longitude']}
    if not spec:
        raise HTTPException(status_code=404, detail="Terrain model not found")

    if time is None:
        target_time = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    else:
        try:
            parsed = parse_utc_time(time)
            target_time = parsed.isoformat().replace("+00:00", "Z")
        except Exception as e:
            raise HTTPException(status_code=422, detail=f"Invalid time parameter: {e}")

    try:
        vis = calculate_visibility(spec["center_lat"], spec["center_lon"], target_time)
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"SPICE ephemeris calculation failed: {e}")

    lat, lon = map(math.radians, (spec['center_lat'], spec['center_lon']))
    rotation = np.array([
        [-math.sin(lon), math.cos(lon), 0],
        [-math.sin(lat)*math.cos(lon), -math.sin(lat)*math.sin(lon), math.cos(lat)],
        [math.cos(lat)*math.cos(lon), math.cos(lat)*math.sin(lon), math.sin(lat)],
    ])
    site = rotation[2] * 1737.4
    if local_scene:
        transform = np.asarray(local_scene['local_to_moon_fixed'], dtype=float)
        rotation = transform[:3, :3].T
        site = transform[:3, 3] / 1000
    sun_fixed = np.array(vis['sun']['moon_fixed_position_km'])
    earth_fixed = np.array(vis['earth']['moon_fixed_position_km'])
    earth_to_sun = sun_fixed - earth_fixed
    earth_to_observer = site - earth_fixed
    cosine_phase = float(np.dot(earth_to_sun, earth_to_observer) /
                         (np.linalg.norm(earth_to_sun) * np.linalg.norm(earth_to_observer)))

    def sky_body(name, radius_km):
        vector = (sun_fixed if name == 'sun' else earth_fixed) - site
        distance = float(np.linalg.norm(vector))
        local = rotation @ (vector / distance)
        elevation = math.degrees(math.atan2(float(local[2]), math.hypot(float(local[0]), float(local[1]))))
        return {
            "azimuth_deg": math.degrees(math.atan2(float(local[0]), float(local[1]))) % 360,
            "elevation_deg": elevation, "visible": elevation > 0,
            "directional_vector_local_z_up": [float(v) for v in local],
            "distance_km": distance,
            "angular_radius_deg": math.degrees(math.asin(radius_km / distance)),
        }

    sun, earth = sky_body('sun', 695700), sky_body('earth', 6378.137)
    earth['illuminated_fraction'] = (1 + max(-1, min(1, cosine_phase))) / 2
    earth['sun_direction_local_z_up'] = [float(v) for v in rotation @ (earth_to_sun / np.linalg.norm(earth_to_sun))]
    return {
        "model_id": spec['id'], "model_name": spec['name'], "time": target_time,
        "center_coordinates": {"latitude_deg": spec['center_lat'], "longitude_deg": spec['center_lon']},
        "sun": sun, "earth": earth,
        "note": "Geometric SPICE sky at the model anchor; terrain mesh occludes the sky. Earth texture orientation is illustrative.",
    }
