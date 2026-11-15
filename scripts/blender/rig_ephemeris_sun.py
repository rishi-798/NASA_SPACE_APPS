"""Create a Blender Sun and approximate Earthshine from SPICE geometry.

Run with the project's Python (with spiceypy installed), for example:
python scripts/blender/rig_ephemeris_sun.py --blend input.blend --metadata metadata.json \
  --time 1969-11-19T06:54:35Z --output rigged.blend --blender /path/to/blender

The subprocess sends calculated values to Blender, so Blender's bundled Python
does not need spiceypy. Neither the input blend nor its terrain mesh is changed.
"""
import argparse
import json
import math
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))


def visible_disc_fraction(source_radius, occluder_radius, separation):
    """Uniform-disc visibility in the small-angle tangent-plane approximation."""
    r, R, d = source_radius, occluder_radius, separation
    if r <= 0 or R <= 0 or d < 0:
        raise ValueError('Disc radii must be positive and separation nonnegative')
    if d >= r + R:
        return 1.0
    if d <= abs(R-r):
        return 0.0 if R >= r else 1.0 - (R/r)**2
    a = math.acos(max(-1.0, min(1.0, (d*d+r*r-R*R)/(2*d*r))))
    b = math.acos(max(-1.0, min(1.0, (d*d+R*R-r*r)/(2*d*R))))
    area = r*r*a + R*R*b - 0.5*math.sqrt(max(0.0, (-d+r+R)*(d+r-R)*(d-r+R)*(d+r+R)))
    return max(0.0, min(1.0, 1.0-area/(math.pi*r*r)))


def earth_visual_hg_phase(phase_angle_radians, g=-0.33):
    """Robinson 2026 normalized visual fit, not a bolometric phase law."""
    if not 0 <= phase_angle_radians <= math.pi or not -1 < g < 1:
        raise ValueError('phase angle or Henyey-Greenstein asymmetry is out of range')
    return ((1 + g)**2 / (1 + g*g + 2*g*math.cos(phase_angle_radians)))**1.5


def earth_visual_fractional_variability(phase_angle_radians):
    """Fractional 1-sigma variability from Robinson 2026 equations 9, 14."""
    if not 0 <= phase_angle_radians <= math.pi:
        raise ValueError('phase angle out of range')
    angle_deg = math.degrees(phase_angle_radians)
    return 0.11 if angle_deg <= 110 else 0.11 * (angle_deg / 110)**4.6


