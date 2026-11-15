"""NASA Deep Space Network (DSN) Telemetry & RF Comm Link Budget Engine.

Computes physical radio-frequency (RF) link budgets and communications margins
between lunar surface assets (CLPS landers / Artemis rovers) and NASA's Deep Space
Network (DSN) ground complexes:
1. Goldstone Deep Space Communications Complex (GDSCC - California, USA)
2. Madrid Deep Space Communications Complex (MDSCC - Robledo, Spain)
3. Canberra Deep Space Communication Complex (CDSCC - Tidbinbilla, Australia)

Incorporates:
- High-fidelity SPICE planetary ephemeris distance and geometric line-of-sight.
- Free-Space Path Loss (FSPL) for X-band (8.45 GHz) and Ka-band (32.0 GHz).
- Transmitter EIRP (power, antenna dish gain, waveguide line loss, pointing jitter).
- Atmospheric and ionospheric attenuation losses.
- Receiving antenna aperture G/T (34-meter BWG beam waveguide & 70-meter Cassegrain).
- Carrier-to-Noise spectral density (C/N0), received Eb/N0, and threshold link margins.
- Maximum sustainable downlink telemetry throughput (kbps / Mbps).
"""
import math
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from backend.calculations.sun_earth import calculate_visibility, parse_utc_time

router = APIRouter(prefix="/api/telemetry", tags=["telemetry"])

# Physical constants
SPEED_OF_LIGHT_MPS = 299792458.0
BOLTZMANN_K_DBW = -228.60  # 10*log10(1.380649e-23) dBW / (Hz * K)

# DSN Ground Stations Catalog (WGS84 Coordinates & Station Capabilities)
DSN_STATIONS = [
    {
        "id": "goldstone",
        "name": "Goldstone Deep Space Communications Complex",
        "code": "GDSCC",
        "country": "United States",
        "lat": 35.4267,
        "lon": -116.8900,
        "primary_antennas": ["DSS-14 (70m)", "DSS-24 (34m BWG)", "DSS-26 (34m BWG)"],
        "x_band_gt_34m_dbk": 53.5,
        "ka_band_gt_34m_dbk": 64.2,
        "x_band_gt_70m_dbk": 59.2,
    },
    {
        "id": "madrid",
        "name": "Madrid Deep Space Communications Complex",
        "code": "MDSCC",
        "country": "Spain",
        "lat": 40.4314,
        "lon": -4.2480,
        "primary_antennas": ["DSS-63 (70m)", "DSS-65 (34m HEF)", "DSS-54 (34m BWG)"],
        "x_band_gt_34m_dbk": 53.4,
        "ka_band_gt_34m_dbk": 64.0,
        "x_band_gt_70m_dbk": 59.1,
    },
    {
        "id": "canberra",
        "name": "Canberra Deep Space Communication Complex",
        "code": "CDSCC",
        "country": "Australia",
        "lat": -35.4014,
        "lon": 148.9817,
        "primary_antennas": ["DSS-43 (70m)", "DSS-34 (34m BWG)", "DSS-36 (34m BWG)"],
        "x_band_gt_34m_dbk": 53.6,
        "ka_band_gt_34m_dbk": 64.1,
        "x_band_gt_70m_dbk": 59.4,
    },
]

# Standard Spacecraft RF Configurations
RF_BAND_PRESETS = {
    "X-band": {
        "frequency_ghz": 8.45,
        "wavelength_m": SPEED_OF_LIGHT_MPS / 8.45e9,
        "default_tx_power_w": 10.0,
        "default_dish_diam_m": 0.50,
        "dish_efficiency": 0.60,
        "tx_line_loss_db": 1.5,
        "atm_loss_db": 0.35,
        "req_eb_n0_db": 2.5,  # Rate 1/2 LDPC threshold for BER <= 1e-6
    },
    "Ka-band": {
        "frequency_ghz": 32.0,
        "wavelength_m": SPEED_OF_LIGHT_MPS / 32.0e9,
        "default_tx_power_w": 15.0,
        "default_dish_diam_m": 0.40,
        "dish_efficiency": 0.55,
        "tx_line_loss_db": 1.8,
        "atm_loss_db": 0.85,
        "req_eb_n0_db": 2.8,  # Rate 2/3 LDPC threshold
    },
}


