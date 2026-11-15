import json
import math
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import numpy as np
import rasterio
from rasterio.windows import from_bounds
from rasterio.transform import rowcol

ROOT = Path(r"C:\Users\suhas\Documents\Codex\2026-11-14\https-drive-google-com-drive-u")
WORK = ROOT / "work" / "blender"
COMMIT = "a6b2c53f65661fbd5165eae5a83449aeb35abcd8"
MANIFEST = json.loads((WORK / "moon-dataset.json").read_text(encoding="utf-8"))
MANIFEST_BY_CLOUD_PATH = {source.get("cloud_path"): source for source in MANIFEST["sources"] if source.get("cloud_path")}
RADIUS = 1737400.0
SITE_RADIUS = 10000.0
SITES = [
    {
        "region_id": "REGION-APOLLO-11",
        "name": "Apollo 11",
        "center": [0.67416, 23.47314],
        "markers": [{"id": "apollo-11", "name": "Apollo 11", "latitude": 0.67416, "longitude": 23.47314}],
    },
    {
        "region_id": "REGION-APOLLO-14",
        "name": "Apollo 14",
        "center": [-3.64589, -17.47194],
        "markers": [{"id": "apollo-14", "name": "Apollo 14", "latitude": -3.64589, "longitude": -17.47194}],
    },
    {
        "region_id": "REGION-APOLLO-15",
        "name": "Apollo 15",
        "center": [26.13239, 3.63330],
        "markers": [{"id": "apollo-15", "name": "Apollo 15", "latitude": 26.13239, "longitude": 3.63330}, {"id": "apollo-15-rover", "name": "Apollo 15 rover", "latitude": 26.13174, "longitude": 3.63803}],
    },
    {
        "region_id": "REGION-APOLLO-16",
        "name": "Apollo 16",
        "center": [-8.97340, 15.50110],
        "markers": [{"id": "apollo-16", "name": "Apollo 16", "latitude": -8.97340, "longitude": 15.50110}, {"id": "apollo-16-rover", "name": "Apollo 16 rover", "latitude": -8.97290, "longitude": 15.50370}],
    },
    {
        "region_id": "REGION-APOLLO-17",
        "name": "Apollo 17",
        "center": [20.19110, 30.77230],
        "markers": [{"id": "apollo-17", "name": "Apollo 17", "latitude": 20.19110, "longitude": 30.77230}, {"id": "apollo-17-rover", "name": "Apollo 17 rover", "latitude": 20.18960, "longitude": 30.77690}],
    },
    {
        "region_id": "REGION-SURVEYOR-1",
        "name": "Surveyor 1",
        "center": [-2.47450, -43.33980],
        "markers": [{"id": "surveyor-1", "name": "Surveyor 1", "latitude": -2.47450, "longitude": -43.33980}],
    },
    {
        "region_id": "REGION-SURVEYOR-5",
        "name": "Surveyor 5",
        "center": [1.45510, 23.19430],
        "markers": [{"id": "surveyor-5", "name": "Surveyor 5", "latitude": 1.45510, "longitude": 23.19430}],
    },
    {
        "region_id": "REGION-SURVEYOR-6",
        "name": "Surveyor 6",
        "center": [0.47420, -1.42750],
        "markers": [{"id": "surveyor-6", "name": "Surveyor 6", "latitude": 0.47420, "longitude": -1.42750}],
    },
    {
        "region_id": "REGION-SURVEYOR-7",
        "name": "Surveyor 7",
        "center": [-40.98120, -11.51270],
        "markers": [{"id": "surveyor-7", "name": "Surveyor 7", "latitude": -40.98120, "longitude": -11.51270}],
    },
    {
        "region_id": "REGION-LUNOKHOD-1",
        "name": "Lunokhod 1 region",
        "center": [38.31500, -35.00810],
        "markers": [{"id": "lunokhod-1", "name": "Lunokhod 1", "latitude": 38.31500, "longitude": -35.00810}, {"id": "luna-17", "name": "Luna 17 lander", "latitude": 38.23764, "longitude": -35.00163}],
    },
    {
        "region_id": "REGION-LUNA-21",
        "name": "Luna 21",
        "center": [25.99940, 30.40760],
        "markers": [{"id": "luna-21", "name": "Luna 21 lander", "latitude": 25.99940, "longitude": 30.40760}],
    },
]

