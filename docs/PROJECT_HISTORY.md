# Project history and competition-day changes

This repository includes work developed before November 14, 2026. The existing
application was imported from `itsmetapasvi-glitch/NASA-APP`, preserving its
commit history and branch names. An upload date is not the original creation
date of the code or datasets.

## November 14, 2026

- Added a multi-stage container build for the frontend and Python backend.
- Added deployment documentation and bounded Cloud Run resource settings.
- Improved readability of the cloud manifest preparation script without
  changing its data format or intended behavior.
- Fixed the container's missing Expat runtime library, discovered when the
  Google Cloud build imported Rasterio.

The lunar elevation sources, existing coordinate conventions, assets, and
earlier scientific calculations retain their original provenance. Later
changes should be recorded through ordinary commits with their actual dates.

Deployment verification is separate from implementation: a change appearing
here does not by itself mean the public Google Cloud service is ready.
