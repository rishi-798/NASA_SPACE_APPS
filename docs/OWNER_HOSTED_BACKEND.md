# Historical deployment reference

The current cloud deployment is documented in [CLOUD_TERRAIN.md](CLOUD_TERRAIN.md). Local hosting and raster-transfer instructions below describe earlier setups.

# Owner-hosted website and terrain backend

## No raster assignments to teammates

Dip owns the original full Moon raster dataset, the terrain runtime and its
connection to the backend. No teammate is assigned downloading, extracting,
transferring, hosting or configuring raster files. Older handoff instructions
that assign these steps are superseded by this document. The GitHub raster
release is retained as a complete backup/distribution option, not a requirement
for anyone else to download it.

## Working architecture

Visitors -> HTTPS Cloudflare tunnel -> Dip's local NASA-APP on port 8001.
The same server serves Tap's integrated UI and the terrain/visibility API.
Relative /api calls work on the same origin, with no cross-origin settings or
separate frontend deployment needed for this demo. LUNAR_DATASET_DIR points to
Dip's original files outside Git. Elevation sampling reads original raster
pixels; the browser receives point results and provenance, not the whole dataset.
All 41 elevation sources are accessible. Full local Blender scenes remain separate.

The temporary public URL is provided in the chat, not hardcoded into app code.
The computer must remain on, awake and online; the server and tunnel must both
run. This demo link changes if the tunnel restarts and has no uptime guarantee.
A stable production hostname requires a named tunnel and an owner-controlled
Cloudflare account/domain. This remains Dip's hosting work, not a teammate raster
task. No account billing, router changes or startup service is configured.

Only the app's HTTP routes are tunneled. The raster directory is not a static
file download route. Source files and credentials are not committed or exposed.

## Evidence

The local API resolved G7 and Apollo 11 using their real DEMs and global points
using SLDEM/polar LOLA sources. The public HTTPS health, catalogue, lookup and
Explorer routes are checked separately. The Cesium ion viewer still requires
a valid team token; raster availability does not supply that token.

Official temporary tunnel documentation:
https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/
