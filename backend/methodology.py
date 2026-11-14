"""Plain-language model description, assumptions and limitations.

Everything here describes the implementation as it actually is (see
backend/calculations/sun_earth.py and backend/terrain/). It is returned by
/api/analysis, /api/compare and /api/methodology so the frontend never has to
invent its own explanation.
"""

VIABILITY_STATEMENT = (
    "Visibility does not by itself prove adequate power, a working communications link, or a safe landing."
)
VIABILITY_DETAIL = (
    "Power depends on solar-array geometry, partial-disc sunlight and battery capacity; communications depend "
    "on antenna pointing, link budgets and ground-station access; landing safety depends on slope, roughness, "
    "hazards and descent constraints. None of these are modelled. 'Both visible' marks a candidate visibility "
    "opportunity, not an engineering operating window."
)

ENGINEERING_CHECKS = {
    "sun_earth_visibility": "assessed (geometry only)",
    "power_generation": "not assessed",
    "communications_link": "not assessed",
    "antenna_pointing": "not assessed",
    "ground_station_access": "not assessed",
    "landing_slope_roughness_hazards": "not assessed",
    "descent_constraints": "not assessed",
    "note": VIABILITY_STATEMENT,
}

MODEL = {
    "engine": "NAIF SPICE via SpiceyPy (existing backend.calculations.sun_earth implementation)",
    "frame": "MOON_ME, which moon_de440_220930.tf defines as MOON_ME_DE440_ME421 (DE440 realisation of the DE421 mean-Earth/polar-axis frame)",
    "coordinates": "Degrees. Planetocentric (spherical) latitude, +north. East-positive longitude in [-180, 180].",
    "observer": "Surface point on the SPICE reference body for the Moon (pck00011: 1737.4 km sphere) at 0 m height. Site elevations are not used in the Sun/Earth geometry.",
    "geometry": "Geometric target-centre positions at the requested UTC instant (spkpos with abcorr NONE); no light-time or stellar-aberration correction. The Moon has no atmosphere, so no refraction applies.",
    "angles": "Azimuth clockwise from local north (0 = N, 90 = E) in [0, 360). Elevation from the local horizontal plane normal to the reference-sphere radius.",
    "visibility_rule": "Target CENTRE elevation above the horizon in use: the terrain horizon at that azimuth when a profile is applied, otherwise 0 deg (flat). No disc-edge, partial-disc or radio-link test.",
    "clearance": "terrain_clearance = elevation - terrain_horizon, in degrees; present only when a terrain profile is applied. visible remains the authoritative flag.",
    "sampling": "Samples at start + k*step up to end; end is included only when it falls on the grid. Each sample holds until the next step or the range end (sample-and-hold). A sample exactly at end has zero duration. Percentages are duration-weighted. Crossings are not refined; boundaries are accurate only to one step, and windows shorter than a step can be missed.",
    "time": "Inputs must include a timezone and are normalised to UTC. Durations are UTC civil-time differences.",
}

ASSUMPTIONS = [
    MODEL["engine"] + ".",
    "Lunar frame: " + MODEL["frame"] + ".",
    MODEL["coordinates"],
    MODEL["observer"],
    MODEL["geometry"],
    MODEL["angles"],
    MODEL["visibility_rule"],
    MODEL["sampling"],
    "Joint ('both available') visibility means the Sun condition and the Earth condition are both satisfied in the same sample.",
]

LIMITATIONS = [
    VIABILITY_STATEMENT,
    VIABILITY_DETAIL,
    "Centre-of-disc rule: the Sun's radius is about 0.27 deg and the Earth's about 0.95 deg, so partial visibility near the horizon is not represented.",
    "Geometric positions omit light time (~1.3 s to Earth, ~499 s to the Sun) and aberration; differences against JPL Horizons apparent positions are below 0.02 deg in the reference tests.",
    "Flat-horizon results ignore terrain. At polar sites crater rims and massifs often hide a low Sun or Earth, so flat-horizon visibility can overstate both.",
    "The Athena LOLA profile (80 m/pixel DEM, DE421 MOON_ME) excludes terrain within 160 m and beyond 40 km, and assumes a 2 m instrument height. The DE421 and DE440 MOON_ME frames agree to about 0.5 m over 2000-2040; no rotation is applied.",
    "Site coordinates are rounded to 0.01 deg; terrain results may change with a more precise position.",
    "Cesium terrain is visual context only. A sampled point elevation or regional terrain summary is not a horizon profile and does not establish arbitrary-location terrain visibility.",
]

SOURCES = [
    "https://naif.jpl.nasa.gov/naif/",
    "https://naif.jpl.nasa.gov/pub/naif/generic_kernels/",
    "https://pgda.gsfc.nasa.gov/products/90",
    "https://lroc.im-ldi.com/images/1408",
    "https://www.nasa.gov/missions/lro/nasas-lro-images-intuitive-machines-odysseus-lander/",
    "https://ssd.jpl.nasa.gov/horizons/ (reference cases in tests)",
]
