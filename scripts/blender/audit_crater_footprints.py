"""Cross-check planned crater extents against available mapped/catalogued geometry."""
import csv
import hashlib
import json
import math
import struct
from pathlib import Path

ROOT = Path(r"C:\Users\suhas\Documents\Codex\2026-11-14\https-drive-google-com-drive-u")
WORK = ROOT / "work" / "blender"
OUT = ROOT / "outputs"
REGISTRY = json.loads((WORK / "snapshot_extract" / "Blender-Suhas-Dip-2026-11-14" / "metadata" / "region-registry.json").read_text(encoding="utf-8"))
SHAPE_BASE = WORK / "copernican_craters" / "COPERNICAN_CRATERS_360"
RIM_ZIP = WORK / "COPERNICAN_CRATERS_360.zip"
ROBBINS_CSV = WORK / "robbins_craters" / "lunar_crater_database_robbins_2018_bundle" / "data" / "lunar_crater_database_robbins_2018.csv"


def haversine_km(lat_a, lon_a, lat_b, lon_b):
    p1, p2 = math.radians(lat_a), math.radians(lat_b)
    dp = p2 - p1
    dl = math.radians(((lon_b - lon_a + 180.0) % 360.0) - 180.0)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * 1737.4 * math.asin(math.sqrt(a))


def read_dbf(path):
    data = path.read_bytes()
    count = struct.unpack_from("<I", data, 4)[0]
    header_length = struct.unpack_from("<H", data, 8)[0]
    record_length = struct.unpack_from("<H", data, 10)[0]
    fields = []
    pos = 32
    while data[pos] != 13:
        desc = data[pos:pos + 32]
        fields.append((desc[:11].split(b"\0")[0].decode("ascii"), desc[16]))
        pos += 32
    rows = []
    pos = header_length
    for _ in range(count):
        raw = data[pos:pos + record_length]
        pos += record_length
        record = {}
        offset = 1
        for name, width in fields:
            record[name] = raw[offset:offset + width].decode("latin1").strip()
            offset += width
        rows.append(record)
    return rows


def read_shapes(path):
    data = path.read_bytes()
    pos = 100
    shapes = []
    while pos < len(data):
        _, words = struct.unpack_from(">ii", data, pos)
        pos += 8
        content = data[pos:pos + words * 2]
        pos += words * 2
        shape_type = struct.unpack_from("<i", content, 0)[0]
        if shape_type == 0:
            shapes.append([])
            continue
        part_count, point_count = struct.unpack_from("<2i", content, 36)
        offset = 44
        part_starts = list(struct.unpack_from(f"<{part_count}i", content, offset))
        offset += part_count * 4
        points = list(struct.iter_unpack("<2d", content[offset:offset + point_count * 16]))
        shapes.append([
            points[part_starts[index]:part_starts[index + 1] if index + 1 < part_count else point_count]
            for index in range(part_count)
        ])
    return shapes