def band_name(lat):
    if lat < 0:
        north = int(math.floor(abs(lat) / 30.0) * 30)
        south = north + 30
        return f"{south:02d}s_{north:02d}s"
    south = int(math.floor(lat / 30.0) * 30)
    north = south + 30
    return f"{south:02d}n_{north:02d}n"

def tile_name(lat, lon):
    positive_lon = lon % 360.0
    west = int(math.floor(positive_lon / 45.0) * 45)
    east = west + 45
    return f"sldem2015_512_{band_name(lat)}_{west:03d}_{east:03d}_float"

def query_api(site):
    lat, lon = site["center"]
    query = urllib.parse.urlencode({"lat": lat, "lon": lon})
    url = "https://brahmos-lunar-browser.onrender.com/api/terrain/lookup?" + query
    with urllib.request.urlopen(url, timeout=60) as response:
        result = json.load(response)
    if result["terrain"]["source_id"] != tile_name(lat, lon):
        raise RuntimeError(f"API chose unexpected source for {site['name']}: {result['terrain']['source_id']}")
    return result

def prepare(site):
    lat0, lon0 = site["center"]
    tile = tile_name(lat0, lon0)
    path = f"cogs/{tile}.tif"
    url = f"https://huggingface.co/datasets/Deejee-2-406/brahmos-lunar-terrain-cogs/resolve/{COMMIT}/{path}"
    positive_lon = lon0 % 360.0
    dlat = math.degrees(SITE_RADIUS / RADIUS)
    dlon = math.degrees(SITE_RADIUS / (RADIUS * math.cos(math.radians(lat0))))
    vsi_url = "/vsicurl/" + url
    with rasterio.open(vsi_url) as dataset:
        window = from_bounds(positive_lon - dlon, lat0 - dlat, positive_lon + dlon, lat0 + dlat, dataset.transform).round_offsets().round_lengths()
        source = dataset.read(1, window=window, masked=True)
        transform = dataset.window_transform(window)
        lon = transform.c + (np.arange(source.shape[1]) + 0.5) * transform.a
        lat = transform.f + (np.arange(source.shape[0]) + 0.5) * transform.e
        heights = np.ma.asarray(source).filled(np.nan).astype(np.float32) * 1000.0
        valid = ~np.ma.getmaskarray(source) & np.isfinite(heights)
        longitudes = ((lon + 180.0) % 360.0) - 180.0
        npz_path = WORK / f"{site['region_id'].lower()}-window.npz"
        np.savez_compressed(npz_path, heights_m=heights, lat=lat.astype(np.float64), lon=longitudes.astype(np.float64), valid=valid)
        sample_i, sample_j = rowcol(transform, positive_lon, lat0)
        sample_i = int(sample_i)
        sample_j = int(sample_j)
        if not (0 <= sample_i < heights.shape[0] and 0 <= sample_j < heights.shape[1]):
            raise RuntimeError(f"{site['name']} center is outside its extracted source window")
        center_source_height = float(heights[sample_i, sample_j])
        api_url = "https://brahmos-lunar-browser.onrender.com/api/terrain/lookup?" + urllib.parse.urlencode({"lat": lat0, "lon": lon0})
        with urllib.request.urlopen(api_url, timeout=60) as response:
            api = json.load(response)
        delta = float(api["terrain"]["elevation_m"]) - center_source_height
        if abs(delta) > 0.001:
            raise RuntimeError(f"{site['name']} source/API centre mismatch: {delta} m")
        tile_manifest = MANIFEST_BY_CLOUD_PATH[path]
        site.update({
            "grid_id": api.get("global_child_grid_id") if api["grid_id"].startswith("MISSION-") else api["grid_id"],
            "lookup_grid_id": api["grid_id"],
            "parent_grid_id": api["global_parent_grid_id"],
            "source_id": tile_manifest["id"],
            "source_pds_url": tile_manifest["url"],
            "source_sample_spacing_y_m": tile_manifest["sample_spacing_y_m"],
            "api_center_selected_source_id": api["terrain"]["source_id"],
            "api_center_uses_different_source": api["terrain"]["source_id"] != tile_manifest["id"],
            "source_cloud_cog": path,
            "dataset_release_commit": COMMIT,
            "coordinate_frame": api["terrain"]["coordinate_frame"],
            "vertical_reference_radius_m": api["terrain"]["vertical_reference_radius_m"],
            "sample_spacing_x_m": math.cos(math.radians(lat0)) * (2.0 * math.pi * RADIUS / 360.0 / 512.0),
            "sample_spacing_y_m": tile_manifest["sample_spacing_y_m"],
            "anchor_sample_height_m": center_source_height,
            "api_center_sample_height_m": float(api["terrain"]["elevation_m"]),
            "api_center_sample_delta_m": delta,
            "window_shape": list(source.shape),
            "window_valid_pixels": int(valid.sum()),
            "height_range_m": [float(np.nanmin(heights[valid])), float(np.nanmax(heights[valid]))],
            "npz_path": str(npz_path),
        })
        for marker in site["markers"]:
            marker_url = "https://brahmos-lunar-browser.onrender.com/api/terrain/lookup?" + urllib.parse.urlencode({"lat": marker["latitude"], "lon": marker["longitude"]})
            with urllib.request.urlopen(marker_url, timeout=60) as response:
                marker_api = json.load(response)
            marker_i, marker_j = rowcol(transform, marker["longitude"] % 360.0, marker["latitude"])
            marker_i = int(marker_i)
            marker_j = int(marker_j)
            marker_height = float(heights[marker_i, marker_j])
            marker_delta = float(marker_api["terrain"]["elevation_m"]) - marker_height
            if abs(marker_delta) > 0.001:
                raise RuntimeError(f"{marker['name']} source/API mismatch: {marker_delta} m")
            marker.update({"grid_id": marker_api.get("global_child_grid_id") if marker_api["grid_id"].startswith("MISSION-") else marker_api["grid_id"], "lookup_grid_id": marker_api["grid_id"], "source_id": marker_api["terrain"]["source_id"], "source_matches_region_mesh": marker_api["terrain"]["source_id"] == tile, "height_m": marker_height, "api_height_m": float(marker_api["terrain"]["elevation_m"]), "height_delta_m": marker_delta})
        controls = []
        for control_lat, control_lon in [(lat0 - 0.0449, lon0), (lat0 + 0.0449, lon0), (lat0, lon0 - 0.045), (lat0, lon0 + 0.045)]:
            control_url = "https://brahmos-lunar-browser.onrender.com/api/terrain/lookup?" + urllib.parse.urlencode({"lat": control_lat, "lon": control_lon})
            with urllib.request.urlopen(control_url, timeout=60) as response:
                control_api = json.load(response)
            ci, cj = rowcol(transform, control_lon % 360.0, control_lat)
            ci = int(ci)
            cj = int(cj)
            control_height = float(heights[ci, cj])
            control_delta = float(control_api["terrain"]["elevation_m"]) - control_height
            if control_api["terrain"]["source_id"] != tile or abs(control_delta) > 0.001:
                raise RuntimeError(f"{site['name']} control sample source mismatch: {control_delta} m")
            controls.append({"latitude_deg": control_lat, "longitude_east_deg": control_lon, "grid_id": control_api["grid_id"], "source_height_m": control_height, "api_height_m": float(control_api["terrain"]["elevation_m"]), "difference_m": control_delta})
        site["markers"] = site["markers"]
        site["control_samples"] = controls
    print(json.dumps({"region_id": site["region_id"], "grid_id": site["grid_id"], "source_id": tile, "window_shape": site["window_shape"], "valid_pixels": site["window_valid_pixels"], "center_delta_m": delta}))
    return site

with ThreadPoolExecutor(max_workers=2) as executor:
    prepared = list(executor.map(prepare, SITES))
(WORK / "next_lander_sites.json").write_text(json.dumps(prepared, indent=2) + "\n", encoding="utf-8")