def calculate(metadata, time, aberration='CN+S', earth_orientation_pck=None):
    import numpy as np
    import spiceypy as spice
    from backend.spice_kernels import SPICE_LOCK, load_spice_kernels
    from backend.calculations.sun_earth import parse_utc_time
    from backend.calculations.time_scales import historical_tai_minus_utc, utc_to_et

    anchor = metadata.get("anchor") or metadata["feature"]
    lat = math.radians(anchor.get("latitude_planetocentric_deg", anchor.get("latitude_deg")))
    lon = math.radians(anchor["longitude_east_deg"])
    east = np.array([-math.sin(lon), math.cos(lon), 0.0])
    north = np.array([-math.sin(lat)*math.cos(lon), -math.sin(lat)*math.sin(lon), math.cos(lat)])
    up = np.cross(east, north)
    basis = np.array([east, north, up])
    anchor_height = float(metadata.get("anchor_sample_height_m", metadata.get("mesh", {}).get("sample_height_center_m", 0.0)))
    site = up * ((metadata["vertical_reference_radius_m"] + anchor_height) / 1000)
    utc_datetime = parse_utc_time(time)
    utc = utc_datetime.isoformat().replace("+00:00", "Z")
    with SPICE_LOCK:
        load_spice_kernels()
        historical_offset = historical_tai_minus_utc(utc_datetime)
        et = utc_to_et(utc_datetime)
        if historical_offset is None:
            time_model = 'SPICE UTC conversion; pre-1961 historical UT is not modeled.'
        else:
            time_model = 'IERS historical TAI-UTC drift, then TT to SPICE ET.'
        vectors = {}
        for target in ('SUN', 'EARTH'):
            state, light_time = spice.spkcpo(target, et, 'MOON_ME', 'OBSERVER', aberration, site, 'MOON', 'MOON_ME')
            vectors[target] = (state[:3], float(light_time))
        # Earth reflects sunlight before that light travels to the observer.
        earth_epoch = et - vectors['EARTH'][1] if aberration != 'NONE' else et
        earth_to_sun_j2000, _ = spice.spkpos('SUN', earth_epoch, 'J2000', aberration, 'EARTH')
        earth_to_sun = spice.pxform('J2000', 'MOON_ME', et) @ earth_to_sun_j2000
        earth_to_site_j2000 = spice.pxform('MOON_ME', 'J2000', et) @ -vectors['EARTH'][0]
        if earth_orientation_pck is not None:
            # The optional kernel is scoped to this calculation and protected by SPICE_LOCK.
            kernel = str(Path(earth_orientation_pck).resolve())
            already_loaded = any(spice.kdata(i, 'PCK')[0] == kernel for i in range(spice.ktotal('PCK')))
            if not already_loaded:
                spice.furnsh(kernel)
            try:
                earth_to_site_fixed = spice.pxform('J2000', 'ITRF93', earth_epoch) @ earth_to_site_j2000
            finally:
                if not already_loaded:
                    spice.unload(kernel)
            point = spice.surfpt(np.zeros(3), earth_to_site_fixed, 6378.137, 6378.137, 6356.752314245)
            sub_lon_rad, sub_lat_rad, _ = spice.recgeo(point, 6378.137, 1/298.257223563)
            earth_frame_note = 'ITRF93 binary PCK, terrestrial ellipsoid surface geodetic coordinates; kernel coverage and predicted intervals apply.'
        else:
            earth_to_site_fixed = spice.pxform('J2000', 'IAU_EARTH', earth_epoch) @ earth_to_site_j2000
            sub_lat_rad = math.atan2(earth_to_site_fixed[2], math.hypot(*earth_to_site_fixed[:2]))
            sub_lon_rad = math.atan2(earth_to_site_fixed[1], earth_to_site_fixed[0])
            earth_frame_note = 'Approximate IAU_EARTH orientation and spherical latitude; no Earth orientation parameters or ellipsoid correction.'
    def body(vec, light_time):
        distance = float(np.linalg.norm(vec))
        local = basis @ (vec / distance)
        return {"direction_enu": local.tolist(), "distance_km": distance,
                "light_time_seconds": light_time,
                "azimuth_deg": math.degrees(math.atan2(local[0], local[1])) % 360,
                "elevation_deg": math.degrees(math.asin(float(np.clip(local[2], -1, 1))))}
    s, e = body(*vectors['SUN']), body(*vectors['EARTH'])
    # Lambert sphere: angle between Earth-to-Sun and Earth-to-observer rays.
    a, b = earth_to_sun, -vectors['EARTH'][0]
    alpha = math.acos(float(np.clip(np.dot(a, b)/(np.linalg.norm(a)*np.linalg.norm(b)), -1, 1)))
    phase = (math.sin(alpha) + (math.pi-alpha)*math.cos(alpha))/math.pi
    solar = 1361.0 * (149597870.7 / s["distance_km"])**2
    solar_at_earth = 1361.0 * (149597870.7 / float(np.linalg.norm(earth_to_sun)))**2
    # Legacy 0.367 visual geometric albedo applied to total solar energy; not a calibrated broadband reflectance.
    earthshine = solar_at_earth * 0.367 * (6371.0/e["distance_km"])**2 * phase
    visual_phase = earth_visual_hg_phase(alpha)
    visual_variability = earth_visual_fractional_variability(alpha)
    # A visual-band reflectance ratio scaled by the bolometric Sun strength
    # for Blender RGB. This is not actual broadband or visual-band flux.
    visual_equivalent = solar_at_earth * 0.23 * (6371.0/e["distance_km"])**2 * visual_phase
    s["angular_diameter_deg"] = math.degrees(2*math.asin(695700.0/s["distance_km"]))
    e["angular_diameter_deg"] = math.degrees(2*math.asin(6371.0/e["distance_km"]))
    separation = math.acos(float(np.clip(np.dot(s['direction_enu'], e['direction_enu']), -1, 1)))
    visibility = visible_disc_fraction(math.radians(s['angular_diameter_deg'])/2,
                                       math.radians(e['angular_diameter_deg'])/2, separation)
    from scripts.blender.earthshine_spring import spring_solar_band
    sub_lat = math.degrees(sub_lat_rad)
    sub_lon = math.degrees(sub_lon_rad)
    spring = {'available': False, 'subobserver_latitude_deg': sub_lat,
              'subobserver_longitude_east_deg': sub_lon, 'coordinate_model': earth_frame_note,
              'reason': 'Phase must be below 60 degrees and the tabulated latitude must be between -20 and +30 degrees.'}
    if math.degrees(alpha) < 60 and -20 <= sub_lat <= 30:
        spring = {'available': True, 'subobserver_latitude_deg': sub_lat,
                  'subobserver_longitude_east_deg': sub_lon, 'coordinate_model': earth_frame_note,
                  **spring_solar_band(math.degrees(alpha), sub_lat, sub_lon, e['distance_km'])}
    return {"time_utc": utc, "time_conversion": time_model, "historical_tai_minus_utc_seconds": historical_offset, "frame": "MOON_ME_DE440_ME421", "aberration": aberration,
            "sun": s, "earth": e, "anchor_height_m": anchor_height, "solar_irradiance_w_m2": solar,
            "earth_sun_angular_separation_deg": math.degrees(separation),
            "solar_disc_visible_fraction": visibility,
            "direct_solar_irradiance_w_m2": solar * visibility,
            "eclipse_model": "Uniform circular discs in tangent plane; no atmospheric refraction, limb darkening or spatially varying penumbra.",
            "earth_phase_angle_deg": math.degrees(alpha), "earth_lambert_phase": phase,
            "earthshine_irradiance_w_m2_approx": earthshine,
            "earth_visual_hg_phase": visual_phase,
            "earth_visual_fractional_variability_1sigma": visual_variability,
            "earth_visual_variability_note": "Empirical fractional 1-sigma variability of the visual phase-curve model, not a complete uncertainty or a measured historical weather estimate; unbounded Gaussian approximation may be invalid at large crescent phases.",
            "earthshine_visual_equivalent_sun_strength": visual_equivalent,
            "earthshine_spring_solar_band": spring,
            "earthshine_visual_model": "Robinson 2026 empirical visual phase fit f=0.23, g=-0.33; https://doi.org/10.3847/PSJ/ae2ec6. Scaled relative to total Sun energy for RGB appearance, not measured broadband flux. Global mean; excludes actual weather, polar-view differences and eclipses. Fit extrapolation at extreme crescent is not physically constrained.",
            "earthshine_model": "Legacy Lambert sphere, 0.367 historical visual geometric albedo applied to total solar irradiance; not validated broadband flux. Excludes atmospheric and surface variation and eclipses",
            "geometry_limit": "Anchor height is the recorded center sample, if available, otherwise zero; frame realization uncertainty and terrain outside the mesh are not modeled.",
            "visibility_limit": "The local terrain casts shadows, but distant terrain and the lunar globe outside the mesh are not modeled as occluders."}


