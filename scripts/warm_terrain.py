"""Pre-generate on-demand LOLA horizons so demo points answer instantly.

    python -m scripts.warm_terrain -89.5,135 -85.4,35
    python -m scripts.warm_terrain --file demo_points.txt     # one "lat,lon" per line

Profiles go to TERRAIN_CACHE_DIR (default backend/terrain/cache). Points outside the LOLA
80 S coverage are reported, not faked. Run it against the same TERRAIN_CACHE_DIR the server uses.
"""
import argparse
import re
import sys
import time

from backend.terrain import on_demand


def parse(text: str) -> tuple[float, float]:
    lat, lon = (float(part) for part in text.split(","))
    return lat, lon


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--file", help="file with one lat,lon per line")
    # "-89.5,135" starts with "-", which argparse would read as an option: pick pairs out first.
    pair = re.compile(r"^[+-]?\d+(\.\d+)?,[+-]?\d+(\.\d+)?$")
    points = [parse(a) for a in sys.argv[1:] if pair.match(a)]
    args = parser.parse_args([a for a in sys.argv[1:] if not pair.match(a)])
    if args.file:
        with open(args.file, encoding="utf-8") as handle:
            points += [parse(line) for line in handle if line.strip() and not line.startswith("#")]
    for lat, lon in points:
        start = time.time()
        try:
            profile, info = on_demand.get_profile(lat, lon)
        except on_demand.OnDemandTerrainError as exc:
            print(f"{lat:>9},{lon:>9}  FAILED  {exc}")
            continue
        detail = (f"max horizon {max(profile['horizon']):.1f} deg, site {profile['site_elevation_m']:.0f} m"
                  if profile else info["message"])
        print(f"{lat:>9},{lon:>9}  {info['status']:<24} cache {str(info['cache']):<5} "
              f"{time.time() - start:5.1f}s  {detail}")


if __name__ == "__main__":
    main()
