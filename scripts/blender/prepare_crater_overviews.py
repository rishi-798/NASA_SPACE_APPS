"""Extract global LOLA overview windows for the three planned crater regions."""
import json
import math
import urllib.parse
import urllib.request
from pathlib import Path

import numpy as np
import rasterio
from rasterio.windows import Window

ROOT = Path(r"C:\Users\suhas\Documents\Codex\2026-11-14\https-drive-google-com-drive-u")
WORK = ROOT / "work" / "blender"
MANIFEST = json.loads((WORK / "moon-dataset.json").read_text(encoding="utf-8"))
REGISTRY = json.loads((WORK / "snapshot_extract" / "Blender-Suhas-Dip-2026-11-14" / "metadata" / "region-registry.json").read_text(encoding="utf-8"))
SOURCE = next(source for source in MANIFEST["sources"] if source["id"] == "LOLA64-SVS")
COMMIT = "a6b2c53f65661fbd5165eae5a83449aeb35abcd8"
COG_URL = f"https://huggingface.co/datasets/Deejee-2-406/brahmos-lunar-terrain-cogs/resolve/{COMMIT}/{SOURCE['cloud_path']}"
RADIUS_M = 1_737_400.0
BUFFER_M = 10_000.0
API_URL = "https://brahmos-lunar-browser.onrender.com/api/terrain/lookup"


def api_sample(latitude: float, longitude: float) -> dict:
    query = urllib.parse.urlencode({"lat": latitude, "lon": longitude})
    with urllib.request.urlopen(f"{API_URL}?{query}", timeout=90) as response:
        data = json.load(response)
    terrain = data["terrain"]
    return {
        "latitude_planetocentric_deg": latitude,
        "longitude_east_deg": longitude,
        "grid_id": data.get("grid_id"),
        "source_id": terrain.get("source_id"),
        "elevation_m": terrain.get("elevation_m"),
        "sample_spacing_x_m": terrain.get("sample_spacing_x_m"),
        "sample_spacing_y_m": terrain.get("sample_spacing_y_m"),
    }


def source_values(dataset: rasterio.DatasetReader, latitude: float, longitude: float) -> tuple[float, int, int]:
    col = min(dataset.width - 1, max(0, math.floor((longitude + 180.0) / 360.0 * dataset.width)))
    row = min(dataset.height - 1, max(0, math.floor((90.0 - latitude) / 180.0 * dataset.height)))
    value = float(dataset.read(1, window=Window(col, row, 1, 1))[0, 0]) * 1000.0
    return value, row, col