def orient_for_site04_plane(payload, metadata):
    """Express anchor ENU directions in the Site04 south-polar map plane.

    The source uses x = rho sin(lon), y = rho cos(lon). The saved Blender
    grids preserve those axes with a translation, and use z for height.
    This is a local approximation: the grids are flat, not curved Moon geometry.
    """
    if not str(metadata.get('region_id', '')).startswith('SITE04-BLOCK-'):
        raise ValueError('Site04 polar orientation requires Site04 block metadata')
    lon = math.radians(metadata['anchor']['longitude_east_deg'])
    c, s = math.cos(lon), math.sin(lon)
    for name in ('sun', 'earth'):
        east, north, up = payload[name]['direction_enu']
        payload[name]['direction_blender'] = [c*east + s*north, -s*east + c*north, up]
    payload['blender_direction_frame'] = 'Site04 south-polar stereographic plane, x increasing easting, y increasing northing, z up'
    payload['blender_frame_limit'] = 'Single-anchor rotation on a flat projected grid; lunar curvature and spatially varying orientation are not represented.'
    return payload


def apply_in_blender(payload_path, output):
    import bpy
    from mathutils import Vector
    payload = json.loads(Path(payload_path).read_text(encoding="utf-8"))
    occluder = payload.get('lunar_occluder', 'none')
    if occluder == 'conservative-inner-sphere':
        if bpy.context.scene.render.engine != 'CYCLES':
            raise ValueError('The experimental shadow-only inner sphere has only been tested in Cycles')
        if bpy.data.objects.get('Experimental lunar inner shadow') is not None:
            raise ValueError('A lunar inner shadow object already exists; use a clean input scene')
        previously_selected = list(bpy.context.selected_objects)
        previously_active = bpy.context.view_layer.objects.active
        bpy.ops.mesh.primitive_uv_sphere_add(segments=128, ring_count=64,
            radius=1700000.0, location=(0, 0, -payload['lunar_reference_radius_m']))
        shadow = bpy.context.object
        shadow.name = 'Experimental lunar inner shadow'
        shadow.visible_camera = False
        shadow.visible_diffuse = False
        shadow.visible_glossy = False
        shadow.visible_transmission = False
        shadow.visible_shadow = True
        shadow['purpose'] = 'Shadow-only conservative interior sphere; not terrain and not an accurate horizon.'
        shadow.select_set(False)
        shadow.hide_select = True
        for obj in previously_selected:
            obj.select_set(True)
        bpy.context.view_layer.objects.active = previously_active
    # Display exposure is separate from the irradiance stored on the lights.
    bpy.context.scene.view_settings.exposure = -6.0
    # The overview scenes use an illustrative world. Remove that ambient light
    # in the rigged copy so the ephemeris sources control illumination.
    if bpy.context.scene.world:
        world = bpy.context.scene.world.copy()
        bpy.context.scene.world = world
        world.use_nodes = True
        for node in world.node_tree.nodes:
            if node.type == "BACKGROUND":
                node.inputs["Strength"].default_value = 0.0
    for obj in bpy.context.scene.objects:
        if obj.type == "LIGHT" and obj.name not in {"Ephemeris Sun", "Ephemeris Earthshine"}:
            obj.hide_render = True
    for name, body, energy in (("Ephemeris Sun", "sun", payload["direct_solar_irradiance_w_m2"]),
                               ("Ephemeris Earthshine", "earth", payload.get("selected_earthshine_energy", payload["earthshine_irradiance_w_m2_approx"]))):
        obj = bpy.data.objects.get(name)
        if obj is None:
            light = bpy.data.lights.new(name, "SUN")
            obj = bpy.data.objects.new(name, light)
            bpy.context.scene.collection.objects.link(obj)
        elif obj.type != "LIGHT" or obj.data.type != "SUN":
            raise ValueError(f"{name} exists and is not a Sun light")
        else:
            # Do not inherit custom shader nodes or modify shared light data.
            obj.data = bpy.data.lights.new(name, "SUN")
        direction = Vector(payload[body].get("direction_blender", payload[body]["direction_enu"]))
        # Blender's local -Z points in the direction light travels.
        obj.rotation_euler = (-direction).to_track_quat('-Z', 'Y').to_euler()
        obj.data.energy = energy
        obj.data.normalize = True  # Blender's normalized strength is W/m².
        obj.data.color = (1.0, 1.0, 1.0)
        obj.data.angle = math.radians(payload[body]["angular_diameter_deg"])
        # Keep the direction active below the anchor horizon: elevated slopes
        # may still see the source. Terrain outside the mesh is not modeled.
        obj.hide_render = False
        obj["ephemeris_utc"] = payload["time_utc"]
    bpy.context.scene["ephemeris_rig"] = json.dumps(payload)
    bpy.ops.wm.save_as_mainfile(filepath=str(Path(output).resolve()))


