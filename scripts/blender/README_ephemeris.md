# Provisional lunar terrain and lighting tools

These scripts produce review candidates, not landing-safety products. The existing scientific gates remain open: historical Earthshine is not measured, the full lunar horizon is not represented, and crater boundary/frame registration needs additional validation. Do not set `production_ready` to true based on these scripts alone.

## Date-specific Blender lights

With this repository's Python environment, its downloaded SPICE kernels, and Blender installed:

```text
python scripts/blender/rig_ephemeris_sun.py --blend INPUT.blend --metadata METADATA.json --time 1971-02-05T09:18:11Z --output OUTPUT.blend --blender /path/to/blender
```

The command writes a separate scene and `.lighting.json` sidecar. The Sun direction uses topocentric SPICE reception corrections; strength follows distance-scaled solar irradiance with an approximate Earth-occultation test. The Earth light is an illustrative approximation. The default Lambert model uses an old visual albedo applied to total solar energy; `--earthshine-model visual-hg` is an empirical visual appearance option, not validated broadband or historical flux. A separate Glenar solar-band estimate is reported only within its limited phase and latitude range; it is not used as an RGB light. Blender exposure, local terrain, outside-mesh occlusion, weather, and eclipse details all limit interpretation.

An optional `--earth-orientation-pck` supplies a NAIF binary Earth-orientation kernel for the Glenar subobserver coordinates; without it the coordinate model is approximate. The optional `--lunar-occluder conservative-inner-sphere` is an experimental Cycles-only shadow aid, not an accurate lunar horizon.

The spectral coefficients in `data/Earthshine_Spring_Approximation_Revised_Sept2018.txt` are by Glenar, Stubbs, Schwieterman, Robinson and Livengood, [Mendeley Data v2](https://doi.org/10.17632/xfjm6nmh3m.2), CC BY 4.0. The approximation is seasonal and does not reconstruct historical cloud cover.

## Site04 source pixels

`build_site04_glb.py SOURCE.tif OUTPUT_DIR` exports four direct source-pixel terrain candidates. The files deliberately store local Z-up coordinates, unlike standard glTF Y-up; consumers must use the documented conversion and frame metadata. They contain no synthetic displacement or smoothing. `verify_site04_glb.py` checks source heights and geometry; `build_site04_enu_blend.py` and `verify_site04_enu_blend.py` construct and check corresponding Blender scenes. Refer to each script's invocation and the generated sidecars before use. The original DEM must be supplied separately.

Run the focused Python checks with `python -m pytest tests/test_blender_ephemeris_rig.py tests/test_earthshine_spring.py -q`. The tests require the repository's SPICE kernels. Blender scene checks additionally require Blender and the original scene or terrain artifacts.
