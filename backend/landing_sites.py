import json
from pathlib import Path

from backend.calculations.sun_earth import validate_coordinates


LANDING_SITES_FILE = (
    Path(__file__).resolve().parent.parent / "data" / "landing_sites.json"
)


def load_landing_sites(path: Path = LANDING_SITES_FILE) -> list[dict]:
    with path.open(encoding="utf-8") as file:
        sites = json.load(file)

    if not isinstance(sites, list):
        raise ValueError("landing_sites.json must contain a list")

    seen_ids = set()
    for site in sites:
        if not isinstance(site, dict):
            raise ValueError("each landing site must be an object")

        site_id = site.get("id")
        if not isinstance(site_id, str) or not site_id:
            raise ValueError("each landing site needs a non-empty id")
        if site_id in seen_ids:
            raise ValueError(f"duplicate landing site id: {site_id}")
        seen_ids.add(site_id)

        if not isinstance(site.get("name"), str) or not site["name"]:
            raise ValueError(f"landing site {site_id} needs a name")
        if (
            not isinstance(site.get("source"), str)
            or not site["source"].startswith("https://")
        ):
            raise ValueError(f"landing site {site_id} needs an HTTPS source URL")

        latitude = site.get("latitude")
        longitude = site.get("longitude")
        if (
            not isinstance(latitude, (int, float))
            or isinstance(latitude, bool)
            or not isinstance(longitude, (int, float))
            or isinstance(longitude, bool)
        ):
            raise ValueError(f"landing site {site_id} needs numeric coordinates")
        try:
            validate_coordinates(latitude, longitude)
        except ValueError as exc:
            raise ValueError(
                f"landing site {site_id} has invalid coordinates: {exc}"
            ) from exc

        mission = site.get("mission")
        if mission is not None and not isinstance(mission, str):
            raise ValueError(f"landing site {site_id} has an invalid mission")

        profile = site.get("horizon_profile")
        if profile is not None and (
            not isinstance(profile, str) or not profile.endswith(".json") or "/" in profile or "\\" in profile
        ):
            raise ValueError(f"landing site {site_id} has an invalid horizon_profile filename")
        for key in ("coordinate_source", "coordinate_note", "horizon_note"):
            if site.get(key) is not None and not isinstance(site[key], str):
                raise ValueError(f"landing site {site_id} has an invalid {key}")
        if not isinstance(site.get("comparison", False), bool):
            raise ValueError(f"landing site {site_id} has an invalid comparison flag")

    return sites


def comparison_site_ids() -> list[str]:
    """Sites in the Athena/Odysseus comparison (flagged in landing_sites.json)."""
    return [site["id"] for site in load_landing_sites() if site.get("comparison")]


def get_landing_site(site_id: str) -> dict:
    for site in load_landing_sites():
        if site["id"] == site_id:
            return site
    raise KeyError(site_id)
