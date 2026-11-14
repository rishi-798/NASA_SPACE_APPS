# NASA-APP lunar terrain foundation

This branch contains the supplied lunar grid identity and catalogue lookup code, a FastAPI router, a small app entry point, a CSV-to-SQLite index builder, and framework-independent frontend helpers. Setup and data limitations are documented in [`MOON_DATASET.md`](MOON_DATASET.md).

The large catalogue CSV, generated SQLite index, original elevation rasters, Blender project, and ZIP files belong in local or separately hosted data storage, not Git. The scientific manifest is now included as metadata; exact point-height sampling still needs the original raster files on the backend.

The helper modules are ready for a frontend integration. This branch does not contain the complete React/Cesium viewer changes; those must be reviewed from the `moon-terrain-integration` checkout before updating the viewer or Cesium ion asset configuration.

The [G7 alignment handoff](docs/ALIGNMENT_HANDOFF.md) adds a verified coordinate transform and Cesium adapter, with source, export and browser check results. The unfinished Blender terrain asset is withheld, and registration against the live global Moon viewer remains pending.
