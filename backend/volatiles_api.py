"""Lunar Polar Volatiles and Permanent Shadow Regions (PSR) scientific API.

Provides scientific assessment of lunar polar cold traps, subsurface thermal stability,
and water ice prospecting potential using authoritative NASA LRO Diviner (Paige et al. 2010)
and LOLA altimetry (Smith et al. 2017) datasets.

All distance calculations use exact lunar spherical geodesics on the reference sphere (R = 1737.4 km).
"""
import math
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

router = APIRouter(prefix="/api/terrain", tags=["volatiles"])

LUNAR_RADIUS_KM = 1737.4
LUNAR_RADIUS_M = 1737400.0

# Authoritative catalog of major Lunar South Pole Permanent Shadow Regions (PSRs) and Cold Traps.
# Data synthesized from NASA LRO Diviner Lunar Radiometer Experiment and LCROSS impact measurements.
COLD_TRAPS: List[Dict[str, Any]] = [
    {
        "id": "cabeus",
        "name": "Cabeus",
        "center": {"lat": -84.9, "lon": -35.5},
        "diameter_km": 100.0,
        "depth_km": 4.0,
        "psr_area_km2": 890.0,
        "min_temperature_k": 38.0,
        "water_ice_confirmed": True,
        "confirmation_source": "NASA LCROSS impact (Colaprete et al., 2010: ~5.5 wt% water ice confirmed)",
        "priority_tier": 1,
    },
    {
        "id": "shackleton",
        "name": "Shackleton",
        "center": {"lat": -89.9, "lon": 0.0},
        "diameter_km": 21.0,
        "depth_km": 4.2,
        "psr_area_km2": 250.0,
        "min_temperature_k": 40.0,
        "water_ice_confirmed": True,
        "confirmation_source": "LRO LOLA radar and surface reflectance anomalies (Zuber et al., 2012)",
        "priority_tier": 1,
    },
    {
        "id": "faustini",
        "name": "Faustini",
        "center": {"lat": -87.3, "lon": 77.0},
        "diameter_km": 39.0,
        "depth_km": 3.1,
        "psr_area_km2": 160.0,
        "min_temperature_k": 55.0,
        "water_ice_confirmed": False,
        "confirmation_source": "LRO Diviner cryogenic cold trap model (<110K stable)",
        "priority_tier": 1,
    },
    {
        "id": "shoemaker",
        "name": "Shoemaker",
        "center": {"lat": -88.1, "lon": 45.0},
        "diameter_km": 51.0,
        "depth_km": 3.2,
        "psr_area_km2": 290.0,
        "min_temperature_k": 50.0,
        "water_ice_confirmed": True,
        "confirmation_source": "Lunar Prospector epithermal neutron absorption & LEND excess hydrogen",
        "priority_tier": 1,
    },
    {
        "id": "haworth",
        "name": "Haworth",
        "center": {"lat": -87.4, "lon": -5.0},
        "diameter_km": 35.0,
        "depth_km": 3.5,
        "psr_area_km2": 220.0,
        "min_temperature_k": 45.0,
        "water_ice_confirmed": False,
        "confirmation_source": "LRO Diviner cryogenic cold trap (<54K annual maximum)",
        "priority_tier": 1,
    },
    {
        "id": "amundsen",
        "name": "Amundsen",
        "center": {"lat": -84.5, "lon": 82.8},
        "diameter_km": 103.0,
        "depth_km": 4.5,
        "psr_area_km2": 510.0,
        "min_temperature_k": 60.0,
        "water_ice_confirmed": False,
        "confirmation_source": "LRO Diviner subsurface cold trap",
        "priority_tier": 2,
    },
    {
        "id": "de-gerlache",
        "name": "de Gerlache",
        "center": {"lat": -88.5, "lon": -88.3},
        "diameter_km": 32.0,
        "depth_km": 3.8,
        "psr_area_km2": 140.0,
        "min_temperature_k": 50.0,
        "water_ice_confirmed": False,
        "confirmation_source": "Artemis III candidate landing region ridge",
        "priority_tier": 1,
    },
    {
        "id": "sverdrup",
        "name": "Sverdrup",
        "center": {"lat": -88.5, "lon": -152.0},
        "diameter_km": 35.0,
        "depth_km": 3.6,
        "psr_area_km2": 185.0,
        "min_temperature_k": 48.0,
        "water_ice_confirmed": False,
        "confirmation_source": "LRO Diviner cryogenic cold trap",
        "priority_tier": 2,
    },
    {
        "id": "nobile",
        "name": "Nobile (VIPER Target)",
        "center": {"lat": -85.2, "lon": 37.9},
        "diameter_km": 73.0,
        "depth_km": 3.7,
        "psr_area_km2": 340.0,
        "min_temperature_k": 65.0,
        "water_ice_confirmed": False,
        "confirmation_source": "NASA VIPER rover primary landing and volatile prospecting site",
        "priority_tier": 1,
    },
    {
        "id": "mons-mouton",
        "name": "Mons Mouton (PRIME-1/Athena)",
        "center": {"lat": -84.79, "lon": 29.20},
        "diameter_km": 40.0,
        "depth_km": 2.5,
        "psr_area_km2": 85.0,
        "min_temperature_k": 72.0,
        "water_ice_confirmed": False,
        "confirmation_source": "NASA CLPS IM-2 Athena / TRIDENT ice drill target plateau",
        "priority_tier": 1,
    },
]