class LinkBudgetEvaluationRequest(BaseModel):
    lat: float = Field(..., ge=-90.0, le=90.0, description="Lunar landing site latitude in degrees")
    lon: float = Field(..., ge=-180.0, le=180.0, description="Lunar landing site longitude in degrees")
    time: str = Field(..., description="ISO 8601 UTC observation timestamp")
    band: str = Field("X-band", description="Frequency band: 'X-band' (8.45 GHz) or 'Ka-band' (32 GHz)")
    tx_power_w: Optional[float] = Field(None, gt=0.0, le=200.0, description="Transmitter RF power in Watts")
    dish_diam_m: Optional[float] = Field(None, gt=0.05, le=5.0, description="Lander dish antenna diameter in meters")
    telemetry_rate_kbps: Optional[float] = Field(1000.0, gt=0.1, le=100000.0, description="Downlink data rate in kbps")
    use_70m_dish: bool = Field(False, description="Use DSN 70m dish instead of standard 34m BWG aperture")


def calculate_parabolic_gain_dbi(diameter_m: float, wavelength_m: float, efficiency: float) -> float:
    """Calculates directional antenna gain in dBi from physical aperture."""
    area = math.pi * ((diameter_m / 2.0) ** 2)
    gain_linear = efficiency * (4.0 * math.pi * area) / (wavelength_m ** 2)
    return 10.0 * math.log10(max(1.0, gain_linear))


def calculate_free_space_path_loss_db(distance_m: float, frequency_hz: float) -> float:
    """Calculates Free-Space Path Loss (FSPL) in dB."""
    return 20.0 * math.log10(distance_m) + 20.0 * math.log10(frequency_hz) - 147.55


def evaluate_active_dsn_stations(utc_dt: datetime) -> List[Dict[str, Any]]:
    """Estimates active DSN complex visibility based on Earth diurnal rotation.
    
    The Greenwich Hour Angle (GHA) of Aries/sub-lunar meridian determines which
    terrestrial hemisphere faces the Moon at UTC epoch.
    """
    # Approximate Earth sidereal rotation angle in degrees from epoch J2000
    epoch_2000 = datetime(2000, 1, 1, 12, 0, 0, tzinfo=timezone.utc)
    days_since_2000 = (utc_dt - epoch_2000).total_seconds() / 86400.0
    gmst_deg = (280.46061837 + 360.98564736629 * days_since_2000) % 360.0

    station_evaluations = []
    for st in DSN_STATIONS:
        # Longitude difference between DSN station and Earth sub-lunar meridian
        lon_diff_deg = (st["lon"] - gmst_deg + 180.0) % 360.0 - 180.0
        # Elevation angle heuristic: positive when within ~80 degrees of sub-lunar point
        geom_elevation_deg = math.degrees(math.asin(max(-1.0, min(1.0, math.cos(math.radians(lon_diff_deg)) * 0.92))))
        is_tracking = geom_elevation_deg >= 10.0  # DSN operational mask threshold

        station_evaluations.append({
            "station_id": st["id"],
            "station_name": st["name"],
            "code": st["code"],
            "country": st["country"],
            "estimated_elevation_deg": round(geom_elevation_deg, 1),
            "tracking_status": "ACTIVE_TRACKING" if is_tracking else "BELOW_HORIZON_MASK",
            "is_primary": False,
            "x_band_gt_34m": st["x_band_gt_34m_dbk"],
            "ka_band_gt_34m": st["ka_band_gt_34m_dbk"],
            "x_band_gt_70m": st["x_band_gt_70m_dbk"],
        })

    # Sort descending by elevation to designate primary station
    station_evaluations.sort(key=lambda s: s["estimated_elevation_deg"], reverse=True)
    if station_evaluations and station_evaluations[0]["tracking_status"] == "ACTIVE_TRACKING":
        station_evaluations[0]["is_primary"] = True

    return station_evaluations


