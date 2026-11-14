"""Check the visibility engine against what happened to Odysseus (IM-1) and Athena (IM-2).

    python -m scripts.validate_missions             # full check (reads a window of the PGDA LOLA DEM)
    python -m scripts.validate_missions --offline   # skips the two checks that need the DEM
    python -m scripts.validate_missions --json docs/validation/missions.json

Every number is computed by this backend: SPICE geometry (backend.calculations.sun_earth),
Athena's saved LOLA profile, and backend.terrain.preprocess for Odysseus. Mission facts are
quoted from the sources in MISSIONS. Crossings are refined to 1 minute.

Odysseus lies 4 km inside the DEM's edge, so its northern azimuths have only ~4-6 km of terrain.
Its horizon is therefore built with allow_partial=True and used ONLY where a bin has terrain out
to the full 40 km (azimuths ~85-275 deg, which include sunset). Anything else is reported, not used.
"""
import argparse
import json
import math
from datetime import datetime, timedelta, timezone

from backend import analysis

MISSIONS = {
    "odysseus-im1": {
        "landed_utc": "2024-02-22T23:23:00Z",
        "landed_note": "about 23:23 UTC (5:23 p.m. CST) on 22 Feb 2024",
        "end_note": "went dormant on 29 Feb 2024 as it entered lunar night; its final image was received that day",
        "planned": "operations that the early end (27 Feb) left 'two to three days short', i.e. about 29 Feb-1 Mar",
        "condition": "on its side in a small degraded crater with a 12 deg slope; operators would collect data "
                     "'until sunlight no longer shines on the solar panels', expected 'Tuesday morning' (27 Feb) "
                     "'based on the position of Earth and the moon'",
        "published_elevation_m": 2579,
        "sources": [
            "https://www.lroc.asu.edu/images/1360",
            "https://www.universetoday.com/articles/lunar-night-permanently-ends-the-odysseus-mission",
            "https://www.pbs.org/newshour/amp/science/private-u-s-lunar-lander-to-cease-operations-tuesday-after-landing-sideways",
            "https://www.businessday.co.za/bd/world/2024-03-01-us-moon-lander-odysseus-goes-dark-a-week-after-hard-soft-landing/",
        ],
    },
    "athena-im2": {
        "landed_utc": "2025-03-06T17:30:00Z",
        "landed_note": "about 12:30 p.m. ET (17:30 UTC) on 6 Mar 2025; sources differ by a few minutes",
        "end_utc": "2025-03-07T06:15:00Z",
        "end_note": "mission ended 12:15 a.m. CT on 7 Mar 2025 (06:15 UTC), about 12 h 45 min after landing",
        "planned": "10 days of surface operations",
        "condition": "on its side in a ~20 m crater 'where sunlight could not reach the solar cells'; "
                     "the company cited the Sun's direction, solar-panel orientation and crater cold",
        "sources": [
            "https://lroc.im-ldi.com/images/1408",
            "https://spacepolicyonline.com/news/im-2-mission-ends-one-day-after-lunar-landing/",
            "https://spaceflightnow.com/2025/03/07/intuitive-machines-im-2-mission-ends-with-lander-on-its-side-on-the-moon/",
        ],
    },
}


def _iso(value: datetime) -> str:
    return value.strftime("%Y-%m-%dT%H:%M:%SZ")


def _parse(text: str) -> datetime:
    return datetime.fromisoformat(text.replace("Z", "+00:00"))


def _samples(site_id, start, end, step, terrain_mode="auto"):
    """Samples over any length of time, in <=2000-sample requests."""
    out, t, end_t = [], _parse(start), _parse(end)
    while t < end_t:
        chunk_end = min(t + timedelta(minutes=step * 1990), end_t)
        part = analysis.build_analysis(site_id, None, None, _iso(t), _iso(chunk_end), step,
                                       terrain_mode=terrain_mode)["samples"]
        out += part if not out else part[1:] if part[0]["time"] == out[-1]["time"] else part
        t = chunk_end
    return out


def _crossings(site_id, start, end, visible, terrain_mode="auto"):
    """(time, sample, 'RISE'|'SET') refined to 1 minute. visible(sample) -> bool | None (unassessed)."""
    coarse = _samples(site_id, start, end, 10, terrain_mode)
    events = []
    for a, b in zip(coarse, coarse[1:]):
        va, vb = visible(a), visible(b)
        if va is None or vb is None or va == vb:  # only changes between two ASSESSED states count
            continue
        fine = analysis.build_analysis(site_id, None, None, a["time"], b["time"], 1,
                                       terrain_mode=terrain_mode)["samples"]
        for x, y in zip(fine, fine[1:]):
            vx, vy = visible(x), visible(y)
            if None not in (vx, vy) and vx != vy:
                events.append((y["time"], y, "RISE" if vy else "SET"))
                break
    return events


