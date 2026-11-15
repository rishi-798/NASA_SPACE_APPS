"""Photovoltaic Solar Power and Battery Energy Storage API for Lunar Surface Payloads.

Addresses the critical engineering challenge documented in docs/ANALYSIS.md:
"Visibility does not by itself prove adequate power... Power is reported as not assessed."

Calculates:
1. Incident solar flux for grazing polar solar geometries (1°–3° elevation).
2. Photovoltaic power generation for both vertical polar arrays and horizontal arrays.
3. Dynamic battery State of Charge (SoC %) over 24h mission windows.
4. Blackout survival margins and thermal preservation power balance.
"""
import math
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Query, HTTPException

from backend.analysis import normalize_range
from backend.calculations.sun_earth import calculate_visibility_window
from backend.landing_sites import get_landing_site
from backend.terrain.horizon import resolve_horizon

router = APIRouter(prefix="/api/analysis", tags=["power"])

SOLAR_CONSTANT_W_M2 = 1361.0  # Solar irradiance at 1 AU (W/m^2)


def calculate_solar_power_and_battery(
    site_id: Optional[str] = None,
    lat: Optional[float] = None,
    lon: Optional[float] = None,
    start: Optional[str] = None,
    end: Optional[str] = None,
    step_minutes: int = 30,
    solar_array_area_m2: float = 1.5,
    cell_efficiency: float = 0.28,
    array_orientation: str = "vertical",
    base_power_load_w: float = 80.0,
    battery_capacity_wh: float = 1000.0,
    initial_soc_pct: float = 95.0,
) -> Dict[str, Any]:
    """Pure calculation function for solar power generation and battery energy balance."""
    # Validate power parameters
    if battery_capacity_wh is None or battery_capacity_wh <= 0.0:
        raise HTTPException(status_code=422, detail="battery_capacity_wh must be a positive number")
    if solar_array_area_m2 is None or solar_array_area_m2 <= 0.0:
        raise HTTPException(status_code=422, detail="solar_array_area_m2 must be a positive number")
    if cell_efficiency is None or not (0.0 < cell_efficiency <= 1.0):
        raise HTTPException(status_code=422, detail="cell_efficiency must be greater than 0 and at most 1.0")
    if initial_soc_pct is None or not (0.0 <= initial_soc_pct <= 100.0):
        raise HTTPException(status_code=422, detail="initial_soc_pct must be between 0.0 and 100.0")
    if base_power_load_w is None or base_power_load_w < 0.0:
        raise HTTPException(status_code=422, detail="base_power_load_w cannot be negative")
    if array_orientation not in ("vertical", "horizontal", "cylindrical"):
        raise HTTPException(status_code=422, detail=f"array_orientation must be one of 'vertical', 'horizontal', 'cylindrical', got '{array_orientation}'")

    # Resolve coordinates
    if site_id:
        try:
            site = get_landing_site(site_id)
            target_lat = site["latitude"]
            target_lon = site["longitude"]
            site_name = site["name"]
        except Exception:
            raise HTTPException(status_code=404, detail=f"Unknown site_id: {site_id}")
    elif lat is not None and lon is not None:
        target_lat = lat
        target_lon = lon
        site_name = f"Custom ({lat:.4f}, {lon:.4f})"
        site = {"latitude": lat, "longitude": lon, "name": site_name, "horizon_profile": None}
    else:
        raise HTTPException(status_code=400, detail="Must provide either site_id or both lat and lon.")

    # Validate range
    try:
        rng = normalize_range(start, end, step_minutes)
    except Exception as e:
        raise HTTPException(status_code=422, detail=str(e))

    # Calculate SPICE geometric visibility and sun elevation angles
    samples = calculate_visibility_window(target_lat, target_lon, rng["start"], rng["end"], step_minutes)

    # Resolve terrain horizon if available (using on-demand LOLA DEM for custom south-polar points)
    if site_id is None and lat is not None and lat < -60.0:
        try:
            from backend.analysis import _custom_terrain
            profile, terrain_info = _custom_terrain({"latitude": target_lat, "longitude": target_lon, "kind": "custom"}, allow_flat_fallback=True)
        except Exception:
            profile, terrain_info = resolve_horizon(site, allow_flat_fallback=True)
    else:
        profile, terrain_info = resolve_horizon(site, allow_flat_fallback=True)

    dt_hours = step_minutes / 60.0
    current_soc_wh = float(battery_capacity_wh) * (float(initial_soc_pct) / 100.0)

    timeline = []
    total_energy_generated_wh = 0.0
    total_energy_consumed_wh = 0.0
    min_soc_pct = 100.0
    blackout_fatal = False

    for sample in samples:
        sun_data = sample["sun"]
        sun_elev = sun_data["elevation"]
        sun_azim = sun_data["azimuth"]

        # Check if obstructed by terrain horizon
        terrain_occulted = False
        if profile and profile.get("horizon"):
            step = profile.get("azimuth_step", 0.5)
            bin_idx = int((sun_azim % 360.0) / step)
            if 0 <= bin_idx < len(profile["horizon"]):
                terrain_limit = profile["horizon"][bin_idx]
                if sun_elev < terrain_limit:
                    terrain_occulted = True

        is_illuminated = (sun_elev > 0.0) and not terrain_occulted

        # Solar Flux Incident on Array
        if not is_illuminated:
            flux_w_m2 = 0.0
            gen_power_w = 0.0
        else:
            rad = math.radians(sun_elev)
            if array_orientation == "vertical":
                # Polar arrays are vertical to intercept grazing sunlight: incident flux ~ S0 * cos(elevation)
                flux_w_m2 = SOLAR_CONSTANT_W_M2 * math.cos(rad)
            elif array_orientation == "horizontal":
                flux_w_m2 = SOLAR_CONSTANT_W_M2 * math.sin(rad)
            else:  # cylindrical (e.g. lander body wrap)
                flux_w_m2 = SOLAR_CONSTANT_W_M2 * (math.cos(rad) / math.pi)

            gen_power_w = flux_w_m2 * solar_array_area_m2 * cell_efficiency

        net_power_w = gen_power_w - base_power_load_w
        delta_wh = net_power_w * dt_hours

        # Update Battery SoC
        current_soc_wh += delta_wh
        if current_soc_wh > battery_capacity_wh:
            current_soc_wh = battery_capacity_wh
        elif current_soc_wh <= 0.0:
            current_soc_wh = 0.0
            blackout_fatal = True

        soc_pct = (current_soc_wh / battery_capacity_wh) * 100.0
        if soc_pct < min_soc_pct:
            min_soc_pct = soc_pct

        total_energy_generated_wh += max(0.0, gen_power_w * dt_hours)
        total_energy_consumed_wh += base_power_load_w * dt_hours

        timeline.append({
            "timestamp": sample["time"],
            "sun_elevation_deg": round(sun_elev, 2),
            "sun_azimuth_deg": round(sun_azim, 2),
            "is_illuminated": is_illuminated,
            "terrain_occulted": terrain_occulted,
            "generated_power_w": round(gen_power_w, 1),
            "net_power_w": round(net_power_w, 1),
            "battery_soc_pct": round(soc_pct, 1),
            "battery_energy_wh": round(current_soc_wh, 1),
        })

    # Survivability assessment
    if blackout_fatal:
        power_status = "CRITICAL_BLACKOUT: Battery depleted to 0% during mission window; freeze hazard."
        survivable = False
    elif min_soc_pct < 20.0:
        power_status = "WARNING_LOW_MARGIN: Battery dropped below 20% reserve threshold."
        survivable = True
    else:
        power_status = "NOMINAL: Solar power generation and battery buffer maintain positive energy balance."
        survivable = True

    return {
        "site": {
            "name": site_name,
            "latitude": target_lat,
            "longitude": target_lon,
            "terrain_mode": terrain_info.get("mode", "flat_horizon"),
        },
        "mission_window": {
            "start": rng["start"],
            "end": rng["end"],
            "step_minutes": step_minutes,
            "duration_hours": round(len(samples) * dt_hours, 1),
        },
        "payload_configuration": {
            "solar_array_area_m2": solar_array_area_m2,
            "cell_efficiency_pct": round(cell_efficiency * 100.0, 1),
            "array_orientation": array_orientation,
            "base_power_load_w": base_power_load_w,
            "battery_capacity_wh": battery_capacity_wh,
            "initial_soc_pct": initial_soc_pct,
        },
        "summary": {
            "total_energy_generated_kwh": round(total_energy_generated_wh / 1000.0, 3),
            "total_energy_consumed_kwh": round(total_energy_consumed_wh / 1000.0, 3),
            "net_energy_balance_kwh": round((total_energy_generated_wh - total_energy_consumed_wh) / 1000.0, 3),
            "peak_generation_w": round(max((t["generated_power_w"] for t in timeline), default=0.0), 1),
            "minimum_battery_soc_pct": round(min_soc_pct, 1),
            "final_battery_soc_pct": round(timeline[-1]["battery_soc_pct"] if timeline else initial_soc_pct, 1),
            "power_survivable": survivable,
            "assessment": power_status,
        },
        "timeline": timeline,
        "engineering_note": (
            "Solar power calculations model direct beam irradiance at 1 AU (~1361 W/m^2) coupled with NAIF SPICE "
            "sun elevation angles and LOLA horizon obstruction. Real flight missions must also account for solar array "
            "temperature coefficients, lunar dust accumulation, and shadow penumbras."
        ),
    }