def compute_rf_link_budget(
    lat: float,
    lon: float,
    time_iso: str,
    band: str = "X-band",
    tx_power_w: Optional[float] = None,
    dish_diam_m: Optional[float] = None,
    telemetry_rate_kbps: float = 1000.0,
    use_70m_dish: bool = False,
) -> Dict[str, Any]:
    """Computes full NASA DSN Direct-to-Earth (DTE) telemetry link budget."""
    if band not in RF_BAND_PRESETS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported band '{band}'. Must be one of: {list(RF_BAND_PRESETS.keys())}"
        )

    preset = RF_BAND_PRESETS[band]
    freq_ghz = preset["frequency_ghz"]
    freq_hz = freq_ghz * 1e9
    wavelength_m = preset["wavelength_m"]

    power_w = tx_power_w if tx_power_w is not None else preset["default_tx_power_w"]
    dish_m = dish_diam_m if dish_diam_m is not None else preset["default_dish_diam_m"]
    efficiency = preset["dish_efficiency"]
    tx_loss_db = preset["tx_line_loss_db"]
    atm_loss_db = preset["atm_loss_db"]
    req_eb_n0_db = preset["req_eb_n0_db"]

    # Retrieve SPICE Earth distance & geometric elevation
    utc_dt = parse_utc_time(time_iso)
    visibility = calculate_visibility(lat, lon, time_iso)
    earth_data = visibility["earth"]
    distance_km = earth_data["distance_km"]
    distance_m = distance_km * 1000.0
    earth_elevation_deg = earth_data["elevation"]

    # One-way and round-trip light time
    one_way_light_time_s = distance_m / SPEED_OF_LIGHT_MPS
    round_trip_light_time_s = one_way_light_time_s * 2.0

    # 1. Transmitter EIRP
    tx_power_dbw = 10.0 * math.log10(power_w)
    tx_gain_dbi = calculate_parabolic_gain_dbi(dish_m, wavelength_m, efficiency)
    eirp_dbw = tx_power_dbw + tx_gain_dbi - tx_loss_db

    # 2. Path Losses
    fspl_db = calculate_free_space_path_loss_db(distance_m, freq_hz)
    total_path_loss_db = fspl_db + atm_loss_db

    # 3. Receiver (DSN Ground Complex)
    dsn_stations = evaluate_active_dsn_stations(utc_dt)
    active_station = next((s for s in dsn_stations if s["is_primary"]), dsn_stations[0])

    if use_70m_dish:
        gt_dbk = active_station["x_band_gt_70m"] if band == "X-band" else active_station["ka_band_gt_34m"] + 4.5
        rx_antenna_desc = "DSN 70-meter High-Gain Deep Space Reflector"
    else:
        gt_dbk = active_station["x_band_gt_34m"] if band == "X-band" else active_station["ka_band_gt_34m"]
        rx_antenna_desc = "DSN 34-meter Beam Waveguide (BWG) Standard Complex"

    # 4. Carrier-to-Noise Spectral Density (C/N0)
    # C/N0 = EIRP - FSPL - Latm + (G/T) - 10*log10(k)
    c_n0_dbhz = eirp_dbw - total_path_loss_db + gt_dbk - BOLTZMANN_K_DBW

    # 5. Received Signal Power & SNR
    rx_power_dbw = eirp_dbw - total_path_loss_db + (gt_dbk - 10.0)  # Approximation of aperture effective gain
    rx_power_dbm = rx_power_dbw + 30.0

    # 6. Energy per Bit to Noise Density (Eb/N0) and Link Margin
    bit_rate_bps = telemetry_rate_kbps * 1000.0
    bit_rate_dbhz = 10.0 * math.log10(bit_rate_bps)
    received_eb_n0_db = c_n0_dbhz - bit_rate_dbhz
    link_margin_db = received_eb_n0_db - req_eb_n0_db

    # Max sustainable bit rate with 3.0 dB flight safety margin
    safe_margin_db = 3.0
    max_rate_dbhz = c_n0_dbhz - req_eb_n0_db - safe_margin_db
    max_rate_kbps = (10.0 ** (max_rate_dbhz / 10.0)) / 1000.0

    # Classification
    if earth_elevation_deg <= 0.0:
        comm_status = "LUNAR_OCCULTATION_NO_LINE_OF_SIGHT"
        link_health = "CRITICAL_BLACKOUT"
    elif link_margin_db >= 3.0:
        comm_status = "NOMINAL_HIGH_RATE_DTE"
        link_health = "EXCELLENT"
    elif link_margin_db >= 0.0:
        comm_status = "DEGRADED_MARGIN_REDUCE_BITRATE"
        link_health = "MARGINAL"
    else:
        comm_status = "UNSUSTAINABLE_BITRATE_DATA_LOSS"
        link_health = "DEFICIT"

    return {
        "site_coordinates": {"latitude_deg": lat, "longitude_deg": lon},
        "observation_time_utc": time_iso,
        "ephemeris_range": {
            "earth_distance_km": round(distance_km, 2),
            "earth_elevation_deg": round(earth_elevation_deg, 2),
            "earth_azimuth_deg": round(earth_data["azimuth"], 2),
            "one_way_light_time_sec": round(one_way_light_time_s, 3),
            "round_trip_light_time_sec": round(round_trip_light_time_s, 3),
        },
        "rf_configuration": {
            "band": band,
            "carrier_frequency_ghz": freq_ghz,
            "transmitter_power_w": power_w,
            "dish_diameter_m": dish_m,
            "antenna_gain_dbi": round(tx_gain_dbi, 2),
            "eirp_dbw": round(eirp_dbw, 2),
            "target_telemetry_rate_kbps": telemetry_rate_kbps,
        },
        "path_losses": {
            "free_space_path_loss_db": round(fspl_db, 2),
            "atmospheric_loss_db": atm_loss_db,
            "total_path_attenuation_db": round(total_path_loss_db, 2),
        },
        "ground_segment_dsn": {
            "receiving_antenna": rx_antenna_desc,
            "receiver_gt_dbk": round(gt_dbk, 2),
            "primary_station": active_station["station_name"],
            "primary_station_code": active_station["code"],
            "all_stations": dsn_stations,
        },
        "link_budget_performance": {
            "carrier_to_noise_density_c_n0_dbhz": round(c_n0_dbhz, 2),
            "received_power_dbm": round(rx_power_dbm, 2),
            "received_eb_n0_db": round(received_eb_n0_db, 2),
            "required_eb_n0_db": req_eb_n0_db,
            "link_margin_db": round(link_margin_db, 2),
            "max_sustainable_downlink_rate_kbps": round(max_rate_kbps, 1),
            "comm_status": comm_status,
            "link_health": link_health,
        },
    }