def _days(a: str, b: str) -> float:
    return (_parse(b) - _parse(a)).total_seconds() / 86400


def odysseus(offline: bool) -> dict:
    m = MISSIONS["odysseus-im1"]
    landed = m["landed_utc"]
    flat_sets = [e for e in _crossings("odysseus-im1", landed, "2024-03-06T00:00:00Z",
                                       lambda s: s["sun"]["visible"], "flat") if e[2] == "SET"]
    daily = {}
    for s in _samples("odysseus-im1", landed, "2024-03-04T00:00:00Z", 30, "flat"):
        day = daily.setdefault(s["time"][:10], {"sun_max": -90.0, "earth_min": 90.0})
        day["sun_max"] = max(day["sun_max"], s["sun"]["elevation"])
        day["earth_min"] = min(day["earth_min"], s["earth"]["elevation"])
    result = {
        "flat_sunset_utc": flat_sets[0][0],
        "flat_sunlit_days_after_landing": round(_days(landed, flat_sets[0][0]), 2),
        "daily": {d: {k: round(v, 2) for k, v in x.items()} for d, x in daily.items()},
    }
    if offline:
        result["terrain"] = "skipped (--offline)"
        return result

    import rasterio
    from rasterio.windows import Window
    from pyproj import CRS, Transformer

    from backend.terrain.horizon import horizon_at
    from backend.terrain.on_demand import PGDA_DEM_URL, dem_source, gdal_env, with_retries
    from backend.terrain.preprocess import build_profile

    site = {"id": "odysseus-im1", "latitude": -80.13, "longitude": 1.44}
    dem_path, _ = dem_source()

    def read():
        with rasterio.Env(**gdal_env()):
            try:
                build_profile(dem_path, site, PGDA_DEM_URL)
                refused = None
            except ValueError as exc:  # coverage refusal: the expected outcome here
                refused = str(exc)
            partial = build_profile(dem_path, site, PGDA_DEM_URL, allow_partial=True)
            with rasterio.open(dem_path) as dem:
                crs = CRS.from_wkt(dem.crs.to_wkt())
                x, y = Transformer.from_crs(crs.geodetic_crs, crs, always_xy=True).transform(
                    site["longitude"], site["latitude"])
                row, col = dem.index(x, y)
                height = float(dem.read(1, window=Window(col, row, 1, 1))[0, 0])
        return refused, partial, height

    full_refused, profile, dem_height = with_retries(read)

    step, complete = profile["azimuth_step"], profile["complete_bins"]
    covered = [i * step for i, ok in enumerate(complete) if ok]

    def bins_complete(az):
        left = int(math.floor((az % 360) / step))
        return complete[left] and complete[(left + 1) % len(complete)]

    def terrain_visible(s):
        az = s["sun"]["azimuth"]
        if not bins_complete(az):
            return None if s["sun"]["elevation"] > 0 else False  # unassessed while up; hidden below 0
        return s["sun"]["elevation"] > horizon_at(profile, az)

    events = _crossings("odysseus-im1", landed, "2024-03-06T00:00:00Z", terrain_visible, "flat")
    sets = [e for e in events if e[2] == "SET"]
    first_set = sets[0]
    final_set = sets[-1]
    result["terrain"] = {
        "full_profile_refused": full_refused,
        "complete_azimuths_deg": [min(covered), max(covered)],
        "dem_height_m": round(dem_height, 1),
        "published_elevation_m": m["published_elevation_m"],
        "first_terrain_sunset_utc": first_set[0],
        "first_terrain_sunset_azimuth": round(first_set[1]["sun"]["azimuth"], 1),
        "first_terrain_sunset_horizon_deg": round(horizon_at(profile, first_set[1]["sun"]["azimuth"]), 2),
        "final_terrain_sunset_utc": final_set[0],
        "terrain_sunlit_days_after_landing": round(_days(landed, first_set[0]), 2),
        "events": [(t, k, round(s["sun"]["azimuth"], 1)) for t, s, k in events],
    }
    return result


