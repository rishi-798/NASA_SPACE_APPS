"""Build the local SQLite catalogue index from the supplied CSV."""
import argparse
import csv
import json
import os
from pathlib import Path
import sqlite3


REPOSITORY_ROOT = Path(__file__).resolve().parents[1]
INTEGER_FIELDS = {
    "row_north_to_south", "native_sample_count", "child_grid_count",
    "native_statistics_sample_count",
}
NUMBER_FIELDS = {
    "x_min_m", "x_max_m", "y_min_m", "y_max_m", "valid_fraction",
    "elevation_min_m", "elevation_max_m", "relief_p95_minus_p05_m",
    "median_slope_deg", "p95_slope_deg", "elevation_stddev_m",
    "tile_plane_detrended_inner_relief_p95_minus_p05_m",
    "lola_shot_count_mean_per_pixel", "lola_shot_count_median_per_pixel",
    "lola_shot_count_p95_per_pixel", "height_uncertainty_rms_m_median",
    "height_uncertainty_rms_m_p95", "center_latitude_deg",
    "center_longitude_east_deg", "source_resolution_m",
    "vertical_reference_radius_m", "latitude_north_deg", "latitude_south_deg",
    "longitude_west_deg", "longitude_east_deg", "elevation_mean_m",
    "native_elevation_min_m", "native_elevation_max_m", "native_elevation_mean_m",
    "native_elevation_stddev_m", "native_statistics_spacing_m",
}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--dataset-dir",
        type=Path,
        default=Path(os.environ.get("LUNAR_DATASET_DIR", REPOSITORY_ROOT)),
        help="Folder containing site04_1km_grid.csv (defaults to LUNAR_DATASET_DIR)",
    )
    args = parser.parse_args()
    root = args.dataset_dir.expanduser().resolve()
    csv_path = root / "site04_1km_grid.csv"
    if not csv_path.is_file():
        raise FileNotFoundError(f"Catalogue CSV not found: {csv_path}")

    counts_path = root / "moon-catalogue-counts.json"
    if not counts_path.is_file():
        counts_path = REPOSITORY_ROOT / "metadata" / "moon-catalogue-counts.json"
    expected_count = json.loads(counts_path.read_text(encoding="utf-8"))["total_csv_rows"]

    temp = root / "moon-grid-index.building.sqlite"
    if temp.exists():
        raise RuntimeError(f"Previous index build exists; inspect before replacing it: {temp}")
    connection = sqlite3.connect(temp)
    try:
        connection.execute(
            "CREATE TABLE grids (grid_id TEXT PRIMARY KEY, grid_type TEXT NOT NULL, record_json TEXT NOT NULL)"
        )
        count = 0
        with csv_path.open(newline="", encoding="utf-8") as stream:
            for row in csv.DictReader(stream):
                for field in (INTEGER_FIELDS | NUMBER_FIELDS) & row.keys():
                    row[field] = (int(row[field]) if field in INTEGER_FIELDS else float(row[field])) if row[field] else None
                connection.execute(
                    "INSERT INTO grids VALUES (?,?,?)",
                    (row["grid_id"], row["grid_type"], json.dumps(row, separators=(",", ":"))),
                )
                count += 1
                if count % 10000 == 0:
                    connection.commit()
        connection.commit()
        if connection.execute("PRAGMA integrity_check").fetchone()[0] != "ok":
            raise RuntimeError("SQLite integrity check failed")
        if count != expected_count:
            raise RuntimeError(f"Expected {expected_count} catalogue rows, found {count}")
    except Exception:
        connection.close()
        raise
    connection.close()
    temp.replace(root / "moon-grid-index.sqlite")
    print(f"INDEX_BUILT {count}")


if __name__ == "__main__":
    main()
