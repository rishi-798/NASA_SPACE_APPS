"""Pure summary edge cases (no SPICE): window boundaries and duration weighting."""
import pytest

from backend.mission_summary import summarize_window

START = "2026-10-03T00:00:00Z"


def samples(states, step=30, hour0=0):
    out = []
    for i, (sun, earth) in enumerate(states):
        minutes = hour0 * 60 + i * step
        out.append({"time": f"2026-10-03T{minutes // 60:02d}:{minutes % 60:02d}:00Z",
                    "sun": {"visible": sun}, "earth": {"visible": earth}})
    return out


def test_entirely_visible_range():
    r = summarize_window("x", samples([(True, True)] * 5), START, "2026-10-03T02:00:00Z", 30)
    assert r["sunlight_percent"] == r["earth_visible_percent"] == r["both_available_percent"] == 100
    assert r["longest_darkness_minutes"] == 0 and r["longest_earth_hidden_minutes"] == 0
    (w,) = r["windows"]["both"]
    assert (w["start"], w["end"], w["duration_minutes"]) == (START, "2026-10-03T02:00:00Z", 120)
    assert w["starts_at_range_start"] and w["ends_at_range_end"]
    assert r["longest_joint_window_minutes"] == 120


def test_entirely_hidden_range():
    r = summarize_window("x", samples([(False, False)] * 5), START, "2026-10-03T02:00:00Z", 30)
    assert r["sunlight_percent"] == 0 and r["windows"]["sunlight"] == []
    assert r["longest_darkness_minutes"] == 120 and r["longest_earth_hidden_minutes"] == 120
    assert r["longest_comm_blackout_minutes"] == r["longest_earth_hidden_minutes"]


def test_change_at_first_sample_and_final_held_interval():
    r = summarize_window("x", samples([(False, True), (True, True), (True, True), (True, False), (False, False)]),
                         START, "2026-10-03T02:00:00Z", 30)
    (w,) = r["windows"]["sunlight"]
    assert (w["start"], w["end"]) == ("2026-10-03T00:30:00Z", "2026-10-03T02:00:00Z")
    assert not w["starts_at_range_start"] and w["ends_at_range_end"]
    assert r["sunlight_percent"] == 75  # 90 of 120 min; end sample (False) has zero duration


def test_state_change_only_at_zero_duration_end_sample_has_no_effect():
    r = summarize_window("x", samples([(False, False)] * 4 + [(True, True)]), START, "2026-10-03T02:00:00Z", 30)
    assert r["sunlight_percent"] == 0 and r["windows"]["sunlight"] == []


def test_partial_final_interval_is_weighted_by_its_real_length():
    # samples at 00:00, 00:30, 01:00; end 01:10 -> last interval is 10 min
    r = summarize_window("x", samples([(False, True), (False, True), (True, True)]), START,
                         "2026-10-03T01:10:00Z", 30)
    assert r["sunlight_percent"] == pytest.approx(round(100 * 10 / 70, 1))
    (w,) = r["windows"]["sunlight"]
    assert w["duration_minutes"] == 10 and w["ends_at_range_end"]
    assert r["total_minutes"] == 70


def test_duration_weighting_and_window_sum_agree():
    states = [(True, True), (False, True), (False, False), (True, False), (True, True), (True, True)]
    r = summarize_window("x", samples(states), START, "2026-10-03T03:00:00Z", 30)
    # Percentages are rounded to 0.1; window durations are exact.
    assert 100 * sum(w["duration_minutes"] for w in r["windows"]["sunlight"]) / 180 == pytest.approx(r["sunlight_percent"], abs=0.05)
    assert 100 * sum(w["duration_minutes"] for w in r["windows"]["both"]) / 180 == pytest.approx(r["both_available_percent"], abs=0.05)