def athena() -> dict:
    m = MISSIONS["athena-im2"]
    landed, ended = m["landed_utc"], m["end_utc"]
    window = _samples("athena-im2", landed, ended, 10)
    sets = [e for e in _crossings("athena-im2", landed, "2025-03-21T00:00:00Z",
                                  lambda s: s["sun"]["visible"]) if e[2] == "SET"]
    flat_sets = [e for e in _crossings("athena-im2", landed, "2025-03-21T00:00:00Z",
                                       lambda s: s["sun"]["flat_visible"]) if e[2] == "SET"]
    sun_el = [s["sun"]["elevation"] for s in window]
    return {
        "surface_window_utc": [landed, ended],
        "surface_window_sun_elevation_deg": [round(min(sun_el), 2), round(max(sun_el), 2)],
        "surface_window_min_terrain_clearance_deg": round(min(s["sun"]["terrain_clearance"] for s in window), 2),
        "surface_window_sun_visible_all_samples": all(s["sun"]["visible"] for s in window),
        "surface_window_earth_visible_all_samples": all(s["earth"]["visible"] for s in window),
        "surface_window_earth_elevation_deg": [round(min(s["earth"]["elevation"] for s in window), 2),
                                               round(max(s["earth"]["elevation"] for s in window), 2)],
        # Shadow length of an obstacle of height h on flat ground = h / tan(sun elevation).
        "shadow_length_per_metre_of_relief_m": [round(1 / math.tan(math.radians(max(sun_el))), 1),
                                                round(1 / math.tan(math.radians(min(sun_el))), 1)],
        "terrain_sunset_utc": sets[0][0],
        "terrain_sunlit_days_after_landing": round(_days(landed, sets[0][0]), 2),
        "flat_sunset_utc": flat_sets[0][0],
    }


def report(data: dict) -> str:
    o, a = data["odysseus-im1"], data["athena-im2"]
    mo, ma = MISSIONS["odysseus-im1"], MISSIONS["athena-im2"]
    lines = ["# Validation against Odysseus (IM-1) and Athena (IM-2)", ""]
    lines += ["## Odysseus (IM-1)",
              f"- Reported: landed {mo['landed_note']}; {mo['end_note']}. Planned: {mo['planned']}.",
              f"- Reported condition: {mo['condition']}.",
              f"- Flat-horizon sunset: {o['flat_sunset_utc']} ({o['flat_sunlit_days_after_landing']} days after landing)."]
    t = o["terrain"]
    if isinstance(t, dict):
        lines += [
            f"- LOLA elevation at the published coordinates: {t['dem_height_m']} m (published: ~{t['published_elevation_m']} m).",
            f"- A full 40 km profile is refused here: {t['full_profile_refused']}.",
            f"- Partial LOLA horizon, complete from {t['complete_azimuths_deg'][0]}-{t['complete_azimuths_deg'][1]} deg azimuth: "
            f"first terrain sunset {t['first_terrain_sunset_utc']} at azimuth {t['first_terrain_sunset_azimuth']} "
            f"(terrain {t['first_terrain_sunset_horizon_deg']} deg), final {t['final_terrain_sunset_utc']}; "
            f"{t['terrain_sunlit_days_after_landing']} days of direct sunlight after landing.",
        ]
    lines.append("- Daily maximum Sun elevation (deg) / minimum Earth elevation (deg):")
    lines += [f"  - {d}: {v['sun_max']} / {v['earth_min']}" for d, v in o["daily"].items()]
    lines += ["", "## Athena (IM-2)",
              f"- Reported: landed {ma['landed_note']}; {ma['end_note']}. Planned: {ma['planned']}.",
              f"- Reported condition: {ma['condition']}.",
              f"- During the surface window, Sun elevation {a['surface_window_sun_elevation_deg'][0]}-"
              f"{a['surface_window_sun_elevation_deg'][1]} deg, at least {a['surface_window_min_terrain_clearance_deg']} deg "
              f"above the 80 m LOLA horizon (visible in every sample: {a['surface_window_sun_visible_all_samples']}); "
              f"Earth visible in every sample: {a['surface_window_earth_visible_all_samples']}.",
              f"- At that Sun elevation, each metre of local relief casts a {a['shadow_length_per_metre_of_relief_m'][0]}-"
              f"{a['shadow_length_per_metre_of_relief_m'][1]} m shadow on level ground.",
              f"- Predicted terrain sunset: {a['terrain_sunset_utc']} ({a['terrain_sunlit_days_after_landing']} days after "
              f"landing); flat-horizon sunset {a['flat_sunset_utc']}.",
              "", "## Sources"]
    for site in MISSIONS.values():
        lines += [f"- {url}" for url in site["sources"]]
    return "\n".join(lines) + "\n"


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--offline", action="store_true", help="skip checks that read the PGDA DEM")
    parser.add_argument("--json", help="also write the numbers to this JSON file")
    args = parser.parse_args()
    data = {"generated_utc": _iso(datetime.now(timezone.utc)), "odysseus-im1": odysseus(args.offline),
            "athena-im2": athena(), "missions": MISSIONS}
    print(report(data))
    if args.json:
        with open(args.json, "w", encoding="utf-8") as handle:
            json.dump(data, handle, indent=2)
            handle.write("\n")


if __name__ == "__main__":
    main()