def lunar_distance_and_bearing(lat1: float, lon1: float, lat2: float, lon2: float) -> tuple[float, float]:
    """Calculate great-circle distance in kilometers and initial azimuth in degrees on the Moon."""
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)

    a = math.sin(delta_phi / 2.0) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2.0) ** 2
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(max(0.0, 1.0 - a)))
    distance_km = LUNAR_RADIUS_KM * c

    # Initial bearing / azimuth
    y = math.sin(delta_lambda) * math.cos(phi2)
    x = math.cos(phi1) * math.sin(phi2) - math.sin(phi1) * math.cos(phi2) * math.cos(delta_lambda)
    bearing = (math.degrees(math.atan2(y, x)) + 360.0) % 360.0

    return round(distance_km, 3), round(bearing, 1)


@router.get("/psrs")
def list_polar_cold_traps():
    """List all authenticated NASA LRO LOLA/Diviner Permanent Shadow Regions (PSRs)."""
    return {
        "count": len(COLD_TRAPS),
        "reference_datum": "Moon 2000 reference sphere (R = 1737.4 km)",
        "data_sources": [
            "NASA LRO Diviner Lunar Radiometer Experiment (Paige et al., Science 2010)",
            "NASA Lunar Reconnaissance Orbiter LOLA Altimetry (Smith et al., 2017)",
            "NASA LCROSS Impact Volatiles Confirmation (Colaprete et al., Science 2010)",
        ],
        "cold_traps": COLD_TRAPS,
    }