@router.get("/power")
def evaluate_solar_power_and_battery(
    site_id: Optional[str] = Query(None, description="Pre-configured landing site ID (e.g. athena-im2, odysseus-im1)"),
    lat: Optional[float] = Query(None, ge=-90.0, le=90.0, description="Lunar latitude"),
    lon: Optional[float] = Query(None, ge=-180.0, le=180.0, description="Lunar longitude"),
    start: Optional[str] = Query(None, description="Start time UTC (ISO 8601)"),
    end: Optional[str] = Query(None, description="End time UTC (ISO 8601)"),
    step_minutes: int = Query(30, ge=1, le=120, description="Step in minutes"),
    solar_array_area_m2: float = Query(1.5, gt=0.0, le=50.0, description="Total photovoltaic surface area (m^2)"),
    cell_efficiency: float = Query(0.28, gt=0.0, le=0.50, description="Cell conversion efficiency (e.g. 0.28 = 28% triple-junction GaAs)"),
    array_orientation: str = Query("vertical", pattern="^(vertical|horizontal|cylindrical)$", description="Solar array mounting geometry"),
    base_power_load_w: float = Query(80.0, ge=5.0, le=2000.0, description="Continuous payload and avionics power draw (W)"),
    battery_capacity_wh: float = Query(1000.0, ge=50.0, le=20000.0, description="Nameplate battery capacity (Wh)"),
    initial_soc_pct: float = Query(95.0, ge=10.0, le=100.0, description="Initial battery State of Charge (%)"),
):
    """Endpoint for solar power generation and battery energy balance."""
    return calculate_solar_power_and_battery(
        site_id=site_id,
        lat=lat,
        lon=lon,
        start=start,
        end=end,
        step_minutes=step_minutes,
        solar_array_area_m2=solar_array_area_m2,
        cell_efficiency=cell_efficiency,
        array_orientation=array_orientation,
        base_power_load_w=base_power_load_w,
        battery_capacity_wh=battery_capacity_wh,
        initial_soc_pct=initial_soc_pct,
    )