@router.get("/link-budget")
def get_link_budget_endpoint(
    lat: float = Query(..., ge=-90.0, le=90.0, description="Landing site latitude in degrees"),
    lon: float = Query(..., ge=-180.0, le=180.0, description="Landing site longitude in degrees"),
    time: str = Query(..., description="Observation timestamp in ISO 8601 UTC format"),
    band: str = Query("X-band", description="Frequency band: 'X-band' (8.45 GHz) or 'Ka-band' (32 GHz)"),
    tx_power_w: Optional[float] = Query(None, gt=0.0, le=200.0),
    dish_diam_m: Optional[float] = Query(None, gt=0.05, le=5.0),
    telemetry_rate_kbps: float = Query(1000.0, gt=0.1, le=100000.0),
    use_70m: bool = Query(False),
):
    """Evaluates real-time NASA DSN Direct-to-Earth (DTE) radio communications link budget."""
    try:
        return compute_rf_link_budget(
            lat=lat,
            lon=lon,
            time_iso=time,
            band=band,
            tx_power_w=tx_power_w,
            dish_diam_m=dish_diam_m,
            telemetry_rate_kbps=telemetry_rate_kbps,
            use_70m_dish=use_70m,
        )
    except Exception as exc:
        raise HTTPException(status_code=422, detail=str(exc))


@router.post("/link-budget/evaluate")
def evaluate_link_budget_post_endpoint(request: LinkBudgetEvaluationRequest):
    """POST endpoint for evaluating custom telemetry parameters."""
    try:
        return compute_rf_link_budget(
            lat=request.lat,
            lon=request.lon,
            time_iso=request.time,
            band=request.band,
            tx_power_w=request.tx_power_w,
            dish_diam_m=request.dish_diam_m,
            telemetry_rate_kbps=request.telemetry_rate_kbps or 1000.0,
            use_70m_dish=request.use_70m_dish,
        )
    except Exception as exc:
        raise HTTPException(status_code=422, detail=str(exc))
