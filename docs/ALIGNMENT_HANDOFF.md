# Current raster ownership

Dip hosts and manages all raster files; teammates do not need to download or
configure them. Use the owner-hosted website/API. This supersedes the earlier
dataset-transfer section below, which is retained as historical reference.

# G7 alignment handoff for frontend integration

The G7 scientific export's coordinate transform was checked against the original DEM and Cesium 1.145.0, then rendered and clicked in a local WebGL preview. The unfinished Blender terrain asset is deliberately withheld. This commit provides the verified transform, adapter and check results; it does not enable a ready local scene in the live app.

## Files to use

- `frontend/lunarAlignment.mjs`: explicit model placement and coordinate conversion.
- `metadata/alignment/SITE04-G7.scene.json`: corrected source CRS, height baseline, anchor, metre units and glTF-to-Moon-fixed matrix.
- `metadata/alignment/exported-controls.json`: 47 controls read from the actual diagnostic GLB for reproducible checks.
- `metadata/alignment/*verification.json`: source/export, Cesium and browser results. Browser results describe the local test, not the deployed website.
- `metadata/moon-dataset.json`: scientific source manifest. Copy it into the external dataset directory at deployment, next to the CSV and rasters.
- `metadata/blender-grid-registry.json`: existing object-name/grid associations, not a promise of exported web assets.
- `docs/G7_ALIGNMENT.md`: evidence and remaining limitations.

## Integration contract

1. Preserve the clicked lunar latitude/longitude. Query the existing terrain lookup to obtain the grid ID and scientific elevation; never replace the click with a grid centre.
2. Load a matching exported asset only when it is supplied and available. `production_ready` remains false and the GLB referenced in the metadata is not in this commit.
3. Use `sceneMatrix(Cesium, manifest, moonFixedToWorld)` with the real viewer's lunar fixed-to-world transform. Identity is appropriate only for a Moon already centred and ME-aligned in world axes.
4. For this converted asset, the adapter sets scale 1, minimumPixelSize 0, upAxis Z, forwardAxis X and disables vertical exaggeration. Its matrix already converts glTF Y-up axes, so a second automatic conversion would be incorrect.
5. Use `selectedPoint` with exact coordinates, explicit source height and matching grid ID. Keep render-picked height separate from the nearest-pixel backend height.
6. Check overlay/control positions against live ion asset 2684829 with the team's configured token before enabling it in the deployed UI. That live registration test is still pending.

Do not use the historical shorthand that G7 projected X/Y equal east/north. Near the south pole the source projection rotates relative to local compass directions; this transform corrects that.

## Re-run the portable Cesium checks

Requires Node 22 or newer. The test dependencies are isolated from the team's frontend package:

```sh
cd tests/alignment
npm install --ignore-scripts
npm test
```

The checks exercise real Cesium matrices, lunar coordinates, 47 exported controls, one-metre cardinal steps and a rotated/translated Moon-world frame. They also inspect loader options with a small stub; they do not reproduce a GPU render without the withheld asset and preview.

## Dataset transfer

The current [team handoff ZIP](https://drive.google.com/file/d/1w8btiRxQbk3GPb6uFO7AMyZ9L9IvgMvd/view) includes the catalogue and instructions. The separate approximately 55 GB raster companion must also be transferred and extracted with its original relative paths. Do not interpret the manifest's downloaded/completed flags as evidence that the rasters exist on your backend. Source-page URLs are references and may not be direct file downloads.

No source elevation rasters, catalogue CSV, SQLite index, ZIP archives, Blender projects, GLBs or credentials are committed here.