def main():
    if "--apply" in sys.argv:
        args = sys.argv[sys.argv.index("--apply") + 1:]
        apply_in_blender(args[0], args[1])
        return
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ("blend", "metadata", "time", "output", "blender"):
        parser.add_argument("--" + name, required=True)
    parser.add_argument('--aberration', choices=('NONE', 'LT+S', 'CN+S'), default='CN+S',
                        help='SPICE reception correction; NONE matches the existing geometric backend')
    parser.add_argument('--frame', choices=('enu', 'site04-polar'), default='enu',
                        help='Blender terrain axes; Site04 original grids use polar stereographic x/y')
    parser.add_argument('--earthshine-model', choices=('legacy-lambert', 'visual-hg'), default='legacy-lambert',
                        help='visual-hg is an empirical mean visual approximation, not broadband flux')
    parser.add_argument('--earth-orientation-pck', help='Optional NAIF binary Earth orientation kernel for the spectral model subobserver coordinates')
    parser.add_argument('--lunar-occluder', choices=('none', 'conservative-inner-sphere'), default='none',
                        help='Experimental Cycles-only inner sphere prevents some deep-night light leaks; not an accurate horizon')
    args = parser.parse_args()
    output = Path(args.output).resolve()
    if output == Path(args.blend).resolve():
        parser.error("output must differ from input")
    if args.lunar_occluder != 'none' and args.frame != 'enu':
        parser.error('the experimental lunar occluder requires an ENU terrain frame')
    metadata = json.loads(Path(args.metadata).read_text(encoding="utf-8"))
    payload = calculate(metadata, args.time, args.aberration, args.earth_orientation_pck)
    payload['lunar_occluder'] = args.lunar_occluder
    payload['lunar_reference_radius_m'] = metadata['vertical_reference_radius_m']
    if args.lunar_occluder != 'none':
        payload['visibility_limit'] = 'Experimental inscribed 1700 km shadow sphere blocks some deeply below-horizon rays; it does not model the true limb or terrain outside this mesh. Cycles only.'
    payload['selected_earthshine_model'] = args.earthshine_model
    if args.earthshine_model == 'visual-hg' and payload['earth_phase_angle_deg'] > 110:
        print('Warning: empirical Earthshine visual variability increases at crescent phases; see the sidecar.', file=sys.stderr)
    payload['selected_earthshine_energy'] = (payload['earthshine_visual_equivalent_sun_strength'] if args.earthshine_model == 'visual-hg' else payload['earthshine_irradiance_w_m2_approx'])
    if args.frame == "site04-polar":
        orient_for_site04_plane(payload, metadata)
    sidecar = output.with_suffix(".lighting.json")
    sidecar.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    subprocess.run([args.blender, "--background", "--factory-startup", str(Path(args.blend).resolve()),
                    "--python-exit-code", "1", "--python", str(Path(__file__).resolve()),
                    "--", "--apply", str(sidecar), str(output)], check=True)


if __name__ == "__main__":
    main()
