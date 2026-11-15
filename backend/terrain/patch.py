"""Local terrain patch for the landing simulation, sampled from the LOLA 80 S DEM.

Frame (documented in docs/LANDING_SIM.md): a local east-north-up frame centred on the target point.
  * x = east, y = north (metres of ground distance from the target along the great circle at that azimuth;
    azimuthal-equidistant, which differs from a tangent plane by < 1e-6 relative over a few km),
  * z = up, along the local vertical at the target, metres, with z = 0 at the DEM surface under the target.
Heights include lunar curvature: a surface point at ground distance d sits (R+h)cos(d/R) - (R+h0) above the
target's horizontal plane, so the far edge of a 2 km patch is about 1.2 m lower than a flat-Moon value would be.

Values are bilinearly interpolated from the DEM at the native 80 m spacing: the patch adds no resolution.
Cells without DEM data are returned as null and reported, never filled.
"""
import math

import numpy as np
import rasterio
from pyproj import CRS, Transformer
from rasterio.windows import from_bounds

from backend.terrain import on_demand

NATIVE_SPACING_M = 80.0
MAX_HALF_SIZE_M = 3000.0


def _destination(lat0: float, lon0: float, east: np.ndarray, north: np.ndarray, radius: float):
    """Lat/lon (deg) reached from (lat0, lon0) by ground distance hypot(e,n) at azimuth atan2(e,n)."""
    distance = np.hypot(east, north) / radius
    azimuth = np.arctan2(east, north)
    p0, l0 = math.radians(lat0), math.radians(lon0)
    lat = np.arcsin(np.sin(p0) * np.cos(distance) + np.cos(p0) * np.sin(distance) * np.cos(azimuth))
    lon = l0 + np.arctan2(np.sin(azimuth) * np.sin(distance) * np.cos(p0), np.cos(distance) - np.sin(p0) * np.sin(lat))
    return np.degrees(lat), (np.degrees(lon) + 540) % 360 - 180, distance


def build_patch(latitude: float, longitude: float, half_size_m: float = 2000.0) -> dict:
    if not (-90 <= latitude <= 90 and -180 <= longitude <= 180):
        raise ValueError("latitude must be -90..90 and longitude -180..180")
    if not (NATIVE_SPACING_M * 4 <= half_size_m <= MAX_HALF_SIZE_M):
        raise ValueError(f"half_size_m must be {NATIVE_SPACING_M * 4:.0f}..{MAX_HALF_SIZE_M:.0f}")
    if latitude > -80:
        raise ValueError("Real terrain for the simulation is available only inside the LOLA 80° S map (south of 80° S).")
    path, source_url = on_demand.dem_source()
    if on_demand.is_remote():
        raise ValueError("The local LOLA DEM is not installed (run python -m scripts.fetch_lola_dem).")

    count = int(round(2 * half_size_m / NATIVE_SPACING_M)) + 1
    axis = np.linspace(-half_size_m, half_size_m, count)
    east, north = np.meshgrid(axis, axis)                    # row 0 = southernmost (y = -half)
    with rasterio.open(path) as dataset:
        projected = CRS.from_wkt(dataset.crs.to_wkt())
        geographic = projected.geodetic_crs
        radius = geographic.ellipsoid.semi_major_metre
        lat, lon, arc = _destination(latitude, longitude, east, north, radius)
        to_map = Transformer.from_crs(geographic, projected, always_xy=True)
        xs, ys = to_map.transform(lon, lat)
        x0, y0 = to_map.transform(longitude, latitude)
        margin = 3 * NATIVE_SPACING_M
        window = from_bounds(xs.min() - margin, ys.min() - margin, xs.max() + margin, ys.max() + margin, dataset.transform)
        window = window.round_offsets().round_lengths()
        data = dataset.read(1, window=window, masked=True, boundless=True, fill_value=np.nan).astype(float).filled(np.nan)
        inverse = ~dataset.window_transform(window)

        def sample(x, y):
            col, row = inverse * (np.asarray(x), np.asarray(y))
            col, row = col - 0.5, row - 0.5                   # pixel centres
            c0, r0 = np.floor(col).astype(int), np.floor(row).astype(int)
            fc, fr = col - c0, row - r0
            out = np.full(np.shape(col), np.nan)
            ok = (c0 >= 0) & (r0 >= 0) & (c0 + 1 < data.shape[1]) & (r0 + 1 < data.shape[0])
            c, r, a, b = c0[ok], r0[ok], fc[ok], fr[ok]
            out[ok] = (data[r, c] * (1 - a) * (1 - b) + data[r, c + 1] * a * (1 - b)
                       + data[r + 1, c] * (1 - a) * b + data[r + 1, c + 1] * a * b)
            return out                                          # NaN propagates from any missing neighbour

        heights = sample(xs, ys)
        h0 = float(sample(np.array([x0]), np.array([y0]))[0])
    if not math.isfinite(h0):
        raise ValueError("The DEM has no elevation at the target point.")
    up = (radius + heights) * np.cos(arc) - (radius + h0)       # include curvature, see module docstring
    missing = int(np.count_nonzero(~np.isfinite(up)))
    return {
        "schema_version": 1,
        "frame": "local ENU at target: x east, y north, z up (m); z = 0 at DEM surface under target",
        "target": {"latitude": latitude, "longitude": longitude, "dem_height_m": h0},
        "half_size_m": half_size_m, "spacing_m": NATIVE_SPACING_M, "count": count,
        "heights_m": [[(round(float(v), 3) if math.isfinite(v) else None) for v in row] for row in up],
        "missing_cells": missing,
        "datum": f"Moon sphere, radius {radius:.0f} m (DEM heights are relative to it; z is relative to the target)",
        "source": source_url, "source_resolution_m": NATIVE_SPACING_M,
        "interpolation": "bilinear between DEM pixel centres at native spacing (no added resolution)",
        "limitations": [
            "80 m DEM: features smaller than a few pixels (boulders, small craters) are not represented.",
            "Slopes from this patch are regional (hundreds of metres), not landing-footprint hazards.",
        ],
    }
