# Historical deployment reference

The current cloud deployment is documented in [CLOUD_TERRAIN.md](CLOUD_TERRAIN.md). Local hosting and raster-transfer instructions below describe earlier setups.

# Local raster connection

Set `LUNAR_DATASET_DIR` to the existing folder containing `moon-dataset.json`,
`moon-grid-index.sqlite` and the manifest-relative raster folders. Start the
backend normally. Files are read in place; do not copy the 55 GB into Git.

The catalogue endpoint returns `point_elevation_m` and `point_terrain` when
an original raster covers the selected point. Regional summaries remain separate.
Missing rasters leave point height null; no elevation is invented. The frontend
displays the sampled height and its source independently of Blender availability.

On Dip's computer use the Git-ignored `START-LOCAL-RASTERS.cmd` launcher.
It serves the app only on localhost, port 8001, using the existing terrain
runtime and original data directory. Stop it with Ctrl+C when finished.
This local connection does not give a remote deployment access to Dip's disk.
No new Blender scene, displacement or terrain-blocking profile is generated.
