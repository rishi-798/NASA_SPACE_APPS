# Historical deployment reference

The current cloud deployment is documented in [CLOUD_TERRAIN.md](CLOUD_TERRAIN.md). Local hosting and raster-transfer instructions below describe earlier setups.

# Entire Moon raster dataset on GitHub

Repository: itsmetapasvi-glitch/NASA-APP. Integration branch: rastermodel-dip.
Release tag: moon-rasters-v1. The release remains a draft until every part is
uploaded and verified. Do not interpret an upload in progress as completion.

This is the entire original 78-file raster companion, 54,977,907,383 bytes,
including all 41 elevation sources plus supporting imagery, labels and quality
files. It is not only G7 or one landing region. No measurements are smoothed,
replaced, recompressed lossily or invented. The existing manifest selects valid
sources by footprint and priority; data resolutions still vary by location.

The ZIP is split into 29 binary parts under 2 GB each for GitHub Release assets.
These are download assets, not files inside ordinary Git history. Cloning the
branch gets the app and manifests; downloading the release gets the large data.
No paid Git LFS is used. All original files remain on Dip's computer.

## Owner-only recovery reference - not team tasks

Only Dip manages these files. Teammates use the hosted API and do not perform
these recovery steps. The release is a backup/distribution copy, not a required
team download.

1. Wait until the release is published. Sign in to GitHub with repository access.
2. Install the project requirements, including requests. Allow about 111 GB free
   for both the original ZIP and extracted contents.
3. Run `python scripts/download_full_rasters.py --dataset-dir YOUR_TERRAIN_FOLDER`.
   The script uses existing Git credentials or GITHUB_TOKEN, verifies each part
   and the joined ZIP by SHA-256, preserves existing files, and extracts original
   filenames and folders. It never writes credentials into the dataset.
4. Add the CSV/index from the existing team handoff to the same folder. If needed,
   build the index with `python scripts/build_moon_index.py --dataset-dir YOUR_TERRAIN_FOLDER`.
5. Set LUNAR_DATASET_DIR to that folder before starting the backend. The public
   website's backend also needs these files on its own host/storage; GitHub
   publication alone does not attach them to a deployed server.
6. Test `/api/terrain/lookup` and `/api/terrain/catalogue` at known coordinates.
   The frontend receives point height/source and regional statistics separately.

## Visual quality

This provides original scientific elevation data. It does not automatically
generate textured Blender scenes, terrain tiles, rover models, or animation.
Finished local scene exports and their placement checks remain separate work.
The global Cesium viewer continues to need the team's configured ion token.