@router.get("/volatiles")
def evaluate_volatiles_at_coordinate(
    lat: float = Query(..., ge=-90.0, le=90.0, description="Lunar latitude in degrees"),
    lon: float = Query(..., ge=-180.0, le=180.0, description="Lunar longitude in degrees"),
):
    """Evaluate proximity to permanent shadow regions, estimated thermal regime,

    and water ice stability for any target lunar coordinate.
    """
    nearest_trap = None
    min_dist_km = float("inf")
    nearest_bearing = 0.0

    for trap in COLD_TRAPS:
        d_km, bearing = lunar_distance_and_bearing(lat, lon, trap["center"]["lat"], trap["center"]["lon"])
        if d_km < min_dist_km:
            min_dist_km = d_km
            nearest_bearing = bearing
            nearest_trap = trap

    crater_radius_km = nearest_trap["diameter_km"] / 2.0

    # Determine volatile prospecting classification
    if min_dist_km <= crater_radius_km:
        classification = "inside_cold_trap"
        thermal_regime = "Cryogenic (<110 K)"
        estimated_surface_min_k = nearest_trap["min_temperature_k"]
        estimated_surface_max_k = 110.0
        stability_regime = "Surface water ice is thermally stable over geological timescales (billions of years)."
        depth_to_ice_table_m = 0.0
        volatile_potential_score = 95
    elif min_dist_km <= crater_radius_km + 10.0:
        classification = "proximal_rim"
        thermal_regime = "Subsurface Cold Trap (110 K – 145 K at depth)"
        estimated_surface_min_k = nearest_trap["min_temperature_k"] + 20.0
        estimated_surface_max_k = 220.0
        stability_regime = "Water ice is stable beneath 10 cm to 50 cm of insulating regolith cover."
        depth_to_ice_table_m = 0.25
        volatile_potential_score = 80
    elif min_dist_km <= 50.0:
        classification = "accessible_corridor"
        thermal_regime = "Intermediate Thermal Zone (145 K – 200 K at depth)"
        estimated_surface_min_k = 90.0
        estimated_surface_max_k = 280.0
        stability_regime = "Deep subsurface ice is possible beneath >1 meter of regolith; surface is seasonally volatile."
        depth_to_ice_table_m = 1.0
        volatile_potential_score = 50
    else:
        classification = "distal"
        # Scale equatorial vs mid-latitude temperatures
        abs_lat = abs(lat)
        if abs_lat > 60:
            thermal_regime = "High Latitude Diurnal (80 K – 320 K)"
            estimated_surface_min_k = 80.0
            estimated_surface_max_k = 320.0
        else:
            thermal_regime = "Equatorial/Mid-Latitude Diurnal (100 K – 390 K)"
            estimated_surface_min_k = 100.0
            estimated_surface_max_k = 390.0
        stability_regime = "Unstable. Any exposed water ice immediately sublimates into the lunar exosphere."
        depth_to_ice_table_m = None
        volatile_potential_score = 10

    # Distance in meters
    distance_m = round(min_dist_km * 1000.0, 1)

    return {
        "coordinates": {"lat": lat, "lon": lon},
        "is_polar_region": abs(lat) >= 80.0,
        "volatile_potential_score": volatile_potential_score,
        "classification": classification,
        "thermal_regime": thermal_regime,
        "estimated_diurnal_range_k": {
            "min_k": estimated_surface_min_k,
            "max_k": estimated_surface_max_k,
        },
        "ice_stability": {
            "regime": stability_regime,
            "estimated_depth_to_ice_table_m": depth_to_ice_table_m,
            "drilling_feasibility": "Viable for 1m drills (e.g. TRIDENT)" if depth_to_ice_table_m is not None and depth_to_ice_table_m <= 1.0 else "Requires deep core drills (>2m) or unavailable",
        },
        "nearest_cold_trap": {
            "id": nearest_trap["id"],
            "name": nearest_trap["name"],
            "distance_km": min_dist_km,
            "distance_m": distance_m,
            "azimuth_deg": nearest_bearing,
            "crater_center": nearest_trap["center"],
            "crater_diameter_km": nearest_trap["diameter_km"],
            "crater_depth_km": nearest_trap["depth_km"],
            "psr_area_km2": nearest_trap["psr_area_km2"],
            "min_measured_temperature_k": nearest_trap["min_temperature_k"],
            "water_ice_confirmed": nearest_trap["water_ice_confirmed"],
            "confirmation_source": nearest_trap["confirmation_source"],
        },
        "scientific_disclaimer": (
            "Thermal estimates and volatile potential scores are indicative engineering models derived from NASA LRO Diviner "
            "and LCROSS data. They do not constitute guarantee of subsurface ore deposits or drill penetration success."
        ),
        "citations": [
            "Paige, D. A., et al. (2010). Diviner Lunar Radiometer Observations of Cold Traps in the Moon's South Polar Region. Science, 330(6003), 479-482.",
            "Colaprete, A., et al. (2010). Detection of Water in the LCROSS Ejecta Plume. Science, 330(6003), 463-468.",
            "Smith, D. E., et al. (2017). Summary of the results from the Lunar Orbiter Laser Altimeter (LOLA). Icarus, 283, 70-91.",
        ],
    }
