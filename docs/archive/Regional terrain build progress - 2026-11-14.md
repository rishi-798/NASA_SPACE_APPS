# Regional terrain build progress — 2026-11-14

## Delivered region packages

These are separate Blender files and candidate GLBs. The existing `Moon Model.blend` master was not replaced. Each metadata file records source, reference radius, coordinate frame, native units, source pixel sampling, marker locations, and the current production-readiness limitations.

| Region | Drive folder | Notes |
|---|---|---|
| Apollo 12 | https://drive.google.com/drive/folders/13Vy8YxtnREr30VZBEWCvIgF0vIlknroj | 10 km radius measured SLDEM2015 terrain; includes Surveyor 3 as a site marker. |
| Apollo 16 | https://drive.google.com/drive/folders/1OzH8-BPK2WC-FvfbrFiasx8uR9ziyomv | 10 km radius measured SLDEM2015 terrain; includes landing and rover markers. |
| Apollo 17 | https://drive.google.com/drive/folders/13_cyzCmWHIJPx9Ceb7Y51F1SCtkdtlID | 10 km radius measured SLDEM2015 terrain; includes landing and rover markers. |
| Surveyor 1 | https://drive.google.com/drive/folders/1ljsEXH9JY0Wb1PCvID5a6SY55S551gv3 | 10 km radius measured SLDEM2015 terrain. |
| Surveyor 5 | https://drive.google.com/drive/folders/1DCjseya3B_e3f1cHJsDMSzBDRAJEkqNM | 10 km radius measured SLDEM2015 terrain. |
| Surveyor 6 | https://drive.google.com/drive/folders/13EIEhHIZnEApJmPeiC5cBXsgsUaFl3a1 | 10 km radius measured SLDEM2015 terrain. |
| Surveyor 7 | https://drive.google.com/drive/folders/1_ADqCF7tMTvWbtU_YEVnI0rywWnsKs7U | 10 km radius measured SLDEM2015 terrain. |
| Lunokhod 1 / Luna 17 | https://drive.google.com/drive/folders/1tjROq4Q0HM_Wmk0ngsVNFB3tx1dIuUrw | Shared 10 km region package; Luna 17 marker is included. The mesh uses the global SLDEM tile; the API selects a separate Lunokhod 1 crop at the center, and that higher-priority crop has not been overlaid across the region. |
| Luna 21 | https://drive.google.com/drive/folders/1iwy_22Vambz7Uw0kmRI06hVbm21Qyekw | 10 km radius measured SLDEM2015 terrain. |
| Apollo 11 | https://drive.google.com/drive/folders/14YA2fEGON3v3e6s3JeIyzEPn6o8Ophsc | 10 km radius global SLDEM2015 context; mission-specific center source is recorded separately and is not composited into the mesh. |
| Apollo 14 | https://drive.google.com/drive/folders/1yWvkRIY5J97m1EAQkh37eTLVF9b1xyRa | 10 km radius global SLDEM2015 context; mission-specific center source is recorded separately and is not composited into the mesh. |
| Apollo 15 | https://drive.google.com/drive/folders/1yGraUPPaa8FmHgIBOEXbVokyFfAn3zvL | 10 km radius global SLDEM2015 context; mission-specific center source is recorded separately and is not composited into the mesh. |
| Lunokhod 2 | https://drive.google.com/drive/folders/1WICI4tZok0gvstQzKl7HscaKUsrC9NL5 | 10 km radius global SLDEM2015 context; mission-specific center source is recorded separately and is not composited into the mesh. |
| Tycho | https://drive.google.com/drive/folders/1K0Y-pN3MbQfefD2WlcPOO1GNi4_jnjdD | Provisional crater overview envelope + 10 km coordinate margin; global LOLA64-SVS baseline (~474 m north/south); not close-up terrain. |
| Copernicus | https://drive.google.com/drive/folders/1BKRvZT3QieuSTUE45nWvAjVHM0mp0ohJ | Provisional crater overview envelope + 10 km coordinate margin; global LOLA64-SVS baseline (~474 m north/south); not close-up terrain. |
| Clavius | https://drive.google.com/drive/folders/1QsZGsVCokADK1a_6He7YItG2T9OdXtH4 | Provisional crater overview envelope + 10 km coordinate margin; global LOLA64-SVS baseline (~474 m north/south); not close-up terrain. Robbins fitted ellipse is a nearby catalog feature, not a rim polygon. |

