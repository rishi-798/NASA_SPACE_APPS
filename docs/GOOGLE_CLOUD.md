# Google Cloud deployment

The `dip-google-cloud` branch adds a container for the existing website and
Python backend. It builds the frontend from the checked-in lockfile and serves
the app and API together. The scientific source manifest stays pinned to the
same 41-source release, and elevation rasters are fetched in small windows.

The original eight branches were copied from `itsmetapasvi-glitch/NASA-APP`
without rewriting their history. Data, imagery, models, coordinate conventions
and scientific calculations are preserved. Readability changes are isolated to
the manifest installation script; its inputs and output format are unchanged.

## Hosting

- Cloud Run runs the website and backend; browser-side Earth/Moon rendering
  continues to use the visitor's GPU.
- The image contains the frontend assets, backend, metadata, and SPICE kernels.
- The existing public Hugging Face release remains the elevation source during
  initial deployment. The original raster files do not need to be downloaded
  to a teammate's computer or committed to GitHub.
- Build/source artifacts belong in the project's private Cloud Storage and
  Artifact Registry. OAuth credentials stay on the deployment computer.
- Run a single Python worker per instance because the SPICE kernel pool is
  process-global. Keep concurrent requests and instance count bounded.

The account is using the participant-linked standard 90-day trial. Do not
upgrade it to paid. The console showed $300 available on November 14, 2026,
with an expiry of February 13, 2027. The original Render website remains a
fallback until the Google deployment is verified.

## Verification before switching links

Check the home, explorer and trip pages; frontend assets; `/health`; lunar grid
identity and point elevation; all 41 manifest sources; and the Sun/Earth
calculation endpoint. A successful build alone is not a complete deployment.
