# G7 alignment: verified export and browser handoff

Repository handoff note: the diagnostic GLB, prototype page and scratch export scripts listed below are retained locally, not committed. This branch includes the corrected coordinate contract, frontend adapter and verification reports. The Blender terrain remains withheld pending completion.

## Result

One existing G7 scientific patch has been converted and exported into a true lunar local frame. Its position, metre scale, east/north/up orientation and selected-coordinate handoff pass the checks below. The original Moon Model.blend is unchanged. No new textures, rocks, dust or render animation were applied.

The diagnostic GLB has neutral shading. It is a verification asset, not the finished Blender terrain promised to the team. It is kept locally and has not been uploaded, pushed or supplied as a finished model.

## What was corrected

The original G7 geometry uses south polar stereographic map X/Y. The historical G7 metadata called those axes east/north; that shortcut is incorrect near the pole. At this location projected +X points at about 245.55° azimuth, rather than east at 90°.

For every original vertex, the export now:

1. Restores projected coordinates using the recorded source origin.
2. Restores scientific elevation using the original height baseline.
3. Inverts the actual raster CRS to lunar longitude/latitude.
4. Converts to Moon-fixed positions at radius 1,737,400 m plus elevation.
5. Converts to east/north/up around the patch anchor, preserving lunar curvature.
6. Exports through Blender into glTF east/up/minus-north coordinates.

The source authoring mesh and old metadata were retained. SITE04-G7.scene.json is the corrected contract for this test export. Do not use the old east/north shortcut in new integration code.

## Evidence

| Check | Result |
|---|---|
| Original scientific terrain preserved | All 40,000 unique vertices and 79,202 triangles retained |
| Original Blender heights versus source DEM | Maximum difference 0.000061 m from prior mesh rounding |
| Actual GLB geometry after node transforms | Matches the intended local vertex coordinates |
| Placed exported vertices versus Moon-fixed source positions | Maximum difference 0.000034 m from local float storage |
| Cesium 1.145.0 placement against independent Cesium lunar coordinates | 47 exported controls checked; maximum position difference 0.000029 m |
| Metre scale and east/north/up | One-metre steps pass on all three axes |
| Triangle orientation | Every surface triangle faces outward |
| Exact coordinate handoff | Selected latitude/longitude retained, including under a rotated/translated Moon-world transform |
| Browser WebGL | Actual exported GLB renders in headless Chrome; no page errors |
| Actual browser depth picking → backend → local point | Passes; returned grid is SITE04-G7 and exact picked coordinates are preserved |
| Original .blend | SHA-256 unchanged |

These are transformation and software checks, not centimetre-level scientific measurement accuracy. The original raster samples remain 5 m apart, with their original interpolation and measurement uncertainty.

The browser's projected reference-point depth pick differed horizontally by about 0.70 m at the test camera distance, reflecting pixel/depth picking and render-surface sampling. The handoff preserves whatever exact coordinates the click produces; it does not snap them to the grid centre.

An off-vertex control also shows why elevation methods must be explicit: the triangulated mesh surface is about 0.224 m below that point's nearest original DEM pixel. This is interpolation versus nearest-pixel sampling, not a changed measurement. Keep render-pick height and scientific backend height separate.

## What remains unverified

This checkout has no configured Cesium ion token. The prototype therefore does not load live asset 2684829. Its actual control-network registration and elevation differences against Site04 still require checking in the team's live viewer. The local renderer must receive the viewer's actual Moon-fixed-to-world transform; an identity matrix is valid only when the Moon is centred and its axes are already aligned with the project ME frame.

The other 255 Site04 cells and historical landing patches have not individually passed this new export pipeline. Reuse the method with each patch's correct CRS, projected origin and baseline, then run its checks. Do not treat the G7 result as verification of every scene.

## Frontend integration

- Load SITE04-G7.scene.json and SITE04-G7-alignment.glb together.
- Use lunarAlignment.mjs to build the model matrix and convert a selected point.
- For this already-converted GLB, load with scale 1, minimumPixelSize 0, vertical exaggeration disabled, upAxis Z and forwardAxis X. These axis options intentionally disable Cesium's extra correction because the supplied matrix already maps glTF axes into the Moon-fixed frame. They are not a universal preset for unrelated assets.
- Pass an explicit scientific elevation, the exact selected coordinates and the matching grid ID. Never replace the selected point with the asset anchor.
- In the live viewer, compare several source controls, depth-picked coordinates, terrain elevations and the actual Moon-world transform. Do not clamp the asset to a different terrain source or hide offsets with an arbitrary translation.
- Lighting remains illustrative here. Backend Sun/Earth integration is a separate task.

The test asset covers original sample centres spanning 995 m inside the 1,000 m projected grid cell. It does not invent edge samples. A production adjacent-tile exporter must sample shared boundaries explicitly.

## Files

- SITE04-G7-alignment.glb — actual Blender-exported diagnostic geometry.
- SITE04-G7.scene.json — corrected source, anchor, axes and placement matrix.
- lunarAlignment.mjs — reusable Cesium placement/selection adapter.
- export-verification.json, cesium-verification.json, browser-verification.json — check results.
- index.html and serve_pilot.py — local interactive test page using the existing dataset/backend lookup.
- G7 alignment browser check.png — captured rendered browser result.

The test page is available while its local server is running. The server is bound to 127.0.0.1 and does not expose the dataset to the internet.

References: [NASA/GSFC Site04 dataset](https://pgda.gsfc.nasa.gov/products/78), [Cesium model placement and axes](https://cesium.com/learn/cesiumjs/ref-doc/Model.html), [Cesium local-frame transforms](https://cesium.com/learn/cesiumjs/ref-doc/Transforms.html). Existing source files and the installed Cesium engine were used for the checks, rather than assuming default Earth coordinates.
