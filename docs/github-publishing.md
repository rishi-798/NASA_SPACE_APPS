# GitHub distribution

The current source, ready frontend build, NASA rocket assets, backend and NAIF
kernels are published together. Dependencies, temporary files, local environment
settings and earlier recovery ZIPs are not source files and are not published.

The original 264,208,878-byte catalogue CSV and the 1.6 GB generated SQLite index
exceed GitHub's regular Git file limit. The supplied original CSV is preserved
losslessly in `data/catalogue/site04_1km_grid.csv.gz` (about 41 MB). Its SHA-256
is `2dbd8270497b998f42ab8bbbb8f7a7898de6b470229d8834eb68c3683c2bbc4f`.
No statistics or source records are replaced or regenerated from invented data.

`START-NASA-APP.cmd` calls `scripts/prepare_moon_catalogue.py` before starting
the server. On the first launch it copies the preserved provenance manifests,
verifies/restores the original CSV and builds the 379,987-record SQLite index
using `scripts/build_moon_index.py`. Allow about 2 GB of free space. Later starts
retain the existing local index; an external `LUNAR_DATASET_DIR` is never modified.
Manual setup can run `python scripts/prepare_moon_catalogue.py` after dependencies.

The generated dataset remains Git-ignored. Real elevation rasters and the Blender
local scene remain absent, exactly as in the local project. No LFS billing,
external file hosting, release publication or automatic raster downloads are used.

Limits: https://docs.github.com/en/repositories/working-with-files/managing-large-files/about-large-files-on-github