def main() -> None:
    craters = []
    for identifier in ("tycho", "copernicus", "clavius"):
        entry = next(item for item in REGISTRY["selected_locations"] if item["id"] == identifier)
        bounds = entry["feature_bounds"]
        max_abs_lat = max(abs(bounds["north"]), abs(bounds["south"]))
        lat_buffer = math.degrees(BUFFER_M / RADIUS_M)
        lon_buffer = math.degrees(BUFFER_M / (RADIUS_M * math.cos(math.radians(max_abs_lat))))
        north = min(90.0, bounds["north"] + lat_buffer)
        south = max(-90.0, bounds["south"] - lat_buffer)
        west = bounds["west"] - lon_buffer
        east = bounds["east"] + lon_buffer

        raster_path = "/vsicurl/" + COG_URL
        with rasterio.Env(GDAL_DISABLE_READDIR_ON_OPEN="EMPTY_DIR", CPL_VSIL_CURL_ALLOWED_EXTENSIONS=".tif"):
            with rasterio.open(raster_path) as dataset:
                if (dataset.width, dataset.height) != (23_040, 11_520):
                    raise RuntimeError(f"Unexpected global LOLA64 dimensions: {dataset.width}x{dataset.height}")
                col0 = max(0, math.floor((west + 180.0) / 360.0 * dataset.width))
                col1 = min(dataset.width, math.ceil((east + 180.0) / 360.0 * dataset.width))
                row0 = max(0, math.floor((90.0 - north) / 180.0 * dataset.height))
                row1 = min(dataset.height, math.ceil((90.0 - south) / 180.0 * dataset.height))
                window = Window(col0, row0, col1 - col0, row1 - row0)
                raw = dataset.read(1, window=window, masked=True)
                heights = np.ma.asarray(raw).filled(np.nan).astype(np.float32) * np.float32(1000.0)
                valid = np.isfinite(heights) & ~np.ma.getmaskarray(raw)
                rows = np.arange(row0, row1, dtype=np.int32)
                cols = np.arange(col0, col1, dtype=np.int32)
                latitude = 90.0 - (rows.astype(np.float64) + 0.5) * (180.0 / dataset.height)
                longitude = -180.0 + (cols.astype(np.float64) + 0.5) * (360.0 / dataset.width)
                npz_path = WORK / f"crater-{identifier}-lola64-window.npz"
                np.savez_compressed(
                    npz_path,
                    heights_m=heights,
                    valid=valid,
                    latitude_deg=latitude,
                    longitude_deg=longitude,
                    source_rows=rows,
                    source_columns=cols,
                )
                center_height, center_row, center_col = source_values(dataset, entry["latitude"], entry["longitude"])

        control_points = [
            (entry["latitude"], entry["longitude"]),
            (north, west),
            (north, east),
            (south, west),
            (south, east),
        ]
        api_controls = [api_sample(lat, lon) for lat, lon in control_points]
        for sample in api_controls:
            sample_row = math.floor((90.0 - sample["latitude_planetocentric_deg"]) / 180.0 * 11_520)
            sample_col = math.floor((sample["longitude_east_deg"] + 180.0) / 360.0 * 23_040)
            baseline_height = float(heights[sample_row - row0, sample_col - col0])
            sample["global_lola64_elevation_m"] = baseline_height
            sample["api_minus_lola64_m"] = float(sample["elevation_m"]) - baseline_height if sample["elevation_m"] is not None else None
        craters.append({
            "id": identifier,
            "name": entry["name"],
            "region_id": entry["region_id"],
            "center": [entry["latitude"], entry["longitude"]],
            "feature_diameter_km": entry["feature_diameter_km"],
            "published_feature_bounds": bounds,
            "feature_coordinate_source_url": entry["coordinate_source_url"],
            "feature_coordinate_source_frame": entry["coordinate_source_frame"],
            "coordinate_alignment_state": entry["coordinate_alignment_state"],
            "rim_polygon_state": entry["rim_polygon_state"],
            "coverage_bounds": {"north": north, "south": south, "west": west, "east": east},
            "buffer_m": BUFFER_M,
            "buffer_method": "Conservative latitude/longitude expansion of published feature bounds; longitude uses the most poleward published latitude. This is an overview envelope, not an exact geodesic polygon buffer.",
            "source_id": SOURCE["id"],
            "source_url": SOURCE["url"],
            "source_cloud_cog": SOURCE["cloud_path"],
            "dataset_release_commit": COMMIT,
            "source_units": SOURCE["native_units"],
            "coordinate_frame": MANIFEST["coordinate_frame"],
            "vertical_reference_radius_m": RADIUS_M,
            "source_spacing_m": {"north_south": SOURCE["sample_spacing_y_m"], "east_west_at_center": math.cos(math.radians(entry["latitude"])) * SOURCE["sample_spacing_y_m"]},
            "window_shape": list(heights.shape),
            "window_valid_pixels": int(valid.sum()),
            "source_window_origin_pixel": {"row": row0, "column": col0},
            "height_range_m": [float(np.nanmin(heights[valid])), float(np.nanmax(heights[valid]))],
            "anchor_sample_height_m": center_height,
            "anchor_source_pixel": {"row": center_row, "column": center_col},
            "npz_path": str(npz_path),
            "api_control_samples": api_controls,
        })
        print(json.dumps({"region_id": entry["region_id"], "window_shape": list(heights.shape), "pixels": int(valid.sum()), "source_id": SOURCE["id"], "api_control_sources": sorted({item["source_id"] for item in api_controls})}))

    (WORK / "crater_overviews_prepared.json").write_text(json.dumps(craters, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