def main():
    rows = read_dbf(SHAPE_BASE.with_suffix(".DBF"))
    shapes = read_shapes(SHAPE_BASE.with_suffix(".SHP"))
    if len(rows) != len(shapes):
        raise RuntimeError("LROC shapefile row/geometry counts do not match")
    by_name = {row["NAME"].strip().lower(): (row, rings) for row, rings in zip(rows, shapes)}
    registry = {row["id"]: row for row in REGISTRY["selected_locations"]}
    refs = {}

    for key in ("tycho", "copernicus"):
        row, rings = by_name[key]
        points = [(lon if lon < 180 else lon - 360, lat) for ring in rings for lon, lat in ring]
        lon_values = [item[0] for item in points]
        lat_values = [item[1] for item in points]
        entry = registry[key]
        bounds = entry["feature_bounds"]
        outside = {
            "north_km": max(0.0, max(lat_values) - bounds["north"]) * math.pi / 180 * 1737.4,
            "south_km": max(0.0, bounds["south"] - min(lat_values)) * math.pi / 180 * 1737.4,
            "east_km_at_feature_latitude": max(0.0, max(lon_values) - bounds["east"]) * math.pi / 180 * 1737.4 * math.cos(math.radians(entry["latitude"])),
            "west_km_at_feature_latitude": max(0.0, bounds["west"] - min(lon_values)) * math.pi / 180 * 1737.4 * math.cos(math.radians(entry["latitude"])),
        }
        center_gap = haversine_km(entry["latitude"], entry["longitude"], float(row["Y_COORD"]), float(row["X_COORD"]))
        refs[key] = {
            "source": "LROC Copernican Craters (D > 10 km) shapefile, COPERNICAN_CRATERS_360",
            "source_url": "https://data.lroc.im-ldi.com/lroc/view_rdr/SHAPEFILE_COPERNICAN_CRATERS",
            "source_file_sha256": hashlib.sha256(RIM_ZIP.read_bytes()).hexdigest(),
            "coordinate_reference": "IAU Moon 2000 Geographic; the product README documents both -180..180 and 0..360 longitude domains.",
            "geometry_type": "digitized polygon",
            "feature_name": row["NAME"].strip(),
            "lroc_database_center": {"latitude_deg": float(row["Y_COORD"]), "longitude_east_deg": float(row["X_COORD"])},
            "lroc_database_diameter_km": float(row["DIAM_KM"]),
            "polygon_rings": len(rings),
            "polygon_vertex_count": sum(len(ring) for ring in rings),
            "polygon_bounds_180": {"west": min(lon_values), "east": max(lon_values), "south": min(lat_values), "north": max(lat_values)},
            "usgs_published_bounds": bounds,
            "maximum_polygon_excursion_outside_usgs_bounds_km_by_axis": outside,
            "center_offset_from_usgs_km": center_gap,
            "alignment_assessment": "Polygon envelope cross-checks the Gazetteer bounds closely; this is not a control-network transformation or proof of pixel-level registration to ME/DE421.",
        }

    catalog_row = None
    best_distance = float("inf")
    with ROBBINS_CSV.open(newline="", encoding="utf-8") as handle:
        for row in csv.DictReader(handle):
            lat, lon = float(row["LAT_CIRC_IMG"]), float(row["LON_CIRC_IMG"])
            distance = haversine_km(registry["clavius"]["latitude"], registry["clavius"]["longitude"], lat, lon)
            if distance < best_distance:
                best_distance, catalog_row = distance, row
    refs["clavius"] = {
        "source": "Robbins 2018 global lunar crater database (PDS4), USGS Astropedia",
        "source_url": "https://astrogeology.usgs.gov/search/map/moon_crater_database_v1_robbins",
        "source_reference": "https://doi.org/10.1029/2018JE005592",
        "coordinate_reference": "The downloaded PDS4 catalogue records fitted circular/elliptical crater coordinates; exact rim vertices are not included in the CSV product.",
        "geometry_type": "catalogue fitted ellipse, not a rim polygon",
        "nearest_catalogue_record": {
            "crater_id": catalog_row["CRATER_ID"],
            "center_latitude_deg": float(catalog_row["LAT_CIRC_IMG"]),
            "center_longitude_east_360_deg": float(catalog_row["LON_CIRC_IMG"]),
            "center_offset_from_usgs_km": best_distance,
            "circular_diameter_km": float(catalog_row["DIAM_CIRC_IMG"]),
            "ellipse_major_diameter_km": float(catalog_row["DIAM_ELLI_MAJOR_IMG"]),
            "ellipse_minor_diameter_km": float(catalog_row["DIAM_ELLI_MINOR_IMG"]),
            "ellipse_angle_deg": float(catalog_row["DIAM_ELLI_ANGLE_IMG"]),
            "arc_img": float(catalog_row["ARC_IMG"]),
            "rim_point_count": int(catalog_row["PTS_RIM_IMG"]),
        },
        "usgs_published_bounds": registry["clavius"]["feature_bounds"],
        "alignment_assessment": "Ellipse provides a size/center cross-check only. It does not replace a Clavius rim polygon or validate the exact edge/buffer.",
    }

    result = {
        "title": "Crater outline and catalogue source cross-check",
        "created_from": "The regional terrain task; source archives retained under work/blender for reproducibility.",
        "caveat": "These geometries support overview framing and boundary review. Feature coordinate frame alignment remains provisional in each terrain asset.",
        "features": refs,
    }
    (OUT / "Crater footprint source audit.json").write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({key: {k: value for k, value in ref.items() if k in ("geometry_type", "polygon_vertex_count", "polygon_bounds_180", "center_offset_from_usgs_km", "alignment_assessment")} for key, ref in refs.items()}))


if __name__ == "__main__":
    main()