The latest-built Blender files were reopened and checked for region dimensions and marker objects. Their GLBs were checked against the Blender mesh vertices; sampled heights match the source/API lookup within the recorded floating point tolerance. The four most recent sites deliberately use global context terrain across the full circle while the live API selects a mission-specific source at the center; each metadata file records the difference and warns that the native source has not been composited across the mesh. These checks cover geometry and source parity, not browser placement or astronomical lighting.

## Source and integration limits

- Apollo 11, Apollo 14 and Apollo 15 each have a 10 km global SLDEM2015 context package. Their higher-priority NAC DTMs remain available in the master/legacy scenes and are not blended into the context meshes. Source deltas are recorded; packages are not claimed to represent the NAC products across their full radius.
- Lunokhod 2 has a separate 10 km global SLDEM2015 context package. Its higher-priority 5 m product remains in the legacy scene and is not blended into the context mesh.
- Tycho, Copernicus and Clavius overview packages are now built as separate assets. Tycho and Copernicus bounds were cross-checked against LROC digitized rim polygons; Clavius currently has a nearby Robbins fitted ellipse but no acquired rim polygon. These comparisons do not establish control-network or ME/DE421 alignment. Their 10 km margins expand a conservative coordinate rectangle, not an exact geodesic buffer. The shared LOLA64-SVS baseline is for overview context only; higher-priority local terrain tiles are not blended in.
- [Crater footprint source audit](https://drive.google.com/file/d/1taSgHSi5p1LOr663LyrZRzpLLxGwgzAo/view?usp=drivesdk) records the source geometry comparisons. [Crater Blender/GLB verification](https://drive.google.com/file/d/1HWgy3pmaomOSrVF7RV7kvi4spnPUqPOZ/view?usp=drivesdk) records mesh round-trip parity and normal checks.
- The delivered GLBs are Z-up candidates. The local-to-viewer placement, browser loading/performance, and Sun/Earth ephemeris lighting remain unvalidated. All assets remain marked `production_ready: false`.
- No decorative rocks, dust, bump, or synthetic terrain were added to these scientific region meshes.
- Remaining crater work includes precise registered rims, geodesic buffers, local high-resolution tile mosaics, and viewer integration. All packages remain marked `production_ready: false`.

## Source provenance

Broad regional meshes use the pinned `a6b2c53f65661fbd5165eae5a83449aeb35abcd8` release of the project’s SLDEM2015 COGs. Each package has a JSON provenance record. The original master and original archive parts remain preserved in the working source collection.

## Preserved legacy measured-only scenes

Five standalone `.blend` files were extracted from the original master with their original geometry unchanged and source image resources packed. Each was reopened in Blender; vertex and polygon data hashes match the source scene. These retain their original scene coverage and are not 10 km circles.

Drive folder: https://drive.google.com/drive/folders/1Ivvc14bOp-XeFuR9gMxVYudNWkrz3q9R

Included: Apollo 11, Apollo 14, Apollo 15, Lunokhod 1 and Lunokhod 2 measured terrain scenes, plus a JSON manifest.

## Site04 standalone grid blocks

The original 256-grid scene is available as four independent Blender files (blocks A–D, 64 measured grid objects each). All 256 grid mesh vertex coordinates and polygon topology were compared against the original Site04 scene and match exactly. Each file is under the Drive per-file upload limit. The presentation-only Earth/Sun meshes and star-map imagery were left out of these scientific terrain blocks; the grid IDs and source materials needed by the measured grids are retained.

## Website handoff

The project handoff describes the code changes as local and says nothing was pushed or deployed. The available `NASA-APP` checkout is on `main`, and its generated `frontend/dist` tree already has user modifications. No code or deployment changes were made during this merge. The Blender region packages remain `production_ready: false` until Moon-fixed placement, browser loading/performance, and ephemeris-driven Sun/Earth lighting are validated.

Combined region index: https://drive.google.com/drive/folders/1fg5q9CP0LnPM6cUUP8iYCwp9ir-7_e6c

