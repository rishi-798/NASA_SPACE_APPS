"""Reproducible Athena vs Odysseus demonstration.

    python -m scripts.demo_compare                         # in-process, no server needed
    python -m scripts.demo_compare --url http://127.0.0.1:8000

Fixed inputs so every teammate gets identical numbers:
    2026-10-12T00:00:00Z .. 2026-10-26T00:00:00Z, 30-minute step
"""
import argparse
import json
import urllib.request

RANGE = {"start": "2026-10-12T00:00:00Z", "end": "2026-10-26T00:00:00Z", "step_minutes": 30}


def fetch(url):
    if url:
        request = urllib.request.Request(url.rstrip("/") + "/api/compare", data=json.dumps(RANGE).encode(),
                                         headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(request, timeout=120) as response:
            return json.load(response)
    from backend.analysis import build_comparison
    return build_comparison(**RANGE)


def hours(minutes):
    return f"{minutes / 60:.1f} h"


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--url", help="base URL of a running backend (default: run in-process)")
    data = fetch(parser.parse_args().url)
    req = data["request"]
    print(f"{req['start']} -> {req['end']}  step {req['step_minutes']} min  "
          f"{req['sample_count']} samples/site  shared grid: {data['shared_sample_times']}\n")
    header = f"{'site':<14}{'horizon':<17}{'sun %':>7}{'earth %':>9}{'both %':>8}{'max dark':>10}{'max E-hidden':>14}"
    print(header + "\n" + "-" * len(header))
    for row in data["table"]:
        print(f"{row['mission']:<14}{row['horizon_mode']:<17}{row['sunlight_percent']:>7}{row['earth_visible_percent']:>9}"
              f"{row['both_available_percent']:>8}{hours(row['longest_darkness_minutes']):>10}"
              f"{hours(row['longest_earth_hidden_minutes']):>14}")
    for site in data["sites"]:
        if not site["ok"]:
            print(f"\n{site['site_id']}: FAILED ({site['error']['code']}) {site['error']['message']}")
            continue
        a = site["analysis"]
        print(f"\n{a['site']['mission']} - {a['terrain']['mode']}: joint Sun+Earth windows")
        for w in a["summary"]["windows"]["both"]:
            print(f"  {w['start']} -> {w['end']}  ({hours(w['duration_minutes'])})")
        if a["warnings"]:
            print("  ! " + a["warnings"][0][:150] + "...")
    print("\nNotes:")
    for note in data["comparison_notes"]:
        print("  - " + note)


if __name__ == "__main__":
    main()
