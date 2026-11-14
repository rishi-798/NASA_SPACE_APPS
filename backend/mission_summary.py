"""Duration-weighted visibility summary over one sample set.

Sampling model (sample-and-hold): each sample's state holds from its timestamp
until the next step or the range end, whichever is sooner. A sample exactly at
``end`` contributes zero duration. Window boundaries are sample times; crossings
are NOT refined, so a true rise/set can occur up to one step before a boundary.
"""
from datetime import timedelta

from backend.calculations.sun_earth import parse_utc_time


def _iso(value):
    return value.isoformat().replace("+00:00", "Z")


def summarize_window(
    site_id: str | None, samples: list[dict], start: str, end: str, step_minutes: int
) -> dict:
    start_time = parse_utc_time(start)
    end_time = parse_utc_time(end)
    if end_time <= start_time:
        raise ValueError("summary end must be after start")

    keys = ("sunlight", "earth_visible", "both", "darkness", "comm_blackout")
    windows = {key: [] for key in keys}
    opened = {key: None for key in keys}
    totals = {key: 0.0 for key in keys}
    step = timedelta(minutes=step_minutes)

    for sample in samples:
        time = parse_utc_time(sample["time"])
        if time >= end_time:
            break
        until = min(time + step, end_time)
        sun = sample["sun"]["visible"]
        earth = sample["earth"]["visible"]
        states = {
            "sunlight": sun,
            "earth_visible": earth,
            "both": sun and earth,
            "darkness": not sun,
            "comm_blackout": not earth,
        }
        for key, active in states.items():
            if active:
                totals[key] += (until - time).total_seconds()
                if opened[key] is None:
                    opened[key] = time
            elif opened[key] is not None:
                windows[key].append((opened[key], time))
                opened[key] = None

    for key in keys:
        if opened[key] is not None:
            windows[key].append((opened[key], end_time))

    def output_window(pair):
        return {
            "start": _iso(pair[0]),
            "end": _iso(pair[1]),
            "duration_minutes": (pair[1] - pair[0]).total_seconds() / 60,
            # True when the window may extend beyond the requested range.
            "starts_at_range_start": pair[0] == start_time,
            "ends_at_range_end": pair[1] == end_time,
        }

    def longest(key):
        lengths = ((right - left).total_seconds() / 60 for left, right in windows[key])
        return max(lengths, default=0)

    duration = (end_time - start_time).total_seconds()
    earth_hidden = longest("comm_blackout")
    return {
        "site": site_id,
        "start": _iso(start_time),
        "end": _iso(end_time),
        "step_minutes": step_minutes,
        "total_minutes": duration / 60,
        "sunlight_percent": round(100 * totals["sunlight"] / duration, 1),
        "earth_visible_percent": round(100 * totals["earth_visible"] / duration, 1),
        "both_available_percent": round(100 * totals["both"] / duration, 1),
        "longest_darkness_minutes": longest("darkness"),
        "longest_earth_hidden_minutes": earth_hidden,
        # Legacy name kept for the existing frontend. It means "Earth below the horizon in use";
        # no communications link is modelled.
        "longest_comm_blackout_minutes": earth_hidden,
        "longest_joint_window_minutes": longest("both"),
        "windows": {
            key: [output_window(pair) for pair in windows[key]]
            for key in ("sunlight", "earth_visible", "both")
        },
        "percent_rounding": "percentages rounded to 0.1; durations are exact sums of held intervals",
    }
